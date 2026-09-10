import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const summary = {
  markets: {
    us: [{ ticker:'AAPL', name:'Apple Inc.', slug:'aapl', latest:315.34, return1d:0.01, return30d:0.08, volatility20:0.22, volumeZ20:2.1, drawdown1y:-0.08, distanceFrom52wHigh:-0.04, aboveSma200:true }],
    crypto: [{ ticker:'BTC', name:'Bitcoin', slug:'btc', latest:77965.96, return1d:-0.02, return30d:0.12, volatility20:0.48, volumeZ20:3.4, drawdown1y:-0.17, distanceFrom52wHigh:-0.09, aboveSma200:true }],
  },
};
const history = { ticker:'BTC', name:'Bitcoin', yahooSymbol:'BTC-USD', exchange:'Crypto · USD', startDate:'2019-01-01', daily:Array.from({length:220},(_,i)=>({t:1546300800+i*86400,c:4000+i*20,v:1000+i})), fourHour:Array.from({length:20},(_,i)=>({t:1788700000+i*14400,c:76000+i*80,v:500+i})) };

for (const viewport of [{ width:1440, height:900 }, { width:768, height:1024 }, { width:390, height:844 }, { width:320, height:568 }]) {
  test(`Markets is usable at ${viewport.width}px`, async () => {
    const browser = await chromium.launch({ headless:true });
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/analytics/markets/data/manifest.json', route => route.fulfill({ json:{ completedAt:'2026-09-10T07:00:00Z', counts:{ us:1, crypto:1 } } }));
    await page.route('**/analytics/markets/data/summary.json', route => route.fulfill({ json:summary }));
    await page.route('**/analytics/markets/data/history/crypto/btc.json', route => route.fulfill({ json:history }));
    try {
      await page.goto(`${base}/analytics/markets/?market=crypto`, { waitUntil:'networkidle' });
      await page.waitForSelector('tbody [data-symbol="btc"]');
      assert.equal(await page.locator('[data-market="crypto"]').getAttribute('aria-selected'), 'true');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `horizontal overflow ${overflow}`);
      const targets = await page.locator('[data-market]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
      assert.ok(targets.every(height => height >= 44), JSON.stringify(targets));
      await page.locator('tbody [data-symbol="btc"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-detail]:not([hidden]) svg');
      assert.equal(await page.locator('[data-frequency="4h"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-frequency="1d"]').count(), 1);
      assert.equal(await page.locator('[data-detail] table[aria-label="Recent price history data"]').count(), 1);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
