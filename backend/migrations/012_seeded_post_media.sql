WITH post_images(slug, public_url) AS (
  VALUES
    ('duzgun-elektrik-aleti-nece-secilmelidir','/assets/images/categories/jurnal/alis-veris-meslehetleri.jpg'),
    ('endirim-kampaniyasinda-agilli-alis-veris','/assets/images/categories/kampaniyalar/movsumi-endirimler.jpg'),
    ('baku-pro-market-reqemsal-inkisaf-hekayesi','/assets/images/categories/jurnal/brend-hekayeleri.jpg'),
    ('yay-fursetleri-alis-veris-plani','/assets/images/categories/endirimler.jpg'),
    ('daily-baku-yeni-reqemsal-buraxilis','/assets/images/categories/jurnal/son-buraxilis.jpg'),
    ('yerli-brendler-reqemsal-vitrin','/assets/images/categories/biznes/brend-vitrini.jpg'),
    ('baki-club-yeni-hediyyeler','/assets/images/categories/baki-club/giveawayler.jpg'),
    ('ayin-en-cox-oxunan-hekayeleri','/assets/images/categories/jurnal/arxiv.jpg')
)
INSERT INTO media_assets(store_id,uploaded_by,storage_key,public_url,mime_type,byte_size,alt_text,title,metadata)
SELECT p.store_id,p.author_id,'seed/posts/'||p.slug||'.jpg',pi.public_url,'image/jpeg',1,p.title||' — Gündəlik Bakı yeniliyi',p.title,'{"seeded":true,"source":"theme-export"}'::jsonb
FROM posts p JOIN post_images pi ON pi.slug=p.slug
ON CONFLICT(storage_key) DO UPDATE SET public_url=excluded.public_url,alt_text=excluded.alt_text,title=excluded.title;

UPDATE posts p
SET featured_asset_id=ma.id
FROM media_assets ma
WHERE ma.store_id=p.store_id
  AND ma.storage_key='seed/posts/'||p.slug||'.jpg'
  AND p.featured_asset_id IS NULL;
