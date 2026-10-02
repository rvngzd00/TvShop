import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { pool, withTransaction } from '../db/pool.js';
import { actorOf, assertStoreScope } from '../core/scope.js';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { writeAudit } from '../core/audit.js';
import {
  editorDefaults, editorSchemas, editorScopes, normalizedEditorConfig,
  type EditorScope, type SiteEditorConfig
} from '../core/site-editor-config.js';

const scopeSchema = z.enum(editorScopes);

async function defaultStoreId(): Promise<string> {
  const result = await pool.query<{ id: string }>('SELECT id FROM stores WHERE code=$1 AND status=$2', [env.DEFAULT_STORE_CODE, 'active']);
  if (!result.rows[0]) throw notFound('Store');
  return result.rows[0].id;
}

async function selectedStoreId(request: Parameters<typeof actorOf>[0], requested?: string): Promise<string> {
  const actor = actorOf(request);
  const storeId = requested ?? actor.storeIds[0] ?? await defaultStoreId();
  assertStoreScope(actor, storeId);
  return storeId;
}

async function ensureDocuments(storeId: string): Promise<void> {
  await pool.query(`
    INSERT INTO site_editor_documents(store_id,scope)
    SELECT $1, scope FROM unnest($2::text[]) AS scope
    ON CONFLICT(store_id,scope) DO NOTHING
  `, [storeId, editorScopes]);
}

type EditorRow = {
  id: string; scope: EditorScope; draft_content: unknown; published_content: unknown;
  draft_version: number; published_version: number; updated_at: string; published_at: string | null;
};

async function documents(storeId: string): Promise<EditorRow[]> {
  await ensureDocuments(storeId);
  const result = await pool.query<EditorRow>(`
    SELECT id,scope,draft_content,published_content,draft_version,published_version,updated_at,published_at
    FROM site_editor_documents WHERE store_id=$1 ORDER BY scope
  `, [storeId]);
  return result.rows;
}

function assetIds(value: unknown, found = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item) => assetIds(item, found));
    return found;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (key.endsWith('AssetId') && typeof item === 'string') found.add(item);
    else assetIds(item, found);
  });
  return found;
}

async function mediaMap(storeId: string, configs: unknown[]): Promise<Record<string, { id: string; url: string; alt: string; title: string }>> {
  const ids = [...new Set(configs.flatMap((config) => [...assetIds(config)]))];
  if (!ids.length) return {};
  const result = await pool.query<{ id: string; public_url: string; alt_text: string; title: string }>(`
    SELECT id,public_url,alt_text,title FROM media_assets WHERE store_id=$1 AND id=ANY($2::uuid[])
  `, [storeId, ids]);
  return Object.fromEntries(result.rows.map((row) => [row.id, { id: row.id, url: row.public_url, alt: row.alt_text, title: row.title }]));
}

function publicPayload(rows: EditorRow[], previewScope?: EditorScope) {
  return Object.fromEntries(editorScopes.map((scope) => {
    const row = rows.find((candidate) => candidate.scope === scope);
    if (previewScope === scope) return [scope, normalizedEditorConfig(scope, row?.draft_content)];
    if (!row?.published_version) return [scope, null];
    return [scope, normalizedEditorConfig(scope, row.published_content)];
  })) as { nav: typeof editorDefaults.nav | null; index: typeof editorDefaults.index | null; footer: typeof editorDefaults.footer | null };
}

async function assertReferences(storeId: string, scope: EditorScope, content: SiteEditorConfig): Promise<void> {
  const references: Array<{ kind: string; ids: string[]; sql: string }> = [];
  const media = [...assetIds(content)];
  if (media.length) references.push({ kind: 'media', ids: media, sql: 'SELECT id FROM media_assets WHERE store_id=$1 AND id=ANY($2::uuid[])' });
  if (scope === 'index') {
    const value = content as typeof editorDefaults.index;
    const products = [...new Set([...value.featured.productIds, ...value.popular.productIds, ...value.topPicks.productIds])];
    const categories = [...new Set([...value.categories.categoryIds, ...value.topPicks.categoryIds])];
    if (products.length) references.push({ kind: 'məhsul', ids: products, sql: "SELECT DISTINCT p.id FROM products p JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL JOIN product_listings pl ON pl.product_id=p.id WHERE pl.store_id=$1 AND pl.status='published' AND p.id=ANY($2::uuid[]) AND p.deleted_at IS NULL" });
    if (categories.length) references.push({ kind: 'kateqoriya', ids: categories, sql: "SELECT id FROM categories WHERE store_id=$1 AND status='active' AND id=ANY($2::uuid[])" });
    if (value.news.postIds.length) references.push({ kind: 'xəbər', ids: value.news.postIds, sql: "SELECT id FROM posts WHERE store_id=$1 AND status='published' AND id=ANY($2::uuid[]) AND deleted_at IS NULL" });
    if (value.brands.brandIds.length) references.push({ kind: 'brend', ids: value.brands.brandIds, sql: "SELECT id FROM brands WHERE store_id=$1 AND status='active' AND id=ANY($2::uuid[])" });
  }
  for (const reference of references) {
    const result = await pool.query<{ id: string }>(reference.sql, [storeId, reference.ids]);
    const valid = new Set(result.rows.map((row) => row.id));
    const missing = reference.ids.filter((id) => !valid.has(id));
    if (missing.length) throw badRequest('EDITOR_REFERENCE_INVALID', `Seçilmiş ${reference.kind} bu mağazaya aid deyil`, { ids: missing });
  }
}

export async function siteEditorRoutes(app: FastifyInstance): Promise<void> {
  app.get('/options', { preHandler: app.requirePermission('editor.read') }, async (request) => {
    const query = z.object({ storeId: z.uuid().optional() }).parse(request.query);
    const storeId = await selectedStoreId(request, query.storeId);
    const [media, products, categories, posts, brands] = await Promise.all([
      pool.query(`SELECT id,public_url,alt_text,title,mime_type,created_at FROM media_assets WHERE store_id=$1 AND mime_type LIKE 'image/%' ORDER BY created_at DESC LIMIT 500`, [storeId]),
      pool.query(`SELECT p.id,pl.title,pl.slug,p.sku,pl.status,ma.public_url AS image_url,ma.alt_text FROM products p JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL JOIN product_listings pl ON pl.product_id=p.id AND pl.store_id=$1 AND pl.status='published' LEFT JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary LEFT JOIN media_assets ma ON ma.id=pm.media_asset_id WHERE p.deleted_at IS NULL ORDER BY pl.title LIMIT 500`, [storeId]),
      pool.query(`SELECT id,name,slug,parent_id,status,position FROM categories WHERE store_id=$1 AND status='active' ORDER BY position,name LIMIT 300`, [storeId]),
      pool.query(`SELECT id,title,slug,status,post_type,published_at FROM posts WHERE store_id=$1 AND status='published' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 300`, [storeId]),
      pool.query(`SELECT id,name,slug,status FROM brands WHERE store_id=$1 AND status='active' ORDER BY name LIMIT 300`, [storeId])
    ]);
    return { data: { storeId, media: media.rows, products: products.rows, categories: categories.rows, posts: posts.rows, brands: brands.rows } };
  });

  app.get('/preview', { preHandler: app.requirePermission('editor.read') }, async (request, reply) => {
    const query = z.object({ scope: scopeSchema, storeId: z.uuid().optional() }).parse(request.query);
    const storeId = await selectedStoreId(request, query.storeId);
    const rows = await documents(storeId);
    const config = publicPayload(rows, query.scope);
    reply.header('Cache-Control', 'no-store');
    return { data: { ...config, media: await mediaMap(storeId, Object.values(config)), previewScope: query.scope } };
  });

  app.get('/:scope', { preHandler: app.requirePermission('editor.read') }, async (request) => {
    const scope = scopeSchema.parse((request.params as { scope: string }).scope);
    const query = z.object({ storeId: z.uuid().optional() }).parse(request.query);
    const storeId = await selectedStoreId(request, query.storeId);
    const row = (await documents(storeId)).find((candidate) => candidate.scope === scope);
    if (!row) throw notFound('Editor sənədi');
    return {
      data: {
        id: row.id, scope, storeId,
        draft: normalizedEditorConfig(scope, row.draft_content),
        published: normalizedEditorConfig(scope, row.published_content),
        draftVersion: row.draft_version, publishedVersion: row.published_version,
        updatedAt: row.updated_at, publishedAt: row.published_at,
        hasUnpublishedChanges: JSON.stringify(normalizedEditorConfig(scope, row.draft_content)) !== JSON.stringify(normalizedEditorConfig(scope, row.published_content))
      }
    };
  });

  app.patch('/:scope/draft', { preHandler: app.requirePermission('editor.manage') }, async (request) => {
    const scope = scopeSchema.parse((request.params as { scope: string }).scope);
    const body = z.object({ storeId: z.uuid().optional(), expectedVersion: z.number().int().positive().optional(), content: z.unknown() }).strict().parse(request.body);
    const storeId = await selectedStoreId(request, body.storeId);
    const content = editorSchemas[scope].parse(body.content) as SiteEditorConfig;
    await assertReferences(storeId, scope, content);
    const actor = actorOf(request);
    await ensureDocuments(storeId);
    const updated = await withTransaction(async (client) => {
      const current = await client.query<EditorRow>('SELECT * FROM site_editor_documents WHERE store_id=$1 AND scope=$2 FOR UPDATE', [storeId, scope]);
      const before = current.rows[0];
      if (!before) throw notFound('Editor sənədi');
      if (body.expectedVersion && before.draft_version !== body.expectedVersion) throw conflict('Bu bölmə başqa istifadəçi tərəfindən dəyişdirilib. Səhifəni yeniləyin.');
      const result = await client.query<EditorRow>(`
        UPDATE site_editor_documents SET draft_content=$3,draft_version=draft_version+1,
          updated_by=$4,updated_at=now() WHERE store_id=$1 AND scope=$2 RETURNING *
      `, [storeId, scope, JSON.stringify(content), actor.userId]);
      const row = result.rows[0]!;
      await client.query(`INSERT INTO site_editor_revisions(document_id,version,revision_type,content,created_by) VALUES($1,$2,'draft',$3,$4)`, [row.id, row.draft_version, JSON.stringify(content), actor.userId]);
      await writeAudit(client, { actorUserId: actor.userId, storeId, action: 'site_editor.draft_saved', entityType: 'site_editor_document', entityId: row.id, beforeData: before.draft_content, afterData: content, requestId: request.id });
      return row;
    });
    return { data: { scope, draft: content, draftVersion: updated.draft_version, updatedAt: updated.updated_at, hasUnpublishedChanges: true } };
  });

  app.post('/:scope/publish', { preHandler: app.requirePermission('editor.publish') }, async (request) => {
    const scope = scopeSchema.parse((request.params as { scope: string }).scope);
    const body = z.object({ storeId: z.uuid().optional(), expectedVersion: z.number().int().positive().optional() }).strict().parse(request.body ?? {});
    const storeId = await selectedStoreId(request, body.storeId);
    const actor = actorOf(request);
    await ensureDocuments(storeId);
    const published = await withTransaction(async (client) => {
      const current = await client.query<EditorRow>('SELECT * FROM site_editor_documents WHERE store_id=$1 AND scope=$2 FOR UPDATE', [storeId, scope]);
      const before = current.rows[0];
      if (!before) throw notFound('Editor sənədi');
      if (body.expectedVersion && before.draft_version !== body.expectedVersion) throw conflict('Yayımdan əvvəl bölmə dəyişdirilib. Səhifəni yeniləyin.');
      const content = editorSchemas[scope].parse(normalizedEditorConfig(scope, before.draft_content));
      await assertReferences(storeId, scope, content);
      const result = await client.query<EditorRow>(`
        UPDATE site_editor_documents SET published_content=$3,published_version=draft_version,
          published_by=$4,published_at=now() WHERE store_id=$1 AND scope=$2 RETURNING *
      `, [storeId, scope, JSON.stringify(content), actor.userId]);
      const row = result.rows[0]!;
      await client.query(`INSERT INTO site_editor_revisions(document_id,version,revision_type,content,created_by) VALUES($1,$2,'published',$3,$4) ON CONFLICT DO NOTHING`, [row.id, row.published_version, JSON.stringify(content), actor.userId]);
      await writeAudit(client, { actorUserId: actor.userId, storeId, action: 'site_editor.published', entityType: 'site_editor_document', entityId: row.id, beforeData: before.published_content, afterData: content, requestId: request.id });
      return row;
    });
    return { data: { scope, publishedVersion: published.published_version, draftVersion: published.draft_version, publishedAt: published.published_at, hasUnpublishedChanges: false } };
  });

  app.post('/:scope/discard', { preHandler: app.requirePermission('editor.manage') }, async (request) => {
    const scope = scopeSchema.parse((request.params as { scope: string }).scope);
    const body = z.object({ storeId: z.uuid().optional() }).strict().parse(request.body ?? {});
    const storeId = await selectedStoreId(request, body.storeId);
    const actor = actorOf(request);
    await ensureDocuments(storeId);
    const result = await pool.query<EditorRow>(`
      UPDATE site_editor_documents SET draft_content=published_content,
        updated_by=$3,updated_at=now() WHERE store_id=$1 AND scope=$2 RETURNING *
    `, [storeId, scope, actor.userId]);
    const row = result.rows[0];
    if (!row) throw notFound('Editor sənədi');
    return { data: { scope, draft: normalizedEditorConfig(scope, row.draft_content), draftVersion: row.draft_version, hasUnpublishedChanges: false } };
  });
}

export async function publicSiteEditorRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request, reply) => {
    const storeId = await defaultStoreId();
    const rows = await documents(storeId);
    const config = publicPayload(rows);
    reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return { data: { ...config, media: await mediaMap(storeId, Object.values(config)) } };
  });
}
