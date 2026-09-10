const finite = (value) => Number.isFinite(value);
const pct = (current, previous) => finite(current) && finite(previous) && previous !== 0
  ? (current / previous) - 1
  : null;

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values) {
  if (values.length < 2) return null;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1));
}

function trailingReturn(closes, sessions) {
  if (closes.length <= sessions) return null;
  return pct(closes.at(-1), closes.at(-(sessions + 1)));
}

function sma(closes, sessions) {
  return closes.length >= sessions ? mean(closes.slice(-sessions)) : null;
}

function rsi(closes, sessions = 14) {
  if (closes.length <= sessions) return null;
  const changes = closes.slice(-(sessions + 1)).slice(1).map((value, index) => value - closes.slice(-(sessions + 1))[index]);
  const gains = changes.map((value) => Math.max(value, 0));
  const losses = changes.map((value) => Math.max(-value, 0));
  const averageGain = mean(gains);
  const averageLoss = mean(losses);
  if (averageLoss === 0) return averageGain > 0 ? 100 : 50;
  return 100 - (100 / (1 + (averageGain / averageLoss)));
}

export function computeMetrics(candles, { annualization = 252 } = {}) {
  const valid = candles.filter((candle) => finite(candle.c) && candle.c > 0);
  const closes = valid.map((candle) => candle.c);
  const volumes = valid.map((candle) => finite(candle.v) ? candle.v : 0);
  const latest = closes.at(-1) ?? null;
  const dailyReturns = closes.slice(1).map((value, index) => Math.log(value / closes[index])).filter(finite);
  const volatilityWindow = dailyReturns.slice(-20);
  const volatility20 = volatilityWindow.length > 1 ? standardDeviation(volatilityWindow) * Math.sqrt(annualization) : null;
  const recentYear = closes.slice(-Math.min(252, closes.length));
  let peak = -Infinity;
  let drawdown1y = 0;
  for (const close of recentYear) {
    peak = Math.max(peak, close);
    drawdown1y = Math.min(drawdown1y, (close / peak) - 1);
  }
  const priorVolumes = volumes.slice(-21, -1);
  const volumeMean = mean(priorVolumes);
  const volumeStd = standardDeviation(priorVolumes);
  const latestVolume = volumes.at(-1) ?? null;
  const volumeZ20 = finite(latestVolume) && finite(volumeMean)
    ? (volumeStd > 0 ? (latestVolume - volumeMean) / volumeStd : latestVolume > volumeMean ? 99 : 0)
    : null;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const high52w = recentYear.length ? Math.max(...recentYear) : null;

  return {
    latest,
    return1d: trailingReturn(closes, 1),
    return7d: trailingReturn(closes, 5),
    return30d: trailingReturn(closes, 21),
    return90d: trailingReturn(closes, 63),
    return1y: trailingReturn(closes, 252),
    volatility20,
    volumeZ20,
    rsi14: rsi(closes),
    drawdown1y,
    distanceFrom52wHigh: finite(latest) && finite(high52w) ? (latest / high52w) - 1 : null,
    sma20,
    sma50,
    sma200,
    aboveSma20: finite(latest) && finite(sma20) ? latest > sma20 : null,
    aboveSma50: finite(latest) && finite(sma50) ? latest > sma50 : null,
    aboveSma200: finite(latest) && finite(sma200) ? latest > sma200 : null,
  };
}
