const finite = Number.isFinite;
const intFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const usdFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export const formatPercent = (value) => {
  if (!finite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  return `${sign}${intFormat.format(Math.abs(value) * 100)}%`;
};

export const formatLevelPercent = (value) => {
  if (!finite(value)) return '—';
  return `${intFormat.format(Math.abs(value) * 100)}%`;
};

export const formatSignedReturn = (value) => {
  if (!finite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  return `${sign}${intFormat.format(Math.abs(value) * 100)}%`;
};

export const formatPrice = (value) => finite(value) ? usdFormat.format(value) : '—';

export const formatNumber = (value) => finite(value) ? intFormat.format(value) : '—';

export const detailUrl = (market, slug) => `/analytics/markets/instrument/?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(slug)}`;

export function sliceTimeframe(candles, timeframe) {
  const calendarDays = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 365 * 2, '3Y': 365 * 3, '5Y': 365 * 5 };
  if (!candles || !candles.length) return [];
  if (timeframe === 'ALL' || timeframe === 'SINCE_2019' || timeframe === 'CUSTOM') return [...candles];
  const days = calendarDays[timeframe];
  if (!days) return [...candles];
  const lastTs = Number(candles[candles.length - 1]?.t);
  if (!Number.isFinite(lastTs)) return [];
  const cutoff = lastTs - (days * 86400);
  return candles.filter(row => Number(row?.t) >= cutoff);
}

function rolling(values, size, calculate) {
  return values.map((_, index) => index + 1 < size ? null : calculate(values.slice(index + 1 - size, index + 1)));
}

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1));
}

function ema(values, size) {
  const factor = 2 / (size + 1);
  let previous = null;
  return values.map((value, index) => {
    if (index + 1 < size) return null;
    if (previous === null) previous = mean(values.slice(0, size));
    else previous = value * factor + previous * (1 - factor);
    return previous;
  });
}

export function wilderRsi(values, size = 14) {
  if (!Array.isArray(values) || values.length <= size) return (values || []).map(() => null);
  const result = new Array(values.length).fill(null);
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= size; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / size;
  let avgLoss = lossSum / size;
  result[size] = avgLoss === 0 ? (avgGain > 0 ? 100 : 50) : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = size + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (size - 1) + gain) / size;
    avgLoss = (avgLoss * (size - 1) + loss) / size;
    result[i] = avgLoss === 0 ? (avgGain > 0 ? 100 : 50) : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return result;
}

export function indicatorSeries(candles) {
  const values = candles.map(row => Number(row.c));
  const sma = (size) => rolling(values, size, mean);
  const sma20 = sma(20);
  const deviation20 = rolling(values, 20, standardDeviation);
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const ema50 = ema(values, 50);
  const macd = values.map((_, index) => finite(ema12[index]) && finite(ema26[index]) ? ema12[index] - ema26[index] : null);
  const compactMacd = macd.filter(finite);
  const signalCompact = ema(compactMacd, 9);
  let signalIndex = 0;
  const macdSignal = macd.map(value => finite(value) ? signalCompact[signalIndex++] : null);
  const macdHistogram = macd.map((value, index) => finite(value) && finite(macdSignal[index]) ? value - macdSignal[index] : null);
  return {
    sma20,
    sma50: sma(50),
    sma200: sma(200),
    ema12,
    ema26,
    ema50,
    bollingerUpper: sma20.map((value, index) => finite(value) ? value + 2 * deviation20[index] : null),
    bollingerLower: sma20.map((value, index) => finite(value) ? value - 2 * deviation20[index] : null),
    rsi14: wilderRsi(values),
    macd,
    macdSignal,
    macdHistogram,
    roc12: values.map((value, index) => index < 12 || values[index - 12] === 0 ? null : value / values[index - 12] - 1),
  };
}

export const PICK_HORIZONS = ['return1d', 'return1w', 'return1m', 'return3m', 'return6m', 'return1y', 'return2y', 'return3y', 'returnSince2019'];
export const PICK_HORIZON_LABELS = { return1d:'1D', return1w:'1W', return1m:'1M', return3m:'3M', return6m:'6M', return1y:'1Y', return2y:'2Y', return3y:'3Y', returnSince2019:'Since 2019' };

export function evaluateMomentumEligibility(row) {
  const statuses = Object.fromEntries(PICK_HORIZONS.map(key => {
    const value = row?.[key];
    return [key, Number.isFinite(value) ? (value > 0 ? 'positive' : value < 0 ? 'negative' : 'flat') : 'missing'];
  }));
  const positiveCount = Object.values(statuses).filter(status => status === 'positive').length;
  const negativeCount = Object.values(statuses).filter(status => status === 'negative').length;
  const validCount = Object.values(statuses).filter(status => status !== 'missing').length;
  const strong = positiveCount >= 8;
  const weak = negativeCount >= 8;
  return { eligibility: strong ? 'strong' : weak ? 'weak' : 'ineligible', positiveCount, negativeCount, validCount, statuses };
}

export function pickMomentumRows(rows) {
  return rows
    .map(row => ({ row, eligibility: evaluateMomentumEligibility(row) }))
    .filter(entry => entry.eligibility.eligibility !== 'ineligible')
    .sort((a, b) => {
      if (a.eligibility.eligibility !== b.eligibility.eligibility) return a.eligibility.eligibility === 'strong' ? -1 : 1;
      const countDelta = a.eligibility.eligibility === 'strong'
        ? b.eligibility.positiveCount - a.eligibility.positiveCount
        : b.eligibility.negativeCount - a.eligibility.negativeCount;
      if (countDelta) return countDelta;
      const yDelta = a.eligibility.eligibility === 'strong'
        ? (b.row.return1y || -Infinity) - (a.row.return1y || -Infinity)
        : (a.row.return1y || Infinity) - (b.row.return1y || Infinity);
      if (yDelta) return yDelta;
      return String(a.row.ticker).localeCompare(String(b.row.ticker));
    })
    .map(entry => entry.row);
}

export function sortRows(rows, key, direction = 'desc') {
  const ascending = direction === 'asc';
  return [...rows].sort((left, right) => {
    const a = left[key]; const b = right[key];
    const aMissing = a == null || (typeof a === 'number' && !finite(a));
    const bMissing = b == null || (typeof b === 'number' && !finite(b));
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (typeof a === 'string' || typeof b === 'string') {
      const cmp = String(a).localeCompare(String(b));
      return ascending ? cmp : -cmp;
    }
    return ascending ? a - b : b - a;
  });
}

export function filterRows(rows, options = {}) {
  const {
    query = '',
    exchange = '',
    membership = '',
    memberships = [],
    minPrice = null,
    maxPrice = null,
    performance = null,
    priceMode = 'price',
  } = options;
  const needle = String(query || '').trim().toLowerCase();
  return rows.filter(row => {
    if (needle) {
      const haystack = `${row.ticker || ''} ${row.name || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (exchange && row.exchange !== exchange) return false;
    const rowMemberships = Array.isArray(row.memberships) ? row.memberships : [];
    const wantedMemberships = memberships.length ? memberships : (membership ? [membership] : []);
    if (wantedMemberships.length && !wantedMemberships.some(value => rowMemberships.includes(value))) return false;
    const priceField = row.latestPrice ?? row.latest;
    if (finite(minPrice) && (!finite(priceField) || priceField < minPrice)) return false;
    if (finite(maxPrice) && (!finite(priceField) || priceField > maxPrice)) return false;
    if (performance?.horizon) {
      const value = row[performance.horizon];
      if (!finite(value)) return false;
      const min = performance.min; const max = performance.max;
      if (performance.op === 'gt' && (!finite(min) || value <= min)) return false;
      if (performance.op === 'lt' && (!finite(min) || value >= min)) return false;
      if (performance.op === 'between' && (!finite(min) || !finite(max) || value < min || value > max)) return false;
    }
    return true;
  });
}

export function paginate(rows, page, pageSize) {
  const total = rows.length;
  const safeSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safeSize;
  const end = Math.min(start + safeSize, total);
  return { rows: rows.slice(start, end), page: safePage, pageSize: safeSize, total, totalPages, start, end };
}

export function toISODate(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export function filterHistoryRows(rows, { dateFrom = '', dateTo = '', search = '' } = {}) {
  const fromMs = dateFrom ? Date.parse(`${dateFrom}T00:00:00Z`) : null;
  const toMs = dateTo ? Date.parse(`${dateTo}T23:59:59Z`) : null;
  const term = String(search || '').trim();
  return (rows || []).filter(row => {
    const ms = row.t * 1000;
    if (fromMs != null && Number.isFinite(fromMs) && ms < fromMs) return false;
    if (toMs != null && Number.isFinite(toMs) && ms > toMs) return false;
    if (term && !toISODate(row.t).includes(term)) return false;
    return true;
  });
}

export function historyDailyChange(row, rows, index) {
  const previous = rows[index - 1];
  if (!previous || !Number.isFinite(previous.c) || !Number.isFinite(row.c)) return null;
  return row.c / previous.c - 1;
}

export function activeFilterChips(state) {
  const chips = [];
  if (state.query) chips.push({ key:'q', label:`Search "${state.query}"`, value:state.query });
  if (state.exchange) chips.push({ key:'exchange', label:`Exchange ${state.exchange}`, value:state.exchange });
  if (state.membership) chips.push({ key:'membership', label:`Membership ${state.membership}`, value:state.membership });
  if (finite(state.minPrice) || finite(state.maxPrice)) {
    const lo = finite(state.minPrice) ? intFormat.format(state.minPrice) : '0';
    const hi = finite(state.maxPrice) ? intFormat.format(state.maxPrice) : '∞';
    chips.push({ key:'price', label:`Price ${lo}–${hi}`, value:'price' });
  }
  if (state.performance?.horizon) {
    const horizonLabel = PICK_HORIZON_LABELS[state.performance.horizon] || state.performance.horizon;
    const op = state.performance.op;
    const min = finite(state.performance.min) ? `${intFormat.format(state.performance.min * 100)}%` : '';
    const max = finite(state.performance.max) ? `${intFormat.format(state.performance.max * 100)}%` : '';
    let label = `${horizonLabel} ${op === 'gt' ? '>' : op === 'lt' ? '<' : 'between'} ${min}${op === 'between' ? ` and ${max}` : ''}`;
    chips.push({ key:'performance', label, value:'performance' });
  }
  return chips;
}

export function defaultState(overrides = {}) {
  return {
    market:'us',
    view:'main',
    query:'',
    sort:{ key:'return1d', direction:'desc' },
    exchange:'',
    membership:'',
    minPrice:null,
    maxPrice:null,
    performance:{ horizon:'', op:'gt', min:null, max:null },
    priceMode:'price',
    filtersOpen:false,
    page:1,
    pageSize:100,
    ...overrides,
  };
}

export function marketSessionState(market, date = new Date()) {
  if (market === 'crypto') return { open:true, label:'Crypto trades continuously' };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date).map(part => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = !['Sat','Sun'].includes(parts.weekday);
  const open = weekday && minutes >= 570 && minutes < 960;
  return { open, label: open ? 'Within regular US session hours' : 'Outside regular US session hours' };
}

export const PRICE_COLUMNS = [
  { key:'latestPrice', label:'Latest' },
  { key:'previousPrice', label:'Previous' },
  { key:'price1w', label:'1W' },
  { key:'price1m', label:'1M' },
  { key:'price3m', label:'3M' },
  { key:'price6m', label:'6M' },
  { key:'price1y', label:'1Y' },
  { key:'price2y', label:'2Y' },
  { key:'price3y', label:'3Y' },
  { key:'price2019', label:'2019' },
];

export const CHANGE_COLUMNS = [
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

export const HORIZON_CARDS = [
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
