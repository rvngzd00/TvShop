import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { hashPassword } from '../core/password.js';
import { paginationMeta, paginationSchema } from '../core/pagination.js';
import { actorOf, assertStoreScope } from '../core/scope.js';
import { AppError, badRequest, forbidden, notFound } from '../core/errors.js';
import { writeAudit } from '../core/audit.js';
import { randomToken, tokenDigest } from '../core/security.js';
import { authEmailTemplate, sendEmail } from '../core/email.js';
import { env } from '../config/env.js';
import { optionalAzerbaijanPhoneSchema } from '../core/phone.js';

const userInput = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  phone: optionalAzerbaijanPhoneSchema.optional().transform((value) => value || undefined),
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  temporaryPassword: z.string().min(12).max(200),
  roleCode: z.enum(['admin', 'editor', 'seo', 'moderator', 'vendor_owner', 'vendor_staff', 'customer']),
  storeId: z.uuid(),
  vendorId: z.uuid().optional(),
  status: z.enum(['invited', 'active']).default('active')
}).superRefine((value, context) => {
  if (value.roleCode.startsWith('vendor_') && !value.vendorId) {
    context.addIssue({ code: 'custom', path: ['vendorId'], message: 'Satıcı rolu üçün vendorId tələb olunur' });
  }
  if (!value.roleCode.startsWith('vendor_') && value.vendorId) {
    context.addIssue({ code: 'custom', path: ['vendorId'], message: 'Bu rol vendor scope qəbul etmir' });
  }
});

const statusInput = z.object({ status: z.enum(['invited', 'active', 'suspended', 'disabled']) });
const userUpdate = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()).optional(),
  phone: z.union([z.null(), optionalAzerbaijanPhoneSchema]).optional(),
  firstName: z.string().trim().min(2).max(100).optional(),
  lastName: z.string().trim().min(2).max(100).optional(),
  newPassword: z.string().min(12).max(200).optional(),
  roleCode: z.enum(['super_admin', 'admin', 'editor', 'seo', 'moderator', 'vendor_owner', 'vendor_staff', 'customer']).optional(),
  storeId: z.uuid().optional(),
  vendorId: z.uuid().nullable().optional(),
  status: z.enum(['invited', 'active', 'suspended', 'disabled']).optional()
}).superRefine((value, context) => {
  if (value.roleCode && !value.storeId) context.addIssue({ code: 'custom', path: ['storeId'], message: 'Rol dəyişikliyi üçün mağaza tələb olunur' });
  if (value.roleCode?.startsWith('vendor_') && !value.vendorId) context.addIssue({ code: 'custom', path: ['vendorId'], message: 'Satıcı rolu üçün satıcı seçilməlidir' });
  if (value.roleCode && !value.roleCode.startsWith('vendor_') && value.vendorId) context.addIssue({ code: 'custom', path: ['vendorId'], message: 'Bu rol satıcı seçimi qəbul etmir' });
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.requirePermission('users.read') }, async (request) => {
    const query = paginationSchema.extend({
      accountType: z.enum(['general', 'vendor', 'all']).default('general'),
      ageMin: z.coerce.number().int().min(1).max(120).optional(),
      ageMax: z.coerce.number().int().min(1).max(120).optional(),
      gender: z.enum(['male', 'female']).optional(),
      maritalStatus: z.enum(['married', 'single']).optional()
    }).superRefine((value, context) => {
      if (value.ageMin !== undefined && value.ageMax !== undefined && value.ageMin > value.ageMax) {
        context.addIssue({ code: 'custom', path: ['ageMax'], message: 'Maksimum yaş minimum yaşdan kiçik ola bilməz' });
      }
    }).parse(request.query);
    const actor = actorOf(request);
    const params: unknown[] = [];
    const conditions = ['u.deleted_at IS NULL'];
    if (query.accountType !== 'all') {
      const vendorRoleExists = `EXISTS (
        SELECT 1 FROM user_roles vendor_ur
        JOIN roles vendor_role ON vendor_role.id=vendor_ur.role_id
        WHERE vendor_ur.user_id=u.id AND vendor_role.code IN ('vendor_owner','vendor_staff')
      )`;
      conditions.push(query.accountType === 'vendor' ? vendorRoleExists : `NOT ${vendorRoleExists}`);
    }
    if (!actor.isSuperAdmin) {
      params.push(actor.storeIds);
      conditions.push(`ur.store_id = ANY($${params.length}::uuid[])`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(`(u.email::text ILIKE $${params.length} OR concat(u.first_name, ' ', u.last_name) ILIKE $${params.length})`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`u.status::text = $${params.length}`);
    }
    if (query.ageMin !== undefined) {
      params.push(query.ageMin);
      conditions.push(`u.age >= $${params.length}`);
    }
    if (query.ageMax !== undefined) {
      params.push(query.ageMax);
      conditions.push(`u.age <= $${params.length}`);
    }
    if (query.gender) {
      params.push(query.gender);
      conditions.push(`u.gender = $${params.length}`);
    }
    if (query.maritalStatus) {
      params.push(query.maritalStatus);
      conditions.push(`u.marital_status = $${params.length}`);
    }
    params.push(query.limit, (query.page - 1) * query.limit);
    const result = await pool.query(`
      SELECT u.id, u.email, u.phone, u.first_name, u.last_name, u.age, u.gender, u.marital_status, u.status,
        u.last_login_at, u.created_at, u.failed_login_count, u.login_blocked_at, u.login_block_reason,
        array_remove(array_agg(DISTINCT r.code), NULL) AS roles,
        array_remove(array_agg(DISTINCT ur.store_id::text), NULL) AS store_ids,
        array_remove(array_agg(DISTINCT ur.vendor_id::text), NULL) AS vendor_ids,
        count(*) OVER()::int AS total_count
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY u.id
      ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    const total = Number(result.rows[0]?.total_count ?? 0);
    return { data: result.rows.map(({ total_count: _, ...row }) => row), meta: paginationMeta(query.page, query.limit, total) };
  });

  app.get('/:id', { preHandler: app.requirePermission('users.read') }, async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const actor = actorOf(request);
    const result = await pool.query(`
      SELECT u.id,u.email,u.phone,u.first_name,u.last_name,u.age,u.gender,u.marital_status,u.status,u.last_login_at,u.created_at,
        u.failed_login_count,u.login_blocked_at,u.login_block_reason,
        array_remove(array_agg(DISTINCT r.code),NULL) AS roles,
        array_remove(array_agg(DISTINCT ur.store_id::text),NULL) AS store_ids,
        array_remove(array_agg(DISTINCT ur.vendor_id::text),NULL) AS vendor_ids
      FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
      WHERE u.id=$1 AND u.deleted_at IS NULL GROUP BY u.id
    `, [id]);
    const user = result.rows[0];
    if (!user || !actor.isSuperAdmin && !(user.store_ids ?? []).some((storeId: string) => actor.storeIds.includes(storeId))) throw notFound('İstifadəçi');
    return { data: user };
  });

  app.post('/', { preHandler: app.requirePermission('users.manage') }, async (request, reply) => {
    const input = userInput.parse(request.body);
    const actor = actorOf(request);
    assertStoreScope(actor, input.storeId);
    if (input.vendorId) {
      const vendor = await pool.query('SELECT store_id FROM vendors WHERE id = $1 AND deleted_at IS NULL', [input.vendorId]);
      if (!vendor.rows[0] || vendor.rows[0].store_id !== input.storeId) throw notFound('Satıcı');
      assertStoreScope(actor, vendor.rows[0].store_id);
    }
    const passwordHash = await hashPassword(input.temporaryPassword);

    const inviteToken = input.status === 'invited' ? randomToken(36) : null;
    const user = await withTransaction(async (client) => {
      const created = await client.query(`
        INSERT INTO users (email, phone, password_hash, first_name, last_name, status)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, phone, first_name, last_name, status, created_at
      `, [input.email, input.phone ?? null, passwordHash, input.firstName, input.lastName, input.status]);
      const userId = created.rows[0].id;
      const assigned = await client.query(`
        INSERT INTO user_roles (user_id, role_id, store_id, vendor_id, granted_by)
        SELECT $1, id, $2, $3, $4 FROM roles WHERE code = $5
        RETURNING id
      `, [userId, input.storeId, input.vendorId ?? null, actor.userId, input.roleCode]);
      if (!assigned.rows[0]) throw new AppError(503, 'ROLE_UNAVAILABLE', 'Seçilmiş rol sistemdə tapılmadı');
      if (inviteToken) {
        await client.query(`
          INSERT INTO user_action_tokens(user_id,token_hash,token_type,created_by,expires_at)
          VALUES($1,$2,'invite',$3,now()+interval '72 hours')
        `, [userId, tokenDigest(inviteToken), actor.userId]);
      }
      await writeAudit(client, { actorUserId: actor.userId, storeId: input.storeId, vendorId: input.vendorId ?? null, action: 'user.create', entityType: 'user', entityId: userId, afterData: { ...created.rows[0], roleCode: input.roleCode }, requestId: request.id });
      return { ...created.rows[0], roleCode: input.roleCode, storeId: input.storeId, vendorId: input.vendorId ?? null };
    });
    let inviteUrl: string | undefined;
    let emailSent = false;
    if (inviteToken) {
      inviteUrl = `${env.PUBLIC_ORIGIN.replace(/\/$/, '')}/deveti-qebul-et/?token=${encodeURIComponent(inviteToken)}`;
      try {
        const delivery = await sendEmail({
          to: input.email,
          subject: 'TVShop idarəetmə dəvəti',
          html: authEmailTemplate('Komandaya dəvət edildiniz', `Salam ${input.firstName}, TVShop hesabınızı aktivləşdirmək üçün təhlükəsiz keçiddən istifadə edin.`, 'Dəvəti qəbul et', inviteUrl),
          text: `Salam ${input.firstName}, TVShop hesabınızı aktivləşdirmək üçün bu keçiddən istifadə edin: ${inviteUrl}`
        });
        emailSent = delivery.accepted;
      } catch (error) {
        request.log.warn({ err: error, userId: user.id }, 'Invite email delivery failed');
      }
    }
    return reply.code(201).send({ data: { ...user, ...(inviteUrl ? { inviteUrl, emailSent } : {}) } });
  });

  app.post('/:id/invite', { preHandler: app.requirePermission('users.manage') }, async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const actor = actorOf(request);
    const current = await pool.query<{ id: string; email: string; first_name: string; status: string; store_ids: string[] }>(`
      SELECT u.id,u.email::text,u.first_name,u.status,array_remove(array_agg(DISTINCT ur.store_id::text),NULL) AS store_ids
      FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id
      WHERE u.id=$1 AND u.deleted_at IS NULL GROUP BY u.id
    `, [id]);
    const user = current.rows[0];
    if (!user || user.status !== 'invited') throw notFound('Dəvət gözləyən istifadəçi');
    if (!actor.isSuperAdmin && !(user.store_ids ?? []).some((storeId) => actor.storeIds.includes(storeId))) throw notFound('İstifadəçi');
    const raw = randomToken(36);
    await withTransaction(async (client) => {
      await client.query("UPDATE user_action_tokens SET used_at=now() WHERE user_id=$1 AND token_type='invite' AND used_at IS NULL", [id]);
      await client.query("INSERT INTO user_action_tokens(user_id,token_hash,token_type,created_by,expires_at) VALUES($1,$2,'invite',$3,now()+interval '72 hours')", [id, tokenDigest(raw), actor.userId]);
    });
    const inviteUrl = `${env.PUBLIC_ORIGIN.replace(/\/$/, '')}/deveti-qebul-et/?token=${encodeURIComponent(raw)}`;
    let emailSent = false;
    try {
      const delivery = await sendEmail({
        to: user.email,
        subject: 'TVShop idarəetmə dəvəti',
        html: authEmailTemplate('Komandaya dəvət edildiniz', `Salam ${user.first_name}, hesabınızı aktivləşdirmək üçün yeni təhlükəsiz keçiddən istifadə edin.`, 'Dəvəti qəbul et', inviteUrl),
        text: `Salam ${user.first_name}, TVShop hesabınızı aktivləşdirmək üçün bu yeni keçiddən istifadə edin: ${inviteUrl}`
      });
      emailSent = delivery.accepted;
    } catch (error) {
      request.log.warn({ err: error, userId: id }, 'Invite email delivery failed');
    }
    return { data: { inviteUrl, emailSent, expiresInHours: 72 } };
  });

  app.patch('/:id/status', { preHandler: app.requirePermission('users.manage') }, async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const input = statusInput.parse(request.body);
    const actor = actorOf(request);
    const current = await pool.query(`
      SELECT u.*, array_remove(array_agg(DISTINCT ur.store_id::text), NULL) AS store_ids,
        array_remove(array_agg(DISTINCT r.code), NULL) AS roles
      FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id=ur.role_id
      WHERE u.id = $1 AND u.deleted_at IS NULL GROUP BY u.id
    `, [id]);
    if (!current.rows[0]) throw notFound('İstifadəçi');
    if (current.rows[0].roles?.includes('super_admin') && !actor.isSuperAdmin) throw forbidden('Super admin hesabını yalnız super admin idarə edə bilər');
    if (id === actor.userId && input.status !== 'active') throw badRequest('SELF_STATUS_CHANGE', 'Öz hesabınızı deaktiv edə bilməzsiniz');
    if (!actor.isSuperAdmin && !(current.rows[0].store_ids ?? []).some((storeId: string) => actor.storeIds.includes(storeId))) {
      throw notFound('İstifadəçi');
    }

    const updated = await withTransaction(async (client) => {
      const result = await client.query(`UPDATE users SET status=$2::user_status,
        failed_login_count=CASE WHEN $2::user_status='active'::user_status THEN 0 ELSE failed_login_count END,
        locked_until=CASE WHEN $2::user_status='active'::user_status THEN NULL ELSE locked_until END,
        login_blocked_at=CASE WHEN $2::user_status='active'::user_status THEN NULL ELSE login_blocked_at END,
        login_block_reason=CASE WHEN $2::user_status='active'::user_status THEN NULL ELSE login_block_reason END
        WHERE id=$1 RETURNING id,email,first_name,last_name,status,failed_login_count,login_blocked_at`, [id, input.status]);
      if (input.status !== 'active') await client.query('UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      await writeAudit(client, { actorUserId: actor.userId, action: 'user.status.update', entityType: 'user', entityId: id, beforeData: { status: current.rows[0].status }, afterData: { status: input.status }, requestId: request.id });
      return result.rows[0];
    });
    return { data: updated };
  });

  app.post('/:id/unlock', { preHandler: app.requirePermission('users.manage') }, async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const actor = actorOf(request);
    const current = await pool.query<{
      id: string;
      email: string;
      login_blocked_at: Date | null;
      login_block_reason: string | null;
      store_ids: string[] | null;
      roles: string[] | null;
    }>(`
      SELECT u.id,u.email::text,u.login_blocked_at,u.login_block_reason,
        array_remove(array_agg(DISTINCT ur.store_id::text),NULL) AS store_ids,
        array_remove(array_agg(DISTINCT r.code),NULL) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id=u.id
      LEFT JOIN roles r ON r.id=ur.role_id
      WHERE u.id=$1 AND u.deleted_at IS NULL
      GROUP BY u.id
    `, [id]);
    const user = current.rows[0];
    if (!user || !actor.isSuperAdmin && !(user.store_ids ?? []).some((storeId) => actor.storeIds.includes(storeId))) {
      throw notFound('İstifadəçi');
    }
    if (user.roles?.includes('super_admin') && !actor.isSuperAdmin) {
      throw forbidden('Super admin hesabının kilidini yalnız super admin aça bilər');
    }
    if (!user.login_blocked_at) {
      throw badRequest('ACCOUNT_NOT_BLOCKED', 'Bu hesabın giriş kilidi aktiv deyil');
    }

    const unlocked = await withTransaction(async (client) => {
      const result = await client.query(`
        UPDATE users SET failed_login_count=0,locked_until=NULL,login_blocked_at=NULL,login_block_reason=NULL
        WHERE id=$1
        RETURNING id,email,first_name,last_name,status,failed_login_count,login_blocked_at
      `, [id]);
      await writeAudit(client, {
        actorUserId: actor.userId,
        storeId: user.store_ids?.[0] ?? null,
        action: 'user.login.unlock',
        entityType: 'user',
        entityId: id,
        beforeData: { loginBlockedAt: user.login_blocked_at, reason: user.login_block_reason },
        afterData: { loginBlockedAt: null, failedLoginCount: 0 },
        requestId: request.id
      });
      return result.rows[0];
    });
    return { data: unlocked };
  });

  app.patch('/:id', { preHandler: app.requirePermission('users.manage') }, async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const input = userUpdate.parse(request.body);
    const actor = actorOf(request);
    const currentResult = await pool.query(`
      SELECT u.*,array_remove(array_agg(DISTINCT ur.store_id::text),NULL) AS store_ids,
        array_remove(array_agg(DISTINCT ur.vendor_id::text),NULL) AS vendor_ids,
        array_remove(array_agg(DISTINCT r.code),NULL) AS roles
      FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
      WHERE u.id=$1 AND u.deleted_at IS NULL GROUP BY u.id
    `, [id]);
    const current = currentResult.rows[0];
    if (!current || !actor.isSuperAdmin && !(current.store_ids ?? []).some((storeId: string) => actor.storeIds.includes(storeId))) throw notFound('İstifadəçi');
    const targetIsSuperAdmin = (current.roles ?? []).includes('super_admin');
    if (targetIsSuperAdmin && !actor.isSuperAdmin) throw forbidden('Super admin hesabını yalnız super admin redaktə edə bilər');
    if (input.roleCode && !actor.isSuperAdmin) throw forbidden('İstifadəçi rolunu yalnız super admin dəyişə bilər');
    if (id === actor.userId && input.status && input.status !== 'active') throw badRequest('SELF_STATUS_CHANGE', 'Öz hesabınızı deaktiv edə bilməzsiniz');
    if (input.storeId) assertStoreScope(actor, input.storeId);
    if (input.vendorId) {
      const vendor = await pool.query('SELECT store_id FROM vendors WHERE id=$1 AND deleted_at IS NULL', [input.vendorId]);
      if (!vendor.rows[0] || vendor.rows[0].store_id !== input.storeId) throw notFound('Satıcı');
    }
    if (targetIsSuperAdmin && input.roleCode && input.roleCode !== 'super_admin') {
      const admins = await pool.query("SELECT count(DISTINCT ur.user_id)::int AS count FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id WHERE r.code='super_admin' AND u.status='active' AND u.deleted_at IS NULL");
      if (Number(admins.rows[0]?.count) <= 1) throw badRequest('LAST_SUPER_ADMIN', 'Son aktiv super adminin rolu dəyişdirilə bilməz');
    }
    const passwordHash = input.newPassword ? await hashPassword(input.newPassword) : null;
    const emailChanged = Boolean(input.email && input.email !== String(current.email).toLowerCase());
    const data = await withTransaction(async (client) => {
      const updated = await client.query(`
        UPDATE users SET email=coalesce($2,email),phone=CASE WHEN $3 THEN $4 ELSE phone END,
          first_name=coalesce($5,first_name),last_name=coalesce($6,last_name),
          password_hash=coalesce($7,password_hash),status=coalesce($8::user_status,status),
          email_verified_at=CASE WHEN $2::citext IS NOT NULL AND $2::citext<>email THEN NULL ELSE email_verified_at END,
          failed_login_count=CASE WHEN $7::text IS NOT NULL OR $8::user_status='active'::user_status THEN 0 ELSE failed_login_count END,
          locked_until=CASE WHEN $7::text IS NOT NULL OR $8::user_status='active'::user_status THEN NULL ELSE locked_until END,
          login_blocked_at=CASE WHEN $7::text IS NOT NULL OR $8::user_status='active'::user_status THEN NULL ELSE login_blocked_at END,
          login_block_reason=CASE WHEN $7::text IS NOT NULL OR $8::user_status='active'::user_status THEN NULL ELSE login_block_reason END
        WHERE id=$1 RETURNING id,email,phone,first_name,last_name,status,updated_at,failed_login_count,login_blocked_at
      `, [id, input.email ?? null, Object.hasOwn(input, 'phone'), input.phone || null, input.firstName ?? null, input.lastName ?? null, passwordHash, input.status ?? null]);
      if (input.roleCode) {
        await client.query('DELETE FROM user_roles WHERE user_id=$1', [id]);
        const assigned = await client.query(`INSERT INTO user_roles(user_id,role_id,store_id,vendor_id,granted_by) SELECT $1,id,$2,$3,$4 FROM roles WHERE code=$5 RETURNING id`, [id, input.storeId, input.vendorId ?? null, actor.userId, input.roleCode]);
        if (!assigned.rows[0]) throw new AppError(503, 'ROLE_UNAVAILABLE', 'Seçilmiş rol sistemdə tapılmadı');
      }
      if (passwordHash || emailChanged || input.status && input.status !== 'active') await client.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
      await writeAudit(client, { actorUserId: actor.userId, storeId: input.storeId ?? current.store_ids[0] ?? null, vendorId: input.vendorId ?? current.vendor_ids[0] ?? null, action: 'user.update', entityType: 'user', entityId: id, beforeData: { email: current.email, phone: current.phone, firstName: current.first_name, lastName: current.last_name, status: current.status, roles: current.roles }, afterData: { ...updated.rows[0], roleCode: input.roleCode ?? current.roles[0], passwordChanged: Boolean(passwordHash) }, requestId: request.id });
      return { ...updated.rows[0], roles: input.roleCode ? [input.roleCode] : current.roles, storeIds: input.storeId ? [input.storeId] : current.store_ids, vendorIds: input.vendorId ? [input.vendorId] : input.roleCode ? [] : current.vendor_ids };
    });
    return { data };
  });

  app.delete('/:id', { preHandler: app.requirePermission('users.manage') }, async (request, reply) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const actor = actorOf(request);
    if (id === actor.userId) throw badRequest('SELF_DELETE', 'Öz hesabınızı silə bilməzsiniz');
    const result = await pool.query(`SELECT u.*,array_remove(array_agg(DISTINCT ur.store_id::text),NULL) AS store_ids,array_remove(array_agg(DISTINCT r.code),NULL) AS roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND u.deleted_at IS NULL GROUP BY u.id`, [id]);
    const current = result.rows[0];
    if (!current || !actor.isSuperAdmin && !(current.store_ids ?? []).some((storeId: string) => actor.storeIds.includes(storeId))) throw notFound('İstifadəçi');
    if ((current.roles ?? []).includes('super_admin')) {
      if (!actor.isSuperAdmin) throw forbidden('Super admin hesabını yalnız super admin silə bilər');
      const admins = await pool.query("SELECT count(DISTINCT ur.user_id)::int AS count FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id WHERE r.code='super_admin' AND u.status='active' AND u.deleted_at IS NULL");
      if (Number(admins.rows[0]?.count) <= 1) throw badRequest('LAST_SUPER_ADMIN', 'Son aktiv super admin silinə bilməz');
    }
    await withTransaction(async (client) => {
      await client.query("UPDATE users SET email=('deleted+'||id::text||'@deleted.invalid')::citext,phone=NULL,first_name='Silinmiş',last_name='İstifadəçi',status='disabled',deleted_at=now() WHERE id=$1", [id]);
      await client.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
      await writeAudit(client, { actorUserId: actor.userId, storeId: current.store_ids[0] ?? null, action: 'user.delete', entityType: 'user', entityId: id, beforeData: { email: current.email, status: current.status, roles: current.roles }, afterData: { status: 'disabled', deleted: true }, requestId: request.id });
    });
    return reply.code(204).send();
  });
}
