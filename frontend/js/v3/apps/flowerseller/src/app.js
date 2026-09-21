// Flowerseller AizanoiOS POC — frontend-only Turkish boutique flower shop.
//
// Static-first. No network calls, no payment processing, no account. Browser-local persistence
// holds only non-sensitive state (cart lines, favorites, demo order ids). All money math
// runs in integer minor units (kuruş) to keep totals deterministic.
//
// Dialog contract: each overlay records its opener, traps focus, makes the rest of the shell
// inert, closes on Escape and restores focus to the opener. cleanup() releases every listener,
// timer, dialog state and body scroll lock deterministically.

import {
  FLOWERSELLER_PRODUCTS, FLOWERSELLER_CATEGORIES, FLOWERSELLER_FLOWER_TYPES, FLOWERSELLER_COLOR_OPTIONS,
  FLOWERSELLER_OCCASIONS, FLOWERSELLER_VARIANTS, FLOWERSELLER_ADDONS, FLOWERSELLER_DELIVERY_SLOTS,
  FLOWERSELLER_COUPON,
  findFlowersellerProduct, findFlowersellerVariant, findFlowersellerAddon,
  flowersellerMoney, flowersellerLineKey, flowersellerLineUnitMinor, FLOWERSELLER_MINOR_UNIT,
} from './catalog.js';
import {
  loadCart, saveCart, loadFavorites, saveFavorites, loadOrders, saveOrders, loadCoupon, saveCoupon,
} from './storage.js';
import { esc } from './safe.js';

const MAX_OPEN_ORDERS = 6;
const SEARCH_DEBOUNCE_MS = 120;
const FREE_DELIVERY_MINOR = 1500 * FLOWERSELLER_MINOR_UNIT;
const STANDARD_DELIVERY_MINOR = 89 * FLOWERSELLER_MINOR_UNIT;

// Module-wide lock state keeps two simultaneous Flowerseller instances from unlocking each other.
let flowersellerScrollLocks = 0;
let flowersellerPreviousOverflow = '';
function lockFlowersellerScroll() {
  if (typeof document === 'undefined' || !document.body) return;
  if (flowersellerScrollLocks === 0) flowersellerPreviousOverflow = document.body.style.overflow;
  flowersellerScrollLocks += 1;
  document.body.dataset.fsScrollLocked = '1';
  document.body.style.overflow = 'hidden';
}
function unlockFlowersellerScroll() {
  if (flowersellerScrollLocks <= 0) return;
  flowersellerScrollLocks -= 1;
  if (flowersellerScrollLocks === 0 && typeof document !== 'undefined' && document.body) {
    document.body.style.overflow = flowersellerPreviousOverflow;
    delete document.body.dataset.fsScrollLocked;
  }
}

function uniqueOrderId() {
  const seed = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(2)) : [Date.now() & 0xffff, Math.floor(Math.random() * 0xffff)];
  const a = (seed[0] ?? 0).toString(36).padStart(4, '0');
  const b = (seed[1] ?? 0).toString(36).padStart(4, '0');
  return `FS-${a}${b}`.toUpperCase().slice(0, 12);
}

function debounce(fn, ms) {
  let timer = 0;
  return function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; fn.apply(this, args); }, ms);
  };
}

function trLower(value) {
  return String(value ?? '').toLocaleLowerCase('tr-TR');
}

function safeText(value, fallback = '') {
  if (value == null) return fallback;
  return esc(value);
}

function clampQty(n) {
  const x = Math.floor(Number(n) || 0);
  if (x < 0) return 0;
  if (x > 99) return 99;
  return x;
}

export function createFlowersellerApp() {
  let container = null;
  let instanceId = `fs-${Math.random().toString(36).slice(2, 8)}`;

  // Persistent app state.
  let cart = loadCart().filter((line) => findFlowersellerProduct(line.productId));
  let favorites = new Set(loadFavorites().filter((id) => findFlowersellerProduct(id)));
  let orders = loadOrders();
  let couponApplied = loadCoupon();

  // Ephemeral UI state.
  let tab = 'store';
  let query = '';
  let category = 'Tümü';
  let flowerType = 'Tümü';
  let occasion = '';
  let sort = 'featured';
  let filtersOpen = false;
  let favoritesOnly = false;
  let cartOpen = false;
  let detailId = null;
  let checkoutOpen = false;
  let checkoutStep = 'delivery';
  let checkoutSubmitted = false;
  let successId = null;
  let trackingId = null;
  let unknownTrackingId = '';
  let filterState = { sameDay: false, colors: new Set(), minPrice: 0, maxPrice: 2000 };

  // Checkout form data is intentionally ephemeral. It is copied between rerendered steps,
  // then only non-sensitive delivery metadata is included in the demo order snapshot.
  let checkoutDraft = {
    delivery: { address: '', district: 'Kadıköy', slot: '09-13', date: 'Bugün' },
    recipient: { recipient: '', phone: '', message: '', anonymous: false },
    payment: { method: 'demo' },
  };

  // Dialog contract bookkeeping.
  let activeDialog = null; // { kind, opener, prevFocus, prevOverflow }
  let scrollLockCount = 0;
  let focusFrame = 0;

  // Resource handles.
  let listeners = { click: null, input: null, change: null, keydown: null, submit: null };
  let searchTimer = 0;

  // ---- pricing math (all integer minor units) ----
  function subtotalMinor() {
    return cart.reduce((sum, line) => sum + line.unitMinor * line.qty, 0);
  }
  function deliveryMinor() {
    const sub = subtotalMinor();
    if (sub === 0) return 0;
    if (couponApplied && sub >= FREE_DELIVERY_MINOR) return 0;
    return STANDARD_DELIVERY_MINOR;
  }
  function discountMinor() {
    if (!couponApplied) return 0;
    return Math.round(subtotalMinor() * FLOWERSELLER_COUPON.discountRate);
  }
  function totalMinor() {
    const total = subtotalMinor() + deliveryMinor() - discountMinor();
    return Math.max(0, total);
  }

  function cartLineView(line) {
    const product = findFlowersellerProduct(line.productId);
    if (!product) return null;
    const variant = findFlowersellerVariant(line.variantId) || FLOWERSELLER_VARIANTS[0];
    return { ...product, variantLabel: variant.label, addons: line.addons.map((id) => findFlowersellerAddon(id)?.label || id), qty: line.qty, unitMinor: line.unitMinor, key: line.key };
  }

  function totalItems() { return cart.reduce((sum, line) => sum + line.qty, 0); }

  function persist() {
    saveCart(cart);
    saveFavorites(Array.from(favorites));
    saveOrders(orders);
    saveCoupon(couponApplied);
  }

  function filteredProducts() {
    const q = trLower(query);
    const minP = Math.max(0, Number(filterState.minPrice) || 0) * FLOWERSELLER_MINOR_UNIT;
    const maxP = Math.max(minP, Math.min(100000, Number(filterState.maxPrice) || 100000)) * FLOWERSELLER_MINOR_UNIT;
    let list = FLOWERSELLER_PRODUCTS.filter((p) => {
      if (category !== 'Tümü' && p.category !== category) return false;
      if (flowerType !== 'Tümü' && p.type !== flowerType) return false;
      if (occasion && p.occasion !== occasion) return false;
      if (favoritesOnly && !favorites.has(p.id)) return false;
      if (filterState.sameDay && !p.sameday) return false;
      if (filterState.colors.size > 0 && !p.colors.some((c) => filterState.colors.has(c))) return false;
      if (p.baseMinor < minP || p.baseMinor > maxP) return false;
      if (q) {
        const hay = trLower(`${p.name} ${p.note} ${p.category} ${p.occasion} ${p.type}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort === 'price-asc') list = list.slice().sort((a, b) => a.baseMinor - b.baseMinor);
    else if (sort === 'price-desc') list = list.slice().sort((a, b) => b.baseMinor - a.baseMinor);
    else if (sort === 'rating') list = list.slice().sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    else if (sort === 'name') list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return list;
  }

  // ---- dialog / scroll-lock infrastructure ----
  function lockScroll() {
    scrollLockCount += 1;
    lockFlowersellerScroll();
  }
  function unlockScroll() {
    if (scrollLockCount === 0) return;
    scrollLockCount -= 1;
    unlockFlowersellerScroll();
  }
  function setInert(open) {
    if (!container) return;
    if (open) {
      // Mark store/orders/readme surfaces inert. The overlay host is appended to body and
      // stays interactive. We do NOT mark the entire .fs-app inert because the overlay
      // host lives outside the container, and shell-managed wrappers around the container
      // can intercept pointer events when their internal stack is fully inert.
      for (const node of container.querySelectorAll('.fs-app .fs-store, .fs-app .fs-orders, .fs-app .fs-readme')) {
        node.setAttribute('inert', '');
      }
    } else {
      for (const node of container.querySelectorAll('.fs-app [inert]')) {
        node.removeAttribute('inert');
      }
    }
  }
  function recordOpener(opener) {
    activeDialog = {
      kind: 'overlay',
      opener: opener instanceof Element ? opener : null,
      prevFocus: typeof document !== 'undefined' ? document.activeElement : null,
    };
    setInert(true);
    lockScroll();
  }
  function resolveOpener(opener) {
    if (opener instanceof Element && opener.isConnected && (container?.contains(opener) || (overlayHost?.isConnected && overlayHost.contains(opener)))) return opener;
    if (!(opener instanceof Element)) return null;
    const productId = opener.dataset.product;
    if (productId) return findAllInInstance('[data-product]').find((node) => node.dataset.product === productId) || null;
    if (opener.dataset.basket !== undefined) return findInInstance('[data-basket]');
    return null;
  }

  function openOverlay(kind, opener) {
    closeOverlay();
    recordOpener(resolveOpener(opener) || (typeof document !== 'undefined' ? document.activeElement : null));
    activeDialog.kind = kind;
  }
  function closeOverlay(restoreFocus = true) {
    if (!activeDialog) return;
    setInert(false);
    unlockScroll();
    const opener = activeDialog.opener;
    activeDialog = null;
    if (restoreFocus && opener && typeof opener.focus === 'function') {
      try { opener.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  }

  function focusFirstInDialog(root, expectedOrigin = null) {
    if (!root) return;
    const target = root.querySelector('[data-autofocus], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!target) return;
    if (focusFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      focusFrame = 0;
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const focusStillBelongsToOpen = !active || active === document.body || active === expectedOrigin || root.contains(active);
      if (root.isConnected && dialogRoot() === root && focusStillBelongsToOpen) {
        try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    });
  }

  // ---- templates ----
  function badgeHTML(product) {
    const badges = [];
    if (product.sameday) badges.push(`<small class="fs-badge fs-badge-delivery">Aynı gün</small>`);
    badges.push(`<small class="fs-badge fs-badge-stock">${safeText(product.stock)}</small>`);
    if (product.oldMinor > product.baseMinor) {
      const pct = Math.round((1 - product.baseMinor / product.oldMinor) * 100);
      badges.push(`<small class="fs-badge fs-badge-sale">-${pct}%</small>`);
    }
    return badges.join('');
  }

  function productCardHTML(product) {
    const sale = product.oldMinor > product.baseMinor;
    const isFav = favorites.has(product.id);
    return `<article class="fs-product-card" data-product-card="${safeText(product.id)}" id="${instanceId}-card-${safeText(product.id)}">
  <button class="fs-product-open" type="button" data-product="${safeText(product.id)}" aria-labelledby="${instanceId}-card-${safeText(product.id)}-name">
    <span class="fs-photo" aria-hidden="true">
      <img src="${safeText(product.image)}" alt="${safeText(product.name)} temsili ürün görseli" width="900" height="720" loading="lazy" decoding="async" />
    </span>
    <span class="fs-product-badges">${badgeHTML(product)}</span>
    <span class="fs-product-meta">
      <small>${safeText(product.category)} · ${safeText(product.occasion)}</small>
      <strong id="${instanceId}-card-${safeText(product.id)}-name">${safeText(product.name)}</strong>
      <span class="fs-rating" aria-label="${product.rating} yıldız, ${product.reviews} değerlendirme">★ ${product.rating} <i>(${product.reviews})</i></span>
      <span class="fs-price"><b>${flowersellerMoney(product.baseMinor)}</b>${sale ? ` <del>${flowersellerMoney(product.oldMinor)}</del>` : ''}</span>
    </span>
  </button>
  <div class="fs-card-actions">
    <button class="fs-favorite ${isFav ? 'is-favorite' : ''}" type="button" data-favorite="${safeText(product.id)}" aria-pressed="${isFav}" aria-label="${isFav ? `${safeText(product.name)} favorilerden çıkar` : `${safeText(product.name)} favorilere ekle`}">${isFav ? '♥' : '♡'}</button>
    <button class="fs-add" type="button" data-add="${safeText(product.id)}">Sepete ekle <span aria-hidden="true">＋</span></button>
  </div>
</article>`;
  }

  function filterChipHTML(label, key, isActive) {
    return `<button type="button" class="${isActive ? 'is-active' : ''}" data-category="${safeText(key)}" aria-pressed="${isActive}" id="${instanceId}-cat-${safeText(key)}">${safeText(label)}</button>`;
  }

  function filterChecklistHTML() {
    const colors = FLOWERSELLER_COLOR_OPTIONS.map((c) => {
      const active = filterState.colors.has(c);
      return `<label><input type="checkbox" data-filter-color="${safeText(c)}" ${active ? 'checked' : ''}> ${safeText(c)}</label>`;
    }).join('');
    const types = FLOWERSELLER_FLOWER_TYPES.map((t) => `<option value="${safeText(t)}" ${flowerType === t ? 'selected' : ''}>${safeText(t === 'Tümü' ? 'Tüm türler' : t)}</option>`).join('');
    return `<div class="fs-filter-panel" data-filter-panel role="region" aria-label="Gelişmiş filtreler">
  <fieldset><legend>Tür</legend><select data-filter-type id="${instanceId}-filter-type">${types}</select></fieldset>
  <fieldset><legend>Teslimat</legend><label><input type="checkbox" data-filter-sameday ${filterState.sameDay ? 'checked' : ''}> Aynı gün teslimat</label></fieldset>
  <fieldset><legend>Renk</legend>${colors}</fieldset>
  <fieldset><legend>Fiyat</legend>
    <label>Min <input type="number" min="0" max="10000" step="50" data-filter-min id="${instanceId}-filter-min" value="${filterState.minPrice || 0}"></label>
    <label>Max <input type="number" min="0" max="10000" step="50" data-filter-max id="${instanceId}-filter-max" value="${filterState.maxPrice >= 100000 ? 10000 : filterState.maxPrice}"></label>
  </fieldset>
  <button type="button" data-apply-filters>Filtreleri uygula</button>
  <button type="button" class="fs-link" data-reset-filters>Filtreleri temizle</button>
</div>`;
  }

  function storeHTML() {
    const list = filteredProducts();
    const active = (filterState.sameDay ? 1 : 0) + filterState.colors.size + (flowerType !== 'Tümü' ? 1 : 0) + (occasion ? 1 : 0) + (category !== 'Tümü' ? 1 : 0) + (filterState.minPrice > 0 || filterState.maxPrice < 100000 ? 1 : 0);
    const occasionHTML = FLOWERSELLER_OCCASIONS.map((o) => `<button type="button" data-occasion="${safeText(o)}" aria-pressed="${occasion === o}" id="${instanceId}-occasion-${safeText(o)}"><span aria-hidden="true">${o === 'Romantik' ? '♡' : '✳'}</span>${safeText(o)}</button>`).join('');
    const categoryHTML = FLOWERSELLER_CATEGORIES.map((c) => filterChipHTML(c, c, category === c)).join('');
    return `<section class="fs-store" aria-labelledby="${instanceId}-store-title">
  <div class="fs-hero">
    <div>
      <span class="fs-eyebrow">Flowerseller · POC</span>
      <h1 id="${instanceId}-store-title">Bir buket, günün <em>yumuşak tarafı.</em></h1>
      <p>İstanbul için küçük seriler, özenli notlar ve aynı gün teslimat hissi.</p>
      <button class="fs-hero-cta" type="button" data-scroll-products>Seçkide dolaş <span aria-hidden="true">↓</span></button>
    </div>
    <div class="fs-hero-art" aria-hidden="true">
      <div class="fs-orbit"></div>
      <div class="fs-stem"></div>
      <div class="fs-bloom"><i></i><i></i><i></i><b></b></div>
      <span class="fs-hero-note">bugün için<br>biraz renk</span>
    </div>
  </div>
  <div class="fs-toolbar">
    <div class="fs-tabs" role="tablist" aria-label="Flowerseller bölümleri">
      <button role="tab" id="${instanceId}-tab-store" aria-selected="${tab === 'store'}" aria-controls="${instanceId}-panel-store" data-tab="store">Store</button>
      <button role="tab" id="${instanceId}-tab-orders" aria-selected="${tab === 'orders'}" aria-controls="${instanceId}-panel-orders" data-tab="orders">Siparişler <small>${orders.length}</small></button>
      <button role="tab" id="${instanceId}-tab-readme" aria-selected="${tab === 'readme'}" aria-controls="${instanceId}-panel-readme" data-tab="readme">README</button>
    </div>
    <button type="button" class="fs-basket" data-basket aria-label="Sepet, ${totalItems()} ürün">
      <span>Sepet</span>
      <b data-cart-count id="${instanceId}-cart-count">${totalItems()}</b>
      <span class="fs-fav-count" data-favorites-count id="${instanceId}-fav-count" aria-label="${favorites.size} favori">${favorites.size}</span>
    </button>
  </div>
  <div class="fs-occasion-strip" role="group" aria-label="Duruma göre keşfet">${occasionHTML}</div>
  <div class="fs-catalog-head" id="${instanceId}-products">
    <div>
      <span class="fs-eyebrow">Küçük seri · ${FLOWERSELLER_PRODUCTS.length} ürün</span>
      <h2>Bugünün seçkisi</h2>
      <p class="fs-results-summary" aria-live="polite">${list.length} ürün${query ? ` · “${safeText(query)}” araması` : ''}${active ? ` · ${active} filtreli` : ''}${favoritesOnly ? ' · sadece favoriler' : ''}</p>
    </div>
    <div class="fs-catalog-actions">
      <label class="fs-search"><span class="sr-only">Ürün ara</span><input type="search" data-search placeholder="Buket ara" value="${safeText(query)}" id="${instanceId}-search" autocomplete="off"></label>
      <button type="button" class="fs-filter-trigger" data-filter-trigger aria-expanded="${filtersOpen}" aria-controls="${instanceId}-filter-panel">${filtersOpen ? 'Filtreleri kapat' : 'Filtreler'}</button>
      <select data-sort aria-label="Sıralama" id="${instanceId}-sort">
        <option value="featured" ${sort === 'featured' ? 'selected' : ''}>Önerilen sıra</option>
        <option value="price-asc" ${sort === 'price-asc' ? 'selected' : ''}>Fiyat artan</option>
        <option value="price-desc" ${sort === 'price-desc' ? 'selected' : ''}>Fiyat azalan</option>
        <option value="rating" ${sort === 'rating' ? 'selected' : ''}>En çok beğenilen</option>
        <option value="name" ${sort === 'name' ? 'selected' : ''}>İsme göre</option>
      </select>
      <button type="button" class="fs-favorites-view ${favoritesOnly ? 'is-active' : ''}" data-favorites-view aria-pressed="${favoritesOnly}">${favoritesOnly ? 'Tümünü göster' : 'Sadece favoriler'}</button>
    </div>
  </div>
  <div class="fs-categories" role="group" aria-label="Ürün kategorileri">${categoryHTML}</div>
  ${filtersOpen ? filterChecklistHTML() : ''}
  <div class="fs-products" role="region" aria-live="polite" aria-busy="false">${list.length ? list.map(productCardHTML).join('') : `<p class="fs-empty">Bu aramada henüz bir buket yok. <button type="button" class="fs-link" data-clear-search> Aramayı temizle</button> veya farklı filtre dene.</p>`}</div>
</section>`;
  }

  function detailHTML() {
    if (!detailId) return '';
    const product = findFlowersellerProduct(detailId);
    if (!product) return '';
    const variantOptions = FLOWERSELLER_VARIANTS.map((v) => `<label><input type="radio" name="${instanceId}-size" data-size-option="${v.id}" value="${v.id}" ${v.id === 'small' ? 'checked' : ''}> ${safeText(v.label)} <span>${v.deltaMinor === 0 ? 'Başlangıç fiyatı' : '+' + flowersellerMoney(v.deltaMinor)}</span></label>`).join('');
    const addonOptions = FLOWERSELLER_ADDONS.map((a) => `<label class="fs-addon"><input type="checkbox" data-addon="${a.id}"> ${safeText(a.label)} <span>+${flowersellerMoney(a.deltaMinor)}</span></label>`).join('');
    const dateOptions = ['Bugün', 'Yarın', '2 gün sonra'].map((d) => `<option>${safeText(d)}</option>`).join('');
    const slotOptions = FLOWERSELLER_DELIVERY_SLOTS.map((s) => `<option value="${safeText(s.id)}">${safeText(s.label)}</option>`).join('');
    return `<div class="fs-modal-backdrop" data-modal-backdrop>
  <section class="fs-detail" role="dialog" aria-modal="true" aria-labelledby="${instanceId}-detail-title" aria-describedby="${instanceId}-detail-desc" data-product-dialog>
    <button class="fs-close" type="button" data-close-detail aria-label="Detayı kapat" data-autofocus>×</button>
    <div class="fs-detail-gallery">
      <div class="fs-hero-image">
        <img src="${safeText(product.image)}" alt="${safeText(product.name)} temsili ürün görseli" width="900" height="720" loading="eager" decoding="async" />
      </div>
      <div class="fs-detail-facts" aria-label="Ürün detayları">
        <span><b>İçerik</b>${safeText(product.composition)}</span>
        <span><b>Ölçü</b>${safeText(product.dimensions)}</span>
        <span><b>Bakım</b>${safeText(product.care)}</span>
        <span><b>Stok</b>${safeText(product.stock)}</span>
      </div>
    </div>
    <div class="fs-detail-copy">
      <small>${safeText(product.category)} · ${safeText(product.colors.join(' / '))} · ${safeText(product.occasion)}</small>
      <h2 id="${instanceId}-detail-title">${safeText(product.name)}</h2>
      <p id="${instanceId}-detail-desc">${safeText(product.note)}</p>
      <div class="fs-detail-rating">★ ${product.rating} <span>${product.reviews} değerlendirme</span></div>
      <p class="fs-substitution"><b>Mevsim notu:</b> ${safeText(product.substitution)}</p>
      <div class="fs-live-price" data-config-price id="${instanceId}-detail-price">${flowersellerMoney(product.baseMinor)}</div>
      <fieldset class="fs-options"><legend>Boyut</legend>${variantOptions}</fieldset>
      <fieldset class="fs-options"><legend>Tarih & saat</legend>
        <div class="fs-config-grid">
          <label>Teslimat tarihi<select data-delivery-date id="${instanceId}-detail-date">${dateOptions}</select></label>
          <label>Saat aralığı<select data-delivery-slot id="${instanceId}-detail-slot">${slotOptions}</select></label>
        </div>
      </fieldset>
      <label class="fs-message">Kart mesajı (en fazla 140 karakter)<input type="text" data-card-message id="${instanceId}-detail-message" maxlength="140" autocomplete="off"></label>
      <fieldset class="fs-options"><legend>Hediye ekleri</legend>${addonOptions}</fieldset>
      <label class="fs-anonymous"><input type="checkbox" data-anonymous-sender> Gönderici adımı kartta görünmesin</label>
      <button class="fs-detail-add" type="button" data-add-configured>Sepete ekle · <span data-config-price-label>${flowersellerMoney(product.baseMinor)}</span></button>
    </div>
  </section>
</div>`;
  }

  function cartDrawerHTML() {
    const lines = cart.map(cartLineView).filter(Boolean);
    const sub = subtotalMinor();
    const del = deliveryMinor();
    const disc = discountMinor();
    const tot = totalMinor();
    const linesHTML = lines.length
      ? lines.map((line) => {
          const totalForLine = line.unitMinor * line.qty;
          return `<article data-cart-line data-line-key="${safeText(line.key)}">
    <span class="fs-mini-photo"><img src="${safeText(line.image)}" alt="" width="48" height="48" loading="lazy" decoding="async"></span>
    <div class="fs-line-copy">
      <strong>${safeText(line.name)}</strong>
      <small>${safeText(line.variantLabel)}${line.addons.length ? ` · ${line.addons.map(safeText).join(', ')}` : ''}</small>
      <span>${flowersellerMoney(line.unitMinor)} · ${line.qty} adet · ${flowersellerMoney(totalForLine)}</span>
    </div>
    <div class="fs-qty">
      <button type="button" data-quantity-decrease="${safeText(line.key)}" aria-label="${safeText(line.name)} adedini azalt">−</button>
      <b>${line.qty}</b>
      <button type="button" data-quantity-increase="${safeText(line.key)}" aria-label="${safeText(line.name)} adedini artır">＋</button>
    </div>
    <button type="button" class="fs-line-remove" data-remove="${safeText(line.key)}" aria-label="${safeText(line.name)} sepetten çıkar">×</button>
  </article>`;
        }).join('')
      : `<p class="fs-empty">Sepetin henüz boş. Bir buket seçelim mi?</p>`;
    return `<div class="fs-drawer-backdrop" data-cart-backdrop>
  <aside class="fs-cart-drawer" role="dialog" aria-modal="true" aria-labelledby="${instanceId}-cart-title" data-cart-drawer>
    <header>
      <div>
        <span class="fs-eyebrow">Flowerseller</span>
        <h2 id="${instanceId}-cart-title">Sepetin</h2>
        <p class="fs-cart-note">Bu POC gerçek bir ödeme almaz; tüm sepet verileri tarayıcında saklanır.</p>
      </div>
      <button type="button" data-close-cart aria-label="Sepeti kapat">×</button>
    </header>
    <div class="fs-cart-lines" role="list">${linesHTML}</div>
    <label class="fs-coupon">
      <span>Kupon kodu</span>
      <div>
        <input type="text" data-coupon-input placeholder="BAHAR10" maxlength="32" autocomplete="off" value="${couponApplied ? 'BAHAR10' : ''}" id="${instanceId}-coupon-input">
        <button type="button" data-apply-coupon>${couponApplied ? 'Kaldır' : 'Uygula'}</button>
      </div>
      <small data-coupon-status>${couponApplied ? 'BAHAR10 aktif — %10 indirim.' : 'İpucu: BAHAR10'}</small>
    </label>
    <div class="fs-cart-summary" data-cart-summary>
      <div><span>Ara toplam</span><b>${flowersellerMoney(sub)}</b></div>
      <div><span>Teslimat</span><b>${del === 0 ? (couponApplied && sub >= FREE_DELIVERY_MINOR ? 'BAHAR10 ile ücretsiz' : 'Ücretsiz') : flowersellerMoney(del)}</b></div>
      ${couponApplied ? `<div class="fs-discount"><span>İndirim (BAHAR10)</span><b>−${flowersellerMoney(disc)}</b></div>` : ''}
      <div class="fs-total"><span>Toplam</span><b data-cart-total-value>${flowersellerMoney(tot)}</b></div>
    </div>
    <button class="fs-checkout-cta" type="button" data-start-checkout ${cart.length === 0 ? 'disabled' : ''}>${cart.length === 0 ? 'Sepet boş' : 'Teslimata geç'}<span aria-hidden="true"> →</span></button>
    <p class="fs-trust">Frontend-only POC · ödeme simülasyonu · PII tarayıcıda saklanmaz</p>
  </aside>
</div>`;
  }

  function checkoutHTML() {
    if (!checkoutOpen) return '';
    const steps = [
      { id: 'delivery', label: 'Teslimat' },
      { id: 'recipient', label: 'Alıcı' },
      { id: 'payment', label: 'Ödeme (simülasyon)' },
    ];
    const stepsHTML = steps.map((s) => {
      const isCurrent = s.id === checkoutStep;
      const isDone = steps.findIndex((x) => x.id === s.id) < steps.findIndex((x) => x.id === checkoutStep);
      return `<button type="button" class="fs-checkout-step ${isCurrent ? 'is-current' : ''} ${isDone ? 'is-done' : ''}" data-checkout-step="${s.id}" aria-current="${isCurrent}"><b>${steps.findIndex((x) => x.id === s.id) + 1}</b><span>${safeText(s.label)}</span></button>`;
    }).join('');
    const slotOptions = FLOWERSELLER_DELIVERY_SLOTS.map((s) => `<option value="${safeText(s.id)}">${safeText(s.label)}</option>`).join('');
    const panel = checkoutStep === 'delivery' ? `
      <form class="fs-checkout-form" data-step-form="delivery">
        <label>Teslimat adresi<input name="address" required maxlength="160" autocomplete="street-address" id="${instanceId}-ck-address" value="${safeText(checkoutDraft.delivery.address)}"></label>
        <div class="fs-checkout-row">
          <label>İlçe<select name="district" required id="${instanceId}-ck-district">${['Kadıköy','Beşiktaş','Şişli','Ataşehir','Üsküdar'].map((d) => `<option ${checkoutDraft.delivery.district === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select></label>
          <label>Saat<select name="slot" required id="${instanceId}-ck-slot">${slotOptions.replace(`value="${checkoutDraft.delivery.slot}"`, `value="${checkoutDraft.delivery.slot}" selected` )}</select></label>
        </div>
        <label>Teslimat tarihi<select name="date" required id="${instanceId}-ck-date">${['Bugün','Yarın','2 gün sonra'].map((d) => `<option ${checkoutDraft.delivery.date === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <div class="fs-checkout-actions">
          <button type="button" class="fs-link" data-back-cart>← Sepete dön</button>
          <button type="submit" class="fs-checkout-cta" data-autofocus>Teslimat adımını onayla</button>
        </div>
      </form>` : checkoutStep === 'recipient' ? `
      <form class="fs-checkout-form" data-step-form="recipient">
        <div class="fs-checkout-row">
          <label>Alıcı adı<input name="recipient" required maxlength="80" autocomplete="name" id="${instanceId}-ck-recipient" value="${safeText(checkoutDraft.recipient.recipient)}"></label>
          <label>Telefon<input type="tel" name="phone" required maxlength="20" autocomplete="tel" inputmode="tel" id="${instanceId}-ck-phone" value="${safeText(checkoutDraft.recipient.phone)}"></label>
        </div>
        <label>Kart mesajı (opsiyonel)<input name="message" maxlength="140" autocomplete="off" id="${instanceId}-ck-message" value="${safeText(checkoutDraft.recipient.message)}"></label>
        <label class="fs-anonymous"><input type="checkbox" name="anonymous" ${checkoutDraft.recipient.anonymous ? 'checked' : ''}> Gönderici adımı kartta görünmesin</label>
        <div class="fs-checkout-actions">
          <button type="button" class="fs-link" data-checkout-back>← Teslimat</button>
          <button type="submit" class="fs-checkout-cta" data-autofocus>Alıcı bilgisini onayla</button>
        </div>
      </form>` : `
      <form class="fs-checkout-form" data-step-form="payment">
        <p class="fs-payment-disclaimer"><b>Demo ödeme:</b> Flowerseller POC gerçek ödeme almaz. Aşağıdaki kart bilgileri <u>toplanmaz, gönderilmez, saklanmaz</u> — bu alan yalnızca akışı tamamlamak içindir. Gerçek bir satın alma için kart bilgilerini asla bu forma yazmayın.</p>
        <label class="fs-payment-method"><input type="radio" name="demoMethod" value="demo" checked> Demo ödeme yöntemi <small>Visa •••• 4242 · yalnızca görsel önizleme</small></label>
        <label class="fs-consent"><input type="checkbox" name="consent" required id="${instanceId}-ck-consent"> Demo ödeme adımının POC olduğunu ve gerçek bir işlem yapılmayacağını anladım.</label>
        <div class="fs-checkout-actions">
          <button type="button" class="fs-link" data-checkout-back>← Alıcı</button>
          <button type="submit" class="fs-checkout-cta" ${checkoutSubmitted ? 'disabled' : ''} data-autofocus>${checkoutSubmitted ? 'Sipariş oluşturuluyor...' : `Demo siparişi oluştur · ${flowersellerMoney(totalMinor())}`}</button>
        </div>
      </form>`;
    return `<div class="fs-checkout" role="dialog" aria-modal="true" aria-labelledby="${instanceId}-checkout-title" data-checkout>
  <header>
    <button type="button" data-back-cart>← Mağazaya dön</button>
    <span class="fs-eyebrow">Frontend-only checkout simülasyonu</span>
  </header>
  <div class="fs-checkout-inner">
    <div class="fs-checkout-title">
      <span class="fs-eyebrow">Flowerseller · checkout</span>
      <h1 id="${instanceId}-checkout-title">Son dokunuşlar.</h1>
      <p>Bu akışın hiçbir adımında gerçek bir ödeme alınmaz; ödeme adımı görsel bir önizlemedir.</p>
    </div>
    <nav class="fs-checkout-steps" data-checkout-steps aria-label="Checkout adımları">${stepsHTML}</nav>
    ${panel}
  </div>
</div>`;
  }

  function ordersHTML() {
    const list = orders.slice().sort((a, b) => b.createdAt - a.createdAt);
    const active = list.find((o) => o.status !== 'Teslim edildi') || list[0];
    return `<section class="fs-orders" aria-labelledby="${instanceId}-orders-title">
  <nav class="fs-subnav">
    <button type="button" data-tab="store" id="${instanceId}-orders-store">Store</button>
    <button type="button" data-tab="orders" aria-current="page" id="${instanceId}-orders-current">Siparişler</button>
    <button type="button" data-tab="readme" id="${instanceId}-orders-readme">README</button>
  </nav>
  <div class="fs-orders-hero">
    <span class="fs-eyebrow">Flowerseller · hesabım</span>
    <h1 id="${instanceId}-orders-title">Jestlerin<br><em>izinde.</em></h1>
    <p>Demo siparişlerin, takip durumların ve favorilerin tek yerde. Gerçek bir kurye/operasyon yoktur.</p>
  </div>
  <div class="fs-orders-toolbar">
    <label>Sipariş takip kodu
      <input type="search" data-tracking-input placeholder="FS-XXXX" maxlength="14" autocomplete="off" value="${safeText(unknownTrackingId)}" id="${instanceId}-tracking-input">
    </label>
    <button type="button" data-tracking-lookup>Sorgula</button>
  </div>
  ${trackingId ? trackerCardHTML(orders.find((o) => o.id === trackingId)) : ''}
  ${unknownTrackingId ? `<p class="fs-empty" role="status" data-tracking-missing>“${safeText(unknownTrackingId)}” kodlu bir demo sipariş bulunamadı. Yalnızca bu oturumda oluşturulan demo siparişler takip edilebilir.</p>` : ''}
  ${active ? trackerCardHTML(active) : '<p class="fs-empty">Henüz demo siparişin yok. Store sekmesinden bir buket seçebilirsin.</p>'}
  <div class="fs-fav-summary">
    <strong>Favorilerin <span data-favorites-count>${favorites.size}</span></strong>
    <p>Bir üründeki ♡ ikonuna dokunarak saklayabilirsin. Tarayıcına kaydedilir, hiçbir yere gönderilmez.</p>
    ${favorites.size ? `<ul class="fs-fav-list">${Array.from(favorites).slice(0, 6).map((id) => { const p = findFlowersellerProduct(id); return p ? `<li>${safeText(p.name)} <small>${safeText(p.category)}</small></li>` : ''; }).join('')}</ul>` : ''}
  </div>
  <div class="fs-order-history">
    <h2>Tüm demo siparişler <small>(${list.length})</small></h2>
    ${list.length === 0 ? '<p class="fs-empty">Henüz demo sipariş yok.</p>' : `<ol class="fs-order-list">${list.map((o) => `<li><strong>${safeText(o.id)}</strong><span>${safeText(new Date(o.createdAt).toLocaleString('tr-TR'))}</span><span>${flowersellerMoney(o.totalMinor)}</span><span>${safeText(o.status)}</span></li>`).join('')}</ol>`}
  </div>
</section>`;
  }

  function trackerCardHTML(order) {
    if (!order) return '';
    const stages = [
      { id: 'alındı', label: 'Sipariş alındı' },
      { id: 'Hazırlanıyor', label: 'Hazırlanıyor' },
      { id: 'Yola çıktı', label: 'Yola çıktı' },
      { id: 'Teslim edildi', label: 'Teslim edildi' },
    ];
    const idx = stages.findIndex((s) => s.id === order.status);
    const stageHTML = stages.map((s, i) => {
      const cls = i < idx ? 'is-done' : (i === idx ? 'is-current' : '');
      const sym = i < idx ? '✓' : (i === idx ? '●' : '○');
      return `<b class="${cls}"><span aria-hidden="true">${sym}</span>${safeText(s.label)}</b>`;
    }).join('');
    const linesHTML = order.lines.map((line) => {
      const product = findFlowersellerProduct(line.productId);
      if (!product) return '';
      const variant = findFlowersellerVariant(line.variantId) || FLOWERSELLER_VARIANTS[0];
      return `<li><strong>${safeText(product.name)}</strong><small>${safeText(variant.label)} · ${line.qty} adet</small><span>${flowersellerMoney(line.unitMinor * line.qty)}</span></li>`;
    }).join('');
    return `<article class="fs-order-card" data-order-tracker data-order-id="${safeText(order.id)}">
    <div>
      <span class="fs-eyebrow">Demo sipariş · ${safeText(order.id)}</span>
      <h2>${safeText(new Date(order.createdAt).toLocaleString('tr-TR'))}</h2>
      <p>${safeText(order.district || '—')} · ${safeText(order.deliveryDate || '—')} · ${safeText(order.slot || '—')} · ${order.lines.length} kalem</p>
      <ul class="fs-order-lines">${linesHTML}</ul>
    </div>
    <div class="fs-tracker" aria-label="Simüle edilmiş durum">${stageHTML}</div>
  </article>`;
  }

  function readmeHTML() {
    const sections = [
      ['Ürün ve sipariş modeli', 'Product, ProductVariant, InventoryItem, Reservation, Order ve OrderItem varlıklarını ayırın; parasal değerleri kuruş olarak integer saklayın. Sepet quote çıktısında price snapshot, vergi ve kampanya satırlarını OrderItem üzerinde değişmez biçimde saklayın.'],
      ['API yüzeyi', 'Katalog, sepet teklifi, sipariş ve teslimat bölgeleri için versioned REST sözleşmesi; pagination ve problem+json hataları.'],
      ['Ödeme yaşam döngüsü', 'draft → awaiting_payment → paid → preparing → out_for_delivery → delivered geçişlerini sunucu doğrulamalı state machine olarak kurun. Hosted checkout veya payment tokenization kullanın; kart bilgisini sisteme almayın.'],
      ['Stok ve rezervasyon', 'Sipariş anında transaction ile stok ayırın; 15 dakikalık TTL ve başarısız ödeme sonrası release worker kullanın.'],
      ['Teslimat bölgeleri', 'İlçe, cutoff, ücret, minimum sepet, aynı gün ve slot kapasitesini Europe/Istanbul ile birlikte modelleyin.'],
      ['Webhook ve idempotency', 'Her yazma isteğinde Idempotency-Key; provider event id unique, imza doğrulamalı ve monotonik webhook state transition.'],
      ['Kimlik ve yönetim', 'Magic link/OAuth, yönetimde MFA ve support, florist, dispatcher, finance, admin rolleri; admin RBAC, audit log ve sipariş bildirimleri (e-posta/SMS/push) için outbox kullanın.'],
      ['Görsel depolama', 'Private upload, signed URL, WebP/AVIF türevleri, alt metin ve EXIF temizliği; kişisel veriyi görsel metadata\'sına yazmayın.'],
      ['Gözlemlenebilirlik', 'Request id, JSON log, trace, quote latency, payment conversion ve delivery SLA metrikleri; loglarda PII tutmayın.'],
      ['KVKK ve güvenlik', 'Aydınlatma ve açık rıza amaçlarını ayırın; saklama/silme, erişim talepleri, TLS, CSP, CSRF ve rate limit uygulayın.'],
      ['Test ve yayın', 'Fiyat, stok, state machine unit; webhook replay ve idempotency integration; 320px/desktop E2E ve rollback runbook.'],
      ['Fazlı yol haritası', 'Faz 0 katalog POC; Faz 1 CMS/API; Faz 2 hosted payment + webhook; Faz 3 florist/courier operasyonu.'],
    ];
    const sectionsHTML = sections.map(([title, body], i) => `<article><span>${String(i + 1).padStart(2, '0')}</span><h2>${safeText(title)}</h2><p>${safeText(body)}</p></article>`).join('');
    return `<section class="fs-readme" aria-labelledby="${instanceId}-readme-title">
  <nav class="fs-subnav">
    <button type="button" data-tab="store">Store</button>
    <button type="button" data-tab="orders">Siparişler</button>
    <button type="button" data-tab="readme" aria-current="page">README</button>
  </nav>
  <div class="fs-readme-intro">
    <span class="fs-eyebrow">Flowerseller · build notes</span>
    <h1 id="${instanceId}-readme-title">Gerçek ürüne<br><em>giden yol.</em></h1>
    <p>Bu sekme, POC arayüzünün arkasına konacak üretim sistemini kısa ama uygulanabilir bir teknik plan olarak tutar.</p>
  </div>
  <div class="fs-readme-grid">${sectionsHTML}</div>
</section>`;
  }

  function successHTML() {
    const order = orders.find((o) => o.id === successId) || orders[0];
    const id = order?.id || 'FS-DEMO';
    return `<div class="fs-success" role="dialog" aria-modal="true" aria-labelledby="${instanceId}-success-title" data-success>
  <div class="fs-success-icon" aria-hidden="true">✳</div>
  <span class="fs-eyebrow">Demo sipariş alındı · ${safeText(id)}</span>
  <h1 id="${instanceId}-success-title">Çiçekler yola çıkmak için hazırlanıyor.</h1>
  <p>Bu bir <b>frontend simülasyonudur</b>: gerçek bir sipariş, ödeme veya kurye başlatılmadı. Tarayıcındaki demo siparişi Siparişler sekmesinden takip edebilirsin.</p>
  <div class="fs-success-actions">
    <button type="button" data-success-orders>Siparişi takip et</button>
    <button type="button" data-success-close>Mağazaya dön</button>
  </div>
</div>`;
  }

  function renderShell(inner) {
    return `<div class="az-app-shell fs-app" data-fs-instance="${safeText(instanceId)}">
  <header class="fs-topbar">
    <span class="fs-mark" aria-hidden="true">✳</span>
    <strong>Flowerseller</strong>
    <span class="fs-poc-pill">frontend-only POC</span>
    <span class="az-system-spacer"></span>
    <span class="fs-location">Kadıköy · İstanbul</span>
  </header>
  ${inner}
</div>`;
  }

  // Overlay markup (cart drawer + product dialog + checkout + success) is mounted outside
  // the inert Flowerseller root so the inert attribute on the mount root cannot accidentally
  // block backdrop interaction. We keep one persistent host element appended to document.body.
  let overlayHost = null;
  function getOverlayHost() {
    if (overlayHost && overlayHost.isConnected) return overlayHost;
    if (typeof document === 'undefined') return null;
    overlayHost = document.createElement('div');
    overlayHost.className = 'fs-overlay-host';
    overlayHost.dataset.fsOverlayHost = instanceId;
    document.body.appendChild(overlayHost);
    return overlayHost;
  }
  function clearOverlayHost() {
    if (overlayHost && overlayHost.parentNode) overlayHost.parentNode.removeChild(overlayHost);
    overlayHost = null;
  }

  function render() {
    if (!container) return;
    const previousOpener = activeDialog?.opener || null;
    closeOverlay(false);
    let inner = '';
    let overlay = '';
    if (successId) overlay = successHTML();
    else if (checkoutOpen) overlay = checkoutHTML();
    else if (tab === 'orders') inner = ordersHTML();
    else if (tab === 'readme') inner = readmeHTML();
    else inner = storeHTML();
    if (!checkoutOpen && !successId && tab !== 'orders' && tab !== 'readme') {
      if (cartOpen) overlay += cartDrawerHTML();
      if (detailId && findFlowersellerProduct(detailId)) overlay += detailHTML();
    }
    container.replaceChildren();
    container.innerHTML = renderShell(inner);
    const host = getOverlayHost();
    if (host) {
      host.replaceChildren();
      if (overlay) host.innerHTML = overlay;
    }
    attachDialogContract();
    if (!dialogRoot() && previousOpener) {
      const restoredOpener = resolveOpener(previousOpener);
      if (restoredOpener) restoredOpener.focus({ preventScroll: true });
    }
  }

  function attachDialogContract() {
    if (!container) return;
    const dialog = dialogRoot();
    if (!dialog) { activeDialog = null; return; }
    const opener = (typeof document !== 'undefined') ? (document.activeElement && dialog.contains(document.activeElement) ? null : document.activeElement) : null;
    activeDialog = { kind: dialog.getAttribute('data-product-dialog') ? 'detail' : (dialog.hasAttribute('data-cart-drawer') ? 'cart' : (dialog.hasAttribute('data-checkout') ? 'checkout' : (dialog.hasAttribute('data-success') ? 'success' : 'overlay'))), opener: opener instanceof Element ? opener : null, prevFocus: opener instanceof Element ? opener : null };
    setInert(true);
    lockScroll();
    const focusOrigin = typeof document !== 'undefined' ? document.activeElement : null;
    requestAnimationFrame(() => focusFirstInDialog(dialog, focusOrigin));
  }

  // ---- handlers ----
  function changeVariant(line, deltaMinor) {
    line.unitMinor = Math.max(0, line.unitMinor + deltaMinor);
  }

  function recalcCart() {
    cart = cart.map((line) => {
      const product = findFlowersellerProduct(line.productId);
      if (!product) return null;
      const variant = findFlowersellerVariant(line.variantId) || FLOWERSELLER_VARIANTS[0];
      const addonMinor = (line.addons || []).reduce((sum, id) => sum + ((findFlowersellerAddon(id)?.deltaMinor) || 0), 0);
      const unit = Math.max(0, product.baseMinor + variant.deltaMinor + addonMinor);
      return { ...line, unitMinor: unit };
    }).filter(Boolean);
  }

  function addToCart(productId, variantId, addons, message, anonymous) {
    const product = findFlowersellerProduct(productId);
    if (!product) return;
    const variant = findFlowersellerVariant(variantId) || FLOWERSELLER_VARIANTS[0];
    const key = flowersellerLineKey(productId, variant.id, addons);
    const unitMinor = Math.max(0, flowersellerLineUnitMinor(product, variant.id, addons));
    const existing = cart.find((line) => line.key === key);
    if (existing) {
      existing.qty = clampQty(existing.qty + 1);
    } else {
      cart.push({ key, productId, variantId: variant.id, addons: [...new Set(addons || [])], qty: 1, unitMinor });
    }
    cartOpen = true;
    detailId = null;
    persist();
    render();
  }

  function changeQuantity(key, delta) {
    const line = cart.find((l) => l.key === key);
    if (!line) return;
    const next = clampQty(line.qty + delta);
    if (next < 1) {
      cart = cart.filter((l) => l.key !== key);
    } else {
      line.qty = next;
    }
    persist();
    render();
  }

  function removeLine(key) {
    cart = cart.filter((l) => l.key !== key);
    persist();
    render();
  }

  function toggleFavorite(id) {
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    persist();
    render();
  }

  function applyCoupon() {
    const input = findInOverlay('[data-coupon-input]');
    const code = String(input?.value || '').trim().toUpperCase();
    if (couponApplied) {
      couponApplied = false;
    } else if (code === FLOWERSELLER_COUPON.code) {
      couponApplied = true;
    } else {
      input?.setAttribute('data-coupon-status', 'invalid');
    }
    persist();
    render();
  }

  function openProduct(id, opener) {
    detailId = id;
    render();
    if (opener) openOverlay('detail', opener);
  }

  function openCart(opener) {
    cartOpen = true;
    render();
    if (opener) openOverlay('cart', opener);
  }

  function startCheckout(opener) {
    if (cart.length === 0) return;
    checkoutOpen = true;
    checkoutStep = 'delivery';
    checkoutSubmitted = false;
    cartOpen = false;
    detailId = null;
    render();
    if (opener) openOverlay('checkout', opener);
  }

  function finalizeCheckout() {
    if (checkoutSubmitted) return;
    if (cart.length === 0) return;
    const district = checkoutDraft.delivery.district || '';
    const slot = checkoutDraft.delivery.slot || '';
    const deliveryDate = checkoutDraft.delivery.date || '';
    const subtotal = subtotalMinor();
    const delivery = deliveryMinor();
    const discount = discountMinor();
    const total = Math.max(0, subtotal + delivery - discount);
    const id = uniqueOrderId();
    const order = {
      id, lines: cart.map((line) => ({ ...line })), subtotalMinor: subtotal, deliveryMinor: delivery, discountMinor: discount, totalMinor: total,
      status: 'Hazırlanıyor', createdAt: Date.now(), district, slot, deliveryDate,
    };
    orders = [order, ...orders].slice(0, MAX_OPEN_ORDERS);
    checkoutSubmitted = true;
    checkoutOpen = false;
    successId = id;
    cart = [];
    couponApplied = false;
    trackingId = id;
    persist();
    render();
  }

  function lookupTracking(raw) {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) return;
    const found = orders.find((o) => o.id.toUpperCase() === code);
    if (found) { trackingId = found.id; unknownTrackingId = ''; }
    else { unknownTrackingId = code; trackingId = null; }
    render();
  }

  function findInInstance(selector) {
    return container?.querySelector(selector) || null;
  }
  function findAllInInstance(selector) {
    return Array.from(container?.querySelectorAll(selector) || []);
  }
  function findInOverlay(selector) {
    const host = overlayHost && overlayHost.isConnected ? overlayHost : null;
    return host?.querySelector(selector) || null;
  }
  function findAllInOverlay(selector) {
    const host = overlayHost && overlayHost.isConnected ? overlayHost : null;
    return Array.from(host?.querySelectorAll(selector) || []);
  }

  function dialogRoot() {
    return findInOverlay('[role="dialog"][aria-modal="true"]');
  }

  function handleClick(event) {
    if (!ownTarget(event.target)) return;
    const target = event.target.closest('button,[data-modal-backdrop],[data-cart-backdrop],[data-remove]');
    if (!target) return;
    if (target.dataset.tab) {
      tab = target.dataset.tab; detailId = null; cartOpen = false; checkoutOpen = false; trackingId = null; unknownTrackingId = '';
      render(); return;
    }
    if (target.dataset.occasion) {
      occasion = occasion === target.dataset.occasion ? '' : target.dataset.occasion;
      render(); return;
    }
    if (target.dataset.category) {
      category = target.dataset.category === 'Tümü' ? 'Tümü' : target.dataset.category;
      category = target.dataset.category;
      render(); return;
    }
    if (target.dataset.clearSearch) { query = ''; render(); return; }
    if (target.dataset.scrollProducts) {
      const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      container?.querySelector(`#${instanceId}-products`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    if (target.dataset.product) { openProduct(target.dataset.product, target); return; }
    if (target.dataset.closeDetail !== undefined) { detailId = null; render(); return; }
    if (target.dataset.add) { addToCart(target.dataset.add, 'small', [], '', false); return; }
    if (target.dataset.addConfigured !== undefined) {
      if (!detailId) return;
      const variantId = findInOverlay('[data-size-option]:checked')?.value || 'small';
      const addons = findAllInOverlay('[data-addon]:checked').map((n) => n.dataset.addon);
      const message = findInOverlay('[data-card-message]')?.value || '';
      const anonymous = findInOverlay('[data-anonymous-sender]')?.checked || false;
      addToCart(detailId, variantId, addons, message, anonymous);
      return;
    }
    if (target.dataset.favorite) { toggleFavorite(target.dataset.favorite); return; }
    if (target.dataset.favoritesView !== undefined) { favoritesOnly = !favoritesOnly; render(); return; }
    if (target.dataset.filterTrigger !== undefined) { filtersOpen = !filtersOpen; render(); return; }
    if (target.dataset.resetFilters !== undefined) {
      category = 'Tümü'; occasion = ''; flowerType = 'Tümü'; favoritesOnly = false; query = '';
      filterState = { sameDay: false, colors: new Set(), minPrice: 0, maxPrice: 2000 };
      filtersOpen = false; render(); return;
    }
    if (target.dataset.applyFilters !== undefined) {
      filterState.sameDay = !!findInInstance('[data-filter-sameday]')?.checked;
      filterState.colors = new Set(findAllInInstance('[data-filter-color]:checked').map((x) => x.dataset.filterColor));
      filterState.minPrice = Math.max(0, Number(findInInstance(`#${instanceId}-filter-min`)?.value) || 0);
      filterState.maxPrice = Math.max(filterState.minPrice, Math.min(10000, Number(findInInstance(`#${instanceId}-filter-max`)?.value) || 10000));
      flowerType = findInInstance(`#${instanceId}-filter-type`)?.value || 'Tümü';
      filtersOpen = false;
      render();
      return;
    }
    if (target.dataset.cartBackdrop !== undefined && event.target === target) { cartOpen = false; render(); return; }
    if (target.dataset.modalBackdrop !== undefined && event.target === target) { detailId = null; render(); return; }
    if (target.dataset.closeCart !== undefined) { cartOpen = false; render(); return; }
    if (target.dataset.basket !== undefined) { openCart(target); return; }
    if (target.dataset.quantityIncrease) { changeQuantity(target.dataset.quantityIncrease, +1); return; }
    if (target.dataset.quantityDecrease) { changeQuantity(target.dataset.quantityDecrease, -1); return; }
    if (target.dataset.remove) { removeLine(target.dataset.remove); return; }
    if (target.dataset.applyCoupon !== undefined) { applyCoupon(); return; }
    if (target.dataset.startCheckout !== undefined) {
      if (cart.length === 0) return;
      startCheckout(target);
      return;
    }
    if (target.dataset.backCart !== undefined) { checkoutOpen = false; checkoutSubmitted = false; cartOpen = true; render(); return; }
    if (target.dataset.checkoutBack !== undefined) {
      const currentForm = target.closest('form[data-step-form]');
      captureCheckoutDraft(currentForm);
      const order = ['delivery', 'recipient', 'payment'];
      const idx = order.indexOf(checkoutStep);
      if (idx > 0) checkoutStep = order[idx - 1];
      render(); return;
    }
    if (target.dataset.checkoutStep !== undefined) {
      // Allow clicking completed steps only after the current step is validated.
      const order = ['delivery', 'recipient', 'payment'];
      const idx = order.indexOf(checkoutStep);
      const target_idx = order.indexOf(target.dataset.checkoutStep);
      if (target_idx <= idx) checkoutStep = target.dataset.checkoutStep;
      render(); return;
    }
    if (target.dataset.successOrders !== undefined) { successId = null; tab = 'orders'; trackingId = orders[0]?.id || null; render(); return; }
    if (target.dataset.successClose !== undefined) { successId = null; tab = 'store'; render(); return; }
    if (target.dataset.trackingLookup !== undefined) {
      const input = findInInstance(`#${instanceId}-tracking-input`);
      lookupTracking(input?.value);
      return;
    }
  }

  function handleChange(event) {
    if (!ownTarget(event.target)) return;
    const target = event.target;
    if (target.matches('[data-sort]')) {
      sort = target.value;
      render();
      return;
    }
    if (target.matches('[data-size-option]')) {
      const product = findFlowersellerProduct(detailId);
      if (!product) return;
      const variantId = target.value;
      const addons = findAllInOverlay('[data-addon]:checked').map((n) => n.dataset.addon);
      const unitMinor = flowersellerLineUnitMinor(product, variantId, addons);
      const priceNode = findInOverlay(`#${instanceId}-detail-price`);
      const labelNode = findInOverlay('[data-config-price-label]');
      if (priceNode) priceNode.textContent = flowersellerMoney(unitMinor);
      if (labelNode) labelNode.textContent = flowersellerMoney(unitMinor);
      return;
    }
    if (target.matches('[data-addon]')) {
      const product = findFlowersellerProduct(detailId);
      if (!product) return;
      const variantId = findInOverlay('[data-size-option]:checked')?.value || 'small';
      const addons = findAllInOverlay('[data-addon]:checked').map((n) => n.dataset.addon);
      const unitMinor = flowersellerLineUnitMinor(product, variantId, addons);
      const priceNode = findInOverlay(`#${instanceId}-detail-price`);
      const labelNode = findInOverlay('[data-config-price-label]');
      if (priceNode) priceNode.textContent = flowersellerMoney(unitMinor);
      if (labelNode) labelNode.textContent = flowersellerMoney(unitMinor);
      return;
    }
  }

  function handleInput(event) {
    if (!ownTarget(event.target)) return;
    if (event.target.matches('[data-search]')) {
      query = event.target.value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { searchTimer = 0; render(); }, SEARCH_DEBOUNCE_MS);
      return;
    }
    if (event.target.matches(`#${instanceId}-tracking-input`)) {
      unknownTrackingId = ''; // typing clears the "not found" hint
      // No re-render — preserve focus on the input.
    }
  }

  function captureCheckoutDraft(form) {
    if (!form) return;
    const value = (name) => form.elements[name]?.value || '';
    if (form.dataset.stepForm === 'delivery') {
      checkoutDraft.delivery = { address: value('address'), district: value('district'), slot: value('slot'), date: value('date') };
    } else if (form.dataset.stepForm === 'recipient') {
      checkoutDraft.recipient = { recipient: value('recipient'), phone: value('phone'), message: value('message'), anonymous: Boolean(form.elements.anonymous?.checked) };
    } else if (form.dataset.stepForm === 'payment') {
      checkoutDraft.payment = { method: form.elements.demoMethod?.value || 'demo' };
    }
  }

  function handleSubmit(event) {
    if (!ownTarget(event.target)) return;
    const form = event.target.closest('form[data-step-form]');
    if (!form) return;
    event.preventDefault();
    const step = form.dataset.stepForm;
    captureCheckoutDraft(form);
    if (step === 'delivery') {
      const ok = form.checkValidity();
      if (!ok) { form.reportValidity(); return; }
      checkoutStep = 'recipient'; render(); return;
    }
    if (step === 'recipient') {
      const ok = form.checkValidity();
      if (!ok) { form.reportValidity(); return; }
      checkoutStep = 'payment'; render(); return;
    }
    if (step === 'payment') {
      const ok = form.checkValidity();
      if (!ok) { form.reportValidity(); return; }
      finalizeCheckout();
      return;
    }
  }

  function trapFocusInDialog(event) {
    if (!activeDialog) return;
    const dialog = dialogRoot();
    if (!dialog) return;
    if (event.key !== 'Tab') return;
    const focusables = [...dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { last.focus({ preventScroll: true }); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first.focus({ preventScroll: true }); event.preventDefault(); }
  }

  function keyboardTargetBelongsToInstance(event) {
    if (ownTarget(event.target)) return true;
    const windowRoot = container?.closest?.('.az-window');
    if (event.key === 'Escape' && activeDialog && windowRoot?.contains(event.target)) return true;
    if (event.key !== 'Escape' || !activeDialog || !dialogRoot()) return false;
    const body = typeof document !== 'undefined' ? document.body : null;
    if (!body || (event.target !== body && event.target !== document.documentElement)) return false;
    const hosts = [...body.children].filter((node) => node?.dataset?.fsOverlayHost);
    return hosts.at(-1) === overlayHost;
  }

  function handleKeydown(event) {
    if (!keyboardTargetBelongsToInstance(event)) return;
    if (event.key === 'Escape' && activeDialog) {
      if (successId) { successId = null; render(); return; }
      if (checkoutOpen) { checkoutOpen = false; checkoutSubmitted = false; render(); return; }
      if (cartOpen) { cartOpen = false; render(); return; }
      if (detailId) { detailId = null; render(); return; }
    }
    if (activeDialog) trapFocusInDialog(event);
  }

  // Flowerseller mounts one instance per window. We attach delegated listeners to document.body
  // because the cart drawer + dialogs live in a separate overlay host appended to body. We
  // guard every handler against targets that don't belong to this mount instance.
  function ownTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    if (container && container.dataset.fsMounted === instanceId) {
      if (container && container.contains(target)) return true;
      const overlay = overlayHost && overlayHost.isConnected ? overlayHost : null;
      if (overlay && overlay.contains(target)) return true;
    }
    return false;
  }

  function mount(root) {
    container = root;
    instanceId = `fs-${Math.random().toString(36).slice(2, 8)}`;
    container.dataset.fsMounted = instanceId;
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = 0; }
    listeners.click = handleClick;
    listeners.input = handleInput;
    listeners.change = handleChange;
    listeners.keydown = handleKeydown;
    listeners.submit = handleSubmit;
    const doc = (typeof document !== 'undefined') ? document : null;
    if (doc) {
      doc.body.addEventListener('click', listeners.click);
      doc.body.addEventListener('input', listeners.input);
      doc.body.addEventListener('change', listeners.change);
      doc.body.addEventListener('keydown', listeners.keydown);
      doc.body.addEventListener('submit', listeners.submit);
    }
    render();
    const mountedOverlayHost = overlayHost;
    mountedOverlayHost?.addEventListener('keydown', listeners.keydown);
    return {
      cleanup() {
        if (searchTimer) { clearTimeout(searchTimer); searchTimer = 0; }
        if (focusFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(focusFrame);
        focusFrame = 0;
        overlayHost?.removeEventListener('keydown', listeners.keydown);
        const doc = (typeof document !== 'undefined') ? document : null;
        if (doc) {
          for (const [key, fn] of Object.entries(listeners)) {
            if (fn) doc.body.removeEventListener(key === 'click' ? 'click' : key === 'input' ? 'input' : key === 'change' ? 'change' : key === 'keydown' ? 'keydown' : 'submit', fn);
          }
        }
        listeners = { click: null, input: null, change: null, keydown: null, submit: null };
        while (scrollLockCount > 0) unlockScroll();
        activeDialog = null;
        if (typeof document !== 'undefined' && document.body) delete document.body.dataset.fsScrollLocked;
        setInert(false);
        clearOverlayHost();
        if (container) {
          delete container.dataset.fsMounted;
          container.replaceChildren();
        }
        container = null;
      },
    };
  }

  // Public read-only inspection for tests.
  function _debugState() {
    return { cart, favorites: Array.from(favorites), orders, couponApplied, instanceId };
  }

  return { mount, _debugState };
}
