CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS product_listings_search_title_trgm_idx
  ON product_listings
  USING gin (
    translate(lower(title), 'əğıöşüçƏĞIÖŞÜÇ', 'egiosucEGIOSUC') gin_trgm_ops
  )
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS product_listings_search_description_trgm_idx
  ON product_listings
  USING gin (
    translate(lower(coalesce(short_description, '')), 'əğıöşüçƏĞIÖŞÜÇ', 'egiosucEGIOSUC') gin_trgm_ops
  )
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS products_search_sku_trgm_idx
  ON products
  USING gin (
    translate(lower(sku), 'əğıöşüçƏĞIÖŞÜÇ', 'egiosucEGIOSUC') gin_trgm_ops
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS brands_search_name_trgm_idx
  ON brands
  USING gin (
    translate(lower(name), 'əğıöşüçƏĞIÖŞÜÇ', 'egiosucEGIOSUC') gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS vendors_search_name_trgm_idx
  ON vendors
  USING gin (
    translate(lower(display_name), 'əğıöşüçƏĞIÖŞÜÇ', 'egiosucEGIOSUC') gin_trgm_ops
  );
