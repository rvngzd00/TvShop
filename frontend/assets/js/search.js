(() => {
  'use strict';

  const FORM_SELECTOR = 'form[data-db-search]';
  const MIN_QUERY_LENGTH = 2;
  const RESULT_LIMIT = 8;
  const resultCache = new Map();
  const formState = new WeakMap();
  const money = new Intl.NumberFormat('az-AZ', {
    style: 'currency',
    currency: 'AZN',
    minimumFractionDigits: 2
  });
  const letterMap = { ə: 'e', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', ç: 'c' };

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  const normalize = (value = '') => String(value)
    .trim()
    .toLocaleLowerCase('az-AZ')
    .replace(/[əğıöşüç]/g, (letter) => letterMap[letter] || letter);

  function safeImage(value) {
    try {
      const url = new URL(value || '/assets/wp-content/uploads/other-cat.webp', location.origin);
      if (url.origin !== location.origin && url.protocol !== 'https:') throw new Error('Unsafe image');
      return escapeHtml(url.href);
    } catch {
      return '/assets/wp-content/uploads/other-cat.webp';
    }
  }

  function stateFor(form) {
    if (!formState.has(form)) {
      formState.set(form, {
        activeIndex: -1,
        abortController: null,
        timer: 0,
        requestToken: 0
      });
    }
    return formState.get(form);
  }

  function ensurePanel(form, index) {
    let panel = form.querySelector(':scope > .db-search-preview');
    const input = form.querySelector('input[name="axtaris"], .query');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'db-search-preview';
      panel.id = `db-search-preview-${index}`;
      panel.hidden = true;
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'Canlı məhsul nəticələri');
      form.append(panel);
    }
    if (input) {
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-haspopup', 'listbox');
      input.setAttribute('aria-controls', panel.id);
      input.setAttribute('aria-expanded', String(!panel.hidden));
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
    }
    return panel;
  }

  function setPanelOpen(form, open) {
    const panel = form.querySelector(':scope > .db-search-preview');
    const input = form.querySelector('input[name="axtaris"], .query');
    if (!panel || !input) return;
    panel.hidden = !open;
    form.classList.toggle('db-search-open', open);
    input.setAttribute('aria-expanded', String(open));
    if (!open) {
      input.removeAttribute('aria-activedescendant');
      stateFor(form).activeIndex = -1;
    }
  }

  function renderLoading(form) {
    const panel = form.querySelector(':scope > .db-search-preview');
    if (!panel) return;
    panel.setAttribute('aria-busy', 'true');
    panel.innerHTML = `<div class="db-search-preview-title"><strong>Məhsullar axtarılır</strong><span>Zəhmət olmasa gözləyin…</span></div>
      <div class="db-search-skeletons" aria-hidden="true">
        ${Array.from({ length: 3 }, () => '<span><i></i><b></b><em></em></span>').join('')}
      </div>`;
    setPanelOpen(form, true);
  }

  function productPayload(product) {
    return {
      listingId: product.id,
      variantId: product.variant_id,
      slug: product.slug,
      title: product.title,
      price: Number(product.price || 0),
      compareAt: Number(product.compare_at_price || 0),
      image: product.image_url,
      sku: product.sku,
      brand: product.brand_name,
      vendor: product.vendor_name,
      shortDescription: product.short_description,
      videoUrl: product.video_url
    };
  }

  function productResult(product, index, listId) {
    const price = Number(product.price || 0);
    const compareAt = Number(product.compare_at_price || 0);
    const brand = product.brand_name || product.vendor_name || 'TVShop';
    const meta = [brand, product.category_names].filter(Boolean).join(' · ');
    const payload = escapeHtml(JSON.stringify(productPayload(product)));
    return `<li id="${listId}-option-${index}" role="option" aria-selected="false" data-search-option>
      <a class="db-search-result-main" href="/mehsul/${encodeURIComponent(product.slug)}/">
        <span class="db-search-result-image">${product.video_url ? `<video class="db-product-video" data-product-video data-src="${escapeHtml(product.video_url)}" poster="${safeImage(product.image_url)}" muted loop playsinline preload="none" aria-label="${escapeHtml(`${product.title} — məhsul videosu`)}"></video>` : `<img src="${safeImage(product.image_url)}" alt="${escapeHtml(product.alt_text || product.title)}" width="68" height="68" loading="lazy">`}</span>
        <span class="db-search-result-copy">
          <small>${escapeHtml(meta)}</small>
          <b>${escapeHtml(product.title)}</b>
          <span class="db-search-result-price"><strong>${money.format(price)}</strong>${compareAt > price ? `<del>${money.format(compareAt)}</del>` : ''}</span>
        </span>
      </a>
      <button class="db-search-result-cart" type="button" data-add-cart="${payload}" aria-label="${escapeHtml(product.title)} məhsulunu səbətə əlavə et"><span class="db-cart-icon" aria-hidden="true"></span></button>
    </li>`;
  }

  function renderResults(form, term, result) {
    const panel = form.querySelector(':scope > .db-search-preview');
    if (!panel) return;
    const products = Array.isArray(result?.data?.products) ? result.data.products : [];
    const total = Number(result?.meta?.total ?? products.length);
    const listId = `${panel.id}-list`;
    panel.removeAttribute('aria-busy');

    if (!products.length) {
      panel.innerHTML = `<div class="db-search-empty">
        <span aria-hidden="true"></span>
        <strong>Məhsul tapılmadı</strong>
        <p>“${escapeHtml(term)}” üçün nəticə yoxdur. Daha qısa və ya fərqli söz sınayın.</p>
      </div>
      <a class="db-search-all" href="/magaza/">Bütün məhsullara bax <span aria-hidden="true">→</span></a>`;
      setPanelOpen(form, true);
      return;
    }

    panel.innerHTML = `<div class="db-search-preview-title"><strong>Məhsullar</strong><span>${total} nəticə tapıldı</span></div>
      <ul id="${listId}" role="listbox" aria-label="${escapeHtml(term)} üçün məhsullar">
        ${products.map((product, index) => productResult(product, index, listId)).join('')}
      </ul>
      <a class="db-search-all" href="/magaza/?axtaris=${encodeURIComponent(term)}">Bütün nəticələrə bax <span aria-hidden="true">→</span></a>`;
    stateFor(form).activeIndex = -1;
    setPanelOpen(form, true);
    window.DailyBakuCommerce?.syncUI();
  }

  function renderError(form) {
    const panel = form.querySelector(':scope > .db-search-preview');
    if (!panel) return;
    panel.removeAttribute('aria-busy');
    panel.innerHTML = `<div class="db-search-empty error">
      <span aria-hidden="true">!</span>
      <strong>Axtarışı tamamlamaq mümkün olmadı</strong>
      <p>İnternet bağlantısını yoxlayıb yenidən cəhd edin.</p>
    </div>`;
    setPanelOpen(form, true);
  }

  async function fallbackSearch(term) {
    const response = await fetch('/api/v1/public/home', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Search unavailable');
    const body = await response.json();
    const normalizedTerm = normalize(term);
    const products = (body?.data?.products || []).filter((product) => normalize([
      product.title,
      product.sku,
      product.brand_name,
      product.vendor_name,
      product.short_description
    ].filter(Boolean).join(' ')).includes(normalizedTerm));
    return {
      data: { products: products.slice(0, RESULT_LIMIT) },
      meta: { query: term, total: products.length, limit: RESULT_LIMIT }
    };
  }

  async function requestResults(form, term) {
    const state = stateFor(form);
    const cacheKey = normalize(term);
    if (resultCache.has(cacheKey)) {
      renderResults(form, term, resultCache.get(cacheKey));
      return;
    }

    state.abortController?.abort();
    state.abortController = new AbortController();
    const token = ++state.requestToken;
    renderLoading(form);

    try {
      let result;
      try {
        const response = await fetch(`/api/v1/public/search?q=${encodeURIComponent(term)}&limit=${RESULT_LIMIT}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: state.abortController.signal
        });
        if (!response.ok) throw new Error('Search endpoint unavailable');
        result = await response.json();
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        result = await fallbackSearch(term);
      }
      if (token !== state.requestToken) return;
      resultCache.set(cacheKey, result);
      if (resultCache.size > 30) resultCache.delete(resultCache.keys().next().value);
      renderResults(form, term, result);
    } catch (error) {
      if (error?.name === 'AbortError' || token !== state.requestToken) return;
      renderError(form);
    }
  }

  function scheduleSearch(form) {
    const state = stateFor(form);
    const input = form.querySelector('input[name="axtaris"], .query');
    const term = String(input?.value || '').trim();
    window.clearTimeout(state.timer);
    state.abortController?.abort();
    state.requestToken += 1;

    if (term.length < MIN_QUERY_LENGTH) {
      setPanelOpen(form, false);
      return;
    }
    state.timer = window.setTimeout(() => void requestResults(form, term), 180);
  }

  function moveSelection(form, direction) {
    const state = stateFor(form);
    const options = [...form.querySelectorAll('[data-search-option]')];
    const input = form.querySelector('input[name="axtaris"], .query');
    if (!options.length || !input) return;
    state.activeIndex = (state.activeIndex + direction + options.length) % options.length;
    options.forEach((option, index) => {
      const active = index === state.activeIndex;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-selected', String(active));
      if (active) {
        input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function closeMobileSearch() {
    const form = document.querySelector(`${FORM_SELECTOR}.db-search-mobile-open`);
    if (!form) return;
    form.classList.remove('db-search-mobile-open');
    document.documentElement.classList.remove('db-mobile-search-open');
    document.querySelector('.db-search-mobile-backdrop')?.remove();
    setPanelOpen(form, false);
  }

  function openMobileSearch() {
    const forms = [...document.querySelectorAll(FORM_SELECTOR)];
    const form = forms.find((candidate) => candidate.classList.contains('toggle')) || forms[0];
    if (!form) return;
    document.querySelector(`${FORM_SELECTOR}.db-search-mobile-open`)?.classList.remove('db-search-mobile-open');
    form.classList.add('db-search-mobile-open');
    document.documentElement.classList.add('db-mobile-search-open');
    let backdrop = document.querySelector('.db-search-mobile-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('button');
      backdrop.type = 'button';
      backdrop.className = 'db-search-mobile-backdrop';
      backdrop.setAttribute('aria-label', 'Axtarışı bağla');
      document.body.append(backdrop);
    }
    window.setTimeout(() => form.querySelector('input')?.focus(), 30);
  }

  function enhanceForm(form, index) {
    if (form.dataset.dbSearchReady === 'true') return;
    form.dataset.dbSearchReady = 'true';
    form.classList.add('db-search-enhanced');
    form.action = '/magaza/';
    form.method = 'get';
    form.setAttribute('role', 'search');
    form.setAttribute('aria-label', 'Məhsul axtarışı');
    const input = form.querySelector('input[name="axtaris"], .query');
    if (!input) return;
    input.name = 'axtaris';
    input.type = 'search';
    ensurePanel(form, index);
    if (!form.querySelector(':scope > [data-db-search-close]')) {
      const close = document.createElement('button');
      close.className = 'db-search-mobile-close';
      close.type = 'button';
      close.dataset.dbSearchClose = '';
      close.setAttribute('aria-label', 'Axtarışı bağla');
      close.textContent = '×';
      form.append(close);
    }

    if (location.pathname === '/magaza/') {
      const currentQuery = new URLSearchParams(location.search).get('axtaris');
      if (currentQuery) input.value = currentQuery;
    }

    input.addEventListener('input', (event) => {
      event.stopPropagation();
      scheduleSearch(form);
    });
    input.addEventListener('focus', () => {
      if (String(input.value || '').trim().length >= MIN_QUERY_LENGTH) scheduleSearch(form);
    });
    input.addEventListener('focusout', (event) => {
      event.stopPropagation();
      window.setTimeout(() => {
        if (!form.contains(document.activeElement)) setPanelOpen(form, false);
      }, 120);
    });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (form.querySelector('.db-search-preview')?.hidden) scheduleSearch(form);
        moveSelection(form, event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'Enter' && stateFor(form).activeIndex >= 0) {
        const option = form.querySelectorAll('[data-search-option]')[stateFor(form).activeIndex];
        const href = option?.querySelector('.db-search-result-main')?.href;
        if (href) {
          event.preventDefault();
          location.assign(href);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setPanelOpen(form, false);
        closeMobileSearch();
      }
    });
    form.addEventListener('submit', (event) => {
      event.stopPropagation();
      const term = String(input.value || '').trim();
      if (term.length < MIN_QUERY_LENGTH) {
        event.preventDefault();
        input.focus();
        setPanelOpen(form, false);
      }
    });
  }

  function initialize() {
    document.querySelectorAll(FORM_SELECTOR).forEach(enhanceForm);

    const observer = new MutationObserver((mutations) => {
      const needsEnhancement = mutations.some((mutation) => [...mutation.addedNodes].some((node) =>
        node instanceof Element && (node.matches(FORM_SELECTOR) || node.querySelector(FORM_SELECTOR))
      ));
      if (needsEnhancement) document.querySelectorAll(FORM_SELECTOR).forEach(enhanceForm);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('pointerdown', (event) => {
      document.querySelectorAll(`${FORM_SELECTOR}.db-search-open`).forEach((form) => {
        if (!form.contains(event.target)) setPanelOpen(form, false);
      });
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest('.db-search-mobile-backdrop,[data-db-search-close]')) {
        event.preventDefault();
        closeMobileSearch();
      }
    });
    document.addEventListener('click', (event) => {
      const toggle = event.target.closest('.sticky-dashboard .search-toggle');
      if (!toggle || window.innerWidth > 1023) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (window.DailyBakuMobilePanels) {
        window.DailyBakuMobilePanels.open('search', toggle);
        return;
      }
      openMobileSearch();
    }, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        document.querySelectorAll(`${FORM_SELECTOR}.db-search-open`).forEach((form) => setPanelOpen(form, false));
        closeMobileSearch();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
