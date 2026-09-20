// Browser-local persistence for Flowerseller.
// Versioned namespaced keys, defensive parse, PII-free schema.
// We never persist addresses, phone numbers, recipient names, payment details or notes.
//
// In Node tests (where `window` does not exist) we fall back to an in-memory shim so the
// module can be exercised without a browser. The shim is only constructed when no real
// storage is available.

const NAMESPACE = 'aizanoi.flowerseller.v1';
const KEY_CART = `${NAMESPACE}.cart`;
const KEY_FAVORITES = `${NAMESPACE}.favorites`;
const KEY_ORDERS = `${NAMESPACE}.orders`;
const KEY_COUPON = `${NAMESPACE}.coupon`;
const SCHEMA_VERSION = 1;

const MAX_CART_LINES = 100;
const MAX_LINE_QTY = 99;
const MAX_ORDERS = 30;
const MAX_FAVORITES = 200;
const MAX_COUPON_CODE_LEN = 32;

class MemoryShim {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

function safeStorage() {
  if (typeof globalThis !== 'undefined') {
    if (globalThis.localStorage && typeof globalThis.localStorage.setItem === 'function') return globalThis.localStorage;
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') return window.localStorage;
  }
  if (!safeStorage._shim) safeStorage._shim = new MemoryShim();
  return safeStorage._shim;
}

let storage = null;
function getStorage() {
  if (storage !== null) return storage;
  storage = safeStorage();
  return storage;
}

// Test seam: when a Node test wants a fresh shim per test, it calls this.
export function flowersellerResetStorageForTest() {
  storage = null;
  safeStorage._shim = null;
}

function readJSON(key) {
  const s = getStorage();
  if (!s) return null;
  const raw = s.getItem(key);
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function writeJSON(key, value) {
  const s = getStorage();
  if (!s) return;
  try { s.setItem(key, JSON.stringify(value)); }
  catch { /* quota or denied — silently drop; app keeps working */ }
}

function dropKey(key) {
  const s = getStorage();
  if (!s) return;
  try { s.removeItem(key); } catch { /* ignore */ }
}

function sanitizeCartLine(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const key = typeof raw.key === 'string' ? raw.key.slice(0, 200) : null;
  const productId = typeof raw.productId === 'string' ? raw.productId.slice(0, 64) : null;
  const variantId = typeof raw.variantId === 'string' && raw.variantId.length <= 24 ? raw.variantId : 'small';
  const addons = Array.isArray(raw.addons) ? raw.addons.filter((a) => typeof a === 'string' && a.length <= 24) : [];
  const qty = Math.max(0, Math.min(MAX_LINE_QTY, Number(raw.qty) || 0));
  const unitMinor = Math.max(0, Number(raw.unitMinor) || 0);
  if (!key || !productId || qty < 1 || unitMinor < 1) return null;
  return { key, productId, variantId, addons, qty, unitMinor };
}

export function loadCart() {
  const payload = readJSON(KEY_CART);
  if (!payload || payload.v !== SCHEMA_VERSION || !Array.isArray(payload.lines)) return [];
  const seen = new Set();
  const lines = [];
  for (const candidate of payload.lines) {
    const clean = sanitizeCartLine(candidate);
    if (!clean) continue;
    if (seen.has(clean.key)) continue;
    seen.add(clean.key);
    lines.push(clean);
    if (lines.length >= MAX_CART_LINES) break;
  }
  return lines;
}

export function saveCart(lines) {
  if (!Array.isArray(lines) || lines.length === 0) { dropKey(KEY_CART); return; }
  const cleaned = [];
  const seen = new Set();
  for (const candidate of lines) {
    const clean = sanitizeCartLine(candidate);
    if (!clean || seen.has(clean.key)) continue;
    seen.add(clean.key);
    cleaned.push(clean);
    if (cleaned.length >= MAX_CART_LINES) break;
  }
  writeJSON(KEY_CART, { v: SCHEMA_VERSION, lines: cleaned });
}

export function loadFavorites() {
  const payload = readJSON(KEY_FAVORITES);
  if (!payload || payload.v !== SCHEMA_VERSION || !Array.isArray(payload.ids)) return [];
  return payload.ids
    .filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 64)
    .slice(0, MAX_FAVORITES);
}

export function saveFavorites(ids) {
  if (!Array.isArray(ids) || ids.length === 0) { dropKey(KEY_FAVORITES); return; }
  const cleaned = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 64))).slice(0, MAX_FAVORITES);
  if (cleaned.length === 0) { dropKey(KEY_FAVORITES); return; }
  writeJSON(KEY_FAVORITES, { v: SCHEMA_VERSION, ids: cleaned });
}

const ORDER_STATUSES = Object.freeze(['Hazırlanıyor', 'Yola çıktı', 'Teslim edildi']);

function sanitizeOrder(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.slice(0, 32) : null;
  if (!id) return null;
  const lines = Array.isArray(raw.lines)
    ? raw.lines.map(sanitizeCartLine).filter(Boolean).slice(0, MAX_CART_LINES)
    : [];
  if (lines.length === 0) return null;
  const subtotalMinor = Math.max(0, Number(raw.subtotalMinor) || 0);
  const deliveryMinor = Math.max(0, Math.min(200000, Number(raw.deliveryMinor) || 0));
  const discountMinor = Math.max(0, Math.min(subtotalMinor, Number(raw.discountMinor) || 0));
  const totalMinor = Math.max(0, subtotalMinor + deliveryMinor - discountMinor);
  const status = ORDER_STATUSES.includes(raw.status) ? raw.status : 'Hazırlanıyor';
  const createdAt = Math.max(0, Number(raw.createdAt) || Date.now());
  const district = typeof raw.district === 'string' ? raw.district.slice(0, 40) : '';
  const slot = typeof raw.slot === 'string' ? raw.slot.slice(0, 24) : '';
  return { id, lines, subtotalMinor, deliveryMinor, discountMinor, totalMinor, status, createdAt, district, slot };
}

export function loadOrders() {
  const payload = readJSON(KEY_ORDERS);
  if (!payload || payload.v !== SCHEMA_VERSION || !Array.isArray(payload.orders)) return [];
  return payload.orders.map(sanitizeOrder).filter(Boolean).slice(0, MAX_ORDERS);
}

export function saveOrders(orders) {
  if (!Array.isArray(orders) || orders.length === 0) { dropKey(KEY_ORDERS); return; }
  const cleaned = orders.map(sanitizeOrder).filter(Boolean).slice(0, MAX_ORDERS);
  if (cleaned.length === 0) { dropKey(KEY_ORDERS); return; }
  writeJSON(KEY_ORDERS, { v: SCHEMA_VERSION, orders: cleaned });
}

export function loadCoupon() {
  const payload = readJSON(KEY_COUPON);
  if (!payload || payload.v !== SCHEMA_VERSION) return false;
  const code = typeof payload.code === 'string' ? payload.code.slice(0, MAX_COUPON_CODE_LEN) : '';
  return Boolean(payload.applied) && code.length > 0;
}

export function saveCoupon(applied) {
  if (!applied) { dropKey(KEY_COUPON); return; }
  writeJSON(KEY_COUPON, { v: SCHEMA_VERSION, applied: true, code: 'BAHAR10' });
}

export function flowersellerStorageAvailable() {
  return Boolean(storage);
}

// Test seam: lets a test inspect the resolved storage without breaking encapsulation.
export function flowersellerStorageForTest() {
  return storage;
}
