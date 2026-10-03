import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', service: 'tvshop-api' }));
  app.get('/ready', async (_request, reply) => {
    try {
      const result = await pool.query<{ code: string }>(
        "SELECT code FROM stores WHERE code=$1 AND status='active'",
        [env.DEFAULT_STORE_CODE]
      );
      if (!result.rows[0]) return reply.code(503).send({ status: 'not_ready', reason: 'store_missing' });
      return { status: 'ready', store: result.rows[0].code };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });
}
