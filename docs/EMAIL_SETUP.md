# TVShop e-poçt sisteminin production sazlanması

Backend qeydiyyat salamlama məktublarını, satıcı müraciəti məktublarını,
idarəetmə dəvətlərini və birdəfəlik şifrə-bərpa keçidlərini Resend vasitəsilə
göndərir. E-poçt açarları yalnız backend mühitində saxlanılmalıdır.

## 1. Göndərən domeni təsdiqləyin

1. Resend hesabında `gundelikbaki.az` domenini əlavə edin.
2. Resend panelinin verdiyi DKIM və SPF DNS qeydlərini domenin DNS panelinə
   olduğu kimi daxil edin.
3. Domen statusu `Verified` olana qədər gözləyin.
4. Çatdırılma keyfiyyəti üçün `_dmarc.gundelikbaki.az` ünvanında əvvəlcə hesabat
   rejimli DMARC qeydi yaradın; real trafik yoxlandıqdan sonra siyasəti
   sərtləşdirin.

DNS dəyərlərini bu repoya yazmayın: onlar Resend hesabında yaradılır və həmin
paneldə göstərilən dəyərlər əsas götürülməlidir.

## 2. Production environment dəyişənlərini verin

Deployment platformasının secret/environment bölməsinə bunları əlavə edin:

```dotenv
NODE_ENV=production
PUBLIC_ORIGIN=https://gundelikbaki.az
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
EMAIL_FROM=TVShop <noreply@gundelikbaki.az>
EMAIL_REPLY_TO=support@gundelikbaki.az
EMAIL_TIMEOUT_MS=10000
```

- `RESEND_API_KEY` yalnız göndərmə icazəli ayrıca production açarı olmalıdır.
- `EMAIL_FROM` təsdiqlənmiş domenə aid olmalıdır.
- `PUBLIC_ORIGIN` düzgün HTTPS domeni olmalıdır; şifrə-bərpa keçidləri bununla
  yaradılır.
- Secret-i `.env.example`, frontend JavaScript-i və ya git tarixçəsinə yazmayın.

Production rejimində provider və ya API açarı yoxdursa backend qəsdən start
olmur. Bu, səssiz şəkildə e-poçtsuz işləyən deployment-in qarşısını alır.

## 3. Migration və restart

Deployment zamanı, tətbiq başlamazdan əvvəl:

```sh
npm run db:migrate
npm run build
npm --workspace backend run start
```

Migration runner bütün gözləyən sxem dəyişikliklərini, o cümlədən TV/video
dəstəyi verən `029_tvshop_video_commerce.sql` faylını tətbiq edir.

## 4. Buraxılışdan əvvəl yoxlama

Test üçün real, nəzarət etdiyiniz e-poçt ünvanından istifadə edin:

1. Adi istifadəçi qeydiyyatı edin və salamlama məktubunu yoxlayın.
2. Satıcı qeydiyyatı edin və satıcı kabineti məktubunu yoxlayın.
3. `/sifre-berpasi/` səhifəsində həmin ünvanı daxil edin.
4. Məktubdakı keçidin `/sifre-yenile/?token=...` ünvanına gəldiyini, bir saat
   ərzində işlədiyini və ikinci istifadədə rədd edildiyini yoxlayın.
5. `From`, `Reply-To`, mobil görünüş, spam qovluğu və Resend delivery logunu
   yoxlayın.

Development rejimində `EMAIL_PROVIDER=disabled` olduqda internetə real məktub
göndərilmir. Məktublar avtomatik test outbox-ına yazılır və inteqrasiya testləri
şablonların yarandığını yoxlayır. Real lokal göndəriş üçün development `.env`
faylında da `EMAIL_PROVIDER=resend` və test API açarı istifadə edilə bilər.

## 5. Giriş kilidinin idarəsi

Ardıcıl 10 yanlış şifrədən sonra hesab daimi bloklanır, bütün aktiv sessiyaları
ləğv edilir və şifrə-bərpa keçidi kilidi açmır. Admin panelində
`İstifadəçilər` və ya `Satıcılar` bölməsində `Giriş bloklanıb` nişanı görünür.
Səlahiyyətli admin `Kilidi aç` düyməsi ilə sayğacı sıfırlayır; əməliyyat audit
logunda `user.login.unlock` kimi qeydə alınır.
