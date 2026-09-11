import {
  detailUrl,
  formatNumber,
  formatPrice,
  formatSignedReturn,
  indicatorSeries,
  sliceTimeframe,
} from '../core.js';

const DATA_ROOT = '/analytics/markets/data';
const params = new URLSearchParams(location.search);
const market = ['us', 'crypto'].includes(params.get('market')) ? params.get('market') : 'us';
const symbol = (params.get('symbol') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

const HORIZONS = [
  { key:'return1d', label:'1D' },
  { key:'return1w', label:'1W' },
  { key:'return1m', label:'1M' },
  { key:'return3m', label:'3M' },
  { key:'return6m', label:'6M' },
  { key:'return1y', label:'1Y' },
  { key:'return2y', label:'2Y' },
  { key:'return3y', label:'3Y' },
  { key:'returnSince2019', label:'Since 2019' },
];

const TIMEFRAMES = [
  { key:'1M', label:'1M' },
  { key:'3M', label:'3M' },
  { key:'6M', label:'6M' },
  { key:'1Y', label:'1Y' },
  { key:'2Y', label:'2Y' },
  { key:'3Y', label:'3Y' },
  { key:'5Y', label:'5Y' },
  { key:'SINCE_2019', label:'Since 2019' },
  { key:'CUSTOM', label:'Custom' },
];

const state = {
  payload: null,
  summary: null,
  frequency: '1d',
  timeframe: '1Y',
  dateFrom: '',
  dateTo: '',
  selectedDate: '',
  historyPage: 1,
  historyPageSize: 100,
  historySearch: '',
  indicators: new Set(['sma20']),
  oscillators: new Set(['rsi14']),
  universe: [],
  selectedPoint: null,
};

async function json(path) {
  const response = await fetch(path, { cache: 'default' });
  if (!response.ok) throw new Error(`Instrument data unavailable (${response.status})`);
  return response.json();
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

function pathPoints(values, width, height, min, spread) {
  return values.map((value, index) => Number.isFinite(value)
    ? `${index / Math.max(values.length - 1, 1) * width},${height - (value - min) / spread * height}`
    : '').filter(Boolean).join(' ');
}

function polyline(values, className, width, height, min, spread) {
  const points = pathPoints(values, width, height, min, spread);
  return points ? `<polyline class="${className}" points="${points}"/>` : '';
}

function histoBars(values, width, height, mid) {
  if (!values.length) return '';
  const bars = [];
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) continue;
    const x = i / Math.max(values.length - 1, 1) * width;
    const y = values[i] >= 0 ? mid - (values[i] / Math.max(...values.filter(Number.isFinite), 1)) * (mid - 4) : mid;
    const h = values[i] >= 0 ? (mid - y) : Math.min((height - mid), Math.abs(values[i] / Math.min(...values.filter(Number.isFinite), 1)) * (mid - 4));
    bars.push(`<rect class="macd-histogram macd-histogram--${values[i] >= 0 ? 'positive' : 'negative'}" x="${x - 1.5}" y="${values[i] >= 0 ? y : mid}" width="3" height="${Math.max(1, Math.abs(h))}"/>`);
  }
  return bars.join('');
}

function renderChart() {
  const source = state.frequency === '4h' ? state.payload.fourHour : state.payload.daily;
  if (!source) return '<p class="market-no-data">This timeframe is not available from the source.</p>';
  if (state.timeframe === 'CUSTOM' && state.dateFrom && state.dateTo && state.dateFrom > state.dateTo) {
    return '<p class="market-no-data market-validation-error">Invalid date range: "From" date must be earlier than "To" date.</p>';
  }
  const selected = state.timeframe === 'CUSTOM'
    ? source.filter(row => (!state.dateFrom || row.t * 1000 >= Date.parse(`${state.dateFrom}T00:00:00Z`)) && (!state.dateTo || row.t * 1000 <= Date.parse(`${state.dateTo}T23:59:59Z`)))
    : sliceTimeframe(source, state.timeframe);
  if (selected.length < 2) return '<p class="market-no-data">This timeframe is not available from the source.</p>';

  const allIndicators = indicatorSeries(source);
  const offset = source.findIndex(row => row.t === selected[0].t);
  const sliced = Object.fromEntries(Object.entries(allIndicators).map(([key, values]) => [key, values.slice(offset, offset + selected.length)]));

  const closes = selected.map(row => row.c);
  const overlayKeys = [...state.indicators].flatMap(key => key === 'bollinger' ? ['bollingerUpper', 'bollingerLower'] : [key]);
  const overlays = overlayKeys.flatMap(key => sliced[key] || []).filter(Number.isFinite);
  const [low, high] = findExtremes(closes, overlays);
  const spread = high - low || 1;
  const colors = { sma20:'i-sma20', sma50:'i-sma50', sma200:'i-sma200', ema12:'i-ema12', ema26:'i-ema26', ema50:'i-ema50', bollingerUpper:'i-band', bollingerLower:'i-band' };
  const overlayLines = overlayKeys.map(key => polyline(sliced[key], colors[key], 900, 340, low, spread)).join('');

  const start = new Date(selected[0].t * 1000).toLocaleDateString();
  const end = new Date(selected.at(-1).t * 1000).toLocaleDateString();
  const ticks = [low, low + spread * 0.5, high].map(value => formatPrice(value));

  const selectedIndex = state.selectedDate
    ? selected.findIndex(row => new Date(row.t * 1000).toISOString().slice(0, 10) === state.selectedDate)
    : (state.selectedPoint ?? -1);
  const markerIndex = selectedIndex;
  const markerX = markerIndex >= 0 ? markerIndex / Math.max(selected.length - 1, 1) * 900 : null;
  const marker = markerX !== null
    ? `<line class="selected-date-marker" x1="${markerX}" y1="0" x2="${markerX}" y2="340" stroke="#c48900" stroke-dasharray="4 4"/>`
    : '';
  const markerDot = markerX !== null ? `<circle class="selected-date-dot" cx="${markerX}" cy="${340 - ((Number.isFinite(closes[markerIndex]) ? closes[markerIndex] : low) - low) / spread * 340}" r="5" fill="#c48900"/>` : '';

  const overlayValuesAt = (idx) => overlayKeys.map(key => [key, sliced[key]?.[idx]]).filter(([, v]) => Number.isFinite(v));
  const tooltipPoint = markerIndex >= 0 ? {
    date: new Date(selected[markerIndex].t * 1000).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }),
    close: closes[markerIndex],
    overlays: overlayValuesAt(markerIndex),
  } : null;

  const svg = `<figure class="instrument-chart" data-chart>
    <figcaption data-chart-summary>Close-price history for ${esc(state.payload.name)} from ${esc(start)} to ${esc(end)}. Range ${esc(ticks[0])} – ${esc(ticks[2])}. Selected value: ${tooltipPoint ? `${esc(tooltipPoint.date)} · Close ${formatPrice(tooltipPoint.close)}` : 'move pointer or tap to inspect'}.</figcaption>
    <svg class="price-chart" viewBox="0 0 900 360" role="img" aria-label="Close-price chart with selected overlays" data-chart-svg>
      <g transform="translate(0 10)">${polyline(closes, 'i-price', 900, 340, low, spread)}${overlayLines}${marker}${markerDot}</g>
      <rect class="chart-hit-area" x="0" y="0" width="900" height="340" fill="transparent" data-chart-hit/>
    </svg>
    <div class="chart-tooltip" data-chart-tooltip hidden></div>
  </figure>`;

  const oscillators = [...state.oscillators].map(key => {
    if (key === 'macd') {
      const macdValues = sliced.macd || [];
      const signalValues = sliced.macdSignal || [];
      const histogram = sliced.macdHistogram || [];
      const visible = [...macdValues, ...signalValues, ...histogram].filter(Number.isFinite);
      if (!visible.length) return '';
      const [vMin, vMax] = findExtremes(visible);
      const range = (vMax - vMin) || 1;
      const mid = 130 - (0 - vMin) / range * 130;
      const lines = `${polyline(macdValues, 'i-macd', 900, 130, vMin, range)}${polyline(signalValues, 'i-macd-signal', 900, 130, vMin, range)}`;
      const histogramBars = histoBars(histogram, 900, 130, mid);
      const zeroLine = `<line class="macd-zero" x1="0" y1="${mid}" x2="900" y2="${mid}"/>`;
      return `<figure class="instrument-oscillator"><figcaption>MACD 12/26/9 · signal EMA 9 · histogram</figcaption><svg class="oscillator-chart" viewBox="0 0 900 150" role="img" aria-label="MACD oscillator"><g transform="translate(0 10)">${zeroLine}${lines}${histogramBars}</g></svg></figure>`;
    }
    if (key === 'rsi14') {
      const values = sliced.rsi14 || [];
      if (!values.filter(Number.isFinite).length) return '';
      return `<figure class="instrument-oscillator"><figcaption>RSI 14 (30/50/70 guides)</figcaption><svg class="oscillator-chart" viewBox="0 0 900 150" role="img" aria-label="RSI oscillator"><g transform="translate(0 10)">${polyline(values, 'i-rsi14', 900, 130, 0, 100)}<line x1="0" y1="130" x2="900" y2="130" stroke="#94a3b8"/><line x1="0" y1="${130 - 0.7 * 130}" x2="900" y2="${130 - 0.7 * 130}" stroke="#c2415b" stroke-dasharray="4 4"/><line x1="0" y1="${130 - 0.3 * 130}" x2="900" y2="${130 - 0.3 * 130}" stroke="#087c62" stroke-dasharray="4 4"/></g></svg></figure>`;
    }
    if (key === 'roc12') {
      const values = sliced.roc12 || [];
      const visible = values.filter(Number.isFinite);
      if (!visible.length) return '';
      const [vMin, vMax] = findExtremes(visible);
      const range = (vMax - vMin) || 1;
      const zeroY = 130 - (0 - vMin) / range * 130;
      const guides = `<line x1="0" y1="${zeroY}" x2="900" y2="${zeroY}" stroke="#94a3b8"/>`;
      return `<figure class="instrument-oscillator"><figcaption>ROC 12 (Rate of Change)</figcaption><svg class="oscillator-chart" viewBox="0 0 900 150" role="img" aria-label="ROC 12 oscillator"><g transform="translate(0 10)">${guides}${polyline(values, 'i-roc12', 900, 130, vMin, range)}</g></svg></figure>`;
    }
    return '';
  }).filter(Boolean).join('');

  return `${svg}${oscillators}`;
}

function updateChartTooltip(index, source) {
  const tooltip = document.querySelector('[data-chart-tooltip]');
  if (!tooltip) return;
  if (index == null || index < 0 || index >= source.length) {
    tooltip.hidden = true;
    tooltip.removeAttribute('data-active');
    return;
  }
  const point = source[index];
  if (!point || !Number.isFinite(point.c)) {
    tooltip.hidden = true;
    return;
  }
  const overlayKeys = [...state.indicators].flatMap(key => key === 'bollinger' ? ['bollingerUpper', 'bollingerLower'] : [key]);
  const indicators = indicatorSeries(source);
  const overlayRows = overlayKeys.map(key => [key, indicators[key]?.[index]]).filter(([, v]) => Number.isFinite(v));
  const overlays = overlayRows.map(([key, value]) => `${key.toUpperCase()}: ${formatPrice(value)}`).join(' · ');
  const date = new Date(point.t * 1000).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  tooltip.innerHTML = `<strong>${date}</strong><span>Close ${formatPrice(point.c)}</span>${overlays ? `<span>${esc(overlays)}</span>` : ''}`;
  tooltip.hidden = false;
  tooltip.setAttribute('data-active', '');
}

function renderHorizonCards(row) {
  return `<section class="instrument-horizons" data-horizons><h2>Performance horizons</h2><div class="instrument-horizon-grid">${HORIZONS.map(horizon => `<article class="instrument-horizon-card"><span>${esc(horizon.label)}</span><strong class="${Number.isFinite(row?.[horizon.key]) ? (row[horizon.key] >= 0 ? 'is-positive' : 'is-negative') : ''}">${formatSignedReturn(row?.[horizon.key])}</strong></article>`).join('')}</div></section>`;
}

function renderHistory(state) {
  const rows = (state.frequency === '4h' ? state.payload.fourHour : state.payload.daily) || [];
  if (!rows.length) return '<p class="market-no-data">No historical observations yet.</p>';
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / state.historyPageSize));
  const safePage = Math.min(Math.max(1, state.historyPage), totalPages);
  const start = (safePage - 1) * state.historyPageSize;
  const end = Math.min(start + state.historyPageSize, total);
  const pageRows = rows.slice(start, end);
  const term = state.historySearch.trim();
  const matches = !term ? pageRows : pageRows.filter(row => new Date(row.t * 1000).toISOString().slice(0, 10).includes(term));
  const tableRows = matches.map((row, idx) => {
    const date = new Date(row.t * 1000).toISOString().slice(0, 10);
    const previous = idx === 0 ? rows[start + idx - 1] : pageRows[idx - 1];
    const change = previous && Number.isFinite(previous.c) ? row.c / previous.c - 1 : null;
    return `<tr class="${state.selectedDate === date ? 'is-selected' : ''}" data-history-symbol="${esc(date)}" tabindex="0"><td>${esc(date)}</td><td>${formatPrice(row.c)}</td><td class="${Number.isFinite(change) ? (change >= 0 ? 'is-positive' : 'is-negative') : ''}">${formatSignedReturn(change)}</td></tr>`;
  }).join('');
  const dateFilterFrom = state.dateFrom && Date.parse(`${state.dateFrom}T00:00:00Z`) >= rows[0].t * 1000;
  return `<section class="instrument-history" data-history><header><h2>Historical prices (${state.frequency === '4h' ? '4 hour' : 'Daily'})</h2>
    <form data-history-filter><label>Search date<input type="search" data-history-search placeholder="YYYY-MM-DD" value="${esc(state.historySearch)}"></label>
    <label>From<input type="date" data-history-from value="${esc(state.dateFrom)}"></label>
    <label>To<input type="date" data-history-to value="${esc(state.dateTo)}"></label>
    <button type="submit">Apply</button></form></header>
    <div class="market-table-wrap"><table class="market-table" data-history-table><thead><tr><th>Date</th><th>Close</th><th>Daily Change %</th></tr></thead><tbody>${tableRows || `<tr><td colspan="3" class="market-table-empty">No matching history rows.</td></tr>`}</tbody></table></div>
    <div class="market-pager" data-history-pager>
      <button type="button" data-history-page="prev" ${safePage <= 1 ? 'disabled' : ''}>Previous</button>
      <span>Page ${safePage} of ${totalPages} · ${formatNumber(start + 1)}–${formatNumber(end)} of ${formatNumber(total)}</span>
      <button type="button" data-history-page="next" ${safePage >= totalPages ? 'disabled' : ''}>Next</button>
    </div>
  </section>`;
}

function renderHeader() {
  const basisText = market === 'crypto' ? 'Exchange close' : 'Adjusted close';
  return `<header class="instrument-header">
    <div>
      <p class="eyebrow">INSTRUMENT WORKSPACE</p>
      <h1>${esc(state.payload.ticker)} · ${esc(state.payload.name)}</h1>
      <p class="instrument-meta">${esc(state.payload.exchange)} · ${esc(basisText)} · Latest ${formatPrice(state.summary?.latestPrice ?? state.summary?.latest)} · As of ${esc(new Date((state.payload.daily?.at(-1)?.t || 0) * 1000).toLocaleDateString())}</p>
    </div>
    <form data-instrument-search><label>Find another instrument<input type="search" data-symbol-search placeholder="Ticker or company" autocomplete="off"></label><div data-search-results></div></form>
  </header>`;
}

function renderToolbar() {
  const has4H = Array.isArray(state.payload?.fourHour) && state.payload.fourHour.length > 1;
  return `<div class="chart-toolbar"><label>Frequency<select data-frequency><option value="1d"${state.frequency === '1d' ? ' selected' : ''}>Daily</option>${has4H ? `<option value="4h"${state.frequency === '4h' ? ' selected' : ''}>4 hour</option>` : ''}</select></label>
    <label>Timeframe<select data-timeframe>${TIMEFRAMES.map(tf => `<option value="${esc(tf.key)}"${state.timeframe === tf.key ? ' selected' : ''}>${esc(tf.label)}</option>`).join('')}</select></label>
    <label>From<input type="date" data-date-from value="${esc(state.dateFrom)}"></label>
    <label>To<input type="date" data-date-to value="${esc(state.dateTo)}"></label>
    <label>Selected date<input type="date" data-selected-date value="${esc(state.selectedDate)}"></label>
  </div>`;
}

function renderIndicators() {
  const overlayLabels = { sma20:'SMA 20', sma50:'SMA 50', sma200:'SMA 200', ema12:'EMA 12', ema26:'EMA 26', ema50:'EMA 50', bollinger:'Bollinger Bands 20 / 2' };
  const oscillatorLabels = { rsi14:'RSI 14', macd:'MACD 12/26/9', roc12:'ROC 12' };
  return `<div class="indicator-toolbar">
    <fieldset class="indicator-picker"><legend>Price overlays</legend>${Object.entries(overlayLabels).map(([key, label]) => `<label><input type="checkbox" value="${esc(key)}" data-indicator${state.indicators.has(key) ? ' checked' : ''}> ${esc(label)}</label>`).join('')}</fieldset>
    <fieldset class="indicator-picker"><legend>Oscillators</legend>${Object.entries(oscillatorLabels).map(([key, label]) => `<label><input type="checkbox" value="${esc(key)}" data-oscillator${state.oscillators.has(key) ? ' checked' : ''}> ${esc(label)}</label>`).join('')}</fieldset>
  </div>`;
}

function render() {
  if (!state.payload) return;
  const summary = state.summary || {};
  document.title = `${state.payload.ticker} — Aizanoi Markets`;
  const main = document.querySelector('[data-instrument-root]');
  if (!main) return;
  main.innerHTML = `${renderHeader()}${renderHorizonCards(summary)}${renderToolbar()}${renderIndicators()}<div class="chart-stage" data-chart-stage aria-live="polite">${renderChart()}</div>${renderHistory(state)}`;
  bindChartInteractivity();
}

function bindChartInteractivity() {
  const svg = document.querySelector('[data-chart-svg]');
  const tooltip = document.querySelector('[data-chart-tooltip]');
  if (!svg || !tooltip) return;
  const source = state.frequency === '4h' ? state.payload.fourHour : state.payload.daily;
  const visibleSource = state.timeframe === 'CUSTOM'
    ? source.filter(row => (!state.dateFrom || row.t * 1000 >= Date.parse(`${state.dateFrom}T00:00:00Z`)) && (!state.dateTo || row.t * 1000 <= Date.parse(`${state.dateTo}T23:59:59Z`)))
    : sliceTimeframe(source, state.timeframe);
  if (visibleSource.length < 2) return;
  function handleMove(event) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const index = Math.round(ratio * (visibleSource.length - 1));
    state.selectedPoint = index;
    const offsetX = ratio * rect.width;
    tooltip.style.left = `${Math.min(rect.width - 160, Math.max(0, offsetX + 12))}px`;
    tooltip.style.top = `${Math.max(0, (event.clientY - rect.top) - 12)}px`;
    updateChartTooltip(index, visibleSource);
  }
  function handleLeave() {
    tooltip.hidden = true;
    state.selectedPoint = null;
  }
  function handleClick(event) {
    const rect = svg.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const index = Math.round(ratio * (visibleSource.length - 1));
    const date = new Date(visibleSource[index].t * 1000).toISOString().slice(0, 10);
    state.selectedDate = date;
    const dateInput = document.querySelector('[data-selected-date]');
    if (dateInput) dateInput.value = date;
    render();
  }
  svg.addEventListener('mousemove', handleMove);
  svg.addEventListener('mouseleave', handleLeave);
  svg.addEventListener('touchstart', event => {
    if (!event.touches.length) return;
    handleMove(event.touches[0]);
  }, { passive: true });
  svg.addEventListener('touchmove', event => {
    if (!event.touches.length) return;
    handleMove(event.touches[0]);
  }, { passive: true });
  svg.addEventListener('click', handleClick);
}

function searchResults(value) {
  const needle = String(value || '').trim().toLowerCase();
  const target = document.querySelector('[data-search-results]');
  if (!target) return;
  if (!needle) { target.innerHTML = ''; return; }
  const matches = state.universe.filter(row => `${row.ticker} ${row.name}`.toLowerCase().includes(needle)).slice(0, 8);
  target.innerHTML = matches.map(row => `<a href="${detailUrl(row.market || market, row.slug)}"><strong>${esc(row.ticker)}</strong> ${esc(row.name)}</a>`).join('');
}

document.addEventListener('change', event => {
  if (event.target.matches('[data-frequency]')) { state.frequency = event.target.value; render(); return; }
  if (event.target.matches('[data-timeframe]')) {
    state.timeframe = event.target.value;
    if (state.timeframe !== 'CUSTOM') {
      state.dateFrom = ''; state.dateTo = '';
      const fromIn = document.querySelector('[data-date-from]'); if (fromIn) fromIn.value = '';
      const toIn = document.querySelector('[data-date-to]'); if (toIn) toIn.value = '';
    }
    render();
    return;
  }
  if (event.target.matches('[data-date-from]')) { state.dateFrom = event.target.value; state.timeframe = 'CUSTOM'; render(); return; }
  if (event.target.matches('[data-date-to]')) { state.dateTo = event.target.value; state.timeframe = 'CUSTOM'; render(); return; }
  if (event.target.matches('[data-selected-date]')) { state.selectedDate = event.target.value; render(); return; }
  if (event.target.matches('[data-indicator]')) { event.target.checked ? state.indicators.add(event.target.value) : state.indicators.delete(event.target.value); render(); return; }
  if (event.target.matches('[data-oscillator]')) { event.target.checked ? state.oscillators.add(event.target.value) : state.oscillators.delete(event.target.value); render(); return; }
  if (event.target.matches('[data-history-search]')) { state.historySearch = event.target.value; render(); return; }
  if (event.target.matches('[data-history-from]')) { state.dateFrom = event.target.value; render(); return; }
  if (event.target.matches('[data-history-to]')) { state.dateTo = event.target.value; render(); return; }
});

document.addEventListener('click', event => {
  if (event.target.closest('[data-history-page]')) {
    const action = event.target.closest('[data-history-page]').dataset.historyPage;
    state.historyPage = action === 'next' ? state.historyPage + 1 : Math.max(1, state.historyPage - 1);
    render();
    return;
  }
  if (event.target.closest('[data-symbol-search]')) return;
  const row = event.target.closest('tr[data-history-symbol]');
  if (row && !event.target.closest('a,button')) {
    state.selectedDate = row.dataset.historySymbol;
    render();
  }
});

document.addEventListener('input', async event => {
  if (!event.target.matches('[data-symbol-search]')) return;
  if (state.universe.length < 2) state.universe = await json(`${DATA_ROOT}/instruments.json`).catch(() => state.universe);
  searchResults(event.target.value);
});

document.addEventListener('submit', event => {
  if (!event.target.matches('[data-instrument-search]')) return;
  event.preventDefault();
  const needle = document.querySelector('[data-symbol-search]')?.value.trim().toLowerCase() || '';
  const exact = state.universe.find(row => row.ticker.toLowerCase() === needle || row.slug === needle);
  if (exact) location.href = detailUrl(exact.market || market, exact.slug);
});

if (!symbol) {
  const root = document.querySelector('[data-instrument-root]');
  if (root) root.innerHTML = '<p class="market-no-data">Choose an instrument from the Markets explorer.</p>';
} else {
  Promise.all([
    json(`${DATA_ROOT}/history/${market}/${encodeURIComponent(symbol)}.json`),
    json(`${DATA_ROOT}/summary-items/${market}/${encodeURIComponent(symbol)}.json`),
  ]).then(([payload, summary]) => {
    state.payload = payload;
    state.summary = summary;
    state.universe = [summary];
    state.frequency = '1d';
    state.timeframe = '1Y';
    render();
  }).catch(error => {
    const root = document.querySelector('[data-instrument-root]');
    if (root) root.innerHTML = `<p class="market-no-data">${esc(error.message)}</p>`;
  });
}
