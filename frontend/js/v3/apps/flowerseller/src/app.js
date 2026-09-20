const PRODUCTS = Object.freeze([
  { id:'gunes-kurdele', name:'Güneş Kurdele', category:'Neşe', price:890, tone:'coral', note:'Mercan tonlu gerberalar, limon sarısı düğün çiçekleri ve sabah ışığı hissi.' },
  { id:'ay-isigi', name:'Ay Işığı Salkımı', category:'Zarif', price:1240, tone:'lavender', note:'Krem lisyantuslar, kuru dokular ve gece mavisi bir kurdele ile sakin bir aranjman.' },
  { id:'yesil-fisilti', name:'Yeşil Fısıltı', category:'Doğal', price:760, tone:'sage', note:'Okaliptüs, beyaz papatya ve dokulu yeşillerden hafif, gün boyu ferah bir demet.' },
  { id:'pazar-cicegi', name:'Pazar Çiçeği', category:'Renkli', price:980, tone:'sunset', note:'Mevsim duygusunu taşıyan şeftali, pembe ve altın sarısı çiçeklerin neşeli buluşması.' },
  { id:'sessiz-bahce', name:'Sessiz Bahçe', category:'Minimal', price:1100, tone:'cream', note:'Tek renkli beyaz çiçekler, keten sargı ve yumuşak gölgelerle sade bir jest.' },
  { id:'kucuk-not', name:'Küçük Not', category:'Mini', price:540, tone:'berry', note:'Masanın kenarına, kapı önüne ya da “aklımdasın” notuna eşlik eden küçük buket.' }
]);
const CATEGORIES = ['Tümü','Neşe','Zarif','Doğal','Renkli','Minimal','Mini'];
const README_SECTIONS = [
  ['01 · Ürün ve sipariş modeli', '<strong>Öneri:</strong> statik storefront yerine <em>Next.js veya Nuxt + PostgreSQL</em> ile ayrı bir API katmanı kullanın. Product, ProductVariant, InventoryItem, Reservation, Order, OrderItem, Customer, Address, DeliveryZone, Payment, Refund, Coupon, MediaAsset ve WebhookEvent çekirdek varlıklardır. Parasal değerleri kuruş olarak integer tutun; fiyat ve vergi snapshot\'larını OrderItem üzerinde saklayın.'],
  ['02 · API yüzeyi', '<code>GET /v1/catalog</code>, <code>GET /v1/products/:slug</code>, <code>POST /v1/baskets</code>, <code>POST /v1/orders/quote</code>, <code>POST /v1/orders</code>, <code>GET /v1/orders/:id</code>, <code>POST /v1/payments/session</code>, <code>GET /v1/delivery-zones?postalCode=</code> ve admin için <code>/v1/admin/*</code>. OpenAPI sözleşmesi, pagination, correlation-id ve problem+json hata gövdesi baştan standardize edilmelidir.'],
  ['03 · Ödeme ve sipariş yaşam döngüsü', 'Checkout önce adresi ve teslimat slotunu doğrular, sonra fiyatı yeniden hesaplar: <strong>draft → awaiting_payment → paid → preparing → out_for_delivery → delivered</strong>. Ödeme sağlayıcısının hosted checkout/token yaklaşımını kullanın; kart bilgisini sisteme almayın. İptal, başarısız ödeme ve iade durumlarını ayrı, denetlenebilir geçişler olarak modelleyin.'],
  ['04 · Stok ve rezervasyon', 'Çiçek stokları hızlı değişir. Sipariş oluştururken transaction + row lock veya atomik decrement ile stok ayırın. Reservation için TTL (ör. 15 dakika), expiry worker ve ödeme başarısızlığında release gerekir. Stok negatif olamaz; oversell alarmı ve manuel override audit kaydı olmadan işlem yapılamamalıdır.'],
  ['05 · Teslimat bölgeleri', 'DeliveryZone; posta kodu/ilçe, cutoff saatleri, ücret, minimum sepet, aynı gün uygunluğu ve slot kapasitesini taşısın. Saat dilimini Europe/Istanbul olarak saklayın. Yoğun günlerde zone-slot kapasitesi ayrı tutulmalı; adres doğrulaması quote ve order anında tekrar yapılmalıdır.'],
  ['06 · Webhook ve idempotency', 'Her mutating istekte istemci <code>Idempotency-Key</code> göndermeli; sunucu key + route + body hash ile sonucu güvenle tekrar döndürmelidir. WebhookEvent provider event id ile unique olsun, imza doğrulansın ve işleme inbox/outbox kuyruğunda en az bir kez güvenle tekrarlansın. Webhook state transition\'ları monotonik olmalı; geç gelen event siparişi geriye taşımamalıdır.'],
  ['07 · Kimlik ve yönetim', 'Müşteri tarafında magic link veya OAuth, yönetimde MFA zorunlu ve rol tabanlı erişim (support, florist, dispatcher, finance, admin) kullanın. Admin aksiyonları actor, reason, before/after ve timestamp ile audit log\'a yazılmalı. Sipariş görüntüleme PII minimization ve tenant/role sınırlarıyla yapılmalı.'],
  ['08 · Görsel depolama', 'Görselleri S3 uyumlu object storage üzerinde private upload + signed URL ile yönetin. Orijinal, optimize WebP/AVIF türevleri ve alt metin metadata\'sı tutun. EXIF temizleyin, içerik türü ve boyut doğrulayın, CDN cache key ve silme yaşam döngüsünü katalog kaydıyla bağlayın.'],
  ['09 · Gözlemlenebilirlik', 'JSON log + request id, OpenTelemetry trace, metrikler (quote latency, payment conversion, reservation expiry, delivery SLA) ve Sentry benzeri hata izleme kurun. PII loglamayın. Checkout, webhook ve teslimat için ayrı dashboard/alert; deploy sonrası synthetic smoke ve uptime probe ekleyin.'],
  ['10 · KVKK ve güvenlik', 'Aydınlatma ve açık rıza akışlarını amaç bazlı ayırın; veri envanteri, saklama/silme politikası, erişim ve düzeltme talepleri, işleyen sözleşmeleri hazırlayın. TLS, secret manager, CSP, CSRF, rate limit, WAF, parameterized queries, dependency scanning ve düzenli backup restore testi zorunlu. Kart verisi tutulmamalı; ödeme sağlayıcısı PCI kapsamını taşımalıdır.'],
  ['11 · Test ve yayın', 'Unit: fiyat, stok, state machine. Integration: transaction, webhook replay, idempotency. Contract: OpenAPI ve ödeme sağlayıcısı sandbox. E2E: 320px/desktop checkout, slot kapasitesi, başarısız ödeme, iade. Load: kampanya trafiği. Staging veri maskeleme, migrations forward/backward planı, feature flags, blue/green veya canary deploy, rollback runbook ve migration backup birlikte yürütülmelidir.'],
  ['12 · Fazlı yol haritası', '<strong>Faz 0 (şimdi):</strong> bu statik POC ile katalog, marka ve akış testi. <strong>Faz 1:</strong> katalog CMS/API, basket quote, delivery zones ve admin temel ekranları. <strong>Faz 2:</strong> hosted payment, reservation worker, webhook inbox ve transactional email. <strong>Faz 3:</strong> florist picking, courier dispatch, slot capacity, refunds ve analytics. <strong>Faz 4:</strong> kişiselleştirme, kampanya motoru ve operasyon SLA otomasyonu; her fazın güvenlik, KVKK ve geri dönüş kriterleri ayrı onaylanmalıdır.']
];

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
function money(value) { return `${new Intl.NumberFormat('tr-TR').format(value)} TL`; }
function productVisual(product, large = false) { return `<div class="fs-visual fs-visual-${esc(product.tone)}${large ? ' fs-visual-large' : ''}" aria-hidden="true"><span></span><i></i><b></b></div>`; }
function productCard(product) { return `<article class="fs-product-card"><button class="fs-product-open" type="button" data-product="${esc(product.id)}" aria-label="${esc(product.name)} detayını aç">${productVisual(product)}<span class="fs-product-meta"><small>${esc(product.category)}</small><strong>${esc(product.name)}</strong><span>${money(product.price)}</span></span></button><button class="fs-add" type="button" data-add="${esc(product.id)}">Sepete ekle <span aria-hidden="true">＋</span></button></article>`; }

export function createFlowersellerApp() {
  let activeTab = 'store';
  let category = 'Tümü';
  let query = '';
  let basket = [];
  let selected = null;
  let clickHandler;
  let inputHandler;
  let keyHandler;

  function renderStore() {
    const visible = PRODUCTS.filter((product) => (category === 'Tümü' || product.category === category) && `${product.name} ${product.note}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
    const count = basket.reduce((total, item) => total + item.quantity, 0);
    const detail = selected ? `<aside class="fs-detail" aria-label="${esc(selected.name)} detayları"><button class="fs-close" type="button" data-close-detail aria-label="Detayı kapat">×</button>${productVisual(selected, true)}<small>${esc(selected.category)}</small><h2>${esc(selected.name)}</h2><p>${esc(selected.note)}</p><strong>${money(selected.price)}</strong><button class="fs-detail-add" type="button" data-add="${esc(selected.id)}">Sepete ekle</button></aside>` : '';
    return `<section class="fs-store" aria-labelledby="fs-store-title"><div class="fs-hero"><div><span class="fs-eyebrow">Flowerseller · POC</span><h1 id="fs-store-title">Bir buket, günün<br><em>yumuşak tarafı.</em></h1><p>Atölye hissi veren, şehir içi jestler için tasarlanmış özgün çiçek kompozisyonları.</p><button class="fs-hero-cta" type="button" data-scroll-products>Seçkide dolaş <span>↓</span></button></div><div class="fs-hero-art" aria-hidden="true"><div class="fs-orbit"></div><div class="fs-stem"></div><div class="fs-bloom"><i></i><i></i><i></i><b></b></div><span class="fs-hero-note">bugün için<br>biraz renk</span></div></div><div class="fs-toolbar"><div class="fs-tabs" role="tablist" aria-label="Flowerseller bölümleri"><button type="button" role="tab" aria-selected="${activeTab === 'store'}" data-tab="store">Store</button><button type="button" role="tab" aria-selected="${activeTab === 'readme'}" data-tab="readme">README</button></div><button type="button" class="fs-basket" data-basket aria-label="Sepet, ${count} ürün"><span>Sepet</span><b>${count}</b></button></div><div class="fs-catalog-head" id="fs-products"><div><span class="fs-eyebrow">Küçük seri · sentetik katalog</span><h2>Bugünün seçkisi</h2></div><label class="fs-search"><span class="sr-only">Ürün ara</span><input type="search" data-search placeholder="Buket ara" value="${esc(query)}"></label></div><div class="fs-filters" role="group" aria-label="Ürün kategorileri">${CATEGORIES.map((item) => `<button type="button" class="${item === category ? 'is-active' : ''}" data-category="${esc(item)}" aria-pressed="${item === category}">${esc(item)}</button>`).join('')}</div><div class="fs-products" aria-live="polite">${visible.length ? visible.map(productCard).join('') : '<p class="fs-empty">Bu aramada henüz bir buket yok. Başka bir renk deneyin.</p>'}</div>${detail}<div class="fs-poc-note"><span>✳</span><p><strong>POC notu:</strong> Ürünler, fiyatlar ve sepet yalnızca bu pencere içinde yaşar. Gerçek sipariş akışı için README sekmesindeki mimari notlara bakın.</p></div></section>`;
  }

  function renderReadme() { return `<section class="fs-readme" aria-labelledby="fs-readme-title"><div class="fs-readme-intro"><span class="fs-eyebrow">Flowerseller · build notes</span><h1 id="fs-readme-title">Gerçek ürüne<br><em>giden yol.</em></h1><p>Bu sekme, POC arayüzünün arkasına konacak üretim sistemini kısa ama uygulanabilir bir teknik plan olarak tutar.</p></div><div class="fs-readme-grid">${README_SECTIONS.map(([title, body], index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><h2>${title}</h2><p>${body}</p></article>`).join('')}</div></section>`; }

  function render(container) { container.replaceChildren(); container.innerHTML = `<div class="az-app-shell fs-app"><header class="fs-topbar"><span class="fs-mark">✳</span><strong>Flowerseller</strong><span class="fs-poc-pill">frontend-only POC</span><span class="az-system-spacer"></span><span class="fs-location">Kadıköy · İstanbul</span></header>${activeTab === 'store' ? renderStore() : renderReadme()}</div>`; }
  function add(id) { const item = basket.find((entry) => entry.id === id); if (item) item.quantity += 1; else basket.push({ id, quantity: 1 }); render(container); }

  let container;
  return {
    mount(root) {
      container = root;
      render(container);
      clickHandler = (event) => {
        const target = event.target.closest('[data-tab],[data-category],[data-add],[data-product],[data-close-detail],[data-scroll-products],[data-basket]');
        if (!target) return;
        if (target.dataset.tab) {
          activeTab = target.dataset.tab;
          selected = null;
          render(container);
        } else if (target.dataset.category) {
          category = target.dataset.category;
          render(container);
        } else if (target.dataset.add) {
          add(target.dataset.add);
        } else if (target.dataset.product) {
          selected = PRODUCTS.find((product) => product.id === target.dataset.product) || null;
          render(container);
          setTimeout(() => container.querySelector('[data-close-detail]')?.focus(), 0);
        } else if (target.dataset.closeDetail) {
          const closedId = selected?.id;
          selected = null;
          render(container);
          if (closedId) setTimeout(() => container.querySelector(`[data-product="${closedId}"]`)?.focus(), 0);
        } else if (target.dataset.scrollProducts) {
          const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          container.querySelector('#fs-products')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        } else if (target.dataset.basket) {
          const count = basket.reduce((total, item) => total + item.quantity, 0);
          target.setAttribute('aria-label', `Sepet, ${count} ürün. POC sepeti`);
        }
      };
      inputHandler = (event) => {
        if (!event.target.matches('[data-search]')) return;
        query = event.target.value;
        render(container);
        const input = container.querySelector('[data-search]');
        input?.focus();
        input?.setSelectionRange(query.length, query.length);
      };
      keyHandler = (event) => {
        if (event.key !== 'Escape' || !selected) return;
        const closedId = selected.id;
        selected = null;
        render(container);
        container.querySelector(`[data-product="${closedId}"]`)?.focus();
      };
      container.addEventListener('click', clickHandler);
      container.addEventListener('input', inputHandler);
      container.addEventListener('keydown', keyHandler);
      return {
        cleanup() {
          container.removeEventListener('click', clickHandler);
          container.removeEventListener('input', inputHandler);
          container.removeEventListener('keydown', keyHandler);
          container.replaceChildren();
        }
      };
    }
  };
}
