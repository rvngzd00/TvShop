import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { findNavigationSection, navigationSections, type NavigationChild, type NavigationSection } from './navigation.js';
import { renderProductDetail, type ProductReviewView } from './product-detail.js';
import { accountShell, breadcrumb, categoryNavigation, emptyState, escapeHtml, layout, money, productCard, type ProductView } from './templates.js';

const productSelect = `SELECT pl.id,pl.title,pl.slug,
  coalesce(nullif(pl.short_description,''),nullif(p.description,'')) AS short_description,
  coalesce(nullif(pl.description,''),nullif(p.description,''),nullif(pl.short_description,'')) AS description,
  pl.price,pl.compare_at_price,
  pl.currency,pl.seo_title,pl.seo_description,pl.canonical_url,pl.schema_data,p.id AS product_id,p.sku,p.attributes,
  p.product_type,v.display_name AS vendor_name,b.name AS brand_name,ma.public_url AS image_url,ma.alt_text,
  coalesce(vma.public_url,p.video_url) AS video_url,
  (SELECT pv.id FROM product_variants pv WHERE pv.product_id=p.id AND pv.status='active' ORDER BY pv.created_at LIMIT 1) AS variant_id,
  coalesce((SELECT sum(i.quantity-i.reserved) FROM product_variants pv JOIN inventory i ON i.variant_id=pv.id WHERE pv.product_id=p.id),0)::int AS stock
  FROM product_listings pl JOIN products p ON p.id=pl.product_id
  JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL
  LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary
  LEFT JOIN media_assets ma ON ma.id=pm.media_asset_id LEFT JOIN media_assets vma ON vma.id=p.video_asset_id`;
const searchLetterMap: Record<string, string> = { 'ə': 'e', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'ç': 'c' };
const normalizeSearchTerm = (value: string) => value.toLocaleLowerCase('az-AZ').replace(/[əğıöşüç]/g, (letter) => searchLetterMap[letter] ?? letter);
const requiredNavigationSection = (key: string): NavigationSection => {
  const section = findNavigationSection(key);
  if (!section) throw new Error(`Navigation section is missing: ${key}`);
  return section;
};

function sendHtml(reply: FastifyReply, html: string, status = 200, cacheControl?: string) {
  return reply.code(status).type('text/html; charset=utf-8').header(
    'Cache-Control',
    cacheControl ?? (status === 200 ? 'public, max-age=60, stale-while-revalidate=300' : 'no-store')
  ).send(html);
}

function pageHero(kicker: string, title: string, description: string): string {
  return `<section class="page-hero"><div class="page-container"><p>${escapeHtml(kicker)}</p><h1>${escapeHtml(title)}</h1><div>${escapeHtml(description)}</div></div></section>`;
}

export function notFoundPage(pathname: string): string {
  return layout({
    title: 'Səhifə tapılmadı — TVShop',
    description: 'Axtardığınız səhifə mövcud deyil və ya ünvanı dəyişib.',
    path: pathname,
    robots: 'noindex,follow',
    content: `<section class="db-not-found"><div class="page-container db-not-found-layout">
      <div class="db-not-found-visual" aria-hidden="true"><span>4</span><i><b></b></i><span>4</span></div>
      <div class="db-not-found-content">
        <p class="db-not-found-kicker">SƏHİFƏ TAPILMADI</p>
        <h1>Görünür, bu fürsət başqa ünvana köçüb.</h1>
        <p>Axtardığınız səhifə silinmiş, adı dəyişmiş və ya keçid yanlış yazılmış ola bilər. Axtarışdan istifadə edin və ya əsas bölmələrdən birinə keçin.</p>
        <form class="db-not-found-search" action="/magaza/" method="get" role="search">
          <label class="sr-only" for="not-found-search">Məhsul axtarışı</label>
          <input id="not-found-search" name="axtaris" type="search" placeholder="Məhsul və ya brend axtarın" autocomplete="off">
          <button type="submit">Axtar</button>
        </form>
        <div class="db-not-found-actions"><a class="page-primary" href="/">Ana səhifəyə qayıt</a><a href="/magaza/">Mağazaya bax</a></div>
      </div>
    </div><div class="page-container"><nav class="db-not-found-links" aria-label="Faydalı keçidlər"><a href="/endirimler/"><strong>Endirimlər</strong><span>Aktual fürsətlərə baxın</span></a><a href="/jurnal/"><strong>Jurnal</strong><span>Şəhərin yeniliklərini oxuyun</span></a><a href="/elaqe/"><strong>Dəstək</strong><span>Bizimlə əlaqə saxlayın</span></a></nav></div></section>`
  });
}

function renderContentBlocks(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content.map((raw) => {
    if (!raw || typeof raw !== 'object') return '';
    const block = raw as Record<string, unknown>;
    const data = block['data'] && typeof block['data'] === 'object' ? block['data'] as Record<string, unknown> : {};
    if (block['type'] === 'heading') return `<h2>${escapeHtml(data['text'])}</h2>`;
    if (block['type'] === 'list' && Array.isArray(data['items'])) return `<ul>${data['items'].map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    if (block['type'] === 'quote') return `<blockquote>${escapeHtml(data['text'])}</blockquote>`;
    return `<p>${escapeHtml(data['text'] ?? data['html'] ?? '')}</p>`;
  }).join('');
}

function categorySchemas(section: NavigationSection, child?: NavigationChild): Array<Record<string, unknown>> {
  const origin = env.PUBLIC_ORIGIN.replace(/\/$/, '');
  const path = child?.href ?? section.href;
  const name = child ? `${child.label} — ${section.label}` : section.label;
  const description = child?.description ?? section.description;
  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Ana səhifə', item: `${origin}/` },
    { '@type': 'ListItem', position: 2, name: section.label, item: `${origin}${section.href}` }
  ];
  if (child) breadcrumbItems.push({ '@type': 'ListItem', position: 3, name: child.label, item: `${origin}${child.href}` });
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name,
      description,
      url: `${origin}${path}`,
      isPartOf: { '@type': 'WebSite', name: 'TVShop', url: origin },
      about: { '@type': 'Thing', name: child?.label ?? section.label }
    },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbItems }
  ];
}

function categoryContext(section: NavigationSection, child: NavigationChild): string {
  return `<div class="page-container">${breadcrumb([[section.label, section.href], [child.label]])}</div>${categoryNavigation(section, child.slug)}`;
}

type DatabaseCategory = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string;
  seo_title: string | null;
  seo_description: string | null;
  image_url: string | null;
  image_alt: string | null;
  depth: number;
  path_slugs: string[];
  path_names: string[];
};

type StoreCategoryOption = DatabaseCategory & { product_count: number };

function storeCategoryHref(category: Pick<DatabaseCategory, 'path_slugs'>): string {
  return `/magaza/${category.path_slugs.map(encodeURIComponent).join('/')}/`;
}

function renderStoreCategoryExplorer(category: DatabaseCategory, categories: StoreCategoryOption[]): string {
  const directChildren = categories.filter((item) => item.parent_id === category.id);
  const visibleItems = category.depth === 2
    ? categories.filter((item) => item.parent_id === category.parent_id && item.id !== category.id)
    : directChildren;
  if (!visibleItems.length) return '';

  const groups = visibleItems.map((item) => {
    const children = categories.filter((candidate) => candidate.parent_id === item.id);
    return `<article class="page-category-group">
      <a class="page-category-group-head" href="${storeCategoryHref(item)}">
        <span class="page-category-group-image"><img src="${escapeHtml(item.image_url || '/assets/wp-content/uploads/other-cat.webp')}" alt="" width="72" height="72" loading="lazy" decoding="async"></span>
        <span><strong>${escapeHtml(item.name)}</strong><small>${item.product_count} məhsul</small></span><i aria-hidden="true">›</i>
      </a>
      ${children.length ? `<ul>${children.map((child) => `<li><a href="${storeCategoryHref(child)}"><span>${escapeHtml(child.name)}</span><small>${child.product_count ? `${child.product_count} məhsul` : 'Məhsul yoxdur'}</small><i aria-hidden="true">›</i></a></li>`).join('')}</ul>` : ''}
    </article>`;
  }).join('');
  return `<section class="page-category-explorer" aria-label="Kateqoriyalar"><div class="page-container">
    <div class="page-category-groups">${groups}</div>
  </div></section>`;
}

async function databaseCategoryByPath(slugs: string[]): Promise<DatabaseCategory | undefined> {
  const result = await pool.query<DatabaseCategory>(`
    WITH RECURSIVE tree AS (
      SELECT c.id,c.parent_id,c.name,c.slug,c.description,c.seo_title,c.seo_description,c.image_asset_id,
        0 AS depth,ARRAY[c.slug] AS path_slugs,ARRAY[c.name] AS path_names
      FROM categories c JOIN stores s ON s.id=c.store_id
      WHERE s.code=$1 AND c.parent_id IS NULL AND c.status='active'
      UNION ALL
      SELECT c.id,c.parent_id,c.name,c.slug,c.description,c.seo_title,c.seo_description,c.image_asset_id,
        tree.depth+1,tree.path_slugs||c.slug,tree.path_names||c.name
      FROM categories c JOIN tree ON c.parent_id=tree.id
      WHERE c.status='active' AND tree.depth<2
    )
    SELECT tree.*,ma.public_url AS image_url,ma.alt_text AS image_alt
    FROM tree LEFT JOIN media_assets ma ON ma.id=tree.image_asset_id
    WHERE tree.path_slugs=$2::text[] LIMIT 1
  `, [env.DEFAULT_STORE_CODE, slugs]);
  return result.rows[0];
}

async function renderDatabaseCategoryPage(slugs: string[]): Promise<{ html: string; category: DatabaseCategory } | null> {
  const category = await databaseCategoryByPath(slugs);
  if (!category) return null;
  const [categoryOptions, products] = await Promise.all([
    pool.query<StoreCategoryOption>(`WITH RECURSIVE tree AS (
        SELECT c.id,c.parent_id,c.name,c.slug,c.description,c.seo_title,c.seo_description,c.image_asset_id,
          0 AS depth,ARRAY[c.position] AS position_path,ARRAY[c.slug] AS path_slugs,ARRAY[c.name] AS path_names
        FROM categories c JOIN stores s ON s.id=c.store_id
        WHERE s.code=$1 AND c.parent_id IS NULL AND c.status='active'
        UNION ALL
        SELECT c.id,c.parent_id,c.name,c.slug,c.description,c.seo_title,c.seo_description,c.image_asset_id,
          tree.depth+1,tree.position_path||c.position,tree.path_slugs||c.slug,tree.path_names||c.name
        FROM categories c JOIN tree ON c.parent_id=tree.id WHERE c.status='active' AND tree.depth<2
      ) SELECT tree.id,tree.parent_id,tree.name,tree.slug,tree.description,tree.seo_title,tree.seo_description,
        ma.public_url AS image_url,ma.alt_text AS image_alt,tree.depth,tree.path_slugs,tree.path_names,
        (SELECT count(DISTINCT pl.product_id)::int FROM product_listings pl
          JOIN products p ON p.id=pl.product_id AND p.deleted_at IS NULL
          JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL
          WHERE pl.status='published' AND EXISTS (
            WITH RECURSIVE descendants AS (
              SELECT tree.id AS id UNION ALL
              SELECT child.id FROM categories child JOIN descendants d ON child.parent_id=d.id WHERE child.status='active'
            ) SELECT 1 FROM descendants d JOIN product_categories pc ON pc.category_id=d.id WHERE pc.product_id=p.id
          )) AS product_count
      FROM tree LEFT JOIN media_assets ma ON ma.id=tree.image_asset_id ORDER BY tree.position_path,tree.name`, [env.DEFAULT_STORE_CODE]),
    pool.query<ProductView>(`${productSelect} JOIN stores s ON s.id=pl.store_id
      WHERE s.code=$1 AND pl.status='published' AND p.deleted_at IS NULL AND EXISTS (
        WITH RECURSIVE descendants AS (
          SELECT id FROM categories WHERE id=$2
          UNION ALL SELECT child.id FROM categories child JOIN descendants d ON child.parent_id=d.id WHERE child.status='active'
        ) SELECT 1 FROM descendants d JOIN product_categories pc ON pc.category_id=d.id WHERE pc.product_id=p.id
      ) ORDER BY pl.published_at DESC`, [env.DEFAULT_STORE_CODE, category.id])
  ]);
  const path = `/magaza/${category.path_slugs.map(encodeURIComponent).join('/')}/`;
  const crumbs: Array<[string, string?]> = [['Mağaza', '/magaza/']];
  category.path_names.forEach((name, index) => {
    if (index < category.path_names.length - 1) crumbs.push([name, `/magaza/${category.path_slugs.slice(0, index + 1).map(encodeURIComponent).join('/')}/`]);
    else crumbs.push([name]);
  });
  const categoryDescription = category.description?.trim() || 'Bu bölmədə seçilmiş məhsulları rahat şəkildə kəşf edin.';
  const categoryExplorer = renderStoreCategoryExplorer(category, categoryOptions.rows);
  const html = `${pageHero('TVSHOP MAĞAZA', category.name, categoryDescription)}<div class="page-container">${breadcrumb(crumbs)}</div>${categoryExplorer}<section class="page-section"><div class="page-container"><div class="page-section-title"><h2>Məhsullar</h2><a href="/magaza/">Bütün məhsullar →</a></div>${products.rows.length ? `<div class="page-product-grid db-featured-products">${products.rows.map(productCard).join('')}</div>` : emptyState('Bu kateqoriyada məhsul yoxdur', 'Yeni məhsullar əlavə edilən kimi burada görünəcək. Digər alt kateqoriyalara baxa bilərsiniz.', '/magaza/', 'Mağazaya bax')}</div></section>`;
  return { category, html: layout({ title: category.seo_title || `${category.name} | TVShop`, description: category.seo_description || category.description || `${category.name} məhsulları`, path, active: 'magaza', content: html }) };
}

type ServiceCategoryOption = DatabaseCategory & { listing_count: number };

function serviceCategoryHref(category: Pick<DatabaseCategory, 'path_slugs'>): string {
  return `/elanlar/xidmetler/${category.path_slugs.map(encodeURIComponent).join('/')}/`;
}

async function serviceCategoryOptions(): Promise<ServiceCategoryOption[]> {
  const result = await pool.query<ServiceCategoryOption>(`WITH RECURSIVE tree AS (
    SELECT sc.id,sc.parent_id,sc.name,sc.slug,sc.description,sc.seo_title,sc.seo_description,sc.image_asset_id,
      0 AS depth,ARRAY[sc.position] AS position_path,ARRAY[sc.slug] AS path_slugs,ARRAY[sc.name] AS path_names
    FROM service_categories sc JOIN stores s ON s.id=sc.store_id
    WHERE s.code=$1 AND sc.parent_id IS NULL AND sc.status='active'
    UNION ALL
    SELECT sc.id,sc.parent_id,sc.name,sc.slug,sc.description,sc.seo_title,sc.seo_description,sc.image_asset_id,
      tree.depth+1,tree.position_path||sc.position,tree.path_slugs||sc.slug,tree.path_names||sc.name
    FROM service_categories sc JOIN tree ON sc.parent_id=tree.id
    WHERE sc.status='active' AND tree.depth<2
  ) SELECT tree.id,tree.parent_id,tree.name,tree.slug,tree.description,tree.seo_title,tree.seo_description,
    tree.depth,tree.path_slugs,tree.path_names,ma.public_url AS image_url,ma.alt_text AS image_alt,
    (SELECT count(*)::int FROM classified_listings cl WHERE cl.status='published' AND cl.deleted_at IS NULL AND cl.category='service' AND cl.service_category_id IN (
      WITH RECURSIVE descendants AS (SELECT tree.id AS id UNION ALL SELECT child.id FROM service_categories child JOIN descendants d ON child.parent_id=d.id WHERE child.status='active') SELECT id FROM descendants
    )) AS listing_count
  FROM tree LEFT JOIN media_assets ma ON ma.id=tree.image_asset_id ORDER BY tree.position_path,tree.name`,[env.DEFAULT_STORE_CODE]);
  return result.rows;
}

function renderServiceCategoryExplorer(categories: ServiceCategoryOption[], selected?: DatabaseCategory): string {
  const visible = selected
    ? (selected.depth === 2 ? categories.filter((item) => item.parent_id === selected.parent_id) : categories.filter((item) => item.parent_id === selected.id))
    : categories.filter((item) => item.parent_id === null);
  if (!visible.length) return '';
  const heading = selected ? `${selected.name}: xidmət kateqoriyaları` : 'Xidmət sahəsini seçin';
  const cards = visible.map((item) => {
    const children = categories.filter((child) => child.parent_id === item.id);
    return `<article class="page-category-group${selected?.id === item.id ? ' is-current' : ''}">
      <a class="page-category-group-head" href="${serviceCategoryHref(item)}"${selected?.id === item.id ? ' aria-current="page"' : ''}>
        <span class="page-category-group-image"><img src="${escapeHtml(item.image_url || '/assets/wp-content/uploads/other-cat.webp')}" alt="" width="72" height="72" loading="lazy" decoding="async"></span>
        <span><strong>${escapeHtml(item.name)}</strong><small>${item.listing_count ? `${item.listing_count} xidmət` : 'Elan yoxdur'}</small></span><i aria-hidden="true">›</i>
      </a>
      ${children.length ? `<ul>${children.map((child) => `<li><a href="${serviceCategoryHref(child)}"><span>${escapeHtml(child.name)}</span><small>${child.listing_count ? `${child.listing_count} xidmət` : 'Elan yoxdur'}</small><i aria-hidden="true">›</i></a></li>`).join('')}</ul>` : ''}
    </article>`;
  }).join('');
  return `<section class="page-category-explorer page-service-explorer" aria-labelledby="service-category-heading"><div class="page-container"><div class="page-category-heading"><p>XİDMƏT KATEQORİYALARI</p><h2 id="service-category-heading">${escapeHtml(heading)}</h2></div><div class="page-category-groups">${cards}</div></div></section>`;
}

async function serviceCategoryByPath(slugs: string[], categories?: ServiceCategoryOption[]): Promise<ServiceCategoryOption | undefined> {
  const source = categories ?? await serviceCategoryOptions();
  return source.find((item) => item.path_slugs.length === slugs.length && item.path_slugs.every((slug,index) => slug === slugs[index]));
}

async function renderServiceCategoryPage(slugs: string[]): Promise<string | null> {
  const categories = await serviceCategoryOptions();
  const category = await serviceCategoryByPath(slugs,categories);
  if (!category) return null;
  const listings = await pool.query(`SELECT cl.*,sc.name AS service_category_name,v.display_name AS vendor_name,ma.public_url AS image_url
    FROM classified_listings cl JOIN stores s ON s.id=cl.store_id
    LEFT JOIN service_categories sc ON sc.id=cl.service_category_id LEFT JOIN vendors v ON v.id=cl.vendor_id
    LEFT JOIN classified_media cm ON cm.listing_id=cl.id AND cm.position=0 LEFT JOIN media_assets ma ON ma.id=cm.media_asset_id
    WHERE s.code=$1 AND cl.category='service' AND cl.status='published' AND cl.deleted_at IS NULL AND cl.service_category_id IN (
      WITH RECURSIVE descendants AS (SELECT id FROM service_categories WHERE id=$2 UNION ALL SELECT child.id FROM service_categories child JOIN descendants d ON child.parent_id=d.id WHERE child.status='active') SELECT id FROM descendants
    ) ORDER BY cl.created_at DESC`,[env.DEFAULT_STORE_CODE,category.id]);
  const path=serviceCategoryHref(category);
  const crumbs: Array<[string,string?]>=[['Elanlar','/elanlar/'],['Xidmətlər','/elanlar/xidmetler/']];
  category.path_names.forEach((name,index)=>{
    if(index<category.path_names.length-1)crumbs.push([name,`/elanlar/xidmetler/${category.path_slugs.slice(0,index+1).map(encodeURIComponent).join('/')}/`]);
    else crumbs.push([name]);
  });
  const content=`${pageHero('PEŞƏKAR XİDMƏTLƏR',category.name,category.description||`${category.name} üzrə etibarlı xidmət elanlarını kəşf edin.`)}<div class="page-container">${breadcrumb(crumbs)}</div>${renderServiceCategoryExplorer(categories,category)}<section class="page-section"><div class="page-container"><div class="page-section-title"><div><p>AKTİV XİDMƏTLƏR</p><h2>${escapeHtml(category.name)} elanları</h2></div><a href="/elanlar/xidmetler/">Bütün xidmətlər →</a></div>${listings.rows.length?`<div class="page-listing-grid">${renderListingCards(listings.rows)}</div>`:emptyState('Bu kateqoriyada xidmət elanı yoxdur','Yeni xidmətlər təsdiqlənən kimi burada görünəcək. Digər kateqoriyalara baxa bilərsiniz.','/elanlar/xidmetler/','Bütün xidmətlərə bax')}</div></section>`;
  return layout({title:category.seo_title||`${category.name} xidmətləri | TVShop`,description:category.seo_description||category.description||`${category.name} xidmət elanları`,path,active:'elanlar',content});
}

function renderCampaignCards(campaigns: Array<Record<string, unknown>>): string {
  return campaigns.map((campaign) => `<article id="${escapeHtml(campaign['slug'])}"><div><span>${escapeHtml(campaign['campaign_type'])}</span><small>${escapeHtml(campaign['vendor_name'] || 'TVShop')}</small></div><h2>${escapeHtml(campaign['name'])}</h2><p>${escapeHtml(campaign['description'])}</p><time>${new Intl.DateTimeFormat('az-AZ', { dateStyle: 'long' }).format(new Date(String(campaign['ends_at'])))} tarixinədək</time><a href="/magaza/">Məhsullara bax →</a></article>`).join('');
}

function renderPostCards(posts: Array<Record<string, unknown>>): string {
  const fallbacks = ['/assets/wp-content/uploads/bb-1.webp', '/assets/wp-content/uploads/bb-3-1.webp', '/assets/wp-content/uploads/bb-4-1.webp'];
  return posts.map((post, index) => `<article><a href="/jurnal/${escapeHtml(post['slug'])}/"><img src="${escapeHtml(post['image_url'] || fallbacks[index % fallbacks.length])}" width="640" height="380" alt="${escapeHtml(post['title'])}" loading="lazy" decoding="async"></a><div><p>${escapeHtml(post['category_name'] || post['post_type'])}</p><h2><a href="/jurnal/${escapeHtml(post['slug'])}/">${escapeHtml(post['title'])}</a></h2><span>${escapeHtml(post['excerpt'])}</span><a href="/jurnal/${escapeHtml(post['slug'])}/">Oxumağa davam et →</a></div></article>`).join('');
}

function renderListingCards(listings: Array<Record<string, unknown>>): string {
  return listings.map((listing) => `<article><img src="${escapeHtml(listing['image_url'] || '/assets/wp-content/uploads/other-cat.webp')}" width="520" height="320" alt="${escapeHtml(listing['title'])}" loading="lazy" decoding="async"><div><span>${escapeHtml(listing['service_category_name'] || listing['category'])}</span><h2>${escapeHtml(listing['title'])}</h2><p>${escapeHtml(listing['description'])}</p><strong>${listing['price'] == null ? 'Razılaşma yolu ilə' : money(String(listing['price']), String(listing['currency'] || 'AZN'))}</strong><small>${escapeHtml(listing['vendor_name'] || 'Fərdi elan')}</small></div></article>`).join('');
}

const clubChildContent: Record<string, string> = {
  'xal-qazanma': `<section class="page-prose"><h2>Bakı Club xalları necə qazanılır?</h2><p>Uyğun alış-veriş, aktiv kampaniya və jurnal QR kodlarını skan etdikcə xallar profilinizə avtomatik əlavə olunur.</p><h2>Xallarınızı izləyin</h2><p>Hesab tarixçəsində hər əməliyyatın mənbəyini, tarixini və qazandırdığı xal sayını görə bilərsiniz.</p></section>`,
  hediyyeler: `<section class="page-prose"><h2>Xalları üstünlüklərə çevirin</h2><p>Topladığınız xalları mövcud kataloqdakı hədiyyə, kupon və tərəfdaş üstünlükləri ilə dəyişə bilərsiniz.</p><h2>Şəffaf şərtlər</h2><p>Hər hədiyyənin tələb etdiyi xal, istifadə müddəti və mövcud sayı seçimdən əvvəl göstərilir.</p></section>`,
  giveawayler: `<section class="page-prose"><h2>Üzvlərə özəl çəkilişlər</h2><p>Aktiv Bakı Club üzvləri uyğun giveaway-lərə profildən qoşula və iştirak statusunu izləyə bilərlər.</p><h2>Nəticələr və bildirişlər</h2><p>Qaliblər şəffaf seçim qaydalarına uyğun müəyyən edilir və hesab bildirişi vasitəsilə məlumatlandırılır.</p></section>`,
  'qr-idareetme': `<section class="page-prose"><h2>QR cüzdanınız bir yerdə</h2><p>Aktiv kuponları, skan tarixçəsini və QR kampaniyalarından qazandığınız xalları vahid görünüşdə idarə edin.</p><h2>Təhlükəsiz istifadə</h2><p>Hər QR əməliyyatı hesab və kampaniya ilə əlaqələndirilərək təkrar istifadə limitlərinə uyğun yoxlanılır.</p></section>`
};

const businessChildContent: Record<string, string> = {
  'reklam-ver': `<section class="page-prose"><h2>Auditoriyanıza uyğun reklam</h2><p>Sayt, rəqəmsal jurnal və kampaniya sahələrində məqsədinizə uyğun reklam yerləşdirmələri planlaşdırın.</p><h2>Ölçülə bilən nəticə</h2><p>Baxış, klik və dönüşüm göstəriciləri kampaniya hesabatında izlənir.</p></section>`,
  sponsorluq: `<section class="page-prose"><h2>Xüsusi layihələrdə tərəfdaşlıq</h2><p>Jurnal buraxılışı, mövzu layihəsi, tədbir və giveaway formatları üçün uyğun sponsorluq paketi yaradın.</p><h2>Brend təhlükəsizliyi</h2><p>Yerləşdirmə planı və təqdimat qaydaları yayımdan əvvəl tərəflərlə razılaşdırılır.</p></section>`,
  'brend-vitrini': `<section class="page-prose"><h2>Brendiniz üçün daimi rəqəmsal vitrin</h2><p>Məhsullarınızı, hekayənizi və aktual kampaniyalarınızı axtarış sistemlərinə uyğun strukturda təqdim edin.</p><h2>Vahid idarəetmə</h2><p>Satıcı paneli vasitəsilə məhsul, stok, qiymət və sifariş məlumatlarını idarə edin.</p></section>`,
  'analitika-paneli': `<section class="page-prose"><h2>Məlumata əsaslanan qərarlar</h2><p>Baxış, klik, QR skanı, sifariş və kampaniya dönüşümlərini vahid analitika panelində müqayisə edin.</p><h2>Hesabatlılıq</h2><p>Tarix və kampaniya üzrə filtrlənən göstəricilər marketinq nəticələrini aydın şəkildə ölçməyə kömək edir.</p></section>`
};

async function renderCategoryChild(section: NavigationSection, child: NavigationChild): Promise<string> {
  const lead = `${pageHero(section.kicker, child.label, child.description)}${categoryContext(section, child)}`;

  if (section.key === 'magaza') {
    const category = await pool.query(`SELECT c.id FROM categories c JOIN stores s ON s.id=c.store_id WHERE s.code=$1 AND c.slug=$2 AND c.status='active' LIMIT 1`, [env.DEFAULT_STORE_CODE, child.slug]);
    const params: unknown[] = [env.DEFAULT_STORE_CODE];
    let categoryJoin = '';
    if (category.rows[0]) {
      categoryJoin = ' JOIN product_categories pc ON pc.product_id=p.id JOIN categories c ON c.id=pc.category_id';
      params.push(child.slug);
    }
    const products = await pool.query<ProductView>(`${productSelect} JOIN stores s ON s.id=pl.store_id ${categoryJoin} WHERE s.code=$1 AND pl.status='published' AND p.deleted_at IS NULL${category.rows[0] ? ' AND c.slug=$2' : ''} ORDER BY pl.published_at DESC`, params);
    return `${lead}<section class="page-section"><div class="page-container"><div class="page-section-title"><div><p>SEÇİLMİŞ MƏHSULLAR</p><h2>${escapeHtml(child.label)} kateqoriyası</h2></div><a href="${section.href}">Bütün məhsullar →</a></div>${products.rows.length ? `<div class="page-product-grid db-featured-products">${products.rows.map(productCard).join('')}</div>` : emptyState('Məhsul tapılmadı', 'Bu kateqoriyaya yeni məhsullar əlavə olunur.', section.href, 'Mağazaya bax')}</div></section>`;
  }

  if (section.key === 'endirimler') {
    const products = await pool.query<ProductView>(`${productSelect} JOIN stores s ON s.id=pl.store_id WHERE s.code=$1 AND pl.status='published' AND pl.compare_at_price>pl.price ORDER BY (pl.compare_at_price-pl.price) DESC LIMIT 20`, [env.DEFAULT_STORE_CODE]);
    return `${lead}<section class="page-section"><div class="page-container"><div class="page-section-title"><div><p>ENDİRİMLİ SEÇİMLƏR</p><h2>${escapeHtml(child.label)} fürsətləri</h2></div><a href="${section.href}">Bütün endirimlər →</a></div>${products.rows.length ? `<div class="page-product-grid db-featured-products">${products.rows.map(productCard).join('')}</div>` : emptyState('Endirimli məhsul tapılmadı', 'Bu bölmə üçün yeni endirimlər tezliklə əlavə ediləcək.', section.href, 'Bütün endirimlərə bax')}</div></section>`;
  }

  if (section.key === 'kampaniyalar') {
    const campaignTypes: Record<string, string> = { 'gunun-teklifi': 'daily_deal', 'heftenin-kampaniyasi': 'weekly', 'mehdud-sayda': 'limited', 'movsumi-endirimler': 'seasonal' };
    const campaignType = campaignTypes[child.slug];
    const campaigns = await pool.query(`SELECT c.*,v.display_name AS vendor_name FROM campaigns c LEFT JOIN vendors v ON v.id=c.vendor_id JOIN stores s ON s.id=c.store_id WHERE s.code=$1 AND c.campaign_type=$2 AND c.status IN ('active','scheduled') AND c.ends_at>now() ORDER BY c.starts_at DESC`, [env.DEFAULT_STORE_CODE, campaignType]);
    const cards = renderCampaignCards(campaigns.rows);
    return `${lead}<section class="page-section"><div class="page-container"><div class="page-section-title"><div><p>AKTİV KAMPANİYALAR</p><h2>${escapeHtml(child.label)}</h2></div><a href="${section.href}">Bütün kampaniyalar →</a></div><div class="page-campaign-grid">${cards || emptyState('Aktiv kampaniya yoxdur', 'Bu kateqoriyada yeni kampaniyalar tezliklə əlavə ediləcək.', section.href, 'Bütün kampaniyalara bax')}</div></div></section>`;
  }

  if (section.key === 'jurnal') {
    if (child.slug === 'son-buraxilis' || child.slug === 'arxiv') {
      const issueLimit = child.slug === 'son-buraxilis' ? ' LIMIT 1' : '';
      const issues = await pool.query(`SELECT ji.*,cover.public_url AS cover_url,pdf.public_url AS pdf_url FROM journal_issues ji JOIN stores s ON s.id=ji.store_id LEFT JOIN media_assets cover ON cover.id=ji.cover_asset_id LEFT JOIN media_assets pdf ON pdf.id=ji.pdf_asset_id WHERE s.code=$1 AND ji.status='published' ORDER BY ji.published_at DESC${issueLimit}`, [env.DEFAULT_STORE_CODE]);
      const issueCards = issues.rows.map((issue) => `<article>${issue.cover_url ? `<img src="${escapeHtml(issue.cover_url)}" width="640" height="380" alt="${escapeHtml(issue.title)} jurnal üz qabığı" loading="lazy" decoding="async">` : `<img src="/assets/wp-content/uploads/document.svg" width="640" height="380" alt="" loading="lazy" decoding="async">`}<div><p>${escapeHtml(issue.issue_number)}</p><h2>${escapeHtml(issue.title)}</h2><span>${escapeHtml(issue.description)}</span>${issue.pdf_url ? `<a href="${escapeHtml(issue.pdf_url)}" target="_blank" rel="noopener">PDF-i aç →</a>` : '<span>PDF faylı hazırlanır</span>'}</div></article>`).join('');
      const recentPosts = await pool.query(`SELECT p.*,pc.name AS category_name,ma.public_url AS image_url FROM posts p JOIN stores s ON s.id=p.store_id LEFT JOIN post_categories pc ON pc.id=p.category_id LEFT JOIN media_assets ma ON ma.id=p.featured_asset_id WHERE s.code=$1 AND p.status='published' AND p.deleted_at IS NULL ORDER BY p.published_at DESC LIMIT 6`, [env.DEFAULT_STORE_CODE]);
      return `${lead}<section class="page-section"><div class="page-container"><div class="page-section-title"><div><p>RƏQƏMSAL JURNAL</p><h2>${escapeHtml(child.label)}</h2></div><a href="${section.href}">Jurnala qayıt →</a></div>${issueCards ? `<div class="page-post-grid">${issueCards}</div>` : emptyState('Jurnal buraxılışı hazırlanır', 'PDF buraxılışı dərc edilən kimi burada görünəcək.', section.href, 'Jurnal yazılarına bax')}${recentPosts.rows.length ? `<div class="page-section-title"><div><p>REDAKSİYA SEÇİMİ</p><h2>Son yazılar</h2></div></div><div class="page-post-grid">${renderPostCards(recentPosts.rows)}</div>` : ''}</div></section>`;
    }
    const postType = child.slug === 'brend-hekayeleri' ? 'brand_story' : 'guide';
    const posts = await pool.query(`SELECT p.*,pc.name AS category_name,ma.public_url AS image_url FROM posts p JOIN stores s ON s.id=p.store_id LEFT JOIN post_categories pc ON pc.id=p.category_id LEFT JOIN media_assets ma ON ma.id=p.featured_asset_id WHERE s.code=$1 AND p.post_type=$2 AND p.status='published' AND p.deleted_at IS NULL ORDER BY p.published_at DESC`, [env.DEFAULT_STORE_CODE, postType]);
    return `${lead}<section class="page-section"><div class="page-container"><div class="page-section-title"><div><p>TVSHOP REDAKSİYASI</p><h2>${escapeHtml(child.label)}</h2></div><a href="${section.href}">Bütün yazılar →</a></div>${posts.rows.length ? `<div class="page-post-grid">${renderPostCards(posts.rows)}</div>` : emptyState('Məqalələr hazırlanır', 'Bu mövzuda yeni yazılar tezliklə dərc olunacaq.', section.href, 'Jurnala bax')}</div></section>`;
  }

  if (section.key === 'elanlar') {
    const listingTypes: Record<string, string> = { mehsullar: 'product', xidmetler: 'service', emlak: 'property', avtomobil: 'vehicle' };
    const [listings,serviceCategories] = await Promise.all([
      pool.query(`SELECT cl.*,sc.name AS service_category_name,v.display_name AS vendor_name,ma.public_url AS image_url FROM classified_listings cl JOIN stores s ON s.id=cl.store_id LEFT JOIN service_categories sc ON sc.id=cl.service_category_id LEFT JOIN vendors v ON v.id=cl.vendor_id LEFT JOIN classified_media cm ON cm.listing_id=cl.id AND cm.position=0 LEFT JOIN media_assets ma ON ma.id=cm.media_asset_id WHERE s.code=$1 AND cl.category=$2 AND cl.status='published' AND cl.deleted_at IS NULL ORDER BY cl.created_at DESC`, [env.DEFAULT_STORE_CODE, listingTypes[child.slug]]),
      child.slug === 'xidmetler' ? serviceCategoryOptions() : Promise.resolve([])
    ]);
    const explorer=child.slug === 'xidmetler' ? renderServiceCategoryExplorer(serviceCategories) : '';
    const addAction=child.slug === 'xidmetler' ? '<a class="page-primary page-service-create" href="/satici-paneli/#classifieds">Xidmət əlavə et</a>' : '';
    return `${lead}${explorer}<section class="page-section"><div class="page-container"><div class="page-section-title"><div><p>AKTİV ELANLAR</p><h2>${escapeHtml(child.label)}</h2></div><span class="page-section-actions"><a href="${section.href}">Bütün elanlar →</a>${addAction}</span></div>${listings.rows.length ? `<div class="page-listing-grid">${renderListingCards(listings.rows)}</div>` : emptyState('Aktiv elan yoxdur', 'Yeni elanlar moderasiyadan sonra burada görünəcək.', '/satici-qeydiyyati/', 'Xidmət yerləşdirmək üçün qeydiyyat')}</div></section>`;
  }

  if (section.key === 'baki-club') {
    return `${lead}<section class="page-section"><div class="page-container">${clubChildContent[child.slug] ?? ''}<section class="page-cta"><h2>Bakı Club imkanlarını kəşf edin</h2><p>Oxu, skan et və hər gün yeni üstünlüklər qazan.</p><a class="page-primary" href="${section.href}">Bakı Club-a qayıt</a></section></div></section>`;
  }

  return `${lead}<section class="page-section"><div class="page-container">${businessChildContent[child.slug] ?? ''}<section class="page-cta"><h2>Əməkdaşlığa başlayaq</h2><p>Komandamız biznesiniz üçün uyğun rəqəmsal həlli hazırlasın.</p><a class="page-primary" href="/elaqe/">Bizimlə əlaqə</a></section></div></section>`;
}

const staticPages: Record<string, { active?: string; title: string; description: string; kicker: string; body: string }> = {
  'baki-club': { active: 'baki-club', title: 'Bakı Club — Oxu, skan et, qazan', description: 'TVShop platformasında alış-veriş, QR skanları və kampaniyalar vasitəsilə xal və hədiyyələr qazanın.', kicker: 'LOYALLIQ PROQRAMI', body: `<div class="page-feature-grid"><article id="xal-qazan"><b>01</b><h2>Xal qazan</h2><p>Alış-veriş, kampaniya və QR skanlarından avtomatik xal toplayın.</p></article><article id="hediyyeler"><b>02</b><h2>Hədiyyələri seç</h2><p>Topladığınız xalları eksklüziv məhsul və endirimlərlə dəyişin.</p></article><article id="giveaway"><b>03</b><h2>Giveaway-lərə qoşul</h2><p>Club üzvləri üçün keçirilən xüsusi çəkilişlərdə iştirak edin.</p></article><article id="qr-cuzdan"><b>04</b><h2>QR cüzdan</h2><p>Kupon və bonuslarınızı bir mərkəzdən izləyin.</p></article></div>` },
  biznes: { active: 'biznes', title: 'Biznesinizi TVShop ilə böyüdün', description: 'Reklam, sponsorluq, məhsul vitrini və ölçülə bilən kampaniyalar üçün vahid biznes platforması.', kicker: 'BİZNES ÜÇÜN', body: `<div class="page-feature-grid db-business-feature-grid"><a href="/biznes/reklam-ver/"><article id="reklam"><b>01</b><h2>Reklam ver</h2><p>Hədəf auditoriyaya uyğun banner və yerli kampaniyalar yaradın.</p><span>Davam et →</span></article></a><a href="/biznes/sponsorluq/"><article id="sponsorluq"><b>02</b><h2>Sponsorluq</h2><p>Jurnal, tədbir və xüsusi layihələrdə brendinizlə iştirak edin.</p><span>Davam et →</span></article></a><a href="/biznes/brend-vitrini/"><article id="brend-vitrini"><b>03</b><h2>Brend vitrini</h2><p>Məhsullarınızı SEO-dostu kataloqda və kampaniyalarda nümayiş etdirin.</p><span>Davam et →</span></article></a><a href="/biznes/analitika-paneli/"><article id="analitika"><b>04</b><h2>Analitika paneli</h2><p>Baxış, klik, QR skanı, sifariş və dönüşümləri izləyin.</p><span>Davam et →</span></article></a></div><section class="page-cta"><h2>Əməkdaşlığa başlayaq</h2><p>Biznes alətlərindən istifadə etmək üçün satıcı hesabınıza keçin.</p><a class="page-primary" href="/satici-girisi/">Satıcı olaraq daxil ol</a></section>` },
  haqqimizda: { title: 'TVShop haqqında', description: 'TVShop şəhərin alış-veriş, endirim, jurnal və biznes ekosistemidir.', kicker: 'BİZ KİMİK', body: `<section class="page-prose"><h2>Şəhərin fürsətlərini bir platformada birləşdiririk</h2><p>TVShop istifadəçiləri etibarlı bizneslər, məhsullar, kampaniyalar və faydalı şəhər kontenti ilə əlaqələndirir.</p><h2>Missiyamız</h2><p>Yerli bizneslərin rəqəmsal görünürlüğünü artırmaq, istifadəçilərə isə daha rahat və sərfəli seçim imkanı yaratmaqdır.</p></section>` },
  elaqe: { title: 'TVShop ilə əlaqə', description: 'Satış, reklam, texniki dəstək və tərəfdaşlıq üçün TVShop komandası ilə əlaqə saxlayın.', kicker: 'ƏLAQƏ', body: `<div class="page-contact-grid"><article><h2>Biznes və reklam</h2><a href="mailto:business@gundelikbaki.az">business@gundelikbaki.az</a><a href="tel:+994502645400">+994 50 264 54 00</a></article><article><h2>Müştəri dəstəyi</h2><a href="mailto:support@gundelikbaki.az">support@gundelikbaki.az</a><p>B.e.–Cümə, 09:00–18:00</p></article><article><h2>Ünvan</h2><p>Cəfər Cabbarlı 33, AZ1065, Bakı/Azərbaycan</p></article></div>` },
  faq: { title: 'Tez-tez verilən suallar', description: 'TVShop alış-veriş, sifariş, kampaniya və Bakı Club haqqında tez-tez verilən suallar.', kicker: 'DƏSTƏK', body: `<section class="page-faq"><details open><summary>Sifarişi necə verə bilərəm?</summary><p>Məhsulu səbətə əlavə edin, səbət səhifəsində sifariş məlumatlarını tamamlayın.</p></details><details><summary>Satıcılarla necə əməkdaşlıq edə bilərəm?</summary><p>Biznes üçün bölməsindən əlaqə saxlayaraq satıcı hesabı əldə edə bilərsiniz.</p></details><details><summary>Bakı Club xalları necə qazanılır?</summary><p>Uyğun alış-veriş və QR kampaniyalarından sonra xallar hesabınıza əlavə olunur.</p></details></section>` },
  catdirilma: { title: 'Çatdırılma siyasəti', description: 'TVShop platformasında sifarişlərin çatdırılma şərtləri və müddətləri.', kicker: 'MÜŞTƏRİ DƏSTƏYİ', body: `<section class="page-prose"><h2>Çatdırılma müddəti</h2><p>Bakı daxilində stokda olan məhsullar adətən 1–3 iş günü ərzində çatdırılır. Dəqiq müddət satıcı və məhsul səhifəsində göstərilir.</p><h2>Çatdırılma haqqı</h2><p>99 AZN-dən yuxarı uyğun sifarişlər üçün standart çatdırılma pulsuzdur.</p></section>` },
  'geri-qaytarma': { title: 'Geri qaytarma siyasəti', description: 'TVShop üzərindən alınmış məhsulların dəyişdirilməsi və geri qaytarılması qaydaları.', kicker: 'MÜŞTƏRİ DƏSTƏYİ', body: `<section class="page-prose"><h2>Qaytarma şərtləri</h2><p>Məhsul istifadə edilməyibsə və komplektasiyası qorunubsa, qanunvericiliyə və satıcının şərtlərinə uyğun qaytarıla bilər.</p><h2>Müraciət</h2><p>Sifariş nömrəsini qeyd etməklə support@gundelikbaki.az ünvanına müraciət edin.</p></section>` },
  mexfilik: { title: 'Məxfilik siyasəti', description: 'TVShop istifadəçi və sifariş məlumatlarının qorunması haqqında məxfilik siyasəti.', kicker: 'HÜQUQİ', body: `<section class="page-prose"><h2>Məlumatların qorunması</h2><p>Şəxsi məlumatlar yalnız xidmətin göstərilməsi, təhlükəsizlik və qanuni öhdəliklər üçün işlənir.</p><h2>Əlaqə</h2><p>Məxfilik sorğuları üçün privacy@gundelikbaki.az ünvanına müraciət edə bilərsiniz.</p></section>` },
  'istifade-sertleri': { title: 'İstifadə şərtləri', description: 'TVShop platformasının istifadə qaydaları, istifadəçi və satıcı öhdəlikləri.', kicker: 'HÜQUQİ', body: `<section class="page-prose"><h2>Platformadan istifadə</h2><p>İstifadəçi təqdim etdiyi məlumatların düzgünlüyünə, satıcı isə məhsul və sifariş məlumatlarının aktuallığına cavabdehdir.</p><h2>Məzmun hüquqları</h2><p>TVShop brendi və platforma məzmunu müəllif hüquqları ilə qorunur.</p></section>` }
};

export async function webRoutes(app: FastifyInstance): Promise<void> {
  const accountPaths = ['/hesabim', '/hesabim/secilmisler', '/hesabim/sifarisler', '/hesabim/tarixce', '/hesabim/baki-club', '/hesabim/bildirisler', '/hesabim/unvanlar', '/hesabim/hesab-melumatlari'];
  const authPaths = ['/giris', '/qeydiyyat', '/satici-girisi', '/satici-qeydiyyati', '/sifre-berpasi', '/sifre-yenile', '/deveti-qebul-et'];
  const slashed = [...navigationSections.map((section) => section.href.slice(0, -1)), '/sebet', ...accountPaths, ...authPaths, '/haqqimizda', '/elaqe', '/faq', '/catdirilma', '/geri-qaytarma', '/mexfilik', '/istifade-sertleri'];
  for (const path of slashed) app.get(path, async (_request, reply) => reply.redirect(`${path}/`, 308));

  const businessAccess = async (request: FastifyRequest, reply: FastifyReply): Promise<'guest' | 'customer' | 'pending' | 'active' | 'inactive'> => {
    try {
      await app.authenticate(request, reply);
    } catch {
      return 'guest';
    }
    if (!request.actor) return 'guest';
    const result = await pool.query<{ has_vendor_role: boolean; has_active: boolean; has_pending: boolean }>(`
      SELECT
        bool_or(r.code IN ('vendor_owner','vendor_staff')) AS has_vendor_role,
        bool_or(r.code IN ('vendor_owner','vendor_staff') AND v.status='active' AND v.deleted_at IS NULL) AS has_active,
        bool_or(r.code IN ('vendor_owner','vendor_staff') AND v.status='pending' AND v.deleted_at IS NULL) AS has_pending
      FROM user_roles ur
      JOIN roles r ON r.id=ur.role_id
      LEFT JOIN vendors v ON v.id=ur.vendor_id
      WHERE ur.user_id=$1
    `, [request.actor.userId]);
    const access = result.rows[0];
    if (!access?.has_vendor_role) return 'customer';
    if (access.has_active) return 'active';
    if (access.has_pending) return 'pending';
    return 'inactive';
  };

  const businessGate = (section: NavigationSection, child: NavigationChild, access: 'guest' | 'customer' | 'pending' | 'inactive'): string => {
    const lead = `${pageHero(section.kicker, child.label, child.description)}${categoryContext(section, child)}`;
    if (access === 'pending') return `${lead}<section class="page-section db-business-gate"><div class="page-container"><div class="db-business-gate-card is-pending"><span class="db-business-gate-icon" aria-hidden="true">⌛</span><p class="db-business-gate-kicker">SATICI HESABI YOXLANILIR</p><h2>Təsdiq gözlənilir</h2><p>Satıcı müraciətiniz administrator tərəfindən yoxlanılır. Kabinetinizdən məhsulları hazırlaya bilərsiniz; biznes alətləri və məhsulların saytda görünməsi hesab təsdiqləndikdən sonra aktiv olacaq.</p><div class="db-business-gate-actions"><a class="page-primary" href="/satici-paneli/">Satıcı kabinetinə keç</a><a href="/elaqe/">Dəstəklə əlaqə</a></div></div></div></section>`;
    if (access === 'inactive') return `${lead}<section class="page-section db-business-gate"><div class="page-container"><div class="db-business-gate-card is-inactive"><span class="db-business-gate-icon" aria-hidden="true">!</span><p class="db-business-gate-kicker">SATICI HESABI AKTİV DEYİL</p><h2>Satıcı statusunuzu yoxlayın</h2><p>Bu biznes alətinə giriş üçün aktiv satıcı hesabı tələb olunur. Statusun dəqiqləşdirilməsi üçün administratorla əlaqə saxlayın.</p><div class="db-business-gate-actions"><a class="page-primary" href="/elaqe/">Dəstəklə əlaqə</a><a href="/satici-paneli/">Satıcı kabineti</a></div></div></div></section>`;
    const accountNote = access === 'customer' ? 'Hazırda adi istifadəçi hesabı ilə daxil olmusunuz. ' : '';
    return `${lead}<section class="page-section db-business-gate"><div class="page-container"><div class="db-business-gate-card"><span class="db-business-gate-icon" aria-hidden="true">B</span><p class="db-business-gate-kicker">BİZNES ALƏTLƏRİ</p><h2>Satıcı hesabı tələb olunur</h2><p>${accountNote}${escapeHtml(child.label)} bölməsindən istifadə etmək üçün satıcı kimi daxil olun və ya partnyorluq qeydiyyatını tamamlayın.</p><div class="db-business-gate-actions"><a class="page-primary" href="/satici-girisi/">Satıcı olaraq daxil ol</a><a href="/satici-qeydiyyati/">Satıcı qeydiyyatından keç</a></div></div></div></section>`;
  };

  for (const section of navigationSections) {
    for (const child of section.children) {
      const pathWithoutSlash = child.href.slice(0, -1);
      app.get(pathWithoutSlash, async (_request, reply) => reply.redirect(child.href, 308));
      app.get(child.href, async (request, reply) => {
        if (section.key === 'biznes') {
          const access = await businessAccess(request, reply);
          if (access === 'active') return reply.redirect('/satici-paneli/', 303);
          return sendHtml(reply, layout({
            title: `${child.label} — Satıcı girişi | TVShop`,
            description: child.description,
            path: child.href,
            active: section.key,
            robots: 'noindex,follow',
            content: businessGate(section, child, access)
          }), 200, 'private, no-store');
        }
        if (section.key === 'magaza') {
          const databasePage = await renderDatabaseCategoryPage([child.slug]);
          if (databasePage) return sendHtml(reply, databasePage.html);
        }
        const content = await renderCategoryChild(section, child);
        return sendHtml(reply, layout({
          title: `${child.label} — ${section.label} | TVShop`,
          description: child.description,
          path: child.href,
          active: section.key,
          image: child.image,
          schema: categorySchemas(section, child),
          content
        }));
      });
    }
  }

  const databaseCategoryRoute = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const slugs = [params['department'], params['main'], params['sub']].filter(Boolean).map((value) => z.string().min(1).max(180).parse(value));
    const page = await renderDatabaseCategoryPage(slugs);
    if (!page) return reply.callNotFound();
    return sendHtml(reply, page.html);
  };
  for (const route of ['/magaza/:department/:main/', '/magaza/:department/:main/:sub/']) {
    app.get(route.slice(0, -1), async (request, reply) => reply.redirect(`${request.url.split('?')[0]}/`, 308));
    app.get(route, databaseCategoryRoute);
  }
  // Categories created after deployment are not part of the static navigation
  // registry, but their department URLs must still resolve immediately.
  app.get('/magaza/:department/', databaseCategoryRoute);

  const serviceCategoryRoute = async (request: FastifyRequest, reply: FastifyReply) => {
    const params=request.params as Record<string,string>;
    const slugs=[params['department'],params['main'],params['sub']].filter(Boolean).map((value)=>z.string().min(1).max(180).parse(value));
    const page=await renderServiceCategoryPage(slugs);
    if(!page)return reply.callNotFound();
    return sendHtml(reply,page);
  };
  for(const route of ['/elanlar/xidmetler/:department/','/elanlar/xidmetler/:department/:main/','/elanlar/xidmetler/:department/:main/:sub/']){
    app.get(route.slice(0,-1),async(request,reply)=>reply.redirect(`${request.url.split('?')[0]}/`,308));
    app.get(route,serviceCategoryRoute);
  }

  app.get('/magaza/', async (request, reply) => {
    const query = z.object({ axtaris: z.string().trim().max(100).optional(), kateqoriya: z.string().trim().max(100).optional(), brend: z.string().trim().max(100).optional(), mense: z.string().trim().max(100).optional() }).parse(request.query);
    const params: unknown[] = [env.DEFAULT_STORE_CODE];
    const where = [`s.code=$1`, `pl.status='published'`, `p.deleted_at IS NULL`];
    let orderBy = 'pl.published_at DESC';
    if (query.axtaris) {
      const normalized = normalizeSearchTerm(query.axtaris);
      const escaped = normalized.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
      params.push(normalized);
      const exactIndex = params.length;
      params.push(`${escaped}%`);
      const prefixIndex = params.length;
      params.push(`%${escaped}%`);
      const containsIndex = params.length;
      where.push(`(
        translate(lower(pl.title),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $${containsIndex} ESCAPE '\\'
        OR translate(lower(p.sku),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $${containsIndex} ESCAPE '\\'
        OR translate(lower(coalesce(b.name,'')),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $${containsIndex} ESCAPE '\\'
        OR translate(lower(v.display_name),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $${containsIndex} ESCAPE '\\'
        OR translate(lower(coalesce(pl.short_description,'')),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $${containsIndex} ESCAPE '\\'
      )`);
      orderBy = `CASE
        WHEN translate(lower(pl.title),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC')=$${exactIndex} THEN 0
        WHEN translate(lower(pl.title),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $${prefixIndex} ESCAPE '\\' THEN 1
        WHEN translate(lower(coalesce(b.name,'')),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $${prefixIndex} ESCAPE '\\' THEN 2
        WHEN translate(lower(p.sku),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') ILIKE $${prefixIndex} ESCAPE '\\' THEN 3
        ELSE 4
      END, pl.published_at DESC`;
    }
    if (query.kateqoriya) {
      params.push(query.kateqoriya);
      where.push(`EXISTS (
        WITH RECURSIVE selected AS (
          SELECT id FROM categories WHERE store_id=s.id AND slug=$${params.length} AND status='active'
          UNION ALL SELECT child.id FROM categories child JOIN selected parent ON child.parent_id=parent.id WHERE child.status='active'
        ) SELECT 1 FROM selected JOIN product_categories pc ON pc.category_id=selected.id WHERE pc.product_id=p.id
      )`);
    }
    if (query.brend) { params.push(query.brend); where.push(`b.slug=$${params.length}`); }
    if (query.mense) { params.push(query.mense); where.push(`EXISTS (SELECT 1 FROM jsonb_each_text(p.attributes) attribute WHERE translate(lower(attribute.key),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC') IN ('mense','mense olkesi','country of origin') AND trim(both '-' FROM regexp_replace(translate(lower(attribute.value),'əğıöşüçƏĞIÖŞÜÇ','egiosucEGIOSUC'),'[^a-z0-9]+','-','g'))=$${params.length})`); }
    const [products, categories] = await Promise.all([
      pool.query<ProductView>(`${productSelect} JOIN stores s ON s.id=pl.store_id WHERE ${where.join(' AND ')} ORDER BY ${orderBy}`, params),
      pool.query(`WITH RECURSIVE tree AS (
          SELECT c.id,c.parent_id,c.name,c.slug,c.position,0 AS depth,ARRAY[c.position] AS position_path,ARRAY[c.slug] AS path_slugs
          FROM categories c JOIN stores s ON s.id=c.store_id WHERE s.code=$1 AND c.parent_id IS NULL AND c.status='active'
          UNION ALL SELECT c.id,c.parent_id,c.name,c.slug,c.position,tree.depth+1,tree.position_path||c.position,tree.path_slugs||c.slug
          FROM categories c JOIN tree ON c.parent_id=tree.id WHERE c.status='active' AND tree.depth<2
        ) SELECT tree.*,(SELECT count(DISTINCT pl.product_id)::int FROM product_listings pl JOIN products p ON p.id=pl.product_id
          JOIN vendors v ON v.id=p.vendor_id AND v.status='active' AND v.deleted_at IS NULL
          WHERE pl.status='published' AND p.deleted_at IS NULL AND EXISTS (
            WITH RECURSIVE descendants AS (SELECT tree.id AS id UNION ALL SELECT child.id FROM categories child JOIN descendants d ON child.parent_id=d.id WHERE child.status='active')
            SELECT 1 FROM descendants d JOIN product_categories pc ON pc.category_id=d.id WHERE pc.product_id=p.id
          )) AS product_count FROM tree ORDER BY position_path,name`, [env.DEFAULT_STORE_CODE])
    ]);
    const heading = query.axtaris ? `“${query.axtaris}” üçün nəticələr` : 'Bütün məhsullar';
    const section = requiredNavigationSection('magaza');
    const content = `${pageHero('TVSHOP MAĞAZA', heading, 'Etibarlı satıcılardan seçilmiş məhsullar, aktual qiymətlər və kampaniyalar.')}${categoryNavigation(section)}
      <section class="page-section"><div class="page-container page-shop-layout"><aside class="page-filter"><h2>Kateqoriyalar</h2><a href="/magaza/"${!query.kateqoriya ? ' aria-current="page"' : ''}>Hamısı</a>${categories.rows.map((c) => `<a class="page-filter-depth-${Number(c.depth || 0)}" href="/magaza/${c.path_slugs.map(encodeURIComponent).join('/')}/"${query.kateqoriya === c.slug ? ' aria-current="page"' : ''}>${escapeHtml(c.name)} <span>${c.product_count}</span></a>`).join('')}</aside><div><div class="page-results-head"><p><strong>${products.rowCount ?? 0}</strong> məhsul tapıldı</p></div>${products.rows.length ? `<div class="page-product-grid db-featured-products">${products.rows.map(productCard).join('')}</div>` : emptyState('Məhsul tapılmadı', 'Axtarış və ya filtr seçimini dəyişərək yenidən yoxlayın.')}</div></div></section>`;
    return sendHtml(reply, layout({ title: `${heading} | TVShop`, description: 'TVShop mağazasında məhsullar, qiymətlər və endirimlər.', path: '/magaza/', active: 'magaza', schema: categorySchemas(section), ...(query.axtaris ? { robots: 'noindex,follow' } : {}), content }));
  });

  app.get('/mehsul/:slug/', async (request, reply) => {
    const slug = z.string().min(2).max(220).parse((request.params as { slug: string }).slug);
    const result = await pool.query(`${productSelect} JOIN stores s ON s.id=pl.store_id WHERE s.code=$1 AND pl.slug=$2 AND pl.status='published' AND p.deleted_at IS NULL`, [env.DEFAULT_STORE_CODE, slug]);
    const product = result.rows[0];
    if (!product) return sendHtml(reply, layout({ title: 'Məhsul tapılmadı | TVShop', description: 'Axtardığınız məhsul mövcud deyil.', path: `/mehsul/${slug}/`, robots: 'noindex,follow', content: `${pageHero('404', 'Məhsul tapılmadı', 'Məhsul silinmiş və ya ünvan dəyişmiş ola bilər.')}<div class="page-container">${emptyState('Məhsul tapılmadı', 'Mağazaya qayıdaraq digər məhsullara baxın.')}</div>` }), 404);
    const [related, media, categories, reviews, reviewSummary] = await Promise.all([
      pool.query<ProductView>(`${productSelect} JOIN stores s ON s.id=pl.store_id
        WHERE s.code=$1 AND pl.status='published' AND p.deleted_at IS NULL AND p.id<>$2
        ORDER BY (coalesce(b.name,'')=coalesce($3,'')) DESC, pl.published_at DESC LIMIT 12`,
        [env.DEFAULT_STORE_CODE, product.product_id, product.brand_name]),
      pool.query<{ public_url: string; alt_text: string | null }>(`SELECT ma.public_url,ma.alt_text
        FROM product_media pm JOIN media_assets ma ON ma.id=pm.media_asset_id
        WHERE pm.product_id=$1 ORDER BY pm.is_primary DESC,pm.position,ma.created_at`, [product.product_id]),
      pool.query<{ name: string; slug: string; path_slugs: string[] }>(`WITH RECURSIVE ancestry AS (
          SELECT c.id,c.parent_id,c.name,c.slug,ARRAY[c.slug] AS reverse_slugs
          FROM product_categories pc JOIN categories c ON c.id=pc.category_id
          WHERE pc.product_id=$1 AND c.status='active'
            AND NOT EXISTS (SELECT 1 FROM product_categories child_pc JOIN categories child ON child.id=child_pc.category_id WHERE child_pc.product_id=$1 AND child.parent_id=c.id)
          UNION ALL SELECT parent.id,parent.parent_id,ancestry.name,ancestry.slug,ancestry.reverse_slugs||parent.slug
          FROM categories parent JOIN ancestry ON ancestry.parent_id=parent.id WHERE parent.status='active'
        ) SELECT DISTINCT name,slug,ARRAY(SELECT value FROM unnest(reverse_slugs) WITH ORDINALITY values(value,ord) ORDER BY ord DESC) AS path_slugs FROM ancestry WHERE parent_id IS NULL ORDER BY name`, [product.product_id]),
      pool.query<ProductReviewView>(`SELECT id,author_name,rating,title,body,verified_purchase,created_at
        FROM product_reviews WHERE product_id=$1 AND status='published'
        ORDER BY created_at DESC LIMIT 100`, [product.product_id]),
      pool.query<{ average: number; count: number }>(`SELECT coalesce(round(avg(rating)::numeric,1),0)::float8 AS average,
        count(*)::int AS count FROM product_reviews
        WHERE product_id=$1 AND status='published'`, [product.product_id])
    ]);
    const price = Number(product.price); const compareAt = Number(product.compare_at_price ?? 0);
    const cartItem = {
      listingId: product.id,
      variantId: product.variant_id,
      slug: product.slug,
      title: product.title,
      price,
      compareAt,
      image: product.image_url,
      sku: product.sku,
      brand: product.brand_name,
      vendor: product.vendor_name,
      description: product.description,
      shortDescription: product.short_description,
      videoUrl: product.video_url
    };
    const productImage = String(product.image_url || '/assets/wp-content/uploads/other-cat.webp');
    const absoluteImage = /^https?:\/\//.test(productImage) ? productImage : `${env.PUBLIC_ORIGIN.replace(/\/$/, '')}${productImage.startsWith('/') ? '' : '/'}${productImage}`;
    const schema = { '@context': 'https://schema.org', '@type': 'Product', name: product.title, description: product.short_description, sku: product.sku, image: [absoluteImage], ...(product.video_url ? { video: { '@type': 'VideoObject', name: product.title, description: product.short_description || product.title, contentUrl: product.video_url, thumbnailUrl: absoluteImage } } : {}), brand: { '@type': 'Brand', name: product.brand_name }, offers: { '@type': 'Offer', url: `${env.PUBLIC_ORIGIN.replace(/\/$/, '')}/mehsul/${product.slug}/`, price, priceCurrency: product.currency, availability: Number(product.stock) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@type': 'Organization', name: product.vendor_name } } };
    const content = `<div class="page-container db-product-breadcrumb">${breadcrumb([['Mağaza','/magaza/'],[product.title]])}</div>${renderProductDetail({
      product,
      related: related.rows,
      media: media.rows,
      categories: categories.rows,
      reviews: reviews.rows,
      reviewSummary: reviewSummary.rows[0] ?? { average: 0, count: 0 },
      cartItem
    })}`;
    return sendHtml(
      reply,
      layout({ title: product.seo_title || `${product.title} | TVShop`, description: product.seo_description || product.short_description, path: `/mehsul/${product.slug}/`, active: 'magaza', schema, content, image: productImage, ogType: 'product' }),
      200,
      'public, max-age=0, must-revalidate'
    );
  });

  app.get('/endirimler/', async (_request, reply) => {
    const products = await pool.query<ProductView>(`${productSelect} JOIN stores s ON s.id=pl.store_id WHERE s.code=$1 AND pl.status='published' AND pl.compare_at_price>pl.price ORDER BY (pl.compare_at_price-pl.price) DESC LIMIT 20`, [env.DEFAULT_STORE_CODE]);
    const section = requiredNavigationSection('endirimler');
    const content = `${pageHero('ENDİRİM MƏRKƏZİ', 'Endirimlər', 'Seçilmiş məhsullarda aktual endirimləri və sərfəli qiymətləri qaçırmayın.')}${categoryNavigation(section)}<section class="page-section"><div class="page-container"><div class="page-section-title"><div><p>SEÇİLMİŞ FÜRSƏTLƏR</p><h2>Endirimli məhsullar</h2></div><a href="/kuponlar/">Kuponlara bax →</a></div>${products.rows.length ? `<div class="page-product-grid db-featured-products">${products.rows.map(productCard).join('')}</div>` : emptyState('Endirimli məhsul tapılmadı', 'Yeni endirimlər tezliklə əlavə ediləcək.')}</div></section>`;
    return sendHtml(reply, layout({ title: 'Endirimlər | TVShop', description: 'TVShop mağazasında aktiv endirimlər və sərfəli məhsullar.', path: '/endirimler/', active: 'endirimler', schema: categorySchemas(section), content }));
  });

  app.get('/kuponlar/', async (_request, reply) => {
    const coupons = await pool.query(`SELECT c.*,v.display_name AS vendor_name FROM coupons c LEFT JOIN vendors v ON v.id=c.vendor_id JOIN stores s ON s.id=c.store_id WHERE s.code=$1 AND c.status='active' AND now() BETWEEN c.starts_at AND c.expires_at ORDER BY c.created_at DESC`, [env.DEFAULT_STORE_CODE]);
    const section = requiredNavigationSection('kuponlar');
    const couponCards = coupons.rows.map((coupon) => `<article><p>${escapeHtml(coupon.vendor_name || 'TVShop')}</p><h2>${escapeHtml(coupon.name)}</h2><strong>${coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `${money(coupon.discount_value)} `} ENDİRİM</strong><code>${escapeHtml(coupon.code_prefix)}</code><small>${new Intl.DateTimeFormat('az-AZ').format(new Date(coupon.expires_at))} tarixinədək</small></article>`).join('');
    const content = `${pageHero('AKTİV KUPONLAR', 'Kuponlar', 'Aktiv kupon kodlarını, istifadə şərtlərini və son tarixlərini ayrıca izləyin.')}<section class="page-section"><div class="page-container">${couponCards ? `<div class="page-coupon-grid">${couponCards}</div>` : emptyState('Aktiv kupon yoxdur', 'Yeni kuponlar əlavə edilən kimi burada görünəcək.', '/endirimler/', 'Endirimlərə bax')}</div></section>`;
    return sendHtml(reply, layout({ title: 'Kuponlar | TVShop', description: 'TVShop tərəfdaşlarının aktiv kupon kodları və istifadə müddətləri.', path: '/kuponlar/', active: 'kuponlar', schema: categorySchemas(section), content }));
  });

  app.get('/kampaniyalar/', async (_request, reply) => {
    const campaigns = await pool.query(`SELECT c.*,v.display_name AS vendor_name FROM campaigns c LEFT JOIN vendors v ON v.id=c.vendor_id JOIN stores s ON s.id=c.store_id WHERE s.code=$1 AND c.status IN ('active','scheduled') AND c.ends_at>now() ORDER BY c.starts_at DESC`, [env.DEFAULT_STORE_CODE]);
    const section = requiredNavigationSection('kampaniyalar');
    const content = `${pageHero('AKTİV FÜRSƏTLƏR', 'Kampaniyalar', 'Günün təklifləri, mövsümi endirimlər və məhdud kampaniyaları bir yerdə izləyin.')}${categoryNavigation(section)}<section class="page-section"><div class="page-container"><div class="page-campaign-grid">${renderCampaignCards(campaigns.rows) || emptyState('Aktiv kampaniya yoxdur','Yeni kampaniyalar tezliklə əlavə ediləcək.')}</div></div></section>`;
    return sendHtml(reply, layout({ title: 'Kampaniyalar | TVShop', description: 'TVShop-da aktiv kampaniyalar, günün təklifləri və mövsümi endirimlər.', path: '/kampaniyalar/', active: 'kampaniyalar', schema: categorySchemas(section), content }));
  });

  app.get('/jurnal/', async (request, reply) => {
    const query=z.object({nov:z.enum(['beledci','brend-hekayesi']).optional()}).parse(request.query);const params:unknown[]=[env.DEFAULT_STORE_CODE];let filter='';if(query.nov){params.push(query.nov==='beledci'?'guide':'brand_story');filter=` AND p.post_type=$${params.length}`;}
    const posts = await pool.query(`SELECT p.*,pc.name AS category_name,ma.public_url AS image_url FROM posts p JOIN stores s ON s.id=p.store_id LEFT JOIN post_categories pc ON pc.id=p.category_id LEFT JOIN media_assets ma ON ma.id=p.featured_asset_id WHERE s.code=$1 AND p.status='published' AND p.deleted_at IS NULL${filter} ORDER BY p.published_at DESC`, params);
    const section = requiredNavigationSection('jurnal');
    const content = `${pageHero('TVSHOP JURNAL', 'Şəhər, alış-veriş və brend hekayələri', 'Düzgün seçimlər, kampaniya bələdçiləri və şəhərin maraqlı biznes hekayələri.')}${categoryNavigation(section)}<section class="page-section"><div class="page-container">${posts.rows.length?`<div class="page-post-grid">${renderPostCards(posts.rows)}</div>`:emptyState('Jurnal hazırlanır','İlk məqalələr tezliklə dərc olunacaq.')}</div></section>`;
    return sendHtml(reply, layout({ title: 'Jurnal və Bloq | TVShop', description: 'TVShop jurnalında brend hekayələri, alış-veriş məsləhətləri və şəhər yenilikləri.', path: '/jurnal/', active: 'jurnal', schema: categorySchemas(section), content }));
  });

  app.get('/jurnal/:slug/', async (request, reply) => {
    const slug=z.string().min(2).max(220).parse((request.params as{slug:string}).slug);
    const result=await pool.query(`SELECT p.*,pc.name AS category_name,concat(u.first_name,' ',u.last_name) AS author_name FROM posts p JOIN stores s ON s.id=p.store_id LEFT JOIN post_categories pc ON pc.id=p.category_id LEFT JOIN users u ON u.id=p.author_id WHERE s.code=$1 AND p.slug=$2 AND p.status='published' AND p.deleted_at IS NULL`,[env.DEFAULT_STORE_CODE,slug]);
    const post=result.rows[0];if(!post)return sendHtml(reply,layout({title:'Məqalə tapılmadı | TVShop',description:'Axtardığınız məqalə mövcud deyil.',path:`/jurnal/${slug}/`,robots:'noindex,follow',content:`${pageHero('404','Məqalə tapılmadı','Jurnalın əsas səhifəsinə qayıdın.')}<div class="page-container">${emptyState('Məqalə tapılmadı','Digər yazılara baxa bilərsiniz.','/jurnal/','Jurnala bax')}</div>`}),404);
    const article=renderContentBlocks(post.content);
    const schema={'@context':'https://schema.org','@type':'Article',headline:post.title,description:post.excerpt,datePublished:post.published_at,dateModified:post.updated_at,author:{'@type':'Person',name:post.author_name||'TVShop redaksiyası'},publisher:{'@type':'Organization',name:'TVShop'}};
    const content=`<div class="page-container">${breadcrumb([['Jurnal','/jurnal/'],[post.title]])}<article class="page-article"><header><p>${escapeHtml(post.category_name||post.post_type)}</p><h1>${escapeHtml(post.title)}</h1><div>${escapeHtml(post.excerpt)}</div><small>${new Intl.DateTimeFormat('az-AZ',{dateStyle:'long'}).format(new Date(post.published_at))} · ${escapeHtml(post.author_name||'TVShop redaksiyası')}</small></header><div class="page-article-body">${article}</div></article></div>`;
    return sendHtml(reply,layout({title:post.seo_title||`${post.title} | TVShop`,description:post.seo_description||post.excerpt,path:`/jurnal/${post.slug}/`,active:'jurnal',schema,content,ogType:'article'}));
  });

  app.get('/elanlar/', async (request, reply) => {
    const query=z.object({nov:z.enum(['product','service','property','vehicle']).optional()}).parse(request.query);const params:unknown[]=[env.DEFAULT_STORE_CODE];let filter='';if(query.nov){params.push(query.nov);filter=` AND cl.category=$${params.length}`;}
    const listings=await pool.query(`SELECT cl.*,sc.name AS service_category_name,v.display_name AS vendor_name,ma.public_url AS image_url FROM classified_listings cl JOIN stores s ON s.id=cl.store_id LEFT JOIN service_categories sc ON sc.id=cl.service_category_id LEFT JOIN vendors v ON v.id=cl.vendor_id LEFT JOIN classified_media cm ON cm.listing_id=cl.id AND cm.position=0 LEFT JOIN media_assets ma ON ma.id=cm.media_asset_id WHERE s.code=$1 AND cl.status='published' AND cl.deleted_at IS NULL${filter} ORDER BY cl.created_at DESC`,params);
    const section = requiredNavigationSection('elanlar');
    const content=`${pageHero('ŞƏHƏR ELANLARI','Elanlar','Məhsul, xidmət, əmlak və avtomobil elanlarını rahat şəkildə kəşf edin.')}${categoryNavigation(section)}<section class="page-section"><div class="page-container">${listings.rows.length?`<div class="page-listing-grid">${renderListingCards(listings.rows)}</div>`:emptyState('Aktiv elan yoxdur','Yeni elanlar moderasiyadan sonra burada görünəcək.','/elaqe/','Elan yerləşdirmək üçün əlaqə')}</div></section>`;
    return sendHtml(reply,layout({title:'Elanlar | TVShop',description:'Bakı üzrə məhsul, xidmət, əmlak və avtomobil elanları.',path:'/elanlar/',active:'elanlar',schema:categorySchemas(section),content}));
  });

  const authPage = (path: string, title: string, subtitle: string, form: string, audience: 'customer' | 'vendor' = 'customer') => {
    const promo = audience === 'vendor'
      ? `<aside class="db-auth-promo db-auth-promo-vendor"><span>TVSHOP PARTNYORLUĞU</span><h1>Biznesinizi rəqəmsal vitrində böyüdün.</h1><p>Məhsullarınızı, stokunuzu və sifarişlərinizi vahid satıcı kabinetindən rahat idarə edin.</p><ul><li>Məhsul və stok idarəetməsi</li><li>Sifarişlərin real vaxt izlənməsi</li><li>Admin təsdiqli etibarlı tərəfdaş profili</li></ul></aside>`
      : `<aside class="db-auth-promo"><span>TVSHOP HESABI</span><h1>Alış-verişiniz hər cihazda sizinlə qalsın.</h1><p>Səbət, seçilmişlər, sifarişlər və Bakı Club xalları təhlükəsiz hesabınızda sinxronlaşdırılır.</p><ul><li>Sifarişləri bir yerdən izləyin</li><li>Seçilmiş məhsulları itirməyin</li><li>Xal və hədiyyələr qazanın</li></ul></aside>`;
    app.get(path, async (_request, reply) => sendHtml(reply, layout({
      title: `${title} | TVShop`,
      description: subtitle,
      path,
      robots: 'noindex,follow',
      content: `<section class="db-auth-page"><div class="page-container">${breadcrumb([[title]])}<div class="db-auth-layout">
        ${promo}
        <div class="db-auth-card"><div class="db-auth-card-head"><p>TƏHLÜKƏSİZ HESAB</p><h2>${escapeHtml(title)}</h2><span>${escapeHtml(subtitle)}</span></div>${form}</div>
      </div></div></section>`
    }), 200, 'private, no-store'));
  };

  authPage('/giris/', 'Daxil ol', 'Hesabınıza e-poçt və şifrənizlə daxil olun.', `
    <form class="db-auth-form" data-auth-form="login" novalidate>
      <label>E-poçt ünvanı<input name="email" type="email" autocomplete="email" required></label>
      <label>Şifrə<input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
      <div class="db-auth-options"><label><input name="remember" type="checkbox" checked> Məni xatırla</label><a href="/sifre-berpasi/">Şifrəni unutmusunuz?</a></div>
      <button type="submit">DAXİL OL</button><p class="db-auth-status" role="status" aria-live="polite"></p>
    </form><p class="db-auth-switch">Hesabınız yoxdur? <a href="/qeydiyyat/">Qeydiyyatdan keçin</a></p><p class="db-auth-switch db-auth-switch-secondary"><a href="/satici-girisi/">Satıcı olaraq daxil ol</a></p>`);

  authPage('/qeydiyyat/', 'Qeydiyyat', 'Bir dəqiqə ərzində şəxsi hesabınızı yaradın.', `
    <form class="db-auth-form" data-auth-form="register" novalidate>
      <div class="db-auth-form-grid"><label>Ad<input name="firstName" autocomplete="given-name" minlength="2" required></label><label>Soyad<input name="lastName" autocomplete="family-name" minlength="2" required></label></div>
      <label>E-poçt ünvanı<input name="email" type="email" autocomplete="email" required></label>
      <label>Telefon <small>(istəyə bağlı)</small><input name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="+994 12 345 67 89" maxlength="17" pattern="\\+994 [0-9]{2} [0-9]{3} [0-9]{2} [0-9]{2}" data-az-phone></label>
      <fieldset class="db-auth-demographics"><legend>Şəxsi məlumatlar</legend><p>Bu məlumatlar sizə daha uyğun təkliflər göstərməyimizə kömək edir.</p><div class="db-auth-form-grid">
        <label>Yaş<input name="age" type="number" inputmode="numeric" min="1" max="120" step="1" placeholder="Məsələn, 28" required></label>
        <label>Cinsiyyət<select name="gender" required><option value="" selected disabled>Seçin</option><option value="male">Kişi</option><option value="female">Qadın</option></select></label>
        <label class="db-auth-field-wide">Ailə vəziyyəti<select name="maritalStatus" required><option value="" selected disabled>Seçin</option><option value="married">Evli</option><option value="single">Subay</option></select></label>
      </div></fieldset>
      <label>Şifrə<input name="password" type="password" autocomplete="new-password" minlength="12" required><small>Ən az 12 simvol istifadə edin.</small></label>
      <label>Şifrəni təsdiqləyin<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required></label>
      <label class="db-auth-consent"><input name="terms" type="checkbox" required><span><a href="/istifade-sertleri/">İstifadə şərtləri</a> və <a href="/mexfilik/">məxfilik siyasəti</a> ilə razıyam.</span></label>
      <button type="submit">HESAB YARAT</button><p class="db-auth-status" role="status" aria-live="polite"></p>
    </form><p class="db-auth-switch">Artıq hesabınız var? <a href="/giris/">Daxil olun</a></p><p class="db-auth-switch db-auth-switch-secondary">Biznesinizi platformaya qoşmaq istəyirsiniz? <a href="/satici-qeydiyyati/">Partnyorluq üçün qeydiyyatdan keçin</a></p>`);

  authPage('/satici-girisi/', 'Satıcı olaraq daxil ol', 'Satıcı hesabınızla kabinetə daxil olun.', `
    <form class="db-auth-form" data-auth-form="vendor-login" novalidate>
      <label>E-poçt ünvanı<input name="email" type="email" autocomplete="email" required></label>
      <label>Şifrə<input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
      <div class="db-auth-options"><span></span><a href="/sifre-berpasi/">Şifrəni unutmusunuz?</a></div>
      <button type="submit">SATICI KABİNETİNƏ DAXİL OL</button><p class="db-auth-status" role="status" aria-live="polite"></p>
    </form><p class="db-auth-switch">Satıcı hesabınız yoxdur? <a href="/satici-qeydiyyati/">Partnyorluq üçün qeydiyyatdan keçin</a></p><p class="db-auth-switch db-auth-switch-secondary"><a href="/giris/">Müştəri olaraq daxil ol</a></p>`, 'vendor');

  authPage('/satici-qeydiyyati/', 'Partnyorluq qeydiyyatı', 'Məlumatlarınızı göndərin, admin təsdiqindən sonra satıcı kabinetiniz aktivləşdirilsin.', `
    <form class="db-auth-form" data-auth-form="vendor-register" novalidate>
      <div class="db-auth-form-grid"><label>Ad<input name="firstName" autocomplete="given-name" minlength="2" required></label><label>Soyad<input name="lastName" autocomplete="family-name" minlength="2" required></label></div>
      <label>Biznesin görünən adı<input name="displayName" autocomplete="organization" minlength="2" required></label>
      <label>Hüquqi ad<input name="legalName" autocomplete="organization" minlength="2" required></label>
      <div class="db-auth-form-grid"><label>VÖEN<input name="taxId" inputmode="numeric" minlength="5" maxlength="80" required></label><label>Telefon<input name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="+994 12 345 67 89" maxlength="17" pattern="\\+994 [0-9]{2} [0-9]{3} [0-9]{2} [0-9]{2}" data-az-phone required></label></div>
      <label>E-poçt ünvanı<input name="email" type="email" autocomplete="email" required></label>
      <label>Biznes haqqında qısa məlumat <small>(istəyə bağlı)</small><textarea name="description" rows="4" maxlength="5000"></textarea></label>
      <label>Şifrə<input name="password" type="password" autocomplete="new-password" minlength="12" required><small>Ən az 12 simvol istifadə edin.</small></label>
      <label>Şifrəni təsdiqləyin<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required></label>
      <label class="db-auth-consent"><input name="terms" type="checkbox" required><span><a href="/istifade-sertleri/">İstifadə şərtləri</a> və <a href="/mexfilik/">məxfilik siyasəti</a> ilə razıyam.</span></label>
      <button type="submit">PARTNYORLUQ MÜRACİƏTİNİ GÖNDƏR</button><p class="db-auth-status" role="status" aria-live="polite"></p>
    </form><p class="db-auth-switch">Artıq satıcı hesabınız var? <a href="/satici-girisi/">Satıcı olaraq daxil olun</a></p><p class="db-auth-switch db-auth-switch-secondary"><a href="/qeydiyyat/">Müştəri hesabı yaradın</a></p>`, 'vendor');

  authPage('/sifre-berpasi/', 'Şifrəni bərpa et', 'E-poçtunuza bir dəfə istifadə edilən təhlükəsiz keçid göndərəcəyik.', `
    <form class="db-auth-form" data-auth-form="forgot-password" novalidate><label>E-poçt ünvanı<input name="email" type="email" autocomplete="email" required></label><button type="submit">BƏRPA KEÇİDİ GÖNDƏR</button><p class="db-auth-status" role="status" aria-live="polite"></p></form><p class="db-auth-switch"><a href="/giris/">Daxil ol səhifəsinə qayıt</a></p>`);

  authPage('/sifre-yenile/', 'Yeni şifrə təyin et', 'Yeni və güclü şifrənizi daxil edin.', `
    <form class="db-auth-form" data-auth-form="reset-password" novalidate><input name="token" type="hidden"><label>Yeni şifrə<input name="password" type="password" autocomplete="new-password" minlength="12" required></label><label>Şifrəni təsdiqləyin<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required></label><button type="submit">ŞİFRƏNİ YENİLƏ</button><p class="db-auth-status" role="status" aria-live="polite"></p></form>`);

  authPage('/deveti-qebul-et/', 'Dəvəti qəbul et', 'Hesabınızı aktivləşdirərək TVShop idarəetmə mühitinə daxil olun.', `
    <form class="db-auth-form" data-auth-form="accept-invite" novalidate><input name="token" type="hidden"><div class="db-auth-token-copy" data-auth-token-copy>Keçid yoxlanılır…</div><label>Yeni şifrə<input name="password" type="password" autocomplete="new-password" minlength="12" required></label><label>Şifrəni təsdiqləyin<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required></label><button type="submit">HESABI AKTİVLƏŞDİR</button><p class="db-auth-status" role="status" aria-live="polite"></p></form>`);

  const accountPage = (
    path: string,
    section: Parameters<typeof accountShell>[0],
    title: string,
    body: string
  ) => {
    app.get(path, async (_request, reply) => sendHtml(reply, layout({
      title: `${title} | TVShop`,
      description: 'TVShop hesab məlumatlarınızı, seçilmiş məhsulları və sifarişləri idarə edin.',
      path,
      robots: 'noindex,follow',
      content: accountShell(section, body)
    }), 200, 'private, no-store'));
  };

  accountPage('/hesabim/', 'dashboard', 'Hesabım', `
    <p class="db-account-notice">TVShop hesabınız hazırdır. Səbətiniz, seçilmiş məhsullarınız və hesab məlumatlarınız təhlükəsiz şəkildə sinxronlaşdırılır.</p>
    <p class="db-account-copy">Salam, <strong data-account-name>Qonaq</strong> (<strong data-account-name>Qonaq</strong> siz deyilsiniz? <a href="/" data-account-logout>Çıxış edin</a>)</p>
    <p class="db-account-copy">Hesab panelindən <a href="/hesabim/sifarisler/">son sifarişlərinizə</a> baxa, <a href="/hesabim/unvanlar/">ödəniş və çatdırılma ünvanlarınızı</a> idarə edə, həmçinin <a href="/hesabim/hesab-melumatlari/">şifrənizi və hesab məlumatlarınızı dəyişə bilərsiniz</a>.</p>
  `);

  accountPage('/hesabim/secilmisler/', 'wishlist', 'Seçilmişlər', `
    <div data-account-wishlist><div class="db-account-loading">Seçilmiş məhsullar yüklənir…</div></div>
  `);

  accountPage('/hesabim/sifarisler/', 'orders', 'Sifarişlər', `
    <div data-account-orders><div class="db-account-loading">Sifarişlər yüklənir…</div></div>
  `);

  accountPage('/hesabim/baki-club/', 'club', 'Bakı Club', `
    <div data-account-club><div class="db-account-loading">Bakı Club məlumatları yüklənir…</div></div>
  `);

  accountPage('/hesabim/bildirisler/', 'notifications', 'Bildirişlər', `
    <div class="db-account-notification-head"><div><h2>Bildirişlər</h2><p>Sifariş, kupon və Bakı Club yenilikləri burada görünür.</p></div><button class="db-account-action" type="button" data-notifications-read-all>Hamısını oxunmuş et</button></div>
    <div data-account-notifications><div class="db-account-loading">Bildirişlər yüklənir…</div></div>
  `);

  app.get('/hesabim/tarixce/', async (_request, reply) => reply.redirect('/hesabim/sifarisler/'));

  const addressForm = (type: 'billing' | 'shipping') => `
    <form class="db-account-form" data-account-address-form="${type}" hidden>
      <div class="db-account-form-grid">
        <label>Qəbul edənin adı *<input name="recipientName" autocomplete="name" required minlength="2"></label>
        <label>Telefon *<input name="phone" autocomplete="tel" required minlength="7"></label>
        <label>Şəhər *<input name="city" autocomplete="address-level2" required minlength="2"></label>
        <label>Rayon<input name="district" autocomplete="address-level3"></label>
        <label class="db-account-wide">Ünvan *<input name="addressLine1" autocomplete="street-address" required minlength="5"></label>
        <label>Poçt indeksi<input name="postalCode" autocomplete="postal-code"></label>
        <label>Ölkə kodu<input name="countryCode" value="AZ" maxlength="2" required></label>
      </div>
      <input type="hidden" name="label" value="${type === 'billing' ? 'Ödəniş ünvanı' : 'Çatdırılma ünvanı'}">
      <button class="db-account-action" type="submit">Ünvanı yadda saxla</button>
      <p class="db-account-form-status" role="status" aria-live="polite"></p>
    </form>`;

  accountPage('/hesabim/unvanlar/', 'addresses', 'Ünvanlar', `
    <p class="db-account-address-intro">Aşağıdakı ünvanlar sifariş səhifəsində standart olaraq istifadə ediləcək.</p>
    <section class="db-account-address-block">
      <h2>Ödəniş ünvanı</h2>
      <button class="db-account-action" type="button" data-account-address-toggle="billing">Ödəniş ünvanı əlavə et</button>
      <div class="db-account-address-summary" data-account-address-summary="billing">Bu ünvan növü hələ əlavə edilməyib.</div>
      ${addressForm('billing')}
    </section>
    <section class="db-account-address-block">
      <h2>Çatdırılma ünvanı</h2>
      <button class="db-account-action" type="button" data-account-address-toggle="shipping">Çatdırılma ünvanı əlavə et</button>
      <div class="db-account-address-summary" data-account-address-summary="shipping">Bu ünvan növü hələ əlavə edilməyib.</div>
      ${addressForm('shipping')}
    </section>
  `);

  accountPage('/hesabim/hesab-melumatlari/', 'details', 'Hesab məlumatları', `
    <p class="db-account-notice">TVShop hesab məlumatlarınız təhlükəsiz saxlanılır. Profil və şifrə dəyişiklikləri ayrı-ayrılıqda yadda saxlanılır.</p>
    <form class="db-account-form" data-account-profile-form>
      <label>Ad *<input name="firstName" autocomplete="given-name" required></label>
      <label>Soyad *<input name="lastName" autocomplete="family-name" required></label>
      <label>Görünən ad *<input name="displayName" autocomplete="nickname" required><small>Adınız hesab bölməsində və rəylərdə bu formada göstəriləcək.</small></label>
      <label>E-poçt ünvanı *<input name="email" type="email" autocomplete="email" required></label>
      <label>Telefon<input name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="+994 12 345 67 89" maxlength="17" pattern="\\+994 [0-9]{2} [0-9]{3} [0-9]{2} [0-9]{2}" data-az-phone></label>
      <button class="db-account-action" type="submit">Profil məlumatlarını yadda saxla</button>
      <p class="db-account-form-status" role="status" aria-live="polite"></p>
    </form>
    <form class="db-account-form db-account-password-form" data-account-password-form>
      <h3>Şifrəni dəyiş</h3>
      <label>Cari şifrə<input name="currentPassword" type="password" autocomplete="current-password" required></label>
      <label>Yeni şifrə<input name="newPassword" type="password" autocomplete="new-password" minlength="12" required></label>
      <label>Yeni şifrəni təsdiqləyin<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required></label>
      <button class="db-account-action" type="submit">Şifrəni yenilə</button>
      <p class="db-account-form-status" role="status" aria-live="polite"></p>
    </form>
  `);

  app.get('/sebet/', async (_request, reply) => sendHtml(reply,layout({title:'Səbət | TVShop',description:'TVShop səbətinizdə seçdiyiniz məhsulları nəzərdən keçirin.',path:'/sebet/',robots:'noindex,follow',content:`<div class="page-container">${breadcrumb([['Səbət']])}</div><section class="page-section"><div class="page-container"><div data-cart-page></div></div></section>`})));

  for (const [slug, page] of Object.entries(staticPages)) {
    app.get(`/${slug}/`, async (_request, reply) => {
      const result = await pool.query(`SELECT title,excerpt,content,seo_title,seo_description,robots_directive,schema_data FROM pages p JOIN stores s ON s.id=p.store_id WHERE s.code=$1 AND p.locale='az-AZ' AND p.slug=$2 AND p.status='published' AND p.deleted_at IS NULL LIMIT 1`, [env.DEFAULT_STORE_CODE, slug]);
      const cms = result.rows[0];
      const title = cms?.title || page.title;
      const description = cms?.seo_description || cms?.excerpt || page.description;
      const body = cms ? `<section class="page-prose">${renderContentBlocks(cms.content)}</section>` : page.body;
      const navigationSection = navigationSections.find((section) => section.slug === slug);
      const schemas: Array<Record<string, unknown>> = navigationSection ? categorySchemas(navigationSection) : [];
      if (cms?.schema_data && Object.keys(cms.schema_data).length) schemas.push(cms.schema_data);
      return sendHtml(reply, layout({
        title: cms?.seo_title || `${title} | TVShop`,
        description,
        path: `/${slug}/`,
        ...(page.active ? { active: page.active } : {}),
        ...(cms?.robots_directive ? { robots: cms.robots_directive } : {}),
        ...(schemas.length ? { schema: schemas } : {}),
        content: `${pageHero(page.kicker, title, cms?.excerpt || page.description)}${navigationSection ? categoryNavigation(navigationSection) : ''}<section class="page-section"><div class="page-container">${body}</div></section>`
      }));
    });
  }

  app.get('/:slug/', async (request, reply) => {
    const slug = z.string().min(2).max(220).parse((request.params as { slug: string }).slug);
    const result = await pool.query(`SELECT title,slug,excerpt,content,seo_title,seo_description,robots_directive,schema_data FROM pages p JOIN stores s ON s.id=p.store_id WHERE s.code=$1 AND p.locale='az-AZ' AND p.slug=$2 AND p.status='published' AND p.deleted_at IS NULL LIMIT 1`, [env.DEFAULT_STORE_CODE, slug]);
    const page = result.rows[0];
    if (!page) return sendHtml(reply, layout({ title: 'Səhifə tapılmadı | TVShop', description: 'Axtardığınız səhifə mövcud deyil.', path: `/${slug}/`, robots: 'noindex,follow', content: `${pageHero('404', 'Səhifə tapılmadı', 'Ünvanı yoxlayın və ya ana səhifəyə qayıdın.')}<div class="page-container">${emptyState('Səhifə tapılmadı', 'Axtardığınız məzmun silinmiş və ya ünvanı dəyişmiş ola bilər.', '/', 'Ana səhifəyə qayıt')}</div>` }), 404);
    const description = page.seo_description || page.excerpt;
    return sendHtml(reply, layout({
      title: page.seo_title || `${page.title} | TVShop`,
      description,
      path: `/${page.slug}/`,
      robots: page.robots_directive,
      ...(page.schema_data && Object.keys(page.schema_data).length ? { schema: page.schema_data } : {}),
      content: `${pageHero('TVSHOP', page.title, page.excerpt)}<section class="page-section"><div class="page-container"><section class="page-prose">${renderContentBlocks(page.content)}</section></div></section>`
    }));
  });
}
