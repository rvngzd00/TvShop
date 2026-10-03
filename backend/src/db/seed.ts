import { env } from '../config/env.js';
import { hashPassword } from '../core/password.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../auth/permissions.js';
import { closePool, withTransaction } from './pool.js';
import type { PoolClient } from 'pg';

const demoCategories = [
  ['Elektronika', 'elektronika', 'Telefon, kompüter, smart cihaz və gündəlik texnologiya məhsulları'],
  ['Ev & Mətbəx', 'ev-metbex', 'Ev, mətbəx, təmir və rahat yaşayış üçün praktik məhsullar'],
  ['Moda', 'moda', 'Geyim, ayaqqabı, çanta və mövsümi aksesuar seçimləri'],
  ['Gözəllik & Sağlamlıq', 'gozellik-saglamliq', 'Şəxsi qulluq, gözəllik və sağlam həyat məhsulları'],
  ['Qida', 'qida', 'Gündəlik qida, yerli məhsul və seçilmiş dadlar'],
  ['Uşaq', 'usaq', 'Uşaqlar üçün oyun, təhsil, geyim və qulluq məhsulları'],
  ['Avtomobil', 'avtomobil', 'Avtomobil aksesuarları, qulluq və sürücü məhsulları'],
  ['Xidmətlər', 'xidmetler', 'Bakı üzrə etibarlı gündəlik və peşəkar xidmət paketləri'],
  ['Hədiyyələr', 'hediyyeler', 'Hədiyyə üçün seçilmiş promo məhsullar və xüsusi təkliflər']
] as const;

const baseDemoProducts = [
  { sku: 'DB-MIL-001', title: 'Milwaukee M18 zərbəli drel dəsti', slug: 'milwaukee-m18-zerbeli-drel-desti', brand: 'Milwaukee', brandSlug: 'milwaukee', category: 'elektronika', image: 'milwaukee-brand-product.webp', price: 549, compareAt: 629, stock: 18, short: 'Güclü mühərrik, iki akkumulyator və daşıma çantası ilə peşəkar dəst.' },
  { sku: 'DB-DEW-002', title: 'DeWalt XR simsiz vintaçan', slug: 'dewalt-xr-simsiz-vintacan', brand: 'DeWalt', brandSlug: 'dewalt', category: 'elektronika', image: 'dewolt-brand-product-2.webp', price: 389, compareAt: 449, stock: 24, short: 'Kompakt gövdə, yüksək fırlanma anı və uzunmüddətli XR batareya.' },
  { sku: 'DB-MAK-003', title: 'Makita peşəkar bucaq cilalayıcı', slug: 'makita-pesekar-bucaq-cilalayici', brand: 'Makita', brandSlug: 'makita', category: 'elektronika', image: 'makitta-brand-product.webp', price: 279, compareAt: 319, stock: 15, short: 'Metal və daş səthlər üçün təhlükəsiz, balanslı və məhsuldar cilalayıcı.' },
  { sku: 'DB-BOS-004', title: 'Bosch Professional alət dəsti', slug: 'bosch-professional-alet-desti', brand: 'Bosch', brandSlug: 'bosch', category: 'elektronika', image: 'bosch-brand-product-2.webp', price: 699, compareAt: 789, stock: 9, short: 'Gündəlik peşəkar işlər üçün seçilmiş alətlərdən ibarət universal dəst.' },
  { sku: 'DB-FES-005', title: 'Festool dəqiq kəsim mişarı', slug: 'festool-deqiq-kesim-misari', brand: 'Festool', brandSlug: 'festool', category: 'ev-metbex', image: 'festool-brand-product.webp', price: 1199, compareAt: 1349, stock: 6, short: 'Təmiz və dəqiq kəsim üçün bələdçi relsli premium emalatxana mişarı.' },
  { sku: 'DB-MET-006', title: 'Metabo universal emalatxana dəsti', slug: 'metabo-universal-emalatxana-desti', brand: 'Metabo', brandSlug: 'metabo', category: 'ev-metbex', image: 'melabo-brand-product.webp', price: 459, compareAt: 519, stock: 12, short: 'Təmir və montaj işləri üçün dayanıqlı, rahat və funksional alət seçimi.' },
  { sku: 'DB-JET-007', title: 'JET masaüstü ağac dəzgahı', slug: 'jet-masaustu-agac-dezgahi', brand: 'JET', brandSlug: 'jet', category: 'ev-metbex', image: 'jet-brand-product.webp', price: 949, compareAt: 1099, stock: 5, short: 'Kiçik emalatxanalar üçün stabil konstruksiyalı dəqiq ağac emalı dəzgahı.' },
  { sku: 'DB-MAX-008', title: 'MAX pnevmatik mismar tapançası', slug: 'max-pnevmatik-mismar-tapancasi', brand: 'MAX', brandSlug: 'max', category: 'elektronika', image: 'max-brand-product.webp', price: 429, compareAt: 479, stock: 11, short: 'Sürətli montaj, erqonomik tutuş və ardıcıl işləmə üçün peşəkar model.' },
  { sku: 'DB-MIL-009', title: 'Milwaukee yüksək torklu zərbəli açar', slug: 'milwaukee-yuksek-torklu-zerbeli-acar', brand: 'Milwaukee', brandSlug: 'milwaukee', category: 'elektronika', image: 'impact-wrenches.webp', price: 619, compareAt: 699, stock: 14, short: 'Avtomobil və ağır montaj işləri üçün yüksək tork və ağıllı idarəetmə.' },
  { sku: 'DB-BOS-010', title: 'Bosch yaşıl lazer səviyyəölçən', slug: 'bosch-yasil-lazer-seviyyeolcen', brand: 'Bosch', brandSlug: 'bosch', category: 'elektronika', image: 'laser-levels.webp', price: 239, compareAt: 279, stock: 21, short: 'Parlaq yaşıl şüa, avtomatik nivelirləmə və rahat tripod bağlantısı.' },
  { sku: 'DB-MAK-011', title: 'Makita akkumulyatorlu dairəvi mişar', slug: 'makita-akkumulyatorlu-dairevi-misar', brand: 'Makita', brandSlug: 'makita', category: 'ev-metbex', image: 'saws.webp', price: 489, compareAt: 559, stock: 10, short: 'Kabelsiz işləmə rahatlığı və müxtəlif materiallarda təmiz kəsim.' },
  { sku: 'DB-DEW-012', title: 'DeWalt orbital zımpara cihazı', slug: 'dewalt-orbital-zimpara-cihazi', brand: 'DeWalt', brandSlug: 'dewalt', category: 'ev-metbex', image: 'sanders.webp', price: 219, compareAt: 259, stock: 19, short: 'Aşağı vibrasiya və effektiv toz toplama ilə hamar səth nəticəsi.' },
  { sku: 'DB-KLE-013', title: 'Klein Tools elektrikçi alət dəsti', slug: 'klein-tools-elektrikci-alet-desti', brand: 'Klein Tools', brandSlug: 'klein-tools', category: 'ev-metbex', image: 'hand-tools.webp', price: 329, compareAt: 379, stock: 13, short: 'Elektrik montajı üçün təhlükəsiz və rahat əsas əl alətləri dəsti.' },
  { sku: 'DB-STA-014', title: 'Stabila maqnitli su tərəzisi', slug: 'stabila-maqnitli-su-terezisi', brand: 'Stabila', brandSlug: 'stabila', category: 'elektronika', image: 'levels.webp', price: 149, compareAt: 179, stock: 22, short: 'Güclü maqnit, aydın göstərici və dayanıqlı gövdə ilə dəqiq ölçmə.' },
  { sku: 'DB-RIK-015', title: 'RIKON dəzgahüstü qazma dəzgahı', slug: 'rikon-dezgahustu-qazma-dezgahi', brand: 'RIKON', brandSlug: 'rikon', category: 'ev-metbex', image: 'drills.webp', price: 799, compareAt: 899, stock: 7, short: 'Emalatxanada sabit, təhlükəsiz və dəqiq qazma əməliyyatları üçün dəzgah.' },
  { sku: 'DB-ROL-016', title: 'Rolair səssiz hava kompressoru', slug: 'rolair-sessiz-hava-kompressoru', brand: 'Rolair', brandSlug: 'rolair', category: 'ev-metbex', image: 'air-compressors.webp', price: 729, compareAt: 829, stock: 8, short: 'Aşağı səs səviyyəsi və stabil hava təzyiqi ilə emalatxana kompressoru.' },
  { sku: 'DB-TOU-017', title: 'ToughBuilt modul alət çantası', slug: 'toughbuilt-modul-alet-cantasi', brand: 'ToughBuilt', brandSlug: 'toughbuilt', category: 'ev-metbex', image: 'Tool-Accessories-1.webp', price: 189, compareAt: 229, stock: 27, short: 'Modul bölmələr və möhkəm material ilə alətlərin rahat daşınması.' },
  { sku: 'DB-TRI-018', title: 'Triton dəqiq frez aləti', slug: 'triton-deqiq-frez-aleti', brand: 'Triton', brandSlug: 'triton', category: 'ev-metbex', image: 'power-tools.webp', price: 579, compareAt: 649, stock: 9, short: 'Ağac emalında nəzarətli sürət və dəqiq frezləmə üçün peşəkar alət.' },
  { sku: 'DB-STN-019', title: 'Stanley çəkic və toxmaq dəsti', slug: 'stanley-cekic-ve-toxmaq-desti', brand: 'Stanley', brandSlug: 'stanley', category: 'ev-metbex', image: 'hammers-mallets.webp', price: 119, compareAt: 149, stock: 31, short: 'Təmir və montaj işləri üçün balanslı, möhkəm çəkic və toxmaq seçimi.' },
  { sku: 'DB-MIL-020', title: 'Milwaukee Shockwave burğu dəsti', slug: 'milwaukee-shockwave-burgu-desti', brand: 'Milwaukee', brandSlug: 'milwaukee', category: 'ev-metbex', image: 'drill-bits.webp', price: 169, compareAt: 199, stock: 25, short: 'Zərbəli alətlər üçün uzunömürlü və çoxölçülü peşəkar burğu dəsti.' }
] as const;

const extraProductGroups = [
  {
    category: 'elektronika', prefix: 'ELC', brand: 'TechPoint', brandSlug: 'techpoint',
    image: '/assets/images/categories/magaza/elektronika.jpg', basePrice: 249,
    products: ['TechPoint ağıllı ev mərkəzi', 'TechPoint portativ enerji stansiyası']
  },
  {
    category: 'moda', prefix: 'MOD', brand: 'Urban Baku', brandSlug: 'urban-baku',
    image: '/assets/images/categories/magaza/moda.jpg', basePrice: 49,
    products: ['Klassik kişi köynəyi', 'Qadın gündəlik çantası', 'Uniseks şəhər idman ayaqqabısı', 'Yüngül yay gödəkçəsi', 'Premium dəri kəmər', 'Minimalist qol saatı', 'Rahat pambıq sviter', 'Şəhər üslublu gün eynəyi', 'Zərif ipək şərf', 'Su keçirməyən bel çantası']
  },
  {
    category: 'gozellik-saglamliq', prefix: 'GZS', brand: 'Caspian Care', brandSlug: 'caspian-care',
    image: '/assets/images/categories/magaza/gozellik-saglamliq.jpg', basePrice: 19,
    products: ['Nəmləndirici üz kremi', 'Təbii saç baxım serumu', 'Günəşdən qoruyucu SPF 50', 'Elektrik üz təmizləmə cihazı', 'Vitamin C dəri serumu', 'Aromatik bədən baxım dəsti', 'Ortopedik boyun yastığı', 'Rəqəmsal təzyiq ölçən', 'Masaj üçün efir yağları dəsti', 'Gündəlik multivitamin kompleksi']
  },
  {
    category: 'qida', prefix: 'QDA', brand: 'Bakı Dadları', brandSlug: 'baki-dadlari',
    image: '/assets/images/categories/magaza/qida.jpg', basePrice: 8,
    products: ['Premium dağ balı 500 q', 'Yerli çay kolleksiyası', 'Qurudulmuş meyvə səbəti', 'Seçilmiş qəhvə dənələri 500 q', 'Təbii nar şirəsi dəsti', 'Ənənəvi mürəbbə kolleksiyası', 'Çərəz və quru meyvə qarışığı', 'Səhər yeməyi hədiyyə qutusu', 'Organik zeytun yağı 750 ml', 'Azərbaycan şirniyyatı seçməsi']
  },
  {
    category: 'usaq', prefix: 'USQ', brand: 'Balaca Dünya', brandSlug: 'balaca-dunya',
    image: '/assets/images/categories/magaza/usaq.jpg', basePrice: 24,
    products: ['Yaradıcı konstruktor dəsti', 'İnteraktiv Azərbaycan əlifbası', 'Uşaq üçün rəsm ləvazimatları', 'Təhlükəsiz taxta oyuncaq dəsti', 'Məktəbli ergonomik bel çantası', 'Uşaq yataq tekstili dəsti', 'Balacalar üçün balans velosipedi', 'Məntiq və yaddaş oyunu', 'Uşaq termosu və nahar qutusu', 'Nağıl kitabları kolleksiyası']
  },
  {
    category: 'avtomobil', prefix: 'AVT', brand: 'AutoBaku', brandSlug: 'autobaku',
    image: '/assets/images/categories/magaza/avtomobil.jpg', basePrice: 29,
    products: ['Portativ avtomobil kompressoru', 'Salon üçün premium ayaqaltı dəsti', 'Simsiz telefon şarj tutacağı', 'Avtomobil videoqeydiyyatçısı', 'Təcili yardım alət çantası', 'Keramik kuzov qoruma dəsti', 'Universal baqaj organizeri', 'Rəqəmsal təkər təzyiq ölçəni', 'Avtomobil üçün tozsoran', 'LED yol təhlükəsizlik dəsti']
  },
  {
    category: 'xidmetler', prefix: 'XDM', brand: 'Bakı Usta', brandSlug: 'baki-usta',
    image: '/assets/images/categories/magaza/xidmetler.jpg', basePrice: 35,
    products: ['Ev üçün elektrik ustası xidməti', 'Kondisioner təmizləmə xidməti', 'Peşəkar ev təmizliyi paketi', 'Santexnika diaqnostikası', 'Mebel yığılması xidməti', 'Kompüter texniki dəstək paketi', 'Avtomobil səyyar diaqnostikası', 'Foto və video çəkiliş paketi', 'Kuryer və sürətli çatdırılma', 'Ev heyvanına gündəlik qulluq']
  }
] as const;

function demoSlug(value: string): string {
  return value.toLocaleLowerCase('az-AZ')
    .replaceAll('ə', 'e').replaceAll('ı', 'i').replaceAll('ö', 'o').replaceAll('ü', 'u')
    .replaceAll('ş', 's').replaceAll('ç', 'c').replaceAll('ğ', 'g')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const extraDemoProducts = extraProductGroups.flatMap((group) => group.products.map((title, index) => {
  const price = group.basePrice + index * (group.category === 'qida' ? 3 : 11);
  return {
    sku: `GB-${group.prefix}-${String(index + 1).padStart(3, '0')}`,
    title,
    slug: demoSlug(`${group.category}-${title}`),
    brand: group.brand,
    brandSlug: group.brandSlug,
    category: group.category,
    image: group.image,
    price,
    compareAt: Math.ceil(price * 1.18),
    stock: group.category === 'xidmetler' ? 50 : 12 + (index * 7) % 37,
    short: `${title} üçün ətraflı təqdimat, aktual qiymət, zəmanətli xidmət və sürətli Bakı çatdırılması.`
  };
}));

const demoProducts = [...baseDemoProducts, ...extraDemoProducts];

for (const [, slug] of demoCategories) {
  const count = demoProducts.filter((product, index) => product.category === slug
    || (slug === 'hediyyeler' && [0, 1, 3, 6, 7, 8, 10, 13, 15, 17].includes(index))).length;
  if (count < 10) throw new Error(`Demo kateqoriyası üçün minimum 10 məhsul tələb olunur: ${slug} (${count})`);
}

const categoryImageUrls: Record<string, string> = {
  elektronika: '/assets/images/categories/magaza/elektronika.jpg',
  'ev-metbex': '/assets/images/categories/magaza/ev-metbex.jpg',
  moda: '/assets/images/categories/magaza/moda.jpg',
  'gozellik-saglamliq': '/assets/images/categories/magaza/gozellik-saglamliq.jpg',
  qida: '/assets/images/categories/magaza/qida.jpg',
  usaq: '/assets/images/categories/magaza/usaq.jpg',
  avtomobil: '/assets/images/categories/magaza/avtomobil.jpg',
  xidmetler: '/assets/images/categories/magaza/xidmetler.jpg',
  hediyyeler: '/assets/images/categories/baki-club/hediyyeler.jpg'
};

type StorefrontTaxonomy = {
  department: string;
  name: string;
  slug: string;
  children: Array<{ name: string; slug: string; description: string }>;
};

const storefrontTaxonomy: StorefrontTaxonomy[] = [
  { department: 'elektronika', name: 'Peşəkar alətlər', slug: 'elektronika-pesekar-aletler', children: [
    { name: 'Elektrik alətləri', slug: 'simsiz-elektrik-aletleri', description: 'Drel, vintaçan, cilalayıcı və peşəkar elektrik alətləri' },
    { name: 'Ölçü cihazları', slug: 'olcu-cihazlari-elektronika', description: 'Lazer, səviyyəölçən və dəqiq ölçü cihazları' }
  ] },
  { department: 'elektronika', name: 'Ağıllı texnologiyalar', slug: 'agilli-texnologiyalar', children: [
    { name: 'Ağıllı ev', slug: 'agilli-ev-cihazlari', description: 'Ağıllı ev mərkəzləri və qoşulan gündəlik cihazlar' },
    { name: 'Enerji və şarj', slug: 'enerji-ve-sarj', description: 'Portativ enerji və şarj həlləri' }
  ] },
  { department: 'ev-metbex', name: 'Emalatxana', slug: 'ev-emalatxana', children: [
    { name: 'Dəzgah və kəsim', slug: 'dezgah-ve-kesim', description: 'Kəsim, qazma, frez və emalatxana dəzgahları' },
    { name: 'Kompressor və pnevmatika', slug: 'kompressor-pnevmatika', description: 'Hava kompressorları və pnevmatik avadanlıq' }
  ] },
  { department: 'ev-metbex', name: 'Əl alətləri və saxlama', slug: 'el-aletleri-saxlama', children: [
    { name: 'Alət dəstləri', slug: 'el-alet-destleri', description: 'Təmir və montaj üçün hazır əl aləti dəstləri' },
    { name: 'Aksesuar və saxlama', slug: 'alet-aksesuarlari', description: 'Burğu, çanta, organizer və alət aksesuarları' }
  ] },
  { department: 'moda', name: 'Geyim', slug: 'moda-geyim', children: [
    { name: 'Üst geyim', slug: 'ust-geyim', description: 'Gödəkçə, sviter və mövsümi üst geyimləri' },
    { name: 'Gündəlik geyim', slug: 'gundelik-geyim', description: 'Rahat gündəlik geyim seçimləri' }
  ] },
  { department: 'moda', name: 'Moda aksesuarları', slug: 'moda-aksesuarlari', children: [
    { name: 'Çanta və kəmərlər', slug: 'canta-kemer', description: 'Şəhər çantaları, bel çantaları və dəri kəmərlər' },
    { name: 'Saat və eynəklər', slug: 'saat-eynek', description: 'Qol saatı, gün eynəyi və aksesuarlar' }
  ] },
  { department: 'moda', name: 'Ayaqqabılar', slug: 'moda-ayaqqabilar', children: [
    { name: 'Gündəlik ayaqqabı', slug: 'gundelik-ayaqqabi', description: 'Şəhər və gündəlik istifadə üçün ayaqqabılar' },
    { name: 'Uşaq ayaqqabısı', slug: 'usaq-ayaqqabisi', description: 'Uşaqlar üçün rahat ayaqqabı seçimləri' }
  ] },
  { department: 'gozellik-saglamliq', name: 'Dəri və saç baxımı', slug: 'deri-sac-baximi', children: [
    { name: 'Üz və dəri baxımı', slug: 'uz-deri-baximi', description: 'Üz kremi, serum və günəşdən qorunma məhsulları' },
    { name: 'Saç və bədən baxımı', slug: 'sac-beden-baximi', description: 'Saç, bədən və aromatik qulluq məhsulları' }
  ] },
  { department: 'gozellik-saglamliq', name: 'Sağlamlıq məhsulları', slug: 'saglamliq-mehsullari', children: [
    { name: 'Vitaminlər', slug: 'vitaminler', description: 'Gündəlik vitamin və sağlam həyat əlavələri' },
    { name: 'Sağlamlıq cihazları', slug: 'saglamliq-cihazlari', description: 'Təzyiq ölçən və rahatlıq cihazları' }
  ] },
  { department: 'qida', name: 'İçkilər', slug: 'icgiler', children: [
    { name: 'Çay və qəhvə', slug: 'cay-qehve', description: 'Seçilmiş çay və qəhvə kolleksiyaları' },
    { name: 'Təbii şirələr', slug: 'tebii-sireler', description: 'Təbii və yerli meyvə şirələri' }
  ] },
  { department: 'qida', name: 'Təbii və yerli məhsullar', slug: 'yerli-mehsullar', children: [
    { name: 'Bal, yağ və mürəbbə', slug: 'bal-yag-murebbe', description: 'Yerli bal, yağ və ənənəvi mürəbbələr' },
    { name: 'Şirniyyat və çərəzlər', slug: 'sirniyyat-cerez', description: 'Şirniyyat, çərəz və hədiyyə qutuları' }
  ] },
  { department: 'usaq', name: 'Oyuncaq və inkişaf', slug: 'oyuncaq-inkisaf', children: [
    { name: 'İnkişaf oyunları', slug: 'inkisaf-oyunlari', description: 'Məntiq, yaddaş və erkən inkişaf oyunları' },
    { name: 'Yaradıcı dəstlər', slug: 'yaradici-destler', description: 'Konstruktor, rəsm və yaradıcı fəaliyyət dəstləri' }
  ] },
  { department: 'usaq', name: 'Məktəb və gündəlik', slug: 'mekteb-gundelik', children: [
    { name: 'Məktəb ləvazimatları', slug: 'mekteb-levazimatlari', description: 'Məktəb çantası, kitab və tədris ləvazimatları' },
    { name: 'Tekstil və qidalanma', slug: 'usaq-tekstili-qidalanma', description: 'Uşaq tekstili, termos və nahar qutuları' }
  ] },
  { department: 'usaq', name: 'Körpə baxımı', slug: 'korpe-baximi', children: [
    { name: 'Körpə gigiyenası', slug: 'korpe-gigiyenasi', description: 'Körpələr üçün gündəlik qulluq məhsulları' },
    { name: 'Körpə geyimi', slug: 'korpe-geyimi', description: 'Körpələr üçün yumşaq və rahat geyimlər' }
  ] },
  { department: 'avtomobil', name: 'Avtomobil elektronikası', slug: 'avtomobil-elektronikasi', children: [
    { name: 'Video və enerji', slug: 'video-enerji', description: 'Videoqeydiyyatçı, şarj və portativ enerji cihazları' },
    { name: 'Təzyiq və diaqnostika', slug: 'tezyiq-diaqnostika', description: 'Təzyiq və diaqnostika vasitələri' }
  ] },
  { department: 'avtomobil', name: 'Qulluq və aksesuar', slug: 'qulluq-aksesuar', children: [
    { name: 'Salon və təşkilat', slug: 'salon-teskilat', description: 'Ayaqaltı, organizer və salon aksesuarları' },
    { name: 'Təhlükəsizlik və qulluq', slug: 'tehlukesizlik-qulluq', description: 'Təcili yardım və kuzov qulluq dəstləri' }
  ] },
  { department: 'xidmetler', name: 'Ev xidmətləri', slug: 'ev-xidmetleri', children: [
    { name: 'Təmir və usta', slug: 'temir-usta', description: 'Elektrik, santexnika və məişət təmiri xidmətləri' },
    { name: 'Təmizlik və mebel', slug: 'temizlik-mebel', description: 'Ev təmizliyi və mebel yığılması xidmətləri' }
  ] },
  { department: 'xidmetler', name: 'Texniki və mobil xidmətlər', slug: 'texniki-mobil-xidmetler', children: [
    { name: 'Texniki dəstək', slug: 'texniki-destek', description: 'Kompüter və səyyar texniki dəstək xidmətləri' },
    { name: 'Çatdırılma və çəkiliş', slug: 'catdirilma-cekilis', description: 'Kuryer, foto və video xidmətləri' }
  ] },
  { department: 'hediyyeler', name: 'Hədiyyə seçimləri', slug: 'hediyye-secimleri', children: [
    { name: 'Texnologiya hədiyyələri', slug: 'texnologiya-hediyyeleri', description: 'Texnologiya sevənlər üçün seçilmiş hədiyyələr' },
    { name: 'Ev üçün hədiyyələr', slug: 'ev-ucun-hediyyeler', description: 'Ev üçün praktik hədiyyələr' }
  ] },
  { department: 'hediyyeler', name: 'Xüsusi günlər', slug: 'xususi-gunler', children: [
    { name: 'Ad günü', slug: 'ad-gunu-hediyyeleri', description: 'Ad günü üçün seçilmiş hədiyyə ideyaları' },
    { name: 'Korporativ hədiyyələr', slug: 'korporativ-hediyyeler', description: 'Komandalar üçün korporativ hədiyyələr' }
  ] }
];

function storefrontLeafForProduct(item: typeof demoProducts[number]): string | null {
  const title = item.title.toLocaleLowerCase('az-AZ');
  if (item.category === 'elektronika') {
    if (/lazer|səviyyə|tərəzi/.test(title)) return 'olcu-cihazlari-elektronika';
    if (title.includes('ağıllı ev')) return 'agilli-ev-cihazlari';
    if (title.includes('enerji stansiyası')) return 'enerji-ve-sarj';
    return 'simsiz-elektrik-aletleri';
  }
  if (item.category === 'ev-metbex') {
    if (title.includes('kompressor')) return 'kompressor-pnevmatika';
    if (/dəst|çəkic/.test(title)) return 'el-alet-destleri';
    if (/çanta|burğu/.test(title)) return 'alet-aksesuarlari';
    return 'dezgah-ve-kesim';
  }
  if (item.category === 'moda') {
    if (title.includes('ayaqqabı')) return 'gundelik-ayaqqabi';
    if (/çanta|kəmər/.test(title)) return 'canta-kemer';
    if (/saat|eynək|şərf/.test(title)) return 'saat-eynek';
    return /gödəkçə|sviter/.test(title) ? 'ust-geyim' : 'gundelik-geyim';
  }
  if (item.category === 'gozellik-saglamliq') {
    if (/saç|bədən|yağ/.test(title)) return 'sac-beden-baximi';
    if (title.includes('vitamin')) return 'vitaminler';
    if (/təzyiq|yastıq/.test(title)) return 'saglamliq-cihazlari';
    return 'uz-deri-baximi';
  }
  if (item.category === 'qida') {
    if (/çay|qəhvə/.test(title)) return 'cay-qehve';
    if (title.includes('şirə')) return 'tebii-sireler';
    if (/bal|yağ|mürəbbə/.test(title)) return 'bal-yag-murebbe';
    return 'sirniyyat-cerez';
  }
  if (item.category === 'usaq') {
    if (/konstruktor|rəsm/.test(title)) return 'yaradici-destler';
    if (/məktəb|kitab|əlifba/.test(title)) return 'mekteb-levazimatlari';
    if (/tekstili|termos|nahar/.test(title)) return 'usaq-tekstili-qidalanma';
    return 'inkisaf-oyunlari';
  }
  if (item.category === 'avtomobil') {
    if (/video|şarj|kompressor/.test(title)) return 'video-enerji';
    if (/təzyiq|diaqnostika/.test(title)) return 'tezyiq-diaqnostika';
    if (/ayaqaltı|organizer|tutacaq/.test(title)) return 'salon-teskilat';
    return 'tehlukesizlik-qulluq';
  }
  if (item.category === 'xidmetler') {
    if (/elektrik|santexnika|kondisioner|heyvan/.test(title)) return 'temir-usta';
    if (/təmizlik|mebel/.test(title)) return 'temizlik-mebel';
    if (/kompüter|diaqnostika/.test(title)) return 'texniki-destek';
    return 'catdirilma-cekilis';
  }
  return null;
}

const operationalModerators = [
  {
    email: 'seide@gundelikbaki.az',
    passwordHash: 'scrypt$32768$8$1$-yj0M6_bvXK5645ts_mQsg$HFc_jqt22bfOyRw0vfjMQ2BzjVC6MThlMkY88RhkjR2B30fog3REOCVcR0taLoxa5jVSDNeWACRTRjayg7AjSA',
    firstName: 'Səidə',
    lastName: 'Moderator'
  },
  {
    email: 'dilsad@gundelikbaki.az',
    passwordHash: 'scrypt$32768$8$1$WKO4uMLXmLnDtgJW1Teahg$Pk9QRtCTlwJeZ0VhF5Ala94Bc08umrhor-kNYE-G06curG8nydxh2C9KOavu71FlYAtE1f6wtiqBXWeOrrB9cw',
    firstName: 'Dilşad',
    lastName: 'Moderator'
  }
] as const;

async function syncOperationalUsers(client: PoolClient, storeId: string, grantedBy: string): Promise<void> {
  const moderatorEmails = operationalModerators.map((moderator) => moderator.email);
  for (const moderator of operationalModerators) {
    const result = await client.query<{ id: string }>(`
      INSERT INTO users (email, phone, password_hash, first_name, last_name, status, email_verified_at, phone_verified_at, failed_login_count, locked_until, deleted_at)
      VALUES ($1, NULL, $2, $3, $4, 'active', now(), NULL, 0, NULL, NULL)
      ON CONFLICT (email) DO UPDATE SET
        phone=NULL,
        password_hash=EXCLUDED.password_hash,
        first_name=EXCLUDED.first_name,
        last_name=EXCLUDED.last_name,
        status='active',
        email_verified_at=coalesce(users.email_verified_at, now()),
        phone_verified_at=NULL,
        failed_login_count=0,
        locked_until=NULL,
        deleted_at=NULL
      RETURNING id
    `, [moderator.email, moderator.passwordHash, moderator.firstName, moderator.lastName]);
    const userId = result.rows[0]!.id;
    await client.query('DELETE FROM user_roles WHERE user_id=$1', [userId]);
    await client.query(`
      INSERT INTO user_roles(user_id, role_id, store_id, granted_by)
      SELECT $1, id, $2, $3 FROM roles WHERE code='moderator'
      ON CONFLICT DO NOTHING
    `, [userId, storeId, grantedBy]);
  }

  await client.query(`
    UPDATE users u
    SET email=('deleted+'||u.id::text||'@deleted.invalid')::citext,
      phone=NULL,
      status='disabled',
      failed_login_count=0,
      locked_until=NULL,
      deleted_at=coalesce(u.deleted_at, now())
    WHERE u.deleted_at IS NULL
      AND lower(u.email::text) <> ALL($1::text[])
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=u.id AND r.code='super_admin'
      )
  `, [moderatorEmails]);
  await client.query(`
    UPDATE refresh_sessions rs
    SET revoked_at=now()
    WHERE rs.revoked_at IS NULL
      AND EXISTS (SELECT 1 FROM users u WHERE u.id=rs.user_id AND u.deleted_at IS NOT NULL)
  `);
}

async function seed(): Promise<void> {
  const passwordHash = await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD);

  await withTransaction(async (client) => {
    const storeResult = await client.query<{ id: string }>(`
      INSERT INTO stores (code, name, primary_domain, settings)
      VALUES ($1, 'TVShop', 'tvshop.az', $2)
      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,primary_domain=EXCLUDED.primary_domain,settings=EXCLUDED.settings || stores.settings
      RETURNING id
    `, [env.DEFAULT_STORE_CODE, JSON.stringify({
      demo: true,
      supportEmail: 'support@tvshop.az',
      supportPhone: '+994 50 264 54 00',
      businessHours: 'Bazar ertəsi–Şənbə, 09:00–19:00',
      shipping: { city: 'Bakı', sameDayMinimum: 100 },
      social: { instagram: '@tvshop.az', facebook: 'tvshop.az' }
    })]);
    const storeId = storeResult.rows[0]!.id;

    for (const permission of PERMISSIONS) {
      await client.query(`
        INSERT INTO permissions (code, description)
        VALUES ($1, $2)
        ON CONFLICT (code) DO NOTHING
      `, [permission, permission]);
    }

    for (const [roleCode, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      const roleResult = await client.query<{ id: string }>(`
        INSERT INTO roles (code, name, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `, [roleCode, roleCode.replaceAll('_', ' '), `${roleCode} system role`]);
      const roleId = roleResult.rows[0]!.id;

      if (roleCode === 'moderator') {
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
      }

      for (const permission of permissions) {
        await client.query(`
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT $1, id FROM permissions WHERE code = $2
          ON CONFLICT DO NOTHING
        `, [roleId, permission]);
      }
    }

    const userResult = await client.query<{ id: string }>(`
      INSERT INTO users (email, password_hash, first_name, last_name, email_verified_at)
      VALUES ($1, $2, 'Super', 'Admin', now())
      ON CONFLICT (email) DO UPDATE
        SET password_hash = CASE
          WHEN users.last_login_at IS NULL THEN EXCLUDED.password_hash
          ELSE users.password_hash
        END
      RETURNING id
    `, [env.BOOTSTRAP_ADMIN_EMAIL, passwordHash]);

    await client.query(`
      INSERT INTO user_roles (user_id, role_id, store_id)
      SELECT $1, id, $2 FROM roles WHERE code = 'super_admin'
      ON CONFLICT DO NOTHING
    `, [userResult.rows[0]!.id, storeId]);

    const menuResult = await client.query<{ id: string }>(`
      INSERT INTO navigation_menus (store_id, code, name)
      VALUES ($1, 'main', 'Əsas menyu')
      ON CONFLICT (store_id, code, locale) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [storeId]);
    const menuId = menuResult.rows[0]!.id;

    const topItems = [
      ['Mağaza', '/magaza/'], ['Endirimlər', '/endirimler/'], ['Kuponlar', '/kuponlar/'],
      ['Kampaniyalar', '/kampaniyalar/'], ['Jurnal və Blog', '/jurnal/'],
      ['Bakı Club', '/baki-club/'], ['Elanlar', '/elanlar/'], ['Biznes üçün', '/biznes/']
    ];
    for (const [position, item] of topItems.entries()) {
      await client.query(`
        UPDATE navigation_items
        SET label=$2, position=$4, is_visible=true
        WHERE menu_id=$1 AND parent_id IS NULL AND url=$3
      `, [menuId, item![0], item![1], position]);
      await client.query(`
        INSERT INTO navigation_items (menu_id, label, url, position)
        SELECT $1, $2, $3, $4
        WHERE NOT EXISTS (
          SELECT 1 FROM navigation_items WHERE menu_id = $1 AND parent_id IS NULL AND url = $3
        )
      `, [menuId, item![0], item![1], position]);
    }

    const categoryIds = new Map<string, string>();
    for (const [position, [name, slug, description]] of demoCategories.entries()) {
      const categoryMedia = await client.query<{ id: string }>(`
        INSERT INTO media_assets (store_id, uploaded_by, storage_key, public_url, mime_type, byte_size, alt_text, title, metadata)
        VALUES ($1, $2, $3, $4, 'image/jpeg', 1, $5, $5, $6)
        ON CONFLICT (storage_key) DO UPDATE SET public_url=EXCLUDED.public_url, alt_text=EXCLUDED.alt_text, title=EXCLUDED.title
        RETURNING id
      `, [storeId, userResult.rows[0]!.id, `demo/categories/${slug}.jpg`, categoryImageUrls[slug], `${name} kateqoriyası`, JSON.stringify({ demo: true, kind: 'category' })]);
      const result = await client.query<{ id: string }>(`
        INSERT INTO categories (store_id, name, slug, description, image_asset_id, position, status, seo_title, seo_description)
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)
        ON CONFLICT (store_id, slug) DO UPDATE
          SET name=EXCLUDED.name, description=EXCLUDED.description, image_asset_id=EXCLUDED.image_asset_id,
            position=EXCLUDED.position, status='active', seo_title=EXCLUDED.seo_title, seo_description=EXCLUDED.seo_description
        RETURNING id
      `, [storeId, name, slug, description, categoryMedia.rows[0]!.id, position, `${name} | TVShop`, `${description}. TVShop-da sərfəli seçimləri kəşf edin.`]);
      categoryIds.set(slug, result.rows[0]!.id);
    }
    for (const [mainPosition, main] of storefrontTaxonomy.entries()) {
      const departmentId = categoryIds.get(main.department)!;
      const mainCategory = await client.query<{ id: string }>(`
        INSERT INTO categories(store_id,parent_id,name,slug,description,image_asset_id,position,status,seo_title,seo_description)
        SELECT $1,$2,$3,$4,$5,image_asset_id,$6,'active',$7,$8 FROM categories WHERE id=$2
        ON CONFLICT(store_id,slug) DO UPDATE SET parent_id=EXCLUDED.parent_id,name=EXCLUDED.name,
          description=EXCLUDED.description,image_asset_id=coalesce(categories.image_asset_id,EXCLUDED.image_asset_id),
          position=EXCLUDED.position,status='active',seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description
        RETURNING id
      `, [storeId, departmentId, main.name, main.slug, `${main.name} üzrə seçilmiş məhsullar`, mainPosition, `${main.name} | TVShop`, `${main.name} məhsulları və aktual qiymətlər.`]);
      categoryIds.set(main.slug, mainCategory.rows[0]!.id);
      for (const [childPosition, child] of main.children.entries()) {
        const childCategory = await client.query<{ id: string }>(`
          INSERT INTO categories(store_id,parent_id,name,slug,description,image_asset_id,position,status,seo_title,seo_description)
          SELECT $1,$2,$3,$4,$5,image_asset_id,$6,'active',$7,$8 FROM categories WHERE id=$2
          ON CONFLICT(store_id,slug) DO UPDATE SET parent_id=EXCLUDED.parent_id,name=EXCLUDED.name,
            description=EXCLUDED.description,image_asset_id=coalesce(categories.image_asset_id,EXCLUDED.image_asset_id),
            position=EXCLUDED.position,status='active',seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description
          RETURNING id
        `, [storeId, mainCategory.rows[0]!.id, child.name, child.slug, child.description, childPosition, `${child.name} | TVShop`, `${child.description}. Aktual qiymət və seçimlərə baxın.`]);
        categoryIds.set(child.slug, childCategory.rows[0]!.id);
      }
    }
    await client.query(`
      UPDATE categories SET status='inactive'
      WHERE store_id=$1 AND slug=ANY($2::text[])
    `, [storeId, ['elektrik-aletleri', 'olcu-cihazlari', 'bag-ve-emalatxana', 'aksesuarlar']]);

    const vendorResult = await client.query<{ id: string }>(`
      INSERT INTO vendors (store_id, display_name, legal_name, slug, email, phone, description, commission_rate, status, approved_at)
      VALUES ($1, 'Baku Pro Market', 'Baku Pro Market MMC', 'baku-pro-market', 'satis@bakupromarket.az', '+994 50 264 54 00',
        'TVShop demo kataloqu üçün təsdiqlənmiş peşəkar alət satıcısı.', 12, 'active', now())
      ON CONFLICT (store_id, slug) DO UPDATE SET
        display_name=EXCLUDED.display_name, legal_name=EXCLUDED.legal_name, description=EXCLUDED.description,
        commission_rate=EXCLUDED.commission_rate, status='active', approved_at=coalesce(vendors.approved_at, now())
      RETURNING id
    `, [storeId]);
    const vendorId = vendorResult.rows[0]!.id;

    const partnerVendors = [
      ['TechnoHome', 'TechnoHome Azərbaycan MMC', 'technohome', 'terefdas@technohome.example.az', '+994 12 310 20 10', 'Elektronika və ağıllı ev məhsulları üzrə demo tərəfdaş.', 10],
      ['Urban Life', 'Urban Life Retail MMC', 'urban-life', 'terefdas@urbanlife.example.az', '+994 12 310 20 20', 'Moda, gözəllik və həyat tərzi məhsulları üzrə demo tərəfdaş.', 14],
      ['Bakı Usta', 'Bakı Usta Xidmət MMC', 'baki-usta-xidmet', 'terefdas@bakiusta.example.az', '+994 12 310 20 30', 'Bakı üzrə yoxlanılmış peşəkar xidmət paketləri təqdim edən demo satıcı.', 9]
    ] as const;
    const partnerVendorIds = new Map<string, string>();
    for (const [displayName, legalName, slug, email, phone, description, commission] of partnerVendors) {
      const partner = await client.query<{ id: string }>(`
        INSERT INTO vendors (store_id, display_name, legal_name, slug, email, phone, description, commission_rate, status, approved_at, settings)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',now(),$9)
        ON CONFLICT (store_id,slug) DO UPDATE SET display_name=EXCLUDED.display_name,legal_name=EXCLUDED.legal_name,
          email=EXCLUDED.email,phone=EXCLUDED.phone,description=EXCLUDED.description,commission_rate=EXCLUDED.commission_rate,
          status='active',approved_at=coalesce(vendors.approved_at,now()),settings=EXCLUDED.settings,deleted_at=NULL
        RETURNING id
      `, [storeId, displayName, legalName, slug, email, phone, description, commission, JSON.stringify({ demo: true, payoutSchedule: 'monthly' })]);
      partnerVendorIds.set(slug, partner.rows[0]!.id);
    }

    const demoUsers = [
      { email: 'aysel.memmedova@example.az', phone: '+994 50 310 11 01', first: 'Aysel', last: 'Məmmədova', role: 'customer', vendor: null },
      { email: 'murad.aliyev@example.az', phone: '+994 50 310 11 02', first: 'Murad', last: 'Əliyev', role: 'customer', vendor: null },
      { email: 'nigar.hasenli@example.az', phone: '+994 50 310 11 03', first: 'Nigar', last: 'Həsənli', role: 'customer', vendor: null },
      { email: 'owner@technohome.example.az', phone: '+994 50 310 12 01', first: 'Tural', last: 'Qasımov', role: 'vendor_owner', vendor: 'technohome' },
      { email: 'owner@urbanlife.example.az', phone: '+994 50 310 12 02', first: 'Leyla', last: 'İsmayılova', role: 'vendor_owner', vendor: 'urban-life' },
      { email: 'owner@bakiusta.example.az', phone: '+994 50 310 12 03', first: 'Elvin', last: 'Rzayev', role: 'vendor_owner', vendor: 'baki-usta-xidmet' },
      { email: 'redaktor@gundelikbaki.example.az', phone: '+994 50 310 13 01', first: 'Səbinə', last: 'Hüseynova', role: 'editor', vendor: null }
    ] as const;
    const demoUserIds = new Map<string, string>();
    for (const person of demoUsers) {
      const created = await client.query<{ id: string }>(`
        INSERT INTO users (email,phone,password_hash,first_name,last_name,status,email_verified_at,phone_verified_at,preferences)
        VALUES ($1,$2,$3,$4,$5,'active',now(),now(),$6)
        ON CONFLICT (email) DO UPDATE SET phone=EXCLUDED.phone,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,
          status='active',email_verified_at=coalesce(users.email_verified_at,now()),phone_verified_at=coalesce(users.phone_verified_at,now()),
          preferences=EXCLUDED.preferences,deleted_at=NULL
        RETURNING id
      `, [person.email, person.phone, passwordHash, person.first, person.last, JSON.stringify({ locale: 'az-AZ', demo: true })]);
      const userId = created.rows[0]!.id;
      demoUserIds.set(person.email, userId);
      await client.query(`
        INSERT INTO user_roles(user_id,role_id,store_id,vendor_id,granted_by)
        SELECT $1,r.id,$2,$3,$4 FROM roles r WHERE r.code=$5
        ON CONFLICT DO NOTHING
      `, [userId, storeId, person.vendor ? partnerVendorIds.get(person.vendor) : null, userResult.rows[0]!.id, person.role]);
      if (person.role === 'customer') {
        await client.query(`
          INSERT INTO customer_profiles(user_id,display_name,first_name,last_name,email,phone)
          VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(user_id) WHERE user_id IS NOT NULL DO UPDATE SET display_name=EXCLUDED.display_name,
            first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,email=EXCLUDED.email,phone=EXCLUDED.phone
        `, [userId, `${person.first} ${person.last}`, person.first, person.last, person.email, person.phone]);
      }
    }

    const warehouseResult = await client.query<{ id: string }>(`
      INSERT INTO warehouses (store_id, vendor_id, name, code, address, status)
      VALUES ($1, NULL, 'Bakı əsas anbarı', 'DEMO-BAKU-01', $2, 'active')
      ON CONFLICT (store_id, code) DO UPDATE SET vendor_id=NULL, name=EXCLUDED.name, status='active'
      RETURNING id
    `, [storeId, JSON.stringify({ city: 'Bakı', district: 'Nərimanov', address: 'Ağa Neymətulla küçəsi 24' })]);
    const warehouseId = warehouseResult.rows[0]!.id;

    const brandIds = new Map<string, string>();
    const seededProducts: Array<{ productId: string; listingId: string; variantId: string; title: string; sku: string; price: number }> = [];
    for (const [productIndex, item] of demoProducts.entries()) {
      let brandId = brandIds.get(item.brandSlug);
      if (!brandId) {
        const brandResult = await client.query<{ id: string }>(`
          INSERT INTO brands (store_id, name, slug, description, status, seo_title, seo_description)
          VALUES ($1, $2, $3, $4, 'active', $5, $6)
          ON CONFLICT (store_id, slug) DO UPDATE SET name=EXCLUDED.name, status='active'
          RETURNING id
        `, [storeId, item.brand, item.brandSlug, `${item.brand} məhsullarının rəsmi demo vitrini.`, `${item.brand} məhsulları | TVShop`, `${item.brand} alətləri, qiymətlər və kampaniyalar.`]);
        brandId = brandResult.rows[0]!.id;
        brandIds.set(item.brandSlug, brandId);
      }

      const publicImageUrl = item.image.startsWith('/assets/') ? item.image : `/assets/wp-content/uploads/${item.image}`;
      const imageExtension = publicImageUrl.split('.').pop()?.toLowerCase() || 'jpg';
      const imageMime = imageExtension === 'webp' ? 'image/webp' : imageExtension === 'png' ? 'image/png' : 'image/jpeg';
      const storageKey = item.image.startsWith('/assets/') ? `demo/products/${item.sku.toLowerCase()}.${imageExtension}` : `demo/products/${item.image}`;
      const mediaResult = await client.query<{ id: string }>(`
        INSERT INTO media_assets (store_id, vendor_id, uploaded_by, storage_key, public_url, mime_type, byte_size, alt_text, title, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9)
        ON CONFLICT (storage_key) DO UPDATE SET public_url=EXCLUDED.public_url, mime_type=EXCLUDED.mime_type,
          alt_text=EXCLUDED.alt_text, title=EXCLUDED.title
        RETURNING id
      `, [storeId, vendorId, userResult.rows[0]!.id, storageKey, publicImageUrl, imageMime, `${item.title} — məhsul şəkli`, item.title, JSON.stringify({ demo: true, source: 'presentation-seed' })]);

      const productResult = await client.query<{ id: string }>(`
        INSERT INTO products (vendor_id, brand_id, sku, name, description, product_type, status, attributes, created_by, reviewed_by, reviewed_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'published', $7, $8, $8, now())
        ON CONFLICT (vendor_id, sku) DO UPDATE SET
          brand_id=EXCLUDED.brand_id, name=EXCLUDED.name, description=EXCLUDED.description,
          status='published', attributes=EXCLUDED.attributes, deleted_at=NULL
        RETURNING id
      `, [vendorId, brandId, item.sku, item.title, item.short, item.category === 'xidmetler' ? 'service' : 'physical', JSON.stringify({ zəmanət: '12 ay', çatdırılma: 'Bakı daxili 1 gün', mənşə: 'Demo təqdimat datası', demo: true }), userResult.rows[0]!.id]);
      const productId = productResult.rows[0]!.id;

      const listingResult = await client.query<{ id: string }>(`
        INSERT INTO product_listings (store_id, product_id, locale, title, slug, short_description, description, price,
          compare_at_price, currency, status, seo_title, seo_description, canonical_url, schema_data, published_at,
          is_featured, is_popular, is_top_pick, display_position, merchandising_badge)
        VALUES ($1, $2, 'az-AZ', $3, $4, $5, $6, $7, $8, 'AZN', 'published', $9, $10, $11, $12, now(), true, true, true, $13, $14)
        ON CONFLICT (store_id, product_id, locale) DO UPDATE SET
          title=EXCLUDED.title, slug=EXCLUDED.slug, short_description=EXCLUDED.short_description,
          description=EXCLUDED.description, price=EXCLUDED.price, compare_at_price=EXCLUDED.compare_at_price,
          status='published', seo_title=EXCLUDED.seo_title, seo_description=EXCLUDED.seo_description,
          canonical_url=EXCLUDED.canonical_url, schema_data=EXCLUDED.schema_data, published_at=coalesce(product_listings.published_at, now()),
          is_featured=true,is_popular=true,is_top_pick=true,display_position=EXCLUDED.display_position,merchandising_badge=EXCLUDED.merchandising_badge
        RETURNING id
      `, [storeId, productId, item.title, item.slug, item.short, `${item.short} Məhsul stokdadır, təhlükəsiz sifariş və sürətli çatdırılma mümkündür.`, item.price, item.compareAt, `${item.title} — qiymət və sifariş`, `${item.title}. Xüsusiyyətləri, aktual qiyməti və TVShop kampaniyasını yoxlayın.`, `/mehsul/${item.slug}/`, JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: item.title, sku: item.sku, offers: { '@type': 'Offer', price: item.price, priceCurrency: 'AZN', availability: 'https://schema.org/InStock' } }),productIndex,productIndex===3||productIndex===13?'hot':productIndex===7||productIndex===17?'new':[0,6,10,15].includes(productIndex)?'recommended':[1,8].includes(productIndex)?'sale':'none']);

      const primaryCategoryId = categoryIds.get(item.category)!;
      await client.query('UPDATE product_categories SET is_primary=false WHERE product_id=$1 AND category_id<>$2 AND is_primary=true', [productId, primaryCategoryId]);
      await client.query(`
        INSERT INTO product_categories (product_id, category_id, is_primary)
        VALUES ($1, $2, true)
        ON CONFLICT (product_id, category_id) DO UPDATE SET is_primary=true
      `, [productId, primaryCategoryId]);
      const storefrontLeaf = storefrontLeafForProduct(item);
      if (storefrontLeaf && categoryIds.has(storefrontLeaf)) {
        await client.query(`
          INSERT INTO product_categories(product_id,category_id,is_primary)
          VALUES($1,$2,false) ON CONFLICT(product_id,category_id) DO NOTHING
        `, [productId, categoryIds.get(storefrontLeaf)]);
      }
      if ([0, 1, 3, 6, 7, 8, 10, 13, 15, 17].includes(productIndex)) {
        await client.query(`
          INSERT INTO product_categories (product_id, category_id, is_primary)
          VALUES ($1, $2, false)
          ON CONFLICT (product_id, category_id) DO NOTHING
        `, [productId, categoryIds.get('hediyyeler')]);
        const giftLeaf = item.category === 'elektronika' ? 'texnologiya-hediyyeleri' : 'ev-ucun-hediyyeler';
        await client.query(`
          INSERT INTO product_categories(product_id,category_id,is_primary)
          VALUES($1,$2,false) ON CONFLICT(product_id,category_id) DO NOTHING
        `, [productId, categoryIds.get(giftLeaf)]);
      }
      await client.query(`
        INSERT INTO product_media (product_id, media_asset_id, position, is_primary)
        VALUES ($1, $2, 0, true)
        ON CONFLICT (product_id, media_asset_id) DO UPDATE SET position=0, is_primary=true
      `, [productId, mediaResult.rows[0]!.id]);
      const variantResult = await client.query<{ id: string }>(`
        INSERT INTO product_variants (product_id, sku, title, option_values, status)
        VALUES ($1, $2, 'Standart', '{}', 'active')
        ON CONFLICT (product_id, sku) DO UPDATE SET title='Standart', status='active'
        RETURNING id
      `, [productId, item.sku]);
      await client.query(`
        INSERT INTO inventory (variant_id, warehouse_id, quantity, reserved, reorder_level)
        VALUES ($1, $2, $3, 0, 5)
        ON CONFLICT (variant_id, warehouse_id) DO UPDATE SET quantity=EXCLUDED.quantity, reorder_level=EXCLUDED.reorder_level
      `, [variantResult.rows[0]!.id, warehouseId, item.stock]);
      seededProducts.push({ productId, listingId: listingResult.rows[0]!.id, variantId: variantResult.rows[0]!.id, title: item.title, sku: item.sku, price: item.price });
    }

    const customerEmails = ['aysel.memmedova@example.az', 'murad.aliyev@example.az', 'nigar.hasenli@example.az'] as const;
    const reviewSamples = [
      ['Çox uğurlu seçim', 'Məhsul təsvirə tam uyğundur, qablaşdırma səliqəli idi və çatdırılma vaxtında tamamlandı.', 5],
      ['Qiymətinə görə yaxşıdır', 'İstifadəsi rahatdır, keyfiyyəti gözlədiyimdən yaxşı çıxdı. Gündəlik istifadə üçün tövsiyə edirəm.', 4],
      ['Xidmət və məhsul əladır', 'Sifariş prosesi aydın oldu, məhsul problemsiz çatdı və dəstək komandası sualları tez cavablandırdı.', 5]
    ] as const;
    for (const [index, product] of seededProducts.slice(0, 24).entries()) {
      const customerIndex = index % customerEmails.length;
      const email = customerEmails[customerIndex]!;
      const sample = reviewSamples[customerIndex]!;
      const customerId = demoUserIds.get(email)!;
      await client.query(`
        INSERT INTO product_reviews(store_id,product_id,user_id,author_name,author_email,rating,title,body,status,verified_purchase,created_at)
        SELECT $1,$2,$3,concat(first_name,' ',last_name),email,$4,$5,$6,'published',true,now()-($7*interval '1 day')
        FROM users WHERE id=$3
        ON CONFLICT(store_id,product_id,user_id) WHERE user_id IS NOT NULL DO UPDATE SET
          rating=EXCLUDED.rating,title=EXCLUDED.title,body=EXCLUDED.body,status='published',verified_purchase=true
      `, [storeId, product.productId, customerId, sample[2], sample[0], sample[1], index + 1]);
    }

    for (const [customerIndex, email] of customerEmails.entries()) {
      const customerId = demoUserIds.get(email)!;
      await client.query(`
        INSERT INTO user_addresses(user_id,label,recipient_name,phone,city,district,address_line_1,is_default,address_type)
        SELECT id,'Əsas ünvan',concat(first_name,' ',last_name),phone,'Bakı',$2,$3,true,'shipping' FROM users WHERE id=$1
        ON CONFLICT(user_id) WHERE is_default DO UPDATE SET district=EXCLUDED.district,address_line_1=EXCLUDED.address_line_1,phone=EXCLUDED.phone
      `, [customerId, ['Nərimanov', 'Yasamal', 'Xətai'][customerIndex], `${12 + customerIndex} saylı demo ünvan`]);
      const wishlist = await client.query<{ id: string }>(`
        INSERT INTO wishlists(store_id,user_id) VALUES($1,$2)
        ON CONFLICT(store_id,user_id) WHERE user_id IS NOT NULL DO UPDATE SET updated_at=now()
        RETURNING id
      `, [storeId, customerId]);
      for (const product of seededProducts.slice(customerIndex * 4, customerIndex * 4 + 4)) {
        await client.query('INSERT INTO wishlist_items(wishlist_id,listing_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [wishlist.rows[0]!.id, product.listingId]);
      }
      await client.query(`
        INSERT INTO loyalty_accounts(user_id,store_id,balance,lifetime_earned,tier)
        VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(user_id,store_id) DO UPDATE SET balance=EXCLUDED.balance,lifetime_earned=EXCLUDED.lifetime_earned,tier=EXCLUDED.tier,updated_at=now()
      `, [customerId, storeId, 1200 + customerIndex * 450, 2800 + customerIndex * 900, customerIndex === 2 ? 'qızıl' : customerIndex === 1 ? 'gümüş' : 'standart']);
    }

    const campaignResult = await client.query<{ id: string }>(`
      INSERT INTO campaigns (store_id, vendor_id, name, slug, description, campaign_type, status, starts_at, ends_at, budget, goals, targeting, created_by)
      VALUES ($1, $2, 'Yay Super Endirimləri', 'yay-super-endirimleri', 'Seçilmiş məhsullarda 20%-dək demo kampaniyası.',
        'seasonal', 'active', now() - interval '7 days', now() + interval '90 days', 5000, $3, $4, $5)
      ON CONFLICT (store_id, slug) DO UPDATE SET status='active', starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
        description=EXCLUDED.description, vendor_id=EXCLUDED.vendor_id
      RETURNING id
    `, [storeId, vendorId, JSON.stringify({ conversions: 250, revenue: 25000 }), JSON.stringify({ city: 'Bakı', audience: 'home-improvement' }), userResult.rows[0]!.id]);

    await client.query(`
      INSERT INTO coupons (store_id, vendor_id, campaign_id, name, code_prefix, discount_type, discount_value,
        minimum_order, quantity_limit, per_user_limit, starts_at, expires_at, status, rules)
      SELECT $1, $2, $3, 'İlk sifarişə 10% endirim', 'BAKU10', 'percentage', 10, 100, 500, 1,
        now() - interval '1 day', now() + interval '90 days', 'active', $4
      WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE store_id=$1 AND name='İlk sifarişə 10% endirim')
    `, [storeId, vendorId, campaignResult.rows[0]!.id, JSON.stringify({ firstOrderOnly: true })]);

    const extraCampaigns = [
      ['Günün texnologiya təklifi', 'gunun-texnologiya-teklifi', 'daily_deal', 'Seçilmiş elektronika məhsullarında yalnız bu gün üçün xüsusi qiymətlər.', 2200],
      ['Həftənin ev fürsətləri', 'heftenin-ev-fursetleri', 'weekly', 'Ev və mətbəx məhsullarında həftəlik təqdimat kampaniyası.', 3200],
      ['Məhdud sayda hədiyyə qutuları', 'mehdud-hediyye-qutulari', 'limited', 'Stokla məhdud xüsusi hədiyyə seçimləri.', 1800],
      ['Bakı Club yay çəkilişi', 'baki-club-yay-cekilisi', 'giveaway', 'Club üzvləri üçün xal və hədiyyə çəkilişi.', 4000],
      ['Yerli brendlər vitrini', 'yerli-brendler-vitrini', 'sponsored', 'Yerli tərəfdaşların məhsul və hekayələrini önə çıxaran sponsorlu kampaniya.', 6500]
    ] as const;
    for (const [index, [name, slug, type, description, budget]] of extraCampaigns.entries()) {
      await client.query(`
        INSERT INTO campaigns(store_id,vendor_id,name,slug,description,campaign_type,status,starts_at,ends_at,budget,goals,targeting,created_by)
        VALUES($1,$2,$3,$4,$5,$6,'active',now()-interval '5 days',now()+(($7+45)*interval '1 day'),$8,$9,$10,$11)
        ON CONFLICT(store_id,slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,campaign_type=EXCLUDED.campaign_type,
          status='active',starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,budget=EXCLUDED.budget,goals=EXCLUDED.goals,targeting=EXCLUDED.targeting
      `, [storeId, index % 2 ? null : vendorId, name, slug, description, type, index, budget, JSON.stringify({ conversions: 80 + index * 35, revenue: 8000 + index * 4500 }), JSON.stringify({ city: 'Bakı', segment: ['electronics','home','gifts','club','local-brands'][index] }), userResult.rows[0]!.id]);
    }

    const demoCoupons = [
      ['Elektronikaya 15% endirim', 'TECH15', 'percentage', 15, 200],
      ['Ev alışına 25 AZN endirim', 'EV25', 'fixed_amount', 25, 250],
      ['Pulsuz çatdırılma kuponu', 'FREEDEL', 'free_shipping', 0, 75],
      ['Moda seçiminə 12% endirim', 'MODA12', 'percentage', 12, 120],
      ['Club üzvünə 30 AZN endirim', 'CLUB30', 'fixed_amount', 30, 300]
    ] as const;
    for (const [name, prefix, type, value, minimum] of demoCoupons) {
      await client.query(`
        INSERT INTO coupons(store_id,vendor_id,name,code_prefix,discount_type,discount_value,minimum_order,quantity_limit,
          per_user_limit,starts_at,expires_at,status,rules)
        SELECT $1,$2,$3,$4,$5,$6,$7,500,2,now()-interval '2 days',now()+interval '120 days','active',$8
        WHERE NOT EXISTS(SELECT 1 FROM coupons WHERE store_id=$1 AND name=$3)
      `, [storeId, vendorId, name, prefix, type, value, minimum, JSON.stringify({ demo: true, channels: ['web', 'mobile'] })]);
    }

    await client.query(`
      INSERT INTO qr_codes (store_id, vendor_id, campaign_id, code, name, qr_type, target_url, per_user_limit,
        scan_count, starts_at, expires_at, status, rules, created_by)
      VALUES ($1, $2, $3, 'DB-DEMO-CLUB', 'TVShop Club demo QR', 'store', $4, 3, 126,
        now() - interval '7 days', now() + interval '90 days', 'active', '{}', $5)
      ON CONFLICT (code) DO UPDATE SET status='active', expires_at=EXCLUDED.expires_at, target_url=EXCLUDED.target_url
    `, [storeId, vendorId, campaignResult.rows[0]!.id, `${env.PUBLIC_ORIGIN}/baki-club/`, userResult.rows[0]!.id]);

    const demoQrCodes = [
      ['DB-DEMO-MAGAZA', 'Mağaza vitrini QR', 'store', `${env.PUBLIC_ORIGIN}/magaza/`, 348],
      ['DB-DEMO-KAMPANIYA', 'Aktiv kampaniyalar QR', 'smart', `${env.PUBLIC_ORIGIN}/kampaniyalar/`, 271],
      ['DB-DEMO-JURNAL', 'Rəqəmsal jurnal QR', 'social', `${env.PUBLIC_ORIGIN}/jurnal/`, 193],
      ['DB-DEMO-BIZNES', 'Biznes müraciəti QR', 'lead', `${env.PUBLIC_ORIGIN}/biznes/`, 86],
      ['DB-DEMO-HEDIYYE', 'Hədiyyə vitrini QR', 'store', `${env.PUBLIC_ORIGIN}/magaza/hediyyeler/`, 154]
    ] as const;
    for (const [code, name, type, targetUrl, scans] of demoQrCodes) {
      await client.query(`
        INSERT INTO qr_codes(store_id,vendor_id,code,name,qr_type,target_url,per_user_limit,scan_count,starts_at,expires_at,status,rules,created_by)
        VALUES($1,$2,$3,$4,$5,$6,5,$7,now()-interval '30 days',now()+interval '180 days','active',$8,$9)
        ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,target_url=EXCLUDED.target_url,scan_count=EXCLUDED.scan_count,
          status='active',expires_at=EXCLUDED.expires_at,rules=EXCLUDED.rules
      `, [storeId, vendorId, code, name, type, targetUrl, scans, JSON.stringify({ demo: true, source: 'presentation' }), userResult.rows[0]!.id]);
    }

    const rewardImageId = await client.query<{ id: string }>("SELECT id FROM media_assets WHERE storage_key='demo/categories/hediyyeler.jpg' LIMIT 1");
    const demoRewards = [
      ['50 AZN alış-veriş kuponu', 'Seçilmiş TVShop tərəfdaşlarında istifadə edilən alış-veriş kuponu.', 1250, 80],
      ['Premium hədiyyə qutusu', 'Yerli məhsullardan hazırlanmış xüsusi hədiyyə qutusu.', 1800, 35],
      ['Şəhər təcrübəsi bileti', 'İki nəfərlik seçilmiş Bakı şəhər təcrübəsi.', 2200, 24],
      ['Texnologiya aksesuar dəsti', 'Gündəlik istifadə üçün kabel, adapter və enerji aksesuarları.', 1500, 42],
      ['Club xüsusi çatdırılma paketi', 'Üç uyğun sifariş üçün ödənişsiz standart çatdırılma.', 600, 150]
    ] as const;
    for (const [name, description, points, stock] of demoRewards) {
      await client.query(`
        INSERT INTO rewards(store_id,vendor_id,name,description,points_cost,stock,status,starts_at,expires_at,image_asset_id)
        SELECT $1,NULL,$2,$3,$4,$5,'active',now()-interval '1 day',now()+interval '1 year',$6
        WHERE NOT EXISTS(SELECT 1 FROM rewards WHERE store_id=$1 AND name=$2)
      `, [storeId, name, description, points, stock, rewardImageId.rows[0]?.id ?? null]);
    }
    const rewardRows = await client.query<{ id: string }>(`SELECT id FROM rewards WHERE store_id=$1 AND status='active' ORDER BY points_cost LIMIT 3`, [storeId]);
    for (const [index, reward] of rewardRows.rows.entries()) {
      const customerId = demoUserIds.get(customerEmails[index % customerEmails.length]!)!;
      await client.query(`
        INSERT INTO reward_redemptions(reward_id,user_id,points_spent,status,fulfillment_data,created_at)
        SELECT $1,$2,r.points_cost,$3,$4,now()-($5*interval '1 day') FROM rewards r WHERE r.id=$1
          AND NOT EXISTS(SELECT 1 FROM reward_redemptions rr WHERE rr.reward_id=$1 AND rr.user_id=$2 AND rr.fulfillment_data->>'demoKey'=$6)
      `, [reward.id, customerId, ['pending', 'approved', 'fulfilled'][index], JSON.stringify({ demoKey: `presentation-${index + 1}`, note: 'Müştəri təqdimatı üçün demo qeyd' }), index * 3, `presentation-${index + 1}`]);
    }

    const demoOrders = [
      ['demo-order-001', 'Aysel Məmmədova', 'aysel.memmedova@example.az', '+994 50 310 11 01', 'pending', 0],
      ['demo-order-002', 'Murad Əliyev', 'murad.aliyev@example.az', '+994 50 310 11 02', 'confirmed', 1],
      ['demo-order-003', 'Nigar Həsənli', 'nigar.hasenli@example.az', '+994 50 310 11 03', 'processing', 2],
      ['demo-order-004', 'Aysel Məmmədova', 'aysel.memmedova@example.az', '+994 50 310 11 01', 'ready', 3],
      ['demo-order-005', 'Murad Əliyev', 'murad.aliyev@example.az', '+994 50 310 11 02', 'shipped', 4],
      ['demo-order-006', 'Nigar Həsənli', 'nigar.hasenli@example.az', '+994 50 310 11 03', 'delivered', 7],
      ['demo-order-007', 'Aysel Məmmədova', 'aysel.memmedova@example.az', '+994 50 310 11 01', 'delivered', 11],
      ['demo-order-008', 'Murad Əliyev', 'murad.aliyev@example.az', '+994 50 310 11 02', 'delivered', 16],
      ['demo-order-009', 'Nigar Həsənli', 'nigar.hasenli@example.az', '+994 50 310 11 03', 'cancelled', 21],
      ['demo-order-010', 'Aysel Məmmədova', 'aysel.memmedova@example.az', '+994 50 310 11 01', 'returned', 28]
    ] as const;
    for (const [index, [idempotencyKey, customerName, email, phone, status, daysAgo]] of demoOrders.entries()) {
      const product = seededProducts[index]!;
      const orderResult = await client.query<{ id: string }>(`
        INSERT INTO orders (store_id, user_id, customer_email, customer_phone, customer_name, status, payment_status, currency,
          subtotal, discount_total, shipping_total, tax_total, grand_total, shipping_address, billing_address,
          customer_note, idempotency_key, placed_at)
        VALUES ($1, $2, $3, $4, $5, $6::order_status, $7::payment_status, 'AZN', $8, 0, 0, 0, $8, $9, $9,
          'Demo sifariş — müştəri təqdimatı üçün', $10, now() - ($11 * interval '1 day'))
        ON CONFLICT (store_id, idempotency_key) DO UPDATE SET user_id=EXCLUDED.user_id,status=EXCLUDED.status,
          payment_status=EXCLUDED.payment_status,placed_at=EXCLUDED.placed_at
        RETURNING id
      `, [storeId, demoUserIds.get(email)!, email, phone, customerName, status, ['pending','cancelled','returned'].includes(status) ? 'pending' : 'paid', product.price, JSON.stringify({ city: 'Bakı', district: 'Nərimanov', addressLine1: 'Demo ünvan 12' }), idempotencyKey, daysAgo]);
      const orderId = orderResult.rows[0]!.id;
      const vendorOrderResult = await client.query<{ id: string }>(`
        INSERT INTO vendor_orders (order_id, vendor_id, status, subtotal, commission_total, payout_total)
        VALUES ($1, $2, $3::order_status, $4, $5, $6)
        ON CONFLICT (order_id, vendor_id) DO UPDATE SET status=EXCLUDED.status, subtotal=EXCLUDED.subtotal,
          commission_total=EXCLUDED.commission_total, payout_total=EXCLUDED.payout_total
        RETURNING id
      `, [orderId, vendorId, status, product.price, product.price * 0.12, product.price * 0.88]);
      await client.query('DELETE FROM order_items WHERE order_id=$1', [orderId]);
      await client.query(`
        INSERT INTO order_items (order_id, vendor_order_id, vendor_id, product_id, variant_id, product_name, sku,
          quantity, unit_price, discount_total, line_total, snapshot)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, 0, $8, $9)
      `, [orderId, vendorOrderResult.rows[0]!.id, vendorId, product.productId, product.variantId, product.title, product.sku, product.price, JSON.stringify({ demo: true, title: product.title })]);
    }

    const postCategoryResult = await client.query<{ id: string }>(`
      INSERT INTO post_categories (store_id, name, slug, description, seo_title, seo_description)
      VALUES ($1, 'Alış-veriş bələdçisi', 'alis-veris-beledcisi', 'Məhsul seçimi və sərfəli alış-veriş üçün faydalı bələdçilər.',
        'Alış-veriş bələdçisi | TVShop', 'Məhsul seçimi, endirim və kampaniyalardan düzgün istifadə üçün məsləhətlər.')
      ON CONFLICT (store_id, slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description
      RETURNING id
    `, [storeId]);
    const postCategoryId = postCategoryResult.rows[0]!.id;
    const postCategoryIds = new Map<string, string>([['alis-veris-beledcisi', postCategoryId]]);
    const extraPostCategories = [
      ['Şəhər yenilikləri', 'seher-yenilikleri', 'Bakı həyatından aktual xəbərlər və platforma yenilikləri.'],
      ['Brend hekayələri', 'brend-hekayeleri', 'Yerli və tərəfdaş brendlərin inkişaf hekayələri.'],
      ['Kampaniya xəbərləri', 'kampaniya-xeberleri', 'Endirim, kupon və kampaniya yenilikləri.'],
      ['Bakı Club', 'baki-club', 'Loyallıq proqramı, xal və hədiyyə xəbərləri.']
    ] as const;
    for (const [name, slug, description] of extraPostCategories) {
      const result = await client.query<{ id: string }>(`
        INSERT INTO post_categories(store_id,name,slug,description,seo_title,seo_description)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(store_id,slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
          seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description,status='active'
        RETURNING id
      `, [storeId, name, slug, description, `${name} | TVShop`, `${description} TVShop jurnalında.`]);
      postCategoryIds.set(slug, result.rows[0]!.id);
    }

    const demoPosts = [
      {
        type: 'guide',
        title: '2026-cı ildə düzgün elektrik aləti necə seçilməlidir?',
        slug: 'duzgun-elektrik-aleti-nece-secilmelidir',
        excerpt: 'Güc, batareya, zəmanət və istifadə məqsədinə görə düzgün alət seçmək üçün praktiki bələdçi.',
        keyword: 'elektrik aləti seçimi',
        blocks: [
          { type: 'heading', data: { text: 'İstifadə məqsədini müəyyənləşdirin' } },
          { type: 'paragraph', data: { text: 'Ev təmiri, emalatxana və peşəkar tikinti işləri fərqli güc və davamlılıq tələb edir. Məhsulu yalnız qiymətə görə deyil, iş yükünə görə seçin.' } },
          { type: 'heading', data: { text: 'Batareya ekosisteminə diqqət edin' } },
          { type: 'paragraph', data: { text: 'Eyni markanın uyğun batareyalarından istifadə edən alətlər uzun müddətdə xərci azaldır və işi sürətləndirir.' } }
        ]
      },
      {
        type: 'guide',
        title: 'Endirim kampaniyasında ağıllı alış-verişin 7 qaydası',
        slug: 'endirim-kampaniyasinda-agilli-alis-veris',
        excerpt: 'Real endirimi müəyyənləşdirmək, kuponlardan istifadə etmək və büdcəni qorumaq üçün yeddi sadə qayda.',
        keyword: 'endirim kampaniyaları',
        blocks: [
          { type: 'heading', data: { text: 'Qiymət tarixçəsini müqayisə edin' } },
          { type: 'paragraph', data: { text: 'Kampaniya etiketindən əvvəl məhsulun əvvəlki və cari qiymətini, çatdırılma xərcini və zəmanət şərtlərini birlikdə yoxlayın.' } },
          { type: 'heading', data: { text: 'Kupon şərtlərini oxuyun' } },
          { type: 'paragraph', data: { text: 'Minimum sifariş məbləği, istifadə müddəti və satıcı məhdudiyyəti kuponun real faydasını müəyyən edir.' } }
        ]
      },
      {
        type: 'brand_story',
        title: 'Baku Pro Market: yerli satıcının rəqəmsal inkişaf hekayəsi',
        slug: 'baku-pro-market-reqemsal-inkisaf-hekayesi',
        excerpt: 'Yerli satış təcrübəsinin məhsul kataloqu, kampaniya və ölçülə bilən rəqəmsal kanallarla inkişaf hekayəsi.',
        keyword: 'yerli brend hekayəsi',
        blocks: [
          { type: 'heading', data: { text: 'Fiziki vitrindən rəqəmsal kataloqa' } },
          { type: 'paragraph', data: { text: 'Baku Pro Market məhsul məlumatlarını, stok və qiymətləri vahid CMS daxilində idarə edərək müştəriyə daha sürətli xidmət göstərməyə başladı.' } },
          { type: 'heading', data: { text: 'Ölçülə bilən kampaniyalar' } },
          { type: 'paragraph', data: { text: 'TVShop kampaniya və QR analitikası hansı təkliflərin real satış yaratdığını izləməyə imkan verdi.' } }
        ]
      },
      {
        type: 'guide',
        title: 'Yay fürsətlərini qaçırmamaq üçün praktik alış-veriş planı',
        slug: 'yay-fursetleri-alis-veris-plani',
        excerpt: 'Mövsümi təklifləri düzgün vaxtda müqayisə etmək və büdcəni qorumaq üçün sadə plan.',
        keyword: 'yay fürsətləri',
        blocks: [
          { type: 'heading', data: { text: 'Prioritet siyahısı hazırlayın' } },
          { type: 'paragraph', data: { text: 'Ehtiyacları əvvəlcədən sıralamaq kampaniya zamanı impulsiv xərclərin qarşısını alır və həqiqi endirimləri seçməyi asanlaşdırır.' } }
        ]
      },
      {
        type: 'news',
        title: 'TVShop jurnalının yeni rəqəmsal buraxılışı yayımlandı',
        slug: 'tvshop-yeni-reqemsal-buraxilis',
        excerpt: 'Şəhər, alış-veriş və yerli brend hekayələri yeni rəqəmsal buraxılışda bir araya gəldi.',
        keyword: 'TVShop jurnalı',
        blocks: [
          { type: 'heading', data: { text: 'Yeni buraxılış artıq onlayndır' } },
          { type: 'paragraph', data: { text: 'Oxucular aktual şəhər yeniliklərini, alış-veriş bələdçilərini və yerli biznes hekayələrini vahid buraxılışda izləyə bilərlər.' } }
        ]
      },
      {
        type: 'brand_story',
        title: 'Yerli brendlər rəqəmsal vitrində necə fərqlənə bilər?',
        slug: 'yerli-brendler-reqemsal-vitrin',
        excerpt: 'Düzgün məhsul məlumatı, vizual dil və ölçülə bilən kampaniya ilə rəqəmsal vitrində fərqlənməyin yolları.',
        keyword: 'yerli brendlər',
        blocks: [
          { type: 'heading', data: { text: 'Etibar yaradan məhsul təqdimatı' } },
          { type: 'paragraph', data: { text: 'Aydın foto, düzgün xüsusiyyətlər və real stok məlumatı yerli brendin müştəri qarşısında etibarını artırır.' } }
        ]
      },
      {
        type: 'news',
        title: 'Bakı Club üzvləri üçün yeni hədiyyə imkanları',
        slug: 'baki-club-yeni-hediyyeler',
        excerpt: 'Bakı Club üzvləri yeni kampaniyalarda xal toplayaraq seçilmiş hədiyyələr əldə edə bilərlər.',
        keyword: 'Bakı Club hədiyyələri',
        blocks: [
          { type: 'heading', data: { text: 'Xalları hədiyyəyə çevirin' } },
          { type: 'paragraph', data: { text: 'Aktiv kampaniyalar və QR imkanları üzvlərə gündəlik alış-verişdən əlavə fayda qazanmağa kömək edir.' } }
        ]
      },
      {
        type: 'article',
        title: 'Ayın ən çox oxunan alış-veriş və şəhər hekayələri',
        slug: 'ayin-en-cox-oxunan-hekayeleri',
        excerpt: 'Ay ərzində oxucuların ən çox maraq göstərdiyi bələdçi, kampaniya və şəhər hekayələrinin xülasəsi.',
        keyword: 'ayın ən çox oxunanları',
        blocks: [
          { type: 'heading', data: { text: 'Oxucuların seçimi' } },
          { type: 'paragraph', data: { text: 'Praktik alış-veriş məsləhətləri, yerli brend təcrübələri və yeni kampaniyalar bu ayın ən çox oxunan mövzuları oldu.' } }
        ]
      }
    ] as const;
    const postImageUrls: Record<string,string> = {
      'duzgun-elektrik-aleti-nece-secilmelidir':'/assets/images/categories/jurnal/alis-veris-meslehetleri.jpg',
      'endirim-kampaniyasinda-agilli-alis-veris':'/assets/images/categories/kampaniyalar/movsumi-endirimler.jpg',
      'baku-pro-market-reqemsal-inkisaf-hekayesi':'/assets/images/categories/jurnal/brend-hekayeleri.jpg',
      'yay-fursetleri-alis-veris-plani':'/assets/images/categories/endirimler.jpg',
      'tvshop-yeni-reqemsal-buraxilis':'/assets/images/categories/jurnal/son-buraxilis.jpg',
      'yerli-brendler-reqemsal-vitrin':'/assets/images/categories/biznes/brend-vitrini.jpg',
      'baki-club-yeni-hediyyeler':'/assets/images/categories/baki-club/giveawayler.jpg',
      'ayin-en-cox-oxunan-hekayeleri':'/assets/images/categories/jurnal/arxiv.jpg'
    };
    const seededPostIds: string[] = [];
    for (const [postIndex, post] of demoPosts.entries()) {
      const selectedCategory = post.type === 'brand_story'
        ? postCategoryIds.get('brend-hekayeleri')
        : post.slug.includes('kampaniya') || post.slug.includes('furset')
          ? postCategoryIds.get('kampaniya-xeberleri')
          : post.slug.includes('baki-club')
            ? postCategoryIds.get('baki-club')
            : post.type === 'news'
              ? postCategoryIds.get('seher-yenilikleri')
              : postCategoryId;
      const postMedia=await client.query<{id:string}>(`
        INSERT INTO media_assets(store_id,uploaded_by,storage_key,public_url,mime_type,byte_size,alt_text,title,metadata)
        VALUES($1,$2,$3,$4,'image/jpeg',1,$5,$6,$7)
        ON CONFLICT(storage_key) DO UPDATE SET public_url=EXCLUDED.public_url,alt_text=EXCLUDED.alt_text,title=EXCLUDED.title
        RETURNING id
      `,[storeId,userResult.rows[0]!.id,`seed/posts/${post.slug}.jpg`,postImageUrls[post.slug],`${post.title} — TVShop yeniliyi`,post.title,JSON.stringify({seeded:true,source:'theme-export'})]);
      const result = await client.query<{ id: string }>(`
        INSERT INTO posts (store_id, category_id, featured_asset_id, locale, post_type, title, slug, excerpt, content, status,
          seo_title, seo_description, robots_directive, schema_data, author_id, reviewed_by, published_at)
        VALUES ($1, $2, $3, 'az-AZ', $4, $5, $6, $7, $8, 'published', $9, $10, 'index,follow', $11, $12, $12, now())
        ON CONFLICT (store_id, locale, slug) DO UPDATE SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt,
          content=EXCLUDED.content, status='published', seo_title=EXCLUDED.seo_title,
          seo_description=EXCLUDED.seo_description, featured_asset_id=coalesce(posts.featured_asset_id,EXCLUDED.featured_asset_id),deleted_at=NULL, published_at=coalesce(posts.published_at,now())
        RETURNING id
      `, [storeId, selectedCategory,postMedia.rows[0]!.id, post.type, post.title, post.slug, post.excerpt, JSON.stringify(post.blocks), `${post.title} | TVShop`, `${post.excerpt} TVShop jurnalında ətraflı oxuyun.`, JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: post.title, keywords: post.keyword, position: postIndex + 1 }), userResult.rows[0]!.id]);
      seededPostIds.push(result.rows[0]!.id);
    }

    const aboutPageResult = await client.query<{ id: string }>(`
      INSERT INTO pages (store_id, locale, title, slug, excerpt, content, template, status, seo_title,
        seo_description, robots_directive, schema_data, author_id, reviewed_by, published_at)
      VALUES ($1, 'az-AZ', 'TVShop haqqında', 'haqqimizda', 'TVShop şəhərin rəqəmsal fürsətlər platformasıdır.', $2,
        'about', 'published', 'TVShop haqqında', 'TVShop missiyası, platformanın imkanları və şəhər ekosistemi.',
        'index,follow', $3, $4, $4, now())
      ON CONFLICT (store_id, locale, slug) DO UPDATE SET content=EXCLUDED.content, status='published',
        seo_title=EXCLUDED.seo_title, seo_description=EXCLUDED.seo_description, deleted_at=NULL
      RETURNING id
    `, [storeId, JSON.stringify([{ type: 'heading', data: { text: 'Şəhərin fürsətlərini birləşdiririk' } }, { type: 'paragraph', data: { text: 'TVShop istifadəçiləri etibarlı biznes, məhsul, kampaniya və faydalı kontentlə əlaqələndirir.' } }]), JSON.stringify({ '@context': 'https://schema.org', '@type': 'AboutPage' }), userResult.rows[0]!.id]);

    const demoPages = [
      ['Əlaqə', 'elaqe', 'Komandamızla əlaqə saxlayın.', 'contact', 'Suallar, tərəfdaşlıq və dəstək müraciətləri üçün bizimlə əlaqə saxlayın.'],
      ['Çatdırılma və ödəniş', 'catdirilma-ve-odenis', 'Sifariş, çatdırılma və ödəniş qaydaları.', 'default', 'Bakı üzrə çatdırılma vaxtları, ödəniş üsulları və sifariş izləmə qaydaları.'],
      ['Məxfilik siyasəti', 'mexfilik-siyaseti', 'Şəxsi məlumatların qorunması prinsipləri.', 'default', 'TVShop şəxsi məlumatları qanunvericiliyə və şəffaflıq prinsiplərinə uyğun qoruyur.'],
      ['İstifadə şərtləri', 'istifade-sertleri', 'Platformadan istifadə qaydaları.', 'default', 'Hesab, sifariş, kontent və tərəfdaş xidmətlərindən istifadə şərtləri.'],
      ['Tez-tez verilən suallar', 'tez-tez-verilen-suallar', 'Ən çox verilən sualların cavabları.', 'default', 'Sifariş, qaytarma, kupon, Bakı Club və satıcılarla bağlı cavablar.']
    ] as const;
    for (const [title, slug, excerpt, template, paragraph] of demoPages) {
      await client.query(`
        INSERT INTO pages(store_id,locale,title,slug,excerpt,content,template,status,seo_title,seo_description,
          canonical_url,robots_directive,schema_data,author_id,reviewed_by,published_at)
        VALUES($1,'az-AZ',$2,$3,$4,$5,$6,'published',$7,$8,$9,'index,follow',$10,$11,$11,now())
        ON CONFLICT(store_id,locale,slug) DO UPDATE SET title=EXCLUDED.title,excerpt=EXCLUDED.excerpt,content=EXCLUDED.content,
          template=EXCLUDED.template,status='published',seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description,
          canonical_url=EXCLUDED.canonical_url,schema_data=EXCLUDED.schema_data,deleted_at=NULL,published_at=coalesce(pages.published_at,now())
      `, [storeId, title, slug, excerpt, JSON.stringify([{ type: 'heading', data: { text: title } }, { type: 'paragraph', data: { text: paragraph } }]), template, `${title} | TVShop`, `${excerpt} TVShop platformasında ətraflı məlumat.`, `/${slug}/`, JSON.stringify({ '@context': 'https://schema.org', '@type': slug === 'elaqe' ? 'ContactPage' : 'WebPage', name: title }), userResult.rows[0]!.id]);
    }

    const journalPdf = await client.query<{ id: string }>(`
      INSERT INTO media_assets(store_id,uploaded_by,storage_key,public_url,mime_type,byte_size,alt_text,title,metadata)
      VALUES($1,$2,'demo/journal/tvshop-demo.pdf','/assets/documents/tvshop-demo.pdf','application/pdf',700,
        'TVShop demo jurnal buraxılışı','TVShop demo jurnal PDF-i',$3)
      ON CONFLICT(storage_key) DO UPDATE SET public_url=EXCLUDED.public_url,mime_type=EXCLUDED.mime_type,title=EXCLUDED.title
      RETURNING id
    `, [storeId, userResult.rows[0]!.id, JSON.stringify({ demo: true, originalName: 'tvshop-demo.pdf' })]);
    const demoIssues = [
      ['2026/08', 'TVShop — Avqust 2026', 'tvshop-avqust-2026', '/assets/images/categories/jurnal/son-buraxilis.jpg', 0],
      ['2026/07', 'TVShop — İyul 2026', 'tvshop-iyul-2026', '/assets/images/categories/jurnal/arxiv.jpg', 31],
      ['2026/06', 'TVShop — İyun 2026', 'tvshop-iyun-2026', '/assets/images/categories/jurnal/brend-hekayeleri.jpg', 62]
    ] as const;
    for (const [issueNumber, title, slug, coverUrl, daysAgo] of demoIssues) {
      const cover = await client.query<{ id: string }>(`
        INSERT INTO media_assets(store_id,uploaded_by,storage_key,public_url,mime_type,byte_size,alt_text,title,metadata)
        VALUES($1,$2,$3,$4,'image/jpeg',1,$5,$5,$6)
        ON CONFLICT(storage_key) DO UPDATE SET public_url=EXCLUDED.public_url,alt_text=EXCLUDED.alt_text,title=EXCLUDED.title
        RETURNING id
      `, [storeId, userResult.rows[0]!.id, `demo/journal/${slug}.jpg`, coverUrl, `${title} jurnal örtüyü`, JSON.stringify({ demo: true, kind: 'journal-cover' })]);
      await client.query(`
        INSERT INTO journal_issues(store_id,issue_number,title,slug,description,cover_asset_id,pdf_asset_id,status,published_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,'published',now()-($8*interval '1 day'))
        ON CONFLICT(store_id,issue_number) DO UPDATE SET title=EXCLUDED.title,slug=EXCLUDED.slug,description=EXCLUDED.description,
          cover_asset_id=EXCLUDED.cover_asset_id,pdf_asset_id=EXCLUDED.pdf_asset_id,status='published',published_at=EXCLUDED.published_at
      `, [storeId, issueNumber, title, slug, `${title}: şəhər yenilikləri, alış-veriş bələdçiləri, kampaniyalar və yerli brend hekayələri.`, cover.rows[0]!.id, journalPdf.rows[0]!.id, daysAgo]);
    }

    const clusterResult = await client.query<{ id: string }>(`
      INSERT INTO seo_clusters (store_id, name, primary_keyword, search_intent, pillar_page_id, target_audience, status, created_by)
      VALUES ($1, 'Bakı alış-veriş ekosistemi', 'Bakıda alış-veriş', 'local', $2,
        'Bakıda məhsul, endirim və etibarlı biznes axtaran istifadəçilər', 'active', $3)
      ON CONFLICT (store_id, primary_keyword) DO UPDATE SET pillar_page_id=EXCLUDED.pillar_page_id,
        target_audience=EXCLUDED.target_audience, status='active'
      RETURNING id
    `, [storeId, aboutPageResult.rows[0]!.id, userResult.rows[0]!.id]);
    for (const [position, postId] of seededPostIds.entries()) {
      await client.query(`
        INSERT INTO seo_cluster_members (cluster_id, post_id, target_keyword, supporting_keywords, planned_internal_links, position)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (cluster_id, page_id, post_id) DO UPDATE SET target_keyword=EXCLUDED.target_keyword,
          supporting_keywords=EXCLUDED.supporting_keywords, planned_internal_links=EXCLUDED.planned_internal_links, position=EXCLUDED.position
      `, [clusterResult.rows[0]!.id, postId, demoPosts[position]!.keyword, [`${demoPosts[position]!.keyword} Bakı`, 'TVShop'], JSON.stringify([{ anchor: 'TVShop mağaza', url: '/magaza/' }]), position]);
    }
    const extraSeoClusters = [
      ['Bakı endirim və kuponları', 'Bakıda endirim kuponları', 'commercial', 'Aktiv endirim və kupon axtaran Bakı istifadəçiləri'],
      ['Yerli biznes rəqəmsal vitrini', 'Bakıda yerli biznes', 'local', 'Rəqəmsal satış və tanıtım həlli axtaran yerli sahibkarlar'],
      ['Bakı Club üstünlükləri', 'Bakı loyallıq proqramı', 'informational', 'Alış-verişdən xal və hədiyyə qazanmaq istəyən istifadəçilər']
    ] as const;
    for (const [name, keyword, intent, audience] of extraSeoClusters) {
      await client.query(`
        INSERT INTO seo_clusters(store_id,name,primary_keyword,search_intent,pillar_page_id,target_audience,status,created_by)
        VALUES($1,$2,$3,$4,$5,$6,'active',$7)
        ON CONFLICT(store_id,primary_keyword) DO UPDATE SET name=EXCLUDED.name,search_intent=EXCLUDED.search_intent,
          pillar_page_id=EXCLUDED.pillar_page_id,target_audience=EXCLUDED.target_audience,status='active'
      `, [storeId, name, keyword, intent, aboutPageResult.rows[0]!.id, audience, userResult.rows[0]!.id]);
    }

    const demoListings = [
      ['Peşəkar təmir və montaj xidməti', 'pesekar-temir-ve-montaj-xidmeti', 'service', 'Bakı daxilində elektrik, montaj və xırda təmir işləri.', 80],
      ['Az istifadə olunmuş alət dəsti', 'az-istifade-olunmus-alet-desti', 'product', 'Ev təmiri üçün komplekt, yaxşı vəziyyətdə alət dəsti.', 240],
      ['Nərimanovda kiçik emalatxana icarəsi', 'nerimanovda-emalatxana-icaresi', 'property', 'Avadanlıqlı, rahat girişli və təhlükəsiz emalatxana sahəsi.', 650],
      ['Şəhər üçün qənaətli avtomobil', 'seher-ucun-qenaetcil-avtomobil', 'vehicle', 'Texniki baxışdan keçmiş, səliqəli və gündəlik şəhər istifadəsinə uyğun avtomobil.', 17800],
      ['Uşaq otağı mebel dəsti', 'usaq-otagi-mebel-desti', 'product', 'Yaxşı vəziyyətdə yataq, masa və saxlama dolabından ibarət dəst.', 490],
      ['Həftəsonu foto çəkilişi', 'heftesonu-foto-cekilisi', 'service', 'Ailə və şəxsi tədbirlər üçün iki saatlıq foto çəkiliş paketi.', 160],
      ['Xətai rayonunda ofis sahəsi', 'xetai-rayonunda-ofis-sahesi', 'property', 'Metroya yaxın, təmirli və işə hazır kiçik ofis sahəsi.', 1100],
      ['Korporativ tədbir üçün dekor', 'korporativ-tedbir-dekoru', 'other', 'Tədbir konsepti, dekor elementləri və quraşdırma xidməti.', 350]
    ] as const;
    for (const [listingIndex, [title, slug, category, description, price]] of demoListings.entries()) {
      const listing = await client.query<{ id: string }>(`
        INSERT INTO classified_listings (store_id, user_id, vendor_id, category, title, slug, description, price,
          currency, contact_data, location_data, status, expires_at, reviewed_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AZN', $9, $10, 'published', now()+interval '90 days', $2)
        ON CONFLICT (store_id, slug) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
          price=EXCLUDED.price, status='published', expires_at=EXCLUDED.expires_at, deleted_at=NULL
        RETURNING id
      `, [storeId, userResult.rows[0]!.id, vendorId, category, title, slug, description, price, JSON.stringify({ phone: '+994 50 264 54 00', email: 'elan@gundelikbaki.az' }), JSON.stringify({ city: 'Bakı' })]);
      const productMedia = await client.query<{ id: string }>('SELECT media_asset_id AS id FROM product_media WHERE product_id=$1 AND is_primary=true LIMIT 1', [seededProducts[listingIndex]!.productId]);
      if (productMedia.rows[0]) {
        await client.query('INSERT INTO classified_media(listing_id,media_asset_id,position) VALUES($1,$2,0) ON CONFLICT DO NOTHING', [listing.rows[0]!.id, productMedia.rows[0].id]);
      }
    }

    await syncOperationalUsers(client, storeId, userResult.rows[0]!.id);
  });

  console.log(`Seed completed. ${demoProducts.length} demo products added. Bootstrap admin: ${env.BOOTSTRAP_ADMIN_EMAIL}`);
}

seed()
  .then(closePool)
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exitCode = 1;
  });
