import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { writeAudit } from '../core/audit.js';
import { badRequest, notFound } from '../core/errors.js';
import { normalizeTvMedia, tvProviderSchema } from '../core/media-provider.js';
import { actorOf, assertStoreScope } from '../core/scope.js';
import { pool, withTransaction } from '../db/pool.js';

const channelIdSchema = z.string().trim().regex(/^UC[A-Za-z0-9_-]{20,}$/, 'YouTube kanal ID-si UC ilə başlamalıdır').nullable();
const itemInput = z.object({
  storeId: z.uuid(), provider: tvProviderSchema, sourceUrl: z.string().trim().min(1).max(2_000),
  title: z.string().trim().max(160).default(''), position: z.number().int().min(0).max(100_000).default(0),
  isActive: z.boolean().default(true)
});
const itemUpdate = itemInput.omit({ storeId: true }).partial();

type LiveState = { status: 'live' | 'offline' | 'unavailable'; videoId: string | null; embedUrl: string | null; checkedAt: string };
const liveCache = new Map<string, { expiresAt: number; value: LiveState }>();

async function youtubeLiveState(channelId: string | null): Promise<LiveState> {
  const checkedAt = new Date().toISOString();
  if (!channelId || !env.YOUTUBE_API_KEY) return { status: 'unavailable', videoId: null, embedUrl: null, checkedAt };
  const key = `${channelId}:${env.YOUTUBE_API_KEY.slice(-6)}`;
  const cached = liveCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const query = new URLSearchParams({
      part: 'id', channelId, eventType: 'live', type: 'video', maxResults: '1', key: env.YOUTUBE_API_KEY
    });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${query}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`YouTube API ${response.status}`);
    const body = await response.json() as { items?: Array<{ id?: { videoId?: string } }> };
    const videoId = body.items?.[0]?.id?.videoId || null;
    const value: LiveState = videoId
      ? { status: 'live', videoId, embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1`, checkedAt }
      : { status: 'offline', videoId: null, embedUrl: null, checkedAt };
    liveCache.set(key, { expiresAt: Date.now() + env.YOUTUBE_LIVE_CACHE_SECONDS * 1_000, value });
    return value;
  } catch {
    const value: LiveState = { status: 'unavailable', videoId: null, embedUrl: null, checkedAt };
    liveCache.set(key, { expiresAt: Date.now() + Math.min(60, env.YOUTUBE_LIVE_CACHE_SECONDS) * 1_000, value });
    return value;
  }
}

async function scopedStoreId(request: Parameters<typeof actorOf>[0], requested?: string): Promise<string> {
  const actor = actorOf(request);
  const storeId = z.uuid().parse(requested || actor.storeIds[0]);
  assertStoreScope(actor, storeId);
  return storeId;
}

export async function tvRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.requirePermission('tv.read') }, async (request) => {
    const storeId = await scopedStoreId(request, (request.query as { storeId?: string }).storeId);
    const [settings, items] = await Promise.all([
      pool.query('SELECT store_id,youtube_channel_id,updated_at FROM tv_channel_settings WHERE store_id=$1', [storeId]),
      pool.query('SELECT * FROM tv_media_items WHERE store_id=$1 ORDER BY provider,position,created_at', [storeId])
    ]);
    return { data: { settings: settings.rows[0] || { store_id: storeId, youtube_channel_id: null }, items: items.rows } };
  });

  app.put('/settings', { preHandler: app.requirePermission('tv.manage') }, async (request) => {
    const input = z.object({ storeId: z.uuid(), youtubeChannelId: channelIdSchema }).parse(request.body);
    const actor = actorOf(request);
    assertStoreScope(actor, input.storeId);
    const data = await withTransaction(async (client) => {
      const result = await client.query(`
        INSERT INTO tv_channel_settings(store_id,youtube_channel_id,updated_by)
        VALUES($1,$2,$3)
        ON CONFLICT(store_id) DO UPDATE SET youtube_channel_id=excluded.youtube_channel_id,updated_by=excluded.updated_by,updated_at=now()
        RETURNING *
      `, [input.storeId, input.youtubeChannelId, actor.userId]);
      await writeAudit(client, { actorUserId: actor.userId, storeId: input.storeId, action: 'tv.settings.update', entityType: 'tv_channel_settings', entityId: input.storeId, afterData: { youtubeChannelId: input.youtubeChannelId }, requestId: request.id });
      return result.rows[0];
    });
    liveCache.clear();
    return { data };
  });

  app.post('/items', { preHandler: app.requirePermission('tv.manage') }, async (request, reply) => {
    const input = itemInput.parse(request.body);
    const actor = actorOf(request);
    assertStoreScope(actor, input.storeId);
    let normalized;
    try { normalized = normalizeTvMedia(input.provider, input.sourceUrl); }
    catch (error) { throw badRequest('MEDIA_URL_INVALID', error instanceof Error ? error.message : 'Media URL etibarlı deyil'); }
    const data = await withTransaction(async (client) => {
      const result = await client.query(`
        INSERT INTO tv_media_items(store_id,provider,source_url,provider_id,media_kind,title,position,is_active,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *
      `, [input.storeId, normalized.provider, normalized.sourceUrl, normalized.providerId, normalized.mediaKind, input.title, input.position, input.isActive, actor.userId]);
      await writeAudit(client, { actorUserId: actor.userId, storeId: input.storeId, action: 'tv.media.create', entityType: 'tv_media_item', entityId: result.rows[0].id, afterData: result.rows[0], requestId: request.id });
      return result.rows[0];
    });
    return reply.code(201).send({ data });
  });

  app.patch('/items/:id', { preHandler: app.requirePermission('tv.manage') }, async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const raw = (request.body || {}) as Record<string, unknown>;
    const input = itemUpdate.parse(raw);
    const actor = actorOf(request);
    const current = await pool.query('SELECT * FROM tv_media_items WHERE id=$1', [id]);
    if (!current.rows[0]) throw notFound('TV media');
    assertStoreScope(actor, current.rows[0].store_id);
    const provider = input.provider || current.rows[0].provider;
    const sourceUrl = input.sourceUrl || current.rows[0].source_url;
    let normalized;
    try { normalized = normalizeTvMedia(provider, sourceUrl); }
    catch (error) { throw badRequest('MEDIA_URL_INVALID', error instanceof Error ? error.message : 'Media URL etibarlı deyil'); }
    const data = await withTransaction(async (client) => {
      const result = await client.query(`UPDATE tv_media_items SET provider=$2,source_url=$3,provider_id=$4,media_kind=$5,title=CASE WHEN $6 THEN $7 ELSE title END,position=CASE WHEN $8 THEN $9 ELSE position END,is_active=CASE WHEN $10 THEN $11 ELSE is_active END,updated_by=$12,updated_at=now() WHERE id=$1 RETURNING *`, [id, normalized.provider, normalized.sourceUrl, normalized.providerId, normalized.mediaKind, Object.hasOwn(raw, 'title'), input.title || '', Object.hasOwn(raw, 'position'), input.position || 0, Object.hasOwn(raw, 'isActive'), input.isActive ?? true, actor.userId]);
      await writeAudit(client, { actorUserId: actor.userId, storeId: current.rows[0].store_id, action: 'tv.media.update', entityType: 'tv_media_item', entityId: id, beforeData: current.rows[0], afterData: result.rows[0], requestId: request.id });
      return result.rows[0];
    });
    return { data };
  });

  app.delete('/items/:id', { preHandler: app.requirePermission('tv.manage') }, async (request, reply) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const actor = actorOf(request);
    const current = await pool.query('SELECT * FROM tv_media_items WHERE id=$1', [id]);
    if (!current.rows[0]) throw notFound('TV media');
    assertStoreScope(actor, current.rows[0].store_id);
    await withTransaction(async (client) => {
      await client.query('DELETE FROM tv_media_items WHERE id=$1', [id]);
      await writeAudit(client, { actorUserId: actor.userId, storeId: current.rows[0].store_id, action: 'tv.media.delete', entityType: 'tv_media_item', entityId: id, beforeData: current.rows[0], requestId: request.id });
    });
    return reply.code(204).send();
  });
}

export async function publicTvRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tv', async (_request, reply) => {
    const store = await pool.query('SELECT id FROM stores WHERE code=$1 AND status=\'active\'', [env.DEFAULT_STORE_CODE]);
    if (!store.rows[0]) throw notFound('Mağaza');
    const storeId = store.rows[0].id;
    const [settings, items] = await Promise.all([
      pool.query('SELECT youtube_channel_id FROM tv_channel_settings WHERE store_id=$1', [storeId]),
      pool.query('SELECT id,provider,source_url,provider_id,media_kind,title,position FROM tv_media_items WHERE store_id=$1 AND is_active=true ORDER BY provider,position,created_at', [storeId])
    ]);
    const live = await youtubeLiveState(settings.rows[0]?.youtube_channel_id || null);
    const normalizedItems = items.rows.flatMap((item) => {
      try { return [{ ...item, embed_url: normalizeTvMedia(item.provider, item.source_url).embedUrl }]; }
      catch { return []; }
    });
    reply.header('Cache-Control', `public, max-age=30, stale-while-revalidate=${env.YOUTUBE_LIVE_CACHE_SECONDS}`);
    return { data: { live, items: normalizedItems } };
  });
}
