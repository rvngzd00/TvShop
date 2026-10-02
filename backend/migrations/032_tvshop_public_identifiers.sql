UPDATE posts
SET
  slug='tvshop-yeni-reqemsal-buraxilis',
  canonical_url=replace(canonical_url,'daily-baku-yeni-reqemsal-buraxilis','tvshop-yeni-reqemsal-buraxilis'),
  schema_data=replace(schema_data::text,'daily-baku-yeni-reqemsal-buraxilis','tvshop-yeni-reqemsal-buraxilis')::jsonb,
  updated_at=now()
WHERE slug='daily-baku-yeni-reqemsal-buraxilis';

UPDATE journal_issues
SET
  slug=replace(slug,'gundelik-baki','tvshop'),
  updated_at=now()
WHERE slug LIKE 'gundelik-baki-%';

UPDATE media_assets
SET
  storage_key=replace(storage_key,'gundelik-baki-demo.pdf','tvshop-demo.pdf'),
  public_url=replace(public_url,'gundelik-baki-demo.pdf','tvshop-demo.pdf'),
  metadata=replace(metadata::text,'gundelik-baki-demo.pdf','tvshop-demo.pdf')::jsonb
WHERE storage_key LIKE '%gundelik-baki-demo.pdf%'
   OR public_url LIKE '%gundelik-baki-demo.pdf%'
   OR metadata::text LIKE '%gundelik-baki-demo.pdf%';
