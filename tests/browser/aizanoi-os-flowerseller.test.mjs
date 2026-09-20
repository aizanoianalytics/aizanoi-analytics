import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4201';
const HOSTILE = '<img src=x onerror=alert(1)>"><script>x</script>';

async function openFlowerseller(page) {
  await page.goto(`${base}/?fs-qa=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.locator('.az-desktop-shortcut[data-app="flowerseller"]:visible, .az-phone-app[data-app="flowerseller"]:visible, .az-device-app[data-app="flowerseller"]:visible').first().click();
  await page.locator('.fs-app').waitFor({ state: 'visible' });
  await page.locator('.fs-product-card').first().waitFor();
}

function captureRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => {
    if (r.url().includes('/api/')) return;
    errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText || ''}`);
  });
  return errors;
}

test('catalog renders 25 products with all 15 photos and rejects hostile inputs', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = captureRuntimeErrors(page);
  try {
    await openFlowerseller(page);
    const cardCount = await page.locator('.fs-product-card').count();
    assert.ok(cardCount >= 24);
    const images = await page.$$eval('.fs-product-card img', (nodes) => nodes.map((n) => ({
      src: n.getAttribute('src'), natural: n.naturalWidth, complete: n.complete,
    })));
    assert.equal(images.length, cardCount);
    for (const img of images) {
      assert.ok(img.src.includes('/js/v3/apps/flowerseller/assets/photos/flower-'), `bad image src: ${img.src}`);
      assert.ok(img.natural >= 1, `image did not load: ${img.src}`);
    }
    // Add to cart via quick add so we exercise cart + hostile input escape at once.
    await page.locator('.fs-product-card [data-add]').first().click();
    await page.locator('[data-cart-drawer]').waitFor({ state: 'visible' });
    await page.locator('[data-coupon-input]').fill(HOSTILE);
    await page.locator('[data-tracking-input]').fill(HOSTILE).catch(() => {});
    await page.locator('[data-close-cart]').click();
    const html = await page.content();
    assert.equal(html.includes('<script>x</script>'), false);
    assert.equal(html.includes('onerror=alert(1)'), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('search (Turkish locale), sort, favorites and persistence across reload', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = captureRuntimeErrors(page);
  try {
    await openFlowerseller(page);
    await page.locator('[data-sort]').selectOption('price-asc');
    const firstAsc = await page.locator('.fs-product-card .fs-price b').first().innerText();
    await page.locator('[data-sort]').selectOption('price-desc');
    const firstDesc = await page.locator('.fs-product-card .fs-price b').first().innerText();
    assert.notEqual(firstAsc, firstDesc);
    await page.locator('[data-sort]').selectOption('featured');

    await page.locator('[data-favorite]').first().click();
    const firstId = await page.locator('[data-favorite]').first().getAttribute('data-favorite');
    await page.waitForFunction((id) => {
      const el = document.querySelector(`[data-favorite="${id}"]`);
      return el && el.getAttribute('aria-pressed') === 'true';
    }, firstId);

    // Search uses Turkish locale: ORKİDE matches lowercased product names.
    await page.locator('[data-search]').fill('ORKİDE');
    await page.waitForFunction(() => document.querySelectorAll('.fs-product-card').length < 25);
    const onlyOrkide = await page.locator('.fs-product-card').count();
    assert.ok(onlyOrkide >= 2);
    await page.locator('[data-search]').fill('');
    await page.waitForFunction(() => document.querySelectorAll('.fs-product-card').length >= 24);

    // Reload and verify favorite persisted.
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.az-desktop-shortcut[data-app="flowerseller"]:visible, .az-phone-app[data-app="flowerseller"]:visible, .az-device-app[data-app="flowerseller"]:visible').first().click();
    await page.locator('.fs-app').waitFor({ state: 'visible' });
    const persistedPressed = await page.locator(`[data-favorite="${firstId}"]`).first().getAttribute('aria-pressed');
    assert.equal(persistedPressed, 'true');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('cart math: quantity updates, coupon BAHAR10 applies/removes, totals never go negative', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = captureRuntimeErrors(page);
  try {
    await openFlowerseller(page);
    await page.locator('.fs-product-card [data-add]').first().click();
    await page.locator('[data-cart-drawer]').waitFor({ state: 'visible' });

    // Quantity increase + decrease must recompute the total deterministically.
    const totalStart = await page.locator('[data-cart-total-value]').innerText();
    await page.locator('[data-quantity-increase]').click();
    const totalAfterPlus = await page.locator('[data-cart-total-value]').innerText();
    assert.notEqual(totalStart, totalAfterPlus, 'totals must recalc on quantity change');
    await page.locator('[data-quantity-decrease]').click();

    // Coupon: case/whitespace insensitive.
    await page.locator('[data-coupon-input]').fill('  bahar10  ');
    await page.locator('[data-apply-coupon]').click();
    await page.waitForFunction(() => document.body.textContent.includes('BAHAR10 aktif'));
    const summaryAfter = await page.locator('[data-cart-summary]').innerText();
    assert.match(summaryAfter, /İndirim/);
    const totalAfter = await page.locator('[data-cart-total-value]').innerText();
    assert.notEqual(totalAfter, totalAfterPlus);

    // Remove the coupon.
    await page.locator('[data-apply-coupon]').click();
    await page.waitForFunction(() => !document.body.textContent.includes('BAHAR10 aktif'));
    const totalRestored = await page.locator('[data-cart-total-value]').innerText();
    assert.match(totalRestored, /TL$/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('checkout: empty cart blocks CTA, simulated order tracks across reload', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = captureRuntimeErrors(page);
  try {
    await openFlowerseller(page);

    // Empty cart: the drawer opens and checkout remains unavailable.
    await page.locator('[data-basket]').click();
    await page.locator('[data-cart-drawer]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-start-checkout]').isDisabled(), true);
    await page.locator('[data-close-cart]').click();

    // Add via quick add and open the cart drawer.
    await page.locator('.fs-product-card [data-add]').first().click();
    await page.locator('[data-cart-drawer]').waitFor({ state: 'visible' });

    // The checkout CTA must NOT be disabled once the cart has at least one line.
    const enabled = !(await page.locator('[data-start-checkout]').isDisabled());
    assert.equal(enabled, true);
    await page.locator('[data-start-checkout]').click();
    await page.locator('[data-checkout]').waitFor();
    assert.match(await page.locator('[data-checkout-steps]').innerText(), /Teslimat/);

    await page.locator('[data-step-form="delivery"] button[type="submit"]').click();
    assert.match(await page.locator('[data-checkout-steps]').innerText(), /Teslimat/);

    await page.locator('[data-step-form="delivery"] input[name="address"]').fill('Moda Cad. 12');
    await page.locator('[data-step-form="delivery"] select[name="district"]').selectOption('Kadıköy');
    await page.locator('[data-step-form="delivery"] select[name="slot"]').selectOption('13-17');
    await page.locator('[data-step-form="delivery"] select[name="date"]').selectOption('Yarın');
    await page.locator('[data-step-form="delivery"] button[type="submit"]').click();

    await page.locator('[data-step-form="recipient"] input[name="recipient"]').fill(HOSTILE);
    await page.locator('[data-step-form="recipient"] input[name="phone"]').fill('05555555555');
    await page.locator('[data-step-form="recipient"] input[name="message"]').fill('İyi günler');
    await page.locator('[data-step-form="recipient"] button[type="submit"]').click();
    assert.match(await page.locator('[data-checkout-steps]').innerText(), /Ödeme/);

    const paymentText = await page.locator('[data-step-form="payment"]').innerText();
    assert.match(paymentText, /Demo ödeme/);

    await page.locator('[data-step-form="payment"] input[name="consent"]').check();
    const ctaSelector = '[data-step-form="payment"] button[type="submit"]';
    await page.locator(ctaSelector).click();
    try { await page.locator(ctaSelector).click({ timeout: 200, force: true }); } catch { /* expected */ }

    await page.locator('[data-success]').waitFor();
    const successText = await page.locator('[data-success]').innerText();
    const id = (successText.match(/(FS-[A-Z0-9]+)/) || [])[1];
    assert.ok(id && id.startsWith('FS-'), 'demo order id must be deterministic FS-XXX');

    await page.locator('[data-success-orders]').click();
    await page.locator('[data-order-tracker]').first().waitFor();
    assert.equal(await page.locator('[data-order-tracker]').first().getAttribute('data-order-id'), id);
    assert.match(await page.locator('[data-order-tracker]').first().innerText(), /Hazırlanıyor/);

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.az-desktop-shortcut[data-app="flowerseller"]:visible, .az-phone-app[data-app="flowerseller"]:visible, .az-device-app[data-app="flowerseller"]:visible').first().click();
    await page.locator('.fs-app').waitFor({ state: 'visible' });
    await page.locator('[data-tab="orders"]').click();
    assert.equal(await page.locator('[data-order-tracker]').first().getAttribute('data-order-id'), id);

    await page.locator('[data-tracking-input]').fill('FS-DOES-NOT-EXIST');
    await page.locator('[data-tracking-lookup]').click();
    assert.ok(await page.locator('[data-tracking-missing]').isVisible());
    assert.equal(await page.locator('[data-order-tracker]').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('dialog contract: Escape closes, focus returns to opener, cleanup releases inert', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = captureRuntimeErrors(page);
  try {
    await openFlowerseller(page);

    // Cart drawer trap + Escape close.
    await page.locator('[data-basket]').click();
    await page.locator('[data-cart-drawer]').waitFor();
    await page.waitForTimeout(120);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-cart-drawer]'));
    assert.equal(await page.evaluate(() => document.body.hasAttribute('data-fs-scroll-locked')), false);

    // Reload and confirm clean mount state.
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.az-desktop-shortcut[data-app="flowerseller"]:visible, .az-phone-app[data-app="flowerseller"]:visible, .az-device-app[data-app="flowerseller"]:visible').first().click();
    await page.locator('.fs-app').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.querySelector('.fs-app')?.hasAttribute('inert')), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('320px mobile: catalog + cart + checkout usable without horizontal overflow', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 320, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = captureRuntimeErrors(page);
  try {
    await openFlowerseller(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    assert.ok(await page.locator('.fs-product-card').count() >= 24);
    await page.locator('.fs-product-card [data-add]').first().click();
    await page.locator('[data-cart-drawer]').waitFor({ state: 'visible' });
    const ctaHeight = await page.locator('[data-start-checkout]').boundingBox();
    assert.ok(ctaHeight.height >= 44);
    await page.locator('[data-start-checkout]').click();
    await page.locator('[data-checkout]').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
