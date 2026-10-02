const api = '/api/v1/public';

const money = new Intl.NumberFormat('az-AZ', { style: 'currency', currency: 'AZN' });
const compactMoney = new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 0 });
const cmsBrandLogos = new Map();
const localizeProduct = (product) => globalThis.DailyBakuI18n?.localizeProduct(product) || product;
const localizePost = (post) => globalThis.DailyBakuI18n?.localizePost(post) || post;
const localizeCategory = (category) => globalThis.DailyBakuI18n?.localizeCategory(category) || category;
const topPickCategories = {
  dcbe431: { slug: 'elektronika', label: 'Elektronika', icon: '/assets/wp-content/uploads/flash.svg' },
  '47e695a': { slug: 'ev-metbex', label: 'Ev & Mətbəx', icon: '/assets/wp-content/uploads/category-home.svg' },
  a66ade4: { slug: 'moda', label: 'Moda', icon: '/assets/wp-content/uploads/category-fashion.svg' },
  d6aa696: { slug: 'gozellik-saglamliq', label: 'Gözəllik & Sağlamlıq', icon: '/assets/wp-content/uploads/category-beauty.svg' }
};
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);

function safeImageUrl(value) {
  try {
    const url = new URL(value || '/assets/wp-content/uploads/other-cat.webp', location.origin);
    if (url.origin !== location.origin && url.protocol !== 'https:') throw new Error('Unsafe media URL');
    return url.href;
  } catch {
    return '/assets/wp-content/uploads/other-cat.webp';
  }
}

function safeImage(value) {
  return escapeHtml(safeImageUrl(value));
}

function productMedia(product, image, title, width = 420, height = 320) {
  if (!product.video_url) return `<img src="${image}" alt="${escapeHtml(product.alt_text || product.title)}" loading="lazy" decoding="async" width="${width}" height="${height}" itemprop="image">`;
  let video;
  try {
    video = new URL(product.video_url, location.origin);
    if (video.origin !== location.origin && video.protocol !== 'https:') throw new Error('Unsafe video URL');
  } catch {
    return `<img src="${image}" alt="${escapeHtml(product.alt_text || product.title)}" loading="lazy" decoding="async" width="${width}" height="${height}" itemprop="image">`;
  }
  return `<video class="db-product-video" data-product-video data-src="${escapeHtml(video.href)}" poster="${image}" muted loop playsinline preload="none" aria-label="${title} — məhsul videosu"></video><meta itemprop="contentUrl" content="${escapeHtml(video.href)}">`;
}

function categoryPath(category) {
  const slugs = Array.isArray(category?.path_slugs) && category.path_slugs.length ? category.path_slugs : [category?.slug];
  return `/magaza/${slugs.filter(Boolean).map((slug) => encodeURIComponent(slug)).join('/')}/`;
}

function orderedSelection(items, ids = []) {
  if (!Array.isArray(ids) || !ids.length) return items;
  const byId = new Map(items.map((item) => [item.product_id || item.id, item]));
  const selected = ids.map((id) => byId.get(id)).filter(Boolean);
  return selected.length ? selected : items;
}

function renderCatalogData(categories = [], brands = [], editorConfig = null) {
  categories = categories.map(localizeCategory);
  cmsBrandLogos.clear();
  brands.forEach((brand) => {
    if (brand?.name && brand?.logo_url) cmsBrandLogos.set(String(brand.name).toLocaleLowerCase('az-AZ'), safeImageUrl(brand.logo_url));
  });
  const byCategory = new Map(categories.map((category) => [category.slug, category]));
  const byCategoryId = new Map(categories.map((category) => [category.id, category]));
  const byBrand = new Map(brands.map((brand) => [brand.slug, brand]));
  const byBrandId = new Map(brands.map((brand) => [brand.id, brand]));
  document.querySelectorAll('.et__attributes_filter_form').forEach((form) => {
    const categorySelect = form.querySelector('select[name="product_cat"]');
    const brandSelect = form.querySelector('select[name="pa_brand"]');
    if (categorySelect && categories.length) {
      const current = categorySelect.value;
      const children = new Map();
      categories.forEach((category) => {
        const key = category.parent_id || '';
        if (!children.has(key)) children.set(key, []);
        children.get(key).push(category);
      });
      const ordered = [];
      const visit = (parentId = '', depth = 0) => (children.get(parentId) || []).forEach((category) => {
        ordered.push({ ...category, depth });
        visit(category.id, depth + 1);
      });
      visit();
      categorySelect.innerHTML = `<option value="">Kateqoriya seçin</option>${ordered.map((category) => `<option value="${escapeHtml(category.slug)}"${category.image_url ? ` data-img="${safeImage(category.image_url)}"` : ''}>${'— '.repeat(category.depth)}${escapeHtml(category.name)}</option>`).join('')}`;
      categorySelect.value = current;
    }
    if (brandSelect && brands.length) {
      const current = brandSelect.value;
      brandSelect.innerHTML = `<option value="">Brend seçin</option>${brands.map((brand) => `<option value="${escapeHtml(brand.slug)}"${brand.logo_url ? ` data-img="${safeImage(brand.logo_url)}"` : ''}>${escapeHtml(brand.name)}</option>`).join('')}`;
      brandSelect.value = current;
    }
  });
  document.querySelectorAll('main a[href*="kateqoriya="]').forEach((link) => {
    const category = byCategory.get(new URL(link.href, location.origin).searchParams.get('kateqoriya'));
    const image = link.querySelector('img');
    if (category) {
      link.href = categoryPath(category);
      link.dataset.categoryRuntime = category.id;
    }
    if (category?.image_url && image) {
      image.src = safeImageUrl(category.image_url);
      image.alt = category.alt_text || category.name;
    }
  });
  const selectedCategories = editorConfig?.categories?.categoryIds || [];
  if (selectedCategories.length) {
    const order = new Map(selectedCategories.map((id, index) => [id, index]));
    document.querySelectorAll('main a[data-category-runtime]').forEach((link) => {
      const category = byCategoryId.get(link.dataset.categoryRuntime);
      const item = link.closest('li, .item, .swiper-slide, .elementor-element');
      if (!item || !category) return;
      item.hidden = !order.has(category.id);
      if (order.has(category.id)) item.style.order = String(order.get(category.id));
    });
    const sidebar = document.querySelector('#menu-categories-1');
    if (sidebar) {
      sidebar.innerHTML = selectedCategories.map((id) => byCategoryId.get(id)).filter(Boolean).map((category) => `<li class="menu-item depth-${Number(category.depth || 0)}"><a href="${escapeHtml(categoryPath(category))}" class="mi-link"><span class="txt">${escapeHtml(category.name)}</span><span class="arrow"></span></a></li>`).join('');
    }
  }
  document.querySelectorAll('main a[href*="brend="]').forEach((link) => {
    const brand = byBrand.get(new URL(link.href, location.origin).searchParams.get('brend'));
    const image = link.querySelector('img');
    if (brand?.logo_url && image) {
      image.src = safeImageUrl(brand.logo_url);
      image.alt = brand.alt_text || `${brand.name} loqosu`;
    }
  });
  const selectedBrands = editorConfig?.brands?.brandIds || [];
  if (selectedBrands.length) {
    const order = new Map(selectedBrands.map((id, index) => [id, index]));
    document.querySelectorAll('main a[href*="brend="]').forEach((link) => {
      const brand = byBrand.get(new URL(link.href, location.origin).searchParams.get('brend'));
      const item = link.closest('.swiper-slide, .item');
      if (!item || !brand) return;
      item.hidden = !order.has(brand.id);
      if (order.has(brand.id)) item.style.order = String(order.get(brand.id));
    });
    selectedBrands.forEach((id) => {
      const brand = byBrandId.get(id);
      if (!brand) return;
      document.querySelectorAll(`main a[href*="brend=${CSS.escape(brand.slug)}"]`).forEach((link) => { link.closest('.swiper-slide, .item')?.removeAttribute('hidden'); });
    });
  }
  const topPickCategoryIds = editorConfig?.topPicks?.categoryIds || [];
  if (topPickCategoryIds.length) {
    const slugs = new Set(topPickCategoryIds.map((id) => byCategoryId.get(id)?.slug).filter(Boolean));
    Object.entries(topPickCategories).forEach(([widgetId, definition]) => {
      const widget = document.querySelector(`[data-id="${widgetId}"][data-top-picks-products]`);
      if (widget) widget.closest('.section-tab-item')?.toggleAttribute('hidden', !slugs.has(definition.slug));
    });
  }
  globalThis.DailyBakuCatalogNavigation?.render(categories);
}

function encodedJson(value) {
  return escapeHtml(JSON.stringify(value));
}

function whatsappUrl(title) {
  const number = String(globalThis.copt?.whatsappNumber || '994502645400').replace(/\D/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(`${title} haqqında məlumat almaq istəyirəm`)}`;
}

function quickViewProduct(product, price, compareAt) {
  return {
    listingId: product.id,
    variantId: product.variant_id,
    slug: product.slug,
    title: product.title,
    brand: product.brand_name || product.vendor_name || 'TVShop',
    vendor: product.vendor_name || '',
    sku: product.sku || product.slug.split('-').map((part) => part[0]).join('').toUpperCase().slice(0, 8),
    description: product.description || product.short_description || '',
    shortDescription: product.short_description || '',
    attributes: product.attributes || {},
    productType: product.product_type || '',
    stock: Number(product.stock ?? 0),
    price,
    compareAt,
    image: product.image_url,
    videoUrl: product.video_url
  };
}

function productCard(product, { featured = false, featuredIndex = 0 } = {}) {
  const price = Number(product.price || 0);
  const compareAt = Number(product.compare_at_price || 0);
  const discount = compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0;
  const title = escapeHtml(product.title);
  const slug = escapeHtml(product.slug);
  const brand = escapeHtml(product.brand_name || product.vendor_name || 'TVShop');
  const sku = escapeHtml(product.sku || product.slug.split('-').map((part) => part[0]).join('').toUpperCase().slice(0, 8));
  const image = safeImage(product.image_url);
  const cartItem = encodedJson({
    listingId: product.id,
    variantId: product.variant_id,
    slug: product.slug,
    title: product.title,
    price,
    compareAt,
    image: product.image_url,
    sku: product.sku,
    brand: product.brand_name,
    vendor: product.vendor_name,
    description: product.description,
    shortDescription: product.short_description,
    videoUrl: product.video_url
  });
  const quickView = encodedJson(quickViewProduct(product, price, compareAt));
  const liked = false;
  const badgeType = product.merchandising_badge || 'none';
  const picked = featured && badgeType === 'recommended';
  const actions = featured
    ? `<div class="db-product-actions" aria-label="${title} əməliyyatları">
      <button class="db-product-action db-product-wishlist${liked ? ' active' : ''}" type="button" aria-label="${title} seçilmişlərə əlavə et" aria-pressed="${liked}" data-wishlist="${slug}"${liked ? ' data-default-wishlist="true"' : ''}><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Seçilmişlərə əlavə et</span></button>
      <button class="db-product-action db-product-quick-view" type="button" aria-label="${title} üçün sürətli baxış" data-quick-view="${quickView}"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Sürətli baxış</span></button>
      <a class="db-product-action db-product-whatsapp" href="${escapeHtml(whatsappUrl(product.title))}" target="_blank" rel="noopener noreferrer" aria-label="${title} haqqında WhatsApp ilə soruş"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">WhatsApp</span></a>
    </div>`
    : `<button class="db-product-wishlist" type="button" aria-label="${title} seçilmişlərə əlavə et" aria-pressed="false" data-wishlist="${slug}"><span aria-hidden="true">♡</span></button>`;
  const badge = picked
    ? '<span class="db-product-pick" aria-label="Tövsiyə olunan məhsul"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7.5 10.2 11 3.5c.7-1.2 2.5-.5 2.2.9l-.7 3.5h5.8c1.4 0 2.5 1.3 2.1 2.7l-2 7a2.8 2.8 0 0 1-2.7 2H7.5m0-9.4v9.4H3.7v-9.4h3.8Z"/></svg></span>'
    : featured ? '' : discount ? `<span class="db-product-sale">-${discount}%</span>` : '<span class="db-product-new">Yeni</span>';
  const content = featured
    ? `<div class="db-product-content">
      <p class="db-product-sku">SKU: ${sku}</p>
      <h3 itemprop="name"><a href="/mehsul/${slug}/">${title}</a></h3>
      <div class="db-product-bottom" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <div class="db-product-price"><strong itemprop="price" content="${price}">${compactMoney.format(price)} ₼</strong></div>
        <meta itemprop="priceCurrency" content="AZN"><link itemprop="availability" href="https://schema.org/InStock">
        <button class="db-add-cart" type="button" data-add-cart="${cartItem}" aria-label="${title} səbətə əlavə et"><span class="db-cart-icon" aria-hidden="true"></span></button>
      </div>
    </div>`
    : `<div class="db-product-content">
      <p class="db-product-brand">${brand}</p>
      <h3 itemprop="name"><a href="/mehsul/${slug}/">${title}</a></h3>
      ${Number(product.review_count || 0) > 0 ? `<div class="db-product-rating" aria-label="5 ulduzdan ${Number(product.review_average || 0).toFixed(1)}">★★★★★ <span>(${Number(product.review_count)})</span></div>` : ''}
      <div class="db-product-bottom" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <div class="db-product-price"><strong itemprop="price" content="${price}">${money.format(price)}</strong>${compareAt > price ? `<del>${money.format(compareAt)}</del>` : ''}</div>
        <meta itemprop="priceCurrency" content="AZN"><link itemprop="availability" href="https://schema.org/InStock">
        <button class="db-add-cart" type="button" data-add-cart="${cartItem}" aria-label="${title} səbətə əlavə et">Səbətə at</button>
      </div>
    </div>`;
  return `<article class="db-product-card" itemscope itemtype="https://schema.org/Product">
    <div class="db-product-media">
      ${badge}
      ${actions}
      <a href="/mehsul/${slug}/" aria-label="${title}">
        ${productMedia(product, image, title)}
      </a>
    </div>
    ${content}
  </article>`;
}

function completeProductSet(products) {
  const unique = new Map();
  products.forEach((product) => {
    if (product?.slug && !unique.has(product.slug)) unique.set(product.slug, product);
  });
  return [...unique.values()].sort((left, right) => Number(left.display_position || 0) - Number(right.display_position || 0));
}

function merchandisingProducts(products, field, configuredIds = []) {
  const complete = completeProductSet(products);
  if (Array.isArray(configuredIds) && configuredIds.length) return orderedSelection(complete, configuredIds);
  const selected = complete.filter((product) => product[field] === true);
  return selected.length ? selected : complete;
}

function featuredMarkup(products, configuredIds = []) {
  const selected = merchandisingProducts(products, 'is_featured', configuredIds).slice(0, 40);
  return `<div class="db-featured-viewport" tabindex="0" aria-label="Seçilmiş fürsətlər məhsul slayderi">
    <div class="db-featured-track">
      ${selected.map((product, index) => productCard(product, { featured: true, featuredIndex: index })).join('')}
    </div>
  </div>
  <p class="db-featured-status seo-page-title" role="status" aria-live="polite">İlk məhsul sütunu göstərilir</p>`;
}

function popularProductCard(product, index, variant = 'popular') {
  const price = Number(product.price || 0);
  const compareAt = Number(product.compare_at_price || 0);
  const title = escapeHtml(product.title);
  const slug = escapeHtml(product.slug);
  const brand = escapeHtml(product.brand_name || product.vendor_name || 'TVShop');
  const sku = escapeHtml(product.sku || product.slug.split('-').map((part) => part[0]).join('').toUpperCase().slice(0, 8));
  const image = safeImage(product.image_url);
  const cartItem = encodedJson({
    listingId: product.id,
    variantId: product.variant_id,
    slug: product.slug,
    title: product.title,
    price,
    compareAt,
    image: product.image_url,
    sku: product.sku,
    brand: product.brand_name,
    vendor: product.vendor_name,
    description: product.description,
    shortDescription: product.short_description,
    videoUrl: product.video_url
  });
  const quickView = encodedJson(quickViewProduct(product, price, compareAt));
  const liked = false;
  const topPicks = variant === 'top-picks';
  const badgeType = product.merchandising_badge || 'none';
  const sale = badgeType === 'sale';
  const hot = badgeType === 'hot';
  const fresh = badgeType === 'new';
  const picked = badgeType === 'recommended';
  const rating = Number(product.review_count || 0) > 0
    ? `<span class="db-popular-rating"><span aria-hidden="true">★</span> ${Number(product.review_average || 0).toFixed(1)} / ${Number(product.review_count)}</span>`
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
    <div class="db-popular-media">
      ${badge}
      <a href="/mehsul/${slug}/" aria-label="${title}">
        ${productMedia(product, image, title, 320, 240)}
      </a>
      <div class="db-popular-actions" aria-label="${title} əməliyyatları">
        <button class="db-popular-action db-product-wishlist${liked ? ' active' : ''}" type="button" aria-label="${title} seçilmişlərə əlavə et" aria-pressed="${liked}" data-wishlist="${slug}"${liked ? ' data-default-wishlist="true"' : ''}><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Seçilmişlərə əlavə et</span></button>
        <button class="db-popular-action db-product-quick-view" type="button" aria-label="${title} üçün sürətli baxış" data-quick-view="${quickView}"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Sürətli baxış</span></button>
        <a class="db-popular-action db-product-whatsapp" href="${escapeHtml(whatsappUrl(product.title))}" target="_blank" rel="noopener noreferrer" aria-label="${title} haqqında WhatsApp ilə soruş"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">WhatsApp</span></a>
      </div>
    </div>
    <div class="db-popular-content">
      <div class="db-popular-meta"><p>SKU: ${sku}</p>${rating}</div>
      <h3 itemprop="name"><a href="/mehsul/${slug}/">${title}</a></h3>
      <div class="db-popular-price" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <strong itemprop="price" content="${price}">${compactMoney.format(price)} ₼</strong>
        <meta itemprop="priceCurrency" content="AZN"><link itemprop="availability" href="https://schema.org/InStock">
      </div>
      <button class="db-popular-cart db-add-cart" type="button" data-add-cart="${cartItem}" aria-label="${title} səbətə əlavə et"><span class="db-cart-icon" aria-hidden="true"></span><span>SƏBƏTƏ AT</span></button>
    </div>
  </article>`;
}

function popularMarkup(products, configuredIds = []) {
  const complete = merchandisingProducts(products, 'is_popular', configuredIds);
  const selected = configuredIds.length ? complete.slice(0, 40) : [...complete.slice(1), complete[0]].slice(0, 20);
  return `<div class="db-popular-viewport" tabindex="0" aria-label="Ən populyar məhsullar slayderi">
    <div class="db-popular-track">${selected.map(popularProductCard).join('')}</div>
  </div>
  <div class="db-popular-navigation" aria-label="Məhsul slayderi idarələri">
    <button type="button" data-popular-prev aria-label="Əvvəlki məhsul sütunu" disabled><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button>
    <button type="button" data-popular-next aria-label="Növbəti məhsul sütunu"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>
  </div>
  <div class="db-popular-pagination" role="tablist" aria-label="Məhsul mövqeləri"></div>
  <p class="db-popular-status seo-page-title" role="status" aria-live="polite">İlk məhsul sütunu göstərilir</p>`;
}

function topPicksMarkup(products, configuredIds = []) {
  const selected = merchandisingProducts(products, 'is_top_pick', configuredIds).slice(0, 40);
  return `<div class="db-top-picks-viewport" tabindex="0" aria-label="Ən çox seçilən məhsullar slayderi">
    <div class="db-top-picks-track">${selected.map((product, index) => popularProductCard(product, index, 'top-picks')).join('')}</div>
  </div>
  <div class="db-top-picks-navigation" aria-label="Məhsul slayderi idarələri">
    <button type="button" data-top-picks-prev aria-label="Əvvəlki məhsul sütunu" disabled><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button>
    <button type="button" data-top-picks-next aria-label="Növbəti məhsul sütunu"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>
  </div>
  <div class="db-top-picks-pagination" role="tablist" aria-label="Məhsul mövqeləri"></div>
  <p class="db-top-picks-status seo-page-title" role="status" aria-live="polite">İlk məhsul sütunu göstərilir</p>`;
}

function completeNewsSet(posts) {
  const unique = new Map();
  posts.forEach((post) => {
    if (!post?.slug || unique.has(post.slug)) return;
    unique.set(post.slug, {
      ...post,
      category_name: post.category_name || ({
        guide: 'Alış-veriş bələdçisi',
        brand_story: 'Brend hekayəsi',
        news: 'Yeniliklər',
        sponsored: 'Tərəfdaş materialı'
      })[post.post_type] || 'TVShop',
      image_url: post.image_url || '/assets/wp-content/uploads/other-cat.webp',
      alt_text: post.alt_text || `${post.title} — TVShop yeniliyi`
    });
  });
  return [...unique.values()].slice(0, 8);
}

function newsDateParts(value) {
  const parsed = new Date(`${String(value || '').slice(0, 10)}T12:00:00`);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return {
    iso: date.toISOString().slice(0, 10),
    day: new Intl.DateTimeFormat('az-AZ', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('az-AZ', { month: 'short' }).format(date).replace('.', '').toLocaleUpperCase('az-AZ')
  };
}

function newsCard(post) {
  const title = escapeHtml(post.title);
  const slug = escapeHtml(post.slug);
  const category = escapeHtml(post.category_name || 'TVShop');
  const image = safeImage(post.image_url);
  const date = newsDateParts(post.published_at);
  return `<article class="db-news-card">
    <a class="db-news-media" href="/jurnal/${slug}/" aria-label="${title}">
      <img src="${image}" alt="${escapeHtml(post.alt_text || post.title)}" loading="lazy" decoding="async" width="640" height="640">
      <time datetime="${date.iso}" class="db-news-date"><strong>${date.day}</strong><span>${date.month}</span></time>
    </a>
    <div class="db-news-content">
      <p class="db-news-category">${category}</p>
      <h3><a href="/jurnal/${slug}/">${title}</a></h3>
      <a class="db-news-read" href="/jurnal/${slug}/">Ətraflı oxu <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></a>
    </div>
  </article>`;
}

function newsMarkup(posts) {
  return `<div class="db-news-viewport" tabindex="0" aria-label="TVShop yenilikləri slayderi">
    <div class="db-news-track">${completeNewsSet(posts).map(newsCard).join('')}</div>
  </div>
  <div class="db-news-navigation" aria-label="Xəbər slayderi idarələri">
    <button type="button" data-news-prev aria-label="Əvvəlki xəbər" disabled><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button>
    <button type="button" data-news-next aria-label="Növbəti xəbər"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>
  </div>
  <div class="db-news-pagination" role="tablist" aria-label="Xəbər mövqeləri"></div>
  <p class="db-news-status seo-page-title" role="status" aria-live="polite">İlk xəbər göstərilir</p>`;
}

function renderNews(posts, editorConfig = null) {
  if (!Array.isArray(posts)) return;
  posts = posts.map(localizePost);
  posts = orderedSelection(posts, editorConfig?.news?.postIds || []);
  const container = document.querySelector('#bf72957, [data-id="bf72957"], [data-cms-news]');
  if (!container) return;
  container.className = 'db-news-slider';
  container.dataset.cmsNews = 'ready';
  container.innerHTML = posts.length ? newsMarkup(posts) : '<div class="db-cms-empty" role="status"><strong>Yenilik tapılmadı</strong><span>Yeni məqalələr dərc edildikdə burada görünəcək.</span></div>';
  if (posts.length) initializeNewsSlider(container);
}

function renderProducts(products, editorConfig = null) {
  if (!Array.isArray(products)) return;
  products = products.map(localizeProduct);
  const complete = completeProductSet(products);
  document.querySelectorAll('.et__products_ajax, [data-cms-products]').forEach((container, containerIndex) => {
    const isFeatured = container.hasAttribute('data-featured-products') || container.dataset.id === '4dee5e4';
    const isPopular = container.hasAttribute('data-popular-products') || container.dataset.id === '52657d1';
    const isTopPicks = container.hasAttribute('data-top-picks-products') || Object.hasOwn(topPickCategories, container.dataset.id);
    if (!complete.length) {
      container.innerHTML = '<div class="db-cms-empty" role="status"><strong>Məhsul tapılmadı</strong><span>Dərc edilmiş məhsullar burada avtomatik görünəcək.</span></div>';
      container.dataset.cmsProducts = 'empty';
      return;
    }
    if (isFeatured) {
      container.className = 'db-featured-products';
      container.dataset.featuredProducts = '';
      container.innerHTML = featuredMarkup(complete, editorConfig?.featured?.productIds || []);
      initializeFeaturedSlider(container);
    } else if (isPopular) {
      container.className = 'db-popular-products';
      container.dataset.popularProducts = '';
      container.innerHTML = popularMarkup(complete, editorConfig?.popular?.productIds || []);
      initializePopularSlider(container);
    } else if (isTopPicks) {
      container.className = 'db-top-picks-products';
      container.dataset.topPicksProducts = '';
      const category = topPickCategories[container.dataset.id];
      const categorized = category
        ? complete.filter((product) => Array.isArray(product.category_slugs) && product.category_slugs.includes(category.slug))
        : complete;
      container.innerHTML = categorized.length
        ? topPicksMarkup(categorized, editorConfig?.topPicks?.productIds || [])
        : `<div class="db-cms-empty" role="status"><strong>${escapeHtml(category?.label || 'Kateqoriya')} üzrə məhsul tapılmadı</strong><span>Bu kateqoriyaya məhsul əlavə edildikdə burada görünəcək.</span></div>`;
      if (categorized.length) initializeTopPicksSlider(container);
    } else {
      const rotated = [...complete.slice(containerIndex % complete.length), ...complete.slice(0, containerIndex % complete.length)];
      container.className = 'db-products-grid';
      container.innerHTML = rotated.slice(0, 8).map((product) => productCard(product)).join('');
    }
    container.dataset.cmsProducts = 'ready';
    container.setAttribute('aria-live', 'polite');
  });
  synchronizeWishlistButtons();
}

function initializeFeaturedSlider(container) {
  container.featuredSliderCleanup?.();
  const viewport = container.querySelector('.db-featured-viewport');
  const cards = [...container.querySelectorAll('.db-featured-track > .db-product-card')];
  const status = container.querySelector('.db-featured-status');
  if (!viewport || cards.length < 2) return;

  let currentColumn = 0;
  let visibleColumns = 5;
  let columnWidth = 0;
  let gap = 10;
  let maxColumn = 0;
  let scrollFrame = 0;
  let pointerState = null;
  let dragFrame = 0;
  let pendingScrollLeft = 0;
  let suppressClickUntil = 0;
  let suppressClickTimer = 0;
  const actionSelector = '[data-add-cart], [data-wishlist], [data-quick-view], .db-product-whatsapp';
  const stride = () => columnWidth + gap;
  const measure = () => {
    const styles = getComputedStyle(viewport);
    visibleColumns = Math.max(1, Number.parseFloat(styles.getPropertyValue('--db-featured-columns')) || 5);
    gap = Number.parseFloat(styles.getPropertyValue('--db-featured-gap')) || 10;
    columnWidth = (viewport.clientWidth - gap * (visibleColumns - 1)) / visibleColumns;
    maxColumn = Math.max(0, Math.ceil(Math.ceil(cards.length / 2) - visibleColumns));
    viewport.style.setProperty('--db-featured-column-width', `${columnWidth}px`);
  };
  const update = (column, announce = true) => {
    currentColumn = Math.max(0, Math.min(maxColumn, column));
    if (announce && status) status.textContent = `${currentColumn + 1}-ci məhsul sütunu göstərilir`;
  };
  const goTo = (column, smooth = true) => {
    update(column);
    viewport.scrollTo({ left: stride() * currentColumn, behavior: smooth ? 'smooth' : 'auto' });
  };

  viewport.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    goTo(currentColumn + (event.key === 'ArrowRight' ? 1 : -1));
  });
  viewport.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => update(Math.round(viewport.scrollLeft / Math.max(stride(), 1)), false));
  }, { passive: true });
  viewport.addEventListener('dragstart', (event) => event.preventDefault());

  viewport.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target.closest(actionSelector)) {
      pointerState = null;
      return;
    }
    pointerState = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startColumn: currentColumn,
      scrollLeft: viewport.scrollLeft,
      dragging: false
    };
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const distanceX = event.clientX - pointerState.x;
    const distanceY = event.clientY - pointerState.y;
    if (!pointerState.dragging) {
      if (Math.abs(distanceX) < 10 || Math.abs(distanceX) <= Math.abs(distanceY) * 1.15) return;
      pointerState.dragging = true;
      viewport.classList.add('is-grabbing');
      try { viewport.setPointerCapture(event.pointerId); } catch { /* Pointer capture starts only after a genuine drag. */ }
    }
    if (event.cancelable) event.preventDefault();
    pendingScrollLeft = pointerState.scrollLeft - distanceX;
    if (!dragFrame) dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      viewport.scrollLeft = pendingScrollLeft;
    });
  });
  const finishDrag = (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const drag = pointerState;
    viewport.classList.remove('is-grabbing');
    pointerState = null;
    if (!drag.dragging) return;
    suppressClickUntil = performance.now() + 220;
    clearTimeout(suppressClickTimer);
    suppressClickTimer = setTimeout(() => { suppressClickUntil = 0; }, 240);
    const distance = event.clientX - drag.x;
    goTo(drag.startColumn + (distance < 0 ? 1 : -1));
  };
  viewport.addEventListener('pointerup', finishDrag);
  viewport.addEventListener('pointercancel', (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const startColumn = pointerState.startColumn;
    viewport.classList.remove('is-grabbing');
    pointerState = null;
    goTo(startColumn);
  });
  viewport.addEventListener('click', (event) => {
    if (event.target.closest(actionSelector) || performance.now() > suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickUntil = 0;
  }, true);
  const handleResize = () => {
    measure();
    goTo(currentColumn, false);
  };
  window.addEventListener('resize', handleResize, { passive: true });
  container.featuredSliderCleanup = () => {
    window.removeEventListener('resize', handleResize);
    cancelAnimationFrame(scrollFrame);
    cancelAnimationFrame(dragFrame);
    clearTimeout(suppressClickTimer);
  };
  measure();
  goTo(0, false);
}

function initializePopularSlider(container) {
  container.popularSliderCleanup?.();
  const viewport = container.querySelector('.db-popular-viewport');
  const cards = [...container.querySelectorAll('.db-popular-track > .db-popular-card')];
  const previousButton = container.querySelector('[data-popular-prev]');
  const nextButton = container.querySelector('[data-popular-next]');
  const pagination = container.querySelector('.db-popular-pagination');
  const status = container.querySelector('.db-popular-status');
  if (!viewport || cards.length < 2 || !previousButton || !nextButton || !pagination) return;

  let currentColumn = 0;
  let visibleColumns = 4;
  let columnWidth = 0;
  let gap = 10;
  let maxColumn = 0;
  let scrollFrame = 0;
  let pointerState = null;
  let dragFrame = 0;
  let pendingScrollLeft = 0;
  let suppressClickUntil = 0;
  let suppressClickTimer = 0;
  const actionSelector = '[data-add-cart], [data-wishlist], [data-quick-view], .db-product-whatsapp, [data-popular-prev], [data-popular-next], [data-popular-page]';
  const stride = () => columnWidth + gap;
  const dots = () => [...pagination.querySelectorAll('[data-popular-page]')];

  const rebuildPagination = () => {
    const count = maxColumn + 1;
    if (dots().length === count) return;
    pagination.innerHTML = Array.from({ length: count }, (_, index) => (
      `<button type="button" role="tab" aria-selected="${index === currentColumn}" aria-label="${index + 1}-ci məhsul mövqeyi" data-popular-page="${index}"${index === currentColumn ? ' class="active"' : ''}></button>`
    )).join('');
  };
  const measure = () => {
    const styles = getComputedStyle(viewport);
    visibleColumns = Math.max(1, Number.parseInt(styles.getPropertyValue('--db-popular-columns'), 10) || 4);
    gap = Number.parseFloat(styles.getPropertyValue('--db-popular-gap')) || 10;
    columnWidth = (viewport.clientWidth - gap * (visibleColumns - 1)) / visibleColumns;
    maxColumn = Math.max(0, Math.ceil(cards.length / 2) - visibleColumns);
    viewport.style.setProperty('--db-popular-column-width', `${columnWidth}px`);
    currentColumn = Math.min(currentColumn, maxColumn);
    rebuildPagination();
  };
  const update = (column, announce = true) => {
    currentColumn = Math.max(0, Math.min(maxColumn, column));
    previousButton.disabled = currentColumn === 0;
    nextButton.disabled = currentColumn === maxColumn;
    dots().forEach((dot, index) => {
      const active = index === currentColumn;
      dot.classList.toggle('active', active);
      dot.setAttribute('aria-selected', String(active));
    });
    if (announce && status) status.textContent = `${currentColumn + 1}-ci məhsul sütunu göstərilir`;
  };
  const goTo = (column, smooth = true) => {
    update(column);
    viewport.scrollTo({ left: stride() * currentColumn, behavior: smooth ? 'smooth' : 'auto' });
  };

  previousButton.addEventListener('click', () => goTo(currentColumn - 1));
  nextButton.addEventListener('click', () => goTo(currentColumn + 1));
  pagination.addEventListener('click', (event) => {
    const dot = event.target.closest('[data-popular-page]');
    if (dot) goTo(Number(dot.dataset.popularPage));
  });
  viewport.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    goTo(currentColumn + (event.key === 'ArrowRight' ? 1 : -1));
  });
  viewport.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => update(Math.round(viewport.scrollLeft / Math.max(stride(), 1)), false));
  }, { passive: true });
  viewport.addEventListener('dragstart', (event) => event.preventDefault());
  viewport.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target.closest(actionSelector)) {
      pointerState = null;
      return;
    }
    pointerState = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startColumn: currentColumn,
      scrollLeft: viewport.scrollLeft,
      dragging: false
    };
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const distanceX = event.clientX - pointerState.x;
    const distanceY = event.clientY - pointerState.y;
    if (!pointerState.dragging) {
      if (Math.abs(distanceX) < 10 || Math.abs(distanceX) <= Math.abs(distanceY) * 1.15) return;
      pointerState.dragging = true;
      viewport.classList.add('is-grabbing');
      try { viewport.setPointerCapture(event.pointerId); } catch { /* Pointer capture starts only after a genuine drag. */ }
    }
    if (event.cancelable) event.preventDefault();
    pendingScrollLeft = pointerState.scrollLeft - distanceX;
    if (!dragFrame) dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      viewport.scrollLeft = pendingScrollLeft;
    });
  });
  const finishDrag = (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const drag = pointerState;
    viewport.classList.remove('is-grabbing');
    pointerState = null;
    if (!drag.dragging) return;
    suppressClickUntil = performance.now() + 220;
    clearTimeout(suppressClickTimer);
    suppressClickTimer = setTimeout(() => { suppressClickUntil = 0; }, 240);
    const distance = event.clientX - drag.x;
    goTo(drag.startColumn + (distance < 0 ? 1 : -1));
  };
  viewport.addEventListener('pointerup', finishDrag);
  viewport.addEventListener('pointercancel', (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const startColumn = pointerState.startColumn;
    viewport.classList.remove('is-grabbing');
    pointerState = null;
    goTo(startColumn);
  });
  viewport.addEventListener('click', (event) => {
    if (event.target.closest(actionSelector) || performance.now() > suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickUntil = 0;
  }, true);
  const handleResize = () => {
    measure();
    goTo(currentColumn, false);
  };
  window.addEventListener('resize', handleResize, { passive: true });
  container.popularSliderCleanup = () => {
    window.removeEventListener('resize', handleResize);
    cancelAnimationFrame(scrollFrame);
    cancelAnimationFrame(dragFrame);
    clearTimeout(suppressClickTimer);
  };
  measure();
  goTo(0, false);
}

function initializeTopPicksSlider(container) {
  container.topPicksSliderCleanup?.();
  const viewport = container.querySelector('.db-top-picks-viewport');
  const cards = [...container.querySelectorAll('.db-top-picks-track > .db-popular-card')];
  const previousButton = container.querySelector('[data-top-picks-prev]');
  const nextButton = container.querySelector('[data-top-picks-next]');
  const pagination = container.querySelector('.db-top-picks-pagination');
  const status = container.querySelector('.db-top-picks-status');
  if (!viewport || cards.length < 2 || !previousButton || !nextButton || !pagination) return;

  let currentColumn = 0;
  let visibleColumns = 4;
  let columnWidth = 0;
  let gap = 10;
  let maxColumn = 0;
  let scrollFrame = 0;
  let pointerState = null;
  let dragFrame = 0;
  let pendingScrollLeft = 0;
  let suppressClickUntil = 0;
  let suppressClickTimer = 0;
  const actionSelector = '[data-add-cart], [data-wishlist], [data-quick-view], .db-product-whatsapp, [data-top-picks-prev], [data-top-picks-next], [data-top-picks-page]';
  const stride = () => columnWidth + gap;
  const dots = () => [...pagination.querySelectorAll('[data-top-picks-page]')];

  const rebuildPagination = () => {
    const count = maxColumn + 1;
    if (dots().length === count) return;
    pagination.innerHTML = Array.from({ length: count }, (_, index) => (
      `<button type="button" role="tab" aria-selected="${index === currentColumn}" aria-label="${index + 1}-ci məhsul mövqeyi" data-top-picks-page="${index}"${index === currentColumn ? ' class="active"' : ''}></button>`
    )).join('');
  };
  const measure = () => {
    if (viewport.clientWidth < 1) return false;
    const styles = getComputedStyle(viewport);
    visibleColumns = Math.max(1, Number.parseInt(styles.getPropertyValue('--db-top-picks-columns'), 10) || 4);
    gap = Number.parseFloat(styles.getPropertyValue('--db-top-picks-gap')) || 10;
    columnWidth = (viewport.clientWidth - gap * (visibleColumns - 1)) / visibleColumns;
    maxColumn = Math.max(0, Math.ceil(cards.length / 2) - visibleColumns);
    viewport.style.setProperty('--db-top-picks-column-width', `${columnWidth}px`);
    currentColumn = Math.min(currentColumn, maxColumn);
    rebuildPagination();
    return true;
  };
  const update = (column, announce = true) => {
    currentColumn = Math.max(0, Math.min(maxColumn, column));
    previousButton.disabled = currentColumn === 0;
    nextButton.disabled = currentColumn === maxColumn;
    dots().forEach((dot, index) => {
      const active = index === currentColumn;
      dot.classList.toggle('active', active);
      dot.setAttribute('aria-selected', String(active));
    });
    if (announce && status) status.textContent = `${currentColumn + 1}-ci məhsul sütunu göstərilir`;
  };
  const goTo = (column, smooth = true) => {
    update(column);
    viewport.scrollTo({ left: stride() * currentColumn, behavior: smooth ? 'smooth' : 'auto' });
  };

  previousButton.addEventListener('click', () => goTo(currentColumn - 1));
  nextButton.addEventListener('click', () => goTo(currentColumn + 1));
  pagination.addEventListener('click', (event) => {
    const dot = event.target.closest('[data-top-picks-page]');
    if (dot) goTo(Number(dot.dataset.topPicksPage));
  });
  viewport.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    goTo(currentColumn + (event.key === 'ArrowRight' ? 1 : -1));
  });
  viewport.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => update(Math.round(viewport.scrollLeft / Math.max(stride(), 1)), false));
  }, { passive: true });
  viewport.addEventListener('dragstart', (event) => event.preventDefault());
  viewport.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target.closest(actionSelector)) {
      pointerState = null;
      return;
    }
    pointerState = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startColumn: currentColumn,
      scrollLeft: viewport.scrollLeft,
      dragging: false
    };
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const distanceX = event.clientX - pointerState.x;
    const distanceY = event.clientY - pointerState.y;
    if (!pointerState.dragging) {
      if (Math.abs(distanceX) < 10 || Math.abs(distanceX) <= Math.abs(distanceY) * 1.15) return;
      pointerState.dragging = true;
      viewport.classList.add('is-grabbing');
      try { viewport.setPointerCapture(event.pointerId); } catch { /* Pointer capture starts only after a genuine drag. */ }
    }
    if (event.cancelable) event.preventDefault();
    pendingScrollLeft = pointerState.scrollLeft - distanceX;
    if (!dragFrame) dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      viewport.scrollLeft = pendingScrollLeft;
    });
  });
  const finishDrag = (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const drag = pointerState;
    viewport.classList.remove('is-grabbing');
    pointerState = null;
    if (!drag.dragging) return;
    suppressClickUntil = performance.now() + 220;
    clearTimeout(suppressClickTimer);
    suppressClickTimer = setTimeout(() => { suppressClickUntil = 0; }, 240);
    const distance = event.clientX - drag.x;
    goTo(drag.startColumn + (distance < 0 ? 1 : -1));
  };
  viewport.addEventListener('pointerup', finishDrag);
  viewport.addEventListener('pointercancel', (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const startColumn = pointerState.startColumn;
    viewport.classList.remove('is-grabbing');
    pointerState = null;
    goTo(startColumn);
  });
  viewport.addEventListener('click', (event) => {
    if (event.target.closest(actionSelector) || performance.now() > suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickUntil = 0;
  }, true);
  const handleResize = () => {
    if (measure()) goTo(currentColumn, false);
  };
  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => handleResize())
    : null;
  resizeObserver?.observe(viewport);
  window.addEventListener('resize', handleResize, { passive: true });
  container.topPicksSliderCleanup = () => {
    window.removeEventListener('resize', handleResize);
    resizeObserver?.disconnect();
    cancelAnimationFrame(scrollFrame);
    cancelAnimationFrame(dragFrame);
    clearTimeout(suppressClickTimer);
  };
  if (measure()) goTo(0, false);
}

function initializeNewsSlider(container) {
  container.newsSliderCleanup?.();
  const viewport = container.querySelector('.db-news-viewport');
  const cards = [...container.querySelectorAll('.db-news-track > .db-news-card')];
  const previousButton = container.querySelector('[data-news-prev]');
  const nextButton = container.querySelector('[data-news-next]');
  const pagination = container.querySelector('.db-news-pagination');
  const status = container.querySelector('.db-news-status');
  if (!viewport || cards.length < 2 || !previousButton || !nextButton || !pagination) return;

  let currentColumn = 0;
  let visibleColumns = 3;
  let columnWidth = 0;
  let gap = 10;
  let maxColumn = 0;
  let scrollFrame = 0;
  let pointerState = null;
  let dragFrame = 0;
  let pendingScrollLeft = 0;
  let suppressClickUntil = 0;
  let suppressClickTimer = 0;
  const actionSelector = '[data-news-prev], [data-news-next], [data-news-page]';
  const stride = () => columnWidth + gap;
  const dots = () => [...pagination.querySelectorAll('[data-news-page]')];

  const rebuildPagination = () => {
    const count = maxColumn + 1;
    if (dots().length === count) return;
    pagination.innerHTML = Array.from({ length: count }, (_, index) => (
      `<button type="button" role="tab" aria-selected="${index === currentColumn}" aria-label="${index + 1}-ci xəbər mövqeyi" data-news-page="${index}"${index === currentColumn ? ' class="active"' : ''}></button>`
    )).join('');
  };
  const measure = () => {
    if (viewport.clientWidth < 1) return false;
    const styles = getComputedStyle(viewport);
    visibleColumns = Math.max(1, Number.parseInt(styles.getPropertyValue('--db-news-columns'), 10) || 3);
    gap = Number.parseFloat(styles.getPropertyValue('--db-news-gap')) || 10;
    columnWidth = (viewport.clientWidth - gap * (visibleColumns - 1)) / visibleColumns;
    maxColumn = Math.max(0, cards.length - visibleColumns);
    viewport.style.setProperty('--db-news-column-width', `${columnWidth}px`);
    currentColumn = Math.min(currentColumn, maxColumn);
    rebuildPagination();
    return true;
  };
  const update = (column, announce = true) => {
    currentColumn = Math.max(0, Math.min(maxColumn, column));
    previousButton.disabled = currentColumn === 0;
    nextButton.disabled = currentColumn === maxColumn;
    dots().forEach((dot, index) => {
      const active = index === currentColumn;
      dot.classList.toggle('active', active);
      dot.setAttribute('aria-selected', String(active));
    });
    if (announce && status) status.textContent = `${currentColumn + 1}-ci xəbər mövqeyi göstərilir`;
  };
  const goTo = (column, smooth = true) => {
    update(column);
    viewport.scrollTo({ left: stride() * currentColumn, behavior: smooth ? 'smooth' : 'auto' });
  };

  previousButton.addEventListener('click', () => goTo(currentColumn - 1));
  nextButton.addEventListener('click', () => goTo(currentColumn + 1));
  pagination.addEventListener('click', (event) => {
    const dot = event.target.closest('[data-news-page]');
    if (dot) goTo(Number(dot.dataset.newsPage));
  });
  viewport.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    goTo(currentColumn + (event.key === 'ArrowRight' ? 1 : -1));
  });
  viewport.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => update(Math.round(viewport.scrollLeft / Math.max(stride(), 1)), false));
  }, { passive: true });
  viewport.addEventListener('dragstart', (event) => event.preventDefault());
  viewport.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target.closest(actionSelector)) return;
    pointerState = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startColumn: currentColumn,
      scrollLeft: viewport.scrollLeft,
      dragging: false
    };
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const distanceX = event.clientX - pointerState.x;
    const distanceY = event.clientY - pointerState.y;
    if (!pointerState.dragging) {
      if (Math.abs(distanceX) < 10 || Math.abs(distanceX) <= Math.abs(distanceY) * 1.15) return;
      pointerState.dragging = true;
      viewport.classList.add('is-grabbing');
      try { viewport.setPointerCapture(event.pointerId); } catch { /* Pointer capture starts only after a genuine drag. */ }
    }
    if (event.cancelable) event.preventDefault();
    pendingScrollLeft = pointerState.scrollLeft - distanceX;
    if (!dragFrame) dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      viewport.scrollLeft = pendingScrollLeft;
    });
  });
  const finishDrag = (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const drag = pointerState;
    viewport.classList.remove('is-grabbing');
    pointerState = null;
    if (!drag.dragging) return;
    suppressClickUntil = performance.now() + 220;
    clearTimeout(suppressClickTimer);
    suppressClickTimer = setTimeout(() => { suppressClickUntil = 0; }, 240);
    goTo(drag.startColumn + (event.clientX < drag.x ? 1 : -1));
  };
  viewport.addEventListener('pointerup', finishDrag);
  viewport.addEventListener('pointercancel', (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const startColumn = pointerState.startColumn;
    viewport.classList.remove('is-grabbing');
    pointerState = null;
    goTo(startColumn);
  });
  viewport.addEventListener('click', (event) => {
    if (event.target.closest(actionSelector) || performance.now() > suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickUntil = 0;
  }, true);

  const handleResize = () => {
    if (measure()) goTo(currentColumn, false);
  };
  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(handleResize)
    : null;
  resizeObserver?.observe(viewport);
  window.addEventListener('resize', handleResize, { passive: true });
  container.newsSliderCleanup = () => {
    window.removeEventListener('resize', handleResize);
    resizeObserver?.disconnect();
    cancelAnimationFrame(scrollFrame);
    cancelAnimationFrame(dragFrame);
    clearTimeout(suppressClickTimer);
  };
  if (measure()) goTo(0, false);
}

function enhanceTopPicksTabs() {
  const root = document.querySelector('.section-tab[data-id="bca68f7"]');
  const tabset = root?.querySelector('.section-tabset');
  const tabs = tabset ? [...tabset.querySelectorAll('.tab')] : [];
  const panels = root ? [...root.querySelectorAll('.section-tabs-container > .tab-content')] : [];
  if (!root || tabs.length !== 4 || panels.length !== tabs.length) return false;
  if (root.topPicksTabsCleanup) return true;

  tabset.setAttribute('role', 'tablist');
  tabset.setAttribute('aria-label', 'Məhsul kateqoriyaları');
  tabs.forEach((tab, index) => {
    const tabId = `top-picks-tab-${index}`;
    const panelId = `top-picks-panel-${index}`;
    tab.id = tabId;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panelId);
    panels[index].id = panelId;
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].setAttribute('aria-labelledby', tabId);
    const definition = topPickCategories[panels[index].querySelector('[data-top-picks-products]')?.dataset.id];
    const label = tab.querySelector('.txt');
    const icon = tab.querySelector('.section-tab-icon');
    if (definition && label) label.textContent = definition.label;
    if (definition && icon) {
      icon.style.mask = `url(${definition.icon}) no-repeat 50% 50% / contain`;
      icon.style.webkitMask = `url(${definition.icon}) no-repeat 50% 50% / contain`;
    }
  });

  const synchronize = () => {
    tabs.forEach((tab, index) => {
      const active = tab.classList.contains('active');
      tab.tabIndex = active ? 0 : -1;
      tab.setAttribute('aria-selected', String(active));
      panels[index].hidden = !active;
    });
  };
  const activate = (index, focus = false) => {
    tabs.forEach((tab, tabIndex) => tab.classList.toggle('active', tabIndex === index));
    panels.forEach((panel, panelIndex) => {
      const active = panelIndex === index;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
    synchronize();
    const mobileLabel = tabset.querySelector('.mobile-tabset-nav');
    if (mobileLabel) mobileLabel.textContent = tabs[index].textContent.trim();
    requestAnimationFrame(() => {
      const products = panels[index]?.querySelector('[data-top-picks-products], .db-top-picks-products');
      if (products && !products.topPicksSliderCleanup) initializeTopPicksSlider(products);
      else window.dispatchEvent(new Event('resize'));
      if (focus) tabs[index]?.focus();
    });
  };
  const handleClick = (event) => {
    const selected = event.target.closest('.section-tabset .tab');
    if (!selected) return;
    event.preventDefault();
    event.stopPropagation();
    activate(tabs.indexOf(selected));
  };
  const handleKeydown = (event) => {
    const current = event.target.closest('.section-tabset .tab');
    if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tabs.indexOf(current);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    activate(nextIndex, true);
  };
  const observer = new MutationObserver(synchronize);
  tabs.forEach((tab) => observer.observe(tab, { attributes: true, attributeFilter: ['class'] }));
  root.addEventListener('click', handleClick, true);
  root.addEventListener('keydown', handleKeydown);
  root.topPicksTabsCleanup = () => {
    observer.disconnect();
    root.removeEventListener('click', handleClick, true);
    root.removeEventListener('keydown', handleKeydown);
  };
  const initial = Math.max(0, tabs.findIndex((tab) => tab.classList.contains('active')));
  activate(initial);
  return true;
}

function scheduleTopPicksTabsEnhancement(attempt = 0) {
  if (enhanceTopPicksTabs() || attempt >= 100) return;
  setTimeout(() => scheduleTopPicksTabsEnhancement(attempt + 1), 50);
}

function showToast(message) {
  let toast = document.querySelector('.db-store-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'db-store-toast';
    toast.setAttribute('role', 'status');
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function readWishlist() {
  return new Set((window.DailyBakuCommerce?.readWishlist() || []).map((item) => item.slug));
}

function synchronizeWishlistButtons() {
  window.DailyBakuCommerce?.syncUI();
}

function updateCartCount() {
  window.DailyBakuCommerce?.syncUI();
}

function brandLogoUrl(brand = '') {
  const normalized = String(brand).toLocaleLowerCase('az-AZ');
  const managed = [...cmsBrandLogos].find(([name]) => normalized === name || normalized.includes(name) || name.includes(normalized))?.[1];
  if (managed) return managed;
  const logos = [
    ['milwaukee', '/assets/wp-content/uploads/milwaukee-logo.webp'],
    ['dewalt', '/assets/wp-content/uploads/dewolt-logo.webp'],
    ['makita', '/assets/wp-content/uploads/makita-logo.webp'],
    ['bosch', '/assets/wp-content/uploads/bosch-logo.webp'],
    ['festool', '/assets/wp-content/uploads/festool-logo.webp'],
    ['metabo', '/assets/wp-content/uploads/melabo-logo.webp'],
    ['jet', '/assets/wp-content/uploads/jet-logo.webp'],
    ['max', '/assets/wp-content/uploads/max-logo.webp']
  ];
  return logos.find(([name]) => normalized.includes(name))?.[1] || '';
}

function additionalValue(value) {
  if (Array.isArray(value)) return value.map(additionalValue).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${additionalValue(item)}`).join(', ');
  if (typeof value === 'boolean') return value ? 'Bəli' : 'Xeyr';
  return String(value ?? '').trim();
}

function additionalInformation(product) {
  const attributes = product.attributes && typeof product.attributes === 'object' && !Array.isArray(product.attributes)
    ? Object.entries(product.attributes)
    : [];
  const rows = [
    ['SKU', product.sku],
    ['Brend', product.brand],
    ['Satıcı', product.vendor],
    ['Məhsul növü', product.productType],
    ['Stok', Number.isFinite(Number(product.stock)) ? `${Number(product.stock)} ədəd` : ''],
    ...attributes
  ].filter(([, value]) => additionalValue(value));
  const description = product.description || product.shortDescription || '';
  return `${description ? `<p>${escapeHtml(description)}</p>` : ''}
    <dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(additionalValue(value))}</dd></div>`).join('')}</dl>
    <a href="/mehsul/${encodeURIComponent(product.slug)}/">Məhsul səhifəsinə keç</a>`;
}

function quickViewDialog() {
  let dialog = document.querySelector('.db-quick-view-dialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'db-quick-view-dialog';
  dialog.setAttribute('aria-labelledby', 'db-quick-view-title');
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML = `<button class="db-quick-view-close" type="button" aria-label="Pəncərəni bağla">×</button>
    <div class="db-quick-view-layout">
      <div class="db-quick-view-image"><img class="db-quick-view-product-image" src="" alt="" width="520" height="520"></div>
      <div class="db-quick-view-copy">
        <p class="db-quick-view-recommended"><span aria-hidden="true">✓</span>TÖVSİYƏ OLUNUR!</p>
        <h2 id="db-quick-view-title"></h2>
        <div class="db-quick-view-brand-card">
          <span class="db-quick-view-brand-logo"><img src="" alt="" hidden><b></b></span>
          <span class="db-quick-view-brand-copy"><strong></strong><small>Brend</small></span>
        </div>
        <p class="db-quick-view-sku"><span aria-hidden="true"></span>SKU: <b></b></p>
        <div class="db-quick-view-additional">
          <button type="button" aria-expanded="false" aria-controls="db-quick-view-additional-panel"><span aria-hidden="true">i</span><b>Əlavə məlumat</b><i aria-hidden="true"></i></button>
          <div id="db-quick-view-additional-panel" hidden></div>
        </div>
        <div class="db-quick-view-price"><strong></strong><del></del></div>
        <div class="db-quick-view-quantity" role="group" aria-label="Məhsul sayı">
          <button type="button" data-quick-view-quantity="-1" aria-label="Sayı azalt">−</button>
          <output class="db-quick-view-quantity-value" aria-live="polite">1</output>
          <button type="button" data-quick-view-quantity="1" aria-label="Sayı artır">+</button>
        </div>
        <button class="db-quick-view-cart db-add-cart" type="button"><span class="db-cart-icon" aria-hidden="true"></span><b>SƏBƏTƏ AT</b></button>
      </div>
    </div>`;
  document.body.append(dialog);
  dialog.querySelector('.db-quick-view-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.documentElement.classList.remove('db-quick-view-open'));
  dialog.querySelector('.db-quick-view-additional > button').addEventListener('click', (event) => {
    const toggle = event.currentTarget;
    const panel = dialog.querySelector('#db-quick-view-additional-panel');
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
  });
  dialog.querySelectorAll('[data-quick-view-quantity]').forEach((control) => {
    control.addEventListener('click', () => {
      const output = dialog.querySelector('.db-quick-view-quantity-value');
      output.value = String(Math.max(1, Math.min(99, Number(output.value || output.textContent || 1) + Number(control.dataset.quickViewQuantity))));
      output.textContent = output.value;
    });
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function openQuickView(button) {
  try {
    const product = JSON.parse(button.dataset.quickView);
    const dialog = quickViewDialog();
    const image = dialog.querySelector('.db-quick-view-product-image');
    image.src = safeImageUrl(product.image);
    image.alt = `${product.title} — məhsul şəkli`;
    dialog.querySelector('h2').textContent = product.title;
    const logo = dialog.querySelector('.db-quick-view-brand-logo img');
    const logoFallback = dialog.querySelector('.db-quick-view-brand-logo b');
    const logoUrl = brandLogoUrl(product.brand);
    logo.hidden = !logoUrl;
    logoFallback.hidden = Boolean(logoUrl);
    if (logoUrl) {
      logo.src = logoUrl;
      logo.alt = `${product.brand} loqosu`;
    }
    logoFallback.textContent = product.brand;
    dialog.querySelector('.db-quick-view-brand-copy strong').textContent = product.brand;
    dialog.querySelector('.db-quick-view-sku b').textContent = product.sku || product.slug.split('-').slice(0, 3).join('-').toUpperCase();
    dialog.querySelector('#db-quick-view-additional-panel').innerHTML = additionalInformation(product);
    const additionalToggle = dialog.querySelector('.db-quick-view-additional > button');
    additionalToggle.setAttribute('aria-expanded', 'false');
    dialog.querySelector('#db-quick-view-additional-panel').hidden = true;
    dialog.querySelector('.db-quick-view-price strong').textContent = money.format(product.price);
    const comparePrice = dialog.querySelector('.db-quick-view-price del');
    comparePrice.textContent = Number(product.compareAt) > Number(product.price) ? money.format(product.compareAt) : '';
    const cartButton = dialog.querySelector('.db-add-cart');
    cartButton.dataset.addCart = JSON.stringify({
      listingId: product.listingId,
      variantId: product.variantId,
      slug: product.slug,
      title: product.title,
      price: product.price,
      compareAt: product.compareAt,
      image: product.image,
      sku: product.sku,
      brand: product.brand,
      vendor: product.vendor,
      description: product.description,
      shortDescription: product.shortDescription
    });
    cartButton.setAttribute('aria-label', `${product.title} səbətə əlavə et`);
    window.DailyBakuCommerce?.syncUI();
    const quantity = dialog.querySelector('.db-quick-view-quantity-value');
    quantity.value = '1';
    quantity.textContent = '1';
    if (!dialog.open) {
      document.documentElement.classList.add('db-quick-view-open');
      dialog.showModal();
    }
  } catch {
    showToast('Sürətli baxışı açmaq mümkün olmadı');
  }
}

async function hydrateHome() {
  scheduleTopPicksTabsEnhancement();
  updateCartCount();
  document.documentElement.dataset.cms = 'loading';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${api}/home`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`CMS ${response.status}`);
    const { data } = await response.json();
    const editorConfig = window.dailyBakuEditor?.index || data?.editor?.index;
    renderProducts(data?.products || [], editorConfig);
    renderNews(data?.posts || [], editorConfig);
    renderCatalogData(data?.categories || [], data?.brands || [], editorConfig);
    scheduleTopPicksTabsEnhancement();
    document.documentElement.dataset.cms = 'connected';
    window.dailyBaku = { ...(window.dailyBaku || {}), home: data };
    document.dispatchEvent(new CustomEvent('dailybaku:content', { detail: data }));
  } catch {
    renderProducts([]);
    renderNews([]);
    document.documentElement.dataset.cms = 'unavailable';
  } finally {
    clearTimeout(timeout);
  }
}

document.addEventListener('click', (event) => {
  const quickViewButton = event.target.closest('[data-quick-view]');
  if (quickViewButton) openQuickView(quickViewButton);
});

document.addEventListener('dailybaku:editor', (event) => {
  const home = window.dailyBaku?.home;
  const config = event.detail?.index;
  if (!home || !config) return;
  renderProducts(home.products || [], config);
  renderNews(home.posts || [], config);
  renderCatalogData(home.categories || [], home.brands || [], config);
});

document.addEventListener('dailybaku:languagechange', () => {
  const home = window.dailyBaku?.home;
  if (!home) return;
  const config = window.dailyBakuEditor?.index || home.editor?.index;
  renderProducts(home.products || [], config);
  renderNews(home.posts || [], config);
  renderCatalogData(home.categories || [], home.brands || [], config);
  scheduleTopPicksTabsEnhancement();
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('.et__attributes_filter_form');
  if (!form) return;
  event.preventDefault();
  const fields = new FormData(form);
  const query = new URLSearchParams();
  const category = String(fields.get('product_cat') || '').trim();
  const brand = String(fields.get('pa_brand') || '').trim();
  const origin = String(fields.get('pa_country-of-origin') || '').trim();
  if (category) query.set('kateqoriya', category);
  if (brand) query.set('brend', brand);
  if (origin) query.set('mense', origin);
  location.assign(`/magaza/${query.size ? `?${query}` : ''}`);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrateHome, { once: true });
else hydrateHome();
