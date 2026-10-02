import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=resolve(root,'index.html');
let html=await readFile(file,'utf8');
// Natamam əvvəlki emal sənəd sonundan sonra qalıq yaradıbsa, yalnız ilk tam HTML sənədini saxla.
const documentEnd=html.indexOf('</html>');
if(documentEnd>=0)html=html.slice(0,documentEnd+'</html>'.length);

function replaceElement(id,content,required=true){
  const marker=`id="${id}"`;const markerAt=html.indexOf(marker);if(markerAt<0){if(!required)return;throw new Error(`${id} tapılmadı`);}
  const start=html.lastIndexOf('<ul',markerAt);let cursor=html.indexOf('>',markerAt)+1;let depth=1;
  const open=/<ul\b/gi,close=/<\/ul\s*>/gi;open.lastIndex=cursor;close.lastIndex=cursor;
  while(depth){const a=open.exec(html),b=close.exec(html);if(!b)throw new Error(`${id} bağlanmayıb`);if(a&&a.index<b.index){depth++;open.lastIndex=a.index+3;close.lastIndex=a.index+3;}else{depth--;cursor=b.index+b[0].length;open.lastIndex=cursor;close.lastIndex=cursor;}}
  const tag=html.slice(start,html.indexOf('>',start)+1);html=html.slice(0,start)+tag+'\n'+content+'\n</ul>'+html.slice(cursor);
}


function replaceDivContentsAfterId(id,className,content){
  const markerAt=html.indexOf(`id="${id}"`);if(markerAt<0)throw new Error(`${id} tapılmadı`);
  const classAt=html.indexOf(`class="${className}"`,markerAt);if(classAt<0)throw new Error(`${id} daxilində ${className} tapılmadı`);
  const start=html.lastIndexOf('<div',classAt);const openingEnd=html.indexOf('>',classAt)+1;
  const tags=/<\/?div\b[^>]*>/gi;tags.lastIndex=openingEnd;let depth=1;
  for(let match=tags.exec(html);match;match=tags.exec(html)){
    depth+=match[0].startsWith('</')?-1:1;
    if(depth===0){html=html.slice(0,openingEnd)+'\n'+content+'\n'+html.slice(match.index);return;}
  }
  throw new Error(`${id} daxilində ${className} bağlanmayıb`);
}

function setElementAttributes(id,attributes){
  const markerAt=html.indexOf(`id="${id}"`);if(markerAt<0)throw new Error(`${id} tapılmadı`);
  const start=html.lastIndexOf('<',markerAt);const end=html.indexOf('>',markerAt)+1;
  let tag=html.slice(start,end);
  for(const[name,value]of Object.entries(attributes)){
    const attribute=new RegExp(`\\s${name}="[^"]*"`);
    tag=attribute.test(tag)?tag.replace(attribute,` ${name}="${value}"`):tag.replace(/>$/,` ${name}="${value}">`);
  }
  html=html.slice(0,start)+tag+html.slice(end);
}

const escapeHtml=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');

function removeWidgetById(id){
  // Yalnız real Elementor HTML blokunu seçirik; eyni identifikator inline CSS-də də keçir.
  const widgetPattern=new RegExp(`<div\\b[^>]*class="[^"]*\\belementor-element-${id}\\b[^"]*"[^>]*>`,'i');
  const widget=widgetPattern.exec(html);if(!widget)return;
  const start=widget.index;const tags=/<\/?div\b[^>]*>/gi;tags.lastIndex=start;let depth=0;
  for(let match=tags.exec(html);match;match=tags.exec(html)){
    depth+=match[0].startsWith('</')?-1:1;
    if(depth===0){html=html.slice(0,start)+html.slice(match.index+match[0].length);return;}
  }
  throw new Error(`${id} widget-i bağlanmayıb`);
}

const mega=[
 ['magaza','Mağaza',[['Elektronika','/magaza/elektronika/'],['Ev & Mətbəx','/magaza/ev-metbex/'],['Moda','/magaza/moda/'],['Gözəllik & Sağlamlıq','/magaza/gozellik-saglamliq/'],['Qida','/magaza/qida/'],['Uşaq','/magaza/usaq/'],['Avtomobil','/magaza/avtomobil/'],['Xidmətlər','/magaza/xidmetler/'],['Hədiyyələr','/magaza/hediyyeler/']]],
 ['endirimler','Endirimlər',[['Restoranlar','/endirimler/restoranlar/'],['Marketlər','/endirimler/marketler/'],['Geyim','/endirimler/geyim/'],['Gözəllik & Sağlamlıq','/endirimler/gozellik-saglamliq/'],['Əyləncə','/endirimler/eylence/'],['Səyahət','/endirimler/seyahet/']]],
 ['kuponlar','Kuponlar',[]],
 ['kampaniyalar','Kampaniyalar',[['Günün Təklifi','/kampaniyalar/gunun-teklifi/'],['Həftənin Kampaniyası','/kampaniyalar/heftenin-kampaniyasi/'],['Məhdud Sayda','/kampaniyalar/mehdud-sayda/'],['Mövsümi Endirimlər','/kampaniyalar/movsumi-endirimler/']]],
 ['jurnal','Jurnal & Bloq',[['Son Buraxılış (PDF)','/jurnal/son-buraxilis/'],['Arxiv','/jurnal/arxiv/'],['Brend Hekayələri','/jurnal/brend-hekayeleri/'],['Alış-veriş Məsləhətləri','/jurnal/alis-veris-meslehetleri/']]],
 ['baki-club','Bakı Club',[['Xal Qazanma','/baki-club/xal-qazanma/'],['Hədiyyələr','/baki-club/hediyyeler/'],['Giveawaylər','/baki-club/giveawayler/'],['QR İdarəetmə','/baki-club/qr-idareetme/']]],
 ['elanlar','Elanlar',[['Məhsullar','/elanlar/mehsullar/'],['Xidmətlər','/elanlar/xidmetler/'],['Əmlak','/elanlar/emlak/'],['Avtomobil','/elanlar/avtomobil/']]],
 ['biznes','Biznes üçün',[['Reklam Ver','/biznes/reklam-ver/'],['Sponsorluq','/biznes/sponsorluq/'],['Brend Vitrini','/biznes/brend-vitrini/'],['Analitika Paneli','/biznes/analitika-paneli/']]]
];
const navigationItem=([slug,label,children])=>`<li class="menu-item${children.length?' menu-item-has-children':''} depth-0"><a href="/${slug}/" class="mi-link"><span class="txt">${escapeHtml(label)}</span>${children.length?'<span class="arrow"></span>':''}<span class="effect"></span></a>${children.length?`<ul class="sub-menu">${children.map(([child,href])=>`<li class="menu-item depth-1"><a href="${href}" class="mi-link"><span class="txt">${escapeHtml(child)}</span><span class="arrow"></span><span class="effect"></span></a></li>`).join('')}</ul>`:''}</li>`;
const nav=mega.map(navigationItem).join('');
const mobileNav=mega.slice(1).map(navigationItem).join('');
replaceElement('menu-mobile-menu',mobileNav);
replaceElement('menu-desktop-menu-with-categories',nav);
const categories=mega[0][2].map(([name,href])=>`<li class="menu-item depth-0"><a href="${href}" class="mi-link"><span class="txt">${escapeHtml(name)}</span><span class="arrow"></span></a></li>`).join('');
replaceElement('menu-mobile-store',categories,false);
// Dil seçim bloku təmizlənəndən sonra mobil kateqoriya menyusu mövcud olmaya bilər.
replaceElement('menu-categories',categories,false);
replaceElement('menu-categories-1',categories);

const homeCircleAssets=[
 ['95400e4','Mağaza','/magaza/','magaza.jpg'],
 ['db-gifts','Hədiyyələr','/magaza/hediyyeler/','baki-club/hediyyeler.jpg'],
 ['da5964b','Endirimlər','/endirimler/','endirimler.jpg'],
 ['db-coupons','Kuponlar','/kuponlar/','endirimler.jpg'],
 ['acf68c3','Kampaniyalar','/kampaniyalar/','kampaniyalar.jpg'],
 ['8c7abe9','Jurnal & Bloq','/jurnal/','jurnal.jpg'],
 ['ed230dd','Bakı Club','/baki-club/','baki-club.jpg'],
 ['509a628','Elanlar','/elanlar/','elanlar.jpg'],
 ['f2d65d1','Biznes üçün','/biznes/','biznes.jpg']
];
const homeCircles=homeCircleAssets.map(([id,label,href,asset],index)=>`<div class="item swiper-slide elementor-repeater-item-${id}"><a href="${href}" title="${escapeHtml(label)} bölməsinə keç" class="link">
  <div class="image-container"><img ${index===0?'loading="eager" fetchpriority="high"':'loading="lazy"'} decoding="async" src="./assets/images/categories/${asset}" width="640" height="640" alt="${escapeHtml(label)}"><svg aria-hidden="true" viewBox="0 0 300 300"><path d="M0,0H300V300H0V0Z"></path></svg></div>
  <h3 class="attribute-title">${escapeHtml(label)}</h3><div class="button-back"></div>
</a></div>`).join('\n');
const footer=[['Platforma haqqında',[['Biz kimik','/haqqimizda/'],['Bakı Club','/baki-club/'],['Biznes üçün','/biznes/']]],['Müştəri dəstəyi',[['Tez-tez verilən suallar','/faq/'],['Əlaqə','/elaqe/'],['Çatdırılma siyasəti','/catdirilma/'],['Geri qaytarma','/geri-qaytarma/']]],['Biznes əməkdaşlığı',[['Reklam portalı','/biznes/reklam-ver/'],['Sponsorluq','/biznes/sponsorluq/'],['Brend olun','/biznes/brend-vitrini/']]],['Sürətli keçidlər',[['Son jurnal','/jurnal/'],['Kateqoriyalar','/magaza/']]]];
replaceElement('menu-footer-menu',footer.map(([title,links])=>`<li class="menu-item menu-item-has-children depth-0"><a class="mi-link"><span class="txt">${title}</span></a><ul class="sub-menu">${links.map(([label,href])=>`<li class="menu-item depth-1"><a href="${href}" class="mi-link"><span class="txt">${label}</span></a></li>`).join('')}</ul></li>`).join(''));

const replacements=new Map([
 ['lang="en"','lang="az"'],['Toolz | Professional Tools & Equipment','TVShop — Endirim, Kupon, Reklam, Elan və Kampaniyalar'],
 ['Shop professional power tools, hand tools, measuring equipment and accessories from trusted brands, with expert support and dependable delivery.','TVShop — Bakının endirim, kupon, kampaniya, elan və rəqəmsal jurnal platforması. Oxu, skan et, qazan!'],
 ['./assets/wp-content/uploads/logo-white-yellow.svg','./assets/brand/tvshop.webp'],['title="Toolz"','title="TVShop"'],['alt="Toolz"','alt="TVShop"'],
 ['Hello Guest','Salam, qonaq'],['For better experience login','Daha yaxşı təcrübə üçün daxil olun'],['Navigation','Naviqasiya'],['Settings','Parametrlər'],['Settigns','Parametrlər'],
  ['Contact us','Əlaqə'],['Login','Daxil ol'],['My account','Hesabım'],['Compare','Müqayisə'],['Wishlist','Seçilmişlər'],
  ['FREE US DELIVERY $99 spent','99 AZN-dən yuxarı pulsuz çatdırılma'],['Username','İstifadəçi adı'],['Password','Şifrə'],['Forgot password?','Şifrəni unutmusunuz?'],['Sign up','Qeydiyyat'],
  ['Live Chat','Canlı çat'],['Chat with an Expert','Mütəxəssislə danış'],['Free shipping from $99','99 AZN-dən pulsuz çatdırılma'],['Sales &amp; Service Support','Müştəri və biznes dəstəyi'],
  ['START STRONG','GÜCLÜ BAŞLA'],['starter Discount','ilk alış endirimi'],['When you purchase','Alış etdikdə'],['Show now','İndi bax'],['BUY1 GET1 FREE','1 AL, 1 HƏDİYYƏ'],['MILWAUKEE JUMP START','GÜNÜN XÜSUSİ TƏKLİFİ'],['With select Milwaukee M18 High','Seçilmiş məhsullarda yüksək'],['Torque Impact Wrench','keyfiyyət və sərfəli qiymət'],['SUPER DEALS','SUPER TƏKLİFLƏR'],['DECEMBER MADNESS!','MÖVSÜM ENDİRİMLƏRİ!'],['Makita, DeWalt, Milwaukee -','Seçilmiş brendlər -'],['All TOP','Hamısı sərfəli'],['FREE BATERY','HƏDİYYƏ QAZAN'],['With purchase of Milwaukee','Seçilmiş məhsul alışı ilə'],['Sale deals!','Endirim fürsətləri!'],['KIT BUILDER','ÖZ DƏSTİNİ QUR'],['Best Values. Always.','Həmişə sərfəli seçim.'],['BUY 1 GET 1','1 AL, 1 HƏDİYYƏ'],['FREE','PULSUZ'],['HOME AND GARDEN','EV VƏ BAĞ'],['Professional Equipment','Keyfiyyətli məhsullar'],['Profiessional Equipment','Keyfiyyətli məhsullar'],
  ['Select your products','Məhsulları seçin'],['Choose Category','Kateqoriya seçin'],['Choose Brand','Brend seçin'],['Choose Country of Origin','Mənşə ölkəsini seçin'],['Submit','Tətbiq et'],['Reset','Sıfırla'],
  ['Air Compressors','Hava kompressorları'],['Inflators','Şişirtmə cihazları'],['Cutting Tools','Kəsici alətlər'],['Drywall Tools','Təmir alətləri'],['Hammers & Mallets','Çəkiclər'],['Laser Levels','Lazer ölçü cihazları'],['Levels','Ölçü cihazları'],['Measuring Tools','Ölçmə alətləri'],['Temperature Meters','Temperatur ölçənlər'],['Machine Tools','Dəzgah avadanlığı'],['Marking Tools','İşarələmə alətləri'],['Other','Digər'],['Drills','Drellər'],['Grease Guns','Yağlama avadanlığı'],['Grinders','Cilalama avadanlığı'],['Impact Wrenches','Zərbəli açarlar'],['Nailers','Mismar tapançaları'],['Planers','Rəndələr'],['Ratchets','Açar dəstləri'],['Sanders','Zımpara cihazları'],['Saws','Mişarlar'],['Staplers','Steplerlər'],['Tool Services','Alət xidmətləri'],['Hand Tool Services','Əl aləti xidmətləri'],['Measuring & Marking','Ölçmə və işarələmə'],['Laser Level Services','Lazer ölçmə xidmətləri'],['Power Tool Services','Elektrik aləti xidmətləri'],['Drill Bits','Drel ucları'],
  ['Measuring','Ölçmə'],['Hammers &amp; Mallets','Çəkiclər'],['Measuring &amp; Marking','Ölçmə və işarələmə'],['Shop','Mağaza'],['now','indi'],['Air','Hava'],['Tools','Alətlər'],['Hand','Əl'],['Laser','Lazer'],['Power','Elektrik'],['Grease','Yağlama'],['Guns','cihazları'],['Tool','Alət'],['Drill','Drel'],['Bits','ucları'],
  ['Chile','Çili'],['China','Çin'],['Germany','Almaniya'],['India','Hindistan'],['Italy','İtaliya'],['Japan','Yaponiya'],['Malaysia','Malayziya'],['Mexico','Meksika'],['Myanmar','Myanma'],['S. Korea','Cənubi Koreya'],['Switzerland','İsveçrə'],['Taiwan','Tayvan'],['Thailand','Tailand'],['United States','ABŞ'],['Vietnam','Vyetnam'],
  ['NEW ITEMS','YENİ FÜRSƏTLƏR'],['Most popular products','Ən populyar seçimlər'],['THE MOST POPULAR PICKS IN:','ƏN ÇOX SEÇİLƏNLƏR:'],['PROFESSIONAL','KEYFİYYƏTLİ'],['EQUIPMENT','MƏHSULLAR'],['Top Offers','Ən yaxşı təkliflər'],['Spend $99','99 AZN xərclə'],['Get 25% Discount','25% endirim qazan'],['DISCOVER BRAND','BRENDİ KƏŞF ET'],['High performance power','Yüksək keyfiyyətli'],['tools.','məhsullar.'],['Stay Informed BIGXON World','TVShop yeniliklərini izlə'],['Latest offers, promos, product','Son təkliflər, kampaniyalar və'],['releases and industry news','şəhərin ən maraqlı xəbərləri'],['ONE TIME SPECIAL','XÜSUSİ MÜDDƏTLİ'],['DEALS','TƏKLİFLƏR'],['My cart','Səbətim'],['Order 5 items and get FREE Next Day Delivery!','5 məhsul sifariş et, növbəti gün pulsuz çatdırılma qazan!'],['Payment options','Ödəniş üsulları'],
  ['Monday - Friday: 9:00 - 20:00','Bazar ertəsi – Cümə: 09:00 – 18:00'],['Saturday: 10:00 - 15:00','Şənbə: 10:00 – 15:00'],
  ['Categories','Kateqoriyalar'],['Search','Axtarış'],['Cart','Səbət'],['Top','Yuxarı'],['Shop now','İndi kəşf et'],['View all','Hamısına bax'],
 ['Featured Products','Seçilmiş fürsətlər'],['Special offers &amp; discounts','Xüsusi təkliflər və endirimlər'],['Shop by ','Kəşf et: '],
 ['Air Tools','Elektronika'],['Electrical','Ev & Mətbəx'],['Hand Tools','Moda'],['Power Tools','Gözəllik & Sağlamlıq'],['Accessories','Xidmətlər'],
 ['Popular','Populyar'],['New','Yeni'],['Sale!','Endirim!'],['Account','Hesab'],['Dashboard','İdarə paneli'],['Orders','Sifarişlər'],['History','Tarixçə'],['Addresses','Ünvanlar'],['Catalog','Kataloq'],['Brands','Brendlər'],['Popular items','Populyar seçimlər'],['Useful','Faydalı'],['Career','Karyera'],['FAQ','Tez-tez verilən suallar'],['Features','İmkanlar'],
 ["With over 250+ branches nationwide\n\t\t\t\t\t\t\t\t\t\t\t\t\t\tand 130,000 parts available Bigxon Tools\n\t\t\t\t\t\t\t\t\t\t\t\t\t\tis the USA's number 1 supplier!",'TVShop şəhərin fürsətlərini, rəqəmsal jurnalı və etibarlı biznesləri vahid platformada birləşdirir. Oxu. Skan et. Qazan.'],
 ['17 Antares Place, Mairangi Bay, Auckland\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t0632','Cəfər Cabbarlı 33, AZ1065, Bakı/Azərbaycan'],['833-474-8531','+994 50 264 54 00'],['Sales &amp; Service Support','Müştəri və biznes dəstəyi'],['Monday - Friday: 9:00 - 20:00<br>Saturday: 10:00 - 15:00','Bazar ertəsi – Cümə: 09:00 – 18:00<br>Şənbə: 10:00 – 15:00'],
 ['Copyright © 2026 Bigxon. All Rights\n\t\t\t\t\t\t\t\t\t\t\t\tReserved','Copyright © 2026 TVShop. Bütün hüquqlar qorunur.'],['Privacy Policy','Məxfilik siyasəti'],['Refund and Returns\n\t\t\t\t\t\t\t\t\t\t\t\tPolicy','Geri qaytarma siyasəti'],['Terms of use','İstifadə şərtləri'],['current-lang">En','current-lang">AZ'],['>English<','>Azərbaycan dili<'],['>Deutsch<','>English<'],['>Français<','>Русский<']
]);
// Köhnə versiyada edilən ümumi əvəzləmələri əvvəlcə geri qaytarırıq. Bu addım
// skriptin təkrar işə salınmasını təhlükəsiz edir və inline JS identifikatorlarını qoruyur.
for(const[from,to]of [...replacements].reverse())html=html.split(to).join(from);

// Brand, SEO və struktur atributları mətn düyünü deyil, ona görə ayrıca idarə olunur.
html=html.replace('<html lang="en">','<html lang="az">')
  .replace(/<title>[^<]*<\/title>/,'<title>TVShop — Endirim, Kupon, Reklam, Elan və Kampaniyalar</title>')
  .replace(/<meta name="description"\s+content="[^"]*">/,'<meta name="description" content="TVShop — Bakıda endirimlər, kuponlar, kampaniyalar, elanlar və rəqəmsal jurnal. Şəhərin fürsətlərini kəşf et. Oxu, skan et, qazan!">')
  .replaceAll('./assets/wp-content/uploads/logo-white-yellow.svg','./assets/brand/tvshop.webp')
  .replaceAll('./assets/brand/daily-baku-logo.svg','./assets/brand/tvshop.webp')
  .replaceAll('./assets/brand/gundelik-baki-logo.png','./assets/brand/tvshop.webp')
  .replaceAll('./assets/brand/gundelik-baki-logo-white.png','./assets/brand/tvshop.webp')
  .replaceAll('title="Toolz"','title="TVShop"').replaceAll('alt="Toolz"','alt="TVShop"')
  .replaceAll('content="Toolz"','content="TVShop"').replaceAll('data-site-name="Toolz"','data-site-name="TVShop"')
  .replaceAll('content="Toolz | Professional Tools & Equipment"','content="TVShop — Endirim, Kupon və Kampaniyalar"')
  .replaceAll('content="Professional tools, equipment and accessories from trusted brands."','content="Bakının endirim, kupon, kampaniya, elan və rəqəmsal jurnal platforması."')
  .replace('"name":"Toolz","description":"Professional tools, equipment and accessories from trusted brands."','"name":"TVShop","description":"Bakının endirim, kupon, kampaniya, elan və rəqəmsal jurnal platforması."')
  .replace(/<link rel="icon"[^>]*cropped-favicon\.webp[^>]*>/g, '<link rel="icon" type="image/webp" href="./assets/brand/tvshop.webp">')
  .replace(/<link rel="apple-touch-icon"[^>]*cropped-favicon\.webp[^>]*>/, '<link rel="apple-touch-icon" href="./assets/brand/tvshop.webp">')
  .replace(/<meta name="msapplication-TileImage"[^>]*>/, '<meta name="msapplication-TileImage" content="./assets/brand/tvshop.webp">');

// Tərcümə yalnız görünən mətn düyünlərinə tətbiq edilir; script/style blokları və URL-lər toxunulmaz qalır.
const protectedBlocks=[];
html=html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,block=>`__DB_PROTECTED_${protectedBlocks.push(block)-1}__`);
html=html.replace(/>([^<]+)</g,(whole,text)=>{
  let localized=text;
  for(const[from,to]of replacements)localized=localized.split(from).join(to);
  return `>${localized}<`;
});
html=html.replace(/__DB_PROTECTED_(\d+)__/g,(_whole,index)=>protectedBlocks[Number(index)]);
html=html.replace(/With over 250\+ branches nationwide[\s\S]*?is the USA's number 1 supplier!/,'TVShop şəhərin fürsətlərini, rəqəmsal jurnalı və etibarlı biznesləri vahid platformada birləşdirir. Oxu. Skan et. Qazan.')
  .replace(/17 Antares Place, Mairangi Bay, Auckland\s+0632/,'Cəfər Cabbarlı 33, AZ1065, Bakı/Azərbaycan')
  .replaceAll('Bakı şəhəri, Azərbaycan','Cəfər Cabbarlı 33, AZ1065, Bakı/Azərbaycan')
  .replace(/Copyright © 2026 Bigxon\. All Rights\s+Reserved/,'Copyright © 2026 TVShop. Bütün hüquqlar qorunur.')
  .replace(/Refund and Returns\s+Policy/,'Geri qaytarma siyasəti')
  .replace('Professional Tools & Equipment</h1>','TVShop — Şəhərin fürsətlər platforması</h1>')
  .replace('Skip to main content','Əsas məzmuna keç')
  .replaceAll('class="current-lang">En','class="current-lang">AZ')
  .replaceAll('>English</span>','>Azərbaycan dili</span>').replaceAll('>Deutsch</span>','>English</span>').replaceAll('>Français</span>','>Русский</span>')
  .replaceAll('Sales &amp; Service','Müştəri dəstəyi').replaceAll('title="Shop now"','title="İndi kəşf et"')
  .replaceAll('data-mob-tab-title="Navigation"','data-mob-tab-title="Naviqasiya"').replaceAll('title="Login"','title="Daxil ol"')
  .replaceAll('>hesab<','>Hesab<').replace('Order 5 items and get PULSUZ Next Day Delivery!','5 məhsul sifariş et, növbəti gün pulsuz çatdırılma qazan!')
  .replaceAll('placeholder="What are you looking for?"','placeholder="Nə axtarırsınız?"')
  .replaceAll('/?wc-ajax=%%endpoint%%','/api/wp-compat?wc-ajax=%%endpoint%%')
  .replace('/?action=kirki-styles&amp;ver=4.0','./assets/css/kirki-styles.css')
  .replaceAll('platüçünması','platforması').replaceAll('Platüçünma','Platforma')
  .replaceAll('High perüçünmance power','Yüksək keyfiyyətli').replaceAll('Stay Inüçünmed BIGXON World','TVShop yeniliklərini izlə')
  .replaceAll('Accountım navigation','Hesab naviqasiyası').replaceAll('Mağaza by','Brendlərə görə alış-veriş')
  .replaceAll('Hava Alətlər','Elektronika').replaceAll('Əl Alətlər','Moda').replaceAll('Elektrik Alətlər','Gözəllik &amp; Sağlamlıq')
  .replace(/Mağaza\s+indi/g,'İndi kəşf et');
html=html.replaceAll('data-cms-region="hero"','data-cms-region="hero" data-api-resource="campaigns"').replaceAll('data-cms-region="products"','data-cms-region="products" data-api-resource="products"');
html=html.replaceAll('./assets/wp-content/uploads/nowa.svg','./assets/wp-content/uploads/india.svg')
  .replaceAll('./assets/wp-content/themes/bigxon/images/icons/magaza/.svg','./assets/wp-content/uploads/product-categories.svg');
html=html
  .replaceAll('tel:555555555','tel:+994502645400')
  .replaceAll('tel:55555555','tel:+994502645400')
  .replaceAll('tel:+994120000000','tel:+994502645400')
  .replaceAll('+994 12 000 00 00','+994 50 264 54 00')
  .replaceAll('37499833889','994502645400');
const footerIdentity='<div class="db-footer-identity"><p class="et__heading"><span class="text">Copyright © 2026 TVShop. Bütün hüquqlar qorunur.</span></p><p class="db-footer-company"><span>TVShop Panorama Reklam MMC-nin satış platformasıdır.</span><span>VÖEN 2007614681</span></p></div>';
html=html.includes('<div class="db-footer-identity">')
  ? html.replace(/<div class="db-footer-identity">[\s\S]*?<\/p><\/div>/,footerIdentity)
  : html.replace(/<p class="et__heading"><span class="text">Copyright © 2026 (?:TVShop|Bigxon)\.[\s\S]*?<\/span><\/p>/,footerIdentity);
setElementAttributes('icc-33cef79',{'data-cl-d':'7','data-cl-lp':'7','data-cl-tbl':'6','data-cl-tb':'5','data-cl-mb':'4','data-cl-mbs':'4','data-gap-mb':'8','data-gap-mbs':'6','data-inc':'0'});
replaceDivContentsAfterId('icc-33cef79','items-carousel swiper-wrapper',homeCircles);
for(const id of ['96d76ab','2e11818','7b89df5'])removeWidgetById(id);
await writeFile(file,html);
console.log('Home 6 naviqasiya və Azərbaycan dili kontenti tətbiq edildi.');
