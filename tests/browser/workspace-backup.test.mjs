import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function withPage(fn) {
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ viewport:{ width:1280, height:860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  try {
    await page.goto(`${base}/?workspace-backup-qa=${Date.now()}`, { waitUntil:'networkidle' });
    await page.evaluate(() => indexedDB.deleteDatabase('aizanoi-workspace'));
    await page.reload({ waitUntil:'networkidle' });
    await page.waitForTimeout(600);
    await fn(page);
    assert.deepEqual(errors, [], `page errors: ${JSON.stringify(errors)}`);
  } finally {
    await browser.close();
  }
}

test('Workspace backup restores folder topology and Blob content after later mutations', async () => withPage(async (page) => {
  const result = await page.evaluate(async () => {
    const fs = await import('/js/v3/workspace/fs.js');
    const backup = await import('/js/v3/workspace/backup.js');
    const folder = await fs.createFolder({ name:'Backup Project', parent:fs.DOCUMENTS_ID });
    const original = await fs.createFile({
      name:'evidence.txt',
      parent:folder.id,
      blob:new Blob(['Aizanoi backup payload ✓'], { type:'text/plain' }),
      mime:'text/plain',
    });
    const archive = await backup.exportWorkspaceBackup();
    const archiveText = await archive.text();

    await fs.createFile({
      name:'created-after-backup.txt',
      parent:folder.id,
      blob:new Blob(['must disappear'], { type:'text/plain' }),
      mime:'text/plain',
    });
    await fs.renameNode(original.id, 'mutated.txt');

    const restored = await backup.importWorkspaceBackup(new Blob([archiveText], { type:'application/json' }));
    const documents = await fs.childrenOf(fs.DOCUMENTS_ID);
    const restoredFolder = documents.find((node) => node.kind === 'folder' && node.name === 'Backup Project');
    const children = restoredFolder ? await fs.childrenOf(restoredFolder.id) : [];
    const file = children.find((node) => node.name === 'evidence.txt');
    const blob = file ? await fs.readFileBlob(file.id) : null;
    return {
      nodeCount:restored.nodeCount,
      restoredFolder:Boolean(restoredFolder),
      names:children.map((node) => node.name).sort(),
      text:blob ? await blob.text() : '',
      mime:blob?.type || '',
    };
  });

  assert.ok(result.nodeCount >= 7);
  assert.equal(result.restoredFolder, true);
  assert.deepEqual(result.names, ['evidence.txt']);
  assert.equal(result.text, 'Aizanoi backup payload ✓');
  assert.equal(result.mime, 'text/plain');
}));

test('invalid Workspace backup is rejected before current records are replaced', async () => withPage(async (page) => {
  const result = await page.evaluate(async () => {
    const fs = await import('/js/v3/workspace/fs.js');
    const backup = await import('/js/v3/workspace/backup.js');
    await fs.createFile({ name:'keep-me.txt', parent:fs.DOCUMENTS_ID, blob:new Blob(['safe']), mime:'text/plain' });
    const before = [...(await fs.allNodes()).values()].map((node) => node.name).sort();
    let message = '';
    try {
      await backup.importWorkspaceBackup(new Blob(['{"schema":"wrong","version":1,"nodes":[]}'], { type:'application/json' }));
    } catch (error) {
      message = error.message;
    }
    const after = [...(await fs.allNodes()).values()].map((node) => node.name).sort();
    return { before, after, message };
  });

  assert.deepEqual(result.after, result.before);
  assert.match(result.message, /not an Aizanoi Workspace backup|Unsupported Workspace backup format/i);
}));

test('Workspace hides destructive item actions for locked system folders and exposes durability controls', async () => withPage(async (page) => {
  await page.evaluate(() => window.AIZANOI_OS.openApp('workspace'));
  await page.locator('.az-window[data-app-id="workspace"] [data-ws-path]').waitFor({ state:'visible' });
  await page.waitForTimeout(300);
  await page.click('.az-window[data-app-id="workspace"] [data-ws-up]');
  await page.waitForFunction(() => document.querySelector('.az-window[data-app-id="workspace"] [data-ws-path]')?.textContent?.trim() === 'Workspace');

  for (const id of ['folder-documents', 'folder-pictures', 'folder-music']) {
    const item = page.locator(`.az-window[data-app-id="workspace"] [data-ws-id="${id}"]`);
    await item.waitFor({ state:'visible' });
    assert.equal(await item.locator('[data-ws-menu]').count(), 0, `${id} must not expose Rename/Trash menu`);
  }
  assert.equal(await page.locator('.az-window[data-app-id="workspace"] [data-ws-export]').count(), 1);
  assert.equal(await page.locator('.az-window[data-app-id="workspace"] [data-ws-restore]').count(), 1);
  assert.equal(await page.locator('.az-window[data-app-id="workspace"] [data-ws-persist]').count(), 1);
  assert.match(await page.locator('.az-window[data-app-id="workspace"] [data-ws-storage]').innerText(), /Origin storage|Browser storage status unavailable/);
}));
