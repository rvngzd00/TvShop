UPDATE stores
SET
  name='TVShop',
  settings=replace(replace(settings::text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')::jsonb,
  updated_at=now()
WHERE code='daily-baku';

UPDATE vendors
SET description=replace(replace(replace(description,'Gündəlik Bakıda','TVShop-da'),'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')
WHERE description LIKE '%Gündəlik Bakı%' OR description LIKE '%Daily Baku%';

UPDATE media_assets
SET
  alt_text=replace(replace(alt_text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  title=replace(replace(title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')
WHERE alt_text LIKE '%Gündəlik Bakı%' OR alt_text LIKE '%Daily Baku%'
   OR title LIKE '%Gündəlik Bakı%' OR title LIKE '%Daily Baku%';

UPDATE brands
SET
  description=replace(replace(description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_title=replace(replace(seo_title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_description=replace(replace(seo_description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')
WHERE to_jsonb(brands)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(brands)::text LIKE '%Daily Baku%';

UPDATE categories
SET
  description=replace(replace(description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_title=replace(replace(seo_title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_description=replace(replace(replace(seo_description,'Gündəlik Bakıda','TVShop-da'),'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')
WHERE to_jsonb(categories)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(categories)::text LIKE '%Daily Baku%';

UPDATE products
SET
  name=replace(replace(name,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  description=replace(replace(description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  attributes=replace(replace(attributes::text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')::jsonb
WHERE to_jsonb(products)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(products)::text LIKE '%Daily Baku%';

UPDATE product_listings
SET
  title=replace(replace(title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  short_description=replace(replace(short_description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  description=replace(replace(description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_title=replace(replace(seo_title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_description=replace(replace(replace(seo_description,'Gündəlik Bakıda','TVShop-da'),'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  schema_data=replace(replace(schema_data::text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')::jsonb
WHERE to_jsonb(product_listings)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(product_listings)::text LIKE '%Daily Baku%';

UPDATE post_categories
SET
  name=replace(replace(name,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  description=replace(replace(description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_title=replace(replace(seo_title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_description=replace(replace(seo_description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')
WHERE to_jsonb(post_categories)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(post_categories)::text LIKE '%Daily Baku%';

UPDATE posts
SET
  title=replace(replace(title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  excerpt=replace(replace(excerpt,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  content=replace(replace(content::text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')::jsonb,
  seo_title=replace(replace(seo_title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_description=replace(replace(seo_description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  schema_data=replace(replace(schema_data::text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')::jsonb
WHERE to_jsonb(posts)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(posts)::text LIKE '%Daily Baku%';

UPDATE pages
SET
  title=replace(replace(title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  excerpt=replace(replace(excerpt,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  content=replace(replace(content::text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')::jsonb,
  seo_title=replace(replace(seo_title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_description=replace(replace(seo_description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  schema_data=replace(replace(schema_data::text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')::jsonb
WHERE to_jsonb(pages)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(pages)::text LIKE '%Daily Baku%';

UPDATE journal_issues
SET
  title=replace(replace(title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  description=replace(replace(description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')
WHERE to_jsonb(journal_issues)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(journal_issues)::text LIKE '%Daily Baku%';

UPDATE campaigns
SET
  name=replace(replace(name,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  description=replace(replace(description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  goals=replace(replace(goals::text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')::jsonb,
  targeting=replace(replace(targeting::text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')::jsonb
WHERE to_jsonb(campaigns)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(campaigns)::text LIKE '%Daily Baku%';

UPDATE rewards
SET
  name=replace(replace(name,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  description=replace(replace(description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')
WHERE to_jsonb(rewards)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(rewards)::text LIKE '%Daily Baku%';

UPDATE qr_codes
SET
  name=replace(replace(name,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  rules=replace(replace(rules::text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')::jsonb
WHERE to_jsonb(qr_codes)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(qr_codes)::text LIKE '%Daily Baku%';

UPDATE service_categories
SET
  name=replace(replace(name,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  description=replace(replace(description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_title=replace(replace(seo_title,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  seo_description=replace(replace(seo_description,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')
WHERE to_jsonb(service_categories)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(service_categories)::text LIKE '%Daily Baku%';

UPDATE seo_clusters
SET
  name=replace(replace(name,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  primary_keyword=replace(replace(primary_keyword,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  target_audience=replace(replace(target_audience,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')
WHERE to_jsonb(seo_clusters)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(seo_clusters)::text LIKE '%Daily Baku%';

UPDATE seo_cluster_members
SET
  target_keyword=replace(replace(target_keyword,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop'),
  supporting_keywords=ARRAY(
    SELECT replace(replace(keyword,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')
    FROM unnest(supporting_keywords) AS keyword
  ),
  planned_internal_links=replace(replace(planned_internal_links::text,'Gündəlik Bakı','TVShop'),'Daily Baku','TVShop')::jsonb
WHERE to_jsonb(seo_cluster_members)::text LIKE '%Gündəlik Bakı%' OR to_jsonb(seo_cluster_members)::text LIKE '%Daily Baku%';
