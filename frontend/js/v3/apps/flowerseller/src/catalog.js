// Flowerseller catalog — pure-data definitions.
// Money is stored as integer minor units (kuruş) so totals stay deterministic across reloads.
// variantId is the deterministic identity used by cart line items; never use raw product id alone.
const MINOR_UNIT = 100;

export const FLOWERSELLER_VARIANTS = Object.freeze([
  { id: 'small', label: 'Küçük', deltaMinor: 0 },
  { id: 'medium', label: 'Orta', deltaMinor: 180 * MINOR_UNIT },
  { id: 'large', label: 'Büyük', deltaMinor: 360 * MINOR_UNIT },
]);

export const FLOWERSELLER_ADDONS = Object.freeze([
  { id: 'chocolate', label: 'Çikolata kutusu ekle', deltaMinor: 120 * MINOR_UNIT },
  { id: 'gift', label: 'Premium hediye paketi', deltaMinor: 190 * MINOR_UNIT },
  { id: 'vase', label: 'Cam vazo ekle', deltaMinor: 140 * MINOR_UNIT },
]);

export const FLOWERSELLER_OCCASIONS = Object.freeze([
  'Doğum günü', 'Yeni iş', 'Geçmiş olsun', 'Teşekkür', 'Romantik', 'Ev ziyareti',
]);

export const FLOWERSELLER_DELIVERY_SLOTS = Object.freeze([
  { id: '09-13', label: '09:00–13:00' },
  { id: '13-17', label: '13:00–17:00' },
  { id: '17-20', label: '17:00–20:00' },
]);

export const FLOWERSELLER_COUPON = Object.freeze({ code: 'BAHAR10', discountRate: 0.10 });

const PHOTO_DIR = '/js/v3/apps/flowerseller/assets/photos';
const PHOTO_NAMES = Object.freeze([
  'flower-01.webp','flower-02.webp','flower-03.webp','flower-04.webp','flower-05.webp',
  'flower-06.webp','flower-07.webp','flower-08.webp','flower-09.webp','flower-10.webp',
  'flower-11.webp','flower-12.webp','flower-13.webp','flower-14.webp','flower-15.webp',
]);

const COLORS = Object.freeze(['Beyaz', 'Sarı', 'Pembe', 'Mor', 'Bordo', 'Kırmızı', 'Yeşil']);

// Each product's "flower type" — drives filtering in addition to category/occasion.
// We deliberately give products distinct visual identities so photo assignment remains believable.
const PRODUCT_ROWS = [
  { id: 'orkide-sabah',    name: 'Orkide Sabahı',     category: 'Zarif',    baseMinor: 1290*MINOR_UNIT, tone: 'lavender', note: 'Mor orkide, okaliptüs ve keten dokunuşları.',           colors: ['Pembe','Mor'],     sameday: true,  occasion: 'Doğum günü',   oldMinor: 1590*MINOR_UNIT, rating: 4.9, reviews: 128, stock: 'Stokta',      composition: 'Orkide, okaliptüs, keten sargı',           dimensions: '35 × 25 cm', type: 'orkide',  image: 'flower-02.webp' },
  { id: 'orkide-bulutu',   name: 'Orkide Bulutu',     category: 'Zarif',    baseMinor: 1490*MINOR_UNIT, tone: 'cream',    note: 'Beyaz orkide ve krem güllerle yumuşak bir bulut.',     colors: ['Beyaz','Pembe'],   sameday: true,  occasion: 'Romantik',     oldMinor: 1790*MINOR_UNIT, rating: 4.8, reviews: 94,  stock: 'Stokta',      composition: 'Beyaz orkide, krem gül, okaliptüs',       dimensions: '40 × 30 cm', type: 'orkide',  image: 'flower-15.webp' },
  { id: 'orkide-gecesi',   name: 'Gece Orkidesi',     category: 'Zarif',    baseMinor: 1690*MINOR_UNIT, tone: 'berry',    note: 'Bordo orkide, erguvan ve gece mavisi kurdele.',         colors: ['Mor','Bordo'],     sameday: false, occasion: 'Romantik',     oldMinor: 1990*MINOR_UNIT, rating: 4.9, reviews: 76,  stock: 'Sınırlı stok', composition: 'Bordo orkide, erguvan, kadife kurdele',   dimensions: '42 × 28 cm', type: 'orkide',  image: 'flower-09.webp' },
  { id: 'gunes-kurdele',   name: 'Güneş Kurdele',     category: 'Neşe',     baseMinor: 890*MINOR_UNIT,  tone: 'coral',    note: 'Mercan gerbera, sarı düğün çiçeği ve sabah ışığı.',     colors: ['Sarı','Pembe'],    sameday: true,  occasion: 'Yeni iş',      oldMinor: 1090*MINOR_UNIT, rating: 4.7, reviews: 61,  stock: 'Stokta',      composition: 'Gerbera, düğün çiçeği, mevsim yeşilleri', dimensions: '30 × 22 cm', type: 'gerbera',image: 'flower-05.webp' },
  { id: 'ay-isigi',        name: 'Ay Işığı Salkımı',  category: 'Zarif',    baseMinor: 1240*MINOR_UNIT, tone: 'lavender', note: 'Krem lisyantus ve kuru dokularla sakin bir aranjman.',  colors: ['Beyaz','Mor'],     sameday: false, occasion: 'Teşekkür',     oldMinor: 1490*MINOR_UNIT, rating: 4.8, reviews: 52,  stock: 'Stokta',      composition: 'Lisyantus, kuru çiçek, okaliptüs',      dimensions: '34 × 24 cm', type: 'lisyantus',image: 'flower-08.webp' },
  { id: 'yesil-fisilti',   name: 'Yeşil Fısıltı',     category: 'Doğal',    baseMinor: 760*MINOR_UNIT,  tone: 'sage',     note: 'Okaliptüs, beyaz papatya ve ferah yeşiller.',           colors: ['Beyaz','Yeşil'],   sameday: true,  occasion: 'Geçmiş olsun', oldMinor: 920*MINOR_UNIT,  rating: 4.6, reviews: 48,  stock: 'Stokta',      composition: 'Okaliptüs, papatya, ruskus',             dimensions: '28 × 20 cm', type: 'papatya', image: 'flower-14.webp' },
  { id: 'pazar-cicegi',    name: 'Pazar Çiçeği',      category: 'Renkli',   baseMinor: 980*MINOR_UNIT,  tone: 'sunset',   note: 'Şeftali, pembe ve altın sarısının neşeli buluşması.',   colors: ['Pembe','Sarı'],    sameday: true,  occasion: 'Ev ziyareti',   oldMinor: 1190*MINOR_UNIT, rating: 4.8, reviews: 39,  stock: 'Stokta',      composition: 'Şeftali gül, pembe lisyantus, solidago',dimensions: '32 × 24 cm', type: 'buket',   image: 'flower-11.webp' },
  { id: 'sessiz-bahce',    name: 'Sessiz Bahçe',      category: 'Minimal',  baseMinor: 1100*MINOR_UNIT, tone: 'cream',    note: 'Tek renk beyaz çiçekler ve keten sargı.',               colors: ['Beyaz'],           sameday: false, occasion: 'Teşekkür',     oldMinor: 1350*MINOR_UNIT, rating: 4.7, reviews: 44,  stock: 'Stokta',      composition: 'Beyaz gül, papatya, keten',             dimensions: '33 × 23 cm', type: 'buket',   image: 'flower-07.webp' },
  { id: 'kucuk-not',       name: 'Küçük Not',         category: 'Mini',     baseMinor: 540*MINOR_UNIT,  tone: 'berry',    note: 'Aklımdasın notuna eşlik eden küçük buket.',             colors: ['Pembe','Bordo'],   sameday: true,  occasion: 'Teşekkür',     oldMinor: 690*MINOR_UNIT,  rating: 4.6, reviews: 31,  stock: 'Stokta',      composition: 'Pembe karanfil, bordo statice',         dimensions: '20 × 16 cm', type: 'mini',    image: 'flower-13.webp' },
  { id: 'pembe-posta',     name: 'Pembe Posta',       category: 'Romantik', baseMinor: 1180*MINOR_UNIT, tone: 'coral',    note: 'Pudra gül, lisyantus ve zarif bir jest.',               colors: ['Pembe'],           sameday: true,  occasion: 'Romantik',     oldMinor: 1390*MINOR_UNIT, rating: 4.9, reviews: 83,  stock: 'Stokta',      composition: 'Pudra gül, lisyantus, okaliptüs',       dimensions: '34 × 23 cm', type: 'gul',     image: 'flower-06.webp' },
  { id: 'bahar-kapisi',    name: 'Bahar Kapısı',      category: 'Neşe',     baseMinor: 1350*MINOR_UNIT, tone: 'sunset',   note: 'Mevsimin ilk renklerini taşıyan canlı buket.',           colors: ['Sarı','Pembe'],    sameday: true,  occasion: 'Doğum günü',   oldMinor: 1590*MINOR_UNIT, rating: 4.8, reviews: 58,  stock: 'Stokta',      composition: 'Mevsim çiçekleri, gül, papatya',        dimensions: '38 × 27 cm', type: 'buket',   image: 'flower-01.webp' },
  { id: 'zeytin-dali',     name: 'Zeytin Dalı',       category: 'Doğal',    baseMinor: 920*MINOR_UNIT,  tone: 'sage',     note: 'Zeytin yaprağı, papatya ve doğal sicim.',               colors: ['Beyaz','Yeşil'],   sameday: false, occasion: 'Ev ziyareti',   oldMinor: 1090*MINOR_UNIT, rating: 4.7, reviews: 36,  stock: 'Stokta',      composition: 'Zeytin dalı, papatya, lavanta',         dimensions: '36 × 25 cm', type: 'papatya', image: 'flower-10.webp' },
  { id: 'lavanta-mektubu', name: 'Lavanta Mektubu',   category: 'Huzur',    baseMinor: 840*MINOR_UNIT,  tone: 'lavender', note: 'Lavanta, mor statice ve küçük beyaz çiçekler.',          colors: ['Mor'],             sameday: true,  occasion: 'Geçmiş olsun', oldMinor: 990*MINOR_UNIT,  rating: 4.8, reviews: 47,  stock: 'Stokta',      composition: 'Lavanta, statice, beyaz papatya',       dimensions: '29 × 20 cm', type: 'buket',   image: 'flower-03.webp' },
  { id: 'kirmizi-kalbin',  name: 'Kırmızı Kalbin',    category: 'Romantik', baseMinor: 1590*MINOR_UNIT, tone: 'berry',    note: 'Kırmızı güller ve kadife dokulu yapraklar.',            colors: ['Bordo','Kırmızı'], sameday: false, occasion: 'Romantik',     oldMinor: 1890*MINOR_UNIT, rating: 4.9, reviews: 112, stock: 'Sınırlı stok', composition: 'Kırmızı gül, ruskus, kadife kurdele',   dimensions: '38 × 27 cm', type: 'gul',     image: 'flower-04.webp' },
  { id: 'gokkusagi',       name: 'Gökkuşağı',         category: 'Renkli',   baseMinor: 1450*MINOR_UNIT, tone: 'sunset',   note: 'Renkli mevsim çiçekleriyle enerjik bir karışım.',        colors: ['Sarı','Pembe','Mor'], sameday: true, occasion: 'Doğum günü',  oldMinor: 1690*MINOR_UNIT, rating: 4.8, reviews: 67,  stock: 'Stokta',      composition: 'Mevsim çiçekleri, gül, gerbera',        dimensions: '40 × 28 cm', type: 'buket',   image: 'flower-12.webp' },
  { id: 'sade-sabah',      name: 'Sade Sabah',        category: 'Minimal',  baseMinor: 680*MINOR_UNIT,  tone: 'cream',    note: 'Beyaz papatya ve ince yeşil saplar.',                   colors: ['Beyaz','Yeşil'],   sameday: true,  occasion: 'Geçmiş olsun', oldMinor: 820*MINOR_UNIT,  rating: 4.6, reviews: 29,  stock: 'Stokta',      composition: 'Papatya, okaliptüs',                   dimensions: '26 × 18 cm', type: 'papatya', image: 'flower-14.webp' },
  { id: 'cicekli-cay',     name: 'Çiçekli Çay',       category: 'Mini',     baseMinor: 620*MINOR_UNIT,  tone: 'coral',    note: 'Küçük vazoya sığan neşeli bir kompozisyon.',            colors: ['Pembe','Sarı'],    sameday: true,  occasion: 'Ev ziyareti',   oldMinor: 760*MINOR_UNIT,  rating: 4.7, reviews: 25,  stock: 'Stokta',      composition: 'Karanfil, solidago, yeşillik',          dimensions: '22 × 18 cm', type: 'mini',    image: 'flower-05.webp' },
  { id: 'sakura',          name: 'Sakura Rüyası',     category: 'Zarif',    baseMinor: 1550*MINOR_UNIT, tone: 'cream',    note: 'Pudra dallar ve beyaz çiçeklerin rüya hali.',            colors: ['Pembe','Beyaz'],   sameday: false, occasion: 'Yeni iş',      oldMinor: 1790*MINOR_UNIT, rating: 4.8, reviews: 41,  stock: 'Sınırlı stok', composition: 'Sakura dalı, beyaz gül, lisyantus',     dimensions: '45 × 30 cm', type: 'lisyantus',image: 'flower-15.webp' },
  { id: 'orman-sesi',      name: 'Orman Sesi',        category: 'Doğal',    baseMinor: 1020*MINOR_UNIT, tone: 'sage',     note: 'Yeşil dokular, eğrelti ve kır çiçekleri.',              colors: ['Yeşil','Beyaz'],   sameday: true,  occasion: 'Ev ziyareti',   oldMinor: 1240*MINOR_UNIT, rating: 4.7, reviews: 34,  stock: 'Stokta',      composition: 'Eğrelti, okaliptüs, kır çiçekleri',     dimensions: '35 × 25 cm', type: 'buket',   image: 'flower-10.webp' },
  { id: 'aksamustu',       name: 'Akşamüstü',         category: 'Renkli',   baseMinor: 1280*MINOR_UNIT, tone: 'sunset',   note: 'Kiremit, mercan ve güneş sarısı tonlar.',                colors: ['Pembe','Sarı'],    sameday: false, occasion: 'Teşekkür',     oldMinor: 1490*MINOR_UNIT, rating: 4.8, reviews: 49,  stock: 'Stokta',      composition: 'Kiremit gül, gerbera, lisyantus',       dimensions: '37 × 26 cm', type: 'gerbera',image: 'flower-12.webp' },
  { id: 'ince-belki',      name: 'İnce Bir Belki',    category: 'Minimal',  baseMinor: 990*MINOR_UNIT,  tone: 'lavender', note: 'Tek dal orkide ve minimal yeşillik.',                   colors: ['Mor','Beyaz'],     sameday: true,  occasion: 'Yeni iş',      oldMinor: 1190*MINOR_UNIT, rating: 4.7, reviews: 38,  stock: 'Stokta',      composition: 'Tek dal orkide, okaliptüs',             dimensions: '42 × 18 cm', type: 'orkide',  image: 'flower-02.webp' },
  { id: 'mutluluk-karti',  name: 'Mutluluk Kartı',    category: 'Neşe',     baseMinor: 730*MINOR_UNIT,  tone: 'coral',    note: 'Renkli çiçekler, küçük bir kart ve bol gülümseme.',      colors: ['Pembe','Sarı'],    sameday: true,  occasion: 'Doğum günü',   oldMinor: 890*MINOR_UNIT,  rating: 4.6, reviews: 27,  stock: 'Stokta',      composition: 'Mevsim çiçekleri, kart, yeşillik',      dimensions: '25 × 20 cm', type: 'mini',    image: 'flower-01.webp' },
  { id: 'gece-bahcesi',    name: 'Gece Bahçesi',      category: 'Huzur',    baseMinor: 1160*MINOR_UNIT, tone: 'berry',    note: 'Erguvan, bordo ve koyu yeşillerin şiiri.',              colors: ['Bordo','Mor'],     sameday: false, occasion: 'Romantik',     oldMinor: 1390*MINOR_UNIT, rating: 4.8, reviews: 43,  stock: 'Stokta',      composition: 'Erguvan, bordo gül, ruskus',           dimensions: '36 × 25 cm', type: 'gul',     image: 'flower-04.webp' },
  { id: 'evin-cicegi',     name: 'Evin Çiçeği',       category: 'Minimal',  baseMinor: 870*MINOR_UNIT,  tone: 'sage',     note: 'Her odaya yakışan doğal, dengeli demet.',               colors: ['Beyaz','Yeşil'],   sameday: true,  occasion: 'Ev ziyareti',   oldMinor: 1040*MINOR_UNIT, rating: 4.7, reviews: 56,  stock: 'Stokta',      composition: 'Beyaz gül, zeytin dalı, okaliptüs',     dimensions: '32 × 23 cm', type: 'buket',   image: 'flower-08.webp' },
  { id: 'iyi-ki',          name: 'İyi ki Varsın',     category: 'Romantik', baseMinor: 1390*MINOR_UNIT, tone: 'coral',    note: 'Pembe güller ve gün ışığı kadar sıcak bir not.',        colors: ['Pembe'],           sameday: true,  occasion: 'Teşekkür',     oldMinor: 1650*MINOR_UNIT, rating: 4.9, reviews: 88,  stock: 'Stokta',      composition: 'Pembe gül, lisyantus, okaliptüs',       dimensions: '38 × 26 cm', type: 'gul',     image: 'flower-06.webp' },
];

export const FLOWERSELLER_PRODUCTS = Object.freeze(PRODUCT_ROWS.map((p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  type: p.type,
  tone: p.tone,
  note: p.note,
  colors: Object.freeze([...p.colors]),
  sameday: p.sameday,
  occasion: p.occasion,
  baseMinor: p.baseMinor,
  oldMinor: p.oldMinor,
  rating: p.rating,
  reviews: p.reviews,
  stock: p.stock,
  composition: p.composition,
  dimensions: p.dimensions,
  image: `${PHOTO_DIR}/${p.image}`,
  care: 'Saplarını çapraz kesin; temiz suyu iki günde bir yenileyin.',
  substitution: 'Mevsime göre aynı renk ve değerde bir çiçekle küçük değişiklikler olabilir.',
})));

export const FLOWERSELLER_CATEGORIES = Object.freeze(['Tümü','Zarif','Neşe','Doğal','Renkli','Minimal','Mini','Romantik','Huzur']);
export const FLOWERSELLER_FLOWER_TYPES = Object.freeze(['Tümü','orkide','gul','papatya','gerbera','lisyantus','buket','mini']);
export const FLOWERSELLER_COLOR_OPTIONS = COLORS;

export function findFlowersellerVariant(id) {
  return FLOWERSELLER_VARIANTS.find((v) => v.id === id) || null;
}
export function findFlowersellerAddon(id) {
  return FLOWERSELLER_ADDONS.find((a) => a.id === id) || null;
}
export function findFlowersellerProduct(id) {
  return FLOWERSELLER_PRODUCTS.find((p) => p.id === id) || null;
}

export function flowersellerMoney(minor) {
  const tl = Math.round(Number(minor || 0) / MINOR_UNIT);
  return `${new Intl.NumberFormat('tr-TR').format(tl)} TL`;
}

export function flowersellerMinorToTL(minor) {
  return Number(minor || 0) / MINOR_UNIT;
}

// Deterministic key for cart line items: productId + variantId + sorted addons + message hash.
// Two variants of the same product (e.g. small vs large) MUST yield different keys.
export function flowersellerLineKey(productId, variantId, addons, message) {
  const addonKey = [...(addons || [])].sort().join('+');
  const msg = String(message || '').trim();
  return `${productId}::${variantId || 'small'}::${addonKey}::${msg.length}:${msg}`;
}

export function flowersellerLineUnitMinor(product, variantId, addons) {
  const variant = findFlowersellerVariant(variantId) || FLOWERSELLER_VARIANTS[0];
  const addonMinor = (addons || []).reduce((sum, id) => sum + ((findFlowersellerAddon(id)?.deltaMinor) || 0), 0);
  return Math.max(0, product.baseMinor + variant.deltaMinor + addonMinor);
}

export const FLOWERSELLER_MINOR_UNIT = MINOR_UNIT;
