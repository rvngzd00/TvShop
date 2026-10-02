UPDATE stores
SET primary_domain = 'gundelikbaki.az'
WHERE primary_domain = 'dailybaku.az';

UPDATE stores
SET settings = replace(settings::text, '@dailybaku.az', '@gundelikbaki.az')::jsonb
WHERE settings::text LIKE '%@dailybaku.az%';

UPDATE classified_listings
SET contact_data = replace(contact_data::text, '@dailybaku.az', '@gundelikbaki.az')::jsonb
WHERE contact_data::text LIKE '%@dailybaku.az%';

UPDATE pages
SET
  content = replace(content::text, 'dailybaku.az', 'gundelikbaki.az')::jsonb,
  canonical_url = replace(canonical_url, 'dailybaku.az', 'gundelikbaki.az'),
  schema_data = replace(schema_data::text, 'dailybaku.az', 'gundelikbaki.az')::jsonb
WHERE content::text LIKE '%dailybaku.az%'
   OR canonical_url LIKE '%dailybaku.az%'
   OR schema_data::text LIKE '%dailybaku.az%';

UPDATE posts
SET
  content = replace(content::text, 'dailybaku.az', 'gundelikbaki.az')::jsonb,
  canonical_url = replace(canonical_url, 'dailybaku.az', 'gundelikbaki.az'),
  schema_data = replace(schema_data::text, 'dailybaku.az', 'gundelikbaki.az')::jsonb
WHERE content::text LIKE '%dailybaku.az%'
   OR canonical_url LIKE '%dailybaku.az%'
   OR schema_data::text LIKE '%dailybaku.az%';

UPDATE site_editor_documents
SET
  draft_content = replace(draft_content::text, 'dailybaku.az', 'gundelikbaki.az')::jsonb,
  published_content = replace(published_content::text, 'dailybaku.az', 'gundelikbaki.az')::jsonb
WHERE draft_content::text LIKE '%dailybaku.az%'
   OR published_content::text LIKE '%dailybaku.az%';

UPDATE site_editor_revisions
SET content = replace(content::text, 'dailybaku.az', 'gundelikbaki.az')::jsonb
WHERE content::text LIKE '%dailybaku.az%';
