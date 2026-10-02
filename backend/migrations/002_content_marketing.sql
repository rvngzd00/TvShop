CREATE TYPE publication_status AS ENUM ('draft', 'review', 'scheduled', 'published', 'archived');
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'active', 'paused', 'ended', 'cancelled');
CREATE TYPE coupon_discount_type AS ENUM ('percentage', 'fixed_amount', 'free_shipping', 'gift');
CREATE TYPE user_coupon_status AS ENUM ('available', 'reserved', 'redeemed', 'expired', 'cancelled');
CREATE TYPE qr_type AS ENUM ('product', 'coupon', 'reward', 'lead', 'social', 'event', 'survey', 'store', 'smart');
CREATE TYPE listing_status AS ENUM ('draft', 'review', 'published', 'rejected', 'expired', 'archived');

CREATE TABLE pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'az-AZ',
  title text NOT NULL,
  slug text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  template text NOT NULL DEFAULT 'default',
  status publication_status NOT NULL DEFAULT 'draft',
  seo_title text,
  seo_description text,
  canonical_url text,
  robots_directive text NOT NULL DEFAULT 'index,follow',
  schema_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (store_id, locale, slug)
);

CREATE TABLE post_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id uuid REFERENCES post_categories(id) ON DELETE SET NULL,
  locale text NOT NULL DEFAULT 'az-AZ',
  post_type text NOT NULL DEFAULT 'article' CHECK (post_type IN ('article', 'brand_story', 'guide', 'news', 'sponsored')),
  title text NOT NULL,
  slug text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  featured_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  status publication_status NOT NULL DEFAULT 'draft',
  is_sponsored boolean NOT NULL DEFAULT false,
  sponsor_vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  seo_title text,
  seo_description text,
  canonical_url text,
  robots_directive text NOT NULL DEFAULT 'index,follow',
  schema_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (store_id, locale, slug)
);

CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  UNIQUE (store_id, slug)
);

CREATE TABLE post_tags (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE navigation_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  locale text NOT NULL DEFAULT 'az-AZ',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, code, locale)
);

CREATE TABLE navigation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id uuid NOT NULL REFERENCES navigation_menus(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES navigation_items(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  target text NOT NULL DEFAULT '_self' CHECK (target IN ('_self', '_blank')),
  is_visible boolean NOT NULL DEFAULT true,
  required_permission text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (parent_id <> id)
);

CREATE TABLE seo_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  primary_keyword text NOT NULL,
  search_intent text NOT NULL CHECK (search_intent IN ('informational', 'commercial', 'transactional', 'navigational', 'local')),
  pillar_page_id uuid REFERENCES pages(id) ON DELETE SET NULL,
  pillar_post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  target_audience text NOT NULL DEFAULT '',
  status record_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((pillar_page_id IS NULL) OR (pillar_post_id IS NULL)),
  UNIQUE (store_id, primary_keyword)
);

CREATE TABLE seo_cluster_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES seo_clusters(id) ON DELETE CASCADE,
  page_id uuid REFERENCES pages(id) ON DELETE CASCADE,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  target_keyword text NOT NULL,
  supporting_keywords text[] NOT NULL DEFAULT '{}',
  planned_internal_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  CHECK ((page_id IS NOT NULL)::integer + (post_id IS NOT NULL)::integer = 1),
  UNIQUE NULLS NOT DISTINCT (cluster_id, page_id, post_id)
);

CREATE TABLE redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source_path text NOT NULL,
  target_url text NOT NULL,
  status_code smallint NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302, 307, 308, 410)),
  hit_count bigint NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, source_path)
);

CREATE TABLE journal_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  issue_number text NOT NULL,
  title text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  pdf_asset_id uuid REFERENCES media_assets(id) ON DELETE RESTRICT,
  status publication_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, issue_number),
  UNIQUE (store_id, slug)
);

CREATE TABLE classified_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('product', 'service', 'property', 'vehicle', 'other')),
  title text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL,
  price numeric(14,2) CHECK (price IS NULL OR price >= 0),
  currency char(3) NOT NULL DEFAULT 'AZN',
  contact_data jsonb NOT NULL,
  location_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status listing_status NOT NULL DEFAULT 'review',
  expires_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (store_id, slug)
);

CREATE TABLE classified_media (
  listing_id uuid NOT NULL REFERENCES classified_listings(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, media_asset_id)
);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  campaign_type text NOT NULL CHECK (campaign_type IN ('daily_deal', 'weekly', 'limited', 'seasonal', 'giveaway', 'sponsored', 'qr', 'other')),
  status campaign_status NOT NULL DEFAULT 'draft',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  budget numeric(14,2) CHECK (budget IS NULL OR budget >= 0),
  goals jsonb NOT NULL DEFAULT '{}'::jsonb,
  targeting jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (store_id, slug)
);

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  name text NOT NULL,
  code_prefix text NOT NULL DEFAULT 'DB',
  discount_type coupon_discount_type NOT NULL,
  discount_value numeric(14,2) NOT NULL CHECK (discount_value >= 0),
  minimum_order numeric(14,2) NOT NULL DEFAULT 0 CHECK (minimum_order >= 0),
  quantity_limit integer CHECK (quantity_limit IS NULL OR quantity_limit > 0),
  per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status record_status NOT NULL DEFAULT 'active',
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at),
  CHECK (discount_type <> 'percentage' OR discount_value <= 100)
);

CREATE TABLE user_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  unique_code text NOT NULL UNIQUE,
  status user_coupon_status NOT NULL DEFAULT 'available',
  acquired_via text NOT NULL DEFAULT 'campaign',
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE loyalty_accounts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned integer NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  tier text NOT NULL DEFAULT 'standart',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);

CREATE TABLE loyalty_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  points integer NOT NULL CHECK (points <> 0),
  reason text NOT NULL,
  reference_type text,
  reference_id text,
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  idempotency_key text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id, idempotency_key)
);

CREATE TABLE rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  points_cost integer NOT NULL CHECK (points_cost > 0),
  stock integer CHECK (stock IS NULL OR stock >= 0),
  status record_status NOT NULL DEFAULT 'active',
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);

CREATE TABLE reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  points_spent integer NOT NULL CHECK (points_spent > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'fulfilled', 'cancelled')),
  fulfillment_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  qr_type qr_type NOT NULL,
  target_url text NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL,
  reward_points integer CHECK (reward_points IS NULL OR reward_points > 0),
  scan_limit integer CHECK (scan_limit IS NULL OR scan_limit > 0),
  per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  scan_count bigint NOT NULL DEFAULT 0 CHECK (scan_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  status record_status NOT NULL DEFAULT 'active',
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at),
  CHECK (qr_type <> 'coupon' OR coupon_id IS NOT NULL),
  CHECK (qr_type <> 'reward' OR reward_points IS NOT NULL),
  CHECK (qr_type <> 'product' OR product_id IS NOT NULL)
);

CREATE TABLE qr_scans (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  qr_code_id uuid NOT NULL REFERENCES qr_codes(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id uuid,
  session_id text,
  ip_hash char(64),
  country_code char(2),
  city text,
  device_type text,
  browser text,
  os text,
  referrer text,
  user_agent text,
  converted boolean NOT NULL DEFAULT false,
  conversion_type text,
  conversion_value numeric(14,2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL)
);

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  qr_code_id uuid REFERENCES qr_codes(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  email citext,
  consent boolean NOT NULL DEFAULT false,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  venue_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status record_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (store_id, slug)
);

CREATE TABLE event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  attendee_name text NOT NULL,
  email citext,
  phone text,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'checked_in', 'cancelled', 'no_show')),
  checked_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  reward_points integer NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
  status record_status NOT NULL DEFAULT 'active',
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

CREATE TABLE survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('text', 'single_choice', 'multiple_choice', 'rating', 'boolean')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id uuid,
  answers jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL),
  UNIQUE NULLS NOT DISTINCT (survey_id, user_id, anonymous_id)
);

CREATE INDEX pages_publish_idx ON pages(store_id, status, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_publish_idx ON posts(store_id, status, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_category_idx ON posts(category_id, published_at DESC) WHERE status = 'published';
CREATE INDEX navigation_items_tree_idx ON navigation_items(menu_id, parent_id, position);
CREATE INDEX seo_cluster_members_cluster_idx ON seo_cluster_members(cluster_id, position);
CREATE INDEX classifieds_status_idx ON classified_listings(store_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX campaigns_active_idx ON campaigns(store_id, starts_at, ends_at) WHERE status IN ('scheduled', 'active');
CREATE INDEX coupons_active_idx ON coupons(store_id, starts_at, expires_at) WHERE status = 'active';
CREATE INDEX user_coupons_wallet_idx ON user_coupons(user_id, status, expires_at);
CREATE INDEX loyalty_ledger_user_idx ON loyalty_ledger(user_id, store_id, created_at DESC);
CREATE INDEX qr_codes_store_status_idx ON qr_codes(store_id, status, created_at DESC);
CREATE INDEX qr_scans_qr_time_idx ON qr_scans(qr_code_id, scanned_at DESC);
CREATE INDEX qr_scans_user_time_idx ON qr_scans(user_id, scanned_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX leads_vendor_status_idx ON leads(vendor_id, status, created_at DESC);

CREATE TRIGGER pages_updated_at BEFORE UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER post_categories_updated_at BEFORE UPDATE ON post_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER navigation_menus_updated_at BEFORE UPDATE ON navigation_menus FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER seo_clusters_updated_at BEFORE UPDATE ON seo_clusters FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER redirects_updated_at BEFORE UPDATE ON redirects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER journal_issues_updated_at BEFORE UPDATE ON journal_issues FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER classifieds_updated_at BEFORE UPDATE ON classified_listings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER coupons_updated_at BEFORE UPDATE ON coupons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER loyalty_accounts_updated_at BEFORE UPDATE ON loyalty_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER rewards_updated_at BEFORE UPDATE ON rewards FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER reward_redemptions_updated_at BEFORE UPDATE ON reward_redemptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER qr_codes_updated_at BEFORE UPDATE ON qr_codes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER surveys_updated_at BEFORE UPDATE ON surveys FOR EACH ROW EXECUTE FUNCTION set_updated_at();
