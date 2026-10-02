CREATE TABLE product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id uuid,
  author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 2 AND 80),
  author_email citext,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('pending', 'published', 'rejected')),
  verified_purchase boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) <> (anonymous_id IS NOT NULL))
);

CREATE UNIQUE INDEX product_reviews_store_product_user_unique
  ON product_reviews(store_id, product_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX product_reviews_store_product_anonymous_unique
  ON product_reviews(store_id, product_id, anonymous_id)
  WHERE anonymous_id IS NOT NULL;

CREATE INDEX product_reviews_product_published_idx
  ON product_reviews(product_id, created_at DESC)
  WHERE status = 'published';

CREATE INDEX product_reviews_store_status_idx
  ON product_reviews(store_id, status, created_at DESC);

CREATE TRIGGER product_reviews_updated_at
  BEFORE UPDATE ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
