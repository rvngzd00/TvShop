# TVShop arxitekturası

## Sərhədlər

```text
Browser / Mobile
       │
       ├── Public storefront (frontend/)
       ├── Admin SPA (/admin/)
       └── REST API (/api/v1/)
                     │
              Fastify application
       ┌─────────────┼───────────────┐
       │             │               │
  Identity/RBAC   Commerce       CMS/SEO/TV
       │             │               │
       └─────────────┼───────────────┘
                 PostgreSQL
                 + outbox
```

Backend modular monolith kimi başlayır. Bu seçim transaction sərhədlərini sadə,
deployment-i etibarlı saxlayır və premature microservice parçalanmasının qarşısını
alır. Hər modulun route/service/repository sərhədi var; notification, analytics və
AI consumer-ları sonradan outbox-dan ayrıca servisə çıxarıla bilər.

## Tenant modeli

TVShop standart `store`-dur. Məhsulun əsas məlumatı vendor-a aiddir, qiymət,
publish statusu və SEO təqdimatı `product_listings` vasitəsilə store-a bağlıdır.
Store-aware sərhədlər yeni storefront/listing əlavə ediləndə commerce core-u
köçürmədən genişlənməyə imkan verir.

## Video və provider sərhədləri

Məhsul bir lokal `media_asset` videosuna və ya doğrulanmış birbaşa HTTPS
MP4/WEBM URL-inə istinad edə bilər. Kart və məhsul səhifəsi video olduqda onu
əsas media kimi göstərir, video olmadıqda şəkil axını dəyişmir.

TV sahəsi provider metadata-sını (`youtube`, `tiktok`, `instagram`) strukturlaşdırılmış
şəkildə saxlayır. Xarici URL yalnız server allow-list və provider parser-indən keçəndən
sonra embed URL-ə çevrilir. YouTube canlı statusu serverdə rəsmi Data API ilə yoxlanır,
qısa müddətli keşlənir və API açarı browser-ə ötürülmür.

## Authorization

`user_roles` assignment-i store və ya vendor scope daşıyır. Route əvvəl permission,
sonra resource scope yoxlayır. `super_admin` platform scope-dur; vendor rolları
başqa vendor ID-si ilə sorğu göndərsə belə repository predicate həmin məlumatı
qaytarmır. Bütün kritik mutation-lar `audit_logs`-a yazılır.

## Content və SEO

Page/post content JSON block şəklində saxlanır, render zamanı allow-list ilə
sanitize edilir. `seo_clusters` pillar səhifəni, `seo_cluster_members` isə cluster
kontentini birləşdirir. Publish prosesi canonical/slug/heading/schema və daxili link
audit-i olmadan production statusuna keçməyə icazə vermir.

## Təhlükəsizlik və şəxsi məlumatlar

- Password heç vaxt log və ya database-də açıq saxlanmır.
- Refresh token yalnız SHA-256 digest kimi saxlanır və hər refresh-də rotate olunur.
- IP analytics üçün gündəlik salt ilə hash-lənir; raw IP saxlanmır.
- Vendor export və şəxsi məlumat əməliyyatları audit olunur.
- Production-da TLS reverse proxy, managed secret store, encrypted backups və
  object storage istifadə edilməlidir.
