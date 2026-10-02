import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { notFound } from '../core/errors.js';
import { navigationPaths } from '../web/navigation.js';
import { normalizedEditorConfig } from '../core/site-editor-config.js';

const searchLetterMap:Record<string,string>={'ə':'e','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u','ç':'c'};
const normalizeSearchTerm=(value:string)=>value.toLocaleLowerCase('az-AZ').replace(/[əğıöşüç]/g,(letter)=>searchLetterMap[letter]??letter);

async function store(){const result=await pool.query('SELECT id,code,name,locale,currency,settings FROM stores WHERE code=$1 AND status=\'active\'',[env.DEFAULT_STORE_CODE]);if(!result.rows[0])throw notFound('Store');return result.rows[0];}
export async function publicRoutes(app:FastifyInstance):Promise<void>{
  app.get('/home',async(_request,reply)=>{const s=await store();const[menus,categories,serviceCategories,brands,products,campaigns,posts,journal,editor]=await Promise.all([
    pool.query(`SELECT m.code,m.name,jsonb_agg(jsonb_build_object('id',i.id,'parentId',i.parent_id,'label',i.label,'url',i.url,'position',i.position,'target',i.target) ORDER BY i.position) FILTER(WHERE i.id IS NOT NULL) AS items FROM navigation_menus m LEFT JOIN navigation_items i ON i.menu_id=m.id AND i.is_visible=true WHERE m.store_id=$1 AND m.locale=$2 GROUP BY m.id`,[s.id,s.locale]),
    pool.query(`WITH RECURSIVE tree AS (
      SELECT c.id,c.parent_id,c.name,c.slug,c.description,c.position,c.image_asset_id,0 AS depth,ARRAY[c.position] AS position_path,ARRAY[c.slug] AS path_slugs
      FROM categories c WHERE c.store_id=$1 AND c.parent_id IS NULL AND c.status='active'
      UNION ALL SELECT c.id,c.parent_id,c.name,c.slug,c.description,c.position,c.image_asset_id,tree.depth+1,tree.position_path||c.position,tree.path_slugs||c.slug
      FROM categories c JOIN tree ON c.parent_id=tree.id WHERE c.status='active' AND tree.depth<2
    ) SELECT tree.id,tree.parent_id,tree.name,tree.slug,tree.description,tree.position,tree.depth,tree.path_slugs,ma.public_url AS image_url,ma.alt_text
    FROM tree LEFT JOIN media_assets ma ON ma.id=tree.image_asset_id ORDER BY tree.position_path,tree.name LIMIT 100`,[s.id]),
    pool.query(`WITH RECURSIVE tree AS (
      SELECT sc.id,sc.parent_id,sc.name,sc.slug,sc.description,sc.position,sc.image_asset_id,0 AS depth,ARRAY[sc.position] AS position_path,ARRAY[sc.slug] AS path_slugs
      FROM service_categories sc WHERE sc.store_id=$1 AND sc.parent_id IS NULL AND sc.status='active'
      UNION ALL SELECT sc.id,sc.parent_id,sc.name,sc.slug,sc.description,sc.position,sc.image_asset_id,tree.depth+1,tree.position_path||sc.position,tree.path_slugs||sc.slug
      FROM service_categories sc JOIN tree ON sc.parent_id=tree.id WHERE sc.status='active' AND tree.depth<2
    ) SELECT tree.id,tree.parent_id,tree.name,tree.slug,tree.description,tree.position,tree.depth,tree.path_slugs,ma.public_url AS image_url,ma.alt_text,
      (SELECT count(*)::int FROM classified_listings cl WHERE cl.service_category_id=tree.id AND cl.status='published' AND cl.deleted_at IS NULL) AS listing_count
    FROM tree LEFT JOIN media_assets ma ON ma.id=tree.image_asset_id ORDER BY tree.position_path,tree.name LIMIT 200`,[s.id]),
    pool.query(`SELECT b.id,b.name,b.slug,b.website_url,ma.public_url AS logo_url,ma.alt_text FROM brands b LEFT JOIN media_assets ma ON ma.id=b.logo_asset_id WHERE b.store_id=$1 AND b.status='active' ORDER BY b.name LIMIT 200`,[s.id]),
    pool.query(`SELECT pl.id,p.id AS product_id,pl.title,pl.slug,pl.short_description,pl.description,pl.price,pl.compare_at_price,pl.currency,pl.seo_title,pl.seo_description,pl.is_featured,pl.is_popular,pl.is_top_pick,pl.display_position,pl.merchandising_badge,p.sku,p.attributes,p.product_type,v.display_name AS vendor_name,b.name AS brand_name,ma.public_url AS image_url,ma.alt_text,coalesce(vma.public_url,p.video_url) AS video_url,(SELECT pv.id FROM product_variants pv WHERE pv.product_id=p.id AND pv.status='active' ORDER BY pv.created_at LIMIT 1) AS variant_id,coalesce((SELECT sum(i.quantity-i.reserved) FROM product_variants pv JOIN inventory i ON i.variant_id=pv.id WHERE pv.product_id=p.id),0)::int AS stock,coalesce((SELECT round(avg(pr.rating)::numeric,1) FROM product_reviews pr WHERE pr.product_id=p.id AND pr.store_id=pl.store_id AND pr.status='published'),0)::float8 AS review_average,(SELECT count(*)::int FROM product_reviews pr WHERE pr.product_id=p.id AND pr.store_id=pl.store_id AND pr.status='published') AS review_count,coalesce((SELECT sum(oi.quantity)::int FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=p.id AND o.store_id=pl.store_id AND o.status NOT IN ('cancelled','refunded')),0) AS sales_count,coalesce((SELECT jsonb_agg(c.slug ORDER BY pc.is_primary DESC,c.position,c.name) FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=p.id AND c.status='active'),'[]'::jsonb) AS category_slugs FROM product_listings pl JOIN products p ON p.id=pl.product_id JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary LEFT JOIN media_assets ma ON ma.id=pm.media_asset_id LEFT JOIN media_assets vma ON vma.id=p.video_asset_id WHERE pl.store_id=$1 AND pl.locale=$2 AND pl.status='published' AND p.deleted_at IS NULL ORDER BY pl.display_position,pl.published_at DESC LIMIT 100`,[s.id,s.locale]),
    pool.query(`SELECT id,name,slug,description,campaign_type,starts_at,ends_at FROM campaigns WHERE store_id=$1 AND status='active' AND now() BETWEEN starts_at AND ends_at ORDER BY starts_at DESC LIMIT 8`,[s.id]),
    pool.query(`SELECT p.id,p.title,p.slug,p.excerpt,p.post_type,p.published_at,p.seo_title,p.seo_description,pc.name AS category_name,ma.public_url AS image_url,ma.alt_text FROM posts p LEFT JOIN post_categories pc ON pc.id=p.category_id LEFT JOIN media_assets ma ON ma.id=p.featured_asset_id WHERE p.store_id=$1 AND p.locale=$2 AND p.status='published' AND p.deleted_at IS NULL ORDER BY p.published_at DESC LIMIT 8`,[s.id,s.locale]),
    pool.query(`SELECT id,issue_number,title,slug,description,published_at FROM journal_issues WHERE store_id=$1 AND status='published' ORDER BY published_at DESC LIMIT 1`,[s.id]),
    pool.query(`SELECT published_content,published_version FROM site_editor_documents WHERE store_id=$1 AND scope='index'`,[s.id])
  ]);reply.header('Cache-Control','public, max-age=60, stale-while-revalidate=300');return{data:{store:s,menus:menus.rows,categories:categories.rows,serviceCategories:serviceCategories.rows,brands:brands.rows,products:products.rows,campaigns:campaigns.rows,posts:posts.rows,journal:journal.rows[0]??null,editor:{index:editor.rows[0]?.published_version?normalizedEditorConfig('index',editor.rows[0].published_content):null}}};});

  app.get('/search',async(request,reply)=>{
    const query=z.object({
      q:z.string().trim().min(2).max(100),
      limit:z.coerce.number().int().min(1).max(12).default(8)
    }).parse(request.query);
    const s=await store();
    const normalized=normalizeSearchTerm(query.q);
    const escaped=normalized.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_');
    const prefix=`${escaped}%`;
    const contains=`%${escaped}%`;
    const result=await pool.query(`
      SELECT
        pl.id,
        pl.title,
        pl.slug,
        pl.short_description,
        pl.price,
        pl.compare_at_price,
        pl.currency,
        p.sku,
        v.display_name AS vendor_name,
        b.name AS brand_name,
        ma.public_url AS image_url,
        ma.alt_text,
        coalesce(vma.public_url,p.video_url) AS video_url,
        (SELECT pv.id FROM product_variants pv WHERE pv.product_id=p.id AND pv.status='active' ORDER BY pv.created_at LIMIT 1) AS variant_id,
        coalesce((SELECT sum(i.quantity-i.reserved) FROM product_variants pv JOIN inventory i ON i.variant_id=pv.id WHERE pv.product_id=p.id),0)::int AS stock,
        coalesce((SELECT string_agg(DISTINCT c.name, ', ' ORDER BY c.name) FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=p.id AND c.status='active'),'') AS category_names,
        count(*) OVER()::int AS total_count
      FROM product_listings pl
      JOIN products p ON p.id=pl.product_id
      JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL
      LEFT JOIN brands b ON b.id=p.brand_id
      LEFT JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary
      LEFT JOIN media_assets ma ON ma.id=pm.media_asset_id
      LEFT JOIN media_assets vma ON vma.id=p.video_asset_id
      WHERE pl.store_id=$1
        AND pl.locale=$2
        AND pl.status='published'
        AND p.deleted_at IS NULL
        AND (
          translate(lower(pl.title),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $5 ESCAPE '\\'
          OR translate(lower(p.sku),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $5 ESCAPE '\\'
          OR translate(lower(coalesce(b.name,'')),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $5 ESCAPE '\\'
          OR translate(lower(v.display_name),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $5 ESCAPE '\\'
          OR translate(lower(coalesce(pl.short_description,'')),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $5 ESCAPE '\\'
        )
      ORDER BY
        CASE
          WHEN translate(lower(pl.title),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC')=$3 THEN 0
          WHEN translate(lower(pl.title),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $4 ESCAPE '\\' THEN 1
          WHEN translate(lower(coalesce(b.name,'')),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $4 ESCAPE '\\' THEN 2
          WHEN translate(lower(p.sku),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $4 ESCAPE '\\' THEN 3
          ELSE 4
        END,
        pl.published_at DESC
      LIMIT $6
    `,[s.id,s.locale,normalized,prefix,contains,query.limit]);
    const total=Number(result.rows[0]?.total_count??0);
    const products=result.rows.map(({total_count:_,...product})=>product);
    reply.header('Cache-Control','public, max-age=30, stale-while-revalidate=120');
    return{data:{products},meta:{query:query.q,total,limit:query.limit}};
  });

  app.get('/products/:slug',async(request,reply)=>{const s=await store();const slug=(request.params as{slug:string}).slug;const result=await pool.query(`SELECT pl.*,p.sku,p.attributes,p.product_type,coalesce(vma.public_url,p.video_url) AS video_url,v.display_name AS vendor_name,b.name AS brand_name,jsonb_agg(DISTINCT jsonb_build_object('url',ma.public_url,'alt',ma.alt_text,'position',pm.position)) FILTER(WHERE ma.id IS NOT NULL) AS media,(SELECT jsonb_agg(jsonb_build_object('id',pv.id,'sku',pv.sku,'title',pv.title,'status',pv.status) ORDER BY pv.created_at) FROM product_variants pv WHERE pv.product_id=p.id AND pv.status='active') AS variants FROM product_listings pl JOIN products p ON p.id=pl.product_id JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN product_media pm ON pm.product_id=p.id LEFT JOIN media_assets ma ON ma.id=pm.media_asset_id LEFT JOIN media_assets vma ON vma.id=p.video_asset_id WHERE pl.store_id=$1 AND pl.locale=$2 AND pl.slug=$3 AND pl.status='published' GROUP BY pl.id,p.id,v.id,b.id,vma.id`,[s.id,s.locale,slug]);if(!result.rows[0])throw notFound('Məhsul');reply.header('Cache-Control','public, max-age=60');return{data:result.rows[0]};});

  app.get('/products/:slug/reviews',async(request,reply)=>{
    const s=await store();
    const slug=z.string().min(2).max(220).parse((request.params as{slug:string}).slug);
    const product=await pool.query<{product_id:string}>(`
      SELECT pl.product_id FROM product_listings pl
      JOIN products p ON p.id=pl.product_id AND p.deleted_at IS NULL
      JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL
      WHERE pl.store_id=$1 AND pl.locale=$2 AND pl.slug=$3 AND pl.status='published'
    `,[s.id,s.locale,slug]);
    if(!product.rows[0])throw notFound('Məhsul');
    const[reviews,summary]=await Promise.all([
      pool.query(`SELECT id,author_name,rating,title,body,verified_purchase,created_at
        FROM product_reviews WHERE store_id=$1 AND product_id=$2 AND status='published'
        ORDER BY created_at DESC LIMIT 100`,[s.id,product.rows[0].product_id]),
      pool.query<{average:number;count:number}>(`SELECT coalesce(round(avg(rating)::numeric,1),0)::float8 AS average,
        count(*)::int AS count FROM product_reviews
        WHERE store_id=$1 AND product_id=$2 AND status='published'`,[s.id,product.rows[0].product_id])
    ]);
    reply.header('Cache-Control','public, max-age=30, stale-while-revalidate=120');
    return{data:{reviews:reviews.rows,summary:summary.rows[0]??{average:0,count:0}}};
  });

  app.get('/content/:slug',async(request,reply)=>{const s=await store();const slug=(request.params as{slug:string}).slug;const result=await pool.query(`SELECT 'page' AS content_type,id,title,slug,excerpt,content,seo_title,seo_description,canonical_url,robots_directive,schema_data,published_at FROM pages WHERE store_id=$1 AND locale=$2 AND slug=$3 AND status='published' AND deleted_at IS NULL UNION ALL SELECT 'post',id,title,slug,excerpt,content,seo_title,seo_description,canonical_url,robots_directive,schema_data,published_at FROM posts WHERE store_id=$1 AND locale=$2 AND slug=$3 AND status='published' AND deleted_at IS NULL LIMIT 1`,[s.id,s.locale,slug]);if(!result.rows[0])throw notFound('Kontent');reply.header('Cache-Control','public, max-age=60');return{data:result.rows[0]};});

  app.get('/sitemap.xml',async(_request,reply)=>{
    const s=await store();
    const[products,pages,posts,categories,serviceCategories]=await Promise.all([
      pool.query(`SELECT pl.slug,pl.updated_at FROM product_listings pl JOIN products p ON p.id=pl.product_id AND p.deleted_at IS NULL JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL WHERE pl.store_id=$1 AND pl.status='published'`,[s.id]),
      pool.query(`SELECT slug,updated_at FROM pages WHERE store_id=$1 AND status='published' AND robots_directive LIKE 'index%' AND deleted_at IS NULL`,[s.id]),
      pool.query(`SELECT slug,updated_at FROM posts WHERE store_id=$1 AND status='published' AND robots_directive LIKE 'index%' AND deleted_at IS NULL`,[s.id]),
      pool.query(`WITH RECURSIVE tree AS (
        SELECT id,parent_id,slug,updated_at,ARRAY[slug] AS path_slugs FROM categories
        WHERE store_id=$1 AND parent_id IS NULL AND status='active'
        UNION ALL SELECT c.id,c.parent_id,c.slug,c.updated_at,tree.path_slugs||c.slug
        FROM categories c JOIN tree ON c.parent_id=tree.id WHERE c.status='active'
      ) SELECT path_slugs,updated_at FROM tree`,[s.id]),
      pool.query(`WITH RECURSIVE tree AS (
        SELECT id,parent_id,slug,updated_at,ARRAY[slug] AS path_slugs FROM service_categories
        WHERE store_id=$1 AND parent_id IS NULL AND status='active'
        UNION ALL SELECT sc.id,sc.parent_id,sc.slug,sc.updated_at,tree.path_slugs||sc.slug
        FROM service_categories sc JOIN tree ON sc.parent_id=tree.id WHERE sc.status='active'
      ) SELECT path_slugs,updated_at FROM tree`,[s.id])
    ]);
    const origin=env.PUBLIC_ORIGIN.replace(/\/$/,'');
    const now=new Date().toISOString();
    const staticPaths=[...new Set(['/',...navigationPaths,'/haqqimizda/','/elaqe/','/faq/','/catdirilma/','/geri-qaytarma/','/mexfilik/','/istifade-sertleri/'])];
    const entries=[
      ...staticPaths.map(path=>({loc:`${origin}${path}`,lastmod:now})),
      ...categories.rows.map(x=>({loc:`${origin}/magaza/${x.path_slugs.map(encodeURIComponent).join('/')}/`,lastmod:x.updated_at})),
      ...serviceCategories.rows.map(x=>({loc:`${origin}/elanlar/xidmetler/${x.path_slugs.map(encodeURIComponent).join('/')}/`,lastmod:x.updated_at})),
      ...products.rows.map(x=>({loc:`${origin}/mehsul/${x.slug}/`,lastmod:x.updated_at})),
      ...pages.rows.filter(x=>!staticPaths.includes(`/${x.slug}/`)).map(x=>({loc:`${origin}/${x.slug}/`,lastmod:x.updated_at})),
      ...posts.rows.filter(x=>!staticPaths.includes(`/jurnal/${x.slug}/`)).map(x=>({loc:`${origin}/jurnal/${x.slug}/`,lastmod:x.updated_at}))
    ];
    const uniqueEntries=[...new Map(entries.map(entry=>[entry.loc,entry])).values()];
    const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${uniqueEntries.map(x=>`<url><loc>${x.loc}</loc><lastmod>${new Date(x.lastmod).toISOString()}</lastmod></url>`).join('')}</urlset>`;
    return reply.type('application/xml').header('Cache-Control','public, max-age=300').send(xml);
  });
}
