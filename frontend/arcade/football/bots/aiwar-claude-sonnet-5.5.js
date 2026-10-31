'use strict';
// Claude Sonnet 5.5 football bot
const NAME = 'Sonnet Striker';
function cl(v, l) { return Math.max(-l, Math.min(l, v)); }
function cmp(a, b) {
  if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
  const l = String(a.id), r = String(b.id);
  return l < r ? -1 : l > r ? 1 : 0;
}
// steer toward point with velocity damping
function go(p, tx, ty, kick, gain) {
  const g = gain || 0.1;
  let ax = (tx - p.x) * g - p.vx * 0.9;
  let ay = (ty - p.y) * g - p.vy * 0.9;
  return { x: cl(ax * 10, 1), y: cl(ay * 10, 1), kick: !!kick };
}
function decide(s) {
  try {
    const me = s.you, b = s.ball;
    const T = 3;
    const bx = b.x + b.vx * T, by = b.y + b.vy * T;
    const squad = [me].concat(s.teammates);
    const dist = (p) => Math.hypot(p.x - b.x, p.y - b.y);
    // rank by distance to ball (with id tiebreak)
    const sorted = squad.slice().sort((a, c) => (dist(a) - dist(c)) || cmp(a, c));
    const rank = sorted.findIndex(p => p.id === me.id);
    const n = squad.length;
    const ids = squad.slice().sort(cmp);
    const slot = ids.findIndex(p => p.id === me.id);

    const kickoffBlocked = s.phase === 'kickoff' && s.kickoffTeam !== s.team;

    let role = 'attack';
    if (rank > 0) role = (rank === n - 1) ? 'keeper' : 'support';
    if (role === 'keeper') {
      const d = dist(me);
      if (d < 70 && b.x < -280) return attackAct(s, me, b, bx, by, true);
      return go(me, -385, cl(by * 0.4, 50), false, 0.12);
    }
    if (role === 'support' && b.x < 0) return attackAct(s, me, b, bx, by, false);
    if (role === 'support') {
      return go(me, cl(b.x - 90, 220), cl(-b.y * 0.5, 120), false, 0.1);
    }
    return attackAct(s, me, b, bx, by, false);
  } catch (e) {
    return { x: 0, y: 0, kick: false };
  }
}
function attackAct(s, me, b, bx, by, defensive) {
  let aimY = 0;
  for (const o of s.opponents) { if (o.x > 250 && Math.abs(o.y) < 70) aimY = o.y > 0 ? -30 : 30; }
  let ax = 420 - b.x, ay = aimY - b.y;
  if (defensive) { ax = 1; ay = b.y > 0 ? 0.8 : -0.8; }
  if (!defensive) {
    for (const o of s.opponents) {
      const ox = o.x - b.x, oy = o.y - b.y;
      if (ox > -5 && ox < 70 && Math.abs(oy) < 28 && Math.hypot(b.vx, b.vy) < 1.5) {
        const sd = oy > 3 ? -1 : (oy < -3 ? 1 : (b.y > 0 ? -1 : 1));
        ax = 90; ay = sd * 110; break;
      }
    }
  }
  const L = Math.hypot(ax, ay) || 1;
  const nx = ax / L, ny = ay / L;
  const dx = b.x - me.x, dy = b.y - me.y;
  const d = Math.hypot(dx, dy);
  const ahead = dx * nx + dy * ny;     // ball distance ahead of me along shot line
  const lat = -dx * ny + dy * nx;      // ball lateral offset from me
  const R = Math.max(12, Math.min(45, d * 0.6));
  let tx = bx - nx * R, ty = by - ny * R;
  if (ahead < 0) { // behind-the-wrong-side: swing wide
    const side = lat >= 0 ? -1 : 1;
    tx += -ny * side * 45; ty += nx * side * 45;
  }
  tx = cl(tx, 425); ty = cl(ty, 205);
  const r = go(me, tx, ty, false, 0.3);
  r.kick = d <= 27.5 && ahead > -2;
  return r;
}
module.exports = { name: NAME, botName: NAME, decide: decide };
