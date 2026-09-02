import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox'],
});

const worlds = [
  { id:'aizanoi', path:'/historic-world/', enter:'#enterBtn', ready:'__AIZANOI_DEBUG__', jump:'#teleport', teleportMethod:'teleportTo' },
  { id:'rome', path:'/ancient-cities/rome-410-476/', enter:'#enter', ready:'__ANCIENT_WORLD_DEBUG__', jump:'#jump', teleportMethod:'teleport' },
  { id:'athens', path:'/ancient-cities/athens-450-430/', enter:'#enter', ready:'__ANCIENT_WORLD_DEBUG__', jump:'#jump', teleportMethod:'teleport' },
];
const directions = [[1.25,0],[-1.25,0],[0,1.25],[0,-1.25],[0.9,0.9],[0.9,-0.9],[-0.9,0.9],[-0.9,-0.9]];
const report = [];

for (const world of worlds) {
  const context = await browser.newContext({ viewport:{ width:1280, height:800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => {
    const text = String(error);
    if (/Pointer Lock|user gesture/i.test(text)) return;
    errors.push(text);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Pointer Lock|user gesture/i.test(text)) return;
    errors.push(text);
  });

  await page.goto(`${base}${world.path}`, { waitUntil:'networkidle' });
  await page.waitForFunction((key) => Boolean(window[key]), world.ready, { timeout:15000 });
  await page.locator(world.enter).click();
  await page.waitForTimeout(120);

  const destinations = await page.locator(`${world.jump} option`).evaluateAll((options) => options.map((option) => ({
    id: option.value,
    name: (option.textContent || '').trim(),
  })).filter((option) => option.id));
  assert.ok(destinations.length >= 6, `${world.id}: landmark selector is unexpectedly sparse`);

  for (const destination of destinations) {
    const result = await page.evaluate(({ world, destination, directions }) => {
      const debug = window[world.ready];
      const teleport = debug?.[world.teleportMethod];
      if (typeof teleport !== 'function') return { ok:false, reason:'teleport-api-missing' };
      const snapshots = [];
      const readPlayer = () => {
        const p = debug.player;
        return p ? { x:p.x, y:p.y, z:p.z, floorY:p.floorY, surfaceTag:p.surfaceTag } : null;
      };
      const doTeleport = () => teleport.call(debug, destination.id, { lock:false });
      const teleported = doTeleport();
      const first = readPlayer();
      if (!teleported || !first) return { ok:false, reason:'teleport-failed', first };
      const support = debug.absoluteSupportAt?.(first.x, first.z);
      const collision = debug.collide?.(first.x, first.z) ?? false;
      let bestMove = 0;
      let movedDirection = null;

      for (const [dx,dz] of directions) {
        doTeleport();
        const before = readPlayer();
        const moved = debug.moveWithSubsteps?.(dx,dz);
        const after = readPlayer();
        const distance = before && after ? Math.hypot(after.x-before.x, after.z-before.z) : 0;
        snapshots.push({ dx,dz,moved:Boolean(moved),distance,after });
        if (distance > bestMove) { bestMove = distance; movedDirection = [dx,dz]; }
        if (bestMove > 0.30) break;
      }
      doTeleport();
      const final = readPlayer();
      return { ok:true, first, final, support, collision, bestMove, movedDirection, snapshots };
    }, { world, destination, directions });

    assert.equal(result.ok, true, `${world.id}/${destination.id}: ${result.reason || 'landmark QA failed'}`);
    for (const key of ['x','y','z','floorY']) {
      assert.ok(Number.isFinite(result.first?.[key]), `${world.id}/${destination.id}: invalid ${key}`);
    }
    assert.equal(result.collision, false, `${world.id}/${destination.id}: teleport landed inside collision/hazard`);
    assert.ok(Number.isFinite(result.support?.y), `${world.id}/${destination.id}: support height is invalid`);
    assert.ok(Math.abs(result.first.floorY - result.support.y) < 0.08, `${world.id}/${destination.id}: floor/support mismatch (${result.first.floorY} vs ${result.support.y})`);
    assert.ok(result.bestMove > 0.30, `${world.id}/${destination.id}: arrival has no usable first-step direction`);
    report.push({ world:world.id, id:destination.id, name:destination.name, floor:result.first.floorY, firstStep:result.bestMove, direction:result.movedDirection });
  }

  assert.deepEqual(errors, [], `${world.id}: browser errors during landmark walk: ${errors.join(' | ')}`);
  await context.close();
}

// Research Lens and Aizanoi's static research fallback run in the same required browser gate.
{
  const context = await browser.newContext({ viewport:{ width:1280, height:860 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => {
    const text = String(error);
    if (!/Pointer Lock|user gesture/i.test(text)) errors.push(text);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!/Pointer Lock|user gesture/i.test(text)) errors.push(text);
  });

  await page.goto(`${base}/ancient-cities/rome-410-476/`, { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(window.__ANCIENT_WORLD_DEBUG__?.readiness?.rendered));
  await page.locator('[data-aw-evidence-toggle]').waitFor({ state:'visible' });
  await page.locator('[data-aw-evidence-toggle]').click();
  await page.locator('[data-aw-evidence-panel]').waitFor({ state:'visible' });
  assert.equal(await page.locator('[data-aw-evidence-toggle]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('[data-aw-evidence-panel]').innerText(), /Research Lens/i);
  for (const group of ['archaeological','documented','inferred','atmospheric','disputed']) {
    assert.equal(await page.locator(`[data-evidence-group="${group}"]`).count(), 1, `Research Lens missing ${group}`);
  }
  await page.evaluate(() => window.__ANCIENT_WORLD_DEBUG__.teleportTo('colosseum', { lock:false }));
  assert.ok(await page.evaluate(() => Number.isFinite(window.__ANCIENT_WORLD_DEBUG__?.player?.x)), 'Research Lens runtime keeps safe teleport usable');

  await page.goto(`${base}/historic-world/`, { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(window.__AIZANOI_DEBUG__?.readiness?.rendered));
  await page.waitForFunction(() => Boolean(window.__AIZANOI_CITY_EXPERIENCE__));
  await page.locator('[data-aw-evidence-toggle]').waitFor({ state:'visible' });
  assert.equal(await page.locator('.eraBtn[data-era="301"]').count(), 0, 'dormant AD 301 must remain suppressed');
  await page.keyboard.press('v');
  await page.waitForFunction(() => window.__AIZANOI_DEBUG__?.evidenceMode?.enabled === true);
  assert.equal(await page.locator('[data-aw-evidence-panel]').isVisible(), true);

  const research = await context.newPage();
  await research.goto(`${base}/historic-world/research/`, { waitUntil:'domcontentloaded' });
  assert.match(await research.locator('h1').innerText(), /Aizanoi research notes/i);
  assert.match(await research.locator('body').innerText(), /Evidence vocabulary/i);
  assert.match(await research.locator('body').innerText(), /DPU Aizanoi — Temple of Zeus/i);
  await research.close();

  assert.deepEqual(errors, [], `Research Lens browser errors: ${errors.join(' | ')}`);
  await context.close();
}

await browser.close();
const grouped = Object.groupBy(report, (row) => row.world);
for (const [world, rows] of Object.entries(grouped)) {
  console.log(`${world}: ${rows.length} landmark arrivals walked; minimum first-step clearance ${Math.min(...rows.map((row) => row.firstStep)).toFixed(2)} m`);
}
console.log(`Historical Worlds landmark walk + Research Lens passed: ${report.length} destinations`);
