UPDATE stores
SET name = replace(replace(name, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')
WHERE name LIKE '%Daily Baku%' OR name LIKE '%DAILY BAKU%';

UPDATE vendors
SET description = replace(replace(description, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')
WHERE description LIKE '%Daily Baku%' OR description LIKE '%DAILY BAKU%';

UPDATE brands
SET seo_title = replace(replace(seo_title, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')
WHERE seo_title LIKE '%Daily Baku%' OR seo_title LIKE '%DAILY BAKU%';

UPDATE categories
SET
  seo_title = replace(replace(seo_title, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  seo_description = replace(replace(seo_description, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')
WHERE
  seo_title LIKE '%Daily Baku%' OR seo_title LIKE '%DAILY BAKU%'
  OR seo_description LIKE '%Daily Baku%' OR seo_description LIKE '%DAILY BAKU%';

UPDATE product_listings
SET
  title = replace(replace(title, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  short_description = replace(replace(short_description, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  description = replace(replace(description, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  seo_title = replace(replace(seo_title, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  seo_description = replace(replace(seo_description, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')
WHERE
  title LIKE '%Daily Baku%' OR title LIKE '%DAILY BAKU%'
  OR short_description LIKE '%Daily Baku%' OR short_description LIKE '%DAILY BAKU%'
  OR description LIKE '%Daily Baku%' OR description LIKE '%DAILY BAKU%'
  OR seo_title LIKE '%Daily Baku%' OR seo_title LIKE '%DAILY BAKU%'
  OR seo_description LIKE '%Daily Baku%' OR seo_description LIKE '%DAILY BAKU%';

UPDATE post_categories
SET
  name = replace(replace(name, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  description = replace(replace(description, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  seo_title = replace(replace(seo_title, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  seo_description = replace(replace(seo_description, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')
WHERE
  name LIKE '%Daily Baku%' OR name LIKE '%DAILY BAKU%'
  OR description LIKE '%Daily Baku%' OR description LIKE '%DAILY BAKU%'
  OR seo_title LIKE '%Daily Baku%' OR seo_title LIKE '%DAILY BAKU%'
  OR seo_description LIKE '%Daily Baku%' OR seo_description LIKE '%DAILY BAKU%';

UPDATE posts
SET
  title = replace(replace(title, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  excerpt = replace(replace(excerpt, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  content = replace(replace(content::text, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')::jsonb,
  seo_title = replace(replace(seo_title, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  seo_description = replace(replace(seo_description, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  schema_data = replace(replace(schema_data::text, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')::jsonb
WHERE
  title LIKE '%Daily Baku%' OR title LIKE '%DAILY BAKU%'
  OR excerpt LIKE '%Daily Baku%' OR excerpt LIKE '%DAILY BAKU%'
  OR content::text LIKE '%Daily Baku%' OR content::text LIKE '%DAILY BAKU%'
  OR seo_title LIKE '%Daily Baku%' OR seo_title LIKE '%DAILY BAKU%'
  OR seo_description LIKE '%Daily Baku%' OR seo_description LIKE '%DAILY BAKU%'
  OR schema_data::text LIKE '%Daily Baku%' OR schema_data::text LIKE '%DAILY BAKU%';

UPDATE pages
SET
  title = replace(replace(title, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  excerpt = replace(replace(excerpt, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  content = replace(replace(content::text, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')::jsonb,
  seo_title = replace(replace(seo_title, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  seo_description = replace(replace(seo_description, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  schema_data = replace(replace(schema_data::text, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')::jsonb
WHERE
  title LIKE '%Daily Baku%' OR title LIKE '%DAILY BAKU%'
  OR excerpt LIKE '%Daily Baku%' OR excerpt LIKE '%DAILY BAKU%'
  OR content::text LIKE '%Daily Baku%' OR content::text LIKE '%DAILY BAKU%'
  OR seo_title LIKE '%Daily Baku%' OR seo_title LIKE '%DAILY BAKU%'
  OR seo_description LIKE '%Daily Baku%' OR seo_description LIKE '%DAILY BAKU%'
  OR schema_data::text LIKE '%Daily Baku%' OR schema_data::text LIKE '%DAILY BAKU%';

UPDATE qr_codes
SET name = replace(replace(name, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')
WHERE name LIKE '%Daily Baku%' OR name LIKE '%DAILY BAKU%';

UPDATE seo_cluster_members
SET
  target_keyword = replace(replace(target_keyword, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  supporting_keywords = ARRAY(
    SELECT replace(replace(keyword, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')
    FROM unnest(supporting_keywords) AS keyword
  ),
  planned_internal_links = replace(replace(planned_internal_links::text, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')::jsonb
WHERE
  target_keyword LIKE '%Daily Baku%' OR target_keyword LIKE '%DAILY BAKU%'
  OR supporting_keywords::text LIKE '%Daily Baku%' OR supporting_keywords::text LIKE '%DAILY BAKU%'
  OR planned_internal_links::text LIKE '%Daily Baku%' OR planned_internal_links::text LIKE '%DAILY BAKU%';
