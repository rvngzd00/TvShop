INSERT INTO permissions(code, description)
VALUES
  ('posts.read', 'Blog məqalələrini görmək'),
  ('posts.create', 'Blog məqaləsi yaratmaq'),
  ('posts.update', 'Blog məqaləsini redaktə etmək'),
  ('posts.delete', 'Blog məqaləsini arxivləmək'),
  ('posts.publish', 'Blog məqaləsini dərc etmək'),
  ('journal.read', 'Jurnal buraxılışlarını görmək'),
  ('journal.create', 'Jurnal buraxılışı yaratmaq'),
  ('journal.update', 'Jurnal buraxılışını redaktə etmək'),
  ('journal.delete', 'Jurnal buraxılışını arxivləmək'),
  ('journal.publish', 'Jurnal buraxılışını dərc etmək'),
  ('media.upload', 'Məhsul və redaksiya fayllarını yükləmək')
ON CONFLICT(code) DO UPDATE SET description=excluded.description;

INSERT INTO role_permissions(role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
JOIN permissions AS permission ON permission.code = ANY(
  CASE role.code
    WHEN 'super_admin' THEN ARRAY['posts.read','posts.create','posts.update','posts.delete','posts.publish','journal.read','journal.create','journal.update','journal.delete','journal.publish','media.upload']::text[]
    WHEN 'admin' THEN ARRAY['posts.read','posts.create','posts.update','posts.delete','posts.publish','journal.read','journal.create','journal.update','journal.delete','journal.publish','media.upload']::text[]
    WHEN 'editor' THEN ARRAY['posts.read','posts.create','posts.update','posts.publish','journal.read','journal.create','journal.update','journal.publish','media.upload']::text[]
    WHEN 'seo' THEN ARRAY['posts.read','posts.update']::text[]
    WHEN 'vendor_owner' THEN ARRAY['media.upload']::text[]
    WHEN 'vendor_staff' THEN ARRAY['media.upload']::text[]
    ELSE ARRAY[]::text[]
  END
)
WHERE role.code IN ('super_admin','admin','editor','seo','vendor_owner','vendor_staff')
ON CONFLICT DO NOTHING;

DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE code = 'moderator');

INSERT INTO role_permissions(role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
JOIN permissions AS permission ON permission.code = ANY(ARRAY[
  'catalog.read','catalog.create','catalog.update','catalog.delete','catalog.publish',
  'inventory.read','inventory.manage',
  'posts.read','posts.create','posts.update','posts.delete','posts.publish',
  'journal.read','journal.create','journal.update','journal.delete','journal.publish',
  'media.read','media.upload'
]::text[])
WHERE role.code = 'moderator'
ON CONFLICT DO NOTHING;
