import {
  CHANGE_COLUMNS,
  COMPACT_CHANGE_COLUMNS,
  COMPACT_PRICE_COLUMNS,
  HORIZON_CARDS,
  PRICE_COLUMNS,
  RANKING_PRESETS,
  activeFilterChips,
  defaultState,
  detailUrl,
  evaluateMomentumEligibility,
  filterRows,
  formatNumber,
  formatPercent,
  formatPrice,
  formatShortDate,
  formatSignedReturn,
  horizonSignLine,
  marketSessionState,
  paginate,
  pickMomentumRows,
  PICK_HORIZONS,
  PICK_HORIZON_LABELS,
  sortRows,
} from './core.js';

const DATA_ROOT = '/analytics/markets/data';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function horizonSign(value) {
  if (!Number.isFinite(value)) return { char:'—', modifier:'missing' };
  if (value > 0) return { char:'+', modifier:'positive' };
  if (value < 0) return { char:'−', modifier:'negative' };
  return { char:'0', modifier:'flat' };
}

export async function getJson(path, signal) {
  const response = await fetch(path, { cache:'default', signal });
  if (!response.ok) throw new Error(`Market data unavailable (${response.status})`);
  return response.json();
}

function pickRanking(rows, key, descending, limit = 5) {
  return rows
    .filter(row => Number.isFinite(row?.[key]))
    .sort((a, b) => descending ? b[key] - a[key] : a[key] - b[key])
    .slice(0, limit);
}

function renderRankingCard(title, key, descending) {
  const rows = pickRanking(this.currentRows(), key, descending, 5);
  if (!rows.length) {
    return `<article class="market-ranking" data-ranking><h3>${esc(title)}</h3><p class="market-ranking-empty">Not enough observations yet.</p></article>`;
  }
  return `<article class="market-ranking" data-ranking><h3>${esc(title)}</h3><ol class="market-ranking-list">${rows.map(row => `
    <li>
      <button type="button" class="market-ranking-row" data-ranking-symbol="${esc(row.slug)}">
        <span class="market-ranking-text"><strong>${esc(row.ticker)}</strong><span class="market-ranking-name">${esc(row.name)}</span></span>
        <span class="market-ranking-numbers"><span class="market-ranking-price">${formatPrice(row.latestPrice ?? row.latest, this.market)}</span><span class="market-ranking-change market-ranking-change--${horizonSign(row[key]).modifier}">${formatPercent(row[key])}</span></span>
      </button>
    </li>`).join('')}</ol></article>`;
}

function renderStaleBanner(health) {
  const degraded = health?.status && health.status !== 'complete';
  if (!degraded) return '';
  const when = formatShortDate(health?.completedAt || health?.publishedAt);
  return `<div class="market-stale-banner" data-stale-banner role="status">Pipeline degraded — showing the last published snapshot${when !== '—' ? ` (${esc(when)})` : ''}.</div>`;
}

function renderStatusStrip({ manifest, health, market }) {
  const marketHealth = health?.[market] || {};
  const observations = manifest?.counts?.[market] ?? marketHealth.published ?? null;
  const observationLabel = formatShortDate(marketHealth.latestObservationAt);
  const publishedLabel = formatShortDate(manifest?.completedAt);
  const provider = market === 'crypto' ? 'Binance' : 'Fintable';
  const cadence = market === 'crypto' ? 'Daily close / 4H bars' : 'Daily close';
  return `<div class="market-status-strip" data-status-strip>
    <span><strong>${formatNumber(observations)}</strong> instruments</span>
    <span>As of close <strong>${esc(observationLabel)}</strong></span>
    <span>Snapshot published <strong>${esc(publishedLabel)}</strong></span>
    <span>Source <strong>${esc(provider)}</strong></span>
    <span>${esc(cadence)}</span>
  </div>`;
}

function renderRankingBlock(state) {
  const preset = RANKING_PRESETS.find(item => item.id === state.rankingPreset) || RANKING_PRESETS[0];
  const card = renderRankingCard.call(this, preset.label, preset.key, preset.descending);
  return `<section class="market-rankings" data-rankings-block>
    <header class="market-rankings-header">
      <h2>Market rankings</h2>
      <div class="market-ranking-switch" role="tablist" aria-label="Ranking horizon">
        ${RANKING_PRESETS.map(item => `<button type="button" data-ranking-preset="${esc(item.id)}" aria-selected="${item.id === preset.id}">${esc(item.label)}</button>`).join('')}
      </div>
    </header>
    <div class="market-rankings-grid market-rankings-grid--single">${card}</div>
  </section>`;
}

function renderFilterChips(chips) {
  if (!chips.length) return '<div class="market-filter-chips" data-filter-chips hidden></div>';
  return `<div class="market-filter-chips" data-filter-chips>${chips.map(chip => `<button type="button" class="market-chip" data-chip-key="${esc(chip.key)}"><span>${esc(chip.label)}</span><span aria-hidden="true">×</span></button>`).join('')}</div>`;
}

function renderTableHead(state, columns) {
  const indicator = state.sort?.key ? `<span class="market-sort-indicator" aria-hidden="true">${state.sort.direction === 'asc' ? '↑' : '↓'}</span>` : '';
  return `<tr>
    <th scope="col" class="market-table-stock"><button type="button" data-sort-key="ticker" class="market-sort-header">Stock${state.sort?.key === 'ticker' ? indicator : ''}</button></th>
    ${columns.map(col => {
      const active = state.sort?.key === col.key;
      const next = active && state.sort.direction === 'desc' ? 'asc' : 'desc';
      const ariaSort = active ? (state.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
      return `<th scope="col" aria-sort="${ariaSort}"><button type="button" class="market-sort-header" data-sort-key="${esc(col.key)}" data-sort-direction="${esc(next)}">${esc(col.label)}${active ? indicator : ''}</button></th>`;
    }).join('')}
    <th scope="col" class="market-table-open"><span class="visually-hidden">Open</span></th>
  </tr>`;
}

function renderTableRow(row, columns, state) {
  const isSelected = state.selectedSymbol === row.slug;
  const cells = columns.map(col => `<td data-col="${esc(col.key)}">${formatCell(col, row, state.market)}</td>`).join('');
  return `<tr class="market-table-row${isSelected ? ' is-selected' : ''}" data-symbol="${esc(row.slug)}" data-open-instrument="${esc(row.slug)}" tabindex="0">
    <td data-col="stock"><strong>${esc(row.ticker)}</strong><span class="market-table-name">${esc(row.name)}</span></td>
    ${cells}
    <td class="market-table-open"><a class="market-table-open-link" href="${detailUrl(state.market, row.slug)}">Open →</a></td>
  </tr>`;
}

function formatCell(column, row, market) {
  const value = row[column.key];
  if (column.key === 'latestPrice') return formatPrice(value, market);
  if (column.key === 'previousPrice') return formatPrice(value, market);
  if (column.key.startsWith('price')) return formatPrice(value, market);
  return formatPercent(value);
}

function renderPager(page, pageSize, total) {
  if (total === 0) {
    return `<div class="market-pager" data-pager><span>0 results</span></div>`;
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return `<div class="market-pager" data-pager>
    <button type="button" class="market-pager-button" data-page-action="prev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
    <span class="market-pager-status">Page ${page} of ${totalPages} · Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}</span>
    <button type="button" class="market-pager-button" data-page-action="next" ${page >= totalPages ? 'disabled' : ''}>Next</button>
  </div>`;
}

function renderTableFilters(state, rows, columnCount) {
  const exchanges = [...new Set(rows.map(row => row.exchange).filter(Boolean))].sort();
  const memberships = [...new Set(rows.flatMap(row => Array.isArray(row.memberships) ? row.memberships : []))].sort();
  const isCrypto = state.market === 'crypto';
  return `<tr id="raw-data-filters" class="market-table-filter-row" data-table-filter-row${state.filtersOpen ? '' : ' hidden'}>
    <th colspan="${columnCount + 2}">
      <form class="market-table-filter-form" data-filter-form role="search" aria-label="Filter raw data">
        <label class="market-table-filter-search"><span>Search</span><input data-search type="search" placeholder="Ticker or company" value="${esc(state.query)}" autocomplete="off"></label>
        ${isCrypto ? '' : `<label><span>Exchange</span><select data-exchange><option value="">All exchanges</option>${exchanges.map(value => `<option value="${esc(value)}"${state.exchange === value ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`}
        ${isCrypto ? '' : `<label><span>Membership</span><select data-membership><option value="">All memberships</option>${memberships.map(value => `<option value="${esc(value)}"${state.membership === value ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`}
        <label><span>Price range</span><span class="market-table-filter-pair"><input type="number" inputmode="decimal" data-min-price min="0" placeholder="Min" value="${Number.isFinite(state.minPrice) ? esc(state.minPrice) : ''}"><input type="number" inputmode="decimal" data-max-price min="0" placeholder="Max" value="${Number.isFinite(state.maxPrice) ? esc(state.maxPrice) : ''}"></span></label>
        <fieldset class="market-table-filter-performance"><legend>Performance</legend><span class="market-table-filter-performance-row"><select data-performance-horizon><option value="">Any period</option>${PICK_HORIZONS.map(key => `<option value="${esc(key)}"${state.performance?.horizon === key ? ' selected' : ''}>${esc(PICK_HORIZON_LABELS[key])}</option>`).join('')}</select><select data-performance-op><option value="gt"${state.performance?.op === 'gt' ? ' selected' : ''}>&gt;</option><option value="lt"${state.performance?.op === 'lt' ? ' selected' : ''}>&lt;</option><option value="between"${state.performance?.op === 'between' ? ' selected' : ''}>between</option></select><input type="number" inputmode="decimal" step="1" data-performance-min placeholder="e.g. 5 = +5%" value="${Number.isFinite(state.performance?.min) ? esc(state.performance.min * 100) : ''}"><input type="number" inputmode="decimal" step="1" data-performance-max placeholder="Max %" ${state.performance?.op === 'between' ? '' : 'disabled '}value="${Number.isFinite(state.performance?.max) ? esc(state.performance.max * 100) : ''}"></span></fieldset>
        <button type="button" class="market-table-filter-reset" data-filter-reset>Clear filters</button>
      </form>
    </th>
  </tr>`;
}

function visibleColumns(state, compact) {
  if (state.columnsExpanded) return state.priceMode === 'price' ? PRICE_COLUMNS : CHANGE_COLUMNS;
  if (compact) return state.priceMode === 'price' ? COMPACT_PRICE_COLUMNS : COMPACT_CHANGE_COLUMNS;
  return state.priceMode === 'price'
    ? PRICE_COLUMNS.filter(col => ['latestPrice', 'previousPrice', 'price1w', 'price1y'].includes(col.key))
    : CHANGE_COLUMNS.filter(col => ['return1d', 'return1w', 'return1m', 'return1y'].includes(col.key));
}

function renderPreviewDrawer(state, rows) {
  const row = rows.find(item => item.slug === state.selectedSymbol);
  if (!row) return '';
  const eligibility = evaluateMomentumEligibility(row);
  return `<aside class="market-drawer" data-drawer>
    <header class="market-drawer-head">
      <div>
        <span class="eyebrow">PREVIEW</span>
        <h3>${esc(row.ticker)}</h3>
        <p>${esc(row.name)}</p>
      </div>
      <button type="button" class="market-drawer-close" data-drawer-close aria-label="Close preview">×</button>
    </header>
    <p class="market-drawer-price">${formatPrice(row.latestPrice ?? row.latest, state.market)} <span class="market-ranking-change market-ranking-change--${horizonSign(row.return1d).modifier}">${formatPercent(row.return1d)}</span></p>
    <p class="market-drawer-meta">1W ${formatPercent(row.return1w)} · 1Y ${formatPercent(row.return1y)} · ${esc(eligibility.eligibility === 'strong' ? `${eligibility.positiveCount}/9 strong` : eligibility.eligibility === 'weak' ? `${eligibility.negativeCount}/9 weak` : 'Picks ineligible')}</p>
    <p class="market-picks-signline" aria-label="Nine-horizon signs">${esc(horizonSignLine(row))}</p>
    <a class="market-table-open-link" href="${detailUrl(state.market, row.slug)}">Open workspace →</a>
  </aside>`;
}

function renderRawData(state) {
  const compact = Boolean(this.compact);
  const columns = visibleColumns(state, compact);
  const filtered = filterRows(this.currentRows(), state);
  const sorted = state.sort?.key ? sortRows(filtered, state.sort.key, state.sort.direction) : filtered;
  const pageState = paginate(sorted, state.page, state.pageSize);
  const chips = renderFilterChips(activeFilterChips(state));
  const table = `<div class="market-table-wrap" data-raw-table-wrap>
    <table class="market-table" data-raw-table>
      <thead>${renderTableHead(state, columns)}${renderTableFilters(state, this.currentRows(), columns.length)}</thead>
      <tbody data-raw-table-body>
        ${pageState.rows.length
          ? pageState.rows.map(row => renderTableRow(row, columns, state)).join('')
          : `<tr><td colspan="${columns.length + 2}" class="market-table-empty">No instruments match these filters. <button type="button" class="market-table-filter-reset" data-filter-reset>Clear filters</button></td></tr>`}
      </tbody>
    </table>
  </div>`;
  return `<section class="market-raw" data-raw-section>
    <header class="market-raw-header">
      <div><span class="eyebrow">RAW DATA</span><h2>Raw Data</h2></div>
      <div class="market-raw-actions"><button type="button" class="market-table-filter-toggle" data-table-filter-toggle aria-expanded="${state.filtersOpen}" aria-controls="raw-data-filters"><span aria-hidden="true">≡</span> Filters${activeFilterChips(state).length ? ` (${activeFilterChips(state).length})` : ''}</button><div class="market-raw-mode" role="group" aria-label="Raw data mode"><button type="button" class="market-raw-mode-button${state.priceMode === 'price' ? ' is-active' : ''}" data-price-mode="price" aria-pressed="${state.priceMode === 'price'}">Price</button><button type="button" class="market-raw-mode-button${state.priceMode === 'change' ? ' is-active' : ''}" data-price-mode="change" aria-pressed="${state.priceMode === 'change'}">Change</button><button type="button" class="market-raw-mode-button${state.columnsExpanded ? ' is-active' : ''}" data-columns-expanded aria-pressed="${state.columnsExpanded}">More columns</button></div><button type="button" class="market-export-button" data-export-csv>Export CSV</button><span class="market-export-status" data-export-status role="status"></span></div>
    </header>
    ${chips}
    ${table}
    ${renderPager(pageState.page, pageState.pageSize, pageState.total)}
    ${renderPreviewDrawer(state, this.currentRows())}
  </section>`;
}

function renderPicks(state) {
  const strong = pickMomentumRows(this.currentRows()).filter(row => evaluateMomentumEligibility(row).eligibility === 'strong');
  const weak = pickMomentumRows(this.currentRows()).filter(row => evaluateMomentumEligibility(row).eligibility === 'weak');
  const card = (title, rows, sign) => {
    if (!rows.length) {
      return `<article class="market-picks-card"><span class="eyebrow">AIZANOI PICKS</span><h3>${esc(title)}</h3><p class="market-picks-empty">No instruments currently meet the 8-of-9 ${sign === 'positive' ? 'Strong' : 'Weak'} Momentum rule.</p></article>`;
    }
    return `<article class="market-picks-card">
      <span class="eyebrow">AIZANOI PICKS</span>
      <h3>${esc(title)}</h3>
      <p class="market-picks-rule">Eligible when at least 8 of 9 horizons are ${sign}.</p>
      <ul class="market-picks-list">
        ${rows.map(row => {
          const eligibility = evaluateMomentumEligibility(row);
          const line = horizonSignLine(row);
          return `<li class="market-picks-row market-picks-row--${sign}">
            <a class="market-picks-link" href="${detailUrl(state.market, row.slug)}">
              <span class="market-picks-text"><strong>${esc(row.ticker)}</strong><span class="market-picks-name">${esc(row.name)}</span></span>
              <span class="market-picks-price">${formatPrice(row.latestPrice ?? row.latest, state.market)}</span>
              <span class="market-picks-count">${sign === 'positive' ? eligibility.positiveCount : eligibility.negativeCount}/9 ${sign === 'positive' ? '+' : '−'}</span>
              <span class="market-picks-signline" title="1D 1W 1M 3M 6M 1Y 2Y 3Y Since 2019">${esc(line)}</span>
            </a>
          </li>`;
        }).join('')}
      </ul>
    </article>`;
  };
  return `<section class="market-picks" data-picks-section>
    <header><span class="eyebrow">AIZANOI PICKS</span><h2>Aizanoi Picks</h2>
    <p>Deterministic momentum shortlist built from the canonical nine-horizon return set.</p></header>
    <div class="market-picks-grid">
      ${card('Strong Momentum', strong, 'positive')}
      ${card('Weak Momentum', weak, 'negative')}
    </div>
  </section>`;
}

function renderMain(state, context) {
  return `<section class="market-main" data-panel="main">
    ${renderStaleBanner(context.health)}
    ${renderStatusStrip({ manifest:context.manifest, health:context.health, market:state.market })}
    ${renderRankingBlock.call(context, state)}
    ${renderRawData.call(context, state)}
  </section>`;
}

function renderPicksView(state, context) {
  return `<section class="market-picks-view" data-panel="picks">${renderPicks.call(context, state)}</section>`;
}

export function createMarketsDashboard(container, options = {}) {
  const { compact = false, updateUrl = !compact, readUrl = !compact } = options;
  if (!document.querySelector('link[href="/analytics/markets/markets.css"],link[data-markets-styles]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/analytics/markets/markets.css';
    stylesheet.dataset.marketsStyles = '';
    document.head.appendChild(stylesheet);
  }
  if (!document.querySelector('link[href="/analytics/markets/markets-ux.css"],link[data-markets-ux-styles]')) {
    const ux = document.createElement('link');
    ux.rel = 'stylesheet';
    ux.href = '/analytics/markets/markets-ux.css';
    ux.dataset.marketsUxStyles = '';
    document.head.appendChild(ux);
  }

  const params = readUrl ? new URLSearchParams(location.search) : new URLSearchParams();
  const state = defaultState();
  const validSortKeys = new Set(['ticker', ...PRICE_COLUMNS.map(column => column.key), ...CHANGE_COLUMNS.map(column => column.key)]);

  function restoreUrlState(rawParams) {
    state.market = ['us', 'crypto'].includes(rawParams.get('market')) ? rawParams.get('market') : 'us';
    state.view = ['main', 'picks'].includes(rawParams.get('view')) ? rawParams.get('view') : 'main';
    state.query = rawParams.get('q') || '';
    const [sortKey, sortDirection] = (rawParams.get('sort') || '').split(':');
    state.sort = validSortKeys.has(sortKey) ? { key:sortKey, direction:sortDirection === 'asc' ? 'asc' : 'desc' } : defaultState().sort;
    state.exchange = state.market === 'us' ? (rawParams.get('exchange') || '') : '';
    state.membership = state.market === 'us' ? (rawParams.get('membership') || '') : '';
    state.priceMode = rawParams.get('mode') === 'change' ? 'change' : 'price';
    const parseNumber = key => {
      const value = rawParams.get(key);
      return value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
    };
    state.minPrice = parseNumber('minPrice');
    state.maxPrice = parseNumber('maxPrice');
    const horizon = rawParams.get('perfHorizon');
    const op = rawParams.get('perfOp');
    const min = parseNumber('perfMin');
    const max = parseNumber('perfMax');
    state.performance = PICK_HORIZONS.includes(horizon) && ['gt', 'lt', 'between'].includes(op) && Number.isFinite(min) && (op !== 'between' || Number.isFinite(max))
      ? { horizon, op, min:min / 100, max:op === 'between' ? max / 100 : null }
      : { horizon:'', op:'gt', min:null, max:null };
    const page = parseNumber('page');
    state.page = Number.isInteger(page) && page > 1 ? page : 1;
  }

  state.rankingPreset = RANKING_PRESETS.some(item => item.id === params.get('rank')) ? params.get('rank') : '1d-up';
  state.columnsExpanded = params.get('cols') === 'all';
  state.pageSize = [25, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : (compact ? 25 : 50);

  restoreUrlState(params);

  const controller = new AbortController();
  const context = {
    container,
    controller,
    compact,
    manifest:null,
    health:null,
    rows:{ us:null, crypto:null },
    pulse:{},
  };

  container.innerHTML = `<div class="market-product${compact ? ' is-compact' : ''}" data-markets-product>
    <div class="market-skeleton" data-skeleton hidden>
      <div class="market-skeleton-bar"></div>
      <div class="market-skeleton-grid"><span></span><span></span><span></span></div>
    </div>
    <header class="market-product-bar">
      <div class="market-brand-row"><span class="eyebrow">AIZANOI MARKETS</span><span class="market-brand-title">${esc(marketSessionState(state.market).label)}</span></div>
      <div class="market-switch" role="tablist" aria-label="Market universe">
        <button type="button" data-market="us" role="tab" aria-selected="${state.market === 'us'}">US</button>
        <button type="button" data-market="crypto" role="tab" aria-selected="${state.market === 'crypto'}">Crypto</button>
      </div>
      <nav class="market-nav" aria-label="Markets views">
        <a href="${esc(location.pathname)}?market=${esc(state.market)}" data-nav="main" aria-current="${state.view === 'main' ? 'page' : 'false'}">Markets</a>
        <a href="${esc(location.pathname)}?market=${esc(state.market)}&view=picks" data-nav="picks" aria-current="${state.view === 'picks' ? 'page' : 'false'}">Aizanoi Picks</a>
      </nav>
    </header>
    <p class="market-error" data-error hidden></p>
    <div data-views></div>
  </div>`;

  const query = selector => container.querySelector(selector);
  const all = selector => [...container.querySelectorAll(selector)];
  context.currentRows = () => context.rows[state.market] || [];
  context.renderPicks = renderPicks;
  context.renderRankingCard = renderRankingCard;

  function syncControls() {
    all('[data-market]').forEach(button => {
      const active = button.dataset.market === state.market;
      button.setAttribute('aria-selected', String(active));
    });
    const brandTitle = query('.market-brand-title');
    if (brandTitle) {
      brandTitle.textContent = marketSessionState(state.market).label;
    }
    all('[data-nav]').forEach(link => {
      link.setAttribute('aria-current', link.dataset.nav === state.view ? 'page' : 'false');
      const viewParam = link.dataset.nav === 'picks' ? '&view=picks' : '';
      link.setAttribute('href', `${location.pathname}?market=${encodeURIComponent(state.market)}${viewParam}`);
    });
  }

  function renderView() {
    const target = query('[data-views]');
    if (!target) return;
    if (state.view === 'picks') target.innerHTML = renderPicksView(state, context);
    else target.innerHTML = renderMain(state, context);
  }

  function renderAll() {
    syncControls();
    renderView();
    updateLocation();
  }

  function updateLocation({ push = false } = {}) {
    if (!updateUrl) return;
    const next = new URLSearchParams();
    next.set('market', state.market);
    if (state.view !== 'main') next.set('view', state.view);
    if (state.query) next.set('q', state.query);
    if (state.sort?.key) next.set('sort', `${state.sort.key}:${state.sort.direction}`);
    if (state.market === 'us' && state.exchange) next.set('exchange', state.exchange);
    if (state.market === 'us' && state.membership) next.set('membership', state.membership);
    if (state.priceMode === 'change') next.set('mode', 'change');
    if (state.minPrice != null) next.set('minPrice', String(state.minPrice));
    if (state.maxPrice != null) next.set('maxPrice', String(state.maxPrice));
    if (state.performance?.horizon) {
      next.set('perfHorizon', state.performance.horizon);
      next.set('perfOp', state.performance.op);
      next.set('perfMin', String(state.performance.min * 100));
      if (state.performance.op === 'between') next.set('perfMax', String(state.performance.max * 100));
    }
    if (state.page > 1) next.set('page', String(state.page));
    if (state.rankingPreset && state.rankingPreset !== '1d-up') next.set('rank', state.rankingPreset);
    if (state.columnsExpanded) next.set('cols', 'all');
    if (state.pageSize !== 50) next.set('pageSize', String(state.pageSize));
    const url = `${location.pathname}?${next}`;
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  }

  function exportTableCsv() {
    const rows = filterRows(context.currentRows(), state);
    const status = query('[data-export-status]');
    if (!rows.length) {
      const message = 'No instruments match the current filters — nothing to export.';
      if (status) status.textContent = message;
      else showError(new Error(message));
      return;
    }
    const headers = ['Ticker', 'Name', 'Exchange', 'Price', '1D%', '1W%', '1M%', '1Y%'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        `"${r.ticker || ''}"`,
        `"${(r.name || '').replace(/"/g, '""')}"`,
        `"${r.exchange || ''}"`,
        r.latestPrice ?? r.latest ?? '',
        r.return1d != null ? (r.return1d * 100).toFixed(2) : '',
        r.return1w != null ? (r.return1w * 100).toFixed(2) : '',
        r.return1m != null ? (r.return1m * 100).toFixed(2) : '',
        r.return1y != null ? (r.return1y * 100).toFixed(2) : ''
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aizanoi-markets-${state.market}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (status) status.textContent = '';
  }

  async function loadRows(market) {
    if (context.rows[market]) return context.rows[market];
    const index = await getJson(`${DATA_ROOT}/summary/${market}/index.json`, controller.signal);
    const chunks = await Promise.all((index.chunks || []).map(chunk => getJson(`${DATA_ROOT}/summary/${market}/${chunk.path}`, controller.signal)));
    context.rows[market] = chunks.flatMap(chunk => chunk.rows || []);
    return context.rows[market];
  }

  async function loadMarket(market) {
    if (!context.pulse[market]) {
      context.pulse[market] = await getJson(`${DATA_ROOT}/pulse/${market}.json`, controller.signal).catch(() => null);
    }
    await loadRows(market);
    renderAll();
  }

  function showError(error) {
    const target = query('[data-error]');
    if (!target) return;
    target.hidden = false;
    target.textContent = error.message;
  }

  function selectRow(symbol) {
    state.selectedSymbol = symbol;
    const filtered = filterRows(context.currentRows(), state);
    const ordered = state.sort?.key ? sortRows(filtered, state.sort.key, state.sort.direction) : filtered;
    const index = ordered.findIndex(row => row.slug === symbol);
    if (index >= 0 && state.pageSize) state.page = Math.floor(index / state.pageSize) + 1;
    renderView();
    const row = query(`tr[data-symbol="${CSS.escape(symbol)}"]`);
    if (row && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ behavior:'smooth', block:'center' });
    }
  }

  function openRow(symbol) {
    location.href = detailUrl(state.market, symbol);
  }

  function resetFilters() {
    state.query = '';
    state.exchange = '';
    state.membership = '';
    state.minPrice = null;
    state.maxPrice = null;
    state.performance = { horizon:'', op:'gt', min:null, max:null };
    state.page = 1;
  }

  function handleClick(event) {
    const exportTarget = event.target.closest('[data-export-csv]');
    if (exportTarget) {
      exportTableCsv();
      return;
    }
    const modeTarget = event.target.closest('[data-price-mode]');
    if (modeTarget) {
      state.priceMode = modeTarget.dataset.priceMode;
      renderView();
      updateLocation();
      return;
    }
    const marketTarget = event.target.closest('[data-market]');
    if (marketTarget && marketTarget.tagName === 'BUTTON') {
      state.market = marketTarget.dataset.market;
      state.exchange = '';
      state.membership = '';
      state.page = 1;
      state.selectedSymbol = null;
      loadMarket(state.market).catch(showError);
      return;
    }
    const navTarget = event.target.closest('[data-nav]');
    if (navTarget) {
      event.preventDefault();
      state.view = navTarget.dataset.nav;
      renderView();
      updateLocation();
      return;
    }
    const presetTarget = event.target.closest('[data-ranking-preset]');
    if (presetTarget) {
      state.rankingPreset = presetTarget.dataset.rankingPreset;
      renderView();
      updateLocation();
      return;
    }
    const rankTarget = event.target.closest('[data-ranking-symbol]');
    if (rankTarget) {
      selectRow(rankTarget.dataset.rankingSymbol);
      return;
    }
    if (event.target.closest('[data-drawer-close]')) {
      state.selectedSymbol = null;
      renderView();
      return;
    }
    if (event.target.closest('[data-columns-expanded]')) {
      state.columnsExpanded = !state.columnsExpanded;
      renderView();
      updateLocation();
      return;
    }
    const sortTarget = event.target.closest('[data-sort-key]');
    if (sortTarget) {
      const key = sortTarget.dataset.sortKey;
      const direction = (state.sort.key === key && state.sort.direction === 'desc') ? 'asc' : 'desc';
      state.sort = { key, direction };
      state.page = 1;
      renderView();
      updateLocation();
      return;
    }
    const pagerTarget = event.target.closest('[data-page-action]');
    if (pagerTarget) {
      const action = pagerTarget.dataset.pageAction;
      state.page = action === 'next' ? state.page + 1 : Math.max(1, state.page - 1);
      renderView();
      updateLocation({ push:true });
      return;
    }
    const chipTarget = event.target.closest('[data-chip-key]');
    if (chipTarget) {
      const key = chipTarget.dataset.chipKey;
      if (key === 'q') state.query = '';
      if (key === 'exchange') state.exchange = '';
      if (key === 'membership') state.membership = '';
      if (key === 'price') { state.minPrice = null; state.maxPrice = null; }
      if (key === 'performance') state.performance = { horizon:'', op:'gt', min:null, max:null };
      state.page = 1;
      renderView();
      updateLocation();
      return;
    }
    if (event.target.closest('[data-filter-reset]')) {
      resetFilters();
      renderView();
      updateLocation();
      return;
    }
    if (event.target.closest('[data-table-filter-toggle]')) {
      state.filtersOpen = !state.filtersOpen;
      renderView();
      return;
    }
    const rowTarget = event.target.closest('tr[data-open-instrument]');
    if (rowTarget && !event.target.closest('a,button')) {
      selectRow(rowTarget.dataset.openInstrument);
    }
  }

  function handleDblClick(event) {
    const rowTarget = event.target.closest('tr[data-open-instrument]');
    if (rowTarget) openRow(rowTarget.dataset.openInstrument);
  }

  function handleChange(event) {
    if (event.target.matches('[data-exchange]')) { state.exchange = event.target.value; state.page = 1; }
    if (event.target.matches('[data-membership]')) { state.membership = event.target.value; state.page = 1; }
    if (event.target.matches('[data-min-price]')) { state.minPrice = event.target.value === '' ? null : Number(event.target.value); state.page = 1; }
    if (event.target.matches('[data-max-price]')) { state.maxPrice = event.target.value === '' ? null : Number(event.target.value); state.page = 1; }
    if (event.target.matches('[data-performance-horizon]')) { state.performance.horizon = event.target.value; state.page = 1; }
    if (event.target.matches('[data-performance-op]')) { state.performance.op = event.target.value; state.page = 1; }
    if (event.target.matches('[data-performance-min]')) { state.performance.min = event.target.value === '' ? null : Number(event.target.value) / 100; state.page = 1; }
    if (event.target.matches('[data-performance-max]')) { state.performance.max = event.target.value === '' ? null : Number(event.target.value) / 100; state.page = 1; }
    renderView();
    updateLocation();
  }

  let searchTimer = null;
  function handleInput(event) {
    if (event.target.matches('[data-search]')) {
      if (event.isComposing) return;
      clearTimeout(searchTimer);
      const value = event.target.value.trim();
      searchTimer = setTimeout(() => {
        state.query = value;
        state.page = 1;
        const views = query('[data-views]');
        const active = document.activeElement;
        const hadFocus = Boolean(active?.matches?.('[data-search]') && views?.contains(active));
        const selStart = hadFocus ? active.selectionStart : null;
        const selEnd = hadFocus ? active.selectionEnd : null;
        if (hadFocus) active.blur();
        renderView();
        updateLocation();
        if (hadFocus) {
          const input = query('[data-search]');
          if (input) {
            input.focus({ preventScroll: true });
            const length = input.value.length;
            const start = Math.min(selStart ?? length, length);
            const end = Math.min(selEnd ?? length, length);
            try { input.setSelectionRange(start, end); } catch { /* non-text input */ }
          }
        }
      }, 120);
    }
  }

  function handleKey(event) {
    if (event.target.matches?.('tr[data-open-instrument]') && event.key === 'Enter') {
      event.preventDefault();
      selectRow(event.target.dataset.openInstrument);
    }
  }

  function handleSubmit(event) {
    if (!event.target.matches('form[data-filter-form]')) return;
    event.preventDefault();
    state.query = (query('[data-search]')?.value || '').trim();
    state.page = 1;
    renderView();
    updateLocation();
  }

  container.addEventListener('click', handleClick, { signal: controller.signal });
  container.addEventListener('dblclick', handleDblClick, { signal: controller.signal });
  container.addEventListener('change', handleChange, { signal: controller.signal });
  container.addEventListener('input', handleInput, { signal: controller.signal });
  container.addEventListener('submit', handleSubmit, { signal: controller.signal });
  container.addEventListener('keydown', handleKey, { signal: controller.signal });

  const skeleton = query('[data-skeleton]');
  if (skeleton) skeleton.hidden = false;
  Promise.all([
    getJson(`${DATA_ROOT}/manifest.json`, controller.signal),
    getJson(`${DATA_ROOT}/health.json`, controller.signal).catch(() => null),
  ]).then(([manifest, health]) => {
    context.manifest = manifest;
    context.health = health;
    return loadMarket(state.market);
  }).then(() => {
    if (skeleton) skeleton.hidden = true;
  }).catch((error) => {
    if (skeleton) skeleton.hidden = true;
    showError(error);
  });

  window.addEventListener('popstate', () => {
    restoreUrlState(new URLSearchParams(location.search));
    loadMarket(state.market).catch(showError);
  }, { signal: controller.signal });

  syncControls();

  return () => {
    clearTimeout(searchTimer);
    controller.abort();
    container.replaceChildren();
  };
}

export { renderRankingCard };
