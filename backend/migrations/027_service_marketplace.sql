-- Xidmət elanları üçün mağaza kateqoriyalarından asılı olmayan, üçsəviyyəli
-- taksonomiya. Admin/redaktor kateqoriyanı idarə edir; satıcılar həmin ağacdan
-- seçim edib öz xidmət elanlarını yaradır və yeniləyir.

CREATE TABLE service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES service_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  status record_status NOT NULL DEFAULT 'active',
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, slug)
);

CREATE INDEX service_categories_parent_idx
  ON service_categories(store_id, parent_id, position, name)
  WHERE status = 'active';

CREATE TRIGGER service_categories_updated_at
  BEFORE UPDATE ON service_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE classified_listings
  ADD COLUMN service_category_id uuid REFERENCES service_categories(id) ON DELETE RESTRICT;

CREATE INDEX classified_service_category_idx
  ON classified_listings(store_id, service_category_id, status, created_at DESC)
  WHERE category = 'service' AND deleted_at IS NULL;

INSERT INTO permissions(code, description) VALUES
  ('classifieds.create', 'Elan yaratmaq'),
  ('classifieds.update', 'Elanı yeniləmək'),
  ('classifieds.delete', 'Elanı arxivləmək'),
  ('service_categories.manage', 'Xidmət kateqoriyalarını idarə etmək')
ON CONFLICT(code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = ANY(
  CASE r.code
    WHEN 'super_admin' THEN ARRAY['classifieds.create','classifieds.update','classifieds.delete','service_categories.manage']::text[]
    WHEN 'admin' THEN ARRAY['classifieds.create','classifieds.update','classifieds.delete','service_categories.manage']::text[]
    WHEN 'editor' THEN ARRAY['classifieds.read','classifieds.create','classifieds.update','classifieds.delete','service_categories.manage']::text[]
    WHEN 'vendor_owner' THEN ARRAY['classifieds.read','classifieds.create','classifieds.update','classifieds.delete']::text[]
    WHEN 'vendor_staff' THEN ARRAY['classifieds.read','classifieds.create','classifieds.update','classifieds.delete']::text[]
    ELSE ARRAY[]::text[]
  END
)
WHERE r.code IN ('super_admin','admin','editor','vendor_owner','vendor_staff')
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE service_taxonomy (
  department_name text NOT NULL,
  department_slug text NOT NULL,
  department_position integer NOT NULL,
  main_name text NOT NULL,
  main_slug text NOT NULL,
  main_position integer NOT NULL,
  sub_name text NOT NULL,
  sub_slug text NOT NULL,
  sub_position integer NOT NULL,
  description text NOT NULL
) ON COMMIT DROP;

INSERT INTO service_taxonomy VALUES
('Ev və məişət','ev-mesiet',0,'Təmir və usta','temir-ve-usta',0,'Elektrik ustası','elektrik-ustasi',0,'Ev və obyektlər üçün elektrik quraşdırma və təmir xidmətləri'),
('Ev və məişət','ev-mesiet',0,'Təmir və usta','temir-ve-usta',0,'Santexnika','santexnika',1,'Santexnika quraşdırılması, təmiri və qəza xidməti'),
('Ev və məişət','ev-mesiet',0,'Təmizlik və qulluq','temizlik-ve-qulluq',1,'Ev təmizliyi','ev-temizliyi',0,'Mənzil və evlər üçün gündəlik və əsaslı təmizlik'),
('Ev və məişət','ev-mesiet',0,'Təmizlik və qulluq','temizlik-ve-qulluq',1,'Mebel və xalça təmizliyi','mebel-xalca-temizliyi',1,'Mebel, xalça və yumşaq səthlərin peşəkar təmizliyi'),
('Texniki xidmətlər','texniki-xidmetler',1,'Kompüter və mobil','komputer-ve-mobil',0,'Kompüter təmiri','komputer-temiri',0,'Kompüter, noutbuk və periferik avadanlıq təmiri'),
('Texniki xidmətlər','texniki-xidmetler',1,'Kompüter və mobil','komputer-ve-mobil',0,'Telefon təmiri','telefon-temiri',1,'Smartfon diaqnostikası və təmir xidmətləri'),
('Texniki xidmətlər','texniki-xidmetler',1,'Məişət texnikası','meiset-texnikasi',1,'Kondisioner xidməti','kondisioner-xidmeti',0,'Kondisioner quraşdırılması, təmizliyi və təmiri'),
('Texniki xidmətlər','texniki-xidmetler',1,'Məişət texnikası','meiset-texnikasi',1,'Məişət cihazı təmiri','meiset-cihazi-temiri',1,'Paltaryuyan, soyuducu və digər məişət cihazlarının təmiri'),
('Nəqliyyat və logistika','neqliyyat-logistika',2,'Daşınma','dasinma',0,'Yükdaşıma','yukdasima',0,'Şəhərdaxili və regionlararası yükdaşıma xidməti'),
('Nəqliyyat və logistika','neqliyyat-logistika',2,'Daşınma','dasinma',0,'Ev və ofis köçürülməsi','ev-ofis-kocurulmesi',1,'Mebel qablaşdırılması ilə ev və ofis köçürülməsi'),
('Nəqliyyat və logistika','neqliyyat-logistika',2,'Çatdırılma','catdirilma',1,'Kuryer xidməti','kuryer-xidmeti',0,'Bakı daxilində sürətli sənəd və bağlama çatdırılması'),
('Nəqliyyat və logistika','neqliyyat-logistika',2,'Çatdırılma','catdirilma',1,'Avtomobil xidməti','avtomobil-xidmeti',1,'Sürücü, evakuator və avtomobil dəstəyi xidmətləri'),
('Biznes və yaradıcılıq','biznes-yaradiciliq',3,'Rəqəmsal xidmətlər','reqemsal-xidmetler',0,'Dizayn və reklam','dizayn-reklam',0,'Qrafik dizayn, sosial media və rəqəmsal reklam xidmətləri'),
('Biznes və yaradıcılıq','biznes-yaradiciliq',3,'Rəqəmsal xidmətlər','reqemsal-xidmetler',0,'Veb və proqramlaşdırma','veb-proqramlasdirma',1,'Veb sayt, tətbiq və biznes avtomatlaşdırma xidmətləri'),
('Biznes və yaradıcılıq','biznes-yaradiciliq',3,'Foto və tədbir','foto-tedbir',1,'Foto və video','foto-video',0,'Məhsul, tədbir və reklam çəkilişi xidmətləri'),
('Biznes və yaradıcılıq','biznes-yaradiciliq',3,'Foto və tədbir','foto-tedbir',1,'Tədbir təşkili','tedbir-teskili',1,'Korporativ və fərdi tədbirlərin təşkili');

INSERT INTO service_categories(store_id, name, slug, description, position, status, seo_title, seo_description)
SELECT DISTINCT s.id, t.department_name, t.department_slug,
  t.department_name || ' üzrə peşəkar xidmətlər', t.department_position, 'active'::record_status,
  t.department_name || ' xidmətləri | Gündəlik Bakı',
  t.department_name || ' üzrə etibarlı xidmət elanlarını müqayisə edin.'
FROM stores s CROSS JOIN service_taxonomy t
ON CONFLICT(store_id,slug) DO UPDATE SET
  name=EXCLUDED.name,position=EXCLUDED.position,status='active',
  seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description;

INSERT INTO service_categories(store_id, parent_id, name, slug, description, position, status, seo_title, seo_description)
SELECT DISTINCT department.store_id, department.id, t.main_name, t.main_slug,
  t.main_name || ' xidmətləri', t.main_position, 'active'::record_status,
  t.main_name || ' | Gündəlik Bakı', t.main_name || ' üzrə xidmət elanları.'
FROM service_taxonomy t
JOIN service_categories department ON department.slug=t.department_slug AND department.parent_id IS NULL
ON CONFLICT(store_id,slug) DO UPDATE SET
  parent_id=EXCLUDED.parent_id,name=EXCLUDED.name,position=EXCLUDED.position,status='active',
  seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description;

INSERT INTO service_categories(store_id, parent_id, name, slug, description, position, status, seo_title, seo_description)
SELECT main.store_id, main.id, t.sub_name, t.sub_slug, t.description, t.sub_position, 'active'::record_status,
  t.sub_name || ' | Gündəlik Bakı', t.description || '. Qiymət və əlaqə məlumatlarına baxın.'
FROM service_taxonomy t
JOIN service_categories main ON main.slug=t.main_slug
ON CONFLICT(store_id,slug) DO UPDATE SET
  parent_id=EXCLUDED.parent_id,name=EXCLUDED.name,description=EXCLUDED.description,
  position=EXCLUDED.position,status='active',seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description;

-- Köhnə xidmət elanları yeni ağacda boş qalmır; mətnə əsasən ən yaxın alt
-- kateqoriya seçilir, uyğunluq tapılmadıqda ümumi rəqəmsal xidmətə düşür.
UPDATE classified_listings cl SET service_category_id = category.id
FROM service_categories category
WHERE cl.category='service' AND cl.service_category_id IS NULL
  AND category.store_id=cl.store_id
  AND category.slug = CASE
    WHEN cl.title ILIKE ANY(ARRAY['%elektrik%','%usta%']) THEN 'elektrik-ustasi'
    WHEN cl.title ILIKE '%santex%' THEN 'santexnika'
    WHEN cl.title ILIKE ANY(ARRAY['%təmiz%','%temiz%']) THEN 'ev-temizliyi'
    WHEN cl.title ILIKE '%kondisioner%' THEN 'kondisioner-xidmeti'
    WHEN cl.title ILIKE ANY(ARRAY['%kompüter%','%komputer%','%noutbuk%']) THEN 'komputer-temiri'
    WHEN cl.title ILIKE ANY(ARRAY['%çatdır%','%catdir%','%kuryer%']) THEN 'kuryer-xidmeti'
    WHEN cl.title ILIKE ANY(ARRAY['%foto%','%video%']) THEN 'foto-video'
    ELSE 'veb-proqramlasdirma' END;
