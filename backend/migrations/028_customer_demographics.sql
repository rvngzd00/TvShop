ALTER TABLE users
  ADD COLUMN age smallint,
  ADD COLUMN gender text,
  ADD COLUMN marital_status text;

ALTER TABLE users
  ADD CONSTRAINT users_age_range_check
    CHECK (age IS NULL OR age BETWEEN 1 AND 120),
  ADD CONSTRAINT users_gender_check
    CHECK (gender IS NULL OR gender IN ('male', 'female', 'prefer_not_to_say')),
  ADD CONSTRAINT users_marital_status_check
    CHECK (marital_status IS NULL OR marital_status IN ('married', 'single', 'prefer_not_to_say'));

CREATE INDEX users_age_idx
  ON users(age)
  WHERE deleted_at IS NULL AND age IS NOT NULL;

CREATE INDEX users_gender_idx
  ON users(gender)
  WHERE deleted_at IS NULL AND gender IS NOT NULL;

CREATE INDEX users_marital_status_idx
  ON users(marital_status)
  WHERE deleted_at IS NULL AND marital_status IS NOT NULL;

COMMENT ON COLUMN users.age IS 'Müştərinin qeydiyyat zamanı könüllü olaraq təqdim etdiyi yaş';
COMMENT ON COLUMN users.gender IS 'male, female və ya prefer_not_to_say';
COMMENT ON COLUMN users.marital_status IS 'married, single və ya prefer_not_to_say';
