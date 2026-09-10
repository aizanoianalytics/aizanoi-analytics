const DATA_ROOT = '/analytics/markets/data';
const MANIFEST_URL = '/analytics/markets/data/manifest.json';
const SUMMARY_URL = '/analytics/markets/data/summary.json';
const initialMarket = new URLSearchParams(location.search).get('market');
const state = { market:['us','crypto'].includes(initialMarket) ? initialMarket : 'us', summaries:{ us:[], crypto:[] }, query:'', sort:'return30d', detailPayload:null, detailFrequency:'4h' };
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits:2 });
const money = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });
const percent = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${number.format(value * 100)}%` : '—';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function json(path) {
  const response = await fetch(path, { cache:'no-store' });
  if (!response.ok) throw new Error(`Market data unavailable (${response.status})`);
  return response.json();
}

function pulse(rows) {
  const observed = rows.filter((row) => Number.isFinite(row.return1d));
  const advancing = observed.filter((row) => row.return1d > 0).length;
  const above200 = rows.filter((row) => row.aboveSma200 === true).length;
  const returns = rows.map((row) => row.return30d).filter(Number.isFinite).sort((a,b) => a-b);
  const median = returns.length ? returns[Math.floor(returns.length / 2)] : null;
  const values = [number.format(rows.length), observed.length ? percent(advancing / observed.length) : '—', rows.length ? percent(above200 / rows.length) : '—', percent(median)];
  document.querySelectorAll('[data-pulse] strong').forEach((node,index) => { node.textContent = values[index]; });
}

function signalCard(title, copy, row, value) {
  if (!row) return '';
  return `<button class="signal-card" data-symbol="${escapeHtml(row.slug)}"><span>${escapeHtml(title)}</span><strong>${escapeHtml(row.ticker)}</strong><p>${escapeHtml(row.name)}</p><em>${escapeHtml(copy(value))}</em></button>`;
}

function signals(rows) {
  const max = (key) => [...rows].filter((row) => Number.isFinite(row[key])).sort((a,b) => b[key]-a[key])[0];
  const min = (key) => [...rows].filter((row) => Number.isFinite(row[key])).sort((a,b) => a[key]-b[key])[0];
  document.querySelector('[data-signals]').innerHTML = [
    signalCard('Momentum leader', percent, max('return30d'), max('return30d')?.return30d),
    signalCard('Unusual volume', (value) => `${number.format(value)}σ vs 20-session norm`, max('volumeZ20'), max('volumeZ20')?.volumeZ20),
    signalCard('Volatility watch', (value) => `${percent(value)} annualized`, max('volatility20'), max('volatility20')?.volatility20),
    signalCard('Deepest drawdown', percent, min('drawdown1y'), min('drawdown1y')?.drawdown1y),
  ].join('') || '<p>No complete signals are available yet.</p>';
}

function renderRows() {
  const rows = state.summaries[state.market] || [];
  const filtered = rows.filter((row) => `${row.ticker} ${row.name}`.toLowerCase().includes(state.query));
  filtered.sort((a,b) => (Number.isFinite(b[state.sort]) ? b[state.sort] : -Infinity) - (Number.isFinite(a[state.sort]) ? a[state.sort] : -Infinity));
  document.querySelector('[data-market-rows]').innerHTML = filtered.slice(0,250).map((row) => `<tr tabindex="0" data-symbol="${escapeHtml(row.slug)}"><td><strong>${escapeHtml(row.ticker)}</strong><span>${escapeHtml(row.name)}</span></td><td>${Number.isFinite(row.latest) ? money.format(row.latest) : '—'}</td><td class="${row.return1d >= 0 ? 'up' : 'down'}">${percent(row.return1d)}</td><td class="${row.return30d >= 0 ? 'up' : 'down'}">${percent(row.return30d)}</td><td>${percent(row.volatility20)}</td><td>${Number.isFinite(row.volumeZ20) ? `${number.format(row.volumeZ20)}σ` : '—'}</td><td>${row.aboveSma200 === true ? 'Above 200D' : row.aboveSma200 === false ? 'Below 200D' : '—'}</td></tr>`).join('') || '<tr><td colspan="7">No instruments match this search.</td></tr>';
  pulse(rows); signals(rows);
}

function renderDetail() {
  const detail = document.querySelector('[data-detail]');
  const payload = state.detailPayload;
  if (!payload) return;
  const hasFourHour = Array.isArray(payload.fourHour) && payload.fourHour.length > 0;
  const frequency = state.detailFrequency === '4h' && hasFourHour ? '4h' : '1d';
  const candles = frequency === '4h' ? payload.fourHour : (payload.daily || []);
  const closes = candles.slice(-180).map((candle) => candle.c).filter(Number.isFinite);
  const low = Math.min(...closes); const high = Math.max(...closes); const spread = high-low || 1;
  const points = closes.map((value,index) => `${(index / Math.max(closes.length-1,1))*700},${180-((value-low)/spread)*160}`).join(' ');
  const recentRows = candles.slice(-10).reverse().map((candle) => `<tr><td>${new Date(candle.t * 1000).toLocaleString()}</td><td>${Number.isFinite(candle.o) ? money.format(candle.o) : '—'}</td><td>${Number.isFinite(candle.h) ? money.format(candle.h) : '—'}</td><td>${Number.isFinite(candle.l) ? money.format(candle.l) : '—'}</td><td>${Number.isFinite(candle.c) ? money.format(candle.c) : '—'}</td><td>${Number.isFinite(candle.v) ? number.format(candle.v) : '—'}</td></tr>`).join('');
  detail.innerHTML = `<div><p class="eyebrow">INSTRUMENT DETAIL</p><h2>${escapeHtml(payload.ticker)} · ${escapeHtml(payload.name)}</h2><p>${escapeHtml(payload.exchange || state.market.toUpperCase())} · ${frequency === '4h' ? 'Recent four-hour history' : `Daily history from ${escapeHtml(payload.startDate || 'first available session')}`} · ${number.format(candles.length)} observations</p><div class="frequency-toggle" aria-label="Price history frequency"><button type="button" data-frequency="4h" aria-pressed="${frequency === '4h'}" ${hasFourHour ? '' : 'disabled'}>4H</button><button type="button" data-frequency="1d" aria-pressed="${frequency === '1d'}">Daily</button></div></div><svg viewBox="0 0 700 200" role="img" aria-label="Recent closing price history"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4" vector-effect="non-scaling-stroke"/></svg><div class="market-table-wrap detail-table"><table aria-label="Recent price history data"><thead><tr><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead><tbody>${recentRows}</tbody></table></div><div class="detail-actions"><a href="https://finance.yahoo.com/quote/${encodeURIComponent(payload.yahooSymbol)}" target="_blank" rel="noopener noreferrer">Open source quote ↗</a><button type="button" data-close-detail>Close</button></div>`;
}

async function showDetail(slug) {
  const detail = document.querySelector('[data-detail]');
  detail.hidden = false;
  detail.innerHTML = '<p>Loading instrument history…</p>';
  try {
    state.detailPayload = await json(`${DATA_ROOT}/history/${state.market}/${encodeURIComponent(slug)}.json`);
    state.detailFrequency = state.detailPayload.fourHour?.length ? '4h' : '1d';
    renderDetail();
    detail.scrollIntoView({ behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  } catch (error) { detail.innerHTML = `<h2>History unavailable</h2><p>${escapeHtml(error.message)}</p><button type="button" data-close-detail>Close</button>`; }
}

function syncTabs() {
  document.querySelectorAll('[data-market]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.market === state.market)));
  document.querySelector('#market-dashboard').setAttribute('aria-labelledby', `tab-${state.market}`);
}

async function boot() {
  syncTabs();
  try {
    const [manifest, summary] = await Promise.all([json(MANIFEST_URL), json(SUMMARY_URL)]);
    state.summaries = summary.markets;
    document.querySelector('[data-freshness]').textContent = new Date(manifest.completedAt).toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' });
    renderRows();
  } catch (error) {
    document.querySelector('[data-freshness]').textContent = 'Data temporarily unavailable';
    document.querySelector('[data-market-rows]').innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
  }
}

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-market]');
  if (tab) {
    state.market = tab.dataset.market;
    syncTabs();
    history.replaceState(null, '', `${location.pathname}?market=${state.market}`);
    renderRows();
  }
  const symbol = event.target.closest('[data-symbol]')?.dataset.symbol;
  if (symbol) showDetail(symbol);
  const frequencyButton = event.target.closest('[data-frequency]');
  if (frequencyButton && !frequencyButton.disabled) {
    state.detailFrequency = frequencyButton.dataset.frequency;
    renderDetail();
  }
  if (event.target.closest('[data-close-detail]')) document.querySelector('[data-detail]').hidden = true;
});
document.addEventListener('keydown', (event) => {
  const symbol = event.target.closest?.('[data-symbol]')?.dataset.symbol;
  if (symbol && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    showDetail(symbol);
  }
});
document.querySelector('[data-search]').addEventListener('input', (event) => { state.query = event.target.value.trim().toLowerCase(); renderRows(); });
document.querySelector('[data-sort]').addEventListener('change', (event) => { state.sort = event.target.value; renderRows(); });
boot();
