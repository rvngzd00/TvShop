DO $$
DECLARE
  default_store_id uuid;
  moderator_role_id uuid;
  grant_actor_id uuid;
  seide_user_id uuid;
  dilsad_user_id uuid;
BEGIN
  SELECT id INTO default_store_id
  FROM stores
  WHERE code = 'daily-baku'
  ORDER BY created_at
  LIMIT 1;

  IF default_store_id IS NULL THEN
    SELECT id INTO default_store_id
    FROM stores
    WHERE status = 'active'
    ORDER BY created_at
    LIMIT 1;
  END IF;

  SELECT id INTO moderator_role_id FROM roles WHERE code = 'moderator';

  SELECT u.id INTO grant_actor_id
  FROM users u
  JOIN user_roles ur ON ur.user_id = u.id
  JOIN roles r ON r.id = ur.role_id
  WHERE r.code = 'super_admin'
    AND u.deleted_at IS NULL
  ORDER BY u.created_at
  LIMIT 1;

  IF default_store_id IS NULL OR moderator_role_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO users (email, phone, password_hash, first_name, last_name, status, email_verified_at, phone_verified_at, failed_login_count, locked_until, deleted_at)
  VALUES (
    'seide@gundelikbaki.az',
    NULL,
    'scrypt$32768$8$1$-yj0M6_bvXK5645ts_mQsg$HFc_jqt22bfOyRw0vfjMQ2BzjVC6MThlMkY88RhkjR2B30fog3REOCVcR0taLoxa5jVSDNeWACRTRjayg7AjSA',
    'Səidə',
    'Moderator',
    'active',
    now(),
    NULL,
    0,
    NULL,
    NULL
  )
  ON CONFLICT (email) DO UPDATE SET
    phone = NULL,
    password_hash = EXCLUDED.password_hash,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    status = 'active',
    email_verified_at = coalesce(users.email_verified_at, now()),
    phone_verified_at = NULL,
    failed_login_count = 0,
    locked_until = NULL,
    deleted_at = NULL
  RETURNING id INTO seide_user_id;

  INSERT INTO users (email, phone, password_hash, first_name, last_name, status, email_verified_at, phone_verified_at, failed_login_count, locked_until, deleted_at)
  VALUES (
    'dilsad@gundelikbaki.az',
    NULL,
    'scrypt$32768$8$1$WKO4uMLXmLnDtgJW1Teahg$Pk9QRtCTlwJeZ0VhF5Ala94Bc08umrhor-kNYE-G06curG8nydxh2C9KOavu71FlYAtE1f6wtiqBXWeOrrB9cw',
    'Dilşad',
    'Moderator',
    'active',
    now(),
    NULL,
    0,
    NULL,
    NULL
  )
  ON CONFLICT (email) DO UPDATE SET
    phone = NULL,
    password_hash = EXCLUDED.password_hash,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    status = 'active',
    email_verified_at = coalesce(users.email_verified_at, now()),
    phone_verified_at = NULL,
    failed_login_count = 0,
    locked_until = NULL,
    deleted_at = NULL
  RETURNING id INTO dilsad_user_id;

  DELETE FROM user_roles WHERE user_id IN (seide_user_id, dilsad_user_id);

  INSERT INTO user_roles (user_id, role_id, store_id, granted_by)
  VALUES
    (seide_user_id, moderator_role_id, default_store_id, grant_actor_id),
    (dilsad_user_id, moderator_role_id, default_store_id, grant_actor_id)
  ON CONFLICT DO NOTHING;

  UPDATE users u
  SET email = ('deleted+' || u.id::text || '@deleted.invalid')::citext,
    phone = NULL,
    status = 'disabled',
    failed_login_count = 0,
    locked_until = NULL,
    deleted_at = coalesce(u.deleted_at, now())
  WHERE u.deleted_at IS NULL
    AND lower(u.email::text) NOT IN ('seide@gundelikbaki.az', 'dilsad@gundelikbaki.az')
    AND NOT EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id
        AND r.code = 'super_admin'
    );

  UPDATE refresh_sessions rs
  SET revoked_at = now()
  WHERE rs.revoked_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id = rs.user_id
        AND u.deleted_at IS NOT NULL
    );
END $$;
