(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlagEngine = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DIRS = Object.freeze({
    up: Object.freeze([0, -1]),
    down: Object.freeze([0, 1]),
    left: Object.freeze([-1, 0]),
    right: Object.freeze([1, 0]),
    stay: Object.freeze([0, 0])
  });
  const other = team => team === 'west' ? 'east' : 'west';
  const compare = (a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const clone = value => JSON.parse(JSON.stringify(value));

  function rng(seed) {
    let a = Number(seed) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dimension(value, fallback) {
    const n = value === undefined ? fallback : value;
    if (!Number.isInteger(n) || n < 9 || n > 201 || n % 2 === 0) {
      throw new RangeError('Field dimensions must be odd integers from 9 to 201.');
    }
    return n;
  }

  function positive(value, fallback) {
    const n = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(n) || n < 1) throw new RangeError('Expected a positive integer.');
    return n;
  }

  function layout(w, h) {
    const border = Math.floor(w / 2);
    const stand = { x: Math.min(3, border - 2), y: Math.floor(h / 2) };
    const mirror = p => ({ x: w - 1 - p.x, y: h - 1 - p.y });
    const home = [];
    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) home.push({ x: stand.x + x, y: stand.y + y });
    }
    const jail = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }];
    return {
      stands: { west: stand, east: mirror(stand) },
      zones: {
        west: { home, jail, half: 'x<' + border },
        east: { home: home.map(mirror), jail: jail.map(mirror), half: 'x>' + border },
        border
      }
    };
  }

  function connected(cells, w, h) {
    const start = cells.indexOf('.');
    if (start < 0) return false;
    const seen = new Uint8Array(cells.length);
    const queue = [start];
    seen[start] = 1;
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i];
      const x = n % w;
      const y = Math.floor(n / w);
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx;
        const ny = y + dy;
        const next = ny * w + nx;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || seen[next] || cells[next] !== '.') continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    return queue.length === cells.reduce((n, c) => n + (c === '.' ? 1 : 0), 0);
  }

  function generateField(seed, width, height) {
    const w = dimension(width, 33);
    const h = dimension(height, 21);
    const random = rng(seed);
    const { zones } = layout(w, h);
    const cells = Array(w * h).fill('.');
    const reserved = new Set();
    for (const team of ['west', 'east']) {
      for (const p of zones[team].home.concat(zones[team].jail)) reserved.add(p.y * w + p.x);
    }
    const protectedCell = (x, y) => x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
      y === Math.floor(h / 2) || reserved.has(y * w + x);
    const target = Math.floor(w * h * 0.12);
    let walls = 0;
    for (let attempt = 0; attempt < w * h * 12 && walls < target - 1; attempt++) {
      const x = 1 + Math.floor(random() * (w - 2));
      const y = 1 + Math.floor(random() * (h - 2));
      const horizontal = random() < 0.5;
      const length = 1 + Math.floor(random() * 3);
      const proposed = new Set();
      for (let i = 0; i < length; i++) {
        const nx = x + (horizontal ? i : 0);
        const ny = y + (horizontal ? 0 : i);
        const mx = w - 1 - nx;
        const my = h - 1 - ny;
        if (nx >= w - 1 || ny >= h - 1 || protectedCell(nx, ny) || protectedCell(mx, my)) break;
        if ((nx === zones.border || mx === zones.border) && random() > 0.12) break;
        proposed.add(ny * w + nx);
        proposed.add(my * w + mx);
      }
      const added = [...proposed].filter(n => cells[n] === '.');
      if (!added.length || walls + added.length > target) continue;
      for (const n of added) cells[n] = '#';
      if (connected(cells, w, h)) walls += added.length;
      else for (const n of added) cells[n] = '.';
    }
    return Array.from({ length: h }, (_, y) => cells.slice(y * w, (y + 1) * w).join(''));
  }

  function create(seats, options) {
    const opts = options || {};
    const width = dimension(opts.width, 33);
    const height = dimension(opts.height, 21);
    const maxTicks = positive(opts.maxTicks, 1200);
    const capturesToWin = positive(opts.capturesToWin, 3);
    if (!Array.isArray(seats)) throw new TypeError('Seats must be an array.');
    const ids = new Set();
    const counts = { west: 0, east: 0 };
    for (const seat of seats) {
      const validId = seat && ((typeof seat.id === 'string' && seat.id.length > 0) || Number.isSafeInteger(seat.id));
      if (!validId || !['west', 'east'].includes(seat.team) || ids.has(String(seat.id))) {
        throw new TypeError('Each seat needs a unique string or integer id and a valid team.');
      }
      ids.add(String(seat.id));
      counts[seat.team]++;
    }
    if (Object.values(counts).some(n => n < 1 || n > 4)) throw new RangeError('Each team needs 1 to 4 seats.');
    const grid = generateField(opts.seed, width, height);
    const { stands, zones } = layout(width, height);
    const border = zones.border;
    const score = { west: 0, east: 0 };
    const flags = {};
    for (const team of ['west', 'east']) flags[team] = { ...stands[team], carrier: null, home: { ...stands[team] } };
    const agents = seats.map(s => ({
      id: s.id, team: s.team, name: String(s.name === undefined ? s.id : s.name),
      x: 0, y: 0, carrying: false, jailed: false, jailTicks: 0, respawnIn: 0,
      tags: 0, captures: 0, timesJailed: 0, flagPickups: 0
    })).sort(compare);
    const spawn = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < Math.ceil(width / 3); x++) {
        if (grid[y][x] === '.' && !zones.west.jail.some(p => p.x === x && p.y === y)) spawn.push({ x, y });
      }
    }
    spawn.sort((a, b) => distance(a, stands.west) - distance(b, stands.west) || a.y - b.y || a.x - b.x);
    for (const team of ['west', 'east']) {
      agents.filter(a => a.team === team).forEach((a, i) => {
        const p = spawn[i];
        a.x = team === 'west' ? p.x : width - 1 - p.x;
        a.y = team === 'west' ? p.y : height - 1 - p.y;
      });
    }
    let tick = 0;
    let done = false;
    let outcome = null;
    const ownHalf = (team, x) => team === 'west' ? x < border : x > border;
    const living = a => !a.jailed && a.respawnIn === 0;

    function resetFlag(team) {
      Object.assign(flags[team], flags[team].home, { carrier: null });
    }

    function release(a, events, automatic) {
      Object.assign(a, stands[a.team], { jailed: false, jailTicks: 0, respawnIn: 0 });
      events.push({ type: 'release', id: a.id, team: a.team, automatic });
    }

    function finish() {
      const tags = team => agents.filter(a => a.team === team).reduce((n, a) => n + a.tags, 0);
      const won = score.west >= capturesToWin || score.east >= capturesToWin;
      const captureDifference = score.west - score.east;
      // Tag totals are a time-limit tiebreaker, not a simultaneous-goal tiebreaker.
      const decisive = captureDifference || (won ? 0 : tags('west') - tags('east'));
      const winner = decisive > 0 ? 'west' : decisive < 0 ? 'east' : null;
      done = true;
      outcome = {
        winner, reason: winner === null ? 'draw' : won ? 'captures' : 'time', tick, score: { ...score },
        agents: agents.map(({ id, team, name, tags: tagCount, captures, jailed, timesJailed, flagPickups }) =>
          ({ id, team, name, tags: tagCount, captures, jailed, timesJailed, flagPickups }))
      };
    }

    function step(moves) {
      if (done) return [];
      tick++;
      const events = [];
      const active = agents.filter(living);
      const previous = new Map(active.map(a => [a.id, { x: a.x, y: a.y }]));
      for (const a of agents) {
        if (a.jailed) {
          a.jailTicks++;
          if (a.jailTicks >= 40) release(a, events, true);
        } else if (a.respawnIn > 0) {
          a.respawnIn--;
          if (a.respawnIn === 0) release(a, events, false);
        }
      }
      for (const a of active) {
        const move = moves && Object.prototype.hasOwnProperty.call(moves, a.id) ? moves[a.id] : 'stay';
        const delta = typeof move === 'string' && Object.prototype.hasOwnProperty.call(DIRS, move) ? DIRS[move] : DIRS.stay;
        const x = a.x + delta[0];
        const y = a.y + delta[1];
        if (x >= 0 && x < width && y >= 0 && y < height && grid[y][x] !== '#') Object.assign(a, { x, y });
      }
      const tagged = [];
      for (const victim of active) {
        if (victim.x === border || ownHalf(victim.team, victim.x)) continue;
        const tagger = active.find(a => {
          if (a.team === victim.team || !ownHalf(a.team, a.x) || !ownHalf(a.team, victim.x)) return false;
          const pa = previous.get(a.id);
          const pv = previous.get(victim.id);
          const swapped = a.x === pv.x && a.y === pv.y && victim.x === pa.x && victim.y === pa.y;
          return distance(a, victim) <= 1 || swapped;
        });
        if (tagger) tagged.push({ victim, tagger });
      }
      for (const { victim, tagger } of tagged) {
        tagger.tags++;
        if (victim.carrying) {
          const flagTeam = other(victim.team);
          resetFlag(flagTeam);
          victim.carrying = false;
          events.push({ type: 'drop', id: victim.id, flag: flagTeam, returned: true });
        }
        const jail = zones[other(victim.team)].jail;
        const p = jail[agents.filter(a => a.team === victim.team).indexOf(victim) % jail.length];
        Object.assign(victim, p, { jailed: true, jailTicks: 0, respawnIn: 0 });
        victim.timesJailed++;
        events.push({ type: 'tag', id: victim.id, by: tagger.id, team: tagger.team });
      }
      const survivors = active.filter(living);
      for (const team of ['west', 'east']) {
        const prisoners = agents.filter(a => a.team === team && a.jailed);
        const rescuer = survivors.find(a => a.team === team && zones[other(team)].jail.some(p => distance(a, p) <= 1));
        if (!prisoners.length || !rescuer) continue;
        for (const a of prisoners) Object.assign(a, { jailed: false, jailTicks: 0, respawnIn: 3, x: null, y: null });
        events.push({ type: 'free', team, by: rescuer.id, ids: prisoners.map(a => a.id) });
      }
      for (const a of survivors) {
        const enemy = other(a.team);
        const flag = flags[enemy];
        if (!a.carrying && flag.carrier === null && distance(a, flag) === 0) {
          flag.carrier = a.id;
          a.carrying = true;
          a.flagPickups++;
          events.push({ type: 'pickup', id: a.id, flag: enemy });
        }
      }
      for (const a of survivors) {
        if (!a.carrying) continue;
        const enemy = other(a.team);
        const flag = flags[enemy];
        Object.assign(flag, { x: a.x, y: a.y });
        if (!ownHalf(a.team, a.x)) continue;
        a.carrying = false;
        a.captures++;
        score[a.team]++;
        resetFlag(enemy);
        events.push({ type: 'capture', id: a.id, team: a.team, score: score[a.team] });
      }
      if (score.west >= capturesToWin || score.east >= capturesToWin || tick >= maxTicks) finish();
      return events;
    }

    return {
      get tick() { return tick; },
      width, height,
      grid: () => grid.slice(),
      agents: () => clone(agents),
      flags: () => clone(flags),
      zones: () => clone(zones),
      botState(id) {
        const you = agents.find(a => a.id === id);
        if (!you) throw new RangeError('Unknown agent id.');
        return clone({
          tick, maxTicks, capturesToWin, width, height, grid, border, you, team: you.team,
          teammates: agents.filter(a => a.team === you.team && a.id !== id),
          enemies: agents.filter(a => a.team !== you.team), flags, zones, score
        });
      },
      step,
      finished: () => done,
      result: () => outcome === null ? null : clone(outcome)
    };
  }

  return Object.freeze({ create, generateField, rng, DIRS });
}));
