import test from 'node:test';
import assert from 'node:assert/strict';

const coreUrl = new URL('../frontend/analytics/markets/core.js', import.meta.url);

function candles(count = 260) {
  return Array.from({ length: count }, (_, index) => ({ t: 1_700_000_000 + index * 86_400, c: 100 + index + Math.sin(index / 4) * 3 }));
}

test('calendar timeframe slicing preserves timestamp semantics for daily and intraday data', async () => {
  const { indicatorSeries, sliceTimeframe } = await import(coreUrl);
  const rows = candles();
  assert.equal(sliceTimeframe(rows, '1M').length, 31); // cutoff is inclusive
  assert.equal(sliceTimeframe(rows, '3M').length, 91);
  assert.equal(sliceTimeframe(rows, '1Y').length, 260); // fixture is younger than one calendar year
  const cryptoDaily = Array.from({ length: 400 }, (_, i) => ({ t: 1_700_000_000 + i * 86_400, c: i + 1 }));
  assert.equal(sliceTimeframe(cryptoDaily, '1Y').length, 366);
  const cryptoFourHour = Array.from({ length: 700 }, (_, i) => ({ t: 1_700_000_000 + i * 14_400, c: i + 1 }));
  assert.equal(sliceTimeframe(cryptoFourHour, '3M').length, 541);
  assert.equal(sliceTimeframe(rows, 'ALL').length, 260);
  const indicators = indicatorSeries(rows);
  for (const key of ['sma20', 'sma50', 'sma200', 'ema12', 'ema26', 'bollingerUpper', 'bollingerLower', 'rsi14', 'macd', 'macdSignal', 'roc12']) {
    assert.equal(indicators[key].length, rows.length, key);
  }
  assert.equal(indicators.sma20[0], null);
  assert.ok(Number.isFinite(indicators.rsi14.at(-1)));
  assert.ok(Number.isFinite(indicators.macd.at(-1)));
});

test('market core sorts deepest drawdown first and formats volatility without a plus sign', async () => {
  const { sortRows, formatPercent, formatLevelPercent } = await import(coreUrl);
  const rows = sortRows([{ ticker:'A', drawdown1y:-0.1 }, { ticker:'B', drawdown1y:-0.8 }], 'drawdown1y');
  assert.equal(rows[0].ticker, 'B');
  assert.equal(formatPercent(0.2), '+20%');
  assert.equal(formatLevelPercent(0.2), '20%');
});

test('watchlist storage, filters and CSV export are deterministic', async () => {
  const { createWatchlist, filterRows, rowsToCsv, detailUrl } = await import(coreUrl);
  const memory = new Map();
  const storage = { getItem:key => memory.get(key) ?? null, setItem:(key, value) => memory.set(key, value) };
  const watchlist = createWatchlist(storage);
  watchlist.toggle('us:aapl');
  assert.equal(watchlist.has('us:aapl'), true);
  const rows = [{ market:'us', ticker:'AAPL', name:'Apple', slug:'aapl', latest:10 }, { market:'us', ticker:'MSFT', name:'Microsoft', slug:'msft', latest:20 }];
  assert.deepEqual(filterRows(rows, { query:'apple', watchlistOnly:false, watchlist }).map(row => row.ticker), ['AAPL']);
  assert.deepEqual(filterRows(rows, { query:'', watchlistOnly:true, watchlist }).map(row => row.ticker), ['AAPL']);
  const metricRows = [{market:'us',slug:'a',latest:5,historySessions:40,rsi14:25,rangePosition52w:.1},{market:'us',slug:'b',latest:50,historySessions:300,rsi14:75,rangePosition52w:.9}];
  assert.deepEqual(filterRows(metricRows, { minPrice:10,minSessions:200,rsiMax:80,rangeMin:.5 }).map(row => row.slug), ['b']);
  assert.match(rowsToCsv(rows, ['ticker', 'latest']), /^Ticker,Price\nAAPL,10/m);
  assert.equal(detailUrl('us', 'aapl'), '/analytics/markets/instrument/?market=us&symbol=aapl');
  const filtered = filterRows([
    { ticker:'A', name:'Alpha', latest:25, return1y:.3 },
    { ticker:'B', name:'Beta', latest:75, return1y:.1 },
    { ticker:'C', name:'Gamma', latest:null, return1y:null },
  ], { priceMin:20, priceMax:50, performance:{ horizon:'return1y', op:'gt', min:.2 } });
  assert.deepEqual(filtered.map(row => row.ticker), ['A']);
  assert.deepEqual(filterRows([{ticker:'A',name:'Alpha',latest:25},{ticker:'B',name:'Beta',latest:75}], { priceMin:20, priceMax:80 }).map(row => row.ticker), ['A','B']);
});

test('Aizanoi Picks uses exactly nine return horizons and requires exactly 8 same-sign valid values', async () => {
  const { pickMomentumRows, PICK_HORIZONS, evaluateMomentumEligibility } = await import(coreUrl);
  assert.deepEqual(PICK_HORIZONS, ['return1d','return1w','return1m','return3m','return6m','return1y','return2y','return3y','returnSince2019']);
  const qualifying = Object.fromEntries(PICK_HORIZONS.map((key, index) => [key, index === 8 ? null : .1]));
  qualifying.ticker = 'GOOD';
  assert.deepEqual(evaluateMomentumEligibility(qualifying).eligibility, 'strong');
  assert.deepEqual(evaluateMomentumEligibility(qualifying).positiveCount, 8);
  assert.equal(pickMomentumRows([qualifying])[0].ticker, 'GOOD');
  const positiveWithNegative = { ...qualifying, returnSince2019: -.1 };
  assert.deepEqual(evaluateMomentumEligibility(positiveWithNegative).eligibility, 'strong');
  const negative = Object.fromEntries(PICK_HORIZONS.map((key, index) => [key, index === 8 ? null : -.1]));
  negative.ticker = 'WEAK'; negative.return1y = -.4;
  assert.deepEqual(evaluateMomentumEligibility(negative).eligibility, 'weak');
  const negativeWithPositive = { ...negative, returnSince2019: .1 };
  assert.deepEqual(evaluateMomentumEligibility(negativeWithPositive).eligibility, 'weak');
  const mixed = { ...qualifying, return1y: -.1 };
  assert.equal(evaluateMomentumEligibility(mixed).eligibility, 'ineligible');
});

test('US market session state and crypto state are explicit', async () => {
  const { marketSessionState } = await import(coreUrl);
  assert.equal(marketSessionState('crypto', new Date('2026-09-10T20:00:00Z')).label, 'Crypto trades continuously');
  assert.equal(marketSessionState('us', new Date('2026-09-10T15:00:00Z')).open, true);
  assert.equal(marketSessionState('us', new Date('2026-09-12T15:00:00Z')).open, false);
});
