import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

test('Workspace serializes concurrent file mutations without orphaning parent references', async () => {
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ viewport:{ width:1280, height:860 }, serviceWorkers:'block' });
  const page = await context.newPage();
  try {
    await page.goto(`${base}/?workspace-atomic=${Date.now()}`, { waitUntil:'networkidle' });
    await page.evaluate(() => indexedDB.deleteDatabase('aizanoi-workspace'));
    await page.reload({ waitUntil:'networkidle' });
    const state = await page.evaluate(async () => {
      const fs = await import('/js/v3/workspace/fs.js');
      const folder = await fs.createFolder({ name:'Concurrent imports', parent:fs.DOCUMENTS_ID });
      const created = await Promise.all(Array.from({ length:24 }, (_, index) => fs.createFile({
        name:`item-${index}.txt`,
        parent:folder.id,
        blob:new Blob([String(index)], { type:'text/plain' }),
        mime:'text/plain',
      })));
      const map = await fs.allNodes();
      const refreshed = map.get(folder.id);
      return {
        created:created.length,
        uniqueChildren:new Set(refreshed.children).size,
        children:refreshed.children.length,
        allReachable:created.every((node) => refreshed.children.includes(node.id) && map.get(node.id)?.parent === folder.id),
      };
    });
    assert.equal(state.created, 24);
    assert.equal(state.children, 24);
    assert.equal(state.uniqueChildren, 24);
    assert.equal(state.allReachable, true);
  } finally {
    await browser.close();
  }
});
