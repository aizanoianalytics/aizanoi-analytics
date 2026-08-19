import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const out = 'artifacts/final-visual-review';
mkdirSync(out, { recursive:true });

const browser = await chromium.launch({
  headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox'],
});

const layouts = [
  { id:'desktop', options:{ viewport:{ width:1440, height:900 }, hasTouch:false } },
  { id:'tablet', options:{ viewport:{ width:900, height:1180 }, hasTouch:true } },
  { id:'mobile', options:{ viewport:{ width:390, height:844 }, hasTouch:true, isMobile:true, deviceScaleFactor:2 } },
];

const worlds = [
  {
    id:'aizanoi', path:'/historic-world/', ready:'__AIZANOI_DEBUG__', enter:'#enterBtn',
    target:'temple', teleport:'teleportTo', file:'aizanoi-temple',
  },
  {
    id:'rome', path:'/ancient-cities/rome-410-476/', ready:'__ANCIENT_WORLD_DEBUG__', enter:'#enter',
    target:'colosseum', teleport:'teleport', file:'rome-colosseum',
  },
  {
    id:'athens', path:'/ancient-cities/athens-450-430/', ready:'__ANCIENT_WORLD_DEBUG__', enter:'#enter',
    target:'parthenon', teleport:'teleport', file:'athens-parthenon',
  },
];

for (const layout of layouts) {
  for (const world of worlds) {
    const context = await browser.newContext(layout.options);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
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

    await page.goto(`${base}${world.path}`, { waitUntil:'domcontentloaded' });
    await page.waitForFunction((key) => Boolean(window[key]), world.ready, { timeout:15000 });
    await page.locator(world.enter).click();
    await page.waitForTimeout(180);
    await page.evaluate(() => document.exitPointerLock?.());
    await page.waitForFunction(() => document.pointerLockElement === null);

    const ok = await page.evaluate(({ ready, teleport, target }) => {
      const debug = window[ready];
      const fn = debug?.[teleport];
      if (typeof fn !== 'function') return false;
      return fn.call(debug, target, { lock:false }) !== false;
    }, world);
    if (!ok) throw new Error(`${world.id}/${layout.id}: hero teleport failed`);

    await page.waitForTimeout(layout.id === 'desktop' ? 650 : 850);
    if (errors.length) throw new Error(`${world.id}/${layout.id}: browser errors: ${errors.join(' | ')}`);
    await page.screenshot({ path:`${out}/world-${world.file}-${layout.id}.png` });
    console.log(`captured ${world.id}/${layout.id}`);
    await context.close();
  }
}

await browser.close();
console.log('Historical Worlds desktop/tablet/mobile visual capture complete');
