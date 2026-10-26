// Snake Royale engine core (Battlesnake-style rules + shrinking storm). Pure and deterministic given (ids, seed, options).
// Same rules and RNG order as the original benchmark engine, so a replay with the same seed matches the video series.
// No eval, no DOM: runs in the page, in a worker and in Node (tests).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SnakeEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DEFAULTS = { width: 11, height: 11, seed: 1, maxTurns: 600, shrinkStart: 150, shrinkEvery: 20,
    minFood: 1, foodChance: 0.15, startHealth: 100 };

  function create(ids, options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const R = rng(o.seed), W = o.width, H = o.height, n = ids.length;
    const cx = (W - 1) / 2, cy = (H - 1) / 2, rad = Math.min(W, H) / 2 - 2;
    const phase = R() * Math.PI * 2;
    const snakes = ids.map((id, i) => {
      const a = phase + (i / n) * Math.PI * 2;
      const x = Math.round(cx + rad * Math.cos(a)), y = Math.round(cy + rad * Math.sin(a));
      return { id, name: id, body: [[x, y], [x, y], [x, y]], health: o.startHealth, alive: true, death: null, kills: 0, eaten: 0, errors: 0 };
    });
    let food = [], hazardRing = 0, turn = 0;
    const inHazard = (x, y) => x < hazardRing || y < hazardRing || x >= W - hazardRing || y >= H - hazardRing;

    function spawnFood(force) {
      const occ = new Set();
      snakes.forEach(s => s.alive && s.body.forEach(([x, y]) => occ.add(x + ',' + y)));
      food.forEach(([x, y]) => occ.add(x + ',' + y));
      const free = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!occ.has(x + ',' + y) && !inHazard(x, y)) free.push([x, y]);
      const roll = R(), pick = R();
      if (free.length && (force || roll < o.foodChance)) food.push(free[Math.floor(pick * free.length)]);
    }
    snakes.forEach(sn => {
      const [x, y] = sn.body[0];
      const c = [[x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H);
      const f = c[Math.floor(R() * c.length)];
      if (f && !food.some(([a, b]) => a === f[0] && b === f[1])) food.push(f);
    });
    const centre = [Math.floor(cx), Math.floor(cy)];
    if (!snakes.some(s => s.body[0][0] === centre[0] && s.body[0][1] === centre[1])) food.push(centre);

    const lastDir = {};
    const alive = () => snakes.filter(s => s.alive);
    const finished = () => turn >= o.maxTurns || alive().length <= (n > 1 ? 1 : 0);
    const nextShrinkFor = t => t <= o.shrinkStart ? o.shrinkStart : o.shrinkStart + Math.ceil((t - o.shrinkStart) / o.shrinkEvery) * o.shrinkEvery;

    // The state object every bot receives for the coming turn (fresh copy per bot, bots may mutate it).
    function botState(id) {
      const t = turn + 1;
      const pub = alive().map(s => ({ id: s.id, name: s.name, head: { x: s.body[0][0], y: s.body[0][1] },
        body: s.body.map(([x, y]) => ({ x, y })), length: s.body.length, health: s.health }));
      const hz = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inHazard(x, y)) hz.push({ x, y });
      return { turn: t, width: W, height: H, you: pub.find(p => p.id === id), snakes: pub,
        food: food.map(([x, y]) => ({ x, y })), hazards: hz, nextShrinkTurn: nextShrinkFor(t) };
    }

    // moves: { id: 'up'|'down'|'left'|'right'|null }. null/invalid = bot error, snake keeps its last direction.
    function step(moves) {
      turn++;
      const events = [];
      const mv = {};
      alive().forEach(s => {
        let m = moves[s.id];
        if (typeof m === 'string') m = m.toLowerCase().trim();
        if (!Object.prototype.hasOwnProperty.call(DIRS, m)) {
          s.errors++; events.push({ type: 'error', id: s.id });
          m = lastDir[s.id] || 'up';
        }
        mv[s.id] = m; lastDir[s.id] = m;
      });
      alive().forEach(s => {
        const [dx, dy] = DIRS[mv[s.id]];
        s.body.unshift([s.body[0][0] + dx, s.body[0][1] + dy]);
        s.health -= 1;
      });
      const eaten = new Set();
      alive().forEach(s => {
        const [hx, hy] = s.body[0];
        const fi = food.findIndex(([x, y]) => x === hx && y === hy);
        if (fi >= 0) { s.health = o.startHealth; s.eaten++; eaten.add(fi); events.push({ type: 'eat', id: s.id }); }
        else s.body.pop();
      });
      food = food.filter((_, i) => !eaten.has(i));

      const dead = [];
      alive().forEach(s => {
        const [hx, hy] = s.body[0];
        let cause = null, by = null;
        if (hx < 0 || hy < 0 || hx >= W || hy >= H) cause = 'wall';
        else if (inHazard(hx, hy)) cause = 'storm';
        else if (s.health <= 0) cause = 'starved';
        if (!cause) for (const t of snakes) {
          if (!t.alive) continue;
          for (let k = 1; k < t.body.length; k++) if (t.body[k][0] === hx && t.body[k][1] === hy) {
            cause = t.id === s.id ? 'self' : 'body'; by = t.id === s.id ? null : t.id; break;
          }
          if (cause) break;
        }
        if (!cause) for (const t of snakes) {
          if (!t.alive || t.id === s.id) continue;
          if (t.body[0][0] === hx && t.body[0][1] === hy && t.body.length >= s.body.length) { cause = 'head-on'; by = t.id; break; }
        }
        if (cause) dead.push({ s, cause, by });
      });
      dead.forEach(({ s, cause, by }) => {
        s.alive = false; s.death = { turn, cause, by };
        if (by) { const k = snakes.find(t => t.id === by); if (k) k.kills++; }
        events.push({ type: 'death', id: s.id, cause, by });
      });
      if (turn >= o.shrinkStart && (turn - o.shrinkStart) % o.shrinkEvery === 0 && hazardRing < Math.floor(Math.min(W, H) / 2) - 1) {
        hazardRing++;
        food = food.filter(([x, y]) => !inHazard(x, y));
        events.push({ type: 'shrink', ring: hazardRing });
      }
      if (food.length < o.minFood) spawnFood(true); else spawnFood(false);
      return events;
    }

    function placements() {
      const order = snakes.slice().sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        const ta = a.death ? a.death.turn : Infinity, tb = b.death ? b.death.turn : Infinity;
        if (ta !== tb) return tb - ta;
        return b.body.length - a.body.length;
      });
      let place = 0, prev = null;
      return order.map((s, i) => {
        const key = s.alive ? 'alive' : s.death.turn + ':' + s.body.length;
        if (key !== prev) place = i + 1;
        prev = key;
        return { id: s.id, place, alive: s.alive, length: s.body.length, kills: s.kills, eaten: s.eaten, death: s.death, errors: s.errors };
      });
    }

    return {
      options: o, snakes, botState, step, finished, placements,
      get turn() { return turn; }, get food() { return food; }, get hazard() { return hazardRing; },
      get nextShrinkTurn() { return nextShrinkFor(turn + 1); },
    };
  }

  return { create, rng, DIRS, DEFAULTS };
});
