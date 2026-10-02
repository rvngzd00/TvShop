(() => {
  'use strict';

  const ADMIN_PORTAL_ROLES = new Set(['super_admin', 'admin', 'editor', 'seo', 'moderator']);
  const VENDOR_PORTAL_ROLES = new Set(['vendor_owner', 'vendor_staff']);
  let actorContextPromise = null;

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  function csrfToken() {
    const part = document.cookie.split('; ').find((item) => item.startsWith('db_csrf=') || item.startsWith('__Host-db_csrf='));
    return part ? decodeURIComponent(part.slice(part.indexOf('=') + 1)) : '';
  }

  async function authApi(path, payload, method = 'POST') {
    const token = csrfToken();
    const response = await fetch(`/api/v1/auth${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        ...(token && method !== 'GET' ? { 'X-CSRF-Token': token } : {})
      },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.details?.[0]?.message || body?.error?.message || 'Əməliyyatı yerinə yetirmək mümkün olmadı.');
    return body.data;
  }

  function portalDestination(actor) {
    const roles = Array.isArray(actor?.roles) ? actor.roles : [];
    if (roles.some((role) => VENDOR_PORTAL_ROLES.has(role))) return '/satici-paneli/';
    if (roles.some((role) => ADMIN_PORTAL_ROLES.has(role))) return '/admin/';
    return '';
  }

  function loadActorContext(authenticated) {
    if (!authenticated) {
      actorContextPromise = null;
      return Promise.resolve(null);
    }
    actorContextPromise ||= authApi('/me', null, 'GET').catch(() => null);
    return actorContextPromise;
  }

  function setBusy(form, busy, busyLabel = 'Gözləyin…') {
    const button = form.querySelector('button[type="submit"],input[type="submit"]');
    if (!button) return;
    if (!button.dataset.originalLabel) button.dataset.originalLabel = 'value' in button ? button.value : button.textContent;
    button.disabled = busy;
    if ('value' in button) button.value = busy ? busyLabel : button.dataset.originalLabel;
    else button.textContent = busy ? busyLabel : button.dataset.originalLabel;
  }

  function statusTarget(form) {
    let status = form.querySelector('.db-auth-status');
    if (!status) {
      status = document.createElement('p');
      status.className = 'db-auth-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      form.append(status);
    }
    return status;
  }

  const passwordEyeIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.75"/><path class="db-password-eye-slash" d="m4 4 16 16"/></svg>`;

  function initializePasswordField(input) {
    if (!(input instanceof HTMLInputElement) || input.dataset.passwordToggleReady) return;
    input.dataset.passwordToggleReady = 'true';
    const wrapper = document.createElement('span');
    wrapper.className = 'db-password-field';
    input.before(wrapper);
    wrapper.append(input);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'db-password-toggle';
    toggle.innerHTML = passwordEyeIcon;
    const synchronize = () => {
      const visible = input.type === 'text';
      toggle.classList.toggle('is-visible', visible);
      toggle.setAttribute('aria-pressed', String(visible));
      toggle.setAttribute('aria-label', visible ? 'Şifrəni gizlət' : 'Şifrəni göstər');
      toggle.title = visible ? 'Şifrəni gizlət' : 'Şifrəni göstər';
    };
    toggle.addEventListener('click', () => {
      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;
      input.type = input.type === 'password' ? 'text' : 'password';
      synchronize();
      input.focus({ preventScroll: true });
      if (selectionStart !== null && selectionEnd !== null) input.setSelectionRange(selectionStart, selectionEnd);
    });
    wrapper.append(toggle);
    synchronize();
  }

  function initializePasswordFields(root = document) {
    if (root instanceof HTMLInputElement && root.matches('input[type="password"]')) initializePasswordField(root);
    root.querySelectorAll?.('input[type="password"]').forEach(initializePasswordField);
  }

  const AZ_PHONE_PATTERN = /^\+994 \d{2} \d{3} \d{2} \d{2}$/;
  const AZ_PHONE_ERROR = 'Telefon nömrəsini +994 12 345 67 89 formatında tam daxil edin.';

  function formatAzerbaijanPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('994')) digits = digits.slice(3);
    if (digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, 9);
    if (!digits) return '';

    const groups = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean);
    return `+994 ${groups.join(' ')}`;
  }

  function validateAzerbaijanPhone(field) {
    const valid = !field.value || AZ_PHONE_PATTERN.test(field.value);
    field.setCustomValidity(valid ? '' : AZ_PHONE_ERROR);
    return valid;
  }

  function initializePhoneField(field) {
    if (field.dataset.azPhoneReady) return;
    field.dataset.azPhoneReady = 'true';
    field.inputMode = 'numeric';
    field.maxLength = 17;
    field.placeholder = '+994 12 345 67 89';
    field.title = AZ_PHONE_ERROR;
    if (field.value) field.value = formatAzerbaijanPhone(field.value);
    validateAzerbaijanPhone(field);

    field.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
      if (!/\d/.test(event.key)) event.preventDefault();
    });
    field.addEventListener('input', () => {
      field.value = formatAzerbaijanPhone(field.value);
      validateAzerbaijanPhone(field);
      field.setSelectionRange(field.value.length, field.value.length);
    });
    field.addEventListener('blur', () => validateAzerbaijanPhone(field));
  }

  function initializeHeaderLoginForms() {
    document.querySelectorAll('.et__login form').forEach((form) => {
      form.dataset.authForm = 'login';
      form.noValidate = true;
      const email = form.querySelector('[name="log"],[name="email"]');
      const password = form.querySelector('[name="pwd"],[name="password"]');
      if (email) {
        email.name = 'email';
        email.required = true;
      }
      if (password) {
        password.name = 'password';
        password.required = true;
        password.minLength = 8;
      }
      const submit = form.querySelector('input[type="submit"]');
      if (submit) submit.value = 'DAXİL OL';
      statusTarget(form);
    });
  }

  async function completeAuthentication(preferredPath = '/hesabim/') {
    await window.DailyBakuCommerce?.refreshCustomerState?.();
    let destination = preferredPath;
    try {
      const actor = await authApi('/me', null, 'GET');
      if (actor?.roles?.some((role) => role === 'vendor_owner' || role === 'vendor_staff')) destination = '/satici-paneli/';
      else if (actor?.permissions?.includes('dashboard.read')) destination = '/admin/';
    } catch {
      // The customer session can still continue even if the actor summary is unavailable.
    }
    window.location.assign(destination);
  }

  async function submitAuthForm(form) {
    if (!form.reportValidity()) return;
    const type = form.dataset.authForm;
    const values = Object.fromEntries(new FormData(form));
    const status = statusTarget(form);
    status.classList.remove('is-error', 'is-success');
    status.textContent = '';
    if (values.password && values.confirmPassword && values.password !== values.confirmPassword) {
      status.textContent = 'Şifrələr uyğun gəlmir.';
      status.classList.add('is-error');
      return;
    }
    delete values.confirmPassword;
    delete values.terms;
    delete values.remember;
    setBusy(form, true);
    try {
      if (type === 'login') {
        await authApi('/login', values);
        status.textContent = 'Uğurla daxil oldunuz. Yönləndirilirsiniz…';
        status.classList.add('is-success');
        await completeAuthentication('/hesabim/');
      } else if (type === 'vendor-login') {
        await authApi('/vendor-login', values);
        status.textContent = 'Satıcı hesabına daxil oldunuz. Kabinet açılır…';
        status.classList.add('is-success');
        await completeAuthentication('/satici-paneli/');
      } else if (type === 'register') {
        if (!values.phone) delete values.phone;
        values.age = Number(values.age);
        await authApi('/register', values);
        status.textContent = 'Hesabınız yaradıldı. Yönləndirilirsiniz…';
        status.classList.add('is-success');
        await completeAuthentication('/hesabim/');
      } else if (type === 'vendor-register') {
        if (!values.description) delete values.description;
        await authApi('/vendor-register', values);
        status.textContent = 'Partnyorluq müraciətiniz qəbul edildi. Satıcı kabinetiniz açılır; məhsullarınız hesab təsdiqləndikdən sonra mağazada görünəcək.';
        status.classList.add('is-success');
        await completeAuthentication('/satici-paneli/');
      } else if (type === 'forgot-password') {
        await authApi('/forgot-password', values);
        status.textContent = 'E-poçt sistemdə mövcuddursa, bərpa keçidi göndərildi.';
        status.classList.add('is-success');
        form.reset();
      } else if (type === 'reset-password') {
        await authApi('/reset-password', values);
        status.textContent = 'Şifrəniz yeniləndi. Hesabınıza daxil olursunuz…';
        status.classList.add('is-success');
        await completeAuthentication('/hesabim/');
      } else if (type === 'accept-invite') {
        await authApi('/accept-invite', values);
        status.textContent = 'Hesab aktivləşdirildi. İdarəetmə paneli açılır…';
        status.classList.add('is-success');
        await completeAuthentication('/admin/');
      }
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Əməliyyatı yerinə yetirmək mümkün olmadı.';
      status.classList.add('is-error');
    } finally {
      setBusy(form, false);
    }
  }

  async function initializeTokenForm(form) {
    const token = new URLSearchParams(location.search).get('token') || '';
    const field = form.elements.namedItem('token');
    const copy = form.querySelector('[data-auth-token-copy]');
    if (field && 'value' in field) field.value = token;
    if (!token) {
      if (copy) copy.textContent = 'Təhlükəsiz keçid tapılmadı.';
      form.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
      return;
    }
    try {
      const detail = await authApi(`/action-token/${encodeURIComponent(token)}`, null, 'GET');
      if (copy) copy.textContent = `${detail.firstName} ${detail.lastName} · ${detail.email}`;
    } catch (error) {
      if (copy) copy.textContent = error instanceof Error ? error.message : 'Keçid etibarsızdır.';
      form.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
    }
  }

  const headerAccountIcons = {
    dashboard: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><rect x="14" y="14" width="6.5" height="6.5" rx="1"/>',
    orders: '<path d="M6 3.5h12v17H6zM9 8h6M9 12h6M9 16h4"/>',
    heart: '<path d="M12 20.5S3.8 15.8 3.8 9.7A4.7 4.7 0 0 1 12 6.5a4.7 4.7 0 0 1 8.2 3.2c0 6.1-8.2 10.8-8.2 10.8Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.6-5 3.3-7 7.5-7s6.9 2 7.5 7"/>',
    logout: '<path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/>'
  };

  function accountIcon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${headerAccountIcons[name]}</svg>`;
  }

  function accountMenuLink(href, icon, title, description) {
    return `<a href="${href}"><i>${accountIcon(icon)}</i><span><strong>${title}</strong><small>${description}</small></span><b aria-hidden="true">›</b></a>`;
  }

  function initialsFor(name) {
    return String(name || 'Hesabım').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toLocaleUpperCase('az-AZ') || 'H';
  }

  function replaceAccountToggle(widget, displayName) {
    const current = widget.querySelector('.login-toggle');
    if (!current) return null;
    let toggle = current;
    if (!(current instanceof HTMLButtonElement)) {
      toggle = document.createElement('button');
      toggle.className = current.className;
      current.replaceWith(toggle);
    }
    toggle.classList.remove('active', 'db-panel-direct');
    toggle.innerHTML = `<div class="login-title login"><span class="my-account-text">Hesabım</span><span class="login-text">${escapeHtml(displayName)}</span></div>`;
    toggle.type = 'button';
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.removeAttribute('href');
    toggle.setAttribute('aria-label', `${displayName} hesab menyusunu aç`);
    return toggle;
  }

  function accountMenuMarkup(profile, displayName, links, navigationLabel = 'Hesab keçidləri') {
    const safeName = escapeHtml(displayName);
    const safeEmail = escapeHtml(profile?.email || 'Şəxsi hesab');
    return `<div class="db-header-account-menu">
      <header><span class="db-header-account-avatar" aria-hidden="true">${escapeHtml(initialsFor(displayName))}</span><div><small>Xoş gəlmisiniz</small><h4>${safeName}</h4><p>${safeEmail}</p></div></header>
      <nav aria-label="${escapeHtml(navigationLabel)}">${links}</nav>
      <button class="db-header-account-logout" type="button" data-account-logout>${accountIcon('logout')}<span>Çıxış</span></button>
    </div>`;
  }

  function prepareHeaderAccountWidget(widget, displayName, widgetIndex) {
    widget.classList.remove('db-panel-account');
    widget.classList.add('db-customer-account');
    const box = widget.querySelector('.login-box');
    const content = box?.querySelector('.widget_reglog .logged-out');
    if (!box || !content) return null;
    box.hidden = false;
    box.removeAttribute('aria-hidden');
    if (!box.id) box.id = `db-header-account-menu-${widgetIndex + 1}`;
    const toggle = replaceAccountToggle(widget, displayName);
    toggle?.setAttribute('aria-controls', box.id);
    content.dataset.authenticated = 'true';
    return content;
  }

  function renderPanelAccount(widget, profile, displayName, destination, widgetIndex) {
    const content = prepareHeaderAccountWidget(widget, displayName, widgetIndex);
    if (!content) return;
    const sellerPortal = destination === '/satici-paneli/';
    const title = sellerPortal ? 'Satıcı kabineti' : 'İdarəetmə paneli';
    const description = sellerPortal ? 'Məhsul və sifarişlərinizi idarə edin' : 'İdarəetmə alətlərinə keçin';
    content.innerHTML = accountMenuMarkup(
      profile,
      displayName,
      accountMenuLink(destination, 'dashboard', title, description),
      sellerPortal ? 'Satıcı hesabı keçidləri' : 'İdarəetmə keçidləri'
    );
  }

  function renderCustomerAccount(widget, profile, displayName, widgetIndex) {
    const content = prepareHeaderAccountWidget(widget, displayName, widgetIndex);
    if (!content) return;
    content.innerHTML = accountMenuMarkup(profile, displayName, `
        ${accountMenuLink('/hesabim/', 'dashboard', 'Hesab paneli', 'Hesabınıza ümumi baxış')}
        ${accountMenuLink('/hesabim/sifarisler/', 'orders', 'Sifarişlər', 'Sifarişlərinizi izləyin')}
        ${accountMenuLink('/hesabim/secilmisler/', 'heart', 'Seçilmişlər', 'Bəyəndiyiniz məhsullar')}
        ${accountMenuLink('/hesabim/hesab-melumatlari/', 'user', 'Hesab məlumatları', 'Profil və təhlükəsizlik')}`);
  }

  function renderPageHeaderAccount(control, profile, displayName, panelPath) {
    let toggle = control;
    if (!(toggle instanceof HTMLButtonElement)) {
      const button = document.createElement('button');
      button.className = toggle.className;
      button.dataset.authLink = '';
      toggle.replaceWith(button);
      toggle = button;
    }
    toggle.type = 'button';
    toggle.dataset.pageAccountToggle = '';
    toggle.innerHTML = `<i class="page-shell-icon user" aria-hidden="true"></i><span>${escapeHtml(displayName)}</span>`;
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'db-page-account-popover');
    toggle.setAttribute('aria-label', `${displayName} hesab menyusunu aç`);

    const container = toggle.parentElement;
    if (!container) return;
    let popover = container.querySelector('.db-page-account-popover');
    if (!popover) {
      popover = document.createElement('div');
      popover.className = 'db-page-account-popover';
      popover.id = 'db-page-account-popover';
      popover.hidden = true;
      container.append(popover);
    }
    const title = panelPath === '/satici-paneli/' ? 'Satıcı kabineti' : panelPath ? 'İdarəetmə paneli' : 'Hesab paneli';
    const description = panelPath === '/satici-paneli/' ? 'Məhsul və sifarişlərinizi idarə edin' : panelPath ? 'İdarəetmə alətlərinə keçin' : 'Hesabınıza ümumi baxış';
    popover.innerHTML = accountMenuMarkup(profile, displayName, accountMenuLink(panelPath || '/hesabim/', 'dashboard', title, description));
  }

  async function updateAuthUI(server) {
    const authenticated = Boolean(server?.profile?.authenticated);
    const displayName = server?.profile?.displayName || server?.profile?.firstName || 'Hesabım';
    const actor = await loadActorContext(authenticated);
    const panelPath = authenticated ? portalDestination(actor) : '';
    const accountPath = panelPath || '/hesabim/';
    window.DailyBakuAuthContext = actor;
    window.DailyBakuPanelPath = panelPath;
    document.querySelectorAll('[data-auth-link]').forEach((link) => {
      if (authenticated && link.classList.contains('page-login')) {
        renderPageHeaderAccount(link, server.profile, displayName, panelPath);
        return;
      }
      link.href = authenticated ? accountPath : '/giris/';
      const label = link.querySelector('span');
      if (label && link.classList.contains('page-login')) label.textContent = authenticated ? displayName : 'Daxil ol';
    });
    document.documentElement.classList.toggle('db-authenticated', authenticated);
    document.documentElement.classList.toggle('db-guest', !authenticated);
    document.querySelectorAll('[data-account-logout]').forEach((button) => { button.hidden = !authenticated; });
    document.querySelectorAll('.logged-out.info-wrap .info').forEach((info) => {
      const lines=info.querySelectorAll('span');
      if(lines[0])lines[0].textContent=authenticated?`Salam, ${displayName}`:'Salam, qonaq';
      if(lines[1])lines[1].textContent=authenticated?'Hesab və sifarişlərinizi idarə edin':'Daha yaxşı təcrübə üçün daxil olun';
    });
    document.querySelectorAll('.et__login').forEach((widget, widgetIndex)=>{
      if(authenticated){
        if (panelPath) renderPanelAccount(widget, server.profile, displayName, panelPath, widgetIndex);
        else renderCustomerAccount(widget, server.profile, displayName, widgetIndex);
      }
    });
    document.dispatchEvent(new CustomEvent('dailybaku:auth-context', { detail: { actor, panelPath } }));
  }

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-auth-form]');
    if (form) {
      event.preventDefault();
      void submitAuthForm(form);
      return;
    }
    const legacy = event.target.closest('.et__login form');
    if (legacy) {
      event.preventDefault();
      if (!legacy.reportValidity()) return;
      const email = legacy.querySelector('[name="log"],[name="email"]')?.value?.trim() || '';
      const password = legacy.querySelector('[name="pwd"],[name="password"]')?.value || '';
      const status = statusTarget(legacy);
      setBusy(legacy, true);
      authApi('/login', { email, password }).then(() => completeAuthentication('/hesabim/')).catch((error) => {
        status.textContent = error instanceof Error ? error.message : 'Daxil olmaq mümkün olmadı.';
        status.classList.add('is-error');
      }).finally(() => setBusy(legacy, false));
    }
  });

  document.addEventListener('click',(event)=>{
    const pageAccountToggle = event.target.closest('[data-page-account-toggle]');
    const pageAccountPopover = document.querySelector('.db-page-account-popover');
    if (pageAccountToggle) {
      event.preventDefault();
      const open = pageAccountToggle.getAttribute('aria-expanded') !== 'true';
      pageAccountToggle.setAttribute('aria-expanded', String(open));
      if (pageAccountPopover) pageAccountPopover.hidden = !open;
    } else if (pageAccountPopover && !event.target.closest('.db-page-account-popover')) {
      pageAccountPopover.hidden = true;
      document.querySelector('[data-page-account-toggle]')?.setAttribute('aria-expanded', 'false');
    }
    const accountToggle = event.target.closest('.et__login .login-toggle[aria-expanded]');
    if (accountToggle) queueMicrotask(() => accountToggle.setAttribute('aria-expanded', String(accountToggle.classList.contains('active'))));
    const logout=event.target.closest('[data-account-logout]');
    if(!logout)return;
    event.preventDefault();logout.disabled=true;
    void Promise.resolve(window.DailyBakuCommerce?.logout?.()).finally(()=>window.location.assign('/'));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const popover = document.querySelector('.db-page-account-popover:not([hidden])');
    if (!popover) return;
    popover.hidden = true;
    const toggle = document.querySelector('[data-page-account-toggle]');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.focus();
  });

  document.addEventListener('dailybaku:customer-state', (event) => { void updateAuthUI(event.detail); });
  initializeHeaderLoginForms();
  initializePasswordFields();
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node instanceof Element) initializePasswordFields(node);
  }))).observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('[data-az-phone]').forEach(initializePhoneField);
  document.querySelectorAll('[data-auth-form="reset-password"],[data-auth-form="accept-invite"]').forEach((form) => void initializeTokenForm(form));
})();
