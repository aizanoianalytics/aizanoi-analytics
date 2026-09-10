import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const quality = { dailyClose:'complete', fourHour:'complete', ohlcv:'unavailable', history:'complete' };
const rows = {
  us:[{ market:'us',ticker:'AAPL',name:'Apple Inc.',exchange:'NASDAQ',slug:'aapl',latest:315.34,return1d:.01,return30d:.08,relativeStrength30d:.03,percentile30d:82,rangePosition52w:.78,volatility20:.22,rsi14:61,trendAge50:24,drawdown1y:-.08,aboveSma200:true,historySessions:260,spark30:Array.from({length:30},(_,i)=>280+i),dataQuality:quality }],
  crypto:[{ market:'crypto',ticker:'BTC',name:'Bitcoin',exchange:'Crypto · USD',slug:'btc',latest:77965.96,return1d:-.02,return30d:.12,relativeStrength30d:.04,percentile30d:88,rangePosition52w:.72,volatility20:.48,rsi14:58,trendAge50:40,drawdown1y:-.17,aboveSma200:true,historySessions:260,spark30:Array.from({length:30},(_,i)=>70000+i*200),dataQuality:quality }],
};
const pulses = Object.fromEntries(Object.entries(rows).map(([market,items]) => [market,{ market,instruments:items.length,observed1d:items.length,advancing:items.filter(row=>row.return1d>0).length,declining:items.filter(row=>row.return1d<0).length,aboveSma200:1,rsiOverbought:0,rsiOversold:0,newHighs52w:0,newLows52w:0,medianReturn30d:items[0].return30d,returnSpread30d:0 }]));
const history = { market:'crypto',ticker:'BTC',name:'Bitcoin',yahooSymbol:'BTC-USD',exchange:'Crypto · USD',slug:'btc',startDate:'2019-01-01',dataQuality:quality,daily:Array.from({length:260},(_,i)=>({t:1546300800+i*86400,c:4000+i*290+Math.sin(i/5)*500})),fourHour:Array.from({length:120},(_,i)=>({t:1787000000+i*14400,c:72000+i*40+Math.sin(i/4)*200})) };

async function fixtures(page) {
  await page.route('**/analytics/markets/data/manifest.json', route => route.fulfill({ json:{ schemaVersion:2,completedAt:'2026-09-10T07:00:00Z',status:'complete',counts:{us:1,crypto:1} } }));
  await page.route('**/analytics/markets/data/health.json', route => route.fulfill({ json:{ completedAt:'2026-09-10T07:00:00Z',status:'complete',counts:{us:1,crypto:1},failedSymbols:[],quality:{fourHourUnavailable:0,limitedHistory:0} } }));
  await page.route('**/analytics/markets/data/snapshots/pulse.json', route => route.fulfill({ json:{ snapshots:[{completedAt:'2026-09-10T06:00:00Z',market:'crypto',instruments:1,aboveSma200:1},{completedAt:'2026-09-10T07:00:00Z',market:'crypto',instruments:1,aboveSma200:1}] } }));
  for (const market of ['us','crypto']) {
    await page.route(`**/analytics/markets/data/summary/${market}/index.json`, route => route.fulfill({ json:{market,chunks:[{path:'00.json',count:rows[market].length}]} }));
    await page.route(`**/analytics/markets/data/summary/${market}/00.json`, route => route.fulfill({ json:{market,rows:rows[market]} }));
    await page.route(`**/analytics/markets/data/pulse/${market}.json`, route => route.fulfill({ json:pulses[market] }));
  }
  await page.route('**/analytics/markets/data/pulse/crypto-correlations.json', route => route.fulfill({ json:{symbols:['BTC'],matrix:[[1]],averageCorrelation:null,btcCorrelation:{BTC:1}} }));
  await page.route('**/analytics/markets/data/history/crypto/btc.json', route => route.fulfill({ json:history }));
  await page.route('**/analytics/markets/data/summary-items/crypto/btc.json', route => route.fulfill({ json:rows.crypto[0] }));
}

for (const viewport of [{ width:1440,height:900 },{ width:768,height:1024 },{ width:390,height:844 },{ width:320,height:568 }]) {
  test(`expanded Markets is usable at ${viewport.width}px`, async () => {
    const browser = await chromium.launch({ headless:true }); const page = await browser.newPage({ viewport }); const errors=[];
    page.on('console', message => { if (message.type()==='error') errors.push(message.text()); }); page.on('pageerror', error => errors.push(String(error)));
    await fixtures(page);
    try {
      await page.goto(`${base}/analytics/markets/?market=crypto`, { waitUntil:'networkidle' });
      await page.waitForSelector('[data-pulse] article');
      assert.equal(await page.locator('[data-market="crypto"]').getAttribute('aria-selected'),'true');
      await page.click('[data-view="explorer"]');
      await page.waitForSelector('tr[data-symbol="btc"]');
      assert.equal(await page.locator('text=Volume').count(),0);
      await page.click('[data-watch="btc"]');
      await page.check('[data-watchlist-only]');
      assert.equal(await page.locator('tr[data-symbol="btc"]').count(),1);
      const dashboardOverflow = await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(dashboardOverflow<=1,`dashboard horizontal overflow ${dashboardOverflow}`);
      await page.click('tr[data-symbol="btc"]');
      await page.waitForURL(/\/analytics\/markets\/instrument\/\?market=crypto&symbol=btc/);
      await page.waitForSelector('.price-chart .i-price');
      await page.selectOption('[data-timeframe]','1M');
      await page.check('[data-indicator][value="sma50"]');
      await page.check('[data-oscillator][value="macd"]');
      assert.equal(await page.locator('.oscillator-chart').count(),2);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(overflow<=1,`horizontal overflow ${overflow}`);
      assert.deepEqual(errors,[]);
    } finally { await browser.close(); }
  });
}
