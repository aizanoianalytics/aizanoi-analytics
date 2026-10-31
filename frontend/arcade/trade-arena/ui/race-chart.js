// Canvas race chart: equity (as return %) of every bot racing left to right, glowing heads, dashed benchmarks.
import { ok, fmtDate } from './util.js';
import { css } from './theme.js';

export class RaceChart {
  constructor(canvas, { bots, benches, timeline, tf, cash }) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.bots = bots; this.benches = benches; this.timeline = timeline; this.tf = tf; this.cash = cash;
    this.curves = bots.map(() => []); // equity per frame
    this.y = null; this.hover = null; this.k = 0; this.frac = 0;
    this.resize = this.resize.bind(this);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas.parentElement);
    canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); this.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; this.draw(); });
    canvas.addEventListener('mouseleave', () => { this.hover = null; this.draw(); });
    this.resize();
  }
  resize() {
    const r = this.c.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
    this.w = r.width; this.h = r.height; this.c.width = r.width * d; this.c.height = r.height * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0); this.draw(true);
  }
  destroy() { this.observer.disconnect(); }

  set(k, frac = 0) { this.k = k; this.frac = frac; this.draw(); }
  value(curve, k) { const e = curve[k]; return ok(e) ? e / this.cash - 1 : NaN; }
  head(curve) { // interpolated value at k + frac
    const a = this.value(curve, this.k), b = this.value(curve, this.k + 1);
    return ok(b) && this.frac ? a + (b - a) * this.frac : a;
  }
  draw(snap = false) {
    const { ctx, w, h } = this; if (!w) return;
    const C = { text: css('--muted'), ink: css('--text'), grid: css('--grid'), zero: css('--grid-zero'), panel: css('--panel-solid'), line: css('--line2'), up: css('--up'), down: css('--down'), dark: document.documentElement.dataset.theme === 'dark' };
    const pad = { l: 58, r: 150, t: 22, b: 30 };
    const N = this.timeline.length, K = this.k;
    const X = i => pad.l + (i / Math.max(1, N - 1)) * (w - pad.l - pad.r);
    // Target y-range: everything drawn so far, always including 0, with headroom.
    let lo = 0, hi = 0;
    const scan = (curve, upto) => { for (let i = 0; i <= upto; i++) { const v = this.value(curve, i); if (ok(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } } };
    this.curves.forEach(cv => scan(cv, Math.min(K + 1, cv.length - 1)));
    this.benches.forEach(b => scan(b.curve, K + 1));
    const span = Math.max(0.04, hi - lo); lo -= span * 0.12; hi += span * 0.12;
    if (!this.y || snap) this.y = { lo, hi };
    else { this.y.lo += (lo - this.y.lo) * 0.18; this.y.hi += (hi - this.y.hi) * 0.18; }
    const Y = v => pad.t + (1 - (v - this.y.lo) / (this.y.hi - this.y.lo)) * (h - pad.t - pad.b);
    ctx.clearRect(0, 0, w, h);

    // grid
    ctx.font = '11px JetBrains Mono, monospace'; ctx.textBaseline = 'middle';
    const range = this.y.hi - this.y.lo, stepRaw = range / 6, mag = 10 ** Math.floor(Math.log10(stepRaw));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= stepRaw) || stepRaw;
    for (let v = Math.ceil(this.y.lo / step) * step; v <= this.y.hi; v += step) {
      const y = Y(v);
      ctx.strokeStyle = Math.abs(v) < step / 2 ? C.zero : C.grid;
      ctx.lineWidth = 1; ctx.setLineDash(Math.abs(v) < step / 2 ? [] : [2, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r + 10, y); ctx.stroke();
      ctx.fillStyle = C.text; ctx.textAlign = 'right';
      ctx.fillText(`${v > 0 ? '+' : ''}${(v * 100).toFixed(Math.abs(step) < 0.01 ? 1 : 0)}%`, pad.l - 10, y);
    }
    ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.fillStyle = C.text;
    const ticks = Math.min(7, N);
    for (let j = 0; j < ticks; j++) { const i = Math.round(j / Math.max(1, ticks - 1) * (N - 1)); ctx.fillText(fmtDate(this.timeline[i], this.tf === '1d' ? '1d' : '1d'), X(i), h - 12); }

    // finish line
    { const fx = X(N - 1), sq = 6;
      for (let y = pad.t, r = 0; y < h - pad.b; y += sq, r++) for (let c = 0; c < 2; c++) { ctx.fillStyle = (r + c) % 2 ? C.zero : C.grid; ctx.fillRect(fx + c * sq, y, sq, sq); }
      ctx.save(); ctx.translate(fx + 22, pad.t + 4); ctx.rotate(Math.PI / 2); ctx.fillStyle = C.text; ctx.font = '700 10px Inter'; ctx.textAlign = 'left'; ctx.fillText('FINISH', 0, 0); ctx.restore(); }
    // benchmarks (dashed)
    for (const b of this.benches) {
      ctx.strokeStyle = b.color; ctx.globalAlpha = C.dark ? 0.55 : 0.8; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
      ctx.beginPath();
      for (let i = 0; i <= Math.min(K, N - 1); i++) { const v = this.value(b.curve, i); if (!ok(v)) continue; i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // bots
    const heads = [];
    this.bots.forEach((b, j) => {
      const cv = this.curves[j]; if (!cv.length) return;
      const upto = Math.min(K, cv.length - 1);
      const hv = this.head(cv), hx = X(Math.min(K + this.frac, N - 1));
      // area under the leader-ish line, faint
      const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
      grad.addColorStop(0, b.color + '14'); grad.addColorStop(1, b.color + '00');
      ctx.beginPath(); ctx.moveTo(X(0), Y(0));
      for (let i = 0; i <= upto; i++) ctx.lineTo(X(i), Y(this.value(cv, i)));
      ctx.lineTo(hx, Y(hv)); ctx.lineTo(hx, Y(0)); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      ctx.save(); ctx.shadowColor = b.color; ctx.shadowBlur = C.dark ? 14 : 0; ctx.strokeStyle = b.color; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= upto; i++) { const v = this.value(cv, i); i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); }
      ctx.lineTo(hx, Y(hv)); ctx.stroke(); ctx.restore();
      heads.push({ b, x: hx, y: Y(hv), v: hv });
    });
    // benchmark labels at their heads
    for (const b of this.benches) {
      const v = this.value(b.curve, Math.min(K, N - 1)); if (!ok(v)) continue;
      heads.push({ b: { ...b, bench: true }, x: X(Math.min(K, N - 1)), y: Y(v), v });
    }
    // de-overlap labels vertically
    heads.sort((a, b) => a.y - b.y);
    for (let i = 1; i < heads.length; i++) if (heads[i].ly === undefined) heads[i].ly = heads[i].y;
    let lastY = -1e9;
    for (const hd of heads) { hd.ly = Math.max(hd.y, lastY + 24); lastY = hd.ly; }
    const over = lastY - (h - pad.b); if (over > 0) for (const hd of heads) hd.ly -= over;
    for (const { b, x, y, ly, v } of heads) {
      ctx.fillStyle = b.color;
      if (b.bench) { ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
      else {
        ctx.save(); ctx.shadowColor = b.color; ctx.shadowBlur = C.dark ? 20 : 0; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fillStyle = C.panel; ctx.fill(); ctx.fillStyle = b.color;
      }
      // label pill
      const label = `${b.bench ? b.name : b.short || b.name}  ${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
      ctx.font = `${b.bench ? 600 : 700} ${b.bench ? 11 : 12}px Inter, sans-serif`;
      const tw = ctx.measureText(label).width + 16, lx = x + 12;
      ctx.globalAlpha = b.bench ? .7 : 1;
      ctx.fillStyle = b.bench ? C.panel : b.color;
      roundRect(ctx, lx, ly - 10, tw, 20, 6); ctx.fill();
      if (b.bench) { ctx.strokeStyle = b.color; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = b.bench ? b.color : (C.dark ? '#05070d' : '#ffffff'); ctx.textAlign = 'left'; ctx.fillText(label, lx + 8, ly + 0.5);
      if (Math.abs(ly - y) > 2) { ctx.strokeStyle = b.color; ctx.globalAlpha = .4; ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(lx, ly); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // hover crosshair
    if (this.hover && this.hover.x > pad.l && this.hover.x < w - pad.r) {
      const i = Math.max(0, Math.min(K, Math.round((this.hover.x - pad.l) / (w - pad.l - pad.r) * (N - 1))));
      const x = X(i);
      ctx.strokeStyle = C.zero; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
      const rows = [...this.bots.map((b, j) => [b.short || b.name, b.color, this.value(this.curves[j], i)]), ...this.benches.map(b => [b.name, b.color, this.value(b.curve, i)])].filter(r => ok(r[2])).sort((a, b) => b[2] - a[2]);
      const bw = 190, bh = 26 + rows.length * 18, bx = Math.min(x + 12, w - bw - 8), by = pad.t + 4;
      ctx.fillStyle = C.panel; ctx.strokeStyle = C.line; roundRect(ctx, bx, by, bw, bh, 9); ctx.fill(); ctx.stroke();
      ctx.font = '600 11px JetBrains Mono'; ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(fmtDate(this.timeline[i], this.tf), bx + 10, by + 13);
      rows.forEach(([n, c, v], r) => {
        const yy = by + 32 + r * 18; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(bx + 14, yy, 4, 0, 7); ctx.fill();
        ctx.fillStyle = C.ink; ctx.font = '12px Inter'; ctx.fillText(n, bx + 24, yy);
        ctx.textAlign = 'right'; ctx.font = '600 12px JetBrains Mono'; ctx.fillStyle = v >= 0 ? C.up : C.down;
        ctx.fillText(`${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}%`, bx + bw - 10, yy); ctx.textAlign = 'left';
      });
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
