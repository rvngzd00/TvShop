import { escapeHtml, money, productCard, safeJson, type ProductView } from './templates.js';

type ProductDetailView = ProductView & {
  product_id: string;
  product_type?: string | null;
};

type ProductMedia = {
  public_url: string;
  alt_text?: string | null;
};

type ProductCategory = {
  name: string;
  slug: string;
  path_slugs?: string[];
};

export type ProductReviewView = {
  id: string;
  author_name: string;
  rating: number;
  title?: string | null;
  body: string;
  verified_purchase?: boolean;
  created_at: string | Date;
};

type ProductDetailOptions = {
  product: ProductDetailView;
  related: ProductView[];
  media: ProductMedia[];
  categories: ProductCategory[];
  reviews: ProductReviewView[];
  reviewSummary: { average: number; count: number };
  cartItem: Record<string, unknown>;
};

const icon = {
  recommended: '<span class="db-product-recommended-icon" aria-hidden="true"></span>',
  zoom: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5M10.8 7.8v6M7.8 10.8h6"/></svg>',
  copy: '<span class="db-product-copy-icon" aria-hidden="true"></span>',
  info: '<span class="db-product-info-icon" aria-hidden="true"></span>',
  heart: '<span class="db-action-icon" aria-hidden="true"></span>',
  whatsapp: '<span class="db-product-whatsapp-icon" aria-hidden="true"></span>',
  truck: '<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M2 5h17v13H2zM19 10h6l5 5v3H19z"/><circle cx="8" cy="20" r="2.5"/><circle cx="25" cy="20" r="2.5"/><path d="M5 2h10M1 10h6M0 14h5"/></svg>',
  cart: '<span class="db-cart-icon" aria-hidden="true"></span>',
  bag: '<span class="db-product-buy-icon" aria-hidden="true"></span>',
  money: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11"/><path d="M16 8v16M20 11.5h-6a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6h-6M7 8l2-4 4 2M25 24l-2 4-4-2"/></svg>',
  secure: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="8" width="20" height="16" rx="2"/><path d="M3 13h20M7 19h6M25 5l5 2v6c0 4-2.2 6.5-5 8-2.8-1.5-5-4-5-8V7l5-2Z"/><path d="m22.5 12 1.7 1.7 3.4-4"/></svg>'
};

function valueText(value: unknown): string {
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${valueText(item)}`)
      .join(', ');
  }
  if (typeof value === 'boolean') return value ? 'Bəli' : 'Xeyr';
  return String(value ?? '').trim();
}

function productTypeText(value: unknown): string {
  const type = valueText(value).toLocaleLowerCase('az-AZ');
  return ({
    physical: 'Fiziki məhsul',
    digital: 'Rəqəmsal məhsul',
    service: 'Xidmət',
    simple: 'Sadə məhsul',
    variable: 'Variantlı məhsul'
  } as Record<string, string>)[type] ?? valueText(value);
}

function attributeLabel(value: string): string {
  const key = value.toLocaleLowerCase('az-AZ').replaceAll('_', '-');
  const labels: Record<string, string> = {
    brand: 'Brend',
    vendor: 'Satıcı',
    demo: 'Nümayiş',
    zemanet: 'Zəmanət',
    zamanet: 'Zəmanət',
    warranty: 'Zəmanət',
    catdirilma: 'Çatdırılma',
    delivery: 'Çatdırılma',
    color: 'Rəng',
    colour: 'Rəng',
    weight: 'Çəki',
    power: 'Güc',
    voltage: 'Gərginlik',
    material: 'Material',
    model: 'Model',
    olcu: 'Ölçü',
    size: 'Ölçü'
  };
  const label = labels[key] ?? value.replaceAll(/[_-]+/g, ' ').trim();
  return label ? `${label.charAt(0).toLocaleUpperCase('az-AZ')}${label.slice(1)}` : value;
}

function brandLogo(brand: string): string {
  const normalized = brand.toLocaleLowerCase('az-AZ');
  const logos: Array<[string, string]> = [
    ['klein', '/assets/wp-content/uploads/color-kleintools.webp'],
    ['milwaukee', '/assets/wp-content/uploads/milwaukee-logo.webp'],
    ['dewalt', '/assets/wp-content/uploads/dewolt-logo.webp'],
    ['makita', '/assets/wp-content/uploads/makita-logo.webp'],
    ['bosch', '/assets/wp-content/uploads/bosch-logo.webp'],
    ['festool', '/assets/wp-content/uploads/festool-logo.webp'],
    ['metabo', '/assets/wp-content/uploads/melabo-logo.webp'],
    ['jet', '/assets/wp-content/uploads/jet-logo.webp'],
    ['max', '/assets/wp-content/uploads/max-logo.webp']
  ];
  return logos.find(([name]) => normalized.includes(name))?.[1] ?? '';
}

function informationRows(product: ProductDetailView): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Brend', valueText(product.brand_name)],
    ['Satıcı', valueText(product.vendor_name)],
    ['Məhsul növü', productTypeText(product.product_type)],
    ['Stok', Number(product.stock) > 0 ? `${Number(product.stock)} ədəd` : 'Stokda yoxdur'],
    ['Məhsul kodu', valueText(product.sku || product.slug.toUpperCase())]
  ];
  Object.entries(product.attributes ?? {}).forEach(([key, value]) => {
    const label = attributeLabel(key);
    if (!rows.some(([existing]) => existing.toLocaleLowerCase('az-AZ') === label.toLocaleLowerCase('az-AZ'))) {
      rows.push([label, valueText(value)]);
    }
  });
  return rows.filter(([, value]) => value);
}

function purchasePanel(product: ProductDetailView, cartJson: string, sticky = false): string {
  const price = Number(product.price);
  const compareAt = Number(product.compare_at_price ?? 0);
  return `<div class="${sticky ? 'db-product-sticky-inner' : 'db-product-purchase-card'}">
    <div class="db-product-purchase-price">
      <strong>${money(price, product.currency)}</strong>
      ${compareAt > price ? `<del>${money(compareAt, product.currency)}</del>` : ''}
    </div>
    <div class="db-product-quantity" role="group" aria-label="Məhsul sayı">
      <button type="button" data-product-quantity="-1" aria-label="Sayı azalt">−</button>
      <output data-product-quantity-output aria-live="polite">1</output>
      <button type="button" data-product-quantity="1" aria-label="Sayı artır">+</button>
    </div>
    <button class="db-product-add-cart" type="button" data-add-cart="${escapeHtml(cartJson)}" aria-label="${escapeHtml(product.title)} məhsulunu səbətə əlavə et">${icon.cart}<b>${sticky ? '' : 'SƏBƏTƏ AT'}</b></button>
    <button class="db-product-buy-now" type="button" data-add-cart="${escapeHtml(cartJson)}" data-product-buy-now aria-label="${escapeHtml(product.title)} məhsulunu indi al">${icon.bag}<b>${sticky ? '' : 'İNDİ AL'}</b></button>
  </div>`;
}

function stars(rating: number): string {
  const normalized = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `<span class="db-review-stars" aria-label="5 üzərindən ${normalized} ulduz">${Array.from({ length: 5 }, (_, index) => `<i${index < normalized ? ' class="is-filled"' : ''}>★</i>`).join('')}</span>`;
}

function reviewList(reviews: ProductReviewView[]): string {
  if (!reviews.length) {
    return '<div class="db-review-empty" data-review-empty><strong>Bu məhsula hələ rəy yazılmayıb.</strong><span>İlk rəyi siz paylaşın.</span></div>';
  }
  return reviews.map((review) => `<article class="db-review-item" data-review-id="${escapeHtml(review.id)}">
    <div class="db-review-avatar" aria-hidden="true">${escapeHtml(review.author_name.trim().charAt(0).toLocaleUpperCase('az-AZ') || 'D')}</div>
    <div class="db-review-copy">
      <div class="db-review-meta"><strong>${escapeHtml(review.author_name)}</strong>${review.verified_purchase ? '<span>Təsdiqlənmiş alış</span>' : ''}<time datetime="${escapeHtml(new Date(review.created_at).toISOString())}">${escapeHtml(new Intl.DateTimeFormat('az-AZ', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(review.created_at)))}</time></div>
      ${stars(review.rating)}
      ${review.title ? `<h4>${escapeHtml(review.title)}</h4>` : ''}
      <p>${escapeHtml(review.body)}</p>
    </div>
  </article>`).join('');
}

export function renderProductDetail(options: ProductDetailOptions): string {
  const { product, related, categories } = options;
  const brand = product.brand_name || product.vendor_name || 'TVShop';
  const logo = brandLogo(brand);
  const rows = informationRows(product);
  const visibleRows = rows.slice(0, 5);
  const extraRows = rows.slice(5);
  const media = options.media.length
    ? options.media
    : [{ public_url: product.image_url || '/assets/wp-content/uploads/other-cat.webp', alt_text: product.alt_text }];
  const videoUrl = product.video_url || '';
  const cartJson = safeJson(options.cartItem);
  const productPayload = {
    ...options.cartItem,
    attributes: product.attributes ?? {},
    productType: product.product_type ?? '',
    stock: Number(product.stock ?? 0),
    currency: product.currency || 'AZN',
    alt: product.alt_text || `${product.title} — məhsul şəkli`,
    videoUrl
  };
  const whatsappMessage = encodeURIComponent(`Salam, ${product.title} məhsulu haqqında məlumat almaq istəyirəm.`);
  const categoryLinks = categories.length
    ? categories.map((category) => `<a href="/magaza/${(category.path_slugs?.length ? category.path_slugs : [category.slug]).map(encodeURIComponent).join('/')}/">${escapeHtml(category.name)}</a>`).join(', ')
    : '<a href="/magaza/">Mağaza</a>';
  const tabs = [
    ['description', 'Təsvir'],
    ['additional-information', 'Əlavə məlumat'],
    ['reviews', 'Rəylər']
  ] as const;

  return `<div class="page-container db-product-page" data-product-page>
    <nav class="db-product-mobile-nav" aria-label="Məhsul səhifəsi bölmələri">
      <a class="is-active" href="#product-gallery" data-product-anchor>Qalereya</a>
      <a href="#product-description" data-product-anchor>Təsvir</a>
      <a href="#product-additional-information" data-product-anchor>Əlavə məlumat</a>
      <a href="#product-reviews" data-product-anchor>Rəylər</a>
      <a href="#related-products" data-product-anchor>Oxşar məhsullar</a>
      <a href="#recently-viewed-products" data-product-anchor>Son baxılanlar</a>
    </nav>

    <section class="page-product-detail" aria-labelledby="product-title">
      <div class="db-product-gallery" id="product-gallery" data-product-section>
        <div class="db-product-gallery-stage">
          ${videoUrl ? `<video class="db-product-detail-video" data-product-video data-product-main-video data-src="${escapeHtml(videoUrl)}" poster="${escapeHtml(media[0]!.public_url)}" controls muted playsinline preload="metadata" aria-label="${escapeHtml(`${product.title} — məhsul videosu`)}"></video>` : ''}
          <img src="${escapeHtml(media[0]!.public_url)}" alt="${escapeHtml(media[0]!.alt_text || product.alt_text || product.title)}" width="720" height="720" data-product-main-image${videoUrl ? ' hidden' : ''}>
          <button class="db-product-zoom" type="button" data-product-zoom aria-label="Məhsul şəklini böyüt"${videoUrl ? ' hidden' : ''}>${icon.zoom}</button>
        </div>
        ${videoUrl || media.length > 1 ? `<div class="db-product-thumbnails" aria-label="Məhsul mediası">${videoUrl ? `<button type="button" class="is-active db-product-video-thumb" data-product-video-thumbnail aria-current="true" aria-label="Məhsul videosunu göstər"><span aria-hidden="true">▶</span><img src="${escapeHtml(media[0]!.public_url)}" alt="" width="74" height="74"></button>` : ''}${media.map((item, index) => `<button type="button" data-product-thumbnail="${escapeHtml(item.public_url)}" data-product-thumbnail-alt="${escapeHtml(item.alt_text || product.title)}"${!videoUrl && index === 0 ? ' class="is-active" aria-current="true"' : ''}><img src="${escapeHtml(item.public_url)}" alt="" width="74" height="74"></button>`).join('')}</div>` : ''}
      </div>

      <div class="page-detail-info">
        <p class="db-product-recommended">${icon.recommended}<span>TÖVSİYƏ EDİLİR!</span></p>
        <h1 id="product-title">${escapeHtml(product.title)}</h1>
        ${product.short_description ? `<p class="db-product-short-description" data-product-short-description>${escapeHtml(product.short_description)}</p>` : ''}
        <div class="db-product-brand-card">
          <span class="db-product-brand-logo">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(brand)} loqosu" width="120" height="54">` : `<b>${escapeHtml(brand)}</b>`}</span>
          <span><strong>${escapeHtml(brand)}</strong><small>Brend</small></span>
        </div>
        <p class="db-product-sku">
          <button type="button" data-product-copy-sku data-product-sku-value="${escapeHtml(product.sku || product.slug.toUpperCase())}" aria-label="Məhsul kodunu kopyala">${icon.copy}</button>
          <span>SKU: ${escapeHtml(product.sku || product.slug.toUpperCase())}</span>
          <small class="sr-only" data-product-copy-status role="status" aria-live="polite"></small>
        </p>
        <div class="db-product-summary">
          <h2>Məhsul məlumatı</h2>
          <dl id="product-summary-information">
            ${visibleRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}:</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
            ${extraRows.map(([label, value]) => `<div data-product-summary-extra hidden aria-hidden="true"><dt>${escapeHtml(label)}:</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
          </dl>
          ${extraRows.length ? `<button type="button" data-product-details aria-expanded="false" aria-controls="product-summary-information"><span>Ətraflı</span>${icon.info}</button>` : ''}
        </div>
        <div class="db-product-inline-actions">
          <button class="db-product-wishlist" type="button" data-wishlist="${escapeHtml(product.slug)}" aria-label="Seçilmişlərə əlavə et" aria-pressed="false">${icon.heart}</button>
          <a class="db-product-enquiry" href="https://wa.me/994502645400?text=${whatsappMessage}" target="_blank" rel="noopener noreferrer">${icon.whatsapp}<span>Sual verin</span></a>
        </div>
        <div class="db-product-next-delivery"><i aria-hidden="true"></i><span><strong>Növbəti gün çatdırılma!</strong><small>Gün ərzində sifariş edin, növbəti gün mümkün olan ən erkən vaxtda çatdıraq.</small></span></div>
        <p class="db-product-categories"><span>Kateqoriyalar:</span> ${categoryLinks}</p>
      </div>

      <aside class="db-product-purchase" aria-label="Məhsulu al">
        ${purchasePanel(product, cartJson)}
        <div class="db-product-trust">
          <article><i class="money" aria-hidden="true"></i><strong>Pulun geri qaytarılması</strong><small>Əminliklə alış-veriş edin!</small></article>
          <article><i class="secure" aria-hidden="true"></i><strong>Rahat ödəniş</strong><small>Nağd, POS və ya bank köçürməsi.</small></article>
        </div>
        <div class="db-product-payments"><strong>Ödəniş üsulları</strong><div><span>Çatdırılmada nağd</span><span>Çatdırılmada POS</span><span>Bank köçürməsi</span></div></div>
      </aside>
    </section>

    <section class="db-product-tabs">
      <div class="db-product-tablist" role="tablist" aria-label="Məhsul məlumatları">
        ${tabs.map(([key, label], index) => `<button type="button" role="tab" id="product-tab-${key}" aria-controls="product-${key}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-product-tab="${key}"${index === 0 ? ' class="is-active"' : ''}>${label}</button>`).join('')}
      </div>
      <article class="db-product-tabpanel" id="product-description" role="tabpanel" aria-labelledby="product-tab-description" data-product-panel="description" data-product-section>
        <h2>Təsvir</h2>
        <p data-product-full-description>${escapeHtml(product.description || product.short_description || 'Məhsul haqqında ətraflı məlumat hazırlanır.')}</p>
      </article>
      <article class="db-product-tabpanel" id="product-additional-information" role="tabpanel" aria-labelledby="product-tab-additional-information" data-product-panel="additional-information" data-product-section hidden>
        <h2>Əlavə məlumat</h2>
        <dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
      </article>
      <article class="db-product-tabpanel" id="product-reviews" role="tabpanel" aria-labelledby="product-tab-reviews" data-product-panel="reviews" data-product-section hidden>
        <h2>Rəylər</h2>
        <div class="db-product-reviews" data-product-reviews data-product-slug="${escapeHtml(product.slug)}">
          <section class="db-review-overview" aria-label="Məhsul rəylərinin xülasəsi">
            <div class="db-review-score"><strong data-review-average>${options.reviewSummary.average.toFixed(1)}</strong>${stars(options.reviewSummary.average)}<span><b data-review-count>${options.reviewSummary.count}</b> rəy</span></div>
            <div class="db-review-list" data-review-list>${reviewList(options.reviews)}</div>
          </section>
          <form class="db-review-form" data-review-form>
            <h3>Rəyinizi yazın</h3>
            <p>Qiymətləndirməniz</p>
            <fieldset class="db-review-rating"><legend class="sr-only">Məhsulu qiymətləndirin</legend>${[5,4,3,2,1].map((value) => `<input id="review-rating-${value}" type="radio" name="rating" value="${value}"${value === 5 ? ' required' : ''}><label for="review-rating-${value}" aria-label="${value} ulduz">★</label>`).join('')}</fieldset>
            <div class="db-review-fields"><label><span>Adınız</span><input name="authorName" type="text" minlength="2" maxlength="80" autocomplete="name" required></label><label><span>E-poçt</span><input name="email" type="email" maxlength="254" autocomplete="email"></label></div>
            <label><span>Başlıq</span><input name="title" type="text" maxlength="120" placeholder="Rəyiniz üçün qısa başlıq"></label>
            <label><span>Rəyiniz</span><textarea name="body" minlength="10" maxlength="2000" rows="5" required placeholder="Məhsul haqqında təcrübənizi paylaşın"></textarea></label>
            <button type="submit">RƏYİ GÖNDƏR</button>
            <p class="db-review-form-status" data-review-form-status role="status" aria-live="polite"></p>
          </form>
        </div>
      </article>
    </section>

    <section class="db-product-carousel-section" id="related-products" data-product-section>
      <div class="db-product-carousel-heading"><h2>Oxşar məhsullar</h2><div><button type="button" data-product-carousel-arrow="-1" aria-label="Əvvəlki məhsullar">‹</button><button type="button" data-product-carousel-arrow="1" aria-label="Növbəti məhsullar">›</button></div></div>
      <div class="db-product-carousel" data-product-carousel tabindex="0" aria-label="Oxşar məhsullar">
        <div class="db-product-carousel-track">${related.map(productCard).join('')}</div>
      </div>
    </section>

    <section class="db-product-carousel-section" id="recently-viewed-products" data-product-section data-recently-viewed-section hidden>
      <div class="db-product-carousel-heading"><h2>Son baxılan məhsullar</h2><div><button type="button" data-product-carousel-arrow="-1" aria-label="Əvvəlki məhsullar">‹</button><button type="button" data-product-carousel-arrow="1" aria-label="Növbəti məhsullar">›</button></div></div>
      <div class="db-product-carousel" data-product-carousel tabindex="0" aria-label="Son baxılan məhsullar"><div class="db-product-carousel-track" data-recently-viewed-track></div></div>
    </section>

    <div class="db-product-sticky-buy" data-product-sticky-buy aria-label="Mobil sürətli alış paneli">
      ${purchasePanel(product, cartJson, true)}
    </div>
    <script type="application/json" data-current-product>${safeJson(productPayload)}</script>
  </div>`;
}
