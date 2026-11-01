import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const APP = 'videos';

async function session(viewport, options = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', ...options });
  const page = await context.newPage();
  await page.goto(`${base}/?app=${APP}&shell-qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`.az-window.is-active[data-app-id="${APP}"]`, { timeout: 20000 });
  return { browser, page };
}

test('pointer press inside a window keeps the clicked input focused', async () => {
  const { browser, page } = await session({ width: 1440, height: 900 });
  try {
    await page.evaluate((app) => {
      const body = document.querySelector(`.az-window[data-app-id="${app}"] [data-app-body]`);
      body.insertAdjacentHTML('afterbegin', '<input id="qa-input" aria-label="qa" style="position:relative;z-index:9;width:200px">');
    }, APP);
    await page.locator('#qa-input').click();
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'qa-input');
  } finally { await browser.close(); }
});

test('window rect round-trips through drag and reload without drift', async () => {
  const { browser, page } = await session({ width: 1440, height: 900 });
  try {
    const box = await page.locator(`.az-window[data-app-id="${APP}"] [data-window-drag]`).boundingBox();
    await page.mouse.move(box.x + 200, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 240, box.y + 50, { steps: 4 });
    await page.mouse.up();
    const read = () => page.evaluate((app) => {
      const el = document.querySelector(`.az-window[data-app-id="${app}"]`);
      const saved = JSON.parse(localStorage.getItem('aizanoi-os-state-v1')).windowRects[app];
      return { style: { left: parseFloat(el.style.left), top: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height) }, saved };
    }, APP);
    const first = await read();
    assert.deepEqual(first.saved, first.style, 'saved rect equals applied rect after drag');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`.az-window[data-app-id="${APP}"]`);
    const second = await read();
    assert.deepEqual(second.style, first.style, 'reload restores the same rect');
    assert.ok(second.style.width >= 420 && second.style.height >= 300, 'min size honoured');
  } finally { await browser.close(); }
});

test('compact: closing Settings keeps hidden shell regions inert', async () => {
  const { browser, page } = await session({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
  try {
    const inertState = () => page.evaluate(() => ({ dock: document.querySelector('.az-task-shelf-wrap').inert, home: document.querySelector('.az-home-scroll').inert }));
    assert.deepEqual(await inertState(), { dock: true, home: true });
    await page.evaluate(() => document.querySelector('[data-shell-action="settings"]').click());
    await page.locator('#az-settings-overlay.is-open').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.deepEqual(await inertState(), { dock: true, home: true });
  } finally { await browser.close(); }
});

test('reset local state asks for confirmation, lists scope, and cancel returns to Settings', async () => {
  const { browser, page } = await session({ width: 1440, height: 900 });
  try {
    await page.locator('[data-shell-action="settings"]:visible').first().click();
    await page.locator('[data-reset-workspace]').click();
    const dialog = page.locator('#az-confirm-overlay.is-open');
    await dialog.waitFor();
    const text = await dialog.innerText();
    assert.match(text, /Will be reset/);
    assert.match(text, /Stays as it is/);
    assert.match(text, /Files and documents saved inside apps/);
    let navigated = false;
    page.on('framenavigated', () => { navigated = true; });
    await page.keyboard.press('Escape');
    await page.locator('#az-settings-overlay.is-open').waitFor();
    assert.equal(navigated, false, 'cancel does not reload');
  } finally { await browser.close(); }
});
