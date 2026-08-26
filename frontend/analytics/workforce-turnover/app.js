const controls = {
  period: document.querySelector('#periodFilter'),
  region: document.querySelector('#regionFilter'),
  department: document.querySelector('#departmentFilter'),
  contract: document.querySelector('#contractFilter'),
};

const number = new Intl.NumberFormat('en-US');
const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
let dataset;
let filteredRows = [];

const averageWorkforce = (row) => (row.startHeadcount + row.endHeadcount) / 2;
const turnoverRate = (rows) => {
  const denominator = rows.reduce((sum, row) => sum + averageWorkforce(row), 0);
  return denominator ? rows.reduce((sum, row) => sum + row.exits, 0) / denominator * 100 : 0;
};
const monthLabel = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function addOptions(select, values) {
  values.forEach((value) => select.add(new Option(value, value)));
}

function matchesScope(row) {
  return (controls.period.value === 'all' || row.month.startsWith(controls.period.value))
    && (controls.region.value === 'all' || row.region === controls.region.value)
    && (controls.department.value === 'all' || row.department === controls.department.value)
    && (controls.contract.value === 'all' || row.contractType === controls.contract.value);
}

function monthlyTotals(rows) {
  const totals = new Map();
  rows.forEach((row) => {
    const current = totals.get(row.month) || { month: row.month, startHeadcount: 0, hires: 0, exits: 0, endHeadcount: 0 };
    current.startHeadcount += row.startHeadcount;
    current.hires += row.hires;
    current.exits += row.exits;
    current.endHeadcount += row.endHeadcount;
    totals.set(row.month, current);
  });
  return [...totals.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function groupStats(rows, key) {
  const groups = new Map();
  rows.forEach((row) => {
    const values = groups.get(row[key]) || [];
    values.push(row);
    groups.set(row[key], values);
  });
  return [...groups].map(([label, values]) => ({ label, rate: turnoverRate(values), exits: values.reduce((sum, row) => sum + row.exits, 0) }))
    .sort((a, b) => b.rate - a.rate);
}

function renderKpis(months) {
  const totalExits = months.reduce((sum, row) => sum + row.exits, 0);
  const totalHires = months.reduce((sum, row) => sum + row.hires, 0);
  const average = months.length ? months.reduce((sum, row) => sum + averageWorkforce(row), 0) / months.length : 0;
  const rate = turnoverRate(months);
  const net = months.length ? months.at(-1).endHeadcount - months[0].startHeadcount : 0;
  const kpis = [
    ['Period turnover', `${decimal.format(rate)}%`, 'Monthly average denominator', true],
    ['Average workforce', number.format(Math.round(average)), `${months.length} monthly observations`],
    ['Total exits', number.format(totalExits), 'Aggregate events'],
    ['Total hires', number.format(totalHires), 'Aggregate events'],
    ['Net workforce change', `${net > 0 ? '+' : ''}${number.format(net)}`, 'First start to last end'],
  ];
  document.querySelector('#kpis').innerHTML = kpis.map(([label, value, note, primary]) => `<article class="kpi${primary ? ' primary' : ''}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
}

function renderTrend(months) {
  const host = document.querySelector('#trendChart');
  if (!months.length) { host.innerHTML = '<p class="empty">No monthly data matches this scope.</p>'; return; }
  const values = months.map((row) => ({ month: row.month, value: turnoverRate([row]) }));
  const width = Math.max(300, Math.round(host.clientWidth || 900));
  const height = 285;
  const margin = { top: 20, right: 25, bottom: 42, left: 48 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const max = Math.max(1, Math.ceil(Math.max(...values.map((item) => item.value))));
  const x = (index) => margin.left + (values.length === 1 ? innerWidth / 2 : index / (values.length - 1) * innerWidth);
  const y = (value) => margin.top + innerHeight - value / max * innerHeight;
  const line = values.map((item, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(item.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1)},${margin.top + innerHeight} L${x(0)},${margin.top + innerHeight} Z`;
  const ticks = [0, .25, .5, .75, 1].map((ratio) => {
    const value = max * ratio;
    const tickY = y(value);
    return `<line class="chart-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${tickY}" y2="${tickY}"/><text class="chart-label" x="${margin.left - 10}" y="${tickY + 4}" text-anchor="end">${decimal.format(value)}%</text>`;
  }).join('');
  const labelTarget = width < 500 ? 4 : 8;
  const labels = values.map((item, index) => index % Math.max(1, Math.ceil(values.length / labelTarget)) === 0 || index === values.length - 1
    ? `<text class="chart-label" x="${x(index)}" y="${height - 12}" text-anchor="middle">${monthLabel(item.month)}</text>` : '').join('');
  const points = values.map((item, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(item.value)}" r="4"><title>${monthLabel(item.month)}: ${decimal.format(item.value)}%</title></circle>`).join('');
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><defs><linearGradient id="turnoverFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#72b7b3" stop-opacity=".42"/><stop offset="1" stop-color="#72b7b3" stop-opacity=".03"/></linearGradient></defs>${ticks}<path class="chart-area" d="${area}"/><path class="chart-line" d="${line}"/>${points}${labels}</svg>`;
  host.setAttribute('aria-label', `Monthly turnover rate from ${monthLabel(values[0].month)} to ${monthLabel(values.at(-1).month)}. Highest value ${decimal.format(Math.max(...values.map((item) => item.value)))} percent.`);
}

function renderDepartments(rows) {
  const stats = groupStats(rows, 'department');
  const max = Math.max(...stats.map((item) => item.rate), 1);
  document.querySelector('#departmentBars').innerHTML = stats.length ? stats.map((item) => `<div class="bar-row"><div class="bar-copy"><span>${item.label}</span><b>${decimal.format(item.rate)}%</b></div><div class="bar-track"><progress class="bar-progress" max="${max}" value="${item.rate}" aria-label="${item.label}: ${decimal.format(item.rate)} percent"></progress></div></div>`).join('') : '<p class="empty">No department data.</p>';
}

function renderReasons() {
  const reasons = dataset.exitReasons.filter(matchesScope);
  const counts = new Map(dataset.dimensions.exitReasons.map((reason) => [reason, 0]));
  reasons.forEach((row) => counts.set(row.reason, counts.get(row.reason) + row.count));
  const sorted = [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const total = sorted.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(...sorted.map((item) => item.count), 1);
  document.querySelector('#reasonTotal').textContent = `${number.format(total)} exits classified`;
  document.querySelector('#reasonList').innerHTML = sorted.map((item) => `<div class="reason-row"><span>${item.label}</span><div class="reason-track"><progress class="reason-progress" max="${max}" value="${item.count}" aria-label="${item.label}: ${number.format(item.count)} exits"></progress></div><b>${number.format(item.count)}</b></div>`).join('');
}

function renderInsight(months, rows) {
  if (!months.length) { document.querySelector('#insightText').textContent = 'No observations match the selected scope.'; return; }
  const monthRates = months.map((row) => ({ month: row.month, rate: turnoverRate([row]) }));
  const peak = monthRates.reduce((best, item) => item.rate > best.rate ? item : best);
  const department = groupStats(rows, 'department')[0];
  const direction = monthRates.at(-1).rate - monthRates[0].rate;
  const movement = Math.abs(direction) < .1 ? 'broadly stable relative to' : direction > 0 ? 'higher than' : 'lower than';
  document.querySelector('#insightText').textContent = `${monthLabel(peak.month)} has the highest monthly turnover in this selection at ${decimal.format(peak.rate)}%. ${department.label} records the highest departmental period rate at ${decimal.format(department.rate)}%. The final month is ${movement} the first month.`;
}

function renderTable(months) {
  document.querySelector('#monthlyRows').innerHTML = months.map((row) => `<tr><td>${monthLabel(row.month)}</td><td>${number.format(row.startHeadcount)}</td><td>${number.format(row.hires)}</td><td>${number.format(row.exits)}</td><td>${number.format(row.endHeadcount)}</td><td>${decimal.format(turnoverRate([row]))}%</td></tr>`).join('');
}

function updateScopeSummary(months) {
  const labels = [controls.period, controls.region, controls.department, controls.contract].map((control) => control.selectedOptions[0].textContent);
  document.querySelector('#scopeSummary').textContent = `${labels.join(' · ')} · ${number.format(filteredRows.length)} aggregate cells · ${months.length} months`;
}

function render() {
  filteredRows = dataset.monthly.filter(matchesScope);
  const months = monthlyTotals(filteredRows);
  renderKpis(months);
  renderTrend(months);
  renderDepartments(filteredRows);
  renderReasons();
  renderInsight(months, filteredRows);
  renderTable(months);
  updateScopeSummary(months);
}

function downloadCsv() {
  const columns = ['month', 'region', 'department', 'contractType', 'startHeadcount', 'hires', 'exits', 'endHeadcount'];
  const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [columns.join(','), ...filteredRows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'synthetic-workforce-turnover.csv';
  link.click();
  URL.revokeObjectURL(url);
}

async function start() {
  const response = await fetch('./data.json');
  if (!response.ok) throw new Error(`Data request returned ${response.status}`);
  dataset = await response.json();
  addOptions(controls.region, dataset.dimensions.regions);
  addOptions(controls.department, dataset.dimensions.departments);
  addOptions(controls.contract, dataset.dimensions.contractTypes);
  Object.values(controls).forEach((control) => control.addEventListener('change', render));
  document.querySelector('#downloadCsv').addEventListener('click', downloadCsv);
  render();
}

start().catch((error) => {
  console.error(error);
  document.querySelector('#errorState').hidden = false;
});
