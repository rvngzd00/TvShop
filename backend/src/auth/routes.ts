import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../core/errors.js';
import { hashPassword, verifyPassword } from '../core/password.js';
import { privacyHash, randomToken, tokenDigest } from '../core/security.js';
import {
  authEmailTemplate,
  customerWelcomeEmailTemplate,
  sendEmail,
  vendorWelcomeEmailTemplate
} from '../core/email.js';
import { azerbaijanPhoneSchema } from '../core/phone.js';
import { slugify } from '../core/slug.js';
import { writeAudit } from '../core/audit.js';
import { pool, withTransaction } from '../db/pool.js';
import { clearAuthCookies, cookieNames, setAuthCookies } from './cookies.js';
import { loadActorContext } from './context.js';

const loginSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200)
});

const registerSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  phone: azerbaijanPhoneSchema.optional(),
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  age: z.coerce.number().int().min(1).max(120),
  gender: z.enum(['male', 'female']),
  maritalStatus: z.enum(['married', 'single']),
  password: z.string().min(12).max(200)
});

const vendorRegisterSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  legalName: z.string().trim().min(2).max(200),
  taxId: z.string().trim().min(5).max(80),
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  phone: azerbaijanPhoneSchema,
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  password: z.string().min(12).max(200),
  description: z.string().trim().max(5000).default('')
});

const forgotPasswordSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase())
});

const resetPasswordSchema = z.object({
  token: z.string().min(32).max(300),
  password: z.string().min(12).max(200)
});

const acceptInviteSchema = resetPasswordSchema;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  status: string;
  locked_until: Date | null;
  failed_login_count: number;
  login_blocked_at: Date | null;
}

interface VendorAccessRow {
  has_vendor_role: boolean | null;
  has_non_vendor_role: boolean | null;
  has_active_vendor: boolean | null;
  has_pending_vendor: boolean | null;
}

type PendingSession = {
  id: string;
  userId: string;
  familyId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresAt: Date;
};

function prepareSession(app: FastifyInstance, userId: string, familyId: string = randomUUID()): PendingSession {
  const id = randomUUID();
  return {
    id,
    userId,
    familyId,
    accessToken: app.jwt.sign({ sub: userId, sessionId: id }, { expiresIn: env.ACCESS_TOKEN_TTL }),
    refreshToken: randomToken(),
    csrfToken: randomToken(24),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000)
  };
}

async function persistSession(
  queryable: Pick<PoolClient, 'query'>,
  session: PendingSession,
  request: FastifyRequest
): Promise<void> {
  await queryable.query(`
    INSERT INTO refresh_sessions (
      id, user_id, token_hash, family_id, user_agent, ip_hash, expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [
    session.id,
    session.userId,
    tokenDigest(session.refreshToken),
    session.familyId,
    request.headers['user-agent']?.slice(0, 500) ?? null,
    privacyHash(request.ip, env.COOKIE_SECRET),
    session.expiresAt
  ]);
}

function applySessionCookies(reply: FastifyReply, session: PendingSession): void {
  setAuthCookies(reply, session.accessToken, session.refreshToken, session.csrfToken);
}

async function createSession(
  app: FastifyInstance,
  reply: FastifyReply,
  request: FastifyRequest,
  userId: string,
  familyId: string = randomUUID()
): Promise<void> {
  const session = prepareSession(app, userId, familyId);
  await persistSession(pool, session, request);
  applySessionCookies(reply, session);
}

async function verifyLoginCredentials(input: z.infer<typeof loginSchema>): Promise<UserRow> {
  const result = await pool.query<UserRow>(`
    SELECT id, email, password_hash, status, locked_until, failed_login_count, login_blocked_at
    FROM users WHERE email = $1 AND deleted_at IS NULL
  `, [input.email]);
  const user = result.rows[0];

  if (!user || user.status !== 'active') {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email və ya şifrə yanlışdır');
  }
  if (user.login_blocked_at) {
    throw new AppError(423, 'ACCOUNT_LOGIN_BLOCKED', 'Hesabınız 10 uğursuz giriş cəhdindən sonra bloklanıb. Kilidin açılması üçün administratorla əlaqə saxlayın');
  }
  // Preserve protection for a legacy temporary lock until migration 022 clears it.
  if (user.locked_until && user.locked_until > new Date()) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email və ya şifrə yanlışdır');
  }

  const valid = await verifyPassword(input.password, user.password_hash);
  if (!valid) {
    const failed = await withTransaction(async (client) => {
      const updated = await client.query<{ failed_login_count: number; login_blocked_at: Date | null }>(`
      UPDATE users SET
        failed_login_count = failed_login_count + 1,
        locked_until = NULL,
        login_blocked_at = CASE WHEN failed_login_count + 1 >= 10 THEN coalesce(login_blocked_at,now()) ELSE login_blocked_at END,
        login_block_reason = CASE WHEN failed_login_count + 1 >= 10 THEN 'too_many_failed_logins' ELSE login_block_reason END
      WHERE id = $1 AND login_blocked_at IS NULL
      RETURNING failed_login_count,login_blocked_at
    `, [user.id]);
      if (updated.rows[0]?.login_blocked_at) {
        await client.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [user.id]);
      }
      return updated.rows[0];
    });
    if (failed?.login_blocked_at) {
      throw new AppError(423, 'ACCOUNT_LOGIN_BLOCKED', 'Hesabınız 10 uğursuz giriş cəhdindən sonra bloklanıb. Kilidin açılması üçün administratorla əlaqə saxlayın');
    }
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email və ya şifrə yanlışdır');
  }

  return user;
}

async function vendorAccessFor(userId: string): Promise<VendorAccessRow> {
  const result = await pool.query<VendorAccessRow>(`
    SELECT
      bool_or(r.code IN ('vendor_owner','vendor_staff')) AS has_vendor_role,
      bool_or(r.code NOT IN ('vendor_owner','vendor_staff')) AS has_non_vendor_role,
      bool_or(r.code IN ('vendor_owner','vendor_staff') AND v.status='active' AND v.deleted_at IS NULL) AS has_active_vendor,
      bool_or(r.code IN ('vendor_owner','vendor_staff') AND v.status='pending' AND v.deleted_at IS NULL) AS has_pending_vendor
    FROM user_roles ur
    JOIN roles r ON r.id=ur.role_id
    LEFT JOIN vendors v ON v.id=ur.vendor_id
    WHERE ur.user_id=$1
  `, [userId]);
  return result.rows[0] ?? {
    has_vendor_role: false,
    has_non_vendor_role: false,
    has_active_vendor: false,
    has_pending_vendor: false
  };
}

async function markSuccessfulLogin(userId: string): Promise<void> {
  await pool.query(`
    UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
    WHERE id = $1 AND login_blocked_at IS NULL
  `, [userId]);
}

async function issueActionToken(
  userId: string,
  type: 'password_reset' | 'invite',
  createdBy: string | null = null
): Promise<{ raw: string; expiresAt: Date }> {
  const raw = randomToken(36);
  const expiresAt = new Date(Date.now() + (type === 'invite' ? 72 : 1) * 3_600_000);
  await withTransaction(async (client) => {
    await client.query(
      'UPDATE user_action_tokens SET used_at=now() WHERE user_id=$1 AND token_type=$2 AND used_at IS NULL',
      [userId, type]
    );
    await client.query(`
      INSERT INTO user_action_tokens(user_id,token_hash,token_type,created_by,expires_at)
      VALUES($1,$2,$3,$4,$5)
    `, [userId, tokenDigest(raw), type, createdBy, expiresAt]);
  });
  return { raw, expiresAt };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/action-token/:token', async (request) => {
    const token = z.string().min(32).max(300).parse((request.params as { token: string }).token);
    const result = await pool.query(`
      SELECT t.token_type,u.email::text,u.first_name,u.last_name,t.expires_at
      FROM user_action_tokens t JOIN users u ON u.id=t.user_id
      WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>now() AND u.deleted_at IS NULL
    `, [tokenDigest(token)]);
    if (!result.rows[0]) throw new AppError(404, 'TOKEN_INVALID', 'Keçid etibarsızdır və ya vaxtı bitib');
    return { data: { type: result.rows[0].token_type, email: result.rows[0].email, firstName: result.rows[0].first_name, lastName: result.rows[0].last_name, expiresAt: result.rows[0].expires_at } };
  });

  app.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } }
  }, async (request) => {
    const input = forgotPasswordSchema.parse(request.body);
    const result = await pool.query<{ id: string; first_name: string }>(
      "SELECT id,first_name FROM users WHERE email=$1 AND status='active' AND deleted_at IS NULL",
      [input.email]
    );
    if (result.rows[0]) {
      const token = await issueActionToken(result.rows[0].id, 'password_reset');
      const resetUrl = `${env.PUBLIC_ORIGIN.replace(/\/$/, '')}/sifre-yenile/?token=${encodeURIComponent(token.raw)}`;
      try {
        await sendEmail({
          to: input.email,
          subject: 'TVShop — şifrənizi yeniləyin',
          html: authEmailTemplate('Şifrənizi yeniləyin', `Salam ${result.rows[0].first_name}, aşağıdakı təhlükəsiz keçid 1 saat ərzində etibarlıdır.`, 'Şifrəni yenilə', resetUrl),
          text: `Salam ${result.rows[0].first_name}, şifrənizi yeniləmək üçün bu keçiddən istifadə edin. Keçid 1 saat ərzində etibarlıdır: ${resetUrl}`
        });
      } catch (error) {
        // Keep the public response identical for existing and unknown accounts.
        // Delivery failures remain visible in structured server logs.
        request.log.error({ err: error, userId: result.rows[0].id }, 'Password reset email delivery failed');
      }
    }
    return { data: { accepted: true } };
  });

  app.post('/reset-password', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }
  }, async (request, reply) => {
    const input = resetPasswordSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const userId = await withTransaction(async (client) => {
      const token = await client.query<{ id: string; user_id: string; login_blocked_at: Date | null }>(`
        SELECT t.id,t.user_id,u.login_blocked_at FROM user_action_tokens t
        JOIN users u ON u.id=t.user_id
        WHERE t.token_hash=$1 AND t.token_type='password_reset' AND t.used_at IS NULL AND t.expires_at>now()
          AND u.status='active' AND u.deleted_at IS NULL
        FOR UPDATE OF t,u
      `, [tokenDigest(input.token)]);
      if (!token.rows[0]) throw new AppError(404, 'TOKEN_INVALID', 'Şifrə yeniləmə keçidi etibarsızdır və ya vaxtı bitib');
      if (token.rows[0].login_blocked_at) {
        throw new AppError(423, 'ACCOUNT_LOGIN_BLOCKED', 'Hesabınız bloklanıb. Kilidin açılması üçün administratorla əlaqə saxlayın');
      }
      await client.query("UPDATE users SET password_hash=$2,failed_login_count=0,locked_until=NULL WHERE id=$1 AND status='active'", [token.rows[0].user_id, passwordHash]);
      await client.query('UPDATE user_action_tokens SET used_at=now() WHERE id=$1', [token.rows[0].id]);
      await client.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [token.rows[0].user_id]);
      return token.rows[0].user_id;
    });
    await createSession(app, reply, request, userId);
    return { data: { reset: true } };
  });

  app.post('/accept-invite', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }
  }, async (request, reply) => {
    const input = acceptInviteSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const userId = await withTransaction(async (client) => {
      const token = await client.query<{ id: string; user_id: string }>(`
        SELECT t.id,t.user_id FROM user_action_tokens t JOIN users u ON u.id=t.user_id
        WHERE t.token_hash=$1 AND t.token_type='invite' AND t.used_at IS NULL AND t.expires_at>now()
          AND u.status='invited' AND u.deleted_at IS NULL FOR UPDATE OF t,u
      `, [tokenDigest(input.token)]);
      if (!token.rows[0]) throw new AppError(404, 'TOKEN_INVALID', 'Dəvət keçidi etibarsızdır və ya vaxtı bitib');
      await client.query("UPDATE users SET password_hash=$2,status='active',email_verified_at=coalesce(email_verified_at,now()) WHERE id=$1", [token.rows[0].user_id, passwordHash]);
      await client.query('UPDATE user_action_tokens SET used_at=now() WHERE id=$1', [token.rows[0].id]);
      return token.rows[0].user_id;
    });
    await createSession(app, reply, request, userId);
    return { data: { accepted: true } };
  });

  app.post('/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } }
  }, async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const session = prepareSession(app, '00000000-0000-0000-0000-000000000000');

    let userId: string;
    try {
      userId = await withTransaction(async (client) => {
        const store = await client.query<{ id: string }>(
          `SELECT id FROM stores WHERE code=$1 AND status='active' FOR SHARE`,
          [env.DEFAULT_STORE_CODE]
        );
        if (!store.rows[0]) throw new AppError(503, 'STORE_UNAVAILABLE', 'Qeydiyyat müvəqqəti əlçatan deyil');

        const created = await client.query<{ id: string }>(`
          INSERT INTO users(
            email,phone,password_hash,first_name,last_name,age,gender,marital_status,status
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id
        `, [
          input.email,
          input.phone ?? null,
          passwordHash,
          input.firstName,
          input.lastName,
          input.age,
          input.gender,
          input.maritalStatus
        ]);
        const id = created.rows[0]!.id;
        const assigned = await client.query(`
          INSERT INTO user_roles(user_id,role_id,store_id)
          SELECT $1,id,$2 FROM roles WHERE code='customer'
          RETURNING id
        `, [id, store.rows[0].id]);
        if (!assigned.rows[0]) throw new AppError(503, 'CUSTOMER_ROLE_UNAVAILABLE', 'Qeydiyyat rolu tapılmadı');
        await client.query(`
          INSERT INTO loyalty_accounts(user_id,store_id,balance,lifetime_earned)
          VALUES($1,$2,0,0) ON CONFLICT(user_id,store_id) DO NOTHING
        `, [id, store.rows[0].id]);

        session.userId = id;
        session.accessToken = app.jwt.sign({ sub: id, sessionId: session.id }, { expiresIn: env.ACCESS_TOKEN_TTL });
        await persistSession(client, session, request);
        await client.query(`
          INSERT INTO audit_logs(store_id,action,entity_type,entity_id,after_data,request_id)
          VALUES($1,'user.register','user',$2,$3,$4)
        `, [store.rows[0].id, id, JSON.stringify({
          email: input.email,
          roleCode: 'customer',
          age: input.age,
          gender: input.gender,
          maritalStatus: input.maritalStatus
        }), request.id]);
        return id;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new AppError(409, 'ACCOUNT_EXISTS', 'Bu e-poçt və ya telefonla hesab artıq mövcuddur');
      }
      throw error;
    }

    applySessionCookies(reply, session);
    const actor = await loadActorContext(userId);
    let welcomeEmailSent = false;
    try {
      const delivery = await sendEmail({
        to: input.email,
        subject: 'TVShop hesabınıza xoş gəlmisiniz',
        html: customerWelcomeEmailTemplate(input.firstName, `${env.PUBLIC_ORIGIN.replace(/\/$/, '')}/hesabim/`),
        text: `Salam ${input.firstName}, TVShop hesabınız uğurla yaradıldı. Hesabınıza keçid: ${env.PUBLIC_ORIGIN.replace(/\/$/, '')}/hesabim/`
      });
      welcomeEmailSent = delivery.accepted;
    } catch (error) {
      request.log.error({ err: error, userId }, 'Customer welcome email delivery failed');
    }
    return reply.code(201).send({ data: actor && { ...actor, permissions: [...actor.permissions], welcomeEmailSent } });
  });

  app.post('/vendor-register', {
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } }
  }, async (request, reply) => {
    const input = vendorRegisterSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const session = prepareSession(app, '00000000-0000-0000-0000-000000000000');

    try {
      const result = await withTransaction(async (client) => {
        const store = await client.query<{ id: string }>(`
          SELECT id FROM stores WHERE code=$1 AND status='active' FOR SHARE
        `, [env.DEFAULT_STORE_CODE]);
        if (!store.rows[0]) throw new AppError(503, 'STORE_UNAVAILABLE', 'Satıcı qeydiyyatı müvəqqəti əlçatan deyil');
        const storeId = store.rows[0].id;

        const baseSlug = slugify(input.displayName) || 'satici';
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${storeId}:${baseSlug}`]);
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${storeId}:tax:${input.taxId}`]);
        const duplicateTaxId = await client.query(
          'SELECT id FROM vendors WHERE store_id=$1 AND tax_id=$2 AND deleted_at IS NULL',
          [storeId, input.taxId]
        );
        if (duplicateTaxId.rows[0]) throw new AppError(409, 'VENDOR_EXISTS', 'Bu VÖEN ilə satıcı müraciəti artıq mövcuddur');
        const duplicateSlug = await client.query(
          'SELECT 1 FROM vendors WHERE store_id=$1 AND slug=$2 AND deleted_at IS NULL',
          [storeId, baseSlug]
        );
        const vendorSlug = duplicateSlug.rows[0] ? `${baseSlug}-${randomUUID().slice(0, 8)}` : baseSlug;

        const vendor = await client.query<{ id: string; status: string }>(`
          INSERT INTO vendors(
            store_id,display_name,legal_name,slug,tax_id,email,phone,description,
            commission_rate,status,settings
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,'pending',jsonb_build_object(
            'registrationSource','self_service','submittedAt',now()
          )) RETURNING id,status
        `, [storeId, input.displayName, input.legalName, vendorSlug, input.taxId, input.email, input.phone, input.description]);
        const vendorId = vendor.rows[0]!.id;

        const user = await client.query<{ id: string }>(`
          INSERT INTO users(email,phone,password_hash,first_name,last_name,status)
          VALUES($1,$2,$3,$4,$5,'active') RETURNING id
        `, [input.email, input.phone, passwordHash, input.firstName, input.lastName]);
        const userId = user.rows[0]!.id;

        const assigned = await client.query(`
          INSERT INTO user_roles(user_id,role_id,store_id,vendor_id)
          SELECT $1,id,$2,$3 FROM roles WHERE code='vendor_owner' RETURNING id
        `, [userId, storeId, vendorId]);
        if (!assigned.rows[0]) throw new AppError(503, 'ROLE_UNAVAILABLE', 'Satıcı rolu sistemdə tapılmadı');

        session.userId = userId;
        session.accessToken = app.jwt.sign({ sub: userId, sessionId: session.id }, { expiresIn: env.ACCESS_TOKEN_TTL });
        await persistSession(client, session, request);

        await client.query(`
          INSERT INTO user_notifications(user_id,notification_type,title,message,action_url,metadata)
          SELECT DISTINCT ur.user_id,'vendor.registration','Yeni satıcı qeydiyyatı',
            $2 || ' partnyorluq üçün qeydiyyatdan keçdi. Məlumatları yoxlayaraq statusu təsdiqləyin.',
            '/admin/#vendors',jsonb_build_object('vendorId',$3::text,'source','self_service')
          FROM user_roles ur
          JOIN users u ON u.id=ur.user_id AND u.status='active' AND u.deleted_at IS NULL
          JOIN role_permissions rp ON rp.role_id=ur.role_id
          JOIN permissions p ON p.id=rp.permission_id AND p.code='vendors.approve'
          WHERE ur.store_id IS NULL OR ur.store_id=$1
        `, [storeId, input.displayName, vendorId]);

        await writeAudit(client, {
          storeId,
          vendorId,
          action: 'vendor.self_register',
          entityType: 'vendor',
          entityId: vendorId,
          afterData: {
            displayName: input.displayName,
            legalName: input.legalName,
            taxId: input.taxId,
            email: input.email,
            phone: input.phone,
            ownerUserId: userId,
            status: 'pending',
            registrationSource: 'self_service'
          },
          requestId: request.id,
          ipHash: privacyHash(request.ip, env.COOKIE_SECRET)
        });

        return { userId, vendorId, status: vendor.rows[0]!.status };
      });
      applySessionCookies(reply, session);
      const actor = await loadActorContext(result.userId);
      let welcomeEmailSent = false;
      try {
        const delivery = await sendEmail({
          to: input.email,
          subject: 'TVShop — satıcı kabinetiniz yaradıldı',
          html: vendorWelcomeEmailTemplate(input.firstName, input.displayName, `${env.PUBLIC_ORIGIN.replace(/\/$/, '')}/satici-paneli/`),
          text: `Salam ${input.firstName}, ${input.displayName} üçün satıcı kabinetiniz yaradıldı. Məhsullar administrator təsdiqindən sonra saytda görünəcək. Kabinet: ${env.PUBLIC_ORIGIN.replace(/\/$/, '')}/satici-paneli/`
        });
        welcomeEmailSent = delivery.accepted;
      } catch (error) {
        request.log.error({ err: error, userId: result.userId, vendorId: result.vendorId }, 'Vendor welcome email delivery failed');
      }
      return reply.code(201).send({
        data: {
          registered: true,
          vendorId: result.vendorId,
          status: result.status,
          welcomeEmailSent,
          ...(actor ? { ...actor, permissions: [...actor.permissions] } : {})
        }
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new AppError(409, 'ACCOUNT_EXISTS', 'Bu e-poçt və ya telefonla hesab artıq mövcuddur');
      }
      throw error;
    }
  });

  app.post('/login', {
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } }
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await verifyLoginCredentials(input);
    const vendorAccess = await vendorAccessFor(user.id);
    if (vendorAccess.has_vendor_role && !vendorAccess.has_active_vendor && !vendorAccess.has_pending_vendor && !vendorAccess.has_non_vendor_role) {
      throw new AppError(403, 'VENDOR_INACTIVE', 'Satıcı hesabınız aktiv deyil');
    }
    await markSuccessfulLogin(user.id);
    await createSession(app, reply, request, user.id);
    const actor = await loadActorContext(user.id);
    return reply.send({ data: actor && { ...actor, permissions: [...actor.permissions] } });
  });

  app.post('/vendor-login', {
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } }
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await verifyLoginCredentials(input);
    const vendorAccess = await vendorAccessFor(user.id);
    if (!vendorAccess.has_vendor_role) {
      throw new AppError(403, 'VENDOR_ACCOUNT_REQUIRED', 'Bu məlumatlarla satıcı hesabı tapılmadı');
    }
    if (!vendorAccess.has_active_vendor && !vendorAccess.has_pending_vendor) {
      throw new AppError(403, 'VENDOR_INACTIVE', 'Satıcı hesabınız aktiv deyil');
    }
    await markSuccessfulLogin(user.id);
    await createSession(app, reply, request, user.id);
    const actor = await loadActorContext(user.id);
    return reply.send({ data: actor && { ...actor, permissions: [...actor.permissions] } });
  });

  app.post('/refresh', async (request, reply) => {
    const rawToken = request.cookies[cookieNames.refresh];
    if (!rawToken) throw new AppError(401, 'SESSION_REQUIRED', 'Sessiya tapılmadı');

    const outcome = await withTransaction(async (client) => {
      const result = await client.query<{
        id: string; user_id: string; family_id: string; expires_at: Date;
        rotated_at: Date | null; revoked_at: Date | null;
      }>(`
        SELECT rs.id,rs.user_id,rs.family_id,rs.expires_at,rs.rotated_at,rs.revoked_at
        FROM refresh_sessions rs JOIN users u ON u.id=rs.user_id
        WHERE rs.token_hash=$1 AND u.status='active' AND u.login_blocked_at IS NULL AND u.deleted_at IS NULL
        FOR UPDATE OF rs
      `, [tokenDigest(rawToken)]);
      const current = result.rows[0];
      if (!current) return { kind: 'invalid' as const };
      if (current.rotated_at || current.revoked_at || current.expires_at <= new Date()) {
        await client.query(
          'UPDATE refresh_sessions SET revoked_at=now() WHERE family_id=$1 AND revoked_at IS NULL',
          [current.family_id]
        );
        return { kind: 'reuse' as const };
      }

      const next = prepareSession(app, current.user_id, current.family_id);
      await client.query('UPDATE refresh_sessions SET rotated_at=now() WHERE id=$1', [current.id]);
      await persistSession(client, next, request);
      return { kind: 'ok' as const, session: next };
    });

    if (outcome.kind !== 'ok') {
      clearAuthCookies(reply);
      throw new AppError(
        401,
        outcome.kind === 'reuse' ? 'SESSION_REUSE_DETECTED' : 'SESSION_INVALID',
        outcome.kind === 'reuse' ? 'Sessiya təhlükəsizlik səbəbi ilə dayandırıldı' : 'Sessiya etibarsızdır'
      );
    }
    applySessionCookies(reply, outcome.session);
    return reply.send({ data: { refreshed: true } });
  });

  app.post('/logout', async (request, reply) => {
    const rawToken = request.cookies[cookieNames.refresh];
    if (rawToken) {
      await pool.query('UPDATE refresh_sessions SET revoked_at = now() WHERE token_hash = $1', [tokenDigest(rawToken)]);
    }
    clearAuthCookies(reply);
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: app.authenticate }, async (request) => ({
    data: request.actor && { ...request.actor, permissions: [...request.actor.permissions] }
  }));
}
