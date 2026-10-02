ALTER TABLE inventory_movements
  ADD COLUMN variant_sku_snapshot text,
  ADD COLUMN product_name_snapshot text;

UPDATE inventory_movements im
SET
  variant_sku_snapshot = pv.sku,
  product_name_snapshot = p.name
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.id = im.variant_id;

ALTER TABLE inventory_movements
  ALTER COLUMN variant_id DROP NOT NULL,
  DROP CONSTRAINT inventory_movements_variant_id_fkey,
  ADD CONSTRAINT inventory_movements_variant_id_fkey
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
