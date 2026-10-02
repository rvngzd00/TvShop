import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env['DAILY_BAKU_TEST_URL'] || 'http://127.0.0.1:3000';
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const categoryTree = {
  magaza: ['elektronika', 'ev-metbex', 'moda', 'gozellik-saglamliq', 'qida', 'usaq', 'avtomobil', 'xidmetler', 'hediyyeler'],
  endirimler: ['restoranlar', 'marketler', 'geyim', 'gozellik-saglamliq', 'eylence', 'seyahet'],
  kampaniyalar: ['gunun-teklifi', 'heftenin-kampaniyasi', 'mehdud-sayda', 'movsumi-endirimler'],
  jurnal: ['son-buraxilis', 'arxiv', 'brend-hekayeleri', 'alis-veris-meslehetleri'],
  'baki-club': ['xal-qazanma', 'hediyyeler', 'giveawayler', 'qr-idareetme'],
  elanlar: ['mehsullar', 'xidmetler', 'emlak', 'avtomobil'],
  biznes: ['reklam-ver', 'sponsorluq', 'brend-vitrini', 'analitika-paneli']
};
const categoryRoots = Object.keys(categoryTree).map((section) => `/${section}/`);
const categoryPaths = Object.entries(categoryTree).flatMap(([section, children]) => children.map((child) => `/${section}/${child}/`));
const categoryMediaPaths = Object.entries(categoryTree).flatMap(([section, children]) => [
  `/assets/images/categories/${section}.jpg`,
  ...children.map((child) => section === 'magaza' && child === 'hediyyeler'
    ? '/assets/images/categories/baki-club/hediyyeler.jpg'
    : `/assets/images/categories/${section}/${child}.jpg`)
]);
const paths = new Set([...categoryRoots, ...categoryPaths, '/sebet/', '/satici-paneli/']);

for (const match of html.matchAll(/href="([^"]+)"/g)) {
  const href = match[1];
  if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/assets/')) continue;
  const url = new URL(href, base);
  url.hash = '';
  paths.add(`${url.pathname}${url.search}`);
}

const failures = [];
for (const path of [...paths].sort()) {
  const response = await fetch(new URL(path, base), { redirect: 'follow', headers: { Accept: 'text/html,application/xml' } });
  if (!response.ok) {
    failures.push(`${response.status} ${path}`);
    continue;
  }

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('text/html') ? await response.text() : '';
  if (body) {
    if (!body.includes('TVShop')) failures.push(`TVShop brendi yoxdur: ${path}`);
  }

  if (categoryRoots.includes(path) || categoryPaths.includes(path)) {
    const canonical = body.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    if (!canonical || new URL(canonical, base).pathname !== new URL(path, base).pathname) failures.push(`Yanlış canonical: ${path}`);
    if (!body.includes('page-category-nav')) failures.push(`Dairə kateqoriya naviqasiyası yoxdur: ${path}`);
    if (!body.includes('/assets/images/categories/') || /class="page-category-image"><img[^>]+\.svg/i.test(body)) failures.push(`Foto kateqoriya naviqasiyası yoxdur: ${path}`);
    if (categoryPaths.includes(path) && !body.includes('aria-current="page"')) failures.push(`Aktiv alt kateqoriya işarələnməyib: ${path}`);
  }
}

for (const path of categoryPaths) {
  const cleanPath = path.slice(0, -1);
  const response = await fetch(new URL(cleanPath, base), { redirect: 'manual' });
  if (response.status !== 308 || response.headers.get('location') !== path) failures.push(`308 canonical redirect yoxdur: ${cleanPath}`);
}

for (const path of categoryMediaPaths) {
  const response = await fetch(new URL(path, base));
  const bytes = response.ok ? await response.arrayBuffer() : new ArrayBuffer(0);
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg') || bytes.byteLength < 1_000) failures.push(`Kateqoriya fotosu cavab vermir: ${path}`);
}

const sitemap = await fetch(new URL('/sitemap.xml', base), { redirect: 'follow' });
const sitemapXml = sitemap.ok ? await sitemap.text() : '';
for (const path of categoryPaths) {
  if (!sitemapXml.includes(path)) failures.push(`Sitemap route-u yoxdur: ${path}`);
}

console.log(`${paths.size} daxili route, ${categoryPaths.length} canonical redirect və ${categoryMediaPaths.length} kateqoriya fotosu yoxlanıldı.`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Bütün daxili route-lar uğurla cavab verdi.');
}
