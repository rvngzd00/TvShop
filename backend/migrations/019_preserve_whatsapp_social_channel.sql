WITH footer_social_links AS (
  SELECT '[
    {"id":"instagram","network":"Instagram","label":"Gündəlik Bakı — Instagram","url":"https://www.instagram.com/gundelikbaki.az?utm_source=qr&igsh=cDd4aGQwZDhlcDM1","visible":true},
    {"id":"facebook","network":"Facebook","label":"Gündəlik Bakı — Facebook","url":"https://www.facebook.com/share/1DH8hF28DT/","visible":true},
    {"id":"x","network":"X","label":"Gündəlik Bakı — X","url":"https://x.com/GundelikBaki","visible":true},
    {"id":"tiktok","network":"TikTok","label":"Gündəlik Bakı — TikTok","url":"https://www.tiktok.com/@gundelikbaki.az?_r=1&_t=ZS-98bbh3lg7AD","visible":true},
    {"id":"linkedin","network":"LinkedIn","label":"Gündəlik Bakı — LinkedIn","url":"https://www.linkedin.com/company/gundelikbaki/","visible":true},
    {"id":"whatsapp","network":"WhatsApp","label":"Gündəlik Bakı — WhatsApp","url":"https://wa.me/994502645400","visible":true}
  ]'::jsonb AS value
)
UPDATE site_editor_documents AS document
SET draft_content = jsonb_set(document.draft_content, '{socialLinks}', links.value, true),
    published_content = jsonb_set(document.published_content, '{socialLinks}', links.value, true),
    updated_at = now()
FROM footer_social_links AS links
WHERE document.scope = 'footer';
