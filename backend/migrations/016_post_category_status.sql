-- The content administration UI already supports activating, deactivating and
-- archiving post categories. Persist that state instead of failing on update.
ALTER TABLE post_categories
  ADD COLUMN IF NOT EXISTS status record_status NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS post_categories_store_status_idx
  ON post_categories(store_id, status, name);
