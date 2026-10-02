import { z } from 'zod';
import { navigationSections } from '../web/navigation.js';

export const editorScopes = ['nav', 'index', 'footer'] as const;
export type EditorScope = typeof editorScopes[number];

const text = (max = 300) => z.string().trim().max(max);
const id = z.uuid();
const assetId = id.nullable();
const safeUrl = z.string().trim().min(1).max(500).refine((value) => {
  if (value.startsWith('/') || value.startsWith('#')) return true;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:', 'tel:', 'mailto:', 'whatsapp:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}, 'Keçid /, #, http(s), tel, mailto və ya whatsapp ilə başlamalıdır');

const linkItem = z.object({
  id: text(80),
  label: text(100).min(1),
  url: safeUrl,
  visible: z.boolean(),
  imageAssetId: assetId.optional(),
  children: z.array(z.object({
    id: text(80), label: text(100).min(1), url: safeUrl, visible: z.boolean(), imageAssetId: assetId.optional()
  }).strict()).max(30).default([])
}).strict();

export const navEditorSchema = z.object({
  announcement: z.object({
    address: text(180), contactLabel: text(80), contactUrl: safeUrl,
    deliveryText: text(180), loginLabel: text(80)
  }).strict(),
  branding: z.object({ logoAssetId: assetId, logoAlt: text(180) }).strict(),
  search: z.object({ placeholder: text(180), buttonLabel: text(60) }).strict(),
  support: z.object({ phone: text(40), label: text(100) }).strict(),
  liveChat: z.object({ title: text(100), subtitle: text(140), url: safeUrl }).strict(),
  menuItems: z.array(linkItem).min(1).max(20),
  storeItems: z.array(linkItem).min(1).max(30)
}).strict();

const sectionBase = {
  enabled: z.boolean(), eyebrow: text(120), title: text(180).min(1), subtitle: text(400)
};

const heroSlide = z.object({
  id: text(80), enabled: z.boolean(), eyebrow: text(120), title: text(220).min(1),
  description: text(600), buttonLabel: text(80), buttonUrl: safeUrl, imageAssetId: assetId
}).strict();

const promoCard = z.object({
  id: text(80), enabled: z.boolean(), title: text(180).min(1), description: text(400),
  buttonLabel: text(80), buttonUrl: safeUrl, imageAssetId: assetId
}).strict();

export const indexEditorSchema = z.object({
  seo: z.object({ browserTitle: text(180).min(1), metaDescription: text(320).min(1) }).strict(),
  hero: z.object({ enabled: z.boolean(), slides: z.array(heroSlide).min(1).max(3) }).strict(),
  promoCards: z.array(promoCard).max(4),
  categories: z.object({ ...sectionBase, categoryIds: z.array(id).max(30) }).strict(),
  featured: z.object({ ...sectionBase, productIds: z.array(id).max(40) }).strict(),
  popular: z.object({ ...sectionBase, productIds: z.array(id).max(40) }).strict(),
  topPicks: z.object({ ...sectionBase, productIds: z.array(id).max(40), categoryIds: z.array(id).max(12) }).strict(),
  news: z.object({ ...sectionBase, postIds: z.array(id).max(20) }).strict(),
  brands: z.object({ ...sectionBase, brandIds: z.array(id).max(40) }).strict(),
  sectionOrder: z.array(z.enum(['hero', 'promoCards', 'categories', 'featured', 'popular', 'topPicks', 'news', 'brands'])).length(8)
}).strict().refine((value) => new Set(value.sectionOrder).size === value.sectionOrder.length, {
  message: 'Ana səhifə bölmələri təkrarlana bilməz', path: ['sectionOrder']
});

const footerLink = z.object({ id: text(80), label: text(100).min(1), url: safeUrl, visible: z.boolean() }).strict();

export const footerEditorSchema = z.object({
  branding: z.object({ logoAssetId: assetId, logoAlt: text(180), description: text(500) }).strict(),
  socialLinks: z.array(z.object({ id: text(80), network: text(50), label: text(80), url: safeUrl, visible: z.boolean() }).strict()).max(10),
  linkGroups: z.array(z.object({ id: text(80), title: text(100), visible: z.boolean(), links: z.array(footerLink).max(20) }).strict()).min(1).max(4),
  contact: z.object({ address: text(250), addressUrl: safeUrl, phone: text(40), phoneUrl: safeUrl, hours: text(180) }).strict(),
  legal: z.object({ copyright: text(240), links: z.array(footerLink).max(10) }).strict()
}).strict();

export const editorSchemas = {
  nav: navEditorSchema,
  index: indexEditorSchema,
  footer: footerEditorSchema
} as const;

export type NavEditorConfig = z.infer<typeof navEditorSchema>;
export type IndexEditorConfig = z.infer<typeof indexEditorSchema>;
export type FooterEditorConfig = z.infer<typeof footerEditorSchema>;
export type SiteEditorConfig = NavEditorConfig | IndexEditorConfig | FooterEditorConfig;

const navigationDefaults = navigationSections.filter((section) => section.key !== 'magaza').map((section) => ({
  id: section.key, label: section.label, url: section.href, visible: true,
  children: section.children.map((child) => ({ id: `${section.key}-${child.slug}`, label: child.label, url: child.href, visible: true }))
}));
const storeNavigationDefaults = navigationSections.find((section) => section.key === 'magaza')!.children.map((child) => ({
  id: `store-${child.slug}`, label: child.label, url: child.href, visible: true, imageAssetId: null, children: []
}));

export const editorDefaults: { nav: NavEditorConfig; index: IndexEditorConfig; footer: FooterEditorConfig } = {
  nav: {
    announcement: {
      address: 'Cəfər Cabbarlı 33, AZ1065, Bakı/Azərbaycan', contactLabel: 'Əlaqə', contactUrl: '/elaqe/',
      deliveryText: '99 AZN-dən yuxarı pulsuz çatdırılma', loginLabel: 'Daxil ol'
    },
    branding: { logoAssetId: null, logoAlt: 'TVShop' },
    search: { placeholder: 'Nə axtarırsınız?', buttonLabel: 'Axtarış' },
    support: { phone: '+994 50 264 54 00', label: 'Müştəri və biznes dəstəyi' },
    liveChat: { title: 'Canlı çat', subtitle: 'Mütəxəssislə danış', url: '/elaqe/' },
    menuItems: navigationDefaults,
    storeItems: storeNavigationDefaults
  },
  index: {
    seo: { browserTitle: 'TVShop — Video ilə kəşf et və alış-veriş et', metaDescription: 'TVShop — məhsulları video ilə kəşf edin, canlı yayımları izləyin və təhlükəsiz alış-veriş edin.' },
    hero: { enabled: true, slides: [
      { id: 'hero-1', enabled: true, eyebrow: '30% ilk alış endirimi', title: 'GÜCLÜ BAŞLA', description: 'Alış etdikdə Gözəllik & Sağlamlıq üçün $599', buttonLabel: 'İndi bax', buttonUrl: '/magaza/', imageAssetId: null },
      { id: 'hero-2', enabled: true, eyebrow: 'GÜNÜN XÜSUSİ TƏKLİFİ', title: '1 AL, 1 HƏDİYYƏ', description: 'Seçilmiş məhsullarda yüksək keyfiyyət və sərfəli qiymət', buttonLabel: 'İndi bax', buttonUrl: '/magaza/', imageAssetId: null },
      { id: 'hero-3', enabled: true, eyebrow: 'MÖVSÜM ENDİRİMLƏRİ!', title: 'SUPER TƏKLİFLƏR', description: 'Seçilmiş brendlər - Hamısı sərfəli Brendlər!', buttonLabel: 'İndi bax', buttonUrl: '/magaza/', imageAssetId: null }
    ] },
    promoCards: [
      { id: 'gift', enabled: true, title: 'HƏDİYYƏ QAZAN', description: 'Seçilmiş məhsul alışı ilə', buttonLabel: 'İndi kəşf et', buttonUrl: '/magaza/?brend=milwaukee', imageAssetId: null },
      { id: 'bundle', enabled: true, title: 'ÖZ DƏSTİNİ QUR', description: 'Həmişə sərfəli seçim.', buttonLabel: 'İndi kəşf et', buttonUrl: '/magaza/?brend=milwaukee', imageAssetId: null },
      { id: 'bogo', enabled: true, title: '1 AL, 1 HƏDİYYƏ', description: 'PULSUZ', buttonLabel: 'İndi kəşf et', buttonUrl: '/magaza/?brend=milwaukee', imageAssetId: null },
      { id: 'home-garden', enabled: true, title: 'EV VƏ BAĞ', description: 'Keyfiyyətli məhsullar', buttonLabel: 'İndi kəşf et', buttonUrl: '/magaza/?brend=milwaukee', imageAssetId: null }
    ],
    categories: { enabled: true, eyebrow: '', title: 'Kateqoriyalar', subtitle: '', categoryIds: [] },
    featured: { enabled: true, eyebrow: '', title: 'Seçilmiş fürsətlər', subtitle: '', productIds: [] },
    popular: { enabled: true, eyebrow: '', title: 'Ən populyar seçimlər', subtitle: '', productIds: [] },
    topPicks: { enabled: true, eyebrow: '', title: 'ƏN ÇOX SEÇİLƏNLƏR:', subtitle: '', productIds: [], categoryIds: [] },
    news: { enabled: true, eyebrow: '', title: 'TVShop yeniliklərini izlə', subtitle: 'Son təkliflər, kampaniyalar və şəhərin ən maraqlı xəbərləri', postIds: [] },
    brands: { enabled: true, eyebrow: '', title: 'Brendlərə görə alış-veriş Brendlər', subtitle: '', brandIds: [] },
    sectionOrder: ['hero', 'promoCards', 'categories', 'featured', 'popular', 'topPicks', 'news', 'brands']
  },
  footer: {
    branding: { logoAssetId: null, logoAlt: 'TVShop', description: 'TVShop məhsulları video ilə kəşf etməyi, canlı yayımları və təhlükəsiz alış-verişi vahid platformada birləşdirir.' },
    socialLinks: [
      { id: 'instagram', network: 'Instagram', label: 'TVShop — Instagram', url: 'https://www.instagram.com/gundelikbaki.az?utm_source=qr&igsh=cDd4aGQwZDhlcDM1', visible: true },
      { id: 'facebook', network: 'Facebook', label: 'TVShop — Facebook', url: 'https://www.facebook.com/share/1DH8hF28DT/', visible: true },
      { id: 'x', network: 'X', label: 'TVShop — X', url: 'https://x.com/GundelikBaki', visible: true },
      { id: 'tiktok', network: 'TikTok', label: 'TVShop — TikTok', url: 'https://www.tiktok.com/@gundelikbaki.az?_r=1&_t=ZS-98bbh3lg7AD', visible: true },
      { id: 'linkedin', network: 'LinkedIn', label: 'TVShop — LinkedIn', url: 'https://www.linkedin.com/company/gundelikbaki/', visible: true },
      { id: 'whatsapp', network: 'WhatsApp', label: 'TVShop — WhatsApp', url: 'https://wa.me/994502645400', visible: true }
    ],
    linkGroups: [
      { id: 'about', title: 'Platforma haqqında', visible: true, links: [
        { id: 'about-us', label: 'Biz kimik', url: '/haqqimizda/', visible: true },
        { id: 'club', label: 'Bakı Club', url: '/baki-club/', visible: true },
        { id: 'business', label: 'Biznes üçün', url: '/biznes/', visible: true }
      ] },
      { id: 'support', title: 'Müştəri dəstəyi', visible: true, links: [
        { id: 'faq', label: 'Tez-tez verilən suallar', url: '/faq/', visible: true },
        { id: 'contact', label: 'Əlaqə', url: '/elaqe/', visible: true },
        { id: 'delivery', label: 'Çatdırılma siyasəti', url: '/catdirilma/', visible: true },
        { id: 'returns', label: 'Geri qaytarma', url: '/geri-qaytarma/', visible: true }
      ] },
      { id: 'partnership', title: 'Biznes əməkdaşlığı', visible: true, links: [
        { id: 'ads', label: 'Reklam portalı', url: '/biznes/reklam-ver/', visible: true },
        { id: 'sponsorship', label: 'Sponsorluq', url: '/biznes/sponsorluq/', visible: true },
        { id: 'showcase', label: 'Brend olun', url: '/biznes/brend-vitrini/', visible: true }
      ] },
      { id: 'quick', title: 'Sürətli keçidlər', visible: true, links: [
        { id: 'journal', label: 'Son jurnal', url: '/jurnal/', visible: true },
        { id: 'categories', label: 'Kateqoriyalar', url: '/magaza/', visible: true }
      ] }
    ],
    contact: { address: 'Cəfər Cabbarlı 33, AZ1065, Bakı/Azərbaycan', addressUrl: '/elaqe/', phone: '+994 50 264 54 00', phoneUrl: 'tel:+994502645400', hours: 'Bazar ertəsi – Cümə: 09:00 – 18:00\nŞənbə: 10:00 – 15:00' },
    legal: { copyright: `Copyright © ${new Date().getFullYear()} TVShop. Bütün hüquqlar qorunur.`, links: [
      { id: 'privacy', label: 'Məxfilik siyasəti', url: '/mexfilik/', visible: true },
      { id: 'returns', label: 'Geri qaytarma siyasəti', url: '/geri-qaytarma/', visible: true },
      { id: 'terms', label: 'İstifadə şərtləri', url: '/istifade-sertleri/', visible: true }
    ] }
  }
};

function mergeValue<T>(fallback: T, stored: unknown): T {
  if (Array.isArray(fallback)) return (Array.isArray(stored) ? stored : fallback) as T;
  if (fallback && typeof fallback === 'object') {
    const incoming = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
    return Object.fromEntries(Object.entries(fallback).map(([key, value]) => [key, mergeValue(value, incoming[key])])) as T;
  }
  return (stored === undefined || stored === null ? fallback : stored) as T;
}

export function normalizedEditorConfig<S extends EditorScope>(scope: S, stored: unknown): typeof editorDefaults[S] {
  const merged = mergeValue(editorDefaults[scope], stored);
  const parsed = editorSchemas[scope].parse(merged) as typeof editorDefaults[S];
  if (scope === 'footer') {
    const footer = parsed as typeof editorDefaults.footer;
    const protectedBusinessLinks: Record<string, string> = {
      '/biznes/#reklam': '/biznes/reklam-ver/',
      '/biznes/#sponsorluq': '/biznes/sponsorluq/',
      '/biznes/#brend-vitrini': '/biznes/brend-vitrini/'
    };
    footer.linkGroups = footer.linkGroups.map((group) => ({
      ...group,
      links: group.links
        .filter((link) => link.id !== 'classified' && link.label !== 'Elan yerləşdir')
        .map((link) => ({ ...link, url: protectedBusinessLinks[link.url] ?? link.url }))
    }));
  }
  return parsed;
}
