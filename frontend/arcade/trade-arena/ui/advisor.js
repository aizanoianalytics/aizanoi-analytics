// Basket advisor: the viewer enters a basket, chosen bots trade the last 12 months, then on the latest close each
// bot sees the viewer's basket instead of its own book and answers with a target portfolio. The difference is
// shown as close / trim / add / open / flip actions plus a consensus across bots. Paper only, never sent anywhere.
import { $, $$, esc, html, pct, avatar, fmtDate, price, cls } from './util.js';
import { simulate, diffBaskets, yearBefore, ACTION_LABEL } from './sim-client.js';

const KEY = 'trade-arena:my-basket';
const MAX_BOTS = 8;
let job = null;

export function releaseAdvisor() { job?.cancel(); job = null; }

const load = () => { try { const b = JSON.parse(localStorage.getItem(KEY) || 'null'); if (b && Array.isArray(b.rows)) return b; } catch { /* storage blocked */ } return null; };
const store = b => { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* storage blocked */ } };
const DEFAULT = { value: 100000, shorts: false, rows: [{ s: 'BTC', w: 30 }, { s: 'ETH', w: 15 }, { s: 'SOL', w: 10 }, { s: 'NVDA', w: 15 }, { s: 'MSFT', w: 10 }] };

/** Hand-off from the Basket page: replace the saved basket. */
export function setMyBasket(rows) { const b = load() || structuredClone(DEFAULT); b.rows = rows; store(b); }

/** "BTC 30", "TSLA -10", "eth, 12.5%", "NVDA short 5 @ 180" -> rows; unknown lines are reported. */
export function parseBasket(text, known) {
  const rows = [], bad = [];
  for (const line of String(text).split(/[\n;]+/)) {
    const t = line.trim(); if (!t) continue;
    const m = t.match(/^([A-Za-z0-9.\-]+)[\s,:=]+(long\s+|short\s+)?(-?\d+(?:[.,]\d+)?)\s*%?(?:\s*@\s*(\d+(?:[.,]\d+)?))?\s*$/i);
    const s = m?.[1].toUpperCase();
    if (!m || !known.has(s)) { bad.push(t); continue; }
    let w = parseFloat(m[3].replace(',', '.'));
    if (/short/i.test(m[2] || '')) w = -Math.abs(w);
    const px = m[4] ? parseFloat(m[4].replace(',', '.')) : null;
    rows.push(px ? { s, w, px } : { s, w });
  }
  return { rows, bad };
}

export function renderAdvisor(view, { roster, catalog, dataEnd, live, pick, save }) {
  const assets = [...catalog.crypto.map(a => ({ ...a, market: 'crypto' })), ...catalog.stocks.map(a => ({ ...a, market: 'stocks' })), ...(catalog.bist || []).map(a => ({ ...a, market: 'bist' }))];
  const bySym = new Map(assets.map(a => [a.symbol, a]));
  const B = load() || structuredClone(DEFAULT);
  B.rows = B.rows.filter(r => bySym.has(r.s));
  const ai = roster.bots.filter(b => b.kind === 'ai');
  let chosen = (pick.advisorBots || []).filter(id => roster.bots.some(b => b.id === id));
  if (!chosen.length) chosen = ai.slice(0, 3).map(b => b.id);
  const start = yearBefore(dataEnd);

  view.innerHTML = html`
  <div class="section-h" data-layout="ta-s7"><div><div class="eyebrow">Paper simulation · ${live ? 'archive + live closed bars' : 'historical archive'} · latest close ${esc(dataEnd)}</div><h1 data-layout="ta-s8">Basket advisor</h1></div>
    <span class="muted" data-layout="ta-s1">Enter what you hold (crypto and US stocks in USD, or Borsa Istanbul in TRY). Each bot trades the last 12 months, then looks at your basket on the latest close and says what it would close, trim, add or open.</span></div>
  <div class="notice" data-layout="ta-s14"><span aria-hidden="true">ⓘ</span><span><b>Not investment advice.</b> These are outputs of automated paper-trading strategies on market history that ends on ${esc(dataEnd)}. They ignore your goals, taxes, costs and risk, and past simulated results say nothing about future returns. Your basket stays in this browser.</span></div>
  <div class="setup advisor-setup">
    <section class="panel" aria-labelledby="ad-h1">
      <div class="panel-h"><h2 id="ad-h1">1 · Your basket</h2><span class="muted num" id="ad-sum" role="status"></span></div>
      <div class="table-wrap"><table class="stats basket-edit"><caption class="sr-only">Basket holdings: asset, side and share of the portfolio</caption>
        <thead><tr><th scope="col" class="l">Asset</th><th scope="col">Side</th><th scope="col">Weight %</th><th scope="col">Entry price <span class="faint">(optional)</span></th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
        <tbody id="ad-rows"></tbody></table></div>
      <datalist id="ad-assets">${assets.map(a => `<option value="${esc(a.symbol)}">${esc(a.name)} · ${a.market === 'crypto' ? 'crypto' : a.market === 'bist' ? `BIST · ${esc(a.sector || '')}` : esc(a.sector || 'stock')}</option>`)}</datalist>
      <div class="opt-row ad-tools">
        <button class="btn sm" type="button" id="ad-add">+ Add asset</button>
        <button class="btn sm ghost" type="button" id="ad-paste-t" aria-expanded="false" aria-controls="ad-paste">Paste a list</button>
        <button class="btn sm ghost" type="button" id="ad-clear">Clear</button>
        <label class="ad-value">Portfolio value <span class="sr-only">in US dollars, or Turkish lira for a Borsa Istanbul basket</span><input type="number" id="ad-value" min="100" step="100" inputmode="decimal" value="${+B.value || 100000}"></label>
      </div>
      <div id="ad-paste" hidden>
        <label for="ad-paste-txt" class="muted" data-layout="ta-s2">One holding per line: <code>BTC 30</code>, <code>NVDA 15 @ 180</code>, <code>TSLA short 10</code> or <code>DOGE -5</code> (percent of the portfolio).</label>
        <textarea id="ad-paste-txt" rows="5" spellcheck="false"></textarea>
        <div class="opt-row"><button class="btn sm primary" type="button" id="ad-paste-go">Use this list</button><span class="field-err" id="ad-paste-err" role="alert" hidden></span></div>
      </div>
    </section>
    <section class="panel" aria-labelledby="ad-h2">
      <div class="panel-h"><h2 id="ad-h2">2 · Advisors</h2><span class="muted" id="ad-count"></span></div>
      <div class="roster" id="ad-bots">${roster.bots.map(b => `<label class="bot-card" data-color="${b.color}"><input type="checkbox" name="ad-bot" value="${b.id}" ${chosen.includes(b.id) ? 'checked' : ''}><span class="check" aria-hidden="true">✓</span>${avatar(b)}<span><b>${esc(b.name)}</b><span>${esc(b.kind === 'ai' ? `${b.botName || 'AI bot'} · ${b.lab}` : b.lab)}${b.contract >= 2 ? ' · long/short' : ''}</span></span></label>`)}</div>
      <div class="opts"><div class="opt"><span class="l">Rules</span><div class="opt-row" data-layout="ta-s6">
        <label class="toggle"><input type="checkbox" id="ad-short" ${B.shorts ? 'checked' : ''}><i aria-hidden="true"></i>Let bots suggest shorts</label></div>
        <p class="muted" data-layout="ta-s5">Daily bars ${esc(start)} → ${esc(dataEnd)}. Bots written before contract v2 never short; without this option shorts in your basket are shown as positions to cover.</p></div></div>
      <div class="summary"><p class="field-err" id="ad-err" role="alert" hidden></p>
        <div class="summary-row"><span class="muted" id="ad-status" role="status" data-layout="ta-s2"></span><button class="btn primary big" id="ad-go" type="button">Ask the bots</button></div></div>
    </section>
  </div>
  <section id="ad-out" aria-live="polite"></section>`;

  const rowsEl = $('#ad-rows');
  const paint = () => {
    rowsEl.innerHTML = B.rows.map((r, i) => `<tr data-i="${i}">
      <th scope="row" class="l"><label class="sr-only" for="ad-s${i}">Asset ${i + 1}</label><input id="ad-s${i}" class="ad-sym" list="ad-assets" value="${esc(r.s)}" autocomplete="off" spellcheck="false" aria-describedby="ad-n${i}"> <span class="muted" id="ad-n${i}">${esc(bySym.get(r.s)?.name || '')}</span></th>
      <td><div class="seg sm" role="group" aria-label="Side of ${esc(r.s)}"><button type="button" data-side="long" aria-pressed="${r.w >= 0}">Long</button><button type="button" data-side="short" aria-pressed="${r.w < 0}">Short</button></div></td>
      <td><label class="sr-only" for="ad-w${i}">Weight of ${esc(r.s)} in percent</label><input id="ad-w${i}" class="ad-w num" type="number" min="0" max="200" step="0.5" inputmode="decimal" value="${Math.abs(r.w)}"></td>
      <td><label class="sr-only" for="ad-p${i}">Entry price of ${esc(r.s)}</label><input id="ad-p${i}" class="ad-px num" type="number" min="0" step="any" inputmode="decimal" value="${r.px ?? ''}" placeholder="close"></td>
      <td><button class="btn sm ghost" type="button" data-del aria-label="Remove ${esc(r.s)}">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Empty basket = all cash. Add an asset or paste a list.</td></tr>';
    summary();
  };
  const summary = () => {
    const long = B.rows.filter(r => r.w > 0).reduce((s, r) => s + r.w, 0), short = B.rows.filter(r => r.w < 0).reduce((s, r) => s - r.w, 0);
    $('#ad-sum').textContent = `${long.toFixed(1)}% long${short ? ` · ${short.toFixed(1)}% short` : ''} · ${(100 - long + short).toFixed(1)}% cash`;
    store(B);
  };
  const countBots = () => {
    $('#ad-count').textContent = `${chosen.length} of ${MAX_BOTS} max`;
    $$('#ad-bots input').forEach(i => { i.disabled = chosen.length >= MAX_BOTS && !i.checked; });
  };
  paint(); countBots();

  rowsEl.addEventListener('change', e => {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return;
    const r = B.rows[+tr.dataset.i];
    if (e.target.classList.contains('ad-sym')) { r.s = e.target.value.trim().toUpperCase(); e.target.value = r.s; $(`#ad-n${tr.dataset.i}`).textContent = bySym.get(r.s)?.name || 'unknown symbol'; e.target.setAttribute('aria-invalid', String(!bySym.has(r.s))); }
    if (e.target.classList.contains('ad-w')) { const v = Math.abs(parseFloat(e.target.value) || 0); r.w = r.w < 0 ? -v : v; }
    if (e.target.classList.contains('ad-px')) { const v = parseFloat(e.target.value); if (v > 0) r.px = v; else delete r.px; }
    summary();
  });
  rowsEl.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return;
    const r = B.rows[+tr.dataset.i];
    const side = e.target.closest('[data-side]');
    if (side) { r.w = side.dataset.side === 'short' ? -Math.abs(r.w) : Math.abs(r.w); paint(); $(`tr[data-i="${tr.dataset.i}"] [data-side="${side.dataset.side}"]`)?.focus(); }
    if (e.target.closest('[data-del]')) { B.rows.splice(+tr.dataset.i, 1); paint(); $('#ad-add').focus(); }
  });
  $('#ad-add').onclick = () => { B.rows.push({ s: '', w: 5 }); paint(); $(`#ad-s${B.rows.length - 1}`)?.focus(); };
  $('#ad-clear').onclick = () => { B.rows = []; paint(); };
  $('#ad-value').onchange = e => { B.value = Math.max(100, +e.target.value || 100000); store(B); };
  $('#ad-paste-t').onclick = () => { const p = $('#ad-paste'), open = p.hidden; p.hidden = !open; $('#ad-paste-t').setAttribute('aria-expanded', String(open)); if (open) { $('#ad-paste-txt').value = B.rows.map(r => `${r.s} ${r.w < 0 ? 'short ' : ''}${Math.abs(r.w)}${r.px ? ` @ ${r.px}` : ''}`).join('\n'); $('#ad-paste-txt').focus(); } };
  $('#ad-paste-go').onclick = () => {
    const { rows, bad } = parseBasket($('#ad-paste-txt').value, new Set(bySym.keys()));
    const err = $('#ad-paste-err');
    err.hidden = !bad.length; err.textContent = bad.length ? `Not understood: ${bad.slice(0, 4).join(' · ')}${bad.length > 4 ? ' …' : ''}` : '';
    if (rows.length) { B.rows = rows; paint(); }
  };
  $('#ad-short').onchange = e => { B.shorts = e.target.checked; store(B); };
  $('#ad-bots').addEventListener('change', e => {
    if (e.target.name !== 'ad-bot') return;
    const id = e.target.value;
    chosen = e.target.checked ? [...new Set([...chosen, id])] : chosen.filter(x => x !== id);
    pick.advisorBots = chosen; save(); countBots();
  });
  $('#ad-go').onclick = () => ask({ B, bySym, roster, chosen, dataEnd, start, live });
}

function validate(B, bySym, chosen) {
  const errs = [];
  if (!chosen.length) errs.push('Pick at least one bot.');
  const unknown = B.rows.filter(r => !bySym.has(r.s)).map(r => r.s || '(empty)');
  if (unknown.length) errs.push(`Unknown asset: ${unknown.join(', ')}. Pick one from the list.`);
  const seen = new Set(), dup = B.rows.filter(r => seen.has(r.s) || !seen.add(r.s)).map(r => r.s);
  if (dup.length) errs.push(`Listed twice: ${[...new Set(dup)].join(', ')}.`);
  const long = B.rows.filter(r => r.w > 0).reduce((s, r) => s + r.w, 0), gross = B.rows.reduce((s, r) => s + Math.abs(r.w), 0);
  const mk = new Set(B.rows.filter(r => bySym.has(r.s)).map(r => bySym.get(r.s).market));
  if (mk.has('bist') && mk.size > 1) errs.push('Borsa Istanbul (TRY) assets cannot share a basket with USD crypto or US stocks. Review them separately.');
  if (gross > 200) errs.push('Total exposure is above 200 %.');
  else if (long > 100 && !B.rows.some(r => r.w < 0)) errs.push('Long weights add up to more than 100 %.');
  return errs;
}

function ask({ B, bySym, roster, chosen, dataEnd, start, live }) {
  releaseAdvisor();
  const go = $('#ad-go'), status = $('#ad-status'), out = $('#ad-out'), err = $('#ad-err');
  const errs = validate(B, bySym, chosen);
  err.hidden = !errs.length; err.textContent = errs.join(' ');
  if (errs.length) return;
  const rows = B.rows.filter(r => r.w);
  const markets = new Set(rows.map(r => bySym.get(r.s).market));
  const market = markets.has('bist') ? 'bist' : markets.size === 2 ? 'mixed' : markets.has('stocks') ? 'stocks' : 'crypto';
  const bots = chosen.map(id => roster.bots.find(b => b.id === id));
  const mine = Object.fromEntries(rows.map(r => [r.s, r.w / 100]));
  const advice = { equity: +B.value || 100000, positions: Object.fromEntries(rows.map(r => [r.s, r.px ? { weight: r.w / 100, avgPrice: r.px } : r.w / 100])) };
  go.disabled = true; out.innerHTML = ''; status.textContent = 'Starting…';
  const me = simulate({ market, start, end: dataEnd, bots, short: B.shorts, gross: B.shorts ? 1.5 : 1, live, advice }, t => { status.textContent = t; });
  job = me;
  me.promise.then(res => {
    if (job !== me) return;
    job = null; go.disabled = false; status.textContent = '';
    render(out, { res, bots, mine, market, value: advice.equity, B });
    out.querySelector('h2')?.focus();
  }, e => {
    if (job !== me) return;
    job = null; go.disabled = false; status.textContent = '';
    err.textContent = `Could not ask the bots: ${e.message}`; err.hidden = false;
  });
}

function render(out, { res, bots, mine, market, value, B }) {
  const { meta, first, last } = res;
  const asset = id => meta.assets.find(a => a.id === id) || { symbol: id, name: '' };
  const asOf = fmtDate(meta.timeline[last.k], '1d');
  const move = id => { const a = first.prices[id], b = last.prices[id]; return a && b && a[3] > 0 ? b[3] / a[3] - 1 : NaN; };
  const answers = bots.map((b, i) => ({ b, a: last.acc[i].advice, stat: res.stats[i], note: res.notes[i] }));
  // Consensus: average target per asset over all advisors (cash = 0).
  const syms = new Set(Object.keys(mine));
  for (const { a } of answers) for (const s of Object.keys(a?.targets || {})) syms.add(s);
  const cons = [...syms].map(s => {
    const t = answers.map(({ a }) => a?.targets?.[s] || 0);
    return { s, mine: mine[s] || 0, avg: t.reduce((x, y) => x + y, 0) / t.length, long: t.filter(x => x > 0.005).length, short: t.filter(x => x < -0.005).length };
  }).filter(r => Math.abs(r.mine) > 1e-4 || r.long || r.short).sort((x, y) => Math.abs(y.avg) - Math.abs(x.avg));
  const consDiff = diffBaskets(mine, Object.fromEntries(cons.map(r => [r.s, r.avg])), 0.02);
  const verb = s => consDiff.find(r => r.s === s);
  const money = d => new Intl.NumberFormat('en-US', { style: 'currency', currency: market === 'bist' ? 'TRY' : 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(Math.abs(d) * value);

  out.innerHTML = html`
  <div class="section-h"><div><div class="eyebrow">Answers on the ${esc(asOf)} close · ${esc(market)} · ${meta.live?.used ? 'includes live closed bars' : 'archive data'}</div><h2 tabindex="-1">What the bots would do with your basket</h2></div></div>
  ${answers.length > 1 ? `<div class="panel advisor-consensus">
    <div class="panel-h"><h3>Consensus of ${answers.length} bots</h3><span class="muted" data-layout="ta-s2">average target weight · actions ignore changes under 2 points</span></div>
    <p class="muted">Comparison, not a joint recommendation: ${answers.filter(({ a }) => a?.source !== 'decision').length} bot(s) gave no new decision; their own current baskets are included as disclosed comparisons, not reactions to your holdings.</p>
    <div class="table-wrap"><table class="stats"><caption class="sr-only">Average target weight per asset across the selected bots</caption>
      <thead><tr><th scope="col" class="l">Asset</th><th scope="col">You</th><th scope="col">Bots (avg)</th><th scope="col">Long / short votes</th><th scope="col">Consensus</th><th scope="col">≈ Amount</th><th scope="col">12-month move</th></tr></thead><tbody>
      ${cons.map(r => { const d = verb(r.s) || (r.mine ? { action: 'keep' } : null), m = move(r.s); return `<tr><th scope="row" class="l"><b>${esc(asset(r.s).symbol)}</b> <span class="muted">${esc(asset(r.s).name || '')}</span></th><td class="num">${pct(r.mine, 1)}</td><td class="num ${cls(r.avg)}"><b>${pct(r.avg, 1)}</b></td><td class="num">${r.long} / ${r.short}</td><td>${d ? `<span class="act" data-act="${d.action}">${ACTION_LABEL[d.action]}</span>` : '<span class="faint">—</span>'}</td><td class="num">${d && d.action !== 'keep' ? money(d.delta) : '—'}</td><td class="num ${cls(m)}">${pct(m)}</td></tr>`; }).join('')}
      </tbody></table></div></div>` : ''}
  <div class="advisor-grid">${answers.map(({ b, a, stat, note }) => {
    if (!a) return `<div class="panel advisor-card" data-color="${b.color}"><div class="panel-h"><h3>${avatar(b, 'sm')} ${esc(b.short || b.name)}</h3></div><p class="muted">No answer: the bot retired during the warm-up${stat?.retired ? ` (${esc(stat.retired)})` : ''}.</p></div>`;
    const rows = diffBaskets(mine, a.targets || {});
    const gross = Object.values(a.targets || {}).reduce((s, w) => s + Math.abs(w), 0);
    return `<div class="panel advisor-card" data-color="${b.color}">
      <div class="panel-h"><h3>${avatar(b, 'sm')} ${esc(b.short || b.name)}</h3><span class="chip" title="${a.source === 'decision' ? 'The bot returned new targets after seeing your basket.' : 'The bot had no new signal on this bar; its own current basket is used as its view.'}">${a.source === 'decision' ? 'reacted to your basket' : 'holds its own basket'}</span></div>
      ${a.note || note ? `<p class="advisor-note">“${esc(a.note || note)}”</p>` : ''}
      ${rows.length ? `<div class="table-wrap"><table class="stats"><caption class="sr-only">${esc(b.short)}: your weight, its target and the action</caption>
        <thead><tr><th scope="col" class="l">Asset</th><th scope="col">You</th><th scope="col">Bot</th><th scope="col">Action</th><th scope="col">≈ Amount</th></tr></thead><tbody>
        ${rows.map(r => `<tr><th scope="row" class="l"><b>${esc(asset(r.s).symbol)}</b></th><td class="num">${pct(r.mine, 1)}</td><td class="num ${cls(r.target)}">${pct(r.target, 1)}</td><td><span class="act" data-act="${r.action}">${ACTION_LABEL[r.action]}</span></td><td class="num">${r.action === 'keep' ? '—' : money(r.delta)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">All cash on both sides: nothing to do.</p>'}
      <p class="muted" data-layout="ta-s2">Target ${pct(gross, 0, false)} invested${Object.values(a.targets || {}).some(w => w < 0) ? ' incl. shorts' : ''} · its own 12-month paper result ${pct(stat.totalReturn)} · max drawdown ${pct(stat.maxDrawdown)}${a.error ? ` · advice call failed (${esc(a.error)}), showing its own basket` : ''}</p>
    </div>`; }).join('')}</div>
  <p class="muted" data-layout="ta-s32">Prices: last close ${esc(asOf)}${Object.keys(mine).length ? ` (${Object.keys(mine).map(s => `${esc(s)} ${price(last.prices[s]?.[3])}`).join(' · ')})` : ''}. Orders decided at this close would fill at the next open. Paper simulation only, not investment advice.</p>`;
}
