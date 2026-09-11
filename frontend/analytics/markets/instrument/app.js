import { detailUrl, formatLevelPercent, formatPercent, indicatorSeries, sliceTimeframe } from '../core.js';

const DATA_ROOT = '/analytics/markets/data';
const params = new URLSearchParams(location.search);
const market = ['us','crypto'].includes(params.get('market')) ? params.get('market') : 'us';
const symbol = (params.get('symbol') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits:2 });
const money = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });
const state = { payload:null, summary:null, frequency:'1d', timeframe:'1Y', dateFrom:'', dateTo:'', selectedDate:'', indicators:new Set(['sma20']), oscillators:new Set(['rsi14']), universe:[] };

async function json(path) {
  const response = await fetch(path, { cache:'default' });
  if (!response.ok) throw new Error(`Instrument data unavailable (${response.status})`);
  return response.json();
}
function pathPoints(values, width, height, min, spread) {
  return values.map((value,index) => Number.isFinite(value) ? `${index / Math.max(values.length - 1, 1) * width},${height - (value - min) / spread * height}` : '').filter(Boolean).join(' ');
}
function line(values, className, width, height, min, spread) {
  const points = pathPoints(values,width,height,min,spread);
  return points ? `<polyline class="${className}" points="${points}"/>` : '';
}
function findExtremes(...arrays) {
  let low = Infinity;
  let high = -Infinity;
  for (const arr of arrays) {
    if (!arr) continue;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (Number.isFinite(v)) {
        if (v < low) low = v;
        if (v > high) high = v;
      }
    }
  }
  return [low === Infinity ? 0 : low, high === -Infinity ? 1 : high];
}
function chart() {
  const source = state.frequency === '4h' ? state.payload.fourHour : state.payload.daily;
  if (state.timeframe === 'CUSTOM' && state.dateFrom && state.dateTo && state.dateFrom > state.dateTo) {
    return '<p class="market-no-data market-validation-error">Invalid date range: "From" date must be earlier than "To" date.</p>';
  }
  const selected = state.timeframe === 'CUSTOM'
    ? (source || []).filter(row => (!state.dateFrom || row.t * 1000 >= Date.parse(`${state.dateFrom}T00:00:00Z`)) && (!state.dateTo || row.t * 1000 <= Date.parse(`${state.dateTo}T23:59:59Z`)))
    : sliceTimeframe(source || [], state.timeframe);
  if (selected.length < 2) return '<p class="market-no-data">This timeframe is not available from the source.</p>';
  const allIndicators = indicatorSeries(source);
  const offset = source.findIndex(row => row.t === selected[0].t);
  const sliced = Object.fromEntries(Object.entries(allIndicators).map(([key,values]) => [key, values.slice(offset, offset + selected.length)]));
  const closes = selected.map(row => row.c);
  const overlayKeys = [...state.indicators].flatMap(key => key === 'bollinger' ? ['bollingerUpper','bollingerLower'] : [key]);
  const overlays = overlayKeys.flatMap(key => sliced[key] || []).filter(Number.isFinite);
  const [low, high] = findExtremes(closes, overlays); const spread = high - low || 1;
  const colors = { sma20:'i-sma20', sma50:'i-sma50', sma200:'i-sma200', ema12:'i-ema12', ema26:'i-ema26', ema50:'i-ema50', bollingerUpper:'i-band', bollingerLower:'i-band' };
  const overlayLines = overlayKeys.map(key => line(sliced[key], colors[key], 900, 340, low, spread)).join('');
  const start = new Date(selected[0].t * 1000).toLocaleDateString(); const end = new Date(selected.at(-1).t * 1000).toLocaleDateString();
  const ticks = [low, low + spread * 0.5, high].map(p => money.format(p));
  const markerIndex = state.selectedDate ? selected.findIndex(row => new Date(row.t * 1000).toISOString().slice(0,10) === state.selectedDate) : -1;
  const marker = markerIndex >= 0 ? `<line class="selected-date-marker" x1="${markerIndex / Math.max(selected.length - 1, 1) * 900}" y1="0" x2="${markerIndex / Math.max(selected.length - 1, 1) * 900}" y2="340" stroke="#c48900" stroke-dasharray="4 4"/>` : '';
  const price = `<figure><figcaption>Close price (${market === 'crypto' ? 'Exchange close' : 'Adjusted close'}) · ${esc(start)}–${esc(end)} · ${number.format(selected.length)} observations${state.selectedDate ? ` · Selected date: ${esc(state.selectedDate)}` : ''} · Range: ${ticks[0]} – ${ticks[2]}</figcaption><svg class="price-chart" viewBox="0 0 900 360" role="img" aria-label="Close-price chart with selected overlays"><g transform="translate(0 10)">${line(closes,'i-price',900,340,low,spread)}${overlayLines}${marker}</g></svg></figure>`;
  const oscillatorCharts = [...state.oscillators].map(key => {
    const keys = key === 'macd' ? ['macd','macdSignal'] : [key];
    const values = keys.flatMap(name => sliced[name] || []).filter(Number.isFinite);
    if (!values.length) return '';
    const [vMin, vMax] = findExtremes(values);
    const minimum = key === 'rsi14' ? 0 : vMin; const maximum = key === 'rsi14' ? 100 : vMax; const range = maximum - minimum || 1;
    const lines = keys.map(name => line(sliced[name], `i-${name}`,900,130,minimum,range)).join('');
    let guides = '';
    if (key === 'rsi14') {
      const y70 = 130 - (70 / 100) * 130; const y50 = 130 - (50 / 100) * 130; const y30 = 130 - (30 / 100) * 130;
      guides = `<line x1="0" y1="${y70}" x2="900" y2="${y70}" stroke="#d25757" stroke-dasharray="4 4" stroke-width="1"/><line x1="0" y1="${y50}" x2="900" y2="${y50}" stroke="rgba(100,116,139,0.3)" stroke-dasharray="2 4" stroke-width="0.8"/><line x1="0" y1="${y30}" x2="900" y2="${y30}" stroke="#4f9a68" stroke-dasharray="4 4" stroke-width="1"/>`;
    } else if (key === 'macd' || key === 'roc12') {
      const zeroY = 130 - (0 - minimum) / range * 130;
      if (zeroY >= 0 && zeroY <= 130) guides = `<line x1="0" y1="${zeroY}" x2="900" y2="${zeroY}" stroke="rgba(100,116,139,0.4)" stroke-dasharray="3 3" stroke-width="1"/>`;
    }
    return `<figure><figcaption>${key === 'rsi14' ? 'RSI 14 (30/50/70 levels)' : key === 'macd' ? 'MACD 12/26/9 (Zero line)' : 'Rate of change 20'}</figcaption><svg class="oscillator-chart" viewBox="0 0 900 150" role="img" aria-label="${esc(key)} oscillator"><g transform="translate(0 10)">${guides}${lines}</g></svg></figure>`;
  }).join('');
  return price + oscillatorCharts;
}
function metricCard(label,value) { return `<article><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`; }
function render() {
  if (!state.payload) return;
  const title = `${state.payload.ticker} · ${state.payload.name}`;
  document.title = `${state.payload.ticker} — Aizanoi Markets`;
  document.querySelector('[data-instrument-title]').textContent = title;
  const basisText = market === 'crypto' ? 'Exchange close' : 'Adjusted close';
  document.querySelector('[data-instrument-meta]').textContent = `${state.payload.exchange} · ${basisText} · Daily history from ${state.payload.startDate || 'first available session'} · ${state.payload.fourHour?.length ? 'Recent 4H history available' : '4H unavailable'}`;
  const frequency = document.querySelector('[data-frequency]'); frequency.value = state.frequency; frequency.querySelector('[value="4h"]').disabled = !state.payload.fourHour?.length;
  document.querySelector('[data-timeframe]').value = state.timeframe;
  document.querySelector('[data-chart-stage]').innerHTML = chart();
  const historyRows = (state.frequency === '4h' ? state.payload.fourHour : state.payload.daily) || [];
  document.querySelector('[data-history-table]').innerHTML = `<h3>Historical prices</h3><div class="market-table-wrap"><table><thead><tr><th>Date</th><th>Close</th></tr></thead><tbody>${historyRows.slice(-20).reverse().map(item => `<tr${new Date(item.t * 1000).toISOString().slice(0,10) === state.selectedDate ? ' data-selected-date-row' : ''}><td>${new Date(item.t * 1000).toISOString().slice(0,10)}</td><td>${money.format(item.c)}</td></tr>`).join('')}</tbody></table></div>`;
  const row = state.summary || {};
  document.querySelector('[data-instrument-metrics]').innerHTML = metricCard('Latest', Number.isFinite(row.latest) ? money.format(row.latest) : '—') + metricCard('1D', formatPercent(row.return1d)) + metricCard('30D', formatPercent(row.return30d)) + metricCard('Relative strength 30D', formatPercent(row.relativeStrength30d)) + metricCard('30D percentile', Number.isFinite(row.percentile30d) ? `${number.format(row.percentile30d)}th` : '—') + metricCard('Momentum quality', Number.isFinite(row.momentumQuality) ? `${number.format(row.momentumQuality)}/100` : '—') + metricCard('Mean reversion', Number.isFinite(row.meanReversionScore) ? `${number.format(row.meanReversionScore)}/100` : '—') + metricCard('Trend regime', row.trendRegime ? row.trendRegime.replaceAll('-', ' ') : '—') + metricCard('52W range', formatLevelPercent(row.rangePosition52w)) + metricCard('RSI 14', Number.isFinite(row.rsi14) ? number.format(row.rsi14) : '—') + metricCard('Days above SMA50', Number.isFinite(row.trendAge50) ? number.format(row.trendAge50) : '—');
  const quality = state.payload.dataQuality || row.dataQuality || {};
  document.querySelector('[data-instrument-quality]').innerHTML = `<strong>Data quality</strong><p>Daily close: ${esc(quality.dailyClose || 'unknown')} · Recent 4H: ${esc(quality.fourHour || 'unavailable')} · History: ${esc(quality.history || 'unknown')} · Published model: close-only · Basis: ${esc(basisText)}.</p>`;
}
function searchResults(value) {
  const needle = value.trim().toLowerCase(); const target = document.querySelector('[data-search-results]');
  if (!needle) { target.innerHTML = ''; return; }
  const matches = state.universe.filter(row => `${row.ticker} ${row.name}`.toLowerCase().includes(needle)).slice(0,8);
  target.innerHTML = matches.map(row => `<a href="${detailUrl(row.market || market, row.slug)}"><strong>${esc(row.ticker)}</strong> ${esc(row.name)}</a>`).join('');
}

document.addEventListener('change', event => {
  if (event.target.matches('[data-frequency]')) state.frequency = event.target.value;
  if (event.target.matches('[data-timeframe]')) {
    state.timeframe = event.target.value;
    if (state.timeframe !== 'CUSTOM') {
      state.dateFrom = ''; state.dateTo = '';
      const fromIn = document.querySelector('[data-date-from]'); if (fromIn) fromIn.value = '';
      const toIn = document.querySelector('[data-date-to]'); if (toIn) toIn.value = '';
    }
  }
  if (event.target.matches('[data-date-from]')) { state.dateFrom = event.target.value; state.timeframe = 'CUSTOM'; }
  if (event.target.matches('[data-date-to]')) { state.dateTo = event.target.value; state.timeframe = 'CUSTOM'; }
  if (event.target.matches('[data-selected-date]')) state.selectedDate = event.target.value;
  if (event.target.matches('[data-indicator]')) event.target.checked ? state.indicators.add(event.target.value) : state.indicators.delete(event.target.value);
  if (event.target.matches('[data-oscillator]')) event.target.checked ? state.oscillators.add(event.target.value) : state.oscillators.delete(event.target.value);
  render();
});
document.querySelector('[data-symbol-search]').addEventListener('input', async event => {
  if (state.universe.length < 2) state.universe = await json(`${DATA_ROOT}/instruments.json`).catch(() => state.universe);
  searchResults(event.target.value);
});
document.querySelector('[data-instrument-search]').addEventListener('submit', event => {
  event.preventDefault();
  const needle = document.querySelector('[data-symbol-search]').value.trim().toLowerCase();
  const exact = state.universe.find(row => row.ticker.toLowerCase() === needle || row.slug === needle);
  if (exact) location.href = detailUrl(exact.market || market, exact.slug);
});

if (!symbol) {
  document.querySelector('[data-chart-stage]').innerHTML = '<p class="market-no-data">Choose an instrument from the Markets explorer.</p>';
} else {
  Promise.all([
    json(`${DATA_ROOT}/history/${market}/${encodeURIComponent(symbol)}.json`),
    json(`${DATA_ROOT}/summary-items/${market}/${encodeURIComponent(symbol)}.json`),
  ]).then(([payload,summary]) => {
    state.payload = payload; state.summary = summary; state.universe = [summary];
    state.frequency = payload.fourHour?.length ? '4h' : '1d'; state.timeframe = state.frequency === '4h' ? '3M' : '1Y'; render();
  }).catch(error => { document.querySelector('[data-chart-stage]').innerHTML = `<p class="market-no-data">${esc(error.message)}</p>`; });
}
