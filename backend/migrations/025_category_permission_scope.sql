-- Category hierarchy is a catalogue-administration responsibility. Keep it out
-- of moderator/vendor/customer roles, including databases where migration 024
-- was applied before the role scope was tightened.
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND p.code = 'categories.manage'
  AND r.code NOT IN ('super_admin', 'admin');
