CREATE TYPE user_action_token_type AS ENUM ('password_reset', 'invite');

CREATE TABLE user_action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  token_type user_action_token_type NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_action_tokens_lookup_idx
  ON user_action_tokens(token_type, token_hash, expires_at) WHERE used_at IS NULL;

CREATE TABLE user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  action_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_notifications_inbox_idx
  ON user_notifications(user_id, created_at DESC);
CREATE INDEX user_notifications_unread_idx
  ON user_notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE giveaway_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'winner', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);
CREATE TRIGGER giveaway_entries_updated_at
  BEFORE UPDATE ON giveaway_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE rewards
  ADD COLUMN image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN payment_method text NOT NULL DEFAULT 'cash_on_delivery'
    CHECK (payment_method IN ('cash_on_delivery', 'card_on_delivery', 'bank_transfer', 'online_card')),
  ADD COLUMN coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL,
  ADD COLUMN coupon_code text,
  ADD COLUMN loyalty_points_earned integer NOT NULL DEFAULT 0 CHECK (loyalty_points_earned >= 0);

CREATE INDEX orders_coupon_usage_idx ON orders(coupon_id, user_id) WHERE coupon_id IS NOT NULL;

INSERT INTO rewards(store_id,name,description,points_cost,stock,status,starts_at,expires_at)
SELECT s.id,'Pulsuz çatdırılma','Növbəti uyğun sifariş üçün standart çatdırılma hədiyyəsi.',250,500,'active',now(),now()+interval '1 year'
FROM stores s WHERE s.code='daily-baku'
  AND NOT EXISTS (SELECT 1 FROM rewards r WHERE r.store_id=s.id AND r.name='Pulsuz çatdırılma');

INSERT INTO rewards(store_id,name,description,points_cost,stock,status,starts_at,expires_at)
SELECT s.id,'25 AZN hədiyyə kuponu','Gündəlik Bakı tərəfdaşlarında istifadə edilə bilən hədiyyə kuponu.',750,100,'active',now(),now()+interval '1 year'
FROM stores s WHERE s.code='daily-baku'
  AND NOT EXISTS (SELECT 1 FROM rewards r WHERE r.store_id=s.id AND r.name='25 AZN hədiyyə kuponu');
