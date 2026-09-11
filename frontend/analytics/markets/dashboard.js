import { createSavedScreens, createWatchlist, DEFAULT_PRESETS, detailUrl, filterRows, formatLevelPercent, formatPercent, marketSessionState, rowsToCsv, sortRows } from './core.js';

const DATA_ROOT = '/analytics/markets/data';
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits:2 });
const money = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });
const columnDefinitions = {
  latest:['Price', value => Number.isFinite(value) ? money.format(value) : '—'],
  return1d:['1D', formatPercent], return30d:['30D', formatPercent],
  relativeStrength30d:['RS 30D', formatPercent], percentile30d:['Percentile', value => Number.isFinite(value) ? `${number.format(value)}th` : '—'],
  rangePosition52w:['52W range', formatLevelPercent], volatility20:['Volatility', formatLevelPercent],
  rsi14:['RSI', value => Number.isFinite(value) ? number.format(value) : '—'],
  trendRegime:['Trend regime', value => value ? String(value).replaceAll('-', ' ') : '—'],
  trendAge50:['Trend age', value => Number.isFinite(value) ? `${value} sessions` : '—'],
  momentumQuality:['Momentum quality', value => Number.isFinite(value) ? `${number.format(value)}/100` : '—'],
  meanReversionScore:['Mean reversion', value => Number.isFinite(value) ? `${number.format(value)}/100` : '—'],
};

async function getJson(path, signal) {
  const response = await fetch(path, { cache:'default', signal });
  if (!response.ok) throw new Error(`Market data unavailable (${response.status})`);
  return response.json();
}
function sparkPoints(values) {
  const safe = Array.isArray(values) ? values.filter(Number.isFinite) : [];
  if (safe.length < 2) return '';
  let low = safe[0];
  let high = safe[0];
  for (let i = 1; i < safe.length; i++) {
    const v = safe[i];
    if (v < low) low = v;
    if (v > high) high = v;
  }
  const spread = high - low || 1;
  return safe.map((value, index) => `${index / (safe.length - 1) * 90},${28 - (value - low) / spread * 24}`).join(' ');
}
function breadthChart(snapshots, market) {
  const rows = snapshots.filter(row => row.market === market).slice(-168);
  if (rows.length < 2) return '<p class="market-no-data">Breadth history starts with the next refresh.</p>';
  const values = rows.map(row => row.instruments ? row.aboveSma200 / row.instruments : 0);
  const points = values.map((value, index) => `${index / (values.length - 1) * 600},${120 - value * 100}`).join(' ');
  return `<svg viewBox="0 0 600 140" role="img" aria-label="Share of instruments above the 200-session average"><polyline points="${points}"/></svg>`;
}
function card(label, value, note = '') { return `<article><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</article>`; }
function qualityLabel(row) {
  const quality = row.dataQuality || {};
  if (quality.dailyClose !== 'complete') return 'Unavailable';
  if (quality.history === 'limited') return 'Limited history';
  if (quality.fourHour !== 'complete') return 'Daily only';
  return 'Daily + recent 4H';
}

export function createMarketsDashboard(container, { compact = false, updateUrl = !compact, readUrl = !compact } = {}) {
  if (!document.querySelector('link[href="/analytics/markets/markets.css"],link[data-markets-styles]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet'; stylesheet.href = '/analytics/markets/markets.css'; stylesheet.dataset.marketsStyles = '';
    document.head.append(stylesheet);
  }
  const params = readUrl ? new URLSearchParams(location.search) : new URLSearchParams();
  const savedScreens = createSavedScreens();
  const state = {
    market: ['us','crypto'].includes(params.get('market')) ? params.get('market') : 'us', view:'overview', rows:{ us:null, crypto:null },
    pulse:{}, manifest:null, health:null, snapshots:[], correlations:null, query:params.get('q') || '', sort:params.get('sort') || 'return30d',
    exchange:params.get('exchange') || '', regime:params.get('regime') || '', watchlistOnly:params.get('watchlist') === '1',
    minPrice:null, minSessions:null, rsiMin:null, rsiMax:null, rangeMin:null, rangeMax:null,
    columns:new Set(['latest','return1d','return30d','relativeStrength30d','percentile30d','rangePosition52w','trendRegime','momentumQuality','meanReversionScore']),
    watchlist:createWatchlist(), selected:null,
  };
  const controller = new AbortController();
  container.innerHTML = `<div class="market-product${compact ? ' is-compact' : ''}">
    <header class="market-product-bar"><div class="market-switch" role="tablist" aria-label="Market universe"><button type="button" data-market="us" role="tab">US Markets</button><button type="button" data-market="crypto" role="tab">Crypto</button></div><div><span data-session-state></span><strong data-freshness>Loading…</strong></div></header>
    <nav class="market-view-nav" aria-label="Market views"><button data-view="overview">Overview</button><button data-view="signals">Signals</button><button data-view="explorer">Explorer</button><button data-view="crypto-risk">Crypto risk</button><button data-view="data-health">Data health</button></nav>
    <p class="market-error" data-error hidden></p>
    <section data-panel="overview"><div class="market-cards" data-pulse></div><article class="market-panel"><header><div><span class="eyebrow">BREADTH HISTORY</span><h2>Participation above the 200-session trend</h2></div></header><div data-breadth-chart></div></article></section>
    <section data-panel="signals" hidden><div class="market-signal-grid" data-signals></div></section>
    <section data-panel="explorer" hidden><form class="market-controls" data-search-form><label>Search<input data-search type="search" value="${esc(state.query)}" placeholder="Ticker or company"></label><label>Preset screen<select data-saved-screen><option value="">Custom screen…</option>${DEFAULT_PRESETS.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><label>Rank by<select data-sort><option value="return30d">30-day return</option><option value="momentumQuality">Momentum quality</option><option value="meanReversionScore">Mean reversion</option><option value="relativeStrength30d">Relative strength</option><option value="percentile30d">Percentile rank</option><option value="rangePosition52w">52-week range</option><option value="volatility20">20-day volatility</option><option value="drawdown1y">Deepest drawdown</option><option value="rsi14">RSI</option><option value="trendAge50">Trend age</option></select></label><label>Exchange<select data-exchange><option value="">All</option></select></label><label>Trend<select data-regime><option value="">All</option><option value="strong-uptrend">Strong uptrend</option><option value="uptrend-weakening">Uptrend weakening</option><option value="transition">Transition</option><option value="downtrend">Downtrend</option><option value="recovery">Recovery</option><option value="breakdown">Breakdown</option><option value="golden">Golden cross</option><option value="death">Death cross</option></select></label><label>Min price<input type="number" min="0" step="1" data-min-price placeholder="0"></label><label>Min sessions<input type="number" min="0" step="1" data-min-sessions placeholder="0"></label><label>RSI min<input type="number" min="0" max="100" data-rsi-min placeholder="0"></label><label>RSI max<input type="number" min="0" max="100" data-rsi-max placeholder="100"></label><label>52W min %<input type="number" min="0" max="100" data-range-min placeholder="0"></label><label>52W max %<input type="number" min="0" max="100" data-range-max placeholder="100"></label><label class="market-check"><input data-watchlist-only type="checkbox"> Watchlist only</label><button type="button" data-columns>Columns</button><button type="button" data-export-csv>Export CSV</button></form><div class="market-column-picker" data-column-picker hidden></div><p class="market-table-note" data-row-cap-note hidden>Showing top matches</p><div class="market-table-wrap"><table class="market-table"><caption class="sr-only">Market instruments explorer</caption><thead data-table-head></thead><tbody data-market-rows></tbody></table></div><aside data-preview hidden></aside></section>
    <section data-panel="crypto-risk" hidden><div data-crypto-risk></div></section>
    <section data-panel="data-health" hidden><div class="market-cards" data-health></div></section>
  </div>`;

  const query = selector => container.querySelector(selector);
  const all = selector => [...container.querySelectorAll(selector)];
  function syncControls() {
    all('[data-market]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.market === state.market)));
    all('[data-view]').forEach(button => button.setAttribute('aria-current', button.dataset.view === state.view ? 'page' : 'false'));
    all('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== state.view; });
    query('[data-sort]').value = state.sort; query('[data-regime]').value = state.regime; query('[data-watchlist-only]').checked = state.watchlistOnly;
    query('[data-session-state]').textContent = marketSessionState(state.market).label;
  }
  function syncExplorerChrome() {
    const note = query('[data-row-cap-note]');
    if (!note) return;
    const filtered = visibleRows();
    const count = filtered.length;
    if (count > 250) {
      note.hidden = false;
      note.textContent = `Showing the top 250 of ${number.format(count)} matches — refine filters or search to narrow further.`;
    } else if (count > 0) {
      note.hidden = false;
      note.textContent = `${number.format(count)} matching instruments`;
    } else {
      note.hidden = true;
    }
  }
  function updateLocation() {
    if (!updateUrl) return;
    const next = new URLSearchParams(); next.set('market', state.market);
    if (state.query) next.set('q', state.query); if (state.sort !== 'return30d') next.set('sort', state.sort);
    if (state.exchange) next.set('exchange', state.exchange); if (state.regime) next.set('regime', state.regime); if (state.watchlistOnly) next.set('watchlist', '1');
    history.replaceState(null, '', `${location.pathname}?${next}`);
  }
  function currentRows() { return state.rows[state.market] || []; }
  function visibleRows() { return sortRows(filterRows(currentRows(), { ...state, watchlist:state.watchlist }), state.sort); }
  function renderPulse() {
    const pulse = state.pulse[state.market] || {}; const total = pulse.instruments || currentRows().length || 0;
    query('[data-pulse]').innerHTML = [
      card('Instruments', number.format(total)), card('Advancing', total ? formatLevelPercent((pulse.advancing || 0) / Math.max(pulse.observed1d || total, 1)) : '—'),
      card('Above 200D', total ? formatLevelPercent((pulse.aboveSma200 || 0) / total) : '—'), card('Median 30D', formatPercent(pulse.medianReturn30d)),
      card('New 52W highs', number.format(pulse.newHighs52w || 0)), card('New 52W lows', number.format(pulse.newLows52w || 0)),
      card('RSI > 70', number.format(pulse.rsiOverbought || 0)), card('RSI < 30', number.format(pulse.rsiOversold || 0)),
      card('30D spread', formatLevelPercent(pulse.returnSpread30d)),
    ].join('');
    query('[data-breadth-chart]').innerHTML = breadthChart(state.snapshots, state.market);
  }
  function renderSignals() {
    const rows = currentRows().filter(row => row.historySessions >= 30);
    const configs = [
      ['Momentum quality','momentumQuality',true], ['Mean-reversion candidates','meanReversionScore',true],
      ['Momentum leaders','return30d',true], ['Relative-strength leaders','relativeStrength30d',true], ['Largest decliners','return30d',false],
      ['52W breakout candidates','rangePosition52w',true],
      ['RSI oversold','rsi14',false], ['High-volatility watch','volatility20',true],
    ];
    const rankedPanels = configs.map(([title,key,reverse]) => {
      const picks = [...rows].filter(row => Number.isFinite(row[key])).sort((a,b) => reverse ? b[key]-a[key] : a[key]-b[key]).slice(0,8);
      return `<article class="market-panel"><h2>${esc(title)}</h2><div class="market-rank-list">${picks.map(row => `<a href="${detailUrl(state.market,row.slug)}"><strong>${esc(row.ticker)}</strong><span>${['rsi14','trendAge50','momentumQuality','meanReversionScore'].includes(key) ? number.format(row[key]) : formatPercent(row[key])}</span></a>`).join('') || '<p>Not enough observations yet.</p>'}</div></article>`;
    });
    const crossPanels = [['Golden crosses','smaCross','golden'],['Death crosses','smaCross','death'],['SMA recoveries','trendRegime','recovery'],['SMA200 breakdowns','trendRegime','breakdown']].map(([title,key,direction]) => {
      const picks = rows.filter(row => row[key] === direction).slice(0,8);
      return `<article class="market-panel"><h2>${title}</h2><div class="market-rank-list">${picks.map(row => `<a href="${detailUrl(state.market,row.slug)}"><strong>${esc(row.ticker)}</strong><span>${esc(row.trendRegime || direction)}</span></a>`).join('') || '<p>No fresh crosses in this snapshot.</p>'}</div></article>`;
    });
    query('[data-signals]').innerHTML = [...rankedPanels,...crossPanels].join('');
  }
  function renderExplorer() {
    const rows = visibleRows();
    const exchanges = [...new Set(currentRows().map(row => row.exchange).filter(Boolean))].sort();
    query('[data-exchange]').innerHTML = '<option value="">All</option>' + exchanges.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join(''); query('[data-exchange]').value = state.exchange;
    const columns = [...state.columns];
    query('[data-table-head]').innerHTML = `<tr><th aria-label="Watchlist"></th><th>Instrument</th><th>30D trend</th>${columns.map(column => `<th>${esc(columnDefinitions[column][0])}</th>`).join('')}<th></th></tr>`;
    query('[data-market-rows]').innerHTML = rows.slice(0,250).map((row,index) => `<tr tabindex="0" data-symbol="${esc(row.slug)}" data-open-instrument="${esc(row.slug)}" aria-label="Open ${esc(row.ticker)}"><td><button class="market-star" data-watch="${esc(row.slug)}" aria-label="${state.watchlist.has(`${state.market}:${row.slug}`) ? 'Remove from' : 'Add to'} watchlist">${state.watchlist.has(`${state.market}:${row.slug}`) ? '★' : '☆'}</button></td><td><strong>${esc(row.ticker)}</strong><span>${esc(row.name)}</span><small>${esc(qualityLabel(row))}</small></td><td>${row.spark30?.length > 1 ? `<svg class="market-mini-spark" viewBox="0 0 90 32" preserveAspectRatio="none" loading="lazy" aria-hidden="true"><polyline points="${sparkPoints(row.spark30)}"/></svg>` : '<span class="market-no-data">—</span>'}</td>${columns.map(column => `<td>${columnDefinitions[column][1](row[column])}</td>`).join('')}<td><a href="${detailUrl(state.market,row.slug)}">Open</a></td></tr>`).join('') || `<tr><td colspan="${columns.length + 4}">No instruments match these filters.</td></tr>`;
    query('[data-column-picker]').innerHTML = Object.entries(columnDefinitions).map(([key,[label]]) => `<label><input type="checkbox" data-column="${key}" ${state.columns.has(key) ? 'checked' : ''}> ${esc(label)}</label>`).join('');
    syncExplorerChrome();
  }
  function renderPreview(row) {
    const preview = query('[data-preview]'); state.selected = row; preview.hidden = false;
    preview.innerHTML = `<button type="button" data-close-preview aria-label="Close preview">×</button><span class="eyebrow">INSTRUMENT PREVIEW</span><h2>${esc(row.ticker)} · ${esc(row.name)}</h2><div class="market-cards">${card('Price', Number.isFinite(row.latest) ? money.format(row.latest) : '—')}${card('52W range', formatLevelPercent(row.rangePosition52w))}${card('RS percentile', Number.isFinite(row.percentile30d) ? `${number.format(row.percentile30d)}th` : '—')}${card('Trend age', Number.isFinite(row.trendAge50) ? `${row.trendAge50} sessions` : '—')}</div><p>Data quality: ${esc(qualityLabel(row))}</p><a class="market-primary" href="${detailUrl(state.market,row.slug)}">Open chart workspace</a>`;
  }
  function renderHealth() {
    const health = state.health || {}; const quality = health.quality || {};
    const usH = health.us || {}; const cryptoH = health.crypto || {};
    const marketHealth = state.market === 'crypto' ? cryptoH : usH;
    const cardsHtml = card('Pipeline', health.status || state.manifest?.status || '—') +
      card('US instruments', number.format(usH.published || health.counts?.us || 0), `Basis: ${usH.priceBasis || 'Adjusted close'}`) +
      card('Crypto assets', number.format(cryptoH.published || health.counts?.crypto || 0), `Basis: ${cryptoH.priceBasis || 'Exchange close'}`) +
      card('Failed symbols', number.format(health.failedSymbols?.length || 0)) +
      card('Daily-only instruments', number.format(quality.fourHourUnavailable || 0)) +
      card('Limited history', number.format(quality.limitedHistory || 0)) +
      card('Published model', 'Close-only') +
      card('Published', health.completedAt ? new Date(health.completedAt).toLocaleString() : '—') +
      card('Latest market observation', marketHealth.latestObservationAt ? new Date(marketHealth.latestObservationAt).toLocaleString() : '—');

    const trustPanelHtml = `<article class="market-panel" style="margin-top:1.5rem"><header><div><span class="eyebrow">DATA HEALTH &amp; TRUST</span><h2>Data Pipeline Trust Architecture</h2></div></header><div class="market-rank-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;padding:1rem;"><div style="border:1px solid var(--border-color,#333);padding:1rem;border-radius:8px;"><h3>US Equities (Focused Universe)</h3><p><strong>Provider:</strong> ${esc(usH.provider || 'Fintable API')}</p><p><strong>Price Basis:</strong> ${esc(usH.priceBasis || 'Adjusted close')}</p><p><strong>Constituents:</strong> Focused S&amp;P 500 ∪ Nasdaq-100 ∪ NYSE U.S. 100 ∪ DJIA</p><p><strong>Published:</strong> ${number.format(usH.published || health.counts?.us || 0)}</p><p><strong>Status:</strong> ${esc(usH.status || 'complete')}</p></div><div style="border:1px solid var(--border-color,#333);padding:1rem;border-radius:8px;"><h3>Crypto Assets</h3><p><strong>Provider:</strong> ${esc(cryptoH.provider || 'Binance Public Data API')}</p><p><strong>Price Basis:</strong> ${esc(cryptoH.priceBasis || 'Exchange close')}</p><p><strong>Assets:</strong> 35 Curated Cryptocurrencies</p><p><strong>Published:</strong> ${number.format(cryptoH.published || health.counts?.crypto || 0)}</p><p><strong>Status:</strong> ${esc(cryptoH.status || 'complete')}</p></div></div></article>`;

    query('[data-health]').innerHTML = cardsHtml + trustPanelHtml;
  }
  function renderCryptoRisk() {
    const data = state.correlations;
    if (!data?.symbols?.length) { query('[data-crypto-risk]').innerHTML = '<p>Crypto correlation data is not available yet.</p>'; return; }
    const symbols = data.symbols; const table = `<div class="market-table-wrap market-correlation" style="overflow-x:auto;-webkit-overflow-scrolling:touch;"><table><thead><tr><th></th>${symbols.map(symbol => `<th>${esc(symbol)}</th>`).join('')}</tr></thead><tbody>${symbols.map((symbol,row) => `<tr><th>${esc(symbol)}</th>${data.matrix[row].map(value => `<td style="--correlation:${Number.isFinite(value) ? value : 0}">${Number.isFinite(value) ? number.format(value) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    query('[data-crypto-risk]').innerHTML = `<div class="market-cards">${card('Average correlation', Number.isFinite(data.averageCorrelation) ? number.format(data.averageCorrelation) : '—')}${card('BTC-linked assets', number.format(Object.values(data.btcCorrelation || {}).filter(value => value > .7).length))}</div><article class="market-panel"><h2>200-session return correlation</h2>${table}</article>`;
  }
  function render() { syncControls(); renderPulse(); renderSignals(); renderExplorer(); renderHealth(); renderCryptoRisk(); updateLocation(); }
  async function loadRows(market) {
    if (state.rows[market]) return;
    const index = await getJson(`${DATA_ROOT}/summary/${market}/index.json`, controller.signal);
    const chunks = await Promise.all((index.chunks || []).map(chunk => getJson(`${DATA_ROOT}/summary/${market}/${chunk.path}`, controller.signal)));
    state.rows[market] = chunks.flatMap(chunk => chunk.rows || []);
  }
  async function loadMarket(market) {
    if (!state.pulse[market]) state.pulse[market] = await getJson(`${DATA_ROOT}/pulse/${market}.json`, controller.signal);
    if (market === 'crypto' && !state.correlations) state.correlations = await getJson(`${DATA_ROOT}/pulse/crypto-correlations.json`, controller.signal).catch(() => null);
    if (['signals','explorer'].includes(state.view)) await loadRows(market);
    syncExplorerChrome();
    render();
  }
  function openRow(slug) { const row = currentRows().find(item => item.slug === slug); if (row) location.href = detailUrl(state.market, slug); }
  let searchTimer = null;
  const submit = event => {
    if (!event.target.matches('[data-search-form]')) return;
    event.preventDefault();
    clearTimeout(searchTimer);
    state.query = (query('[data-search]')?.value || '').trim().toLowerCase();
    renderExplorer();
    updateLocation();
    const exact = currentRows().find(row => row.ticker.toLowerCase() === state.query) || currentRows().find(row => row.slug === state.query);
    if (exact) openRow(exact.slug);
  };
  const click = event => {
    const market = event.target.closest('[data-market]')?.dataset.market; if (market) { state.market = market; state.selected = null; loadMarket(market).catch(showError); return; }
    const view = event.target.closest('[data-view]')?.dataset.view; if (view) { state.view = view; if (view === 'crypto-risk' && state.market !== 'crypto') state.market = 'crypto'; loadMarket(state.market).catch(showError); return; }
    const watch = event.target.closest('[data-watch]')?.dataset.watch; if (watch) { event.preventDefault(); event.stopPropagation(); state.watchlist.toggle(`${state.market}:${watch}`); renderExplorer(); return; }
    if (event.target.closest('[data-columns]')) { query('[data-column-picker]').hidden = !query('[data-column-picker]').hidden; return; }
    if (event.target.closest('[data-export-csv]')) { const csv = rowsToCsv(visibleRows(), ['ticker','name','exchange',...state.columns]); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' })); link.download = `aizanoi-markets-${state.market}.csv`; link.click(); URL.revokeObjectURL(link.href); return; }
    if (event.target.closest('[data-close-preview]')) { query('[data-preview]').hidden = true; return; }
    const row = event.target.closest('tr[data-open-instrument]'); if (row && !event.target.closest('a,button')) openRow(row.dataset.openInstrument);
  };
  const change = event => {
    if (event.target.matches('[data-saved-screen]')) {
      const preset = DEFAULT_PRESETS.find(p => p.id === event.target.value);
      if (preset?.config) {
        if (preset.config.sort) state.sort = preset.config.sort;
        if (preset.config.regime) state.regime = preset.config.regime;
        state.rsiMin = preset.config.rsiMin ?? null;
        state.rsiMax = preset.config.rsiMax ?? null;
        state.rangeMin = preset.config.rangeMin ? preset.config.rangeMin / 100 : null;
        state.rangeMax = preset.config.rangeMax ? preset.config.rangeMax / 100 : null;
        query('[data-sort]').value = state.sort;
        query('[data-regime]').value = state.regime;
        query('[data-rsi-min]').value = state.rsiMin ?? '';
        query('[data-rsi-max]').value = state.rsiMax ?? '';
        query('[data-range-min]').value = state.rangeMin ? Math.round(state.rangeMin * 100) : '';
        query('[data-range-max]').value = state.rangeMax ? Math.round(state.rangeMax * 100) : '';
        renderExplorer(); updateLocation(); return;
      }
    }
    if (event.target.matches('[data-sort]')) state.sort = event.target.value;
    if (event.target.matches('[data-exchange]')) state.exchange = event.target.value;
    if (event.target.matches('[data-regime]')) state.regime = event.target.value;
    if (event.target.matches('[data-watchlist-only]')) state.watchlistOnly = event.target.checked;
    const numericFilters = { minPrice:'[data-min-price]', minSessions:'[data-min-sessions]', rsiMin:'[data-rsi-min]', rsiMax:'[data-rsi-max]', rangeMin:'[data-range-min]', rangeMax:'[data-range-max]' };
    for (const [key,selector] of Object.entries(numericFilters)) {
      if (event.target.matches(selector)) {
        const value = Number(event.target.value);
        state[key] = event.target.value === '' ? null : (key.startsWith('range') ? value / 100 : value);
      }
    }
    if (event.target.matches('[data-column]')) event.target.checked ? state.columns.add(event.target.dataset.column) : state.columns.delete(event.target.dataset.column);
    renderExplorer(); updateLocation();
  };
  const input = event => {
    if (event.target.matches('[data-search]')) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = event.target.value.trim().toLowerCase();
        renderExplorer();
        updateLocation();
      }, 150);
    }
  };
  const dblclick = event => { const row = event.target.closest('tr[data-open-instrument]'); if (row) openRow(row.dataset.openInstrument); };
  const keydown = event => { if (event.target.matches?.('[data-search]') && event.key === 'Enter') { event.preventDefault(); query('[data-search-form]').requestSubmit(); return; } const row = event.target.closest?.('tr[data-open-instrument]'); if (row && event.key === 'Enter') openRow(row.dataset.openInstrument); };
  function showError(error) { query('[data-error]').hidden = false; query('[data-error]').textContent = error.message; }
  container.addEventListener('click', click); container.addEventListener('change', change); container.addEventListener('input', input); container.addEventListener('submit', submit); container.addEventListener('dblclick', dblclick); container.addEventListener('keydown', keydown);
  Promise.all([getJson(`${DATA_ROOT}/manifest.json`, controller.signal), getJson(`${DATA_ROOT}/health.json`, controller.signal).catch(() => null), getJson(`${DATA_ROOT}/snapshots/pulse.json`, controller.signal).catch(() => ({ snapshots:[] }))]).then(([manifest,health,snapshots]) => { state.manifest = manifest; state.health = health; state.snapshots = snapshots.snapshots || []; query('[data-freshness]').textContent = `Published ${new Date(manifest.completedAt).toLocaleString()}`; return loadMarket(state.market); }).catch(showError);
  syncControls();
  return () => { clearTimeout(searchTimer); controller.abort(); container.replaceChildren(); };
}
