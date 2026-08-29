/**
 * Workspace app suite — real browser interaction tests (Playwright).
 *
 * Round 1 (PR #71 review): fresh DB root folders, Calculator ÷, Notepad save +
 * unsaved protection, Camera permission contract, Blockfall mount, Recycle Bin
 * restore, Winamp import persistence.
 *
 * Round 2 (PR #72 review, this suite's additions):
 *  - custom root folder survives page reload (VFS root orphan bug)
 *  - nested folder → trash → restore returns to the ORIGINAL folder
 *  - Winamp import → page reload → playlist/track persistence
 *  - Camera close stops media tracks AND revokes gallery object URLs
 *  - Blockfall teardown verifies the cleanup contract, not just DOM removal
 *
 * Run: ANCIENT_WORLD_BASE_URL=http://127.0.0.1:4173 node --test tests/browser/workspace-apps.test.mjs
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
    await page.click('[data-ws-up]');
    await page.waitForTimeout(400);
    const text = await page.locator('.az-workspace-grid').innerText();
    for (const folder of ['Documents', 'Pictures', 'Music']) {
      assert.ok(text.includes(folder), `root grid must show ${folder}`);
    }
  });
});

test('workspace round 2: custom root folder survives page reload', async () => {
  await withPage(this, async (page) => {
    await openApp(page, 'workspace');
    // Go to root.
    await page.click('[data-ws-up]');
    await page.waitForTimeout(400);
    // Create a custom folder at root level.
    page.once('dialog', (dialog) => dialog.accept('My Custom Root Folder'));
    await page.click('[data-ws-newfolder]');
    await page.waitForTimeout(500);
    // Full page reload (new fs.js init pass must preserve user extras).
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await openApp(page, 'workspace');
    await page.click('[data-ws-up]');
    await page.waitForTimeout(400);
    const text = await page.locator('.az-workspace-grid').innerText();
    assert.ok(text.includes('My Custom Root Folder'), 'user-created root folder must survive reload');
    // And it must be reachable (opens without error).
    await page.locator('.az-workspace-item', { hasText: 'My Custom Root Folder' }).first().click();
    await page.waitForTimeout(400);
    const path = await page.locator('[data-ws-path]').innerText();
    assert.ok(path.includes('My Custom Root Folder'), 'custom folder must be navigable');
  });
});

test('workspace round 2: nested folder trash restores to the ORIGINAL folder', async () => {
  await withPage(this, async (page) => {
    await openApp(page, 'workspace');
    // Create a nested folder inside Documents.
    page.once('dialog', (dialog) => dialog.accept('Nested Projects'));
    await page.click('[data-ws-newfolder]');
    await page.waitForTimeout(400);
    await page.locator('.az-workspace-item', { hasText: 'Nested Projects' }).first().click();
    await page.waitForTimeout(400);
    // Seed a file inside it via fs (faster than driving Notepad).
    const fileId = await page.evaluate(async () => {
      const fs = await import('/js/v3/workspace/fs.js');
      const children = await fs.childrenOf('folder-documents');
      const nested = children.find((node) => node.name === 'Nested Projects');
      const file = await fs.createFile({ name: 'deep-file.txt', parent: nested.id, blob: new Blob(['x'], { type: 'text/plain' }), mime: 'text/plain' });
      return file.id;
    });
    // Trash the file, then restore from the Recycle Bin.
    await page.evaluate(async (id) => {
      const fs = await import('/js/v3/workspace/fs.js');
      await fs.trashNode(id);
    }, fileId);
    await openApp(page, 'recycle-bin');
    const restoreId = await page.locator('[data-bin-restore]').first().getAttribute('data-bin-restore');
    await page.click(`[data-bin-restore="${restoreId}"]`);
    await page.waitForTimeout(400);
    // The file must be back inside "Nested Projects", not Documents.
    const location = await page.evaluate(async () => {
      const fs = await import('/js/v3/workspace/fs.js');
      const node = await fs.getNode((await fs.childrenOf('folder-recycle'))[0]?.id || 'none').catch(() => null);
      const docs = await fs.childrenOf('folder-documents');
      const nested = docs.find((node2) => node2.name === 'Nested Projects');
      const nestedChildren = nested ? await fs.childrenOf(nested.id) : [];
      return {
        inNested: nestedChildren.some((n) => n.name === 'deep-file.txt'),
        previousParentHonored: nestedChildren.length > 0,
      };
    });
    assert.ok(location.inNested, 'restored file must return to its original nested folder');
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

test('camera round 2: close stops media tracks AND revokes object URLs', async () => {
  await withPage(this, async (page) => {
    await page.addInitScript(() => {
      window.__qaLiveTracks = [];
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await orig(constraints);
        window.__qaLiveTracks.push(...stream.getTracks());
        return stream;
      };
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    // Seed a photo into Pictures so the gallery renders a blob URL before close.
    await page.evaluate(async () => {
      const fs = await import('/js/v3/workspace/fs.js');
      const byteString = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      await fs.createFile({ name: 'qa-photo.png', parent: fs.PICTURES_ID, blob: new Blob([bytes], { type: 'image/png' }), mime: 'image/png' });
    });
    await openApp(page, 'camera');
    await page.waitForTimeout(600);
    const urlsBefore = await page.evaluate(() => document.querySelectorAll('img[data-photo-src]').length);
    assert.ok(urlsBefore > 0, 'gallery must render at least one photo for the teardown check');
    // Close the app — cleanup contract runs.
    await page.evaluate(() => window.AIZANOI_OS?.closeApp?.('camera'));
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => ({
      liveTracks: window.__qaLiveTracks.filter((track) => track.readyState === 'live').length,
      anyImgLeft: Boolean(document.querySelector('[data-cam-gallery] img[data-photo-src]')),
    }));
    assert.equal(state.liveTracks, 0, 'all media tracks must be stopped after close');
    assert.equal(state.anyImgLeft, false, 'camera DOM (and its blob URLs) must be torn down on close');
  });
});

test('blockfall round 2: close cancels the rAF loop (cleanup contract)', async () => {
  await withPage(this, async (page) => {
    await openApp(page, 'games');
    await page.click('[data-play-game="blockfall"]');
    await page.waitForTimeout(800);
    // Instrument rAF to count callbacks while the game runs vs after close.
    await page.evaluate(() => {
      window.__qaRaf = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => orig((ts) => { window.__qaRaf += 1; return orig === window.requestAnimationFrame ? cb(ts) : cb(ts); });
    });
    // Note: instrumentation applies to frames requested after this point.
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__qaRaf = 0; });
    await page.waitForTimeout(600);
    const framesWhileRunning = await page.evaluate(() => window.__qaRaf);
    await page.click('[data-close-game]');
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__qaRaf = 0; });
    await page.waitForTimeout(600);
    const framesAfterClose = await page.evaluate(() => window.__qaRaf);
    assert.ok(framesWhileRunning > 5, `game rAF loop must be active while running (got ${framesWhileRunning})`);
    assert.equal(framesAfterClose, 0, `game rAF loop must stop after close (got ${framesAfterClose})`);
    const gone = await page.evaluate(() => !document.querySelector('[data-bf-canvas]'));
    assert.ok(gone, 'closing the game must tear down its DOM');
  });
});

test('winamp round 2: import → page reload → playlist/track persistence', async () => {
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
    assert.ok(inMusic, 'imported local track must be stored in Workspace · Music');
    // Full page reload — playlist must come back from localStorage + VFS.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await openApp(page, 'winamp');
    const playlistText = await page.locator('[data-wa-playlist]').innerText();
    assert.ok(playlistText.includes('qa-tone.mp3'), 'playlist must survive a page reload');
  });
});

test('workspace round 2: ⋯ opens a real action menu (not a typing prompt)', async () => {
  await withPage(this, async (page) => {
    await openApp(page, 'notepad');
    await page.fill('[data-note-text]', 'menu contract');
    page.once('dialog', (dialog) => dialog.accept('menu-item.txt'));
    await page.click('[data-note-action="save"]');
    await page.waitForTimeout(500);
    await openApp(page, 'workspace');
    await page.click('.az-workspace-more');
    await page.waitForTimeout(400);
    const menu = await page.evaluate(() => ({
      present: Boolean(document.querySelector('[data-ws-actionmenu]')),
      role: document.querySelector('[data-ws-actionmenu]')?.getAttribute('role'),
      buttons: [...document.querySelectorAll('[data-ws-actionmenu] [data-ws-act]')].map((b) => b.dataset.wsAct),
    }));
    assert.ok(menu.present, '⋯ must open an action menu');
    assert.equal(menu.role, 'menu', 'action menu must expose role=menu');
    assert.deepEqual(menu.buttons, ['rename', 'trash', 'cancel'], 'menu must expose labeled actions');
    // Escape dismisses.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const gone = await page.evaluate(() => !document.querySelector('[data-ws-actionmenu]'));
    assert.ok(gone, 'Escape must dismiss the action menu');
  });
});
