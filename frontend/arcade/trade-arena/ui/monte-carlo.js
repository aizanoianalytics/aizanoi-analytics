// Monte Carlo replays: the same race N times with fresh market noise (fill prices, slippage, missed fills) and a
// random ~80 % subset of the assets, to show how much of a win is robust and how much is luck.
// Every run uses the same seeded engine, so a run can be reproduced from its seed.
import { esc, pct, avatar, cls } from './util.js';
import { simulate } from './sim-client.js';

const randomSeed = () => 1 + Math.floor(Math.random() * 2147483646);

/** Run `runs` replays one after another; onProgress(i, runs) after each. Returns { promise, cancel }. */
export function monteCarlo(cfg, bots, { runs = 10, live = null } = {}, onProgress = () => {}) {
  let current = null, stopped = false;
  const promise = (async () => {
    const results = [];
    for (let i = 0; i < runs && !stopped; i++) {
      const seed = randomSeed();
      current = simulate({ market: cfg.market, tf: cfg.tf, start: cfg.start, end: cfg.end, blind: !!cfg.blind, bots, short: !!cfg.short, gross: cfg.gross || 1,
        live, seed, noise: 1, sample: 0.8, barMs: 1000 });
      const res = await current.promise;
      results.push({ seed, stats: res.stats });
      onProgress(i + 1, runs);
    }
    return results;
  })();
  return { promise, cancel: () => { stopped = true; current?.cancel(); } };
}

/** Per-bot summary: wins, average place, mean and range of total return. */
export function summarise(results, bots) {
  return bots.map((b, j) => {
    const rets = results.map(r => r.stats[j].totalReturn);
    const places = results.map(r => 1 + r.stats.filter(s => s.final > r.stats[j].final).length);
    const sorted = [...rets].sort((x, y) => x - y);
    return { b, wins: places.filter(p => p === 1).length, avgPlace: places.reduce((s, x) => s + x, 0) / places.length,
      mean: rets.reduce((s, x) => s + x, 0) / rets.length, lo: sorted[0], hi: sorted[sorted.length - 1] };
  }).sort((x, y) => y.wins - x.wins || x.avgPlace - y.avgPlace);
}

export function renderMonteCarlo(el, rows, runs) {
  el.innerHTML = `<div class="table-wrap"><table class="stats"><caption>${runs} replays with random market noise and a random 80 % of the assets. Win share = how often the bot finished first.</caption>
    <thead><tr><th scope="col" class="l">Bot</th><th scope="col">Wins</th><th scope="col">Avg place</th><th scope="col">Avg return</th><th scope="col">Worst … best</th></tr></thead><tbody>
    ${rows.map(r => `<tr><th scope="row" class="l"><span class="mc-bot">${avatar(r.b, 'sm')} ${esc(r.b.short || r.b.name)}</span></th><td><b>${r.wins}/${runs}</b></td><td>${r.avgPlace.toFixed(1)}</td><td class="${cls(r.mean)}">${pct(r.mean)}</td><td class="num"><span class="${cls(r.lo)}">${pct(r.lo)}</span> … <span class="${cls(r.hi)}">${pct(r.hi)}</span></td></tr>`).join('')}
    </tbody></table></div>`;
}
