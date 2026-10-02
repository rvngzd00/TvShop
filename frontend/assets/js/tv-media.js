(() => {
  'use strict';
  const root = document.querySelector('[data-tv-area]');
  if (!root) return;
  const labels = { live:'Canlı Yayım', youtube:'YouTube', tiktok:'TikTok', instagram:'Instagram' };
  const t = (value) => window.DailyBakuI18n?.t?.(value) || value;
  const icons = {
    live:'<span class="db-tv-live-dot" aria-hidden="true"></span>',
    youtube:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 7.2a3 3 0 0 0-2.1-2.1C17 4.6 12 4.6 12 4.6s-5 0-6.9.5A3 3 0 0 0 3 7.2 31 31 0 0 0 2.5 12 31 31 0 0 0 3 16.8a3 3 0 0 0 2.1 2.1c1.9.5 6.9.5 6.9.5s5 0 6.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM10 15.5v-7l6 3.5-6 3.5Z"/></svg>',
    tiktok:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3c.4 2.4 1.8 3.8 4 4.2v3.1a8.4 8.4 0 0 1-4-1.2v6.1a6 6 0 1 1-5.2-5.9v3.2a2.9 2.9 0 1 0 2 2.7V3H15Z"/></svg>',
    instagram:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>'
  };
  const allowedFrames = new Set(['www.youtube-nocookie.com', 'www.youtube.com', 'www.tiktok.com', 'www.instagram.com']);
  const safeEmbed = (value) => {
    try { const url = new URL(value); return url.protocol === 'https:' && allowedFrames.has(url.hostname) ? url.href : ''; }
    catch { return ''; }
  };
  const empty = (provider) => `<div class="db-tv-empty"><span aria-hidden="true">${icons[provider]}</span><strong>${t(`${labels[provider]} kontenti hazırda mövcud deyil`)}</strong><p>${t('Yeni yayımlar əlavə edildikdə burada görünəcək.')}</p></div>`;
  let state = { live:{ status:'unavailable' }, items:[] };
  let active = 'youtube';
  let selected = new Map();

  function itemsFor(provider) { return state.items.filter((item) => item.provider === provider); }
  function renderPanel() {
    const panel = root.querySelector('[data-tv-panel]');
    if (!panel) return;
    panel.setAttribute('aria-labelledby', `tvshop-tab-${active}`);
    if (active === 'live') {
      const embed = state.live.status === 'live' ? safeEmbed(state.live.embedUrl || state.live.embed_url) : '';
      panel.innerHTML = embed ? `<div class="db-tv-player is-live"><span class="db-tv-live-badge">${t('CANLI')}</span><iframe src="${embed}" title="${t('TVShop canlı yayımı')}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : empty('live');
      return;
    }
    const items = itemsFor(active);
    if (!items.length) { panel.innerHTML = empty(active); return; }
    const current = items.find((item) => item.id === selected.get(active)) || items[0];
    selected.set(active, current.id);
    const embed = safeEmbed(current.embed_url);
    if (!embed) { panel.innerHTML = empty(active); return; }
    panel.innerHTML = `<div class="db-tv-content"><div class="db-tv-player provider-${active}"><iframe src="${embed}" title="${escapeHtml(current.title || t(`${labels[active]} videosu`))}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>${items.length > 1 ? `<div class="db-tv-playlist" aria-label="${t(`${labels[active]} kontenti`)}">${items.map((item) => `<button type="button" data-tv-item="${escapeHtml(item.id)}" class="${item.id === current.id ? 'is-active' : ''}" aria-pressed="${item.id === current.id}"><span>${icons[active]}</span><b>${escapeHtml(item.title || t(`${labels[active]} videosu`))}</b></button>`).join('')}</div>` : ''}</div>`;
  }
  function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]); }
  function selectTab(provider, focus = false) {
    if (provider === 'live' && state.live.status !== 'live') return;
    active = provider;
    root.querySelectorAll('[role="tab"]').forEach((tab) => {
      const chosen = tab.dataset.tvTab === provider;
      tab.classList.toggle('is-active', chosen);
      tab.setAttribute('aria-selected', String(chosen));
      tab.tabIndex = chosen ? 0 : -1;
      if (chosen && focus) tab.focus();
    });
    renderPanel();
  }
  function render({ preserveActive = false } = {}) {
    const live = state.live.status === 'live';
    const available = ['youtube','tiktok','instagram'].find((provider) => itemsFor(provider).length) || 'youtube';
    if (!preserveActive || (active === 'live' && !live)) active = live ? 'live' : available;
    root.innerHTML = `<div class="db-tv-heading"><div><p>${t('TVSHOP EKRANI')}</p><h2 id="tvshop-media-title">${t('İzlə, kəşf et, alış-veriş et')}</h2></div><span class="db-tv-status" role="status" aria-live="polite">${live ? `<i></i>${t('Canlı yayım aktivdir')}` : t('Seçilmiş video kontenti')}</span></div><div class="db-tv-tabs" role="tablist" aria-label="${t('TV media platformaları')}">${['live','youtube','tiktok','instagram'].map((provider) => `<button id="tvshop-tab-${provider}" type="button" role="tab" aria-controls="tvshop-media-panel" data-tv-tab="${provider}" aria-selected="${provider === active}" tabindex="${provider === active ? 0 : -1}"${provider === 'live' && !live ? ` disabled aria-disabled="true" title="${t('Hazırda canlı yayım yoxdur')}"` : ''}>${icons[provider]}<span>${t(labels[provider])}</span>${provider === 'live' && live ? '<b>LIVE</b>' : ''}</button>`).join('')}</div><div id="tvshop-media-panel" class="db-tv-panel" role="tabpanel" aria-labelledby="tvshop-tab-${active}" data-tv-panel></div>`;
    renderPanel();
  }
  root.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tv-tab]');
    if (tab) selectTab(tab.dataset.tvTab);
    const item = event.target.closest('[data-tv-item]');
    if (item) { selected.set(active, item.dataset.tvItem); renderPanel(); }
  });
  root.addEventListener('keydown', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...root.querySelectorAll('[role="tab"]:not(:disabled)')];
    const current = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[next].dataset.tvTab, true);
  });
  document.addEventListener('dailybaku:languagechange', () => render({ preserveActive: true }));
  fetch('/api/v1/public/tv', { headers:{ Accept:'application/json' }, credentials:'same-origin' })
    .then((response) => { if (!response.ok) throw new Error('TV data unavailable'); return response.json(); })
    .then((result) => { state = result.data || state; render(); })
    .catch(() => { state = { live:{ status:'unavailable' }, items:[] }; render(); });
})();
