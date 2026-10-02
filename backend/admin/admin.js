import { mountSiteEditor } from './site-editor.js';

const state = { user: null, view: 'dashboard', search: {}, page: {}, filters: {} };
const isVendorPortal = location.pathname.startsWith('/satici-paneli');
const vendorPortalViews = new Set(['dashboard', 'products', 'reviews', 'inventory', 'orders', 'media', 'classifieds']);
const moderatorViews = new Set(['products', 'reviews', 'categories', 'brands', 'inventory', 'posts', 'post-categories', 'journal']);
const adminPortalRoles = new Set(['super_admin', 'admin', 'editor', 'seo', 'moderator']);
const vendorPortalRoles = new Set(['vendor_owner', 'vendor_staff']);
let productImages = [];
let productVideo = null;
let draggedProductImage = null;
let productCategoryOptions = [];
let notificationTimer = null;
const $ = (selector) => document.querySelector(selector);
const passwordEyeIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.75"/><path class="password-eye-slash" d="m4 4 16 16"/></svg>`;

function initializeAdminPasswordField(input) {
  if (!(input instanceof HTMLInputElement) || input.dataset.passwordToggleReady) return;
  input.dataset.passwordToggleReady = 'true';
  const wrapper = document.createElement('span');
  wrapper.className = 'password-field';
  input.before(wrapper);
  wrapper.append(input);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'password-toggle';
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

function initializeAdminPasswordFields(root = document) {
  if (root instanceof HTMLInputElement && root.matches('input[type="password"]')) initializeAdminPasswordField(root);
  root.querySelectorAll?.('input[type="password"]').forEach(initializeAdminPasswordField);
}

const menus = [
  ['Əsas', [['dashboard', '◫', 'İcmal', 'dashboard.read']]],
  ['Satış', [
    ['orders', '▤', 'Sifarişlər', 'orders.read'],
    ['products', '□', 'Məhsullar', 'catalog.read'],
    ['reviews', '★', 'Məhsul rəyləri', 'catalog.read'],
    ['categories', '▦', 'Kateqoriyalar', 'catalog.read'],
    ['brands', '◆', 'Brendlər', 'catalog.read'],
    ['inventory', '▥', 'Anbar', 'inventory.read'],
    ['classifieds', '▰', 'Elanlar və xidmətlər', 'classifieds.read'],
    ['service-categories', '⌘', 'Xidmət kateqoriyaları', 'service_categories.manage']
  ]],
  ['Kontent', [
    ['editor', '✦', 'Sayt editoru', 'editor.read'],
    ['tv', '▶', 'TV / Yayım', 'tv.read'],
    ['posts', '≡', 'Məqalələr', 'posts.read'],
    ['post-categories', '▤', 'Məqalə kateqoriyaları', 'posts.read'],
    ['pages', '▱', 'Səhifələr', 'cms.read'],
    ['journal', '▥', 'Jurnal buraxılışları', 'journal.read'],
    ['media', '▧', 'Media kitabxanası', 'media.manage'],
    ['seo', '⌕', 'SEO klasterləri', 'seo.read']
  ]],
  ['Marketinq', [
    ['campaigns', '◎', 'Kampaniyalar', 'campaigns.read'],
    ['coupons', '◉', 'Kuponlar', 'coupons.read'],
    ['qr', '⌗', 'QR mərkəzi', 'qr.read'],
    ['rewards', '★', 'Club hədiyyələri', 'loyalty.read'],
    ['redemptions', '✓', 'Hədiyyə sifarişləri', 'loyalty.read']
  ]],
  ['Sistem', [
    ['vendors', '◇', 'Satıcı biznesləri', 'vendors.read'],
    ['seller-users', '♙', 'Satıcılar', 'users.read'],
    ['users', '♙', 'İstifadəçilər', 'users.read'],
    ['settings', '⚙', 'Parametrlər', 'settings.read']
  ]]
];

const labels = {
  dashboard: ['İcmal', 'Platformanın ümumi vəziyyəti'],
  orders: ['Sifarişlər', 'Satış əməliyyatları'],
  products: ['Məhsullar', 'Kataloq və moderasiya'],
  reviews: ['Məhsul rəyləri', 'Müştəri rəylərinin moderasiyası'],
  categories: ['Kateqoriyalar', 'Məhsul qrupları və SEO'],
  brands: ['Brendlər', 'Məhsul istehsalçıları'],
  inventory: ['Anbar', 'Stok idarəetməsi'],
  classifieds: ['Elanlar və xidmətlər', 'Məhsul, xidmət, əmlak və avtomobil elanlarının idarəetməsi'],
  'service-categories': ['Xidmət kateqoriyaları', 'Departament, ana və alt xidmət kateqoriyaları'],
  vendors: ['Satıcı biznesləri', 'Tərəfdaş profilləri, müraciətlər və təsdiq statusları'],
  'seller-users': ['Satıcılar', 'Yalnız satıcı panelinə giriş hesabları'],
  posts: ['Məqalələr', 'Redaksiya kontenti'],
  'post-categories': ['Məqalə kateqoriyaları', 'Jurnal mövzuları və SEO'],
  pages: ['Səhifələr', 'Sayt səhifələri'],
  journal: ['Jurnal buraxılışları', 'Örtük və PDF nəşrləri'],
  media: ['Media kitabxanası', 'Şəkil və fayllar'],
  seo: ['SEO klasterləri', 'Pillar–Cluster modeli'],
  campaigns: ['Kampaniyalar', 'Marketinq fəaliyyətləri'],
  coupons: ['Kuponlar', 'Endirim mexanizmləri'],
  qr: ['QR mərkəzi', 'Dinamik QR və analitika'],
  rewards: ['Club hədiyyələri', 'Xalla əldə edilən məhsullar'],
  redemptions: ['Hədiyyə sifarişləri', 'Təhvil və icra statusları'],
  users: ['İstifadəçilər', 'Satıcı hesablarından ayrı rol və giriş idarəetməsi'],
  settings: ['Parametrlər', 'Platforma konfiqurasiyası'],
  editor: ['Sayt editoru', 'Nav, ana səhifə və footer idarəetməsi'],
  tv: ['TV / Yayım idarəetməsi', 'Canlı yayım və sosial video kontenti']
};

const statusLabels = {
  invited: 'Dəvət edilib', active: 'Aktiv', suspended: 'Dayandırılıb', disabled: 'Deaktiv',
  pending: 'Gözləyir', rejected: 'Rədd edilib', draft: 'Qaralama', review: 'Yoxlamada',
  published: 'Dərc edilib', archived: 'Arxivdə', scheduled: 'Planlaşdırılıb',
  paused: 'Dayandırılıb', ended: 'Bitib', cancelled: 'Ləğv edilib', inactive: 'Qeyri-aktiv',
  confirmed: 'Təsdiqlənib', processing: 'Hazırlanır', ready: 'Hazırdır', shipped: 'Göndərilib',
  delivered: 'Çatdırılıb', returned: 'Qaytarılıb', refunded: 'Geri ödənilib', expired: 'Müddəti bitib'
  ,approved: 'Təsdiqlənib', fulfilled: 'Təhvil verilib'
};

const roleLabels = {
  super_admin: 'Super admin', admin: 'Admin', editor: 'Redaktor', seo: 'SEO mütəxəssisi',
  moderator: 'Moderator', vendor_owner: 'Satıcı sahibi', vendor_staff: 'Satıcı işçisi', customer: 'Müştəri'
};

const genderLabels = {
  male: 'Kişi', female: 'Qadın'
};

const maritalStatusLabels = {
  married: 'Evli', single: 'Subay'
};

const createPermissions = {
  vendors: 'vendors.manage', 'seller-users': 'users.manage', products: 'catalog.create', categories: 'categories.manage', brands: 'catalog.create', users: 'users.manage', media: 'media.manage',
  posts: 'posts.create', 'post-categories': 'posts.create', pages: 'cms.create', seo: 'seo.manage',
  campaigns: 'campaigns.manage', coupons: 'coupons.manage', qr: 'qr.manage', rewards: 'loyalty.manage',
  journal: 'journal.create', classifieds: 'classifieds.create', 'service-categories': 'service_categories.manage'
};

function cookie(name) {
  return document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))?.split('=').slice(1).join('=');
}

async function api(path, options = {}, retry = true) {
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const csrf = cookie('db_csrf') || cookie('__Host-db_csrf');
  if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);
  const response = await fetch(`/api/v1${path}`, { credentials: 'include', ...options, headers });
  if (response.status === 401 && retry && !path.includes('/auth/')) {
    const refreshed = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refreshed.ok) return api(path, options, false);
  }
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const issue = Array.isArray(body.error?.details) ? body.error.details[0] : null;
    const fieldNames = {
      storeId: 'Mağaza', vendorId: 'Satıcı', brandId: 'Brend', name: 'Daxili məhsul adı', title: 'Başlıq',
      slug: 'SEO slug', productType: 'Məhsul növü', price: 'Satış qiyməti', compareAtPrice: 'Köhnə qiymət',
      categoryIds: 'Kateqoriyalar', attributes: 'Atributlar', mediaIds: 'Məhsul şəkilləri', videoAssetId: 'Məhsul videosu', videoUrl: 'Video URL', warehouseId: 'İlkin stok anbarı',
      initialStock: 'İlkin stok', seoTitle: 'SEO başlığı', seoDescription: 'Meta təsvir', shortDescription: 'Qısa təsvir',
      description: 'Ətraflı təsvir', variant: 'Variant', ownerFirstName: 'Hesab sahibinin adı', ownerLastName: 'Hesab sahibinin soyadı',
      accountEmail: 'Satıcı giriş e-poçtu', accountPassword: 'Satıcı giriş şifrəsi', email: 'E-poçt', phone: 'Telefon',
      firstName: 'Ad', lastName: 'Soyad', temporaryPassword: 'Müvəqqəti şifrə', newPassword: 'Yeni şifrə', roleCode: 'Rol',
      ageMin: 'Minimum yaş', ageMax: 'Maksimum yaş', gender: 'Cinsiyyət', maritalStatus: 'Ailə vəziyyəti'
    };
    const field = issue?.path?.length ? fieldNames[issue.path[0]] || issue.path.join(' → ') : '';
    const message = issue?.message
      ? `${field ? `${field}: ` : ''}${issue.message}`
      : body.error?.message || 'Sorğu yerinə yetirilmədi';
    const error = new Error(message);
    error.code = body.error?.code;
    error.details = body.error?.details;
    throw error;
  }
  return body;
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function money(value, currency = 'AZN') {
  return new Intl.NumberFormat('az-AZ', { style: 'currency', currency }).format(Number(value || 0));
}

function date(value) {
  return value
    ? new Intl.DateTimeFormat('az-AZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—';
}

function badge(value) {
  return `<span class="badge ${esc(value)}">${esc(statusLabels[value] || value)}</span>`;
}

function toast(message, error = false) {
  const element = $('#toast');
  element.textContent = message;
  element.className = `toast show${error ? ' error' : ''}`;
  setTimeout(() => { element.className = 'toast'; }, 3000);
}

function can(permission) {
  return state.user?.permissions?.includes(permission);
}

function isModeratorOnly(user = state.user) {
  const operationalRoles = (user?.roles || []).filter((role) => role !== 'customer');
  return operationalRoles.length === 1 && operationalRoles[0] === 'moderator';
}

function menuItemIsVisible(item) {
  return can(item[3])
    && (!isVendorPortal || vendorPortalViews.has(item[0]))
    && (!isModeratorOnly() || moderatorViews.has(item[0]));
}

function renderNav() {
  $('#navigation').innerHTML = menus.map(([section, items]) => {
    const links = items.filter(menuItemIsVisible).map(([id, icon, label]) => (
      `<a href="#${id}" class="nav-link ${state.view === id ? 'active' : ''}" data-view="${id}"><i>${icon}</i>${label}</a>`
    )).join('');
    return links ? `<div class="nav-section">${section}</div>${links}` : '';
  }).join('');
}

function table(columns, rows) {
  const body = rows.length
    ? rows.map((row) => `<tr>${columns.map((column) => `<td>${column.render ? column.render(row) : esc(row[column.key] ?? '—')}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="empty">Hələ məlumat yoxdur</td></tr>`;
  return `<div class="panel"><div class="table-wrap"><table><thead><tr>${columns.map((column) => `<th>${column.label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

async function dashboard() {
  const { data } = await api('/dashboard');
  const quickActions = [
    ['products', 'Yeni məhsul', 'Kataloqa məhsul əlavə et', 'catalog.create'],
    ['posts', 'Yeni məqalə', 'Redaksiya kontenti hazırla', 'posts.create'],
    ['campaigns', 'Kampaniya yarat', 'Endirim aksiyası başlat', 'campaigns.manage'],
    ['qr', 'QR kod yarat', 'Ölçülə bilən QR hazırla', 'qr.manage']
  ].filter((action) => can(action[3]));
  return `<div class="stats-grid">
    <article class="stat-card"><span class="kicker">Bu ay sifariş</span><strong>${data.orders.total_orders}</strong><small>${data.orders.open_orders} aktiv sifariş</small></article>
    <article class="stat-card"><span class="kicker">Ümumi satış</span><strong>${money(data.orders.gross_sales)}</strong><small>Cari ay üzrə</small></article>
    <article class="stat-card"><span class="kicker">Dərc edilmiş məhsul</span><strong>${data.products.published}</strong><small>${data.products.pending} moderasiyada</small></article>
    <article class="stat-card"><span class="kicker">QR skanları</span><strong>${data.qr.scans}</strong><small>${data.qr.codes} aktiv kod</small></article>
  </div><div class="dashboard-grid">
    <section class="panel"><div class="panel-header"><h2>Sürətli əməliyyatlar</h2></div><div class="panel-body quick-grid">${quickActions.length ? quickActions.map((action) => `<button class="quick-action" data-go="${action[0]}"><strong>${action[1]}</strong><small>${action[2]}</small></button>`).join('') : '<p class="muted">Hesabınız üçün sürətli əməliyyat yoxdur.</p>'}</div></section>
    <section class="panel"><div class="panel-header"><h2>Platforma göstəriciləri</h2></div><div class="panel-body metric-list"><div class="metric-row"><span>Satıcı sayı</span><strong>${data.vendors.total}</strong></div><div class="metric-row"><span>Təsdiq gözləyən satıcı</span><strong>${data.vendors.pending}</strong></div><div class="metric-row"><span>QR kod sayı</span><strong>${data.qr.codes}</strong></div></div></section>
  </div>`;
}

function userStatus(row) {
  if (row.login_blocked_at) {
    return `<span class="account-lock-status"><span class="badge login-blocked">Giriş bloklanıb</span><small>10 uğursuz cəhd</small></span>`;
  }
  if (!can('users.manage') || (row.roles || []).includes('super_admin')) return badge(row.status);
  const options = ['invited', 'active', 'suspended', 'disabled'].map((status) => (
    `<option value="${status}" ${row.status === status ? 'selected' : ''}>${statusLabels[status]}</option>`
  )).join('');
  return `<select class="table-status" data-user-status="${esc(row.id)}" data-current="${esc(row.status)}" aria-label="İstifadəçi statusu">${options}</select>`;
}

function userActions(row, view) {
  if (!can('users.manage')) return '—';
  const unlock = row.login_blocked_at
    ? `<button class="table-action account-unlock" data-user-unlock="${esc(row.id)}">Kilidi aç</button> `
    : '';
  const edit = `<button class="table-action" data-user-edit="${esc(row.id)}" data-user-view="${esc(view)}">Redaktə et</button>`;
  const invite = row.status === 'invited' ? ` <button class="table-action" data-resend-invite="${esc(row.id)}">Dəvəti göndər</button>` : '';
  const remove = row.id !== state.user.userId ? ` <button class="table-action danger" data-user-delete="${esc(row.id)}">Sil</button>` : '';
  return `${unlock}${edit}${invite}${remove}`;
}

function vendorStatus(row) {
  if (!can('vendors.approve')) return badge(row.status);
  const vendorStatusLabels = { pending: 'Təsdiqlənməyib', active: 'Təsdiqlənmiş', suspended: 'Dayandırılıb', rejected: 'Rədd edilib' };
  const options = ['pending', 'active', 'suspended', 'rejected'].map((status) => (
    `<option value="${status}" ${row.status === status ? 'selected' : ''}>${vendorStatusLabels[status]}</option>`
  )).join('');
  return `<select class="table-status" data-vendor-status="${esc(row.id)}" data-current="${esc(row.status)}" aria-label="Satıcı statusu">${options}</select>`;
}

function recordStatus(row, statuses, path, permission, label = 'Status') {
  if (!can(permission)) return badge(row.status);
  const choices = [...new Set([row.status, ...statuses])];
  const options = choices.map((status) => (
    `<option value="${esc(status)}" ${row.status === status ? 'selected' : ''}>${esc(statusLabels[status] || status)}</option>`
  )).join('');
  return `<select class="table-status" data-record-status data-status-path="${esc(path)}" data-current="${esc(row.status)}" aria-label="${esc(label)}">${options}</select>`;
}

const orderTransitions = {
  pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'],
  processing: ['ready', 'cancelled'], ready: ['shipped', 'delivered', 'cancelled'],
  shipped: ['delivered', 'returned'], delivered: ['returned'], returned: ['refunded'],
  cancelled: [], refunded: []
};

function orderStatus(row) {
  const next = orderTransitions[row.vendor_status] || [];
  if (!next.length) return badge(row.vendor_status);
  return recordStatus(
    { status: row.vendor_status }, next,
    `/orders/${row.id}/vendor-orders/${row.vendor_order_id}/status`, 'orders.manage', 'Sifariş statusu'
  );
}

function contentStatus(row, type) {
  const permissionPrefix = type === 'posts' ? 'posts' : 'cms';
  return can(`${permissionPrefix}.publish`)
    ? recordStatus(row, ['draft', 'review', 'published', 'archived'], `/content/${type}/${row.id}/status`, `${permissionPrefix}.publish`, 'Kontent statusu')
    : recordStatus(row, ['draft', 'review'], `/content/${type}/${row.id}/status`, `${permissionPrefix}.update`, 'Kontent statusu');
}

const configs = {
  orders: { path: '/orders', columns: [
    { label: '№', key: 'order_number' }, { label: 'Müştəri', key: 'customer_name' },
    { label: 'Satıcı', key: 'vendor_name' }, { label: 'Məbləğ', render: (row) => money(row.vendor_subtotal, row.currency) },
    { label: 'Status', render: orderStatus }, { label: 'Tarix', render: (row) => date(row.placed_at) },
    { label: '', render: (row) => `<button class="table-action" data-order-detail="${esc(row.id)}">Detallar</button>` }
  ] },
  products: { path: '/catalog/products', columns: [
    { label: 'SKU', key: 'sku' }, { label: 'Məhsul', key: 'title' }, { label: 'Satıcı', key: 'vendor_name' },
    { label: 'Qiymət', render: (row) => money(row.price, row.currency) },
    { label: 'Status', render: (row) => recordStatus({ status: row.listing_status }, ['draft', 'review', 'published', 'rejected', 'archived'], `/catalog/products/${row.id}/status`, 'catalog.publish', 'Məhsul statusu') }, { label: 'Tarix', render: (row) => date(row.created_at) },
    { label: '', render: (row) => `<button class="table-action" data-product-edit="${esc(row.id)}">Redaktə et</button>${can('catalog.delete')?` <button class="table-action danger" data-product-delete="${esc(row.id)}">Arxivlə</button>`:''}` }
  ] },
  reviews: { path: '/catalog/reviews', columns: [
    { label: 'Məhsul', render: (row) => `${esc(row.product_title)}<small class="cell-note">${esc(row.vendor_name)}</small>` },
    { label: 'Müştəri', render: (row) => `${esc(row.author_name)}${row.verified_purchase?'<small class="cell-note">✓ Təsdiqlənmiş alış</small>':''}` },
    { label: 'Reytinq', render: (row) => `${'★'.repeat(Number(row.rating))}${'☆'.repeat(Math.max(0,5-Number(row.rating)))}` },
    { label: 'Rəy', render: (row) => `<strong>${esc(row.title||'Başlıqsız')}</strong><small class="cell-note">${esc(row.body)}</small>` },
    { label: 'Status', render: (row) => recordStatus(row,['pending','published','rejected'],`/catalog/reviews/${row.id}/status`,'catalog.publish','Rəy statusu') },
    { label: 'Tarix', render: (row) => date(row.created_at) }
  ] },
  categories: { path: '/catalog/categories', columns: [
    { label: 'Kateqoriya', render: (row) => `<span class="category-tree-name depth-${Number(row.depth || 0)}">${esc(row.name)}</span><small class="cell-note">${['Departament','Əsas kateqoriya','Alt kateqoriya'][Number(row.depth || 0)] || 'Kateqoriya'}</small>` }, { label: 'Slug', key: 'slug' }, { label: 'Məhsul', key: 'subtree_product_count' }, { label: 'Sıra', key: 'position' }, { label: 'Status', render: (row) => badge(row.status) },
    { label: '', render: (row) => can('categories.manage') ? `<button class="table-action" data-category-edit="${esc(row.id)}">Redaktə et</button> <button class="table-action danger" data-category-delete="${esc(row.id)}">Sil</button>` : '—' }
  ] },
  brands: { path: '/catalog/brands', columns: [
    { label: 'Brend', key: 'name' }, { label: 'Slug', key: 'slug' }, { label: 'Sayt', key: 'website_url' }, { label: 'Status', render: (row) => badge(row.status) },
    { label: '', render: (row) => `<button class="table-action" data-brand-edit="${esc(row.id)}">Redaktə et</button> <button class="table-action danger" data-brand-delete="${esc(row.id)}">Sil</button>` }
  ] },
  inventory: { path: '/catalog/inventory', columns: [
    { label: 'Məhsul', render: (row) => `${esc(row.product_name)}<small class="cell-note">${esc(row.variant_sku)}</small>` },
    { label: 'Satıcı', key: 'vendor_name' }, { label: 'Anbar', key: 'warehouse_name' },
    { label: 'Miqdar', key: 'quantity' }, { label: 'Rezerv', key: 'reserved' }, { label: 'Mövcud', key: 'available' },
    { label: 'Əməliyyat', render: (row) => can('inventory.manage') ? `<button class="table-action" data-inventory-adjust data-variant="${esc(row.variant_id)}" data-warehouse="${esc(row.warehouse_id)}" data-product="${esc(row.product_name)}">Stoku dəyiş</button>` : '—' }
  ] },
  'service-categories': { path: '/publishing/service-categories', columns: [
    { label: 'Kateqoriya', render: (row) => `<span class="category-tree-name depth-${Number(row.depth||0)}">${esc(row.name)}</span><small class="cell-note">${['Departament','Ana kateqoriya','Alt kateqoriya'][Number(row.depth||0)]||'Kateqoriya'}</small>` },
    { label: 'Slug', key: 'slug' }, { label: 'Elan', key: 'listing_count' }, { label: 'Sıra', key: 'position' }, { label: 'Status', render: (row) => badge(row.status) },
    { label: '', render: (row) => can('service_categories.manage') ? `<button class="table-action" data-service-category-edit="${esc(row.id)}">Redaktə et</button> <button class="table-action danger" data-service-category-delete="${esc(row.id)}">Arxivlə</button>` : '—' }
  ] },
  classifieds: { path: '/publishing/classifieds', columns: [
    { label: 'Elan', key: 'title' }, { label: 'Növ', render: (row) => esc({product:'Məhsul',service:'Xidmət',property:'Əmlak',vehicle:'Nəqliyyat',other:'Digər'}[row.category]||row.category) },
    { label: 'Satıcı', render: (row) => esc(row.vendor_name||'Fərdi elan') }, { label: 'Qiymət', render: (row) => row.price==null?'Razılaşma ilə':money(row.price,row.currency) },
    { label: 'Status', render: (row) => recordStatus(row,['draft','review','published','rejected','expired','archived'],`/publishing/classifieds/${row.id}/status`,'classifieds.moderate','Elan statusu') },
    { label: 'Kateqoriya', render: (row) => esc(row.service_category_name||'—') }, { label: 'Tarix', render: (row) => date(row.created_at) }, { label: '', render: (row) => can('classifieds.update')?`<button class="table-action" data-classified-edit="${esc(row.id)}">Redaktə et</button>${can('classifieds.delete')?` <button class="table-action danger" data-classified-delete="${esc(row.id)}">Arxivlə</button>`:''}`:'—' }
  ] },
  vendors: { path: '/vendors', columns: [
    { label: 'Satıcı', render: (row) => `<strong>${esc(row.display_name)}</strong><small class="cell-note">${esc(row.legal_name)}</small>${row.tax_id ? `<small class="cell-note">VÖEN: ${esc(row.tax_id)}</small>` : ''}` },
    { label: 'Hesab sahibi', render: (row) => `${esc([row.owner_first_name,row.owner_last_name].filter(Boolean).join(' ') || '—')}<small class="cell-note">${esc(row.owner_email || '—')}</small>` },
    { label: 'Əlaqə', render: (row) => `${esc(row.email)}<small class="cell-note">${esc(row.phone || '—')}</small>` },
    { label: 'Mənbə', render: (row) => row.settings?.registrationSource === 'self_service' ? '<span class="badge review">Onlayn müraciət</span>' : '<span class="badge active">Admin</span>' },
    { label: 'Status', render: vendorStatus }, { label: 'Tarix', render: (row) => date(row.created_at) },
    { label: '', render: (row) => {
      const approve = row.status === 'pending' && can('vendors.approve')
        ? `<button class="table-action vendor-approve" data-vendor-approve="${esc(row.id)}">Təsdiqlə</button> `
        : '';
      const details = can('vendors.manage')
        ? `<button class="table-action" data-vendor-edit="${esc(row.id)}">Məlumatlar</button>`
        : '';
      return approve || details ? `${approve}${details}` : '—';
    } }
  ] },
  'seller-users': { path: '/users', query: { accountType: 'vendor' }, columns: [
    { label: 'Ad', render: (row) => `${esc(row.first_name)} ${esc(row.last_name)}` }, { label: 'E-poçt', key: 'email' },
    { label: 'Satıcı rolu', render: (row) => (row.roles || []).map((role) => `<span class="badge active">${esc(roleLabels[role] || role)}</span>`).join(' ') },
    { label: 'Status', render: userStatus }, { label: 'Son giriş', render: (row) => date(row.last_login_at) },
    { label: '', render: (row) => userActions(row, 'seller-users') }
  ] },
  users: { path: '/users', query: { accountType: 'general' }, columns: [
    { label: 'Ad', render: (row) => `${esc(row.first_name)} ${esc(row.last_name)}` }, { label: 'E-poçt', key: 'email' },
    { label: 'Yaş', render: (row) => row.age == null ? '—' : `${Number(row.age)} yaş` },
    { label: 'Cinsiyyət', render: (row) => esc(genderLabels[row.gender] || '—') },
    { label: 'Ailə vəziyyəti', render: (row) => esc(maritalStatusLabels[row.marital_status] || '—') },
    { label: 'Rollar', render: (row) => (row.roles || []).map((role) => `<span class="badge active">${esc(roleLabels[role] || role)}</span>`).join(' ') },
    { label: 'Status', render: userStatus }, { label: 'Son giriş', render: (row) => date(row.last_login_at) },
    { label: '', render: (row) => userActions(row, 'users') }
  ] },
  posts: { path: '/content/posts', columns: [
    { label: 'Başlıq', key: 'title' }, { label: 'Slug', key: 'slug' }, { label: 'Status', render: (row) => contentStatus(row, 'posts') },
    { label: 'SEO title', key: 'seo_title' }, { label: 'Yenilənib', render: (row) => date(row.updated_at) }, { label: '', render: (row) => can('posts.update') ? `<button class="table-action" data-content-edit="${esc(row.id)}" data-content-type="posts">Redaktə et</button>${can('posts.delete')?` <button class="table-action danger" data-content-delete="${esc(row.id)}" data-content-type="posts">Sil</button>`:''}` : '—' }
  ] },
  'post-categories': { path: '/content/post-categories', columns: [
    { label: 'Kateqoriya', key: 'name' }, { label: 'Slug', key: 'slug' }, { label: 'Məqalə', key: 'post_count' }, { label: 'Status', render: (row) => badge(row.status) },
    { label: '', render: (row) => can('posts.update') ? `<button class="table-action" data-post-category-edit="${esc(row.id)}">Redaktə et</button>${can('posts.delete')?` <button class="table-action danger" data-post-category-delete="${esc(row.id)}">Sil</button>`:''}` : '—' }
  ] },
  pages: { path: '/content/pages', columns: [
    { label: 'Başlıq', key: 'title' }, { label: 'Slug', key: 'slug' }, { label: 'Status', render: (row) => contentStatus(row, 'pages') },
    { label: 'SEO title', key: 'seo_title' }, { label: 'Yenilənib', render: (row) => date(row.updated_at) }, { label: '', render: (row) => `<button class="table-action" data-content-edit="${esc(row.id)}" data-content-type="pages">Redaktə et</button>${can('cms.delete')?` <button class="table-action danger" data-content-delete="${esc(row.id)}" data-content-type="pages">Sil</button>`:''}` }
  ] },
  journal: { path: '/publishing/journal', columns: [
    { label: 'Buraxılış', key: 'issue_number' }, { label: 'Başlıq', key: 'title' },
    { label: 'Status', render: (row) => recordStatus(row,['draft','review','published','archived'],`/publishing/journal/${row.id}/status`,'journal.publish','Jurnal statusu') },
    { label: 'Dərc tarixi', render: (row) => date(row.published_at) }, { label: '', render: (row) => can('journal.update') ? `<button class="table-action" data-journal-edit="${esc(row.id)}">Redaktə et</button>${can('journal.delete')?` <button class="table-action danger" data-journal-delete="${esc(row.id)}">Arxivlə</button>`:''}` : '—' }
  ] },
  campaigns: { path: '/marketing/campaigns', columns: [
    { label: 'Kampaniya', key: 'name' }, { label: 'Növ', key: 'campaign_type' }, { label: 'Status', render: (row) => recordStatus(row, ['draft', 'scheduled', 'active', 'paused', 'ended', 'cancelled'], `/marketing/campaigns/${row.id}/status`, 'campaigns.manage', 'Kampaniya statusu') },
    { label: 'Başlayır', render: (row) => date(row.starts_at) }, { label: 'Bitir', render: (row) => date(row.ends_at) }
  ] },
  coupons: { path: '/marketing/coupons', columns: [
    { label: 'Kupon', key: 'name' }, { label: 'Növ', key: 'discount_type' }, { label: 'Dəyər', key: 'discount_value' },
    { label: 'İstifadə', key: 'redemption_count' }, { label: 'Status', render: (row) => recordStatus(row, ['draft', 'active', 'inactive', 'archived'], `/marketing/coupons/${row.id}/status`, 'coupons.manage', 'Kupon statusu') },
    { label: 'Bitir', render: (row) => date(row.expires_at) }
  ] },
  qr: { path: '/marketing/qr', columns: [
    { label: 'QR', key: 'name' }, { label: 'Kod', key: 'code' }, { label: 'Növ', key: 'qr_type' },
    { label: 'Skan', key: 'scan_count' }, { label: 'Status', render: (row) => recordStatus(row, ['draft', 'active', 'inactive', 'archived'], `/marketing/qr/${row.id}/status`, 'qr.manage', 'QR statusu') },
    { label: 'Bitir', render: (row) => date(row.expires_at) }, { label: '', render: (row) => `<a class="table-action" href="/api/v1/marketing/qr/${esc(row.id)}/svg" target="_blank" rel="noopener">SVG-ni aç</a>` }
  ] },
  rewards: { path: '/loyalty/rewards', columns: [
    { label: 'Hədiyyə', key: 'name' }, { label: 'Satıcı', render: (row) => esc(row.vendor_name || 'Platforma') }, { label: 'Xal', key: 'points_cost' }, { label: 'Stok', render: (row) => row.stock == null ? 'Limitsiz' : esc(row.stock) }, { label: 'Sifariş', key: 'redemption_count' }, { label: 'Status', render: (row) => badge(row.status) },
    { label: '', render: (row) => can('loyalty.manage') ? `<button class="table-action" data-reward-edit="${esc(row.id)}">Redaktə et</button>` : '—' }
  ] },
  redemptions: { path: '/loyalty/redemptions', columns: [
    { label: 'Müştəri', render: (row) => `${esc(row.customer_name)}<small class="cell-note">${esc(row.email)}</small>` }, { label: 'Hədiyyə', key: 'reward_name' }, { label: 'Xal', key: 'points_spent' },
    { label: 'Status', render: (row) => recordStatus(row, ['approved','fulfilled','cancelled'], `/loyalty/redemptions/${row.id}/status`, 'loyalty.manage', 'Hədiyyə statusu') }, { label: 'Tarix', render: (row) => date(row.created_at) }
  ] },
  seo: { path: '/content/seo/clusters', columns: [
    { label: 'Klaster', key: 'name' }, { label: 'Əsas açar söz', key: 'primary_keyword' },
    { label: 'Axtarış niyyəti', key: 'search_intent' },
    { label: 'Pillar', render: (row) => esc(row.pillar_page_title || row.pillar_post_title || '—') },
    { label: 'Cluster sayı', key: 'member_count' }, { label: 'Status', render: (row) => badge(row.status) }
  ] }
};

async function listing(view) {
  const config = configs[view];
  const search = state.search[view] || '';
  const filters = state.filters[view] || {};
  const page = state.page[view] || 1;
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  for (const [key, value] of Object.entries(config.query || {})) query.set(key, value);
  if (search) query.set('search', search);
  if (view === 'users') {
    for (const key of ['ageMin', 'ageMax', 'gender', 'maritalStatus']) {
      if (filters[key] !== undefined && filters[key] !== '') query.set(key, String(filters[key]));
    }
  }
  const result = await api(`${config.path}?${query}`);
  const create = createPermissions[view] && can(createPermissions[view])
    ? `<button class="primary" data-create="${view}">+ Yeni əlavə et</button>` : '';
  const meta = result.meta || { page: 1, pages: 1, total: result.data?.length || 0 };
  const pagination = meta.pages > 1 ? `<nav class="pagination" aria-label="Səhifələmə"><button type="button" data-page-view="${view}" data-page="${meta.page - 1}" ${meta.page <= 1 ? 'disabled' : ''}>Əvvəlki</button><span>${meta.page} / ${meta.pages}</span><button type="button" data-page-view="${view}" data-page="${meta.page + 1}" ${meta.page >= meta.pages ? 'disabled' : ''}>Növbəti</button></nav>` : '';
  const searchForm = view === 'users'
    ? `<form class="table-search user-filter-form" data-search-view="${view}" data-demographic-filters>
        <input class="user-filter-search" type="search" name="search" value="${esc(search)}" placeholder="Ad və ya e-poçtla axtar…" aria-label="İstifadəçilər üzrə axtarış">
        <label><span>Minimum yaş</span><input type="number" name="ageMin" value="${esc(filters.ageMin || '')}" min="1" max="120" inputmode="numeric" placeholder="1"></label>
        <label><span>Maksimum yaş</span><input type="number" name="ageMax" value="${esc(filters.ageMax || '')}" min="1" max="120" inputmode="numeric" placeholder="120"></label>
        <label><span>Cinsiyyət</span><select name="gender"><option value="">Hamısı</option>${Object.entries(genderLabels).map(([value, label]) => `<option value="${value}" ${filters.gender === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
        <label><span>Ailə vəziyyəti</span><select name="maritalStatus"><option value="">Hamısı</option>${Object.entries(maritalStatusLabels).map(([value, label]) => `<option value="${value}" ${filters.maritalStatus === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
        <div class="user-filter-actions"><button class="secondary" type="submit">Filtrlə</button><button class="filter-clear" type="button" data-clear-user-filters>Hamısını sıfırla</button></div>
      </form>`
    : `<form class="table-search" data-search-view="${view}"><input type="search" name="search" value="${esc(search)}" placeholder="Axtar…" aria-label="${esc(labels[view][0])} üzrə axtarış"><button class="secondary" type="submit">Axtar</button></form>`;
  return `<div class="page-actions ${view === 'users' ? 'has-user-filters' : ''}">${searchForm}${create}</div>${table(config.columns, result.data || [])}<p class="result-meta">${Number(meta.total)} nəticə</p>${pagination}`;
}

async function settings() {
  const { data } = await api('/settings');
  const disabled = can('settings.manage') ? '' : 'disabled';
  return `<section class="panel settings-panel"><div class="panel-header"><div><h2>Mağaza parametrləri</h2><p class="muted">${esc(data.code)} · ${esc(data.primary_domain)}</p></div></div><div class="panel-body"><form class="settings-form" data-store-id="${esc(data.id)}"><div class="form-grid">
    <label>Mağaza adı<input name="name" value="${esc(data.name)}" minlength="2" required ${disabled}></label>
    <label>Dil kodu<input name="locale" value="${esc(data.locale)}" pattern="[a-z]{2}-[A-Z]{2}" required ${disabled}></label>
    <label>Valyuta<input name="currency" value="${esc(data.currency)}" minlength="3" maxlength="3" required ${disabled}></label>
    <label>Saat qurşağı<input name="timezone" value="${esc(data.timezone)}" required ${disabled}></label>
  </div>${can('settings.manage') ? '<div class="dialog-actions"><button class="primary" type="submit">Yadda saxla</button></div>' : ''}</form></div></section>`;
}

async function tvView() {
  const storeId = state.user.storeIds[0];
  if (!storeId) throw new Error('TV bölməsi üçün mağaza səlahiyyəti tapılmadı');
  const { data } = await api(`/tv?storeId=${encodeURIComponent(storeId)}`);
  const providerLabels = { youtube:'YouTube', tiktok:'TikTok', instagram:'Instagram' };
  const disabled = can('tv.manage') ? '' : 'disabled';
  const rows = (data.items || []).map((item) => `<form class="tv-item-row" data-tv-item-edit="${esc(item.id)}">
    <label>Platforma<select name="provider" ${disabled}>${Object.entries(providerLabels).map(([value, label]) => `<option value="${value}"${item.provider === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    <label>Media URL<input name="sourceUrl" type="url" required value="${esc(item.source_url)}" ${disabled}></label>
    <label>Başlıq<input name="title" value="${esc(item.title || '')}" maxlength="160" ${disabled}></label>
    <label>Sıra<input name="position" type="number" min="0" value="${Number(item.position || 0)}" ${disabled}></label>
    <label class="tv-active"><input name="isActive" type="checkbox"${item.is_active ? ' checked' : ''} ${disabled}> Aktiv</label>
    <a href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">Mənbəyə bax</a>
    <button class="secondary" type="submit" ${disabled}>Yenilə</button>
    <button class="table-action danger" type="button" data-tv-item-delete="${esc(item.id)}" ${disabled}>Sil</button>
  </form>`).join('');
  return `<div class="tv-admin-grid">
    <section class="panel"><div class="panel-header"><div><h2>Canlı yayım kanalı</h2><p class="muted">Rəsmi YouTube Data API ilə aktiv canlı yayım yoxlanılır.</p></div></div><div class="panel-body"><form data-tv-settings data-store-id="${esc(storeId)}"><label>YouTube kanal ID-si<input name="youtubeChannelId" value="${esc(data.settings?.youtube_channel_id || '')}" placeholder="UC…" pattern="UC[A-Za-z0-9_-]{20,}" ${disabled}></label><p class="muted">Kanal canlı deyilsə “Canlı Yayım” tabı seçilə bilən vəziyyətdə göstərilmir.</p><button class="primary" type="submit" ${disabled}>Yadda saxla</button></form></div></section>
    <section class="panel"><div class="panel-header"><div><h2>TV kontenti əlavə et</h2><p class="muted">Normal YouTube, TikTok və Instagram URL-i daxil edin.</p></div></div><div class="panel-body"><form data-tv-item-create data-store-id="${esc(storeId)}"><label>Platforma<select name="provider" ${disabled}><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option></select></label><label>Media URL<input name="sourceUrl" type="url" required placeholder="https://…" ${disabled}></label><label>Başlıq<input name="title" maxlength="160" ${disabled}></label><label>Sıra<input name="position" type="number" min="0" value="0" ${disabled}></label><label class="tv-active"><input name="isActive" type="checkbox" checked ${disabled}> Aktiv</label><button class="primary" type="submit" ${disabled}>Əlavə et</button></form></div></section>
    <section class="panel tv-items-panel"><div class="panel-header"><div><h2>Yayımdakı kontent</h2><p class="muted">${(data.items || []).length} media qeydi</p></div></div><div class="panel-body tv-item-list">${rows || '<p class="empty">Hələ TV kontenti əlavə edilməyib.</p>'}</div></section>
  </div>`;
}

function field(name, label, type = 'text', required = true, options = [], attributes = '') {
  if (type === 'select') {
    return `<label>${label}<select name="${name}" ${required ? 'required' : ''} ${attributes}>${options.map(([value, text]) => `<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select></label>`;
  }
  if (type === 'textarea') return `<label class="wide">${label}<textarea name="${name}" ${required ? 'required' : ''} ${attributes}></textarea></label>`;
  return `<label>${label}<input name="${name}" type="${type}" ${required ? 'required' : ''} ${attributes}></label>`;
}

function vendorFields(editing = false, vendor = null) {
  const common = field('displayName', 'Görünən ad') + field('legalName', 'Hüquqi ad')
    + field('taxId', 'VÖEN', 'text', false)
    + field('email', 'Əlaqə e-poçtu', 'email') + field('phone', 'Telefon', 'tel', false, [], 'inputmode="numeric" placeholder="+994 12 345 67 89"')
    + field('commissionRate', 'Komissiya faizi', 'number', true, [], 'min="0" max="100" step="0.01" value="0"')
    + field('description', 'Təsvir', 'textarea', false);
  if (editing) return common + `<fieldset class="wide choice-field account-credentials vendor-account-details"><legend>Satıcı kabineti və müraciət məlumatları</legend><div class="detail-grid"><div><span>Hesab sahibi</span><strong>${esc([vendor?.owner_first_name,vendor?.owner_last_name].filter(Boolean).join(' ') || '—')}</strong></div><div><span>Giriş e-poçtu</span><strong>${esc(vendor?.owner_email || '—')}</strong></div><div><span>Hesab telefonu</span><strong>${esc(vendor?.owner_phone || '—')}</strong></div><div><span>Qeydiyyat mənbəyi</span><strong>${vendor?.settings?.registrationSource === 'self_service' ? 'Onlayn partnyorluq müraciəti' : 'Admin tərəfindən yaradılıb'}</strong></div><div><span>Qeydiyyat tarixi</span><strong>${esc(date(vendor?.created_at))}</strong></div><div><span>Son giriş</span><strong>${esc(date(vendor?.owner_last_login_at))}</strong></div></div></fieldset>`;
  return common + `<fieldset class="wide choice-field account-credentials"><legend>Satıcı kabineti hesabı</legend><p class="muted">Bu məlumatlarla satıcı <strong>/satici-paneli/</strong> ünvanından daxil olacaq.</p><div class="credential-grid">${field('ownerFirstName', 'Hesab sahibinin adı')}${field('ownerLastName', 'Hesab sahibinin soyadı')}${field('accountEmail', 'Giriş e-poçtu', 'email')}${field('accountPassword', 'Giriş şifrəsi', 'password', true, [], 'minlength="12" maxlength="200" autocomplete="new-password"')}</div></fieldset>`;
}

function userFields(vendors, editing = false, sellerOnly = false) {
  const roleLocked = editing && !state.user?.roles?.includes('super_admin');
  const roles = sellerOnly
    ? [['vendor_owner', 'Satıcı sahibi'], ['vendor_staff', 'Satıcı işçisi']]
    : [
        ...(editing && state.user?.roles?.includes('super_admin') ? [['super_admin', 'Super admin']] : []),
        ['admin', 'Admin'], ['editor', 'Redaktor'], ['seo', 'SEO'], ['moderator', 'Moderator'], ['customer', 'Müştəri']
      ];
  return field('firstName', 'Ad') + field('lastName', 'Soyad') + field('email', 'E-poçt', 'email')
    + field('phone', 'Telefon', 'tel', false, [], 'inputmode="numeric" placeholder="+994 12 345 67 89"')
    + field(editing ? 'newPassword' : 'temporaryPassword', editing ? 'Yeni şifrə (dəyişmirsə boş saxlayın)' : 'Müvəqqəti şifrə', 'password', !editing, [], 'minlength="12" maxlength="200" autocomplete="new-password"')
    + field('status', 'Hesab statusu', 'select', true, editing ? [['active', 'Aktiv'], ['invited', 'Dəvət edilib'], ['suspended', 'Dayandırılıb'], ['disabled', 'Deaktiv']] : [['active', 'Aktiv'], ['invited', 'Dəvət edilib']])
    + field('roleCode', 'Rol', 'select', true, roles, roleLocked ? 'disabled aria-disabled="true" title="Rolu yalnız super admin dəyişə bilər"' : '')
    + field('vendorId', 'Satıcı', 'select', false, [['', 'Seçilməyib'], ...vendors]);
}

function synchronizeUserVendorField() {
  const form = $('#createForm');
  if (!['users', 'seller-users'].includes(form.dataset.view)) return;
  const role = form.elements.roleCode;
  const vendor = form.elements.vendorId;
  if (!role || !vendor) return;
  const vendorRole = role.value.startsWith('vendor_');
  vendor.disabled = !vendorRole;
  vendor.required = vendorRole;
  vendor.closest('label').classList.toggle('field-disabled', !vendorRole);
  if (!vendorRole) vendor.value = '';
}

async function vendorOptions(storeId = state.user.storeIds[0]) {
  if (state.user.vendorIds.length) return state.user.vendorIds.map((id) => [id, 'Mənim satıcı hesabım']);
  const result = await api(`/vendors/options?storeId=${encodeURIComponent(storeId)}&includePending=true`);
  return result.data.filter((vendor) => !storeId || vendor.store_id === storeId).map((vendor) => [vendor.id, vendor.display_name]);
}

async function catalogOptions(storeId, includeMedia = true) {
  const [categories, brands, warehouses, media] = await Promise.all([
    api(`/catalog/categories?storeId=${encodeURIComponent(storeId)}`),
    api(`/catalog/brands?storeId=${encodeURIComponent(storeId)}`),
    can('inventory.read') ? api(`/catalog/warehouses?storeId=${encodeURIComponent(storeId)}`) : Promise.resolve({ data: [] }),
    includeMedia && can('media.read') ? api('/media') : Promise.resolve({ data: [] })
  ]);
  return { categories: categories.data || [], brands: brands.data || [], warehouses: warehouses.data || [], media: media.data || [] };
}

function serviceCategoryOptions(rows, { leafOnly = false, excludeIds = new Set() } = {}) {
  const active = rows.filter((row) => row.status === 'active' && !excludeIds.has(row.id));
  const parents = new Set(active.map((row) => row.parent_id).filter(Boolean));
  return active
    .filter((row) => !leafOnly || !parents.has(row.id))
    .map((row) => {
      const path = Array.isArray(row.path_names) && row.path_names.length
        ? row.path_names.join(' › ')
        : `${'— '.repeat(Number(row.depth || 0))}${row.name}`;
      return [row.id, path];
    });
}

function classifiedImageFields() {
  return `<fieldset class="wide choice-field product-image-field"><legend>Elan şəkilləri</legend><p class="muted">Şəkilləri yükləyin və sürüşdürərək sıralayın. Birinci şəkil avtomatik əsas şəkil olur.</p><label class="product-image-dropzone" data-product-image-dropzone><input type="file" data-product-image-input accept="image/jpeg,image/png,image/webp,image/avif" multiple><strong>Şəkilləri seçin və ya bura atın</strong><small>JPG, PNG, WEBP və AVIF · ən çox 12 şəkil</small></label><div class="product-image-list" data-product-image-list></div><p class="product-upload-status" data-product-upload-status aria-live="polite"></p></fieldset>`;
}

function synchronizeClassifiedCategory() {
  const form = $('#createForm');
  if (form?.dataset.view !== 'classifieds') return;
  const category = form.elements.category;
  const serviceCategory = form.elements.serviceCategoryId;
  const wrapper = form.querySelector('[data-service-category-field]');
  if (!category || !serviceCategory || !wrapper) return;
  const isService = category.value === 'service';
  wrapper.hidden = !isService;
  serviceCategory.disabled = !isService;
  serviceCategory.required = isService;
  if (!isService) serviceCategory.value = '';
}

function productFields(vendors, options, generatedSku = '') {
  productCategoryOptions = options.categories || [];
  const departments = productCategoryOptions.filter((category) => !category.parent_id && category.status === 'active');
  return field('vendorId', 'Satıcı', 'select', true, vendors)
    + `<div class="product-brand-field"><label>Brend<select name="brandId"><option value="">Brendsiz</option>${options.brands.map((brand) => `<option value="${esc(brand.id)}">${esc(brand.name)}</option>`).join('')}<option value="__create__">＋ Yeni brend əlavə et</option></select></label><div class="inline-brand-create" data-inline-brand hidden><input type="text" data-inline-brand-name minlength="2" maxlength="160" placeholder="Yeni brendin adı" aria-label="Yeni brendin adı"><button type="button" class="secondary" data-product-brand-create>Brendi yarat</button><small data-inline-brand-status></small></div></div>`
    + field('sku', 'Məhsul SKU-su', 'text', true, [], `readonly aria-readonly="true" value="${esc(generatedSku)}" data-product-sku`)
    + field('name', 'Daxili məhsul adı')
    + field('title', 'Saytda görünən başlıq') + field('slug', 'SEO slug', 'text', false)
    + field('productType', 'Məhsul növü', 'select', true, [['physical', 'Fiziki'], ['digital', 'Rəqəmsal'], ['service', 'Xidmət']])
    + field('price', 'Satış qiyməti', 'number', true, [], 'min="0" step="0.01"')
    + field('compareAtPrice', 'Köhnə qiymət', 'number', false, [], 'min="0" step="0.01"')
    + `<fieldset class="wide choice-field product-category-picker"><legend>Kateqoriya yolu</legend><p class="muted">Departamentdən başlayaraq mövcud əsas və alt kateqoriyanı seçin.</p><div class="category-picker-grid"><label>Departament<select name="categoryIds" data-category-depth="0" required><option value="">Departamenti seçin</option>${departments.map((category) => `<option value="${esc(category.id)}">${esc(category.name)}</option>`).join('')}</select></label><label>Əsas kateqoriya<select name="categoryIds" data-category-depth="1" disabled><option value="">Əsas kateqoriya yoxdur</option></select></label><label>Alt kateqoriya<select name="categoryIds" data-category-depth="2" disabled><option value="">Alt kateqoriya yoxdur</option></select></label></div><small data-category-picker-status>Ən dərin mövcud səviyyəni seçmək məhsulun düzgün filtrlənməsini təmin edir.</small></fieldset>`
    + field('warehouseId', 'İlkin stok anbarı', 'select', false, [['', 'Stok daxil edilməyəcək'], ...options.warehouses.map((warehouse) => [warehouse.id, `${warehouse.name} (${warehouse.code})`])])
    + field('initialStock', 'İlkin stok', 'number', false, [], 'min="0" step="1" value="0"')
    + field('displayPosition', 'Vitrin sırası', 'number', true, [], 'min="0" step="1" value="0"')
    + field('merchandisingBadge', 'Məhsul nişanı', 'select', true, [['none', 'Nişansız'], ['sale', 'Endirim'], ['hot', 'Hit'], ['new', 'Yeni'], ['recommended', 'Tövsiyə olunur']])
    + `<fieldset class="wide choice-field"><legend>Ana səhifə vitrinləri</legend><div class="inline-checks"><label><input type="checkbox" name="isFeatured"> Seçilmiş fürsətlər</label><label><input type="checkbox" name="isPopular"> Ən populyar seçimlər</label><label><input type="checkbox" name="isTopPick"> Ən çox seçilənlər</label></div></fieldset>`
    + field('shortDescription', 'Qısa təsvir', 'textarea') + field('description', 'Ətraflı təsvir', 'textarea')
    + `<fieldset class="wide choice-field product-attributes"><legend>Atributlar</legend><p class="muted">Atribut adı və dəyərini cüt şəklində daxil edin.</p><div class="attribute-list" data-product-attributes></div><button type="button" class="secondary attribute-add" data-attribute-add>＋ Əlavə et</button></fieldset>`
    + field('seoTitle', 'SEO başlığı') + field('seoDescription', 'Meta təsvir', 'textarea')
    + `<fieldset class="wide choice-field product-video-field"><legend>Əsas məhsul videosu</legend><p class="muted">MP4/WEBM yükləyin və ya birbaşa HTTPS MP4/WEBM URL-i daxil edin. Video kartlarda və məhsul səhifəsində şəkildən əvvəl göstərilir.</p><label class="product-image-dropzone"><input type="file" data-product-video-input accept="video/mp4,video/webm"><strong>Video seçin</strong><small>MP4 və ya WEBM · server yükləmə limitinə uyğun</small></label>${field('videoUrl', 'Xarici video URL', 'url', false, [], 'placeholder="https://cdn.example.com/product.mp4"')}<div data-product-video-preview></div><p class="product-upload-status" data-product-video-status aria-live="polite"></p></fieldset>`
    + `<fieldset class="wide choice-field product-image-field"><legend>Məhsul şəkilləri</legend><p class="muted">Şəkilləri yükləyin və sürüşdürərək sıralayın. Birinci şəkil avtomatik əsas şəkil olur.</p><label class="product-image-dropzone" data-product-image-dropzone><input type="file" data-product-image-input accept="image/jpeg,image/png,image/webp,image/avif" multiple><strong>Şəkilləri seçin və ya bura atın</strong><small>JPG, PNG, WEBP və AVIF · ən çox 12 şəkil</small></label><div class="product-image-list" data-product-image-list></div><p class="product-upload-status" data-product-upload-status aria-live="polite"></p></fieldset>`;
}

function categoryChildren(parentId) {
  return productCategoryOptions.filter((category) => category.parent_id === parentId && category.status === 'active');
}

function populateCategorySelect(select, items, placeholder, value = '') {
  select.innerHTML = `<option value="">${esc(placeholder)}</option>${items.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}`;
  select.disabled = items.length === 0;
  select.required = items.length > 0;
  if (value && items.some((item) => item.id === value)) select.value = value;
}

function synchronizeProductCategoryPicker(changedDepth = -1, selectedIds = []) {
  const form = $('#createForm');
  if (form?.dataset.view !== 'products') return;
  const selects = [0, 1, 2].map((depth) => form.querySelector(`[data-category-depth="${depth}"]`));
  if (selects.some((select) => !select)) return;
  const selectedSet = new Set(selectedIds);
  // Reconstruct a complete path for older products that may have only the
  // deepest category stored, while preserving current three-level records.
  for (const selectedId of selectedIds) {
    let current = productCategoryOptions.find((category) => category.id === selectedId);
    while (current?.parent_id) {
      selectedSet.add(current.parent_id);
      current = productCategoryOptions.find((category) => category.id === current.parent_id);
    }
  }
  const selectedDepartment = changedDepth < 0
    ? productCategoryOptions.find((category) => !category.parent_id && selectedSet.has(category.id))?.id || ''
    : selects[0].value;
  if (changedDepth < 0 && selectedDepartment) selects[0].value = selectedDepartment;
  const mains = categoryChildren(selects[0].value);
  const selectedMain = changedDepth < 0
    ? mains.find((category) => selectedSet.has(category.id))?.id || ''
    : changedDepth === 0 ? '' : selects[1].value;
  populateCategorySelect(selects[1], mains, mains.length ? 'Əsas kateqoriyanı seçin' : 'Əsas kateqoriya yoxdur', selectedMain);
  const subs = categoryChildren(selects[1].value);
  const selectedSub = changedDepth < 0
    ? subs.find((category) => selectedSet.has(category.id))?.id || ''
    : changedDepth <= 1 ? '' : selects[2].value;
  populateCategorySelect(selects[2], subs, subs.length ? 'Alt kateqoriyanı seçin' : 'Alt kateqoriya yoxdur', selectedSub);
}

function attributeRow(name = '', value = '') {
  return `<div class="attribute-row"><input type="text" data-attribute-name maxlength="120" value="${esc(name)}" placeholder="Ölçü" aria-label="Atribut adı"><input type="text" data-attribute-value maxlength="500" value="${esc(value)}" placeholder="77cm" aria-label="Atribut dəyəri"><button type="button" class="attribute-remove" data-attribute-remove aria-label="Atributu sil">×</button></div>`;
}

function setProductAttributes(attributes = {}) {
  const list = $('[data-product-attributes]');
  if (!list) return;
  const entries = Object.entries(attributes).map(([name, value]) => [name, String(value ?? '')]);
  list.innerHTML = (entries.length ? entries : [['', '']]).map(([name, value]) => attributeRow(name, value)).join('');
}

function readProductAttributes() {
  const attributes = {};
  const names = new Set();
  for (const row of document.querySelectorAll('[data-product-attributes] .attribute-row')) {
    const name = row.querySelector('[data-attribute-name]').value.trim();
    const value = row.querySelector('[data-attribute-value]').value.trim();
    if (!name && !value) continue;
    if (!name || !value) throw new Error('Hər atribut sətrində həm atribut adı, həm də dəyər yazılmalıdır');
    const normalized = name.toLocaleLowerCase('az-AZ');
    if (names.has(normalized)) throw new Error(`“${name}” atributu təkrarlanıb`);
    names.add(normalized);
    attributes[name] = value;
  }
  return attributes;
}

function releaseProductImages() {
  productImages.forEach((item) => { if (item.objectUrl) URL.revokeObjectURL(item.objectUrl); });
  productImages = [];
  draggedProductImage = null;
}

function releaseProductVideo() {
  if (productVideo?.objectUrl) URL.revokeObjectURL(productVideo.objectUrl);
  productVideo = null;
}

function renderProductVideo() {
  const preview = $('[data-product-video-preview]');
  if (!preview) return;
  const externalUrl = String($('#createForm')?.elements.videoUrl?.value || '').trim();
  const source = productVideo?.objectUrl || productVideo?.publicUrl || externalUrl;
  if (!source) {
    preview.innerHTML = '<p class="product-image-empty">Video seçilməyib. Məhsul şəkillə göstəriləcək.</p>';
    return;
  }
  preview.innerHTML = `<article class="product-video-preview"><video src="${esc(source)}" controls muted playsinline preload="metadata"></video><div><strong>${esc(productVideo?.name || productVideo?.title || 'Xarici məhsul videosu')}</strong><small>${productVideo?.file ? 'Yeni yükləmə' : productVideo ? 'Məhsula bağlı video' : 'HTTPS video URL-i'}</small><button type="button" class="table-action danger" data-product-video-remove>Videonu sil</button></div></article>`;
}

function setProductVideo(asset = null) {
  releaseProductVideo();
  if (asset) productVideo = { id: asset.id, publicUrl: asset.public_url || asset.publicUrl, name: asset.metadata?.originalName || asset.title || 'Məhsul videosu', title: asset.title || '' };
  renderProductVideo();
}

function setProductVideoFile(file) {
  if (!(file instanceof File) || !file.size) return;
  if (!['video/mp4', 'video/webm'].includes(file.type) && !/\.(?:mp4|webm)$/i.test(file.name)) throw new Error('Yalnız MP4 və WEBM videosu qəbul edilir');
  if (file.size > 50 * 1024 * 1024) throw new Error('Video 50 MB-dan böyük ola bilməz');
  releaseProductVideo();
  const urlInput = $('#createForm')?.elements.videoUrl;
  if (urlInput) urlInput.value = '';
  productVideo = { file, objectUrl: URL.createObjectURL(file), name: file.name };
  renderProductVideo();
}

function renderProductImages() {
  const list = $('[data-product-image-list]');
  if (!list) return;
  if (!productImages.length) {
    list.innerHTML = '<p class="product-image-empty">Hələ şəkil seçilməyib.</p>';
    return;
  }
  list.innerHTML = productImages.map((item, index) => `<article class="product-image-item" draggable="true" data-product-image-index="${index}"><div class="product-image-preview"><img src="${esc(item.objectUrl || item.publicUrl)}" alt="${esc(item.name || `Məhsul şəkli ${index + 1}`)}">${index === 0 ? '<span>Əsas şəkil</span>' : ''}</div><div class="product-image-meta"><strong>${esc(item.name || item.title || `Şəkil ${index + 1}`)}</strong><small>${item.file ? 'Yeni yükləmə' : 'Məhsula bağlı şəkil'} · ${index + 1}-ci sıra</small></div><div class="product-image-actions"><button type="button" data-product-image-move="-1" ${index === 0 ? 'disabled' : ''} aria-label="Sola keçir">←</button><button type="button" data-product-image-move="1" ${index === productImages.length - 1 ? 'disabled' : ''} aria-label="Sağa keçir">→</button><button type="button" class="danger" data-product-image-remove aria-label="Şəkli sil">×</button></div></article>`).join('');
}

function initializeProductEditor(media = [], resetAttributes = true) {
  releaseProductImages();
  productImages = media.slice(0, 12).map((asset) => ({
    id: asset.id,
    publicUrl: asset.public_url || asset.publicUrl,
    name: asset.metadata?.originalName || asset.title || asset.alt_text || 'Məhsul şəkli',
    title: asset.title || ''
  }));
  if (resetAttributes) setProductAttributes();
  renderProductImages();
  setProductVideo();
}

function addProductImageFiles(fileList) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
  const allowedExtension = /\.(?:jpe?g|png|webp|avif)$/i;
  const maximumBytes = 10 * 1024 * 1024;
  const candidates = [...fileList];
  const files = candidates.filter((file) => (allowed.has(file.type) || !file.type && allowedExtension.test(file.name)) && file.size <= maximumBytes);
  if (files.some((file) => file.size > maximumBytes) || candidates.some((file) => file.size > maximumBytes)) toast('Hər məhsul şəkli ən çox 10 MB ola bilər', true);
  if (files.length !== candidates.length && !candidates.some((file) => file.size > maximumBytes)) toast('Yalnız JPG, PNG, WEBP və AVIF şəkilləri qəbul edilir', true);
  let limitReached = false;
  for (const file of files) {
    if (productImages.length >= 12) { limitReached = true; break; }
    const duplicate = productImages.some((item) => item.file && item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
    if (!duplicate) productImages.push({ file, objectUrl: URL.createObjectURL(file), name: file.name });
  }
  if (limitReached) toast('Məhsula ən çox 12 şəkil əlavə edilə bilər', true);
  renderProductImages();
}

function moveProductImage(from, to) {
  if (from < 0 || to < 0 || from >= productImages.length || to >= productImages.length || from === to) return;
  const [item] = productImages.splice(from, 1);
  productImages.splice(to, 0, item);
  renderProductImages();
}

async function uploadProductImages({ storeId, vendorId, altText }) {
  const status = $('[data-product-upload-status]');
  for (let index = 0; index < productImages.length; index += 1) {
    const item = productImages[index];
    if (item.id) continue;
    if (status) status.textContent = `${productImages.length} şəkildən ${index + 1}-cisi yüklənir…`;
    const upload = new FormData();
    upload.append('storeId', storeId);
    if (vendorId) upload.append('vendorId', vendorId);
    upload.append('altText', altText || item.name.replace(/\.[^.]+$/, ''));
    upload.append('title', item.name.replace(/\.[^.]+$/, ''));
    upload.append('file', item.file, item.file.name);
    const result = await api('/media', { method: 'POST', body: upload });
    item.id = result.data.id;
    item.publicUrl = result.data.public_url;
    item.uploadedThisSession = true;
  }
  if (status) status.textContent = productImages.length ? 'Şəkillər hazırdır.' : '';
  return productImages.map((item) => item.id);
}

async function uploadProductVideo({ storeId, vendorId, title }) {
  if (!productVideo) return null;
  if (productVideo.id) return productVideo.id;
  const status = $('[data-product-video-status]');
  if (status) status.textContent = 'Video yüklənir…';
  const upload = new FormData();
  upload.append('storeId', storeId);
  if (vendorId) upload.append('vendorId', vendorId);
  upload.append('title', title || productVideo.name.replace(/\.[^.]+$/, ''));
  upload.append('file', productVideo.file, productVideo.file.name);
  const result = await api('/media', { method: 'POST', body: upload });
  productVideo.id = result.data.id;
  productVideo.publicUrl = result.data.public_url;
  productVideo.uploadedThisSession = true;
  if (status) status.textContent = 'Video hazırdır.';
  return productVideo.id;
}

async function cleanupUnattachedProductImages() {
  const uploaded = productImages.filter((item) => item.uploadedThisSession && item.id);
  if (!uploaded.length) return;
  await Promise.allSettled(uploaded.map((item) => api(`/media/${item.id}`, { method: 'DELETE' })));
  uploaded.forEach((item) => {
    delete item.id;
    delete item.publicUrl;
    delete item.uploadedThisSession;
  });
  const status = $('[data-product-upload-status]');
  if (status) status.textContent = 'Məhsul saxlanılmadığı üçün yüklənən şəkillər geri qaytarıldı. Yenidən cəhd edə bilərsiniz.';
  if (productVideo?.uploadedThisSession && productVideo.id) {
    await api(`/media/${productVideo.id}`, { method: 'DELETE' }).catch(() => undefined);
    delete productVideo.id;
    delete productVideo.publicUrl;
    delete productVideo.uploadedThisSession;
  }
}

async function refreshProductSku() {
  const form = $('#createForm');
  if (form.dataset.view !== 'products' || form.dataset.recordId) return;
  const vendorId = String(form.elements.vendorId?.value || '');
  const sku = form.elements.sku;
  const submit = form.querySelector('button[type="submit"]');
  if (!vendorId || !sku) return;
  submit.disabled = true;
  sku.setAttribute('aria-busy', 'true');
  try {
    const result = await api(`/catalog/product-identifiers/preview?storeId=${encodeURIComponent(form.dataset.storeId)}&vendorId=${encodeURIComponent(vendorId)}`);
    sku.value = result.data.sku;
    $('#createError').textContent = '';
  } catch (error) {
    sku.value = '';
    $('#createError').textContent = error.message;
  } finally {
    sku.removeAttribute('aria-busy');
    submit.disabled = false;
  }
}

async function createInlineProductBrand(button) {
  const form = $('#createForm');
  const input = form.querySelector('[data-inline-brand-name]');
  const select = form.elements.brandId;
  const status = form.querySelector('[data-inline-brand-status]');
  const name = input.value.trim();
  if (name.length < 2) {
    input.focus();
    status.textContent = 'Brend adı ən azı 2 simvol olmalıdır.';
    return;
  }
  button.disabled = true;
  status.textContent = 'Brend yaradılır…';
  try {
    const result = await api('/catalog/brands', { method: 'POST', body: JSON.stringify({ storeId: form.dataset.storeId, name, description: '', websiteUrl: '' }) });
    const option = new Option(result.data.name, result.data.id, true, true);
    select.insertBefore(option, select.querySelector('option[value="__create__"]'));
    form.querySelector('[data-inline-brand]').hidden = true;
    input.value = '';
    status.textContent = '';
    toast('Brend yaradıldı və seçildi');
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function uploadJournalPdf(file, storeId, title) {
  if (!(file instanceof File) || !file.size) return null;
  if ((file.type && file.type !== 'application/pdf') || !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Jurnal üçün yalnız PDF faylı yükləmək olar');
  const upload = new FormData();
  upload.append('storeId', storeId);
  upload.append('title', title || file.name.replace(/\.pdf$/i, ''));
  upload.append('file', file, file.name);
  const result = await api('/media', { method: 'POST', body: upload });
  return result.data.id;
}

function showDialog(title, view, fields, storeId = '') {
  $('#dialogTitle').textContent = title;
  $('#formFields').innerHTML = fields;
  $('#createForm').dataset.view = view;
  $('#createForm').dataset.storeId = storeId;
  $('#createDialog').classList.toggle('product-dialog', view === 'products' || view === 'classifieds');
  delete $('#createForm').dataset.recordId;
  $('#createForm').querySelector('button[type="submit"]').hidden = false;
  $('#createError').textContent = '';
  $('#createDialog').showModal();
  if (view === 'products') initializeProductEditor();
}

function setDialogValues(values) {
  const form = $('#createForm');
  Object.entries(values).forEach(([name, value]) => {
    const controls = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
    if (!controls.length || value === null || value === undefined) return;
    if (Array.isArray(value)) controls.forEach((control) => { control.checked = value.includes(control.value); if (control.tagName === 'OPTION') control.selected = value.includes(control.value); });
    else if (controls[0].type === 'checkbox') controls[0].checked = Boolean(value);
    else controls[0].value = String(value);
  });
}

async function openProductEdit(id) {
  const { data } = await api(`/catalog/products/${id}`);
  const storeId = data.store_id || state.user.storeIds[0];
  const vendors = await vendorOptions(storeId);
  showDialog('Məhsulu redaktə et', 'products', productFields(vendors, await catalogOptions(storeId, false), data.sku), storeId);
  $('#createForm').dataset.recordId = id;
  setDialogValues({
    vendorId:data.vendor_id,brandId:data.brand_id||'',sku:data.sku,name:data.name,title:data.title,
    slug:data.slug,productType:data.product_type,price:data.price,compareAtPrice:data.compare_at_price||'',
    shortDescription:data.short_description,description:data.listing_description||data.description,
    seoTitle:data.seo_title||'',seoDescription:data.seo_description||'',
    videoUrl:data.video_url||'',
    isFeatured:data.is_featured,isPopular:data.is_popular,isTopPick:data.is_top_pick,displayPosition:data.display_position||0,merchandisingBadge:data.merchandising_badge||'none'
  });
  synchronizeProductCategoryPicker(-1, (data.categories || []).map((item) => item.id));
  setProductAttributes(data.attributes || {});
  initializeProductEditor(data.media || [], false);
  setProductVideo(data.video_asset_id ? { id:data.video_asset_id, public_url:data.video_asset_url, title:'Məhsul videosu' } : null);
}

async function openCategoryEdit(id) {
  const storeId=state.user.storeIds[0]; const {data}=await api(`/catalog/categories?storeId=${encodeURIComponent(storeId)}`); const row=data.find((item)=>item.id===id); if(!row)throw new Error('Kateqoriya tapılmadı');
  await openCreate('categories'); $('#dialogTitle').textContent='Kateqoriyanı redaktə et'; $('#createForm').dataset.recordId=id;
  const unavailableParents = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const category of data) if (unavailableParents.has(category.parent_id) && !unavailableParents.has(category.id)) { unavailableParents.add(category.id); changed = true; }
  }
  $('#createForm').querySelectorAll('select[name="parentId"] option').forEach((option) => {
    if (unavailableParents.has(option.value)) option.remove();
  });
  setDialogValues({parentId:row.parent_id||'',name:row.name,slug:row.slug,position:row.position,description:row.description,seoTitle:row.seo_title||'',seoDescription:row.seo_description||'',imageAssetId:row.image_asset_id||'',status:row.status});
}

async function openServiceCategoryEdit(id) {
  const storeId=state.user.storeIds[0];
  const {data}=await api(`/publishing/service-categories?storeId=${encodeURIComponent(storeId)}`);
  const row=data.find((item)=>item.id===id);
  if(!row)throw new Error('Xidmət kateqoriyası tapılmadı');
  await openCreate('service-categories');
  $('#dialogTitle').textContent='Xidmət kateqoriyasını redaktə et';
  $('#createForm').dataset.recordId=id;
  const unavailableParents=new Set([id]);
  for(let changed=true;changed;){
    changed=false;
    for(const category of data)if(unavailableParents.has(category.parent_id)&&!unavailableParents.has(category.id)){unavailableParents.add(category.id);changed=true;}
  }
  $('#createForm').querySelectorAll('select[name="parentId"] option').forEach((option)=>{if(unavailableParents.has(option.value))option.remove();});
  setDialogValues({parentId:row.parent_id||'',name:row.name,slug:row.slug,position:row.position,description:row.description||'',seoTitle:row.seo_title||'',seoDescription:row.seo_description||'',imageAssetId:row.image_asset_id||'',status:row.status});
}
async function openBrandEdit(id) {
  const storeId=state.user.storeIds[0]; const {data}=await api(`/catalog/brands?storeId=${encodeURIComponent(storeId)}`); const row=data.find((item)=>item.id===id); if(!row)throw new Error('Brend tapılmadı');
  await openCreate('brands'); $('#dialogTitle').textContent='Brendi redaktə et'; $('#createForm').dataset.recordId=id;
  setDialogValues({name:row.name,slug:row.slug,websiteUrl:row.website_url||'',description:row.description,seoTitle:row.seo_title||'',seoDescription:row.seo_description||'',logoAssetId:row.logo_asset_id||'',status:row.status});
}

async function openRewardEdit(id) {
  const {data}=await api('/loyalty/rewards?limit=100'); const row=data.find((item)=>item.id===id); if(!row)throw new Error('Hədiyyə tapılmadı');
  await openCreate('rewards'); $('#dialogTitle').textContent='Hədiyyəni redaktə et'; $('#createForm').dataset.recordId=id;
  const local=(value)=>value?new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  setDialogValues({name:row.name,vendorId:row.vendor_id||'',pointsCost:row.points_cost,stock:row.stock??'',imageAssetId:row.image_asset_id||'',startsAt:local(row.starts_at),expiresAt:local(row.expires_at),description:row.description});
}

async function openContentEdit(type,id) {
  const {data}=await api(`/content/${type}/${id}`); await openCreate(type); $('#dialogTitle').textContent=type==='posts'?'Məqaləni redaktə et':'Səhifəni redaktə et'; $('#createForm').dataset.recordId=id;
  const body=(data.content||[]).map((block)=>block?.data?.html||block?.data?.text||'').filter(Boolean).join('\n\n');
  const local=(value)=>value?new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  setDialogValues({title:data.title,slug:data.slug,excerpt:data.excerpt,body,seoTitle:data.seo_title||'',seoDescription:data.seo_description||'',canonicalUrl:data.canonical_url||'',robotsDirective:data.robots_directive||'index,follow',scheduledAt:local(data.scheduled_at),categoryId:data.category_id||'',featuredAssetId:data.featured_asset_id||'',postType:data.post_type||'article',isSponsored:data.is_sponsored,sponsorVendorId:data.sponsor_vendor_id||''});
}

async function openJournalEdit(id) {
  const {data}=await api(`/publishing/journal/${id}`);await openCreate('journal');$('#dialogTitle').textContent='Jurnal buraxılışını redaktə et';$('#createForm').dataset.recordId=id;
  setDialogValues({issueNumber:data.issue_number,title:data.title,slug:data.slug,description:data.description,coverAssetId:data.cover_asset_id||'',pdfAssetId:data.pdf_asset_id||''});
  const pdfInput=$('#createForm').elements.pdfUpload;pdfInput.required=false;
  $('[data-current-journal-pdf]').textContent=data.pdf_asset_id?'Cari PDF saxlanılacaq; dəyişmək üçün yeni fayl seçin.':'PDF əlavə etmək üçün fayl seçin.';
}

async function openClassifiedEdit(id) {
  const {data}=await api(`/publishing/classifieds/${id}`);await openCreate('classifieds');$('#dialogTitle').textContent='Elanı redaktə et';$('#createForm').dataset.recordId=id;
  const local=(value)=>value?new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  setDialogValues({vendorId:data.vendor_id||'',category:data.category,serviceCategoryId:data.service_category_id||'',title:data.title,slug:data.slug,description:data.description,price:data.price??'',phone:data.contact_data?.phone||'',email:data.contact_data?.email||'',city:data.location_data?.city||'',address:data.location_data?.address||'',expiresAt:local(data.expires_at)});
  synchronizeClassifiedCategory();
  initializeProductEditor(data.media||[],false);
}

async function openPostCategoryEdit(id) {
  const {data}=await api(`/content/post-categories?storeId=${encodeURIComponent(state.user.storeIds[0])}`);const row=data.find((item)=>item.id===id);if(!row)throw new Error('Məqalə kateqoriyası tapılmadı');await openCreate('post-categories');$('#dialogTitle').textContent='Məqalə kateqoriyasını redaktə et';$('#createForm').dataset.recordId=id;
  setDialogValues({name:row.name,slug:row.slug,description:row.description,seoTitle:row.seo_title||'',seoDescription:row.seo_description||''});
}

async function openVendorEdit(id) {
  const {data}=await api('/vendors?limit=100');const row=data.find((item)=>item.id===id);if(!row)throw new Error('Satıcı tapılmadı');showDialog('Satıcı məlumatları','vendors',vendorFields(true,row),row.store_id||state.user.storeIds[0]);$('#createForm').dataset.recordId=id;
  setDialogValues({displayName:row.display_name,legalName:row.legal_name,taxId:row.tax_id||'',email:row.email,phone:row.phone||'',commissionRate:row.commission_rate,description:row.description});
}

async function openUserEdit(id, view = 'users') {
  const [{data},vendors]=await Promise.all([api(`/users/${id}`),vendorOptions()]);
  const storeId=data.store_ids?.[0]||state.user.storeIds[0];
  const sellerOnly = view === 'seller-users';
  const demographics = !sellerOnly && data.roles?.includes('customer')
    ? `<fieldset class="wide choice-field customer-demographics"><legend>Müştəri məlumatları</legend><div class="detail-grid"><div><span>Yaş</span><strong>${data.age == null ? 'Məlumat yoxdur' : `${Number(data.age)} yaş`}</strong></div><div><span>Cinsiyyət</span><strong>${esc(genderLabels[data.gender] || 'Məlumat yoxdur')}</strong></div><div><span>Ailə vəziyyəti</span><strong>${esc(maritalStatusLabels[data.marital_status] || 'Məlumat yoxdur')}</strong></div></div></fieldset>`
    : '';
  showDialog(sellerOnly ? 'Satıcı hesabını redaktə et' : 'İstifadəçini redaktə et',view,userFields(vendors,true,sellerOnly) + demographics,storeId);
  $('#createForm').dataset.recordId=id;
  setDialogValues({firstName:data.first_name,lastName:data.last_name,email:data.email,phone:data.phone||'',status:data.status,roleCode:data.roles?.[0]||'customer',vendorId:data.vendor_ids?.[0]||''});
  const role=$('#createForm').elements.roleCode;
  if(data.roles?.includes('super_admin'))role.value='super_admin';
  synchronizeUserVendorField();
}

async function openOrderDetail(id) {
  const {data}=await api(`/orders/${id}`); const address=data.shipping_address||{};
  const items=(data.items||[]).map((item)=>`<tr><td>${esc(item.product_name)}</td><td>${esc(item.sku)}</td><td>${Number(item.quantity)}</td><td>${money(item.line_total,data.currency)}</td></tr>`).join('');
  const history=(data.history||[]).map((item)=>`<li><strong>${esc(statusLabels[item.to_status]||item.to_status)}</strong><span>${date(item.created_at)}${item.note?` · ${esc(item.note)}`:''}</span></li>`).join('');
  showDialog(`Sifariş №${data.order_number}`,'readonly',`<section class="wide detail-grid"><div><span>Müştəri</span><strong>${esc(data.customer_name)}</strong><small>${esc(data.customer_email)} · ${esc(data.customer_phone)}</small></div><div><span>Çatdırılma</span><strong>${esc(address.city||'')} ${esc(address.addressLine1||'')}</strong><small>${esc(address.recipientName||'')}</small></div><div><span>Ödəniş</span><strong>${esc(data.payment_method||'—')}</strong><small>${money(data.grand_total,data.currency)} · ${esc(data.payment_status)}</small></div></section><div class="wide table-wrap"><table><thead><tr><th>Məhsul</th><th>SKU</th><th>Say</th><th>Cəmi</th></tr></thead><tbody>${items}</tbody></table></div><section class="wide"><h3>Status tarixçəsi</h3><ul class="timeline">${history}</ul></section>`);
  $('#createForm').querySelector('button[type="submit"]').hidden=true;
}

async function mediaView() {
  const [{data}, vendors] = await Promise.all([api('/media'), vendorOptions().catch(()=>[])]);
  const upload = can('media.manage') ? `<section class="panel"><div class="panel-header"><h2>Yeni fayl yüklə</h2></div><div class="panel-body"><form class="media-upload" data-media-upload><input type="hidden" name="storeId" value="${esc(state.user.storeIds[0])}"><div class="form-grid">${state.user.vendorIds.length||vendors.length?field('vendorId','Satıcı','select',state.user.vendorIds.length>0,[['','Platforma'],...vendors]):''}${field('file','Fayl','file',true,[],'accept="image/jpeg,image/png,image/webp,image/avif,application/pdf,video/mp4,video/webm"')}${field('altText','Alternativ mətn')}${field('title','Başlıq','text',false)}</div><div class="dialog-actions"><button class="primary" type="submit">Yüklə</button></div><p class="form-error" data-media-error></p></form></div></section>`:'';
  const cards=data.length?data.map((item)=>`<article class="media-card">${item.mime_type.startsWith('image/')?`<img src="${esc(item.public_url)}" alt="${esc(item.alt_text)}">`:`<div class="file-tile">${esc(item.mime_type.split('/')[1].toUpperCase())}</div>`}<div><strong>${esc(item.title||item.metadata?.originalName||'Fayl')}</strong><small>${esc(item.alt_text||'Alt mətn yoxdur')}</small><span>${Math.ceil(Number(item.byte_size)/1024)} KB</span></div>${can('media.manage')?`<footer><button data-media-edit="${esc(item.id)}" data-title="${esc(item.title)}" data-alt="${esc(item.alt_text)}">Redaktə et</button><button class="danger" data-media-delete="${esc(item.id)}">Sil</button></footer>`:''}</article>`).join(''):'<p class="empty">Media faylı yoxdur.</p>';
  return `${upload}<section class="media-grid">${cards}</section>`;
}

async function seoView() {
  const clusters=await listing('seo');
  if(!can('seo.audit'))return clusters;
  const {data}=await api(`/content/seo/audit?storeId=${encodeURIComponent(state.user.storeIds[0])}`);
  const audit=data.length?data.map((item)=>`<article class="seo-issue"><div><strong>${esc(item.title)}</strong><small>/${esc(item.slug)} · ${esc(item.source==='post'?'Məqalə':'Səhifə')}</small></div><ul>${item.issues.map((issue)=>`<li>${esc(issue)}</li>`).join('')}</ul></article>`).join(''):'<p class="seo-clean">✓ Kontent üzrə texniki SEO problemi tapılmadı.</p>';
  return `<section class="panel seo-audit"><div class="panel-header"><div><h2>SEO sağlamlıq yoxlaması</h2><p class="muted">Başlıq, meta təsvir və kontent tamlığı</p></div><strong>${data.length} problemli qeyd</strong></div><div class="panel-body seo-issues">${audit}</div></section>${clusters}`;
}

async function refreshNotificationCount() {
  try{const result=await api('/notifications');const count=Number(result.meta?.unread||0);$('#notificationCount').textContent=String(count);$('#notificationCount').hidden=count===0;}catch{/* Bildiriş sayı əsas idarəetməni bloklamır. */}
}

async function openNotifications() {
  const result=await api('/notifications');
  const rows=result.data.length?result.data.map((item)=>`<article class="admin-notification${item.readAt?'':' unread'}"><div><strong>${esc(item.title)}</strong><p>${esc(item.message)}</p><time>${date(item.createdAt)}</time></div><button type="button" data-admin-notification="${esc(item.id)}" data-url="${esc(item.actionUrl||'')}">${item.actionUrl?'Aç':'Oxunmuş et'}</button></article>`).join(''):'<p class="empty">Yeni bildiriş yoxdur.</p>';
  showDialog('Bildirişlər','readonly',`<div class="wide notification-toolbar"><span>${Number(result.meta?.unread||0)} oxunmamış</span><button type="button" class="secondary" data-notifications-admin-read-all>Hamısını oxunmuş et</button></div><section class="wide admin-notifications">${rows}</section>`);
  $('#createForm').querySelector('button[type="submit"]').hidden=true;$('#notificationButton').setAttribute('aria-expanded','true');
}

async function openCreate(view) {
  const storeId = state.user.storeIds[0];
  if (!storeId) throw new Error('Mağaza səlahiyyəti tapılmadı');
  const needsVendors = ['products', 'users', 'posts', 'campaigns', 'coupons', 'qr', 'media', 'rewards', 'classifieds'].includes(view);
  const vendors = needsVendors ? await vendorOptions() : [];
  let fields = '';
  if (view === 'vendors') {
    fields = vendorFields();
  } else if (view === 'products') {
    if (!vendors.length) throw new Error('Məhsul üçün aktiv satıcı hesabı tapılmadı');
    const [options, identifier] = await Promise.all([
      catalogOptions(storeId, false),
      api(`/catalog/product-identifiers/preview?storeId=${encodeURIComponent(storeId)}&vendorId=${encodeURIComponent(vendors[0][0])}`)
    ]);
    fields = productFields(vendors, options, identifier.data.sku);
  } else if (view === 'categories') {
    const options = await catalogOptions(storeId);
    const images=options.media.filter((item)=>item.mime_type?.startsWith('image/')).map((item)=>[item.id,item.title||item.alt_text||item.metadata?.originalName||item.id]);
    fields = field('parentId', 'Üst kateqoriya', 'select', false, [['', 'Departament (üst səviyyə)'], ...options.categories.filter((category) => Number(category.depth) < 2 && category.status === 'active').map((category) => [category.id, `${'— '.repeat(Number(category.depth) + 1)}${category.name}`])]) + '<p class="wide category-level-help">Üst kateqoriya seçilməzsə departament, departament seçilərsə əsas kateqoriya, əsas kateqoriya seçilərsə alt kateqoriya yaradılır.</p>' + field('name', 'Kateqoriya adı') + field('slug', 'Slug', 'text', false) + field('imageAssetId','Kateqoriya şəkli','select',false,[['','Şəkilsiz'],...images]) + field('status','Status','select',true,[['active','Aktiv'],['inactive','Qeyri-aktiv'],['archived','Arxivdə']]) + field('position', 'Sıra', 'number', true, [], 'min="0" step="1" value="0"') + field('description', 'Təsvir', 'textarea', false) + field('seoTitle', 'SEO başlığı', 'text', false) + field('seoDescription', 'Meta təsvir', 'textarea', false);
  } else if (view === 'service-categories') {
    const [taxonomy,media]=await Promise.all([
      api(`/publishing/service-categories?storeId=${encodeURIComponent(storeId)}`),
      can('media.read')?api('/media'):Promise.resolve({data:[]})
    ]);
    const images=(media.data||[]).filter((item)=>item.mime_type?.startsWith('image/')).map((item)=>[item.id,item.title||item.alt_text||item.metadata?.originalName||item.id]);
    fields=field('parentId','Üst kateqoriya','select',false,[['','Departament (üst səviyyə)'],...serviceCategoryOptions((taxonomy.data||[]).filter((row)=>Number(row.depth)<2))])
      +'<p class="wide category-level-help">Üst kateqoriya seçilməzsə departament, departament seçilərsə ana kateqoriya, ana kateqoriya seçilərsə alt kateqoriya yaradılır.</p>'
      +field('name','Kateqoriya adı')+field('slug','Slug','text',false)+field('imageAssetId','Kateqoriya şəkli','select',false,[['','Şəkilsiz'],...images])
      +field('status','Status','select',true,[['active','Aktiv'],['inactive','Qeyri-aktiv'],['archived','Arxivdə']])
      +field('position','Sıra','number',true,[],'min="0" step="1" value="0"')+field('description','Təsvir','textarea',false)
      +field('seoTitle','SEO başlığı','text',false)+field('seoDescription','Meta təsvir','textarea',false);
  } else if (view === 'brands') {
    const options=await catalogOptions(storeId);const images=options.media.filter((item)=>item.mime_type?.startsWith('image/')).map((item)=>[item.id,item.title||item.alt_text||item.metadata?.originalName||item.id]);
    fields = field('name', 'Brend adı') + field('slug', 'Slug', 'text', false) + field('logoAssetId','Brend loqosu','select',false,[['','Loqosuz'],...images]) + field('status','Status','select',true,[['active','Aktiv'],['inactive','Qeyri-aktiv'],['archived','Arxivdə']]) + field('websiteUrl', 'Rəsmi sayt', 'url', false) + field('description', 'Təsvir', 'textarea', false) + field('seoTitle', 'SEO başlığı', 'text', false) + field('seoDescription', 'Meta təsvir', 'textarea', false);
  } else if (view === 'users' || view === 'seller-users') {
    fields = userFields(vendors, false, view === 'seller-users');
  } else if (view === 'pages' || view === 'posts') {
    const common=field('title', 'Başlıq') + field('slug', 'Slug', 'text', false) + field('excerpt', 'Xülasə', 'textarea') + field('body', 'Əsas mətn', 'textarea') + field('seoTitle', 'SEO başlığı') + field('seoDescription', 'Meta təsvir') + field('canonicalUrl','Canonical URL','url',false) + field('robotsDirective','Robot təlimatı','select',true,[['index,follow','index,follow'],['noindex,follow','noindex,follow'],['noindex,nofollow','noindex,nofollow']]) + field('scheduledAt','Planlı dərc','datetime-local',false);
    if(view==='pages')fields=common;
    else{const [categories,media]=await Promise.all([api(`/content/post-categories?storeId=${encodeURIComponent(storeId)}`),can('media.read')?api('/media'):Promise.resolve({data:[]})]);const images=media.data.filter((item)=>item.mime_type?.startsWith('image/')).map((item)=>[item.id,item.title||item.alt_text||item.metadata?.originalName||item.id]);fields=field('postType','Məqalə növü','select',true,[['article','Məqalə'],['brand_story','Brend hekayəsi'],['guide','Bələdçi'],['news','Yenilik'],['sponsored','Sponsorlu']])+field('categoryId','Məqalə kateqoriyası','select',false,[['','Kateqoriyasız'],...categories.data.map((item)=>[item.id,item.name])])+field('featuredAssetId','Ön şəkil','select',false,[['','Şəkilsiz'],...images])+field('sponsorVendorId','Sponsor satıcı','select',false,[['','Sponsorsuz'],...vendors])+`<label class="checkbox-field"><input type="checkbox" name="isSponsored"> Sponsorlu məzmun</label>`+common;}
  } else if (view === 'journal') {
    const media=can('media.read')?(await api('/media')).data:[];const images=media.filter((item)=>item.mime_type?.startsWith('image/')).map((item)=>[item.id,item.title||item.alt_text||item.metadata?.originalName||item.id]);
    fields=field('issueNumber','Buraxılış nömrəsi')+field('title','Başlıq')+field('slug','Slug','text',false)+field('coverAssetId','Örtük şəkli','select',false,[['','Şəkilsiz'],...images])+`<input type="hidden" name="pdfAssetId"><label class="wide journal-pdf-upload">Jurnal PDF-i<input type="file" name="pdfUpload" accept="application/pdf,.pdf" required><small data-current-journal-pdf>PDF faylını cihazdan seçin.</small></label>`+field('description','Təsvir','textarea',false);
  } else if (view === 'classifieds') {
    const {data:serviceCategories}=await api(`/publishing/service-categories?storeId=${encodeURIComponent(storeId)}`);
    const serviceOptions=serviceCategoryOptions(serviceCategories,{leafOnly:true});
    const vendorField=isVendorPortal?'':field('vendorId','Satıcı','select',false,[['','Fərdi elan'],...vendors]);
    fields=vendorField
      +field('category','Elan növü','select',true,[['service','Xidmət'],['product','Məhsul'],['property','Əmlak'],['vehicle','Nəqliyyat'],['other','Digər']])
      +`<label data-service-category-field>Xidmət kateqoriyası<select name="serviceCategoryId" required><option value="">Kateqoriya yolunu seçin</option>${serviceOptions.map(([value,text])=>`<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select><small class="field-hint">${serviceOptions.length?'Ən uyğun alt kateqoriyanı seçin.':'Aktiv xidmət alt kateqoriyası yoxdur.'}</small></label>`
      +field('title','Başlıq')+field('slug','Slug','text',false)+field('price','Qiymət','number',false,[],'min="0" step="0.01"')
      +field('phone','Telefon','tel',false,[],'inputmode="tel" placeholder="+994 12 345 67 89"')+field('email','E-poçt','email',false)
      +field('city','Şəhər','text',false)+field('address','Ünvan','text',false)+field('expiresAt','Bitmə tarixi','datetime-local',false)
      +field('description','Təsvir','textarea')+'<p class="wide category-level-help">Elanın dərcə göndərilməsi üçün telefon və ya e-poçtdan ən azı biri daxil edilməlidir.</p>'+classifiedImageFields();
  } else if (view === 'post-categories') {
    fields=field('name','Kateqoriya adı')+field('slug','Slug','text',false)+field('description','Təsvir','textarea',false)+field('seoTitle','SEO başlığı','text',false)+field('seoDescription','Meta təsvir','textarea',false);
  } else if (view === 'seo') {
    fields = field('name', 'Klaster adı') + field('primaryKeyword', 'Əsas açar söz') + field('searchIntent', 'Axtarış niyyəti', 'select', true, [['informational', 'Məlumat'], ['commercial', 'Kommersiya'], ['transactional', 'Tranzaksiya'], ['local', 'Lokal']]) + field('targetAudience', 'Hədəf auditoriya', 'textarea', false);
  } else if (view === 'campaigns') {
    fields = field('name', 'Kampaniya adı') + field('slug', 'Slug') + field('campaignType', 'Növ', 'select', true, [['daily_deal', 'Günün təklifi'], ['weekly', 'Həftəlik'], ['limited', 'Məhdud'], ['seasonal', 'Mövsümi'], ['giveaway', 'Çəkiliş'], ['sponsored', 'Sponsorlu'], ['qr', 'QR'], ['other', 'Digər']]) + field('vendorId', 'Satıcı', 'select', state.user.vendorIds.length > 0, [['', 'Platforma'], ...vendors]) + field('startsAt', 'Başlama', 'datetime-local') + field('endsAt', 'Bitmə', 'datetime-local') + field('description', 'Təsvir', 'textarea', false);
  } else if (view === 'coupons') {
    fields = field('name', 'Kupon adı') + field('codePrefix', 'Kod prefiksi') + field('discountType', 'Növ', 'select', true, [['percentage', 'Faiz'], ['fixed_amount', 'Sabit məbləğ'], ['free_shipping', 'Pulsuz çatdırılma']]) + field('discountValue', 'Dəyər', 'number', true, [], 'min="0" step="0.01"') + field('vendorId', 'Satıcı', 'select', state.user.vendorIds.length > 0, [['', 'Platforma'], ...vendors]) + field('startsAt', 'Başlama', 'datetime-local') + field('expiresAt', 'Bitmə', 'datetime-local');
  } else if (view === 'qr') {
    fields = field('name', 'QR adı') + field('qrType', 'Növ', 'select', true, [['smart', 'Smart'], ['social', 'Sosial'], ['lead', 'Lead'], ['store', 'Mağaza']]) + field('vendorId', 'Satıcı', 'select', state.user.vendorIds.length > 0, [['', 'Platforma'], ...vendors]) + field('targetUrl', 'Hədəf URL', 'url');
  } else if (view === 'rewards') {
    const media=(await api('/media')).data.filter((item)=>item.mime_type?.startsWith('image/'));
    fields=field('name','Hədiyyə adı')+field('vendorId','Satıcı','select',state.user.vendorIds.length>0,[['','Platforma'],...vendors])+field('pointsCost','Xal dəyəri','number',true,[],'min="1" step="1"')+field('stock','Stok (boş = limitsiz)','number',false,[],'min="0" step="1"')+field('imageAssetId','Şəkil','select',false,[['','Şəkilsiz'],...media.map((item)=>[item.id,item.title||item.alt_text||item.metadata?.originalName||item.id])])+field('startsAt','Başlama','datetime-local',false)+field('expiresAt','Bitmə','datetime-local',false)+field('description','Təsvir','textarea',false);
  } else {
    throw new Error('Bu bölmədə yaradılma əməliyyatı ayrıca aparılır');
  }
  showDialog(`${labels[view][0]} — yeni qeyd`, view, fields, storeId);
  if(view==='users'||view==='seller-users')synchronizeUserVendorField();
  if(view==='classifieds'){
    initializeProductEditor([],false);
    synchronizeClassifiedCategory();
  }
}

function openInventoryAdjust(button) {
  const fields = `<input type="hidden" name="variantId" value="${esc(button.dataset.variant)}"><input type="hidden" name="warehouseId" value="${esc(button.dataset.warehouse)}">${field('quantityDelta', 'Miqdar dəyişikliyi', 'number', true, [], 'step="1" placeholder="Məsələn: 5 və ya -2"')}${field('note', 'Qeyd', 'textarea', true, [], 'maxlength="500"')}`;
  showDialog(`${button.dataset.product} — stok düzəlişi`, 'inventory-adjust', fields);
}

$('#createForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const view = form.dataset.view;
  const formData = new FormData(form);
  const body = Object.fromEntries([...formData].filter(([, value]) => value !== ''));
  if (form.dataset.storeId) body.storeId = form.dataset.storeId;
  let path = '';
  let method = form.dataset.recordId ? 'PATCH' : 'POST';
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  $('#createError').textContent = '';
  try {
    if (view === 'vendors') {
      path = form.dataset.recordId?`/vendors/${form.dataset.recordId}`:'/vendors'; body.commissionRate = Number(body.commissionRate || 0);if(form.dataset.recordId)delete body.storeId;
    } else if (view === 'products') {
      path = form.dataset.recordId ? `/catalog/products/${form.dataset.recordId}` : '/catalog/products';
      const brandId = String(formData.get('brandId') || '');
      if (brandId === '__create__') throw new Error('Əvvəlcə yeni brendi yaradın və seçin');
      const vendorId = String(formData.get('vendorId') || '');
      if (!vendorId) throw new Error('Satıcı seçilməlidir');
      const attributes = readProductAttributes();
      const mediaIds = await uploadProductImages({ storeId: form.dataset.storeId, vendorId, altText: String(body.title || body.name || '') });
      const videoAssetId = await uploadProductVideo({ storeId: form.dataset.storeId, vendorId, title: String(body.title || body.name || '') });
      Object.assign(body, { price: Number(body.price), currency: 'AZN', brandId:brandId||null, compareAtPrice:String(formData.get('compareAtPrice')||'')?Number(formData.get('compareAtPrice')):null, categoryIds: formData.getAll('categoryIds').map(String).filter(Boolean), mediaIds, videoAssetId, videoUrl:String(formData.get('videoUrl')||'').trim()||null, attributes, isFeatured:formData.has('isFeatured'),isPopular:formData.has('isPopular'),isTopPick:formData.has('isTopPick'),displayPosition:Number(body.displayPosition||0) });
      body.initialStock=Number(body.initialStock||0);
      if(form.dataset.recordId){delete body.storeId;delete body.vendorId;delete body.initialStock;delete body.warehouseId;}
    } else if (view === 'categories') {
      path=form.dataset.recordId?`/catalog/categories/${form.dataset.recordId}`:'/catalog/categories'; body.position=Number(body.position||0);body.parentId=String(formData.get('parentId')||'')||null;body.imageAssetId=String(formData.get('imageAssetId')||'')||null;
      if(form.dataset.recordId)delete body.storeId;
    } else if (view === 'service-categories') {
      path=form.dataset.recordId?`/publishing/service-categories/${form.dataset.recordId}`:'/publishing/service-categories';
      body.position=Number(body.position||0);
      body.parentId=String(formData.get('parentId')||'')||null;
      body.imageAssetId=String(formData.get('imageAssetId')||'')||null;
      if(form.dataset.recordId)delete body.storeId;
    } else if (view === 'brands') {
      path=form.dataset.recordId?`/catalog/brands/${form.dataset.recordId}`:'/catalog/brands';body.logoAssetId=String(formData.get('logoAssetId')||'')||null;body.websiteUrl=String(formData.get('websiteUrl')||'');if(!form.dataset.recordId)delete body.status;if(form.dataset.recordId)delete body.storeId;
    } else if (view === 'users' || view === 'seller-users') {
      path = form.dataset.recordId?`/users/${form.dataset.recordId}`:'/users';
      body.phone=String(formData.get('phone')||'')||null;
      body.vendorId=String(formData.get('vendorId')||'')||null;
      if(!form.dataset.recordId){if(!body.phone)delete body.phone;if(!body.vendorId)delete body.vendorId;}
      else {
        if(!body.newPassword)delete body.newPassword;
        if(form.elements.roleCode?.disabled){delete body.roleCode;delete body.vendorId;}
      }
    } else if (view === 'pages' || view === 'posts') {
      path = form.dataset.recordId?`/content/${view}/${form.dataset.recordId}`:`/content/${view}`; body.content = [{ type: 'paragraph', data: { html: body.body } }]; delete body.body;body.canonicalUrl=String(formData.get('canonicalUrl')||'')||null;body.scheduledAt=body.scheduledAt?new Date(body.scheduledAt).toISOString():null;
      if(view==='posts'){body.categoryId=String(formData.get('categoryId')||'')||null;body.featuredAssetId=String(formData.get('featuredAssetId')||'')||null;body.sponsorVendorId=String(formData.get('sponsorVendorId')||'')||null;body.isSponsored=formData.has('isSponsored');}
      if(form.dataset.recordId)delete body.storeId;
    } else if (view === 'journal') {
      path=form.dataset.recordId?`/publishing/journal/${form.dataset.recordId}`:'/publishing/journal';body.coverAssetId=String(formData.get('coverAssetId')||'')||null;
      const uploadedPdf=await uploadJournalPdf(formData.get('pdfUpload'),form.dataset.storeId,String(body.title||''));body.pdfAssetId=uploadedPdf||String(formData.get('pdfAssetId')||'')||null;delete body.pdfUpload;if(form.dataset.recordId)delete body.storeId;
    } else if (view === 'classifieds') {
      path=form.dataset.recordId?`/publishing/classifieds/${form.dataset.recordId}`:'/publishing/classifieds';
      const vendorId=String(formData.get('vendorId')||state.user.vendorIds[0]||'')||null;
      const phone=String(formData.get('phone')||'').trim();
      const email=String(formData.get('email')||'').trim();
      if(!phone&&!email)throw new Error('Telefon və ya e-poçtdan ən azı biri daxil edilməlidir');
      body.vendorId=vendorId;
      body.serviceCategoryId=body.category==='service'?(String(formData.get('serviceCategoryId')||'')||null):null;
      if(body.category==='service'&&!body.serviceCategoryId)throw new Error('Xidmət kateqoriyası seçilməlidir');
      body.price=String(formData.get('price')||'')?Number(formData.get('price')):null;
      body.currency='AZN';
      body.expiresAt=body.expiresAt?new Date(body.expiresAt).toISOString():null;
      body.mediaIds=await uploadProductImages({storeId:form.dataset.storeId,vendorId,altText:String(body.title||'')});
      if(form.dataset.recordId)delete body.storeId;
    } else if (view === 'post-categories') {
      path=form.dataset.recordId?`/content/post-categories/${form.dataset.recordId}`:'/content/post-categories';if(form.dataset.recordId)delete body.storeId;
    } else if (view === 'seo') {
      path = '/content/seo/clusters';
    } else if (view === 'campaigns') {
      path = '/marketing/campaigns'; Object.assign(body, { startsAt: new Date(body.startsAt).toISOString(), endsAt: new Date(body.endsAt).toISOString(), goals: {}, targeting: {} });
    } else if (view === 'coupons') {
      path = '/marketing/coupons'; Object.assign(body, { discountValue: Number(body.discountValue), minimumOrder: 0, perUserLimit: 1, startsAt: new Date(body.startsAt).toISOString(), expiresAt: new Date(body.expiresAt).toISOString(), rules: {} });
    } else if (view === 'qr') {
      path = '/marketing/qr'; Object.assign(body, { perUserLimit: 1, rules: {} });
    } else if (view === 'rewards') {
      path=form.dataset.recordId?`/loyalty/rewards/${form.dataset.recordId}`:'/loyalty/rewards'; body.pointsCost=Number(body.pointsCost); body.stock=body.stock?Number(body.stock):null; if(body.startsAt)body.startsAt=new Date(body.startsAt).toISOString(); if(body.expiresAt)body.expiresAt=new Date(body.expiresAt).toISOString(); if(form.dataset.recordId)delete body.storeId;
    } else if (view === 'inventory-adjust') {
      path = '/catalog/inventory/adjust'; body.quantityDelta = Number(body.quantityDelta);
    } else {
      throw new Error('Əməliyyat tanınmadı');
    }
    const result = await api(path, { method, body: JSON.stringify(body) });
    $('#createDialog').close();
    toast(view==='vendors'&&!form.dataset.recordId&&result?.data?.portalUrl?'Satıcı və satıcı kabineti hesabı yaradıldı':'Əməliyyat uğurla tamamlandı');
    await render();
    await refreshNotificationCount();
  } catch (error) {
    if (view === 'products' || view === 'classifieds') await cleanupUnattachedProductImages();
    if (view === 'products' && error.code === 'DUPLICATE') await refreshProductSku();
    $('#createError').textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

$('#closeDialog').addEventListener('click', () => $('#createDialog').close());
$('#cancelDialog').addEventListener('click', () => $('#createDialog').close());

async function render() {
  const preferredView = isVendorPortal || isModeratorOnly() ? 'products' : 'dashboard';
  state.view = location.hash.slice(1) || preferredView;
  const accessibleViews = new Set(menus.flatMap(([, items]) => items.filter(menuItemIsVisible).map((item) => item[0])));
  if (!labels[state.view] || !accessibleViews.has(state.view)) state.view = accessibleViews.has(preferredView) ? preferredView : [...accessibleViews][0];
  renderNav();
  const [title, eyebrow] = labels[state.view];
  $('#pageTitle').textContent = title;
  $('#pageEyebrow').textContent = eyebrow.toUpperCase();
  $('#content').innerHTML = '<div class="loader">Məlumatlar yüklənir…</div>';
  try {
    if (state.view === 'dashboard') $('#content').innerHTML = await dashboard();
    else if (state.view === 'editor') await mountSiteEditor($('#content'), { api, esc, toast, can, user: state.user });
    else if (state.view === 'settings') $('#content').innerHTML = await settings();
    else if (state.view === 'tv') $('#content').innerHTML = await tvView();
    else if (state.view === 'media') $('#content').innerHTML = await mediaView();
    else if (state.view === 'seo') $('#content').innerHTML = await seoView();
    else $('#content').innerHTML = await listing(state.view);
  } catch (error) {
    $('#content').innerHTML = `<div class="panel empty"><h2>Məlumat yüklənmədi</h2><p>${esc(error.message)}</p></div>`;
  }
}

async function boot() {
  if (notificationTimer) clearInterval(notificationTimer);
  notificationTimer = null;
  try {
    const { data } = await api('/auth/me', {}, false);
    state.user = data;
    const hasVendorRole = data.roles?.some((role) => vendorPortalRoles.has(role));
    const hasAdminRole = data.roles?.some((role) => adminPortalRoles.has(role));
    if (!isVendorPortal && hasVendorRole) {
      location.replace('/satici-paneli/');
      return;
    }
    if (!isVendorPortal && !hasAdminRole) {
      location.replace('/hesabim/');
      return;
    }
    if (isVendorPortal && !hasVendorRole) {
      location.replace(hasAdminRole ? '/admin/' : '/hesabim/');
      return;
    }
    const hasPanelAccess = menus.some(([, items]) => items.some(menuItemIsVisible));
    if (!hasPanelAccess) throw new Error('Bu hesabın idarəetmə panelinə giriş icazəsi yoxdur');
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    $('#userName').textContent = `${data.firstName} ${data.lastName}`;
    $('#userRole').textContent = data.roles.map((role) => roleLabels[role] || role).join(', ');
    $('#avatar').textContent = `${data.firstName[0]}${data.lastName[0]}`.toUpperCase();
    $('#notificationButton').hidden = !can('dashboard.read');
    await render();
    if (can('dashboard.read')) {
      await refreshNotificationCount();
      notificationTimer = setInterval(() => refreshNotificationCount().catch(() => undefined), 30_000);
    }
  } catch (error) {
    state.user = null;
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    if (error.message && (error.message.includes('idarəetmə panelinə') || error.message.includes('satıcı kabineti'))) $('#loginError').textContent = error.message;
  }
}

function configurePortalChrome() {
  if (!isVendorPortal) return;
  document.title = 'TVShop — Satıcı kabineti';
  $('.login-card .eyebrow').textContent = 'TVSHOP SATICI KABİNETİ';
  $('.login-card h1').textContent = 'Satıcı kabineti';
  $('.login-card > .muted').textContent = 'Məhsullarınızı, stokunuzu və sifarişlərinizi bir mərkəzdən idarə edin.';
  $('.brand').href = '#products';
  $('.brand').setAttribute('aria-label', 'TVShop satıcı kabineti');
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#loginError').textContent = '';
  const form = new FormData(event.currentTarget);
  try {
    await api(isVendorPortal ? '/auth/vendor-login' : '/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }, false);
    await boot();
  } catch (error) {
    $('#loginError').textContent = error.message;
  }
});

$('#logoutButton').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* Cookies are cleared by boot below. */ }
  state.user = null;
  location.hash = '';
  await boot();
});

$('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

document.addEventListener('submit', async (event) => {
  const searchForm = event.target.closest('[data-search-view]');
  if (searchForm) {
    event.preventDefault();
    const formData = new FormData(searchForm);
    const view = searchForm.dataset.searchView;
    state.search[view] = formData.get('search')?.toString().trim() || '';
    if (searchForm.matches('[data-demographic-filters]')) {
      const ageMin = Number(formData.get('ageMin') || 0);
      const ageMax = Number(formData.get('ageMax') || 0);
      if (ageMin && ageMax && ageMin > ageMax) {
        toast('Maksimum yaş minimum yaşdan kiçik ola bilməz', true);
        return;
      }
      state.filters[view] = Object.fromEntries(['ageMin', 'ageMax', 'gender', 'maritalStatus'].map((key) => [key, formData.get(key)?.toString().trim() || '']));
    }
    state.page[view] = 1;
    await render();
    return;
  }
  const mediaForm = event.target.closest('[data-media-upload]');
  if (mediaForm) {
    event.preventDefault();
    const source=new FormData(mediaForm); const payload=new FormData();
    ['storeId','vendorId','altText','title'].forEach((name)=>{const value=source.get(name);if(value)payload.append(name,value);});
    const file=source.get('file'); if(file instanceof File)payload.append('file',file,file.name);
    const button=mediaForm.querySelector('button[type="submit"]'); button.disabled=true;
    try{await api('/media',{method:'POST',body:payload});toast('Fayl uğurla yükləndi');await render();}catch(error){mediaForm.querySelector('[data-media-error]').textContent=error.message;button.disabled=false;}
    return;
  }
  const tvSettingsForm = event.target.closest('[data-tv-settings]');
  if (tvSettingsForm) {
    event.preventDefault();
    const formData = new FormData(tvSettingsForm);
    try {
      await api('/tv/settings', { method:'PUT', body:JSON.stringify({ storeId:tvSettingsForm.dataset.storeId, youtubeChannelId:String(formData.get('youtubeChannelId') || '').trim() || null }) });
      toast('Canlı yayım kanalı yeniləndi');
      await render();
    } catch (error) { toast(error.message, true); }
    return;
  }
  const tvCreateForm = event.target.closest('[data-tv-item-create]');
  if (tvCreateForm) {
    event.preventDefault();
    const formData = new FormData(tvCreateForm);
    try {
      await api('/tv/items', { method:'POST', body:JSON.stringify({ storeId:tvCreateForm.dataset.storeId, provider:String(formData.get('provider')), sourceUrl:String(formData.get('sourceUrl') || '').trim(), title:String(formData.get('title') || '').trim(), position:Number(formData.get('position') || 0), isActive:formData.has('isActive') }) });
      toast('TV kontenti əlavə edildi');
      await render();
    } catch (error) { toast(error.message, true); }
    return;
  }
  const tvEditForm = event.target.closest('[data-tv-item-edit]');
  if (tvEditForm) {
    event.preventDefault();
    const formData = new FormData(tvEditForm);
    try {
      await api(`/tv/items/${tvEditForm.dataset.tvItemEdit}`, { method:'PATCH', body:JSON.stringify({ provider:String(formData.get('provider')), sourceUrl:String(formData.get('sourceUrl') || '').trim(), title:String(formData.get('title') || '').trim(), position:Number(formData.get('position') || 0), isActive:formData.has('isActive') }) });
      toast('TV kontenti yeniləndi');
      await render();
    } catch (error) { toast(error.message, true); }
    return;
  }
  const settingsForm = event.target.closest('.settings-form');
  if (settingsForm) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(settingsForm));
    try {
      await api(`/settings/${settingsForm.dataset.storeId}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('Parametrlər yadda saxlanıldı');
      await render();
    } catch (error) { toast(error.message, true); }
  }
});

document.addEventListener('change', async (event) => {
  if (event.target.matches('#createForm [name="videoUrl"]')) {
    releaseProductVideo();
    renderProductVideo();
    return;
  }
  const classifiedCategory=event.target.closest('#createForm[data-view="classifieds"] select[name="category"]');
  if(classifiedCategory){
    synchronizeClassifiedCategory();
    return;
  }
  const productCategory = event.target.closest('#createForm[data-view="products"] [data-category-depth]');
  if (productCategory) {
    synchronizeProductCategoryPicker(Number(productCategory.dataset.categoryDepth));
    return;
  }
  const productVendor = event.target.closest('#createForm[data-view="products"] select[name="vendorId"]');
  if (productVendor) {
    await refreshProductSku();
    return;
  }
  const userRole = event.target.closest('#createForm[data-view="users"] select[name="roleCode"]');
  if (userRole) {
    synchronizeUserVendorField();
    return;
  }
  const brandSelect = event.target.closest('#createForm[data-view="products"] select[name="brandId"]');
  if (brandSelect) {
    const inline = $('#createForm').querySelector('[data-inline-brand]');
    inline.hidden = brandSelect.value !== '__create__';
    if (!inline.hidden) inline.querySelector('[data-inline-brand-name]').focus();
    return;
  }
  const productImageInput = event.target.closest('[data-product-image-input]');
  if (productImageInput) {
    addProductImageFiles(productImageInput.files);
    productImageInput.value = '';
    return;
  }
  const productVideoInput = event.target.closest('[data-product-video-input]');
  if (productVideoInput) {
    try { setProductVideoFile(productVideoInput.files?.[0]); }
    catch (error) { toast(error.message, true); }
    productVideoInput.value = '';
    return;
  }
  const userSelect = event.target.closest('[data-user-status]');
  const vendorSelect = event.target.closest('[data-vendor-status]');
  const recordSelect = event.target.closest('[data-record-status]');
  if (!userSelect && !vendorSelect && !recordSelect) return;
  const previous = event.target.dataset.current || '';
  event.target.disabled = true;
  try {
    if (userSelect) await api(`/users/${userSelect.dataset.userStatus}/status`, { method: 'PATCH', body: JSON.stringify({ status: userSelect.value }) });
    else if (vendorSelect) await api(`/vendors/${vendorSelect.dataset.vendorStatus}`, { method: 'PATCH', body: JSON.stringify({ status: vendorSelect.value }) });
    else await api(recordSelect.dataset.statusPath, { method: 'PATCH', body: JSON.stringify({ status: recordSelect.value }) });
    toast('Status yeniləndi');
    await render();
  } catch (error) {
    if (previous) event.target.value = previous;
    event.target.disabled = false;
    toast(error.message, true);
    await render();
  }
});

document.addEventListener('click', (event) => {
  const clearUserFilters = event.target.closest('[data-clear-user-filters]');
  if (clearUserFilters) {
    state.search.users = '';
    state.filters.users = {};
    state.page.users = 1;
    render();
    return;
  }
  const addAttribute = event.target.closest('[data-attribute-add]');
  if (addAttribute) {
    $('[data-product-attributes]').insertAdjacentHTML('beforeend', attributeRow());
    $('[data-product-attributes] .attribute-row:last-child [data-attribute-name]').focus();
  }
  const removeAttribute = event.target.closest('[data-attribute-remove]');
  if (removeAttribute) {
    const list = removeAttribute.closest('[data-product-attributes]');
    removeAttribute.closest('.attribute-row').remove();
    if (!list.children.length) list.innerHTML = attributeRow();
  }
  const createBrand = event.target.closest('[data-product-brand-create]');
  if (createBrand) createInlineProductBrand(createBrand);
  const removeProductImage = event.target.closest('[data-product-image-remove]');
  if (removeProductImage) {
    const index = Number(removeProductImage.closest('[data-product-image-index]').dataset.productImageIndex);
    const [removed] = productImages.splice(index, 1);
    if (removed?.objectUrl) URL.revokeObjectURL(removed.objectUrl);
    renderProductImages();
  }
  const removeProductVideo = event.target.closest('[data-product-video-remove]');
  if (removeProductVideo) {
    const urlInput = $('#createForm')?.elements.videoUrl;
    if (urlInput) urlInput.value = '';
    setProductVideo();
  }
  const tvDelete = event.target.closest('[data-tv-item-delete]');
  if (tvDelete && confirm('Bu TV kontenti silinsin?')) api(`/tv/items/${tvDelete.dataset.tvItemDelete}`, { method:'DELETE' }).then(() => { toast('TV kontenti silindi'); return render(); }).catch((error) => toast(error.message, true));
  const moveImage = event.target.closest('[data-product-image-move]');
  if (moveImage) {
    const from = Number(moveImage.closest('[data-product-image-index]').dataset.productImageIndex);
    moveProductImage(from, from + Number(moveImage.dataset.productImageMove));
  }
  const go = event.target.closest('[data-go]');
  if (go) location.hash = go.dataset.go;
  const create = event.target.closest('[data-create]');
  if (create) openCreate(create.dataset.create).catch((error) => toast(error.message, true));
  const adjust = event.target.closest('[data-inventory-adjust]');
  if (adjust) openInventoryAdjust(adjust);
  const productEdit=event.target.closest('[data-product-edit]');
  if(productEdit)openProductEdit(productEdit.dataset.productEdit).catch((error)=>toast(error.message,true));
  const productDelete=event.target.closest('[data-product-delete]');
  if(productDelete&&confirm('Bu məhsul arxivlənsin?'))api(`/catalog/products/${productDelete.dataset.productDelete}`,{method:'DELETE'}).then(()=>{toast('Məhsul arxivləndi');return render();}).catch((error)=>toast(error.message,true));
  const orderDetail=event.target.closest('[data-order-detail]');
  if(orderDetail)openOrderDetail(orderDetail.dataset.orderDetail).catch((error)=>toast(error.message,true));
  const categoryEdit=event.target.closest('[data-category-edit]');
  if(categoryEdit)openCategoryEdit(categoryEdit.dataset.categoryEdit).catch((error)=>toast(error.message,true));
  const brandEdit=event.target.closest('[data-brand-edit]');
  if(brandEdit)openBrandEdit(brandEdit.dataset.brandEdit).catch((error)=>toast(error.message,true));
  const rewardEdit=event.target.closest('[data-reward-edit]');
  const serviceCategoryEdit=event.target.closest('[data-service-category-edit]');
  if(serviceCategoryEdit)openServiceCategoryEdit(serviceCategoryEdit.dataset.serviceCategoryEdit).catch((error)=>toast(error.message,true));
  const serviceCategoryDelete=event.target.closest('[data-service-category-delete]');
  if(serviceCategoryDelete&&confirm('Bu xidmət kateqoriyası arxivlənsin?'))api(`/publishing/service-categories/${serviceCategoryDelete.dataset.serviceCategoryDelete}`,{method:'DELETE'}).then(()=>{toast('Xidmət kateqoriyası arxivləndi');return render();}).catch((error)=>toast(error.message,true));
  if(rewardEdit)openRewardEdit(rewardEdit.dataset.rewardEdit).catch((error)=>toast(error.message,true));
  const contentEdit=event.target.closest('[data-content-edit]');
  if(contentEdit)openContentEdit(contentEdit.dataset.contentType,contentEdit.dataset.contentEdit).catch((error)=>toast(error.message,true));
  const contentDelete=event.target.closest('[data-content-delete]');
  if(contentDelete&&confirm('Bu kontent arxivə göndərilsin?'))api(`/content/${contentDelete.dataset.contentType}/${contentDelete.dataset.contentDelete}`,{method:'DELETE'}).then(()=>{toast('Kontent arxivləndi');return render();}).catch((error)=>toast(error.message,true));
  const journalEdit=event.target.closest('[data-journal-edit]');
  if(journalEdit)openJournalEdit(journalEdit.dataset.journalEdit).catch((error)=>toast(error.message,true));
  const journalDelete=event.target.closest('[data-journal-delete]');
  if(journalDelete&&confirm('Bu jurnal buraxılışı arxivlənsin?'))api(`/publishing/journal/${journalDelete.dataset.journalDelete}`,{method:'DELETE'}).then(()=>{toast('Jurnal buraxılışı arxivləndi');return render();}).catch((error)=>toast(error.message,true));
  const classifiedEdit=event.target.closest('[data-classified-edit]');
  if(classifiedEdit)openClassifiedEdit(classifiedEdit.dataset.classifiedEdit).catch((error)=>toast(error.message,true));
  const classifiedDelete=event.target.closest('[data-classified-delete]');
  if(classifiedDelete&&confirm('Bu elan arxivlənsin?'))api(`/publishing/classifieds/${classifiedDelete.dataset.classifiedDelete}`,{method:'DELETE'}).then(()=>{toast('Elan arxivləndi');return render();}).catch((error)=>toast(error.message,true));
  const postCategoryEdit=event.target.closest('[data-post-category-edit]');
  if(postCategoryEdit)openPostCategoryEdit(postCategoryEdit.dataset.postCategoryEdit).catch((error)=>toast(error.message,true));
  const postCategoryDelete=event.target.closest('[data-post-category-delete]');
  if(postCategoryDelete&&confirm('Bu məqalə kateqoriyası həmişəlik silinsin?'))api(`/content/post-categories/${postCategoryDelete.dataset.postCategoryDelete}`,{method:'DELETE'}).then(()=>{toast('Məqalə kateqoriyası silindi');return render();}).catch((error)=>toast(error.message,true));
  const vendorEdit=event.target.closest('[data-vendor-edit]');
  if(vendorEdit)openVendorEdit(vendorEdit.dataset.vendorEdit).catch((error)=>toast(error.message,true));
  const vendorApprove=event.target.closest('[data-vendor-approve]');
  if(vendorApprove){vendorApprove.disabled=true;api(`/vendors/${vendorApprove.dataset.vendorApprove}`,{method:'PATCH',body:JSON.stringify({status:'active'})}).then(()=>{toast('Satıcı hesabı təsdiqləndi');return Promise.all([render(),refreshNotificationCount()]);}).catch((error)=>{vendorApprove.disabled=false;toast(error.message,true);});}
  const userEdit=event.target.closest('[data-user-edit]');
  if(userEdit)openUserEdit(userEdit.dataset.userEdit,userEdit.dataset.userView||'users').catch((error)=>toast(error.message,true));
  const userUnlock=event.target.closest('[data-user-unlock]');
  if(userUnlock&&confirm('Bu hesabın giriş kilidi açılsın? Uğursuz giriş sayğacı sıfırlanacaq.')){userUnlock.disabled=true;api(`/users/${userUnlock.dataset.userUnlock}/unlock`,{method:'POST'}).then(()=>{toast('Hesabın giriş kilidi açıldı');return render();}).catch((error)=>{userUnlock.disabled=false;toast(error.message,true);});}
  const userDelete=event.target.closest('[data-user-delete]');
  if(userDelete&&confirm('Bu istifadəçi silinsin? Hesabın bütün aktiv sessiyaları bağlanacaq.'))api(`/users/${userDelete.dataset.userDelete}`,{method:'DELETE'}).then(()=>{toast('İstifadəçi silindi');return render();}).catch((error)=>toast(error.message,true));
  const categoryDelete=event.target.closest('[data-category-delete]');
  if(categoryDelete&&confirm('Bu kateqoriya həmişəlik silinsin?'))api(`/catalog/categories/${categoryDelete.dataset.categoryDelete}`,{method:'DELETE'}).then(()=>{toast('Kateqoriya silindi');return render();}).catch((error)=>toast(error.message,true));
  const brandDelete=event.target.closest('[data-brand-delete]');
  if(brandDelete&&confirm('Bu brend həmişəlik silinsin?'))api(`/catalog/brands/${brandDelete.dataset.brandDelete}`,{method:'DELETE'}).then(()=>{toast('Brend silindi');return render();}).catch((error)=>toast(error.message,true));
  const resend=event.target.closest('[data-resend-invite]');
  if(resend){resend.disabled=true;api(`/users/${resend.dataset.resendInvite}/invite`,{method:'POST'}).then(({data})=>{toast(data.emailSent?'Dəvət e-poçtu göndərildi':'Dəvət keçidi yaradıldı');if(data.inviteUrl&&!data.emailSent)prompt('Dəvət keçidini kopyalayın:',data.inviteUrl);}).catch((error)=>toast(error.message,true)).finally(()=>{resend.disabled=false;});}
  const mediaEdit=event.target.closest('[data-media-edit]');
  if(mediaEdit){const title=prompt('Fayl başlığı:',mediaEdit.dataset.title||'');if(title===null)return;const alt=prompt('Alternativ mətn:',mediaEdit.dataset.alt||'');if(alt===null)return;api(`/media/${mediaEdit.dataset.mediaEdit}`,{method:'PATCH',body:JSON.stringify({title,altText:alt})}).then(()=>{toast('Media məlumatı yeniləndi');return render();}).catch((error)=>toast(error.message,true));}
  const mediaDelete=event.target.closest('[data-media-delete]');
  if(mediaDelete&&confirm('Bu fayl həmişəlik silinsin?'))api(`/media/${mediaDelete.dataset.mediaDelete}`,{method:'DELETE'}).then(()=>{toast('Fayl silindi');return render();}).catch((error)=>toast(error.message,true));
  const adminNotification=event.target.closest('[data-admin-notification]');
  if(adminNotification)api(`/notifications/${adminNotification.dataset.adminNotification}/read`,{method:'PATCH'}).then(()=>{const url=adminNotification.dataset.url;$('#createDialog').close();if(url)location.assign(url);return refreshNotificationCount();}).catch((error)=>toast(error.message,true));
  const readAllNotifications=event.target.closest('[data-notifications-admin-read-all]');
  if(readAllNotifications)api('/notifications/read-all',{method:'POST'}).then(()=>{toast('Bildirişlər oxunmuş edildi');return Promise.all([openNotifications(),refreshNotificationCount()]);}).catch((error)=>toast(error.message,true));
  const page = event.target.closest('[data-page-view]');
  if (page && !page.disabled) {
    state.page[page.dataset.pageView] = Number(page.dataset.page);
    render();
  }
  if (event.target.closest('.nav-link')) $('#sidebar').classList.remove('open');
});

addEventListener('hashchange', render);
$('#notificationButton').addEventListener('click',()=>openNotifications().catch((error)=>toast(error.message,true)));
$('#createDialog').addEventListener('dragstart', (event) => {
  const item = event.target.closest('[data-product-image-index]');
  if (!item) return;
  draggedProductImage = Number(item.dataset.productImageIndex);
  item.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
});
$('#createDialog').addEventListener('dragover', (event) => {
  const item = event.target.closest('[data-product-image-index]');
  const dropzone = event.target.closest('[data-product-image-dropzone]');
  if (!item && !dropzone) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = draggedProductImage === null ? 'copy' : 'move';
  if (dropzone && draggedProductImage === null) dropzone.classList.add('drag-over');
});
$('#createDialog').addEventListener('dragleave', (event) => {
  const dropzone = event.target.closest('[data-product-image-dropzone]');
  if (dropzone && !dropzone.contains(event.relatedTarget)) dropzone.classList.remove('drag-over');
});
$('#createDialog').addEventListener('drop', (event) => {
  event.preventDefault();
  const dropzone = event.target.closest('[data-product-image-dropzone]');
  if (dropzone) dropzone.classList.remove('drag-over');
  if (event.dataTransfer.files?.length) {
    addProductImageFiles(event.dataTransfer.files);
    return;
  }
  const target = event.target.closest('[data-product-image-index]');
  if (target && draggedProductImage !== null) moveProductImage(draggedProductImage, Number(target.dataset.productImageIndex));
  draggedProductImage = null;
});
$('#createDialog').addEventListener('dragend', (event) => {
  event.target.closest('[data-product-image-index]')?.classList.remove('dragging');
  draggedProductImage = null;
});
$('#createDialog').addEventListener('close',()=>{
  $('#notificationButton').setAttribute('aria-expanded','false');
  releaseProductImages();
  releaseProductVideo();
  $('#createDialog').classList.remove('product-dialog');
});
configurePortalChrome();
initializeAdminPasswordFields();
new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
  if (node instanceof Element) initializeAdminPasswordFields(node);
}))).observe(document.body, { childList: true, subtree: true });
boot();
