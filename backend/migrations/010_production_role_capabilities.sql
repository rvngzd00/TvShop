INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r
JOIN permissions p ON p.code = ANY(
  CASE r.code
    WHEN 'vendor_owner' THEN ARRAY['media.read','media.manage','loyalty.read','loyalty.manage']::text[]
    WHEN 'vendor_staff' THEN ARRAY['media.read','media.manage','loyalty.read']::text[]
    ELSE ARRAY[]::text[]
  END
)
WHERE r.code IN ('vendor_owner','vendor_staff')
ON CONFLICT DO NOTHING;
