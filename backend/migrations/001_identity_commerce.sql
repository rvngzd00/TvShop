CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE record_status AS ENUM ('draft', 'active', 'inactive', 'archived');
CREATE TYPE user_status AS ENUM ('invited', 'active', 'suspended', 'disabled');
CREATE TYPE vendor_status AS ENUM ('pending', 'active', 'suspended', 'rejected');
CREATE TYPE product_status AS ENUM ('draft', 'review', 'published', 'rejected', 'archived');
CREATE TYPE order_status AS ENUM (
  'pending', 'confirmed', 'processing', 'ready', 'shipped', 'delivered',
  'cancelled', 'returned', 'refunded'
);
CREATE TYPE payment_status AS ENUM ('pending', 'authorized', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded');
CREATE TYPE inventory_movement_type AS ENUM ('purchase', 'sale', 'return', 'adjustment', 'reservation', 'release');

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]+$'),
  name text NOT NULL,
  primary_domain citext NOT NULL UNIQUE,
  locale text NOT NULL DEFAULT 'az-AZ',
  currency char(3) NOT NULL DEFAULT 'AZN',
  timezone text NOT NULL DEFAULT 'Asia/Baku',
  status record_status NOT NULL DEFAULT 'active',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  phone text UNIQUE,
  password_hash text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  status user_status NOT NULL DEFAULT 'active',
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  last_login_at timestamptz,
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  legal_name text NOT NULL,
  slug text NOT NULL,
  tax_id text,
  email citext NOT NULL,
  phone text,
  logo_url text,
  description text NOT NULL DEFAULT '',
  commission_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_rate BETWEEN 0 AND 100),
  status vendor_status NOT NULL DEFAULT 'pending',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (store_id, slug)
);

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vendor_id IS NULL OR store_id IS NOT NULL),
  UNIQUE NULLS NOT DISTINCT (user_id, role_id, store_id, vendor_id)
);

CREATE TABLE refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  family_id uuid NOT NULL,
  user_agent text,
  ip_hash char(64),
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  ip_hash char(64),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  storage_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  width integer,
  height integer,
  alt_text text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0))
);

CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  logo_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  website_url text,
  status record_status NOT NULL DEFAULT 'active',
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  status record_status NOT NULL DEFAULT 'active',
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug),
  CHECK (parent_id <> id)
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  sku text NOT NULL,
  barcode text,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  product_type text NOT NULL DEFAULT 'physical' CHECK (product_type IN ('physical', 'digital', 'service')),
  status product_status NOT NULL DEFAULT 'draft',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  weight_grams integer CHECK (weight_grams IS NULL OR weight_grams >= 0),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (vendor_id, sku)
);

CREATE TABLE product_categories (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (product_id, category_id)
);
CREATE UNIQUE INDEX product_one_primary_category ON product_categories(product_id) WHERE is_primary;

CREATE TABLE product_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'az-AZ',
  title text NOT NULL,
  slug text NOT NULL,
  short_description text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  price numeric(14,2) NOT NULL CHECK (price >= 0),
  compare_at_price numeric(14,2) CHECK (compare_at_price IS NULL OR compare_at_price >= price),
  currency char(3) NOT NULL DEFAULT 'AZN',
  status product_status NOT NULL DEFAULT 'draft',
  seo_title text,
  seo_description text,
  canonical_url text,
  schema_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, locale, slug),
  UNIQUE (store_id, product_id, locale)
);

CREATE TABLE product_media (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (product_id, media_asset_id)
);
CREATE UNIQUE INDEX product_one_primary_media ON product_media(product_id) WHERE is_primary;

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NOT NULL,
  barcode text,
  title text NOT NULL,
  option_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_override numeric(14,2) CHECK (price_override IS NULL OR price_override >= 0),
  status record_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, sku)
);

CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  status record_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);

CREATE TABLE inventory (
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= quantity),
  reorder_level integer NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variant_id, warehouse_id)
);

CREATE TABLE inventory_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  movement_type inventory_movement_type NOT NULL,
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  reference_type text,
  reference_id text,
  note text NOT NULL DEFAULT '',
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Əsas ünvan',
  recipient_name text NOT NULL,
  phone text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'AZ',
  city text NOT NULL,
  district text,
  address_line_1 text NOT NULL,
  address_line_2 text,
  postal_code text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_one_default_address ON user_addresses(user_id) WHERE is_default;

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id uuid,
  currency char(3) NOT NULL DEFAULT 'AZN',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) <> (anonymous_id IS NOT NULL))
);

CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES product_listings(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

CREATE SEQUENCE order_number_sequence START 100001;

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  order_number bigint NOT NULL UNIQUE DEFAULT nextval('order_number_sequence'),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  customer_email citext NOT NULL,
  customer_phone text NOT NULL,
  customer_name text NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  currency char(3) NOT NULL DEFAULT 'AZN',
  subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  discount_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  shipping_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  tax_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total numeric(14,2) NOT NULL CHECK (grand_total >= 0),
  shipping_address jsonb NOT NULL,
  billing_address jsonb NOT NULL,
  customer_note text NOT NULL DEFAULT '',
  internal_note text NOT NULL DEFAULT '',
  idempotency_key text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  UNIQUE NULLS NOT DISTINCT (store_id, idempotency_key)
);

CREATE TABLE vendor_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'pending',
  subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  discount_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  commission_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (commission_total >= 0),
  payout_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (payout_total >= 0),
  accepted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, vendor_id)
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  vendor_order_id uuid NOT NULL REFERENCES vendor_orders(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  discount_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  line_total numeric(14,2) NOT NULL CHECK (line_total >= 0),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE order_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vendor_order_id uuid REFERENCES vendor_orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status order_status NOT NULL,
  note text NOT NULL DEFAULT '',
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_reference text,
  status payment_status NOT NULL DEFAULT 'pending',
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL,
  method text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (provider, provider_reference)
);

CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_order_id uuid NOT NULL REFERENCES vendor_orders(id) ON DELETE RESTRICT,
  provider text,
  tracking_number text,
  status text NOT NULL DEFAULT 'pending',
  shipped_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_roles_user_scope_idx ON user_roles(user_id, store_id, vendor_id);
CREATE INDEX vendors_store_status_idx ON vendors(store_id, status) WHERE deleted_at IS NULL;
CREATE INDEX products_vendor_status_idx ON products(vendor_id, status) WHERE deleted_at IS NULL;
CREATE INDEX listings_store_status_idx ON product_listings(store_id, status, published_at DESC);
CREATE INDEX categories_parent_idx ON categories(store_id, parent_id, position);
CREATE INDEX inventory_low_stock_idx ON inventory(warehouse_id, quantity) WHERE quantity <= reorder_level;
CREATE INDEX orders_store_created_idx ON orders(store_id, placed_at DESC);
CREATE INDEX orders_user_created_idx ON orders(user_id, placed_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX vendor_orders_vendor_created_idx ON vendor_orders(vendor_id, updated_at DESC);
CREATE INDEX audit_logs_actor_created_idx ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX outbox_pending_idx ON outbox_events(available_at) WHERE processed_at IS NULL;

CREATE TRIGGER stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER brands_updated_at BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER listings_updated_at BEFORE UPDATE ON product_listings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER addresses_updated_at BEFORE UPDATE ON user_addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER carts_updated_at BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER vendor_orders_updated_at BEFORE UPDATE ON vendor_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER shipments_updated_at BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
