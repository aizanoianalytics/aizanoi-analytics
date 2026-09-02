import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function waitForWorld(page, city) {
  await page.waitForFunction((expected) => document.body?.dataset.city === expected && Boolean(window.__ANCIENT_WORLD_DEBUG__), city, { timeout:15000 });
  await page.locator('[data-aw-evidence-toggle]').waitFor({ state:'visible', timeout:12000 });
  await page.waitForFunction(() => window.__ANCIENT_WORLD_DEBUG__?.readiness?.rendered === true, null, { timeout:12000 });
}

test('Historical Worlds expose Research Lens and canonical shareable landmark/period URLs', async () => {
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ viewport:{ width:1280, height:860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

  try {
    await page.goto(`${base}/ancient-cities/rome-410-476/?at=pantheon`, { waitUntil:'networkidle' });
    await waitForWorld(page, 'rome');
    assert.equal(new URL(page.url()).searchParams.get('at'), 'pantheon');
    assert.equal(await page.locator('#intro').evaluate((node) => node.classList.contains('hidden')), true, 'canonical at= deep link should enter Rome without pointer lock');

    await page.locator('[data-aw-evidence-toggle]').click();
    await page.locator('[data-aw-evidence-panel]').waitFor({ state:'visible' });
    assert.equal(await page.locator('[data-aw-evidence-toggle]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('[data-aw-evidence-panel]').innerText(), /Research Lens/i);
    assert.ok(await page.locator('[data-evidence-group="archaeological"]').count());
    assert.ok(await page.locator('[data-evidence-group="inferred"]').count());
    assert.ok(await page.locator('[data-evidence-group="disputed"]').count());

    await page.evaluate(() => window.__ANCIENT_WORLD_DEBUG__.teleportTo('colosseum', { lock:false }));
    await page.waitForFunction(() => new URL(location.href).searchParams.get('at') === 'colosseum');
    assert.equal(new URL(page.url()).searchParams.get('jump'), null, 'canonical sharing should remove the legacy jump alias');

    await page.goto(`${base}/historic-world/?at=temple&period=425`, { waitUntil:'networkidle' });
    await waitForWorld(page, 'aizanoi');
    await page.waitForFunction(() => Boolean(window.__AIZANOI_CITY_EXPERIENCE__));
    assert.equal(new URL(page.url()).searchParams.get('at'), 'temple');
    assert.equal(new URL(page.url()).searchParams.get('period'), '425');
    assert.equal(await page.locator('.eraBtn[data-era="425"]').evaluate((node) => node.classList.contains('active')), true, 'shareable active period should select AD 425');
    assert.equal(await page.locator('.eraBtn[data-era="301"]').count(), 0, 'dormant AD 301 layer must remain suppressed');

    const shareState = await page.evaluate(() => window.__ANCIENT_WORLD_DEBUG__?.evidenceMode?.enabled ?? null);
    assert.equal(shareState, false, 'Research Lens should remain opt-in after deep-link entry');
    await page.keyboard.press('v');
    await page.waitForFunction(() => window.__ANCIENT_WORLD_DEBUG__?.evidenceMode?.enabled === true);
    assert.equal(await page.locator('[data-aw-evidence-panel]').isVisible(), true);

    const research = await context.newPage();
    await research.goto(`${base}/historic-world/research/`, { waitUntil:'domcontentloaded' });
    assert.match(await research.locator('h1').innerText(), /Aizanoi research notes/i);
    assert.match(await research.locator('body').innerText(), /Evidence vocabulary/i);
    assert.match(await research.locator('body').innerText(), /DPU Aizanoi — Temple of Zeus/i);
    await research.close();

    assert.deepEqual(errors, [], `Historical Worlds browser errors: ${JSON.stringify(errors)}`);
  } finally {
    await browser.close();
  }
});
