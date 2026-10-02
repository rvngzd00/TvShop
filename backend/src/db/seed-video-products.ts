import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { closePool, pool, withTransaction } from './pool.js';

const runFile = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));

type DemoProduct = {
  sku: string;
  title: string;
  slug: string;
  vendor: string;
  category: string;
  sourceImage: string;
  price: number;
  compareAt: number;
  stock: number;
  short: string;
  badge: 'sale' | 'hot' | 'new' | 'recommended';
};

const products: DemoProduct[] = [
  {
    sku: 'TVS-VID-001',
    title: 'Smart Vision Pro 55 televizor',
    slug: 'smart-vision-pro-55-televizor',
    vendor: 'TechnoHome',
    category: 'elektronika',
    sourceImage: 'frontend/assets/images/categories/magaza/elektronika.jpg',
    price: 1199,
    compareAt: 1399,
    stock: 12,
    short: '4K görüntü, ağıllı tətbiqlər və çərçivəsiz dizaynı videoda yaxından görün.',
    badge: 'hot'
  },
  {
    sku: 'TVS-VID-002',
    title: 'AirChef Mini fritöz',
    slug: 'airchef-mini-fritoz',
    vendor: 'Baku Pro Market',
    category: 'ev-metbex',
    sourceImage: 'frontend/assets/images/categories/magaza/ev-metbex.jpg',
    price: 189,
    compareAt: 229,
    stock: 24,
    short: 'Az yağla sürətli bişirmə və rahat idarəetmə xüsusiyyətlərini videoda izləyin.',
    badge: 'sale'
  },
  {
    sku: 'TVS-VID-003',
    title: 'Urban Flex gündəlik gödəkçə',
    slug: 'urban-flex-gundelik-godekce',
    vendor: 'Urban Life',
    category: 'moda',
    sourceImage: 'frontend/assets/images/categories/magaza/moda.jpg',
    price: 129,
    compareAt: 159,
    stock: 18,
    short: 'Yüngül material, rahat biçim və şəhər üslubunu qısa məhsul videosunda kəşf edin.',
    badge: 'new'
  },
  {
    sku: 'TVS-VID-004',
    title: 'GlowCare üz baxım dəsti',
    slug: 'glowcare-uz-baxim-desti',
    vendor: 'Revan',
    category: 'gozellik-saglamliq',
    sourceImage: 'frontend/assets/images/categories/magaza/gozellik-saglamliq.jpg',
    price: 79,
    compareAt: 99,
    stock: 32,
    short: 'Gündəlik dəri baxımı üçün üç addımlı setin tərkibini videodan yoxlayın.',
    badge: 'recommended'
  },
  {
    sku: 'TVS-VID-005',
    title: 'Premium dağ balı 500 q',
    slug: 'premium-dag-bali-500-q',
    vendor: 'Baku Pro Market',
    category: 'qida',
    sourceImage: 'frontend/assets/images/categories/magaza/qida.jpg',
    price: 34,
    compareAt: 42,
    stock: 40,
    short: 'Təbii dağ balının rəngini, qatılığını və qablaşdırmasını videoda görün.',
    badge: 'sale'
  },
  {
    sku: 'TVS-VID-006',
    title: 'RoboBuilder konstruktor dəsti',
    slug: 'robobuilder-konstruktor-desti',
    vendor: 'Urban Life',
    category: 'usaq',
    sourceImage: 'frontend/assets/images/categories/magaza/usaq.jpg',
    price: 65,
    compareAt: 79,
    stock: 21,
    short: 'Uşaqların yaradıcılığını inkişaf etdirən hissələri və modeli videoda izləyin.',
    badge: 'new'
  },
  {
    sku: 'TVS-VID-007',
    title: 'DriveCam 4K yol kamerası',
    slug: 'drivecam-4k-yol-kamerasi',
    vendor: 'TechnoHome',
    category: 'avtomobil',
    sourceImage: 'frontend/assets/images/categories/magaza/avtomobil.jpg',
    price: 149,
    compareAt: 179,
    stock: 16,
    short: 'Gecə çəkilişi, geniş bucaq və kompakt quruluşu məhsul videosunda görün.',
    badge: 'hot'
  },
  {
    sku: 'TVS-VID-008',
    title: 'Ev təmizliyi xidmət paketi',
    slug: 'ev-temizliyi-xidmet-paketi',
    vendor: 'Bakı Usta',
    category: 'xidmetler',
    sourceImage: 'frontend/assets/images/categories/magaza/xidmetler.jpg',
    price: 89,
    compareAt: 109,
    stock: 50,
    short: 'Paketə daxil olan iş mərhələlərini və nəticəni təqdimat videosunda izləyin.',
    badge: 'recommended'
  },
  {
    sku: 'TVS-VID-009',
    title: 'Smart hədiyyə qutusu',
    slug: 'smart-hediyye-qutusu',
    vendor: 'Revan',
    category: 'hediyyeler',
    sourceImage: 'frontend/assets/images/categories/baki-club/hediyyeler.jpg',
    price: 55,
    compareAt: 69,
    stock: 28,
    short: 'Xüsusi günlər üçün seçilmiş qutunun içindəkiləri videoda kəşf edin.',
    badge: 'recommended'
  },
  {
    sku: 'TVS-VID-010',
    title: 'Pulse ANC simsiz qulaqlıq',
    slug: 'pulse-anc-simsiz-qulaqliq',
    vendor: 'TechnoHome',
    category: 'elektronika',
    sourceImage: 'frontend/assets/wp-content/uploads/Electrical-Tools-1.webp',
    price: 219,
    compareAt: 259,
    stock: 20,
    short: 'Aktiv səsboğma, yumşaq qulaqcıqlar və qatlanan dizaynı videoda yoxlayın.',
    badge: 'new'
  }
];

async function generateVideos(storeId: string): Promise<Array<{ storageKey: string; publicUrl: string; byteSize: number }>> {
  const outputDirectory = resolve(process.cwd(), env.UPLOAD_DIR, storeId, 'video-demo');
  await mkdir(outputDirectory, { recursive: true });

  return Promise.all(products.map(async (product, index) => {
    const filename = `tvshop-product-${String(index + 1).padStart(2, '0')}.mp4`;
    const target = resolve(outputDirectory, filename);
    const source = resolve(projectRoot, product.sourceImage);
    const hue = index * 18;
    await runFile('ffmpeg', [
      '-y', '-loglevel', 'error', '-loop', '1', '-i', source, '-t', '3',
      '-vf', `scale=720:900:force_original_aspect_ratio=increase,crop=720:900,zoompan=z='min(zoom+0.0014,1.10)':d=90:s=720x900:fps=30,hue=h=${hue},format=yuv420p`,
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', '+faststart', target
    ], { maxBuffer: 10 * 1024 * 1024 });
    const file = await stat(target);
    const storageKey = `${storeId}/video-demo/${filename}`;
    return { storageKey, publicUrl: `/uploads/${storageKey}`, byteSize: file.size };
  }));
}

async function replaceCatalog(): Promise<void> {
  const storeResult = await pool.query<{ id: string }>('SELECT id FROM stores WHERE code=$1', [env.DEFAULT_STORE_CODE]);
  const storeId = storeResult.rows[0]?.id;
  if (!storeId) throw new Error(`Store not found: ${env.DEFAULT_STORE_CODE}`);

  const videos = await generateVideos(storeId);
  const result = await withTransaction(async (client) => {
    const vendorResult = await client.query<{ id: string; display_name: string }>(
      "SELECT id,display_name FROM vendors WHERE store_id=$1 AND status='active' AND deleted_at IS NULL",
      [storeId]
    );
    const categoryResult = await client.query<{ id: string; slug: string }>(
      "SELECT id,slug FROM categories WHERE store_id=$1 AND status='active' AND parent_id IS NULL",
      [storeId]
    );
    const warehouseResult = await client.query<{ id: string }>(
      "SELECT id FROM warehouses WHERE store_id=$1 AND status='active' ORDER BY (vendor_id IS NULL) DESC,created_at LIMIT 1",
      [storeId]
    );
    const userResult = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE email=$1 LIMIT 1',
      [env.BOOTSTRAP_ADMIN_EMAIL]
    );
    const vendorIds = new Map(vendorResult.rows.map((row) => [row.display_name, row.id]));
    const categoryIds = new Map(categoryResult.rows.map((row) => [row.slug, row.id]));
    const warehouseId = warehouseResult.rows[0]?.id;
    const actorId = userResult.rows[0]?.id ?? null;
    if (!warehouseId) throw new Error('An active warehouse is required before seeding video products');

    for (const product of products) {
      if (!vendorIds.has(product.vendor)) throw new Error(`Active vendor not found: ${product.vendor}`);
      if (!categoryIds.has(product.category)) throw new Error(`Active root category not found: ${product.category}`);
    }

    const movementResult = await client.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM inventory_movements im
      JOIN product_variants pv ON pv.id=im.variant_id
      JOIN products p ON p.id=pv.product_id
      JOIN vendors v ON v.id=p.vendor_id
      WHERE v.store_id=$1
    `, [storeId]);
    const deletedResult = await client.query<{ id: string }>(`
      DELETE FROM products p USING vendors v
      WHERE p.vendor_id=v.id AND v.store_id=$1
      RETURNING p.id
    `, [storeId]);
    await client.query(
      "DELETE FROM media_assets WHERE store_id=$1 AND metadata->>'source'='tvshop-video-demo'",
      [storeId]
    );

    for (const [index, product] of products.entries()) {
      const vendorId = vendorIds.get(product.vendor)!;
      const categoryId = categoryIds.get(product.category)!;
      const video = videos[index]!;
      const mediaResult = await client.query<{ id: string }>(`
        INSERT INTO media_assets(store_id,vendor_id,uploaded_by,storage_key,public_url,mime_type,byte_size,alt_text,title,metadata)
        VALUES($1,$2,$3,$4,$5,'video/mp4',$6,$7,$8,$9)
        RETURNING id
      `, [
        storeId,
        vendorId,
        actorId,
        video.storageKey,
        video.publicUrl,
        video.byteSize,
        `${product.title} — məhsul videosu`,
        product.title,
        JSON.stringify({ source: 'tvshop-video-demo', videoOnly: true, generatedFrom: product.sourceImage })
      ]);
      const productResult = await client.query<{ id: string }>(`
        INSERT INTO products(vendor_id,sku,name,description,product_type,status,attributes,created_by,reviewed_by,reviewed_at,video_asset_id)
        VALUES($1,$2,$3,$4,$5,'published',$6,$7,$7,now(),$8)
        RETURNING id
      `, [
        vendorId,
        product.sku,
        product.title,
        product.short,
        product.category === 'xidmetler' ? 'service' : 'physical',
        JSON.stringify({ videoOnly: true, format: 'MP4', duration: '3 saniyə', demo: true }),
        actorId,
        mediaResult.rows[0]!.id
      ]);
      const productId = productResult.rows[0]!.id;
      await client.query(`
        INSERT INTO product_listings(
          store_id,product_id,locale,title,slug,short_description,description,price,compare_at_price,currency,status,
          seo_title,seo_description,canonical_url,schema_data,published_at,is_featured,is_popular,is_top_pick,display_position,merchandising_badge
        )
        VALUES($1,$2,'az-AZ',$3,$4,$5,$6,$7,$8,'AZN','published',$9,$10,$11,$12,now(),true,true,true,$13,$14)
      `, [
        storeId,
        productId,
        product.title,
        product.slug,
        product.short,
        `${product.short} Bu video-only demo məhsul TVShop video satış axınını yoxlamaq üçün yaradılıb.`,
        product.price,
        product.compareAt,
        `${product.title} | TVShop`,
        product.short,
        `/mehsul/${product.slug}/`,
        JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: product.title, sku: product.sku }),
        index,
        product.badge
      ]);
      await client.query(
        'INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,true)',
        [productId, categoryId]
      );
      const variantResult = await client.query<{ id: string }>(`
        INSERT INTO product_variants(product_id,sku,title,option_values,status)
        VALUES($1,$2,'Standart','{}','active') RETURNING id
      `, [productId, product.sku]);
      await client.query(`
        INSERT INTO inventory(variant_id,warehouse_id,quantity,reserved,reorder_level)
        VALUES($1,$2,$3,0,3)
      `, [variantResult.rows[0]!.id, warehouseId, product.stock]);
    }

    return {
      deletedProducts: deletedResult.rowCount ?? 0,
      preservedInventoryMovements: movementResult.rows[0]?.count ?? 0,
      insertedProducts: products.length
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

replaceCatalog()
  .then(closePool)
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exitCode = 1;
  });
