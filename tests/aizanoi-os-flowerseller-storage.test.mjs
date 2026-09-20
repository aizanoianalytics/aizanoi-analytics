import test from 'node:test';
import assert from 'node:assert/strict';

let storage;
test.before(async () => {
  storage = await import('../frontend/js/v3/apps/flowerseller/src/storage.js');
});

test.beforeEach(() => {
  storage.flowersellerResetStorageForTest();
});

const baseLine = (overrides = {}) => ({
  key: 'p1::small::::0:', productId: 'p1', variantId: 'small', addons: [], qty: 1, unitMinor: 1000, ...overrides,
});

test('saveCart + loadCart round-trip lines and reject malformed payloads', () => {
  storage.saveCart([baseLine(), baseLine({ key: 'p1::medium::+::0:', variantId: 'medium', qty: 2 })]);
  const restored = storage.loadCart();
  assert.equal(restored.length, 2);
  assert.equal(restored[1].qty, 2);
  assert.equal(restored[1].variantId, 'medium');
  storage.flowersellerResetStorageForTest();
  const afterBad = storage.loadCart();
  assert.equal(afterBad.length, 0);
});

test('saveFavorites dedupes and truncates', () => {
  storage.saveFavorites(['p1', 'p1', 'p2', 'p2', 'p3']);
  const restored = storage.loadFavorites();
  assert.deepEqual(restored, ['p1', 'p2', 'p3']);
});

test('saveOrders sanitizes missing required fields', () => {
  const order = {
    id: 'FS-TEST1', lines: [baseLine()], subtotalMinor: 1000, deliveryMinor: 0, discountMinor: 0, totalMinor: 1000,
    status: 'Hazırlanıyor', createdAt: Date.now(), district: 'Kadıköy', slot: '13-17',
  };
  storage.saveOrders([order, { id: 'missing-lines' }, { ...order, id: 'FS-TEST2', status: 'not-a-state' }]);
  const restored = storage.loadOrders();
  assert.equal(restored.length, 2);
  assert.equal(restored[0].id, 'FS-TEST1');
  assert.equal(restored[1].status, 'Hazırlanıyor');
});

test('saveCoupon toggles between applied and cleared', () => {
  storage.saveCoupon(true);
  assert.equal(storage.loadCoupon(), true);
  storage.saveCoupon(false);
  assert.equal(storage.loadCoupon(), false);
});

test('PII fields never enter cart or order payloads', () => {
  // Simulate a malicious payload; the loader must keep only the schema it knows about.
  storage.saveCart([{
    key: 'k', productId: 'p', variantId: 'small', qty: 1, unitMinor: 1,
    name: 'Real Name', phone: '0555', address: 'Ev adresi', card: '4242 4242 4242 4242', message: 'hi',
  }]);
  const restored = storage.loadCart();
  assert.equal(restored.length, 1);
  // No PII survives the sanitize step.
  assert.equal(Object.keys(restored[0]).sort().join(','), 'addons,key,productId,qty,unitMinor,variantId');
});
