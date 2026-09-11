import test from 'node:test';
import assert from 'node:assert/strict';

const coreUrl = new URL('../frontend/analytics/markets/core.js', import.meta.url);

function candles(count = 260) {
  return Array.from({ length: count }, (_, index) => ({ t: 1_700_000_000 + index * 86_400, c: 100 + index + Math.sin(index / 4) * 3 }));
}

test('calendar timeframe slicing preserves timestamp semantics for daily and intraday data', async () => {
  const { indicatorSeries, sliceTimeframe } = await import(coreUrl);
  const rows = candles();
  assert.equal(sliceTimeframe(rows, '1M').length, 31);
  assert.equal(sliceTimeframe(rows, '3M').length, 91);
  assert.equal(sliceTimeframe(rows, '1Y').length, 260);
  const cryptoDaily = Array.from({ length: 400 }, (_, i) => ({ t: 1_700_000_000 + i * 86_400, c: i + 1 }));
  assert.equal(sliceTimeframe(cryptoDaily, '1Y').length, 366);
  const cryptoFourHour = Array.from({ length: 700 }, (_, i) => ({ t: 1_700_000_000 + i * 14_400, c: i + 1 }));
  assert.equal(sliceTimeframe(cryptoFourHour, '3M').length, 541);
  assert.equal(sliceTimeframe(rows, 'SINCE_2019').length, 260);
  assert.equal(sliceTimeframe(rows, 'CUSTOM').length, 260);
  const indicators = indicatorSeries(rows);
  for (const key of ['sma20', 'sma50', 'sma200', 'ema12', 'ema26', 'bollingerUpper', 'bollingerLower', 'rsi14', 'macd', 'macdSignal', 'macdHistogram', 'roc12']) {
    assert.equal(indicators[key].length, rows.length, key);
  }
  assert.equal(indicators.sma20[0], null);
  assert.ok(Number.isFinite(indicators.rsi14.at(-1)));
  assert.ok(Number.isFinite(indicators.macd.at(-1)));
  assert.ok(Number.isFinite(indicators.macdHistogram.at(-1)));
});

test('format helpers produce stable strings for nulls and small crypto prices', async () => {
  const { formatPercent, formatLevelPercent, formatSignedReturn, formatPrice, formatNumber } = await import(coreUrl);
  assert.equal(formatPercent(0.2), '+20%');
  assert.equal(formatPercent(-0.05), '−5%');
  assert.equal(formatPercent(null), '—');
  assert.equal(formatLevelPercent(0.2), '20%');
  assert.equal(formatSignedReturn(0), '0%');
  assert.equal(formatSignedReturn(null), '—');
  assert.equal(formatPrice(123.45), '$123.45');
  assert.equal(formatPrice(null), '—');
  assert.equal(formatNumber(25000.12), '25,000.12');
  assert.equal(formatNumber(null), '—');
});

test('filterRows supports search, exchange, membership, price range, performance horizon and sort pagination', async () => {
  const { filterRows, sortRows, paginate } = await import(coreUrl);
  const rows = [
    { ticker:'AAPL', name:'Apple Inc.', slug:'aapl', exchange:'NASDAQ', memberships:['S&P 500'], latest:150, return1y:.4 },
    { ticker:'MSFT', name:'Microsoft', slug:'msft', exchange:'NASDAQ', memberships:['S&P 500'], latest:380, return1y:.25 },
    { ticker:'XOM', name:'Exxon', slug:'xom', exchange:'NYSE', memberships:['S&P 500'], latest:110, return1y:-.1 },
    { ticker:'BTC', name:'Bitcoin', slug:'btc', exchange:'Crypto · USD', memberships:['Crypto'], latest:78000, return1y:1.2 },
  ];
  assert.deepEqual(filterRows(rows, { query:'apple' }).map(row => row.ticker), ['AAPL']);
  assert.deepEqual(filterRows(rows, { exchange:'NYSE' }).map(row => row.ticker), ['XOM']);
  assert.deepEqual(filterRows(rows, { membership:'Crypto' }).map(row => row.ticker), ['BTC']);
  assert.deepEqual(filterRows(rows, { minPrice:100, maxPrice:200 }).map(row => row.ticker).sort(), ['AAPL', 'XOM']);
  assert.deepEqual(filterRows(rows, { performance:{ horizon:'return1y', op:'gt', min:.3 } }).map(row => row.ticker).sort(), ['AAPL', 'BTC']);
  const sorted = sortRows(rows, 'latest', 'desc');
  assert.equal(sorted[0].ticker, 'BTC');
  const page = paginate(sorted, 1, 2);
  assert.equal(page.total, 4);
  assert.equal(page.totalPages, 2);
  assert.deepEqual(page.rows.map(row => row.ticker), ['BTC', 'MSFT']);
  const second = paginate(sorted, 2, 2);
  assert.deepEqual(second.rows.map(row => row.ticker), ['AAPL', 'XOM']);
});

test('Aizanoi Picks uses exactly nine return horizons and 8-of-9 rule', async () => {
  const { pickMomentumRows, PICK_HORIZONS, evaluateMomentumEligibility } = await import(coreUrl);
  assert.deepEqual(PICK_HORIZONS, ['return1d', 'return1w', 'return1m', 'return3m', 'return6m', 'return1y', 'return2y', 'return3y', 'returnSince2019']);
  const ninePositive = Object.fromEntries(PICK_HORIZONS.map(key => [key, .1]));
  ninePositive.ticker = 'GOOD'; ninePositive.return1y = .5;
  assert.equal(evaluateMomentumEligibility(ninePositive).eligibility, 'strong');
  assert.equal(evaluateMomentumEligibility(ninePositive).positiveCount, 9);
  const eightPositive = { ...ninePositive, ticker:'EIGHT', returnSince2019:null };
  assert.equal(evaluateMomentumEligibility(eightPositive).eligibility, 'strong');
  const sevenPositive = { ...ninePositive, ticker:'SEVEN', returnSince2019: -.1, return1y: -.05 };
  assert.equal(evaluateMomentumEligibility(sevenPositive).eligibility, 'ineligible');
  const eightNegative = Object.fromEntries(PICK_HORIZONS.map(key => [key, -.1]));
  eightNegative.ticker = 'WEAK'; eightNegative.return1y = -.4;
  assert.equal(evaluateMomentumEligibility(eightNegative).eligibility, 'weak');
  const sevenNegative = { ...eightNegative, ticker:'SEVENN', returnSince2019: .1, return1y: .05 };
  assert.equal(evaluateMomentumEligibility(sevenNegative).eligibility, 'ineligible');
  const picks = pickMomentumRows([ninePositive, eightNegative]);
  assert.equal(picks[0].ticker, 'GOOD');
});

test('sortRows sorts ticker strings alphabetically with deterministic missing placement', async () => {
  const { sortRows } = await import(coreUrl);
  const rows = [
    { ticker:'MSFT', latest:380 },
    { ticker:'AAPL', latest:150 },
    { ticker:'NVDA', latest:900 },
  ];
  assert.deepEqual(sortRows(rows, 'ticker', 'asc').map(row => row.ticker), ['AAPL', 'MSFT', 'NVDA']);
  assert.deepEqual(sortRows(rows, 'ticker', 'desc').map(row => row.ticker), ['NVDA', 'MSFT', 'AAPL']);
  const withMissing = [...rows, { ticker:null, latest:1 }, { latest:2 }];
  assert.deepEqual(sortRows(withMissing, 'ticker', 'asc').map(row => row.ticker ?? null), ['AAPL', 'MSFT', 'NVDA', null, null]);
  assert.deepEqual(sortRows(withMissing, 'ticker', 'desc').map(row => row.ticker ?? null), ['NVDA', 'MSFT', 'AAPL', null, null]);
  assert.deepEqual(sortRows(rows, 'latest', 'asc').map(row => row.ticker), ['AAPL', 'MSFT', 'NVDA']);
});

test('price filter applies to latest price regardless of Price/Change display mode', async () => {
  const { filterRows } = await import(coreUrl);
  const rows = [
    { ticker:'AAPL', latestPrice:200, return1d:.01 },
    { ticker:'MSFT', latestPrice:400, return1d:.02 },
    { ticker:'XYZ', latestPrice:20, return1d:-.01 },
  ];
  assert.deepEqual(filterRows(rows, { minPrice:100 }).map(row => row.ticker).sort(), ['AAPL', 'MSFT']);
  assert.deepEqual(filterRows(rows, { minPrice:100, priceMode:'change' }).map(row => row.ticker).sort(), ['AAPL', 'MSFT']);
  assert.deepEqual(filterRows(rows, { minPrice:100, maxPrice:300, priceMode:'change' }).map(row => row.ticker), ['AAPL']);
});

test('validCount reflects finite horizons only and never qualifies missing data', async () => {
  const { evaluateMomentumEligibility, PICK_HORIZONS } = await import(coreUrl);
  const nine = Object.fromEntries(PICK_HORIZONS.map(key => [key, .1]));
  assert.equal(evaluateMomentumEligibility(nine).validCount, 9);
  const eightPlusMissing = { ...nine, returnSince2019: null };
  const eightMeta = evaluateMomentumEligibility(eightPlusMissing);
  assert.equal(eightMeta.validCount, 8);
  assert.equal(eightMeta.eligibility, 'strong');
  const sevenPlusMissing = { ...nine, returnSince2019: null, return3y: undefined };
  const sevenMeta = evaluateMomentumEligibility(sevenPlusMissing);
  assert.equal(sevenMeta.validCount, 7);
  assert.equal(sevenMeta.eligibility, 'ineligible');
  const flats = Object.fromEntries(PICK_HORIZONS.map(key => [key, 0]));
  const flatMeta = evaluateMomentumEligibility(flats);
  assert.equal(flatMeta.validCount, 9);
  assert.equal(flatMeta.eligibility, 'ineligible');
});

test('filterHistoryRows applies From/To inclusively before search across full history', async () => {
  const { filterHistoryRows } = await import(coreUrl);
  const day = 86_400;
  const base = 1_700_000_000;
  const rows = Array.from({ length: 300 }, (_, i) => ({ t: base + i * day, c: 100 + i }));
  const from = new Date((base + 100 * day) * 1000).toISOString().slice(0, 10);
  const to = new Date((base + 199 * day) * 1000).toISOString().slice(0, 10);
  const ranged = filterHistoryRows(rows, { dateFrom: from, dateTo: to });
  assert.equal(ranged.length, 100);
  assert.equal(ranged[0].t, base + 100 * day);
  assert.equal(ranged.at(-1).t, base + 199 * day);
  const target = new Date((base + 250 * day) * 1000).toISOString().slice(0, 10);
  const found = filterHistoryRows(rows, { search: target });
  assert.equal(found.length, 1);
  assert.equal(found[0].t, base + 250 * day);
  assert.equal(filterHistoryRows(rows, { search: 'nomatch-zzz' }).length, 0);
});

test('historyDailyChange uses the canonical previous candle, not the filtered row', async () => {
  const { historyDailyChange } = await import(coreUrl);
  const rows = [
    { t: 1_700_000_000, c: 100 },
    { t: 1_700_086_400, c: 110 },
    { t: 1_700_172_800, c: 99 },
  ];
  assert.equal(historyDailyChange(rows[2], rows, 2), 99 / 110 - 1);
  assert.equal(historyDailyChange(rows[1], rows, 1), 110 / 100 - 1);
  assert.equal(historyDailyChange(rows[0], rows, 0), null);
});
test('US market session state and crypto state are explicit', async () => {
  const { marketSessionState } = await import(coreUrl);
  assert.equal(marketSessionState('crypto', new Date('2026-09-10T20:00:00Z')).label, 'Crypto trades continuously');
  assert.equal(marketSessionState('us', new Date('2026-09-10T15:00:00Z')).open, true);
  assert.equal(marketSessionState('us', new Date('2026-09-12T15:00:00Z')).open, false);
});

test('activeFilterChips render readable summaries of all primary filters', async () => {
  const { activeFilterChips } = await import(coreUrl);
  const chips = activeFilterChips({
    query: 'aapl', exchange: 'NASDAQ', membership: 'S&P 500',
    minPrice: 50, maxPrice: 200,
    performance: { horizon: 'return1y', op: 'gt', min: .2, max: null },
  });
  assert.equal(chips.length, 5);
  const labels = chips.map(chip => chip.label);
  assert.ok(labels.some(label => /aapl/i.test(label)));
  assert.ok(labels.some(label => label.includes('NASDAQ')));
  assert.ok(labels.some(label => label.includes('S&P 500')));
  assert.ok(labels.some(label => label.includes('50')));
  assert.ok(labels.some(label => label.includes('1Y')));
});
