// "Today's basket": run one bot over the last year of the archive and show what it holds at the latest close.
// Uses the same race worker, rules and bot sandbox as a race; nothing is sent anywhere.
import { $, esc, html, pct, avatar, fmtDate, price } from './util.js';

const MARKETS = [['crypto', 'Crypto', '35 coins'], ['stocks', 'US stocks', '30 large caps'], ['mixed', 'Crypto + stocks', 'all 65 assets']];
let job = null; // { worker, timer }

export function releaseBasket() { if (job) { clearTimeout(job.timer); job.worker.terminate(); job = null; } }

const yearBefore = day => { const d = new Date(day + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - 1); return d.toISOString().slice(0, 10); };

export function renderBasket(view, { roster, dataEnd, pick, save }) {
  const sel = { bot: roster.bots.some(b => b.id === pick.basketBot) ? pick.basketBot : 'basket', market: pick.basketMarket || 'crypto' };
  if (!roster.bots.some(b => b.id === sel.bot)) sel.bot = roster.bots[0].id;
  view.innerHTML = html`
  <div class="section-h" data-layout="ta-s7"><div><div class="eyebrow">Paper simulation · latest close in the archive</div><h1 data-layout="ta-s8">Today’s basket</h1></div>
    <span class="muted" data-layout="ta-s1">Pick a bot and a market. The bot trades the last 12 months bar by bar; the basket is what it holds at the final close (${esc(dataEnd)}).</span></div>
  <div class="notice" data-layout="ta-s14"><span aria-hidden="true">ⓘ</span><span><b>Not investment advice.</b> This is the output of an automated paper-trading strategy on an owner-supplied historical archive that ends on ${esc(dataEnd)}, not live prices. It ignores your goals, taxes and risk. Past simulated results say nothing about future returns.</span></div>
  <div class="setup basket-setup">
    <fieldset class="panel" aria-labelledby="bk-h1">
      <div class="panel-h"><h2 id="bk-h1">1 · Bot</h2></div>
      <div class="roster" id="bk-bots">${roster.bots.map(b => `<label class="bot-card" data-color="${b.color}"><input type="radio" name="bk-bot" value="${b.id}" ${b.id === sel.bot ? 'checked' : ''}><span class="check" aria-hidden="true">✓</span>${avatar(b)}<span><b>${esc(b.name)}</b><span>${esc(b.kind === 'ai' ? `${b.botName || 'AI bot'} · ${b.lab}` : b.lab)}</span></span></label>`)}</div>
    </fieldset>
    <section class="panel" aria-labelledby="bk-h2">
      <div class="panel-h"><h2 id="bk-h2">2 · Market</h2></div>
      <div class="opts"><div class="opt"><span class="l" id="bk-ml">Universe</span>
        <div class="seg" role="group" aria-labelledby="bk-ml" id="bk-market">${MARKETS.map(([v, l, d]) => `<button type="button" data-v="${v}" aria-pressed="${v === sel.market}" title="${d}">${l}</button>`)}</div>
        <p class="muted" data-layout="ta-s5">Daily bars, ${esc(yearBefore(dataEnd))} → ${esc(dataEnd)}, $100,000 paper money, same costs as a race.</p></div></div>
      <div class="summary"><p class="field-err" id="bk-err" role="alert" hidden></p>
        <div class="summary-row"><span class="muted" id="bk-status" role="status" data-layout="ta-s2"></span><button class="btn primary big" id="bk-go" type="button">Build basket</button></div></div>
    </section>
  </div>
  <section id="bk-out" aria-live="polite"></section>`;

  $('#bk-bots').addEventListener('change', e => { if (e.target.name === 'bk-bot') { sel.bot = e.target.value; pick.basketBot = sel.bot; save(); } });
  $('#bk-market').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    sel.market = b.dataset.v; pick.basketMarket = sel.market; save();
    for (const x of $('#bk-market').children) x.setAttribute('aria-pressed', String(x === b));
  };
  $('#bk-go').onclick = () => build(roster.bots.find(b => b.id === sel.bot), sel.market, dataEnd);
}

function build(bot, market, dataEnd) {
  releaseBasket();
  const go = $('#bk-go'), status = $('#bk-status'), out = $('#bk-out'), err = $('#bk-err');
  go.disabled = true; err.hidden = true; out.innerHTML = ''; status.textContent = 'Starting…';
  const start = yearBefore(dataEnd);
  const worker = new Worker(new URL('./race-worker.js', import.meta.url), { type: 'module' });
  const me = { worker, timer: 0 }; job = me;
  let meta = null, first = null, last = null, lastTradeK = null, note = null;
  const finish = message => {
    if (job !== me) return;
    releaseBasket(); go.disabled = false; status.textContent = '';
    if (message) { err.textContent = `Could not build the basket: ${message}`; err.hidden = false; }
  };
  me.timer = setTimeout(() => finish('the simulation did not start within 15 seconds.'), 15000);
  worker.onerror = e => { e.preventDefault(); finish(e.message || 'worker failed to load'); };
  worker.onmessageerror = () => finish('invalid worker message');
  worker.onmessage = ({ data }) => {
    if (job !== me) return;
    clearTimeout(me.timer);
    if (data.type === 'status') status.textContent = `${data.text} ${Math.round((data.progress || 0) * 100)}%`;
    else if (data.type === 'meta') { meta = data; status.textContent = 'Simulating the last 12 months…'; }
    else if (data.type === 'frames') for (const f of data.frames) {
      first ??= f; last = f;
      const a = f.acc[0];
      if (a.trades.length) lastTradeK = f.k;
      if (a.notes.length) note = a.notes[a.notes.length - 1];
    }
    else if (data.type === 'done') { const stats = data.stats[0]; finish(); render(out, { bot, market, meta, first, last, lastTradeK, note, stats, start, dataEnd }); }
    else if (data.type === 'error') finish(String(data.error).split('\n')[0]);
  };
  worker.postMessage({
    cfg: { market, tf: '1d', start: Date.parse(start), end: Date.parse(dataEnd) + 86399999, blind: false, seed: 7 },
    bots: [{ id: bot.id, name: bot.name, file: bot.file }],
    // Not a contest: a generous time budget so a busy device cannot skip bars and change the basket.
    rules: { allowShort: false, maxGross: 1, initMs: 20000, barMs: 3000 },
  });
}

function render(out, { bot, market, meta, first, last, lastTradeK, note, stats, start, dataEnd }) {
  if (!meta || !last) { out.innerHTML = '<div class="panel empty">No bars in this period.</div>'; return; }
  const acc = last.acc[0], asset = id => meta.assets.find(a => a.id === id) || { symbol: id, name: '', sector: '' };
  const rows = Object.entries(acc.pos).filter(([, w]) => w > 0.0005).sort((a, b) => b[1] - a[1]);
  const invested = rows.reduce((s, [, w]) => s + w, 0);
  const asOf = fmtDate(meta.timeline[last.k], '1d') || dataEnd;
  const move = id => { const a = first.prices[id], b = last.prices[id]; return a && b && a[3] > 0 ? b[3] / a[3] - 1 : NaN; };
  out.innerHTML = html`
  <div class="panel basket-result" data-color="${bot.color}">
    <div class="panel-h"><h2>${avatar(bot, 'sm')} ${esc(bot.short || bot.name)} · ${esc(market)} basket at the ${esc(asOf)} close</h2>
      <span class="muted num">${pct(invested, 0, false)} invested · ${pct(1 - invested, 0, false)} cash</span></div>
    ${rows.length ? `<div class="table-wrap"><table class="stats"><caption>Holdings as a share of the paper portfolio</caption>
      <thead><tr><th scope="col" class="l">Asset</th><th scope="col" class="l">Sector</th><th scope="col">Weight</th><th scope="col">Last close</th><th scope="col">12-month move</th></tr></thead><tbody>
      ${rows.map(([id, w]) => { const a = asset(id), m = move(id); return `<tr><th scope="row" class="l"><b>${esc(a.symbol)}</b> <span class="muted">${esc(a.name || '')}</span></th><td class="l">${esc(a.sector || '')}</td><td><b>${pct(w, 1, false)}</b></td><td class="num">${price(last.prices[id]?.[3])}</td><td class="${m > 0 ? 'up' : m < 0 ? 'down' : ''}">${pct(m)}</td></tr>`; }).join('')}
      </tbody></table></div>`
    : '<div class="empty"><p><b>All cash.</b> Nothing passes this bot’s rules at the latest close.</p></div>'}
    <div class="basket-foot muted">
      ${note ? `<p>Bot’s last note: “${esc(note)}”</p>` : ''}
      <p>Last rebalance: ${lastTradeK != null ? esc(fmtDate(meta.timeline[lastTradeK], '1d')) : '—'} · 12-month paper result ${pct(stats.totalReturn)} (${esc(start)} → ${esc(dataEnd)}), max drawdown ${pct(stats.maxDrawdown)}, ${stats.trades} trades.${stats.errors ? ` ${stats.errors} bars were skipped by the bot’s time limit.` : ''}</p>
      <p>Orders decided at this close would fill at the next open. Not investment advice.</p>
    </div>
  </div>`;
}
