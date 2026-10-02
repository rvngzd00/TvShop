# TVShop — təsdiqlənmiş məhsul tələbləri

Bu sənəd müştərinin təqdim etdiyi üç DOCX faylı və əlavə ekosistem brief-i
əsasında hazırlanıb. Cari storefront TVShop kimi işləyir; məlumat modeli gələcək
ortaq commerce core-a qoşulmağa mane olmayacaq şəkildə `store_id` ilə ayrılır.

## Məhsul istiqamətləri

- Media + marketplace + lokal reklam platforması
- Məhsul, kateqoriya, brend, stok, səbət, sifariş və satış
- Endirim, kupon, kampaniya, promo və hədiyyələr
- Rəqəmsal jurnal, PDF arxiv və jurnal reklam səhifələri
- İstifadəçi elanları: məhsul, xidmət, əmlak, avtomobil və digər
- Bakı Club: xal, wallet, kuponlar, hədiyyələr, tarixçə və referal
- Reklamverən/vendora ölçülə bilən nəticələr və öz sifariş/məhsul paneli
- Super admin, admin, editor, SEO mütəxəssisi, moderator və vendor rolları
- Video-first məhsul kartları və məhsul səhifəsi; video olmadıqda şəkil fallback-i
- Admin idarəli YouTube/TikTok/Instagram TV sahəsi və real YouTube canlı statusu

## Smart QR və engagement

QR növləri: product, coupon, reward, lead, social, event, survey, store və
smart redirect. Çap olunmuş QR dəyişmədən aktiv hədəf dəyişdirilə bilməlidir.
Hər scan üçün vaxt, anonim visitor, authenticated user, cihaz, referrer,
kampaniya və privacy-safe IP hash saxlanmalıdır. Dəqiq lokasiya yalnız istifadəçi
razılığı olduqda qəbul edilməlidir.

QR prosesi atomik olmalıdır: scan qeydi → eligibility yoxlaması → kupon/xal →
audit/outbox. Eyni istifadəçinin təkrar scan limiti və kampaniya ümumi limiti
database transaction daxilində qorunmalıdır.

## Naviqasiya

- Mağaza: Elektronika, Ev və Mətbəx, Moda, Gözəllik və Sağlamlıq, Qida,
  Uşaq, Avtomobil, Xidmətlər
- Endirimlər və Kuponlar: Restoranlar, Marketlər, Geyim, Gözəllik və
  Sağlamlıq, Əyləncə, Səyahət
- Kampaniyalar: Günün Təklifi, Həftənin Kampaniyası, Məhdud Sayda,
  Mövsümi Endirimlər
- Jurnal və Blog: Son Buraxılış, Arxiv, Brend Hekayələri, Alış-veriş Məsləhətləri
- Bakı Club: Xal Qazan, Hədiyyələr, Giveaway-lər, QR Wallet
- Elanlar: Məhsullar, Xidmətlər, Əmlak, Avtomobil
- Biznes üçün: Reklam Ver, Sponsorluq, Brend Vitrini, Analitika

## SEO

- SSR-ready metadata, canonical, Open Graph, robots və JSON-LD
- Pillar → Cluster əlaqəsi, cluster daxili linkləri və orphan content audit-i
- Məhsul, Article, Organization, WebSite, Breadcrumb və FAQ schema modelləri
- Slug tarixçəsi və 301 redirect cədvəli
- Sitemap index və ayrıca product/category/article/campaign sitemap-ları
- Locale və gələcək multi-store üçün hreflang hazırlığı
- SEO rolları content publish etmədən metadata və link planını idarə edə bilər

## Sifariş və vendor izolyasiyası

Bir checkout birdən çox vendor məhsulu daşıya bilər. `orders` müştəri sifarişini,
`vendor_orders` isə satıcıya görünən hissəni saxlayır. Vendor yalnız öz listing,
inventory, order item və analitikasına çıxış əldə edir. Super admin bütün store-u
idarə edir. Status keçidləri whitelist və audit log ilə qorunur.

## Production non-functional tələblər

- PostgreSQL, transaction, foreign key, check və unique constraint-lər
- Least-privilege RBAC, vendor/store scope və server-side authorization
- Scrypt password hash, qısa access token, rotate olunan opaque refresh token
- HttpOnly/Secure/SameSite cookies, CSRF/Origin qoruması, rate limit və Helmet
- Zod input validation, parametrik SQL, sanitize edilmiş CMS HTML
- Audit log, idempotency key, outbox, health/readiness endpoint-ləri
- Docker, migration, seed, backup/restore runbook və structured logging

## Xarici servis üçün saxlanan sərhədlər

Ödəniş provayderi, kargo, SMS/email, WhatsApp Business, GA4/GTM/Pixel və object
storage credential-ları verilmədiyi üçün adapter interfeysləri və webhook/outbox
sərhədləri hazırlanır. Real provider aktivləşməsi ayrıca credential və biznes
qaydası tələb edir.
