import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { hashPassword } from '../core/password.js';
import { paginationMeta, paginationSchema } from '../core/pagination.js';
import { slugify } from '../core/slug.js';
import { actorOf, assertStoreScope } from '../core/scope.js';
import { AppError, badRequest, forbidden, notFound } from '../core/errors.js';
import { writeAudit } from '../core/audit.js';
import { optionalAzerbaijanPhoneSchema } from '../core/phone.js';

const vendorInput = z.object({
  storeId: z.uuid(),
  displayName: z.string().trim().min(2).max(160),
  legalName: z.string().trim().min(2).max(200),
  slug: z.string().trim().max(180).optional(),
  taxId: z.string().trim().max(80).optional(),
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  phone: optionalAzerbaijanPhoneSchema.optional().transform((value) => value || undefined),
  description: z.string().trim().max(5000).default(''),
  commissionRate: z.number().min(0).max(100).default(0),
  ownerFirstName: z.string().trim().min(2).max(100),
  ownerLastName: z.string().trim().min(2).max(100),
  accountEmail: z.email().max(254).transform((value) => value.toLowerCase()),
  accountPassword: z.string().min(12).max(200)
});

const vendorUpdate = vendorInput.omit({ storeId: true, ownerFirstName: true, ownerLastName: true, accountEmail: true, accountPassword: true }).partial().extend({
  status: z.enum(['pending', 'active', 'suspended', 'rejected']).optional()
});

export async function vendorRoutes(app: FastifyInstance): Promise<void> {
  app.get('/options', { preHandler: app.authenticate }, async (request) => {
    const actor = actorOf(request);
    if (![...actor.permissions].some((permission) => ['vendors.read', 'catalog.read', 'posts.read'].includes(permission))) {
      throw forbidden('Satıcı seçimi üçün icazəniz yoxdur');
    }
    const query = z.object({ storeId: z.uuid().optional(), includePending: z.coerce.boolean().default(false) }).parse(request.query);
    const storeId = query.storeId ?? actor.storeIds[0];
    if (!storeId) throw badRequest('STORE_REQUIRED', 'Mağaza seçilməlidir');
    assertStoreScope(actor, storeId);
    const includePending = query.includePending && (actor.permissions.has('vendors.manage') || actor.permissions.has('users.manage'));
    const result = await pool.query(`
      SELECT id,store_id,display_name
      FROM vendors
      WHERE store_id=$1 AND (status='active' OR ($2 AND status='pending')) AND deleted_at IS NULL
      ORDER BY display_name
    `, [storeId, includePending]);
    return { data: result.rows };
  });

  app.get('/', { preHandler: app.requirePermission('vendors.read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const actor = actorOf(request);
    const params: unknown[] = [];
    const conditions = ['v.deleted_at IS NULL'];
    if (!actor.isSuperAdmin) {
      params.push(actor.storeIds);
      conditions.push(`v.store_id = ANY($${params.length}::uuid[])`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(`(v.display_name ILIKE $${params.length} OR v.legal_name ILIKE $${params.length} OR v.email::text ILIKE $${params.length})`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`v.status::text = $${params.length}`);
    }
    params.push(query.limit, (query.page - 1) * query.limit);
    const result = await pool.query(`
      SELECT v.*,owner.id AS owner_user_id,owner.first_name AS owner_first_name,
        owner.last_name AS owner_last_name,owner.email::text AS owner_email,
        owner.phone AS owner_phone,owner.last_login_at AS owner_last_login_at,
        count(*) OVER()::int AS total_count
      FROM vendors v
      LEFT JOIN LATERAL (
        SELECT u.id,u.first_name,u.last_name,u.email,u.phone,u.last_login_at
        FROM user_roles ur
        JOIN roles r ON r.id=ur.role_id AND r.code='vendor_owner'
        JOIN users u ON u.id=ur.user_id AND u.deleted_at IS NULL
        WHERE ur.vendor_id=v.id
        ORDER BY ur.created_at ASC LIMIT 1
      ) owner ON true
      WHERE ${conditions.join(' AND ')}
      ORDER BY v.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    const total = Number(result.rows[0]?.total_count ?? 0);
    return { data: result.rows.map(({ total_count: _, ...row }) => row), meta: paginationMeta(query.page, query.limit, total) };
  });

  app.post('/', { preHandler: app.requirePermission('vendors.manage') }, async (request, reply) => {
    const input = vendorInput.parse(request.body);
    const actor = actorOf(request);
    assertStoreScope(actor, input.storeId);
    const duplicateAccount = await pool.query('SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL', [input.accountEmail]);
    if (duplicateAccount.rows[0]) throw badRequest('VENDOR_ACCOUNT_EMAIL_IN_USE', 'Bu e-poçtla artıq istifadəçi hesabı mövcuddur');
    const passwordHash = await hashPassword(input.accountPassword);
    const result = await withTransaction(async (client) => {
      const status = actor.permissions.has('vendors.approve') ? 'active' : 'pending';
      const inserted = await client.query(`
        INSERT INTO vendors (
          store_id, display_name, legal_name, slug, tax_id, email, phone,
          description, commission_rate, status, approved_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vendor_status,CASE WHEN $10::vendor_status='active'::vendor_status THEN now() ELSE NULL END) RETURNING *
      `, [input.storeId, input.displayName, input.legalName, input.slug ? slugify(input.slug) : slugify(input.displayName), input.taxId ?? null, input.email, input.phone ?? null, input.description, input.commissionRate, status]);
      const vendorId = inserted.rows[0].id;
      const owner = await client.query(`
        INSERT INTO users(email,password_hash,first_name,last_name,status,email_verified_at)
        VALUES($1,$2,$3,$4,'active',now()) RETURNING id,email,first_name,last_name,status
      `, [input.accountEmail, passwordHash, input.ownerFirstName, input.ownerLastName]);
      const assigned = await client.query(`
        INSERT INTO user_roles(user_id,role_id,store_id,vendor_id,granted_by)
        SELECT $1,id,$2,$3,$4 FROM roles WHERE code='vendor_owner' RETURNING id
      `, [owner.rows[0].id, input.storeId, vendorId, actor.userId]);
      if (!assigned.rows[0]) throw new AppError(503, 'ROLE_UNAVAILABLE', 'Satıcı sahibi rolu sistemdə tapılmadı');
      await writeAudit(client, { actorUserId: actor.userId, storeId: input.storeId, vendorId, action: 'vendor.create', entityType: 'vendor', entityId: vendorId, afterData: { ...inserted.rows[0], ownerUserId: owner.rows[0].id, accountEmail: owner.rows[0].email }, requestId: request.id });
      return { ...inserted.rows[0], owner: owner.rows[0], portalUrl: '/satici-paneli/' };
    });
    return reply.code(201).send({ data: result });
  });

  app.patch('/:id', { preHandler: app.authenticate }, async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const input = vendorUpdate.parse(request.body);
    const actor = actorOf(request);
    const canManage = actor.permissions.has('vendors.manage');
    const canApprove = actor.permissions.has('vendors.approve');
    if (!canManage && !canApprove) throw forbidden('Satıcı məlumatlarını dəyişmək üçün icazəniz yoxdur');
    if (Object.keys(input).some((key) => key !== 'status') && !canManage) {
      throw forbidden('Satıcı məlumatlarını redaktə etmək üçün idarəetmə icazəsi tələb olunur');
    }
    const current = await pool.query('SELECT * FROM vendors WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!current.rows[0]) throw notFound('Satıcı');
    assertStoreScope(actor, current.rows[0].store_id);
    if (input.status && !canApprove) {
      throw forbidden('Satıcı statusunu dəyişmək üçün təsdiq icazəsi tələb olunur');
    }

    const result = await withTransaction(async (client) => {
      const updated = await client.query(`
        UPDATE vendors SET
          display_name = coalesce($2, display_name), legal_name = coalesce($3, legal_name),
          slug = coalesce($4, slug), tax_id = coalesce($5, tax_id), email = coalesce($6, email),
          phone = coalesce($7, phone), description = coalesce($8, description),
          commission_rate = coalesce($9, commission_rate), status = coalesce($10::vendor_status, status),
          approved_at = CASE WHEN $10::vendor_status = 'active'::vendor_status AND approved_at IS NULL THEN now() ELSE approved_at END
        WHERE id = $1 RETURNING *
      `, [id, input.displayName ?? null, input.legalName ?? null, input.slug ? slugify(input.slug) : null, input.taxId ?? null, input.email ?? null, input.phone ?? null, input.description ?? null, input.commissionRate ?? null, input.status ?? null]);
      if (input.status && input.status !== current.rows[0].status) {
        const notification = input.status === 'active'
          ? {
              title: 'Satıcı hesabınız təsdiqləndi',
              message: 'Partnyorluq müraciətiniz təsdiqləndi. Moderasiyadan keçmiş məhsullarınız artıq mağazada görünə bilər.',
              actionUrl: '/satici-paneli/'
            }
          : {
              title: 'Satıcı hesabınızın statusu yeniləndi',
              message: `Satıcı hesabınızın yeni statusu: ${input.status}. Ətraflı məlumat üçün TVShop ilə əlaqə saxlayın.`,
              actionUrl: '/satici-girisi/'
            };
        await client.query(`
          INSERT INTO user_notifications(user_id,notification_type,title,message,action_url,metadata)
          SELECT DISTINCT ur.user_id,'vendor.status',$2,$3,$4,
            jsonb_build_object('vendorId',$1::text,'status',$5::text)
          FROM user_roles ur
          JOIN roles r ON r.id=ur.role_id AND r.code IN ('vendor_owner','vendor_staff')
          WHERE ur.vendor_id=$1::uuid
        `, [id, notification.title, notification.message, notification.actionUrl, input.status]);
      }
      await writeAudit(client, { actorUserId: actor.userId, storeId: current.rows[0].store_id, vendorId: id, action: 'vendor.update', entityType: 'vendor', entityId: id, beforeData: current.rows[0], afterData: updated.rows[0], requestId: request.id });
      return updated.rows[0];
    });
    return { data: result };
  });
}
