-- Müştəri vitrini üçün üçsəviyyəli, məhsul olmasa da görünən mağaza taksonomiyası.
-- Slug-lar mağaza daxilində unikal saxlanılır və migrasiya təkrar icrada idempotentdir.

CREATE TEMP TABLE storefront_taxonomy (
  department_slug text NOT NULL,
  main_name text NOT NULL,
  main_slug text NOT NULL,
  main_position integer NOT NULL,
  sub_name text NOT NULL,
  sub_slug text NOT NULL,
  sub_position integer NOT NULL,
  description text NOT NULL
) ON COMMIT DROP;

INSERT INTO storefront_taxonomy VALUES
('elektronika','Peşəkar alətlər','elektronika-pesekar-aletler',0,'Elektrik alətləri','simsiz-elektrik-aletleri',0,'Drel, vintaçan, cilalayıcı və peşəkar elektrik alətləri'),
('elektronika','Peşəkar alətlər','elektronika-pesekar-aletler',0,'Ölçü cihazları','olcu-cihazlari-elektronika',1,'Lazer, səviyyəölçən və dəqiq ölçü cihazları'),
('elektronika','Ağıllı texnologiyalar','agilli-texnologiyalar',1,'Ağıllı ev','agilli-ev-cihazlari',0,'Ağıllı ev mərkəzləri və qoşulan gündəlik cihazlar'),
('elektronika','Ağıllı texnologiyalar','agilli-texnologiyalar',1,'Enerji və şarj','enerji-ve-sarj',1,'Portativ enerji, şarj və enerji saxlama həlləri'),

('ev-metbex','Emalatxana','ev-emalatxana',0,'Dəzgah və kəsim','dezgah-ve-kesim',0,'Kəsim, qazma, frez və emalatxana dəzgahları'),
('ev-metbex','Emalatxana','ev-emalatxana',0,'Kompressor və pnevmatika','kompressor-pnevmatika',1,'Hava kompressorları və pnevmatik avadanlıq'),
('ev-metbex','Əl alətləri və saxlama','el-aletleri-saxlama',1,'Alət dəstləri','el-alet-destleri',0,'Təmir və montaj üçün hazır əl aləti dəstləri'),
('ev-metbex','Əl alətləri və saxlama','el-aletleri-saxlama',1,'Aksesuar və saxlama','alet-aksesuarlari',1,'Burğu, çanta, organizer və alət aksesuarları'),

('moda','Geyim','moda-geyim',0,'Üst geyim','ust-geyim',0,'Gödəkçə, sviter və mövsümi üst geyimləri'),
('moda','Geyim','moda-geyim',0,'Gündəlik geyim','gundelik-geyim',1,'Rahat gündəlik geyim seçimləri'),
('moda','Moda aksesuarları','moda-aksesuarlari',1,'Çanta və kəmərlər','canta-kemer',0,'Şəhər çantaları, bel çantaları və dəri kəmərlər'),
('moda','Moda aksesuarları','moda-aksesuarlari',1,'Saat və eynəklər','saat-eynek',1,'Qol saatı, gün eynəyi və tamamlayıcı aksesuarlar'),
('moda','Ayaqqabılar','moda-ayaqqabilar',2,'Gündəlik ayaqqabı','gundelik-ayaqqabi',0,'Şəhər və gündəlik istifadə üçün ayaqqabılar'),
('moda','Ayaqqabılar','moda-ayaqqabilar',2,'Uşaq ayaqqabısı','usaq-ayaqqabisi',1,'Uşaqlar üçün rahat ayaqqabı seçimləri'),

('gozellik-saglamliq','Dəri və saç baxımı','deri-sac-baximi',0,'Üz və dəri baxımı','uz-deri-baximi',0,'Üz kremi, serum və günəşdən qorunma məhsulları'),
('gozellik-sagliq','Dəri və saç baxımı','deri-sac-baximi',0,'Saç və bədən baxımı','sac-beden-baximi',1,'Saç, bədən və aromatik qulluq məhsulları'),
('gozellik-saglamliq','Sağlamlıq məhsulları','saglamliq-mehsullari',1,'Vitaminlər','vitaminler',0,'Gündəlik vitamin və sağlam həyat əlavələri'),
('gozellik-saglamliq','Sağlamlıq məhsulları','saglamliq-mehsullari',1,'Sağlamlıq cihazları','saglamliq-cihazlari',1,'Təzyiq ölçən və rahatlıq təmin edən cihazlar'),

('qida','İçkilər','icgiler',0,'Çay və qəhvə','cay-qehve',0,'Seçilmiş çay və qəhvə kolleksiyaları'),
('qida','İçkilər','icgiler',0,'Təbii şirələr','tebii-sireler',1,'Təbii və yerli meyvə şirələri'),
('qida','Təbii və yerli məhsullar','yerli-mehsullar',1,'Bal, yağ və mürəbbə','bal-yag-murebbe',0,'Yerli bal, yağ və ənənəvi mürəbbələr'),
('qida','Təbii və yerli məhsullar','yerli-mehsullar',1,'Şirniyyat və çərəzlər','sirniyyat-cerez',1,'Şirniyyat, çərəz və hədiyyə qutuları'),

('usaq','Oyuncaq və inkişaf','oyuncaq-inkisaf',0,'İnkişaf oyunları','inkisaf-oyunlari',0,'Məntiq, yaddaş və erkən inkişaf oyunları'),
('usaq','Oyuncaq və inkişaf','oyuncaq-inkisaf',0,'Yaradıcı dəstlər','yaradici-destler',1,'Konstruktor, rəsm və yaradıcı fəaliyyət dəstləri'),
('usaq','Məktəb və gündəlik','mekteb-gundelik',1,'Məktəb ləvazimatları','mekteb-levazimatlari',0,'Məktəb çantası, kitab və tədris ləvazimatları'),
('usaq','Məktəb və gündəlik','mekteb-gundelik',1,'Tekstil və qidalanma','usaq-tekstili-qidalanma',1,'Uşaq tekstili, termos və nahar qutuları'),
('usaq','Körpə baxımı','korpe-baximi',2,'Körpə gigiyenası','korpe-gigiyenasi',0,'Körpələr üçün təhlükəsiz gündəlik qulluq məhsulları'),
('usaq','Körpə baxımı','korpe-baximi',2,'Körpə geyimi','korpe-geyimi',1,'Körpələr üçün yumşaq və rahat geyimlər'),

('avtomobil','Avtomobil elektronikası','avtomobil-elektronikasi',0,'Video və enerji','video-enerji',0,'Videoqeydiyyatçı, şarj və portativ enerji cihazları'),
('avtomobil','Avtomobil elektronikası','avtomobil-elektronikasi',0,'Təzyiq və diaqnostika','tezyiq-diaqnostika',1,'Təkər təzyiqi və avtomobil diaqnostika vasitələri'),
('avtomobil','Qulluq və aksesuar','qulluq-aksesuar',1,'Salon və təşkilat','salon-teskilat',0,'Ayaqaltı, organizer, tutacaq və salon aksesuarları'),
('avtomobil','Qulluq və aksesuar','qulluq-aksesuar',1,'Təhlükəsizlik və qulluq','tehlukesizlik-qulluq',1,'Təcili yardım, təmizlik və kuzov qulluq dəstləri'),

('xidmetler','Ev xidmətləri','ev-xidmetleri',0,'Təmir və usta','temir-usta',0,'Elektrik, santexnika və məişət təmiri xidmətləri'),
('xidmetler','Ev xidmətləri','ev-xidmetleri',0,'Təmizlik və mebel','temizlik-mebel',1,'Ev təmizliyi və mebel yığılması xidmətləri'),
('xidmetler','Texniki və mobil xidmətlər','texniki-mobil-xidmetler',1,'Texniki dəstək','texniki-destek',0,'Kompüter və səyyar texniki dəstək xidmətləri'),
('xidmetler','Texniki və mobil xidmətlər','texniki-mobil-xidmetler',1,'Çatdırılma və çəkiliş','catdirilma-cekilis',1,'Kuryer, foto və video xidmətləri'),

('hediyyeler','Hədiyyə seçimləri','hediyye-secimleri',0,'Texnologiya hədiyyələri','texnologiya-hediyyeleri',0,'Texnologiya sevənlər üçün seçilmiş hədiyyələr'),
('hediyyeler','Hədiyyə seçimləri','hediyye-secimleri',0,'Ev üçün hədiyyələr','ev-ucun-hediyyeler',1,'Ev və emalatxana üçün praktik hədiyyələr'),
('hediyyeler','Xüsusi günlər','xususi-gunler',1,'Ad günü','ad-gunu-hediyyeleri',0,'Ad günü üçün seçilmiş hədiyyə ideyaları'),
('hediyyeler','Xüsusi günlər','xususi-gunler',1,'Korporativ hədiyyələr','korporativ-hediyyeler',1,'Komandalar və biznes tərəfdaşları üçün hədiyyələr');

-- Keçmiş yazılış variantını düzəlt.
UPDATE storefront_taxonomy SET department_slug='gozellik-saglamliq' WHERE department_slug='gozellik-sagliq';

INSERT INTO categories(store_id,parent_id,name,slug,description,image_asset_id,position,status,seo_title,seo_description)
SELECT DISTINCT department.store_id,department.id,t.main_name,t.main_slug,
  t.main_name||' üzrə seçilmiş məhsullar',department.image_asset_id,t.main_position,'active'::record_status,
  t.main_name||' | Gündəlik Bakı',t.main_name||' məhsulları və aktual qiymətlər.'
FROM storefront_taxonomy t
JOIN categories department ON department.slug=t.department_slug AND department.parent_id IS NULL
ON CONFLICT(store_id,slug) DO UPDATE SET
  parent_id=EXCLUDED.parent_id,name=EXCLUDED.name,image_asset_id=coalesce(categories.image_asset_id,EXCLUDED.image_asset_id),
  position=EXCLUDED.position,status='active',seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description;

INSERT INTO categories(store_id,parent_id,name,slug,description,image_asset_id,position,status,seo_title,seo_description)
SELECT department.store_id,main.id,t.sub_name,t.sub_slug,t.description,
  coalesce(main.image_asset_id,department.image_asset_id),t.sub_position,'active'::record_status,
  t.sub_name||' | Gündəlik Bakı',t.description||'. Aktual qiymət və seçimlərə baxın.'
FROM storefront_taxonomy t
JOIN categories department ON department.slug=t.department_slug AND department.parent_id IS NULL
JOIN categories main ON main.store_id=department.store_id AND main.slug=t.main_slug
ON CONFLICT(store_id,slug) DO UPDATE SET
  parent_id=EXCLUDED.parent_id,name=EXCLUDED.name,description=EXCLUDED.description,
  image_asset_id=coalesce(categories.image_asset_id,EXCLUDED.image_asset_id),position=EXCLUDED.position,status='active',
  seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description;

-- Cari məhsulları onların ən uyğun alt kateqoriyasına bağla. Kök kateqoriya əsas olaraq qalır.
WITH product_context AS (
  SELECT DISTINCT p.id AS product_id,pl.title,root.slug AS department_slug
  FROM products p
  JOIN product_listings pl ON pl.product_id=p.id AND pl.status='published'
  JOIN product_categories pc ON pc.product_id=p.id AND pc.is_primary
  JOIN categories root ON root.id=pc.category_id
  WHERE p.deleted_at IS NULL
), mapped AS (
  SELECT product_id,CASE
    WHEN department_slug='elektronika' AND title ILIKE ANY(ARRAY['%lazer%','%səviyyə%','%tərəz%']) THEN 'olcu-cihazlari-elektronika'
    WHEN department_slug='elektronika' AND title ILIKE '%ağıllı ev%' THEN 'agilli-ev-cihazlari'
    WHEN department_slug='elektronika' AND title ILIKE '%enerji stansiyası%' THEN 'enerji-ve-sarj'
    WHEN department_slug='elektronika' THEN 'simsiz-elektrik-aletleri'
    WHEN department_slug='ev-metbex' AND title ILIKE '%kompressor%' THEN 'kompressor-pnevmatika'
    WHEN department_slug='ev-metbex' AND title ILIKE ANY(ARRAY['%dəst%','%çəkic%']) THEN 'el-alet-destleri'
    WHEN department_slug='ev-metbex' AND title ILIKE ANY(ARRAY['%çanta%','%burğu%']) THEN 'alet-aksesuarlari'
    WHEN department_slug='ev-metbex' THEN 'dezgah-ve-kesim'
    WHEN department_slug='moda' AND title ILIKE '%ayaqqabı%' THEN 'gundelik-ayaqqabi'
    WHEN department_slug='moda' AND title ILIKE ANY(ARRAY['%çanta%','%kəmər%','%bel çantası%']) THEN 'canta-kemer'
    WHEN department_slug='moda' AND title ILIKE ANY(ARRAY['%saat%','%eynək%','%şərf%']) THEN 'saat-eynek'
    WHEN department_slug='moda' AND title ILIKE ANY(ARRAY['%gödəkçə%','%sviter%']) THEN 'ust-geyim'
    WHEN department_slug='moda' THEN 'gundelik-geyim'
    WHEN department_slug='gozellik-saglamliq' AND title ILIKE ANY(ARRAY['%saç%','%bədən%','%yağ%']) THEN 'sac-beden-baximi'
    WHEN department_slug='gozellik-saglamliq' AND title ILIKE '%vitamin%' THEN 'vitaminler'
    WHEN department_slug='gozellik-saglamliq' AND title ILIKE ANY(ARRAY['%təzyiq%','%yastıq%']) THEN 'saglamliq-cihazlari'
    WHEN department_slug='gozellik-saglamliq' THEN 'uz-deri-baximi'
    WHEN department_slug='qida' AND title ILIKE ANY(ARRAY['%çay%','%qəhvə%']) THEN 'cay-qehve'
    WHEN department_slug='qida' AND title ILIKE '%şirə%' THEN 'tebii-sireler'
    WHEN department_slug='qida' AND title ILIKE ANY(ARRAY['%bal%','%yağ%','%mürəbbə%']) THEN 'bal-yag-murebbe'
    WHEN department_slug='qida' THEN 'sirniyyat-cerez'
    WHEN department_slug='usaq' AND title ILIKE ANY(ARRAY['%konstruktor%','%rəsm%']) THEN 'yaradici-destler'
    WHEN department_slug='usaq' AND title ILIKE ANY(ARRAY['%məktəb%','%kitab%','%əlifba%']) THEN 'mekteb-levazimatlari'
    WHEN department_slug='usaq' AND title ILIKE ANY(ARRAY['%tekstili%','%termos%','%nahar%']) THEN 'usaq-tekstili-qidalanma'
    WHEN department_slug='usaq' THEN 'inkisaf-oyunlari'
    WHEN department_slug='avtomobil' AND title ILIKE ANY(ARRAY['%video%','%şarj%','%kompressor%']) THEN 'video-enerji'
    WHEN department_slug='avtomobil' AND title ILIKE ANY(ARRAY['%təzyiq%','%diaqnostika%']) THEN 'tezyiq-diaqnostika'
    WHEN department_slug='avtomobil' AND title ILIKE ANY(ARRAY['%ayaqaltı%','%organizer%','%tutacaq%']) THEN 'salon-teskilat'
    WHEN department_slug='avtomobil' THEN 'tehlukesizlik-qulluq'
    WHEN department_slug='xidmetler' AND title ILIKE ANY(ARRAY['%elektrik%','%santexnika%','%kondisioner%','%heyvan%']) THEN 'temir-usta'
    WHEN department_slug='xidmetler' AND title ILIKE ANY(ARRAY['%təmizlik%','%mebel%']) THEN 'temizlik-mebel'
    WHEN department_slug='xidmetler' AND title ILIKE ANY(ARRAY['%kompüter%','%diaqnostika%']) THEN 'texniki-destek'
    WHEN department_slug='xidmetler' THEN 'catdirilma-cekilis'
    ELSE NULL END AS leaf_slug
  FROM product_context
)
INSERT INTO product_categories(product_id,category_id,is_primary)
SELECT mapped.product_id,leaf.id,false FROM mapped
JOIN categories leaf ON leaf.slug=mapped.leaf_slug
WHERE mapped.leaf_slug IS NOT NULL
ON CONFLICT(product_id,category_id) DO NOTHING;

-- Hədiyyələrə artıq bağlanmış məhsulları ayrıca hədiyyə alt bölmələrində də göstər.
WITH gifts AS (
  SELECT DISTINCT pc.product_id,
    CASE WHEN primary_root.slug='elektronika' THEN 'texnologiya-hediyyeleri' ELSE 'ev-ucun-hediyyeler' END AS leaf_slug
  FROM product_categories pc
  JOIN categories gift_root ON gift_root.id=pc.category_id AND gift_root.slug='hediyyeler'
  JOIN product_categories primary_pc ON primary_pc.product_id=pc.product_id AND primary_pc.is_primary
  JOIN categories primary_root ON primary_root.id=primary_pc.category_id
)
INSERT INTO product_categories(product_id,category_id,is_primary)
SELECT gifts.product_id,leaf.id,false FROM gifts JOIN categories leaf ON leaf.slug=gifts.leaf_slug
ON CONFLICT(product_id,category_id) DO NOTHING;
