import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'index.html');
let html = await readFile(file, 'utf8');

const products = [
  ['Milwaukee M18 zərbəli drel dəsti', 'milwaukee-m18-zerbeli-drel-desti', 'Milwaukee', 549, 629, 'milwaukee-brand-product.webp'],
  ['DeWalt XR simsiz vintaçan', 'dewalt-xr-simsiz-vintacan', 'DeWalt', 389, 449, 'dewolt-brand-product-2.webp'],
  ['Makita peşəkar bucaq cilalayıcı', 'makita-pesekar-bucaq-cilalayici', 'Makita', 279, 319, 'makitta-brand-product.webp'],
  ['Bosch Professional alət dəsti', 'bosch-professional-alet-desti', 'Bosch', 699, 789, 'bosch-brand-product-2.webp'],
  ['Festool dəqiq kəsim mişarı', 'festool-deqiq-kesim-misari', 'Festool', 1199, 1349, 'festool-brand-product.webp'],
  ['Metabo universal emalatxana dəsti', 'metabo-universal-emalatxana-desti', 'Metabo', 459, 519, 'melabo-brand-product.webp'],
  ['JET masaüstü ağac dəzgahı', 'jet-masaustu-agac-dezgahi', 'JET', 949, 1099, 'jet-brand-product.webp'],
  ['MAX pnevmatik mismar tapançası', 'max-pnevmatik-mismar-tapancasi', 'MAX', 429, 479, 'max-brand-product.webp'],
  ['Milwaukee yüksək torklu zərbəli açar', 'milwaukee-yuksek-torklu-zerbeli-acar', 'Milwaukee', 619, 699, 'impact-wrenches.webp'],
  ['Bosch yaşıl lazer səviyyəölçən', 'bosch-yasil-lazer-seviyyeolcen', 'Bosch', 239, 279, 'laser-levels.webp'],
  ['Makita akkumulyatorlu dairəvi mişar', 'makita-akkumulyatorlu-dairevi-misar', 'Makita', 489, 559, 'saws.webp'],
  ['DeWalt orbital zımpara cihazı', 'dewalt-orbital-zimpara-cihazi', 'DeWalt', 219, 259, 'sanders.webp'],
  ['Klein Tools elektrikçi alət dəsti', 'klein-tools-elektrikci-alet-desti', 'Klein Tools', 329, 379, 'hand-tools.webp'],
  ['Stabila maqnitli su tərəzisi', 'stabila-maqnitli-su-terezisi', 'Stabila', 149, 179, 'levels.webp'],
  ['RIKON dəzgahüstü qazma dəzgahı', 'rikon-dezgahustu-qazma-dezgahi', 'RIKON', 799, 899, 'drills.webp'],
  ['Rolair səssiz hava kompressoru', 'rolair-sessiz-hava-kompressoru', 'Rolair', 729, 829, 'air-compressors.webp'],
  ['ToughBuilt modul alət çantası', 'toughbuilt-modul-alet-cantasi', 'ToughBuilt', 189, 229, 'Tool-Accessories-1.webp'],
  ['Triton dəqiq frez aləti', 'triton-deqiq-frez-aleti', 'Triton', 579, 649, 'power-tools.webp'],
  ['Stanley çəkic və toxmaq dəsti', 'stanley-cekic-ve-toxmaq-desti', 'Stanley', 119, 149, 'hammers-mallets.webp'],
  ['Milwaukee Shockwave burğu dəsti', 'milwaukee-shockwave-burgu-desti', 'Milwaukee', 169, 199, 'drill-bits.webp']
];

const newsItems = [
  ['2026-cı ildə düzgün elektrik aləti necə seçilməlidir?', 'duzgun-elektrik-aleti-nece-secilmelidir', 'Alış-veriş bələdçisi', '2026-07-20', 'jurnal/alis-veris-meslehetleri.jpg'],
  ['Endirim kampaniyasında ağıllı alış-verişin 7 qaydası', 'endirim-kampaniyasinda-agilli-alis-veris', 'Kampaniyalar', '2026-07-18', 'kampaniyalar/movsumi-endirimler.jpg'],
  ['Baku Pro Market: yerli satıcının rəqəmsal inkişaf hekayəsi', 'baku-pro-market-reqemsal-inkisaf-hekayesi', 'Brend hekayəsi', '2026-07-15', 'jurnal/brend-hekayeleri.jpg'],
  ['Yay fürsətlərini qaçırmamaq üçün praktik alış-veriş planı', 'yay-fursetleri-alis-veris-plani', 'Məsləhətlər', '2026-07-12', 'endirimler.jpg'],
  ['TVShop jurnalının yeni rəqəmsal buraxılışı yayımlandı', 'tvshop-yeni-reqemsal-buraxilis', 'TVShop jurnalı', '2026-07-10', 'jurnal/son-buraxilis.jpg'],
  ['Yerli brendlər rəqəmsal vitrində necə fərqlənə bilər?', 'yerli-brendler-reqemsal-vitrin', 'Biznes', '2026-07-08', 'biznes/brend-vitrini.jpg'],
  ['Bakı Club üzvləri üçün yeni hədiyyə imkanları', 'baki-club-yeni-hediyyeler', 'Bakı Club', '2026-07-05', 'baki-club/giveawayler.jpg'],
  ['Ayın ən çox oxunan alış-veriş və şəhər hekayələri', 'ayin-en-cox-oxunan-hekayeleri', 'Arxiv', '2026-07-02', 'jurnal/arxiv.jpg']
];

const defaultWishlist = new Set([
  'dewalt-xr-simsiz-vintacan',
  'jet-masaustu-agac-dezgahi',
  'klein-tools-elektrikci-alet-desti',
  'triton-deqiq-frez-aleti'
]);
const money = new Intl.NumberFormat('az-AZ', { style: 'currency', currency: 'AZN' });
const compactMoney = new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 0 });

function encodedJson(value) {
  return JSON.stringify(value).replaceAll('&', '&amp;').replaceAll("'", '&#39;').replaceAll('"', '&quot;');
}

function quickViewData(title, slug, brand, price, compareAt, image) {
  return {
    slug,
    title,
    brand,
    vendor: 'Baku Pro Market',
    sku: slug.split('-').map((part) => part[0]).join('').toUpperCase().slice(0, 8),
    description: `${title} gündəlik və peşəkar istifadə üçün etibarlı performans, rahat idarəetmə və davamlı konstruksiya təqdim edir.`,
    shortDescription: `${brand} brendinin seçilmiş peşəkar məhsulu.`,
    attributes: { Brend: brand, Zəmanət: '12 ay', Çatdırılma: 'Bakı daxili' },
    productType: 'Fiziki məhsul',
    stock: 12,
    price,
    compareAt,
    image
  };
}

function card([title, slug, brand, price, compareAt, image], { featured = false, featuredIndex = 0 } = {}) {
  const discount = Math.round((1 - price / compareAt) * 100);
  const imageUrl = `/assets/wp-content/uploads/${image}`;
  const sku = slug.split('-').map((part) => part[0]).join('').toUpperCase().slice(0, 8);
  const cartItem = encodedJson({ slug, title, price, image: imageUrl });
  const quickView = encodedJson(quickViewData(title, slug, brand, price, compareAt, imageUrl));
  const liked = featured && defaultWishlist.has(slug);
  const picked = featured && [0, 6, 10, 15].includes(featuredIndex);
  const actions = featured
    ? `<div class="db-product-actions" aria-label="${title} əməliyyatları">
      <button class="db-product-action db-product-wishlist${liked ? ' active' : ''}" type="button" aria-label="${title} seçilmişlərə əlavə et" aria-pressed="${liked}" data-wishlist="${slug}"${liked ? ' data-default-wishlist="true"' : ''}><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Seçilmişlərə əlavə et</span></button>
      <button class="db-product-action db-product-quick-view" type="button" aria-label="${title} üçün sürətli baxış" data-quick-view="${quickView}"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Sürətli baxış</span></button>
      <a class="db-product-action db-product-whatsapp" href="https://wa.me/994502645400?text=${encodeURIComponent(`${title} haqqında məlumat almaq istəyirəm`)}" target="_blank" rel="noopener noreferrer" aria-label="${title} haqqında WhatsApp ilə soruş"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">WhatsApp</span></a>
    </div>`
    : `<button class="db-product-wishlist" type="button" aria-label="${title} seçilmişlərə əlavə et" aria-pressed="false" data-wishlist="${slug}"><span aria-hidden="true">♡</span></button>`;
  const badge = picked
    ? '<span class="db-product-pick" aria-label="Tövsiyə olunan məhsul"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7.5 10.2 11 3.5c.7-1.2 2.5-.5 2.2.9l-.7 3.5h5.8c1.4 0 2.5 1.3 2.1 2.7l-2 7a2.8 2.8 0 0 1-2.7 2H7.5m0-9.4v9.4H3.7v-9.4h3.8Z"/></svg></span>'
    : featured ? '' : `<span class="db-product-sale">-${discount}%</span>`;
  const content = featured
    ? `<div class="db-product-content"><p class="db-product-sku">SKU: ${sku}</p><h3 itemprop="name"><a href="/mehsul/${slug}/">${title}</a></h3><div class="db-product-bottom" itemprop="offers" itemscope itemtype="https://schema.org/Offer"><div class="db-product-price"><strong itemprop="price" content="${price}">${compactMoney.format(price)} ₼</strong></div><meta itemprop="priceCurrency" content="AZN"><link itemprop="availability" href="https://schema.org/InStock"><button class="db-add-cart" type="button" data-add-cart="${cartItem}" aria-label="${title} səbətə əlavə et"><span class="db-cart-icon" aria-hidden="true"></span></button></div></div>`
    : `<div class="db-product-content"><p class="db-product-brand">${brand}</p><h3 itemprop="name"><a href="/mehsul/${slug}/">${title}</a></h3><div class="db-product-rating" aria-label="5 ulduzdan 5">★★★★★ <span>(24)</span></div><div class="db-product-bottom" itemprop="offers" itemscope itemtype="https://schema.org/Offer"><div class="db-product-price"><strong itemprop="price" content="${price}">${money.format(price)}</strong><del>${money.format(compareAt)}</del></div><meta itemprop="priceCurrency" content="AZN"><link itemprop="availability" href="https://schema.org/InStock"><button class="db-add-cart" type="button" data-add-cart="${cartItem}" aria-label="${title} səbətə əlavə et">Səbətə at</button></div></div>`;
  return `<article class="db-product-card" itemscope itemtype="https://schema.org/Product">
  <div class="db-product-media">${badge}${actions}<a href="/mehsul/${slug}/" aria-label="${title}"><img src="./assets/wp-content/uploads/${image}" alt="${title} — məhsul şəkli" loading="lazy" decoding="async" width="420" height="320" itemprop="image"></a></div>
  ${content}
</article>`;
}

function featuredProducts() {
  return `<div class="db-featured-viewport" tabindex="0" aria-label="Seçilmiş fürsətlər məhsul slayderi">
  <div class="db-featured-track">
    ${products.map((product, index) => card(product, { featured: true, featuredIndex: index })).join('\n')}
  </div>
</div>
<p class="db-featured-status seo-page-title" role="status" aria-live="polite">İlk məhsul sütunu göstərilir</p>`;
}

function popularCard([title, slug, brand, price, compareAt, image], index, variant = 'popular') {
  const imageUrl = `/assets/wp-content/uploads/${image}`;
  const sku = slug.split('-').map((part) => part[0]).join('').toUpperCase().slice(0, 8);
  const cartItem = encodedJson({ slug, title, price, image: imageUrl });
  const quickView = encodedJson(quickViewData(title, slug, brand, price, compareAt, imageUrl));
  const liked = defaultWishlist.has(slug);
  const topPicks = variant === 'top-picks';
  const sale = !topPicks && [1, 8, 15].includes(index);
  const hot = topPicks && index === 3;
  const fresh = topPicks && index === 7;
  const picked = topPicks ? index === 5 : [3, 6, 13].includes(index);
  const ratingIndexes = topPicks ? [0, 5, 6] : [1, 6, 12];
  const rating = ratingIndexes.includes(index)
    ? '<span class="db-popular-rating"><span aria-hidden="true">★</span> 5.0 / 1</span>'
    : '';
  const badge = hot
    ? '<span class="db-top-picks-badge hot">HİT!</span>'
    : fresh
      ? '<span class="db-top-picks-badge new">YENİ</span>'
      : sale
    ? '<span class="db-popular-sale">ENDİRİM!</span>'
    : picked
      ? '<span class="db-popular-pick" aria-label="Tövsiyə olunan məhsul"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7.5 10.2 11 3.5c.7-1.2 2.5-.5 2.2.9l-.7 3.5h5.8c1.4 0 2.5 1.3 2.1 2.7l-2 7a2.8 2.8 0 0 1-2.7 2H7.5m0-9.4v9.4H3.7v-9.4h3.8Z"/></svg></span>'
      : '';
  return `<article class="db-popular-card" itemscope itemtype="https://schema.org/Product">
  <div class="db-popular-media">${badge}<a href="/mehsul/${slug}/" aria-label="${title}"><img src="./assets/wp-content/uploads/${image}" alt="${title} — məhsul şəkli" loading="lazy" decoding="async" width="320" height="240" itemprop="image"></a>
    <div class="db-popular-actions" aria-label="${title} əməliyyatları">
      <button class="db-popular-action db-product-wishlist${liked ? ' active' : ''}" type="button" aria-label="${title} seçilmişlərə əlavə et" aria-pressed="${liked}" data-wishlist="${slug}"${liked ? ' data-default-wishlist="true"' : ''}><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Seçilmişlərə əlavə et</span></button>
      <button class="db-popular-action db-product-quick-view" type="button" aria-label="${title} üçün sürətli baxış" data-quick-view="${quickView}"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Sürətli baxış</span></button>
      <a class="db-popular-action db-product-whatsapp" href="https://wa.me/994502645400?text=${encodeURIComponent(`${title} haqqında məlumat almaq istəyirəm`)}" target="_blank" rel="noopener noreferrer" aria-label="${title} haqqında WhatsApp ilə soruş"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">WhatsApp</span></a>
    </div>
  </div>
  <div class="db-popular-content"><div class="db-popular-meta"><p>SKU: ${sku}</p>${rating}</div><h3 itemprop="name"><a href="/mehsul/${slug}/">${title}</a></h3><div class="db-popular-price" itemprop="offers" itemscope itemtype="https://schema.org/Offer"><strong itemprop="price" content="${price}">${compactMoney.format(price)} ₼</strong><meta itemprop="priceCurrency" content="AZN"><link itemprop="availability" href="https://schema.org/InStock"></div><button class="db-popular-cart db-add-cart" type="button" data-add-cart="${cartItem}" aria-label="${title} səbətə əlavə et"><span class="db-cart-icon" aria-hidden="true"></span><span>SƏBƏTƏ AT</span></button></div>
</article>`;
}

function popularProducts() {
  const popular = [...products.slice(1), products[0]];
  const dots = Array.from({ length: 7 }, (_, index) => `<button${index === 0 ? ' class="active"' : ''} type="button" role="tab" aria-selected="${index === 0}" aria-label="${index + 1}-ci məhsul mövqeyi" data-popular-page="${index}"></button>`).join('');
  return `<div class="db-popular-viewport" tabindex="0" aria-label="Ən populyar məhsullar slayderi"><div class="db-popular-track">${popular.map(popularCard).join('\n')}</div></div>
<div class="db-popular-navigation" aria-label="Məhsul slayderi idarələri"><button type="button" data-popular-prev aria-label="Əvvəlki məhsul sütunu" disabled><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button><button type="button" data-popular-next aria-label="Növbəti məhsul sütunu"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button></div>
<div class="db-popular-pagination" role="tablist" aria-label="Məhsul mövqeləri">${dots}</div>
<p class="db-popular-status seo-page-title" role="status" aria-live="polite">İlk məhsul sütunu göstərilir</p>`;
}

function topPicksProducts(offset) {
  const selected = [...products.slice(offset), ...products.slice(0, offset)].slice(0, 12);
  const dots = Array.from({ length: 3 }, (_, index) => `<button${index === 0 ? ' class="active"' : ''} type="button" role="tab" aria-selected="${index === 0}" aria-label="${index + 1}-ci məhsul mövqeyi" data-top-picks-page="${index}"></button>`).join('');
  return `<div class="db-top-picks-viewport" tabindex="0" aria-label="Ən çox seçilən məhsullar slayderi"><div class="db-top-picks-track">${selected.map((product, index) => popularCard(product, index, 'top-picks')).join('\n')}</div></div>
<div class="db-top-picks-navigation" aria-label="Məhsul slayderi idarələri"><button type="button" data-top-picks-prev aria-label="Əvvəlki məhsul sütunu" disabled><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button><button type="button" data-top-picks-next aria-label="Növbəti məhsul sütunu"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button></div>
<div class="db-top-picks-pagination" role="tablist" aria-label="Məhsul mövqeləri">${dots}</div>
<p class="db-top-picks-status seo-page-title" role="status" aria-live="polite">İlk məhsul sütunu göstərilir</p>`;
}

function newsCard([title, slug, category, date, image]) {
  const parsedDate = new Date(`${date}T12:00:00`);
  const day = new Intl.DateTimeFormat('az-AZ', { day: '2-digit' }).format(parsedDate);
  const month = new Intl.DateTimeFormat('az-AZ', { month: 'short' }).format(parsedDate).replace('.', '').toLocaleUpperCase('az-AZ');
  return `<article class="db-news-card">
  <a class="db-news-media" href="/jurnal/${slug}/" aria-label="${title}"><img src="./assets/images/categories/${image}" alt="${title}" loading="lazy" decoding="async" width="640" height="640"><time datetime="${date}" class="db-news-date"><strong>${day}</strong><span>${month}</span></time></a>
  <div class="db-news-content"><p class="db-news-category">${category}</p><h3><a href="/jurnal/${slug}/">${title}</a></h3><a class="db-news-read" href="/jurnal/${slug}/">Ətraflı oxu <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></a></div>
</article>`;
}

function newsSlider() {
  const dots = Array.from({ length: 6 }, (_, index) => `<button${index === 0 ? ' class="active"' : ''} type="button" role="tab" aria-selected="${index === 0}" aria-label="${index + 1}-ci xəbər mövqeyi" data-news-page="${index}"></button>`).join('');
  return `<div class="db-news-viewport" tabindex="0" aria-label="TVShop yenilikləri slayderi"><div class="db-news-track">${newsItems.map(newsCard).join('\n')}</div></div>
<div class="db-news-navigation" aria-label="Xəbər slayderi idarələri"><button type="button" data-news-prev aria-label="Əvvəlki xəbər" disabled><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button><button type="button" data-news-next aria-label="Növbəti xəbər"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button></div>
<div class="db-news-pagination" role="tablist" aria-label="Xəbər mövqeləri">${dots}</div>
<p class="db-news-status seo-page-title" role="status" aria-live="polite">İlk xəbər göstərilir</p>`;
}

function replaceProductContainer(id, offset, count) {
  const markerAt = html.indexOf(`id="${id}"`);
  if (markerAt < 0) throw new Error(`${id} məhsul konteyneri tapılmadı`);
  const start = html.lastIndexOf('<div', markerAt);
  const openingEnd = html.indexOf('>', markerAt) + 1;
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = openingEnd;
  let depth = 1;
  let end = openingEnd;
  while (depth > 0) {
    const match = tagPattern.exec(html);
    if (!match) throw new Error(`${id} məhsul konteyneri bağlanmayıb`);
    depth += match[0].startsWith('</') ? -1 : 1;
    end = match.index + match[0].length;
  }

  const featured = id === '4dee5e4';
  const popular = id === '52657d1';
  const topPicks = ['dcbe431', '47e695a', 'a66ade4', 'd6aa696'].includes(id);
  const opening = html.slice(start, openingEnd)
    .replace(/class="[^"]*"/, `class="${featured ? 'db-featured-products' : popular ? 'db-popular-products' : topPicks ? 'db-top-picks-products' : 'db-products-grid'}"`)
    .replace(/\sdata-cms-products="[^"]*"/, '')
    .replace(/\sdata-featured-products(?:="[^"]*")?/, '')
    .replace(/\sdata-popular-products(?:="[^"]*")?/, '')
    .replace(/\sdata-top-picks-products(?:="[^"]*")?/, '')
    .replace(/\sid="selected-opportunities"/, '')
    .replace(/\sid="popular-products"/, '')
    .replace(/>$/, ` data-cms-products="static"${featured ? ' data-featured-products id="selected-opportunities"' : popular ? ' data-popular-products id="popular-products"' : topPicks ? ' data-top-picks-products' : ''}>`);
  const content = featured
    ? featuredProducts()
    : popular
      ? popularProducts()
      : topPicks
        ? topPicksProducts(offset)
      : [...products.slice(offset), ...products.slice(0, offset)].slice(0, count).map((product) => card(product)).join('\n');
  html = `${html.slice(0, start)}${opening}\n${content}\n</div>${html.slice(end)}`;
}

[
  ['4dee5e4', 0, 20], ['52657d1', 1, 8], ['dcbe431', 2, 8],
  ['47e695a', 3, 8], ['a66ade4', 4, 8], ['d6aa696', 5, 8]
].forEach(([id, offset, count]) => replaceProductContainer(id, offset, count));

function replaceNewsContainer() {
  const markerAt = html.indexOf('id="bf72957"');
  if (markerAt < 0) throw new Error('bf72957 xəbər konteyneri tapılmadı');
  const start = html.lastIndexOf('<div', markerAt);
  const openingEnd = html.indexOf('>', markerAt) + 1;
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = openingEnd;
  let depth = 1;
  let end = openingEnd;
  while (depth > 0) {
    const match = tagPattern.exec(html);
    if (!match) throw new Error('bf72957 xəbər konteyneri bağlanmayıb');
    depth += match[0].startsWith('</') ? -1 : 1;
    end = match.index + match[0].length;
  }
  const opening = html.slice(start, openingEnd)
    .replace(/class="[^"]*"/, 'class="db-news-slider"')
    .replace(/\sdata-cms-news="[^"]*"/, '')
    .replace(/>$/, ' data-cms-news="static">');
  html = `${html.slice(0, start)}${opening}\n${newsSlider()}\n</div>${html.slice(end)}`;
}

replaceNewsContainer();

await writeFile(file, html);
console.log('Məhsul carouselləri, kateqoriyalı seçimlər və TVShop yenilikləri ilkin HTML-ə yerləşdirildi.');
