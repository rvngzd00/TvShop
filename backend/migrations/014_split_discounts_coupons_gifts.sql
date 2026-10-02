-- Separate discount and coupon discovery, and expose promo products as gifts.
UPDATE navigation_items ni
SET label = 'Endirimlər'
FROM navigation_menus nm
WHERE nm.id = ni.menu_id
  AND nm.code = 'main'
  AND ni.parent_id IS NULL
  AND ni.url = '/endirimler/';

UPDATE navigation_items ni
SET position = ni.position + 1
FROM navigation_menus nm
WHERE nm.id = ni.menu_id
  AND nm.code = 'main'
  AND ni.parent_id IS NULL
  AND ni.url <> '/endirimler/'
  AND ni.position >= 2
  AND NOT EXISTS (
    SELECT 1 FROM navigation_items existing
    WHERE existing.menu_id = ni.menu_id
      AND existing.parent_id IS NULL
      AND existing.url = '/kuponlar/'
  );

INSERT INTO navigation_items (menu_id, label, url, position, target, is_visible)
SELECT nm.id, 'Kuponlar', '/kuponlar/', 2, '_self', true
FROM navigation_menus nm
WHERE nm.code = 'main'
  AND NOT EXISTS (
    SELECT 1 FROM navigation_items ni
    WHERE ni.menu_id = nm.id
      AND ni.parent_id IS NULL
      AND ni.url = '/kuponlar/'
  );

UPDATE navigation_items ni
SET label = 'Kuponlar', position = 2, is_visible = true
FROM navigation_menus nm
WHERE nm.id = ni.menu_id
  AND nm.code = 'main'
  AND ni.parent_id IS NULL
  AND ni.url = '/kuponlar/';

INSERT INTO media_assets (
  store_id, storage_key, public_url, mime_type, byte_size,
  width, height, alt_text, title, metadata
)
SELECT
  s.id,
  'system/categories/' || s.id::text || '/hediyyeler.jpg',
  '/assets/images/categories/baki-club/hediyyeler.jpg',
  'image/jpeg',
  1024,
  640,
  640,
  'Hədiyyələr kateqoriyası',
  'Hədiyyələr',
  '{"source":"bundled-category-media"}'::jsonb
FROM stores s
ON CONFLICT (storage_key) DO UPDATE SET
  public_url = excluded.public_url,
  alt_text = excluded.alt_text,
  title = excluded.title;

INSERT INTO categories (
  store_id, name, slug, description, image_asset_id, position,
  status, seo_title, seo_description
)
SELECT
  s.id,
  'Hədiyyələr',
  'hediyyeler',
  'Hədiyyə üçün seçilmiş promo məhsullar və xüsusi təkliflər',
  ma.id,
  coalesce((SELECT max(c.position) + 1 FROM categories c WHERE c.store_id = s.id), 0),
  'active',
  'Hədiyyələr | Gündəlik Bakı',
  'Gündəlik Bakıda hədiyyə üçün seçilmiş promo məhsulları və xüsusi təklifləri kəşf edin.'
FROM stores s
JOIN media_assets ma
  ON ma.storage_key = 'system/categories/' || s.id::text || '/hediyyeler.jpg'
ON CONFLICT (store_id, slug) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  image_asset_id = excluded.image_asset_id,
  status = 'active',
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description;

INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT DISTINCT pl.product_id, c.id, false
FROM product_listings pl
JOIN categories c ON c.store_id = pl.store_id AND c.slug = 'hediyyeler'
WHERE pl.status = 'published'
  AND pl.merchandising_badge <> 'none'
ON CONFLICT (product_id, category_id) DO NOTHING;
