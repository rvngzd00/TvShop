import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { actorOf, assertStoreScope, assertVendorScope } from '../core/scope.js';
import { badRequest, notFound } from '../core/errors.js';
import { paginationMeta, paginationSchema } from '../core/pagination.js';
import { writeAudit } from '../core/audit.js';

const rewardBase = z.object({
  storeId: z.uuid(), vendorId: z.uuid().nullable().optional(), name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).default(''), pointsCost: z.number().int().positive(),
  stock: z.number().int().min(0).nullable().optional(), imageAssetId: z.uuid().nullable().optional(),
  startsAt: z.iso.datetime().nullable().optional(), expiresAt: z.iso.datetime().nullable().optional(),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).default('active')
});
const validRewardDates = (value: Record<string, unknown>) => {
  const startsAt = typeof value['startsAt'] === 'string' ? value['startsAt'] : '';
  const expiresAt = typeof value['expiresAt'] === 'string' ? value['expiresAt'] : '';
  return !startsAt || !expiresAt || new Date(expiresAt) > new Date(startsAt);
};
const rewardInput = rewardBase.refine(validRewardDates, {
  path: ['expiresAt'], message: 'Bitmə vaxtı başlama vaxtından sonra olmalıdır'
});
const rewardUpdate = rewardBase.omit({ storeId: true }).partial().refine(validRewardDates, {
  path: ['expiresAt'], message: 'Bitmə vaxtı başlama vaxtından sonra olmalıdır'
});

async function scopedReward(id: string, actor: ReturnType<typeof actorOf>) {
  const result = await pool.query('SELECT * FROM rewards WHERE id=$1', [id]);
  const row = result.rows[0];
  if (!row) throw notFound('Hədiyyə');
  assertStoreScope(actor, row.store_id);
  if (actor.vendorIds.length) {
    if (!row.vendor_id) throw notFound('Hədiyyə');
    assertVendorScope(actor, row.vendor_id);
  }
  return row;
}

export async function loyaltyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/rewards', { preHandler: app.requirePermission('loyalty.read') }, async (request) => {
    const query = paginationSchema.extend({ storeId: z.uuid().optional() }).parse(request.query);
    const actor = actorOf(request); const params: unknown[] = []; const where = ['1=1'];
    if (actor.vendorIds.length) { params.push(actor.vendorIds); where.push(`r.vendor_id=ANY($${params.length}::uuid[])`); }
    else if (!actor.isSuperAdmin) { params.push(actor.storeIds); where.push(`r.store_id=ANY($${params.length}::uuid[])`); }
    if (query.storeId) { assertStoreScope(actor, query.storeId); params.push(query.storeId); where.push(`r.store_id=$${params.length}`); }
    if (query.search) { params.push(`%${query.search}%`); where.push(`r.name ILIKE $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`r.status::text=$${params.length}`); }
    params.push(query.limit, (query.page - 1) * query.limit);
    const result = await pool.query(`SELECT r.*,ma.public_url AS image_url,v.display_name AS vendor_name,count(rr.id)::int AS redemption_count,count(*) OVER()::int AS total_count FROM rewards r LEFT JOIN media_assets ma ON ma.id=r.image_asset_id LEFT JOIN vendors v ON v.id=r.vendor_id LEFT JOIN reward_redemptions rr ON rr.reward_id=r.id WHERE ${where.join(' AND ')} GROUP BY r.id,ma.public_url,v.display_name ORDER BY r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const total = Number(result.rows[0]?.total_count ?? 0);
    return { data: result.rows.map(({ total_count: _, ...row }) => row), meta: paginationMeta(query.page, query.limit, total) };
  });

  app.post('/rewards', { preHandler: app.requirePermission('loyalty.manage') }, async (request, reply) => {
    const input = rewardInput.parse(request.body); const actor = actorOf(request); assertStoreScope(actor, input.storeId);
    if (input.vendorId && actor.vendorIds.length) assertVendorScope(actor, input.vendorId);
    if (actor.vendorIds.length && !input.vendorId) throw badRequest('VENDOR_REQUIRED', 'Satıcı hədiyyəsi üçün satıcı seçilməlidir');
    const result = await pool.query(`INSERT INTO rewards(store_id,vendor_id,name,description,points_cost,stock,status,starts_at,expires_at,image_asset_id) VALUES($1,$2,$3,$4,$5,$6,$7::record_status,$8,$9,$10) RETURNING *`, [input.storeId,input.vendorId??null,input.name,input.description,input.pointsCost,input.stock??null,input.status,input.startsAt??null,input.expiresAt??null,input.imageAssetId??null]);
    return reply.code(201).send({ data: result.rows[0] });
  });

  app.patch('/rewards/:id', { preHandler: app.requirePermission('loyalty.manage') }, async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id); const input = rewardUpdate.parse(request.body); const actor = actorOf(request); const current = await scopedReward(id, actor);
    const data = await withTransaction(async (client) => {
      const result = await client.query(`UPDATE rewards SET vendor_id=coalesce($2,vendor_id),name=coalesce($3,name),description=coalesce($4,description),points_cost=coalesce($5,points_cost),stock=coalesce($6,stock),status=coalesce($7::record_status,status),starts_at=coalesce($8,starts_at),expires_at=coalesce($9,expires_at),image_asset_id=coalesce($10,image_asset_id) WHERE id=$1 RETURNING *`, [id,input.vendorId??null,input.name??null,input.description??null,input.pointsCost??null,input.stock??null,input.status??null,input.startsAt??null,input.expiresAt??null,input.imageAssetId??null]);
      await writeAudit(client, { actorUserId: actor.userId, storeId: current.store_id, vendorId: current.vendor_id, action: 'reward.update', entityType: 'reward', entityId: id, beforeData: current, afterData: result.rows[0], requestId: request.id });
      return result.rows[0];
    });
    return { data };
  });

  app.get('/redemptions', { preHandler: app.requirePermission('loyalty.read') }, async (request) => {
    const actor = actorOf(request); const params: unknown[] = []; const where = ['1=1'];
    if (!actor.isSuperAdmin) { params.push(actor.storeIds); where.push(`r.store_id=ANY($${params.length}::uuid[])`); }
    if (actor.vendorIds.length) { params.push(actor.vendorIds); where.push(`r.vendor_id=ANY($${params.length}::uuid[])`); }
    const result = await pool.query(`SELECT rr.*,r.name AS reward_name,concat(u.first_name,' ',u.last_name) AS customer_name,u.email FROM reward_redemptions rr JOIN rewards r ON r.id=rr.reward_id JOIN users u ON u.id=rr.user_id WHERE ${where.join(' AND ')} ORDER BY rr.created_at DESC LIMIT 100`, params);
    return { data: result.rows };
  });

  app.patch('/redemptions/:id/status', { preHandler: app.requirePermission('loyalty.manage') }, async (request) => {
    const id=z.uuid().parse((request.params as {id:string}).id); const input=z.object({status:z.enum(['approved','fulfilled','cancelled']),note:z.string().trim().max(500).default('')}).parse(request.body); const actor=actorOf(request);
    const current=await pool.query(`SELECT rr.*,r.store_id,r.vendor_id,r.name AS reward_name FROM reward_redemptions rr JOIN rewards r ON r.id=rr.reward_id WHERE rr.id=$1`,[id]); const row=current.rows[0]; if(!row)throw notFound('Hədiyyə sifarişi'); assertStoreScope(actor,row.store_id); if(actor.vendorIds.length){if(!row.vendor_id)throw notFound('Hədiyyə sifarişi');assertVendorScope(actor,row.vendor_id);}
    const result=await pool.query(`UPDATE reward_redemptions SET status=$2,fulfillment_data=fulfillment_data||$3::jsonb WHERE id=$1 RETURNING *`,[id,input.status,JSON.stringify({note:input.note,updatedBy:actor.userId})]);
    await pool.query(`INSERT INTO user_notifications(user_id,notification_type,title,message,action_url,metadata) VALUES($1,'reward','Hədiyyə statusu yeniləndi',$2,'/hesabim/baki-club/',$3)`,[row.user_id,`${row.reward_name}: ${input.status}`,JSON.stringify({redemptionId:id,status:input.status})]);
    return {data:result.rows[0]};
  });
}
