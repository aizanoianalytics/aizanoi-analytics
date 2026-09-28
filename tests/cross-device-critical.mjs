/**
 * Minimal cross-device critical smoke.
 *
 * The routine browser job stays small: this adds only the device classes the
 * repository contract requires (desktop, tablet, mobile) and proves the shell
 * presents and navigates in each. It deliberately does NOT duplicate the deep
 * per-app browser suites — those are owned by the scheduled Full QA workflow.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const engine = process.env.AIZANOI_BROWSER || 'chromium';
const browser = await chromium.launch({ headless: true });

/** Collect fatal page errors and horizontal overflow for a page. */
function watch(page, errors) {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return async () => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    return overflow;
  };
}

try {
  // ------------------------------------------------------------------ mobile
  {
    const errors = [];
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const overflowOf = watch(page, errors);
    try {
      const response = await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 30000 });
      assert.ok(response?.ok(), `${engine} mobile home: HTTP ${response?.status()}`);

      // Mobile home presents.
      await page.locator('.az-phone-home').waitFor({ state: 'visible', timeout: 15000 });

      // The app grid is usable: at least one real core app is present and tappable.
      const apps = await page.locator('.az-phone-app').count();
      assert.ok(apps > 0, `${engine} mobile: app grid rendered no apps`);
      assert.ok(
        await page.locator('.az-task-shelf').isVisible(),
        `${engine} mobile: bottom dock must be present`,
      );

      // A core app opens into a fullscreen-equivalent surface.
      await page.evaluate(() => window.AIZANOI_OS.openApp('news'));
      await page.locator('.az-window[data-app-id="news"].is-active').waitFor({ state: 'visible', timeout: 15000 });
      const fullscreen = await page.locator('.az-window[data-app-id="news"].is-active').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.6;
      });
      assert.ok(fullscreen, `${engine} mobile: app must open as a fullscreen-equivalent surface`);

      const overflow = await overflowOf();
      assert.ok(overflow <= 1, `${engine} mobile: horizontal overflow ${overflow}px`);
      assert.deepEqual(errors, [], `${engine} mobile: ${errors.join(' | ')}`);
      console.log(`${engine}: mobile critical smoke passed (390x844, ${apps} apps)`);
    } finally {
      await context.close();
    }
  }

  // ------------------------------------------------------------------ tablet
  {
    const errors = [];
    const context = await browser.newContext({
      viewport: { width: 834, height: 1112 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const overflowOf = watch(page, errors);
    try {
      const response = await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 30000 });
      assert.ok(response?.ok(), `${engine} tablet home: HTTP ${response?.status()}`);

      // Tablet presentation initializes (touch-first two-pane home).
      await page.locator('.az-tablet-home').waitFor({ state: 'visible', timeout: 15000 });

      // Primary application navigation is usable.
      const tabletApps = await page.locator('.az-tablet-app').count();
      assert.ok(tabletApps > 0, `${engine} tablet: tablet app targets must render`);
      await page.evaluate(() => window.AIZANOI_OS.openApp('analytics'));
      await page.locator('.az-window[data-app-id="analytics"].is-active').waitFor({ state: 'visible', timeout: 15000 });

      const overflow = await overflowOf();
      assert.ok(overflow <= 1, `${engine} tablet: horizontal overflow ${overflow}px`);
      assert.deepEqual(errors, [], `${engine} tablet: ${errors.join(' | ')}`);
      console.log(`${engine}: tablet critical smoke passed (834x1112, ${tabletApps} app targets)`);
    } finally {
      await context.close();
    }
  }

  // ----------------------------------------------------------------- desktop
  {
    const errors = [];
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const overflowOf = watch(page, errors);
    try {
      const response = await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 30000 });
      assert.ok(response?.ok(), `${engine} desktop home: HTTP ${response?.status()}`);

      await page.locator('.az-desktop').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(() => Boolean(window.AIZANOI_OS));

      // Primary app/navigation path works.
      await page.evaluate(() => window.AIZANOI_OS.openApp('analytics'));
      await page.locator('.az-window[data-app-id="analytics"].is-active').waitFor({ state: 'visible', timeout: 15000 });

      const overflow = await overflowOf();
      assert.ok(overflow <= 1, `${engine} desktop: horizontal overflow ${overflow}px`);
      assert.deepEqual(errors, [], `${engine} desktop: ${errors.join(' | ')}`);
      console.log(`${engine}: desktop critical smoke passed (1280x800)`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
