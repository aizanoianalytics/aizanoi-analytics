import { widthStep } from './layout.js';
// Live race page: runs a race in a worker, plays the streamed frames back as a broadcast.
import { $, $$, esc, html, pct, usd, compact, price, cls, fmtDate, avatar, ok, BASE } from './util.js';
import { RaceChart } from './race-chart.js';
import { css, reducedMotion } from './theme.js';

const SPEEDS = [[1, '1'], [4, '4'], [12, '12'], [40, '40'], [150, '150'], [Infinity, 'Max']]; // bars per second
const CASH = 100000;
let R = null; // current race state

export function currentRace() { return R; }

export function rethemeRace() { const v = $('#view'); if (v && R) renderRace(v); }
let lastCfg = null;

export async function startRace(cfg, roster) {
  lastCfg = { cfg, roster };
  releaseRaceView();
  if (R?.worker) R.worker.terminate();
  if (R?.startup) clearTimeout(R.startup);
  if (R?.raf) cancelAnimationFrame(R.raf);
  const bots = cfg.bots.map(id => roster.bots.find(b => b.id === id)).filter(Boolean);
  R = { cfg, bots, frames: [], meta: null, done: null, k: 0, pos: 0, speed: cfg.tf === '1d' ? 12 : 40, playing: !reducedMotion(), status: { text: 'Starting…', progress: 0 },
    feed: [], leader: null, milestones: bots.map(() => new Set()), asset: null, reveal: !cfg.blind, lastUi: 0, shownResults: false, roster };
  const worker = new Worker(new URL('./race-worker.js', import.meta.url), { type: 'module' });
  R.worker = worker;
  const me = R;
  const fail = message => { if (R !== me) return; clearTimeout(R.startup); worker.terminate(); R.error = message; renderStatus(); };
  R.startup = setTimeout(() => fail('Race worker did not start within 15 seconds.'), 15000);
  worker.onerror = event => { event.preventDefault(); fail(event.message || 'Race worker failed to load'); };
  worker.onmessageerror = () => fail('Race worker returned an invalid message');
  worker.onmessage = ({ data }) => {
    if (R !== me) return;
    clearTimeout(R.startup);
    if (data.type === 'status') { R.status = data; renderStatus(); }
    else if (data.type === 'meta') { R.meta = data; onMeta(); }
    else if (data.type === 'frames') { for (const f of data.frames) R.frames.push(f); }
    else if (data.type === 'done') { R.done = data; saveHistory(); }
    else if (data.type === 'error') fail(data.error);
  };
  worker.postMessage({
    cfg: { market: cfg.market, tf: cfg.tf, start: Date.parse(cfg.start), end: Date.parse(cfg.end) + 86399999, blind: !!cfg.blind, seed: cfg.seed || 7 },
    bots: bots.map(b => ({ id: b.id, name: b.name, file: b.file })),
    rules: { allowShort: !!cfg.short, maxGross: cfg.gross || 1 },
  });
  location.hash = '#/race';
}

const title = cfg => cfg.title || `${{ crypto: 'Crypto', stocks: 'Stocks', mixed: 'Mixed' }[cfg.market]} ${cfg.tf}`;

export function releaseRaceView() {
  if (R?.raf) cancelAnimationFrame(R.raf);
  R?.ac?.chart?.remove(); R?.chart?.destroy();
  if (R) { R.raf = null; R.ac = null; }
}
export function disposeRace() { releaseRaceView(); if (R?.startup) clearTimeout(R.startup); R?.worker?.terminate(); R = null; }
addEventListener('pagehide', disposeRace);

export function renderRace(view) {
  releaseRaceView();
  if (!R) {
    view.innerHTML = `<div class="panel empty"><h2>No race running</h2><p>Pick contestants and a market in the Arena.</p><p><a class="btn primary" href="#/">Go to the Arena</a></p></div>`;
    return;
  }
  const { cfg, bots } = R;
  view.innerHTML = html`
  <div class="race-head">
    <div>
      <div class="eyebrow">Historical simulation · ${bots.length === 1 ? 'solo vs benchmarks' : bots.map(b => esc(b.short)).join(' vs ')}</div>
      <h1>${esc(title(cfg))}</h1>
    </div>
    <div class="chips">
      <span class="chip">${cfg.market}</span><span class="chip">${cfg.tf} bars</span>
      <span class="chip">${cfg.start} → ${cfg.end} UTC</span>
      ${cfg.blind ? '<span class="chip blind">BLIND</span>' : ''}${cfg.short ? '<span class="chip">shorts</span>' : ''}${(cfg.gross || 1) > 1 ? `<span class="chip">${cfg.gross}× gross</span>` : ''}
    </div>
    <div class="controls">
      ${cfg.blind ? `<label class="toggle"><input type="checkbox" id="reveal" ${R.reveal ? 'checked' : ''}><i aria-hidden="true"></i>Show real names (viewer only)</label>` : ''}
      <div class="seg" id="speeds" role="group" aria-label="Playback speed, bars per second">${SPEEDS.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === R.speed}" title="${v === Infinity ? 'Jump to the latest computed bar' : `${l} bars per second`}">${l}</button>`)}</div>
      <button type="button" class="icon-btn" id="prev" aria-label="Previous bar" title="Previous bar (←)">⏮</button>
      <button type="button" class="play" id="play"></button>
      <button type="button" class="icon-btn" id="next" aria-label="Next bar" title="Next bar (→)">⏭</button>
      <button type="button" class="icon-btn" id="restart" aria-label="Restart from the first bar" title="Restart">↺</button>
    </div>
  </div>
  <div class="scrub">
    <div class="date num" id="date">—</div>
    <div class="track" id="track" role="slider" tabindex="0" aria-label="Race time" aria-valuemin="1" aria-valuemax="1" aria-valuenow="1" aria-valuetext="not started"><div class="computed"></div><div class="played"></div><div class="knob"></div></div>
    <div class="num muted" id="stepno" data-layout="ta-s21">—</div>
  </div>
  <div class="progress-note"><span id="calc-note">Preparing…</span><span>Speed in bars per second · ← → one bar · Page Up/Down ten percent · Home/End · Space play/pause</span></div>
  <div class="race-grid">
    <div class="panel chart-panel"><canvas id="racecv"></canvas><div class="loading-veil" id="veil"><div class="loader" role="status"><div class="ring" id="vring"></div><div id="vtext">Starting…</div><div class="pbar" id="vpbar"><i id="vbar" data-layout="ta-s22"></i></div><div class="err-actions" id="verr" hidden><button type="button" class="btn primary" id="retry">Try again</button><a class="btn" href="#/">Back to the Arena</a></div></div></div></div>
    <section class="panel board" aria-labelledby="h-stand"><div class="panel-h"><h2 id="h-stand">Standings</h2><span class="muted num">portfolio value</span></div><div id="rows"></div><p class="board-note">Ranked by total portfolio value at this bar. Dashed avatars are buy-and-hold benchmarks: they enter with the bots and pay the same costs.</p></section>
  </div>
  <div class="lower">
    <div class="panel asset-panel">
      <div class="panel-h"><h3>Price action</h3><div class="asset-pick"><label class="sr-only" for="asset">Asset</label><select id="asset"></select><span class="num" id="asset-px"></span></div></div>
      <div class="chart" id="achart" role="img" aria-label="Candlestick chart of the selected asset up to the current bar, with trade arrows"></div>
      <p class="chart-foot">Arrows: each bot’s trades above $200 in this asset (latest 300). Bots decide at a bar’s close and fill at the next open.</p>
    </div>
    <div class="panel"><div class="panel-h"><h3>Portfolios</h3><span class="muted" data-layout="ta-s2">% of equity · short = −</span></div><div class="holdings" id="holdings"></div></div>
    <div class="panel feed"><div class="panel-h"><h3>Race feed</h3><span class="muted" data-layout="ta-s23">quotes are the bots’ own notes, not verified reasons</span></div><ul id="feed" aria-label="Race events"></ul></div>
  </div>
  <div class="tape" id="tape-box" aria-hidden="true"><div class="tape-inner" id="tape"></div></div>`;

  $('#speeds').onclick = e => { const b = e.target.closest('button'); if (!b) return; R.speed = +b.dataset.v; $$('#speeds button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); };
  $('#play').onclick = () => { if (R.k >= lastIndex() && R.done) restart(); else R.playing = !R.playing; paintPlay(); };
  $('#restart').onclick = restart;
  $('#prev').onclick = () => stepTo(cur() - 1);
  $('#next').onclick = () => stepTo(cur() + 1);
  $('#retry').onclick = () => lastCfg && startRace(lastCfg.cfg, lastCfg.roster);
  $('#reveal')?.addEventListener('change', e => { R.reveal = e.target.checked; fillAssetSelect(); renderTape(true); renderHoldings(); });
  const track = $('#track');
  const seek = e => { if (!R.meta) return; const r = track.getBoundingClientRect(); const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); R.pos = Math.min(R.frames.length - 1, f * (R.meta.timeline.length - 1)); R.seeked = true; };
  track.onpointerdown = e => { seek(e); track.setPointerCapture(e.pointerId); track.onpointermove = seek; };
  track.onpointerup = () => { track.onpointermove = null; };
  track.onkeydown = e => {
    const N = R.meta ? R.meta.timeline.length : 1, big = Math.max(1, Math.round(N / 10));
    const k = cur(), to = { ArrowLeft: k - 1, ArrowDown: k - 1, ArrowRight: k + 1, ArrowUp: k + 1, PageDown: k - big, PageUp: k + big, Home: 0, End: N - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); stepTo(to);
  };
  document.onkeydown = e => {
    if (!location.hash.startsWith('#/race') || e.defaultPrevented) return;
    const t = e.target, typing = /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.closest?.('dialog');
    if (e.code === 'Space' && !typing && (t === document.body || t.id === 'track' || t.id === 'view')) { e.preventDefault(); $('#play').click(); }
  };
  paintPlay();
  if (R.meta) onMeta(true); else renderStatus();
  loop();
}

function lastIndex() { return R.meta ? R.meta.timeline.length - 1 : 0; }
const cur = () => Math.floor(R.pos); // target bar, also between animation frames
function stepTo(k) { // pause and move to an exact bar (only bars that are already computed)
  if (!R.meta || !R.frames.length) return;
  R.playing = false; paintPlay();
  R.pos = Math.max(0, Math.min(R.frames.length - 1, k)); R.seeked = true;
}
function restart() { R.pos = 0; R.k = 0; R.feed = []; R.leader = null; R.milestones = R.bots.map(() => new Set()); R.playing = true; R.shownResults = false; R.seeked = true; $('#feed') && ($('#feed').innerHTML = ''); paintPlay(); }
function paintPlay() {
  const b = $('#play'); if (!b) return;
  b.setAttribute('aria-label', R.playing ? 'Pause' : 'Play'); b.title = `${R.playing ? 'Pause' : 'Play'} (Space)`;
  $('#tape-box')?.classList.toggle('paused', !R.playing);
  b.innerHTML = R.playing ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>';
}

function renderStatus() {
  if (!$('#veil')) return;
  if (R.error) {
    R.playing = false;
    $('#veil').hidden = false;
    $('#vring').hidden = true; $('#vpbar').hidden = true; $('#verr').hidden = false;
    const short = String(R.error).split('\n')[0].replace(/^Error:\s*/, '');
    $('#vtext').innerHTML = `<b class="down" data-layout="ta-s24">The race stopped before it finished</b><br><span>${esc(short).slice(0, 220)}</span><br><span class="faint" data-layout="ta-s2">No result was recorded. Your settings are kept.</span>`;
    return;
  }
  $('#vtext').textContent = R.status.text;
  $('#vbar').setAttribute('data-width', widthStep((R.status.progress || 0) * 100));
}

const name = id => { if (!R.meta) return id; const a = R.assetsById[id]; return a ? (R.reveal ? a.symbol : a.id) : id; };

function onMeta(rebuild = false) {
  if (!$('#racecv')) return;
  const { meta } = R;
  R.chart?.destroy();
  R.assetsById = Object.fromEntries(meta.assets.map(a => [a.id, a]));
  const benchColors = R.roster.benchmarks;
  R.chart = new RaceChart($('#racecv'), {
    bots: R.bots, timeline: meta.timeline, tf: R.cfg.tf, cash: CASH,
    benches: Object.entries(meta.bench).map(([n, curve]) => ({ name: n, color: benchColors[n] || '#888', curve })),
  });
  R.chart.curves = R.bots.map((_, j) => R.frames.map(f => f.acc[j].e));
  $('#veil').hidden = true;
  if (!R.asset || !R.assetsById[R.asset]) {
    const pref = meta.assets.find(a => a.symbol === 'BTC') || meta.assets.find(a => a.symbol === 'NVDA') || meta.assets[0];
    R.asset = pref.id;
  }
  fillAssetSelect();
  buildAssetChart();
  renderBoard(); renderHoldings(); renderTape(true);
}

function fillAssetSelect() {
  const s = $('#asset'); if (!s || !R.meta) return;
  const list = [...R.meta.assets].sort((a, b) => name(a.id).localeCompare(name(b.id)));
  s.innerHTML = list.map(a => `<option value="${a.id}" ${a.id === R.asset ? 'selected' : ''}>${esc(name(a.id))}${R.reveal && a.name ? ' · ' + esc(a.name) : ''}</option>`).join('');
  s.onchange = () => { R.asset = s.value; buildAssetChart(); };
}

// ---------- asset candle chart ----------
async function buildAssetChart() {
  const host = $('#achart'); if (!host || !window.LightweightCharts) return;
  R.ac?.chart?.remove();
  host.innerHTML = '';
  const chart = LightweightCharts.createChart(host, {
    autoSize: true, localization: { locale: 'en-US' }, layout: { attributionLogo: false, background: { color: 'transparent' }, textColor: css('--muted'), fontFamily: 'JetBrains Mono' },
    grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
    rightPriceScale: { borderColor: css('--line') }, timeScale: { borderColor: css('--line'), timeVisible: R.cfg.tf !== '1d' }, crosshair: { mode: 0 },
  });
  const up = css('--up'), down = css('--down');
  const series = chart.addCandlestickSeries({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
  R.ac = { chart, series, shown: -1, id: R.asset };
  const mine = R, ac = R.ac;
  // warm-up bars from the raw file, rebased like the race when blind
  const a = R.assetsById[R.asset];
  const tfFile = a.market === 'stocks' && R.cfg.tf === '4h' ? '1h' : R.cfg.tf;
  try {
    const raw = await fetch(new URL(`data/raw/${a.market}/${tfFile}/${a.symbol}.json`, BASE)).then(r => r.json());
    if (R !== mine || R.ac !== ac) return;
    const t0 = R.meta.timeline[0], pre = [];
    const tfStep = { '1d': 86400000, '4h': 14400000, '1h': 3600000 }[R.cfg.tf];
    if (tfFile === R.cfg.tf) for (let i = 0; i < raw.t.length && raw.t[i] < t0; i++) pre.push(i);
    R.ac.warm = pre.slice(-120).map(i => ({ time: raw.t[i] / 1000, open: raw.o[i] * a.scale, high: raw.h[i] * a.scale, low: raw.l[i] * a.scale, close: raw.c[i] * a.scale }));
    R.ac.step = tfStep;
  } catch { if (R !== mine || R.ac !== ac) return; R.ac.warm = []; }
  if (R !== mine || R.ac !== ac) return;
  R.ac.shown = -1;
  syncAssetChart(true);
}

function assetBars(upto) {
  const out = [...(R.ac.warm || [])], tl = R.meta.timeline;
  let lastT = -1;
  for (let k = 0; k <= upto && k < R.frames.length; k++) {
    const p = R.frames[k].prices[R.ac.id]; if (!p) continue;
    const t = tl[k] / 1000; if (t <= lastT) continue;
    // only bars where this asset traded (stock bars repeat on weekends in mixed races)
    if (k > 0) { const q = R.frames[k - 1].prices[R.ac.id]; if (q && q[3] === p[3] && q[0] === p[0] && q[1] === p[1]) continue; }
    out.push({ time: t, open: p[0], high: p[1], low: p[2], close: p[3] }); lastT = t;
  }
  return out.filter((b, i, arr) => !i || b.time > arr[i - 1].time);
}

function syncAssetChart(force = false) {
  const ac = R.ac; if (!ac || !R.meta) return;
  const k = Math.min(R.k, R.frames.length - 1); if (k < 0) return;
  if (force || ac.shown < 0 || k < ac.shown || k - ac.shown > 50) {
    ac.series.setData(assetBars(k));
  } else {
    for (let j = ac.shown + 1; j <= k; j++) {
      const p = R.frames[j]?.prices[ac.id]; if (!p) continue;
      try { ac.series.update({ time: R.meta.timeline[j] / 1000, open: p[0], high: p[1], low: p[2], close: p[3] }); } catch { /* weekend duplicate */ }
    }
  }
  // Keep a readable window: the last ~160 bars (fitContent on the first frames would zoom in to a few giant candles).
  const n = (ac.warm?.length || 0) + k + 1;
  if (ac.shown < 0 || force || ac.chart.timeScale().options().barSpacing > 24) ac.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 160), to: n + 3 });
  ac.shown = k;
  // trade markers of every bot on this asset
  const markers = [];
  for (let j = 0; j <= k; j++) {
    const f = R.frames[j]; if (!f) break;
    f.acc.forEach((a, b) => { for (const t of a.trades) if (t.s === ac.id && t.value > 200) markers.push({ time: R.meta.timeline[j] / 1000, position: t.side === 'buy' ? 'belowBar' : 'aboveBar', color: R.bots[b].color, shape: t.side === 'buy' ? 'arrowUp' : 'arrowDown', text: R.bots.length > 1 ? R.bots[b].initials : '' }); });
  }
  const tail = markers.slice(-300);
  const seen = new Set(); const uniq = tail.filter(m => { const key = m.time + m.color + m.shape; if (seen.has(key)) return false; seen.add(key); return true; });
  try { ac.series.setMarkers(uniq.sort((a, b) => a.time - b.time)); } catch { /* */ }
  const p = R.frames[k].prices[ac.id];
  if (p) $('#asset-px').innerHTML = `${price(p[3])} <span class="${cls(p[4])}">${pct(p[4], 2)}</span>`;
}

// ---------- standings ----------
function standings() {
  const k = Math.min(R.k, R.frames.length - 1);
  const f = R.frames[k];
  const rows = R.bots.map((b, j) => ({ key: b.id, b, e: f?.acc[j].e ?? CASH, prev: R.frames[Math.max(0, k - 1)]?.acc[j].e ?? CASH, dd: f?.acc[j].dd ?? 0, retired: f?.acc[j].retired, x: f?.acc[j].x ?? 0 }));
  for (const [n, curve] of Object.entries(R.meta.bench)) rows.push({ key: 'b:' + n, b: { name: n, short: n, color: R.roster.benchmarks[n] || '#888', initials: n === 'BTC hold' ? '₿' : n === 'S&P 500 hold' ? 'SPX' : 'EW' }, bench: true, e: curve[k], prev: curve[Math.max(0, k - 1)], dd: 0 });
  return rows.sort((a, b) => b.e - a.e);
}

const ROW_H = 64;
function renderBoard() {
  const box = $('#rows'); if (!box || !R.meta) return;
  const rows = standings();
  const top = rows.find(r => !r.bench)?.e || CASH;
  box.setAttribute('data-rows', rows.length);
  const els = new Map($$('.row', box).map(el => [el.dataset.key, el]));
  let rank = 0;
  rows.forEach((r, i) => {
    let el = els.get(r.key);
    if (!el) {
      el = document.createElement('div');
      el.className = `row ${r.bench ? 'bench' : ''}`; el.dataset.key = r.key; el.setAttribute('data-color', r.b.color);
      el.innerHTML = `<div class="rank"></div>${avatar(r.b, 'sm')}<div class="name"><b></b><span class="num"></span></div><div class="val"><b></b><span></span></div>${r.bench ? '' : '<div class="bar"></div>'}`;
      el.setAttribute('data-rank', i);
      box.appendChild(el);
    }
    const rk = r.bench ? 0 : ++rank, ret = r.e / CASH - 1, ch = r.e / r.prev - 1;
    if (el.dataset.pos !== String(i)) {
      if (el.dataset.pos !== undefined && +el.dataset.pos > i && !r.bench) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      el.dataset.pos = i; el.setAttribute('data-rank', i);
    }
    el.classList.toggle('p1', rk === 1); el.classList.toggle('p2', rk === 2); el.classList.toggle('p3', rk === 3);
    el.querySelector('.rank').textContent = rk || '·';
    el.querySelector('.name b').innerHTML = `${esc(r.b.short || r.b.name)}${r.retired ? `<span class="retired">${esc(r.retired)}</span>` : ''}`;
    el.querySelector('.name span').textContent = r.bench ? 'benchmark' : `${usd(r.e)} · ${Math.round(r.x * 100)}% invested`;
    const v = el.querySelector('.val b'); v.textContent = pct(ret); v.className = cls(ret);
    const d = el.querySelector('.val span'); d.textContent = pct(ch, 2); d.className = cls(ch);
    const bar = el.querySelector('.bar'); if (bar) bar.setAttribute('data-width', widthStep(r.e / Math.max(top, 1) * 100));
  });
}

function renderHoldings() {
  const box = $('#holdings'); if (!box || !R.meta) return;
  const k = Math.min(R.k, R.frames.length - 1), f = R.frames[k]; if (!f) return;
  const palette = ['#7c8cff', '#22d39b', '#ffcc4d', '#ff8a4c', '#2ee6d6', '#f78fb3', '#b18cff', '#5aa9ff', '#e7f05a', '#9fd3a8'];
  box.innerHTML = R.bots.map((b, j) => {
    const a = f.acc[j];
    const pos = Object.entries(a.pos).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    const shown = pos.slice(0, 6), rest = pos.slice(6).reduce((s, [, w]) => s + Math.abs(w), 0);
    const gross = pos.reduce((s, [, w]) => s + Math.abs(w), 0), net = pos.reduce((s, [, w]) => s + w, 0);
    const cash = Math.max(0, 1 - gross), scale = Math.max(1, gross); // bars show gross exposure; above 100% they are scaled to fit
    const seg = shown.map(([s, w], i) => `<div data-width="${widthStep(Math.abs(w) / scale * 100)}" data-bg="${palette[i % palette.length]}" data-short="${w < 0}" title="${esc(name(s))} ${w < 0 ? 'short ' : ''}${pct(w, 1, false)}">${Math.abs(w) / scale > 0.07 ? `${w < 0 ? '−' : ''}${esc(name(s))}` : ''}</div>`).join('')
      + (rest > 0.001 ? `<div data-width="${widthStep(rest / scale * 100)}" data-bg="#8a96b5" title="others">${rest > 0.07 ? '+' + (pos.length - 6) : ''}</div>` : '')
      + (cash > 0.001 ? `<div class="cash" data-width="${widthStep(cash * 100)}">${cash > 0.1 ? 'CASH' : ''}</div>` : '');
    return `<div class="hold"><div class="hold-top">${avatar(b, 'sm')}<b>${esc(b.short)}</b><span class="num ${cls(a.e / CASH - 1)}">${usd(a.e)}</span></div>
      <div class="stack">${seg}</div>
      <div class="hold-meta"><span>${pos.length} positions</span><span>gross ${pct(gross, 0, false)}</span>${pos.some(([, w]) => w < 0) ? `<span>net ${pct(net, 0)}</span>` : ''}<span>cash ${usd(a.cash)}</span><span>fees ${usd(a.fees)}</span><span>drawdown ${pct(a.dd, 1)}</span>${a.err ? `<span class="down">${a.err} errors</span>` : ''}</div></div>`;
  }).join('');
}

function renderTape(force = false) {
  const box = $('#tape'); if (!box || !R.meta) return;
  const k = Math.min(R.k, R.frames.length - 1), f = R.frames[k]; if (!f) return;
  const items = Object.entries(f.prices).map(([id, p]) => `<span><b>${esc(name(id))}</b>${price(p[3])} <i class="${cls(p[4])}" data-layout="ta-s25">${pct(p[4], 2)}</i></span>`).join('');
  box.innerHTML = items + items; // doubled for a seamless marquee
}

// ---------- live feed ----------
function pushFeed(item) {
  R.feed.push(item);
  const ul = $('#feed'); if (!ul) return;
  const li = document.createElement('li');
  if (item.event) li.className = 'event';
  li.innerHTML = `${item.bot ? avatar(item.bot, 'sm') : `<span class="avatar sm" data-layout="ta-s26" aria-hidden="true">${item.icon || '★'}</span>`}<div><span class="when">${esc(item.when)}</span>${item.html}</div>`;
  ul.prepend(li);
  while (ul.children.length > 60) ul.lastChild.remove();
}

function frameEvents(k) {
  const f = R.frames[k], when = fmtDate(R.meta.timeline[k], R.cfg.tf);
  const fast = R.speed >= 40;
  f.acc.forEach((a, j) => {
    const b = R.bots[j];
    for (const n of a.notes) pushFeed({ bot: b, when, html: `<q>${esc(n)}</q>` });
    if (!fast && a.trades.length && !a.notes.length) {
      const big = [...a.trades].sort((x, y) => y.value - x.value).slice(0, 3);
      const txt = big.map(t => `<span class="${t.side === 'buy' ? 'up' : 'down'}">${t.side === 'buy' ? 'bought' : 'sold'}</span> ${esc(name(t.s))} ${usd(t.value)}`).join(', ');
      pushFeed({ bot: b, when, html: `${esc(b.short)} ${txt}${a.trades.length > 3 ? ` +${a.trades.length - 3} more` : ''}` });
    }
    const ret = a.e / CASH - 1;
    for (const m of [0.25, 0.5, 1, 2, 5, -0.2, -0.4, -0.6]) {
      if (R.milestones[j].has(m)) continue;
      if ((m > 0 && ret >= m) || (m < 0 && ret <= m)) {
        R.milestones[j].add(m);
        pushFeed({ event: true, icon: m > 0 ? '🚀' : '🩸', when, html: `<b>${esc(b.short)}</b> ${m > 0 ? 'is up' : 'is down'} <b class="${cls(m)}">${pct(m, 0)}</b>` });
      }
    }
    if (k > 0) { const ch = a.e / R.frames[k - 1].acc[j].e - 1; if (Math.abs(ch) > (R.cfg.tf === '1d' ? 0.08 : 0.04)) pushFeed({ event: true, icon: ch > 0 ? '⚡' : '💥', when, html: `<b>${esc(b.short)}</b> ${ch > 0 ? 'rockets' : 'tumbles'} <b class="${cls(ch)}">${pct(ch, 1)}</b> in one bar` }); }
    if (a.retired && !R.milestones[j].has('ret')) { R.milestones[j].add('ret'); pushFeed({ event: true, icon: '☠', when, html: `<b>${esc(b.short)}</b> is out: ${esc(a.retired)}` }); }
  });
  if (R.bots.length > 1) {
    const lead = f.acc.reduce((bi, a, j) => (a.e > f.acc[bi].e ? j : bi), 0);
    if (R.leader !== null && lead !== R.leader && Math.abs(f.acc[lead].e - f.acc[R.leader].e) > 1) pushFeed({ event: true, icon: '🏁', when, html: `<b data-ink="${R.bots[lead].color}">${esc(R.bots[lead].short)}</b> takes the lead from ${esc(R.bots[R.leader].short)}` });
    R.leader = lead;
  }
}

// ---------- playback loop ----------
function loop() {
  let last = performance.now();
  const tick = now => {
    if (!$('#racecv')) { R.raf = null; return; }
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (R.meta && R.frames.length) {
      const avail = R.frames.length - 1;
      if (R.playing) R.pos = R.speed === Infinity ? avail : Math.min(avail, R.pos + R.speed * dt);
      const k = Math.floor(R.pos);
      if (R.seeked) { R.seeked = false; R.k = Math.min(k, avail); R.feed = []; $('#feed').innerHTML = ''; R.leader = null; R.milestones = R.bots.map(() => new Set()); for (let j = Math.max(0, R.k - 3); j <= R.k; j++) frameEvents(j); syncAssetChart(true); }
      while (R.k < k) { R.k++; frameEvents(R.k); }
      R.chart.curves = R.bots.map((_, j) => { const cv = R.chart.curves[j]; for (let i = cv.length; i < R.frames.length; i++) cv.push(R.frames[i].acc[j].e); return cv; });
      R.chart.set(R.k, R.speed === Infinity ? 0 : R.pos - Math.floor(R.pos));
      if (now - R.lastUi > 110) {
        R.lastUi = now;
        renderBoard(); renderHoldings(); syncAssetChart();
        if (now - (R.lastTape || 0) > 2000) { R.lastTape = now; renderTape(); }
        const N = R.meta.timeline.length;
        $('#date').textContent = fmtDate(R.meta.timeline[R.k], R.cfg.tf);
        $('#stepno').textContent = `bar ${R.k + 1} / ${N}`;
        const tr = $('#track'); tr.setAttribute('aria-valuemax', N); tr.setAttribute('aria-valuenow', R.k + 1); tr.setAttribute('aria-valuetext', `${fmtDate(R.meta.timeline[R.k], R.cfg.tf)}, bar ${R.k + 1} of ${N}`);
        $('#calc-note').textContent = R.done ? `Computed all ${N} bars · showing bar ${R.k + 1}` : `Computing: ${R.frames.length} of ${N} bars ready · showing bar ${R.k + 1}`;
        $('#track .computed').setAttribute('data-width', widthStep(R.frames.length / N * 100));
        $('#track .played').setAttribute('data-width', widthStep(R.k / Math.max(1, N - 1) * 100));
        $('#track .knob').setAttribute('data-left', widthStep(R.k / Math.max(1, N - 1) * 100));
      }
      if (R.done && R.k >= lastIndex() && !R.shownResults) { R.shownResults = true; R.playing = false; paintPlay(); renderBoard(); renderHoldings(); setTimeout(showResults, 500); }
    }
    R.raf = requestAnimationFrame(tick);
  };
  if (R.raf) cancelAnimationFrame(R.raf);
  R.raf = requestAnimationFrame(tick);
}

// ---------- results ----------
function showResults() {
  if (!R.done || !$('#racecv')) return;
  const st = R.done.stats.map((s, j) => ({ ...s, b: R.bots[j] })).sort((a, b) => b.final - a.final);
  const bench = Object.entries(R.meta.bench).map(([n, c]) => ({ n, ret: c[c.length - 1] / CASH - 1, color: R.roster.benchmarks[n] }));
  const bestBench = bench.reduce((m, b) => (b.ret > m.ret ? b : m), { n: '—', ret: -Infinity });
  const w = st[0], multi = st.length > 1;
  const order = st.length >= 3 ? [st[1], st[0], st[2]] : st.length === 2 ? [st[1], st[0]] : [st[0]];
  const place = s => st.indexOf(s) + 1;
  const headline = multi
    ? (w.totalReturn >= 0 ? `${esc(w.b.name)} finished first` : `${esc(w.b.name)} finished first among the bots, with a loss`)
    : `${esc(w.b.name)} finished ${pct(w.totalReturn)}`;
  const opener = document.activeElement;
  const d = document.createElement('dialog');
  d.className = 'results';
  d.setAttribute('aria-labelledby', 'res-h');
  d.innerHTML = html`
    <form method="dialog"><button class="btn ghost close-x" aria-label="Close results">✕</button></form>
    <div class="eyebrow">Final results · historical simulation · ${esc(title(R.cfg))} · ${R.cfg.start} → ${R.cfg.end}</div>
    <h2 id="res-h" tabindex="-1" data-layout="ta-s27">${headline}</h2>
    <div class="verdict">
      <div><span>Total return</span><b class="${cls(w.totalReturn)}">${pct(w.totalReturn)}</b></div>
      <div><span>vs best benchmark</span><b class="${cls(w.totalReturn - bestBench.ret)}">${pct(w.totalReturn - bestBench.ret)}</b><span data-layout="ta-s28">${esc(bestBench.n)} ${pct(bestBench.ret)}</span></div>
      <div><span>Max drawdown</span><b class="down">${pct(w.maxDrawdown)}</b></div>
      <div><span>Fees paid</span><b>${usd(w.fees)}</b></div>
    </div>
    ${multi ? `<div class="podium" aria-hidden="true">${order.map(s => `<div class="step s${place(s)}">${avatar(s.b, 'lg')}<b>${esc(s.b.short)}</b><div class="ret ${cls(s.totalReturn)}">${pct(s.totalReturn)}</div><div class="block">${place(s)}</div></div>`).join('')}</div>` : ''}
    <div class="table-wrap"><table class="stats"><caption>All bots and buy-and-hold benchmarks over the same bars, after costs. Sharpe and CAGR are annualised; treat them with care on short periods.</caption>
    <thead><tr><th scope="col">Bot</th><th scope="col">Place</th><th scope="col">Final</th><th scope="col">Return</th><th scope="col">Max DD</th><th scope="col">Fees</th><th scope="col">Sharpe</th><th scope="col">Sortino</th><th scope="col">CAGR</th><th scope="col">Trades</th><th scope="col">Win rate (net)</th><th scope="col">Turnover</th><th scope="col">Errors</th></tr></thead><tbody>
    ${st.map(s => `<tr><th scope="row" class="l" data-layout="ta-s15"><span class="dot" data-bg="${s.b.color}"></span> ${esc(s.b.name)}</th><td>${place(s)}</td><td>${usd(s.final)}</td><td class="${cls(s.totalReturn)}">${pct(s.totalReturn)}</td><td class="down">${pct(s.maxDrawdown)}</td><td>${usd(s.fees)}</td><td>${s.sharpe.toFixed(2)}</td><td>${s.sortino.toFixed(2)}</td><td>${pct(s.cagr)}</td><td>${s.trades}</td><td>${pct(s.winRate, 0, false)}</td><td>${s.turnover.toFixed(1)}×</td><td>${s.errors}${s.retired ? ' · ' + esc(s.retired) : ''}</td></tr>`)}
    ${bench.map(b => `<tr class="bench"><th scope="row" class="l" data-layout="ta-s29"><span class="dot" data-bg="${b.color}"></span> ${esc(b.n)}</th><td>—</td><td>${usd(CASH * (1 + b.ret))}</td><td class="${cls(b.ret)}">${pct(b.ret)}</td><td colspan="9" data-layout="ta-s30">buy and hold from the bots’ first fill, same costs</td></tr>`)}
    </tbody></table></div>
    ${R.cfg.blind ? `<div data-layout="ta-s31"><div class="eyebrow">Blind reveal: the bots saw only these aliases</div><div class="reveal">${R.meta.assets.map(a => `<span>${a.id} = <b>${esc(a.symbol)}</b></span>`).join('')}</div></div>` : ''}
    ${R.done.errors.some(Boolean) ? `<p class="muted" data-layout="ta-s2">Last bot errors: ${R.done.errors.map((e, j) => e ? `${esc(R.bots[j].short)}: ${esc(e)}` : '').filter(Boolean).join(' · ')}</p>` : ''}
    <p class="muted" data-layout="ta-s32">First place means best final value among these bots in this period. It is not a measure of the model in general and not investment advice.</p>
    <div data-layout="ta-s33">
      <button class="btn primary" type="button" data-replay>Replay from the start</button>
      <button class="btn" type="button" data-x>Inspect the race</button>
      <a class="btn" href="#/">New race</a>
      <a class="btn" href="#/league">League table</a>
    </div>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => { d.remove(); (opener?.isConnected ? opener : $('#play'))?.focus(); });
  d.addEventListener('click', e => {
    if (e.target === d || e.target.closest('[data-x]')) d.close();
    if (e.target.closest('[data-replay]')) { d.close(); restart(); }
    if (e.target.closest('a')) d.close();
  });
  d.showModal();
  $('#res-h').focus();
  announce(`Race finished. ${headline.replace(/<[^>]+>/g, '')}: ${pct(w.totalReturn)}.`);
  // Celebrate only a profitable result, never when the viewer asked for less motion.
  if (w.totalReturn > 0 && !reducedMotion()) confetti(w.b.color);
}

function announce(text) { const a = $('#announcer'); if (a) { a.textContent = ''; setTimeout(() => { a.textContent = text; }, 30); } }

function confetti(color) {
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = [color, '#ffcc4d', '#22d39b', '#7c8cff', '#ff5470', '#9fd3a8'];
  const ps = Array.from({ length: 160 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 300, y: innerHeight * .35, vx: (Math.random() - .5) * 16, vy: -Math.random() * 16 - 4, r: Math.random() * 6 + 3, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6, va: (Math.random() - .5) * .3 }));
  let t = 0;
  const step = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) { p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
    if (++t < 160) requestAnimationFrame(step); else ctx.clearRect(0, 0, cv.width, cv.height);
  };
  step();
}

function saveHistory() {
  try {
    const hist = JSON.parse(localStorage.getItem('trade-arena:history') || '[]');
    hist.unshift({ at: Date.now(), cfg: R.cfg, stats: R.done.stats.map((s, j) => ({ id: R.bots[j].id, final: s.final, totalReturn: s.totalReturn, sharpe: s.sharpe, maxDrawdown: s.maxDrawdown })) });
    localStorage.setItem('trade-arena:history', JSON.stringify(hist.slice(0, 200)));
  } catch { /* storage unavailable */ }
}
