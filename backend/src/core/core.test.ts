import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './slug.js';
import { hashPassword, verifyPassword } from './password.js';
import { paginationMeta, paginationSchema } from './pagination.js';
import { azerbaijanPhoneSchema, normalizeAzerbaijanPhone } from './phone.js';

test('Azərbaycan hərfləri sabit SEO slug yaradır',()=>{
  assert.equal(slugify('Gözəllik & Sağlamlıq üçün Ən Yaxşı Təkliflər'),'gozellik-saglamliq-ucun-en-yaxsi-teklifler');
});

test('şifrə hash olunur və yanlış şifrə qəbul edilmir',async()=>{
  const hash=await hashPassword('Çox-Məxfi-Şifrə-2026!');
  assert.equal(await verifyPassword('Çox-Məxfi-Şifrə-2026!',hash),true);
  assert.equal(await verifyPassword('yanlış-şifrə',hash),false);
});

test('pagination limitləri və meta hesabı düzgündür',()=>{
  const query=paginationSchema.parse({page:'2',limit:'20',search:'  test  '});
  assert.deepEqual({page:query.page,limit:query.limit,search:query.search},{page:2,limit:20,search:'test'});
  assert.deepEqual(paginationMeta(2,20,45),{page:2,limit:20,total:45,pages:3});
});

test('Azərbaycan telefon nömrəsi vahid göstərim formatına salınır',()=>{
  assert.equal(normalizeAzerbaijanPhone('+994 12 345 67 89'), '+994 12 345 67 89');
  assert.equal(normalizeAzerbaijanPhone('0501234567'), '+994 50 123 45 67');
  assert.equal(normalizeAzerbaijanPhone('994501234567'), '+994 50 123 45 67');
  assert.equal(azerbaijanPhoneSchema.parse('+994501234567'), '+994 50 123 45 67');
  assert.equal(normalizeAzerbaijanPhone('+90 501 234 56 78'), null);
  assert.equal(azerbaijanPhoneSchema.safeParse('12345').success, false);
});
