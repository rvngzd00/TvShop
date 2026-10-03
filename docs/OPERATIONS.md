# TVShop production əməliyyatları

## Buraxılış

1. `/var/www/tvshop/app/.env` faylını serverdə ayrıca saxlayın. JWT, cookie, PostgreSQL və bootstrap admin şifrələri bir-birindən fərqli, minimum 32 bayt təsadüfi dəyərlər olmalıdır.
2. `PUBLIC_ORIGIN=https://tvshop.az` və uyğun `ALLOWED_ORIGINS` dəyərini təyin edin. Docker PostgreSQL üçün `DATABASE_SSL=disable`, xarici managed PostgreSQL üçün `DATABASE_SSL=require` seçin.
3. VPS-də yalnız `docker compose -p tvshop -f docker-compose.vps.yml --env-file .env ...` formasından istifadə edin. Nginx hostdakı `tvshop.az` konfiqurasiyası ilə localhost blue/green portlarına proxy edir.
4. Konteyner startı yalnız checksum-lı migrasiyaları tətbiq edir və serveri başladır. Production startup heç vaxt demo və ya bootstrap seed işə salmır.
5. `/api/v1/ready`, `/documentation`, `/admin/`, əsas səhifə və sitemap-ı yoxlayın.

## TV və media konfiqurasiyası

- `YOUTUBE_API_KEY` server-side secret kimi saxlanmalıdır; frontend build-ə və ya public runtime config-ə əlavə edilməməlidir.
- `YOUTUBE_LIVE_CACHE_SECONDS` üçün standart dəyər `120`-dir; icazə verilən interval 30–900 saniyədir.
- Admin panelində TV bölməsində YouTube kanal ID-si (`UC...`) ayrıca saxlanır. Açar və ya kanal ID-si olmadıqda canlı statusu `unavailable` qaytarır, digər provider tabları işləməyə davam edir.
- Lokal məhsul video yükləmələri üçün `MAX_UPLOAD_BYTES` production reverse proxy limiti ilə uyğunlaşdırılmalıdır. Cari nümunə 50 MiB-dir; MP4 və WEBM qəbul edilir.

## Backup və bərpa

- PostgreSQL üçün hər gün şifrəli `pg_dump -Fc` backup, obyekt/upload qovluğu üçün ayrıca snapshot yaradın.
- Gündəlik backup saxlanması: 14 gün; həftəlik: 8 həftə; aylıq: 12 ay.
- Rübdə ən azı bir dəfə təmiz mühitdə bərpa testi aparın. Backup yalnız uğurlu restore testi ilə etibarlı sayılır.
- Bərpa zamanı tətbiqi maintenance rejiminə alın, DB və upload snapshot-larını eyni zaman nöqtəsindən bərpa edin, sonra `/ready` və sifariş inventar bütövlüyünü yoxlayın.

## Monitorinq

- `/api/v1/health` prosesi, `/api/v1/ready` isə verilənlər bazası ilə yanaşı aktiv əsas mağaza qeydini yoxlayır.
- JSON loglarda `requestId` saxlanır; auth header, cookie və şifrələr redaktə olunur.
- 5xx faizi, login bloklanmaları, outbox backlog, aşağı stok, uğursuz ödəniş və QR sui-istifadə limiti üçün alert qurulmalıdır.
- DB yalnız private şəbəkədə qalır; internetə port açılmır.

## Təhlükəsizlik buraxılış siyahısı

- TLS/HSTS, təhlükəsiz cookie, CSRF/origin yoxlaması və CORS production origin ilə sınanır.
- Admin URL-i `noindex`; sitemap yalnız public published kontenti ehtiva edir.
- Vendor hesabı ilə başqa vendor ID-lərinə sorğu testləri mütləq aparılır.
- Refund, ödəniş provider webhook-u, e-poçt/SMS və obyekt storage adapterləri real provider seçilmədən aktiv hesab edilmir.
