import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { actorOf, assertStoreScope } from '../core/scope.js';
import { badRequest, forbidden, notFound } from '../core/errors.js';
import { paginationMeta, paginationSchema } from '../core/pagination.js';
import { slugify } from '../core/slug.js';
import { writeAudit } from '../core/audit.js';

const publicationStatus=z.enum(['draft','review','published','archived']);
const listingStatus=z.enum(['draft','review','published','rejected','expired','archived']);
const journalInput=z.object({storeId:z.uuid(),issueNumber:z.string().trim().min(1).max(80),title:z.string().trim().min(2).max(240),slug:z.string().trim().max(220).optional(),description:z.string().trim().max(5000).default(''),coverAssetId:z.uuid().nullable().optional(),pdfAssetId:z.uuid().nullable().optional()});
const journalUpdate=journalInput.omit({storeId:true}).partial();
const classifiedBase=z.object({storeId:z.uuid(),vendorId:z.uuid().nullable().optional(),category:z.enum(['product','service','property','vehicle','other']),serviceCategoryId:z.uuid().nullable().optional(),title:z.string().trim().min(2).max(240),slug:z.string().trim().max(220).optional(),description:z.string().trim().min(2).max(10000),price:z.coerce.number().min(0).max(999999999999).nullable().optional(),currency:z.string().trim().length(3).transform((value)=>value.toUpperCase()).default('AZN'),phone:z.string().trim().max(50).optional(),email:z.email().optional(),city:z.string().trim().max(120).optional(),address:z.string().trim().max(500).optional(),expiresAt:z.iso.datetime().nullable().optional(),mediaIds:z.array(z.uuid()).max(20).default([])});
const classifiedInput=classifiedBase.refine((value)=>Boolean(value.phone||value.email),{message:'Telefon və ya e-poçt daxil edilməlidir',path:['phone']}).refine((value)=>value.category!=='service'||Boolean(value.serviceCategoryId),{message:'Xidmət kateqoriyası seçilməlidir',path:['serviceCategoryId']});
const classifiedUpdate=classifiedBase.omit({storeId:true}).partial().refine((value)=>value.phone===undefined&&value.email===undefined||Boolean(value.phone||value.email),{message:'Telefon və ya e-poçt daxil edilməlidir',path:['phone']});
const recordStatus=z.enum(['active','inactive','archived']);
const serviceCategoryBase=z.object({storeId:z.uuid(),parentId:z.uuid().nullable().optional(),name:z.string().trim().min(2).max(160),slug:z.string().trim().max(180).optional(),description:z.string().trim().max(5000).default(''),imageAssetId:z.uuid().nullable().optional(),position:z.coerce.number().int().min(0).max(10000).default(0),status:recordStatus.default('active'),seoTitle:z.string().trim().max(70).nullable().optional(),seoDescription:z.string().trim().max(170).nullable().optional()});
const serviceCategoryUpdate=serviceCategoryBase.omit({storeId:true}).partial();

async function validateMedia(storeId:string,ids:string[],kind:'image'|'pdf'|'any'='any'){
  if(!ids.length)return;
  const result=await pool.query('SELECT id,mime_type FROM media_assets WHERE store_id=$1 AND id=ANY($2::uuid[])',[storeId,ids]);
  if(result.rowCount!==new Set(ids).size)throw badRequest('MEDIA_SCOPE_INVALID','Seçilən media fayllarından biri bu mağazaya aid deyil');
  if(kind==='image'&&result.rows.some((item)=>!String(item.mime_type).startsWith('image/')))throw badRequest('MEDIA_TYPE_INVALID','Örtük üçün şəkil faylı seçilməlidir');
  if(kind==='pdf'&&result.rows.some((item)=>item.mime_type!=='application/pdf'))throw badRequest('MEDIA_TYPE_INVALID','Jurnal faylı PDF formatında olmalıdır');
}

async function validateVendor(storeId:string,vendorId?:string|null){
  if(!vendorId)return;
  const result=await pool.query('SELECT id FROM vendors WHERE id=$1 AND store_id=$2 AND deleted_at IS NULL',[vendorId,storeId]);
  if(!result.rows[0])throw badRequest('VENDOR_SCOPE_INVALID','Seçilən satıcı bu mağazaya aid deyil');
}

function canManageAllClassifieds(actor:ReturnType<typeof actorOf>):boolean{
  return actor.isSuperAdmin||actor.permissions.has('classifieds.moderate')||actor.permissions.has('service_categories.manage');
}

function assertClassifiedScope(actor:ReturnType<typeof actorOf>,vendorId:string|null):void{
  if(canManageAllClassifieds(actor))return;
  if(!vendorId||!actor.vendorIds.includes(vendorId))throw forbidden('Yalnız öz elanlarınızı idarə edə bilərsiniz');
}

async function validateServiceCategory(storeId:string,id?:string|null):Promise<void>{
  if(!id)return;
  const result=await pool.query(`SELECT sc.id,EXISTS(SELECT 1 FROM service_categories child WHERE child.parent_id=sc.id AND child.status='active') AS has_children FROM service_categories sc WHERE sc.id=$1 AND sc.store_id=$2 AND sc.status='active'`,[id,storeId]);
  if(!result.rows[0])throw badRequest('SERVICE_CATEGORY_INVALID','Seçilən xidmət kateqoriyası bu mağazaya aid deyil');
  if(result.rows[0].has_children)throw badRequest('SERVICE_CATEGORY_LEAF_REQUIRED','Xidmət üçün ən son alt kateqoriyanı seçin');
}

async function validateServiceCategoryParent(storeId:string,parentId?:string|null,currentId?:string):Promise<void>{
  if(!parentId)return;
  const parent=await pool.query(`WITH RECURSIVE ancestors AS (
    SELECT id,parent_id,0 AS depth FROM service_categories WHERE id=$1 AND store_id=$2
    UNION ALL SELECT sc.id,sc.parent_id,a.depth+1 FROM service_categories sc JOIN ancestors a ON a.parent_id=sc.id
  ) SELECT max(depth)::int AS depth,count(*)::int AS count FROM ancestors`,[parentId,storeId]);
  if(!parent.rows[0]||Number(parent.rows[0].count)===0)throw badRequest('SERVICE_CATEGORY_PARENT_INVALID','Üst kateqoriya bu mağazaya aid deyil');
  if(Number(parent.rows[0].depth)>=2)throw badRequest('SERVICE_CATEGORY_DEPTH_INVALID','Xidmət kateqoriyası ən çox üç səviyyəli ola bilər');
  if(currentId){
    if(parentId===currentId)throw badRequest('SERVICE_CATEGORY_CYCLE','Kateqoriya öz daxilinə köçürülə bilməz');
    const cycle=await pool.query(`WITH RECURSIVE descendants AS (
      SELECT id FROM service_categories WHERE parent_id=$1
      UNION ALL SELECT sc.id FROM service_categories sc JOIN descendants d ON sc.parent_id=d.id
    ) SELECT 1 FROM descendants WHERE id=$2 LIMIT 1`,[currentId,parentId]);
    if(cycle.rows[0])throw badRequest('SERVICE_CATEGORY_CYCLE','Kateqoriya öz alt kateqoriyasına köçürülə bilməz');
  }
}

export async function publishingRoutes(app:FastifyInstance):Promise<void>{
  app.get('/journal',{preHandler:app.requirePermission('journal.read')},async(request)=>{
    const query=paginationSchema.extend({storeId:z.uuid().optional()}).parse(request.query);const actor=actorOf(request);const values:unknown[]=[];const where:string[]=[];
    if(query.storeId){assertStoreScope(actor,query.storeId);values.push(query.storeId);where.push(`ji.store_id=$${values.length}`);}else if(!actor.isSuperAdmin){values.push(actor.storeIds);where.push(`ji.store_id=ANY($${values.length}::uuid[])`);}
    if(query.search){values.push(`%${query.search}%`);where.push(`(ji.title ILIKE $${values.length} OR ji.issue_number ILIKE $${values.length} OR ji.slug ILIKE $${values.length})`);}if(query.status){publicationStatus.parse(query.status);values.push(query.status);where.push(`ji.status::text=$${values.length}`);}
    values.push(query.limit,(query.page-1)*query.limit);const result=await pool.query(`SELECT ji.*,cover.public_url AS cover_url,pdf.public_url AS pdf_url,count(*) OVER()::int AS total_count FROM journal_issues ji LEFT JOIN media_assets cover ON cover.id=ji.cover_asset_id LEFT JOIN media_assets pdf ON pdf.id=ji.pdf_asset_id${where.length?` WHERE ${where.join(' AND ')}`:''} ORDER BY ji.created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);const total=Number(result.rows[0]?.total_count??0);return{data:result.rows.map(({total_count:_,...row})=>row),meta:paginationMeta(query.page,query.limit,total)};
  });

  app.get('/journal/:id',{preHandler:app.requirePermission('journal.read')},async(request)=>{const {id}=z.object({id:z.uuid()}).parse(request.params);const actor=actorOf(request);const result=await pool.query('SELECT * FROM journal_issues WHERE id=$1',[id]);const row=result.rows[0];if(!row)throw notFound('Jurnal buraxılışı');assertStoreScope(actor,row.store_id);return{data:row};});

  app.post('/journal',{preHandler:app.requirePermission('journal.create')},async(request,reply)=>{const input=journalInput.parse(request.body);const actor=actorOf(request);assertStoreScope(actor,input.storeId);await validateMedia(input.storeId,input.coverAssetId?[input.coverAssetId]:[],'image');await validateMedia(input.storeId,input.pdfAssetId?[input.pdfAssetId]:[],'pdf');const row=await withTransaction(async(client)=>{const result=await client.query(`INSERT INTO journal_issues(store_id,issue_number,title,slug,description,cover_asset_id,pdf_asset_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[input.storeId,input.issueNumber,input.title,slugify(input.slug??input.title),input.description,input.coverAssetId??null,input.pdfAssetId??null]);await writeAudit(client,{actorUserId:actor.userId,storeId:input.storeId,action:'journal.create',entityType:'journal_issue',entityId:result.rows[0].id,afterData:result.rows[0],requestId:request.id});return result.rows[0];});return reply.code(201).send({data:row});});

  app.patch('/journal/:id',{preHandler:app.requirePermission('journal.update')},async(request)=>{const {id}=z.object({id:z.uuid()}).parse(request.params);const input=journalUpdate.parse(request.body);const actor=actorOf(request);const current=await pool.query('SELECT * FROM journal_issues WHERE id=$1',[id]);const before=current.rows[0];if(!before)throw notFound('Jurnal buraxılışı');assertStoreScope(actor,before.store_id);await validateMedia(before.store_id,input.coverAssetId?[input.coverAssetId]:[],'image');await validateMedia(before.store_id,input.pdfAssetId?[input.pdfAssetId]:[],'pdf');const row=await withTransaction(async(client)=>{const result=await client.query(`UPDATE journal_issues SET issue_number=coalesce($2,issue_number),title=coalesce($3,title),slug=coalesce($4,slug),description=coalesce($5,description),cover_asset_id=CASE WHEN $6 THEN $7 ELSE cover_asset_id END,pdf_asset_id=CASE WHEN $8 THEN $9 ELSE pdf_asset_id END,status=CASE WHEN status='published' THEN 'review'::publication_status ELSE status END WHERE id=$1 RETURNING *`,[id,input.issueNumber??null,input.title??null,input.slug?slugify(input.slug):null,input.description??null,Object.hasOwn(input,'coverAssetId'),input.coverAssetId??null,Object.hasOwn(input,'pdfAssetId'),input.pdfAssetId??null]);await writeAudit(client,{actorUserId:actor.userId,storeId:before.store_id,action:'journal.update',entityType:'journal_issue',entityId:id,beforeData:before,afterData:result.rows[0],requestId:request.id});return result.rows[0];});return{data:row};});

  app.patch('/journal/:id/status',{preHandler:app.requirePermission('journal.publish')},async(request)=>{const {id}=z.object({id:z.uuid()}).parse(request.params);const input=z.object({status:publicationStatus}).parse(request.body);const actor=actorOf(request);const current=await pool.query('SELECT * FROM journal_issues WHERE id=$1',[id]);const before=current.rows[0];if(!before)throw notFound('Jurnal buraxılışı');assertStoreScope(actor,before.store_id);if(input.status==='published'&&(!before.cover_asset_id||!before.pdf_asset_id))throw badRequest('PUBLISH_VALIDATION','Dərc üçün jurnal örtüyü və PDF faylı seçilməlidir');const row=await withTransaction(async(client)=>{const result=await client.query(`UPDATE journal_issues SET status=$2::publication_status,published_at=CASE WHEN $2='published' THEN coalesce(published_at,now()) ELSE published_at END WHERE id=$1 RETURNING *`,[id,input.status]);await writeAudit(client,{actorUserId:actor.userId,storeId:before.store_id,action:'journal.status.update',entityType:'journal_issue',entityId:id,beforeData:{status:before.status},afterData:{status:input.status},requestId:request.id});return result.rows[0];});return{data:row};});

  app.delete('/journal/:id',{preHandler:app.requirePermission('journal.delete')},async(request,reply)=>{const {id}=z.object({id:z.uuid()}).parse(request.params);const actor=actorOf(request);const current=await pool.query('SELECT * FROM journal_issues WHERE id=$1',[id]);const before=current.rows[0];if(!before)throw notFound('Jurnal buraxılışı');assertStoreScope(actor,before.store_id);await withTransaction(async(client)=>{await client.query(`UPDATE journal_issues SET status='archived' WHERE id=$1`,[id]);await writeAudit(client,{actorUserId:actor.userId,storeId:before.store_id,action:'journal.archive',entityType:'journal_issue',entityId:id,beforeData:before,afterData:{status:'archived'},requestId:request.id});});return reply.code(204).send();});

  app.get('/service-categories',{preHandler:app.requirePermission('classifieds.read')},async(request)=>{
    const query=z.object({storeId:z.uuid().optional(),status:recordStatus.optional(),search:z.string().trim().max(100).optional()}).parse(request.query);
    const actor=actorOf(request);
    const storeId=query.storeId??actor.storeIds[0];
    if(!storeId)throw badRequest('STORE_REQUIRED','Mağaza seçilməlidir');
    assertStoreScope(actor,storeId);
    const result=await pool.query(`WITH RECURSIVE tree AS (
      SELECT sc.*,0 AS depth,ARRAY[sc.name]::text[] AS path_names,ARRAY[sc.slug]::text[] AS path_slugs
      FROM service_categories sc WHERE sc.store_id=$1 AND sc.parent_id IS NULL
      UNION ALL
      SELECT child.*,tree.depth+1,tree.path_names||child.name,tree.path_slugs||child.slug
      FROM service_categories child JOIN tree ON child.parent_id=tree.id
    )
    SELECT tree.*,ma.public_url AS image_url,
      (SELECT count(*)::int FROM classified_listings cl WHERE cl.service_category_id=tree.id AND cl.deleted_at IS NULL) AS listing_count
    FROM tree LEFT JOIN media_assets ma ON ma.id=tree.image_asset_id
    WHERE ($2::text IS NULL OR tree.status::text=$2)
      AND ($3::text IS NULL OR tree.name ILIKE '%'||$3||'%' OR tree.slug ILIKE '%'||$3||'%')
    ORDER BY tree.path_slugs,tree.position,tree.name`,[storeId,query.status??null,query.search??null]);
    return{data:result.rows};
  });

  app.post('/service-categories',{preHandler:app.requirePermission('service_categories.manage')},async(request,reply)=>{
    const input=serviceCategoryBase.parse(request.body);const actor=actorOf(request);assertStoreScope(actor,input.storeId);
    await validateServiceCategoryParent(input.storeId,input.parentId);await validateMedia(input.storeId,input.imageAssetId?[input.imageAssetId]:[],'image');
    const result=await pool.query(`INSERT INTO service_categories(store_id,parent_id,name,slug,description,image_asset_id,position,status,seo_title,seo_description)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::record_status,$9,$10) RETURNING *`,[input.storeId,input.parentId??null,input.name,slugify(input.slug??input.name),input.description,input.imageAssetId??null,input.position,input.status,input.seoTitle??null,input.seoDescription??null]);
    return reply.code(201).send({data:result.rows[0]});
  });

  app.patch('/service-categories/:id',{preHandler:app.requirePermission('service_categories.manage')},async(request)=>{
    const {id}=z.object({id:z.uuid()}).parse(request.params);const input=serviceCategoryUpdate.parse(request.body);const actor=actorOf(request);
    const current=await pool.query('SELECT * FROM service_categories WHERE id=$1',[id]);const before=current.rows[0];if(!before)throw notFound('Xidmət kateqoriyası');assertStoreScope(actor,before.store_id);
    if(Object.hasOwn(input,'parentId'))await validateServiceCategoryParent(before.store_id,input.parentId,id);
    if(Object.hasOwn(input,'imageAssetId'))await validateMedia(before.store_id,input.imageAssetId?[input.imageAssetId]:[],'image');
    const result=await pool.query(`UPDATE service_categories SET
      parent_id=CASE WHEN $2 THEN $3 ELSE parent_id END,name=coalesce($4,name),slug=coalesce($5,slug),
      description=coalesce($6,description),image_asset_id=CASE WHEN $7 THEN $8 ELSE image_asset_id END,
      position=coalesce($9,position),status=coalesce($10::record_status,status),seo_title=CASE WHEN $11 THEN $12 ELSE seo_title END,
      seo_description=CASE WHEN $13 THEN $14 ELSE seo_description END WHERE id=$1 RETURNING *`,[id,Object.hasOwn(input,'parentId'),input.parentId??null,input.name??null,input.slug?slugify(input.slug):null,input.description??null,Object.hasOwn(input,'imageAssetId'),input.imageAssetId??null,input.position??null,input.status??null,Object.hasOwn(input,'seoTitle'),input.seoTitle??null,Object.hasOwn(input,'seoDescription'),input.seoDescription??null]);
    return{data:result.rows[0]};
  });

  app.delete('/service-categories/:id',{preHandler:app.requirePermission('service_categories.manage')},async(request,reply)=>{
    const {id}=z.object({id:z.uuid()}).parse(request.params);const actor=actorOf(request);const current=await pool.query('SELECT * FROM service_categories WHERE id=$1',[id]);const before=current.rows[0];if(!before)throw notFound('Xidmət kateqoriyası');assertStoreScope(actor,before.store_id);
    const used=await pool.query(`SELECT EXISTS(SELECT 1 FROM service_categories WHERE parent_id=$1 AND status='active') AS has_children,
      EXISTS(SELECT 1 FROM classified_listings WHERE service_category_id=$1 AND deleted_at IS NULL) AS has_listings`,[id]);
    if(used.rows[0].has_children||used.rows[0].has_listings)throw badRequest('SERVICE_CATEGORY_IN_USE','Əvvəlcə alt kateqoriyaları və bağlı elanları başqa kateqoriyaya köçürün');
    await pool.query("UPDATE service_categories SET status='archived' WHERE id=$1",[id]);return reply.code(204).send();
  });

  app.get('/classifieds',{preHandler:app.requirePermission('classifieds.read')},async(request)=>{
    const query=paginationSchema.extend({storeId:z.uuid().optional(),category:z.enum(['product','service','property','vehicle','other']).optional(),serviceCategoryId:z.uuid().optional()}).parse(request.query);
    const actor=actorOf(request);const values:unknown[]=[];const where=['cl.deleted_at IS NULL'];
    if(query.storeId){assertStoreScope(actor,query.storeId);values.push(query.storeId);where.push(`cl.store_id=$${values.length}`);}else if(!actor.isSuperAdmin){values.push(actor.storeIds);where.push(`cl.store_id=ANY($${values.length}::uuid[])`);}
    if(!canManageAllClassifieds(actor)){values.push(actor.vendorIds);where.push(`cl.vendor_id=ANY($${values.length}::uuid[])`);}
    if(query.search){values.push(`%${query.search}%`);where.push(`(cl.title ILIKE $${values.length} OR cl.slug ILIKE $${values.length})`);}
    if(query.status){listingStatus.parse(query.status);values.push(query.status);where.push(`cl.status::text=$${values.length}`);}
    if(query.category){values.push(query.category);where.push(`cl.category=$${values.length}`);}
    if(query.serviceCategoryId){values.push(query.serviceCategoryId);where.push(`cl.service_category_id=$${values.length}`);}
    values.push(query.limit,(query.page-1)*query.limit);
    const result=await pool.query(`SELECT cl.*,v.display_name AS vendor_name,sc.name AS service_category_name,ma.public_url AS image_url,count(*) OVER()::int AS total_count
      FROM classified_listings cl LEFT JOIN vendors v ON v.id=cl.vendor_id LEFT JOIN service_categories sc ON sc.id=cl.service_category_id
      LEFT JOIN classified_media cm ON cm.listing_id=cl.id AND cm.position=0 LEFT JOIN media_assets ma ON ma.id=cm.media_asset_id
      WHERE ${where.join(' AND ')} ORDER BY cl.created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);
    const total=Number(result.rows[0]?.total_count??0);return{data:result.rows.map(({total_count:_,...row})=>row),meta:paginationMeta(query.page,query.limit,total)};
  });

  app.get('/classifieds/:id',{preHandler:app.requirePermission('classifieds.read')},async(request)=>{
    const {id}=z.object({id:z.uuid()}).parse(request.params);const actor=actorOf(request);
    const result=await pool.query(`SELECT cl.*,sc.name AS service_category_name,coalesce(json_agg(json_build_object('id',ma.id,'publicUrl',ma.public_url,'title',ma.title) ORDER BY cm.position) FILTER(WHERE ma.id IS NOT NULL),'[]') AS media
      FROM classified_listings cl LEFT JOIN service_categories sc ON sc.id=cl.service_category_id LEFT JOIN classified_media cm ON cm.listing_id=cl.id LEFT JOIN media_assets ma ON ma.id=cm.media_asset_id
      WHERE cl.id=$1 AND cl.deleted_at IS NULL GROUP BY cl.id,sc.name`,[id]);
    const row=result.rows[0];if(!row)throw notFound('Elan');assertStoreScope(actor,row.store_id);assertClassifiedScope(actor,row.vendor_id);return{data:row};
  });

  app.post('/classifieds',{preHandler:app.requirePermission('classifieds.create')},async(request,reply)=>{
    const input=classifiedInput.parse(request.body);const actor=actorOf(request);assertStoreScope(actor,input.storeId);
    const vendorId=canManageAllClassifieds(actor)?input.vendorId??null:actor.vendorIds[0]??null;
    if(!canManageAllClassifieds(actor)&&!vendorId)throw forbidden('Elan yaratmaq üçün satıcı hesabı tələb olunur');
    await validateVendor(input.storeId,vendorId);await validateServiceCategory(input.storeId,input.category==='service'?input.serviceCategoryId:null);await validateMedia(input.storeId,input.mediaIds,'image');
    const row=await withTransaction(async(client)=>{
      const result=await client.query(`INSERT INTO classified_listings(store_id,user_id,vendor_id,category,service_category_id,title,slug,description,price,currency,contact_data,location_data,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[input.storeId,actor.userId,vendorId,input.category,input.category==='service'?input.serviceCategoryId:null,input.title,slugify(input.slug??input.title),input.description,input.price??null,input.currency,JSON.stringify({phone:input.phone||null,email:input.email||null}),JSON.stringify({city:input.city||null,address:input.address||null}),input.expiresAt??null]);
      for(const [position,mediaId] of input.mediaIds.entries())await client.query('INSERT INTO classified_media(listing_id,media_asset_id,position) VALUES($1,$2,$3)',[result.rows[0].id,mediaId,position]);
      await writeAudit(client,{actorUserId:actor.userId,storeId:input.storeId,vendorId,action:'classified.create',entityType:'classified_listing',entityId:result.rows[0].id,afterData:result.rows[0],requestId:request.id});return result.rows[0];
    });return reply.code(201).send({data:row});
  });

  app.patch('/classifieds/:id',{preHandler:app.requirePermission('classifieds.update')},async(request)=>{
    const {id}=z.object({id:z.uuid()}).parse(request.params);const input=classifiedUpdate.parse(request.body);const actor=actorOf(request);
    const current=await pool.query('SELECT * FROM classified_listings WHERE id=$1 AND deleted_at IS NULL',[id]);const before=current.rows[0];if(!before)throw notFound('Elan');assertStoreScope(actor,before.store_id);assertClassifiedScope(actor,before.vendor_id);
    const vendorId=canManageAllClassifieds(actor)&&Object.hasOwn(input,'vendorId')?input.vendorId??null:before.vendor_id;
    const category=input.category??before.category;const serviceCategoryId=category==='service'?(Object.hasOwn(input,'serviceCategoryId')?input.serviceCategoryId:before.service_category_id):null;
    if(category==='service'&&!serviceCategoryId)throw badRequest('SERVICE_CATEGORY_REQUIRED','Xidmət kateqoriyası seçilməlidir');
    await validateVendor(before.store_id,vendorId);await validateServiceCategory(before.store_id,serviceCategoryId);if(input.mediaIds)await validateMedia(before.store_id,input.mediaIds,'image');
    const previousContact=before.contact_data||{};const previousLocation=before.location_data||{};
    const row=await withTransaction(async(client)=>{
      const result=await client.query(`UPDATE classified_listings SET vendor_id=$2,category=$3,service_category_id=$4,title=coalesce($5,title),slug=coalesce($6,slug),description=coalesce($7,description),
        price=CASE WHEN $8 THEN $9 ELSE price END,currency=coalesce($10,currency),contact_data=$11,location_data=$12,
        expires_at=CASE WHEN $13 THEN $14 ELSE expires_at END,status=CASE WHEN status='published' THEN 'review'::listing_status ELSE status END WHERE id=$1 RETURNING *`,
        [id,vendorId,category,serviceCategoryId,input.title??null,input.slug?slugify(input.slug):null,input.description??null,Object.hasOwn(input,'price'),input.price??null,input.currency??null,JSON.stringify({phone:input.phone??previousContact.phone??null,email:input.email??previousContact.email??null}),JSON.stringify({city:input.city??previousLocation.city??null,address:input.address??previousLocation.address??null}),Object.hasOwn(input,'expiresAt'),input.expiresAt??null]);
      if(input.mediaIds){await client.query('DELETE FROM classified_media WHERE listing_id=$1',[id]);for(const [position,mediaId] of input.mediaIds.entries())await client.query('INSERT INTO classified_media(listing_id,media_asset_id,position) VALUES($1,$2,$3)',[id,mediaId,position]);}
      await writeAudit(client,{actorUserId:actor.userId,storeId:before.store_id,vendorId:result.rows[0].vendor_id,action:'classified.update',entityType:'classified_listing',entityId:id,beforeData:before,afterData:result.rows[0],requestId:request.id});return result.rows[0];
    });return{data:row};
  });

  app.patch('/classifieds/:id/status',{preHandler:app.requirePermission('classifieds.moderate')},async(request)=>{
    const {id}=z.object({id:z.uuid()}).parse(request.params);const input=z.object({status:listingStatus}).parse(request.body);const actor=actorOf(request);
    const current=await pool.query('SELECT * FROM classified_listings WHERE id=$1 AND deleted_at IS NULL',[id]);const before=current.rows[0];if(!before)throw notFound('Elan');assertStoreScope(actor,before.store_id);
    if(input.status==='published'&&(!before.contact_data?.phone&&!before.contact_data?.email))throw badRequest('PUBLISH_VALIDATION','Dərc üçün əlaqə məlumatı tələb olunur');
    if(input.status==='published'&&before.category==='service'&&!before.service_category_id)throw badRequest('PUBLISH_VALIDATION','Dərc üçün xidmət kateqoriyası tələb olunur');
    const row=await withTransaction(async(client)=>{const result=await client.query('UPDATE classified_listings SET status=$2::listing_status,reviewed_by=$3 WHERE id=$1 RETURNING *',[id,input.status,actor.userId]);await writeAudit(client,{actorUserId:actor.userId,storeId:before.store_id,vendorId:before.vendor_id,action:'classified.status.update',entityType:'classified_listing',entityId:id,beforeData:{status:before.status},afterData:{status:input.status},requestId:request.id});return result.rows[0];});return{data:row};
  });

  app.delete('/classifieds/:id',{preHandler:app.requirePermission('classifieds.delete')},async(request,reply)=>{
    const {id}=z.object({id:z.uuid()}).parse(request.params);const actor=actorOf(request);const current=await pool.query('SELECT * FROM classified_listings WHERE id=$1 AND deleted_at IS NULL',[id]);const before=current.rows[0];if(!before)throw notFound('Elan');assertStoreScope(actor,before.store_id);assertClassifiedScope(actor,before.vendor_id);
    await withTransaction(async(client)=>{await client.query("UPDATE classified_listings SET status='archived',deleted_at=now() WHERE id=$1",[id]);await writeAudit(client,{actorUserId:actor.userId,storeId:before.store_id,vendorId:before.vendor_id,action:'classified.archive',entityType:'classified_listing',entityId:id,beforeData:before,afterData:{status:'archived'},requestId:request.id});});return reply.code(204).send();
  });

}
