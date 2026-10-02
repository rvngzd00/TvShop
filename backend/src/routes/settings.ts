import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { actorOf, assertStoreScope } from '../core/scope.js';
import { badRequest, notFound } from '../core/errors.js';
import { writeAudit } from '../core/audit.js';
import { env } from '../config/env.js';

const settingsUpdate = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  locale: z.string().trim().regex(/^[a-z]{2}-[A-Z]{2}$/).optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  timezone: z.string().trim().min(3).max(100).optional(),
  settings: z.record(z.string(), z.unknown()).optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: 'Dəyişdiriləcək parametr göndərin'
});

async function defaultStoreId(actor: ReturnType<typeof actorOf>): Promise<string> {
  if (actor.storeIds[0]) return actor.storeIds[0];
  if (!actor.isSuperAdmin) throw notFound('Store');
  const store = await pool.query<{ id: string }>('SELECT id FROM stores WHERE code=$1', [env.DEFAULT_STORE_CODE]);
  if (!store.rows[0]) throw notFound('Store');
  return store.rows[0].id;
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.requirePermission('settings.read') }, async (request) => {
    const actor = actorOf(request);
    const query = z.object({ storeId: z.uuid().optional() }).parse(request.query);
    const storeId = query.storeId ?? await defaultStoreId(actor);
    assertStoreScope(actor, storeId);
    const result = await pool.query(`
      SELECT id,code,name,primary_domain,locale,currency,timezone,status,settings,created_at,updated_at
      FROM stores WHERE id=$1
    `, [storeId]);
    if (!result.rows[0]) throw notFound('Store');
    return { data: result.rows[0] };
  });

  app.patch('/:storeId', { preHandler: app.requirePermission('settings.manage') }, async (request) => {
    const storeId = z.uuid().parse((request.params as { storeId: string }).storeId);
    const input = settingsUpdate.parse(request.body);
    const actor = actorOf(request);
    assertStoreScope(actor, storeId);

    const current = await pool.query('SELECT * FROM stores WHERE id=$1', [storeId]);
    if (!current.rows[0]) throw notFound('Store');
    if (input.timezone) {
      const validTimezone = await pool.query('SELECT 1 FROM pg_timezone_names WHERE name=$1', [input.timezone]);
      if (!validTimezone.rows[0]) throw badRequest('TIMEZONE_INVALID', 'Saat qurşağı düzgün deyil');
    }

    const data = await withTransaction(async (client) => {
      const result = await client.query(`
        UPDATE stores SET name=coalesce($2,name),locale=coalesce($3,locale),
          currency=coalesce($4,currency),timezone=coalesce($5,timezone),
          settings=coalesce($6,settings)
        WHERE id=$1
        RETURNING id,code,name,primary_domain,locale,currency,timezone,status,settings,created_at,updated_at
      `, [storeId, input.name ?? null, input.locale ?? null, input.currency ?? null,
        input.timezone ?? null, input.settings ? JSON.stringify(input.settings) : null]);
      await writeAudit(client, {
        actorUserId: actor.userId,
        storeId,
        action: 'settings.update',
        entityType: 'store',
        entityId: storeId,
        beforeData: current.rows[0],
        afterData: result.rows[0],
        requestId: request.id
      });
      return result.rows[0];
    });
    return { data };
  });
}
