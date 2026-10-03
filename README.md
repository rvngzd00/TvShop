# TVShop platforması

TVShop mövcud Home 6 vizual sistemini qoruyan, video-first məhsul kəşfi, canlı yayım və store/vendor scope-lu Node.js commerce/CMS platformasıdır.

## Struktur

- `frontend/` — təmizlənmiş statik Home 6, lokal assetlər, SEO və CMS fallback bağlantısı
- `backend/src/` — Fastify API, auth/RBAC, katalog, inventar, sifariş, kontent, SEO, kampaniya, QR/loyalty
- `backend/admin/` — super admin, işçi və vendor rollarına görə menyusu dəyişən responsiv panel
- `backend/migrations/` — PostgreSQL 15+ sxemi; production compose PostgreSQL 18 istifadə edir
- `docs/` — tələblər, arxitektura və əməliyyat runbook-u

## Lokal başlatma

Node.js 24+, npm 11+ və PostgreSQL 15+ tələb olunur.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- sayt: `http://127.0.0.1:3000/`
- panel: `http://127.0.0.1:3000/admin/`
- API sənədi: `http://127.0.0.1:3000/documentation`
- hazırlıq: `http://127.0.0.1:3000/api/v1/ready`

Əsas işlək səhifələr: `/magaza/`, `/mehsul/:slug/`, `/endirimler/`, `/kampaniyalar/`, `/jurnal/`, `/jurnal/:slug/`, `/elanlar/`, `/baki-club/`, `/biznes/` və `/sebet/`. Mağaza, jurnal və elan səhifələri CMS/PostgreSQL məlumatından server tərəfində render olunur; səbət sifariş endpoint-inə bağlıdır.

Frontend ayrıca `npm run dev:frontend` ilə açıla bilər; həmin server `/api/`
sorğularını real lokal backend-ə ötürür və production məlumat xətalarını mock-la gizlətmir.

## Video commerce və TV sahəsi

- Məhsul redaktorunda MP4/WEBM faylı yükləmək və ya birbaşa HTTPS video URL-i saxlamaq mümkündür. Video olmayan məhsullar əvvəlki şəkil davranışını saxlayır.
- Məhsul kartları videonu viewport-a yaxınlaşanda yükləyir; `prefers-reduced-motion` aktiv olduqda avtomatik oynatma edilmir.
- Admin panelində `Məzmun → TV / Yayım` bölməsindən YouTube, TikTok və Instagram URL-ləri, başlıq, sıra və aktivlik idarə olunur.
- `YOUTUBE_API_KEY` və kanal ID-si olduqda Canlı Yayım statusu YouTube Data API ilə server tərəfində, keşlənərək yoxlanır. Açar olmadıqda səhifə `unavailable` vəziyyətini təhlükəsiz göstərir.

Yeni quraşdırmada `npm run db:migrate` video commerce və inventar tarixçəsini qoruyan migrasiyaları da tətbiq edir. Mövcud quraşdırmada migrasiyaları deploy-dan əvvəl tətbiq edin.

Video-only demo kataloqunu yenidən yaratmaq üçün `npm run db:seed-video-products` işlədilə bilər. Bu destruktiv demo əmri cari TVShop mağazasının bütün məhsullarını silir, inventar hərəkətlərinin snapshot tarixçəsini qoruyur və 10 lokal MP4 məhsul əlavə edir.

Canlı yayımı aktivləşdirmək üçün Google Cloud-da YouTube Data API v3-ü aktiv edin, server üçün məhdudlaşdırılmış API açarı yaradıb `.env` faylında `YOUTUBE_API_KEY` kimi saxlayın, tətbiqi restart edin və admin panelində `Məzmun → TV / Yayım` bölməsinə kanalın `UC...` ID-sini daxil edin. API açarını frontend dəyişəninə çevirməyin.

## Yoxlama

```bash
npm run lint
npm run build
npm test
npm run test:routes # lokal server işləyərkən bütün daxili linkləri yoxlayır
```

Production qaydaları üçün [docs/OPERATIONS.md](docs/OPERATIONS.md), biznes tələbləri üçün [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) və texniki qərarlar üçün [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) sənədlərinə baxın.
