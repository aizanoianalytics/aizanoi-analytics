const MANIFEST_URL = '/analytics/markets/data/manifest.json';
const SUMMARY_URL = '/analytics/markets/data/summary.json';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });
const percent = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${number.format(value * 100)}%` : '—';

function pulseCards(rows) {
  const observed = rows.filter((row) => Number.isFinite(row.return1d));
  const advancing = observed.filter((row) => row.return1d > 0).length;
  const above200 = rows.filter((row) => row.aboveSma200 === true).length;
  const returns = rows.map((row) => row.return30d).filter(Number.isFinite).sort((a, b) => a - b);
  const median = returns.length ? returns[Math.floor(returns.length / 2)] : null;
  return [
    [number.format(rows.length), 'instruments'],
    [observed.length ? percent(advancing / observed.length) : '—', 'advancing 1D'],
    [rows.length ? percent(above200 / rows.length) : '—', 'above 200D'],
    [percent(median), 'median 30D'],
  ];
}

function signalCards(rows) {
  const max = (key) => [...rows].filter((row) => Number.isFinite(row[key])).sort((a, b) => b[key] - a[key])[0];
  const min = (key) => [...rows].filter((row) => Number.isFinite(row[key])).sort((a, b) => a[key] - b[key])[0];
  return [
    ['Momentum leader', (row) => `${esc(row.ticker)} ${percent(row.return30d)} · 30D`, max('return30d')],
    ['Unusual volume', (row) => `${esc(row.ticker)} ${number.format(row.volumeZ20)}σ vs norm`, max('volumeZ20')],
    ['Volatility watch', (row) => `${esc(row.ticker)} ${percent(row.volatility20)} annualized`, max('volatility20')],
    ['Deepest drawdown', (row) => `${esc(row.ticker)} ${percent(row.drawdown1y)} · 1Y`, min('drawdown1y')],
  ].filter(([, , row]) => Boolean(row))
    .map(([title, render, row]) => `<article class="az-markets-signal"><span>${esc(title)}</span><strong>${render(row)}</strong></article>`)
    .join('');
}

function tableRows(state) {
  const rows = state.summaries[state.market] || [];
  const query = state.query.trim().toLowerCase();
  const filtered = rows.filter((row) => `${row.ticker} ${row.name}`.toLowerCase().includes(query));
  filtered.sort((a, b) => (Number.isFinite(b[state.sort]) ? b[state.sort] : -Infinity) - (Number.isFinite(a[state.sort]) ? a[state.sort] : -Infinity));
  return filtered.slice(0, 250).map((row) => `<tr tabindex="0" data-symbol="${esc(row.slug)}"><td><strong>${esc(row.ticker)}</strong><span>${esc(row.name)}</span></td><td>${Number.isFinite(row.latest) ? money.format(row.latest) : '—'}</td><td class="${row.return1d >= 0 ? 'up' : 'down'}">${percent(row.return1d)}</td><td class="${row.return30d >= 0 ? 'up' : 'down'}">${percent(row.return30d)}</td><td>${percent(row.volatility20)}</td><td>${Number.isFinite(row.volumeZ20) ? `${number.format(row.volumeZ20)}σ` : '—'}</td><td>${row.aboveSma200 === true ? 'Above 200D' : row.aboveSma200 === false ? 'Below 200D' : '—'}</td></tr>`).join('')
    || '<tr><td colspan="7">No instruments match this search.</td></tr>';
}

function detailMarkup(state) {
  const payload = state.detailPayload;
  if (!payload) return '';
  const hasFourHour = Array.isArray(payload.fourHour) && payload.fourHour.length > 0;
  const frequency = state.detailFrequency === '4h' && hasFourHour ? '4h' : '1d';
  const candles = frequency === '4h' ? payload.fourHour : (payload.daily || []);
  const closes = candles.slice(-180).map((candle) => candle.c).filter(Number.isFinite);
  const low = Math.min(...closes); const high = Math.max(...closes); const spread = high - low || 1;
  const points = closes.map((value, index) => `${(index / Math.max(closes.length - 1, 1)) * 280},${92 - ((value - low) / spread) * 76}`).join(' ');
  const recentRows = candles.slice(-6).reverse().map((candle) => `<tr><td>${new Date(candle.t * 1000).toLocaleString(undefined, { dateStyle:'short', timeStyle: frequency === '4h' ? 'short' : undefined })}</td><td>${Number.isFinite(candle.c) ? money.format(candle.c) : '—'}</td><td>${Number.isFinite(candle.v) ? number.format(candle.v) : '—'}</td></tr>`).join('');
  return `<div class="az-markets-detail"><div class="az-markets-detail-head"><div><p class="az-kicker">INSTRUMENT DETAIL</p><h3>${esc(payload.ticker)} · ${esc(payload.name)}</h3><p>${number.format(candles.length)} observations · ${frequency === '4h' ? 'four-hour' : 'daily'} history</p></div><div class="az-markets-detail-actions"><button class="az-button" type="button" data-market-frequency="4h" ${hasFourHour ? '' : 'disabled'}>4H</button><button class="az-button" type="button" data-market-frequency="1d">Daily</button><a class="az-button" href="https://finance.yahoo.com/quote/${encodeURIComponent(payload.yahooSymbol)}" target="_blank" rel="noopener noreferrer">Yahoo quote ↗</a><button class="az-button" type="button" data-market-close-detail>Close</button></div></div><svg viewBox="0 0 280 100" role="img" aria-label="Recent closing price history for ${esc(payload.ticker)}"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg><table class="az-markets-detail-table"><thead><tr><th>Date</th><th>Close</th><th>Volume</th></tr></thead><tbody>${recentRows}</tbody></table></div>`;
}

function renderShell(container, state) {
  container.innerHTML = `<div class="az-app-shell az-markets-app">
    <div class="az-markets-bar">
      <div class="az-markets-tabs" role="tablist" aria-label="Market universe">
        <button class="az-button" type="button" role="tab" data-market-tab="us" aria-selected="true">US Markets</button>
        <button class="az-button" type="button" role="tab" data-market-tab="crypto" aria-selected="false">Crypto</button>
      </div>
      <a class="az-button az-markets-open" href="/analytics/markets/?market=${esc(state.market)}" target="_blank" rel="noopener noreferrer">Open full page ↗</a>
    </div>
    <div class="az-markets-freshness"><span>DATA FRESHNESS</span><strong data-market-freshness>Loading…</strong></div>
    <div class="az-markets-pulse" data-market-pulse></div>
    <div class="az-markets-signals" data-market-signals aria-label="Standout signals"></div>
    <div class="az-markets-controls">
      <input type="search" data-market-search placeholder="Search ticker or company" aria-label="Search instruments">
      <select data-market-sort aria-label="Rank instruments by">
        <option value="return30d">30-day return</option>
        <option value="volumeZ20">Unusual volume</option>
        <option value="volatility20">20-day volatility</option>
        <option value="drawdown1y">1-year drawdown</option>
        <option value="distanceFrom52wHigh">52-week high distance</option>
      </select>
    </div>
    <div class="az-markets-table-wrap"><table><thead><tr><th>Instrument</th><th>Price</th><th>1D</th><th>30D</th><th>Volatility</th><th>Volume</th><th>Trend</th></tr></thead><tbody data-market-rows><tr><td colspan="7">Loading the static market snapshot…</td></tr></tbody></table></div>
    <div data-market-detail></div>
  </div>`;
}

function syncMarketButtons(state) {
  for (const button of document.querySelectorAll('[data-market-tab]')) {
    button.setAttribute('aria-selected', String(button.dataset.marketTab === state.market));
  }
}

function renderData(container, state) {
  const rows = state.summaries[state.market] || [];
  container.querySelector('[data-market-pulse]').innerHTML = pulseCards(rows)
    .map(([value, label]) => `<article><strong>${esc(value)}</strong><span>${esc(label)}</span></article>`).join('');
  container.querySelector('[data-market-signals]').innerHTML = signalCards(rows);
  container.querySelector('[data-market-rows]').innerHTML = tableRows(state);
  const existing = container.querySelector('[data-market-detail]');
  existing.innerHTML = state.detailPayload ? detailMarkup(state) : '';
  const openLink = container.querySelector('.az-markets-open');
  if (openLink) openLink.href = `/analytics/markets/?market=${esc(state.market)}`;
}

export function createMarketsApp() {
  return {
    async mount(container) {
      const state = { market:'us', summaries:{ us:[], crypto:[] }, query:'', sort:'return30d', detailPayload:null, detailFrequency:'4h' };
      renderShell(container, state);
      const controller = new AbortController();
      const clickHandler = (event) => {
        const tab = event.target.closest('[data-market-tab]');
        if (tab) {
          state.market = tab.dataset.marketTab;
          state.detailPayload = null;
          syncMarketButtons(state);
          renderData(container, state);
          return;
        }
        const symbol = event.target.closest('[data-symbol]')?.dataset.symbol;
        if (symbol) { showDetail(symbol); return; }
        const frequency = event.target.closest('[data-market-frequency]');
        if (frequency && !frequency.disabled) {
          state.detailFrequency = frequency.dataset.marketFrequency;
          const detail = container.querySelector('[data-market-detail]');
          detail.innerHTML = detailMarkup(state);
          return;
        }
        if (event.target.closest('[data-market-close-detail]')) {
          state.detailPayload = null;
          container.querySelector('[data-market-detail]').innerHTML = '';
        }
      };
      const keyHandler = (event) => {
        const symbol = event.target.closest?.('[data-symbol]')?.dataset.symbol;
        if (symbol && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          showDetail(symbol);
        }
      };
      const searchHandler = (event) => { state.query = event.target.value; renderData(container, state); };
      const sortHandler = (event) => { state.sort = event.target.value; renderData(container, state); };
      async function showDetail(slug) {
        const detail = container.querySelector('[data-market-detail]');
        detail.innerHTML = '<p class="az-markets-loading">Loading instrument history…</p>';
        try {
          state.detailPayload = await fetch(`/analytics/markets/data/history/${state.market}/${encodeURIComponent(slug)}.json`, { cache:'no-store', signal:controller.signal })
            .then((response) => { if (!response.ok) throw new Error(`History unavailable (${response.status})`); return response.json(); });
          state.detailFrequency = state.detailPayload.fourHour?.length ? '4h' : '1d';
          detail.innerHTML = detailMarkup(state);
        } catch (error) {
          if (error?.name === 'AbortError') return;
          detail.innerHTML = `<p class="az-markets-loading">${esc(error.message)}</p>`;
        }
      }
      container.addEventListener('click', clickHandler);
      container.addEventListener('keydown', keyHandler);
      container.querySelector('[data-market-search]').addEventListener('input', searchHandler);
      container.querySelector('[data-market-sort]').addEventListener('change', sortHandler);
      try {
        const [manifestResponse, summaryResponse] = await Promise.all([
          fetch(MANIFEST_URL, { cache:'no-store', signal:controller.signal }),
          fetch(SUMMARY_URL, { cache:'no-store', signal:controller.signal }),
        ]);
        if (!manifestResponse.ok || !summaryResponse.ok) throw new Error(`Market data unavailable (${manifestResponse.status})`);
        const [manifest, summary] = await Promise.all([manifestResponse.json(), summaryResponse.json()]);
        state.summaries = summary.markets;
        container.querySelector('[data-market-freshness]').textContent = new Date(manifest.completedAt).toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' });
        renderData(container, state);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          container.querySelector('[data-market-freshness]').textContent = 'Data temporarily unavailable';
          container.querySelector('[data-market-rows]').innerHTML = `<tr><td colspan="7">${esc(error.message)}</td></tr>`;
        }
      }
      return () => {
        controller.abort();
        container.removeEventListener('click', clickHandler);
        container.removeEventListener('keydown', keyHandler);
        container.querySelector('[data-market-search]')?.removeEventListener('input', searchHandler);
        container.querySelector('[data-market-sort]')?.removeEventListener('change', sortHandler);
      };
    },
  };
}
