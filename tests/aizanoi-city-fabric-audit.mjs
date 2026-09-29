// Section 13: "Make Aizanoi feel like a city." Measure the environmental
// composition the visitor actually sees, so a claim like "the districts have
// character" can be checked rather than asserted.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const ROUTE = `${BASE}/worlds/aizanoi-225/`;
const userDataDir = mkdtempSync(join(tmpdir(), 'aizanoi-city-'));
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(ROUTE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#btn-enter', { timeout: 30000 });
await page.click('#btn-enter');
await page.waitForFunction(() => window.__WORLD_DEBUG__?.ready, null, { timeout: 180000 });
console.log('[entry] runtime ready');

const survey = await page.evaluate(async () => {
  const dbg = window.__WORLD_DEBUG__;
  const scene = dbg.scene;
  scene.updateMatrixWorld(true);

  const out = {
    total: 0,
    byName: {},
    regions: new Set(),
    sample: []
  };

  // Walk the real scene graph and classify what is actually there.
  const classify = (name) => {
    const n = name.toLowerCase();
    if (/path|road|street|paving|via|kerb/.test(n)) return 'paths';
    if (/quay|bank|embankment|wharf/.test(n)) return 'riverbank';
    if (/bridge|span|arch|approach/.test(n)) return 'bridge';
    if (/court|atrium|peristyle/.test(n)) return 'courtyard';
    if (/bench|column|prop|lantern|amphora|furniture|stall/.test(n)) return 'furniture';
    if (/market|stall|taberna|macellum|agora/.test(n)) return 'market';
    if (/bath|thermae|palaestra/.test(n)) return 'bath';
    if (/sanctuary|altar|shrine/.test(n)) return 'sanctuary';
    if (/theatre|stadium|odeon|cavea/.test(n)) return 'spectacle';
    if (/house|domus|insula|resid/.test(n)) return 'residential';
    if (/silhouette|skyline|backdrop/.test(n)) return 'silhouette';
    if (/ground|terrain/.test(n)) return 'ground';
    if (/water|river|penkalas/.test(n)) return 'water';
    if (/tree|shrub|grass|vegetation/.test(n)) return 'vegetation';
    if (/hill|ridge|terrace|slope/.test(n)) return 'terrain-relief';
    return 'other';
  };

  const walk = (obj, depth = 0) => {
    if (depth > 3) return;
    out.total++;
    const kind = classify(obj.name || '');
    out.byName[kind] = (out.byName[kind] || 0) + 1;
    if (out.sample.length < 24 && kind !== 'other') {
      out.sample.push({ name: obj.name, kind, type: obj.type });
    }
    for (const child of (obj.children || []).slice(0, 200)) walk(child, depth + 1);
  };
  walk(scene);

  // Ground flatness: sample vertex heights across the terrain.
  let ground = null;
  scene.traverse((o) => {
    if (!ground && /ground|terrain/i.test(o.name || '') && o.geometry?.attributes?.position) {
      ground = o;
    }
  });
  if (ground) {
    const pos = ground.geometry.attributes.position;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    out.groundRelief = Number((maxY - minY).toFixed(3));
    out.groundVerts = pos.count;
  }

  out.render = dbg.metrics ? dbg.metrics() : null;
  const city = await import('/worlds/aizanoi-225/js/city-data.js');
  out.regions = (city.REGIONS || []).map((r) => r.name);
  return out;
});

const byName = survey.byName;
console.log(`[objects] total=${survey.total}`);
console.log(`[composition] ${JSON.stringify(byName)}`);
console.log(`[ground] verts=${survey.groundVerts} relief=${survey.groundRelief}`);
console.log(`[regions] ${JSON.stringify(survey.regions)}`);
console.log(`[sample] ${JSON.stringify(survey.sample.slice(0, 12))}`);
console.log(`[console-errors] ${consoleErrors.length ? consoleErrors.join(' | ') : 'none'}`);

const findings = [];
// Section 13's explicit list. These are the ones with no implementation at all.
const REQUIRED = ['paths', 'riverbank', 'courtyard', 'furniture'];
for (const kind of REQUIRED) {
  if (!byName[kind]) findings.push(`no ${kind} in the scene`);
}
if ((survey.groundRelief ?? 0) < 0.5) {
  findings.push(`the ground is flat (relief ${survey.groundRelief}), so there is no ground variation`);
}
console.log(`[findings] ${findings.length ? findings.join(' | ') : 'none'}`);

await browser.close();
rmSync(userDataDir, { recursive: true, force: true });
