ALTER TABLE users
  ADD COLUMN IF NOT EXISTS login_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS login_block_reason text;

-- Older builds used a temporary five-attempt lock. Remove that legacy timer so
-- every account starts the new, explicit ten-attempt policy consistently.
UPDATE users
SET locked_until = NULL,
    failed_login_count = LEAST(failed_login_count, 9)
WHERE locked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_login_blocked_idx
  ON users(login_blocked_at)
  WHERE login_blocked_at IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN users.login_blocked_at IS
  'Permanent authentication block after ten consecutive invalid passwords; cleared only by an administrator.';
COMMENT ON COLUMN users.login_block_reason IS
  'Machine-readable reason for the permanent authentication block.';
