import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const LEGACY_PRE_SHELL_SVG_WARNING = '<g> attribute transform: Expected';
const FEATURED_APP_COUNT = 11;
mkdirSync('artifacts/diagnostics', { recursive:true });
const browser = await chromium.launch({ headless:true });

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => {
    const text = String(error);
    if (!text.includes(LEGACY_PRE_SHELL_SVG_WARNING)) errors.push(text);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!text.includes(LEGACY_PRE_SHELL_SVG_WARNING)) errors.push(text);
  });
  return errors;
}

async function settle(page) {
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('hide') || getComputedStyle(boot).display === 'none';
  }, null, { timeout:9000 });
  await page.waitForFunction(() => Boolean(window.AIZANOI_UNIFIED_SHELL && window.AIZANOI_PRODUCT_POLISH), null, { timeout:9000 });
  await page.waitForFunction((count) => document.querySelectorAll('#az-mobile-apps .az-mobile-app').length === count, FEATURED_APP_COUNT, { timeout:6000 });
}

async function openApp(page, appId, { direct = false } = {}) {
  await page.evaluate(({ appId, direct }) => {
    if (direct) window.openApp?.(appId);
    else window.AIZANOI_OS?.launchApp?.(appId);
  }, { appId, direct });
  const win = page.locator(`.win[data-app-id="${appId}"]`).first();
  await win.waitFor({ state:'visible', timeout:9000 });
  await page.waitForFunction((id) => document.querySelector(`.win[data-app-id="${id}"]`)?.dataset.productPolish === 'true', appId, { timeout:5000 });
  return win;
}

async function waitForWorkbenchSurface(win, selector, label) {
  const surface = win.locator(selector).first();
  await surface.waitFor({ state:'visible', timeout:7000 });
  assert.ok(await surface.isVisible(), `${label}: lazy workstation surface never became visible`);
  return surface;
}

async function closeApp(page, appId) {
  await page.evaluate((id) => window.closeApp?.(id), appId);
  await page.waitForTimeout(80);
}

async function assertNoHorizontalEscape(page, selector, width, label) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box, `${label}: missing surface`);
  assert.ok(box.x >= -2, `${label}: surface escaped left edge`);
  assert.ok(box.x + box.width <= width + 3, `${label}: surface escaped right edge`);
}

async function runViewport({ name, width, height, expected, mobile = false }) {
  const context = await browser.newContext({
    viewport:{ width, height },
    isMobile:mobile,
    hasTouch:mobile || expected === 'tablet',
    deviceScaleFactor:mobile ? 2 : 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = collectErrors(page);
  await page.goto(`${base}/`, { waitUntil:'networkidle' });
  await settle(page);

  assert.equal(await page.evaluate(() => document.body.dataset.azLayout), expected, `${name}: responsive mode mismatch`);
  assert.equal(await page.locator('#az-mobile-apps .az-mobile-app').count(), FEATURED_APP_COUNT, `${name}: unified app count changed`);
  assert.equal(await page.locator('[data-app="chatbot"]:visible').count(), 0, `${name}: disabled AI entrypoint visible`);
  assert.equal(await page.locator('[data-mobile-nav="ai"]').count(), 0, `${name}: disabled AI mobile action returned`);
  assert.match(await page.title(), /Interactive History|Historical Worlds|Games|Projects|Aizanoi TV|About|Documentation|Privacy|Terms|System Updates/);
  assert.doesNotMatch(await page.locator('meta[name="description"]').getAttribute('content') || '', /HR AI|AI assistant/i);

  const polishLink = page.locator('link[data-aizanoi-product-polish]');
  assert.equal(await polishLink.count(), 1, `${name}: product stylesheet bootstrap missing`);
  assert.ok((await polishLink.getAttribute('href'))?.includes('os-product-polish.css'), `${name}: wrong product stylesheet`);
  assert.equal(await page.locator('link[data-aizanoi-responsive-polish]').count(), 1, `${name}: responsive polish stylesheet missing`);

  const terminal = await openApp(page, 'terminal');
  assert.match(await terminal.locator('.win-title').innerText(), /Field Terminal/);
  assert.match(await terminal.locator('.term-input-row > span').innerText(), /aizanoi@field:~\$/);
  await assertNoHorizontalEscape(page, '.win[data-app-id="terminal"]', width, `${name} terminal`);
  if (expected === 'mobile') {
    const box = await terminal.boundingBox();
    assert.ok(box.width >= width - 2, `${name}: terminal is not fullscreen-equivalent`);
  }
  await closeApp(page, 'terminal');

  const games = await openApp(page, 'games');
  assert.match(await games.locator('.win-title').innerText(), /Field Games/);
  assert.equal(await games.locator('.g-tile').count(), 3, `${name}: game launcher changed`);
  await assertNoHorizontalEscape(page, '.win[data-app-id="games"]', width, `${name} games`);
  await closeApp(page, 'games');

  if (name === 'desktop') {
    const projects = await openApp(page, 'projects');
    await page.waitForFunction(() => document.querySelector('#projects-list')?.textContent && !/Loading/.test(document.querySelector('#projects-list').textContent), null, { timeout:6000 });
    assert.ok((await projects.locator('#projects-list').innerText()).trim().length > 10, 'desktop: Projects did not render');
    await closeApp(page, 'projects');

    const about = await openApp(page, 'about');
    const aboutText = await about.innerText();
    assert.match(aboutText, /Aizanoi Field System/);
    assert.doesNotMatch(aboutText, /Luna Blue|Windows XP|Groq|Google/i);
    await closeApp(page, 'about');

    const privacy = await openApp(page, 'privacy', { direct:true });
    const privacyText = await privacy.innerText();
    assert.match(privacyText, /static website|local workspace/i);
    assert.doesNotMatch(privacyText, /Groq|Google|proxies AI chat|small Node\.js backend/i);
    await closeApp(page, 'privacy');

    const docs = await openApp(page, 'docs');
    const docsText = await docs.innerText();
    assert.match(docsText, /Static|browser-only/i);
    assert.doesNotMatch(docsText, /POST \/api\/terminal\/exec|GET \/api\/health/);
    await closeApp(page, 'docs');

    for (const appId of ['archive','notes','data-lab','monitor','source-reader','artifact-viewer']) {
      const win = await openApp(page, appId);
      await waitForWorkbenchSurface(win, '.az-workbench-body', `desktop ${appId}`);
      assert.equal(await win.getAttribute('data-product-polish'), 'true', `desktop: ${appId} not polished`);
      await closeApp(page, appId);
    }
  } else if (name === 'tablet') {
    for (const appId of ['archive','notes','data-lab']) {
      const win = await openApp(page, appId);
      await waitForWorkbenchSurface(win, '.az-workbench-body', `tablet ${appId}`);
      await assertNoHorizontalEscape(page, `.win[data-app-id="${appId}"]`, width, `tablet ${appId}`);
      const closeButton = win.locator('.win-btn.close');
      const buttonBox = await closeButton.boundingBox();
      assert.ok(buttonBox && buttonBox.width >= 34 && buttonBox.height >= 29, `tablet: ${appId} close target too small`);
      await closeApp(page, appId);
    }
  } else {
    const archive = await openApp(page, 'archive');
    await waitForWorkbenchSurface(archive, '.az-archive-shell', 'mobile archive');
    const collections = await waitForWorkbenchSurface(archive, '.az-collection-list', 'mobile archive collections');
    assert.ok(await collections.isVisible(), 'mobile: archive collections missing');
    assert.equal(await archive.locator('.az-archive-sidebar').evaluate((node)=>getComputedStyle(node).display), 'flex', 'mobile: archive sidebar did not become collection rail');
    await assertNoHorizontalEscape(page, '.win[data-app-id="archive"]', width, 'mobile archive');
    await closeApp(page, 'archive');

    const notes = await openApp(page, 'notes');
    await waitForWorkbenchSurface(notes, '.az-notes-shell', 'mobile notes');
    await assertNoHorizontalEscape(page, '.win[data-app-id="notes"]', width, 'mobile notes');
    await closeApp(page, 'notes');

    const dataLab = await openApp(page, 'data-lab');
    await waitForWorkbenchSurface(dataLab, '.az-lab-shell', 'mobile data lab');
    assert.match(await dataLab.innerText(), /Data Lab is ready|No dataset open/);
    await closeApp(page, 'data-lab');
  }

  await page.screenshot({ path:`artifacts/diagnostics/product-polish-${name}.png`, fullPage:false });
  assert.deepEqual(errors, [], `${name}: browser errors: ${errors.join(' | ')}`);
  await context.close();
}

await runViewport({ name:'desktop', width:1440, height:900, expected:'desktop' });
await runViewport({ name:'tablet', width:900, height:1180, expected:'tablet' });
await runViewport({ name:'mobile', width:390, height:844, expected:'mobile', mobile:true });

await browser.close();
console.log('Aizanoi full product polish desktop/tablet/mobile smoke passed');
