import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { actorOf } from '../core/scope.js';
import { notFound } from '../core/errors.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.requirePermission('dashboard.read') }, async (request) => {
    const actor=actorOf(request);
    const result=await pool.query(`SELECT id,notification_type AS type,title,message,action_url AS "actionUrl",read_at AS "readAt",created_at AS "createdAt" FROM user_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[actor.userId]);
    return {data:result.rows,meta:{unread:result.rows.filter((row)=>!row.readAt).length}};
  });
  app.patch('/:id/read', { preHandler: app.requirePermission('dashboard.read') }, async (request) => {
    const actor=actorOf(request);const id=z.uuid().parse((request.params as {id:string}).id);
    const result=await pool.query('UPDATE user_notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id,read_at',[id,actor.userId]);if(!result.rows[0])throw notFound('Bildiriş');return{data:result.rows[0]};
  });
  app.post('/read-all', { preHandler: app.requirePermission('dashboard.read') }, async (request) => {
    const actor=actorOf(request);const result=await pool.query('UPDATE user_notifications SET read_at=coalesce(read_at,now()) WHERE user_id=$1 AND read_at IS NULL',[actor.userId]);return{data:{updated:result.rowCount??0}};
  });
}
