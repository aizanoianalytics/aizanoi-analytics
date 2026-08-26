const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat('en-US');
const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const COLORS = ['#236a85', '#72b7b3', '#bc6672', '#d69b55', '#7167aa', '#438a68'];
const STORAGE_KEY = 'aizanoi-turnover-reason-map-v2';
const dimensionControls = {
  region: $('#regionFilter'), site: $('#siteFilter'), department: $('#departmentFilter'), division: $('#divisionFilter'),
  city: $('#cityFilter'), gender: $('#genderFilter'), contractType: $('#contractFilter'), roleLevel: $('#roleFilter'),
};
const state = {
  tab: 'overview', scope: 'Enterprise', type: 'all', start: '', end: '',
  region: 'all', site: 'all', department: 'all', division: 'all', city: 'all', gender: 'all', contractType: 'all', roleLevel: 'all',
  scopeTrendMode: 'monthly', breakdownDimension: 'region', breakdownMetric: 'period', roleMatrixMode: 'contribution',
  compareKind: 'region', compareA: '', compareB: '', compareYearA: '2024', compareYearB: '2025',
};
const tableState = new Map();
const exportRows = new Map();
let DATA;
let reasonOverrides = {};
let reasonDraft = {};

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
const averageWorkforce = (row) => (Number(row.start) + Number(row.end)) / 2;
const monthRate = (row) => averageWorkforce(row) ? Number(row.exits) / averageWorkforce(row) : 0;
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const monthLabel = (month, short = false) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric', timeZone: 'UTC' });
const addMonths = (month, offset) => { const [year, value] = month.split('-').map(Number); const date = new Date(Date.UTC(year, value - 1 + offset, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; };
const unique = (rows, key) => [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
const activeDimensions = () => Object.entries(dimensionControls).filter(([key]) => state[key] !== 'all');

function reasonType(exit) {
  const setting = DATA.reasonSettings.find((item) => item.key === exit.reasonKey);
  return reasonOverrides[exit.reasonKey] || setting?.defaultType || 'voluntary';
}

function matchesRow(row, ignoreDimension = '', options = {}) {
  const scope = options.scope ?? state.scope;
  if (scope !== 'Enterprise' && row.scope !== scope) return false;
  if (!options.ignorePeriod && (row.month < state.start || row.month > state.end)) return false;
  if (options.dimension && row[options.dimension] !== options.entity) return false;
  if (!options.ignoreDimensions) {
    for (const key of Object.keys(dimensionControls)) {
      if (key === ignoreDimension || key === options.dimension) continue;
      if (state[key] !== 'all' && row[key] !== state[key]) return false;
    }
  }
  return true;
}

function filteredMonthly(options = {}) {
  return DATA.monthly.filter((row) => matchesRow(row, options.ignoreDimension, options));
}

function filteredExits(options = {}) {
  const type = options.type ?? state.type;
  return DATA.exits.filter((row) => matchesRow(row, options.ignoreDimension, options) && (type === 'all' || reasonType(row) === type));
}

function aggregateMonthly(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const current = map.get(row.month) || { month: row.month, start: 0, hires: 0, exits: 0, end: 0 };
    current.start += row.startHeadcount;
    current.hires += row.hires;
    current.exits += row.exits;
    current.end += row.endHeadcount;
    map.set(row.month, current);
  });
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function seriesFor(options = {}) {
  const rows = aggregateMonthly(filteredMonthly(options));
  const type = options.type ?? state.type;
  if (type !== 'all') {
    const exitMap = new Map();
    filteredExits({ ...options, type }).forEach((row) => exitMap.set(row.month, (exitMap.get(row.month) || 0) + 1));
    rows.forEach((row) => { row.exits = exitMap.get(row.month) || 0; });
  }
  return rows;
}

function cumulativeRate(rows) {
  if (!rows.length) return 0;
  const valid = rows.filter((row) => averageWorkforce(row) > 0);
  const denominator = valid.length ? valid.reduce((total, row) => total + averageWorkforce(row), 0) / valid.length : 0;
  return denominator ? sum(rows, 'exits') / denominator : 0;
}

function fillSelect(select, values, current, allLabel = 'All') {
  select.innerHTML = `<option value="all">${esc(allLabel)}</option>${values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}`;
  select.value = values.includes(current) ? current : 'all';
  return select.value;
}

function fillExact(select, values, current) {
  select.innerHTML = values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  select.value = values.includes(current) ? current : values[0] || '';
  return select.value;
}

function updateDimensionFilters() {
  for (const [key, select] of Object.entries(dimensionControls)) {
    const values = unique(DATA.monthly.filter((row) => matchesRow(row, key)), key);
    const plural = { contractType: 'contracts', roleLevel: 'roles', city: 'cities' }[key] || `${key}s`;
    state[key] = fillSelect(select, values, state[key], `All ${plural}`);
  }
}

function renderChips() {
  const items = [state.scope, state.type === 'all' ? 'All exits' : `${state.type[0].toUpperCase()}${state.type.slice(1)} exits`, `${monthLabel(state.start, true)} – ${monthLabel(state.end, true)}`];
  activeDimensions().forEach(([key]) => items.push(`${key.replace(/([A-Z])/g, ' $1')}: ${state[key]}`));
  $('#filterChips').innerHTML = items.map((item) => `<span class="chip">${esc(item)}</span>`).join('');
}

function empty(target, message = 'No observations match this selection.') {
  target.innerHTML = `<p class="empty">${esc(message)}</p>`;
}

function showTooltip(event, content) {
  const tooltip = $('#tooltip');
  tooltip.innerHTML = content;
  tooltip.hidden = false;
  const box = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.max(8, Math.min(innerWidth - box.width - 8, event.clientX + 12))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(innerHeight - box.height - 8, event.clientY + 12))}px`;
}

function bindTooltips(target) {
  target.querySelectorAll('[data-tip]').forEach((node) => {
    node.addEventListener('mouseenter', (event) => showTooltip(event, node.dataset.tip));
    node.addEventListener('mousemove', (event) => showTooltip(event, node.dataset.tip));
    node.addEventListener('mouseleave', () => { $('#tooltip').hidden = true; });
  });
}

function renderLineChart(target, series, labels, options = {}) {
  const numeric = series.flatMap((item) => item.values.filter((value) => Number.isFinite(Number(value))).map(Number));
  if (!labels.length || !numeric.length) { empty(target); return; }
  const width = Math.max(320, Math.round(target.clientWidth || 900));
  const height = options.height || 310;
  const margin = { left: 52, right: 20, top: 22, bottom: 48 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const minimum = options.minimum ?? 0;
  const maximum = Math.max(options.maximum || 0, ...numeric, options.percent === false ? 1 : 0.01) * 1.12;
  const x = (index) => margin.left + (labels.length === 1 ? innerWidth / 2 : index * innerWidth / (labels.length - 1));
  const y = (value) => margin.top + innerHeight - (Number(value) - minimum) / (maximum - minimum || 1) * innerHeight;
  const valueLabel = (value) => options.percent === false ? number.format(Math.round(value)) : percent.format(value);
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.aria || 'Analytical line chart')}">`;
  for (let index = 0; index <= 4; index += 1) {
    const value = minimum + (maximum - minimum) * index / 4;
    const position = y(value);
    svg += `<line class="gridline" x1="${margin.left}" x2="${width - margin.right}" y1="${position}" y2="${position}"/><text class="axis" x="${margin.left - 8}" y="${position + 4}" text-anchor="end">${esc(valueLabel(value))}</text>`;
  }
  const stride = Math.max(1, Math.ceil(labels.length / (width < 520 ? 5 : 10)));
  labels.forEach((label, index) => { if (index % stride === 0 || index === labels.length - 1) svg += `<text class="axis" x="${x(index)}" y="${height - 14}" text-anchor="middle">${esc(options.labelFormatter ? options.labelFormatter(label) : monthLabel(label, true))}</text>`; });
  series.forEach((item, seriesIndex) => {
    const points = item.values.map((value, index) => ({ value: Number(value), index })).filter((point) => Number.isFinite(point.value));
    if (!points.length) return;
    const color = item.color || COLORS[seriesIndex % COLORS.length];
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
    svg += `<path class="chart-path" d="${path}" stroke="${color}" ${item.dash ? 'stroke-dasharray="7 6"' : ''}/>`;
    points.forEach((point) => { svg += `<circle cx="${x(point.index)}" cy="${y(point.value)}" r="4" fill="${color}" stroke="#fff" stroke-width="2" data-tip="${esc(`<b>${item.name}</b><br>${options.labelFormatter ? options.labelFormatter(labels[point.index]) : monthLabel(labels[point.index])} · ${valueLabel(point.value)}`)}"/>`; });
  });
  svg += '</svg>';
  target.innerHTML = `${svg}<div class="legend">${series.map((item, index) => `<span><i class="swatch" style="--swatch:${item.color || COLORS[index % COLORS.length]}"></i>${esc(item.name)}</span>`).join('')}</div>`;
  bindTooltips(target);
}

function renderBars(target, rows, options = {}) {
  if (!rows.length) { empty(target); return; }
  const maximum = Math.max(...rows.map((row) => Number(row.value) || 0), 0.001);
  target.innerHTML = rows.slice(0, options.limit || 24).map((row) => `<div class="bar-row"><div class="bar-copy"><span>${esc(row.label)}</span><b>${options.percent === false ? number.format(Math.round(row.value)) : percent.format(row.value)}</b></div><div class="bar-track"><div class="bar-fill${options.rose ? ' rose' : ''}" style="width:${Math.max(1, row.value / maximum * 100)}%"></div></div></div>`).join('');
}

function simpleTable(target, rows, columns, options = {}) {
  if (!rows.length) { empty(target, options.empty); return; }
  target.innerHTML = `<div class="table-wrap"><table><thead><tr>${columns.map((column) => `<th>${esc(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr class="${row.total ? 'total-row' : ''}">${columns.map((column) => `<td>${column.render ? column.render(row[column.key], row) : esc(row[column.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function smartTable(target, rows, columns, key) {
  const prior = tableState.get(key) || { query: '', sort: columns[0].key, direction: 'asc', page: 0 };
  const query = prior.query.toLocaleLowerCase('en-US');
  let filtered = rows.filter((row) => !query || columns.some((column) => String(row[column.key] ?? '').toLocaleLowerCase('en-US').includes(query)));
  filtered.sort((a, b) => {
    const left = a[prior.sort] ?? '';
    const right = b[prior.sort] ?? '';
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
    return prior.direction === 'asc' ? result : -result;
  });
  const size = 20;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  prior.page = Math.min(prior.page, pages - 1);
  const pageRows = filtered.slice(prior.page * size, prior.page * size + size);
  target.innerHTML = `<div class="table-tools"><div class="left"><input type="search" value="${esc(prior.query)}" placeholder="Search this table"><span class="count">${number.format(filtered.length)} records</span></div></div><div class="table-wrap"><table><thead><tr>${columns.map((column) => `<th><button class="sort-button" type="button" data-sort="${esc(column.key)}">${esc(column.label)}${prior.sort === column.key ? prior.direction === 'asc' ? ' ↑' : ' ↓' : ''}</button></th>`).join('')}</tr></thead><tbody>${pageRows.map((row) => `<tr>${columns.map((column) => `<td>${column.render ? column.render(row[column.key], row) : esc(row[column.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="pager"><button type="button" class="secondary prev" ${prior.page === 0 ? 'disabled' : ''}>Previous</button><span>Page ${prior.page + 1} of ${pages}</span><button type="button" class="secondary next" ${prior.page >= pages - 1 ? 'disabled' : ''}>Next</button></div>`;
  tableState.set(key, prior);
  let timer;
  target.querySelector('input').addEventListener('input', (event) => { clearTimeout(timer); timer = setTimeout(() => { prior.query = event.target.value; prior.page = 0; smartTable(target, rows, columns, key); }, 160); });
  target.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => { prior.direction = prior.sort === button.dataset.sort && prior.direction === 'asc' ? 'desc' : 'asc'; prior.sort = button.dataset.sort; smartTable(target, rows, columns, key); }));
  target.querySelector('.prev')?.addEventListener('click', () => { prior.page -= 1; smartTable(target, rows, columns, key); });
  target.querySelector('.next')?.addEventListener('click', () => { prior.page += 1; smartTable(target, rows, columns, key); });
}

function renderOverview() {
  const series = seriesFor();
  const exits = filteredExits();
  if (!series.length) { empty($('#overviewKpis')); return; }
  const latest = series.at(-1);
  const previous = series.at(-2);
  const average = series.reduce((total, row) => total + averageWorkforce(row), 0) / series.length;
  const net = latest.end - series[0].start;
  const voluntary = exits.filter((row) => reasonType(row) === 'voluntary').length;
  const cards = [
    ['Latest turnover', percent.format(monthRate(latest)), monthLabel(latest.month), true],
    ['Period cumulative', percent.format(cumulativeRate(series)), `${series.length} months`],
    ['Average workforce', number.format(Math.round(average)), 'Average monthly base'],
    ['Selected exits', number.format(sum(series, 'exits')), `${percent.format(exits.length ? voluntary / exits.length : 0)} voluntary`],
    ['Hires', number.format(sum(series, 'hires')), 'Selected period'],
    ['Net change', `${net > 0 ? '+' : ''}${number.format(net)}`, previous ? `${percent.format(monthRate(latest) - monthRate(previous))} latest delta` : 'No prior month'],
  ];
  $('#overviewKpis').innerHTML = cards.map(([label, value, note, primary]) => `<article class="kpi${primary ? ' primary' : ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
  renderLineChart($('#trendChart'), [{ name: state.type === 'all' ? 'All exits' : state.type, values: series.map(monthRate), color: COLORS[0] }], series.map((row) => row.month), { aria: 'Monthly turnover trend' });
  const typeCounts = ['voluntary', 'involuntary'].map((type) => ({ type, count: DATA.exits.filter((row) => matchesRow(row) && reasonType(row) === type).length }));
  const typeTotal = sum(typeCounts, 'count');
  const voluntaryShare = typeTotal ? typeCounts[0].count / typeTotal : 0;
  $('#typeDonut').innerHTML = `<div class="donut-wrap"><div class="donut" style="--voluntary:${voluntaryShare * 100}%" data-label="${esc(percent.format(voluntaryShare))}"></div><div class="donut-legend">${typeCounts.map((row, index) => `<div><i class="swatch" style="--swatch:${index ? '#bc6672' : '#72b7b3'}"></i><span>${esc(row.type)}</span><b>${number.format(row.count)}</b></div>`).join('')}</div></div>`;
  renderLineChart($('#flowChart'), [{ name: 'Hires', values: series.map((row) => row.hires), color: COLORS[1] }, { name: 'Exits', values: series.map((row) => row.exits), color: COLORS[2] }], series.map((row) => row.month), { percent: false, aria: 'Monthly hires and exits' });
  const scopeRows = DATA.dimensions.scopes.map((scope) => { const values = seriesFor({ scope }); const row = values.at(-1); return { scope, month: row?.month, exits: row?.exits || 0, workforce: row ? averageWorkforce(row) : 0, rate: row ? monthRate(row) : 0 }; });
  simpleTable($('#scopeTable'), scopeRows, [{ key: 'scope', label: 'Scope' }, { key: 'month', label: 'Latest', render: (value) => esc(monthLabel(value, true)) }, { key: 'exits', label: 'Exits' }, { key: 'workforce', label: 'Avg workforce', render: (value) => number.format(Math.round(value)) }, { key: 'rate', label: 'Turnover', render: (value) => percent.format(value) }]);
  const labels = [...new Set(DATA.dimensions.scopes.flatMap((scope) => seriesFor({ scope }).map((row) => row.month)))].sort();
  const scopeSeries = DATA.dimensions.scopes.map((scope, index) => {
    const rows = seriesFor({ scope });
    const map = new Map(rows.map((row) => [row.month, row]));
    const values = labels.map((month) => {
      if (state.scopeTrendMode === 'monthly') return map.has(month) ? monthRate(map.get(month)) : null;
      const window = rows.filter((row) => row.month.slice(0, 4) === month.slice(0, 4) && row.month <= month);
      return window.length ? cumulativeRate(window) : null;
    });
    return { name: scope, values, color: COLORS[index] };
  });
  renderLineChart($('#scopeTrendChart'), scopeSeries, labels, { height: 340, aria: 'Scope turnover comparison' });
  exportRows.set('overview', series.map((row) => ({ month: row.month, start: row.start, hires: row.hires, exits: row.exits, end: row.end, monthlyTurnover: monthRate(row) })));
}

function entitySeries(dimension, entity) {
  return seriesFor({ ignoreDimension: dimension, dimension, entity });
}

function metricFor(rows, metric) {
  if (!rows.length) return 0;
  if (metric === 'latest') return monthRate(rows.at(-1));
  if (metric === 'last12') return cumulativeRate(rows.slice(-12));
  if (metric === 'exits') return sum(rows, 'exits');
  return cumulativeRate(rows);
}

function renderBreakdown() {
  const dimension = state.breakdownDimension;
  const metric = state.breakdownMetric;
  const entities = unique(filteredMonthly({ ignoreDimension: dimension }), dimension);
  const rows = entities.map((entity) => { const series = entitySeries(dimension, entity); return { entity, value: metricFor(series, metric), latest: series.at(-1)?.month, exits: sum(series, 'exits'), workforce: series.length ? series.reduce((total, row) => total + averageWorkforce(row), 0) / series.length : 0, rate: cumulativeRate(series), series }; }).sort((a, b) => b.value - a.value);
  renderBars($('#breakdownBars'), rows.map((row) => ({ label: row.entity, value: row.value })), { percent: metric !== 'exits' });
  const months = [...new Set(rows.flatMap((row) => row.series.map((item) => item.month)))].sort().slice(-12);
  const maximum = Math.max(...rows.flatMap((row) => row.series.filter((item) => months.includes(item.month)).map(monthRate)), 0.001);
  $('#breakdownHeatmap').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>${esc(dimension)}</th>${months.map((month) => `<th>${esc(monthLabel(month, true))}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => { const map = new Map(row.series.map((item) => [item.month, monthRate(item)])); return `<tr><td>${esc(row.entity)}</td>${months.map((month) => { const value = map.get(month) || 0; const opacity = .12 + value / maximum * .7; return `<td class="heat" style="background:rgba(114,183,179,${opacity})">${percent.format(value)}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">No breakdown data.</p>';
  simpleTable($('#breakdownTable'), rows, [{ key: 'entity', label: dimension }, { key: 'latest', label: 'Latest month', render: (value) => esc(monthLabel(value, true)) }, { key: 'exits', label: 'Period exits' }, { key: 'workforce', label: 'Avg workforce', render: (value) => number.format(Math.round(value)) }, { key: 'rate', label: 'Cumulative turnover', render: (value) => percent.format(value) }]);
  exportRows.set('breakdown', rows.map(({ series, ...row }) => row));
  const groups = unique(filteredMonthly({ ignoreDimension: dimension }), dimension);
  const matrixRows = groups.map((group) => {
    const groupSeries = seriesFor({ ignoreDimension: dimension, dimension, entity: group });
    const groupDenominator = groupSeries.length ? groupSeries.reduce((total, row) => total + averageWorkforce(row), 0) / groupSeries.length : 0;
    const result = { group };
    DATA.dimensions.roleLevels.forEach((role) => {
      const roleRows = filteredMonthly({ ignoreDimension: dimension, dimension, entity: group }).filter((row) => row.roleLevel === role);
      const roleSeries = aggregateMonthly(roleRows);
      const roleExits = filteredExits({ ignoreDimension: dimension, dimension, entity: group }).filter((row) => row.roleLevel === role).length;
      if (state.type === 'all') result[role] = state.roleMatrixMode === 'rate' ? cumulativeRate(roleSeries) : groupDenominator ? sum(roleSeries, 'exits') / groupDenominator : 0;
      else {
        const roleDenominator = roleSeries.length ? roleSeries.reduce((total, row) => total + averageWorkforce(row), 0) / roleSeries.length : 0;
        result[role] = state.roleMatrixMode === 'rate' ? roleDenominator ? roleExits / roleDenominator : 0 : groupDenominator ? roleExits / groupDenominator : 0;
      }
    });
    return result;
  });
  $('#matrixNote').textContent = state.roleMatrixMode === 'rate' ? 'Role turnover rate uses each role’s own average workforce denominator.' : 'Share of turnover uses the selected group’s common workforce denominator.';
  simpleTable($('#roleMatrix'), matrixRows, [{ key: 'group', label: dimension }, ...DATA.dimensions.roleLevels.map((role) => ({ key: role, label: role, render: (value) => percent.format(value) }))]);
  exportRows.set('matrix', matrixRows);
}

function initComparison() {
  const values = unique(filteredMonthly({ ignoreDimension: state.compareKind }), state.compareKind);
  state.compareA = fillExact($('#compareA'), values, state.compareA);
  state.compareB = fillExact($('#compareB'), values, state.compareB || values[1] || values[0]);
  const years = [...new Set(DATA.monthly.map((row) => row.month.slice(0, 4)))].sort();
  state.compareYearA = fillExact($('#compareYearA'), years, state.compareYearA);
  state.compareYearB = fillExact($('#compareYearB'), years, state.compareYearB);
}

function renderComparison() {
  const aRows = entitySeries(state.compareKind, state.compareA).filter((row) => row.month.startsWith(state.compareYearA));
  const bRows = entitySeries(state.compareKind, state.compareB).filter((row) => row.month.startsWith(state.compareYearB));
  const labels = Array.from({ length: 12 }, (_, index) => index + 1);
  const byMonth = (rows, value) => rows.find((row) => Number(row.month.slice(5, 7)) === value);
  renderLineChart($('#comparisonChart'), [{ name: `${state.compareA} ${state.compareYearA}`, values: labels.map((month) => byMonth(aRows, month) ? monthRate(byMonth(aRows, month)) : null), color: COLORS[0] }, { name: `${state.compareB} ${state.compareYearB}`, values: labels.map((month) => byMonth(bRows, month) ? monthRate(byMonth(bRows, month)) : null), color: COLORS[2] }], labels, { labelFormatter: (value) => new Date(Date.UTC(2024, value - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }), aria: 'Entity and year comparison' });
  const rows = labels.map((month) => { const left = byMonth(aRows, month); const right = byMonth(bRows, month); const rateA = left ? monthRate(left) : 0; const rateB = right ? monthRate(right) : 0; return { month, rateA, exitsA: left?.exits || 0, rateB, exitsB: right?.exits || 0, variance: rateA - rateB }; });
  rows.push({ month: 'Cumulative', rateA: cumulativeRate(aRows), exitsA: sum(aRows, 'exits'), rateB: cumulativeRate(bRows), exitsB: sum(bRows, 'exits'), variance: cumulativeRate(aRows) - cumulativeRate(bRows), total: true });
  simpleTable($('#comparisonTable'), rows, [{ key: 'month', label: 'Month', render: (value) => esc(value === 'Cumulative' ? value : new Date(Date.UTC(2024, value - 1, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })) }, { key: 'rateA', label: `${state.compareA} turnover`, render: (value) => percent.format(value) }, { key: 'exitsA', label: 'Exits A' }, { key: 'rateB', label: `${state.compareB} turnover`, render: (value) => percent.format(value) }, { key: 'exitsB', label: 'Exits B' }, { key: 'variance', label: 'Variance', render: (value) => percent.format(value) }]);
  exportRows.set('comparison', rows);
}

function renderForecastChart(target, actual, forecast) {
  const labels = [...new Set([...actual.map((row) => row.month), ...forecast.map((row) => row.month)])].sort();
  const actualMap = new Map(actual.map((row) => [row.month, monthRate(row)]));
  const forecastMap = new Map(forecast.map((row) => [row.month, row]));
  renderLineChart(target, [
    { name: 'Actual', values: labels.map((month) => actualMap.get(month)), color: COLORS[0] },
    { name: 'Forecast', values: labels.map((month) => forecastMap.get(month)?.forecastRate), color: COLORS[2], dash: true },
    { name: 'Lower interval', values: labels.map((month) => forecastMap.get(month)?.lowerRate), color: COLORS[3], dash: true },
    { name: 'Upper interval', values: labels.map((month) => forecastMap.get(month)?.upperRate), color: COLORS[3], dash: true },
  ], labels, { height: 350, aria: 'Forecast with lower and upper confidence interval' });
}

function renderForecast() {
  const modelScope = state.scope;
  const filtered = state.type !== 'all' || activeDimensions().length;
  $('#forecastNotice').className = `notice${filtered ? ' warning' : ''}`;
  $('#forecastNotice').textContent = filtered ? `The published model is trained for ${modelScope} and all exits. Global type and dimension filters do not alter its coefficients; use them elsewhere for diagnostic drill-down.` : `Six-month scenario forecast for ${modelScope}. Confidence intervals and backtests are illustrative synthetic model outputs.`;
  const actual = seriesFor({ scope: modelScope, type: 'all', ignoreDimensions: true }).slice(-18);
  const forecast = DATA.forecasts.filter((row) => row.scope === modelScope);
  const summary = DATA.backtestSummary.find((row) => row.scope === modelScope);
  const cards = [['MAE', percent.format(summary.mae), 'Mean absolute error'], ['RMSE', percent.format(summary.rmse), 'Root mean squared error'], ['MAPE', percent.format(summary.mape), 'Relative error'], ['Interval coverage', percent.format(summary.coverage), 'Backtest coverage']];
  $('#forecastKpis').innerHTML = cards.map(([label, value, note]) => `<article class="kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
  renderForecastChart($('#forecastChart'), actual, forecast);
  const annual = DATA.annualBacktest.filter((row) => row.scope === modelScope);
  simpleTable($('#annualBacktest'), annual, [{ key: 'year', label: 'Target year' }, { key: 'actualRate', label: 'Actual cumulative', render: (value) => percent.format(value) }, { key: 'predictedRate', label: 'Predicted cumulative', render: (value) => percent.format(value) }, { key: 'error', label: 'Error', render: (value) => percent.format(value) }]);
  exportRows.set('forecast', [...forecast, ...annual]);
}

function renderEarly() {
  const rows = filteredExits();
  const countAt = (days) => rows.filter((row) => row.tenureDays <= days).length;
  const cards = [[30, countAt(30)], [60, countAt(60)], [90, countAt(90)], [180, countAt(180)]].map(([days, count]) => [`≤ ${days} days`, number.format(count), rows.length ? percent.format(count / rows.length) : '0.0%']);
  $('#earlyKpis').innerHTML = cards.map(([label, value, note]) => `<article class="kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)} of selected exits</small></article>`).join('');
  const buckets = [['0–30 days', 0, 30], ['31–60 days', 31, 60], ['61–90 days', 61, 90], ['91–180 days', 91, 180], ['181–365 days', 181, 365], ['1–2 years', 366, 730], ['2–5 years', 731, 1825], ['5+ years', 1826, Infinity]];
  renderBars($('#tenureBars'), buckets.map(([label, minimum, maximum]) => ({ label, value: rows.filter((row) => row.tenureDays >= minimum && row.tenureDays <= maximum).length })), { percent: false, rose: true });
  const years = [...new Set(rows.map((row) => row.month.slice(0, 4)))].sort().reverse();
  const yearRows = years.map((year) => { const values = rows.filter((row) => row.month.startsWith(year)); const first60 = values.filter((row) => row.tenureDays <= 60).length; const first180 = values.filter((row) => row.tenureDays <= 180).length; return { year, exits: values.length, first60, share60: values.length ? first60 / values.length : 0, first180, share180: values.length ? first180 / values.length : 0 }; });
  simpleTable($('#earlyTable'), yearRows, [{ key: 'year', label: 'Year' }, { key: 'exits', label: 'Exits' }, { key: 'first60', label: '≤60 days' }, { key: 'share60', label: '≤60 share', render: (value) => percent.format(value) }, { key: 'first180', label: '≤180 days' }, { key: 'share180', label: '≤180 share', render: (value) => percent.format(value) }]);
  exportRows.set('early', yearRows);
}

function renderExits() {
  const rows = filteredExits().map((row) => ({ ...row, exitType: reasonType(row), reason: DATA.reasonSettings.find((item) => item.key === row.reasonKey)?.label || row.reasonKey }));
  const reasonRows = DATA.reasonSettings.map((setting) => ({ label: setting.label, value: rows.filter((row) => row.reasonKey === setting.key).length })).sort((a, b) => b.value - a.value);
  renderBars($('#reasonBars'), reasonRows, { percent: false, rose: true });
  const classified = rows.filter((row) => DATA.reasonSettings.some((setting) => setting.key === row.reasonKey)).length;
  $('#classificationQuality').innerHTML = `<div class="mini-kpis"><div><b>${number.format(rows.length)}</b><span>Selected events</span></div><div><b>${percent.format(rows.length ? classified / rows.length : 1)}</b><span>Reasons classified</span></div><div><b>${number.format(Object.keys(reasonOverrides).length)}</b><span>Local overrides</span></div></div><p class="note">Every synthetic exit has a declared reason key. Local settings are stored only in this browser.</p>`;
  const columns = [{ key: 'month', label: 'Month', render: (value) => esc(monthLabel(value, true)) }, { key: 'profileId', label: 'Synthetic profile' }, { key: 'exitType', label: 'Exit type' }, { key: 'reason', label: 'Reason' }, { key: 'scope', label: 'Scope' }, { key: 'region', label: 'Region' }, { key: 'site', label: 'Site' }, { key: 'department', label: 'Department' }, { key: 'roleLevel', label: 'Role' }, { key: 'tenureDays', label: 'Tenure days' }, { key: 'performanceBand', label: 'Performance' }, { key: 'regrettable', label: 'Regrettable', render: (value) => value ? 'Yes' : 'No' }];
  smartTable($('#exitTable'), rows, columns, 'exits');
  exportRows.set('exits', rows);
}

function renderRisk() {
  const exits = filteredExits({ type: 'all' });
  const series = seriesFor({ type: 'all' });
  const monthly = new Map(series.map((row) => [row.month, row]));
  const regrettableMap = new Map();
  exits.filter((row) => row.regrettable && reasonType(row) === 'voluntary').forEach((row) => regrettableMap.set(row.month, (regrettableMap.get(row.month) || 0) + 1));
  const rows = series.map((row) => ({ month: row.month, totalExits: row.exits, regrettableExits: regrettableMap.get(row.month) || 0, regrettableRate: averageWorkforce(row) ? (regrettableMap.get(row.month) || 0) / averageWorkforce(row) : 0 }));
  renderLineChart($('#regrettableChart'), [{ name: 'Regrettable turnover', values: rows.map((row) => row.regrettableRate), color: COLORS[4] }], rows.map((row) => row.month), { aria: 'Regrettable turnover trend' });
  simpleTable($('#regrettableTable'), rows.slice(-12).reverse(), [{ key: 'month', label: 'Month', render: (value) => esc(monthLabel(value, true)) }, { key: 'totalExits', label: 'All exits' }, { key: 'regrettableExits', label: 'Regrettable exits' }, { key: 'regrettableRate', label: 'Rate', render: (value) => percent.format(value) }]);
  const scope = state.scope;
  const curve = DATA.survivalCurve.filter((row) => row.scope === scope);
  const summary = DATA.survivalSummary.find((row) => row.scope === scope);
  $('#survivalKpis').innerHTML = [['Median tenure', `${decimal.format(summary.medianTenureMonths)} mo`], ['12-month survival', percent.format(summary.survival12m)], ['24-month survival', percent.format(summary.survival24m)]].map(([label, value]) => `<div><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('');
  renderLineChart($('#survivalChart'), [{ name: `${scope} survival`, values: curve.map((row) => row.survivalProbability), color: COLORS[1] }], curve.map((row) => row.tenureMonth), { labelFormatter: (value) => `${value} mo`, aria: 'Synthetic workforce survival curve' });
  const locations = DATA.riskLocations.filter((row) => (state.scope === 'Enterprise' || row.scope === state.scope) && (state.region === 'all' || row.region === state.region) && (state.site === 'all' || row.site === state.site));
  simpleTable($('#riskLocationTable'), locations, [{ key: 'site', label: 'Site' }, { key: 'scope', label: 'Scope' }, { key: 'region', label: 'Region' }, { key: 'riskScore', label: 'Risk score' }, { key: 'riskBand', label: 'Band', render: (value) => `<span class="${value === 'Critical' ? 'risk-critical' : value === 'Elevated' ? 'risk-elevated' : ''}">${esc(value)}</span>` }, { key: 'turnover12m', label: '12m turnover', render: (value) => percent.format(value) }, { key: 'averageWorkforce', label: 'Avg workforce', render: (value) => number.format(Math.round(value)) }, { key: 'exits12m', label: '12m exits' }, { key: 'topDriver', label: 'Top driver' }]);
  const profiles = DATA.riskProfiles.filter((row) => (state.scope === 'Enterprise' || row.scope === state.scope) && (state.region === 'all' || row.region === state.region) && (state.site === 'all' || row.site === state.site) && (state.department === 'all' || row.department === state.department) && (state.roleLevel === 'all' || row.roleLevel === state.roleLevel));
  smartTable($('#riskProfileTable'), profiles, [{ key: 'profileId', label: 'Synthetic profile' }, { key: 'riskScore', label: 'Risk score' }, { key: 'riskBand', label: 'Band' }, { key: 'topDriver', label: 'Top driver' }, { key: 'scope', label: 'Scope' }, { key: 'region', label: 'Region' }, { key: 'site', label: 'Site' }, { key: 'department', label: 'Department' }, { key: 'roleLevel', label: 'Role' }, { key: 'tenureMonths', label: 'Tenure months' }, { key: 'performanceBand', label: 'Performance' }], 'risk');
  exportRows.set('risk', [...locations, ...profiles]);
}

function renderSettings() {
  const query = $('#reasonSearch').value.toLocaleLowerCase('en-US');
  const rows = DATA.reasonSettings.filter((row) => !query || `${row.label} ${row.group}`.toLocaleLowerCase('en-US').includes(query));
  $('#reasonSettings').innerHTML = `<div class="reason-row header"><span>Reason</span><span>Group</span><span>Classification</span></div>${rows.map((row) => `<div class="reason-row"><span><b>${esc(row.label)}</b><small>${esc(row.key)}</small></span><span>${esc(row.group)}</span><select class="reason-select" data-key="${esc(row.key)}"><option value="voluntary" ${(reasonDraft[row.key] || reasonOverrides[row.key] || row.defaultType) === 'voluntary' ? 'selected' : ''}>Voluntary</option><option value="involuntary" ${(reasonDraft[row.key] || reasonOverrides[row.key] || row.defaultType) === 'involuntary' ? 'selected' : ''}>Involuntary</option></select></div>`).join('')}`;
  $('#reasonSettings').querySelectorAll('.reason-select').forEach((select) => select.addEventListener('change', () => { reasonDraft[select.dataset.key] = select.value; }));
}

function renderActive() {
  renderChips();
  if (state.tab === 'overview') renderOverview();
  if (state.tab === 'breakdown') renderBreakdown();
  if (state.tab === 'comparison') renderComparison();
  if (state.tab === 'forecast') renderForecast();
  if (state.tab === 'early') renderEarly();
  if (state.tab === 'exits') renderExits();
  if (state.tab === 'risk') renderRisk();
  if (state.tab === 'settings') renderSettings();
}

function download(name, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function csvDownload(name, rows) {
  if (!rows?.length) return;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  download(name, `\ufeff${[columns.map(cell).join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\r\n')}`, 'text/csv;charset=utf-8');
}

function setPeriod(value) {
  const months = [...new Set(DATA.monthly.map((row) => row.month))].sort();
  state.end = months.at(-1);
  state.start = value === 'all' ? months[0] : months[Math.max(0, months.length - Number(value))];
  $('#startFilter').value = state.start;
  $('#endFilter').value = state.end;
  updateDimensionFilters();
  renderActive();
}

function bind() {
  $('#tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    state.tab = button.dataset.tab;
    document.querySelectorAll('.tab').forEach((node) => node.classList.toggle('active', node === button));
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === state.tab));
    renderActive();
  });
  $('#scopeFilter').addEventListener('change', () => { state.scope = $('#scopeFilter').value; updateDimensionFilters(); initComparison(); renderActive(); });
  $('#typeFilter').addEventListener('change', () => { state.type = $('#typeFilter').value; renderActive(); });
  $('#startFilter').addEventListener('change', () => { state.start = $('#startFilter').value; if (state.start > state.end) state.end = state.start; $('#endFilter').value = state.end; updateDimensionFilters(); initComparison(); renderActive(); });
  $('#endFilter').addEventListener('change', () => { state.end = $('#endFilter').value; if (state.end < state.start) state.start = state.end; $('#startFilter').value = state.start; updateDimensionFilters(); initComparison(); renderActive(); });
  for (const [key, control] of Object.entries(dimensionControls)) control.addEventListener('change', () => { state[key] = control.value; updateDimensionFilters(); initComparison(); renderActive(); });
  document.querySelectorAll('[data-period]').forEach((button) => button.addEventListener('click', () => setPeriod(button.dataset.period)));
  $('#resetFilters').addEventListener('click', () => { Object.assign(state, { scope: 'Enterprise', type: 'all', region: 'all', site: 'all', department: 'all', division: 'all', city: 'all', gender: 'all', contractType: 'all', roleLevel: 'all' }); $('#scopeFilter').value = state.scope; $('#typeFilter').value = state.type; setPeriod('all'); });
  $('#scopeTrendMode').addEventListener('change', () => { state.scopeTrendMode = $('#scopeTrendMode').value; renderOverview(); });
  $('#breakdownDimension').addEventListener('change', () => { state.breakdownDimension = $('#breakdownDimension').value; renderBreakdown(); });
  $('#breakdownMetric').addEventListener('change', () => { state.breakdownMetric = $('#breakdownMetric').value; renderBreakdown(); });
  $('#roleMatrixMode').addEventListener('change', () => { state.roleMatrixMode = $('#roleMatrixMode').value; renderBreakdown(); });
  $('#compareKind').addEventListener('change', () => { state.compareKind = $('#compareKind').value; state.compareA = ''; state.compareB = ''; initComparison(); renderComparison(); });
  [['compareA', '#compareA'], ['compareB', '#compareB'], ['compareYearA', '#compareYearA'], ['compareYearB', '#compareYearB']].forEach(([key, selector]) => $(selector).addEventListener('change', () => { state[key] = $(selector).value; renderComparison(); }));
  document.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', () => csvDownload(`synthetic-turnover-${button.dataset.export}.csv`, exportRows.get(button.dataset.export))));
  $('#exportActive').addEventListener('click', () => csvDownload(`synthetic-turnover-${state.tab}.csv`, exportRows.get(state.tab)));
  $('#reasonSearch').addEventListener('input', renderSettings);
  $('#applyReasons').addEventListener('click', () => { reasonOverrides = { ...reasonOverrides, ...reasonDraft }; localStorage.setItem(STORAGE_KEY, JSON.stringify(reasonOverrides)); reasonDraft = {}; renderActive(); });
  $('#resetReasons').addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); reasonOverrides = {}; reasonDraft = {}; renderSettings(); });
  $('#exportReasons').addEventListener('click', () => download('synthetic-turnover-reason-settings.json', JSON.stringify({ schema: 2, mapping: reasonOverrides }, null, 2), 'application/json;charset=utf-8'));
  $('#importReasons').addEventListener('click', () => $('#reasonFile').click());
  $('#reasonFile').addEventListener('change', async () => { const file = $('#reasonFile').files[0]; if (!file) return; try { const parsed = JSON.parse(await file.text()); const mapping = parsed.mapping || parsed; reasonDraft = Object.fromEntries(Object.entries(mapping).filter(([key, value]) => DATA.reasonSettings.some((row) => row.key === key) && ['voluntary', 'involuntary'].includes(value))); renderSettings(); } catch { $('#errorState').hidden = false; $('#errorState span').textContent = 'The selected reason settings file is not valid JSON.'; } $('#reasonFile').value = ''; });
  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderActive, 180); });
}

async function start() {
  const response = await fetch('./data.json');
  if (!response.ok) throw new Error(`Data request returned ${response.status}`);
  DATA = await response.json();
  try { reasonOverrides = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { reasonOverrides = {}; }
  const months = [...new Set(DATA.monthly.map((row) => row.month))].sort();
  state.start = months[0];
  state.end = months.at(-1);
  fillExact($('#scopeFilter'), DATA.dimensions.scopes, state.scope);
  fillExact($('#startFilter'), months, state.start);
  fillExact($('#endFilter'), months, state.end);
  updateDimensionFilters();
  initComparison();
  bind();
  renderActive();
  window.__TURNOVER_AUDIT__ = { version: DATA.meta.version, monthlyRows: DATA.monthly.length, syntheticExitRows: DATA.exits.length, tabs: document.querySelectorAll('[data-tab]').length, formula: DATA.methodology.cumulativeTurnover, realPeople: DATA.privacy.realPeople, realBusinesses: DATA.privacy.realBusinesses };
}

start().catch((error) => { console.error(error); $('#errorState').hidden = false; });
