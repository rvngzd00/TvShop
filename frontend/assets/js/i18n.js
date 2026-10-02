(() => {
  'use strict';

  const STORAGE_KEY = 'gundelikBakiLanguage';
  const SUPPORTED_LANGUAGES = new Set(['az', 'en']);
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  const originalStructuredData = new WeakMap();

  const translations = new Map(Object.entries({
    'TVShop — Endirim, Kupon, Reklam, Elan və Kampaniyalar': 'TVShop — Discounts, Coupons, Ads, Listings and Campaigns',
    'TVShop — Endirim, Kupon və Kampaniyalar': 'TVShop — Discounts, Coupons and Campaigns',
    'TVShop — Bakıda endirimlər, kuponlar, kampaniyalar, elanlar və rəqəmsal jurnal. Şəhərin fürsətlərini kəşf et. Oxu, skan et, qazan!': 'TVShop brings together discounts, coupons, campaigns, listings and a digital magazine in Baku. Discover the city’s best opportunities. Read, scan and win!',
    'Bakının endirim, kupon, kampaniya, elan və rəqəmsal jurnal platforması.': 'Baku’s platform for discounts, coupons, campaigns, listings and the digital magazine.',
    'Əsas məzmuna keç': 'Skip to main content',
    'TVShop — Şəhərin fürsətlər platforması': 'TVShop — The city’s opportunities platform',
    'Müştəri dəstəyi': 'Customer support',
    'TVSHOP EKRANI': 'TVSHOP SCREEN',
    'İzlə, kəşf et, alış-veriş et': 'Watch, discover and shop',
    'Yayım məlumatı yüklənir…': 'Loading broadcast information…',
    'Canlı Yayım': 'Live',
    'Canlı yayım aktivdir': 'Live broadcast is active',
    'Seçilmiş video kontenti': 'Featured video content',
    'TV media platformaları': 'TV media platforms',
    'Hazırda canlı yayım yoxdur': 'No live broadcast right now',
    'CANLI': 'LIVE',
    'TVShop canlı yayımı': 'TVShop live broadcast',
    'Canlı Yayım kontenti hazırda mövcud deyil': 'Live content is currently unavailable',
    'YouTube kontenti hazırda mövcud deyil': 'YouTube content is currently unavailable',
    'TikTok kontenti hazırda mövcud deyil': 'TikTok content is currently unavailable',
    'Instagram kontenti hazırda mövcud deyil': 'Instagram content is currently unavailable',
    'Yeni yayımlar əlavə edildikdə burada görünəcək.': 'New broadcasts will appear here when they are added.',
    'YouTube videosu': 'YouTube video',
    'TikTok videosu': 'TikTok video',
    'Instagram videosu': 'Instagram video',
    'YouTube kontenti': 'YouTube content',
    'TikTok kontenti': 'TikTok content',
    'Instagram kontenti': 'Instagram content',
    'Salam, qonaq': 'Hello, guest',
    'Daha yaxşı təcrübə üçün daxil olun': 'Sign in for a better experience',
    'Elektronika': 'Electronics',
    'Ev & Mətbəx': 'Home & Kitchen',
    'Moda': 'Fashion',
    'Gözəllik & Sağlamlıq': 'Beauty & Wellness',
    'Qida': 'Food',
    'Uşaq': 'Kids',
    'Avtomobil': 'Automotive',
    'Xidmətlər': 'Services',
    'Hədiyyələr': 'Gifts',
    'Endirimlər': 'Discounts',
    'Restoranlar': 'Restaurants',
    'Marketlər': 'Markets',
    'Geyim': 'Clothing',
    'Əyləncə': 'Entertainment',
    'Səyahət': 'Travel',
    'Kuponlar': 'Coupons',
    'Kampaniyalar': 'Campaigns',
    'Günün Təklifi': 'Deal of the Day',
    'Həftənin Kampaniyası': 'Campaign of the Week',
    'Məhdud Sayda': 'Limited Stock',
    'Mövsümi Endirimlər': 'Seasonal Discounts',
    'Jurnal & Bloq': 'Magazine & Blog',
    'Son Buraxılış (PDF)': 'Latest Issue (PDF)',
    'Arxiv': 'Archive',
    'Brend Hekayələri': 'Brand Stories',
    'Alış-veriş Məsləhətləri': 'Shopping Tips',
    'Xal Qazanma': 'Earn Points',
    'Giveawaylər': 'Giveaways',
    'QR İdarəetmə': 'QR Management',
    'Elanlar': 'Listings',
    'Məhsullar': 'Products',
    'Əmlak': 'Real Estate',
    'Biznes üçün': 'For Business',
    'Reklam Ver': 'Advertise',
    'Sponsorluq': 'Sponsorship',
    'Brend Vitrini': 'Brand Showcase',
    'Analitika Paneli': 'Analytics Dashboard',
    'Parametrlər': 'Settings',
    'ABŞ dollar ($) - USD': 'US dollar ($) - USD',
    'Diablo Alətlər': 'Diablo Tools',
    'Klein Alətlər': 'Klein Tools',
    'Triton Alətlər': 'Triton Tools',
    'Klein Alətlər elektrikçi alət dəsti': 'Klein Tools electrician tool set',
    'Cəfər Cabbarlı 33, AZ1065, Bakı/Azərbaycan': '33 Jafar Jabbarli St, AZ1065, Baku/Azerbaijan',
    'Əlaqə': 'Contact',
    '99 AZN-dən yuxarı pulsuz çatdırılma': 'Free delivery on orders over 99 AZN',
    '99 AZN-dən pulsuz çatdırılma': 'Free delivery over 99 AZN',
    'My hesab': 'My account',
    'Hesabım': 'My account',
    'İdarəetmə paneli': 'Management panel',
    'Satıcı kabineti': 'Seller dashboard',
    'İdarəetmə alətlərinə keçin': 'Open management tools',
    'Məhsul və sifarişlərinizi idarə edin': 'Manage your products and orders',
    'İdarəetmə keçidləri': 'Management links',
    'Satıcı hesabı keçidləri': 'Seller account links',
    'Xoş gəlmisiniz': 'Welcome',
    'Şəxsi hesab': 'Personal account',
    'Hesab keçidləri': 'Account links',
    'Hesab paneli': 'Account dashboard',
    'Hesabınıza ümumi baxış': 'Account overview',
    'Sifarişlər': 'Orders',
    'Sifarişlərinizi izləyin': 'Track your orders',
    'Seçilmişlər': 'Favorites',
    'Bəyəndiyiniz məhsullar': 'Products you like',
    'Hesab məlumatları': 'Account details',
    'Profil və təhlükəsizlik': 'Profile and security',
    'Çıxış': 'Sign out',
    'Daxil ol': 'Sign in',
    'DAXİL OL': 'SIGN IN',
    'E-poçt': 'Email',
    'Şifrə': 'Password',
    'Şifrəni unutmusunuz?': 'Forgot your password?',
    'Satıcı olaraq daxil ol': 'Sign in as a seller',
    'SATICI OLARAQ DAXİL OL': 'SIGN IN AS A SELLER',
    'Qeydiyyat': 'Register',
    'Axtarış': 'Search',
    'Nə axtarırsınız?': 'What are you looking for?',
    'Müştəri və biznes dəstəyi': 'Customer and business support',
    'Canlı çat': 'Live chat',
    'Mütəxəssislə danış': 'Talk to a specialist',
    'Mağaza': 'Shop',
    'Naviqasiya': 'Navigation',
    'GÜCLÜ BAŞLA': 'START STRONG',
    '30% ilk alış endirimi': '30% off your first purchase',
    'ilk alış endirimi': 'off your first purchase',
    'Alış etdikdə Gözəllik & Sağlamlıq üçün': 'Shop Beauty & Wellness for',
    'İndi bax': 'Shop now',
    '1 AL, 1 HƏDİYYƏ': 'BUY 1, GET 1 FREE',
    'GÜNÜN XÜSUSİ TƏKLİFİ': 'SPECIAL OFFER OF THE DAY',
    'Seçilmiş məhsullarda yüksək keyfiyyət və sərfəli qiymət': 'Premium quality and great value on selected products',
    'SUPER TƏKLİFLƏR': 'SUPER DEALS',
    'MÖVSÜM ENDİRİMLƏRİ!': 'SEASONAL DISCOUNTS!',
    'Seçilmiş brendlər -': 'Selected brands —',
    'Hamısı sərfəli Brendlər!': 'All your favorite brands at great prices!',
    'Seçilmiş brendlər - Hamısı sərfəli Brendlər!': 'Selected brands — all at great prices!',
    'HƏDİYYƏ QAZAN': 'WIN A GIFT',
    'Hədiyyə qazan': 'Win a gift',
    'Seçilmiş məhsul alışı ilə': 'With selected product purchases',
    'İndi kəşf et': 'Discover now',
    'Endirim fürsətləri!': 'Discount opportunities!',
    'ÖZ DƏSTİNİ QUR': 'BUILD YOUR OWN SET',
    'Öz dəstini qur': 'Build your own set',
    'Həmişə sərfəli seçim.': 'Always a smart choice.',
    'Yeni': 'New',
    'YENİ': 'NEW',
    'PULSUZ': 'FREE',
    'EV VƏ BAĞ': 'HOME & GARDEN',
    'Ev və bağ': 'Home & Garden',
    'Keyfiyyətli məhsullar': 'Quality products',
    'Kateqoriyalar': 'Categories',
    'Məhsulları seçin': 'Choose products',
    'Kateqoriya seçin': 'Choose a category',
    'Hava kompressorları': 'Air compressors',
    'Hava Alətlər': 'Air tools',
    'Şişirtmə cihazları': 'Inflation tools',
    'Əl Alətlər': 'Hand tools',
    'Kəsici alətlər': 'Cutting tools',
    'Təmir alətləri': 'Repair tools',
    'Çəkiclər': 'Hammers',
    'Dəzgah avadanlığı': 'Workshop machinery',
    'İşarələmə alətləri': 'Marking tools',
    'Ölçmə': 'Measuring',
    'Lazer Ölçü cihazları': 'Laser measuring devices',
    'Ölçü cihazları': 'Measuring devices',
    'Ölçmə alətləri': 'Measuring tools',
    'Temperatur ölçənlər': 'Thermometers',
    'Digər': 'Other',
    'Elektrik Alətlər': 'Power tools',
    'Drellər': 'Drills',
    'Yağlama cihazları': 'Lubrication tools',
    'Cilalama avadanlığı': 'Polishing equipment',
    'Zərbəli açarlar': 'Impact wrenches',
    'Mismar tapançaları': 'Nail guns',
    'Rəndələr': 'Planers',
    'Açar dəstləri': 'Wrench sets',
    'Zımpara cihazları': 'Sanders',
    'Mişarlar': 'Saws',
    'Steplerlər': 'Staplers',
    'Alət Xidmətlər': 'Tool services',
    'Əl Alət Xidmətlər': 'Hand tool services',
    'Ölçmə & Marking': 'Measuring & Marking',
    'Lazer Level Xidmətlər': 'Laser level services',
    'Elektrik Alət Xidmətlər': 'Power tool services',
    'Drel ucları': 'Drill bits',
    'Brend seçin': 'Choose a brand',
    'Mənşə ölkəsini seçin': 'Choose country of origin',
    'Çili': 'Chile',
    'Çin': 'China',
    'Almaniya': 'Germany',
    'Hindistan': 'India',
    'İtaliya': 'Italy',
    'Yaponiya': 'Japan',
    'Malayziya': 'Malaysia',
    'Meksika': 'Mexico',
    'Cənubi Koreya': 'South Korea',
    'İsveçrə': 'Switzerland',
    'Tayvan': 'Taiwan',
    'Tailand': 'Thailand',
    'ABŞ': 'USA',
    'Vyetnam': 'Vietnam',
    'Tətbiq et': 'Apply',
    'TƏTBİQ ET': 'APPLY',
    'Sıfırla': 'Reset',
    'Seçilmiş fürsətlər': 'Featured deals',
    'Seçilmişlərə əlavə et': 'Add to favorites',
    'Seçilmişlərdən çıxar': 'Remove from favorites',
    'Seçilmişlərə əlavə edildi': 'Added to favorites',
    'Seçilmişlərdən çıxarıldı': 'Removed from favorites',
    'Sürətli baxış': 'Quick view',
    'Sürətli baxışı açmaq mümkün olmadı': 'Quick view could not be opened',
    'İlk məhsul sütunu göstərilir': 'The first product column is displayed',
    'YENİ FÜRSƏTLƏR': 'NEW OPPORTUNITIES',
    'Xüsusi təkliflər və endirimlər': 'Special offers and discounts',
    'Ən populyar seçimlər': 'Most popular picks',
    'SƏBƏTƏ AT': 'ADD TO CART',
    'Səbətə at': 'Add to cart',
    'SƏBƏTƏ BAX': 'VIEW CART',
    'ENDİRİM!': 'SALE!',
    'Brendlərə görə alış-veriş': 'Shop by brand',
    'Brendlər': 'Brands',
    'Brendlərə görə alış-veriş Brendlər': 'Shop by brand',
    'ƏN ÇOX SEÇİLƏNLƏR:': 'TOP PICKS:',
    'HİT!': 'HOT!',
    'KEYFİYYƏTLİ': 'QUALITY',
    'MƏHSULLAR': 'PRODUCTS',
    'Ən yaxşı təkliflər': 'Best offers',
    '99 AZN xərclə': 'Spend 99 AZN',
    '25% endirim qazan': 'Get 25% off',
    'BRENDİ KƏŞF ET': 'DISCOVER THE BRAND',
    'Yüksək keyfiyyətli məhsullar.': 'High-quality products.',
    'TVShop yeniliklərini izlə': 'Follow the latest from TVShop',
    'Son təkliflər, kampaniyalar və şəhərin ən maraqlı xəbərləri': 'Latest deals, campaigns and the city’s most interesting stories',
    'Alış-veriş bələdçisi': 'Shopping guide',
    'Ətraflı oxu': 'Read more',
    'Brend hekayəsi': 'Brand story',
    'Məsləhətlər': 'Tips',
    'TVShop jurnalı': 'TVShop magazine',
    'İlk xəbər göstərilir': 'The first story is displayed',
    'İYL': 'JUL',
    'XÜSUSİ MÜDDƏTLİ': 'LIMITED-TIME',
    'TƏKLİFLƏR': 'OFFERS',
    'Səbətim': 'My cart',
    'SƏBƏTİM': 'MY CART',
    '5 məhsul sifariş et, növbəti gün pulsuz çatdırılma qazan!': 'Order 5 products and get free next-day delivery!',
    'Ödəniş üsulları': 'Payment methods',
    'TVShop şəhərin fürsətlərini, rəqəmsal jurnalı və etibarlı biznesləri vahid platformada birləşdirir. Oxu. Skan et. Qazan.': 'TVShop brings together the city’s opportunities, a digital magazine and trusted businesses on one platform. Read. Scan. Win.',
    'Platforma haqqında': 'About the platform',
    'Biz kimik': 'Who we are',
    'Tez-tez verilən suallar': 'Frequently asked questions',
    'Çatdırılma siyasəti': 'Delivery policy',
    'Geri qaytarma': 'Returns',
    'Biznes əməkdaşlığı': 'Business partnerships',
    'Reklam portalı': 'Advertising portal',
    'Brend olun': 'Showcase your brand',
    'Sürətli keçidlər': 'Quick links',
    'Son jurnal': 'Latest magazine',
    'Elan yerləşdir': 'Post a listing',
    'Bazar ertəsi – Cümə: 09:00 – 18:00': 'Monday – Friday: 09:00 – 18:00',
    'Şənbə: 10:00 – 15:00': 'Saturday: 10:00 – 15:00',
    'Copyright © 2026 TVShop. Bütün hüquqlar qorunur.': 'Copyright © 2026 TVShop. All rights reserved.',
    'TVShop Panorama Reklam MMC-nin satış platformasıdır.': 'TVShop is the sales platform of Panorama Reklam LLC.',
    'VÖEN 2007614681': 'Tax ID 2007614681',
    'Məxfilik siyasəti': 'Privacy policy',
    'Geri qaytarma siyasəti': 'Return policy',
    'İstifadə şərtləri': 'Terms of use',
    'Hesab': 'Account',
    'Səbət': 'Cart',
    'Yuxarı': 'Top',
    'Bunları da bəyənə bilərsiniz': 'You may also like',
    'Yekun məbləğ:': 'Total:',
    'Səbətiniz boşdur': 'Your cart is empty',
    'Bəyəndiyiniz məhsulları səbətə əlavə edin.': 'Add products you like to your cart.',
    'Məhsul səbətə əlavə edildi': 'Product added to cart',
    'Məhsul səbətdən silindi': 'Product removed from cart',
    'Məhsulu səbətə əlavə etmək mümkün olmadı': 'The product could not be added to the cart',
    'Sayı azalt': 'Decrease quantity',
    'Sayı artır': 'Increase quantity',
    'Səbəti bağla': 'Close cart',
    'Əvvəlki məhsullar': 'Previous products',
    'Növbəti məhsullar': 'Next products',
    'Tövsiyə olunan məhsullar': 'Recommended products',
    'Məhsul əməliyyatları': 'Product actions',
    'Tövsiyə olunan məhsul': 'Recommended product',
    'Əlavə məlumat': 'Additional information',
    'Pəncərəni bağla': 'Close dialog',
    'TÖVSİYƏ OLUNUR!': 'RECOMMENDED!',
    'Məhsul sayı': 'Product quantity',
    'Məhsul səhifəsinə keç': 'View product page',
    'Brend': 'Brand',
    'Satıcı': 'Seller',
    'Məhsul növü': 'Product type',
    'Stok': 'Stock',
    'ədəd': 'items',
    'Fiziki məhsul': 'Physical product',
    'physical': 'Physical product',
    'service': 'Service',
    'Xidmət': 'Service',
    'Bəli': 'Yes',
    'Xeyr': 'No',
    'mənşə': 'Origin',
    'zəmanət': 'Warranty',
    'çatdırılma': 'Delivery',
    '12 ay': '12 months',
    'Bakı daxili 1 gün': '1 day within Baku',
    'Demo təqdimat datası': 'Demo presentation data',
    'Geri': 'Back',
    'Hamısına bax': 'View all',
    'Menyu': 'Menu',
    'Dil': 'Language',
    'Dili seçin': 'Choose language',
    'Saytın dili': 'Site language',
    '2026-cı ildə düzgün elektrik aləti necə seçilməlidir?': 'How to choose the right power tool in 2026',
    'Endirim kampaniyasında ağıllı alış-verişin 7 qaydası': '7 rules for smart shopping during a sale campaign',
    'Baku Pro Market: yerli satıcının rəqəmsal inkişaf hekayəsi': 'Baku Pro Market: a local seller’s digital growth story',
    'Yay fürsətlərini qaçırmamaq üçün praktik alış-veriş planı': 'A practical shopping plan for making the most of summer deals',
    'TVShop jurnalının yeni rəqəmsal buraxılışı yayımlandı': 'The new digital issue of TVShop magazine is now available',
    'Yerli brendlər rəqəmsal vitrində necə fərqlənə bilər?': 'How can local brands stand out in a digital storefront?',
    'Bakı Club üzvləri üçün yeni hədiyyə imkanları': 'New gift opportunities for Baku Club members',
    'Bakı Club ilə QR skanlarından necə xal qazanmaq olar?': 'How to earn points with Baku Club QR scans',
    'Ayın ən çox oxunan alış-veriş və şəhər hekayələri': 'The month’s most-read shopping and city stories'
  }));

  const productTitles = new Map(Object.entries({
    'Milwaukee M18 zərbəli drel dəsti': 'Milwaukee M18 impact drill set',
    'DeWalt XR simsiz vintaçan': 'DeWalt XR cordless screwdriver',
    'Makita peşəkar bucaq cilalayıcı': 'Makita professional angle grinder',
    'Bosch Professional alət dəsti': 'Bosch Professional tool set',
    'Festool dəqiq kəsim mişarı': 'Festool precision track saw',
    'Metabo universal emalatxana dəsti': 'Metabo universal workshop set',
    'JET masaüstü ağac dəzgahı': 'JET benchtop woodworking machine',
    'MAX pnevmatik mismar tapançası': 'MAX pneumatic nail gun',
    'Milwaukee yüksək torklu zərbəli açar': 'Milwaukee high-torque impact wrench',
    'Bosch yaşıl lazer səviyyəölçən': 'Bosch green laser level',
    'Makita akkumulyatorlu dairəvi mişar': 'Makita cordless circular saw',
    'DeWalt orbital zımpara cihazı': 'DeWalt orbital sander',
    'Klein Tools elektrikçi alət dəsti': 'Klein Tools electrician tool set',
    'Stabila maqnitli su tərəzisi': 'Stabila magnetic spirit level',
    'RIKON dəzgahüstü qazma dəzgahı': 'RIKON benchtop drill press',
    'Rolair səssiz hava kompressoru': 'Rolair quiet air compressor',
    'ToughBuilt modul alət çantası': 'ToughBuilt modular tool bag',
    'Triton dəqiq frez aləti': 'Triton precision router',
    'Stanley çəkic və toxmaq dəsti': 'Stanley hammer and mallet set',
    'Milwaukee Shockwave burğu dəsti': 'Milwaukee Shockwave drill bit set',
    'TechPoint ağıllı ev mərkəzi': 'TechPoint smart home hub',
    'TechPoint portativ enerji stansiyası': 'TechPoint portable power station',
    'Klassik kişi köynəyi': 'Classic men’s shirt',
    'Qadın gündəlik çantası': 'Women’s everyday handbag',
    'Uniseks şəhər idman ayaqqabısı': 'Unisex urban sneakers',
    'Yüngül yay gödəkçəsi': 'Lightweight summer jacket',
    'Premium dəri kəmər': 'Premium leather belt',
    'Minimalist qol saatı': 'Minimalist wristwatch',
    'Rahat pambıq sviter': 'Comfortable cotton sweater',
    'Şəhər üslublu gün eynəyi': 'Urban-style sunglasses',
    'Zərif ipək şərf': 'Elegant silk scarf',
    'Su keçirməyən bel çantası': 'Waterproof backpack',
    'Nəmləndirici üz kremi': 'Moisturizing face cream',
    'Təbii saç baxım serumu': 'Natural hair care serum',
    'Günəşdən qoruyucu SPF 50': 'SPF 50 sunscreen',
    'Elektrik üz təmizləmə cihazı': 'Electric facial cleansing device',
    'Vitamin C dəri serumu': 'Vitamin C skin serum',
    'Aromatik bədən baxım dəsti': 'Aromatic body care set',
    'Ortopedik boyun yastığı': 'Orthopedic neck pillow',
    'Rəqəmsal təzyiq ölçən': 'Digital blood pressure monitor',
    'Masaj üçün efir yağları dəsti': 'Essential oil massage set',
    'Gündəlik multivitamin kompleksi': 'Daily multivitamin complex',
    'Premium dağ balı 500 q': 'Premium mountain honey 500 g',
    'Yerli çay kolleksiyası': 'Local tea collection',
    'Qurudulmuş meyvə səbəti': 'Dried fruit basket',
    'Seçilmiş qəhvə dənələri 500 q': 'Selected coffee beans 500 g',
    'Təbii nar şirəsi dəsti': 'Natural pomegranate juice set',
    'Ənənəvi mürəbbə kolleksiyası': 'Traditional jam collection',
    'Çərəz və quru meyvə qarışığı': 'Nut and dried fruit mix',
    'Səhər yeməyi hədiyyə qutusu': 'Breakfast gift box',
    'Organik zeytun yağı 750 ml': 'Organic olive oil 750 ml',
    'Azərbaycan şirniyyatı seçməsi': 'Azerbaijani sweets selection',
    'Yaradıcı konstruktor dəsti': 'Creative construction set',
    'İnteraktiv Azərbaycan əlifbası': 'Interactive Azerbaijani alphabet',
    'Uşaq üçün rəsm ləvazimatları': 'Children’s art supplies',
    'Təhlükəsiz taxta oyuncaq dəsti': 'Safe wooden toy set',
    'Məktəbli ergonomik bel çantası': 'Ergonomic school backpack',
    'Uşaq yataq tekstili dəsti': 'Children’s bedding set',
    'Balacalar üçün balans velosipedi': 'Balance bike for toddlers',
    'Məntiq və yaddaş oyunu': 'Logic and memory game',
    'Uşaq termosu və nahar qutusu': 'Children’s thermos and lunch box',
    'Nağıl kitabları kolleksiyası': 'Storybook collection',
    'Portativ avtomobil kompressoru': 'Portable car compressor',
    'Salon üçün premium ayaqaltı dəsti': 'Premium car floor mat set',
    'Simsiz telefon şarj tutacağı': 'Wireless phone charging mount',
    'Avtomobil videoqeydiyyatçısı': 'Car dash camera',
    'Təcili yardım alət çantası': 'Emergency tool bag',
    'Keramik kuzov qoruma dəsti': 'Ceramic body protection set',
    'Universal baqaj organizeri': 'Universal trunk organizer',
    'Rəqəmsal təkər təzyiq ölçəni': 'Digital tire pressure gauge',
    'Avtomobil üçün tozsoran': 'Car vacuum cleaner',
    'LED yol təhlükəsizlik dəsti': 'LED road safety kit',
    'Ev üçün elektrik ustası xidməti': 'Residential electrician service',
    'Kondisioner təmizləmə xidməti': 'Air conditioner cleaning service',
    'Peşəkar ev təmizliyi paketi': 'Professional home cleaning package',
    'Santexnika diaqnostikası': 'Plumbing diagnostics',
    'Mebel yığılması xidməti': 'Furniture assembly service',
    'Kompüter texniki dəstək paketi': 'Computer technical support package',
    'Avtomobil səyyar diaqnostikası': 'Mobile car diagnostics',
    'Foto və video çəkiliş paketi': 'Photo and video production package',
    'Kuryer və sürətli çatdırılma': 'Courier and express delivery',
    'Ev heyvanına gündəlik qulluq': 'Daily pet care'
  }));

  const productDescriptions = new Map(Object.entries({
    'Güclü mühərrik, iki akkumulyator və daşıma çantası ilə peşəkar dəst.': 'A professional set with a powerful motor, two batteries and a carrying case.',
    'Kompakt gövdə, yüksək fırlanma anı və uzunmüddətli XR batareya.': 'Compact body, high torque and a long-lasting XR battery.',
    'Metal və daş səthlər üçün təhlükəsiz, balanslı və məhsuldar cilalayıcı.': 'A safe, balanced and efficient grinder for metal and stone surfaces.',
    'Gündəlik peşəkar işlər üçün seçilmiş alətlərdən ibarət universal dəst.': 'A versatile set of selected tools for everyday professional work.',
    'Təmiz və dəqiq kəsim üçün bələdçi relsli premium emalatxana mişarı.': 'A premium workshop saw with a guide rail for clean, precise cuts.',
    'Təmir və montaj işləri üçün dayanıqlı, rahat və funksional alət seçimi.': 'A durable, comfortable and practical tool selection for repair and assembly work.',
    'Kiçik emalatxanalar üçün stabil konstruksiyalı dəqiq ağac emalı dəzgahı.': 'A precise woodworking machine with a stable build for small workshops.',
    'Sürətli montaj, erqonomik tutuş və ardıcıl işləmə üçün peşəkar model.': 'A professional model for fast assembly, ergonomic handling and consistent operation.',
    'Avtomobil və ağır montaj işləri üçün yüksək tork və ağıllı idarəetmə.': 'High torque and smart control for automotive and heavy assembly work.',
    'Parlaq yaşıl şüa, avtomatik nivelirləmə və rahat tripod bağlantısı.': 'Bright green beam, automatic leveling and convenient tripod mounting.',
    'Kabelsiz işləmə rahatlığı və müxtəlif materiallarda təmiz kəsim.': 'Cordless convenience and clean cuts across a range of materials.',
    'Aşağı vibrasiya və effektiv toz toplama ilə hamar səth nəticəsi.': 'A smooth finish with low vibration and efficient dust collection.',
    'Elektrik montajı üçün təhlükəsiz və rahat əsas əl alətləri dəsti.': 'A safe and practical essential hand-tool set for electrical installation.',
    'Güclü maqnit, aydın göstərici və dayanıqlı gövdə ilə dəqiq ölçmə.': 'Precise measuring with strong magnets, clear vials and a durable body.',
    'Emalatxanada sabit, təhlükəsiz və dəqiq qazma əməliyyatları üçün dəzgah.': 'A stable machine for safe and precise drilling in the workshop.',
    'Aşağı səs səviyyəsi və stabil hava təzyiqi ilə emalatxana kompressoru.': 'A workshop compressor with low noise and stable air pressure.',
    'Modul bölmələr və möhkəm material ilə alətlərin rahat daşınması.': 'Convenient tool transport with modular compartments and durable materials.',
    'Ağac emalında nəzarətli sürət və dəqiq frezləmə üçün peşəkar alət.': 'A professional tool for controlled speed and precise routing in woodworking.',
    'Təmir və montaj işləri üçün balanslı, möhkəm çəkic və toxmaq seçimi.': 'A balanced, durable hammer and mallet selection for repair and assembly work.',
    'Zərbəli alətlər üçün uzunömürlü və çoxölçülü peşəkar burğu dəsti.': 'A durable, multi-size professional drill bit set for impact tools.'
  }));

  const reverseProductTitles = new Map([...productTitles].map(([az, en]) => [en, az]));
  const reverseProductDescriptions = new Map([...productDescriptions].map(([az, en]) => [en, az]));

  function preferredLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED_LANGUAGES.has(saved) ? saved : 'az';
    } catch {
      return 'az';
    }
  }

  let language = preferredLanguage();

  function translateDynamic(value) {
    if (translations.has(value)) return translations.get(value);
    if (productTitles.has(value)) return productTitles.get(value);
    if (productDescriptions.has(value)) return productDescriptions.get(value);

    const hierarchyPrefix = value.match(/^((?:—\s*)+)(.+)$/);
    if (hierarchyPrefix) return `${hierarchyPrefix[1]}${translateDynamic(hierarchyPrefix[2])}`;

    const extraDescription = value.match(/^(.+) üçün ətraflı təqdimat, aktual qiymət, zəmanətli xidmət və sürətli Bakı çatdırılması\.$/);
    if (extraDescription) {
      const title = productTitles.get(extraDescription[1]) || extraDescription[1];
      return `${title}: detailed presentation, current price, guaranteed service and fast delivery in Baku.`;
    }
    const stockDescription = value.match(/^(.+) Məhsul stokdadır, təhlükəsiz sifariş və sürətli çatdırılma mümkündür\.$/);
    if (stockDescription) return `${translateDynamic(stockDescription[1])} The product is in stock, with secure ordering and fast delivery available.`;

    return value
      .replace(/^(\d+)-ci məhsul sütunu göstərilir$/, 'Product column $1 is displayed')
      .replace(/^(\d+)-ci məhsul mövqeyi$/, 'Product position $1')
      .replace(/^(\d+)-ci xəbər mövqeyi$/, 'Story position $1')
      .replace(/^Səbətdə (\d+) məhsul$/, '$1 products in cart')
      .replace(/^Seçilmişlərdə (\d+) məhsul$/, '$1 products in favorites')
      .replace(/ seçilmişlərə əlavə et$/i, ' — add to favorites')
      .replace(/ seçilmişlərdən çıxar$/i, ' — remove from favorites')
      .replace(/ məhsulunu səbətdən sil$/i, ' — remove from cart')
      .replace(/ məhsulunun sayı$/i, ' — product quantity')
      .replace(/ məhsulunu səbətə əlavə et$/i, ' — add to cart')
      .replace(/ səbətə əlavə et$/i, ' — add to cart')
      .replace(/ səbətə bax$/i, ' — view cart')
      .replace(/ üçün sürətli baxış$/i, ' — quick view')
      .replace(/ haqqında WhatsApp ilə soruş$/i, ' — ask on WhatsApp')
      .replace(/ əməliyyatları$/i, ' — actions')
      .replace(/ — məhsul şəkli$/i, ' — product image')
      .replace(/ loqosu$/i, ' logo')
      .replace(/ — panelə keç$/i, ' — open panel')
      .replace(/ bölməsinə keç$/i, ' section')
      .replace(/ kateqoriyası$/i, ' category')
      .replace(/ alt kateqoriyaları$/i, ' subcategories');
  }

  function t(value) {
    const text = String(value ?? '');
    return language === 'en' ? translateDynamic(text) : text;
  }

  function localizedProduct(product = {}) {
    const sourceTitle = reverseProductTitles.get(product.title) || product.title;
    if (language !== 'en') return { ...product, title: sourceTitle };
    const title = productTitles.get(sourceTitle) || translateDynamic(sourceTitle);
    return {
      ...product,
      title,
      short_description: translateDynamic(product.short_description || ''),
      shortDescription: translateDynamic(product.shortDescription || ''),
      description: translateDynamic(product.description || ''),
      alt_text: translateDynamic(product.alt_text || ''),
      attributes: product.attributes && typeof product.attributes === 'object'
        ? Object.fromEntries(Object.entries(product.attributes).map(([key, value]) => [translateDynamic(key), typeof value === 'string' ? translateDynamic(value) : value]))
        : product.attributes
    };
  }

  function canonicalProduct(product = {}) {
    const canonicalText = (value = '') => {
      if (reverseProductDescriptions.has(value)) return reverseProductDescriptions.get(value);
      const stockDescription = String(value).match(/^(.+) The product is in stock, with secure ordering and fast delivery available\.$/);
      if (stockDescription) return `${canonicalText(stockDescription[1])} Məhsul stokdadır, təhlükəsiz sifariş və sürətli çatdırılma mümkündür.`;
      const extraDescription = String(value).match(/^(.+): detailed presentation, current price, guaranteed service and fast delivery in Baku\.$/);
      if (extraDescription) {
        const title = reverseProductTitles.get(extraDescription[1]) || extraDescription[1];
        return `${title} üçün ətraflı təqdimat, aktual qiymət, zəmanətli xidmət və sürətli Bakı çatdırılması.`;
      }
      return value;
    };
    return {
      ...product,
      title: reverseProductTitles.get(product.title) || product.title,
      short_description: canonicalText(product.short_description),
      shortDescription: canonicalText(product.shortDescription),
      description: canonicalText(product.description)
    };
  }

  function localizedPost(post = {}) {
    if (language !== 'en') return { ...post };
    return {
      ...post,
      title: translateDynamic(post.title || ''),
      excerpt: translateDynamic(post.excerpt || ''),
      category_name: translateDynamic(post.category_name || ''),
      alt_text: translateDynamic(post.alt_text || '')
    };
  }

  function localizedCategory(category = {}) {
    if (language !== 'en') return { ...category };
    return {
      ...category,
      name: translateDynamic(category.name || ''),
      description: translateDynamic(category.description || ''),
      alt_text: translateDynamic(category.alt_text || '')
    };
  }

  function translatedRaw(raw) {
    const leading = raw.match(/^\s*/)?.[0] || '';
    const trailing = raw.match(/\s*$/)?.[0] || '';
    const content = raw.slice(leading.length, raw.length - trailing.length || undefined);
    return content ? `${leading}${translateDynamic(content.replace(/\s+/g, ' ').trim())}${trailing}` : raw;
  }

  function translateTextNode(node, force = false) {
    if (!node.nodeValue?.trim()) return;
    let source = originalText.get(node);
    if (source === undefined) {
      source = node.nodeValue;
      originalText.set(node, source);
    } else if (!force) {
      const expected = language === 'en' ? translatedRaw(source) : source;
      if (node.nodeValue !== expected && node.nodeValue !== source) {
        source = node.nodeValue;
        originalText.set(node, source);
      }
    }
    const next = language === 'en' ? translatedRaw(source) : source;
    if (node.nodeValue !== next) node.nodeValue = next;
  }

  function translateAttribute(element, name, force = false) {
    if (!element.hasAttribute(name)) return;
    let sources = originalAttributes.get(element);
    if (!sources) {
      sources = {};
      originalAttributes.set(element, sources);
    }
    let source = sources[name];
    const current = element.getAttribute(name) || '';
    if (source === undefined) {
      source = current;
      sources[name] = source;
    } else if (!force) {
      const expected = language === 'en' ? translateDynamic(source) : source;
      if (current !== expected && current !== source) {
        source = current;
        sources[name] = source;
      }
    }
    const next = language === 'en' ? translateDynamic(source) : source;
    if (current !== next) element.setAttribute(name, next);
  }

  function translateTree(root = document, force = false) {
    const start = root instanceof Document ? root.documentElement : root;
    if (!start) return;
    if (start.nodeType === Node.TEXT_NODE) translateTextNode(start, force);
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('script, style, noscript, svg')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) translateTextNode(walker.currentNode, force);
    const elements = start instanceof Element ? [start, ...start.querySelectorAll('*')] : [];
    elements.forEach((element) => {
      if (element.closest('script, style, noscript, svg')) return;
      ['aria-label', 'title', 'placeholder', 'alt'].forEach((name) => translateAttribute(element, name, force));
      if (element instanceof HTMLMetaElement) translateAttribute(element, 'content', force);
      if (element instanceof HTMLInputElement && ['submit', 'button'].includes(element.type)) translateAttribute(element, 'value', force);
    });
  }

  function closeLanguagePickers(except = null) {
    document.querySelectorAll('[data-language-picker]').forEach((picker) => {
      if (picker === except) return;
      picker.classList.remove('is-open');
      picker.querySelector('[data-language-trigger]')?.setAttribute('aria-expanded', 'false');
      const menu = picker.querySelector('.db-language-menu');
      if (menu) menu.hidden = true;
    });
  }

  function setLanguagePickerOpen(picker, open, { focusOption = false } = {}) {
    if (!picker) return;
    const trigger = picker.querySelector('[data-language-trigger]');
    const menu = picker.querySelector('.db-language-menu');
    if (!trigger || !menu) return;
    closeLanguagePickers(open ? picker : null);
    picker.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    if (open && focusOption) {
      menu.querySelector(`[data-language-option="${language}"]`)?.focus();
    }
  }

  function updateMetadata() {
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;
    document.querySelectorAll('[data-language-picker]').forEach((picker) => {
      const trigger = picker.querySelector('[data-language-trigger]');
      const current = picker.querySelector('[data-language-current]');
      if (current) current.textContent = language.toUpperCase();
      trigger?.setAttribute('aria-label', language === 'en' ? 'Site language' : 'Saytın dili');
      picker.querySelectorAll('[data-language-option]').forEach((option) => {
        const optionLanguage = option.dataset.languageOption;
        const active = optionLanguage === language;
        option.setAttribute('aria-selected', String(active));
        option.setAttribute('aria-label', optionLanguage === 'az'
          ? (language === 'en' ? 'Azerbaijani' : 'Azərbaycan dili')
          : (language === 'en' ? 'English' : 'İngilis dili'));
      });
    });
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      if (!originalStructuredData.has(script)) originalStructuredData.set(script, script.textContent || '');
      const source = originalStructuredData.get(script);
      if (language === 'az') {
        script.textContent = source;
        return;
      }
      try {
        const localizeJson = (value) => {
          if (Array.isArray(value)) return value.map(localizeJson);
          if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localizeJson(item)]));
          if (typeof value !== 'string' || /^(?:https?:|\/)/.test(value)) return value;
          return translateDynamic(value);
        };
        script.textContent = JSON.stringify(localizeJson(JSON.parse(source)));
      } catch {
        script.textContent = source;
      }
    });
  }

  function setLanguage(nextLanguage, { persist = true, announce = true } = {}) {
    const next = SUPPORTED_LANGUAGES.has(nextLanguage) ? nextLanguage : 'az';
    language = next;
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, language); } catch { /* Language still works for this page. */ }
    }
    closeLanguagePickers();
    translateTree(document, true);
    updateMetadata();
    if (announce) document.dispatchEvent(new CustomEvent('dailybaku:languagechange', { detail: { language } }));
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'characterData') translateTextNode(mutation.target);
      if (mutation.type === 'attributes' && mutation.target instanceof Element) translateAttribute(mutation.target, mutation.attributeName);
      mutation.addedNodes.forEach((node) => translateTree(node));
    });
  });

  function initialize() {
    document.addEventListener('click', (event) => {
      const option = event.target.closest?.('[data-language-option]');
      if (option) {
        const picker = option.closest('[data-language-picker]');
        setLanguage(option.dataset.languageOption);
        picker?.querySelector('[data-language-trigger]')?.focus();
        return;
      }

      const trigger = event.target.closest?.('[data-language-trigger]');
      if (trigger) {
        const picker = trigger.closest('[data-language-picker]');
        const open = trigger.getAttribute('aria-expanded') !== 'true';
        setLanguagePickerOpen(picker, open, { focusOption: open });
        return;
      }

      if (!event.target.closest?.('[data-language-picker]')) closeLanguagePickers();
    });

    document.addEventListener('keydown', (event) => {
      const picker = event.target.closest?.('[data-language-picker]');
      if (!picker) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        setLanguagePickerOpen(picker, false);
        picker.querySelector('[data-language-trigger]')?.focus();
        return;
      }

      if (event.target.matches('[data-language-trigger]') && event.key === 'ArrowDown') {
        event.preventDefault();
        setLanguagePickerOpen(picker, true, { focusOption: true });
        return;
      }

      if (!event.target.matches('[data-language-option]') || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      const options = [...picker.querySelectorAll('[data-language-option]')];
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      const index = options.indexOf(event.target);
      options[(index + offset + options.length) % options.length]?.focus();
    });

    document.addEventListener('focusin', (event) => {
      const picker = event.target.closest?.('[data-language-picker]');
      closeLanguagePickers(picker || null);
    });
    setLanguage(language, { persist: false, announce: false });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'placeholder', 'alt', 'value', 'content']
    });
  }

  window.DailyBakuI18n = {
    get language() { return language; },
    setLanguage,
    t,
    translate: translateTree,
    localizeProduct: localizedProduct,
    canonicalizeProduct: canonicalProduct,
    localizePost: localizedPost,
    localizeCategory: localizedCategory
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
