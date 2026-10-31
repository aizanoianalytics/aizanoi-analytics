// Shared bar transforms (browser + Node).

/** Stocks have no native 4h bars: aggregate hourly bars into session halves (09:30–13:30, 13:30–16:00 ET). */
export function to4h(h) {
  const out = { ...h, tf: '4h', t: [], o: [], h: [], l: [], c: [], v: [] };
  let key = null, prev = null, n = 0;
  for (let i = 0; i < h.t.length; i++) {
    const day = new Date(h.t[i]).toISOString().slice(0, 10);
    // First four hourly bars of a session form block A, the rest block B.
    n = day === prev ? n + 1 : 0; prev = day;
    const k = `${day}${n < 4 ? 'A' : 'B'}`;
    if (k !== key) { key = k; out.t.push(h.t[i]); out.o.push(h.o[i]); out.h.push(h.h[i]); out.l.push(h.l[i]); out.c.push(h.c[i]); out.v.push(h.v[i]); continue; }
    const j = out.t.length - 1;
    out.h[j] = Math.max(out.h[j], h.h[i]); out.l[j] = Math.min(out.l[j], h.l[i]); out.c[j] = h.c[i]; out.v[j] += h.v[i];
  }
  return out;
}
