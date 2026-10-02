import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closePool, pool } from './pool.js';
import { env } from '../config/env.js';

const expectedCategories = [
  'elektronika', 'ev-metbex', 'moda', 'gozellik-saglamliq', 'qida',
  'usaq', 'avtomobil', 'xidmetler', 'hediyyeler'
] as const;

const minimumCounts: Record<string, number> = {
  products: 82,
  product_reviews: 24,
  vendors: 4,
  users: 8,
  orders: 10,
  brands: 20,
  posts: 8,
  post_categories: 5,
  pages: 6,
  journal_issues: 3,
  seo_clusters: 4,
  classified_listings: 8,
  campaigns: 6,
  coupons: 6,
  qr_codes: 6,
  rewards: 7,
  reward_redemptions: 3,
  media_assets: 90
};

async function audit(): Promise<void> {
  const store = await pool.query<{ id: string }>('SELECT id FROM stores WHERE code=$1', [env.DEFAULT_STORE_CODE]);
  const storeId = store.rows[0]?.id;
  if (!storeId) throw new Error(`Demo mağaza tapılmadı: ${env.DEFAULT_STORE_CODE}`);

  const categoryCounts = await pool.query<{ slug: string; product_count: number }>(`
    SELECT c.slug,count(DISTINCT p.id)::int AS product_count
    FROM categories c
    LEFT JOIN product_categories pc ON pc.category_id=c.id
    LEFT JOIN products p ON p.id=pc.product_id AND p.status='published' AND p.deleted_at IS NULL
    LEFT JOIN product_listings pl ON pl.product_id=p.id AND pl.store_id=c.store_id AND pl.status='published'
    WHERE c.store_id=$1 AND c.slug=ANY($2::text[]) AND c.status='active'
    GROUP BY c.id ORDER BY c.position
  `, [storeId, expectedCategories]);
  const productCountByCategory = new Map(categoryCounts.rows.map((row) => [row.slug, Number(row.product_count)]));
  const categoryFailures = expectedCategories
    .filter((slug) => (productCountByCategory.get(slug) ?? 0) < 10)
    .map((slug) => `${slug}: ${productCountByCategory.get(slug) ?? 0}/10`);

  const countRows = await pool.query<{ section: string; total: number }>(`
    SELECT 'products' section,count(*)::int total FROM products p JOIN vendors v ON v.id=p.vendor_id WHERE v.store_id=$1 AND p.deleted_at IS NULL
    UNION ALL SELECT 'product_reviews',count(*)::int FROM product_reviews WHERE store_id=$1
    UNION ALL SELECT 'vendors',count(*)::int FROM vendors WHERE store_id=$1 AND deleted_at IS NULL
    UNION ALL SELECT 'users',count(DISTINCT ur.user_id)::int FROM user_roles ur WHERE ur.store_id=$1
    UNION ALL SELECT 'orders',count(*)::int FROM orders WHERE store_id=$1
    UNION ALL SELECT 'brands',count(*)::int FROM brands WHERE store_id=$1
    UNION ALL SELECT 'posts',count(*)::int FROM posts WHERE store_id=$1 AND deleted_at IS NULL
    UNION ALL SELECT 'post_categories',count(*)::int FROM post_categories WHERE store_id=$1
    UNION ALL SELECT 'pages',count(*)::int FROM pages WHERE store_id=$1 AND deleted_at IS NULL
    UNION ALL SELECT 'journal_issues',count(*)::int FROM journal_issues WHERE store_id=$1
    UNION ALL SELECT 'seo_clusters',count(*)::int FROM seo_clusters WHERE store_id=$1
    UNION ALL SELECT 'classified_listings',count(*)::int FROM classified_listings WHERE store_id=$1 AND deleted_at IS NULL
    UNION ALL SELECT 'campaigns',count(*)::int FROM campaigns WHERE store_id=$1
    UNION ALL SELECT 'coupons',count(*)::int FROM coupons WHERE store_id=$1
    UNION ALL SELECT 'qr_codes',count(*)::int FROM qr_codes WHERE store_id=$1
    UNION ALL SELECT 'rewards',count(*)::int FROM rewards WHERE store_id=$1
    UNION ALL SELECT 'reward_redemptions',count(*)::int FROM reward_redemptions rr JOIN rewards r ON r.id=rr.reward_id WHERE r.store_id=$1
    UNION ALL SELECT 'media_assets',count(*)::int FROM media_assets WHERE store_id=$1
  `, [storeId]);
  const counts = new Map(countRows.rows.map((row) => [row.section, Number(row.total)]));
  const sectionFailures = Object.entries(minimumCounts)
    .filter(([section, minimum]) => (counts.get(section) ?? 0) < minimum)
    .map(([section, minimum]) => `${section}: ${counts.get(section) ?? 0}/${minimum}`);

  const incomplete = await pool.query<{ sku: string }>(`
    SELECT p.sku
    FROM products p
    JOIN vendors v ON v.id=p.vendor_id
    LEFT JOIN product_listings pl ON pl.product_id=p.id AND pl.store_id=v.store_id AND pl.status='published'
    LEFT JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary
    LEFT JOIN media_assets ma ON ma.id=pm.media_asset_id
    LEFT JOIN product_variants pv ON pv.product_id=p.id AND pv.status='active'
    LEFT JOIN inventory i ON i.variant_id=pv.id
    WHERE v.store_id=$1 AND p.attributes->>'demo'='true' AND p.deleted_at IS NULL
    GROUP BY p.id
    HAVING count(pl.id)=0 OR max(pl.price) IS NULL OR count(ma.id)=0 OR count(pv.id)=0 OR count(i.variant_id)=0
  `, [storeId]);

  const media = await pool.query<{ public_url: string }>(`
    SELECT DISTINCT ma.public_url FROM media_assets ma
    WHERE ma.store_id=$1 AND ma.metadata->>'demo'='true' AND ma.public_url LIKE '/assets/%'
  `, [storeId]);
  const missingAssets: string[] = [];
  for (const row of media.rows) {
    const filePath = resolve(process.cwd(), '../frontend', row.public_url.slice(1));
    try { await access(filePath); } catch { missingAssets.push(row.public_url); }
  }

  console.table(categoryCounts.rows);
  console.table(countRows.rows);
  if (categoryFailures.length || sectionFailures.length || incomplete.rows.length || missingAssets.length) {
    throw new Error([
      categoryFailures.length ? `Kateqoriya minimumları: ${categoryFailures.join(', ')}` : '',
      sectionFailures.length ? `Admin bölmələri: ${sectionFailures.join(', ')}` : '',
      incomplete.rows.length ? `Natamam demo məhsullar: ${incomplete.rows.map((row) => row.sku).join(', ')}` : '',
      missingAssets.length ? `Tapılmayan assetlər: ${missingAssets.join(', ')}` : ''
    ].filter(Boolean).join('\n'));
  }
  console.log(`Demo data audit passed: ${expectedCategories.length} kateqoriya, ${counts.get('products')} məhsul, bütün idarəetmə bölmələri doludur.`);
}

audit()
  .then(closePool)
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exitCode = 1;
  });
