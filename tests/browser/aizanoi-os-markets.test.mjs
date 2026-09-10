import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4193';
const quality = { dailyClose:'complete', fourHour:'unavailable', ohlcv:'unavailable', history:'complete' };
const row = market => ({ market,ticker:market==='us'?'AAPL':'BTC',name:market==='us'?'Apple Inc.':'Bitcoin',exchange:market==='us'?'NASDAQ':'Crypto · USD',slug:market==='us'?'aapl':'btc',latest:100,return1d:.01,return30d:.08,relativeStrength30d:.02,percentile30d:80,rangePosition52w:.8,volatility20:.2,rsi14:60,trendAge50:20,drawdown1y:-.1,aboveSma200:true,historySessions:260,spark30:Array.from({length:30},(_,i)=>100+i),dataQuality:quality });

async function fixtures(page) {
  await page.route('**/analytics/markets/data/manifest.json', route => route.fulfill({json:{schemaVersion:2,completedAt:'2026-09-10T07:00:00Z',status:'complete'}}));
  await page.route('**/analytics/markets/data/health.json', route => route.fulfill({json:{completedAt:'2026-09-10T07:00:00Z',status:'complete',counts:{us:1,crypto:1},failedSymbols:[],quality:{fourHourUnavailable:2,limitedHistory:0}}}));
  await page.route('**/analytics/markets/data/snapshots/pulse.json', route => route.fulfill({json:{snapshots:[]}}));
  for (const market of ['us','crypto']) {
    await page.route(`**/analytics/markets/data/summary/${market}/index.json`, route => route.fulfill({json:{market,chunks:[{path:'00.json',count:1}]}}));
    await page.route(`**/analytics/markets/data/summary/${market}/00.json`, route => route.fulfill({json:{market,rows:[row(market)]}}));
    await page.route(`**/analytics/markets/data/pulse/${market}.json`, route => route.fulfill({json:{market,instruments:1,observed1d:1,advancing:1,declining:0,aboveSma200:1,rsiOverbought:0,rsiOversold:0,newHighs52w:0,newLows52w:0,medianReturn30d:.08,returnSpread30d:0}}));
  }
  await page.route('**/analytics/markets/data/pulse/crypto-correlations.json', route => route.fulfill({json:{symbols:['BTC'],matrix:[[1]],btcCorrelation:{BTC:1}}}));
}

test('AizanoiOS Markets mounts shared full-product dashboard', async () => {
  const browser = await chromium.launch({headless:true}); const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}); const page=await context.newPage(); const errors=[];
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())}); page.on('pageerror',error=>errors.push(String(error))); await fixtures(page);
  try {
    await page.goto(`${base}/?markets-qa=${Date.now()}`,{waitUntil:'networkidle'});
    const shortcut=page.locator('[data-app="markets"]:visible').first(); await shortcut.waitFor({state:'visible',timeout:15000}); await shortcut.click();
    await page.waitForSelector('[data-app-body] .market-product [data-pulse] article',{timeout:15000});
    assert.equal(await page.locator('.az-window[data-app-id="markets"]').count(),1);
    await page.click('[data-app-body] [data-view="explorer"]'); await page.waitForSelector('[data-app-body] tr[data-symbol="aapl"]');
    await page.click('[data-app-body] [data-watch="aapl"]'); await page.check('[data-app-body] [data-watchlist-only]');
    await page.uncheck('[data-app-body] [data-watchlist-only]');
    await page.click('[data-app-body] [data-market="crypto"]'); await page.waitForSelector('[data-app-body] tr[data-symbol="btc"]');
    await page.click('[data-app-body] [data-view="data-health"]'); assert.match(await page.locator('[data-app-body] [data-health]').innerText(),/Pipeline|Published model/i);
    assert.equal(await page.locator('[data-app-body] :text("Volume")').count(),0);
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});
