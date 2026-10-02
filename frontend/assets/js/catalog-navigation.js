(() => {
  'use strict';

  let categoryCache = [];
  let serviceCategoryCache = [];
  let scheduled = false;
  const mobileStates = new WeakMap();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const hrefFor = (category) => {
    const path = Array.isArray(category.path_slugs) && category.path_slugs.length
      ? category.path_slugs
      : [category.slug];
    return `/magaza/${path.filter(Boolean).map(encodeURIComponent).join('/')}/`;
  };

  const serviceHrefFor = (category) => {
    const path = Array.isArray(category.path_slugs) && category.path_slugs.length ? category.path_slugs : [category.slug];
    return '/elanlar/xidmetler/' + path.filter(Boolean).map(encodeURIComponent).join('/') + '/';
  };

  const categoryTree = (categories) => {
    const active = categories.filter((item) => item?.id && item?.name && Number(item.depth) <= 2);
    const children = new Map();
    active.forEach((item) => {
      const parent = item.parent_id || '';
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(item);
    });
    children.forEach((items) => items.sort((left, right) =>
      Number(left.position || 0) - Number(right.position || 0)
      || String(left.name).localeCompare(String(right.name), 'az')
    ));
    return { roots: children.get('') || [], children };
  };

  const textLink = (category, className = '') => {
    const anchor = document.createElement('a');
    anchor.href = hrefFor(category);
    if (className) anchor.className = className;
    const label = document.createElement('span');
    label.className = className === 'mi-link' ? 'txt' : 'db-store-link-label';
    label.textContent = category.name;
    anchor.append(label);
    return anchor;
  };

  const megaLink = (item, hrefBuilder, level) => {
    const anchor = document.createElement('a');
    anchor.href = hrefBuilder(item);
    anchor.className = 'db-mega-link db-mega-level-' + level;
    const label = document.createElement('span');
    label.textContent = item.name;
    anchor.append(label);
    return anchor;
  };

  const renderMegaColumn = (column, items, level, hrefBuilder, activate) => {
    const links = new Map();
    const fragment = document.createDocumentFragment();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'db-mega-empty';
      empty.textContent = 'Bu bölmədə alt kateqoriya yoxdur.';
      fragment.append(empty);
    }
    items.forEach((item) => {
      const link = megaLink(item, hrefBuilder, level);
      link.addEventListener('pointerenter', () => activate?.(item, link));
      link.addEventListener('focus', () => activate?.(item, link));
      links.set(item.id, link);
      fragment.append(link);
    });
    column.replaceChildren(fragment);
    column.scrollTop = 0;
    return links;
  };

  const markMegaActive = (links, active) => {
    links.forEach((link) => {
      const selected = link === active;
      link.classList.toggle('is-active', selected);
      if (selected) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };

  const buildMegaPanel = (roots, children, hrefBuilder, options) => {
    const panel = document.createElement('div');
    panel.className = `db-mega-panel${options.variant ? ` db-mega-panel--${options.variant}` : ''}`;
    panel.dataset.taxonomyCount = String(options.count);
    panel.setAttribute('aria-label', options.label);

    const header = document.createElement('div');
    header.className = 'db-mega-header';
    const heading = document.createElement('strong');
    heading.textContent = options.title;
    const all = document.createElement('a');
    all.href = options.allHref;
    all.textContent = options.allLabel;
    header.append(heading, all);
    panel.append(header);

    if (options.shortcuts?.length) {
      const shortcuts = document.createElement('nav');
      shortcuts.className = 'db-mega-shortcuts';
      shortcuts.setAttribute('aria-label', 'Elan növləri');
      options.shortcuts.forEach((item) => {
        const link = document.createElement('a');
        link.href = item.href;
        link.textContent = item.label;
        shortcuts.append(link);
      });
      panel.append(shortcuts);
    }

    const grid = document.createElement('div');
    grid.className = 'db-mega-grid';
    const rootColumn = document.createElement('div');
    const mainColumn = document.createElement('div');
    const subColumn = document.createElement('div');
    rootColumn.className = 'db-mega-column db-mega-departments';
    mainColumn.className = 'db-mega-column db-mega-main';
    subColumn.className = 'db-mega-column db-mega-sub';
    rootColumn.setAttribute('aria-label', 'Departamentlər');
    mainColumn.setAttribute('aria-label', 'Ana kateqoriyalar');
    subColumn.setAttribute('aria-label', 'Alt kateqoriyalar');
    grid.append(rootColumn, mainColumn, subColumn);
    panel.append(grid);

    let rootLinks = new Map();
    let mainLinks = new Map();
    const activateMain = (item, link) => {
      markMegaActive(mainLinks, link);
      renderMegaColumn(subColumn, children.get(item.id) || [], 2, hrefBuilder);
    };
    const activateRoot = (item, link) => {
      markMegaActive(rootLinks, link);
      const mains = children.get(item.id) || [];
      mainLinks = renderMegaColumn(mainColumn, mains, 1, hrefBuilder, activateMain);
      if (mains[0]) activateMain(mains[0], mainLinks.get(mains[0].id));
      else renderMegaColumn(subColumn, [], 2, hrefBuilder);
    };
    rootLinks = renderMegaColumn(rootColumn, roots, 0, hrefBuilder, activateRoot);
    if (roots[0]) activateRoot(roots[0], rootLinks.get(roots[0].id));
    return panel;
  };

  const replaceDesktopMenu = (container, roots, children, targetPath, hrefBuilder, options) => {
    if (!container || !roots.length) return;
    const anchor = [...container.querySelectorAll(':scope > li > a')].find((item) => new URL(item.href, location.origin).pathname === targetPath);
    const rootItem = anchor?.parentElement;
    if (!rootItem) return;
    const current = rootItem.querySelector(':scope > .db-mega-panel');
    if (current?.dataset.taxonomyCount === String(options.count)) return;
    const fallbackMenu = rootItem.querySelector(':scope > ul');
    fallbackMenu?.classList.add('db-mega-mobile-fallback');
    current?.remove();
    rootItem.classList.add('menu-item-has-children', 'db-mega-root');
    anchor.setAttribute('aria-haspopup', 'true');
    anchor.setAttribute('aria-expanded', 'false');
    const panel = buildMegaPanel(roots, children, hrefBuilder, options);
    const position = () => {
      panel.style.setProperty('--db-mega-top', Math.max(0, rootItem.getBoundingClientRect().bottom) + 'px');
      if (!panel.classList.contains('db-mega-panel--store')) return;
      const viewportPadding = 16;
      const panelWidth = Math.min(940, Math.max(0, window.innerWidth - viewportPadding * 2));
      const anchorLeft = anchor.getBoundingClientRect().left;
      const maximumLeft = Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding);
      const left = Math.min(Math.max(viewportPadding, anchorLeft), maximumLeft);
      panel.style.setProperty('--db-mega-left', Math.round(left) + 'px');
    };
    rootItem.addEventListener('pointerenter', () => { position(); anchor.setAttribute('aria-expanded', 'true'); });
    rootItem.addEventListener('pointerleave', () => anchor.setAttribute('aria-expanded', 'false'));
    rootItem.addEventListener('focusin', () => { position(); anchor.setAttribute('aria-expanded', 'true'); });
    rootItem.addEventListener('focusout', (event) => { if (!rootItem.contains(event.relatedTarget)) anchor.setAttribute('aria-expanded', 'false'); });
    rootItem.append(panel);
  };

  const enhanceMobileServices = (container, roots) => {
    if (!container || !roots.length) return;
    const serviceAnchor = [...container.querySelectorAll('a')].find((item) => !item.closest('.db-mega-panel') && new URL(item.href, location.origin).pathname === '/elanlar/xidmetler/');
    const serviceItem = serviceAnchor?.closest('li');
    if (!serviceItem) return;
    const parent = serviceItem.parentElement;
    const taxonomyKey = roots.map((item) => item.id).join(':');
    if (parent?.dataset.serviceTaxonomyKey === taxonomyKey && parent.querySelectorAll(':scope > .db-service-mobile-department').length === roots.length) return;
    parent?.querySelectorAll(':scope > .db-service-mobile-department').forEach((item) => item.remove());
    const fragment = document.createDocumentFragment();
    roots.forEach((category) => {
      const entry = document.createElement('li');
      entry.className = 'db-service-mobile-department';
      const link = document.createElement('a');
      link.href = serviceHrefFor(category);
      link.className = serviceAnchor.classList.contains('mi-link') ? 'mi-link' : '';
      const label = document.createElement('span');
      label.className = serviceAnchor.classList.contains('mi-link') ? 'txt' : '';
      label.textContent = '— ' + category.name;
      link.append(label);
      entry.append(link);
      fragment.append(entry);
    });
    serviceItem.after(fragment);
    if (parent) parent.dataset.serviceTaxonomyKey = taxonomyKey;
  };

  const categoryImage = (category) => {
    const shell = document.createElement('span');
    shell.className = 'db-mobile-taxonomy-image';
    const image = document.createElement('img');
    image.src = category.image_url || '/assets/wp-content/uploads/other-cat.webp';
    image.alt = '';
    image.width = 42;
    image.height = 42;
    image.loading = 'lazy';
    image.decoding = 'async';
    shell.append(image);
    return shell;
  };

  const taxonomyChevron = (back = false) => {
    const arrow = document.createElement('i');
    arrow.className = `db-mobile-taxonomy-chevron${back ? ' is-back' : ''}`;
    arrow.setAttribute('aria-hidden', 'true');
    return arrow;
  };

  const mobileEntry = (category, children, level) => {
    const nested = children.get(category.id) || [];
    const entry = document.createElement('li');
    entry.className = `db-mobile-taxonomy-entry db-mobile-taxonomy-level-${level}`;
    const control = nested.length || level === 0 ? document.createElement('button') : textLink(category);
    control.className = 'db-mobile-taxonomy-control';
    if (control instanceof HTMLButtonElement) {
      control.type = 'button';
      control.dataset.taxonomyOpen = category.id;
      control.setAttribute('aria-label', `${category.name} kateqoriyasını aç`);
    }
    if (level === 0) control.append(categoryImage(category));
    const label = control.querySelector('.db-store-link-label') || document.createElement('span');
    label.className = 'db-mobile-taxonomy-title';
    label.textContent = category.name;
    if (!label.parentElement) control.append(label);
    if (control instanceof HTMLButtonElement) control.append(taxonomyChevron());
    entry.append(control);
    return entry;
  };

  const renderMobileLevel = (container, state, parentId = '', direction = 'forward') => {
    const parent = parentId ? state.index.get(parentId) : null;
    const items = parentId ? state.children.get(parentId) || [] : state.roots;
    const level = parent ? Number(parent.depth) + 1 : 0;
    const fragment = document.createDocumentFragment();

    if (parent) {
      const heading = document.createElement('li');
      heading.className = 'db-mobile-taxonomy-heading';
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'db-mobile-taxonomy-back';
      back.dataset.taxonomyBack = parent.parent_id || '';
      back.append(taxonomyChevron(true));
      const title = document.createElement('span');
      title.textContent = parent.name;
      back.append(title);
      heading.append(back);
      fragment.append(heading);

      const allEntry = document.createElement('li');
      allEntry.className = 'db-mobile-taxonomy-all-row';
      const all = textLink(parent);
      all.classList.add('db-mobile-taxonomy-all');
      all.querySelector('span').textContent = `${parent.name}: bütün məhsullar`;
      all.append(taxonomyChevron());
      allEntry.append(all);
      fragment.append(allEntry);
    }

    items.forEach((item) => fragment.append(mobileEntry(item, state.children, level)));
    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'db-mobile-taxonomy-empty';
      empty.textContent = 'Bu kateqoriyada alt kateqoriya yoxdur.';
      fragment.append(empty);
    }

    container.replaceChildren(fragment);
    container.dataset.taxonomyLevel = String(level);
    container.classList.remove('db-taxonomy-forward', 'db-taxonomy-back');
    void container.offsetWidth;
    container.classList.add(direction === 'back' ? 'db-taxonomy-back' : 'db-taxonomy-forward');
    window.setTimeout(() => container.classList.remove('db-taxonomy-forward', 'db-taxonomy-back'), reducedMotion.matches ? 0 : 330);
    state.parentId = parentId;
  };

  const replaceMobileMenu = (container, roots, children) => {
    if (!container) return;
    const rendered = container.querySelector(':scope > .db-mobile-taxonomy-entry, :scope > .db-mobile-taxonomy-heading');
    if (rendered && container.dataset.taxonomyReady === 'true' && container.dataset.taxonomyCount === String(categoryCache.length)) return;
    container.classList.add('db-mobile-taxonomy');
    container.dataset.taxonomyCount = String(categoryCache.length);
    container.dataset.taxonomyReady = 'true';
    const state = { roots, children, index: new Map(categoryCache.map((item) => [item.id, item])), parentId: '' };
    mobileStates.set(container, state);
    if (!container.dataset.taxonomyEvents) {
      container.dataset.taxonomyEvents = 'true';
      container.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const open = event.target.closest('[data-taxonomy-open]');
        const back = event.target.closest('[data-taxonomy-back]');
        if (!open && !back) return;
        event.preventDefault();
        const currentState = mobileStates.get(container);
        if (!currentState) return;
        renderMobileLevel(container, currentState, open?.dataset.taxonomyOpen || back?.dataset.taxonomyBack || '', back ? 'back' : 'forward');
      });
    }
    renderMobileLevel(container, state, '', 'back');
  };

  const resetMobileMenus = () => {
    document.querySelectorAll('.db-mobile-taxonomy').forEach((container) => {
      const state = mobileStates.get(container);
      if (state && state.parentId) renderMobileLevel(container, state, '', 'back');
    });
  };

  function render(categories = categoryCache, serviceCategories = serviceCategoryCache) {
    if (Array.isArray(categories) && categories.length) categoryCache = categories;
    if (Array.isArray(serviceCategories)) serviceCategoryCache = serviceCategories;
    const storeTree = categoryTree(categoryCache);
    const serviceTree = categoryTree(serviceCategoryCache);
    if (storeTree.roots.length) {
      const storeOptions = { count: categoryCache.length, variant: 'store', label: 'Mağaza kateqoriyaları', title: 'Mağaza kateqoriyaları', allHref: '/magaza/', allLabel: 'Bütün məhsullara bax →' };
      replaceDesktopMenu(document.querySelector('#menu-desktop-menu-with-categories'), storeTree.roots, storeTree.children, '/magaza/', hrefFor, storeOptions);
      replaceDesktopMenu(document.querySelector('.page-navigation-root'), storeTree.roots, storeTree.children, '/magaza/', hrefFor, storeOptions);
      replaceMobileMenu(document.querySelector('#menu-mobile-store'), storeTree.roots, storeTree.children);
      replaceMobileMenu(document.querySelector('.page-store-navigation'), storeTree.roots, storeTree.children);
    }
    if (serviceTree.roots.length) {
      const serviceOptions = { count: serviceCategoryCache.length, label: 'Xidmət kateqoriyaları', title: 'Xidmət sahələri', allHref: '/elanlar/xidmetler/', allLabel: 'Bütün xidmətlərə bax →', shortcuts: [
        { label: 'Bütün elanlar', href: '/elanlar/' }, { label: 'Məhsullar', href: '/elanlar/mehsullar/' }, { label: 'Xidmətlər', href: '/elanlar/xidmetler/' }, { label: 'Əmlak', href: '/elanlar/emlak/' }, { label: 'Avtomobil', href: '/elanlar/avtomobil/' }
      ] };
      replaceDesktopMenu(document.querySelector('#menu-desktop-menu-with-categories'), serviceTree.roots, serviceTree.children, '/elanlar/', serviceHrefFor, serviceOptions);
      replaceDesktopMenu(document.querySelector('.page-navigation-root'), serviceTree.roots, serviceTree.children, '/elanlar/', serviceHrefFor, serviceOptions);
      enhanceMobileServices(document.querySelector('#menu-mobile-menu'), serviceTree.roots);
      enhanceMobileServices(document.querySelector('.page-navigation-root'), serviceTree.roots);
    }
  }

  function scheduleRender() {
    if (scheduled || !categoryCache.length) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render();
    });
  }

  globalThis.DailyBakuCatalogNavigation = { render, resetMobileMenus, get categories() { return categoryCache; }, get serviceCategories() { return serviceCategoryCache; } };
  new MutationObserver(scheduleRender).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const tab = event.target.closest('.mobile-tabset > .mobile-tab-item, .page-mobile-menu-tabs > button[data-page-menu-tab]');
    if (tab) resetMobileMenus();
  });

  fetch('/api/v1/public/home', { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Kateqoriyalar yüklənmədi')))
    .then((payload) => render(payload?.data?.categories || [], payload?.data?.serviceCategories || []))
    .catch(() => { /* Statik naviqasiya şəbəkə xətasında işləməyə davam edir. */ });
})();
