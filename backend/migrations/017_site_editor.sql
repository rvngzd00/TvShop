CREATE TABLE IF NOT EXISTS site_editor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('nav', 'index', 'footer')),
  draft_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_version integer NOT NULL DEFAULT 1 CHECK (draft_version > 0),
  published_version integer NOT NULL DEFAULT 0 CHECK (published_version >= 0),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (store_id, scope)
);

CREATE TABLE IF NOT EXISTS site_editor_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES site_editor_documents(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  revision_type text NOT NULL CHECK (revision_type IN ('draft', 'published')),
  content jsonb NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version, revision_type)
);

CREATE INDEX IF NOT EXISTS site_editor_revisions_document_created_idx
  ON site_editor_revisions(document_id, created_at DESC);

INSERT INTO permissions(code, description)
VALUES
  ('editor.read', 'Sayt editorunu görmək'),
  ('editor.manage', 'Sayt editorunda qaralama saxlamaq'),
  ('editor.publish', 'Sayt editorundakı dəyişiklikləri yayımlamaq')
ON CONFLICT (code) DO UPDATE SET description=excluded.description;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = ANY(ARRAY['editor.read','editor.manage','editor.publish'])
WHERE r.code IN ('super_admin','admin','editor')
ON CONFLICT DO NOTHING;

