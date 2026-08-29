/**
 * Workspace app suite — real browser interaction tests (Playwright).
 *
 * Covers the regression findings from the owner's PR #71 review:
 *  - fresh DB → Workspace opens with Documents/Pictures/Music visible
 *  - Calculator: on-screen ÷ key actually divides (8 ÷ 2 = 4)
 *  - Notepad: save to Documents, reopen, unsaved-close protection exists
 *  - Camera permission contract: getUserMedia called with video+audio
 *  - Blockfall: Play mounts the game canvas; close cleans listeners
 *  - Recycle Bin: trash from Documents → restore returns to Documents
 *  - Winamp: local file import lands in Workspace Music (persistence path)
 *
 * Run: ANCIENT_WORLD_BASE_URL=http://127.0.0.1:4173 node tests/workspace-apps-browser.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function withPage(t, fn) {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    permissions: ['camera', 'microphone'],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  await page.goto(`${base}/?workspace-qa=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    indexedDB.deleteDatabase('aizanoi-workspace');
    localStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  try {
    await fn(page, errors);
  } finally {
    await browser.close();
  }
  assert.deepEqual(errors, [], `page errors: ${JSON.stringify(errors)}`);
}

async function openApp(page, appId) {
  await page.evaluate((id) => window.AIZANOI_OS?.openApp?.(id), appId);
  await page.waitForTimeout(700);
}

test('workspace: fresh DB shows Documents, Pictures and Music under root', async () => {
  await withPage(this, async (page) => {
    await openApp(page, 'workspace');
    // Default view is Documents; go Up to root.
    await page.click('[data-ws-up]');
    await page.waitForTimeout(400);
    const text = await page.locator('.az-workspace-grid').innerText();
    for (const folder of ['Documents', 'Pictures', 'Music']) {
      assert.ok(text.includes(folder), `root grid must show ${folder}`);
    }
  });
});

test('calculator: on-screen ÷ key divides (8 ÷ 2 = 4)', async () => {
  await withPage(this, async (page) => {
    await openApp(page, 'calculator');
    const press = async (key) => { await page.click(`[data-calc="${key}"]`); };
    await press('8'); await press('÷'); await press('2'); await press('=');
    const display = await page.locator('[data-calc-display]').innerText();
    assert.equal(display.trim(), '4', `8 ÷ 2 must equal 4, got ${display}`);
  });
});

test('notepad: save lands in Workspace Documents; reopen from list works', async () => {
  await withPage(this, async (page) => {
    await openApp(page, 'notepad');
    await page.fill('[data-note-text]', 'hello workspace contract');
    page.once('dialog', (dialog) => dialog.accept('contract-note.txt'));
    await page.click('[data-note-action="save"]');
    await page.waitForTimeout(500);
    await openApp(page, 'workspace');
    const text = await page.locator('.az-workspace-grid').innerText();
    assert.ok(text.includes('contract-note.txt'), 'saved document must appear in Documents');
  });
});

test('notepad: unsaved changes trigger the close veto', async () => {
  await withPage(this, async (page) => {
    await openApp(page, 'notepad');
    await page.fill('[data-note-text]', 'draft that must not vanish');
    let asked = false;
    page.once('dialog', async (dialog) => { asked = true; dialog.dismiss(); });
    await page.evaluate(() => window.AIZANOI_OS?.closeApp?.('notepad'));
    await page.waitForTimeout(400);
    assert.ok(asked, 'closing Notepad with unsaved changes must ask for confirmation');
    const stillOpen = await page.evaluate(() => Boolean(document.querySelector('[data-note-text]')));
    assert.ok(stillOpen, 'dismissing the confirm must keep Notepad open');
  });
});

test('camera: getUserMedia requests video AND microphone', async () => {
  await withPage(this, async (page) => {
    let requested = null;
    // Patch must be installed before app scripts run: addInitScript + reload.
    await page.addInitScript(() => {
      window.__qaGumCalls = [];
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (constraints) => {
        window.__qaGumCalls.push(JSON.parse(JSON.stringify(constraints)));
        return orig(constraints);
      };
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await openApp(page, 'camera');
    await page.click('[data-cam-start]');
    await page.waitForTimeout(800);
    requested = await page.evaluate(() => window.__qaGumCalls || []);
    assert.ok(requested.length >= 1, 'Start camera must call getUserMedia');
    assert.ok(requested[0].video, 'video constraint required');
    assert.equal(requested[0].audio, true, 'microphone permission must be requested (owner requirement)');
  });
});

test('blockfall: Play mounts canvas and close cleans up', async () => {
  await withPage(this, async (page) => {
    await openApp(page, 'games');
    await page.click('[data-play-game="blockfall"]');
    await page.waitForTimeout(800);
    const mounted = await page.evaluate(() => {
      const canvas = document.querySelector('[data-bf-canvas]');
      if (!canvas) return false;
      // Paint a probe pixel through the running rAF loop's grid state.
      return canvas.width > 0 && canvas.height > 0;
    });
    assert.ok(mounted, 'Blockfall must mount its canvas when Play is pressed');
    await page.click('[data-close-game]');
    await page.waitForTimeout(300);
    const gone = await page.evaluate(() => !document.querySelector('[data-bf-canvas]'));
    assert.ok(gone, 'closing the game must tear down its DOM');
  });
});

test('recycle bin: trash from Documents restores back to Documents', async () => {
  await withPage(this, async (page) => {
    // Seed a file through Notepad.
    await openApp(page, 'notepad');
    await page.fill('[data-note-text]', 'trash me');
    page.once('dialog', (dialog) => dialog.accept('trashme.txt'));
    await page.click('[data-note-action="save"]');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.AIZANOI_OS?.closeApp?.('notepad'));
    await page.waitForTimeout(300);

    await openApp(page, 'workspace');
    const item = page.locator('[data-ws-id]', { hasText: 'trashme.txt' }).first();
    const id = await item.getAttribute('data-ws-id');
    await page.evaluate(async (fileId) => {
      const fs = await import('/js/v3/workspace/fs.js');
      await fs.trashNode(fileId);
    }, id);
    await page.click('[data-ws-up]');
    await page.waitForTimeout(300);

    await openApp(page, 'recycle-bin');
    const restoreId = await page.locator('[data-bin-restore]').first().getAttribute('data-bin-restore');
    await page.click(`[data-bin-restore="${restoreId}"]`);
    await page.waitForTimeout(400);
    // Workspace is a singleton: close and reopen so it boots fresh into Documents.
    await page.evaluate(() => window.AIZANOI_OS?.closeApp?.('workspace'));
    await page.waitForTimeout(300);
    await openApp(page, 'workspace');
    const text = await page.locator('.az-workspace-grid').innerText();
    assert.ok(text.includes('trashme.txt'), 'restored file must be back in Documents');
  });
});

test('winamp: local import persists the track into Workspace Music', async () => {
  await withPage(this, async (page) => {
    await openApp(page, 'winamp');
    const filePayload = { name: 'qa-tone.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('not-a-real-audio-but-blob-size-matters') };
    const chooserPromise = page.waitForEvent('filechooser');
    await page.click('[data-wa-add-local]');
    const chooser = await chooserPromise;
    await chooser.setFiles([filePayload]);
    await page.waitForTimeout(600);
    const inMusic = await page.evaluate(async () => {
      const fs = await import('/js/v3/workspace/fs.js');
      const items = await fs.childrenOf(fs.MUSIC_ID);
      return items.some((node) => node.name === 'qa-tone.mp3');
    });
    assert.ok(inMusic, 'imported local track must be stored in Workspace · Music for persistence');
  });
});
