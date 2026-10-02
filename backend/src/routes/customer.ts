import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  clearCustomerIdentity,
  customerRateLimitKey,
  resolveCustomerIdentity,
  type CustomerIdentity
} from '../customer/identity.js';
import { AppError, badRequest, notFound } from '../core/errors.js';
import { hashPassword, verifyPassword } from '../core/password.js';
import { optionalAzerbaijanPhoneSchema } from '../core/phone.js';
import { env } from '../config/env.js';
import { pool, withTransaction } from '../db/pool.js';

const syncSchema = z.object({
  cart: z.array(z.object({
    listingId: z.uuid(),
    variantId: z.uuid(),
    quantity: z.number().int().min(1).max(100)
  })).max(100).default([]),
  wishlist: z.array(z.object({ listingId: z.uuid() })).max(200).default([])
});

const profileSchema = z.object({
  firstName: z.string().trim().max(100).default(''),
  lastName: z.string().trim().max(100).default(''),
  displayName: z.string().trim().max(120).default(''),
  email: z.union([z.literal(''), z.email().max(254)]).default(''),
  phone: optionalAzerbaijanPhoneSchema.default('')
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200)
});

const addressSchema = z.object({
  label: z.string().trim().min(1).max(100).default('Əsas ünvan'),
  recipientName: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(7).max(40),
  countryCode: z.string().trim().length(2).default('AZ'),
  city: z.string().trim().min(2).max(120),
  district: z.string().trim().max(120).default(''),
  addressLine1: z.string().trim().min(5).max(300),
  addressLine2: z.string().trim().max(300).default(''),
  postalCode: z.string().trim().max(30).default('')
});

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  authorName: z.string().trim().min(2).max(80),
  email: z.union([z.literal(''), z.email().max(254)]).default(''),
  title: z.string().trim().max(120).default(''),
  body: z.string().trim().min(10).max(2000)
});

type StoreRow = { id: string; currency: string };

async function getStore(): Promise<StoreRow> {
  const result = await pool.query<StoreRow>(
    `SELECT id,currency FROM stores WHERE code=$1 AND status='active'`,
    [env.DEFAULT_STORE_CODE]
  );
  if (!result.rows[0]) throw notFound('Store');
  return result.rows[0];
}

function identityValues(identity: CustomerIdentity): [string | null, string | null] {
  return [identity.userId, identity.anonymousId];
}

async function ensureCart(
  client: Pick<PoolClient, 'query'>,
  store: StoreRow,
  identity: CustomerIdentity
): Promise<string> {
  const [userId, anonymousId] = identityValues(identity);
  const conflict = userId
    ? '(store_id,user_id) WHERE user_id IS NOT NULL'
    : '(store_id,anonymous_id) WHERE anonymous_id IS NOT NULL';
  const result = await client.query<{ id: string }>(`
    INSERT INTO carts(store_id,user_id,anonymous_id,currency)
    VALUES($1,$2,$3,$4)
    ON CONFLICT ${conflict}
    DO UPDATE SET expires_at=now()+interval '30 days',updated_at=now()
    RETURNING id
  `, [store.id, userId, anonymousId, store.currency]);
  return result.rows[0]!.id;
}

async function ensureWishlist(
  client: Pick<PoolClient, 'query'>,
  storeId: string,
  identity: CustomerIdentity
): Promise<string> {
  const [userId, anonymousId] = identityValues(identity);
  const conflict = userId
    ? '(store_id,user_id) WHERE user_id IS NOT NULL'
    : '(store_id,anonymous_id) WHERE anonymous_id IS NOT NULL';
  const result = await client.query<{ id: string }>(`
    INSERT INTO wishlists(store_id,user_id,anonymous_id)
    VALUES($1,$2,$3)
    ON CONFLICT ${conflict}
    DO UPDATE SET updated_at=now()
    RETURNING id
  `, [storeId, userId, anonymousId]);
  return result.rows[0]!.id;
}

const commerceProductFields = `
  pl.id AS "listingId",pv.id AS "variantId",pl.slug,pl.title,
    pl.price::float8 AS price,pl.compare_at_price::float8 AS "compareAt",
    pl.currency,p.sku,b.name AS brand,v.display_name AS vendor,
    coalesce(ma.public_url,'/assets/wp-content/uploads/other-cat.webp') AS image`;
const commerceProductFrom = `
  FROM product_listings pl
  JOIN products p ON p.id=pl.product_id
  JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL
  LEFT JOIN brands b ON b.id=p.brand_id
  LEFT JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary
  LEFT JOIN media_assets ma ON ma.id=pm.media_asset_id
  JOIN LATERAL (
    SELECT id FROM product_variants
    WHERE product_id=p.id AND status='active'
    ORDER BY created_at LIMIT 1
  ) pv ON true`;

async function customerState(store: StoreRow, identity: CustomerIdentity): Promise<Record<string, unknown>> {
  const [userId, anonymousId] = identityValues(identity);
  const identityColumn = userId ? 'user_id' : 'anonymous_id';
  const identityValue = userId ?? anonymousId!;

  const [cart, wishlist, profile, addresses, orders, orderItems, loyalty, ledger, coupons, rewards, giveaways, notifications] = await Promise.all([
    pool.query(`SELECT ${commerceProductFields},ci.quantity ${commerceProductFrom}
      JOIN cart_items ci ON ci.listing_id=pl.id AND ci.variant_id=pv.id
      JOIN carts c ON c.id=ci.cart_id
      WHERE c.store_id=$1 AND c.${identityColumn}=$2
      ORDER BY ci.added_at`, [store.id, identityValue]),
    pool.query(`SELECT ${commerceProductFields} ${commerceProductFrom}
      JOIN wishlist_items wi ON wi.listing_id=pl.id
      JOIN wishlists w ON w.id=wi.wishlist_id
      WHERE w.store_id=$1 AND w.${identityColumn}=$2
      ORDER BY wi.added_at`, [store.id, identityValue]),
    userId
      ? pool.query(`SELECT u.first_name AS "firstName",u.last_name AS "lastName",
          coalesce(nullif(cp.display_name,''),u.first_name) AS "displayName",
          u.email::text,u.phone,true AS "authenticated"
        FROM users u LEFT JOIN customer_profiles cp ON cp.user_id=u.id WHERE u.id=$1`, [userId])
      : pool.query(`SELECT first_name AS "firstName",last_name AS "lastName",
          display_name AS "displayName",email::text,phone,false AS "authenticated"
        FROM customer_profiles WHERE anonymous_id=$1`, [anonymousId]),
    userId
      ? pool.query(`SELECT id,address_type AS "addressType",label,recipient_name AS "recipientName",
          phone,country_code AS "countryCode",city,coalesce(district,'') AS district,
          address_line_1 AS "addressLine1",coalesce(address_line_2,'') AS "addressLine2",
          coalesce(postal_code,'') AS "postalCode"
        FROM user_addresses WHERE user_id=$1 ORDER BY is_default DESC,created_at`, [userId])
      : pool.query(`SELECT id,address_type AS "addressType",label,recipient_name AS "recipientName",
          phone,country_code AS "countryCode",city,coalesce(district,'') AS district,
          address_line_1 AS "addressLine1",coalesce(address_line_2,'') AS "addressLine2",
          coalesce(postal_code,'') AS "postalCode"
        FROM guest_addresses WHERE anonymous_id=$1 ORDER BY address_type`, [anonymousId]),
    pool.query(`SELECT id,order_number AS "orderNumber",status,payment_status AS "paymentStatus",
        payment_method AS "paymentMethod",coupon_code AS "couponCode",currency,
        subtotal::float8 AS subtotal,discount_total::float8 AS "discountTotal",
        grand_total::float8 AS "grandTotal",placed_at AS "placedAt"
      FROM orders WHERE store_id=$1 AND ${identityColumn}=$2 ORDER BY placed_at DESC LIMIT 50`, [store.id, identityValue]),
    pool.query(`SELECT oi.order_id AS "orderId",oi.id,oi.product_name AS title,oi.sku,
        oi.quantity,oi.unit_price::float8 AS price,oi.line_total::float8 AS "lineTotal",
        coalesce(pl.slug,'') AS slug,coalesce(ma.public_url,'/assets/wp-content/uploads/other-cat.webp') AS image,
        oi.snapshot->>'listingId' AS "listingId",oi.variant_id AS "variantId"
      FROM order_items oi
      JOIN orders o ON o.id=oi.order_id
      LEFT JOIN product_listings pl ON pl.id=(oi.snapshot->>'listingId')::uuid
      LEFT JOIN products p ON p.id=oi.product_id
      LEFT JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary
      LEFT JOIN media_assets ma ON ma.id=pm.media_asset_id
      WHERE o.store_id=$1 AND o.${identityColumn}=$2 ORDER BY o.placed_at DESC,oi.id`, [store.id, identityValue]),
    userId
      ? pool.query(`SELECT balance,lifetime_earned AS "lifetimeEarned",tier,updated_at AS "updatedAt" FROM loyalty_accounts WHERE user_id=$1 AND store_id=$2`, [userId, store.id])
      : Promise.resolve({ rows: [] }),
    userId
      ? pool.query(`SELECT id,points,reason,reference_type AS "referenceType",reference_id AS "referenceId",balance_after AS "balanceAfter",created_at AS "createdAt" FROM loyalty_ledger WHERE user_id=$1 AND store_id=$2 ORDER BY created_at DESC LIMIT 50`, [userId, store.id])
      : Promise.resolve({ rows: [] }),
    userId
      ? pool.query(`SELECT uc.id,uc.unique_code AS code,uc.status,uc.acquired_via AS "acquiredVia",uc.expires_at AS "expiresAt",c.name,c.discount_type AS "discountType",c.discount_value::float8 AS "discountValue",c.minimum_order::float8 AS "minimumOrder" FROM user_coupons uc JOIN coupons c ON c.id=uc.coupon_id WHERE uc.user_id=$1 ORDER BY uc.acquired_at DESC`, [userId])
      : Promise.resolve({ rows: [] }),
    pool.query(`SELECT r.id,r.name,r.description,r.points_cost AS "pointsCost",r.stock,r.expires_at AS "expiresAt",coalesce(ma.public_url,'') AS image FROM rewards r LEFT JOIN media_assets ma ON ma.id=r.image_asset_id WHERE r.store_id=$1 AND r.status='active' AND (r.starts_at IS NULL OR r.starts_at<=now()) AND (r.expires_at IS NULL OR r.expires_at>now()) ORDER BY r.points_cost,r.name`, [store.id]),
    userId
      ? pool.query(`SELECT c.id,c.name,c.description,c.starts_at AS "startsAt",c.ends_at AS "endsAt",ge.status AS "entryStatus" FROM campaigns c LEFT JOIN giveaway_entries ge ON ge.campaign_id=c.id AND ge.user_id=$2 WHERE c.store_id=$1 AND c.campaign_type='giveaway' AND c.status='active' AND now() BETWEEN c.starts_at AND c.ends_at ORDER BY c.ends_at`, [store.id, userId])
      : pool.query(`SELECT c.id,c.name,c.description,c.starts_at AS "startsAt",c.ends_at AS "endsAt",NULL::text AS "entryStatus" FROM campaigns c WHERE c.store_id=$1 AND c.campaign_type='giveaway' AND c.status='active' AND now() BETWEEN c.starts_at AND c.ends_at ORDER BY c.ends_at`, [store.id]),
    userId
      ? pool.query(`SELECT id,notification_type AS type,title,message,action_url AS "actionUrl",read_at AS "readAt",created_at AS "createdAt" FROM user_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [userId])
      : Promise.resolve({ rows: [] })
  ]);

  const itemsByOrder = new Map<string, unknown[]>();
  for (const item of orderItems.rows) {
    const items = itemsByOrder.get(item.orderId) ?? [];
    items.push(item);
    itemsByOrder.set(item.orderId, items);
  }

  return {
    cart: cart.rows,
    wishlist: wishlist.rows,
    profile: profile.rows[0] ?? {
      firstName: '', lastName: '', displayName: '', email: '', phone: '', authenticated: false
    },
    addresses: addresses.rows,
    orders: orders.rows.map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] })),
    club: {
      authenticated: Boolean(userId),
      account: loyalty.rows[0] ?? { balance: 0, lifetimeEarned: 0, tier: 'standart' },
      ledger: ledger.rows,
      coupons: coupons.rows,
      rewards: rewards.rows,
      giveaways: giveaways.rows
    },
    notifications: notifications.rows,
    unreadNotifications: notifications.rows.filter((notification) => !notification.readAt).length
  };
}

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/state', async (request, reply) => {
    const [store, identity] = await Promise.all([getStore(), resolveCustomerIdentity(request, reply)]);
    reply.header('Cache-Control', 'private, no-store');
    return { data: await customerState(store, identity) };
  });

  app.post('/sync', {
    config: { rateLimit: { max: 80, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const input = syncSchema.parse(request.body);
    const [store, identity] = await Promise.all([getStore(), resolveCustomerIdentity(request, reply)]);

    await withTransaction(async (client) => {
      const cartId = await ensureCart(client, store, identity);
      const wishlistId = await ensureWishlist(client, store.id, identity);
      await client.query('DELETE FROM cart_items WHERE cart_id=$1', [cartId]);
      await client.query('DELETE FROM wishlist_items WHERE wishlist_id=$1', [wishlistId]);

      for (const item of input.cart) {
        const product = await client.query<{ price: string }>(`
          SELECT pl.price FROM product_listings pl
          JOIN product_variants pv ON pv.product_id=pl.product_id
          JOIN products p ON p.id=pl.product_id AND p.deleted_at IS NULL
          JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL
          WHERE pl.id=$1 AND pv.id=$2 AND pl.store_id=$3
            AND pl.status='published' AND pv.status='active'
        `, [item.listingId, item.variantId, store.id]);
        if (!product.rows[0]) continue;
        await client.query(`
          INSERT INTO cart_items(cart_id,listing_id,variant_id,quantity,unit_price)
          VALUES($1,$2,$3,$4,$5)
        `, [cartId, item.listingId, item.variantId, item.quantity, product.rows[0].price]);
      }

      if (input.wishlist.length) {
        const listingIds = [...new Set(input.wishlist.map((item) => item.listingId))];
        await client.query(`
          INSERT INTO wishlist_items(wishlist_id,listing_id)
          SELECT $1,pl.id FROM product_listings pl
          JOIN products p ON p.id=pl.product_id AND p.deleted_at IS NULL
          JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL
          WHERE pl.store_id=$2 AND pl.status='published' AND pl.id=ANY($3::uuid[])
          ON CONFLICT DO NOTHING
        `, [wishlistId, store.id, listingIds]);
      }
    });

    reply.header('Cache-Control', 'private, no-store');
    return { data: await customerState(store, identity) };
  });

  app.patch('/profile', {
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } }
  }, async (request, reply) => {
    const input = profileSchema.parse(request.body);
    const identity = await resolveCustomerIdentity(request, reply);

    if (identity.userId) {
      await withTransaction(async (client) => {
        await client.query(`
          UPDATE users SET first_name=$2,last_name=$3,email=$4,phone=nullif($5,'') WHERE id=$1
        `, [identity.userId, input.firstName, input.lastName, input.email, input.phone]);
        await client.query(`
          INSERT INTO customer_profiles(user_id,display_name)
          VALUES($1,$2)
          ON CONFLICT (user_id) WHERE user_id IS NOT NULL
          DO UPDATE SET display_name=excluded.display_name
        `, [identity.userId, input.displayName]);
      });
    } else {
      await pool.query(`
        INSERT INTO customer_profiles(anonymous_id,display_name,first_name,last_name,email,phone)
        VALUES($1,$2,$3,$4,nullif($5,'')::citext,nullif($6,''))
        ON CONFLICT (anonymous_id) WHERE anonymous_id IS NOT NULL
        DO UPDATE SET display_name=excluded.display_name,first_name=excluded.first_name,
          last_name=excluded.last_name,email=excluded.email,phone=excluded.phone
      `, [identity.anonymousId, input.displayName, input.firstName, input.lastName, input.email, input.phone]);
    }

    const store = await getStore();
    return { data: (await customerState(store, identity))['profile'] };
  });

  app.patch('/profile/password', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }
  }, async (request, reply) => {
    const input = passwordChangeSchema.parse(request.body);
    const identity = await resolveCustomerIdentity(request, reply);
    if (!identity.userId) throw badRequest('AUTH_REQUIRED', 'Şifrə dəyişmək üçün hesaba daxil olun');

    await withTransaction(async (client) => {
      const current = await client.query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',
        [identity.userId]
      );
      if (!current.rows[0] || !await verifyPassword(input.currentPassword, current.rows[0].password_hash)) {
        throw badRequest('CURRENT_PASSWORD_INVALID', 'Cari şifrə yanlışdır');
      }
      await client.query('UPDATE users SET password_hash=$2,failed_login_count=0,locked_until=NULL,updated_at=now() WHERE id=$1', [
        identity.userId,
        await hashPassword(input.newPassword)
      ]);
    });

    return { data: { changed: true } };
  });

  app.put('/addresses/:type', async (request, reply) => {
    const type = z.enum(['billing', 'shipping']).parse((request.params as { type: string }).type);
    const input = addressSchema.parse(request.body);
    const identity = await resolveCustomerIdentity(request, reply);
    if (identity.userId) {
      const existing = await pool.query<{ id: string }>(
        'SELECT id FROM user_addresses WHERE user_id=$1 AND address_type=$2 ORDER BY is_default DESC,created_at LIMIT 1',
        [identity.userId, type]
      );
      if (existing.rows[0]) {
        await pool.query(`
          UPDATE user_addresses SET label=$2,recipient_name=$3,phone=$4,country_code=$5,
            city=$6,district=nullif($7,''),address_line_1=$8,address_line_2=nullif($9,''),
            postal_code=nullif($10,'') WHERE id=$1
        `, [existing.rows[0].id, input.label, input.recipientName, input.phone, input.countryCode.toUpperCase(),
          input.city, input.district, input.addressLine1, input.addressLine2, input.postalCode]);
      } else {
        await pool.query(`
          INSERT INTO user_addresses(user_id,address_type,label,recipient_name,phone,country_code,
            city,district,address_line_1,address_line_2,postal_code)
          VALUES($1,$2,$3,$4,$5,$6,$7,nullif($8,''),$9,nullif($10,''),nullif($11,''))
        `, [identity.userId, type, input.label, input.recipientName, input.phone, input.countryCode.toUpperCase(),
          input.city, input.district, input.addressLine1, input.addressLine2, input.postalCode]);
      }
    } else {
      await pool.query(`
        INSERT INTO guest_addresses(anonymous_id,address_type,label,recipient_name,phone,country_code,
          city,district,address_line_1,address_line_2,postal_code)
        VALUES($1,$2,$3,$4,$5,$6,$7,nullif($8,''),$9,nullif($10,''),nullif($11,''))
        ON CONFLICT(anonymous_id,address_type) DO UPDATE SET label=excluded.label,
          recipient_name=excluded.recipient_name,phone=excluded.phone,country_code=excluded.country_code,
          city=excluded.city,district=excluded.district,address_line_1=excluded.address_line_1,
          address_line_2=excluded.address_line_2,postal_code=excluded.postal_code
      `, [identity.anonymousId, type, input.label, input.recipientName, input.phone, input.countryCode.toUpperCase(),
        input.city, input.district, input.addressLine1, input.addressLine2, input.postalCode]);
    }
    const store = await getStore();
    return { data: (await customerState(store, identity))['addresses'] };
  });

  app.post('/products/:slug/reviews', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
        groupId: 'product-reviews',
        keyGenerator: customerRateLimitKey,
        errorResponseBuilder: () => ({
          statusCode: 429,
          code: 'REVIEW_RATE_LIMITED',
          error: 'Too Many Requests',
          message: 'Ardıcıl çox sayda rəy göndərildi. Bir qədər gözləyib yenidən cəhd edin.'
        })
      }
    }
  }, async (request, reply) => {
    const slug = z.string().min(2).max(220).parse((request.params as { slug: string }).slug);
    const input = reviewSchema.parse(request.body);
    const [store, identity] = await Promise.all([getStore(), resolveCustomerIdentity(request, reply)]);
    const product = await pool.query<{ product_id: string }>(`
      SELECT pl.product_id FROM product_listings pl
      JOIN products p ON p.id=pl.product_id AND p.deleted_at IS NULL
      JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL
      WHERE pl.store_id=$1 AND pl.slug=$2 AND pl.status='published'
    `, [store.id, slug]);
    if (!product.rows[0]) throw notFound('Məhsul');

    const [userId, anonymousId] = identityValues(identity);
    const identityColumn = userId ? 'user_id' : 'anonymous_id';
    const identityValue = userId ?? anonymousId!;
    const verified = await pool.query<{ verified: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM order_items oi
        JOIN orders o ON o.id=oi.order_id
        WHERE o.store_id=$1 AND oi.product_id=$2 AND o.${identityColumn}=$3
          AND o.status NOT IN ('cancelled','returned','refunded')
      ) AS verified
    `, [store.id, product.rows[0].product_id, identityValue]);
    const conflict = userId
      ? '(store_id,product_id,user_id) WHERE user_id IS NOT NULL'
      : '(store_id,product_id,anonymous_id) WHERE anonymous_id IS NOT NULL';

    const review = await pool.query(`
      INSERT INTO product_reviews(
        store_id,product_id,user_id,anonymous_id,author_name,author_email,
        rating,title,body,status,verified_purchase
      )
      VALUES($1,$2,$3,$4,$5,nullif($6,'')::citext,$7,$8,$9,'published',$10)
      ON CONFLICT ${conflict}
      DO UPDATE SET author_name=excluded.author_name,author_email=excluded.author_email,
        rating=excluded.rating,title=excluded.title,body=excluded.body,status='published',
        verified_purchase=excluded.verified_purchase,created_at=now()
      RETURNING id,author_name,rating,title,body,verified_purchase,created_at
    `, [store.id, product.rows[0].product_id, userId, anonymousId, input.authorName,
      input.email, input.rating, input.title, input.body, Boolean(verified.rows[0]?.verified)]);
    const summary = await pool.query<{ average: number; count: number }>(`
      SELECT coalesce(round(avg(rating)::numeric,1),0)::float8 AS average,count(*)::int AS count
      FROM product_reviews WHERE store_id=$1 AND product_id=$2 AND status='published'
    `, [store.id, product.rows[0].product_id]);

    reply.header('Cache-Control', 'private, no-store');
    return {
      data: {
        review: review.rows[0],
        summary: summary.rows[0] ?? { average: 0, count: 0 }
      }
    };
  });

  app.get('/club', async (request, reply) => {
    const [store, identity] = await Promise.all([getStore(), resolveCustomerIdentity(request, reply)]);
    const state = await customerState(store, identity);
    reply.header('Cache-Control', 'private, no-store');
    return { data: state['club'] };
  });

  app.post('/club/rewards/:id/redeem', async (request, reply) => {
    const rewardId = z.uuid().parse((request.params as { id: string }).id);
    const [store, identity] = await Promise.all([getStore(), resolveCustomerIdentity(request, reply)]);
    if (!identity.userId) throw new AppError(401, 'AUTH_REQUIRED', 'Hədiyyə əldə etmək üçün hesaba daxil olun');
    const redemption = await withTransaction(async (client) => {
      const reward = await client.query<{ id: string; name: string; points_cost: number; stock: number | null }>(`
        SELECT id,name,points_cost,stock FROM rewards
        WHERE id=$1 AND store_id=$2 AND status='active'
          AND (starts_at IS NULL OR starts_at<=now()) AND (expires_at IS NULL OR expires_at>now())
        FOR UPDATE
      `, [rewardId, store.id]);
      if (!reward.rows[0] || reward.rows[0].stock === 0) throw notFound('Aktiv hədiyyə');
      const selectedReward = reward.rows[0];
      const account = await client.query<{ balance: number }>(`
        INSERT INTO loyalty_accounts(user_id,store_id,balance,lifetime_earned)
        VALUES($1,$2,0,0) ON CONFLICT(user_id,store_id) DO UPDATE SET updated_at=now()
        RETURNING balance
      `, [identity.userId, store.id]);
      const cost = Number(selectedReward.points_cost);
      if (Number(account.rows[0]?.balance ?? 0) < cost) throw badRequest('LOYALTY_BALANCE_LOW', 'Bu hədiyyə üçün kifayət qədər xalınız yoxdur');
      const created = await client.query<{ id: string }>(`
        INSERT INTO reward_redemptions(reward_id,user_id,points_spent,status)
        VALUES($1,$2,$3,'approved') RETURNING id
      `, [rewardId, identity.userId, cost]);
      const updated = await client.query<{ balance: number }>('UPDATE loyalty_accounts SET balance=balance-$3 WHERE user_id=$1 AND store_id=$2 RETURNING balance', [identity.userId, store.id, cost]);
      const redemptionId = created.rows[0]!.id;
      const balance = updated.rows[0]!.balance;
      await client.query(`INSERT INTO loyalty_ledger(user_id,store_id,points,reason,reference_type,reference_id,balance_after,idempotency_key) VALUES($1,$2,$3,$4,'reward',$5,$6,$7)`, [identity.userId, store.id, -cost, `${selectedReward.name} hədiyyəsi`, redemptionId, balance, `reward:${redemptionId}`]);
      if (selectedReward.stock !== null) await client.query('UPDATE rewards SET stock=stock-1 WHERE id=$1', [rewardId]);
      await client.query(`INSERT INTO user_notifications(user_id,notification_type,title,message,action_url,metadata) VALUES($1,'reward','Hədiyyə sifarişiniz qəbul edildi',$2,'/hesabim/baki-club/',$3)`, [identity.userId, `${selectedReward.name} üçün müraciətiniz təsdiqləndi.`, JSON.stringify({ redemptionId, rewardId })]);
      return { id: redemptionId, rewardName: selectedReward.name, balance };
    });
    return reply.code(201).send({ data: redemption });
  });

  app.post('/club/giveaways/:id/join', async (request, reply) => {
    const campaignId = z.uuid().parse((request.params as { id: string }).id);
    const [store, identity] = await Promise.all([getStore(), resolveCustomerIdentity(request, reply)]);
    if (!identity.userId) throw new AppError(401, 'AUTH_REQUIRED', 'Çəkilişə qoşulmaq üçün hesaba daxil olun');
    const campaign = await pool.query<{ id: string; name: string }>(`
      SELECT id,name FROM campaigns WHERE id=$1 AND store_id=$2 AND campaign_type='giveaway'
        AND status='active' AND now() BETWEEN starts_at AND ends_at
    `, [campaignId, store.id]);
    if (!campaign.rows[0]) throw notFound('Aktiv çəkiliş');
    const entry = await pool.query(`
      INSERT INTO giveaway_entries(campaign_id,user_id,status) VALUES($1,$2,'active')
      ON CONFLICT(campaign_id,user_id) DO UPDATE SET status='active',updated_at=now() RETURNING *
    `, [campaignId, identity.userId]);
    await pool.query(`INSERT INTO user_notifications(user_id,notification_type,title,message,action_url,metadata) VALUES($1,'giveaway','Çəkilişə qoşuldunuz',$2,'/hesabim/baki-club/',$3)`, [identity.userId, `${campaign.rows[0].name} çəkilişində iştirakınız qeydə alındı.`, JSON.stringify({ campaignId })]);
    return reply.code(201).send({ data: entry.rows[0] });
  });

  app.patch('/notifications/:id/read', async (request, reply) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const identity = await resolveCustomerIdentity(request, reply);
    if (!identity.userId) throw new AppError(401, 'AUTH_REQUIRED', 'Bildirişləri görmək üçün hesaba daxil olun');
    const result = await pool.query('UPDATE user_notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id,read_at', [id, identity.userId]);
    if (!result.rows[0]) throw notFound('Bildiriş');
    return { data: result.rows[0] };
  });

  app.post('/notifications/read-all', async (request, reply) => {
    const identity = await resolveCustomerIdentity(request, reply);
    if (!identity.userId) throw new AppError(401, 'AUTH_REQUIRED', 'Bildirişləri görmək üçün hesaba daxil olun');
    const result = await pool.query('UPDATE user_notifications SET read_at=coalesce(read_at,now()) WHERE user_id=$1 AND read_at IS NULL', [identity.userId]);
    return { data: { updated: result.rowCount ?? 0 } };
  });

  app.post('/orders/:id/cancel', async (request, reply) => {
    const orderId = z.uuid().parse((request.params as { id: string }).id);
    const [store, identity] = await Promise.all([getStore(), resolveCustomerIdentity(request, reply)]);
    const identityColumn = identity.userId ? 'user_id' : 'anonymous_id';
    const identityValue = identity.userId ?? identity.anonymousId!;
    const cancelled = await withTransaction(async (client) => {
      const current = await client.query(`SELECT * FROM orders WHERE id=$1 AND store_id=$2 AND ${identityColumn}=$3 FOR UPDATE`, [orderId, store.id, identityValue]);
      const order = current.rows[0];
      if (!order) throw notFound('Sifariş');
      if (!['pending', 'confirmed'].includes(order.status)) throw badRequest('ORDER_CANNOT_CANCEL', 'Bu mərhələdə sifarişi onlayn ləğv etmək mümkün deyil');
      const items = await client.query<{ variant_id: string; quantity: number; warehouse_id: string | null }>(`SELECT variant_id,quantity,snapshot->>'warehouseId' AS warehouse_id FROM order_items WHERE order_id=$1`, [orderId]);
      for (const item of items.rows) {
        if (!item.variant_id || !item.warehouse_id) continue;
        await client.query('UPDATE inventory SET reserved=greatest(0,reserved-$3),updated_at=now() WHERE variant_id=$1 AND warehouse_id=$2', [item.variant_id, item.warehouse_id, item.quantity]);
        await client.query(`INSERT INTO inventory_movements(variant_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note) VALUES($1,$2,'release',$3,'order',$4,'Müştəri ləğvi')`, [item.variant_id, item.warehouse_id, item.quantity, orderId]);
      }
      await client.query("UPDATE orders SET status='cancelled',payment_status=CASE WHEN payment_status='pending' THEN 'cancelled' ELSE payment_status END,cancelled_at=now() WHERE id=$1", [orderId]);
      await client.query("UPDATE payments SET status='cancelled' WHERE order_id=$1 AND status='pending'", [orderId]);
      await client.query("UPDATE vendor_orders SET status='cancelled' WHERE order_id=$1 AND status IN ('pending','confirmed')", [orderId]);
      await client.query(`INSERT INTO order_status_history(order_id,from_status,to_status,note) VALUES($1,$2,'cancelled','Müştəri tərəfindən ləğv edildi')`, [orderId, order.status]);
      if (order.coupon_id) await client.query('UPDATE coupons SET redemption_count=greatest(0,redemption_count-1) WHERE id=$1', [order.coupon_id]);
      if (order.user_id && order.coupon_code) await client.query("UPDATE user_coupons SET status='available',redeemed_at=NULL,order_id=NULL WHERE user_id=$1 AND upper(unique_code)=upper($2) AND order_id=$3", [order.user_id, order.coupon_code, orderId]);
      if (identity.userId) await client.query(`INSERT INTO user_notifications(user_id,notification_type,title,message,action_url,metadata) VALUES($1,'order','Sifariş ləğv edildi',$2,'/hesabim/sifarisler/',$3)`, [identity.userId, `#${order.order_number} nömrəli sifarişiniz ləğv edildi.`, JSON.stringify({ orderId })]);
      return { id: orderId, orderNumber: order.order_number, status: 'cancelled' };
    });
    return { data: cancelled };
  });

  app.post('/logout', async (_request, reply) => {
    clearCustomerIdentity(reply);
    return reply.code(204).send();
  });
}
