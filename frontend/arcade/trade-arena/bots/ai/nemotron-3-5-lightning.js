module.exports = {
  name: 'CrossMomentum',

  init(info) {
    this.lastRebalance = 0;
    this.warmupBars = 30;
    this.rules = info.rules;
  },

  onBar(state) {
    // Wait for warm-up period
    if (state.step < this.warmupBars) return null;

    // Rebalance every 5 bars to limit turnover and fees
    if (state.step - this.lastRebalance < 5) return null;
    this.lastRebalance = state.step;

    const { assets, market, context, portfolio } = state;
    const { maxGross, allowShort, minTradeValue } = this.rules;

    // Collect scored assets
    const scored = [];

    for (const [sym, a] of Object.entries(assets)) {
      if (!a.tradable) continue;
      const f = a.f;

      // Skip if critical features are NaN
      if (!Number.isFinite(f.ret60) || !Number.isFinite(f.rsi14) || !Number.isFinite(f.distSma200)) continue;

      // Momentum score: use ret60 adjusted by RSI filter
      let score = f.ret60;

      // RSI filter: reduce score if overbought (>70) or oversold (<30)
      if (f.rsi14 > 70) score *= 0.6;
      else if (f.rsi14 < 30) score *= 0.8;

      // Volume/liquidity filter
      if (!Number.isFinite(f.dollarVolume) || f.dollarVolume < 1e5) score *= 0.5;

      scored.push([sym, score]);
    }

    if (scored.length === 0) return { targets: {}, note: 'No tradable assets with valid data' };

    // Rank by score (higher = better)
    scored.sort((a, b) => b[1] - a[1]);

    // Determine how many to select based on market regime
    const breadth = market.breadth200; // fraction of assets above SMA200
    const spyRet = context.spyRet20;  // S&P 500 20-day return
    const vix = context.vix;

    let nLongs = 0;
    let nShorts = 0;
    let grossTarget = maxGross;

    // Regime assessment
    const bearishBreadth = breadth < 0.4;
    const bearishMarket = spyRet < -0.1 && (vix == null || vix > 25);

    if (allowShort && bearishMarket) {
      // Bear market: select longs from top, shorts from bottom
      nLongs = Math.max(1, Math.floor(scored.length * 0.2));
      nShorts = Math.max(1, Math.floor(scored.length * 0.2));
      grossTarget = maxGross; // can use full leverage when shorting
    } else {
      // Bull/flat market: longs only
      nLongs = Math.max(1, Math.floor(scored.length * 0.3));
      grossTarget = 1; // long-only cap at 100% gross
    }

    nShorts = Math.min(nShorts, Math.floor(scored.length / 4));

    // Select longs: top performers
    const longs = scored.slice(0, nLongs).map(([s]) => s);
    // Select shorts: worst performers (only in allowShort + bearish mode)
    const shorts = [];
    if (allowShort && bearishMarket && nShorts > 0) {
      const shortCandidates = scored.slice(-nShorts).map(([s]) => s);
      shorts.push(...shortCandidates);
    }

    // Compute equal weights (total gross = grossTarget)
    const nPos = nLongs + nShorts;
    const wLong = grossTarget / nPos;  // per long position
    const wShort = allowShort && bearishMarket ? -wLong : 0;

    // Build targets object
    const targets = {};

    // Long positions
    for (const sym of longs) {
      targets[sym] = wLong;
    }

    // Short positions
    for (const sym of shorts) {
      targets[sym] = wShort;
    }

    // Cash is whatever is left (engine computes this)

    const noteParts = [];
    if (allowShort && bearishMarket) {
      noteParts.push(`L${longs.length}S${shorts.length}`);
    } else {
      noteParts.push(`L${longs.length}`);
    }
    noteParts.push(`regime=${bearishMarket?'B':'F'}`);

    const note = noteParts.join(',');

    return { targets, note };
  }
};