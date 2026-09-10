const finite = Number.isFinite;
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const trailingReturn = (values, sessions) => values.length > sessions && values.at(-(sessions + 1)) ? values.at(-1) / values.at(-(sessions + 1)) - 1 : null;
const sma = (values, sessions) => values.length >= sessions ? mean(values.slice(-sessions)) : null;

export function computeMetrics(candles, { annualization = 252 } = {}) {
  const closes = candles.map(row => row.c).filter(value => finite(value) && value > 0);
  if (!closes.length) return { latest:null };
  const logReturns = closes.slice(1).map((value,index) => Math.log(value / closes[index]));
  const window = logReturns.slice(-20); const average = mean(window);
  const deviation = window.length > 1 ? Math.sqrt(window.reduce((sum,value) => sum + (value - average) ** 2, 0) / (window.length - 1)) : null;
  const recentYear = closes.slice(-252); const latest = closes.at(-1); const low = Math.min(...recentYear); const high = Math.max(...recentYear);
  let peak = -Infinity; let drawdown1y = 0;
  for (const close of recentYear) { peak = Math.max(peak, close); drawdown1y = Math.min(drawdown1y, close / peak - 1); }
  const sma20 = sma(closes,20); const sma50 = sma(closes,50); const sma200 = sma(closes,200);
  return {
    latest, return1d:trailingReturn(closes,1), return7d:trailingReturn(closes,5), return30d:trailingReturn(closes,21), return90d:trailingReturn(closes,63), return1y:trailingReturn(closes,252),
    volatility20:finite(deviation) ? deviation * Math.sqrt(annualization) : null, drawdown1y,
    distanceFrom52wHigh:latest / high - 1, rangePosition52w:high > low ? (latest - low) / (high - low) : .5,
    sma20,sma50,sma200,aboveSma20:finite(sma20) ? latest > sma20 : null,aboveSma50:finite(sma50) ? latest > sma50 : null,aboveSma200:finite(sma200) ? latest > sma200 : null,
  };
}
