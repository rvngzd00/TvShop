import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { pool } from '../db/pool.js';
import { AppError, forbidden } from '../core/errors.js';
import type { ActorContext } from '../types/fastify.js';

interface ContextRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: string[] | null;
  permissions: string[] | null;
  store_ids: string[] | null;
  vendor_ids: string[] | null;
}

export async function loadActorContext(userId: string): Promise<ActorContext | null> {
  const result = await pool.query<ContextRow>(`
    SELECT u.id, u.email, u.first_name, u.last_name,
      array_remove(array_agg(DISTINCT r.code), NULL) AS roles,
      array_remove(array_agg(DISTINCT p.code), NULL) AS permissions,
      array_remove(array_agg(DISTINCT CASE WHEN r.id IS NOT NULL THEN ur.store_id::text END), NULL) AS store_ids,
      array_remove(array_agg(DISTINCT CASE WHEN r.id IS NOT NULL THEN ur.vendor_id::text END), NULL) AS vendor_ids
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN vendors v ON v.id=ur.vendor_id
    LEFT JOIN roles r ON r.id = ur.role_id
      AND (ur.vendor_id IS NULL OR (v.status IN ('pending','active') AND v.deleted_at IS NULL))
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE u.id = $1 AND u.status = 'active' AND u.login_blocked_at IS NULL AND u.deleted_at IS NULL
    GROUP BY u.id
  `, [userId]);

  const row = result.rows[0];
  if (!row) return null;
  const roles = row.roles ?? [];
  return {
    userId: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    roles,
    permissions: new Set(row.permissions ?? []),
    storeIds: row.store_ids ?? [],
    vendorIds: row.vendor_ids ?? [],
    isSuperAdmin: roles.includes('super_admin')
  };
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('actor', null);

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    await request.jwtVerify({ onlyCookie: true });
    const session = await pool.query(`
      SELECT 1 FROM refresh_sessions
      WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL
        AND rotated_at IS NULL AND expires_at>now()
    `, [request.user.sessionId, request.user.sub]);
    if (!session.rows[0]) throw new AppError(401, 'SESSION_INVALID', 'Sessiya etibarsızdır və ya bitib');
    const actor = await loadActorContext(request.user.sub);
    if (!actor) throw new AppError(401, 'SESSION_USER_INACTIVE', 'Sessiya istifadəçisi aktiv deyil');
    request.actor = actor;
  });

  app.decorate('requirePermission', (permission: string) => async (request: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(request, reply);
    if (!request.actor?.permissions.has(permission)) throw forbidden();
  });
}

export const authContextPlugin = fp(authPlugin, { name: 'auth-context', dependencies: ['@fastify/jwt'] });
