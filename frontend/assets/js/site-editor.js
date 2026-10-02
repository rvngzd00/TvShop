(() => {
  const previewScope = new URLSearchParams(location.search).get('editor-preview');
  const endpoint = ['nav', 'index', 'footer'].includes(previewScope)
    ? `/api/v1/editor/preview?scope=${encodeURIComponent(previewScope)}`
    : '/api/v1/public/site-editor';

  const setText = (selector, value, root = document) => {
    root.querySelectorAll(selector).forEach((element) => { element.textContent = value; });
  };
  const setLink = (selector, url, root = document) => root.querySelectorAll(selector).forEach((link) => { link.href = url; });
  const setOwnText = (selector, value, root = document) => root.querySelectorAll(selector).forEach((element) => {
    const nodes = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE);
    if (nodes[0]) nodes[0].nodeValue = value;
    else element.append(document.createTextNode(value));
    nodes.slice(1).forEach((node) => node.remove());
  });
  const mediaUrl = (data, id) => id && data.media?.[id]?.url;
  const defaultLogoUrl = '/assets/brand/tvshop.webp';
  const visible = (items) => (items || []).filter((item) => item.visible);
  const socialClass = (item) => {
    const aliases = { instagram: 'instagram', facebook: 'facebook', x: 'twitter', twitter: 'twitter', tiktok: 'tiktok', linkedin: 'linkedin', whatsapp: 'whatsapp' };
    const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z]/g, '');
    return aliases[normalize(item.id)] || aliases[normalize(item.network)] || 'social';
  };

  function menuLink(item, mobile = false) {
    const anchor = document.createElement('a');
    anchor.href = item.url;
    anchor.className = mobile ? 'mi-link' : '';
    const text = document.createElement('span');
    text.className = mobile ? 'txt' : '';
    text.textContent = item.label;
    anchor.append(text);
    if (item.children?.some((child) => child.visible)) {
      const arrow = document.createElement('span'); arrow.className = mobile ? 'arrow' : 'page-nav-arrow'; arrow.setAttribute('aria-hidden', 'true'); anchor.append(arrow);
      anchor.setAttribute('aria-haspopup', 'true'); anchor.setAttribute('aria-expanded', 'false');
    }
    return anchor;
  }

  function buildIndexMenu(container, items, { store = false, desktop = false, data = null } = {}) {
    if (!container) return;
    container.replaceChildren();
    const source = store && desktop ? [{ id: 'store', label: 'Mağaza', url: '/magaza/', visible: true, children: items }] : items;
    visible(source).forEach((item) => {
      const children = visible(item.children);
      const li = document.createElement('li');
      li.className = `menu-item${children.length ? ' menu-item-has-children' : ''} depth-0`;
      const link = menuLink(item, true);
      const image = data && mediaUrl(data, item.imageAssetId);
      if (image && store && !desktop) { const thumb = document.createElement('span'); thumb.className = 'db-editor-menu-thumb'; const img = document.createElement('img'); img.src = image; img.alt = ''; thumb.append(img); link.prepend(thumb); }
      li.append(link);
      if (children.length) {
        const sub = document.createElement('ul'); sub.className = 'sub-menu';
        children.forEach((child) => {
          const childLi = document.createElement('li'); childLi.className = 'menu-item depth-1'; childLi.append(menuLink(child, true)); sub.append(childLi);
        });
        li.append(sub);
      }
      container.append(li);
    });
  }

  function buildPageMenu(container, items, store = false, data = null) {
    if (!container) return;
    const existingImages = new Map([...container.querySelectorAll('a[href]')].map((link) => [new URL(link.href, location.origin).pathname, link.querySelector('img')?.src]).filter((entry) => entry[1]));
    container.replaceChildren();
    visible(items).forEach((item) => {
      const li = document.createElement('li');
      if (store) {
        const anchor = document.createElement('a'); anchor.href = item.url;
        const thumb = document.createElement('span'); thumb.className = 'page-mobile-menu-thumb';
        const source = mediaUrl(data || {}, item.imageAssetId) || existingImages.get(new URL(item.url, location.origin).pathname);
        if (source) { const image = document.createElement('img'); image.src = source; image.alt = ''; image.width = 40; image.height = 40; thumb.append(image); }
        const label = document.createElement('span'); label.textContent = item.label;
        anchor.append(thumb, label); li.append(anchor);
      } else {
        const children = visible(item.children);
        li.className = `page-navigation-item${children.length ? '' : ' page-navigation-leaf'}`;
        if (item.id === 'store-root') li.classList.add('db-editor-desktop-only');
        li.append(menuLink(item));
        if (children.length) {
          const sub = document.createElement('ul'); sub.className = 'page-submenu'; sub.setAttribute('aria-label', `${item.label} alt kateqoriyaları`);
          children.forEach((child) => { const childLi = document.createElement('li'); const a = document.createElement('a'); a.href = child.url; a.textContent = child.label; childLi.append(a); sub.append(childLi); });
          li.append(sub);
        }
      }
      container.append(li);
    });
  }

  function applyNav(config, data) {
    if (!config) return;
    const logo = mediaUrl(data, config.branding.logoAssetId);
    document.querySelectorAll('.page-logo img, .header-logo img.logo, .header-logo img.sticky-logo').forEach((image) => {
      image.addEventListener('error', () => {
        image.src = defaultLogoUrl;
        image.dataset.src = defaultLogoUrl;
      }, { once: true });
      if (logo) {
        image.src = logo;
        image.dataset.src = logo;
      }
    });
    document.querySelectorAll('.page-logo img, .header-logo img').forEach((image) => { image.alt = config.branding.logoAlt; });

    setOwnText('.page-topbar .page-topbar-item:first-child', config.announcement.address);
    setOwnText('.page-topbar-contact', config.announcement.contactLabel); setLink('.page-topbar-contact', config.announcement.contactUrl);
    setOwnText('.page-topbar-delivery', config.announcement.deliveryText);
    setText('.page-login span, .login-text', config.announcement.loginLabel);
    setText('.elementor-element-89cf7e8 .icon-box-title', config.announcement.address);
    setText('.elementor-element-c11f88f .icon-box-title', config.announcement.contactLabel); setLink('.elementor-element-c11f88f a', config.announcement.contactUrl);
    setText('.elementor-element-096e288 .icon-box-title', config.announcement.deliveryText);

    document.querySelectorAll('.page-search input, .et__product_ajax_search.header input').forEach((input) => { input.placeholder = config.search.placeholder; });
    setText('.page-search button, .et__product_ajax_search.header button', config.search.buttonLabel);
    setText('.page-support strong, .elementor-element-0714cc3 .icon-box-title, .elementor-element-911b337 .icon-box-title', config.support.phone);
    setText('.page-support small, .elementor-element-0714cc3 .icon-box-content p, .elementor-element-911b337 .icon-box-content p', config.support.label);
    const phoneUrl = `tel:${config.support.phone.replace(/[^+\d]/g, '')}`; setLink('.page-support, .elementor-element-0714cc3 a, .elementor-element-911b337 a, .elementor-element-52e2e2e a', phoneUrl);
    setText('.page-live-chat strong, .elementor-element-e5e4157 .icon-box-title', config.liveChat.title);
    setText('.page-live-chat small, .elementor-element-e5e4157 .icon-box-content p', config.liveChat.subtitle);
    setLink('.page-live-chat, .elementor-element-e5e4157 a', config.liveChat.url);

    buildPageMenu(document.querySelector('.page-navigation-root'), [{ id: 'store-root', label: 'Mağaza', url: '/magaza/', visible: true, children: config.storeItems }, ...config.menuItems], false, data);
    buildPageMenu(document.querySelector('.page-store-navigation'), config.storeItems, true, data);
    buildIndexMenu(document.querySelector('#menu-mobile-menu'), config.menuItems);
    buildIndexMenu(document.querySelector('#menu-mobile-store'), config.storeItems, { store: true, data });
    buildIndexMenu(document.querySelector('#menu-desktop-menu-with-categories'), [...config.storeItems], { store: true, desktop: true, data });
    const desktop = document.querySelector('#menu-desktop-menu-with-categories');
    if (desktop) visible(config.menuItems).filter((item) => item.url !== '/').forEach((item) => {
      const temporary = document.createElement('ul'); buildIndexMenu(temporary, [item]); desktop.append(...temporary.children);
    });
  }

  function footerGroups(container, groups, page = false) {
    if (!container) return;
    container.replaceChildren();
    const protectedBusinessLinks = new Map([
      ['/biznes/#reklam', '/biznes/reklam-ver/'],
      ['/biznes/#sponsorluq', '/biznes/sponsorluq/'],
      ['/biznes/#brend-vitrini', '/biznes/brend-vitrini/']
    ]);
    visible(groups).forEach((group) => {
      const links = visible(group.links).filter((item) => item.id !== 'classified' && item.label !== 'Elan yerləşdir');
      if (page) {
        const section = document.createElement('section'); const heading = document.createElement('h2'); heading.textContent = group.title; section.append(heading);
        links.forEach((item) => { const a = document.createElement('a'); a.href = protectedBusinessLinks.get(item.url) || item.url; a.textContent = item.label; section.append(a); }); container.append(section); return;
      }
      const li = document.createElement('li'); li.className = 'menu-item menu-item-has-children depth-0';
      const heading = document.createElement('a'); heading.className = 'mi-link'; const span = document.createElement('span'); span.className = 'txt'; span.textContent = group.title; heading.append(span); li.append(heading);
      const sub = document.createElement('ul'); sub.className = 'sub-menu';
      links.forEach((item) => { const child = document.createElement('li'); child.className = 'menu-item depth-1'; const a = document.createElement('a'); a.className = 'mi-link'; a.href = protectedBusinessLinks.get(item.url) || item.url; const label = document.createElement('span'); label.className = 'txt'; label.textContent = item.label; a.append(label); child.append(a); sub.append(child); });
      li.append(sub); container.append(li);
    });
  }

  function legalLinks(container, links, page = false) {
    if (!container) return; container.replaceChildren();
    visible(links).forEach((item) => { const a = document.createElement('a'); a.href = item.url; a.textContent = item.label; if (!page) a.className = 'menu-list-item'; if (page) container.append(a); else { const li = document.createElement('li'); li.append(a); container.append(li); } });
  }

  function applyFooter(config, data) {
    if (!config) return;
    const logo = mediaUrl(data, config.branding.logoAssetId);
    if (logo) document.querySelectorAll('.page-footer-logo img, #et__footer-16140 .elementor-element-1ac52de img').forEach((image) => { image.src = logo; image.dataset.src = logo; });
    document.querySelectorAll('.page-footer-logo img, #et__footer-16140 .elementor-element-1ac52de img').forEach((image) => { image.alt = config.branding.logoAlt; });
    setText('.page-footer-brand>p, #et__footer-16140 .elementor-element-5542e5f .text', config.branding.description);
    footerGroups(document.querySelector('.page-footer-links'), config.linkGroups, true);
    footerGroups(document.querySelector('#menu-footer-menu'), config.linkGroups);

    setText('.page-footer-contact>a:first-child span, #et__footer-16140 .elementor-element-84b6a19 .icon-box-title', config.contact.address); setLink('.page-footer-contact>a:first-child, #et__footer-16140 .elementor-element-84b6a19 a', config.contact.addressUrl);
    setText('.page-footer-contact>a:nth-child(2) strong, #et__footer-16140 .elementor-element-351a1d5 .icon-box-title', config.contact.phone); setLink('.page-footer-contact>a:nth-child(2), #et__footer-16140 .elementor-element-351a1d5 a', config.contact.phoneUrl);
    document.querySelectorAll('.page-footer-contact>div span, #et__footer-16140 .elementor-element-83a6087 .icon-box-content p').forEach((element) => { element.textContent = config.contact.hours; element.style.whiteSpace = 'pre-line'; });
    setText('.page-footer-legal .db-footer-identity>p:first-child, #et__footer-16140 .elementor-element-b8dee9e .db-footer-identity>p:first-child .text', config.legal.copyright);
    legalLinks(document.querySelector('.page-footer-legal nav'), config.legal.links, true);
    legalLinks(document.querySelector('#et__footer-16140 .elementor-element-623b767 .et__menu-list'), config.legal.links);

    const pageSocials = document.querySelector('.page-socials'); const indexSocials = document.querySelector('#et__footer-16140 .et-social-links');
    [pageSocials, indexSocials].forEach((container) => { if (!container) return; container.replaceChildren(); visible(config.socialLinks).forEach((item) => { const a = document.createElement('a'); a.href = item.url; a.className = socialClass(item); a.setAttribute('aria-label', item.label); a.title = item.label; if (/^https?:/.test(item.url)) { a.target = '_blank'; a.rel = 'noopener noreferrer me'; } container.append(a); }); });
  }

  function findExactText(text) {
    return [...document.querySelectorAll('main .text')].find((element) => element.textContent.trim().toLocaleLowerCase('az-AZ') === text.toLocaleLowerCase('az-AZ'));
  }
  function updateSection(initialTitle, section, contentSelector) {
    const heading = findExactText(initialTitle);
    if (heading) {
      heading.textContent = section.title;
      const headingRoot = heading.closest('.elementor-element');
      const subtitleRoot = headingRoot?.nextElementSibling;
      const subtitle = subtitleRoot?.querySelector('.text'); if (subtitle && section.subtitle) subtitle.textContent = section.subtitle;
      if (!section.enabled) headingRoot?.closest('.e-parent')?.setAttribute('hidden', '');
    }
    document.querySelectorAll(contentSelector).forEach((element) => { if (!section.enabled) element.closest('.e-parent, .elementor-element')?.setAttribute('hidden', ''); });
  }

  function applyIndex(config, data) {
    if (!config || location.pathname !== '/') return;
    document.title = config.seo.browserTitle;
    const meta = document.querySelector('meta[name="description"]'); if (meta) meta.content = config.seo.metaDescription;
    updateSection('Seçilmiş fürsətlər', config.featured, '[data-featured-products]');
    updateSection('Ən populyar seçimlər', config.popular, '[data-popular-products]');
    updateSection('ƏN ÇOX SEÇİLƏNLƏR:', config.topPicks, '[data-top-picks-products]');
    updateSection('TVShop yeniliklərini izlə', config.news, '[data-cms-news]');
    setText('.elementor-element-82bbe28 .icon-box-title', config.categories.title);
    document.querySelector('.elementor-element-c0d0721')?.toggleAttribute('hidden', !config.categories.enabled);
    if (config.brands.title !== 'Brendlərə görə alış-veriş Brendlər') setText('.elementor-element-7f6253c .et__heading .text', config.brands.title);
    document.querySelector('.elementor-element-c44159c')?.toggleAttribute('hidden', !config.brands.enabled);

    if (!config.hero.enabled) document.querySelectorAll('sr7-module').forEach((element) => { element.hidden = true; });
    const slides = [...document.querySelectorAll('sr7-slide')];
    config.hero.slides.forEach((slide, index) => {
      const node = slides[index]; if (!node) return; node.hidden = !slide.enabled;
      const texts = [...node.querySelectorAll('sr7-txt')];
      const update = (element, value) => { if (element && element.textContent.replace(/\s+/g, ' ').trim() !== value.replace(/\s+/g, ' ').trim()) element.textContent = value; };
      update(texts[0], slide.title);
      update(texts[1], slide.eyebrow);
      update(texts[2], slide.description);
      const button = texts[3] || node.querySelector('sr7-btn'); if (button) {
        if (button.textContent.replace(/\s+/g, ' ').trim() !== slide.buttonLabel.replace(/\s+/g, ' ').trim()) {
          const icon = button.querySelector('i'); button.textContent = slide.buttonLabel; if (icon) button.append(' ', icon);
        }
        button.addEventListener('click', () => location.assign(slide.buttonUrl), { once: true });
      }
      const image = mediaUrl(data, slide.imageAssetId); if (image) {
        let background = node.querySelector('sr7-bg');
        if (!background) { background = document.createElement('sr7-bg'); background.className = 'sr7-layer'; node.prepend(background); }
        background.style.background = `center / cover no-repeat url("${image.replaceAll('"', '%22')}")`;
      }
    });
    slides.slice(config.hero.slides.length).forEach((slide) => { slide.hidden = true; });

    const promoTitles = ['Hədiyyə qazan', 'Öz dəstini qur', '1 al 1 hədiyyə', 'Ev və bağ'];
    config.promoCards.forEach((card, index) => {
      const title = findExactText(promoTitles[index]); if (!title) return; title.textContent = card.title;
      const block = title.closest('.elementor-element')?.parentElement;
      const cardRoot = block?.parentElement;
      cardRoot?.toggleAttribute('hidden', !card.enabled);
      const texts = block?.querySelectorAll('.text') || []; if (texts[1]) texts[1].textContent = card.description;
      const link = block?.querySelector('a.et__button'); if (link) { link.href = card.buttonUrl; const label = link.querySelector('.text'); if (label) label.textContent = card.buttonLabel; }
      const image = mediaUrl(data, card.imageAssetId); const img = cardRoot?.querySelector('img'); if (image && img) { img.src = image; img.dataset.src = image; }
    });
    promoTitles.slice(config.promoCards.length).forEach((initialTitle) => {
      const title = findExactText(initialTitle);
      title?.closest('.elementor-element')?.parentElement?.parentElement?.setAttribute('hidden', '');
    });
    window.dailyBakuEditor = data;
    document.dispatchEvent(new CustomEvent('dailybaku:editor', { detail: data }));
  }

  async function load() {
    try {
      const response = await fetch(endpoint, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Editor ${response.status}`);
      const { data } = await response.json();
      applyNav(data.nav, data); applyFooter(data.footer, data); applyIndex(data.index, data);
      document.documentElement.dataset.siteEditor = previewScope ? 'preview' : 'published';
    } catch {
      document.documentElement.dataset.siteEditor = 'fallback';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true }); else load();
})();
