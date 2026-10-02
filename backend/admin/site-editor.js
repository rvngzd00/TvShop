let editor = null;

const scopeLabels = { nav: ['Naviqasiya', 'Bütün səhifələrin başlıq və menyuları'], index: ['Ana səhifə', 'Ana səhifənin bütün vitrin bölmələri'], footer: ['Footer', 'Bütün səhifələrin alt hissəsi'] };
const clone = (value) => JSON.parse(JSON.stringify(value));
const pathParts = (path) => path.split('.').map((part) => /^\d+$/.test(part) ? Number(part) : part);
const getPath = (source, path) => pathParts(path).reduce((value, part) => value?.[part], source);
function setPath(source, path, value) {
  const parts = pathParts(path); let target = source;
  parts.slice(0, -1).forEach((part) => { target = target[part]; });
  target[parts.at(-1)] = value;
}
function uid(prefix = 'item') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

function input(label, path, value, options = {}) {
  const type = options.type || 'text';
  const help = options.help ? `<small>${editor.esc(options.help)}</small>` : '';
  if (type === 'textarea') return `<label class="editor-field ${options.wide ? 'wide' : ''}"><span>${editor.esc(label)}</span><textarea data-editor-path="${path}" rows="${options.rows || 3}" maxlength="${options.max || 600}">${editor.esc(value || '')}</textarea>${help}</label>`;
  return `<label class="editor-field ${options.wide ? 'wide' : ''}"><span>${editor.esc(label)}</span><input type="${type}" data-editor-path="${path}" value="${editor.esc(value ?? '')}" ${options.placeholder ? `placeholder="${editor.esc(options.placeholder)}"` : ''} maxlength="${options.max || 500}">${help}</label>`;
}

function toggle(label, path, checked, help = '') {
  return `<label class="editor-toggle"><input type="checkbox" data-editor-path="${path}" ${checked ? 'checked' : ''}><i></i><span><strong>${editor.esc(label)}</strong>${help ? `<small>${editor.esc(help)}</small>` : ''}</span></label>`;
}

function assetSelect(label, path, selected) {
  const options = editor.options.media.map((item) => `<option value="${item.id}" ${selected === item.id ? 'selected' : ''}>${editor.esc(item.title || item.alt_text || item.id)}</option>`).join('');
  const media = editor.options.media.find((item) => item.id === selected);
  return `<label class="editor-field editor-media-field"><span>${editor.esc(label)}</span><select data-editor-path="${path}"><option value="">Cari dizayndakı şəkil</option>${options}</select>${media ? `<img src="${editor.esc(media.public_url)}" alt="">` : '<small>Şəkil seçilmədikdə hazırkı dizayn qorunur.</small>'}</label>`;
}

function panel(title, description, content, open = false) {
  return `<details class="editor-panel" ${open ? 'open' : ''}><summary><span><strong>${editor.esc(title)}</strong><small>${editor.esc(description)}</small></span><b aria-hidden="true">⌄</b></summary><div class="editor-panel-body">${content}</div></details>`;
}

function itemActions(path, index, allowDelete = true) {
  return `<div class="editor-row-actions"><button type="button" data-array-move="${path}" data-array-index="${index}" data-direction="-1" aria-label="Yuxarı">↑</button><button type="button" data-array-move="${path}" data-array-index="${index}" data-direction="1" aria-label="Aşağı">↓</button>${allowDelete ? `<button type="button" class="danger" data-array-remove="${path}" data-array-index="${index}" aria-label="Sil">×</button>` : ''}</div>`;
}

function linkRows(path, items, nested = true) {
  const rows = items.map((item, index) => {
    const base = `${path}.${index}`;
    const children = nested ? `<div class="editor-child-list"><p>Alt keçidlər</p>${linkRows(`${base}.children`, item.children || [], false)}<button type="button" class="editor-add-small" data-link-add="${base}.children">+ Alt keçid</button></div>` : '';
    const image = path.startsWith('storeItems') ? assetSelect('Kateqoriya şəkli', `${base}.imageAssetId`, item.imageAssetId) : '';
    return `<article class="editor-repeater-row"><div class="editor-row-head"><strong>${editor.esc(item.label || 'Yeni keçid')}</strong>${itemActions(path, index)}</div><div class="editor-fields compact">${input('Mətn', `${base}.label`, item.label)}${input('Keçid', `${base}.url`, item.url)}${image}${toggle('Görünsün', `${base}.visible`, item.visible)}</div>${children}</article>`;
  }).join('');
  return `<div class="editor-repeater">${rows || '<p class="editor-empty">Keçid əlavə edilməyib.</p>'}</div>`;
}

function navForm(config) {
  return [
    panel('Üst məlumat paneli', 'Ünvan, çatdırılma və giriş yazıları', `<div class="editor-fields">${input('Ünvan', 'announcement.address', config.announcement.address)}${input('Əlaqə yazısı', 'announcement.contactLabel', config.announcement.contactLabel)}${input('Əlaqə keçidi', 'announcement.contactUrl', config.announcement.contactUrl)}${input('Çatdırılma məlumatı', 'announcement.deliveryText', config.announcement.deliveryText, { wide: true })}${input('Giriş yazısı', 'announcement.loginLabel', config.announcement.loginLabel)}</div>`, true),
    panel('Loqo və axtarış', 'Brend görünüşü və axtarış sahəsi', `<div class="editor-fields">${assetSelect('Sayt loqosu', 'branding.logoAssetId', config.branding.logoAssetId)}${input('Loqo alt mətni', 'branding.logoAlt', config.branding.logoAlt)}${input('Axtarış placeholder-i', 'search.placeholder', config.search.placeholder)}${input('Axtar düyməsi', 'search.buttonLabel', config.search.buttonLabel)}</div>`),
    panel('Dəstək məlumatları', 'Telefon və canlı dəstək', `<div class="editor-fields">${input('Telefon', 'support.phone', config.support.phone, { type: 'tel' })}${input('Telefon etiketi', 'support.label', config.support.label)}${input('Canlı dəstək başlığı', 'liveChat.title', config.liveChat.title)}${input('Canlı dəstək alt yazısı', 'liveChat.subtitle', config.liveChat.subtitle)}${input('Canlı dəstək keçidi', 'liveChat.url', config.liveChat.url, { wide: true })}</div>`),
    panel('Əsas naviqasiya', 'Menyu ardıcıllığı, yazıları və alt keçidləri', `${linkRows('menuItems', config.menuItems)}<button type="button" class="secondary editor-add" data-link-add="menuItems">+ Menyu keçidi əlavə et</button>`),
    panel('Mağaza kateqoriyaları', 'Hamburger menyusundakı mağaza keçidləri', `${linkRows('storeItems', config.storeItems)}<button type="button" class="secondary editor-add" data-link-add="storeItems">+ Mağaza keçidi əlavə et</button>`)
  ].join('');
}

function slideRows(path, items, kind) {
  const limit = kind === 'hero' ? 3 : 4;
  return `<div class="editor-repeater">${items.map((item, index) => {
    const base = `${path}.${index}`;
    return `<article class="editor-repeater-row"><div class="editor-row-head"><strong>${editor.esc(item.title || 'Yeni blok')}</strong>${itemActions(path, index, items.length > 1)}</div>${toggle('Aktivdir', `${base}.enabled`, item.enabled)}<div class="editor-fields">${kind === 'hero' ? input('Üst yazı', `${base}.eyebrow`, item.eyebrow) : ''}${input('Başlıq', `${base}.title`, item.title)}${input('Təsvir', `${base}.description`, item.description, { type: 'textarea', wide: true })}${input('Düymə yazısı', `${base}.buttonLabel`, item.buttonLabel)}${input('Düymə keçidi', `${base}.buttonUrl`, item.buttonUrl)}${assetSelect('Şəkil', `${base}.imageAssetId`, item.imageAssetId)}</div></article>`;
  }).join('')}</div>${items.length < limit ? `<button type="button" class="secondary editor-add" data-slide-add="${path}" data-slide-kind="${kind}">+ Yeni ${kind === 'hero' ? 'slayd' : 'kart'} əlavə et</button>` : ''}`;
}

function selector(type, path, selected) {
  const labels = { products: ['Məhsullar', 'title', 'image_url'], categories: ['Kateqoriyalar', 'name', null], posts: ['Məqalələr', 'title', null], brands: ['Brendlər', 'name', null] };
  const [label, nameKey, imageKey] = labels[type];
  const items = editor.options[type] || [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = selected.map((id) => byId.get(id)).filter(Boolean).map((item, index) => `<div><span>${index + 1}</span><strong>${editor.esc(item[nameKey])}</strong><div class="editor-row-actions"><button type="button" data-selection-move="${path}" data-selection-index="${index}" data-direction="-1" aria-label="Yuxarı">↑</button><button type="button" data-selection-move="${path}" data-selection-index="${index}" data-direction="1" aria-label="Aşağı">↓</button><button type="button" class="danger" data-selection-remove="${path}" data-selection-index="${index}" aria-label="Seçimdən çıxar">×</button></div></div>`).join('');
  return `<div class="editor-selector" data-editor-selector><div class="editor-selector-toolbar"><strong>${label}</strong><input type="search" data-selector-search placeholder="Axtar…" aria-label="${label} üzrə axtar"></div>${ordered ? `<div class="editor-selected-list"><p>Saytda göstərilmə sırası</p>${ordered}</div>` : ''}<div class="editor-choice-grid">${items.map((item) => `<label data-selector-item="${editor.esc(item[nameKey])}"><input type="checkbox" data-editor-selection="${path}" value="${item.id}" ${selected.includes(item.id) ? 'checked' : ''}>${imageKey && item[imageKey] ? `<img src="${editor.esc(item[imageKey])}" alt="">` : `<i>${editor.esc(String(item[nameKey] || '?').slice(0, 1))}</i>`}<span><strong>${editor.esc(item[nameKey])}</strong><small>${editor.esc(item.sku || item.slug || item.status || '')}</small></span></label>`).join('')}</div><small class="editor-selection-count">${selected.length} seçim</small></div>`;
}

function sectionFields(path, section, type, extra = '') {
  return `${toggle('Bölmə görünsün', `${path}.enabled`, section.enabled)}<div class="editor-fields">${input('Başlıq', `${path}.title`, section.title)}${input('Alt mətn', `${path}.subtitle`, section.subtitle, { type: 'textarea', wide: true, help: 'Dizaynda alt mətn sahəsi olan bölmələrdə göstərilir.' })}</div>${selector(type, `${path}.${type === 'products' ? 'productIds' : type === 'categories' ? 'categoryIds' : type === 'posts' ? 'postIds' : 'brandIds'}`, section[type === 'products' ? 'productIds' : type === 'categories' ? 'categoryIds' : type === 'posts' ? 'postIds' : 'brandIds'])}${extra}`;
}

function indexForm(config) {
  return [
    panel('SEO və paylaşım', 'Brauzer başlığı və axtarış təsviri', `<div class="editor-fields">${input('Səhifə başlığı', 'seo.browserTitle', config.seo.browserTitle, { wide: true, max: 180 })}${input('Meta təsvir', 'seo.metaDescription', config.seo.metaDescription, { type: 'textarea', wide: true, max: 320 })}</div>`, true),
    panel('Hero slayder', 'Başlıq, mətn, düymə və fon şəkilləri', `${toggle('Hero görünsün', 'hero.enabled', config.hero.enabled)}${slideRows('hero.slides', config.hero.slides, 'hero')}`),
    panel('Promo kartları', 'Hədiyyə, dəst və kampaniya blokları', slideRows('promoCards', config.promoCards, 'promo')),
    panel('Önə çıxan kateqoriyalar', 'Ana səhifənin dairəvi kateqoriya seçimləri', sectionFields('categories', config.categories, 'categories')),
    panel('Seçilmiş fürsətlər', 'Slayderdə görünəcək məhsulları və sırasını seçin', sectionFields('featured', config.featured, 'products')),
    panel('Ən populyar seçimlər', 'Populyar məhsul slayderini idarə edin', sectionFields('popular', config.popular, 'products')),
    panel('Ən çox seçilənlər', 'Məhsullar və filtr kateqoriyaları', sectionFields('topPicks', config.topPicks, 'products', selector('categories', 'topPicks.categoryIds', config.topPicks.categoryIds))),
    panel('Jurnal yenilikləri', 'Ana səhifədə görünəcək xəbərlər', sectionFields('news', config.news, 'posts')),
    panel('Seçilmiş brendlər', 'Brend sırası və bölmə mətnləri', sectionFields('brands', config.brands, 'brands'))
  ].join('');
}

function socialRows(items) {
  return `<div class="editor-repeater">${items.map((item, index) => { const base = `socialLinks.${index}`; return `<article class="editor-repeater-row"><div class="editor-row-head"><strong>${editor.esc(item.network)}</strong>${itemActions('socialLinks', index)}</div><div class="editor-fields compact">${input('Şəbəkə', `${base}.network`, item.network)}${input('Etiket', `${base}.label`, item.label)}${input('Keçid', `${base}.url`, item.url)}${toggle('Görünsün', `${base}.visible`, item.visible)}</div></article>`; }).join('')}</div><button type="button" class="secondary editor-add" data-social-add>+ Sosial şəbəkə</button>`;
}

function footerForm(config) {
  const groups = config.linkGroups.map((group, index) => { const base = `linkGroups.${index}`; return `<article class="editor-repeater-row"><div class="editor-row-head"><strong>${editor.esc(group.title || 'Keçid qrupu')}</strong>${itemActions('linkGroups', index, config.linkGroups.length > 1)}</div><div class="editor-fields compact">${input('Qrup başlığı', `${base}.title`, group.title)}${toggle('Görünsün', `${base}.visible`, group.visible)}</div>${linkRows(`${base}.links`, group.links, false)}<button type="button" class="editor-add-small" data-footer-link-add="${base}.links">+ Keçid</button></article>`; }).join('');
  return [
    panel('Brend sahəsi', 'Footer loqosu və qısa təqdimat', `<div class="editor-fields">${assetSelect('Footer loqosu', 'branding.logoAssetId', config.branding.logoAssetId)}${input('Loqo alt mətni', 'branding.logoAlt', config.branding.logoAlt)}${input('Təqdimat mətni', 'branding.description', config.branding.description, { type: 'textarea', wide: true })}</div>`, true),
    panel('Sosial şəbəkələr', 'Sosial keçidlər və sırası', socialRows(config.socialLinks)),
    panel('Footer keçid qrupları', 'Qruplar, keçidlər və onların sırası', `<div class="editor-repeater">${groups}</div>${config.linkGroups.length < 4 ? '<button type="button" class="secondary editor-add" data-group-add>+ Keçid qrupu</button>' : ''}`),
    panel('Əlaqə məlumatları', 'Ünvan, telefon və iş vaxtı', `<div class="editor-fields">${input('Ünvan', 'contact.address', config.contact.address)}${input('Ünvan keçidi', 'contact.addressUrl', config.contact.addressUrl)}${input('Telefon', 'contact.phone', config.contact.phone, { type: 'tel' })}${input('Telefon keçidi', 'contact.phoneUrl', config.contact.phoneUrl)}${input('İş vaxtı', 'contact.hours', config.contact.hours, { wide: true })}</div>`),
    panel('Copyright və hüquqi keçidlər', 'Footer-in ən alt sətri', `<div class="editor-fields">${input('Copyright', 'legal.copyright', config.legal.copyright, { wide: true })}</div>${linkRows('legal.links', config.legal.links, false)}<button type="button" class="editor-add-small" data-footer-link-add="legal.links">+ Hüquqi keçid</button>`)
  ].join('');
}

function shell() {
  const doc = editor.documents[editor.scope]; const config = doc.draft;
  const forms = { nav: navForm, index: indexForm, footer: footerForm };
  const status = doc.hasUnpublishedChanges ? '<span class="editor-status draft">Yayımlanmamış dəyişiklik var</span>' : '<span class="editor-status live">Saytla eynidir</span>';
  return `<section class="site-editor" data-site-editor>
    <header class="editor-commandbar"><div><p class="eyebrow">VİZUAL İDARƏETMƏ</p><h2>${scopeLabels[editor.scope][0]}</h2><small>${scopeLabels[editor.scope][1]}</small></div><div class="editor-command-actions">${status}<button type="button" class="secondary" data-editor-discard ${!doc.hasUnpublishedChanges ? 'disabled' : ''}>Geri al</button><button type="button" class="secondary" data-editor-preview>Preview</button><button type="button" class="primary" data-editor-save>Qaralamanı saxla</button><button type="button" class="primary editor-publish" data-editor-publish ${!editor.can('editor.publish') ? 'hidden' : ''}>Yayımla</button></div></header>
    <nav class="editor-tabs" aria-label="Editor bölmələri">${Object.entries(scopeLabels).map(([key, value]) => `<button type="button" data-editor-scope="${key}" class="${key === editor.scope ? 'active' : ''}"><i>${key === 'nav' ? '☰' : key === 'index' ? '⌂' : '▤'}</i><span><strong>${value[0]}</strong><small>${value[1]}</small></span></button>`).join('')}</nav>
    <div class="editor-layout"><main class="editor-form" data-editor-form>${forms[editor.scope](config)}</main><aside class="editor-preview"><div class="editor-preview-bar"><strong>Canlı önizləmə</strong><div><button type="button" data-editor-device="desktop" class="active">Desktop</button><button type="button" data-editor-device="tablet">Tablet</button><button type="button" data-editor-device="mobile">Mobil</button></div></div><div class="editor-frame-shell desktop" data-editor-frame-shell><iframe title="Sayt önizləməsi" src="/?editor-preview=${editor.scope}&v=${Date.now()}" data-editor-frame></iframe></div><p>Preview qaralama versiyanı göstərir. Dəyişikliklər yalnız “Yayımla” düyməsindən sonra sayta tətbiq olunur.</p></aside></div>
  </section>`;
}

function markDirty() {
  editor.localDirty = true;
  const status = editor.root.querySelector('.editor-status');
  if (status) { status.className = 'editor-status draft'; status.textContent = 'Yadda saxlanmamış dəyişiklik var'; }
}

function refreshForm() {
  const scroll = editor.root.querySelector('.editor-form')?.scrollTop || 0;
  editor.root.innerHTML = shell(); bind();
  const form = editor.root.querySelector('.editor-form'); if (form) form.scrollTop = scroll;
}

async function save(showToast = true) {
  const doc = editor.documents[editor.scope];
  const button = editor.root.querySelector('[data-editor-save]'); if (button) button.disabled = true;
  try {
    const result = await editor.api(`/editor/${editor.scope}/draft`, { method: 'PATCH', body: JSON.stringify({ storeId: editor.options.storeId, expectedVersion: doc.draftVersion, content: doc.draft }) });
    Object.assign(doc, result.data, { hasUnpublishedChanges: true }); editor.localDirty = false;
    if (showToast) editor.toast('Qaralama təhlükəsiz saxlanıldı');
    return true;
  } catch (error) { editor.toast(error.message, true); return false; }
  finally { if (button) button.disabled = false; }
}

async function preview() {
  if (editor.localDirty && !await save(false)) return;
  const frame = editor.root.querySelector('[data-editor-frame]');
  frame.src = `/?editor-preview=${editor.scope}&v=${Date.now()}`;
  editor.toast('Preview yeniləndi');
}

async function publish() {
  if (editor.localDirty && !await save(false)) return;
  if (!confirm(`${scopeLabels[editor.scope][0]} dəyişiklikləri canlı saytda yayımlansın?`)) return;
  const doc = editor.documents[editor.scope];
  try {
    const result = await editor.api(`/editor/${editor.scope}/publish`, { method: 'POST', body: JSON.stringify({ storeId: editor.options.storeId, expectedVersion: doc.draftVersion }) });
    Object.assign(doc, result.data); doc.published = clone(doc.draft); editor.toast('Dəyişikliklər bütün uyğun səhifələrdə yayımlandı'); refreshForm();
  } catch (error) { editor.toast(error.message, true); }
}

function bind() {
  editor.root.querySelectorAll('[data-editor-path]').forEach((field) => field.addEventListener('input', () => {
    const value = field.type === 'checkbox' ? field.checked : field.value || (field.tagName === 'SELECT' ? null : '');
    setPath(editor.documents[editor.scope].draft, field.dataset.editorPath, value); markDirty();
  }));
  editor.root.querySelectorAll('[data-editor-selection]').forEach((field) => field.addEventListener('change', () => {
    const path = field.dataset.editorSelection;
    const current = [...getPath(editor.documents[editor.scope].draft, path)];
    const values = field.checked ? [...current, field.value] : current.filter((id) => id !== field.value);
    setPath(editor.documents[editor.scope].draft, path, values); markDirty();
    refreshForm();
  }));
  editor.root.querySelectorAll('[data-selector-search]').forEach((field) => field.addEventListener('input', () => {
    const term = field.value.toLocaleLowerCase('az-AZ');
    field.closest('[data-editor-selector]').querySelectorAll('[data-selector-item]').forEach((item) => { item.hidden = !item.dataset.selectorItem.toLocaleLowerCase('az-AZ').includes(term); });
  }));
}

function addLink(path) { const array = getPath(editor.documents[editor.scope].draft, path); array.push({ id: uid('link'), label: 'Yeni keçid', url: '#', visible: true, ...(path.startsWith('storeItems') ? { imageAssetId: null } : {}), ...(path.endsWith('menuItems') || path.endsWith('storeItems') ? { children: [] } : {}) }); markDirty(); refreshForm(); }

function clickHandler(event) {
  const scope = event.target.closest('[data-editor-scope]');
  if (scope) { if (editor.localDirty && !confirm('Yadda saxlanmamış dəyişikliklər itəcək. Davam edilsin?')) return; editor.scope = scope.dataset.editorScope; editor.localDirty = false; refreshForm(); return; }
  if (event.target.closest('[data-editor-save]')) { save(); return; }
  if (event.target.closest('[data-editor-preview]')) { preview(); return; }
  if (event.target.closest('[data-editor-publish]')) { publish(); return; }
  if (event.target.closest('[data-editor-discard]')) {
    if (!confirm('Bu bölmədəki yayımlanmamış dəyişikliklər geri alınsın?')) return;
    editor.api(`/editor/${editor.scope}/discard`, { method: 'POST', body: JSON.stringify({ storeId: editor.options.storeId }) }).then(({ data }) => { Object.assign(editor.documents[editor.scope], data); editor.localDirty = false; editor.toast('Qaralama canlı versiyaya qaytarıldı'); refreshForm(); }).catch((error) => editor.toast(error.message, true)); return;
  }
  const device = event.target.closest('[data-editor-device]');
  if (device) { editor.root.querySelectorAll('[data-editor-device]').forEach((button) => button.classList.toggle('active', button === device)); editor.root.querySelector('[data-editor-frame-shell]').className = `editor-frame-shell ${device.dataset.editorDevice}`; return; }
  const remove = event.target.closest('[data-array-remove]');
  if (remove) { getPath(editor.documents[editor.scope].draft, remove.dataset.arrayRemove).splice(Number(remove.dataset.arrayIndex), 1); markDirty(); refreshForm(); return; }
  const move = event.target.closest('[data-array-move]');
  if (move) { const array = getPath(editor.documents[editor.scope].draft, move.dataset.arrayMove); const from = Number(move.dataset.arrayIndex); const to = from + Number(move.dataset.direction); if (to >= 0 && to < array.length) { [array[from], array[to]] = [array[to], array[from]]; markDirty(); refreshForm(); } return; }
  const selectionRemove = event.target.closest('[data-selection-remove]');
  if (selectionRemove) { getPath(editor.documents[editor.scope].draft, selectionRemove.dataset.selectionRemove).splice(Number(selectionRemove.dataset.selectionIndex), 1); markDirty(); refreshForm(); return; }
  const selectionMove = event.target.closest('[data-selection-move]');
  if (selectionMove) { const array = getPath(editor.documents[editor.scope].draft, selectionMove.dataset.selectionMove); const from = Number(selectionMove.dataset.selectionIndex); const to = from + Number(selectionMove.dataset.direction); if (to >= 0 && to < array.length) [array[from], array[to]] = [array[to], array[from]]; markDirty(); refreshForm(); return; }
  const link = event.target.closest('[data-link-add],[data-footer-link-add]'); if (link) { addLink(link.dataset.linkAdd || link.dataset.footerLinkAdd); return; }
  const slide = event.target.closest('[data-slide-add]');
  if (slide) { const hero = slide.dataset.slideKind === 'hero'; getPath(editor.documents[editor.scope].draft, slide.dataset.slideAdd).push({ id: uid(hero ? 'hero' : 'promo'), enabled: true, ...(hero ? { eyebrow: 'Yeni fürsət' } : {}), title: 'Yeni başlıq', description: '', buttonLabel: 'Ətraflı', buttonUrl: '/magaza/', imageAssetId: null }); markDirty(); refreshForm(); return; }
  if (event.target.closest('[data-social-add]')) { editor.documents.footer.draft.socialLinks.push({ id: uid('social'), network: 'Yeni şəbəkə', label: 'Bizi izlə', url: '#', visible: true }); markDirty(); refreshForm(); return; }
  if (event.target.closest('[data-group-add]')) { editor.documents.footer.draft.linkGroups.push({ id: uid('group'), title: 'Yeni qrup', visible: true, links: [] }); markDirty(); refreshForm(); }
}

export async function mountSiteEditor(root, dependencies) {
  root.innerHTML = '<div class="loader">Editor və real sayt məlumatları yüklənir…</div>';
  const options = (await dependencies.api('/editor/options')).data;
  const entries = await Promise.all(['nav', 'index', 'footer'].map(async (scope) => [scope, (await dependencies.api(`/editor/${scope}?storeId=${encodeURIComponent(options.storeId)}`)).data]));
  editor = { ...dependencies, root, options, documents: Object.fromEntries(entries), scope: 'nav', localDirty: false };
  root.innerHTML = shell();
  root.addEventListener('click', clickHandler);
  bind();
}
