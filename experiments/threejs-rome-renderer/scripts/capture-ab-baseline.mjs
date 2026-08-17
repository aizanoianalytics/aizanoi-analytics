import { mkdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const experimentRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(experimentRoot, '../..');
const outputDir = resolve(experimentRoot, 'visual-baseline');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
]);

export const MATCHED_CAPTURE_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'colosseum',
    label: 'Colosseum hero baseline',
    x: 52,
    z: -215,
    lookX: 52,
    lookZ: -65,
    pitch: -0.03,
  }),
  Object.freeze({
    id: 'via-sacra',
    label: 'Via Sacra streetscape baseline',
    x: -270,
    z: -52,
    lookX: -95,
    lookZ: -35,
    pitch: -0.055,
  }),
]);

function threeYawToTarget({ x, z, lookX, lookZ }) {
  const dx = lookX - x;
  const dz = lookZ - z;
  // Three.js cameras look down local -Z. Positive Y rotation turns that
  // direction toward -X, so the shared Rome target vector needs the opposite
  // X sign from the production renderer's custom view-matrix yaw convention.
  return Math.atan2(-dx, -dz);
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = resolve(repoRoot, `.${decoded}`);
  if (candidate !== repoRoot && !candidate.startsWith(`${repoRoot}${sep}`)) return null;
  return candidate;
}

const server = createServer(async (request, response) => {
  try {
    let path = safePath(request.url || '/');
    if (!path) return response.writeHead(403).end('Forbidden');
    const initial = await stat(path);
    if (initial.isDirectory()) path = resolve(path, 'index.html');
    const body = await readFile(path);
    response.writeHead(200, {
      'content-type': mime.get(extname(path).toLowerCase()) || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolveReady, rejectReady) => {
  server.once('error', rejectReady);
  server.listen(0, '127.0.0.1', resolveReady);
});

await mkdir(outputDir, { recursive: true });
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;
const chromiumArgs = [
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
];

const browser = await chromium.launch({ headless: true, args: chromiumArgs });

async function hideChrome(page) {
  await page.addStyleTag({
    content: '.hud,.miniWrap,.touchControls,.help,.reticle,#intro,#modal,#evidenceModal,.error,#ancient-world-back-to-os{display:none!important}',
  });
}

function screenshotPath(renderer, scenario) {
  return resolve(outputDir, `${renderer}-${scenario.id}.png`);
}

async function captureProduction() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${origin}/frontend/ancient-cities/rome-410-476/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ANCIENT_WORLD_DEBUG__), null, { timeout: 30_000 });
  await hideChrome(page);
  await page.evaluate(() => document.querySelector('#intro')?.classList.add('hidden'));

  for (const scenario of MATCHED_CAPTURE_SCENARIOS) {
    await page.evaluate((target) => {
      window.__ANCIENT_WORLD_DEBUG__.teleportToPoint(target.x, target.z, {
        lookX: target.lookX,
        lookZ: target.lookZ,
        label: target.label,
      });
    }, scenario);
    await page.waitForTimeout(450);
    await page.screenshot({ path: screenshotPath('current-renderer', scenario) });
  }

  if (errors.length) throw new Error(`Production baseline console errors: ${errors.join(' | ')}`);
  await page.close();
}

async function captureThree() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${origin}/experiments/threejs-rome-renderer/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ROME_THREE_POC__), null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__ROME_THREE_POC__.renderer.info.render.triangles > 0, null, { timeout: 15_000 });
  await hideChrome(page);

  for (const scenario of MATCHED_CAPTURE_SCENARIOS) {
    await page.evaluate((target) => {
      const api = window.__ROME_THREE_POC__;
      const support = api.simulation.traversal.absoluteSupportAt(target.x, target.z);
      api.simulation.player.x = target.x;
      api.simulation.player.z = target.z;
      api.simulation.player.floorY = support.y;
      api.simulation.player.surfaceTag = support.tag;
      api.simulation.player.y = support.y + 1.68;
      const dx = target.lookX - target.x;
      const dz = target.lookZ - target.z;
      api.simulation.player.yaw = Math.atan2(-dx, -dz);
      api.simulation.player.pitch = target.pitch;
    }, scenario);
    await page.waitForTimeout(450);
    await page.screenshot({ path: screenshotPath('threejs-poc', scenario) });
  }

  if (errors.length) throw new Error(`Three.js baseline console errors: ${errors.join(' | ')}`);
  await page.close();
}

try {
  await captureProduction();
  await captureThree();
  console.log(`Matched A/B screenshots written to ${outputDir}: ${MATCHED_CAPTURE_SCENARIOS.map((item) => item.id).join(', ')}`);
  console.log(`Three.js Via Sacra yaw: ${threeYawToTarget(MATCHED_CAPTURE_SCENARIOS[1]).toFixed(4)} rad`);
} finally {
  await browser.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
}
