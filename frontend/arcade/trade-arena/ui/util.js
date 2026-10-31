export const ok = Number.isFinite;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => out + s + (i < vals.length ? (Array.isArray(vals[i]) ? vals[i].join('') : vals[i] ?? '') : ''), '');
}

export const pct = (x, d = 1, sign = true) => (ok(x) ? `${sign && x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(d)}%` : '—');
export const usd = (x, d = 0) => (ok(x) ? `${x < 0 ? '−' : ''}$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}` : '—');
export const compact = x => {
  if (!ok(x)) return '—';
  const a = Math.abs(x);
  for (const [v, s] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) if (a >= v) return `${(x / v).toFixed(a >= v * 100 ? 0 : 1)}${s}`;
  return x.toFixed(a < 10 ? 2 : 0);
};
export const price = x => {
  if (!ok(x)) return '—';
  const a = Math.abs(x), d = a >= 1000 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
  return x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const cls = x => (x > 0 ? 'up' : x < 0 ? 'down' : '');
export const fmtDate = (t, tf = '1d') => {
  if (!ok(t)) return '';
  const d = new Date(t);
  const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return tf === '1d' ? day : `${day} ${d.toISOString().slice(11, 16)}`;
};

export function sparkline(values, w = 74, h = 24, color = null) {
  const v = values.filter(ok);
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (x - lo) / r * (h - 4)).toFixed(1)}`).join(' ');
  const c = color || (v[v.length - 1] >= v[0] ? 'var(--up)' : 'var(--down)');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

export const avatar = (b, size = '') => `<span class="avatar ${size}" data-color="${b.color}">${esc(b.initials || b.name?.slice(0, 2))}</span>`;

// App root (the folder that holds ui/, engine/, bots/, data/) so the app works from any sub-path.
export const BASE = new URL('../', import.meta.url).href;
export async function getJSON(url) { const r = await fetch(new URL(url.replace(/^\//, ''), BASE)); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }

export const PRESETS = [
  { id: 'crypto-season', icon: '₿', title: 'Crypto Season', desc: 'All 35 crypto assets of the Markets tab, every day since January 2025.', market: 'crypto', tf: '1d', start: '2025-01-01', end: '2026-10-30', oos: true },
  { id: 'wall-street', icon: '🏛', title: 'Wall Street', desc: '30 US mega-caps from NVIDIA to Coca-Cola. Daily bars since January 2025.', market: 'stocks', tf: '1d', start: '2025-01-01', end: '2026-10-30', oos: true },
  { id: 'blind-gauntlet', icon: '🕶', title: 'Blind Gauntlet', desc: 'Crypto and stocks together; the bots see aliases instead of names and no dates.', market: 'mixed', tf: '1d', start: '2025-01-01', end: '2026-10-30', blind: true, oos: true },
  { id: 'sprint-4h', icon: '⚡', title: '4-Hour Sprint', desc: 'Crypto on 4-hour bars over the last six months. More decisions, more fees.', market: 'crypto', tf: '4h', start: '2026-05-01', end: '2026-10-30', oos: true },
  { id: 'hourly-duel', icon: '⏱', title: 'Hourly Duel', desc: 'Two months of hourly crypto bars. A scalper’s nightmare.', market: 'crypto', tf: '1h', start: '2026-09-01', end: '2026-10-30', oos: true },
  { id: 'crypto-winter', icon: '❄', title: 'Crypto Winter 2022', desc: 'LUNA, FTX and a −75% bear market. Survival mode. (Inside the data the bots were written with.)', market: 'crypto', tf: '1d', start: '2022-01-01', end: '2022-12-31', oos: false },
  { id: 'covid', icon: '🦠', title: 'Covid Crash 2020', desc: 'March 2020 crash and the liquidity rally that followed. Stocks and crypto, blind.', market: 'mixed', tf: '1d', start: '2020-01-01', end: '2020-12-31', blind: true, oos: false },
];
