(() => {
  'use strict';

  const MOBILE_MAX = 1023;
  let categories = [
    ['Elektrik alətləri', '/magaza/elektronika/', '/assets/wp-content/uploads/Power-Tools-1.webp'],
    ['Ölçü cihazları', '/magaza/elektronika/', '/assets/wp-content/uploads/Measuring.webp'],
    ['Alət aksesuarları', '/magaza/elektronika/', '/assets/wp-content/uploads/Tool-Accessories-1.webp'],
    ['Hava alətləri', '/magaza/xidmetler/', '/assets/wp-content/uploads/Air-Tools-Compressors.webp'],
    ['Əl alətləri', '/magaza/ev-metbex/', '/assets/wp-content/uploads/Hand-Tools-1.webp'],
    ['Dəzgah alətləri', '/magaza/elektronika/', '/assets/wp-content/uploads/Machine-Tools-1.webp'],
    ['Elektrik', '/magaza/elektronika/', '/assets/wp-content/uploads/Electrical-Tools-1.webp'],
    ['Markalama alətləri', '/magaza/elektronika/', '/assets/wp-content/uploads/Marking-Tools-1.webp'],
    ['Digər', '/magaza/', '/assets/wp-content/uploads/other-cat.webp']
  ];
  const accountLinks = [
    ['İdarə paneli', '/hesabim/', 'dashboard'],
    ['Seçilmişlər', '/hesabim/secilmisler/', 'heart'],
    ['Sifarişlər', '/hesabim/sifarisler/', 'orders'],
    ['Bakı Club', '/hesabim/baki-club/', 'club'],
    ['Bildirişlər', '/hesabim/bildirisler/', 'notifications'],
    ['Ünvanlar', '/hesabim/unvanlar/', 'pin'],
    ['Hesab məlumatları', '/hesabim/hesab-melumatlari/', 'account']
  ];
  const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  let trigger = null;
  let panel = null;
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);

  async function loadCategories() {
    try {
      const response = await fetch('/api/v1/public/home', { credentials:'same-origin', headers:{ Accept:'application/json' } });
      if (!response.ok) return;
      const body = await response.json();
      const records = Array.isArray(body?.data?.categories) ? body.data.categories : [];
      const mapped = records.filter((item) => item?.name && item?.slug).map((item) => [
        item.name,
        `/magaza/?kateqoriya=${encodeURIComponent(item.slug)}`,
        item.image_url || '/assets/wp-content/uploads/other-cat.webp'
      ]);
      if (!mapped.length) return;
      categories = mapped;
      if (panel?.dataset.panel === 'categories' && panel.classList.contains('is-open')) {
        panel.querySelector('.db-mobile-panel-content').innerHTML = categoryContent();
      }
    } catch {
      // Server əlçatmaz olduqda hazır dizayn kateqoriyaları təhlükəsiz fallback kimi qalır.
    }
  }

  function icon(name) {
    const paths = {
      dashboard:'<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
      heart:'<path d="M12 20S4 15.4 4 9.5C4 6.5 7.6 5 9.6 7.2L12 9.8l2.4-2.6C16.4 5 20 6.5 20 9.5 20 15.4 12 20 12 20Z"/>',
      orders:'<path d="M5 8h14v12H5zM8 8V6h8v2M8 12h8M8 16h5"/>',
      pin:'<path d="M12 21s6-5.6 6-11a6 6 0 1 0-12 0c0 5.4 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/>',
      account:'<circle cx="12" cy="8" r="4"/><path d="M5 21c.5-5 3-7 7-7s6.5 2 7 7"/>',
      club:'<path d="M4 9h16v11H4zM3 9h18V5H3zM12 5v15M7 5c-2.5-2.2 1-5 5 0M17 5c2.5-2.2-1-5-5 0"/>',
      notifications:'<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
      logout:'<path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.dashboard}</svg>`;
  }

  function accountContent() {
    const authenticated = Boolean(window.DailyBakuCommerce?.getServerState?.()?.profile?.authenticated);
    if (!authenticated) return `<div class="db-mobile-panel-account db-mobile-panel-guest">
      <h2 id="db-mobile-panel-title">Hesabınıza daxil olun</h2>
      <p>Sifarişlərinizi, seçilmişləri və Bakı Club xallarını hər cihazda izləyin.</p>
      <a class="db-mobile-panel-primary" href="/giris/">DAXİL OL</a>
      <a class="db-mobile-panel-secondary" href="/qeydiyyat/">YENİ HESAB YARAT</a>
      <a class="db-mobile-panel-forgot" href="/sifre-berpasi/">Şifrəni unutmusunuz?</a>
      <a class="db-mobile-panel-vendor" href="/satici-girisi/">SATICI OLARAQ DAXİL OL</a>
    </div>`;
    const panelPath = String(window.DailyBakuPanelPath || '');
    const panelLinks = panelPath
      ? [[panelPath === '/satici-paneli/' ? 'Satıcı kabineti' : 'İdarəetmə paneli', panelPath, 'dashboard']]
      : accountLinks;
    return `<div class="db-mobile-panel-account">
      <h2 class="sr-only" id="db-mobile-panel-title">Mənim hesabım</h2>
      <nav aria-labelledby="db-mobile-panel-title">
        ${panelLinks.map(([label, href, iconName]) => `<a href="${href}">${icon(iconName)}<span>${label}</span></a>`).join('')}
        <button type="button" data-mobile-account-logout>${icon('logout')}<span>Çıxış</span></button>
      </nav>
    </div>`;
  }

  function categoryContent() {
    return `<div class="db-mobile-panel-categories">
      <h2 class="sr-only" id="db-mobile-panel-title">Kateqoriyalar</h2>
      <div class="db-mobile-category-grid">
        ${categories.map(([label, href, image]) => `<a href="${escapeHtml(href)}">
          <span><img src="${escapeHtml(image)}" alt="" width="180" height="180" loading="lazy" decoding="async"></span>
          <b>${escapeHtml(label)}</b>
        </a>`).join('')}
      </div>
    </div>`;
  }

  function searchContent() {
    return `<div class="db-mobile-panel-search">
      <h2 class="sr-only" id="db-mobile-panel-title">Axtarış</h2>
      <form action="/magaza/" method="get" role="search" data-db-search>
        <label class="sr-only" for="db-mobile-panel-query">Məhsul axtarışı</label>
        <div class="db-mobile-search-field"><span class="db-mobile-search-icon" aria-hidden="true"></span><input id="db-mobile-panel-query" name="axtaris" type="search" placeholder="Axtarın..." autocomplete="off"></div>
        <button type="submit"><b>AXTARIŞ</b></button>
      </form>
    </div>`;
  }

  function ensurePanel() {
    if (panel?.isConnected) return panel;
    panel = document.createElement('section');
    panel.className = 'db-mobile-panel';
    panel.hidden = true;
    panel.tabIndex = -1;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'db-mobile-panel-title');
    panel.innerHTML = `<button class="db-mobile-panel-close" type="button" data-mobile-panel-close aria-label="Paneli bağla">${closeIcon}</button><div class="db-mobile-panel-content"></div>`;
    document.body.append(panel);
    return panel;
  }

  function open(type, source = null) {
    if (window.innerWidth > MOBILE_MAX || !['account', 'categories', 'search'].includes(type)) return;
    const element = ensurePanel();
    trigger = source instanceof HTMLElement ? source : document.activeElement;
    element.dataset.panel = type;
    element.querySelector('.db-mobile-panel-content').innerHTML = type === 'account'
      ? accountContent()
      : type === 'categories'
        ? categoryContent()
        : searchContent();
    element.hidden = false;
    document.documentElement.classList.add('db-mobile-panel-open');
    requestAnimationFrame(() => element.classList.add('is-open'));
    window.setTimeout(() => {
      const focusTarget = type === 'search'
        ? element.querySelector('input')
        : element;
      focusTarget?.focus({ preventScroll:true });
    }, 80);
  }

  function close({ restoreFocus = true } = {}) {
    if (!panel || panel.hidden) return;
    panel.classList.remove('is-open');
    document.documentElement.classList.remove('db-mobile-panel-open');
    window.setTimeout(() => {
      if (!panel.classList.contains('is-open')) {
        panel.hidden = true;
        panel.removeAttribute('data-panel');
        panel.querySelector('.db-mobile-panel-content').replaceChildren();
      }
    }, 260);
    if (restoreFocus && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    trigger = null;
  }

  function panelType(target) {
    if (target.closest('.sticky-dashboard .account-nav-toggle, .page-mobile-dashboard a[href="/hesabim/"]')) return 'account';
    if (target.closest('.sticky-dashboard .categories-toggle, .page-mobile-dashboard a[href="/magaza/"]')) return 'categories';
    if (target.closest('.sticky-dashboard .search-toggle, .page-mobile-dashboard [data-mobile-search]')) return 'search';
    return '';
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const closeButton = event.target.closest('[data-mobile-panel-close]');
    if (closeButton) {
      event.preventDefault();
      close();
      return;
    }
    const logout = event.target.closest('[data-mobile-account-logout]');
    if (logout) {
      event.preventDefault();
      logout.disabled = true;
      logout.querySelector('span').textContent = 'Çıxış edilir...';
      Promise.resolve(window.DailyBakuCommerce?.logout?.())
        .finally(() => window.location.assign('/hesabim/'));
      return;
    }
    const type = panelType(event.target);
    if (!type || window.innerWidth > MOBILE_MAX) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(type, event.target.closest('a,button'));
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel?.classList.contains('is-open')) close();
    if (event.key !== 'Tab' || !panel?.classList.contains('is-open')) return;
    const focusable = [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')]
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > MOBILE_MAX) close({ restoreFocus:false });
  }, { passive:true });

  window.DailyBakuMobilePanels = { open, close };
  void loadCategories();
})();
