CREATE TABLE customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id uuid,
  display_name text NOT NULL DEFAULT '',
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email citext,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) <> (anonymous_id IS NOT NULL))
);
CREATE UNIQUE INDEX customer_profiles_user_unique
  ON customer_profiles(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX customer_profiles_anonymous_unique
  ON customer_profiles(anonymous_id) WHERE anonymous_id IS NOT NULL;

CREATE TABLE wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) <> (anonymous_id IS NOT NULL))
);
CREATE UNIQUE INDEX wishlists_store_user_unique
  ON wishlists(store_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX wishlists_store_anonymous_unique
  ON wishlists(store_id, anonymous_id) WHERE anonymous_id IS NOT NULL;

CREATE TABLE wishlist_items (
  wishlist_id uuid NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES product_listings(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wishlist_id, listing_id)
);

CREATE TABLE guest_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id uuid NOT NULL,
  address_type text NOT NULL CHECK (address_type IN ('billing', 'shipping')),
  label text NOT NULL DEFAULT 'Əsas ünvan',
  recipient_name text NOT NULL,
  phone text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'AZ',
  city text NOT NULL,
  district text,
  address_line_1 text NOT NULL,
  address_line_2 text,
  postal_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anonymous_id, address_type)
);

ALTER TABLE user_addresses
  ADD COLUMN address_type text NOT NULL DEFAULT 'shipping'
  CHECK (address_type IN ('billing', 'shipping'));

ALTER TABLE orders ADD COLUMN anonymous_id uuid;
CREATE INDEX orders_anonymous_created_idx
  ON orders(anonymous_id, placed_at DESC) WHERE anonymous_id IS NOT NULL;

CREATE UNIQUE INDEX carts_store_user_unique
  ON carts(store_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX carts_store_anonymous_unique
  ON carts(store_id, anonymous_id) WHERE anonymous_id IS NOT NULL;

CREATE TRIGGER customer_profiles_updated_at
  BEFORE UPDATE ON customer_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER wishlists_updated_at
  BEFORE UPDATE ON wishlists FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER guest_addresses_updated_at
  BEFORE UPDATE ON guest_addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
