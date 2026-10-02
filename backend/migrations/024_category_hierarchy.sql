INSERT INTO permissions(code, description)
VALUES ('categories.manage', 'Departament, əsas və alt kateqoriya ağacını idarə etmək')
ON CONFLICT (code) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('super_admin','admin','moderator') AND p.code='categories.manage'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION validate_category_hierarchy() RETURNS trigger AS $$
DECLARE
  parent_store uuid;
  parent_depth integer;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id=NEW.id THEN RAISE EXCEPTION 'category cannot parent itself' USING ERRCODE='23514'; END IF;

  WITH RECURSIVE ancestry AS (
    SELECT c.id,c.parent_id,c.store_id,0 AS depth FROM categories c WHERE c.id=NEW.parent_id
    UNION ALL
    SELECT c.id,c.parent_id,c.store_id,ancestry.depth+1
    FROM categories c JOIN ancestry ON ancestry.parent_id=c.id
    WHERE ancestry.depth<3
  )
  SELECT store_id,max(depth) INTO parent_store,parent_depth FROM ancestry GROUP BY store_id;

  IF parent_store IS NULL OR parent_store<>NEW.store_id THEN
    RAISE EXCEPTION 'parent category must belong to the same store' USING ERRCODE='23514';
  END IF;
  IF parent_depth>=2 THEN
    RAISE EXCEPTION 'category hierarchy cannot exceed three levels' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    WITH RECURSIVE descendants AS (
      SELECT id FROM categories WHERE parent_id=NEW.id
      UNION ALL SELECT c.id FROM categories c JOIN descendants d ON c.parent_id=d.id
    ) SELECT 1 FROM descendants WHERE id=NEW.parent_id
  ) THEN RAISE EXCEPTION 'category hierarchy cycle detected' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS categories_hierarchy_guard ON categories;
CREATE TRIGGER categories_hierarchy_guard
BEFORE INSERT OR UPDATE OF parent_id,store_id ON categories
FOR EACH ROW EXECUTE FUNCTION validate_category_hierarchy();
