(() => {
  'use strict';

  const CART_KEY = 'dailyBakuCartV2';
  const WISHLIST_KEY = 'dailyBakuWishlistV2';
  const LEGACY_WISHLIST_KEY = 'dailyBakuWishlistV1';
  const TOUCHED_KEY = 'dailyBakuCommerceTouchedV1';
  const state = {
    server: null,
    syncTimer: 0,
    syncing: false,
    recommendations: [],
    recommendationsLoading: false,
    recommendationsLoaded: false,
    drawerTrigger: null
  };

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const tr = (value) => globalThis.DailyBakuI18n?.t(value) || value;
  const localizeProduct = (product) => globalThis.DailyBakuI18n?.localizeProduct(product) || product;
  const money = new Intl.NumberFormat('az-AZ', {
    style: 'currency',
    currency: 'AZN',
    minimumFractionDigits: 2
  });
  const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/></svg>';
  const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 6.5 11 11m0-11-11 11"/></svg>';

  const parseArray = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const cleanProduct = (product = {}) => {
    const cleaned = {
      ...(product.listingId ? { listingId: String(product.listingId) } : {}),
      ...(product.variantId ? { variantId: String(product.variantId) } : {}),
      slug: String(product.slug || ''),
      title: String(product.title || product.slug || ''),
      price: Number(product.price || 0),
      ...(Number(product.compareAt) > 0 ? { compareAt: Number(product.compareAt) } : {}),
      image: String(product.image || '/assets/wp-content/uploads/other-cat.webp'),
      ...(product.sku ? { sku: String(product.sku) } : {}),
      ...(product.brand ? { brand: String(product.brand) } : {}),
      ...(product.vendor ? { vendor: String(product.vendor) } : {}),
      ...(product.description ? { description: String(product.description) } : {}),
      ...(product.shortDescription ? { shortDescription: String(product.shortDescription) } : {})
    };
    return globalThis.DailyBakuI18n?.canonicalizeProduct(cleaned) || cleaned;
  };

  function readCart() {
    return parseArray(CART_KEY)
      .map((item) => ({ ...cleanProduct(item), quantity: Math.max(1, Number(item.quantity || 1)) }))
      .filter((item) => item.slug);
  }

  function readWishlist() {
    const current = parseArray(WISHLIST_KEY).map(cleanProduct).filter((item) => item.slug);
    if (current.length || localStorage.getItem(WISHLIST_KEY) !== null) return current;
    return parseArray(LEGACY_WISHLIST_KEY)
      .filter((slug) => typeof slug === 'string' && slug)
      .map((slug) => cleanProduct({ slug }));
  }

  function persist(key, value, { sync = true } = {}) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem(TOUCHED_KEY, '1');
    } catch {
      // Commerce still works for the current page if browser storage is unavailable.
    }
    syncUI();
    document.dispatchEvent(new CustomEvent('dailybaku:commerce-change', {
      detail: { cart: readCart(), wishlist: readWishlist() }
    }));
    if (sync) scheduleBackendSync();
  }

  function writeCart(items, options) {
    persist(CART_KEY, items.map((item) => ({ ...cleanProduct(item), quantity: Math.max(1, Number(item.quantity || 1)) })), options);
  }

  function writeWishlist(items, options) {
    const unique = new Map();
    items.map(cleanProduct).filter((item) => item.slug).forEach((item) => unique.set(item.slug, item));
    persist(WISHLIST_KEY, [...unique.values()], options);
    try { localStorage.removeItem(LEGACY_WISHLIST_KEY); } catch { /* Optional storage. */ }
  }

  function parseButtonProduct(button) {
    const card = button.closest('article, .db-quick-view-dialog, .page-product-detail');
    const candidates = [
      card?.querySelector('[data-add-cart]')?.dataset.addCart,
      card?.querySelector('[data-quick-view]')?.dataset.quickView
    ];
    const slug = button.dataset.wishlist || '';
    if (!candidates.some(Boolean) && slug) {
      for (const candidate of document.querySelectorAll('[data-add-cart]')) {
        try {
          const parsed = JSON.parse(candidate.dataset.addCart || '{}');
          if (parsed.slug === slug) {
            candidates.push(candidate.dataset.addCart);
            break;
          }
        } catch {
          // Ignore malformed third-party product markup.
        }
      }
    }
    for (const candidate of candidates) {
      try {
        const product = cleanProduct(JSON.parse(candidate || '{}'));
        if (product.slug) return product;
      } catch {
        // Continue to the next product payload.
      }
    }
    return cleanProduct({ slug });
  }

  function cartLabelTarget(button) {
    return button.querySelector(':scope > b')
      || [...button.querySelectorAll(':scope > span')].find((span) => !span.classList.contains('db-cart-icon'));
  }

  function isIconOnlyCart(button) {
    const label = cartLabelTarget(button);
    return !label && Boolean(button.querySelector('.db-cart-icon'));
  }

  function setCartButtonState(button, active) {
    let product;
    try { product = cleanProduct(JSON.parse(button.dataset.addCart || '{}')); } catch { return; }
    if (!product.slug) return;
    product = localizeProduct(product);
    button.classList.toggle('is-in-cart', active);
    button.setAttribute('aria-label', active ? `${product.title} — ${tr('SƏBƏTƏ BAX')}` : `${product.title} — ${tr('Səbətə at')}`);
    button.setAttribute('aria-pressed', String(active));
    if (isIconOnlyCart(button)) return;

    const label = cartLabelTarget(button);
    if (label) {
      if (!button.dataset.cartOriginalLabel) button.dataset.cartOriginalLabel = label.textContent.trim();
      label.textContent = active ? tr('SƏBƏTƏ BAX') : tr(button.dataset.cartOriginalLabel);
    } else {
      if (!button.dataset.cartOriginalLabel) button.dataset.cartOriginalLabel = button.textContent.trim();
      button.textContent = active ? tr('SƏBƏTƏ BAX') : tr(button.dataset.cartOriginalLabel);
    }
  }

  function syncUI() {
    const cart = readCart();
    const cartSlugs = new Set(cart.map((item) => item.slug));
    const wishlist = readWishlist();
    const wishlistMap = new Map(wishlist.map((item) => [item.slug, item]));
    let wishlistEnriched = false;

    document.querySelectorAll('[data-wishlist]').forEach((button) => {
      const slug = button.dataset.wishlist || '';
      const active = wishlistMap.has(slug);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', tr(active ? 'Seçilmişlərdən çıxar' : 'Seçilmişlərə əlavə et'));
      const symbol = button.querySelector(':scope > span:not(.db-action-icon):not(.db-action-tooltip)');
      if (symbol) symbol.textContent = '♡';
      const tooltip = button.querySelector('.db-action-tooltip');
      if (tooltip) tooltip.textContent = tr(active ? 'Seçilmişlərdən çıxar' : 'Seçilmişlərə əlavə et');
      const saved = wishlistMap.get(slug);
      if (saved && !saved.listingId) {
        const enriched = parseButtonProduct(button);
        if (enriched.listingId || enriched.title) {
          wishlistMap.set(slug, { ...saved, ...enriched });
          wishlistEnriched = true;
        }
      }
    });
    if (wishlistEnriched) {
      try { localStorage.setItem(WISHLIST_KEY, JSON.stringify([...wishlistMap.values()])); } catch { /* Optional storage. */ }
    }

    document.querySelectorAll('[data-add-cart]').forEach((button) => {
      try {
        const product = JSON.parse(button.dataset.addCart || '{}');
        setCartButtonState(button, cartSlugs.has(product.slug));
      } catch {
        // Invalid product payloads stay inert.
      }
    });

    const cartCount = cart.reduce((total, item) => total + Number(item.quantity || 1), 0);
    const wishlistCount = wishlistMap.size;
    document.querySelectorAll('.cart-contents,[data-cart-count]').forEach((counter) => {
      counter.textContent = String(cartCount);
      counter.setAttribute('aria-label', tr(`Səbətdə ${cartCount} məhsul`));
    });
    document.querySelectorAll('.wishlist-counter,[data-wishlist-count]').forEach((counter) => {
      counter.textContent = String(wishlistCount);
      counter.setAttribute('aria-label', tr(`Seçilmişlərdə ${wishlistCount} məhsul`));
    });
  }

  function showToast(message) {
    let toast = document.querySelector('.db-store-toast, .page-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'db-store-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.append(toast);
    }
    toast.textContent = tr(message);
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function drawerProductCard(item) {
    item = localizeProduct(item);
    return `<article class="db-mini-cart-item">
      <a class="db-mini-cart-item-image" href="/mehsul/${encodeURIComponent(item.slug)}/">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" width="100" height="100" loading="lazy">
      </a>
      <div class="db-mini-cart-item-copy">
        <a class="db-mini-cart-item-title" href="/mehsul/${encodeURIComponent(item.slug)}/">${escapeHtml(item.title)}</a>
        <button class="db-mini-cart-remove" type="button" data-mini-cart-remove="${escapeHtml(item.slug)}" aria-label="${escapeHtml(item.title)} məhsulunu səbətdən sil">${trashIcon}</button>
        <div class="db-mini-cart-item-bottom">
          <div class="db-mini-cart-quantity" role="group" aria-label="${escapeHtml(item.title)} məhsulunun sayı">
            <button type="button" data-mini-cart-quantity="${escapeHtml(item.slug)}" data-delta="-1" aria-label="Sayı azalt">−</button>
            <output aria-live="polite">${Number(item.quantity || 1)}</output>
            <button type="button" data-mini-cart-quantity="${escapeHtml(item.slug)}" data-delta="1" aria-label="Sayı artır">+</button>
          </div>
          <strong>${money.format(Number(item.price) * Number(item.quantity || 1))}</strong>
        </div>
      </div>
    </article>`;
  }

  function recommendationCard(product) {
    product = localizeProduct(product);
    const payload = escapeHtml(JSON.stringify(cleanProduct(product)));
    return `<article class="db-mini-cart-recommendation">
      <a href="/mehsul/${encodeURIComponent(product.slug)}/">
        <span><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" width="150" height="116" loading="lazy"></span>
        <b>${escapeHtml(product.title)}</b>
      </a>
      <div><strong>${money.format(product.price)}</strong><button type="button" data-add-cart="${payload}" aria-label="${escapeHtml(product.title)} səbətə əlavə et"><span class="db-cart-icon" aria-hidden="true"></span></button></div>
    </article>`;
  }

  function drawerMarkup() {
    return `<header class="db-mini-cart-header">
      <h2 id="db-mini-cart-title">SƏBƏTİM</h2>
      <button class="et__cart-toggle-remove db-mini-cart-close" type="button" data-mini-cart-close aria-label="Səbəti bağla">${closeIcon}</button>
    </header>
    <div class="db-mini-cart-delivery"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 8h17v14H3V8Zm17 5h5l4 5v4h-9v-9ZM8 26a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm16 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg><span>5 məhsul sifariş et, növbəti gün pulsuz çatdırılma qazan!</span></div>
    <div class="db-mini-cart-body">
      <div class="db-mini-cart-items" data-mini-cart-items></div>
      <section class="db-mini-cart-related" aria-labelledby="db-mini-cart-related-title">
        <div class="db-mini-cart-related-head">
          <h3 id="db-mini-cart-related-title">Bunları da bəyənə bilərsiniz</h3>
          <div>
            <button type="button" data-mini-cart-slide="-1" aria-label="Əvvəlki məhsullar">‹</button>
            <button type="button" data-mini-cart-slide="1" aria-label="Növbəti məhsullar">›</button>
          </div>
        </div>
        <div class="db-mini-cart-related-track" data-mini-cart-related tabindex="0" aria-label="Tövsiyə olunan məhsullar"></div>
      </section>
    </div>
    <footer class="db-mini-cart-footer">
      <div><span>Yekun məbləğ:</span><strong data-mini-cart-total>0,00 ₼</strong></div>
      <a href="/sebet/">SƏBƏTƏ BAX</a>
    </footer>`;
  }

  function ensureCartDrawer() {
    let drawer = document.querySelector('.et__cart');
    if (!drawer) {
      drawer = document.createElement('aside');
      drawer.className = 'et__cart';
      document.body.append(drawer);
    }
    drawer.classList.add('db-mini-cart');
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'db-mini-cart-title');
    drawer.setAttribute('aria-hidden', String(!drawer.classList.contains('active')));
    if (!drawer.querySelector('[data-mini-cart-items]')) drawer.innerHTML = drawerMarkup();

    let shadow = drawer.nextElementSibling?.classList.contains('et__cart-shadow')
      ? drawer.nextElementSibling
      : document.querySelector('.et__cart-shadow');
    if (!shadow) {
      shadow = document.createElement('button');
      shadow.className = 'et__cart-shadow db-mini-cart-shadow';
      shadow.type = 'button';
      shadow.setAttribute('aria-label', 'Səbəti bağla');
      drawer.insertAdjacentElement('afterend', shadow);
    }
    return drawer;
  }

  function productsFromPage() {
    const products = new Map();
    document.querySelectorAll('[data-add-cart]').forEach((button) => {
      try {
        const product = cleanProduct(JSON.parse(button.dataset.addCart || '{}'));
        if (product.slug) products.set(product.slug, product);
      } catch {
        // Ignore third-party buttons with malformed product data.
      }
    });
    return [...products.values()];
  }

  async function loadCartRecommendations() {
    if (state.recommendationsLoaded || state.recommendationsLoading) return;
    state.recommendationsLoading = true;
    try {
      const response = await fetch('/api/v1/public/home', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Catalog unavailable');
      const { data } = await response.json();
      state.recommendations = (data?.products || []).map((product) => cleanProduct({
        listingId: product.id,
        variantId: product.variant_id,
        slug: product.slug,
        title: product.title,
        price: product.price,
        compareAt: product.compare_at_price,
        image: product.image_url,
        sku: product.sku,
        brand: product.brand_name,
        vendor: product.vendor_name
      })).filter((product) => product.slug);
    } catch {
      state.recommendations = productsFromPage();
    } finally {
      state.recommendationsLoading = false;
      state.recommendationsLoaded = true;
      renderCartDrawer();
    }
  }

  function renderCartDrawer() {
    const drawer = ensureCartDrawer();
    const items = readCart();
    const itemsContainer = drawer.querySelector('[data-mini-cart-items]');
    const related = drawer.querySelector('[data-mini-cart-related]');
    const cartSlugs = new Set(items.map((item) => item.slug));
    const cartBrands = new Set(items.map((item) => String(item.brand || '').toLocaleLowerCase('az-AZ')).filter(Boolean));
    const recommendations = state.recommendations
      .filter((product) => !cartSlugs.has(product.slug))
      .sort((first, second) => Number(cartBrands.has(String(second.brand || '').toLocaleLowerCase('az-AZ')))
        - Number(cartBrands.has(String(first.brand || '').toLocaleLowerCase('az-AZ'))))
      .slice(0, 5);
    itemsContainer.innerHTML = items.length
      ? items.map(drawerProductCard).join('')
      : '<div class="db-mini-cart-empty"><span class="db-cart-icon" aria-hidden="true"></span><h3>Səbətiniz boşdur</h3><p>Bəyəndiyiniz məhsulları səbətə əlavə edin.</p></div>';
    drawer.querySelector('.db-mini-cart-related').hidden = !recommendations.length;
    related.innerHTML = recommendations.map(recommendationCard).join('');
    drawer.querySelector('[data-mini-cart-total]').textContent = money.format(
      items.reduce((total, item) => total + Number(item.price) * Number(item.quantity || 1), 0)
    );
    drawer.querySelector('.db-mini-cart-footer').hidden = !items.length;
    syncUI();
    if (!state.recommendationsLoaded) void loadCartRecommendations();
  }

  function openCartDrawer(trigger = null) {
    const drawer = ensureCartDrawer();
    state.drawerTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
    renderCartDrawer();
    drawer.classList.add('active');
    drawer.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('db-cart-open');
    window.setTimeout(() => drawer.querySelector('[data-mini-cart-close]')?.focus(), 30);
  }

  function closeCartDrawer() {
    const drawer = document.querySelector('.db-mini-cart');
    if (!drawer) return;
    drawer.classList.remove('active');
    drawer.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('db-cart-open');
    if (state.drawerTrigger instanceof HTMLElement && state.drawerTrigger.isConnected) state.drawerTrigger.focus();
    state.drawerTrigger = null;
  }

  function changeCartQuantity(slug, delta) {
    const cart = readCart();
    const item = cart.find((entry) => entry.slug === slug);
    if (!item) return;
    item.quantity = Math.max(1, Math.min(99, Number(item.quantity || 1) + Number(delta || 0)));
    writeCart(cart);
  }

  function csrfToken() {
    const part = document.cookie.split('; ').find((item) => item.startsWith('db_csrf=') || item.startsWith('__Host-db_csrf='));
    return part ? decodeURIComponent(part.slice(part.indexOf('=') + 1)) : '';
  }

  async function api(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const token = csrfToken();
    if (token && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = token;
    const response = await fetch(`/api/v1/customer${path}`, {
      credentials: 'same-origin',
      ...options,
      headers
    });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || 'Sorğunu yerinə yetirmək mümkün olmadı');
    return body.data;
  }

  function backendPayload() {
    return {
      cart: readCart()
        .filter((item) => item.listingId && item.variantId)
        .map((item) => ({ listingId: item.listingId, variantId: item.variantId, quantity: item.quantity })),
      wishlist: readWishlist()
        .filter((item) => item.listingId)
        .map((item) => ({ listingId: item.listingId }))
    };
  }

  async function hydrateMissingWishlistProducts() {
    const wishlist = readWishlist();
    const missing = wishlist.filter((item) => item.slug && !item.listingId);
    if (!missing.length) return;
    const enriched = await Promise.all(missing.map(async (item) => {
      try {
        const response = await fetch(`/api/v1/public/products/${encodeURIComponent(item.slug)}`, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin'
        });
        if (!response.ok) return item;
        const { data } = await response.json();
        return cleanProduct({
          listingId: data.id,
          variantId: data.variants?.[0]?.id,
          slug: data.slug,
          title: data.title,
          price: data.price,
          compareAt: data.compare_at_price,
          image: data.media?.sort((a, b) => Number(a.position || 0) - Number(b.position || 0))?.[0]?.url,
          sku: data.sku,
          brand: data.brand_name,
          vendor: data.vendor_name
        });
      } catch {
        return item;
      }
    }));
    const replacements = new Map(enriched.map((item) => [item.slug, item]));
    writeWishlist(wishlist.map((item) => replacements.get(item.slug) || item), { sync: false });
  }

  function acceptServerState(server, { replace = false } = {}) {
    if (!server) return;
    state.server = server;
    if (replace) {
      writeCart(server.cart || [], { sync: false });
      writeWishlist(server.wishlist || [], { sync: false });
    } else {
      const cart = new Map((server.cart || []).map((item) => [item.slug, item]));
      readCart().forEach((item) => cart.set(item.slug, { ...cart.get(item.slug), ...item }));
      const wishlist = new Map((server.wishlist || []).map((item) => [item.slug, item]));
      readWishlist().forEach((item) => wishlist.set(item.slug, { ...wishlist.get(item.slug), ...item }));
      writeCart([...cart.values()], { sync: false });
      writeWishlist([...wishlist.values()], { sync: false });
    }
    document.dispatchEvent(new CustomEvent('dailybaku:customer-state', { detail: server }));
  }

  async function syncBackend() {
    if (state.syncing) return;
    state.syncing = true;
    try {
      const server = await api('/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendPayload())
      });
      state.server = server;
      document.dispatchEvent(new CustomEvent('dailybaku:customer-state', { detail: server }));
    } catch {
      // Local state remains authoritative while the API is unavailable.
    } finally {
      state.syncing = false;
    }
  }

  function scheduleBackendSync() {
    clearTimeout(state.syncTimer);
    state.syncTimer = setTimeout(syncBackend, 180);
  }

  async function refreshCustomerState() {
    const hadLocalState = localStorage.getItem(TOUCHED_KEY) !== null
      || localStorage.getItem(CART_KEY) !== null
      || localStorage.getItem(WISHLIST_KEY) !== null
      || localStorage.getItem(LEGACY_WISHLIST_KEY) !== null;
    try {
      const server = await api('/state');
      acceptServerState(server, { replace: !hadLocalState });
      if (hadLocalState) {
        await hydrateMissingWishlistProducts();
        await syncBackend();
      }
      return state.server;
    } catch {
      return null;
    }
  }

  function toggleWishlist(button) {
    const product = parseButtonProduct(button);
    if (!product.slug) return;
    const wishlist = readWishlist();
    const index = wishlist.findIndex((item) => item.slug === product.slug);
    if (index >= 0) {
      wishlist.splice(index, 1);
      writeWishlist(wishlist);
      showToast('Seçilmişlərdən çıxarıldı');
    } else {
      wishlist.push(product);
      writeWishlist(wishlist);
      button.classList.add('is-adding');
      setTimeout(() => button.classList.remove('is-adding'), 420);
      showToast('Seçilmişlərə əlavə edildi');
    }
  }

  function addToCart(button) {
    let product;
    try { product = cleanProduct(JSON.parse(button.dataset.addCart || '{}')); } catch {
      showToast('Məhsulu səbətə əlavə etmək mümkün olmadı');
      return;
    }
    if (!product.slug) return;
    const cart = readCart();
    if (cart.some((item) => item.slug === product.slug)) {
      openCartDrawer(button);
      return;
    }
    const productPage = button.closest('[data-product-page]');
    const quantity = Math.max(1, Number(
      button.closest('.db-quick-view-dialog')?.querySelector('.db-quick-view-quantity-value')?.value
      || productPage?.querySelector('[data-product-quantity-output]')?.value
      || 1
    ));
    cart.push({ ...product, quantity });
    writeCart(cart);
    button.classList.add('is-adding');
    setTimeout(() => button.classList.remove('is-adding'), 500);
    showToast('Məhsul səbətə əlavə edildi');
    const dialog = button.closest('dialog[open]');
    if (dialog && typeof dialog.close === 'function') dialog.close();
    openCartDrawer(button);
  }

  document.addEventListener('click', (event) => {
    const drawerToggle = event.target.closest('[data-mini-cart-toggle]');
    if (drawerToggle) {
      event.preventDefault();
      openCartDrawer(drawerToggle);
      return;
    }
    const themeDrawerToggle = event.target.closest('.et__cart-toggle');
    if (themeDrawerToggle) {
      renderCartDrawer();
      window.setTimeout(() => {
        const drawer = document.querySelector('.db-mini-cart');
        if (!drawer) return;
        const open = drawer.classList.contains('active');
        drawer.setAttribute('aria-hidden', String(!open));
        document.documentElement.classList.toggle('db-cart-open', open);
      });
      return;
    }
    const drawerClose = event.target.closest('[data-mini-cart-close], .db-mini-cart-shadow');
    if (drawerClose) {
      event.preventDefault();
      closeCartDrawer();
      return;
    }
    const drawerRemove = event.target.closest('[data-mini-cart-remove]');
    if (drawerRemove) {
      event.preventDefault();
      writeCart(readCart().filter((item) => item.slug !== drawerRemove.dataset.miniCartRemove));
      showToast('Məhsul səbətdən silindi');
      return;
    }
    const quantityButton = event.target.closest('[data-mini-cart-quantity]');
    if (quantityButton) {
      event.preventDefault();
      changeCartQuantity(quantityButton.dataset.miniCartQuantity, quantityButton.dataset.delta);
      return;
    }
    const sliderButton = event.target.closest('[data-mini-cart-slide]');
    if (sliderButton) {
      event.preventDefault();
      const track = sliderButton.closest('.db-mini-cart-related')?.querySelector('[data-mini-cart-related]');
      track?.scrollBy({ left: Number(sliderButton.dataset.miniCartSlide) * 164, behavior: 'smooth' });
      return;
    }
    const wishlistButton = event.target.closest('[data-wishlist]');
    if (wishlistButton) {
      event.preventDefault();
      toggleWishlist(wishlistButton);
      return;
    }
    const cartButton = event.target.closest('[data-add-cart]');
    if (cartButton) {
      event.preventDefault();
      addToCart(cartButton);
    }
  });

  let relatedDrag = null;
  let relatedDragFrame = 0;
  let relatedPendingLeft = 0;
  let relatedClickBlock = null;

  const finishRelatedDrag = (event, cancelled = false) => {
    if (!relatedDrag || relatedDrag.pointerId !== event.pointerId) return;
    const drag = relatedDrag;
    cancelAnimationFrame(relatedDragFrame);
    relatedDragFrame = 0;
    if (drag.dragging) drag.track.scrollLeft = relatedPendingLeft;
    relatedDrag = null;
    drag.track.classList.remove('is-dragging');
    try {
      if (drag.track.hasPointerCapture(event.pointerId)) drag.track.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture is an enhancement and may already be released by the browser.
    }
    if (drag.dragging && !cancelled) {
      relatedClickBlock = { track: drag.track, until: performance.now() + 220 };
      window.setTimeout(() => {
        if (relatedClickBlock?.track === drag.track) relatedClickBlock = null;
      }, 240);
    }
  };

  document.addEventListener('pointerdown', (event) => {
    const track = event.target.closest('[data-mini-cart-related]');
    if (!track || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    relatedDrag = {
      track,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: track.scrollLeft,
      dragging: false
    };
  });
  document.addEventListener('pointermove', (event) => {
    if (!relatedDrag || relatedDrag.pointerId !== event.pointerId) return;
    const distanceX = event.clientX - relatedDrag.startX;
    const distanceY = event.clientY - relatedDrag.startY;
    if (!relatedDrag.dragging) {
      if (Math.abs(distanceX) < 10) return;
      if (Math.abs(distanceX) <= Math.abs(distanceY) * 1.15) {
        relatedDrag = null;
        return;
      }
      relatedDrag.dragging = true;
      relatedDrag.track.classList.add('is-dragging');
      try { relatedDrag.track.setPointerCapture(event.pointerId); } catch { /* Dragging also works without capture. */ }
    }
    if (event.cancelable) event.preventDefault();
    relatedPendingLeft = relatedDrag.scrollLeft - distanceX;
    if (!relatedDragFrame) relatedDragFrame = requestAnimationFrame(() => {
      relatedDragFrame = 0;
      if (relatedDrag) relatedDrag.track.scrollLeft = relatedPendingLeft;
    });
  });
  document.addEventListener('pointerup', (event) => finishRelatedDrag(event));
  document.addEventListener('pointercancel', (event) => finishRelatedDrag(event, true));
  document.addEventListener('dragstart', (event) => {
    if (event.target.closest('[data-mini-cart-related]')) event.preventDefault();
  });
  document.addEventListener('click', (event) => {
    if (!relatedClickBlock || performance.now() > relatedClickBlock.until) {
      relatedClickBlock = null;
      return;
    }
    if (!relatedClickBlock.track.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    relatedClickBlock = null;
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.querySelector('.db-mini-cart.active')) closeCartDrawer();
  });

  window.addEventListener('storage', (event) => {
    if ([CART_KEY, WISHLIST_KEY, LEGACY_WISHLIST_KEY].includes(event.key)) {
      syncUI();
      renderCartDrawer();
    }
  });

  document.addEventListener('dailybaku:languagechange', () => {
    syncUI();
    renderCartDrawer();
  });

  const observer = new MutationObserver((mutations) => {
    const hasCommerceMarkup = mutations.some((mutation) => [...mutation.addedNodes].some((node) =>
      node instanceof Element
      && (node.matches('[data-add-cart],[data-wishlist]')
        || node.querySelector('[data-add-cart],[data-wishlist]'))
    ));
    if (hasCommerceMarkup) syncUI();
  });

  const commerce = {
    readCart,
    writeCart,
    readWishlist,
    writeWishlist,
    removeCart(slug) {
      writeCart(readCart().filter((item) => item.slug !== slug));
    },
    removeWishlist(slug) {
      writeWishlist(readWishlist().filter((item) => item.slug !== slug));
    },
    openCartDrawer,
    closeCartDrawer,
    syncUI,
    syncBackend,
    refreshCustomerState,
    request: api,
    getServerState: () => state.server,
    saveProfile: (payload) => api('/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
    savePassword: (payload) => api('/profile/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
    saveAddress: (type, payload) => api(`/addresses/${encodeURIComponent(type)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
    async logout() {
      const token = csrfToken();
      await Promise.allSettled([
        api('/logout', { method: 'POST' }),
        fetch('/api/v1/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: token ? { 'X-CSRF-Token': token } : {}
        })
      ]);
      try {
        localStorage.removeItem(CART_KEY);
        localStorage.removeItem(WISHLIST_KEY);
        localStorage.removeItem(LEGACY_WISHLIST_KEY);
        localStorage.removeItem(TOUCHED_KEY);
      } catch {
        // Storage cleanup is best-effort during logout.
      }
    }
  };
  window.DailyBakuCommerce = commerce;

  const initialize = () => {
    ensureCartDrawer();
    renderCartDrawer();
    syncUI();
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('dailybaku:commerce-change', renderCartDrawer);
    void refreshCustomerState();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
