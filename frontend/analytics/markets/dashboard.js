import {
  CHANGE_COLUMNS,
  HORIZON_CARDS,
  PRICE_COLUMNS,
  activeFilterChips,
  defaultState,
  detailUrl,
  evaluateMomentumEligibility,
  filterRows,
  formatNumber,
  formatPercent,
  formatPrice,
  formatSignedReturn,
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

async function getJson(path, signal) {
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
        <span class="market-ranking-numbers"><span class="market-ranking-price">${formatPrice(row.latestPrice ?? row.latest)}</span><span class="market-ranking-change market-ranking-change--${horizonSign(row[key]).modifier}">${formatPercent(row[key])}</span></span>
      </button>
    </li>`).join('')}</ol></article>`;
}

function renderBreadth(pulse) {
  const items = [
    { label:'Advancing', value: formatPercent(pulse?.advancingShare ?? null) },
    { label:'Declining', value: formatPercent(pulse?.decliningShare ?? null) },
    { label:'Median 1D', value: formatPercent(pulse?.medianReturn1d) },
    { label:'Median 1Y', value: formatPercent(pulse?.medianReturn1y) },
  ];
  return `<div class="market-breadth" data-breadth>${items.map(item => `<article class="market-breadth-card"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></article>`).join('')}</div>`;
}

function renderStatusStrip({ manifest, health, market }) {
  const marketHealth = health?.[market] || {};
  const observations = manifest?.counts?.[market] ?? marketHealth.published ?? null;
  const observationLabel = marketHealth.latestObservationAt
    ? new Date(marketHealth.latestObservationAt).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })
    : '—';
  const publishedLabel = manifest?.completedAt ? new Date(manifest.completedAt).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }) : '—';
  const provider = market === 'crypto' ? 'Binance' : 'Fintable';
  const degraded = health?.status && health.status !== 'complete';
  return `<div class="market-status-strip" data-status-strip>
    <span><strong>${formatNumber(observations)}</strong> instruments</span>
    <span>Latest observation <strong>${esc(observationLabel)}</strong></span>
    <span>Published <strong>${esc(publishedLabel)}</strong></span>
    <span>Source <strong>${esc(provider)}</strong></span>
    ${degraded ? '<span class="market-status-strip-warning">Pipeline degraded — last published run was not complete.</span>' : ''}
  </div>`;
}

function renderRankingBlock(market) {
  const cards = [
    ['Today · Top 5', 'return1d', true],
    ['Today · Bottom 5', 'return1d', false],
    ['1 Week · Top 5', 'return1w', true],
    ['1 Week · Bottom 5', 'return1w', false],
    ['52 Weeks · Top 5', 'return1y', true],
    ['52 Weeks · Bottom 5', 'return1y', false],
  ];
  return `<section class="market-rankings" data-rankings-block>
    <h2>Market rankings</h2>
    <div class="market-rankings-grid">
      ${cards.map(([title, key, descending]) => renderRankingCard.call(this, title, key, descending)).join('')}
    </div>
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
  const cells = columns.map(col => `<td data-col="${esc(col.key)}">${formatCell(col, row)}</td>`).join('');
  return `<tr class="market-table-row${isSelected ? ' is-selected' : ''}" data-symbol="${esc(row.slug)}" data-open-instrument="${esc(row.slug)}" tabindex="0">
    <td data-col="stock"><strong>${esc(row.ticker)}</strong><span class="market-table-name">${esc(row.name)}</span></td>
    ${cells}
    <td class="market-table-open"><a class="market-table-open-link" href="${detailUrl(state.market, row.slug)}">Open →</a></td>
  </tr>`;
}

function formatCell(column, row) {
  const value = row[column.key];
  if (column.key === 'latestPrice') return formatPrice(value);
  if (column.key === 'previousPrice') return formatPrice(value);
  if (column.key.startsWith('price')) return formatPrice(value);
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

function renderRawData(state) {
  const columns = state.priceMode === 'price' ? PRICE_COLUMNS : CHANGE_COLUMNS;
  const filtered = filterRows(this.currentRows(), state);
  const sorted = state.sort?.key ? sortRows(filtered, state.sort.key, state.sort.direction) : filtered;
  const pageState = paginate(sorted, state.page, state.pageSize);
  const chips = renderFilterChips(activeFilterChips(state));
  const table = `<div class="market-table-wrap" data-raw-table-wrap>
    <table class="market-table" data-raw-table>
      <thead>${renderTableHead(state, columns)}</thead>
      <tbody data-raw-table-body>
        ${pageState.rows.length
          ? pageState.rows.map(row => renderTableRow(row, columns, state)).join('')
          : `<tr><td colspan="${columns.length + 2}" class="market-table-empty">No instruments match these filters.</td></tr>`}
      </tbody>
    </table>
  </div>`;
  return `<section class="market-raw" data-raw-section>
    <header class="market-raw-header">
      <div>
        <span class="eyebrow">RAW DATA</span>
        <h2>Raw Data</h2>
      </div>
      <div class="market-raw-mode" role="group" aria-label="Raw data mode">
        <button type="button" class="market-raw-mode-button${state.priceMode === 'price' ? ' is-active' : ''}" data-price-mode="price" aria-pressed="${state.priceMode === 'price'}">Price</button>
        <button type="button" class="market-raw-mode-button${state.priceMode === 'change' ? ' is-active' : ''}" data-price-mode="change" aria-pressed="${state.priceMode === 'change'}">Change</button>
      </div>
    </header>
    ${chips}
    ${table}
    ${renderPager(pageState.page, pageState.pageSize, pageState.total)}
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
          const signs = PICK_HORIZONS.map(key => {
            const status = eligibility.statuses[key];
            return `<li class="market-picks-horizon market-picks-horizon--${status}" title="${esc(PICK_HORIZON_LABELS[key])} ${status === 'positive' ? '+' : status === 'negative' ? '−' : status === 'flat' ? '0' : '—'}">${esc(PICK_HORIZON_LABELS[key])}<span aria-hidden="true">${status === 'positive' ? '+' : status === 'negative' ? '−' : status === 'flat' ? '0' : '—'}</span></li>`;
          }).join('');
          return `<li class="market-picks-row">
            <a class="market-picks-link" href="${detailUrl(state.market, row.slug)}">
              <span class="market-picks-text"><strong>${esc(row.ticker)}</strong><span class="market-picks-name">${esc(row.name)}</span></span>
              <span class="market-picks-price">${formatPrice(row.latestPrice ?? row.latest)}</span>
              <span class="market-picks-count">${sign === 'positive' ? eligibility.positiveCount : eligibility.negativeCount} / 9 ${sign}</span>
              <ul class="market-picks-horizons">${signs}</ul>
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

function renderFilters(state) {
  const rows = this.currentRows();
  const exchanges = [...new Set(rows.map(row => row.exchange).filter(Boolean))].sort();
  const memberships = [...new Set(rows.flatMap(row => Array.isArray(row.memberships) ? row.memberships : [])).values()].sort();
  const isCrypto = state.market === 'crypto';
  return `<form class="market-filters${state.filtersOpen ? ' is-open' : ''}" data-filter-form id="filter-drawer" role="search" aria-label="Filter raw data">
    <label class="market-filter-search"><span class="visually-hidden">Search</span><input data-search type="search" placeholder="Search ticker or company" value="${esc(state.query)}" autocomplete="off"></label>
    ${isCrypto ? '' : `<label class="market-filter-control"><span>Exchange</span><select data-exchange><option value="">All</option>${exchanges.map(value => `<option value="${esc(value)}"${state.exchange === value ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`}
    ${isCrypto ? '' : `<label class="market-filter-control"><span>Membership</span><select data-membership><option value="">All</option>${memberships.map(value => `<option value="${esc(value)}"${state.membership === value ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`}
    <label class="market-filter-control"><span>Price</span><span class="market-filter-price"><input type="number" inputmode="decimal" data-min-price min="0" placeholder="Min" value="${Number.isFinite(state.minPrice) ? esc(state.minPrice) : ''}"><input type="number" inputmode="decimal" data-max-price min="0" placeholder="Max" value="${Number.isFinite(state.maxPrice) ? esc(state.maxPrice) : ''}"></span></label>
    <fieldset class="market-filter-performance">
      <legend>Performance</legend>
      <span class="market-filter-performance-row">
        <select data-performance-horizon>
          <option value="">Any</option>
          ${PICK_HORIZONS.map(key => `<option value="${esc(key)}"${state.performance?.horizon === key ? ' selected' : ''}>${esc(PICK_HORIZON_LABELS[key])}</option>`).join('')}
        </select>
        <select data-performance-op>
          <option value="gt"${state.performance?.op === 'gt' ? ' selected' : ''}>&gt;</option>
          <option value="lt"${state.performance?.op === 'lt' ? ' selected' : ''}>&lt;</option>
          <option value="between"${state.performance?.op === 'between' ? ' selected' : ''}>between</option>
        </select>
        <input type="number" inputmode="decimal" step="1" data-performance-min placeholder="%" value="${Number.isFinite(state.performance?.min) ? esc(state.performance.min * 100) : ''}">
        <span class="market-filter-performance-max" data-performance-max-wrap${state.performance?.op === 'between' ? '' : ' hidden'}><input type="number" inputmode="decimal" step="1" data-performance-max placeholder="%" value="${Number.isFinite(state.performance?.max) ? esc(state.performance.max * 100) : ''}"></span>
      </span>
    </fieldset>
    <button type="button" class="market-filter-reset" data-filter-reset>Reset</button>
    <button type="button" class="market-filter-drawer-trigger" data-filter-drawer-trigger aria-expanded="${state.filtersOpen ? 'true' : 'false'}" aria-controls="filter-drawer">Filters</button>
  </form>`;
}

function renderMain(state, context) {
  return `<section class="market-main" data-panel="main">
    ${renderStatusStrip({ manifest:context.manifest, health:context.health, market:state.market })}
    ${renderBreadth(context.pulse[state.market])}
    ${renderRankingBlock.call(context, state.market)}
    ${renderFilters.call(context, state)}
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

  const params = readUrl ? new URLSearchParams(location.search) : new URLSearchParams();
  const state = defaultState();
  state.market = ['us', 'crypto'].includes(params.get('market')) ? params.get('market') : 'us';
  state.view = ['main', 'picks'].includes(params.get('view')) ? params.get('view') : 'main';
  state.query = params.get('q') || '';
  if (params.get('sort')) {
    const [key, direction] = params.get('sort').split(':');
    state.sort = { key, direction: direction === 'asc' ? 'asc' : 'desc' };
  }
  state.exchange = params.get('exchange') || '';
  state.membership = params.get('membership') || '';
  state.priceMode = params.get('mode') === 'change' ? 'change' : 'price';

  const controller = new AbortController();
  const context = {
    container,
    controller,
    manifest:null,
    health:null,
    rows:{ us:null, crypto:null },
    pulse:{},
  };

  container.innerHTML = `<div class="market-product${compact ? ' is-compact' : ''}" data-markets-product>
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
    all('[data-nav]').forEach(link => {
      link.setAttribute('aria-current', link.dataset.nav === state.view ? 'page' : 'false');
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

  function updateLocation() {
    if (!updateUrl) return;
    const next = new URLSearchParams();
    next.set('market', state.market);
    if (state.view !== 'main') next.set('view', state.view);
    if (state.query) next.set('q', state.query);
    if (state.sort?.key) next.set('sort', `${state.sort.key}:${state.sort.direction}`);
    if (state.exchange) next.set('exchange', state.exchange);
    if (state.membership) next.set('membership', state.membership);
    if (state.priceMode === 'change') next.set('mode', 'change');
    history.replaceState(null, '', `${location.pathname}?${next}`);
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
    const total = filterRows(context.currentRows(), state).length;
    if (state.pageSize && total) {
      const index = filterRows(context.currentRows(), state)
        .sort(state.sort ? (a, b) => {
          const aV = a[state.sort.key];
          const bV = b[state.sort.key];
          if (!Number.isFinite(aV) && !Number.isFinite(bV)) return 0;
          if (!Number.isFinite(aV)) return 1;
          if (!Number.isFinite(bV)) return -1;
          return state.sort.direction === 'asc' ? aV - bV : bV - aV;
        } : (a, b) => 0)
        .findIndex(row => row.slug === symbol);
      if (index >= 0) {
        state.page = Math.floor(index / state.pageSize) + 1;
      }
    }
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
    const rankTarget = event.target.closest('[data-ranking-symbol]');
    if (rankTarget) {
      selectRow(rankTarget.dataset.rankingSymbol);
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
    if (event.target.closest('[data-filter-drawer-trigger]')) {
      const button = event.target.closest('[data-filter-drawer-trigger]');
      const drawer = document.getElementById('filter-drawer');
      if (drawer) {
        const open = !drawer.classList.contains('is-open');
        state.filtersOpen = open;
        drawer.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', String(open));
      }
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
      openRow(event.target.dataset.openInstrument);
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

  container.addEventListener('click', handleClick);
  container.addEventListener('dblclick', handleDblClick);
  container.addEventListener('change', handleChange);
  container.addEventListener('input', handleInput);
  container.addEventListener('submit', handleSubmit);
  container.addEventListener('keydown', handleKey);

  Promise.all([
    getJson(`${DATA_ROOT}/manifest.json`, controller.signal),
    getJson(`${DATA_ROOT}/health.json`, controller.signal).catch(() => null),
  ]).then(([manifest, health]) => {
    context.manifest = manifest;
    context.health = health;
    return loadMarket(state.market);
  }).catch(showError);

  syncControls();

  return () => {
    controller.abort();
    container.replaceChildren();
  };
}

export { renderRankingCard };
