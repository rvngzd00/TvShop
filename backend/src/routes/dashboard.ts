import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { actorOf } from '../core/scope.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.requirePermission('dashboard.read') }, async (request) => {
    const actor = actorOf(request);
    const vendorFilter = actor.isSuperAdmin
      ? { sql: '', params: [] as unknown[] }
      : actor.vendorIds.length
        ? { sql: 'AND vo.vendor_id = ANY($1::uuid[])', params: [actor.vendorIds] }
        : { sql: 'AND o.store_id = ANY($1::uuid[])', params: [actor.storeIds] };
    const productFilter = actor.isSuperAdmin
      ? { sql: '', params: [] as unknown[] }
      : actor.vendorIds.length
        ? { sql: 'AND p.vendor_id = ANY($1::uuid[])', params: [actor.vendorIds] }
        : { sql: 'AND v.store_id = ANY($1::uuid[])', params: [actor.storeIds] };
    const qrFilter = actor.isSuperAdmin
      ? { sql: '', params: [] as unknown[] }
      : actor.vendorIds.length
        ? { sql: 'AND vendor_id = ANY($1::uuid[])', params: [actor.vendorIds] }
        : { sql: 'AND store_id = ANY($1::uuid[])', params: [actor.storeIds] };

    const [orders, products, vendors, qr] = await Promise.all([
      pool.query(`
        SELECT count(DISTINCT o.id)::int AS total_orders,
          coalesce(sum(oi.line_total), 0)::numeric AS gross_sales,
          count(DISTINCT o.id) FILTER (WHERE o.status IN ('pending','confirmed','processing'))::int AS open_orders
        FROM orders o
        LEFT JOIN vendor_orders vo ON vo.order_id = o.id
        LEFT JOIN order_items oi ON oi.vendor_order_id = vo.id
        WHERE o.placed_at >= date_trunc('month', now()) ${vendorFilter.sql}
      `, vendorFilter.params),
      pool.query(`
        SELECT count(*) FILTER (WHERE p.status = 'published')::int AS published,
          count(*) FILTER (WHERE p.status IN ('draft','review'))::int AS pending
        FROM products p JOIN vendors v ON v.id=p.vendor_id
        WHERE p.deleted_at IS NULL
        ${productFilter.sql}
      `, productFilter.params),
      actor.permissions.has('vendors.read')
        ? pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'pending')::int AS pending
            FROM vendors WHERE deleted_at IS NULL ${actor.isSuperAdmin ? '' : 'AND store_id=ANY($1::uuid[])'}`,
            actor.isSuperAdmin ? [] : [actor.storeIds])
        : Promise.resolve({ rows: [{ total: 0, pending: 0 }] }),
      pool.query(`
        SELECT count(*)::int AS codes, coalesce(sum(scan_count), 0)::bigint AS scans
        FROM qr_codes
        WHERE status = 'active'
        ${qrFilter.sql}
      `, qrFilter.params)
    ]);

    return {
      data: {
        orders: orders.rows[0],
        products: products.rows[0],
        vendors: vendors.rows[0],
        qr: qr.rows[0]
      }
    };
  });
}
