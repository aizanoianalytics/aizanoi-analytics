// Market data explorer: every series in data/raw with candles, overlays, oscillators and all computed features.
import { $, $$, esc, html, pct, price, compact, cls, sparkline, fmtDate, ok, BASE } from './util.js';
import { computeFeatures, FEATURE_GROUPS, FEATURE_NAMES } from '../engine/features.js';
import { to4h } from '../engine/bars.js';
import { css } from './theme.js';

const OVERLAYS = {
  sma20: ['SMA 20', '#ffcc4d'], sma50: ['SMA 50', '#7c8cff'], sma200: ['SMA 200', '#ff8a4c'], ema21: ['EMA 21', '#2ee6d6'],
  bb: ['Bollinger', '#b18cff'], kc: ['Keltner', '#5aa9ff'], ichimoku: ['Ichimoku', '#22d39b'], psar: ['Parabolic SAR', '#e8edf9'],
  supertrend: ['Supertrend', '#ff5470'], donch: ['Donchian 20', '#8b97b8'], vwap20: ['VWAP 20', '#f78fb3'],
};
const LIGHT_OV = { sma20: '#a87400', sma50: '#4f60ca', sma200: '#c8561d', ema21: '#0b8a80', bb: '#6d4bd8', kc: '#3158c7', ichimoku: '#087c62', psar: '#182334', supertrend: '#c2415b', donch: '#607084', vwap20: '#b0407a' };
const ovColor = k => (document.documentElement.dataset.theme === 'light' ? LIGHT_OV[k] : OVERLAYS[k][1]);
const OSCS = { rsi14: 'RSI 14', macd: 'MACD', stoch: 'Stochastic', adx: 'ADX / DI', mfi14: 'MFI 14', cci20: 'CCI 20', obv: 'OBV', vol20: 'Volatility', drawdown: 'Drawdown', takerBuyRatio20: 'Taker buy %', funding: 'Funding rate' };
const S = { market: 'crypto', sym: 'BTC', tf: '1d', overlays: new Set(['sma50', 'sma200']), osc: 'rsi14', group: 'Returns & candle', q: '', range: 'ALL' };

let cleanup = () => {};
export function releaseData() { cleanup(); cleanup = () => {}; }
addEventListener('pagehide', releaseData);
export function renderData(view, catalog) {
  releaseData();
  view.innerHTML = html`
  <div class="explorer">
    <aside class="panel alist">
      <div class="tools">
        <div class="seg" id="mk">${['crypto', 'stocks', 'context'].map(m => `<button data-v="${m}" class="${S.market === m ? 'on' : ''}">${m === 'context' ? 'macro' : m}</button>`).join('')}</div>
        <label for="q" class="sr-only">Search assets</label><input type="search" id="q" placeholder="Search symbol or name" value="${esc(S.q)}" aria-describedby="q-count">
        <span class="count" id="q-count" role="status"></span>
      </div>
      <ul id="alist" aria-label="Assets"></ul>
    </aside>
    <section data-layout="ta-s34">
      <div class="panel"><div class="ahead" id="ahead"></div>
        <div class="overlays" id="tfs"></div>
        <div class="overlays" id="ovl">${Object.entries(OVERLAYS).map(([k, [n, c]]) => `<button type="button" data-k="${k}" data-color="${ovColor(k)}" aria-pressed="${S.overlays.has(k)}">${n}</button>`).join('')}</div>
        <div class="pchart" id="pchart"></div>
        <div class="overlays" id="osc" data-layout="ta-s35">${Object.entries(OSCS).map(([k, n]) => `<button type="button" data-k="${k}" aria-pressed="${S.osc === k}">${n}</button>`).join('')}</div>
        <div class="ochart" id="ochart"></div>
        <div class="kpis" id="kpis"></div>
      </div>
      <div class="panel"><div class="panel-h"><h3>All signals at <span id="fat" class="num" data-layout="ta-s10"></span></h3>
        <div data-layout="ta-s36"><button type="button" class="btn" id="dl-ohlcv">⤓ OHLCV CSV</button><button class="btn" id="dl-feat">⤓ Features CSV</button></div></div>
        <div class="ftabs seg" id="ftabs" data-layout="ta-s37">${Object.keys(FEATURE_GROUPS).map(g => `<button data-g="${esc(g)}" class="${S.group === g ? 'on' : ''}">${esc(g)}</button>`).join('')}</div>
        <div class="fgrid" id="fgrid"></div>
      </div>
    </section>
  </div>`;

  const abort = new AbortController();
  let pc = null, oc = null;
  cleanup = () => { req++; abort.abort(); pc?.remove(); oc?.remove(); pc = oc = null; };
  let req = 0; // request token: only the latest selection may render
  const list = () => {
    const rows = catalog[S.market].filter(a => !S.q || (a.symbol + ' ' + a.name).toLowerCase().includes(S.q.toLowerCase()));
    $('#alist').innerHTML = rows.map(a => `<li><button type="button" data-s="${a.symbol}" aria-current="${a.symbol === S.sym}" aria-label="${esc(a.symbol)}, ${esc(a.name)}, last ${price(a.series['1d']?.lastClose)}, ${pct(a.change1d, 2)}"><span><b>${esc(a.symbol)}</b><span>${esc(a.name)}</span></span><span aria-hidden="true">${sparkline(a.spark || [])}</span><span class="chg" aria-hidden="true"><span class="num" data-layout="ta-s38">${price(a.series['1d']?.lastClose)}</span><span class="${cls(a.change1d)}" data-layout="ta-s39">${pct(a.change1d, 2)}</span></span></button></li>`).join('')
      || `<li class="muted" data-layout="ta-s40">No ${S.market === 'context' ? 'macro series' : S.market} match “${esc(S.q)}”. <button type="button" class="btn sm" id="q-clear">Clear search</button></li>`;
    $('#q-count').textContent = S.q ? `${rows.length} of ${catalog[S.market].length} shown` : `${rows.length} assets`;
    $('#q-clear')?.addEventListener('click', () => { S.q = ''; $('#q').value = ''; list(); $('#q').focus(); });
  };
  $('#mk').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.market = b.dataset.v; S.sym = catalog[S.market][0].symbol; S.tf = '1d'; $$('#mk button').forEach(x => x.classList.toggle('on', x === b)); list(); load(); };
  $('#q').oninput = e => { S.q = e.target.value; list(); };
  $('#alist').onclick = e => { const btn = e.target.closest('button[data-s]'); if (!btn) return; S.sym = btn.dataset.s; $$('#alist button[data-s]').forEach(x => x.setAttribute('aria-current', String(x === btn))); load(); };
  $('#ovl').onclick = e => { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.k; S.overlays.has(k) ? S.overlays.delete(k) : S.overlays.add(k); b.setAttribute('aria-pressed', String(S.overlays.has(k))); draw(); };
  $('#osc').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.osc = b.dataset.k; $$('#osc button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); };
  $('#ftabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.group = b.dataset.g; $$('#ftabs button').forEach(x => x.classList.toggle('on', x === b)); showFeatures(S.at); };
  $('#dl-ohlcv').onclick = () => download('ohlcv');
  $('#dl-feat').onclick = () => download('features');
  list();
  load();

  let D = null; // { raw, F, meta, funding }
  async function load() {
    const my = ++req;
    const meta = catalog[S.market].find(a => a.symbol === S.sym);
    const tfs = Object.keys(meta.series).filter(t => t !== 'funding');
    if (S.market === 'stocks') tfs.splice(1, 0, '4h');
    if (!tfs.includes(S.tf)) S.tf = '1d';
    $('#tfs').innerHTML = `<span class="sr-only">Bar size</span>` + tfs.map(t => `<button type="button" data-t="${t}" aria-pressed="${S.tf === t}">${t}</button>`).join('') + `<span data-layout="ta-s41" aria-hidden="true"></span><span class="sr-only">Visible range</span>` + ['3M', '1Y', '3Y', 'ALL'].map(r => `<button type="button" data-r="${r}" aria-pressed="${S.range === r}">${r}</button>`).join('');
    $('#tfs').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.t) { S.tf = b.dataset.t; load(); } else { S.range = b.dataset.r; $$('#tfs [data-r]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); fitRange(); } };
    $('#ahead').innerHTML = `<div class="loader" data-layout="ta-s42"><div class="ring" data-layout="ta-s43"></div>Loading ${esc(S.sym)} ${S.tf}…</div>`;
    const file = S.market === 'stocks' && S.tf === '4h' ? '1h' : S.tf;
    let raw, funding;
    try {
      raw = await fetch(new URL(`data/raw/${S.market}/${file}/${S.sym}.json`, BASE), { signal: abort.signal }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
      if (S.tf === '4h' && S.market === 'stocks') raw = to4h(raw);
      funding = S.market === 'crypto' ? await fetch(new URL(`data/raw/crypto/funding/${S.sym}.json`, BASE), { signal: abort.signal }).then(r => (r.ok ? r.json() : null)).catch(() => null) : null;
    } catch (err) {
      if (my !== req) return;
      $('#ahead').innerHTML = `<div class="notice err" role="alert"><span><b>${esc(S.sym)} ${S.tf} did not load</b> (${esc(err.message)}). The previous chart is not shown to avoid confusion. <button type="button" class="btn sm" id="reload">Try again</button></span></div>`;
      $('#pchart').innerHTML = ''; $('#ochart').innerHTML = ''; $('#kpis').innerHTML = '';
      $('#reload').onclick = load;
      return;
    }
    if (my !== req) return; // a newer selection is already loading
    const F = computeFeatures(raw, S.tf, S.market === 'crypto' ? 'crypto' : 'stocks');
    D = { raw, F, meta, funding };
    const n = raw.t.length, last = n - 1;
    $('#ahead').innerHTML = `<div><div class="eyebrow">${esc(meta.sector || S.market)} · ${esc(raw.source || '')}</div><h2>${esc(S.sym)} <span class="muted" data-layout="ta-s44">${esc(meta.name)}</span></h2></div>
      <div class="px">${price(raw.c[last])}</div><div class="num ${cls(F.ret1[last])}" data-layout="ta-s24">${pct(F.ret1[last], 2)} <span class="faint">last bar</span></div>
      <div data-layout="ta-s45" class="muted num">${n.toLocaleString('en-US')} bars · ${fmtDate(raw.t[0])} → ${fmtDate(raw.t[last], S.tf)}</div>`;
    const k = (x, d = 1) => pct(x, d);
    $('#kpis').innerHTML = [['20-bar', k(F.ret20[last])], ['1-year', k(F.ret250[last])], ['Vol (ann.)', pct(F.vol20[last], 0, false)], ['RSI 14', ok(F.rsi14[last]) ? F.rsi14[last].toFixed(1) : '—'], ['From ATH', k(F.drawdown[last])], ['Trend', F.supertrendDir[last] > 0 ? '<span class="up">▲ up</span>' : '<span class="down">▼ down</span>']]
      .map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    draw(true);
  }

  function draw(reset = false) {
    if (!D) return;
    const { raw, F } = D, t = raw.t.map(x => x / 1000);
    const UP = css('--up'), DOWN = css('--down');
    const opts = { autoSize: true, localization: { locale: 'en-US' }, layout: { attributionLogo: false, background: { color: 'transparent' }, textColor: css('--muted'), fontFamily: 'JetBrains Mono' },
      grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } }, rightPriceScale: { borderColor: css('--line'), minimumWidth: 80 },
      timeScale: { borderColor: css('--line'), timeVisible: S.tf !== '1d', minBarSpacing: 0.02 }, crosshair: { mode: 1 } };
    const keepRange = !reset && pc ? pc.timeScale().getVisibleLogicalRange() : null;
    pc?.remove(); oc?.remove();
    $('#pchart').innerHTML = ''; $('#ochart').innerHTML = '';
    pc = LightweightCharts.createChart($('#pchart'), opts);
    oc = LightweightCharts.createChart($('#ochart'), { ...opts, timeScale: { ...opts.timeScale, visible: true } });
    const cs = pc.addCandlestickSeries({ upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false });
    cs.setData(t.map((x, i) => ({ time: x, open: raw.o[i], high: raw.h[i], low: raw.l[i], close: raw.c[i] })));
    const vs = pc.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } });
    pc.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vs.setData(t.map((x, i) => ({ time: x, value: raw.v[i], color: (raw.c[i] >= raw.o[i] ? UP : DOWN) + '59' })));
    const line = (chart, arr, color, extra = {}) => { const s = chart.addLineSeries({ color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra }); s.setData(t.map((x, i) => (ok(arr[i]) ? { time: x, value: arr[i] } : { time: x }))); return s; };
    const ov = S.overlays;
    for (const k of ['sma20', 'sma50', 'sma200', 'ema21', 'vwap20']) if (ov.has(k)) line(pc, F[k], ovColor(k));
    if (ov.has('bb')) { line(pc, F.bbUpper, '#b18cff'); line(pc, F.bbLower, '#b18cff'); line(pc, F.bbMid, 'rgba(177,140,255,.5)', { lineStyle: 2 }); }
    if (ov.has('kc')) { line(pc, F.kcUpper, '#5aa9ff', { lineStyle: 2 }); line(pc, F.kcLower, '#5aa9ff', { lineStyle: 2 }); }
    if (ov.has('donch')) { line(pc, F.donchHigh20, '#8b97b8', { lineStyle: 1 }); line(pc, F.donchLow20, '#8b97b8', { lineStyle: 1 }); }
    if (ov.has('ichimoku')) { line(pc, F.tenkan, '#5aa9ff', { lineWidth: 1 }); line(pc, F.kijun, '#ff5470', { lineWidth: 1 }); line(pc, F.senkouA, 'rgba(34,211,155,.8)'); line(pc, F.senkouB, 'rgba(255,84,112,.8)'); }
    if (ov.has('psar')) line(pc, F.psar, ovColor('psar'), { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.5 });
    if (ov.has('supertrend')) {
      const upL = F.supertrend.map((v, i) => (F.supertrendDir[i] > 0 ? v : NaN)), dnL = F.supertrend.map((v, i) => (F.supertrendDir[i] < 0 ? v : NaN));
      line(pc, upL, '#22d39b', { lineWidth: 2 }); line(pc, dnL, '#ff5470', { lineWidth: 2 });
    }
    // oscillator pane
    const o = S.osc, lvl = (v, c = 'rgba(139,151,184,.5)') => ({ price: v, color: c, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
    if (o === 'rsi14') { const s = line(oc, F.rsi14, '#7c8cff', { lastValueVisible: true }); s.createPriceLine(lvl(70)); s.createPriceLine(lvl(30)); }
    else if (o === 'macd') { const h = oc.addHistogramSeries({ priceLineVisible: false }); h.setData(t.map((x, i) => (ok(F.macdHist[i]) ? { time: x, value: F.macdHist[i], color: F.macdHist[i] >= 0 ? 'rgba(34,211,155,.6)' : 'rgba(255,84,112,.6)' } : { time: x }))); line(oc, F.macd, '#5aa9ff'); line(oc, F.macdSignal, '#ffcc4d'); }
    else if (o === 'stoch') { const s = line(oc, F.stochK14, '#2ee6d6'); line(oc, F.stochD3, '#ff8a4c'); s.createPriceLine(lvl(80)); s.createPriceLine(lvl(20)); }
    else if (o === 'adx') { line(oc, F.adx14, '#e8edf9', { lineWidth: 2 }); line(oc, F.plusDI14, '#22d39b'); line(oc, F.minusDI14, '#ff5470'); }
    else if (o === 'mfi14') { const s = line(oc, F.mfi14, '#f78fb3'); s.createPriceLine(lvl(80)); s.createPriceLine(lvl(20)); }
    else if (o === 'cci20') { const s = line(oc, F.cci20, '#ffcc4d'); s.createPriceLine(lvl(100)); s.createPriceLine(lvl(-100)); }
    else if (o === 'obv') line(oc, F.obv, '#5aa9ff');
    else if (o === 'vol20') { line(oc, F.vol20, '#ff8a4c'); line(oc, F.parkinson20, '#7c8cff'); }
    else if (o === 'drawdown') { const a = oc.addAreaSeries({ lineColor: '#ff5470', topColor: 'rgba(255,84,112,.05)', bottomColor: 'rgba(255,84,112,.35)', lineWidth: 1.5, priceLineVisible: false }); a.setData(t.map((x, i) => ({ time: x, value: F.drawdown[i] * 100 }))); }
    else if (o === 'takerBuyRatio20') { const s = line(oc, F.takerBuyRatio20, '#22d39b'); s.createPriceLine(lvl(0.5)); }
    else if (o === 'funding') {
      const f = D.funding;
      if (f) { const h = oc.addHistogramSeries({ priceLineVisible: false, priceFormat: { type: 'percent', precision: 3 } }); h.setData(f.t.map((x, i) => ({ time: Math.floor(x / 1000), value: f.rate[i] * 100, color: f.rate[i] >= 0 ? 'rgba(34,211,155,.6)' : 'rgba(255,84,112,.6)' }))); }
    }
    // sync crosshair & range between panes
    let syncing = false;
    pc.timeScale().subscribeVisibleLogicalRangeChange(r => { if (syncing || !r) return; syncing = true; oc.timeScale().setVisibleLogicalRange(r); syncing = false; });
    oc.timeScale().subscribeVisibleLogicalRangeChange(r => { if (syncing || !r) return; syncing = true; pc.timeScale().setVisibleLogicalRange(r); syncing = false; });
    const idx = new Map(t.map((x, i) => [x, i]));
    pc.subscribeCrosshairMove(p => { const i = p.time ? idx.get(p.time) : undefined; showFeatures(i ?? t.length - 1); });
    setTimeout(() => { if (keepRange) pc.timeScale().setVisibleLogicalRange(keepRange); else fitRange(); }, 0);
    showFeatures(t.length - 1);
  }

  function fitRange() {
    if (!pc || !D) return;
    const n = D.raw.t.length, per = { '1d': 1, '4h': 6, '1h': 24 }[S.tf] * (S.market === 'stocks' ? 0.69 : 1);
    const days = { '3M': 91, '1Y': 365, '3Y': 1095 }[S.range];
    if (!days) { pc.timeScale().fitContent(); return; }
    pc.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - days * per), to: n + 2 });
  }

  function showFeatures(i) {
    if (!D || i === undefined || !document.getElementById('fat')) return; // chart events can outlive the page
    S.at = i;
    $('#fat').textContent = `${S.sym} · ${fmtDate(D.raw.t[i], S.tf)}`;
    const g = FEATURE_GROUPS[S.group];
    const fmt = (k, v) => {
      if (!ok(v)) return '<span class="faint">warming up</span>';
      if (/^(ret|logRet|gap|range|body|upperWick|lowerWick|dist|sma50over|sma20slope|roc|mom|atrPct|bbWidth|vol\d|parkinson|garman|drawdown|maxRet|minRet)/.test(k)) return `<span class="${cls(v)}">${pct(v, 2)}</span>`;
      if (/^(volume|dollarVolume|volSma|obv|adLine|vpt|trades)/.test(k)) return compact(v);
      if (Math.abs(v) >= 1000) return price(v);
      return Math.abs(v) < 0.01 && v !== 0 ? v.toExponential(2) : (+v.toFixed(Math.abs(v) < 10 ? 4 : 2)).toString();
    };
    $('#fgrid').innerHTML = Object.entries(g).map(([k, desc]) => `<div><span>${esc(k)}<dfn>${esc(desc)}</dfn></span><b>${fmt(k, D.F[k][i])}</b></div>`).join('');
  }

  function download(kind) {
    if (!D) return;
    const { raw, F } = D, n = raw.t.length;
    const iso = t => new Date(t).toISOString().slice(0, S.tf === '1d' ? 10 : 16).replace('T', ' ');
    let head, rows;
    if (kind === 'ohlcv') {
      const extra = ['qv', 'n', 'tb', 'tq', 'rawClose'].filter(k => raw[k]?.length === n);
      head = ['time', 'open', 'high', 'low', 'close', 'volume', ...extra];
      rows = raw.t.map((t, i) => [iso(t), raw.o[i], raw.h[i], raw.l[i], raw.c[i], raw.v[i], ...extra.map(k => raw[k][i])]);
    } else {
      head = ['time', 'close', ...FEATURE_NAMES];
      rows = raw.t.map((t, i) => [iso(t), raw.c[i], ...FEATURE_NAMES.map(k => (ok(F[k][i]) ? +F[k][i].toPrecision(8) : ''))]);
    }
    const blob = new Blob([[head.join(','), ...rows.map(r => r.join(','))].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${S.sym}-${S.tf}-${kind}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}
