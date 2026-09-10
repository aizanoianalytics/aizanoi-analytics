const finite = Number.isFinite;
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const formatPercent = (value) => finite(value) ? `${value >= 0 ? '+' : ''}${number.format(value * 100)}%` : '—';
export const formatLevelPercent = (value) => finite(value) ? `${number.format(value * 100)}%` : '—';
export const detailUrl = (market, slug) => `/analytics/markets/instrument/?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(slug)}`;

export function sliceTimeframe(candles, timeframe) {
  const sizes = { '1M': 30, '3M': 90, '6M': 180, '1Y': 252, '5Y': 1260 };
  if (!candles || !candles.length || timeframe === 'ALL' || !sizes[timeframe]) return [...(candles || [])];
  const lastTs = Number(candles[candles.length - 1]?.t);
  if (Number.isFinite(lastTs) && candles.length > 1) {
    const stepSeconds = (candles[candles.length - 1].t - candles[0].t) / (candles.length - 1);
    if (stepSeconds < 43200) {
      const days = sizes[timeframe];
      const cutoff = lastTs - (days * 86400);
      const filtered = candles.filter(row => row.t >= cutoff);
      if (filtered.length > 0) return filtered;
    }
  }
  return candles.slice(-sizes[timeframe]);
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
  const macd = values.map((_, index) => finite(ema12[index]) && finite(ema26[index]) ? ema12[index] - ema26[index] : null);
  const compactMacd = macd.filter(finite);
  const signalCompact = ema(compactMacd, 9);
  let signalIndex = 0;
  const macdSignal = macd.map(value => finite(value) ? signalCompact[signalIndex++] : null);
  return {
    sma20,
    sma50: sma(50),
    sma200: sma(200),
    ema12,
    ema26,
    bollingerUpper: sma20.map((value, index) => finite(value) ? value + 2 * deviation20[index] : null),
    bollingerLower: sma20.map((value, index) => finite(value) ? value - 2 * deviation20[index] : null),
    rsi14: wilderRsi(values),
    macd,
    macdSignal,
    roc20: values.map((value, index) => index < 20 || values[index - 20] === 0 ? null : value / values[index - 20] - 1),
  };
}

export function sortRows(rows, key, direction = 'auto') {
  const ascending = direction === 'asc' || (direction === 'auto' && key === 'drawdown1y');
  return [...rows].sort((left, right) => {
    const a = left[key]; const b = right[key];
    if (!finite(a) && !finite(b)) return 0;
    if (!finite(a)) return 1;
    if (!finite(b)) return -1;
    return ascending ? a - b : b - a;
  });
}

export function createWatchlist(storage = globalThis.localStorage) {
  const key = 'aizanoi.markets.watchlist.v1';
  let values;
  try { values = new Set(JSON.parse(storage?.getItem(key) || '[]')); } catch { values = new Set(); }
  const persist = () => {
    try { storage?.setItem(key, JSON.stringify([...values].sort())); } catch {}
  };
  return {
    has: value => values.has(value),
    values: () => [...values],
    toggle(value) { values.has(value) ? values.delete(value) : values.add(value); persist(); return values.has(value); },
  };
}

export const DEFAULT_PRESETS = [
  { id: 'momentum-leaders', name: 'Momentum Leaders', desc: 'Highest momentum quality in strong uptrend', config: { sort: 'momentumQuality', regime: 'strong-uptrend' } },
  { id: 'oversold-trend', name: 'Oversold Above Long Trend', desc: 'RSI under 35 holding above 200-session average', config: { rsiMax: 35, regime: 'above200' } },
  { id: 'fresh-breakouts', name: 'Fresh Breakouts', desc: 'Top 5% 52-week range with golden cross', config: { rangeMin: 95, regime: 'golden' } },
  { id: 'deep-drawdown', name: 'Deep Drawdown', desc: 'Largest drawdown from 52-week peak', config: { sort: 'drawdown1y' } },
  { id: 'high-volatility', name: 'High Volatility Watch', desc: 'Top annualized 20-day realized volatility', config: { sort: 'volatility20' } },
];

export function createSavedScreens(storage = globalThis.localStorage) {
  const key = 'aizanoi.markets.savedScreens.v1';
  let screens = [];
  try { screens = JSON.parse(storage?.getItem(key) || '[]'); } catch { screens = []; }
  const persist = () => {
    try { storage?.setItem(key, JSON.stringify(screens)); } catch {}
  };
  return {
    presets: () => DEFAULT_PRESETS,
    custom: () => [...screens],
    save(name, config) {
      screens = screens.filter(s => s.name !== name);
      screens.push({ id: `screen-${Date.now()}`, name, config });
      persist();
    },
    remove(id) {
      screens = screens.filter(s => s.id !== id);
      persist();
    },
  };
}

export function filterRows(rows, { query = '', watchlistOnly = false, watchlist, exchange = '', regime = '', minPrice = null, minSessions = null, rsiMin = null, rsiMax = null, rangeMin = null, rangeMax = null } = {}) {
  const needle = query.trim().toLowerCase();
  return rows.filter(row => {
    if (needle && !`${row.ticker} ${row.name}`.toLowerCase().includes(needle)) return false;
    if (watchlistOnly && !watchlist?.has(`${row.market}:${row.slug}`)) return false;
    if (exchange && row.exchange !== exchange) return false;
    if (Number.isFinite(minPrice) && (!finite(row.latest) || row.latest < minPrice)) return false;
    if (Number.isFinite(minSessions) && (!finite(row.historySessions) || row.historySessions < minSessions)) return false;
    if (Number.isFinite(rsiMin) && (!finite(row.rsi14) || row.rsi14 < rsiMin)) return false;
    if (Number.isFinite(rsiMax) && (!finite(row.rsi14) || row.rsi14 > rsiMax)) return false;
    if (Number.isFinite(rangeMin) && (!finite(row.rangePosition52w) || row.rangePosition52w < rangeMin)) return false;
    if (Number.isFinite(rangeMax) && (!finite(row.rangePosition52w) || row.rangePosition52w > rangeMax)) return false;
    if (regime === 'above200' && row.aboveSma200 !== true) return false;
    if (regime === 'below200' && row.aboveSma200 !== false) return false;
    if (regime === 'golden' && row.smaCross !== 'golden') return false;
    if (regime === 'death' && row.smaCross !== 'death') return false;
    if (regime && !['above200','below200','golden','death'].includes(regime) && row.trendRegime !== regime) return false;
    return true;
  });
}

const labels = { ticker:'Ticker', name:'Name', exchange:'Exchange', latest:'Price', return1d:'1D', return30d:'30D', volatility20:'Volatility', rangePosition52w:'52W Range', percentile30d:'30D Percentile', relativeStrength30d:'30D Relative Strength', rsi14:'RSI 14', trendAge50:'Days Above SMA50' };
export function rowsToCsv(rows, columns) {
  const escape = value => {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text) && !Number.isFinite(Number(text))) {
      text = `'${text}`;
    }
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.map(column => labels[column] || column).join(','), ...rows.map(row => columns.map(column => escape(row[column])).join(','))].join('\n');
}

export function marketSessionState(market, date = new Date()) {
  if (market === 'crypto') return { open:true, label:'Crypto trades continuously' };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date).map(part => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = !['Sat', 'Sun'].includes(parts.weekday);
  const open = weekday && minutes >= 570 && minutes < 960;
  return { open, label: open ? 'Within regular US session hours' : 'Outside regular US session hours' };
}
