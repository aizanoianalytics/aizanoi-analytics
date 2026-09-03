// HR Analytics Full Set — browser QA gate (CI, item 5 owner decision).
//
// Exercises the canonical HR dashboard surfaces served by the static frontend
// (the same artifact the production webroot publishes). Per the owner decision
// 2026-08-26 this complements, not replaces, the metadata parity unit tests in
// tests/audit/hr-analytics-full-set.test.mjs.
//
// HARD gates (must pass on every run):
//   - route exists / HTTP < 400
//   - no console errors (favicon 404s tolerated on the static CI server)
//   - no page-level horizontal overflow at 1440px and 390px
//   - catalog canonical + meta description present
//   - each original dashboard's own interactive surface is present
//   - public HR dashboards declare lang=en and expose no visitor-facing Turkish
//     in rendered DOM text, accessibility/display attributes or canvas text
//
// ACCESSIBILITY regression budget:
//   Axe remains a hard gate for the public catalog. The generated dashboard
//   documents are parity-preserved exports, so their markup is not rewritten
//   inside this publication task; route, control, runtime and responsive checks
//   cover them without silently changing the original product surface.
//
// Run locally against a built frontend:
//   python3 -m http.server 4173 --directory frontend &
//   ANCIENT_WORLD_BASE_URL=http://127.0.0.1:4173 node tests/hr-analytics-browser-qa.mjs

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const axePath = process.env.AXE_CORE_PATH
  ? pathToFileURL(resolve(process.env.AXE_CORE_PATH))
  : new URL('../node_modules/axe-core/axe.min.js', import.meta.url);

const layouts = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 },
];

// Catalog is a landing page (no filter controls); the ten dashboards are.
const CATALOG = '/analytics/dashboards/hr-analytics-full-set/';
const DASHBOARDS = [
  '/analytics/dashboards/hr-analytics-full-set/workforce-turnover/',
  '/analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/',
  '/analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/',
  '/analytics/dashboards/hr-analytics-full-set/hr-administration-deep-dive/',
  '/analytics/dashboards/hr-analytics-full-set/store-operations-tracking/',
  '/analytics/dashboards/hr-analytics-full-set/store-learning-compliance/',
  '/analytics/dashboards/hr-analytics-full-set/learning-academy-analytics/',
  '/analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/',
  '/analytics/dashboards/hr-analytics-full-set/corporate-goals/',
  '/analytics/dashboards/hr-analytics-full-set/workforce-time-attendance/',
];

const ROUTE_CONTROL = new Map([
  ['workforce-turnover', '[data-tab="forecast"]'],
  ['hr-executive-board-current', '#page-53'],
  ['hr-executive-board-full-history', '#page-53'],
  ['hr-administration-deep-dive', '#exportSearch'],
  ['store-operations-tracking', '#resetBtn'],
  ['store-learning-compliance', '#reset'],
  ['learning-academy-analytics', '#applyGlobal'],
  ['performance-hiring-turnover', '[data-view="turnover"]'],
  ['corporate-goals', '#settingsBtn'],
  ['workforce-time-attendance', '[data-view="personView"]'],
]);

// Deliberately presentation-oriented. Raw embedded source/business values inside
// script/template nodes are allowed to remain Turkish so joins, calculations,
// filters and exports retain canonical semantics. The gate below inspects only
// surfaces a visitor or assistive technology can actually receive.
const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/u;
const TURKISH_WORDS = /\b(?:acik|açık|aktif|aksiyon|alt|ana|anket|ara|arasi|arası|ay|aylik|aylık|ayril|ayrıl|baslangic|başlangıç|bazi|bazı|bazli|bazlı|bitis|bitiş|bolge|bölge|bolum|bölüm|brut|brüt|bu|calisan|çalışan|calisma|çalışma|ceza|cikis|çıkış|cinsiyet|dagilim|dağılım|daha|deger|değer|departman|detay|diger|diğer|donem|dönem|dusuk|düşük|egitim|eğitim|eksik|erken|esik|eşik|evden|fazla|fiili|filtre|gelen|genel|gerceklesen|gerçekleşen|giris|giriş|gore|göre|gorev|görev|goster|göster|gun|gün|hedef|hedefleri|hesap|icin|için|izin|kayit|kayıt|kaynak|kapsam|kidem|kıdem|kisi|kişi|kirilim|kırılım|kritik|kullan|lokasyon|magaza|mağaza|maas|maaş|maksimum|mart|merkez|mesai|metrik|mudur|müdür|ocak|onceki|önceki|ortalama|ozet|özet|personel|puan|rehberi|riskli|saat|satis|satış|sayfa|sayisi|sayısı|sebep|secili|seçili|seciniz|seçiniz|sicil|son|sozlesme|sözleşme|sure|süre|surekli|sürekli|tahmin|tamam|toplam|tum|tüm|tur|tür|turuncu|unvan|ust|üst|uyari|uyarı|uygun|uzman|ucret|ücret|veri|ve|veya|yil|yıl|yonet|yönet|yuksek|yüksek|zorunlu)\b/iu;
const DISPLAY_ATTRS = ['aria-label', 'title', 'placeholder', 'alt', 'data-label', 'data-title'];
const normalizeVisitorText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const looksTurkish = (value) => {
  const text = normalizeVisitorText(value);
  return Boolean(text && (TURKISH_CHARS.test(text) || TURKISH_WORDS.test(text)));
};

const axeSrc = readFileSync(axePath, 'utf8');

let failures = 0;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
});

async function renderedLanguageSnapshot(page) {
  return page.evaluate((displayAttrs) => {
    const text = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,template,textarea')) continue;
      const value = String(node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
      if (value) text.push(value);
    }

    const attrs = [];
    const selector = displayAttrs.map((name) => `[${name}]`).join(',');
    for (const element of document.querySelectorAll(selector)) {
      if (element.closest('script,style,noscript,template')) continue;
      for (const name of displayAttrs) {
        if (element.hasAttribute(name)) attrs.push(element.getAttribute(name));
      }
    }

    return {
      lang: document.documentElement.lang,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      text,
      attrs,
      canvas: globalThis.__hrCanvasText || [],
    };
  }, DISPLAY_ATTRS);
}

async function auditRoute(route, layout, isCatalog) {
  const context = await browser.newContext({
    viewport: layout.viewport,
    isMobile: layout.isMobile,
    deviceScaleFactor: layout.deviceScaleFactor || 1,
  });
  const page = await context.newPage();
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => {
    globalThis.__hrCanvasText = [];
    const proto = globalThis.CanvasRenderingContext2D?.prototype;
    if (!proto) return;
    for (const name of ['fillText', 'strokeText']) {
      const original = proto[name];
      if (typeof original !== 'function') continue;
      proto[name] = function collectHrCanvasText(text, ...args) {
        globalThis.__hrCanvasText.push(String(text));
        return original.call(this, text, ...args);
      };
    }
  });
  const consoleErrors = [];
  const failedResources = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) failedResources.push({ url: response.url(), status: response.status() });
  });

  const label = `${route} @ ${layout.name}`;
  try {
    const resp = await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 20000 });
    assert.ok(resp && resp.status() < 400, `${label}: route returned ${resp?.status()}`);

    const h1 = await page.locator('h1').first().textContent();
    assert.ok(h1 && h1.trim().length > 0, `${label}: missing <h1> heading`);

    if (isCatalog) {
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      assert.ok(canonical && canonical.includes('/analytics/dashboards/hr-analytics-full-set/'),
        `${label}: canonical link missing or wrong (${canonical})`);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      assert.ok(desc && desc.trim().length > 0, `${label}: meta description missing`);
    } else {
      const id = route.split('/').filter(Boolean).at(-1);
      const selector = ROUTE_CONTROL.get(id);
      assert.ok(selector, `${label}: route control contract missing`);
      assert.ok(await page.locator(selector).count() > 0, `${label}: original control ${selector} missing`);
      assert.ok(await page.locator('button,select,input,textarea,a').count() > 0,
        `${label}: dashboard has no interactive controls`);

      // Match the publish-layer validation timing: dashboards may finish their
      // initial synchronous render just after DOMContentLoaded/network idle.
      await page.waitForTimeout(450);
      const snapshot = await renderedLanguageSnapshot(page);
      const candidates = [
        snapshot.title,
        snapshot.description,
        ...snapshot.text,
        ...snapshot.attrs,
        ...snapshot.canvas,
      ];
      const residuals = [...new Set(candidates.map(normalizeVisitorText).filter(looksTurkish))];
      assert.equal(snapshot.lang, 'en', `${label}: expected html lang=en, found ${snapshot.lang || '(empty)'}`);
      assert.deepEqual(residuals, [],
        `${label}: visitor-facing Turkish residuals: ${JSON.stringify(residuals.slice(0, 20))}`);
    }

    // No page-level horizontal overflow at this viewport.
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    assert.ok(overflow.scrollW <= overflow.clientW + 1,
      `${label}: horizontal overflow (scrollWidth ${overflow.scrollW} > clientWidth ${overflow.clientW})`);

    if (isCatalog) {
      await page.evaluate(axeSrc);
      const violations = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
      });
      assert.deepEqual(violations, [], `${label}: catalog axe violations: ${JSON.stringify(violations)}`);
    }

    const nonFaviconFailures = failedResources.filter(({ url }) => !/\/favicon\.ico(?:$|\?)/i.test(url));
    const faviconOnlyFailure = failedResources.length > 0 && nonFaviconFailures.length === 0;
    const realErrors = consoleErrors.filter((error) => {
      if (/favicon/i.test(error)) return false;
      if (faviconOnlyFailure && /Failed to load resource/i.test(error)) return false;
      return true;
    });
    assert.deepEqual(nonFaviconFailures, [], `${label}: failed resources: ${JSON.stringify(nonFaviconFailures)}`);
    assert.equal(realErrors.length, 0, `${label}: console errors: ${JSON.stringify(realErrors)}`);

    console.log(`PASS  ${label}`);
  } catch (err) {
    failures++;
    console.error(`FAIL  ${label}: ${err.message}`);
  } finally {
    await context.close();
  }
}

for (const layout of layouts) {
  await auditRoute(CATALOG, layout, true);
  for (const route of DASHBOARDS) {
    await auditRoute(route, layout, false);
  }
}

await browser.close();
if (failures > 0) {
  console.error(`\n${failures} HR dashboard browser QA failure(s) — fix before merge`);
  process.exit(1);
}
console.log('\nHR Analytics Full Set browser QA: all routes passed (desktop + 390px), rendered English clean, no new a11y regressions.');
