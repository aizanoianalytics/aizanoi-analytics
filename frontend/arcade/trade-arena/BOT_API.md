# Trade Arena bot contract

Contract version 1. This file is the complete integration guide for an AI-written trading bot.

Trade Arena is a paper-trading race. Several bots get the same starting cash, see exactly the same
market data bar by bar, and trade the same assets. The bot with the highest final equity wins.
Nothing is real money. Your job is one self-contained JavaScript file, `bot.js`.

## Submission

```js
module.exports = {
  name: 'My Bot',                // shown on the scoreboard (max 40 chars)
  init(info) { /* optional, once before the first bar */ },
  onBar(state) {                 // required, once per bar, synchronous
    return { targets: { BTC: 0.5, ETH: 0.25 }, note: 'Trend up, adding ETH' };
  }
};
```

- Plain JavaScript (ES2022). No `import`, no `require`, no network, no file system, no DOM, no timers,
  no `eval`/`Function`. Top-level variables persist between calls, so you can keep state.
- `Math.random()` is seeded per race and is deterministic.
- `console.log` works (first 200 lines kept) for debugging.
- Time limits: loading the file plus `init` 5000 ms; each `onBar` 250 ms.
  A call that throws or runs late counts as an error and the bot simply holds its positions for that bar.
  Keep `onBar` well under 50 ms: races can have 8,000+ bars and 65 assets.
- The return value must be plain JSON data.

## What you return

`onBar` returns one of:

| return | meaning |
|---|---|
| `null` / `undefined` | No change. Keep every position and any order still waiting. |
| `{ targets: { SYM: weight, ... }, note? }` | The complete desired portfolio as fractions of equity. |
| `{ targets: {}, note? }` | Sell everything, go to cash. |
| `{ note: '...' }` | Only a commentary line, no trading. |

- `targets` is the **whole** portfolio. A symbol you omit is a target of 0 (it is sold).
- Weights are fractions of current equity: `0.25` = 25 %. Cash is whatever is left.
- Sum of |weights| must be ≤ `info.rules.maxGross` (default 1). If it is larger, all weights are scaled down proportionally.
- Negative weights (shorts) are only allowed when `info.rules.allowShort` is true; otherwise they are ignored.
- Unknown symbols and non-finite weights are ignored.
- `note` (≤ 140 chars) is shown live to viewers as your bot's commentary. Use it sparingly — only when you trade
  or something notable happens. Make it short and human ("Rotating into SOL and AVAX, BTC trend broke").

## Execution model

1. You decide at the **close** of bar *t*, seeing only data up to and including bar *t*.
2. Orders fill at the **open of bar t+1** with slippage (5 bps crypto / 2 bps stocks, against you)
   plus a commission of 10 bps crypto / 1 bps stocks of traded value.
3. Target quantities are computed from equity valued at that open. Sells execute before buys.
   In a cash account (maxGross 1, no shorts) buys are trimmed so cash never goes negative.
4. Rebalances smaller than $25 are skipped (except full exits).
5. If an asset has no bar at t+1 (stock market closed, weekend in a mixed race) its part of the order waits until
   that asset trades again, unless a newer `targets` replaces it.
6. Fractional quantities are allowed. Positions are marked to market at every close.
7. A bot whose equity falls below 1 % of starting cash is retired ("busted").

Every trade costs money. A bot that rebalances every bar pays fees every bar. Doing nothing is a valid move.

## init(info)

```js
info = {
  timeframe: '1d' | '4h' | '1h',
  blind: false,          // see "Blind races"
  steps: 668,            // number of bars in the race
  periodsPerYear: 365,   // bars per year for annualising (crypto 365/2190/8760, stocks 252/504/1764)
  start, end,            // ms timestamps of first/last bar (null when blind)
  rules: { cash: 100000, feeBps: { crypto, stocks }, slippageBps: { crypto, stocks }, maxGross: 1, allowShort: false, minTradeValue: 25, barMs: 250 },
  assets: [ { symbol: 'BTC', market: 'crypto' | 'stocks', name: 'Bitcoin', sector: 'Crypto' }, ... ],  // name/sector null when blind
  history: { BTC: { t: [...], o: [...], h: [...], l: [...], c: [...], v: [...] }, ... }               // up to 250 bars before the start
}
```

Races can be crypto only, stocks only, or mixed; daily, 4-hour or hourly. Never assume a particular asset exists.
Use `info.assets` and `state.assets`.

## onBar(state)

```js
state = {
  step: 0, steps: 668,           // bar index in the race and total bars
  time: 1735689600000,           // bar open time in ms UTC (null when blind)
  date: '2025-01-01',            // readable (null when blind)
  dow: 3, hour: null,            // UTC day of week 0=Sun and hour (hour null on daily)
  assets: {
    BTC: {
      tradable: true,            // false when this asset had no new bar now (e.g. stock on a weekend)
      bar: { t, o, h, l, c, v }, // latest bar of this asset (t null when blind)
      f: { rsi14: 41.2, sma50: ..., rank_ret20: 0.83, ... }  // ~140 precomputed features, see below
    },
    ...                          // only assets that are already listed appear
  },
  market: { breadth50, breadth200, advancers, ewRet1, ewRet20, dispersion20, avgRsi14, listed },
  context: { spyRet1, spyRet20, spyDistSma200, qqqRet20, vix, vixChg5, tnx, tnxChg20, dxyRet20, gldRet20, tltRet20 },
  portfolio: {
    cash, equity,                // in USD
    exposure,                    // gross position value / equity
    positions: { BTC: { qty, value, weight, avgPrice, pnlPct } }   // pnlPct = unrealised return of the open position
  }
}
```

- Every feature at bar *t* is computed from bars ≤ *t* only. Features can be `NaN` while their window is still
  warming up (for example `sma200` in the first 199 bars of an asset's history). **Always check
  `Number.isFinite(x)`** before using a value.
- Price-level features (SMAs, EMAs, bands, ATR, VWAP, SAR …) are in the asset's price units. Ratios
  (`distSma50`, `atrPct`, `bbPctB`, ranks …) are unit-free and comparable across assets.
- Returns are fractions (0.05 = +5 %). Volatilities are annualised fractions.
- Stock prices are adjusted for splits and dividends (total return).

## Blind races

Some races are blind, to test the strategy instead of memorised history:

- Symbols become aliases: `C01`, `C02` … for crypto and `S01` … for stocks, in random order.
- `time`, `date`, `start`, `end`, `bar.t`, `history.t`, names and sectors are `null`. `dow` and `hour` remain.
- Prices are rebased so each asset's last pre-race close is 100; volumes are rescaled. All features are computed
  on the rebased data, so ratios are unchanged.

Your bot must work in both kinds of race. Do not hard-code symbols, dates or price levels.

## Data available in `state.assets[sym].f`

### Returns & candle

| field | meaning |
|---|---|
| `ret1` | Close-to-close return over 1 bar |
| `ret3` | 3-bar return |
| `ret5` | 5-bar return |
| `ret10` | 10-bar return |
| `ret20` | 20-bar return |
| `ret60` | 60-bar return |
| `ret120` | 120-bar return |
| `ret250` | 250-bar return |
| `logRet1` | Log return over 1 bar |
| `gap` | Open vs previous close |
| `range` | (high-low)/close |
| `body` | (close-open)/open |
| `upperWick` | Upper wick / close |
| `lowerWick` | Lower wick / close |
| `closeLoc` | Close location in bar range, 0=low 1=high |

### Trend

| field | meaning |
|---|---|
| `sma5` | Simple MA 5 |
| `sma10` | Simple MA 10 |
| `sma20` | Simple MA 20 |
| `sma50` | Simple MA 50 |
| `sma100` | Simple MA 100 |
| `sma200` | Simple MA 200 |
| `ema9` | Exponential MA 9 |
| `ema12` | EMA 12 |
| `ema21` | EMA 21 |
| `ema26` | EMA 26 |
| `ema50` | EMA 50 |
| `ema200` | EMA 200 |
| `distSma20` | close/SMA20 - 1 |
| `distSma50` | close/SMA50 - 1 |
| `distSma200` | close/SMA200 - 1 |
| `sma50over200` | SMA50/SMA200 - 1 (golden/death cross > 0 / < 0) |
| `sma20slope` | 5-bar change of SMA20 |
| `lrSlope20` | Linear-regression slope of last 20 closes, per bar, relative to price |
| `lrR2_20` | R² of that regression (trend quality) |
| `adx14` | Average Directional Index 14 |
| `plusDI14` | +DI 14 |
| `minusDI14` | −DI 14 |
| `aroonUp25` | Aroon up 25 (0..100) |
| `aroonDown25` | Aroon down 25 |
| `aroonOsc25` | Aroon up − down |
| `tenkan` | Ichimoku conversion line (9) |
| `kijun` | Ichimoku base line (26) |
| `senkouA` | Ichimoku leading span A as of now (from 26 bars ago) |
| `senkouB` | Ichimoku leading span B as of now |
| `cloudPos` | +1 above cloud, −1 below, 0 inside |
| `psar` | Parabolic SAR (0.02/0.2) |
| `psarDir` | +1 SAR below price (uptrend), −1 above |
| `supertrend` | Supertrend line (10, 3) |
| `supertrendDir` | +1 uptrend, −1 downtrend |
| `donchHigh20` | 20-bar highest high |
| `donchLow20` | 20-bar lowest low |
| `donchPos20` | Close position in 20-bar channel 0..1 |
| `donchHigh55` | 55-bar highest high |
| `donchLow55` | 55-bar lowest low |

### Momentum

| field | meaning |
|---|---|
| `rsi14` | RSI 14 (Wilder) |
| `rsi2` | RSI 2 |
| `stochK14` | Stochastic %K 14 |
| `stochD3` | Stochastic %D (3-bar SMA of %K) |
| `stochRsi14` | Stochastic RSI 14 (0..1) |
| `williamsR14` | Williams %R 14 (−100..0) |
| `cci20` | Commodity Channel Index 20 |
| `mfi14` | Money Flow Index 14 |
| `roc12` | Rate of change 12 |
| `mom10` | close − close 10 bars ago, relative |
| `macd` | MACD line (12,26) |
| `macdSignal` | MACD signal (9) |
| `macdHist` | MACD histogram |
| `ppo` | Percentage price oscillator (12,26) |
| `ao` | Awesome oscillator relative to price (SMA5−SMA34 of median price) |
| `tsi` | True strength index (25,13) |
| `uo` | Ultimate oscillator (7,14,28) |

### Volatility

| field | meaning |
|---|---|
| `atr14` | Average True Range 14 |
| `atrPct` | ATR14 / close |
| `trueRange` | True range of this bar |
| `bbMid` | Bollinger middle (SMA20) |
| `bbUpper` | Bollinger upper (2σ) |
| `bbLower` | Bollinger lower (2σ) |
| `bbWidth` | (upper−lower)/mid |
| `bbPctB` | Bollinger %B |
| `kcUpper` | Keltner upper (EMA20 + 2·ATR) |
| `kcLower` | Keltner lower |
| `squeeze` | 1 when Bollinger bands are inside Keltner channels |
| `vol10` | Annualised realised volatility 10 |
| `vol20` | Annualised realised volatility 20 |
| `vol60` | Annualised realised volatility 60 |
| `parkinson20` | Parkinson high-low volatility 20 (annualised) |
| `garmanKlass20` | Garman-Klass volatility 20 (annualised) |
| `volRatio` | vol10 / vol60 |
| `zscore20` | (close − SMA20)/σ20 |
| `drawdown` | close / running max close − 1 |
| `distHigh52w` | close / 1-year high − 1 |
| `distLow52w` | close / 1-year low − 1 |

### Volume

| field | meaning |
|---|---|
| `volume` | Base-asset volume (shares or coins) |
| `dollarVolume` | close × volume |
| `volSma20` | Volume SMA 20 |
| `relVolume` | volume / SMA20 volume |
| `volZ20` | Volume z-score 20 |
| `obv` | On-balance volume |
| `obvSlope20` | 20-bar change of OBV relative to 20-bar total volume |
| `cmf20` | Chaikin money flow 20 |
| `adLine` | Accumulation/distribution line |
| `forceIndex13` | Force index EMA 13 relative to dollar volume |
| `vwap20` | Rolling 20-bar VWAP |
| `distVwap20` | close/VWAP20 − 1 |
| `vpt` | Volume-price trend |
| `takerBuyRatio` | Crypto: taker-buy volume / volume (0.5 = balanced) |
| `takerBuyRatio20` | Crypto: 20-bar taker-buy ratio |
| `trades` | Crypto: number of trades in the bar |
| `avgTradeSize` | Crypto: quote volume per trade |

### Statistics

| field | meaning |
|---|---|
| `sharpe60` | Annualised Sharpe of last 60 bars (rf=0) |
| `sortino60` | Annualised Sortino of last 60 bars |
| `skew60` | Return skewness 60 |
| `kurt60` | Excess kurtosis 60 |
| `autocorr60` | Lag-1 return autocorrelation 60 |
| `upRatio20` | Share of up bars in last 20 |
| `maxRet20` | Largest 1-bar return in last 20 |
| `minRet20` | Largest 1-bar loss in last 20 |

### Patterns

| field | meaning |
|---|---|
| `doji` | 1 if body < 10% of range |
| `hammer` | 1 if hammer |
| `shootingStar` | 1 if shooting star |
| `bullEngulf` | 1 if bullish engulfing |
| `bearEngulf` | 1 if bearish engulfing |
| `insideBar` | 1 if inside bar |
| `outsideBar` | 1 if outside bar |
| `nr7` | 1 if narrowest range of last 7 |
| `higherHigh` | 1 if high > previous high and low > previous low |
| `streak` | Consecutive up (+) or down (−) closes |
| `newHigh20` | 1 if close is a 20-bar closing high |
| `newLow20` | 1 if close is a 20-bar closing low |

### Cross-asset

| field | meaning |
|---|---|
| `beta60` | Beta of returns vs the market benchmark (BTC for crypto, SPY for stocks), 60 bars |
| `corr60` | Correlation of returns vs the benchmark, 60 bars |
| `fundingRate` | Crypto: latest perpetual funding rate per 8h (NaN when no perpetual) |
| `funding7d` | Crypto: average funding rate over the last 7 days |
| `rank_ret5` | Cross-sectional percentile of ret5 among assets listed now (0 lowest .. 1 highest) |
| `rank_ret20` | Cross-sectional percentile of ret20 among assets listed now (0 lowest .. 1 highest) |
| `rank_ret60` | Cross-sectional percentile of ret60 among assets listed now (0 lowest .. 1 highest) |
| `rank_ret120` | Cross-sectional percentile of ret120 among assets listed now (0 lowest .. 1 highest) |
| `rank_rsi14` | Cross-sectional percentile of rsi14 among assets listed now (0 lowest .. 1 highest) |
| `rank_vol20` | Cross-sectional percentile of vol20 among assets listed now (0 lowest .. 1 highest) |
| `rank_relVolume` | Cross-sectional percentile of relVolume among assets listed now (0 lowest .. 1 highest) |
| `rank_distSma50` | Cross-sectional percentile of distSma50 among assets listed now (0 lowest .. 1 highest) |
| `rank_sharpe60` | Cross-sectional percentile of sharpe60 among assets listed now (0 lowest .. 1 highest) |
| `rank_dollarVolume` | Cross-sectional percentile of dollarVolume among assets listed now (0 lowest .. 1 highest) |

## `state.market` (cross-section of all listed assets)

| field | meaning |
|---|---|
| `breadth50` | Share of listed assets closing above their SMA50 |
| `breadth200` | Share of listed assets closing above their SMA200 |
| `advancers` | Share of listed assets with a positive 1-bar return |
| `ewRet1` | Equal-weight average 1-bar return of listed assets |
| `ewRet20` | Equal-weight average 20-bar return |
| `dispersion20` | Cross-sectional standard deviation of 20-bar returns |
| `avgRsi14` | Average RSI14 across assets |
| `listed` | Number of assets listed now |

## `state.context` (daily macro data, last completed session; empty object if unavailable)

| field | meaning |
|---|---|
| `spyRet1` | S&P 500 ETF last completed daily return |
| `spyRet20` | S&P 500 ETF 20-day return |
| `spyDistSma200` | SPY close / SMA200 − 1 |
| `qqqRet20` | Nasdaq-100 ETF 20-day return |
| `vix` | VIX level |
| `vixChg5` | VIX 5-day change (points) |
| `tnx` | US 10Y yield in % |
| `tnxChg20` | 10Y yield 20-day change (points) |
| `dxyRet20` | US Dollar Index 20-day return |
| `gldRet20` | Gold ETF 20-day return |
| `tltRet20` | 20Y+ Treasury ETF 20-day return |

## Scoring

The ranking in a race is by final equity. Sharpe ratio, max drawdown, fees, turnover, trades and win rate
of closed trades are reported on the scoreboard. Tournaments run many races across markets, timeframes and
periods the bot has never seen, including blind ones, and award points by finishing place.

## Local testing

```
node tools/race.mjs --bot bot.js --bot bots/house/hodl.js --market crypto --tf 1d
node tools/race.mjs --bot bot.js --market stocks --tf 1d --start 2022-01-01 --end 2022-12-31
node tools/race.mjs --bot bot.js --market mixed --tf 1d --blind
node tools/race.mjs --bot bot.js --market crypto --tf 1h --start 2024-10-01
```

Options: `--market crypto|stocks|mixed`, `--tf 1d|4h|1h`, `--start/--end YYYY-MM-DD` (default: last 365 days),
`--blind`, `--seed N`, `--short` (allow shorts), `--gross 2` (2x gross exposure), `--symbols BTC,ETH,SOL`.
House bots for comparison: `bots/house/hodl.js` (equal-weight buy and hold), `momentum.js`, `monkey.js` (random).
