// House bot (not an AI-model entry): every 7 bars holds the top 5 assets by 60-bar return above their SMA200.
let last = -99;
module.exports = {
  name: 'Momentum Five',
  onBar(state) {
    if (state.step - last < 7) return null;
    last = state.step;
    const ranked = Object.entries(state.assets)
      .filter(([, a]) => Number.isFinite(a.f.ret60) && a.f.distSma200 > 0)
      .sort((x, y) => y[1].f.ret60 - x[1].f.ret60).slice(0, 5);
    if (!ranked.length) return { targets: {}, note: 'Nothing above SMA200. Cash.' };
    return { targets: Object.fromEntries(ranked.map(([s]) => [s, 0.98 / ranked.length])), note: `Top momentum: ${ranked.map(([s]) => s).join(', ')}` };
  }
};
