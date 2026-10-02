ALTER TABLE products
  ADD COLUMN video_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  ADD COLUMN video_url text,
  ADD CONSTRAINT products_video_url_http_check
    CHECK (video_url IS NULL OR video_url ~ '^https://');

CREATE INDEX products_video_asset_idx
  ON products(video_asset_id)
  WHERE video_asset_id IS NOT NULL;

CREATE TABLE tv_channel_settings (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  youtube_channel_id text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (youtube_channel_id IS NULL OR youtube_channel_id ~ '^UC[A-Za-z0-9_-]{20,}$')
);

CREATE TABLE tv_media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('youtube', 'tiktok', 'instagram')),
  source_url text NOT NULL,
  provider_id text NOT NULL,
  media_kind text NOT NULL DEFAULT 'video' CHECK (media_kind IN ('video', 'playlist', 'post', 'reel')),
  title text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, provider, provider_id)
);

CREATE INDEX tv_media_store_provider_order_idx
  ON tv_media_items(store_id, provider, is_active, position, created_at);

INSERT INTO permissions(code, description)
VALUES
  ('tv.read', 'TV və sosial media sazlamalarını görmək'),
  ('tv.manage', 'TV və sosial media sazlamalarını idarə etmək')
ON CONFLICT(code) DO UPDATE SET description=excluded.description;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = ANY(
  CASE r.code
    WHEN 'super_admin' THEN ARRAY['tv.read','tv.manage']::text[]
    WHEN 'admin' THEN ARRAY['tv.read','tv.manage']::text[]
    WHEN 'editor' THEN ARRAY['tv.read','tv.manage']::text[]
    ELSE ARRAY[]::text[]
  END
)
WHERE r.code IN ('super_admin','admin','editor')
ON CONFLICT DO NOTHING;

UPDATE stores
SET name = 'TVShop', updated_at = now()
WHERE code = 'daily-baku' AND name = 'Gündəlik Bakı';
