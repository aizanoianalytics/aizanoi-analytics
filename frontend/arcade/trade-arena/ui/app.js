import { widthStep } from './layout.js';
import { $, $$, esc, html, pct, usd, cls, avatar, getJSON, PRESETS, ok, BASE } from './util.js';
import { startRace, renderRace, rethemeRace, releaseRaceView } from './race-view.js';
import { renderData, releaseData } from './explorer.js';
import { getTheme, setTheme, applyBotColors, css, reducedMotion } from './theme.js';

const DATA_START = '2017-08-17', DATA_END = '2026-10-30', CUTOFF = '2024-12-31';
const state = { roster: null, catalog: null, league: null, leagueSort: null, pick: { preset: 'crypto-season', bots: ['sonnet-5-5', 'haiku-5-5'], blind: false, short: false, gross: 1 } };
try { Object.assign(state.pick, JSON.parse(localStorage.getItem('trade-arena:pick') || '{}')); } catch { /* storage blocked */ }
const savePick = () => { try { localStorage.setItem('trade-arena:pick', JSON.stringify(state.pick)); } catch { /* storage blocked */ } };
export const announce = text => { const a = $('#announcer'); if (a) { a.textContent = ''; setTimeout(() => { a.textContent = text; }, 30); } };

async function boot() {
  [state.roster, state.catalog] = await Promise.all([getJSON('bots/roster.json'), getJSON('data/catalog.json')]);
  state.league = await getJSON('data/league.json').catch(() => null);
  const theme = getTheme();
  setTheme(theme); applyBotColors(state.roster, theme); paintThemeSwitch();
  $$('[data-theme-set]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.themeSet; setTheme(t); applyBotColors(state.roster, t); paintThemeSwitch();
    if (location.hash.startsWith('#/race')) rethemeRace(); else route(false);
  }));
  addEventListener('hashchange', () => route());
  route(false);
}
function paintThemeSwitch() { const t = getTheme(); $$('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t))); }

const TITLES = { '': 'Arena', race: 'Race', league: 'League', bots: 'Bots', data: 'Market data' };
function route(focus = true) {
  const r = location.hash.replace(/^#\/?/, '').split('/')[0];
  $$('.nav a').forEach(a => (a.dataset.r === r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $$('dialog.results').forEach(d => { d.close?.(); d.remove(); }); // a results dialog never outlives its page
  releaseRaceView(); releaseData();
  const view = $('#view');
  view.innerHTML = '';
  scrollTo(0, 0);
  document.title = `${TITLES[r] ?? 'Arena'} · AI Trade Arena`;
  if (r === 'race') renderRace(view);
  else if (r === 'data') renderData(view, state.catalog);
  else if (r === 'bots') renderBots(view);
  else if (r === 'league') renderLeague(view);
  else renderLobby(view);
  if (focus) view.focus({ preventScroll: true });
}

// ---------------- Lobby ----------------
function renderLobby(view) {
  const { roster, catalog, pick } = state;
  const bars = [...catalog.crypto, ...catalog.stocks].reduce((s, a) => s + Object.values(a.series).reduce((t, x) => t + (x.bars || 0), 0), 0);
  const ai = roster.bots.filter(b => b.kind === 'ai');
  view.innerHTML = html`
  <section class="hero" aria-labelledby="hero-h">
    <div class="hero-copy">
      <div class="eyebrow">Historical simulation · paper money · AI-written bots</div>
      <h1 id="hero-h">Compare <span class="grad">AI-written trading bots</span> on real market history.</h1>
      <p>${ai.map(b => esc(b.name)).join(' and ')} are the archive’s authorship labels for one trading bot each (not independently verified). Pick a period, pick the bots, and replay the market bar by bar with $100,000 of paper money each.</p>
      <p class="honest"><b>What this is and is not.</b> The supplied archive says bots were written with data that ended ${CUTOFF}; races marked <span class="chip oos">after cutoff</span> use later data. The models’ own pre-training knowledge is not controlled, and one bot per model is not a measure of a model’s intelligence. No real money, no live orders.</p>
      <div class="hero-stats">
        <div><b>${catalog.crypto.length + catalog.stocks.length}</b><span>tradable assets</span></div>
        <div><b>${(bars / 1e6).toFixed(1)}M</b><span>price bars</span></div>
        <div><b>140</b><span>features per asset and bar</span></div>
        <div><b>${roster.bots.length}</b><span>bots</span></div>
      </div>
      <div data-layout="ta-s0"><button class="btn primary big" id="go-top" type="button">Start the selected race</button><a class="btn big" href="#/league">League table</a></div>
      <p class="field-err" id="go-top-err" role="alert" hidden></p>
    </div>
    <figure class="panel hero-art"><canvas id="herocv" aria-hidden="true"></canvas><figcaption>Illustration only, not race results</figcaption></figure>
  </section>

  <fieldset aria-labelledby="h-step1">
    <div class="section-h"><div><div class="eyebrow">Step 1</div><h2 id="h-step1">Pick a battlefield</h2></div><span class="muted" data-layout="ta-s1"><span class="chip oos">after cutoff</span> uses data after ${CUTOFF}</span></div>
    <div class="grid-presets" id="presets">${PRESETS.map(p => `<label class="panel preset">
      <input type="radio" name="preset" value="${p.id}" ${p.id === pick.preset ? 'checked' : ''}>
      <span class="tag">${p.oos ? '<span class="chip oos">after cutoff</span>' : '<span class="chip">inside bot data</span>'}</span>
      <span class="icon" aria-hidden="true">${p.icon}</span><h4>${esc(p.title)}</h4><p>${esc(p.desc)}</p>
      <span class="meta"><span class="chip">${p.market}</span><span class="chip">${p.tf} bars</span><span class="chip">${p.start} → ${p.end}</span>${p.blind ? '<span class="chip blind">blind</span>' : ''}</span></label>`)}
      <label class="panel preset"><input type="radio" name="preset" value="custom" ${pick.preset === 'custom' ? 'checked' : ''}><span class="icon" aria-hidden="true">🛠</span><h4>Custom race</h4><p>Any market, bar size and period from ${DATA_START} to ${DATA_END}.</p><span class="meta"><span class="chip">your rules</span></span></label>
    </div>
  </fieldset>

  <div class="setup">
    <fieldset class="panel" aria-labelledby="h-step2">
      <div class="panel-h"><h2 id="h-step2">Step 2 · Contestants</h2><span class="muted" id="bot-count" data-layout="ta-s2"></span></div>
      <div class="roster" id="roster">${roster.bots.map(b => `<label class="bot-card" data-color="${b.color}"><input type="checkbox" name="bot" value="${b.id}" ${pick.bots.includes(b.id) ? 'checked' : ''}><span class="check" aria-hidden="true">✓</span>${avatar(b)}<span><b>${esc(b.name)}</b><span>${esc(b.kind === 'ai' ? `${b.botName || 'AI bot'} · ${b.lab}` : b.lab)}</span></span></label>`)}</div>
      <p class="muted" data-layout="ta-s3">One bot races the benchmarks alone; up to six race head to head.</p>
    </fieldset>
    <section class="panel" aria-labelledby="opts-h">
      <div class="panel-h"><h2 id="opts-h">Step 3 · Rules</h2></div>
      <div class="opts" id="opts"></div>
      <div class="summary">
        <div class="vs" id="vs"></div>
        <div class="terms" id="terms"></div>
        <p class="field-err" id="go-err" role="alert" hidden></p>
        <div class="summary-row"><span class="muted" data-layout="ta-s2">Fills at the next bar’s open · costs included</span><button class="btn primary big" id="go" type="button">Start race</button></div>
      </div>
    </section>
  </div>`;

  heroArt($('#herocv'));
  $('#presets').addEventListener('change', e => { if (e.target.name !== 'preset') return; pick.preset = e.target.value; const pr = PRESETS.find(x => x.id === pick.preset); if (pr) pick.blind = !!pr.blind; savePick(); renderOpts(); renderVs(); });
  $('#roster').addEventListener('change', e => {
    if (e.target.name !== 'bot') return;
    const id = e.target.value, i = pick.bots.indexOf(id);
    if (e.target.checked && i < 0) pick.bots.push(id);
    if (!e.target.checked && i >= 0) pick.bots.splice(i, 1);
    savePick(); renderVs();
  });
  const go = which => {
    const errs = validate();
    for (const id of ['go-err', 'go-top-err']) { const el = $('#' + id); el.hidden = !errs.length || id !== which; el.textContent = errs.join(' '); }
    if (errs.length) { announce(errs.join(' ')); return; }
    const pr = PRESETS.find(p => p.id === pick.preset);
    const cfg = pr ? { ...pr } : { title: 'Custom race', market: pick.market, tf: pick.tf, start: pick.start, end: pick.end };
    startRace({ ...cfg, bots: [...pick.bots], blind: pick.blind, short: pick.short, gross: pick.gross, seed: 7 }, state.roster);
  };
  $('#go').onclick = () => go('go-err'); $('#go-top').onclick = () => go('go-top-err');
  renderOpts(); renderVs();
}

function validate() {
  const { pick } = state, errs = [];
  if (!pick.bots.length) errs.push('Pick at least one bot.');
  const chosenPreset = PRESETS.find(preset => preset.id === pick.preset);
  const selected = chosenPreset || pick;
  if (selected.market !== 'crypto' && selected.tf !== '1d') errs.push('Stock intraday races are unavailable until session-close timing is audited. Use daily bars.');
  if (pick.preset === 'custom') {
    if (!pick.start || !pick.end) errs.push('Enter a start and an end date.');
    else if (pick.start >= pick.end) errs.push('The start date must be before the end date.');
    else if (pick.start < DATA_START || pick.end > DATA_END) errs.push(`Dates must be between ${DATA_START} and ${DATA_END}.`);
    if (pick.market === 'mixed' && pick.tf !== '1d') errs.push('Mixed races use daily bars only.');
    if (pick.market === 'stocks' && pick.tf !== '1d' && pick.start < '2023-12-04') errs.push('Hourly stock data starts on 2023-12-04.');
  }
  return errs;
}

function renderOpts() {
  const { pick } = state, pr = PRESETS.find(p => p.id === pick.preset);
  pick.market ??= 'crypto'; pick.tf ??= '1d'; pick.start ??= '2025-01-01'; pick.end ??= DATA_END;
  const seg = (k, vals, fmt = v => v, dis = () => false) => `<div class="seg" role="group" data-k="${k}">${vals.map(v => `<button type="button" data-v="${v}" aria-pressed="${String(pick[k]) === String(v)}" ${dis(v) ? 'disabled title="Not available for this market"' : ''}>${fmt(v)}</button>`).join('')}</div>`;
  $('#opts').innerHTML = html`
    ${pr ? `<div class="opt"><span class="l">Battlefield</span><div data-layout="ta-s4">${pr.icon} ${esc(pr.title)}</div><div class="muted num" data-layout="ta-s2">${pr.market} · ${pr.tf} bars · ${pr.start} → ${pr.end}</div></div>`
    : `<div class="opt"><span class="l" id="l-market">Market</span>${seg('market', ['crypto', 'stocks', 'mixed'])}</div>
       <div class="opt"><span class="l">Bar size</span>${seg('tf', ['1d', '4h', '1h'], v => v, v => pick.market !== 'crypto' && v !== '1d')}${pick.market === 'mixed' ? '<p class="muted" data-layout="ta-s5">Mixed crypto + stock races use daily bars: the two markets keep different hours.</p>' : ''}</div>
       <div class="opt"><span class="l">Period (UTC)</span><div class="opt-row"><label class="sr-only" for="d1">Start date</label><input type="date" id="d1" value="${pick.start}" min="${DATA_START}" max="${DATA_END}"> <span aria-hidden="true">→</span> <label class="sr-only" for="d2">End date</label><input type="date" id="d2" value="${pick.end}" min="${DATA_START}" max="${DATA_END}"></div>
         <p class="muted" data-layout="ta-s5">Daily crypto from 2017, hourly stocks from Dec 2023. Before ${CUTOFF} is inside the data the bots were written with.</p></div>`}
    <div class="opt"><span class="l">Options</span><div class="opt-row" data-layout="ta-s6">
      <label class="toggle"><input type="checkbox" id="o-blind" ${pick.blind ? 'checked' : ''}><i aria-hidden="true"></i>Blind: hide names and dates from bots</label>
      <label class="toggle"><input type="checkbox" id="o-short" ${pick.short ? 'checked' : ''}><i aria-hidden="true"></i>Allow shorts</label></div></div>
    <div class="opt"><span class="l">Max gross exposure</span>${seg('gross', [1, 1.5, 2, 3], v => `${v}×`)}${+pick.gross > 1 || pick.short ? '<p class="muted" data-layout="ta-s5">Simplified: no borrow cost, funding or margin calls are modelled. The official league is long-only at 1×.</p>' : ''}</div>`;
  $$('#opts .seg').forEach(s => s.onclick = e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const k = s.dataset.k; pick[k] = k === 'gross' ? +b.dataset.v : b.dataset.v;
    if (k === 'market' && pick.market !== 'crypto') pick.tf = '1d';
    savePick(); renderOpts(); renderVs();
  });
  for (const [id, key] of [['d1', 'start'], ['d2', 'end']]) $('#' + id)?.addEventListener('change', e => { pick[key] = e.target.value; savePick(); const bad = validate().some(x => /date/i.test(x)); $('#d1').setAttribute('aria-invalid', bad); $('#d2').setAttribute('aria-invalid', bad); renderVs(); });
  $('#o-blind').onchange = e => { pick.blind = e.target.checked; savePick(); renderVs(); };
  $('#o-short').onchange = e => { pick.short = e.target.checked; savePick(); renderOpts(); renderVs(); };
}

function renderVs() {
  const { pick } = state;
  const bots = pick.bots.map(id => state.roster.bots.find(b => b.id === id)).filter(Boolean);
  $('#vs').innerHTML = bots.length ? bots.map(b => `${avatar(b, 'sm')}<b data-layout="ta-s1">${esc(b.short)}</b>`).join('<em>VS</em>') + (bots.length === 1 ? '<em>VS</em><span class="muted" data-layout="ta-s1">the benchmarks</span>' : '') : '<span class="muted">No bot selected</span>';
  const full = pick.bots.length >= 6;
  $$('#roster input').forEach(i => { i.disabled = full && !i.checked; });
  $('#bot-count').textContent = `${pick.bots.length} of 6 selected${full ? ' · maximum reached' : ''}`;
  const pr = PRESETS.find(p => p.id === pick.preset);
  const c = pr || { market: pick.market, tf: pick.tf, start: pick.start, end: pick.end };
  $('#terms').textContent = `${c.market} · ${c.tf} bars · ${c.start} → ${c.end} · ${pick.blind ? 'blind' : 'named'} · ${pick.short ? 'shorts allowed' : 'long only'} · ${pick.gross}× gross · $100,000 each`;
}

// Decorative hero: synthetic lines (labelled as illustration). Static when the viewer prefers reduced motion.
function heroArt(cv) {
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const cols = state.roster.bots.slice(0, 4).map(b => b.color);
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lines = cols.map((c, i) => ({ c, v: [0], drift: 0.0012 + i * 0.0003, vol: 0.012 + i * 0.004 }));
  const N = 260, still = reducedMotion();
  if (still) for (let k = 0; k < N; k++) for (const l of lines) l.v.push(l.v[l.v.length - 1] + (rnd() + rnd() + rnd() - 1.5) * l.vol + l.drift);
  let t = 0;
  const draw = () => {
    if (!cv.isConnected) return;
    const r = cv.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
    if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const w = r.width, h = r.height;
    if (!still && t++ % 2 === 0) for (const l of lines) { l.v.push(l.v[l.v.length - 1] + (rnd() + rnd() + rnd() - 1.5) * l.vol + l.drift); if (l.v.length > N) l.v.shift(); }
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = css('--grid'); ctx.lineWidth = 1;
    for (let y = 30; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    let lo = Infinity, hi = -Infinity; for (const l of lines) for (const v of l.v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const Y = v => h - 40 - (v - lo) / (hi - lo || 1) * (h - 80), X = i => 20 + i / (N - 1) * (w - 70);
    for (const l of lines) {
      ctx.strokeStyle = l.c; ctx.lineWidth = 2.4; ctx.beginPath();
      l.v.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke();
      ctx.fillStyle = l.c; ctx.beginPath(); ctx.arc(X(l.v.length - 1), Y(l.v[l.v.length - 1]), 5, 0, 7); ctx.fill();
    }
    if (!still) requestAnimationFrame(draw);
  };
  draw();
}

// ---------------- Bots ----------------
function renderBots(view) {
  const { roster, league } = state;
  view.innerHTML = html`<div class="section-h" data-layout="ta-s7"><div><div class="eyebrow">The paddock</div><h1 data-layout="ta-s8">Bots</h1></div><span class="muted" data-layout="ta-s1">Model ≠ strategy: each AI model wrote one bot once. Results describe that bot, not the model in general.</span></div>
  <div class="bots-grid">${roster.bots.map(b => {
    const row = league?.standings?.find(s => s.id === b.id);
    return `<article class="panel bot-profile" data-color="${b.color}">
      <header>${avatar(b, 'lg')}<div><div class="eyebrow">${esc(b.kind === 'ai' ? 'AI-written bot' : 'House bot · baseline')}</div><h2 data-layout="ta-s9">${esc(b.botName || b.name)}</h2><div class="muted">${b.kind === 'ai' ? `by <b data-layout="ta-s10">${esc(b.name)}</b> (${esc(b.model)})` : esc(b.lab)}</div></div></header>
      <p>${esc(b.strategy)}</p>
      ${b.session ? `<div class="hold-meta" aria-label="Production log"><span>supplied session label: ${Math.round(b.session.secs / 60)} min, ${b.session.turns} agent turns (observed, not a budget)</span><span>bot-writing data ended ${CUTOFF}</span></div>` : ''}
      ${row ? `<div class="kpis" data-layout="ta-s11"><div><span>League pts</span><b>${row.points}</b></div><div><span>Wins</span><b>${row.wins}/${row.races}</b></div><div><span>Avg return</span><b class="${cls(row.avgReturn)}">${pct(row.avgReturn)}</b></div><div><span>Avg Sharpe</span><b>${row.avgSharpe.toFixed(2)}</b></div></div>` : ''}
      <details data-code="${esc(b.file)}"><summary class="muted" data-layout="ta-s12">Source code</summary><div class="code" data-layout="ta-s13">Loading…</div></details>
      <div><button class="btn" type="button" data-solo="${b.id}">Solo race: Crypto Season</button></div>
    </article>`;
  })}</div>`;
  view.addEventListener('toggle', async e => {
    const d = e.target; if (!d.matches?.('details[data-code]') || !d.open || d.dataset.loaded) return;
    const box = d.querySelector('.code');
    try { const r = await fetch(new URL(d.dataset.code, BASE)); if (!r.ok) throw new Error(`HTTP ${r.status}`); box.textContent = await r.text(); d.dataset.loaded = '1'; }
    catch (err) { box.innerHTML = `Could not load the source (${esc(err.message)}). <button class="btn sm" type="button" data-retry>Retry</button>`; }
  }, true);
  view.onclick = e => {
    const r = e.target.closest('[data-retry]'); if (r) { const d = r.closest('details'); d.open = false; d.open = true; return; }
    const b = e.target.closest('[data-solo]'); if (b) startRace({ ...PRESETS[0], bots: [b.dataset.solo], seed: 7 }, roster);
  };
}

// ---------------- League ----------------
const LCOLS = [['points', 'Points', -1], ['wins', 'Wins', -1], ['podiums', 'Podiums', -1], ['avgPlace', 'Avg place', 1], ['avgReturn', 'Avg return', -1], ['avgSharpe', 'Avg Sharpe', -1], ['worstDD', 'Worst drawdown', -1]];
function renderLeague(view) {
  const { league, roster } = state;
  const bot = id => roster.bots.find(b => b.id === id) || { name: id, color: '#888', initials: '?' };
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem('trade-arena:history') || localStorage.getItem('arena-history') || '[]'); } catch { /* storage blocked */ }
  const mine = {};
  for (const h of hist) {
    if (!Array.isArray(h.stats) || h.stats.length < 2) continue;
    [...h.stats].sort((a, b) => b.final - a.final).forEach((s, i) => { const m = (mine[s.id] ??= { id: s.id, races: 0, wins: 0, ret: 0 }); m.races++; if (!i) m.wins++; m.ret += s.totalReturn; });
  }
  const myRows = Object.values(mine).sort((a, b) => b.wins - a.wins || b.ret - a.ret);
  const sort = state.leagueSort;
  const rows = league ? [...league.standings] : [];
  if (sort) { const [k, dir] = sort; rows.sort((a, b) => (a[k] - b[k]) * dir); }
  view.innerHTML = html`
  <div class="section-h" data-layout="ta-s7"><div><div class="eyebrow">Season 1 · imported owner results</div><h1 data-layout="ta-s8">League table</h1></div>${league ? `<span class="muted" data-layout="ta-s1">${league.races.length} races · engine ${esc(league.engine || '1.0')} · long only, 1×</span>` : ''}</div>
  ${league ? `<div class="notice" data-layout="ta-s14"><span aria-hidden="true">ⓘ</span><span><b>Ranked by league points</b> (10 / 6 / 4 / 3 / 2 for places 1–5 in each race). Sorting by another column changes the view, not the official order. Race windows overlap, so 17 races are not 17 independent tests.${league.engineNotes ? ` ${esc(league.engineNotes)}` : ''}</span></div>
  <div class="panel table-wrap"><table class="stats lb"><caption>Imported standings${sort ? ` · sorted by ${esc(LCOLS.find(c => c[0] === sort[0])[1].toLowerCase())}` : ' · by league points'}</caption><thead><tr><th scope="col">#</th><th scope="col" class="l">Bot</th>
    ${LCOLS.map(([k, label, def]) => `<th scope="col" aria-sort="${sort?.[0] === k ? (sort[1] > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}" data-def="${def}">${label}${sort?.[0] === k ? (sort[1] > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}<th scope="col"><span class="sr-only">Points bar</span></th></tr></thead><tbody>
    ${rows.map(s => { const b = bot(s.id), rank = league.standings.indexOf(s) + 1; return `<tr data-color="${b.color}"><td>${rank}</td><th scope="row" class="l" data-layout="ta-s15"><span data-layout="ta-s16">${avatar(b, 'sm')}${esc(b.name)}</span></th><td><b>${s.points}</b></td><td>${s.wins}</td><td>${s.podiums}</td><td>${s.avgPlace.toFixed(2)}</td><td class="${cls(s.avgReturn)}">${pct(s.avgReturn)}</td><td>${s.avgSharpe.toFixed(2)}</td><td class="down">${pct(s.worstDD)}</td><td data-layout="ta-s17"><div class="bar" data-width="${widthStep(s.points / league.standings[0].points * 100)}"></div></td></tr>`; }).join('')}
  </tbody></table>${sort ? '<div data-layout="ta-s18"><button class="btn sm" type="button" data-sort-reset>Back to official order</button></div>' : ''}</div>
  <div class="section-h"><div><div class="eyebrow">Every race of the season</div><h2>Race results</h2></div><span class="muted" data-layout="ta-s1">“Re-run” computes the race again in your browser with the same rules.</span></div>
  <div class="panel table-wrap"><table class="stats"><caption>Total return per bot; medal = finishing place among bots</caption><thead><tr><th scope="col" class="l">Race</th>${league.standings.map(s => `<th scope="col">${esc(bot(s.id).short || s.id)}</th>`).join('')}<th scope="col">Equal wt.</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead><tbody>
    ${league.races.map((r, ri) => `<tr><th scope="row" class="l" data-layout="ta-s15"><span data-layout="ta-s19">${esc(r.title)}</span><div class="faint num" data-layout="ta-s20">${r.market} · ${r.tf} · ${r.start} → ${r.end}${r.blind ? ' · blind' : ''}</div></th>${league.standings.map(s => { const x = r.results.find(q => q.id === s.id); return `<td class="${x ? cls(x.totalReturn) : ''}">${x ? `${x.place <= 3 ? `<span aria-label="place ${x.place}">${['🥇', '🥈', '🥉'][x.place - 1]}</span> ` : ''}${pct(x.totalReturn)}` : '—'}</td>`; }).join('')}<td class="${cls(r.equalWeight)}">${pct(r.equalWeight)}</td><td><button class="btn sm" type="button" data-watch="${ri}" aria-label="Re-run ${esc(r.title)}">▶ Re-run</button></td></tr>`).join('')}
  </tbody></table></div>` : '<div class="panel empty">The official season has not been run yet.</div>'}
  <div class="section-h"><div><div class="eyebrow">Stored only in this browser</div><h2>Simulations completed here</h2></div>${hist.length ? '<button class="btn ghost" type="button" id="clear-hist">Clear this browser’s history</button>' : ''}</div>
  ${myRows.length ? `<div class="panel table-wrap"><table class="stats"><caption>Head-to-head races finished in this browser (not part of the official league)</caption><thead><tr><th scope="col" class="l">Bot</th><th scope="col">Races</th><th scope="col">Wins</th><th scope="col">Avg return</th></tr></thead><tbody>${myRows.map(m => { const b = bot(m.id); return `<tr><th scope="row" class="l" data-layout="ta-s15"><span data-layout="ta-s16">${avatar(b, 'sm')}${esc(b.name)}</span></th><td>${m.races}</td><td>${m.wins}</td><td class="${cls(m.ret / m.races)}">${pct(m.ret / m.races)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="panel empty">Head-to-head races you run in the Arena are tallied here.</div>'}`;
  view.onclick = e => {
    const s = e.target.closest('[data-sort]');
    if (s) { const k = s.dataset.sort, cur = state.leagueSort; state.leagueSort = [k, cur?.[0] === k ? -cur[1] : +s.dataset.def]; renderLeague(view); $(`[data-sort="${k}"]`)?.focus(); return; }
    if (e.target.closest('[data-sort-reset]')) { state.leagueSort = null; renderLeague(view); return; }
    const b = e.target.closest('[data-watch]');
    if (b) { const r = league.races[+b.dataset.watch]; startRace({ title: r.title, market: r.market, tf: r.tf, start: r.start, end: r.end, blind: r.blind, short: r.short, gross: r.gross, seed: 7, bots: league.standings.map(x => x.id) }, roster); return; }
    if (e.target.closest('#clear-hist') && confirm('Delete the races stored in this browser? The official league is not affected.')) { try { localStorage.removeItem('trade-arena:history'); localStorage.removeItem('arena-history'); } catch { /* storage blocked */ } renderLeague(view); }
  };
}

boot().catch(error => {
  $('#view').replaceChildren();
  const message = document.createElement('p'); message.setAttribute('role', 'alert');
  message.textContent = `Trade Arena could not load: ${error.message}`;
  const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn'; retry.textContent = 'Try again';
  retry.addEventListener('click', () => location.reload());
  $('#view').append(message, retry);
});
