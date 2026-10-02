import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { env } from '../config/env.js';
import { badRequest, notFound } from '../core/errors.js';
import { resolveCustomerIdentity, type CustomerIdentity } from '../customer/identity.js';

const address = z.object({
  recipientName: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(7).max(40),
  countryCode: z.string().length(2).default('AZ'),
  city: z.string().trim().min(2).max(120),
  district: z.string().trim().max(120).optional(),
  addressLine1: z.string().trim().min(5).max(300),
  addressLine2: z.string().trim().max(300).optional(),
  postalCode: z.string().trim().max(30).optional()
});
const itemSchema = z.object({
  listingId: z.uuid(),
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(100)
});
const paymentMethod = z.enum(['cash_on_delivery', 'card_on_delivery', 'bank_transfer']);
const quoteBase = z.object({
  couponCode: z.string().trim().max(80).optional(),
  items: z.array(itemSchema).min(1).max(100)
});
const uniqueItems = <T extends { items: Array<{ variantId: string }> }>(value: T) => new Set(value.items.map((item) => item.variantId)).size === value.items.length;
const quoteInput = quoteBase.refine(uniqueItems, {
  path: ['items'], message: 'Eyni variant bir neçə dəfə göndərilə bilməz'
});
const checkoutInput = quoteBase.extend({
  customerEmail: z.email(),
  customerPhone: z.string().trim().min(7).max(40),
  customerName: z.string().trim().min(2).max(200),
  shippingAddress: address,
  billingAddress: address.optional(),
  customerNote: z.string().trim().max(1000).default(''),
  paymentMethod: paymentMethod.default('cash_on_delivery')
}).refine(uniqueItems, { path: ['items'], message: 'Eyni variant bir neçə dəfə göndərilə bilməz' });

interface CheckoutLine {
  listing_id: string;
  title: string;
  price: string;
  currency: string;
  product_id: string;
  vendor_id: string;
  sku: string;
  variant_id: string;
  variant_title: string;
  warehouse_id: string;
  commission_rate: string;
  quantity: number;
  unitCents: number;
  lineCents: number;
  discountCents: number;
}

interface CouponRow {
  id: string;
  vendor_id: string | null;
  name: string;
  code_prefix: string;
  discount_type: 'percentage' | 'fixed_amount' | 'free_shipping' | 'gift';
  discount_value: string;
  minimum_order: string;
  quantity_limit: number | null;
  per_user_limit: number;
  redemption_count: number;
  unique_coupon_id: string | null;
}

type Queryable = Pick<PoolClient, 'query'>;

async function getStore(queryable: Queryable = pool) {
  const result = await queryable.query<{ id: string; currency: string }>(
    "SELECT id,currency FROM stores WHERE code=$1 AND status='active'",
    [env.DEFAULT_STORE_CODE]
  );
  if (!result.rows[0]) throw notFound('Store');
  return result.rows[0];
}

async function resolveLines(
  queryable: Queryable,
  store: { id: string; currency: string },
  items: z.infer<typeof itemSchema>[],
  lockInventory = false
): Promise<CheckoutLine[]> {
  const lines: CheckoutLine[] = [];
  for (const item of items) {
    const result = await queryable.query<Omit<CheckoutLine, 'quantity' | 'unitCents' | 'lineCents' | 'discountCents'>>(`
      SELECT pl.id AS listing_id,pl.title,pl.price,pl.currency,p.id AS product_id,p.vendor_id,p.sku,
        pv.id AS variant_id,pv.title AS variant_title,i.warehouse_id,v.commission_rate
      FROM product_listings pl JOIN products p ON p.id=pl.product_id
      JOIN product_variants pv ON pv.product_id=p.id JOIN vendors v ON v.id=p.vendor_id
      JOIN warehouses w ON w.store_id=pl.store_id AND (w.vendor_id IS NULL OR w.vendor_id=p.vendor_id)
      JOIN inventory i ON i.variant_id=pv.id AND i.warehouse_id=w.id
      WHERE pl.id=$1 AND pv.id=$2 AND pl.store_id=$3 AND pl.status='published'
        AND p.status='published' AND v.status='active' AND i.quantity-i.reserved >= $4
      ORDER BY (w.vendor_id IS NOT NULL) DESC,i.quantity-i.reserved DESC LIMIT 1
      ${lockInventory ? 'FOR UPDATE OF i' : ''}
    `, [item.listingId, item.variantId, store.id, item.quantity]);
    const row = result.rows[0];
    if (!row) throw badRequest('ITEM_UNAVAILABLE', 'Məhsul mövcud deyil və ya stok kifayət etmir', { listingId: item.listingId, variantId: item.variantId });
    if (row.currency !== store.currency) throw badRequest('CURRENCY_MISMATCH', 'Məhsul valyutası mağaza valyutası ilə uyğun deyil');
    const unitCents = Math.round(Number(row.price) * 100);
    lines.push({ ...row, quantity: item.quantity, unitCents, lineCents: unitCents * item.quantity, discountCents: 0 });
  }
  return lines;
}

async function resolveCoupon(
  queryable: Queryable,
  storeId: string,
  code: string | undefined,
  identity: CustomerIdentity,
  subtotalCents: number,
  lines: CheckoutLine[]
): Promise<{ coupon: CouponRow | null; discountCents: number; label: string | null }> {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return { coupon: null, discountCents: 0, label: null };
  const result = await queryable.query<CouponRow>(`
    SELECT c.*,uc.id AS unique_coupon_id
    FROM coupons c
    LEFT JOIN user_coupons uc ON uc.coupon_id=c.id AND upper(uc.unique_code)=upper($2)
      AND uc.user_id=$3 AND uc.status='available' AND uc.expires_at>now()
    WHERE c.store_id=$1 AND c.status='active' AND now() BETWEEN c.starts_at AND c.expires_at
      AND (upper(c.code_prefix)=upper($2) OR uc.id IS NOT NULL)
    ORDER BY (uc.id IS NOT NULL) DESC LIMIT 1
  `, [storeId, normalized, identity.userId]);
  const coupon = result.rows[0];
  if (!coupon) throw badRequest('COUPON_INVALID', 'Kupon kodu etibarsızdır və ya istifadə müddəti bitib');
  if (coupon.quantity_limit !== null && coupon.redemption_count >= coupon.quantity_limit) {
    throw badRequest('COUPON_LIMIT_REACHED', 'Kuponun ümumi istifadə limiti bitib');
  }
  if (subtotalCents < Math.round(Number(coupon.minimum_order) * 100)) {
    throw badRequest('COUPON_MINIMUM_NOT_MET', `Bu kupon üçün minimum sifariş məbləği ${Number(coupon.minimum_order).toFixed(2)} AZN-dir`);
  }
  const identityClause = identity.userId ? 'user_id=$3' : 'anonymous_id=$3';
  const usage = await queryable.query<{ count: number }>(`
    SELECT count(*)::int AS count FROM orders
    WHERE store_id=$1 AND coupon_id=$2 AND ${identityClause} AND status<>'cancelled'
  `, [storeId, coupon.id, identity.userId ?? identity.anonymousId]);
  if (Number(usage.rows[0]?.count ?? 0) >= coupon.per_user_limit) {
    throw badRequest('COUPON_USER_LIMIT', 'Bu kupon üzrə şəxsi istifadə limitiniz bitib');
  }
  const rules = await queryable.query<{ rules: Record<string, unknown> }>('SELECT rules FROM coupons WHERE id=$1', [coupon.id]);
  if (rules.rows[0]?.rules?.['firstOrderOnly']) {
    const prior = await queryable.query<{ exists: boolean }>(`
      SELECT EXISTS(SELECT 1 FROM orders WHERE store_id=$1 AND ${identity.userId ? 'user_id=$2' : 'anonymous_id=$2'} AND status<>'cancelled') AS exists
    `, [storeId, identity.userId ?? identity.anonymousId]);
    if (prior.rows[0]?.exists) throw badRequest('COUPON_FIRST_ORDER_ONLY', 'Bu kupon yalnız ilk sifariş üçün keçərlidir');
  }

  const eligible = lines.filter((line) => !coupon.vendor_id || line.vendor_id === coupon.vendor_id);
  const eligibleSubtotal = eligible.reduce((sum, line) => sum + line.lineCents, 0);
  if (!eligibleSubtotal) throw badRequest('COUPON_PRODUCTS_INELIGIBLE', 'Səbətdə bu kupona uyğun məhsul yoxdur');
  let discountCents = 0;
  if (coupon.discount_type === 'percentage') {
    discountCents = Math.round(eligibleSubtotal * Number(coupon.discount_value) / 100);
  } else if (coupon.discount_type === 'fixed_amount') {
    discountCents = Math.min(eligibleSubtotal, Math.round(Number(coupon.discount_value) * 100));
  } else if (coupon.discount_type === 'free_shipping') {
    discountCents = 0;
  } else {
    throw badRequest('COUPON_GIFT_REQUIRES_SUPPORT', 'Hədiyyə kuponu müştəri dəstəyi tərəfindən aktivləşdirilməlidir');
  }

  let allocated = 0;
  eligible.forEach((line, index) => {
    const share = index === eligible.length - 1
      ? discountCents - allocated
      : Math.round(discountCents * line.lineCents / eligibleSubtotal);
    line.discountCents = Math.min(line.lineCents, share);
    allocated += line.discountCents;
  });
  return { coupon, discountCents, label: `${coupon.name} (${normalized})` };
}

function quotePayload(lines: CheckoutLine[], coupon: Awaited<ReturnType<typeof resolveCoupon>>, currency: string) {
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineCents, 0);
  const shippingCents = 0;
  const grandTotalCents = Math.max(0, subtotalCents - coupon.discountCents + shippingCents);
  return {
    currency,
    subtotal: subtotalCents / 100,
    discountTotal: coupon.discountCents / 100,
    shippingTotal: shippingCents / 100,
    grandTotal: grandTotalCents / 100,
    coupon: coupon.coupon ? { id: coupon.coupon.id, label: coupon.label, code: coupon.coupon.code_prefix } : null,
    paymentMethods: [
      { id: 'cash_on_delivery', label: 'Çatdırılmada nağd', description: 'Sifarişi təhvil alarkən nağd ödəyin.' },
      { id: 'card_on_delivery', label: 'Çatdırılmada kartla', description: 'Kuryerin POS terminalı ilə təhlükəsiz ödəyin.' },
      { id: 'bank_transfer', label: 'Bank köçürməsi', description: 'Sifarişdən sonra təqdim edilən rekvizitlərlə ödəyin.' }
    ]
  };
}

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  app.post('/quote', { config: { rateLimit: { max: 60, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const input = quoteInput.parse(request.body);
    const identity = await resolveCustomerIdentity(request, reply);
    const store = await getStore();
    const lines = await resolveLines(pool, store, input.items);
    const subtotal = lines.reduce((sum, line) => sum + line.lineCents, 0);
    const coupon = await resolveCoupon(pool, store.id, input.couponCode, identity, subtotal, lines);
    return { data: quotePayload(lines, coupon, store.currency) };
  });

  app.post('/', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const input = checkoutInput.parse(request.body);
    const idempotency = z.string().min(16).max(200).parse(request.headers['idempotency-key']);
    const identity = await resolveCustomerIdentity(request, reply);
    const userId = identity.userId;
    const anonymousId = identity.anonymousId;
    const store = await getStore();

    const data = await withTransaction(async (client) => {
      const previous = await client.query('SELECT * FROM orders WHERE store_id=$1 AND idempotency_key=$2', [store.id, idempotency]);
      if (previous.rows[0]) return previous.rows[0];
      const lines = await resolveLines(client, store, input.items, true);
      const subtotalCents = lines.reduce((sum, line) => sum + line.lineCents, 0);
      const couponResult = await resolveCoupon(client, store.id, input.couponCode, identity, subtotalCents, lines);
      const discountCents = couponResult.discountCents;
      const grandTotalCents = Math.max(0, subtotalCents - discountCents);
      const order = await client.query(`
        INSERT INTO orders(store_id,user_id,anonymous_id,customer_email,customer_phone,customer_name,currency,
          subtotal,discount_total,grand_total,shipping_address,billing_address,customer_note,idempotency_key,
          payment_method,coupon_id,coupon_code)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *
      `, [store.id, userId, anonymousId, input.customerEmail.toLowerCase(), input.customerPhone, input.customerName,
        store.currency, subtotalCents / 100, discountCents / 100, grandTotalCents / 100,
        JSON.stringify(input.shippingAddress), JSON.stringify(input.billingAddress ?? input.shippingAddress),
        input.customerNote, idempotency, input.paymentMethod, couponResult.coupon?.id ?? null,
        input.couponCode?.trim().toUpperCase() ?? null]);
      const orderId = order.rows[0].id;
      const vendorGroups = new Map<string, CheckoutLine[]>();
      for (const line of lines) {
        const group = vendorGroups.get(line.vendor_id) ?? [];
        group.push(line);
        vendorGroups.set(line.vendor_id, group);
      }
      for (const [vendorId, vendorLines] of vendorGroups) {
        const first = vendorLines[0]!;
        const vendorSubtotal = vendorLines.reduce((sum, line) => sum + line.lineCents, 0);
        const vendorDiscount = vendorLines.reduce((sum, line) => sum + line.discountCents, 0);
        const vendorNet = Math.max(0, vendorSubtotal - vendorDiscount);
        const commission = Math.round(vendorNet * Number(first.commission_rate) / 100);
        const vendorOrder = await client.query(`
          INSERT INTO vendor_orders(order_id,vendor_id,subtotal,discount_total,commission_total,payout_total)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING id
        `, [orderId, vendorId, vendorSubtotal / 100, vendorDiscount / 100, commission / 100, (vendorNet - commission) / 100]);
        for (const line of vendorLines) {
          await client.query(`
            INSERT INTO order_items(order_id,vendor_order_id,vendor_id,product_id,variant_id,product_name,sku,
              quantity,unit_price,discount_total,line_total,snapshot)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          `, [orderId, vendorOrder.rows[0].id, vendorId, line.product_id, line.variant_id, line.title, line.sku,
            line.quantity, line.unitCents / 100, line.discountCents / 100,
            (line.lineCents - line.discountCents) / 100,
            JSON.stringify({ listingId: line.listing_id, variantTitle: line.variant_title, warehouseId: line.warehouse_id })]);
          await client.query('UPDATE inventory SET reserved=reserved+$3,updated_at=now() WHERE variant_id=$1 AND warehouse_id=$2', [line.variant_id, line.warehouse_id, line.quantity]);
          await client.query(`INSERT INTO inventory_movements(variant_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note) VALUES($1,$2,'reservation',$3,'order',$4,'Checkout rezervi')`, [line.variant_id, line.warehouse_id, -line.quantity, orderId]);
        }
        await client.query(`INSERT INTO order_status_history(order_id,vendor_order_id,to_status,note) VALUES($1,$2,'pending','Sifariş yaradıldı')`, [orderId, vendorOrder.rows[0].id]);
      }
      await client.query(`
        INSERT INTO payments(order_id,provider,status,amount,currency,method,metadata)
        VALUES($1,'offline','pending',$2,$3,$4,$5::jsonb)
      `, [orderId, grandTotalCents / 100, store.currency, input.paymentMethod, JSON.stringify({ checkout: 'web' })]);
      if (couponResult.coupon) {
        await client.query('UPDATE coupons SET redemption_count=redemption_count+1 WHERE id=$1', [couponResult.coupon.id]);
        if (couponResult.coupon.unique_coupon_id) {
          await client.query("UPDATE user_coupons SET status='redeemed',redeemed_at=now(),order_id=$2 WHERE id=$1", [couponResult.coupon.unique_coupon_id, orderId]);
        }
      }
      await client.query(`INSERT INTO order_status_history(order_id,to_status,note) VALUES($1,'pending','Checkout tamamlandı')`, [orderId]);
      await client.query(`INSERT INTO outbox_events(topic,aggregate_type,aggregate_id,payload) VALUES('order.created','order',$1,$2)`, [orderId, JSON.stringify({ orderId, orderNumber: order.rows[0].order_number, storeId: store.id, vendorIds: [...vendorGroups.keys()] })]);
      if (userId) {
        await client.query(`INSERT INTO user_notifications(user_id,notification_type,title,message,action_url,metadata) VALUES($1,'order','Sifarişiniz qəbul edildi',$2,'/hesabim/sifarisler/',$3)`, [userId, `#${order.rows[0].order_number} nömrəli sifarişiniz uğurla yaradıldı.`, JSON.stringify({ orderId })]);
      }
      await client.query(`
        INSERT INTO user_notifications(user_id,notification_type,title,message,action_url,metadata)
        SELECT DISTINCT ur.user_id,'admin_order','Yeni sifariş yaradıldı',$2,'/admin/#orders',$3::jsonb
        FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id
        JOIN permissions p ON p.id=rp.permission_id
        WHERE ur.store_id=$1 AND p.code='orders.read'
      `, [store.id, `#${order.rows[0].order_number} nömrəli yeni sifariş qəbul edildi.`, JSON.stringify({ orderId })]);
      await client.query(`DELETE FROM carts WHERE store_id=$1 AND ${userId ? 'user_id=$2' : 'anonymous_id=$2'}`, [store.id, userId ?? anonymousId]);
      if (anonymousId) {
        const names = input.customerName.trim().split(/\s+/);
        await client.query(`
          INSERT INTO customer_profiles(anonymous_id,first_name,last_name,display_name,email,phone)
          VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(anonymous_id) WHERE anonymous_id IS NOT NULL
          DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,
            display_name=excluded.display_name,email=excluded.email,phone=excluded.phone
        `, [anonymousId, names[0] ?? '', names.slice(1).join(' '), input.customerName, input.customerEmail.toLowerCase(), input.customerPhone]);
      }
      return order.rows[0];
    });
    return reply.code(201).send({
      data: {
        id: data.id,
        orderNumber: data.order_number,
        status: data.status,
        paymentStatus: data.payment_status,
        paymentMethod: data.payment_method,
        subtotal: Number(data.subtotal),
        discountTotal: Number(data.discount_total),
        grandTotal: Number(data.grand_total),
        currency: data.currency
      }
    });
  });
}
