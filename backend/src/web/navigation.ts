export type NavigationChild = {
  slug: string;
  label: string;
  href: string;
  image: string;
  description: string;
};

export type NavigationSection = {
  key: string;
  slug: string;
  label: string;
  href: string;
  image: string;
  kicker: string;
  description: string;
  children: readonly NavigationChild[];
};

const categoryImages = '/assets/images/categories';

/**
 * Public site navigation, category landing pages and sitemap paths share this
 * hierarchy. Keeping the URLs here prevents menu, route and SEO drift.
 */
export const navigationSections = [
  {
    key: 'magaza',
    slug: 'magaza',
    label: 'Mağaza',
    href: '/magaza/',
    image: `${categoryImages}/magaza.jpg`,
    kicker: 'TVSHOP MAĞAZA',
    description: 'Elektronika, ev, moda, gözəllik və digər kateqoriyalarda etibarlı satıcılardan seçilmiş məhsulları kəşf edin.',
    children: [
      { slug: 'elektronika', label: 'Elektronika', href: '/magaza/elektronika/', image: `${categoryImages}/magaza/elektronika.jpg`, description: 'Elektronika, rəqəmsal cihaz və gündəlik texnologiya məhsullarını müqayisə edin.' },
      { slug: 'ev-metbex', label: 'Ev & Mətbəx', href: '/magaza/ev-metbex/', image: `${categoryImages}/magaza/ev-metbex.jpg`, description: 'Ev və mətbəx üçün praktik məhsulları, avadanlıqları və sərfəli təklifləri tapın.' },
      { slug: 'moda', label: 'Moda', href: '/magaza/moda/', image: `${categoryImages}/magaza/moda.jpg`, description: 'Geyim, aksesuar və mövsümün seçilən moda təkliflərini bir səhifədə kəşf edin.' },
      { slug: 'gozellik-saglamliq', label: 'Gözəllik & Sağlamlıq', href: '/magaza/gozellik-saglamliq/', image: `${categoryImages}/magaza/gozellik-saglamliq.jpg`, description: 'Gözəllik, şəxsi qulluq və sağlam həyat üçün seçilmiş məhsullara baxın.' },
      { slug: 'qida', label: 'Qida', href: '/magaza/qida/', image: `${categoryImages}/magaza/qida.jpg`, description: 'Gündəlik qida məhsullarını və yerli mağazaların aktual təkliflərini kəşf edin.' },
      { slug: 'usaq', label: 'Uşaq', href: '/magaza/usaq/', image: `${categoryImages}/magaza/usaq.jpg`, description: 'Uşaqlar üçün məhsul, oyun, qulluq və ailə seçimlərini rahatlıqla tapın.' },
      { slug: 'avtomobil', label: 'Avtomobil', href: '/magaza/avtomobil/', image: `${categoryImages}/magaza/avtomobil.jpg`, description: 'Avtomobil aksesuarları, qulluq vasitələri və sürücülər üçün faydalı məhsullar.' },
      { slug: 'xidmetler', label: 'Xidmətlər', href: '/magaza/xidmetler/', image: `${categoryImages}/magaza/xidmetler.jpg`, description: 'Bakı üzrə gündəlik ehtiyaclara uyğun peşəkar xidmət təkliflərini nəzərdən keçirin.' },
      { slug: 'hediyyeler', label: 'Hədiyyələr', href: '/magaza/hediyyeler/', image: `${categoryImages}/baki-club/hediyyeler.jpg`, description: 'Hədiyyə üçün seçilmiş promo məhsulları və xüsusi təklifləri bir səhifədə kəşf edin.' }
    ]
  },
  {
    key: 'endirimler',
    slug: 'endirimler',
    label: 'Endirimlər',
    href: '/endirimler/',
    image: `${categoryImages}/endirimler.jpg`,
    kicker: 'ENDİRİM MƏRKƏZİ',
    description: 'Restoran, market, moda, gözəllik, əyləncə və səyahət üçün aktiv endirimləri kəşf edin.',
    children: [
      { slug: 'restoranlar', label: 'Restoranlar', href: '/endirimler/restoranlar/', image: `${categoryImages}/endirimler/restoranlar.jpg`, description: 'Bakı restoranlarında aktual menyu endirimləri və xüsusi qiymətlər.' },
      { slug: 'marketler', label: 'Marketlər', href: '/endirimler/marketler/', image: `${categoryImages}/endirimler/marketler.jpg`, description: 'Market alış-verişində qənaət yaradan endirimlər və xüsusi qiymətlər.' },
      { slug: 'geyim', label: 'Geyim', href: '/endirimler/geyim/', image: `${categoryImages}/endirimler/geyim.jpg`, description: 'Geyim və aksesuar mağazalarında mövsümün sərfəli endirimlərini tapın.' },
      { slug: 'gozellik-saglamliq', label: 'Gözəllik & Sağlamlıq', href: '/endirimler/gozellik-saglamliq/', image: `${categoryImages}/endirimler/gozellik-saglamliq.jpg`, description: 'Gözəllik salonu, qulluq və sağlamlıq xidmətləri üzrə aktual endirimlər.' },
      { slug: 'eylence', label: 'Əyləncə', href: '/endirimler/eylence/', image: `${categoryImages}/endirimler/eylence.jpg`, description: 'Ailə və dostlarla istirahət üçün əyləncə məkanlarının xüsusi təklifləri.' },
      { slug: 'seyahet', label: 'Səyahət', href: '/endirimler/seyahet/', image: `${categoryImages}/endirimler/seyahet.jpg`, description: 'Səyahət, otel və şəhər təcrübələri üçün sərfəli endirim və paketlər.' }
    ]
  },
  {
    key: 'kuponlar',
    slug: 'kuponlar',
    label: 'Kuponlar',
    href: '/kuponlar/',
    image: `${categoryImages}/endirimler.jpg`,
    kicker: 'AKTİV KUPONLAR',
    description: 'TVShop tərəfdaşlarının aktiv kupon kodlarını, istifadə şərtlərini və son tarixlərini bir səhifədə izləyin.',
    children: []
  },
  {
    key: 'kampaniyalar',
    slug: 'kampaniyalar',
    label: 'Kampaniyalar',
    href: '/kampaniyalar/',
    image: `${categoryImages}/kampaniyalar.jpg`,
    kicker: 'AKTİV FÜRSƏTLƏR',
    description: 'Günün təkliflərini, həftəlik kampaniyaları, məhdud və mövsümi endirimləri vaxtında izləyin.',
    children: [
      { slug: 'gunun-teklifi', label: 'Günün Təklifi', href: '/kampaniyalar/gunun-teklifi/', image: `${categoryImages}/kampaniyalar/gunun-teklifi.jpg`, description: 'Yalnız bu gün üçün seçilmiş məhsul, xidmət və endirim kampaniyaları.' },
      { slug: 'heftenin-kampaniyasi', label: 'Həftənin Kampaniyası', href: '/kampaniyalar/heftenin-kampaniyasi/', image: `${categoryImages}/kampaniyalar/heftenin-kampaniyasi.jpg`, description: 'Həftə ərzində qüvvədə olan seçilmiş brend və mağaza kampaniyaları.' },
      { slug: 'mehdud-sayda', label: 'Məhdud Sayda', href: '/kampaniyalar/mehdud-sayda/', image: `${categoryImages}/kampaniyalar/mehdud-sayda.jpg`, description: 'Say və müddət məhdudiyyəti olan fürsətləri bitmədən kəşf edin.' },
      { slug: 'movsumi-endirimler', label: 'Mövsümi Endirimlər', href: '/kampaniyalar/movsumi-endirimler/', image: `${categoryImages}/kampaniyalar/movsumi-endirimler.jpg`, description: 'Bayram və mövsümlərə uyğun seçilmiş endirim və alış-veriş kampaniyaları.' }
    ]
  },
  {
    key: 'jurnal',
    slug: 'jurnal',
    label: 'Jurnal & Bloq',
    href: '/jurnal/',
    image: `${categoryImages}/jurnal.jpg`,
    kicker: 'TVSHOP JURNAL',
    description: 'Son jurnal buraxılışını, arxivi, brend hekayələrini və alış-veriş məsləhətlərini oxuyun.',
    children: [
      { slug: 'son-buraxilis', label: 'Son Buraxılış (PDF)', href: '/jurnal/son-buraxilis/', image: `${categoryImages}/jurnal/son-buraxilis.jpg`, description: 'TVShop jurnalının ən son rəqəmsal buraxılışını və seçilmiş yazıları kəşf edin.' },
      { slug: 'arxiv', label: 'Arxiv', href: '/jurnal/arxiv/', image: `${categoryImages}/jurnal/arxiv.jpg`, description: 'TVShop jurnalının əvvəlki buraxılış və məqalələrini tarix üzrə nəzərdən keçirin.' },
      { slug: 'brend-hekayeleri', label: 'Brend Hekayələri', href: '/jurnal/brend-hekayeleri/', image: `${categoryImages}/jurnal/brend-hekayeleri.jpg`, description: 'Bakıda fəaliyyət göstərən brendlərin inkişaf, satış və yenilik hekayələrini oxuyun.' },
      { slug: 'alis-veris-meslehetleri', label: 'Alış-veriş Məsləhətləri', href: '/jurnal/alis-veris-meslehetleri/', image: `${categoryImages}/jurnal/alis-veris-meslehetleri.jpg`, description: 'Daha düzgün seçim və sərfəli alış-veriş üçün praktik bələdçi və məsləhətlər.' }
    ]
  },
  {
    key: 'baki-club',
    slug: 'baki-club',
    label: 'Bakı Club',
    href: '/baki-club/',
    image: `${categoryImages}/baki-club.jpg`,
    kicker: 'LOYALLIQ PROQRAMI',
    description: 'QR skanları, kampaniyalar və alış-veriş vasitəsilə xal qazanın, hədiyyə və xüsusi fürsətlər əldə edin.',
    children: [
      { slug: 'xal-qazanma', label: 'Xal Qazanma', href: '/baki-club/xal-qazanma/', image: `${categoryImages}/baki-club/xal-qazanma.jpg`, description: 'TVShop alış-verişləri, kampaniyaları və QR skanları ilə xal toplama qaydaları.' },
      { slug: 'hediyyeler', label: 'Hədiyyələr', href: '/baki-club/hediyyeler/', image: `${categoryImages}/baki-club/hediyyeler.jpg`, description: 'Topladığınız Bakı Club xalları ilə əldə edə biləcəyiniz hədiyyə və üstünlüklər.' },
      { slug: 'giveawayler', label: 'Giveawaylər', href: '/baki-club/giveawayler/', image: `${categoryImages}/baki-club/giveawayler.jpg`, description: 'Bakı Club üzvləri üçün keçirilən xüsusi giveaway və hədiyyə çəkilişləri.' },
      { slug: 'qr-idareetme', label: 'QR İdarəetmə', href: '/baki-club/qr-idareetme/', image: `${categoryImages}/baki-club/qr-idareetme.jpg`, description: 'QR kuponları, skan tarixçəsini, loyallıq xallarını və üstünlükləri bir mərkəzdən izləyin.' }
    ]
  },
  {
    key: 'elanlar',
    slug: 'elanlar',
    label: 'Elanlar',
    href: '/elanlar/',
    image: `${categoryImages}/elanlar.jpg`,
    kicker: 'ŞƏHƏR ELANLARI',
    description: 'Bakı üzrə məhsul, xidmət, əmlak və avtomobil elanlarını vahid platformada rahatlıqla kəşf edin.',
    children: [
      { slug: 'mehsullar', label: 'Məhsullar', href: '/elanlar/mehsullar/', image: `${categoryImages}/elanlar/mehsullar.jpg`, description: 'Yeni və ikinci əl məhsul elanlarını qiymət və təqdimat məlumatları ilə nəzərdən keçirin.' },
      { slug: 'xidmetler', label: 'Xidmətlər', href: '/elanlar/xidmetler/', image: `${categoryImages}/elanlar/xidmetler.jpg`, description: 'Bakı üzrə təmir, qulluq, çatdırılma və digər peşəkar xidmət elanları.' },
      { slug: 'emlak', label: 'Əmlak', href: '/elanlar/emlak/', image: `${categoryImages}/elanlar/emlak.jpg`, description: 'Satış və kirayə üçün mənzil, obyekt və digər əmlak elanlarını kəşf edin.' },
      { slug: 'avtomobil', label: 'Avtomobil', href: '/elanlar/avtomobil/', image: `${categoryImages}/elanlar/avtomobil.jpg`, description: 'Avtomobil və nəqliyyat vasitələri üzrə aktual satış elanlarına baxın.' }
    ]
  },
  {
    key: 'biznes',
    slug: 'biznes',
    label: 'Biznes üçün',
    href: '/biznes/',
    image: `${categoryImages}/biznes.jpg`,
    kicker: 'BİZNES ÜÇÜN',
    description: 'Reklam, sponsorluq, brend vitrini və analitika həlləri ilə biznesinizi TVShop ekosistemində böyüdün.',
    children: [
      { slug: 'reklam-ver', label: 'Reklam Ver', href: '/biznes/reklam-ver/', image: `${categoryImages}/biznes/reklam-ver.jpg`, description: 'Brendinizi hədəf auditoriyaya uyğun banner, jurnal və rəqəmsal reklamlarla tanıdın.' },
      { slug: 'sponsorluq', label: 'Sponsorluq', href: '/biznes/sponsorluq/', image: `${categoryImages}/biznes/sponsorluq.jpg`, description: 'Jurnal, tədbir, kampaniya və xüsusi layihələr üçün sponsorluq imkanlarını kəşf edin.' },
      { slug: 'brend-vitrini', label: 'Brend Vitrini', href: '/biznes/brend-vitrini/', image: `${categoryImages}/biznes/brend-vitrini.jpg`, description: 'Məhsul və xidmətlərinizi SEO uyğun brend vitrini ilə daha geniş auditoriyaya təqdim edin.' },
      { slug: 'analitika-paneli', label: 'Analitika Paneli', href: '/biznes/analitika-paneli/', image: `${categoryImages}/biznes/analitika-paneli.jpg`, description: 'Baxış, klik, QR skanı, sifariş və dönüşüm göstəricilərini vahid paneldə ölçün.' }
    ]
  }
] as const satisfies readonly NavigationSection[];

export const navigationPaths = navigationSections.flatMap((section) => [
  section.href,
  ...section.children.map((child) => child.href)
]);

export function findNavigationSection(value: string): NavigationSection | undefined {
  return navigationSections.find((section) => section.key === value || section.slug === value);
}

export function findNavigationChild(section: NavigationSection, slug: string): NavigationChild | undefined {
  return section.children.find((child) => child.slug === slug);
}
