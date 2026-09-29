// Aizanoi visual capture (Full QA). Replaces the retired four-world
// `historical-worlds-visual-capture.mjs` as a single-world concept.
//
// A screenshot existing is not proof of visual quality, so every capture is
// measured from the saved PNG: a hero frame that is effectively black is a
// broken capture, not a dark scene, and it must not be published as evidence.
import { mkdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';

// Mean luma of a PNG, decoded with stdlib only. Reading a WebGL canvas back with
// drawImage yields 0 unless preserveDrawingBuffer is on, so the pixels have to
// come from the saved file.
function meanLuma(file) {
  const png = readFileSync(file);
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  let pos = 8, width = 0, height = 0, depth = 0, colour = 0;
  const idat = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colour = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || (colour !== 2 && colour !== 6)) {
    throw new Error(`${file} has an unsupported PNG format (depth ${depth}, colour ${colour})`);
  }
  const channels = colour === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  let sum = 0, count = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    raw.copy(line, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc) ? b : c;
      }
      line[i] = v & 255;
    }
    line.copy(prev);
    for (let x = 0; x < width; x++) {
      const i = x * channels;
      sum += 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
      count++;
    }
  }
  return sum / count;
}

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const out = 'artifacts/final-visual-review';
mkdirSync(out, { recursive: true });

const AIZANOI = '/worlds/aizanoi-225/';
const CAPTURES = [
  { name: 'arrival', target: null, viewport: { width: 1280, height: 800 } },
  { name: 'temple', target: 'temple', viewport: { width: 1280, height: 800 } },
  { name: 'macellum', target: 'macellum', viewport: { width: 1280, height: 800 } },
  { name: 'theatre-stadium', target: 'stadium', viewport: { width: 1280, height: 800 } },
  { name: 'penkalas-bridge', target: 'bridge3', viewport: { width: 1280, height: 800 } },
  { name: 'great-bath', target: 'bath', viewport: { width: 1280, height: 800 } },
  { name: 'mobile', target: 'temple', viewport: { width: 390, height: 844 }, mobile: true },
];

const browserArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'];

async function settleAfterTeleport(page, target) {
  if (!target) return;
  await page.evaluate((id) => window.__WORLD_DEBUG__.teleport(id), target);
  await page.waitForFunction((id) => {
    const last = window.__WORLD_LAST_TELEPORT__;
    return last === id && window.__WORLD_DEBUG__.player?.controlsEnabled === true;
  }, target, { timeout: 20000, polling: 50 });
  // The pose blender and the first post-jump frame can settle in either order,
  // so let the blend finish before sampling.
  await page.waitForTimeout(1500);
}

for (const capture of CAPTURES) {
  // Fresh browser per capture: SwiftShader accumulates GPU resources across
  // heavy WebGL contexts and later contexts die with "target closed".
  const browser = await chromium.launch({ headless: true, args: browserArgs });
  try {
    const context = await browser.newContext({
      viewport: capture.viewport,
      ...(capture.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.goto(`${base}${AIZANOI}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => window.__WORLD_BOOTSTRAP__?.ready === true || window.__WORLD_DEBUG__?.ready === true,
      null, { timeout: 30000 },
    );
    // The Enter button disables itself while the runtime module is imported, so a
    // bare evaluate().click() is swallowed and the world never loads.
    await page.waitForSelector('#btn-enter', { timeout: 30000 });
    await page.waitForFunction(() => {
      const b = document.getElementById('btn-enter');
      return b && !b.disabled;
    }, null, { timeout: 30000 });
    if (capture.mobile) await page.locator('#btn-enter').tap();
    else await page.locator('#btn-enter').click();
    await page.waitForFunction(() => window.__WORLD_DEBUG__?.ready === true, null, { timeout: 90000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__WORLD_DEBUG__?.player?.controlsEnabled===true,null,{timeout:20000});
    // Settle past the cinematic fade before judging pixels; mid-fade frames read
    // black. The luma gate below is the check that actually has to hold.
    await page.waitForFunction(() => {
      const ov = document.querySelector('.cinematic-title');
      return !ov || getComputedStyle(ov).display === 'none';
    }, null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);

    await settleAfterTeleport(page, capture.target);

    const file = `${out}/aizanoi-${capture.name}.png`;
    let luma = 0;
    for (let attempt = 1; attempt <= 6; attempt++) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: file, fullPage: false, timeout: 120000 });
      luma = meanLuma(file);
      if (luma >= 24) break;
    }
    if (luma < 24) {
      throw new Error(`aizanoi ${capture.name} capture is effectively black (mean luma ${luma.toFixed(1)} after 6 samples); the capture is broken, not the world`);
    }
    console.log(`aizanoi ${capture.name} captured (mean luma ${luma.toFixed(1)})`);
    await context.close();
  } finally {
    await browser.close();
  }
}

console.log('Aizanoi visual captures written');
