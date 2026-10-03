import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';

process.env['LOG_LEVEL'] ||= 'silent';
process.env['DEFAULT_STORE_CODE'] = 'daily-baku';
process.env['ALLOWED_ORIGINS'] ||= 'https://www.tvshop.az';

after(async () => {
  const { closePool } = await import('./db/pool.js');
  await closePool();
});

test('admin və statik frontend faylları ümumi API rate limitinə düşmür', async () => {
  const { buildApp } = await import('./app.js');
  const app = await buildApp();

  try {
    const adminRedirect = await app.inject({ method: 'GET', url: '/admin' });
    assert.equal(adminRedirect.statusCode, 308);
    assert.equal(adminRedirect.headers.location, '/admin/');

    const admin = await app.inject({ method: 'GET', url: '/admin/' });
    assert.equal(admin.statusCode, 200);
    assert.match(admin.headers['content-type'] ?? '', /^text\/html/);
    const adminIndexBypass = await app.inject({ method: 'GET', url: '/admin/index.html' });
    assert.equal(adminIndexBypass.statusCode, 308);
    assert.equal(adminIndexBypass.headers.location, '/admin/');
    const adminScript = await app.inject({ method: 'GET', url: '/admin/admin.js' });
    assert.equal(adminScript.statusCode, 200);
    assert.match(adminScript.body, /\['seller-users', '♙', 'Satıcılar', 'users\.read'\]/);
    assert.match(adminScript.body, /accountType: 'vendor'/);
    assert.match(adminScript.body, /adminPortalRoles/);
    assert.match(adminScript.body, /location\.replace\('\/satici-paneli\/'\)/);

    const acceptedWwwOrigin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { origin: 'https://www.tvshop.az' },
      payload: { email: 'origin-check@example.test' }
    });
    assert.equal(acceptedWwwOrigin.statusCode, 200);
    assert.equal(acceptedWwwOrigin.headers['access-control-allow-origin'], 'https://www.tvshop.az');

    const rejectedOrigin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { origin: 'https://untrusted.example' },
      payload: { email: 'origin-check@example.test' }
    });
    assert.equal(rejectedOrigin.statusCode, 403);
    assert.equal(rejectedOrigin.json().error.code, 'ORIGIN_REJECTED');

    for (let index = 0; index < 320; index += 1) {
      const asset = await app.inject({ method: 'GET', url: '/assets/css/kirki-styles.css' });
      assert.equal(asset.statusCode, 200);
      assert.match(asset.headers['content-type'] ?? '', /^text\/css/);
    }
  } finally {
    await app.close();
  }
});

test('WordPress compatibility endpoint URL-encoded sorğunu qəbul edir', async () => {
  const { buildApp } = await import('./app.js');
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/wp-compat?wc-ajax=get_refreshed_fragments',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'action=get_refreshed_fragments'
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { success: true, data: [], fragments: {} });
  } finally {
    await app.close();
  }
});

test('public web səhifələri HTML və canonical metadata ilə render olunur', async () => {
  const { buildApp } = await import('./app.js');
  const app = await buildApp();

  try {
    const home = await app.inject({ method: 'GET', url: '/' });
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /<title>TVShop/);
    assert.match(home.body, /property="og:site_name" content="TVShop"/);
    assert.match(home.body, /"@type":"WebSite","name":"TVShop"/);
    assert.match(home.body, /data-tv-area/);
    assert.match(home.body, /Copyright © 2026 TVShop/);
    assert.match(home.body, /TVShop Panorama Reklam MMC-nin satış platformasıdır/);
    assert.match(home.body, /VÖEN 2007614681/);
    assert.match(home.body, /tel:\+994502645400/);
    assert.match(home.body, /assets\/brand\/tvshop\.webp/);
    assert.doesNotMatch(home.body, /assets\/brand\/gundelik-baki-logo-white\.png/);
    assert.doesNotMatch(home.body, />Elan yerləşdir<\//);
    assert.match(home.body, /Cəfər Cabbarlı 33, AZ1065, Bakı\/Azərbaycan/);
    assert.doesNotMatch(home.body, /Bakı şəhəri, Azərbaycan/);
    assert.doesNotMatch(home.body, /37499833889|tel:55555555/);
    for (const profile of [
      /instagram\.com\/gundelikbaki\.az/,
      /facebook\.com\/share\/1DH8hF28DT/,
      /x\.com\/GundelikBaki/,
      /tiktok\.com\/@gundelikbaki\.az/,
      /linkedin\.com\/company\/gundelikbaki/
    ]) assert.match(home.body, profile);

    const homeApi = await app.inject({ method: 'GET', url: '/api/v1/public/home' });
    assert.equal(homeApi.statusCode, 200);
    const readiness = await app.inject({ method: 'GET', url: '/api/v1/ready' });
    assert.equal(readiness.statusCode, 200);
    assert.deepEqual(readiness.json(), { status: 'ready', store: 'daily-baku' });
    assert.ok(Array.isArray(homeApi.json().data.products));
    assert.ok(Array.isArray(homeApi.json().data.categories));
    assert.ok(Array.isArray(homeApi.json().data.brands));
    assert.ok(homeApi.json().data.products.every((item: { review_count: number; category_slugs: string[] }) => Number.isInteger(item.review_count) && Array.isArray(item.category_slugs)));
    assert.ok(homeApi.json().data.products.every((item: object) => Object.hasOwn(item, 'video_url')));
    const tvApi = await app.inject({ method: 'GET', url: '/api/v1/public/tv' });
    assert.equal(tvApi.statusCode, 200);
    assert.ok(['live', 'offline', 'unavailable'].includes(tvApi.json().data.live.status));
    assert.ok(Array.isArray(tvApi.json().data.items));
    const topPickSlugs = ['elektronika', 'ev-metbex', 'moda', 'gozellik-saglamliq'];
    const topPickSets = topPickSlugs.map((slug) => homeApi.json().data.products
      .filter((item: { category_slugs: string[] }) => item.category_slugs.includes(slug))
      .map((item: { id: string }) => item.id));
    assert.ok(topPickSets.every((items) => items.length > 0));
    assert.equal(new Set(topPickSets.map((items) => items.join(','))).size, topPickSets.length);
    assert.ok(homeApi.json().data.categories.some((item: { path_slugs: string[] }) =>
      item.path_slugs?.join('/') === 'elektronika/elektronika-pesekar-aletler/simsiz-elektrik-aletleri'));
    assert.ok(Array.isArray(homeApi.json().data.serviceCategories));
    assert.ok(homeApi.json().data.serviceCategories.some((item: { depth: number }) => Number(item.depth) === 2));
    const serviceLeaf=homeApi.json().data.serviceCategories.find((item: { depth: number; path_slugs: string[] }) => Number(item.depth) === 2);
    assert.ok(serviceLeaf?.path_slugs?.length===3);
    const servicePage=await app.inject({method:'GET',url:`/elanlar/xidmetler/${serviceLeaf.path_slugs.join('/')}/`});
    assert.equal(servicePage.statusCode,200,servicePage.body);
    assert.match(servicePage.body,/XİDMƏT KATEQORİYALARI/);

    const page = await app.inject({ method: 'GET', url: '/baki-club/' });
    assert.equal(page.statusCode, 200);
    assert.match(page.headers['content-type'] ?? '', /^text\/html/);
    assert.match(page.body, /<h1>Bakı Club/);
    assert.match(page.body, /property="og:site_name" content="TVShop"/);
    assert.match(page.body, /"@type":"WebSite","name":"TVShop"/);
    assert.match(page.body, /Copyright © 2026 TVShop/);
    assert.match(page.body, /TVShop Panorama Reklam MMC-nin satış platformasıdır/);
    assert.match(page.body, /VÖEN 2007614681/);
    assert.match(page.body, /tel:\+994502645400/);
    assert.match(page.body, /assets\/brand\/tvshop\.webp/);
    assert.match(page.body, /Cəfər Cabbarlı 33, AZ1065, Bakı\/Azərbaycan/);
    for (const profile of [
      /instagram\.com\/gundelikbaki\.az/,
      /facebook\.com\/share\/1DH8hF28DT/,
      /x\.com\/GundelikBaki/,
      /tiktok\.com\/@gundelikbaki\.az/,
      /linkedin\.com\/company\/gundelikbaki/
    ]) assert.match(page.body, profile);
    assert.match(page.body, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:3000\/baki-club\/">/);
    assert.match(page.body, /class="page-category-list"/);
    assert.match(page.body, /href="\/baki-club\/xal-qazanma\/"/);
    assert.match(page.body, /class="page-submenu"/);
    assert.doesNotMatch(page.body, />Ana səhifə<\/a><\/li>/);

    const protectedBusiness = await app.inject({ method: 'GET', url: '/biznes/reklam-ver/' });
    assert.equal(protectedBusiness.statusCode, 200);
    assert.match(protectedBusiness.headers['cache-control'] ?? '', /no-store/);
    assert.match(protectedBusiness.body, /Satıcı hesabı tələb olunur/);
    assert.match(protectedBusiness.body, /href="\/satici-girisi\/"/);
    assert.match(protectedBusiness.body, /href="\/satici-qeydiyyati\/"/);
    assert.doesNotMatch(protectedBusiness.body, /Auditoriyanıza uyğun reklam/);

    const redirect = await app.inject({ method: 'GET', url: '/baki-club' });
    assert.equal(redirect.statusCode, 308);
    assert.equal(redirect.headers.location, '/baki-club/');

    const child = await app.inject({ method: 'GET', url: '/baki-club/xal-qazanma/' });
    assert.equal(child.statusCode, 200);
    assert.match(child.body, /<h1>Xal Qazanma<\/h1>/);
    assert.match(child.body, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:3000\/baki-club\/xal-qazanma\/">/);
    assert.match(child.body, /href="\/baki-club\/xal-qazanma\/" aria-current="page"/);
    assert.match(child.body, /"@type":"BreadcrumbList"/);

    const childRedirect = await app.inject({ method: 'GET', url: '/baki-club/xal-qazanma' });
    assert.equal(childRedirect.statusCode, 308);
    assert.equal(childRedirect.headers.location, '/baki-club/xal-qazanma/');

    const unknownChild = await app.inject({ method: 'GET', url: '/baki-club/movcud-deyil/' });
    assert.equal(unknownChild.statusCode, 404);
    assert.match(unknownChild.headers['content-type'] ?? '', /^text\/html/);
    assert.match(unknownChild.body, /<title>Səhifə tapılmadı — TVShop<\/title>/);
    assert.match(unknownChild.body, /name="robots" content="noindex,follow"/);
    assert.match(unknownChild.body, /class="db-not-found-visual"/);
    assert.match(unknownChild.body, /Ana səhifəyə qayıt/);

    const missingApi = await app.inject({ method: 'GET', url: '/api/v1/movcud-deyil' });
    assert.equal(missingApi.statusCode, 404);
    assert.equal(missingApi.json().error.code, 'NOT_FOUND');

    const discounts = await app.inject({ method: 'GET', url: '/endirimler/' });
    assert.equal(discounts.statusCode, 200);
    assert.match(discounts.body, /<h1>Endirimlər<\/h1>/);
    assert.doesNotMatch(discounts.body, /<div class="page-coupon-grid">/);

    const coupons = await app.inject({ method: 'GET', url: '/kuponlar/' });
    assert.equal(coupons.statusCode, 200);
    assert.match(coupons.body, /<h1>Kuponlar<\/h1>/);
    assert.match(coupons.body, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:3000\/kuponlar\/">/);

    const gifts = await app.inject({ method: 'GET', url: '/magaza/hediyyeler/' });
    assert.equal(gifts.statusCode, 200);
    assert.match(gifts.body, /<h1>Hədiyyələr<\/h1>/);
    assert.match(gifts.body, /href="\/magaza\/hediyyeler\/" aria-current="page"/);
    assert.match(gifts.body, /class="db-product-card"/);

    const electronics = await app.inject({ method: 'GET', url: '/magaza/elektronika/' });
    assert.equal(electronics.statusCode, 200);
    assert.match(electronics.body, /<h1>Elektronika<\/h1>/);
    assert.doesNotMatch(electronics.body, /<h2[^>]*>[^<]*Elektronika/i);
    assert.doesNotMatch(electronics.body, /SEÇİLMİŞ MƏHSULLAR|Ana və alt kateqoriyalar|KATEQORİYALAR/);
    assert.match(electronics.body, /class="page-category-explorer"/);
    assert.match(electronics.body, /Peşəkar alətlər/);
    assert.match(electronics.body, /href="\/magaza\/elektronika\/elektronika-pesekar-aletler\/simsiz-elektrik-aletleri\/"/);
    assert.match(electronics.body, /src="\/assets\/js\/catalog-navigation\.js\?v=20260823-2"/);
    assert.match(electronics.body, /data-page-menu-panel="store" hidden inert/);
    assert.match(electronics.body, /data-page-menu-panel="navigation"/);
    assert.match(electronics.body, /aria-controls="page-menu-panel-navigation"/);
    assert.match(electronics.body, /aria-controls="page-menu-panel-store"/);
    assert.doesNotMatch(electronics.body, />Elan yerləşdir<\//);

    const emptySubcategory = await app.inject({ method: 'GET', url: '/magaza/usaq/korpe-baximi/korpe-geyimi/' });
    assert.equal(emptySubcategory.statusCode, 200);
    assert.match(emptySubcategory.body, /<h1>Körpə geyimi<\/h1>/);
    assert.doesNotMatch(emptySubcategory.body, /<h2[^>]*>(?:Digər alt kateqoriyalar|SEÇİLMİŞ MƏHSULLAR)<\/h2>/);
    assert.match(emptySubcategory.body, /Bu kateqoriyada məhsul yoxdur/);

    const sitemap = await app.inject({ method: 'GET', url: '/api/v1/public/sitemap.xml' });
    assert.equal(sitemap.statusCode, 200);
    assert.match(sitemap.body, /\/magaza\/elektronika\/elektronika-pesekar-aletler\/simsiz-elektrik-aletleri\//);

    const search = await app.inject({ method: 'GET', url: '/api/v1/public/search?q=smart&limit=5' });
    assert.equal(search.statusCode, 200);
    const searchBody = search.json();
    assert.ok(Array.isArray(searchBody.data.products));
    assert.ok(searchBody.data.products.length <= 5);
    assert.equal(searchBody.meta.query, 'smart');

    const productSlug = searchBody.data.products[0]?.slug;
    assert.ok(productSlug);
    const product = await app.inject({ method: 'GET', url: `/mehsul/${productSlug}/` });
    assert.equal(product.statusCode, 200);
    assert.match(product.body, /data-product-page/);
    assert.match(product.body, /class="db-product-mobile-nav"/);
    assert.match(product.body, /id="product-additional-information"/);
    assert.match(product.body, /id="related-products"/);
    assert.match(product.body, /data-product-sticky-buy/);
    assert.match(product.body, /data-review-form/);
    assert.match(product.body, /data-product-copy-sku/);
    assert.match(product.body, /<dt>Məhsul kodu:<\/dt>/);
    assert.match(product.body, /data-product-summary-extra hidden aria-hidden="true"/);
    assert.match(product.body, /data-product-details aria-expanded="false" aria-controls="product-summary-information"/);
    assert.doesNotMatch(product.body, /data-product-compare/);
    assert.match(product.body, /https:\/\/wa\.me\/994502645400/);
    assert.doesNotMatch(product.body, /37499833889/);
    assert.match(product.body, /src="\/assets\/js\/product\.js\?v=20260816-2"/);
    assert.match(product.body, /src="\/assets\/js\/mobile-panels\.js"/);

    const authorName = `Codex test ${Date.now()}`;
    const createdReview = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/products/${productSlug}/reviews`,
      payload: {
        rating: 5,
        authorName,
        email: '',
        title: 'Test rəyi',
        body: 'Məhsul rəy sisteminin işləməsini yoxlayan avtomatik test rəyidir.'
      }
    });
    assert.equal(createdReview.statusCode, 200);
    const reviewBody = createdReview.json();
    assert.equal(reviewBody.data.review.author_name, authorName);
    assert.equal(reviewBody.data.review.rating, 5);
    assert.ok(reviewBody.data.summary.count >= 1);

    const reviews = await app.inject({ method: 'GET', url: `/api/v1/public/products/${productSlug}/reviews` });
    assert.equal(reviews.statusCode, 200);
    assert.ok(reviews.json().data.reviews.some((review: { id: string }) => review.id === reviewBody.data.review.id));

    const customerCookie = String(createdReview.headers['set-cookie']).split(';', 1)[0];
    const updatedReview = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/products/${productSlug}/reviews`,
      headers: { cookie: customerCookie },
      payload: {
        rating: 4,
        authorName,
        email: '',
        title: 'Yenilənmiş test rəyi',
        body: 'Eyni müştərinin rəyi təkrar yaranmadan uğurla yenilənməlidir.'
      }
    });
    assert.equal(updatedReview.statusCode, 200);
    assert.equal(updatedReview.json().data.review.id, reviewBody.data.review.id);
    assert.equal(updatedReview.json().data.review.rating, 4);
    const { pool } = await import('./db/pool.js');
    await pool.query('DELETE FROM product_reviews WHERE id=$1', [reviewBody.data.review.id]);

    const searchPage = await app.inject({ method: 'GET', url: '/magaza/?axtaris=smart' });
    assert.equal(searchPage.statusCode, 200);
    assert.match(searchPage.body, /“smart” üçün nəticələr/);
    assert.match(searchPage.body, /name="robots" content="noindex,follow"/);
    const originFilter = await app.inject({ method: 'GET', url: '/magaza/?mense=united-states' });
    assert.equal(originFilter.statusCode, 200);
    assert.match(originFilter.body, /data-page="magaza"/);
  } finally {
    await app.close();
  }
});

test('rəy limiti müştəri sessiyalarını bir-birindən ayırır', async () => {
  const { buildApp } = await import('./app.js');
  const { pool } = await import('./db/pool.js');
  const app = await buildApp();
  const reviewIds = new Set<string>();

  try {
    const search = await app.inject({ method: 'GET', url: '/api/v1/public/search?q=smart&limit=1' });
    const productSlug = search.json().data.products[0]?.slug;
    assert.ok(productSlug);

    const sessionA = await app.inject({ method: 'GET', url: '/api/v1/customer/state' });
    const sessionB = await app.inject({ method: 'GET', url: '/api/v1/customer/state' });
    const cookieA = String(sessionA.headers['set-cookie']).split(';', 1)[0];
    const cookieB = String(sessionB.headers['set-cookie']).split(';', 1)[0];
    assert.notEqual(cookieA, cookieB);

    const payload = {
      rating: 5,
      authorName: 'Limit testi A',
      email: '',
      title: 'Sessiya limiti',
      body: 'Rəy limitinin ayrı müştəri sessiyası üzrə işləməsini yoxlayan testdir.'
    };

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/customer/products/${productSlug}/reviews`,
        headers: { cookie: cookieA },
        payload
      });
      assert.equal(response.statusCode, 200);
      reviewIds.add(response.json().data.review.id);
    }

    const limited = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/products/${productSlug}/reviews`,
      headers: { cookie: cookieA },
      payload
    });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error.code, 'REVIEW_RATE_LIMITED');
    assert.match(limited.json().error.message, /Ardıcıl çox sayda rəy/);

    const otherCustomer = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/products/${productSlug}/reviews`,
      headers: { cookie: cookieB },
      payload: { ...payload, authorName: 'Limit testi B' }
    });
    assert.equal(otherCustomer.statusCode, 200);
    reviewIds.add(otherCustomer.json().data.review.id);
  } finally {
    if (reviewIds.size) {
      await pool.query('DELETE FROM product_reviews WHERE id=ANY($1::uuid[])', [[...reviewIds]]);
    }
    await app.close();
  }
});

test('customer account səhifələri və anonim state API-si işləyir', async () => {
  const { buildApp } = await import('./app.js');
  const app = await buildApp();

  try {
    const account = await app.inject({ method: 'GET', url: '/hesabim/secilmisler/' });
    assert.equal(account.statusCode, 200);
    assert.equal(account.headers['cache-control'], 'private, no-store');
    assert.match(account.body, /data-account-wishlist/);
    assert.match(account.body, /href="\/hesabim\/sifarisler\/"/);
    assert.match(account.body, /src="\/assets\/js\/commerce\.js"/);
    assert.match(account.body, /data-wishlist-count/);
    assert.match(account.body, />Ana səhifə<\/a>/);
    assert.match(account.body, />Seçilmişlər<\/a>/);
    assert.doesNotMatch(account.body, />History</);
    assert.doesNotMatch(account.body, /href="\/hesabim\/tarixce\/"/);

    const details = await app.inject({ method: 'GET', url: '/hesabim/hesab-melumatlari/' });
    assert.equal(details.statusCode, 200);
    assert.match(details.body, /data-account-profile-form/);
    assert.match(details.body, /data-account-password-form/);
    assert.match(details.body, /Profil məlumatlarını yadda saxla/);
    assert.match(details.body, /Şifrəni yenilə/);

    const removedHistory = await app.inject({ method: 'GET', url: '/hesabim/tarixce/' });
    assert.equal(removedHistory.statusCode, 302);
    assert.equal(removedHistory.headers.location, '/hesabim/sifarisler/');

    const cartPage = await app.inject({ method: 'GET', url: '/sebet/' });
    assert.equal(cartPage.statusCode, 200);
    assert.match(cartPage.body, /data-cart-page/);
    assert.match(cartPage.body, /data-mini-cart-toggle/);
    assert.match(cartPage.body, />Səbət<\/span>/);

    const state = await app.inject({ method: 'GET', url: '/api/v1/customer/state' });
    assert.equal(state.statusCode, 200);
    assert.match(state.headers['cache-control'] ?? '', /no-store/);
    assert.ok(state.headers['set-cookie']);
    const body = state.json();
    assert.ok(Array.isArray(body.data.cart));
    assert.ok(Array.isArray(body.data.wishlist));
    assert.ok(Array.isArray(body.data.orders));
  } finally {
    await app.close();
  }
});

test('şifrə bərpası tokeni birdəfəlik işləyir və yeni sessiya yaradır', async () => {
  const { buildApp } = await import('./app.js');
  const { pool } = await import('./db/pool.js');
  const { hashPassword } = await import('./core/password.js');
  const { clearDevelopmentEmailOutbox, getDevelopmentEmailOutbox } = await import('./core/email.js');
  clearDevelopmentEmailOutbox();
  const app = await buildApp();
  const suffix=randomUUID().slice(0,8);const email=`password-audit-${suffix}@example.test`;const oldPassword='OldPassword!2026';const newPassword='NewPassword!2026';let userId='';
  try {
    const created=await pool.query<{id:string}>(`INSERT INTO users(email,password_hash,first_name,last_name,status,email_verified_at) VALUES($1,$2,'Şifrə','Auditi','active',now()) RETURNING id`,[email,await hashPassword(oldPassword)]);userId=created.rows[0]!.id;
    await pool.query(`INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='customer'`,[userId]);
    const forgot=await app.inject({method:'POST',url:'/api/v1/auth/forgot-password',payload:{email}});assert.equal(forgot.statusCode,200);assert.deepEqual(forgot.json().data,{accepted:true});
    const resetMessage=getDevelopmentEmailOutbox().find((message)=>message.to===email&&/şifrənizi yeniləyin/i.test(message.subject)&&/HESAB TƏHLÜKƏSİZLİYİ/.test(message.html));assert.ok(resetMessage);
    const resetUrl=resetMessage.text?.match(/https?:\/\/\S+/)?.[0];assert.ok(resetUrl);
    const token=new URL(resetUrl).searchParams.get('token');assert.ok(token);
    const valid=await app.inject({method:'GET',url:`/api/v1/auth/action-token/${encodeURIComponent(token!)}`});assert.equal(valid.statusCode,200);assert.equal(valid.json().data.type,'password_reset');
    const reset=await app.inject({method:'POST',url:'/api/v1/auth/reset-password',payload:{token,password:newPassword}});assert.equal(reset.statusCode,200);assert.ok(reset.headers['set-cookie']);
    const reused=await app.inject({method:'POST',url:'/api/v1/auth/reset-password',payload:{token,password:'AnotherPassword!2026'}});assert.equal(reused.statusCode,404);assert.equal(reused.json().error.code,'TOKEN_INVALID');
    const oldLogin=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{email,password:oldPassword}});assert.equal(oldLogin.statusCode,401);
    const newLogin=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{email,password:newPassword}});assert.equal(newLogin.statusCode,200);
  } finally {
    if(userId)await pool.query('DELETE FROM users WHERE id=$1',[userId]);
    await app.close();
  }
});

test('10 yanlış şifrə cəhdi hesabı daimi bloklayır və kilidi yalnız admin açır', async () => {
  const { buildApp } = await import('./app.js');
  const { pool } = await import('./db/pool.js');
  const { hashPassword } = await import('./core/password.js');
  const { env } = await import('./config/env.js');
  const { clearDevelopmentEmailOutbox, getDevelopmentEmailOutbox } = await import('./core/email.js');
  clearDevelopmentEmailOutbox();
  const app = await buildApp();
  const suffix = randomUUID().slice(0, 8);
  const userEmail = `login-lock-${suffix}@example.test`;
  const adminEmail = `login-unlock-admin-${suffix}@example.test`;
  const userPassword = 'LoginLockUser!2026';
  const adminPassword = 'LoginUnlockAdmin!2026';
  const userIds: string[] = [];

  const cookieJar = (response: { headers: Record<string, string | string[] | number | undefined> }) => {
    const jar: Record<string, string> = {};
    const raw = response.headers['set-cookie'];
    for (const item of Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []) {
      const pair = item.split(';', 1)[0]!;
      const separator = pair.indexOf('=');
      if (separator > 0) jar[pair.slice(0, separator)] = pair.slice(separator + 1);
    }
    return jar;
  };
  const authHeaders = (jar: Record<string, string>) => {
    const headers: Record<string, string> = { cookie: Object.entries(jar).map(([key, value]) => `${key}=${value}`).join('; ') };
    const csrf = jar['db_csrf'] || jar['__Host-db_csrf'];
    if (csrf) headers['x-csrf-token'] = csrf;
    return headers;
  };

  try {
    const store = await pool.query<{ id: string }>('SELECT id FROM stores WHERE code=$1', [env.DEFAULT_STORE_CODE]);
    assert.ok(store.rows[0]);
    const createdUser = await pool.query<{ id: string }>(`
      INSERT INTO users(email,password_hash,first_name,last_name,status,email_verified_at)
      VALUES($1,$2,'Giriş','Kilidi','active',now()) RETURNING id
    `, [userEmail, await hashPassword(userPassword)]);
    const userId = createdUser.rows[0]!.id;
    userIds.push(userId);
    await pool.query(`INSERT INTO user_roles(user_id,role_id,store_id) SELECT $1,id,$2 FROM roles WHERE code='customer'`, [userId, store.rows[0]!.id]);

    const createdAdmin = await pool.query<{ id: string }>(`
      INSERT INTO users(email,password_hash,first_name,last_name,status,email_verified_at)
      VALUES($1,$2,'Kilid','Admini','active',now()) RETURNING id
    `, [adminEmail, await hashPassword(adminPassword)]);
    const adminId = createdAdmin.rows[0]!.id;
    userIds.push(adminId);
    await pool.query(`INSERT INTO user_roles(user_id,role_id,store_id) SELECT $1,id,$2 FROM roles WHERE code='admin'`, [adminId, store.rows[0]!.id]);

    const activeSession = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: userEmail, password: userPassword } });
    assert.equal(activeSession.statusCode, 200, activeSession.body);
    const activeJar = cookieJar(activeSession);

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const endpoint = attempt <= 5 ? '/api/v1/auth/login' : '/api/v1/auth/vendor-login';
      const failed = await app.inject({ method: 'POST', url: endpoint, payload: { email: userEmail, password: 'TamamiləYanlış!2026' } });
      assert.equal(failed.statusCode, attempt === 10 ? 423 : 401, `attempt ${attempt}: ${failed.body}`);
      if (attempt === 10) assert.equal(failed.json().error.code, 'ACCOUNT_LOGIN_BLOCKED');
    }

    const blockedRow = await pool.query<{ failed_login_count: number; login_blocked_at: Date | null }>('SELECT failed_login_count,login_blocked_at FROM users WHERE id=$1', [userId]);
    assert.equal(blockedRow.rows[0]!.failed_login_count, 10);
    assert.ok(blockedRow.rows[0]!.login_blocked_at);
    const revokedSession = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: authHeaders(activeJar) });
    assert.equal(revokedSession.statusCode, 401);
    const blockedLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: userEmail, password: userPassword } });
    assert.equal(blockedLogin.statusCode, 423);
    assert.equal(blockedLogin.json().error.code, 'ACCOUNT_LOGIN_BLOCKED');

    const forgot = await app.inject({ method: 'POST', url: '/api/v1/auth/forgot-password', payload: { email: userEmail } });
    assert.equal(forgot.statusCode, 200);
    assert.deepEqual(forgot.json().data, { accepted: true });
    const resetMessage = getDevelopmentEmailOutbox().find((message) => message.to === userEmail && /şifrənizi yeniləyin/i.test(message.subject));
    const resetUrl = resetMessage?.text?.match(/https?:\/\/\S+/)?.[0];
    assert.ok(resetUrl);
    const resetToken = new URL(resetUrl).searchParams.get('token');
    assert.ok(resetToken);
    const blockedReset = await app.inject({ method: 'POST', url: '/api/v1/auth/reset-password', payload: { token: resetToken, password: 'ResetCannotUnlock!2026' } });
    assert.equal(blockedReset.statusCode, 423);
    assert.equal(blockedReset.json().error.code, 'ACCOUNT_LOGIN_BLOCKED');

    const adminLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: adminEmail, password: adminPassword } });
    assert.equal(adminLogin.statusCode, 200, adminLogin.body);
    const adminJar = cookieJar(adminLogin);
    const detail = await app.inject({ method: 'GET', url: `/api/v1/users/${userId}`, headers: authHeaders(adminJar) });
    assert.equal(detail.statusCode, 200, detail.body);
    assert.ok(detail.json().data.login_blocked_at);
    assert.equal(detail.json().data.failed_login_count, 10);

    const unlocked = await app.inject({ method: 'POST', url: `/api/v1/users/${userId}/unlock`, headers: authHeaders(adminJar) });
    assert.equal(unlocked.statusCode, 200, unlocked.body);
    assert.equal(unlocked.json().data.login_blocked_at, null);
    assert.equal(unlocked.json().data.failed_login_count, 0);
    const restoredLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: userEmail, password: userPassword } });
    assert.equal(restoredLogin.statusCode, 200, restoredLogin.body);
    const audit = await pool.query(`SELECT id FROM audit_logs WHERE action='user.login.unlock' AND entity_id=$1`, [userId]);
    assert.ok(audit.rows[0]);
  } finally {
    if (userIds.length) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
    await app.close();
  }
});

test('checkout quote, kupon, ödəniş üsulu və müştəri ləğvi stokla birlikdə işləyir', async () => {
  const { buildApp } = await import('./app.js');
  const { pool } = await import('./db/pool.js');
  const { env } = await import('./config/env.js');
  const app=await buildApp();const suffix=randomUUID().slice(0,8);const couponCode=`T${suffix.slice(0,7)}`.toUpperCase();let orderId='';let couponId='';
  const cookieJar=(response:{headers:Record<string,string|string[]|number|undefined>})=>{const result:Record<string,string>={};const raw=response.headers['set-cookie'];for(const item of Array.isArray(raw)?raw:typeof raw==='string'?[raw]:[]){const pair=item.split(';',1)[0]!;const index=pair.indexOf('=');if(index>0)result[pair.slice(0,index)]=pair.slice(index+1);}return result;};
  const cookieHeader=(jar:Record<string,string>)=>Object.entries(jar).map(([key,value])=>`${key}=${value}`).join('; ');
  try {
    const store=await pool.query<{id:string}>('SELECT id FROM stores WHERE code=$1',[env.DEFAULT_STORE_CODE]);assert.ok(store.rows[0]);
    const home=await app.inject({method:'GET',url:'/api/v1/public/home'});assert.equal(home.statusCode,200);const product=home.json().data.products.find((item:{id?:string;variant_id?:string})=>item.id&&item.variant_id);assert.ok(product);
    const coupon=await pool.query<{id:string}>(`INSERT INTO coupons(store_id,name,code_prefix,discount_type,discount_value,minimum_order,per_user_limit,starts_at,expires_at,status) VALUES($1,$2,$3,'percentage',10,0,2,now()-interval '1 hour',now()+interval '1 day','active') RETURNING id`,[store.rows[0]!.id,`Checkout auditi ${suffix}`,couponCode]);couponId=coupon.rows[0]!.id;
    const quote=await app.inject({method:'POST',url:'/api/v1/checkout/quote',payload:{couponCode,items:[{listingId:product.id,variantId:product.variant_id,quantity:1}]}});assert.equal(quote.statusCode,200);assert.ok(Number(quote.json().data.discountTotal)>0);assert.equal(quote.json().data.paymentMethods.length,3);const jar=cookieJar(quote);
    const checkout=await app.inject({method:'POST',url:'/api/v1/checkout/',headers:{cookie:cookieHeader(jar),'idempotency-key':randomUUID()},payload:{couponCode,paymentMethod:'card_on_delivery',customerEmail:`checkout-${suffix}@example.test`,customerPhone:'+994501112233',customerName:'Checkout Audit',shippingAddress:{recipientName:'Checkout Audit',phone:'+994501112233',countryCode:'AZ',city:'Bakı',addressLine1:'Audit küçəsi 10'},items:[{listingId:product.id,variantId:product.variant_id,quantity:1}]}});assert.equal(checkout.statusCode,201,checkout.body);assert.equal(checkout.json().data.paymentMethod,'card_on_delivery');assert.ok(Number(checkout.json().data.discountTotal)>0);orderId=checkout.json().data.id;
    const cancelled=await app.inject({method:'POST',url:`/api/v1/customer/orders/${orderId}/cancel`,headers:{cookie:cookieHeader(jar)}});assert.equal(cancelled.statusCode,200);assert.equal(cancelled.json().data.status,'cancelled');
    const payment=await pool.query<{status:string}>('SELECT status FROM payments WHERE order_id=$1',[orderId]);assert.equal(payment.rows[0]?.status,'cancelled');
  } finally {
    if(orderId){await pool.query('DELETE FROM outbox_events WHERE aggregate_id=$1',[orderId]);await pool.query('DELETE FROM inventory_movements WHERE reference_id=$1',[orderId]);await pool.query('DELETE FROM payments WHERE order_id=$1',[orderId]);await pool.query('DELETE FROM order_items WHERE order_id=$1',[orderId]);await pool.query('DELETE FROM vendor_orders WHERE order_id=$1',[orderId]);await pool.query('DELETE FROM orders WHERE id=$1',[orderId]);}
    if(couponId)await pool.query('DELETE FROM coupons WHERE id=$1',[couponId]);
    await app.close();
  }
});

test('mega menu ağacı ayrılmış kuponlar və hədiyyələr daxil olmaqla tamdır', async () => {
  const { navigationPaths, navigationSections } = await import('./web/navigation.js');
  assert.equal(navigationSections.length, 8);
  assert.equal(navigationSections.reduce((total, section) => total + section.children.length, 0), 35);
  assert.equal(navigationPaths.length, 43);
  assert.equal(new Set(navigationPaths).size, navigationPaths.length);
  assert.ok(navigationPaths.includes('/kuponlar/'));
  assert.ok(navigationPaths.includes('/magaza/hediyyeler/'));
  const categoryImages = navigationSections.flatMap((section) => {
    assert.match(section.image, /^\/assets\/images\/categories\/.+\.jpg$/);
    for (const child of section.children) {
      assert.match(child.image, /^\/assets\/images\/categories\/.+\.jpg$/);
    }
    return [section.image, ...section.children.map((child) => child.image)];
  });
  assert.equal(categoryImages.length, 43);
  assert.ok(new Set(categoryImages).size >= 41);
});

test('satıcı özünü qeydiyyatı pending təsdiq və admin bildirişi axını ilə işləyir', async () => {
  const { buildApp } = await import('./app.js');
  const { pool } = await import('./db/pool.js');
  const { hashPassword } = await import('./core/password.js');
  const { env } = await import('./config/env.js');
  const { clearDevelopmentEmailOutbox, getDevelopmentEmailOutbox } = await import('./core/email.js');
  clearDevelopmentEmailOutbox();
  const app = await buildApp();
  const suffix = randomUUID().slice(0, 8);
  const adminEmail = `self-vendor-admin-${suffix}@example.test`;
  const vendorEmail = `self-vendor-${suffix}@example.test`;
  const vendorPhoneDigits = String(Number.parseInt(suffix, 16) % 10_000_000).padStart(7, '0');
  const adminPassword = 'SelfVendorAdmin!2026';
  const vendorPassword = 'SelfVendorOwner!2026';
  let adminUserId = '';
  let vendorUserId = '';
  let vendorId = '';
  let productId = '';

  type CookieJar = Record<string, string>;
  type InjectableResponse = { headers: Record<string, string | string[] | number | undefined> };
  const mergeCookies = (response: InjectableResponse): CookieJar => {
    const jar: CookieJar = {};
    const raw = response.headers['set-cookie'];
    for (const item of Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []) {
      const pair = item.split(';', 1)[0]!;
      const separator = pair.indexOf('=');
      if (separator > 0) jar[pair.slice(0, separator)] = pair.slice(separator + 1);
    }
    return jar;
  };
  const authHeaders = (jar: CookieJar): Record<string, string> => {
    const headers: Record<string, string> = {
      cookie: Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ')
    };
    const csrf = jar['db_csrf'] || jar['__Host-db_csrf'];
    if (csrf) headers['x-csrf-token'] = csrf;
    return headers;
  };

  try {
    const store = await pool.query<{ id: string }>('SELECT id FROM stores WHERE code=$1', [env.DEFAULT_STORE_CODE]);
    assert.ok(store.rows[0]);
    const storeId = store.rows[0]!.id;
    const adminHash = await hashPassword(adminPassword);
    const admin = await pool.query<{ id: string }>(`
      INSERT INTO users(email,password_hash,first_name,last_name,status,email_verified_at)
      VALUES($1,$2,'Self','Vendor Admin','active',now()) RETURNING id
    `, [adminEmail, adminHash]);
    adminUserId = admin.rows[0]!.id;
    await pool.query(`
      INSERT INTO user_roles(user_id,role_id,store_id)
      SELECT $1,id,$2 FROM roles WHERE code='admin'
    `, [adminUserId, storeId]);

    const registrationPage = await app.inject({ method: 'GET', url: '/qeydiyyat/' });
    assert.equal(registrationPage.statusCode, 200);
    assert.match(registrationPage.body, /href="\/satici-qeydiyyati\/">Partnyorluq üçün qeydiyyatdan keçin/);
    assert.match(registrationPage.body, /name="age"[^>]+type="number"[^>]+min="1"[^>]+max="120"/);
    assert.match(registrationPage.body, /name="gender"[^>]+required/);
    assert.match(registrationPage.body, /name="maritalStatus"[^>]+required/);
    assert.doesNotMatch(registrationPage.body, /prefer_not_to_say|Demək istəmirəm/);
    const loginPage = await app.inject({ method: 'GET', url: '/giris/' });
    assert.equal(loginPage.statusCode, 200);
    assert.match(loginPage.body, /href="\/satici-girisi\/">Satıcı olaraq daxil ol/);
    const vendorRegistrationPage = await app.inject({ method: 'GET', url: '/satici-qeydiyyati/' });
    assert.equal(vendorRegistrationPage.statusCode, 200);
    assert.match(vendorRegistrationPage.body, /data-auth-form="vendor-register"/);
    assert.match(vendorRegistrationPage.body, /name="displayName"/);
    assert.doesNotMatch(vendorRegistrationPage.body, /name="(?:age|gender|maritalStatus)"/);
    const vendorLoginPage = await app.inject({ method: 'GET', url: '/satici-girisi/' });
    assert.equal(vendorLoginPage.statusCode, 200);
    assert.match(vendorLoginPage.body, /data-auth-form="vendor-login"/);

    const vendorRegistrationPayload = {
      displayName: `Self Service Market ${suffix}`,
      legalName: `Self Service Market ${suffix} MMC`,
      taxId: `20${suffix.replace(/[^0-9]/g, '').padEnd(8, '7').slice(0, 8)}`,
      email: vendorEmail,
      phone: `+994 55 ${vendorPhoneDigits.slice(0, 3)} ${vendorPhoneDigits.slice(3, 5)} ${vendorPhoneDigits.slice(5, 7)}`,
      firstName: 'Onlayn',
      lastName: 'Satıcı',
      password: vendorPassword,
      description: 'Özünü qeydiyyat production audit müraciəti.'
    };
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/vendor-register',
      payload: vendorRegistrationPayload
    });
    assert.equal(registration.statusCode, 201, registration.body);
    assert.equal(registration.json().data.status, 'pending');
    assert.deepEqual(registration.json().data.roles, ['vendor_owner']);
    assert.ok(getDevelopmentEmailOutbox().some((message) => message.to === vendorEmail && /satıcı kabinetiniz yaradıldı/i.test(message.subject)));
    vendorId = registration.json().data.vendorId;
    const registrationJar = mergeCookies(registration);
    assert.ok(registrationJar['db_access'] || registrationJar['__Host-db_access']);
    const registrationMe = await app.inject({
      method: 'GET', url: '/api/v1/auth/me', headers: authHeaders(registrationJar)
    });
    assert.equal(registrationMe.statusCode, 200, registrationMe.body);
    assert.deepEqual(registrationMe.json().data.roles, ['vendor_owner']);
    assert.deepEqual(registrationMe.json().data.vendorIds, [vendorId]);
    const pendingBusiness = await app.inject({
      method: 'GET', url: '/biznes/reklam-ver/', headers: authHeaders(registrationJar)
    });
    assert.equal(pendingBusiness.statusCode, 200, pendingBusiness.body);
    assert.match(pendingBusiness.body, /Təsdiq gözlənilir/);
    assert.match(pendingBusiness.body, /href="\/satici-paneli\/"/);

    const duplicateRegistration = await app.inject({
      method: 'POST', url: '/api/v1/auth/vendor-register', payload: vendorRegistrationPayload
    });
    assert.equal(duplicateRegistration.statusCode, 409, duplicateRegistration.body);
    assert.equal(duplicateRegistration.json().error.code, 'VENDOR_EXISTS');

    const owner = await pool.query<{ id: string; age: number | null; gender: string | null; marital_status: string | null }>(
      'SELECT id,age,gender,marital_status FROM users WHERE email=$1',
      [vendorEmail]
    );
    vendorUserId = owner.rows[0]!.id;
    assert.equal(owner.rows[0]!.age, null);
    assert.equal(owner.rows[0]!.gender, null);
    assert.equal(owner.rows[0]!.marital_status, null);
    const pendingLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/vendor-login', payload: { email: vendorEmail, password: vendorPassword }
    });
    assert.equal(pendingLogin.statusCode, 200, pendingLogin.body);
    assert.deepEqual(pendingLogin.json().data.roles, ['vendor_owner']);
    assert.deepEqual(pendingLogin.json().data.vendorIds, [vendorId]);
    const genericPendingLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email: vendorEmail, password: vendorPassword }
    });
    assert.equal(genericPendingLogin.statusCode, 200, genericPendingLogin.body);
    assert.deepEqual(genericPendingLogin.json().data.roles, ['vendor_owner']);

    const productSlug = `pending-satici-mehsulu-${suffix}`;
    const createdProduct = await app.inject({
      method: 'POST',
      url: '/api/v1/catalog/products',
      headers: authHeaders(registrationJar),
      payload: {
        storeId,
        vendorId,
        name: `Pending satıcı məhsulu ${suffix}`,
        title: `Pending satıcı məhsulu ${suffix}`,
        slug: productSlug,
        shortDescription: 'Satıcı təsdiqi üzrə public görünürlük testi.',
        description: 'Pending satıcı kabinetdən məhsul əlavə edə bilməli, məhsul isə satıcı təsdiqinədək mağazada görünməməlidir.',
        price: 29.9,
        currency: 'AZN',
        categoryIds: [],
        attributes: { Ölçü: 'Standart' },
        mediaIds: [],
        seoTitle: `Pending satıcı məhsulu ${suffix}`,
        seoDescription: 'Satıcı hesabının təsdiq statusuna bağlı public məhsul görünürlüyü üçün inteqrasiya testi.'
      }
    });
    assert.equal(createdProduct.statusCode, 201, createdProduct.body);
    productId = createdProduct.json().data.id;

    const adminNotification = await pool.query(`
      SELECT id FROM user_notifications
      WHERE user_id=$1 AND notification_type='vendor.registration' AND metadata->>'vendorId'=$2
    `, [adminUserId, vendorId]);
    assert.ok(adminNotification.rows[0]);

    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email: adminEmail, password: adminPassword }
    });
    assert.equal(adminLogin.statusCode, 200, adminLogin.body);
    const adminJar = mergeCookies(adminLogin);

    const generalUsers = await app.inject({
      method: 'GET', url: '/api/v1/users?limit=100', headers: authHeaders(adminJar)
    });
    assert.equal(generalUsers.statusCode, 200, generalUsers.body);
    assert.equal(generalUsers.json().data.some((item: { id: string }) => item.id === vendorUserId), false);
    const vendorUsers = await app.inject({
      method: 'GET', url: '/api/v1/users?accountType=vendor&limit=100', headers: authHeaders(adminJar)
    });
    assert.equal(vendorUsers.statusCode, 200, vendorUsers.body);
    assert.equal(vendorUsers.json().data.some((item: { id: string }) => item.id === vendorUserId), true);

    const publishProduct = await app.inject({
      method: 'PATCH',
      url: `/api/v1/catalog/products/${productId}/status`,
      headers: authHeaders(adminJar),
      payload: { status: 'published', note: 'Public görünürlük sərhədi testi' }
    });
    assert.equal(publishProduct.statusCode, 200, publishProduct.body);

    const hiddenPublicProduct = await app.inject({ method: 'GET', url: `/api/v1/public/products/${productSlug}` });
    assert.equal(hiddenPublicProduct.statusCode, 404, hiddenPublicProduct.body);
    const hiddenProductPage = await app.inject({ method: 'GET', url: `/mehsul/${productSlug}/` });
    assert.equal(hiddenProductPage.statusCode, 404, hiddenProductPage.body);

    const pendingVendors = await app.inject({
      method: 'GET', url: '/api/v1/vendors?status=pending&limit=100', headers: authHeaders(adminJar)
    });
    assert.equal(pendingVendors.statusCode, 200, pendingVendors.body);
    const pendingVendor = pendingVendors.json().data.find((item: { id: string }) => item.id === vendorId);
    assert.equal(pendingVendor.owner_email, vendorEmail);
    assert.equal(pendingVendor.settings.registrationSource, 'self_service');

    const approval = await app.inject({
      method: 'PATCH', url: `/api/v1/vendors/${vendorId}`, headers: authHeaders(adminJar), payload: { status: 'active' }
    });
    assert.equal(approval.statusCode, 200, approval.body);
    assert.equal(approval.json().data.status, 'active');
    const approvedBusiness = await app.inject({
      method: 'GET', url: '/biznes/reklam-ver/', headers: authHeaders(registrationJar)
    });
    assert.equal(approvedBusiness.statusCode, 303, approvedBusiness.body);
    assert.equal(approvedBusiness.headers.location, '/satici-paneli/');

    const visiblePublicProduct = await app.inject({ method: 'GET', url: `/api/v1/public/products/${productSlug}` });
    assert.equal(visiblePublicProduct.statusCode, 200, visiblePublicProduct.body);
    const visibleProductPage = await app.inject({ method: 'GET', url: `/mehsul/${productSlug}/` });
    assert.equal(visibleProductPage.statusCode, 200, visibleProductPage.body);

    const vendorLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/vendor-login', payload: { email: vendorEmail, password: vendorPassword }
    });
    assert.equal(vendorLogin.statusCode, 200, vendorLogin.body);
    assert.deepEqual(vendorLogin.json().data.roles, ['vendor_owner']);
    assert.deepEqual(vendorLogin.json().data.vendorIds, [vendorId]);
    const approvalNotification = await pool.query(`
      SELECT id FROM user_notifications
      WHERE user_id=$1 AND notification_type='vendor.status' AND metadata->>'status'='active'
    `, [vendorUserId]);
    assert.ok(approvalNotification.rows[0]);
  } finally {
    if (vendorId) await pool.query('DELETE FROM audit_logs WHERE vendor_id=$1 OR entity_id=$1::text', [vendorId]);
    if (productId) await pool.query('DELETE FROM products WHERE id=$1', [productId]);
    if (adminUserId || vendorUserId) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[adminUserId, vendorUserId].filter(Boolean)]);
    if (vendorId) await pool.query('DELETE FROM vendors WHERE id=$1', [vendorId]);
    await app.close();
  }
});

test('qeydiyyat, admin, satıcı, icazə və sessiya axınları birlikdə işləyir', async () => {
  const { buildApp } = await import('./app.js');
  const { pool } = await import('./db/pool.js');
  const { hashPassword } = await import('./core/password.js');
  const { env } = await import('./config/env.js');
  const { getDevelopmentEmailOutbox } = await import('./core/email.js');
  const app = await buildApp();
  const suffix = randomUUID().slice(0, 8);
  const adminEmail = `audit-admin-${suffix}@example.test`;
  const customerEmail = `audit-customer-${suffix}@example.test`;
  const ownerEmail = `audit-owner-${suffix}@example.test`;
  const vendorAccountEmail = `audit-vendor-account-${suffix}@example.test`;
  const managedUserEmail = `audit-managed-user-${suffix}@example.test`;
  const moderatorEmail = `audit-moderator-${suffix}@example.test`;
  const adminPassword = 'AuditAdmin!2026';
  const customerPassword = 'AuditCustomer!2026';
  const updatedCustomerPassword = 'AuditCustomer!2027';
  const ownerPassword = 'AuditVendor!2026';
  const vendorAccountPassword = 'VendorAccount!2026';
  const managedUserPassword = 'ManagedUser!2026';
  const managedUserNewPassword = 'ManagedUser!2027';
  const moderatorPassword = 'AuditModerator!2026';
  const createdUserIds: string[] = [];
  let vendorId = '';
  let categoryId = '';
  let mainCategoryId = '';
  let subcategoryId = '';
  let categoryPath = '';
  let brandId = '';
  let mediaId = '';
  let pdfMediaId = '';
  let journalId = '';
  let classifiedId = '';
  let productId = '';
  let productReviewId = '';
  let rewardId = '';
  let pageId = '';
  let postId = '';
  let postCategoryId = '';
  let seoClusterId = '';
  let campaignId = '';
  let couponId = '';
  let qrId = '';
  let editorStoreId = '';
  const inventoryReferences = [`audit-add-${suffix}`, `audit-revert-${suffix}`];

  type CookieJar = Record<string, string>;
  type InjectableResponse = { headers: Record<string, string | string[] | number | undefined> };
  const mergeCookies = (response: InjectableResponse, base: CookieJar = {}): CookieJar => {
    const jar = { ...base };
    const raw = response.headers['set-cookie'];
    for (const item of Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []) {
      const pair = item.split(';', 1)[0]!;
      const separator = pair.indexOf('=');
      if (separator > 0) jar[pair.slice(0, separator)] = pair.slice(separator + 1);
    }
    return jar;
  };
  const cookieHeader = (jar: CookieJar) => Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ');
  const authHeaders = (jar: CookieJar, csrf = true): Record<string, string> => {
    const headers: Record<string, string> = { cookie: cookieHeader(jar) };
    const csrfToken = jar['db_csrf'] || jar['__Host-db_csrf'];
    if (csrf && csrfToken) headers['x-csrf-token'] = csrfToken;
    return headers;
  };

  try {
    const store = await pool.query<{ id: string; name: string; locale: string; currency: string; timezone: string }>(
      'SELECT id,name,locale,currency,timezone FROM stores WHERE code=$1',
      [env.DEFAULT_STORE_CODE]
    );
    assert.ok(store.rows[0]);
    const storeRow = store.rows[0]!;
    const expectedModeratorPermissions = [
      'catalog.create','catalog.delete','catalog.publish','catalog.read','catalog.update',
      'inventory.manage','inventory.read',
      'journal.create','journal.delete','journal.publish','journal.read','journal.update',
      'media.read','media.upload',
      'posts.create','posts.delete','posts.publish','posts.read','posts.update'
    ];
    const moderatorPermissions = await pool.query<{ code: string }>(`
      SELECT p.code FROM role_permissions rp
      JOIN roles r ON r.id=rp.role_id
      JOIN permissions p ON p.id=rp.permission_id
      WHERE r.code='moderator' ORDER BY p.code
    `);
    assert.deepEqual(moderatorPermissions.rows.map((row) => row.code), expectedModeratorPermissions);

    const moderator = await pool.query<{ id: string }>(`
      INSERT INTO users(email,password_hash,first_name,last_name,status,email_verified_at)
      VALUES($1,$2,'Audit','Moderator','active',now()) RETURNING id
    `, [moderatorEmail, await hashPassword(moderatorPassword)]);
    const moderatorId = moderator.rows[0]!.id;
    createdUserIds.push(moderatorId);
    await pool.query(`
      INSERT INTO user_roles(user_id,role_id,store_id)
      SELECT $1,id,$2 FROM roles WHERE code='moderator'
    `, [moderatorId, storeRow.id]);
    const moderatorLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email: moderatorEmail, password: moderatorPassword }
    });
    assert.equal(moderatorLogin.statusCode, 200, moderatorLogin.body);
    const moderatorJar = mergeCookies(moderatorLogin);
    const moderatorMe = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: authHeaders(moderatorJar) });
    assert.equal(moderatorMe.statusCode, 200, moderatorMe.body);
    assert.deepEqual([...moderatorMe.json().data.permissions].sort(), expectedModeratorPermissions);
    const moderatorAdminPanel = await app.inject({ method: 'GET', url: '/admin/', headers: authHeaders(moderatorJar) });
    assert.equal(moderatorAdminPanel.statusCode, 200);
    assert.match(moderatorAdminPanel.body, /id="appView"/);

    for (const url of [
      '/api/v1/catalog/products', '/api/v1/catalog/categories', '/api/v1/catalog/brands',
      '/api/v1/catalog/inventory', '/api/v1/content/posts',
      `/api/v1/content/post-categories?storeId=${storeRow.id}`, '/api/v1/publishing/journal',
      '/api/v1/media', `/api/v1/vendors/options?storeId=${storeRow.id}`
    ]) {
      const response = await app.inject({ method: 'GET', url, headers: authHeaders(moderatorJar) });
      assert.equal(response.statusCode, 200, `${url}: ${response.body}`);
    }
    for (const url of [
      '/api/v1/dashboard', '/api/v1/content/pages', '/api/v1/vendors', '/api/v1/orders',
      '/api/v1/marketing/campaigns', '/api/v1/users', '/api/v1/settings', '/api/v1/editor/nav',
      '/api/v1/publishing/classifieds', '/api/v1/loyalty/rewards'
    ]) {
      const response = await app.inject({ method: 'GET', url, headers: authHeaders(moderatorJar) });
      assert.equal(response.statusCode, 403, `${url}: ${response.body}`);
    }

    const passwordHash = await hashPassword(adminPassword);
    const admin = await pool.query<{ id: string }>(`
      INSERT INTO users(email,password_hash,first_name,last_name,status,email_verified_at)
      VALUES($1,$2,'Audit','Admin','active',now()) RETURNING id
    `, [adminEmail, passwordHash]);
    const adminId = admin.rows[0]!.id;
    createdUserIds.push(adminId);
    const assigned = await pool.query(`
      INSERT INTO user_roles(user_id,role_id,store_id)
      SELECT $1,id,$2 FROM roles WHERE code='super_admin' RETURNING id
    `, [adminId, storeRow.id]);
    assert.ok(assigned.rows[0]);

    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email: adminEmail, password: adminPassword }
    });
    assert.equal(adminLogin.statusCode, 200);
    const adminJar = mergeCookies(adminLogin);
    assert.ok(adminJar['db_access'] || adminJar['__Host-db_access']);
    assert.ok(adminJar['db_refresh'] || adminJar['__Host-db_refresh']);
    assert.ok(adminJar['db_csrf'] || adminJar['__Host-db_csrf']);

    const adminMe = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: authHeaders(adminJar) });
    assert.equal(adminMe.statusCode, 200);
    assert.ok(adminMe.json().data.roles.includes('super_admin'));
    assert.ok(adminMe.json().data.permissions.includes('editor.read'));
    assert.ok(adminMe.json().data.permissions.includes('editor.manage'));
    assert.ok(adminMe.json().data.permissions.includes('editor.publish'));
    const adminPanel = await app.inject({ method: 'GET', url: '/admin/', headers: authHeaders(adminJar) });
    assert.equal(adminPanel.statusCode, 200);
    const adminCannotUseVendorPortal = await app.inject({ method: 'GET', url: '/satici-paneli/', headers: authHeaders(adminJar) });
    assert.equal(adminCannotUseVendorPortal.statusCode, 303);
    assert.equal(adminCannotUseVendorPortal.headers.location, '/admin/');

    const editorOptions = await app.inject({ method: 'GET', url: '/api/v1/editor/options', headers: authHeaders(adminJar) });
    assert.equal(editorOptions.statusCode, 200, editorOptions.body);
    assert.equal(editorOptions.json().data.storeId, storeRow.id);
    assert.ok(Array.isArray(editorOptions.json().data.products));
    assert.ok(Array.isArray(editorOptions.json().data.categories));
    assert.ok(Array.isArray(editorOptions.json().data.media));
    const navEditor = await app.inject({ method: 'GET', url: '/api/v1/editor/nav', headers: authHeaders(adminJar) });
    assert.equal(navEditor.statusCode, 200, navEditor.body);
    assert.equal(navEditor.json().data.scope, 'nav');
    assert.ok(Array.isArray(navEditor.json().data.draft.menuItems));
    const editorPreview = await app.inject({ method: 'GET', url: '/api/v1/editor/preview?scope=index', headers: authHeaders(adminJar) });
    assert.equal(editorPreview.statusCode, 200, editorPreview.body);
    assert.equal(editorPreview.json().data.previewScope, 'index');
    assert.ok(editorPreview.json().data.index.hero.slides.length > 0);
    const publicEditor = await app.inject({ method: 'GET', url: '/api/v1/public/site-editor' });
    assert.equal(publicEditor.statusCode, 200, publicEditor.body);
    assert.ok(Object.hasOwn(publicEditor.json().data, 'nav'));

    const isolatedEditorStore = await pool.query<{ id: string }>(`
      INSERT INTO stores(code,name,primary_domain) VALUES($1,$2,$3) RETURNING id
    `, [`editor-${suffix}`, `Editor audit ${suffix}`, `editor-${suffix}.example.test`]);
    editorStoreId = isolatedEditorStore.rows[0]!.id;
    const isolatedNav = await app.inject({ method: 'GET', url: `/api/v1/editor/nav?storeId=${editorStoreId}`, headers: authHeaders(adminJar) });
    assert.equal(isolatedNav.statusCode, 200, isolatedNav.body);
    const navDraft = isolatedNav.json().data.draft;
    navDraft.announcement.deliveryText = `Editor preview ${suffix}`;
    const savedNav = await app.inject({
      method: 'PATCH', url: '/api/v1/editor/nav/draft', headers: authHeaders(adminJar),
      payload: { storeId: editorStoreId, expectedVersion: isolatedNav.json().data.draftVersion, content: navDraft }
    });
    assert.equal(savedNav.statusCode, 200, savedNav.body);
    assert.equal(savedNav.json().data.draft.announcement.deliveryText, `Editor preview ${suffix}`);
    const staleNav = await app.inject({
      method: 'PATCH', url: '/api/v1/editor/nav/draft', headers: authHeaders(adminJar),
      payload: { storeId: editorStoreId, expectedVersion: isolatedNav.json().data.draftVersion, content: navDraft }
    });
    assert.equal(staleNav.statusCode, 409);
    const publishedNav = await app.inject({
      method: 'POST', url: '/api/v1/editor/nav/publish', headers: authHeaders(adminJar),
      payload: { storeId: editorStoreId, expectedVersion: savedNav.json().data.draftVersion }
    });
    assert.equal(publishedNav.statusCode, 200, publishedNav.body);
    assert.equal(publishedNav.json().data.hasUnpublishedChanges, false);

    const csrfRejected = await app.inject({
      method: 'POST', url: '/api/v1/vendors', headers: authHeaders(adminJar, false),
      payload: {
        storeId: storeRow.id, displayName: `CSRF ${suffix}`, legalName: `CSRF ${suffix} MMC`,
        email: `csrf-${suffix}@example.test`, commissionRate: 0
      }
    });
    assert.equal(csrfRejected.statusCode, 403);
    assert.equal(csrfRejected.json().error.code, 'CSRF_REJECTED');

    const registration = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: {
        email: customerEmail,
        phone: `+99450${Date.now().toString().slice(-7)}`,
        firstName: 'Audit',
        lastName: 'Müştəri',
        age: 34,
        gender: 'female',
        maritalStatus: 'single',
        password: customerPassword
      }
    });
    assert.equal(registration.statusCode, 201);
    assert.deepEqual(registration.json().data.roles, ['customer']);
    assert.deepEqual(registration.json().data.permissions, []);
    assert.ok(getDevelopmentEmailOutbox().some((message) => message.to === customerEmail && /xoş gəlmisiniz/i.test(message.subject)));
    const customerId = registration.json().data.userId as string;
    createdUserIds.push(customerId);
    const originalCustomerJar = mergeCookies(registration);

    const customerDemographics = await pool.query<{
      age: number; gender: string; marital_status: string;
    }>('SELECT age,gender,marital_status FROM users WHERE id=$1', [customerId]);
    assert.deepEqual(customerDemographics.rows[0], { age: 34, gender: 'female', marital_status: 'single' });
    const filteredCustomers = await app.inject({
      method: 'GET',
      url: '/api/v1/users?accountType=general&ageMin=34&ageMax=34&gender=female&maritalStatus=single&limit=100',
      headers: authHeaders(adminJar)
    });
    assert.equal(filteredCustomers.statusCode, 200, filteredCustomers.body);
    const filteredCustomer = filteredCustomers.json().data.find((item: { id: string }) => item.id === customerId);
    assert.ok(filteredCustomer);
    assert.equal(filteredCustomer.age, 34);
    assert.equal(filteredCustomer.gender, 'female');
    assert.equal(filteredCustomer.marital_status, 'single');

    const impossibleAgeRange = await app.inject({
      method: 'GET', url: '/api/v1/users?ageMin=40&ageMax=20', headers: authHeaders(adminJar)
    });
    assert.equal(impossibleAgeRange.statusCode, 400);

    const customerMe = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: authHeaders(originalCustomerJar) });
    assert.equal(customerMe.statusCode, 200);
    const customerAdminPanel = await app.inject({ method: 'GET', url: '/admin/', headers: authHeaders(originalCustomerJar) });
    assert.equal(customerAdminPanel.statusCode, 303);
    assert.equal(customerAdminPanel.headers.location, '/hesabim/');
    const customerVendorPanel = await app.inject({ method: 'GET', url: '/satici-paneli/', headers: authHeaders(originalCustomerJar) });
    assert.equal(customerVendorPanel.statusCode, 303);
    assert.equal(customerVendorPanel.headers.location, '/hesabim/');
    const profileUpdate = await app.inject({
      method: 'PATCH', url: '/api/v1/customer/profile', headers: authHeaders(originalCustomerJar),
      payload: { firstName: 'Yenilənmiş', lastName: 'Müştəri', displayName: 'Yenilənmiş Müştəri', email: customerEmail, phone: '+994501234567' }
    });
    assert.equal(profileUpdate.statusCode, 200, profileUpdate.body);
    assert.equal(profileUpdate.json().data.firstName, 'Yenilənmiş');
    assert.equal(profileUpdate.json().data.displayName, 'Yenilənmiş Müştəri');
    assert.equal(profileUpdate.json().data.phone, '+994 50 123 45 67');
    const wrongPasswordChange = await app.inject({
      method: 'PATCH', url: '/api/v1/customer/profile/password', headers: authHeaders(originalCustomerJar),
      payload: { currentPassword: 'YanlisSifre!2026', newPassword: updatedCustomerPassword }
    });
    assert.equal(wrongPasswordChange.statusCode, 400);
    assert.equal(wrongPasswordChange.json().error.code, 'CURRENT_PASSWORD_INVALID');
    const passwordChange = await app.inject({
      method: 'PATCH', url: '/api/v1/customer/profile/password', headers: authHeaders(originalCustomerJar),
      payload: { currentPassword: customerPassword, newPassword: updatedCustomerPassword }
    });
    assert.equal(passwordChange.statusCode, 200, passwordChange.body);
    assert.equal(passwordChange.json().data.changed, true);
    const oldCustomerLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: customerEmail, password: customerPassword } });
    assert.equal(oldCustomerLogin.statusCode, 401);
    const updatedCustomerLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: customerEmail, password: updatedCustomerPassword } });
    assert.equal(updatedCustomerLogin.statusCode, 200);
    const customerForbidden = await app.inject({ method: 'GET', url: '/api/v1/users', headers: authHeaders(originalCustomerJar) });
    assert.equal(customerForbidden.statusCode, 403);

    const duplicateRegistration = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: {
        email: customerEmail,
        firstName: 'Audit',
        lastName: 'Müştəri',
        age: 34,
        gender: 'female',
        maritalStatus: 'single',
        password: customerPassword
      }
    });
    assert.equal(duplicateRegistration.statusCode, 409);
    assert.equal(duplicateRegistration.json().error.code, 'ACCOUNT_EXISTS');

    const createdVendor = await app.inject({
      method: 'POST', url: '/api/v1/vendors', headers: authHeaders(adminJar),
      payload: {
        storeId: storeRow.id, displayName: `Audit Satıcı ${suffix}`, legalName: `Audit Satıcı ${suffix} MMC`,
        email: `audit-vendor-${suffix}@example.test`, phone: '+994501112233', description: 'Avtomatik audit satıcısı', commissionRate: 7.5,
        ownerFirstName: 'Avtomatik', ownerLastName: 'Satıcı', accountEmail: vendorAccountEmail, accountPassword: vendorAccountPassword
      }
    });
    assert.equal(createdVendor.statusCode, 201);
    assert.equal(createdVendor.json().data.status, 'active');
    assert.equal(createdVendor.json().data.portalUrl, '/satici-paneli/');
    assert.equal(createdVendor.json().data.owner.email, vendorAccountEmail);
    createdUserIds.push(createdVendor.json().data.owner.id);
    vendorId = createdVendor.json().data.id;

    const vendorAccountLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email: vendorAccountEmail, password: vendorAccountPassword }
    });
    assert.equal(vendorAccountLogin.statusCode, 200, vendorAccountLogin.body);
    assert.deepEqual(vendorAccountLogin.json().data.roles, ['vendor_owner']);
    assert.deepEqual(vendorAccountLogin.json().data.vendorIds, [vendorId]);
    const vendorAccountJar = mergeCookies(vendorAccountLogin);
    const vendorCatalog = await app.inject({ method: 'GET', url: '/api/v1/catalog/products', headers: authHeaders(vendorAccountJar) });
    assert.equal(vendorCatalog.statusCode, 200);
    const vendorAdminPanel = await app.inject({ method: 'GET', url: '/admin/', headers: authHeaders(vendorAccountJar) });
    assert.equal(vendorAdminPanel.statusCode, 303);
    assert.equal(vendorAdminPanel.headers.location, '/satici-paneli/');
    const vendorPortal = await app.inject({ method: 'GET', url: '/satici-paneli/', headers: authHeaders(vendorAccountJar) });
    assert.equal(vendorPortal.statusCode, 200);
    assert.match(vendorPortal.body, /id="appView"/);

    const approvedVendor = await app.inject({
      method: 'PATCH', url: `/api/v1/vendors/${vendorId}`, headers: authHeaders(adminJar), payload: { status: 'active' }
    });
    assert.equal(approvedVendor.statusCode, 200);
    assert.equal(approvedVendor.json().data.status, 'active');
    assert.ok(approvedVendor.json().data.approved_at);

    const createdOwner = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: authHeaders(adminJar),
      payload: {
        storeId: storeRow.id, vendorId, email: ownerEmail, firstName: 'Audit', lastName: 'Satıcı',
        temporaryPassword: ownerPassword, roleCode: 'vendor_owner', status: 'invited'
      }
    });
    assert.equal(createdOwner.statusCode, 201);
    assert.equal(createdOwner.json().data.status, 'invited');
    assert.match(createdOwner.json().data.inviteUrl, /\/deveti-qebul-et\/\?token=/);
    const ownerId = createdOwner.json().data.id as string;
    createdUserIds.push(ownerId);

    const invitedLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email: ownerEmail, password: ownerPassword }
    });
    assert.equal(invitedLogin.statusCode, 401);

    const activatedOwner = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${ownerId}/status`, headers: authHeaders(adminJar), payload: { status: 'active' }
    });
    assert.equal(activatedOwner.statusCode, 200);
    assert.equal(activatedOwner.json().data.status, 'active');

    const ownerLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email: ownerEmail, password: ownerPassword }
    });
    assert.equal(ownerLogin.statusCode, 200);
    const ownerJar = mergeCookies(ownerLogin);
    assert.deepEqual(ownerLogin.json().data.vendorIds, [vendorId]);
    assert.ok(ownerLogin.json().data.permissions.includes('catalog.read'));
    assert.ok(ownerLogin.json().data.permissions.includes('media.read'));
    assert.ok(ownerLogin.json().data.permissions.includes('loyalty.read'));

    const ownerDashboard = await app.inject({ method: 'GET', url: '/api/v1/dashboard', headers: authHeaders(ownerJar) });
    assert.equal(ownerDashboard.statusCode, 200);
    const ownerProducts = await app.inject({ method: 'GET', url: '/api/v1/catalog/products', headers: authHeaders(ownerJar) });
    assert.equal(ownerProducts.statusCode, 200);
    const ownerUsers = await app.inject({ method: 'GET', url: '/api/v1/users', headers: authHeaders(ownerJar) });
    assert.equal(ownerUsers.statusCode, 403);
    const ownerSettings = await app.inject({ method: 'GET', url: '/api/v1/settings', headers: authHeaders(ownerJar) });
    assert.equal(ownerSettings.statusCode, 403);

    const createdManagedUser = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, email: managedUserEmail, firstName: 'İdarə', lastName: 'Olunan', temporaryPassword: managedUserPassword, roleCode: 'customer', status: 'active' }
    });
    assert.equal(createdManagedUser.statusCode, 201, createdManagedUser.body);
    const managedUserId = createdManagedUser.json().data.id as string;
    createdUserIds.push(managedUserId);
    const managedUserDetail = await app.inject({ method: 'GET', url: `/api/v1/users/${managedUserId}`, headers: authHeaders(adminJar) });
    assert.equal(managedUserDetail.statusCode, 200);
    assert.equal(managedUserDetail.json().data.email, managedUserEmail);
    const editedManagedUser = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${managedUserId}`, headers: authHeaders(adminJar),
      payload: { firstName: 'Yenilənmiş', lastName: 'İstifadəçi', phone: '+994 50 222 33 44', newPassword: managedUserNewPassword, status: 'active' }
    });
    assert.equal(editedManagedUser.statusCode, 200, editedManagedUser.body);
    assert.equal(editedManagedUser.json().data.first_name, 'Yenilənmiş');
    assert.equal(editedManagedUser.json().data.phone, '+994 50 222 33 44');
    const oldManagedLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: managedUserEmail, password: managedUserPassword } });
    assert.equal(oldManagedLogin.statusCode, 401);
    const newManagedLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: managedUserEmail, password: managedUserNewPassword } });
    assert.equal(newManagedLogin.statusCode, 200);
    const deletedManagedUser = await app.inject({ method: 'DELETE', url: `/api/v1/users/${managedUserId}`, headers: authHeaders(adminJar) });
    assert.equal(deletedManagedUser.statusCode, 204);
    const missingManagedUser = await app.inject({ method: 'GET', url: `/api/v1/users/${managedUserId}`, headers: authHeaders(adminJar) });
    assert.equal(missingManagedUser.statusCode, 404);

    const notifications = await app.inject({ method: 'GET', url: '/api/v1/notifications', headers: authHeaders(adminJar) });
    assert.equal(notifications.statusCode, 200);
    assert.ok(Array.isArray(notifications.json().data));
    assert.equal(typeof notifications.json().meta.unread, 'number');

    const createdCategory = await app.inject({
      method: 'POST', url: '/api/v1/catalog/categories', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, name: `Audit kateqoriyası ${suffix}`, description: 'Avtomatik kateqoriya auditi', position: 999 }
    });
    assert.equal(createdCategory.statusCode, 201);
    categoryId = createdCategory.json().data.id;
    const updatedCategory = await app.inject({
      method: 'PATCH', url: `/api/v1/catalog/categories/${categoryId}`, headers: authHeaders(adminJar),
      payload: { seoTitle: `Audit kateqoriyası ${suffix}`, status: 'active' }
    });
    assert.equal(updatedCategory.statusCode, 200);
    assert.equal(updatedCategory.json().data.seo_title, `Audit kateqoriyası ${suffix}`);

    const vendorCategoryAttempt = await app.inject({
      method: 'POST', url: '/api/v1/catalog/categories', headers: authHeaders(ownerJar),
      payload: { storeId: storeRow.id, name: `İcazəsiz kateqoriya ${suffix}` }
    });
    assert.equal(vendorCategoryAttempt.statusCode, 403);

    const createdMainCategory = await app.inject({
      method: 'POST', url: '/api/v1/catalog/categories', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, parentId: categoryId, name: `Audit əsas kateqoriya ${suffix}`, position: 1 }
    });
    assert.equal(createdMainCategory.statusCode, 201, createdMainCategory.body);
    mainCategoryId = createdMainCategory.json().data.id;
    const createdSubcategory = await app.inject({
      method: 'POST', url: '/api/v1/catalog/categories', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, parentId: mainCategoryId, name: `Audit alt kateqoriya ${suffix}`, position: 1 }
    });
    assert.equal(createdSubcategory.statusCode, 201, createdSubcategory.body);
    subcategoryId = createdSubcategory.json().data.id;
    categoryPath = [createdCategory.json().data.slug, createdMainCategory.json().data.slug, createdSubcategory.json().data.slug].join('/');

    const fourthLevelCategory = await app.inject({
      method: 'POST', url: '/api/v1/catalog/categories', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, parentId: subcategoryId, name: `Yolverilməz dördüncü səviyyə ${suffix}` }
    });
    assert.equal(fourthLevelCategory.statusCode, 400);
    const categoryTree = await app.inject({ method: 'GET', url: '/api/v1/catalog/categories', headers: authHeaders(adminJar) });
    assert.equal(categoryTree.statusCode, 200, categoryTree.body);
    assert.equal(categoryTree.json().data.find((row: { id: string }) => row.id === categoryId)?.depth, 0);
    assert.equal(categoryTree.json().data.find((row: { id: string }) => row.id === mainCategoryId)?.depth, 1);
    assert.equal(categoryTree.json().data.find((row: { id: string }) => row.id === subcategoryId)?.depth, 2);

    const createdBrand = await app.inject({
      method: 'POST', url: '/api/v1/catalog/brands', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, name: `Audit brendi ${suffix}`, description: 'Avtomatik brend auditi', websiteUrl: 'https://example.com' }
    });
    assert.equal(createdBrand.statusCode, 201);
    brandId = createdBrand.json().data.id;
    const updatedBrand = await app.inject({
      method: 'PATCH', url: `/api/v1/catalog/brands/${brandId}`, headers: authHeaders(adminJar),
      payload: { seoTitle: `Audit brendi ${suffix}`, status: 'active' }
    });
    assert.equal(updatedBrand.statusCode, 200);
    assert.equal(updatedBrand.json().data.seo_title, `Audit brendi ${suffix}`);

    const boundary = `audit-${suffix}`;
    // The file deliberately comes before metadata: browsers are free to use
    // this order and the upload route must consume it before reading fields.
    const multipartHead = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audit.png"\r\nContent-Type: application/octet-stream\r\n\r\n`
    );
    const multipartTail = Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="storeId"\r\n\r\n${storeRow.id}\r\n`
      + `--${boundary}\r\nContent-Disposition: form-data; name="vendorId"\r\n\r\n${vendorId}\r\n`
      + `--${boundary}\r\nContent-Disposition: form-data; name="altText"\r\n\r\nAudit məhsul şəkli\r\n`
      + `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nAudit media ${suffix}\r\n`
      + `--${boundary}--\r\n`
    );
    const uploadedMedia = await app.inject({
      method: 'POST', url: '/api/v1/media',
      headers: { ...authHeaders(adminJar), 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([multipartHead, Buffer.from('89504e470d0a1a0a', 'hex'), multipartTail])
    });
    assert.equal(uploadedMedia.statusCode, 201);
    mediaId = uploadedMedia.json().data.id;
    assert.equal(uploadedMedia.json().data.vendor_id, vendorId);
    assert.equal(uploadedMedia.json().data.mime_type, 'image/png');
    const updatedMedia = await app.inject({
      method: 'PATCH', url: `/api/v1/media/${mediaId}`, headers: authHeaders(adminJar),
      payload: { altText: 'Yenilənmiş audit məhsul şəkli' }
    });
    assert.equal(updatedMedia.statusCode, 200);
    assert.equal(updatedMedia.json().data.alt_text, 'Yenilənmiş audit məhsul şəkli');

    const pdfBoundary = `audit-pdf-${suffix}`;
    const pdfHead = Buffer.from(
      `--${pdfBoundary}\r\nContent-Disposition: form-data; name="storeId"\r\n\r\n${storeRow.id}\r\n`
      + `--${pdfBoundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nAudit jurnal PDF ${suffix}\r\n`
      + `--${pdfBoundary}\r\nContent-Disposition: form-data; name="file"; filename="audit.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
    );
    const pdfTail = Buffer.from(`\r\n--${pdfBoundary}--\r\n`);
    const uploadedPdf = await app.inject({
      method: 'POST', url: '/api/v1/media',
      headers: { ...authHeaders(adminJar), 'content-type': `multipart/form-data; boundary=${pdfBoundary}` },
      payload: Buffer.concat([pdfHead, Buffer.from('%PDF-1.4\n%%EOF'), pdfTail])
    });
    assert.equal(uploadedPdf.statusCode, 201);
    pdfMediaId = uploadedPdf.json().data.id;

    const warehouses = await app.inject({ method: 'GET', url: '/api/v1/catalog/warehouses', headers: authHeaders(adminJar) });
    assert.equal(warehouses.statusCode, 200);
    assert.ok(warehouses.json().data.length > 0);

    const identifierPreview = await app.inject({
      method: 'GET', url: `/api/v1/catalog/product-identifiers/preview?storeId=${storeRow.id}&vendorId=${vendorId}`, headers: authHeaders(adminJar)
    });
    assert.equal(identifierPreview.statusCode, 200, identifierPreview.body);
    assert.match(identifierPreview.json().data.sku, /^TV-\d{6}-[A-F0-9]{8}$/);

    const createdProduct = await app.inject({
      method: 'POST', url: '/api/v1/catalog/products', headers: authHeaders(adminJar),
      payload: {
        storeId: storeRow.id, vendorId, sku: identifierPreview.json().data.sku, name: `Audit məhsulu ${suffix}`,
        shortDescription: 'Audit məhsulunun qısa təsviri.',
        description: 'Admin məhsul yaratma və status axınını yoxlayan audit məhsuludur.',
        price: 19.9, currency: 'AZN', brandId, categoryIds: [categoryId, mainCategoryId, subcategoryId], mediaIds: [mediaId], attributes: { material: 'Audit' },
        isFeatured: true, isPopular: true, isTopPick: true, displayPosition: 987, merchandisingBadge: 'recommended',
        seoTitle: `Audit məhsulu ${suffix}`, seoDescription: 'Audit məhsulunun avtomatik SEO təsviri.',
        warehouseId: warehouses.json().data[0].id, initialStock: 3
      }
    });
    assert.equal(createdProduct.statusCode, 201, createdProduct.body);
    assert.equal(createdProduct.json().data.sku, identifierPreview.json().data.sku);
    assert.equal(createdProduct.json().data.barcode, null);
    assert.equal(createdProduct.json().data.variants[0].sku, createdProduct.json().data.sku);
    assert.equal(createdProduct.json().data.variants[0].barcode, null);
    productId = createdProduct.json().data.id;
    const productDetail = await app.inject({ method: 'GET', url: `/api/v1/catalog/products/${productId}`, headers: authHeaders(adminJar) });
    assert.equal(productDetail.statusCode, 200);
    assert.equal(productDetail.json().data.brand_id, brandId);
    assert.deepEqual(
      new Set(productDetail.json().data.categories.map((category: { id: string }) => category.id)),
      new Set([categoryId, mainCategoryId, subcategoryId])
    );
    const invalidProductCategoryPath = await app.inject({
      method: 'PATCH', url: `/api/v1/catalog/products/${productId}`, headers: authHeaders(adminJar),
      payload: { categoryIds: [categoryId, subcategoryId] }
    });
    assert.equal(invalidProductCategoryPath.statusCode, 400);
    assert.equal(invalidProductCategoryPath.json().error.code, 'CATEGORY_PATH_INVALID');
    const newestProducts = await app.inject({ method: 'GET', url: `/api/v1/catalog/products?storeId=${storeRow.id}&limit=10`, headers: authHeaders(adminJar) });
    assert.equal(newestProducts.statusCode, 200, newestProducts.body);
    assert.equal(newestProducts.json().data[0].id, productId);
    assert.equal(productDetail.json().data.media[0].id, mediaId);
    assert.equal(Number(productDetail.json().data.variants[0].inventory[0].quantity), 3);
    assert.equal(productDetail.json().data.is_featured, true);
    assert.equal(productDetail.json().data.merchandising_badge, 'recommended');
    const publishedProduct = await app.inject({
      method: 'PATCH', url: `/api/v1/catalog/products/${productId}/status`, headers: authHeaders(adminJar),
      payload: { status: 'published', note: 'Audit nəşri' }
    });
    assert.equal(publishedProduct.statusCode, 200);
    assert.equal(publishedProduct.json().data.status, 'published');
    const updatedPublishedProduct = await app.inject({
      method: 'PATCH', url: `/api/v1/catalog/products/${productId}`, headers: authHeaders(adminJar),
      payload: {
        shortDescription: 'Audit məhsulunun yenilənmiş qısa təsviri.',
        description: 'Admin tərəfindən yenilənmiş ətraflı məhsul təsviri.'
      }
    });
    assert.equal(updatedPublishedProduct.statusCode, 200, updatedPublishedProduct.body);
    assert.equal(updatedPublishedProduct.json().data.listing.status, 'published');
    const publicProductPage = await app.inject({ method: 'GET', url: `/mehsul/${createdProduct.json().data.listing.slug}/` });
    assert.equal(publicProductPage.statusCode, 200, publicProductPage.body);
    assert.match(String(publicProductPage.headers['cache-control']), /max-age=0, must-revalidate/);
    assert.match(publicProductPage.body, /class="db-product-short-description"/);
    assert.match(publicProductPage.body, /Audit məhsulunun yenilənmiş qısa təsviri/);
    assert.match(publicProductPage.body, /data-product-full-description>Admin tərəfindən yenilənmiş ətraflı məhsul təsviri\.<\/p>/);
    const publicNestedCategory = await app.inject({ method: 'GET', url: `/magaza/${categoryPath}/` });
    assert.equal(publicNestedCategory.statusCode, 200, publicNestedCategory.body);
    assert.match(publicNestedCategory.body, new RegExp(`Audit məhsulu ${suffix}`));
    assert.match(publicNestedCategory.body, /Audit məhsulunun yenilənmiş qısa təsviri/);

    const submittedProductReview = await app.inject({
      method: 'POST', url: `/api/v1/customer/products/${createdProduct.json().data.listing.slug}/reviews`, headers: authHeaders(originalCustomerJar),
      payload: { rating: 5, authorName: 'Audit Müştəri', email: customerEmail, title: 'Admin moderasiya auditi', body: 'Məhsul rəyinin admin paneldə idarə olunmasını yoxlayan avtomatik testdir.' }
    });
    assert.equal(submittedProductReview.statusCode, 200);
    productReviewId = submittedProductReview.json().data.review.id;
    const adminReviews = await app.inject({ method: 'GET', url: `/api/v1/catalog/reviews?search=${suffix}`, headers: authHeaders(adminJar) });
    assert.equal(adminReviews.statusCode, 200);
    assert.ok(adminReviews.json().data.some((row: { id: string }) => row.id === productReviewId));
    const rejectedReview = await app.inject({ method: 'PATCH', url: `/api/v1/catalog/reviews/${productReviewId}/status`, headers: authHeaders(adminJar), payload: { status: 'rejected' } });
    assert.equal(rejectedReview.statusCode, 200);
    assert.equal(rejectedReview.json().data.status, 'rejected');

    const createdReward = await app.inject({
      method: 'POST', url: '/api/v1/loyalty/rewards', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, name: `Audit hədiyyəsi ${suffix}`, description: 'Loyallıq backend auditi', pointsCost: 25, stock: 10, status: 'active' }
    });
    assert.equal(createdReward.statusCode, 201);
    rewardId = createdReward.json().data.id;
    const updatedReward = await app.inject({
      method: 'PATCH', url: `/api/v1/loyalty/rewards/${rewardId}`, headers: authHeaders(adminJar),
      payload: { pointsCost: 30, description: 'Yenilənmiş loyallıq backend auditi' }
    });
    assert.equal(updatedReward.statusCode, 200);
    assert.equal(Number(updatedReward.json().data.points_cost), 30);
    const rewards = await app.inject({ method: 'GET', url: `/api/v1/loyalty/rewards?search=${suffix}`, headers: authHeaders(adminJar) });
    assert.equal(rewards.statusCode, 200);
    assert.ok(rewards.json().data.some((row: { id: string }) => row.id === rewardId));

    const contentPayload = {
      storeId: storeRow.id, excerpt: 'Avtomatik admin audit kontentinin xülasəsi.',
      content: [{ type: 'paragraph', data: { html: '<p>Admin kontent axını üçün audit mətni.</p>' } }],
      seoDescription: 'Admin kontent axınının avtomatik audit təsviri.'
    };
    const createdPage = await app.inject({
      method: 'POST', url: '/api/v1/content/pages', headers: authHeaders(adminJar),
      payload: { ...contentPayload, title: `Audit səhifəsi ${suffix}`, slug: `audit-page-${suffix}`, seoTitle: `Audit səhifəsi ${suffix}` }
    });
    assert.equal(createdPage.statusCode, 201);
    pageId = createdPage.json().data.id;
    const publishedPage = await app.inject({
      method: 'PATCH', url: `/api/v1/content/pages/${pageId}/status`, headers: authHeaders(adminJar), payload: { status: 'published' }
    });
    assert.equal(publishedPage.statusCode, 200);
    assert.equal(publishedPage.json().data.status, 'published');
    const pageDetail = await app.inject({ method: 'GET', url: `/api/v1/content/pages/${pageId}`, headers: authHeaders(adminJar) });
    assert.equal(pageDetail.statusCode, 200);
    assert.equal(pageDetail.json().data.id, pageId);

    const createdPostCategory = await app.inject({
      method: 'POST', url: '/api/v1/content/post-categories', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, name: `Audit jurnal mövzusu ${suffix}`, description: 'Avtomatik jurnal kateqoriyası auditi' }
    });
    assert.equal(createdPostCategory.statusCode, 201);
    postCategoryId = createdPostCategory.json().data.id;

    const createdPost = await app.inject({
      method: 'POST', url: '/api/v1/content/posts', headers: authHeaders(adminJar),
      payload: { ...contentPayload, title: `Audit məqaləsi ${suffix}`, slug: `audit-post-${suffix}`, seoTitle: `Audit məqaləsi ${suffix}`, categoryId: postCategoryId, featuredAssetId: mediaId, postType: 'guide' }
    });
    assert.equal(createdPost.statusCode, 201);
    postId = createdPost.json().data.id;
    const reviewedPost = await app.inject({
      method: 'PATCH', url: `/api/v1/content/posts/${postId}/status`, headers: authHeaders(adminJar), payload: { status: 'review' }
    });
    assert.equal(reviewedPost.statusCode, 200);
    assert.equal(reviewedPost.json().data.status, 'review');
    const postDetail = await app.inject({ method: 'GET', url: `/api/v1/content/posts/${postId}`, headers: authHeaders(adminJar) });
    assert.equal(postDetail.statusCode, 200);
    assert.equal(postDetail.json().data.category_id, postCategoryId);
    assert.equal(postDetail.json().data.featured_asset_id, mediaId);

    const createdJournal = await app.inject({
      method: 'POST', url: '/api/v1/publishing/journal', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, issueNumber: `AUD-${suffix}`, title: `Audit jurnal buraxılışı ${suffix}`, description: 'Jurnal idarəetmə axınının avtomatik auditi.', coverAssetId: mediaId, pdfAssetId: pdfMediaId }
    });
    assert.equal(createdJournal.statusCode, 201, createdJournal.body);
    journalId = createdJournal.json().data.id;
    const publishedJournal = await app.inject({ method: 'PATCH', url: `/api/v1/publishing/journal/${journalId}/status`, headers: authHeaders(adminJar), payload: { status: 'published' } });
    assert.equal(publishedJournal.statusCode, 200);
    assert.equal(publishedJournal.json().data.status, 'published');
    const journals = await app.inject({ method: 'GET', url: `/api/v1/publishing/journal?search=${suffix}`, headers: authHeaders(adminJar) });
    assert.equal(journals.statusCode, 200);
    assert.ok(journals.json().data.some((row: { id: string }) => row.id === journalId));

    const serviceCategory=await pool.query<{id:string}>(`SELECT sc.id FROM service_categories sc
      WHERE sc.store_id=$1 AND sc.status='active' AND NOT EXISTS(SELECT 1 FROM service_categories child WHERE child.parent_id=sc.id AND child.status='active')
      ORDER BY sc.position,sc.name LIMIT 1`,[storeRow.id]);
    assert.ok(serviceCategory.rows[0]?.id);

    const vendorServiceCategories=await app.inject({method:'GET',url:`/api/v1/publishing/service-categories?storeId=${storeRow.id}`,headers:authHeaders(vendorAccountJar)});
    assert.equal(vendorServiceCategories.statusCode,200,vendorServiceCategories.body);
    const createdClassified = await app.inject({
      method: 'POST', url: '/api/v1/publishing/classifieds', headers: authHeaders(vendorAccountJar),
      payload: { storeId: storeRow.id, vendorId, category: 'service', serviceCategoryId: serviceCategory.rows[0]!.id, title: `Audit elanı ${suffix}`, description: 'Elan moderasiya axınının avtomatik auditi.', price: 25, currency: 'AZN', phone: '+994501112233', city: 'Bakı', mediaIds: [mediaId] }
    });
    assert.equal(createdClassified.statusCode, 201, createdClassified.body);
    classifiedId = createdClassified.json().data.id;
    const classifiedDetail = await app.inject({ method: 'GET', url: `/api/v1/publishing/classifieds/${classifiedId}`, headers: authHeaders(adminJar) });
    const vendorClassifieds=await app.inject({method:'GET',url:`/api/v1/publishing/classifieds?search=${suffix}`,headers:authHeaders(vendorAccountJar)});
    assert.equal(vendorClassifieds.statusCode,200,vendorClassifieds.body);
    assert.ok(vendorClassifieds.json().data.some((row:{id:string;vendor_id:string})=>row.id===classifiedId&&row.vendor_id===vendorId));
    assert.equal(classifiedDetail.statusCode, 200);
    assert.equal(classifiedDetail.json().data.media[0].id, mediaId);
    const publishedClassified = await app.inject({ method: 'PATCH', url: `/api/v1/publishing/classifieds/${classifiedId}/status`, headers: authHeaders(adminJar), payload: { status: 'published' } });
    assert.equal(publishedClassified.statusCode, 200);
    assert.equal(publishedClassified.json().data.status, 'published');
    const protectedMedia = await app.inject({ method: 'DELETE', url: `/api/v1/media/${mediaId}`, headers: authHeaders(adminJar) });
    assert.equal(protectedMedia.statusCode, 400);
    assert.equal(protectedMedia.json().error.code, 'MEDIA_IN_USE');

    const createdCluster = await app.inject({
      method: 'POST', url: '/api/v1/content/seo/clusters', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, name: `Audit klasteri ${suffix}`, primaryKeyword: `audit ${suffix}`, searchIntent: 'informational', targetAudience: 'Audit auditoriyası' }
    });
    assert.equal(createdCluster.statusCode, 201);
    seoClusterId = createdCluster.json().data.id;
    const searchedCluster = await app.inject({
      method: 'GET', url: `/api/v1/content/seo/clusters?search=${suffix}`, headers: authHeaders(adminJar)
    });
    assert.equal(searchedCluster.statusCode, 200);
    assert.ok(searchedCluster.json().data.some((row: { id: string }) => row.id === seoClusterId));

    const startsAt = new Date(Date.now() + 3_600_000).toISOString();
    const endsAt = new Date(Date.now() + 7_200_000).toISOString();
    const createdCampaign = await app.inject({
      method: 'POST', url: '/api/v1/marketing/campaigns', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, vendorId, name: `Audit kampaniyası ${suffix}`, slug: `audit-campaign-${suffix}`, campaignType: 'limited', startsAt, endsAt, description: 'Audit kampaniyası', goals: {}, targeting: {} }
    });
    assert.equal(createdCampaign.statusCode, 201);
    campaignId = createdCampaign.json().data.id;
    const activatedCampaign = await app.inject({
      method: 'PATCH', url: `/api/v1/marketing/campaigns/${campaignId}/status`, headers: authHeaders(adminJar), payload: { status: 'active' }
    });
    assert.equal(activatedCampaign.statusCode, 200);
    assert.equal(activatedCampaign.json().data.status, 'active');

    const createdCoupon = await app.inject({
      method: 'POST', url: '/api/v1/marketing/coupons', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, vendorId, campaignId, name: `Audit kuponu ${suffix}`, codePrefix: `A${suffix.slice(0, 6)}`, discountType: 'percentage', discountValue: 10, minimumOrder: 0, perUserLimit: 1, startsAt, expiresAt: endsAt, rules: {} }
    });
    assert.equal(createdCoupon.statusCode, 201);
    couponId = createdCoupon.json().data.id;
    const pausedCoupon = await app.inject({
      method: 'PATCH', url: `/api/v1/marketing/coupons/${couponId}/status`, headers: authHeaders(adminJar), payload: { status: 'inactive' }
    });
    assert.equal(pausedCoupon.statusCode, 200);
    assert.equal(pausedCoupon.json().data.status, 'inactive');
    const searchedCoupon = await app.inject({ method: 'GET', url: `/api/v1/marketing/coupons?search=${suffix}`, headers: authHeaders(adminJar) });
    assert.equal(searchedCoupon.statusCode, 200);
    assert.ok(searchedCoupon.json().data.some((row: { id: string }) => row.id === couponId));

    const createdQr = await app.inject({
      method: 'POST', url: '/api/v1/marketing/qr', headers: authHeaders(adminJar),
      payload: { storeId: storeRow.id, vendorId, campaignId, name: `Audit QR ${suffix}`, qrType: 'store', targetUrl: `https://example.com/audit-${suffix}`, perUserLimit: 1, rules: {} }
    });
    assert.equal(createdQr.statusCode, 201);
    qrId = createdQr.json().data.id;
    const pausedQr = await app.inject({
      method: 'PATCH', url: `/api/v1/marketing/qr/${qrId}/status`, headers: authHeaders(adminJar), payload: { status: 'inactive' }
    });
    assert.equal(pausedQr.statusCode, 200);
    assert.equal(pausedQr.json().data.status, 'inactive');
    const searchedQr = await app.inject({ method: 'GET', url: `/api/v1/marketing/qr?search=${suffix}`, headers: authHeaders(adminJar) });
    assert.equal(searchedQr.statusCode, 200);
    assert.ok(searchedQr.json().data.some((row: { id: string }) => row.id === qrId));

    const inventory = await app.inject({ method: 'GET', url: '/api/v1/catalog/inventory?limit=1', headers: authHeaders(adminJar) });
    assert.equal(inventory.statusCode, 200);
    assert.ok(inventory.json().data.length > 0);
    const inventoryRow = inventory.json().data[0];
    const quantityBefore = Number(inventoryRow.quantity);
    const adjusted = await app.inject({
      method: 'POST', url: '/api/v1/catalog/inventory/adjust', headers: authHeaders(adminJar),
      payload: { variantId: inventoryRow.variant_id, warehouseId: inventoryRow.warehouse_id, quantityDelta: 1, note: 'Audit stok artımı', referenceId: inventoryReferences[0] }
    });
    assert.equal(adjusted.statusCode, 200);
    assert.equal(Number(adjusted.json().data.quantity), quantityBefore + 1);
    const reverted = await app.inject({
      method: 'POST', url: '/api/v1/catalog/inventory/adjust', headers: authHeaders(adminJar),
      payload: { variantId: inventoryRow.variant_id, warehouseId: inventoryRow.warehouse_id, quantityDelta: -1, note: 'Audit stok bərpası', referenceId: inventoryReferences[1] }
    });
    assert.equal(reverted.statusCode, 200);
    assert.equal(Number(reverted.json().data.quantity), quantityBefore);

    const currentSettings = await app.inject({ method: 'GET', url: '/api/v1/settings', headers: authHeaders(adminJar) });
    assert.equal(currentSettings.statusCode, 200);
    assert.equal(currentSettings.json().data.id, storeRow.id);
    const savedSettings = await app.inject({
      method: 'PATCH', url: `/api/v1/settings/${storeRow.id}`, headers: authHeaders(adminJar),
      payload: { name: storeRow.name, locale: storeRow.locale, currency: storeRow.currency.trim(), timezone: storeRow.timezone }
    });
    assert.equal(savedSettings.statusCode, 200);
    assert.equal(savedSettings.json().data.timezone, storeRow.timezone);

    const suspendedOwner = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${ownerId}/status`, headers: authHeaders(adminJar), payload: { status: 'suspended' }
    });
    assert.equal(suspendedOwner.statusCode, 200);
    const revokedOwnerSession = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: authHeaders(ownerJar) });
    assert.equal(revokedOwnerSession.statusCode, 401);
    const suspendedCustomerState = await app.inject({ method: 'GET', url: '/api/v1/customer/state', headers: authHeaders(ownerJar) });
    assert.equal(suspendedCustomerState.statusCode, 200);
    assert.equal(suspendedCustomerState.json().data.profile.authenticated, false);
    const suspendedLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email: ownerEmail, password: ownerPassword }
    });
    assert.equal(suspendedLogin.statusCode, 401);

    const refreshed = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie: cookieHeader(originalCustomerJar) } });
    assert.equal(refreshed.statusCode, 200);
    const refreshedCustomerJar = mergeCookies(refreshed, originalCustomerJar);
    const reused = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { cookie: cookieHeader(originalCustomerJar) } });
    assert.equal(reused.statusCode, 401);
    assert.equal(reused.json().error.code, 'SESSION_REUSE_DETECTED');
    const revokedFamily = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: authHeaders(refreshedCustomerJar) });
    assert.equal(revokedFamily.statusCode, 401);

    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: authHeaders(adminJar) });
    assert.equal(logout.statusCode, 204);
    const loggedOutSession = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: authHeaders(adminJar) });
    assert.equal(loggedOutSession.statusCode, 401);
    const loggedOutCustomerState = await app.inject({ method: 'GET', url: '/api/v1/customer/state', headers: authHeaders(adminJar) });
    assert.equal(loggedOutCustomerState.statusCode, 200);
    assert.equal(loggedOutCustomerState.json().data.profile.authenticated, false);

    const adminScript = await app.inject({ method: 'GET', url: '/admin/admin.js' });
    assert.equal(adminScript.statusCode, 200);
    assert.match(adminScript.body, /\/catalog\/inventory/);
    assert.match(adminScript.body, /data-user-status/);
    assert.match(adminScript.body, /data-vendor-status/);
    assert.match(adminScript.body, /\/settings\/\$\{settingsForm\.dataset\.storeId\}/);
    assert.match(adminScript.body, /\/publishing\/journal/);
    assert.match(adminScript.body, /\/publishing\/classifieds/);
    assert.match(adminScript.body, /\/catalog\/product-identifiers\/preview/);
    assert.match(adminScript.body, /data-product-sku/);
    assert.doesNotMatch(adminScript.body, /Sistem avtomatik yaradacaq|Variant SKU-su|Variant adı|Barkod/);
    assert.match(adminScript.body, /data-product-attributes/);
    assert.match(adminScript.body, /data-product-image-input/);
    assert.match(adminScript.body, /Yeni brend əlavə et/);
    assert.match(adminScript.body, /Satıcı kabineti hesabı/);
    assert.match(adminScript.body, /pdfUpload/);
    assert.match(adminScript.body, /data-user-edit/);
    assert.match(adminScript.body, /data-user-delete/);
    assert.match(adminScript.body, /vendorPortalViews/);
    assert.match(adminScript.body, /moderatorViews/);
    assert.match(adminScript.body, /isModeratorOnly/);
    assert.match(adminScript.body, /\['posts', '≡', 'Məqalələr', 'posts\.read'\]/);
    assert.match(adminScript.body, /\['journal', '▥', 'Jurnal buraxılışları', 'journal\.read'\]/);
    assert.doesNotMatch(adminScript.body, /attributesJson/);
    assert.match(adminScript.body, /mountSiteEditor/);
    const editorScript = await app.inject({ method: 'GET', url: '/admin/site-editor.js' });
    assert.equal(editorScript.statusCode, 200);
    assert.match(editorScript.body, /Qaralamanı saxla/);
    assert.match(editorScript.body, /data-editor-preview/);
    assert.match(editorScript.body, /data-editor-selection/);
  } finally {
    await pool.query('DELETE FROM inventory_movements WHERE reference_id=ANY($1::text[])', [inventoryReferences]);
    if (qrId) await pool.query('DELETE FROM qr_codes WHERE id=$1', [qrId]);
    if (couponId) await pool.query('DELETE FROM coupons WHERE id=$1', [couponId]);
    if (campaignId) await pool.query('DELETE FROM campaigns WHERE id=$1', [campaignId]);
    if (seoClusterId) await pool.query('DELETE FROM seo_clusters WHERE id=$1', [seoClusterId]);
    if (classifiedId) await pool.query('DELETE FROM classified_listings WHERE id=$1', [classifiedId]);
    if (journalId) await pool.query('DELETE FROM journal_issues WHERE id=$1', [journalId]);
    if (postId) await pool.query('DELETE FROM posts WHERE id=$1', [postId]);
    if (postCategoryId) await pool.query('DELETE FROM post_categories WHERE id=$1', [postCategoryId]);
    if (pageId) await pool.query('DELETE FROM pages WHERE id=$1', [pageId]);
    if (rewardId) await pool.query('DELETE FROM rewards WHERE id=$1', [rewardId]);
    if (productId) {
      await pool.query("DELETE FROM inventory_movements WHERE reference_type='product' AND reference_id=$1", [productId]);
      await pool.query('DELETE FROM products WHERE id=$1', [productId]);
    }
    for (const assetId of [mediaId, pdfMediaId].filter(Boolean)) {
      const media = await pool.query<{ storage_key: string }>('SELECT storage_key FROM media_assets WHERE id=$1', [assetId]);
      await pool.query('DELETE FROM media_assets WHERE id=$1', [assetId]);
      if (media.rows[0]?.storage_key) {
        const { unlink } = await import('node:fs/promises');
        const { resolve } = await import('node:path');
        await unlink(resolve(env.UPLOAD_DIR, media.rows[0].storage_key)).catch(() => undefined);
      }
    }
    if (brandId) await pool.query('DELETE FROM brands WHERE id=$1', [brandId]);
    for (const currentCategoryId of [subcategoryId, mainCategoryId, categoryId].filter(Boolean)) {
      await pool.query('DELETE FROM categories WHERE id=$1', [currentCategoryId]);
    }
    if (createdUserIds.length || vendorId) {
      await pool.query(`DELETE FROM audit_logs WHERE actor_user_id=ANY($1::uuid[])
        OR entity_id=ANY($2::text[]) OR vendor_id=$3`, [createdUserIds, [...createdUserIds, vendorId].filter(Boolean), vendorId || null]);
    }
    if (editorStoreId) {
      await pool.query('DELETE FROM audit_logs WHERE store_id=$1', [editorStoreId]);
      await pool.query('DELETE FROM stores WHERE id=$1', [editorStoreId]);
    }
    if (createdUserIds.length) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [createdUserIds]);
    if (vendorId) await pool.query('DELETE FROM vendors WHERE id=$1', [vendorId]);
    await app.close();
  }
});
