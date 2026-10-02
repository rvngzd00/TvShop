import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { paginationMeta, paginationSchema } from '../core/pagination.js';
import { actorOf, assertStoreScope, assertVendorScope } from '../core/scope.js';
import { badRequest, notFound } from '../core/errors.js';
import { slugify } from '../core/slug.js';
import { writeAudit } from '../core/audit.js';
import { normalizeProductVideoUrl } from '../core/media-provider.js';

const categoryInput = z.object({
  storeId: z.uuid(), parentId: z.uuid().nullable().optional(), name: z.string().trim().min(2).max(160),
  slug: z.string().trim().max(180).optional(), description: z.string().trim().max(5000).default(''),
  position: z.number().int().min(0).default(0), seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(170).optional(), imageAssetId: z.uuid().nullable().optional(),
  status: z.enum(['active', 'inactive', 'archived']).default('active')
});
const categoryUpdate = categoryInput.omit({ storeId: true }).partial();
const brandInput = z.object({
  storeId: z.uuid(), name: z.string().trim().min(2).max(160), slug: z.string().trim().max(180).optional(),
  description: z.string().trim().max(5000).default(''), logoAssetId: z.uuid().nullable().optional(),
  websiteUrl: z.union([z.literal(''), z.url()]).default(''), seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(170).optional()
});
const brandUpdate = brandInput.omit({ storeId: true }).partial().extend({ status: z.enum(['active', 'inactive', 'archived']).optional() });

const productAttributes = z.record(
  z.string().trim().min(1).max(120),
  z.string().trim().min(1).max(500)
).superRefine((attributes, context) => {
  if (Object.keys(attributes).length > 50) {
    context.addIssue({ code: 'custom', message: 'Ən çox 50 atribut əlavə edilə bilər' });
  }
});

const productBase = z.object({
  storeId: z.uuid(), vendorId: z.uuid(), brandId: z.uuid().nullable().optional(), sku: z.string().trim().min(1).max(100).optional(),
  barcode: z.string().trim().max(100).nullable().optional(), name: z.string().trim().min(2).max(240),
  title: z.string().trim().min(2).max(240).optional(), slug: z.string().trim().max(220).optional(),
  shortDescription: z.string().trim().max(500).default(''), description: z.string().trim().max(100000).default(''),
  productType: z.enum(['physical', 'digital', 'service']).default('physical'), price: z.number().min(0),
  compareAtPrice: z.number().min(0).nullable().optional(), currency: z.string().length(3).default('AZN'),
  categoryIds: z.array(z.uuid()).max(20).default([]), attributes: productAttributes.default({}),
  seoTitle: z.string().trim().max(70).optional(), seoDescription: z.string().trim().max(170).optional(),
  variant: z.object({ sku: z.string().trim().min(1).max(100).optional(), title: z.string().trim().min(1).max(160).default('Standart') }).optional(),
  mediaIds: z.array(z.uuid()).max(12).default([]), warehouseId: z.uuid().optional(),
  videoAssetId: z.uuid().nullable().optional(), videoUrl: z.string().trim().max(2_000).nullable().optional(),
  initialStock: z.number().int().min(0).max(1_000_000).default(0),
  isFeatured: z.boolean().default(false), isPopular: z.boolean().default(false), isTopPick: z.boolean().default(false),
  displayPosition: z.number().int().min(0).max(1_000_000).default(0),
  merchandisingBadge: z.enum(['none', 'sale', 'hot', 'new', 'recommended']).default('none')
});
const productInput = productBase
  .refine((value) => value.compareAtPrice == null || value.compareAtPrice >= value.price, { path: ['compareAtPrice'], message: 'Köhnə qiymət satış qiymətindən az ola bilməz' })
  .refine((value) => value.initialStock === 0 || Boolean(value.warehouseId), { path: ['warehouseId'], message: 'İlkin stok üçün anbar seçilməlidir' })
  .refine((value) => !(value.videoAssetId && value.videoUrl), { path: ['videoUrl'], message: 'Yüklənən video və xarici video URL-indən yalnız birini seçin' });

const productUpdate = productBase.omit({ storeId: true, vendorId: true, initialStock: true, warehouseId: true }).partial()
  .refine((value) => value.compareAtPrice == null || value.price == null || value.compareAtPrice >= value.price, { path: ['compareAtPrice'], message: 'Köhnə qiymət satış qiymətindən az ola bilməz' })
  .refine((value) => !(value.videoAssetId && value.videoUrl), { path: ['videoUrl'], message: 'Yüklənən video və xarici video URL-indən yalnız birini seçin' });
const productStatus = z.object({ status: z.enum(['draft', 'review', 'published', 'rejected', 'archived']), note: z.string().trim().max(1000).default('') });
const inventoryInput = z.object({ warehouseId: z.uuid(), variantId: z.uuid(), quantityDelta: z.number().int().refine((v) => v !== 0), note: z.string().trim().max(500).default(''), referenceId: z.string().max(100).optional() });

async function resolveVendor(actor: ReturnType<typeof actorOf>, vendorId: string, storeId?: string) {
  const result = await pool.query('SELECT id, store_id, status FROM vendors WHERE id=$1 AND deleted_at IS NULL', [vendorId]);
  const vendor = result.rows[0];
  if (!vendor || (storeId && vendor.store_id !== storeId)) throw notFound('Satıcı');
  if (actor.vendorIds.length) assertVendorScope(actor, vendorId); else assertStoreScope(actor, vendor.store_id);
  return vendor;
}

async function getScopedProduct(actor: ReturnType<typeof actorOf>, id: string) {
  const result = await pool.query(`SELECT p.*, v.store_id FROM products p JOIN vendors v ON v.id=p.vendor_id WHERE p.id=$1 AND p.deleted_at IS NULL`, [id]);
  const row = result.rows[0];
  if (!row) throw notFound('Məhsul');
  if (actor.vendorIds.length) assertVendorScope(actor, row.vendor_id); else assertStoreScope(actor, row.store_id);
  return row;
}

async function validateMedia(client: Pick<import('pg').PoolClient, 'query'>, storeId: string, vendorId: string, mediaIds: string[]) {
  if (!mediaIds.length) return;
  const media = await client.query<{ count: number }>(`
    SELECT count(*)::int AS count FROM media_assets
    WHERE id=ANY($1::uuid[]) AND store_id=$2 AND (vendor_id IS NULL OR vendor_id=$3)
  `, [mediaIds, storeId, vendorId]);
  if (Number(media.rows[0]?.count ?? 0) !== mediaIds.length) throw badRequest('MEDIA_SCOPE_INVALID', 'Şəkillərdən biri bu mağaza və ya satıcıya aid deyil');
}

async function syncProductMedia(client: Pick<import('pg').PoolClient, 'query'>, productId: string, storeId: string, vendorId: string, mediaIds: string[]) {
  await validateMedia(client, storeId, vendorId, mediaIds);
  await client.query('DELETE FROM product_media WHERE product_id=$1', [productId]);
  for (const [position, mediaId] of mediaIds.entries()) {
    await client.query('INSERT INTO product_media(product_id,media_asset_id,position,is_primary) VALUES($1,$2,$3,$4)', [productId, mediaId, position, position === 0]);
  }
}

async function validateProductVideo(client: Pick<import('pg').PoolClient, 'query'>, storeId: string, vendorId: string, videoAssetId?: string | null) {
  if (!videoAssetId) return;
  const result = await client.query(`SELECT id FROM media_assets WHERE id=$1 AND store_id=$2 AND (vendor_id IS NULL OR vendor_id=$3) AND mime_type IN ('video/mp4','video/webm')`, [videoAssetId, storeId, vendorId]);
  if (!result.rows[0]) throw badRequest('VIDEO_SCOPE_INVALID', 'Video bu mağaza və ya satıcıya aid MP4/WEBM faylı deyil');
}

function productVideoUrl(value?: string | null): string | null {
  try { return normalizeProductVideoUrl(value); }
  catch (error) { throw badRequest('VIDEO_URL_INVALID', error instanceof Error ? error.message : 'Video URL etibarlı deyil'); }
}

async function createProductSku(client: Pick<import('pg').PoolClient, 'query'>, vendorId: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const day = new Date().toISOString().slice(2, 10).replaceAll('-', '');
    const sku = `TV-${day}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const existing = await client.query('SELECT EXISTS(SELECT 1 FROM products WHERE vendor_id=$1 AND sku=$2) AS sku_exists', [vendorId, sku]);
    if (!existing.rows[0]?.sku_exists) return sku;
  }
  throw badRequest('SKU_GENERATION_FAILED', 'Məhsul SKU-su yaradıla bilmədi, yenidən cəhd edin');
}

type CategoryTreeRow = { id: string; parent_id: string | null; store_id: string; status: string; depth: number };

async function categoryTreeRow(client: Pick<import('pg').PoolClient, 'query'>, id: string): Promise<CategoryTreeRow | undefined> {
  const result = await client.query<CategoryTreeRow>(`
    WITH RECURSIVE ancestry AS (
      SELECT c.id,c.parent_id,c.store_id,c.status,0 AS depth FROM categories c WHERE c.id=$1
      UNION ALL
      SELECT parent.id,parent.parent_id,parent.store_id,parent.status,ancestry.depth+1
      FROM categories parent JOIN ancestry ON ancestry.parent_id=parent.id
      WHERE ancestry.depth<3
    )
    SELECT id,parent_id,store_id,status,(SELECT max(depth) FROM ancestry)::int AS depth
    FROM ancestry WHERE id=$1
  `, [id]);
  return result.rows[0];
}

async function validateCategoryParent(
  client: Pick<import('pg').PoolClient, 'query'>,
  storeId: string,
  parentId: string | null | undefined,
  categoryId?: string
): Promise<void> {
  if (!parentId) return;
  if (parentId === categoryId) throw badRequest('CATEGORY_PARENT_SELF', 'Kateqoriya özünün üst kateqoriyası ola bilməz');
  const parent = await categoryTreeRow(client, parentId);
  if (!parent || parent.store_id !== storeId) throw badRequest('PARENT_CATEGORY_INVALID', 'Üst kateqoriya bu mağazaya aid deyil');
  if (parent.status !== 'active') throw badRequest('PARENT_CATEGORY_INACTIVE', 'Yalnız aktiv kateqoriya üst kateqoriya seçilə bilər');
  if (parent.depth >= 2) throw badRequest('CATEGORY_DEPTH_EXCEEDED', 'Kateqoriya ağacı ən çox Departament → Əsas kateqoriya → Alt kateqoriya ola bilər');
  if (categoryId) {
    const descendant = await client.query(`
      WITH RECURSIVE descendants AS (
        SELECT id FROM categories WHERE parent_id=$1
        UNION ALL SELECT c.id FROM categories c JOIN descendants d ON c.parent_id=d.id
      ) SELECT 1 FROM descendants WHERE id=$2 LIMIT 1
    `, [categoryId, parentId]);
    if (descendant.rows[0]) throw badRequest('CATEGORY_CYCLE', 'Kateqoriya öz alt kateqoriyasının altına köçürülə bilməz');
  }
}

async function validateProductCategories(
  client: Pick<import('pg').PoolClient, 'query'>,
  storeId: string,
  categoryIds: string[]
): Promise<void> {
  if (!categoryIds.length) return;
  if (new Set(categoryIds).size !== categoryIds.length) throw badRequest('CATEGORY_DUPLICATE', 'Eyni kateqoriya bir neçə dəfə seçilə bilməz');
  if (categoryIds.length > 3) throw badRequest('CATEGORY_PATH_INVALID', 'Məhsul yalnız bir departament, əsas kateqoriya və alt kateqoriya zəncirinə aid edilə bilər');
  const valid = await client.query<{ id: string; parent_id: string | null }>(`
    SELECT id,parent_id FROM categories
    WHERE store_id=$1 AND status='active' AND id=ANY($2::uuid[])
  `, [storeId, categoryIds]);
  if (valid.rowCount !== categoryIds.length) throw badRequest('CATEGORY_SCOPE_INVALID', 'Kateqoriyalardan biri aktiv deyil və ya mağazaya aid deyil');
  const byId = new Map(valid.rows.map((row) => [row.id, row]));
  if (byId.get(categoryIds[0]!)?.parent_id !== null) throw badRequest('CATEGORY_PATH_INVALID', 'Kateqoriya yolu departamentdən başlamalıdır');
  for (let index = 1; index < categoryIds.length; index += 1) {
    if (byId.get(categoryIds[index]!)?.parent_id !== categoryIds[index - 1]) {
      throw badRequest('CATEGORY_PATH_INVALID', 'Seçilən departament, əsas və alt kateqoriya eyni ardıcıl zəncirə aid deyil');
    }
  }
}

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/product-identifiers/preview', { preHandler: app.requirePermission('catalog.create') }, async (request) => {
    const input = z.object({ storeId: z.uuid(), vendorId: z.uuid() }).parse(request.query);
    const actor = actorOf(request);
    await resolveVendor(actor, input.vendorId, input.storeId);
    return { data: { sku: await createProductSku(pool, input.vendorId) } };
  });

  app.get('/categories', { preHandler: app.requirePermission('catalog.read') }, async (request) => {
    const actor = actorOf(request);
    const query=z.object({storeId:z.uuid().optional(),search:z.string().trim().max(100).optional()}).passthrough().parse(request.query);
    const storeId = z.uuid().parse(query.storeId ?? actor.storeIds[0]);
    assertStoreScope(actor, storeId);
    const result = await pool.query(`WITH RECURSIVE tree AS (
      SELECT c.id,c.parent_id,0 AS depth,ARRAY[c.position] AS position_path,ARRAY[c.name] AS name_path
      FROM categories c WHERE c.store_id=$1 AND c.parent_id IS NULL
      UNION ALL
      SELECT c.id,c.parent_id,tree.depth+1,tree.position_path||c.position,tree.name_path||c.name
      FROM categories c JOIN tree ON c.parent_id=tree.id WHERE c.store_id=$1 AND tree.depth<2
    )
    SELECT c.*,coalesce(tree.depth,0)::int AS depth,coalesce(tree.name_path,ARRAY[c.name]) AS name_path,
      count(DISTINCT direct.product_id)::int AS product_count,
      count(DISTINCT subtree.product_id)::int AS subtree_product_count
    FROM categories c LEFT JOIN tree ON tree.id=c.id
    LEFT JOIN product_categories direct ON direct.category_id=c.id
    LEFT JOIN LATERAL (
      WITH RECURSIVE descendants AS (SELECT c.id UNION ALL SELECT child.id FROM categories child JOIN descendants d ON child.parent_id=d.id)
      SELECT pc.product_id FROM descendants d JOIN product_categories pc ON pc.category_id=d.id
    ) subtree ON true
    WHERE c.store_id=$1 AND ($2::text IS NULL OR c.name ILIKE $2 OR c.slug ILIKE $2)
    GROUP BY c.id,tree.depth,tree.position_path,tree.name_path
    ORDER BY tree.position_path,tree.name_path`, [storeId,query.search?`%${query.search}%`:null]);
    return { data: result.rows };
  });

  app.post('/categories', { preHandler: app.requirePermission('categories.manage') }, async (request, reply) => {
    const input = categoryInput.parse(request.body); const actor = actorOf(request); assertStoreScope(actor, input.storeId);
    await validateCategoryParent(pool, input.storeId, input.parentId);
    if (input.imageAssetId) { const media=await pool.query('SELECT id FROM media_assets WHERE id=$1 AND store_id=$2',[input.imageAssetId,input.storeId]); if(!media.rows[0])throw badRequest('MEDIA_SCOPE_INVALID','Kateqoriya şəkli bu mağazaya aid deyil'); }
    const result = await pool.query(`INSERT INTO categories(store_id,parent_id,name,slug,description,position,seo_title,seo_description,image_asset_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::record_status) RETURNING *`, [input.storeId,input.parentId??null,input.name,slugify(input.slug??input.name),input.description,input.position,input.seoTitle??null,input.seoDescription??null,input.imageAssetId??null,input.status]);
    return reply.code(201).send({ data: result.rows[0] });
  });

  app.patch('/categories/:id', { preHandler: app.requirePermission('categories.manage') }, async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id); const input = categoryUpdate.parse(request.body); const actor = actorOf(request);
    const current = await pool.query('SELECT * FROM categories WHERE id=$1', [id]); if (!current.rows[0]) throw notFound('Kateqoriya'); assertStoreScope(actor, current.rows[0].store_id);
    if (Object.hasOwn(input, 'parentId')) await validateCategoryParent(pool, current.rows[0].store_id, input.parentId, id);
    if (input.imageAssetId) { const media=await pool.query('SELECT id FROM media_assets WHERE id=$1 AND store_id=$2',[input.imageAssetId,current.rows[0].store_id]); if(!media.rows[0])throw badRequest('MEDIA_SCOPE_INVALID','Kateqoriya şəkli bu mağazaya aid deyil'); }
    const result = await pool.query(`UPDATE categories SET parent_id=CASE WHEN $2 THEN $3 ELSE parent_id END,name=coalesce($4,name),slug=coalesce($5,slug),description=coalesce($6,description),position=coalesce($7,position),seo_title=coalesce($8,seo_title),seo_description=coalesce($9,seo_description),image_asset_id=CASE WHEN $10 THEN $11 ELSE image_asset_id END,status=coalesce($12::record_status,status) WHERE id=$1 RETURNING *`, [id,Object.hasOwn(input,'parentId'),input.parentId??null,input.name??null,input.slug?slugify(input.slug):null,input.description??null,input.position??null,input.seoTitle??null,input.seoDescription??null,Object.hasOwn(input,'imageAssetId'),input.imageAssetId??null,input.status??null]);
    return { data: result.rows[0] };
  });

  app.delete('/categories/:id', { preHandler: app.requirePermission('categories.manage') }, async (request, reply) => {
    const id = z.uuid().parse((request.params as { id: string }).id); const actor = actorOf(request);
    const current = await pool.query('SELECT * FROM categories WHERE id=$1', [id]); if (!current.rows[0]) throw notFound('Kateqoriya'); assertStoreScope(actor, current.rows[0].store_id);
    const usage = await pool.query<{ products: number; children: number }>('SELECT (SELECT count(*)::int FROM product_categories WHERE category_id=$1) products,(SELECT count(*)::int FROM categories WHERE parent_id=$1) children', [id]);
    if (Number(usage.rows[0]?.products) || Number(usage.rows[0]?.children)) throw badRequest('CATEGORY_IN_USE', 'Məhsulu və ya alt kateqoriyası olan kateqoriya silinə bilməz; əvvəlcə onu deaktiv edin');
    await pool.query('DELETE FROM categories WHERE id=$1', [id]); return reply.code(204).send();
  });

  app.get('/brands', { preHandler: app.requirePermission('catalog.read') }, async (request) => {
    const actor=actorOf(request);const query=z.object({storeId:z.uuid().optional(),search:z.string().trim().max(100).optional()}).passthrough().parse(request.query);const storeId=z.uuid().parse(query.storeId??actor.storeIds[0]); assertStoreScope(actor,storeId);
    const result=await pool.query('SELECT * FROM brands WHERE store_id=$1 AND ($2::text IS NULL OR name ILIKE $2 OR slug ILIKE $2) ORDER BY name',[storeId,query.search?`%${query.search}%`:null]); return {data:result.rows};
  });

  app.post('/brands', { preHandler: app.requirePermission('catalog.create') }, async (request,reply) => {
    const input=brandInput.parse(request.body); const actor=actorOf(request); assertStoreScope(actor,input.storeId);
    if(input.logoAssetId){const media=await pool.query('SELECT id FROM media_assets WHERE id=$1 AND store_id=$2',[input.logoAssetId,input.storeId]);if(!media.rows[0])throw badRequest('MEDIA_SCOPE_INVALID','Brend loqosu bu mağazaya aid deyil');}
    const result=await pool.query(`INSERT INTO brands(store_id,name,slug,description,logo_asset_id,website_url,seo_title,seo_description) VALUES($1,$2,$3,$4,$5,nullif($6,''),$7,$8) RETURNING *`,[input.storeId,input.name,slugify(input.slug??input.name),input.description,input.logoAssetId??null,input.websiteUrl,input.seoTitle??null,input.seoDescription??null]); return reply.code(201).send({data:result.rows[0]});
  });

  app.patch('/brands/:id', { preHandler: app.requirePermission('catalog.update') }, async (request) => {
    const id=z.uuid().parse((request.params as {id:string}).id); const input=brandUpdate.parse(request.body); const actor=actorOf(request); const current=await pool.query('SELECT * FROM brands WHERE id=$1',[id]); if(!current.rows[0])throw notFound('Brend'); assertStoreScope(actor,current.rows[0].store_id);
    if(input.logoAssetId){const media=await pool.query('SELECT id FROM media_assets WHERE id=$1 AND store_id=$2',[input.logoAssetId,current.rows[0].store_id]);if(!media.rows[0])throw badRequest('MEDIA_SCOPE_INVALID','Brend loqosu bu mağazaya aid deyil');}
    const result=await pool.query(`UPDATE brands SET name=coalesce($2,name),slug=coalesce($3,slug),description=coalesce($4,description),logo_asset_id=CASE WHEN $5 THEN $6 ELSE logo_asset_id END,website_url=CASE WHEN $7 THEN nullif($8,'') ELSE website_url END,seo_title=coalesce($9,seo_title),seo_description=coalesce($10,seo_description),status=coalesce($11::record_status,status) WHERE id=$1 RETURNING *`,[id,input.name??null,input.slug?slugify(input.slug):null,input.description??null,Object.hasOwn(input,'logoAssetId'),input.logoAssetId??null,Object.hasOwn(input,'websiteUrl'),input.websiteUrl??null,input.seoTitle??null,input.seoDescription??null,input.status??null]); return {data:result.rows[0]};
  });

  app.delete('/brands/:id', { preHandler: app.requirePermission('catalog.delete') }, async (request,reply) => {
    const id=z.uuid().parse((request.params as {id:string}).id); const actor=actorOf(request); const current=await pool.query('SELECT * FROM brands WHERE id=$1',[id]); if(!current.rows[0])throw notFound('Brend'); assertStoreScope(actor,current.rows[0].store_id);
    const usage=await pool.query<{count:number}>('SELECT count(*)::int AS count FROM products WHERE brand_id=$1 AND deleted_at IS NULL',[id]); if(Number(usage.rows[0]?.count))throw badRequest('BRAND_IN_USE','Məhsullara bağlı brend silinə bilməz; onu deaktiv edin'); await pool.query('DELETE FROM brands WHERE id=$1',[id]); return reply.code(204).send();
  });

  app.get('/warehouses', { preHandler: app.requirePermission('inventory.read') }, async (request) => {
    const actor=actorOf(request); const storeId=z.uuid().parse((request.query as {storeId?:string}).storeId??actor.storeIds[0]); assertStoreScope(actor,storeId);
    const result=await pool.query(`SELECT id,store_id,vendor_id,name,code,status FROM warehouses WHERE store_id=$1 AND status='active' ORDER BY name`,[storeId]); return {data:result.rows};
  });

  app.get('/products', { preHandler: app.requirePermission('catalog.read') }, async (request) => {
    const query = paginationSchema.extend({ vendorId: z.uuid().optional(), storeId: z.uuid().optional() }).parse(request.query);
    const actor = actorOf(request); const params: unknown[]=[]; const conditions=['p.deleted_at IS NULL'];
    if (actor.vendorIds.length) { params.push(actor.vendorIds); conditions.push(`p.vendor_id=ANY($${params.length}::uuid[])`); }
    else if (!actor.isSuperAdmin) { params.push(actor.storeIds); conditions.push(`pl.store_id=ANY($${params.length}::uuid[])`); }
    if (query.vendorId) { await resolveVendor(actor, query.vendorId, query.storeId); params.push(query.vendorId); conditions.push(`p.vendor_id=$${params.length}`); }
    if (query.storeId) { assertStoreScope(actor, query.storeId); params.push(query.storeId); conditions.push(`pl.store_id=$${params.length}`); }
    if (query.search) { params.push(`%${query.search}%`); conditions.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR pl.title ILIKE $${params.length})`); }
    if (query.status) { params.push(query.status); conditions.push(`pl.status::text=$${params.length}`); }
    params.push(query.limit,(query.page-1)*query.limit);
    const result=await pool.query(`SELECT p.id,p.vendor_id,p.sku,p.name,p.status,p.created_at,v.display_name AS vendor_name,pl.store_id,pl.title,pl.slug,pl.price,pl.compare_at_price,pl.currency,pl.status AS listing_status,pl.published_at,pl.is_featured,pl.is_popular,pl.is_top_pick,pl.display_position,pl.merchandising_badge,count(*) OVER()::int AS total_count FROM products p JOIN vendors v ON v.id=p.vendor_id JOIN product_listings pl ON pl.product_id=p.id WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC,p.id DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);
    const total=Number(result.rows[0]?.total_count??0); return {data:result.rows.map(({total_count:_,...row})=>row),meta:paginationMeta(query.page,query.limit,total)};
  });

  app.get('/products/:id', { preHandler: app.requirePermission('catalog.read') }, async (request) => {
    const id=z.uuid().parse((request.params as {id:string}).id); const actor=actorOf(request); await getScopedProduct(actor,id);
    const product=await pool.query(`SELECT p.*,vma.public_url AS video_asset_url,pl.id AS listing_id,pl.store_id,pl.title,pl.slug,pl.short_description,pl.description AS listing_description,pl.price,pl.compare_at_price,pl.currency,pl.status AS listing_status,pl.seo_title,pl.seo_description,pl.is_featured,pl.is_popular,pl.is_top_pick,pl.display_position,pl.merchandising_badge,b.name AS brand_name,v.display_name AS vendor_name FROM products p JOIN product_listings pl ON pl.product_id=p.id JOIN vendors v ON v.id=p.vendor_id LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN media_assets vma ON vma.id=p.video_asset_id WHERE p.id=$1`,[id]);
    const [categories,media,variants]=await Promise.all([
      pool.query(`SELECT c.id,c.parent_id,c.name,c.slug,pc.is_primary FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=$1 ORDER BY pc.is_primary DESC,c.name`,[id]),
      pool.query(`SELECT ma.*,pm.position,pm.is_primary FROM product_media pm JOIN media_assets ma ON ma.id=pm.media_asset_id WHERE pm.product_id=$1 ORDER BY pm.position`,[id]),
      pool.query(`SELECT pv.*,coalesce(jsonb_agg(jsonb_build_object('warehouseId',w.id,'warehouseName',w.name,'quantity',i.quantity,'reserved',i.reserved)) FILTER(WHERE i.warehouse_id IS NOT NULL),'[]'::jsonb) AS inventory FROM product_variants pv LEFT JOIN inventory i ON i.variant_id=pv.id LEFT JOIN warehouses w ON w.id=i.warehouse_id WHERE pv.product_id=$1 GROUP BY pv.id ORDER BY pv.created_at`,[id])
    ]);
    return {data:{...product.rows[0],categories:categories.rows,media:media.rows,variants:variants.rows}};
  });

  app.get('/inventory', { preHandler: app.requirePermission('inventory.read') }, async (request) => {
    const query = paginationSchema.extend({ vendorId: z.uuid().optional(), storeId: z.uuid().optional() }).parse(request.query);
    const actor = actorOf(request); const params: unknown[]=[]; const conditions=['1=1'];
    if (actor.vendorIds.length) { params.push(actor.vendorIds); conditions.push(`p.vendor_id=ANY($${params.length}::uuid[])`); }
    else if (!actor.isSuperAdmin) { params.push(actor.storeIds); conditions.push(`w.store_id=ANY($${params.length}::uuid[])`); }
    if (query.vendorId) { await resolveVendor(actor, query.vendorId, query.storeId); params.push(query.vendorId); conditions.push(`p.vendor_id=$${params.length}`); }
    if (query.storeId) { assertStoreScope(actor, query.storeId); params.push(query.storeId); conditions.push(`w.store_id=$${params.length}`); }
    if (query.search) { params.push(`%${query.search}%`); conditions.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR pv.sku ILIKE $${params.length} OR w.name ILIKE $${params.length})`); }
    params.push(query.limit,(query.page-1)*query.limit);
    const result=await pool.query(`SELECT i.variant_id,p.id AS product_id,p.name AS product_name,p.sku AS product_sku,
      pv.title AS variant_title,pv.sku AS variant_sku,v.id AS vendor_id,v.display_name AS vendor_name,
      w.id AS warehouse_id,w.name AS warehouse_name,i.quantity,i.reserved,(i.quantity-i.reserved)::int AS available,
      i.updated_at,count(*) OVER()::int AS total_count
      FROM inventory i JOIN product_variants pv ON pv.id=i.variant_id JOIN products p ON p.id=pv.product_id
      JOIN vendors v ON v.id=p.vendor_id JOIN warehouses w ON w.id=i.warehouse_id
      WHERE ${conditions.join(' AND ')} ORDER BY i.updated_at DESC
      LIMIT $${params.length-1} OFFSET $${params.length}`,params);
    const total=Number(result.rows[0]?.total_count??0);
    return {data:result.rows.map(({total_count:_,...row})=>row),meta:paginationMeta(query.page,query.limit,total)};
  });

  app.post('/products', { preHandler: app.requirePermission('catalog.create') }, async (request, reply) => {
    const input=productInput.parse(request.body); const actor=actorOf(request); await resolveVendor(actor,input.vendorId,input.storeId);
    const data=await withTransaction(async(client)=>{
      await validateProductCategories(client,input.storeId,input.categoryIds);
      if (input.brandId) { const valid=await client.query('SELECT id FROM brands WHERE id=$1 AND store_id=$2',[input.brandId,input.storeId]); if(!valid.rows[0]) throw badRequest('BRAND_SCOPE_INVALID','Brend bu mağazaya aid deyil'); }
      const productSku=input.sku??await createProductSku(client,input.vendorId); const barcode=input.barcode??null;
      await validateProductVideo(client,input.storeId,input.vendorId,input.videoAssetId);
      const p=await client.query(`INSERT INTO products(vendor_id,brand_id,sku,barcode,name,description,product_type,attributes,video_asset_id,video_url,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[input.vendorId,input.brandId??null,productSku,barcode,input.name,input.description,input.productType,JSON.stringify(input.attributes),input.videoAssetId??null,productVideoUrl(input.videoUrl),actor.userId]);
      const id=p.rows[0].id;
      const listing=await client.query(`INSERT INTO product_listings(store_id,product_id,title,slug,short_description,description,price,compare_at_price,currency,seo_title,seo_description,is_featured,is_popular,is_top_pick,display_position,merchandising_badge) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,[input.storeId,id,input.title??input.name,slugify(input.slug??input.title??input.name),input.shortDescription,input.description,input.price,input.compareAtPrice??null,input.currency.toUpperCase(),input.seoTitle??null,input.seoDescription??null,input.isFeatured,input.isPopular,input.isTopPick,input.displayPosition,input.merchandisingBadge]);
      for(const [index,categoryId] of input.categoryIds.entries()) await client.query('INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,$3)',[id,categoryId,index===0]);
      const variant={sku:input.variant?.sku??productSku,title:input.variant?.title??'Standart'}; const v=await client.query(`INSERT INTO product_variants(product_id,sku,barcode,title) VALUES($1,$2,$3,$4) RETURNING *`,[id,variant.sku,barcode,variant.title]);
      await syncProductMedia(client,id,input.storeId,input.vendorId,input.mediaIds);
      if(input.warehouseId){const warehouse=await client.query('SELECT id FROM warehouses WHERE id=$1 AND store_id=$2 AND status=\'active\'',[input.warehouseId,input.storeId]);if(!warehouse.rows[0])throw badRequest('WAREHOUSE_SCOPE_INVALID','Seçilən anbar məhsulun mağazasına uyğun deyil');await client.query('INSERT INTO inventory(variant_id,warehouse_id,quantity) VALUES($1,$2,$3)',[v.rows[0].id,input.warehouseId,input.initialStock]);if(input.initialStock>0)await client.query(`INSERT INTO inventory_movements(variant_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,actor_user_id) VALUES($1,$2,'purchase',$3,'product',$4,'İlkin stok',$5)`,[v.rows[0].id,input.warehouseId,input.initialStock,id,actor.userId]);}
      await writeAudit(client,{actorUserId:actor.userId,storeId:input.storeId,vendorId:input.vendorId,action:'product.create',entityType:'product',entityId:id,afterData:{product:p.rows[0],listing:listing.rows[0]},requestId:request.id});
      return {...p.rows[0],listing:listing.rows[0],variants:[v.rows[0]]};
    }); return reply.code(201).send({data});
  });

  app.patch('/products/:id', { preHandler: app.requirePermission('catalog.update') }, async (request) => {
    const id=z.uuid().parse((request.params as {id:string}).id); const rawInput=(request.body??{}) as Record<string,unknown>; const input=productUpdate.parse(rawInput); const includes=(key:string)=>Object.hasOwn(rawInput,key); const actor=actorOf(request); const current=await getScopedProduct(actor,id);
    const data=await withTransaction(async(client)=>{
      if (includes('brandId')&&input.brandId) { const valid=await client.query('SELECT id FROM brands WHERE id=$1 AND store_id=$2',[input.brandId,current.store_id]); if(!valid.rows[0]) throw badRequest('BRAND_SCOPE_INVALID','Brend bu mağazaya aid deyil'); }
      if(includes('videoAssetId'))await validateProductVideo(client,current.store_id,current.vendor_id,input.videoAssetId);
      const p=await client.query(`UPDATE products SET brand_id=CASE WHEN $2 THEN $3 ELSE brand_id END,sku=coalesce($4,sku),barcode=CASE WHEN $5 THEN $6 ELSE barcode END,name=coalesce($7,name),description=coalesce($8,description),product_type=coalesce($9,product_type),attributes=coalesce($10,attributes),video_asset_id=CASE WHEN $11 THEN $12 ELSE video_asset_id END,video_url=CASE WHEN $13 THEN $14 ELSE video_url END WHERE id=$1 RETURNING *`,[id,includes('brandId'),input.brandId??null,includes('sku')?input.sku??null:null,includes('barcode'),input.barcode??null,includes('name')?input.name??null:null,includes('description')?input.description??null:null,includes('productType')?input.productType??null:null,includes('attributes')?JSON.stringify(input.attributes):null,includes('videoAssetId'),input.videoAssetId??null,includes('videoUrl'),productVideoUrl(input.videoUrl)]);
      const l=await client.query(`UPDATE product_listings SET title=coalesce($2,title),slug=coalesce($3,slug),short_description=coalesce($4,short_description),description=coalesce($5,description),price=coalesce($6,price),compare_at_price=CASE WHEN $7 THEN $8 ELSE compare_at_price END,currency=coalesce($9,currency),seo_title=coalesce($10,seo_title),seo_description=coalesce($11,seo_description),is_featured=coalesce($12,is_featured),is_popular=coalesce($13,is_popular),is_top_pick=coalesce($14,is_top_pick),display_position=coalesce($15,display_position),merchandising_badge=coalesce($16,merchandising_badge),status=CASE WHEN status='published' AND NOT $17::boolean THEN 'review'::product_status ELSE status END WHERE product_id=$1 RETURNING *`,[id,includes('title')?input.title??null:null,includes('slug')&&input.slug?slugify(input.slug):null,includes('shortDescription')?input.shortDescription??null:null,includes('description')?input.description??null:null,includes('price')?input.price??null:null,includes('compareAtPrice'),input.compareAtPrice??null,includes('currency')?input.currency?.toUpperCase()??null:null,includes('seoTitle')?input.seoTitle??null:null,includes('seoDescription')?input.seoDescription??null:null,includes('isFeatured')?input.isFeatured??null:null,includes('isPopular')?input.isPopular??null:null,includes('isTopPick')?input.isTopPick??null:null,includes('displayPosition')?input.displayPosition??null:null,includes('merchandisingBadge')?input.merchandisingBadge??null:null,actor.permissions.has('catalog.publish')]);
      if(includes('categoryIds')&&input.categoryIds){await validateProductCategories(client,current.store_id,input.categoryIds);await client.query('DELETE FROM product_categories WHERE product_id=$1',[id]);for(const[index,c]of input.categoryIds.entries())await client.query('INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,$3)',[id,c,index===0]);}
      if(includes('mediaIds')&&input.mediaIds)await syncProductMedia(client,id,current.store_id,current.vendor_id,input.mediaIds);
      if(includes('variant')&&input.variant){await client.query(`UPDATE product_variants SET sku=coalesce($2,sku),title=coalesce($3,title) WHERE id=(SELECT id FROM product_variants WHERE product_id=$1 ORDER BY created_at LIMIT 1)`,[id,input.variant.sku??null,input.variant.title??null]);}
      await writeAudit(client,{actorUserId:actor.userId,storeId:current.store_id,vendorId:current.vendor_id,action:'product.update',entityType:'product',entityId:id,beforeData:current,afterData:{product:p.rows[0],listing:l.rows[0]},requestId:request.id}); return {...p.rows[0],listing:l.rows[0]};
    }); return {data};
  });

  app.patch('/products/:id/status', { preHandler: app.authenticate }, async (request) => {
    const id=z.uuid().parse((request.params as {id:string}).id); const input=productStatus.parse(request.body); const actor=actorOf(request); const current=await getScopedProduct(actor,id);
    const vendorCanSubmit=actor.permissions.has('catalog.update')&&input.status==='review'; const canPublish=actor.permissions.has('catalog.publish');
    if(!vendorCanSubmit&&!canPublish) throw badRequest('STATUS_FORBIDDEN','Bu status keçidi üçün icazə yoxdur');
    if(input.status==='published') { const check=await pool.query(`SELECT title,description,price,seo_title,seo_description FROM product_listings WHERE product_id=$1`,[id]); const l=check.rows[0]; if(!l?.title||!l.description||l.price==null||!l.seo_title||!l.seo_description) throw badRequest('PUBLISH_VALIDATION','Dərc üçün başlıq, təsvir, qiymət və SEO sahələri tamamlanmalıdır'); }
    const data=await withTransaction(async(client)=>{await client.query(`UPDATE products SET status=$2::product_status,reviewed_by=CASE WHEN $2::product_status IN ('published'::product_status,'rejected'::product_status) THEN $3 ELSE reviewed_by END,reviewed_at=CASE WHEN $2::product_status IN ('published'::product_status,'rejected'::product_status) THEN now() ELSE reviewed_at END WHERE id=$1`,[id,input.status,actor.userId]);const result=await client.query(`UPDATE product_listings SET status=$2::product_status,published_at=CASE WHEN $2::product_status='published'::product_status THEN coalesce(published_at,now()) ELSE published_at END WHERE product_id=$1 RETURNING *`,[id,input.status]);await client.query(`INSERT INTO audit_logs(actor_user_id,store_id,vendor_id,action,entity_type,entity_id,before_data,after_data,request_id) VALUES($1,$2,$3,'product.status.update','product',$4,$5,$6,$7)`,[actor.userId,current.store_id,current.vendor_id,id,JSON.stringify({status:current.status}),JSON.stringify({status:input.status,note:input.note}),request.id]);return result.rows[0];}); return {data};
  });

  app.delete('/products/:id', { preHandler: app.requirePermission('catalog.delete') }, async (request, reply) => {
    const id=z.uuid().parse((request.params as{id:string}).id);const actor=actorOf(request);const current=await getScopedProduct(actor,id);
    await withTransaction(async(client)=>{await client.query(`UPDATE products SET deleted_at=now(),status='archived' WHERE id=$1`,[id]);await client.query(`UPDATE product_listings SET status='archived' WHERE product_id=$1`,[id]);await writeAudit(client,{actorUserId:actor.userId,storeId:current.store_id,vendorId:current.vendor_id,action:'product.delete',entityType:'product',entityId:id,beforeData:current,requestId:request.id});});
    return reply.code(204).send();
  });

  app.get('/reviews', { preHandler: app.requirePermission('catalog.read') }, async (request) => {
    const query=paginationSchema.extend({storeId:z.uuid().optional(),productId:z.uuid().optional()}).parse(request.query);const actor=actorOf(request);const params:unknown[]=[];const where=['p.deleted_at IS NULL'];
    if(query.storeId){assertStoreScope(actor,query.storeId);params.push(query.storeId);where.push(`pr.store_id=$${params.length}`);}else if(actor.vendorIds.length){params.push(actor.vendorIds);where.push(`p.vendor_id=ANY($${params.length}::uuid[])`);}else if(!actor.isSuperAdmin){params.push(actor.storeIds);where.push(`pr.store_id=ANY($${params.length}::uuid[])`);}
    if(query.productId){params.push(query.productId);where.push(`pr.product_id=$${params.length}`);}if(query.status){z.enum(['pending','published','rejected']).parse(query.status);params.push(query.status);where.push(`pr.status=$${params.length}`);}if(query.search){params.push(`%${query.search}%`);where.push(`(pr.author_name ILIKE $${params.length} OR pr.title ILIKE $${params.length} OR pr.body ILIKE $${params.length} OR pl.title ILIKE $${params.length})`);}
    params.push(query.limit,(query.page-1)*query.limit);const result=await pool.query(`SELECT pr.*,pl.title AS product_title,pl.slug AS product_slug,p.vendor_id,v.display_name AS vendor_name,count(*) OVER()::int AS total_count FROM product_reviews pr JOIN products p ON p.id=pr.product_id JOIN vendors v ON v.id=p.vendor_id JOIN product_listings pl ON pl.product_id=p.id AND pl.store_id=pr.store_id WHERE ${where.join(' AND ')} ORDER BY pr.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);const total=Number(result.rows[0]?.total_count??0);return{data:result.rows.map(({total_count:_,...row})=>row),meta:paginationMeta(query.page,query.limit,total)};
  });

  app.patch('/reviews/:id/status', { preHandler: app.requirePermission('catalog.publish') }, async (request) => {
    const id=z.uuid().parse((request.params as{id:string}).id);const input=z.object({status:z.enum(['pending','published','rejected'])}).parse(request.body);const actor=actorOf(request);const current=await pool.query(`SELECT pr.*,p.vendor_id FROM product_reviews pr JOIN products p ON p.id=pr.product_id WHERE pr.id=$1`,[id]);const row=current.rows[0];if(!row)throw notFound('Məhsul rəyi');if(actor.vendorIds.length)assertVendorScope(actor,row.vendor_id);else assertStoreScope(actor,row.store_id);
    const data=await withTransaction(async(client)=>{const result=await client.query('UPDATE product_reviews SET status=$2 WHERE id=$1 RETURNING *',[id,input.status]);await writeAudit(client,{actorUserId:actor.userId,storeId:row.store_id,vendorId:row.vendor_id,action:'product.review.status.update',entityType:'product_review',entityId:id,beforeData:{status:row.status},afterData:{status:input.status},requestId:request.id});return result.rows[0];});return{data};
  });

  app.post('/inventory/adjust', { preHandler: app.requirePermission('inventory.manage') }, async (request) => {
    const input=inventoryInput.parse(request.body); const actor=actorOf(request);
    const scope=await pool.query(`SELECT p.vendor_id,w.store_id,v.store_id AS product_store_id FROM product_variants pv JOIN products p ON p.id=pv.product_id JOIN vendors v ON v.id=p.vendor_id JOIN warehouses w ON w.id=$2 WHERE pv.id=$1`,[input.variantId,input.warehouseId]); const row=scope.rows[0]; if(!row||row.store_id!==row.product_store_id) throw badRequest('INVENTORY_SCOPE_INVALID','Variant və anbar eyni mağazaya aid deyil'); if(actor.vendorIds.length)assertVendorScope(actor,row.vendor_id);else assertStoreScope(actor,row.store_id);
    const data=await withTransaction(async(client)=>{const locked=await client.query('SELECT quantity,reserved FROM inventory WHERE variant_id=$1 AND warehouse_id=$2 FOR UPDATE',[input.variantId,input.warehouseId]);const next=Number(locked.rows[0]?.quantity??0)+input.quantityDelta;if(next<Number(locked.rows[0]?.reserved??0))throw badRequest('INSUFFICIENT_STOCK','Yeni stok rezerv sayından az ola bilməz');const result=await client.query(`INSERT INTO inventory(variant_id,warehouse_id,quantity) VALUES($1,$2,$3) ON CONFLICT(variant_id,warehouse_id) DO UPDATE SET quantity=$3,updated_at=now() RETURNING *`,[input.variantId,input.warehouseId,next]);await client.query(`INSERT INTO inventory_movements(variant_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,actor_user_id) VALUES($1,$2,'adjustment',$3,'manual',$4,$5,$6)`,[input.variantId,input.warehouseId,input.quantityDelta,input.referenceId??request.id,input.note,actor.userId]);return result.rows[0];}); return {data};
  });
}
