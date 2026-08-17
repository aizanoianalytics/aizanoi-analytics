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
    content: '.hud,.miniWrap,.touchControls,.help,.reticle,#intro,#modal,#evidenceModal,.error{display:none!important}',
  });
}

async function captureProduction() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${origin}/frontend/ancient-cities/rome-410-476/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ANCIENT_WORLD_DEBUG__), null, { timeout: 30_000 });
  await hideChrome(page);
  await page.evaluate(() => {
    document.querySelector('#intro')?.classList.add('hidden');
    window.__ANCIENT_WORLD_DEBUG__.teleportToPoint(52, -215, {
      lookX: 52,
      lookZ: -65,
      label: 'Colosseum A/B baseline',
    });
  });
  await page.waitForTimeout(500);
  if (errors.length) throw new Error(`Production baseline console errors: ${errors.join(' | ')}`);
  await page.screenshot({ path: resolve(outputDir, 'current-renderer-colosseum.png') });
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
  await page.evaluate(() => {
    const api = window.__ROME_THREE_POC__;
    const support = api.simulation.traversal.absoluteSupportAt(52, -215);
    api.simulation.player.x = 52;
    api.simulation.player.z = -215;
    api.simulation.player.floorY = support.y;
    api.simulation.player.surfaceTag = support.tag;
    api.simulation.player.y = support.y + 1.68;
    api.simulation.player.yaw = Math.PI;
    api.simulation.player.pitch = -0.03;
  });
  await page.waitForTimeout(500);
  if (errors.length) throw new Error(`Three.js baseline console errors: ${errors.join(' | ')}`);
  await page.screenshot({ path: resolve(outputDir, 'threejs-poc-colosseum.png') });
  await page.close();
}

try {
  await captureProduction();
  await captureThree();
  console.log(`A/B screenshots written to ${outputDir}`);
} finally {
  await browser.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
}
