ALTER TABLE product_listings
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_popular boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_top_pick boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchandising_badge text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_listings_merchandising_badge_check'
  ) THEN
    ALTER TABLE product_listings
      ADD CONSTRAINT product_listings_merchandising_badge_check
      CHECK (merchandising_badge IN ('none', 'sale', 'hot', 'new', 'recommended'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_listings_home_merchandising_idx
  ON product_listings(store_id, status, is_featured, is_popular, is_top_pick, display_position);

-- Preserve the current home-page composition after the feature becomes CMS-driven.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY store_id ORDER BY published_at DESC NULLS LAST, created_at DESC) - 1 AS position
  FROM product_listings
  WHERE status = 'published'
)
UPDATE product_listings pl
SET is_featured = true,
    is_popular = true,
    is_top_pick = true,
    display_position = ranked.position,
    merchandising_badge = CASE
      WHEN ranked.position IN (3, 13) THEN 'hot'
      WHEN ranked.position IN (7, 17) THEN 'new'
      WHEN ranked.position IN (0, 6, 10, 15) THEN 'recommended'
      WHEN ranked.position IN (1, 8) THEN 'sale'
      ELSE 'none'
    END
FROM ranked
WHERE pl.id = ranked.id
  AND NOT (pl.is_featured OR pl.is_popular OR pl.is_top_pick);
