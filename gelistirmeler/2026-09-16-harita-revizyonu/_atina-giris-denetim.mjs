// _atina-giris-denetim.mjs — TEST-ONLY: Athens intro butonunun gorunurluk zamanlamasi.
import { chromium } from 'playwright';

const BASE = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + '/worlds/athens-450-430/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Buton durumunu 2 dakikaya kadar yokla
  let state = null;
  for (let i = 0; i < 24; i++) {
    state = await page.evaluate(() => {
      const b = document.getElementById('btn-enter');
      if (!b) return { exists: false };
      const r = b.getBoundingClientRect();
      const s = getComputedStyle(b);
      return { exists: true, w: r.width, h: r.height, display: s.display, visibility: s.visibility, opacity: s.opacity };
    });
    if (state.exists && state.w > 0 && state.display !== 'none' && state.visibility !== 'hidden' && state.opacity !== '0') break;
    await page.waitForTimeout(5000);
  }
  console.log('buton durumu:', JSON.stringify(state));
  if (state?.exists) {
    await page.click('#btn-enter', { timeout: 15000 });
    await page.waitForTimeout(6000);
    const after = await page.evaluate(() => {
      const m = document.getElementById('intro-modal');
      const s = m ? getComputedStyle(m) : null;
      return { modalDisplay: s?.display, debug: typeof window.__WORLD_DEBUG__ !== 'undefined' };
    });
    console.log('tik sonrasi:', JSON.stringify(after), 'errors:', errors.length);
    for (const e of errors.slice(0, 5)) console.log('  ' + e.slice(0, 200));
    console.log(after.modalDisplay === 'none' && errors.length === 0 ? 'ATINA GIRIS GECTI' : 'ATINA GIRIS SORUNLU');
    process.exit(after.modalDisplay === 'none' && errors.length === 0 ? 0 : 1);
  }
  console.log('ATINA GIRIS SORUNLU: buton yok');
  process.exit(1);
} finally {
  await browser.close();
}
