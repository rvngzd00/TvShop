import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'index.html');
let html = await readFile(file, 'utf8');

const categoryRoutes = new Map([
  ['air-tools-compressors', 'elektrik-aletleri'], ['electrical', 'elektrik-aletleri'],
  ['measuring', 'olcu-cihazlari'], ['hand-tools', 'aksesuarlar'], ['power-tools', 'elektrik-aletleri'],
  ['machine-tools', 'bag-ve-emalatxana'], ['marking-tools', 'olcu-cihazlari'], ['tool-accessories', 'aksesuarlar'],
  ['other', 'aksesuarlar']
]);
for (const [legacy, category] of categoryRoutes) {
  html = html.replaceAll(`/product-category/${legacy}/`, `/magaza/?kateqoriya=${category}`);
}

html = html
  .replace(/\/shop\/\?query_type_brand=or&amp;filter_brand=([a-z0-9-]+)/g, '/magaza/?brend=$1')
  .replaceAll('/magaza/?brend=dewolt', '/magaza/?brend=dewalt')
  .replaceAll('/magaza/?brend=max-usa', '/magaza/?brend=max')
  .replaceAll('//shop/', '/magaza/')
  .replaceAll('/shop/', '/magaza/')
  .replaceAll('/contact-us/', '/elaqe/')
  .replaceAll('/my-account/lost-password/', '/admin/')
  .replaceAll('/my-account/wishlist/', '/magaza/')
  .replaceAll('/my-account/', '/admin/')
  .replaceAll('/cart/', '/sebet/')
  .replaceAll('href="/categories/"', 'href="/magaza/"')
  .replaceAll('href="/categories', 'href="/magaza')
  .replaceAll('/privacy-policy/', '/mexfilik/')
  .replaceAll('/refund_returns/', '/geri-qaytarma/')
  .replaceAll('href="#" class="menu-list-item">İstifadə şərtləri', 'href="/istifade-sertleri/" class="menu-list-item">İstifadə şərtləri')
  .replaceAll('action="/search" method="get"', 'action="/magaza/" method="get"')
  .replaceAll('name="s" class="query"', 'name="axtaris" class="query"')
  .replaceAll('action="/api/auth/login" method="post"', 'action="/admin/" method="get"')
  .replaceAll('href="#" class="et__button', 'href="/magaza/" class="et__button');

await writeFile(file, html);
console.log('Köhnə WordPress keçidləri real TVShop route-larına bağlandı.');
