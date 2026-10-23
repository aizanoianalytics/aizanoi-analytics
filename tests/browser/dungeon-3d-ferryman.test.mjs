// Prove the new Styx Ferryman (flanker) GLB actually ships and parses in the
// real game. A file that exists on disk is not evidence that the loader can
// parse it, and a model that is never requested is not evidence that it ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || process.env.DG3D_BASE_URL || 'http://127.0.0.1:4173';

// The game may be served from the repo root or from the frontend/ folder, so
// the vendor and asset paths have to be derived from the base URL instead of
// hard-coded. Probe the candidates and use whichever one the server serves.
const resolvePath = async (page, candidates) => {
  for (const candidate of candidates) {
    const response = await page.request.get(`${base}${candidate}`);
    if (response.status() === 200) return { path: candidate, response };
  }
  return { path: null, response: null };
};

test('the Styx Ferryman model ships, parses and reaches the live route', async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
    const errors = [];
    const failedRequests = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
    page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });

    await page.goto(`${base}/dungeon/?ferryman=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.az-dungeon-begin', { timeout: 30000 });
    await page.locator('.az-dungeon-begin').click();
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.state === 'playing', null, { timeout: 20000 });
    await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(70));
    await page.waitForTimeout(1500);

    const vendor = await resolvePath(page, [
      '/frontend/worlds/shared/vendor/GLTFLoader.js',
      '/worlds/shared/vendor/GLTFLoader.js',
    ]);
    assert.ok(vendor.path, 'the GLTFLoader the runtime uses must be reachable');
    const asset = await resolvePath(page, [
      '/frontend/js/v3/apps/dungeon/assets/glb/enemy_styx_ferryman.glb',
      '/js/v3/apps/dungeon/assets/glb/enemy_styx_ferryman.glb',
    ]);
    assert.ok(asset.path, 'the Styx Ferryman model must be reachable over HTTP');
    const assetBody = await asset.response.body();
    assert.equal(Buffer.from(assetBody.slice(0, 4)).toString('latin1'), 'glTF',
      'the ferryman model must be a real GLB');
    assert.ok(assetBody.length > 10000, 'the ferryman model must not be an empty placeholder');

    // Parse it with the very loader the runtime uses: a file that the loader
    // cannot read would only fail at runtime, in the middle of a wave.
    const parse = await page.evaluate(async ({ bytes, loaderUrl }) => {
      const buffer = new Uint8Array(bytes).buffer;
      const { GLTFLoader } = await import(loaderUrl);
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(buffer, '');
      const names = [];
      gltf.scene.traverse((child) => { if (child.name) names.push(child.name); });
      return {
        meshCount: names.length,
        hasHood: names.includes('FERRYMAN__hood'),
        hasPole: names.includes('FERRYMAN__pole'),
        hasSkiff: names.includes('FERRYMAN__skiff'),
        names: names.slice(0, 12),
      };
    }, { bytes: [...assetBody], loaderUrl: vendor.path });

    assert.ok(parse.meshCount > 5, `the ferryman model must have parts, got ${parse.meshCount}`);
    assert.ok(parse.hasHood, `the ferryman model must have its hood, got ${parse.names}`);
    assert.ok(parse.hasPole, `the ferryman model must have its pole, got ${parse.names}`);
    assert.ok(parse.hasSkiff, `the ferryman model must have its skiff, got ${parse.names}`);

    const game = await page.evaluate(() => ({
      state: window.AIZANOI_DUNGEON_GAME.state,
      frames: window.AIZANOI_DUNGEON_GAME.frames,
      enemyCount: window.AIZANOI_DUNGEON_GAME.enemyCount,
    }));
    assert.equal(game.state, 'playing');
    assert.ok(game.frames > 5, 'the game must be running');
    assert.ok(game.enemyCount > 0, 'enemies must be alive');

    assert.deepEqual(failedRequests, [], 'no request may fail');
    assert.deepEqual(errors, [], 'no console error may be logged');
  } finally {
    await browser.close();
  }
});
