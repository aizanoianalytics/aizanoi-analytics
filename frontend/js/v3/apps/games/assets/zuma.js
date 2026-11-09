/* Module-private Marble Serpent: a Zuma-like marble shooter. Procedural spiral
   track, chain physics, color-match pops with combos, five chambers, lives.
   Pure logic (track/state/match helpers) is vm-testable; mount() owns DOM. */
(() => {
  'use strict';
  const W = 480;
  const H = 640;
  const BALL_R = 11;
  const SPACING = 24;
  const MAX_LEVEL = 5;
  const SHOT_SPEED = 560;
  const PALETTE = [
    { base: '#e5484d', hi: '#ff9a9e', lo: '#8f1d22' },
    { base: '#f5a524', hi: '#ffd47e', lo: '#9a5f06' },
    { base: '#30a46c', hi: '#7fe3ae', lo: '#14532d' },
    { base: '#3e9bff', hi: '#9ecdff', lo: '#14467e' },
    { base: '#8e4ec6', hi: '#c9a6f2', lo: '#4a2470' },
    { base: '#e8edf5', hi: '#ffffff', lo: '#8d99ae' },
  ];

  // Named canvas paint theme: every reusable paint value lives here so the
  // render loop below only references constants (never ad-hoc literals).
  const PAINT = {
    rim: 'rgba(0,0,0,.45)',
    glint: 'rgba(255,255,255,.75)',
    star: 'rgba(255,255,255,.5)',
    barrel: '#2c2113',
    groove: '#0a0f16',
    trackEdge: 'rgba(212,175,55,.5)',
    portal: 'rgba(127,240,200,.85)',
    ballShadow: 'rgba(0,0,0,.35)',
    gold: '#ffd47e',
    ink: '#eef3ff',
    dim: '#9aaac6',
    veil: 'rgba(4,8,14,.62)',
    veilWin: 'rgba(4,8,14,.7)',
    veilLose: 'rgba(20,4,6,.72)',
    lose: '#ff9b8f',
    brass: '#d4af37',
    pedestalShadow: 'rgba(0,0,0,.4)',
    aim: 'rgba(255,212,126,.4)',
    caption: 'rgba(238,243,255,.6)',
  };
  const TYPE = {
    floater: '700 17px system-ui, sans-serif',
    caption: '600 11px system-ui, sans-serif',
    banner: '800 26px system-ui, sans-serif',
    title: '800 30px system-ui, sans-serif',
    titleWin: '800 32px system-ui, sans-serif',
    sub: '500 15px system-ui, sans-serif',
    body: '600 16px system-ui, sans-serif',
  };

  function levelConfig(level) {
    if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
      throw new Error('Marble Serpent chamber must be 1-5');
    }
    return {
      total: 20 + 6 * level,
      speed: 30 + 6 * level,
      colors: Math.min(2 + level, PALETTE.length),
      spawnEvery: SPACING / (30 + 6 * level),
    };
  }

  function buildTrack(w = W, h = H) {
    const cx = w / 2;
    const cy = h / 2 + 20;
    const outer = Math.min(w, h) / 2 - 26;
    const inner = 52;
    const turns = 2.75;
    const start = -Math.PI / 2;
    const count = 720;
    const points = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const angle = start + t * turns * Math.PI * 2;
      const radius = outer + (inner - outer) * t;
      points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    return { points, cumulative, length: cumulative[cumulative.length - 1], cx, cy, w, h };
  }

  function pointAt(track, s) {
    const clamped = Math.max(0, Math.min(track.length, s));
    const cum = track.cumulative;
    let low = 0;
    let high = cum.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (cum[mid] < clamped) low = mid + 1;
      else high = mid;
    }
    const i = Math.max(1, low);
    const span = cum[i] - cum[i - 1] || 1;
    const t = (clamped - cum[i - 1]) / span;
    const a = track.points[i - 1];
    const b = track.points[i];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function closestS(track, x, y) {
    const pts = track.points;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i += 6) {
      const d = (pts[i].x - x) * (pts[i].x - x) + (pts[i].y - y) * (pts[i].y - y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    const from = Math.max(0, best - 8);
    const to = Math.min(pts.length - 1, best + 8);
    for (let i = from; i <= to; i++) {
      const d = (pts[i].x - x) * (pts[i].x - x) + (pts[i].y - y) * (pts[i].y - y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return track.cumulative[best];
  }

  function pickColor(state) {
    const attempt = Math.floor(state.random() * state.colors);
    const tail = state.spawnTail;
    if (tail.length >= 2 && tail[tail.length - 1] === attempt && tail[tail.length - 2] === attempt) {
      return (attempt + 1) % state.colors;
    }
    return attempt;
  }

  function createState(level, random = Math.random, track = buildTrack()) {
    const config = levelConfig(level);
    const state = {
      level, track, random,
      total: config.total, speed: config.speed, colors: config.colors,
      spawnEvery: config.spawnEvery,
      balls: [], shots: [], bursts: [], floaters: [],
      score: 0, combo: 0, lives: 3, fired: 0,
      spawned: 0, spawnAcc: 0, spawnTail: [],
      over: null, shake: 0, banner: null, flash: 0,
      shooter: { x: track.cx, y: track.cy, angle: -Math.PI / 2, current: 0, next: 1 },
    };
    state.shooter.current = Math.floor(random() * config.colors);
    state.shooter.next = Math.floor(random() * config.colors);
    return state;
  }

  function resetChain(state) {
    state.balls = [];
    state.shots = [];
    state.spawned = 0;
    state.spawnAcc = 0;
    state.spawnTail = [];
    state.combo = 0;
  }

  function spawnTick(state, dt) {
    if (state.over || state.spawned >= state.total) return;
    state.spawnAcc += dt;
    while (state.spawnAcc >= state.spawnEvery && state.spawned < state.total) {
      state.spawnAcc -= state.spawnEvery;
      const color = pickColor(state);
      state.spawnTail.push(color);
      if (state.spawnTail.length > 2) state.spawnTail.shift();
      const back = state.balls[state.balls.length - 1];
      const s = back ? back.s - SPACING : 8;
      state.balls.push({ color, s });
      state.spawned += 1;
    }
  }

  function advanceChain(state, dt) {
    if (state.over || !state.balls.length) return;
    const chase = state.speed * 2.4;
    state.balls[0].s += state.speed * dt;
    for (let i = 1; i < state.balls.length; i++) {
      const desired = state.balls[i - 1].s - SPACING;
      if (state.balls[i].s < desired) {
        state.balls[i].s = Math.min(desired, state.balls[i].s + chase * dt);
      } else if (state.balls[i].s > desired) {
        state.balls[i].s = desired;
      }
    }
  }

  function insertOrb(state, orb) {
    let index = state.balls.length;
    for (let i = 0; i < state.balls.length; i++) {
      if (state.balls[i].s <= orb.s) {
        index = i;
        break;
      }
    }
    state.balls.splice(index, 0, { color: orb.color, s: orb.s });
    for (let i = index + 1; i < state.balls.length; i++) {
      const desired = state.balls[i - 1].s - SPACING;
      if (state.balls[i].s > desired) state.balls[i].s = desired;
    }
    return index;
  }

  function burstAt(state, s, color, big) {
    const pos = pointAt(state.track, s);
    const count = big ? 26 : 12;
    for (let i = 0; i < count; i++) {
      const angle = state.random() * Math.PI * 2;
      const pace = (big ? 190 : 120) * (0.4 + state.random() * 0.8);
      state.bursts.push({
        x: pos.x, y: pos.y,
        vx: Math.cos(angle) * pace, vy: Math.sin(angle) * pace,
        life: 0.55 + state.random() * 0.3, age: 0, color,
      });
    }
  }

  function resolveMatches(state, index) {
    let popped = 0;
    let cursor = Math.max(0, Math.min(index, state.balls.length - 1));
    for (;;) {
      if (!state.balls.length || cursor >= state.balls.length) break;
      const color = state.balls[cursor].color;
      let from = cursor;
      let to = cursor;
      while (from - 1 >= 0 && state.balls[from - 1].color === color) from -= 1;
      while (to + 1 < state.balls.length && state.balls[to + 1].color === color) to += 1;
      if (to - from + 1 < 3) break;
      const run = state.balls.slice(from, to + 1);
      for (const ball of run) burstAt(state, ball.s, ball.color, false);
      state.balls.splice(from, to - from + 1);
      popped += run.length;
      state.combo += 1;
      const gained = run.length * 10 * state.combo;
      state.score += gained;
      const pos = pointAt(state.track, run[Math.floor(run.length / 2)].s);
      state.floaters.push({ x: pos.x, y: pos.y - 14, text: `+${gained}`, age: 0, life: 0.9 });
      cursor = Math.max(0, Math.min(from, state.balls.length - 1));
    }
    return popped;
  }

  function registerMiss(state) {
    state.combo = 0;
  }

  function checkBreach(state) {
    if (state.over || !state.balls.length) return false;
    if (state.balls[0].s < state.track.length - BALL_R) return false;
    burstAt(state, state.track.length - BALL_R, 0, true);
    state.lives -= 1;
    state.shake = 10;
    state.flash = 0.6;
    if (state.lives <= 0) {
      state.over = 'lose';
      state.balls = [];
      state.shots = [];
    } else {
      resetChain(state);
      state.banner = { text: `A serpent slipped through — ${state.lives} guard${state.lives === 1 ? '' : 's'} left`, age: 0, life: 2.2 };
    }
    return true;
  }

  function checkChamberClear(state) {
    if (state.over) return false;
    if (state.spawned < state.total || state.balls.length || state.shots.length) return false;
    if (state.level >= MAX_LEVEL) {
      state.over = 'win';
      return true;
    }
    state.level += 1;
    const config = levelConfig(state.level);
    state.total = config.total;
    state.speed = config.speed;
    state.colors = config.colors;
    state.spawnEvery = config.spawnEvery;
    resetChain(state);
    state.banner = { text: `Chamber ${state.level} — the coil quickens`, age: 0, life: 2.4 };
    return true;
  }

  function statusText(state) {
    if (state.over === 'win') return `Sanctum cleansed! Final score ${state.score} in ${state.fired} shots. Start a new run to play again.`;
    if (state.over === 'lose') return `The serpent reached the sanctum. Score ${state.score}. Start a new run to try again.`;
    const left = state.total - state.spawned + state.balls.length;
    return `Chamber ${state.level} of ${MAX_LEVEL} — ${left} orbs remain. Score ${state.score}, ${state.lives} guards.`;
  }

  function mount(host) {
    let state = createState(1, Math.random, buildTrack());
    let paused = false;
    let disposed = false;
    let raf = 0;
    let last = 0;
    let elapsed = 0;

    host.innerHTML = [
      '<div class="ag-cab" data-game="zuma">',
      '<div class="ag-hud">',
      '<div class="ag-stat"><span>Score</span><output data-zm-score>0</output></div>',
      '<div class="ag-stat"><span>Chamber</span><output data-zm-level>1/5</output></div>',
      '<div class="ag-stat"><span>Guards</span><output data-zm-lives>3</output></div>',
      '<div class="ag-stat"><span>Combo</span><output data-zm-combo>×0</output></div>',
      '</div>',
      '<div class="ag-screen"><canvas data-zm-canvas width="480" height="640" tabindex="0" role="img" aria-label="Marble Serpent playfield. Aim with pointer or arrow keys, fire with tap, click or Space."></canvas></div>',
      '<div class="ag-toolbar"><span class="ag-best">Orbs <b data-zm-shots>0</b></span><span class="ag-spacer"></span>',
      '<button class="ag-btn" type="button" data-zm-pause>Pause</button>',
      '<button class="ag-btn" type="button" data-zm-new>New run</button></div>',
      '<p class="ag-status" data-zm-status role="status"></p>',
      '<p class="ag-hint">Aim with mouse, touch-drag or <kbd>←</kbd><kbd>→</kbd> · tap or click to fire · match 3+ to burst · <kbd>Space</kbd> fire · <kbd>P</kbd> pause · <kbd>N</kbd> new run.</p>',
      '</div>',
    ].join('');
    const cab = host.querySelector('.ag-cab');
    const canvas = host.querySelector('[data-zm-canvas]');
    const ctx = canvas.getContext('2d');
    const status = host.querySelector('[data-zm-status]');
    const scoreEl = host.querySelector('[data-zm-score]');
    const levelEl = host.querySelector('[data-zm-level]');
    const livesEl = host.querySelector('[data-zm-lives]');
    const comboEl = host.querySelector('[data-zm-combo]');
    const shotsEl = host.querySelector('[data-zm-shots]');
    const pauseBtn = host.querySelector('[data-zm-pause]');

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const stars = [];
    let seed = 1234567;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 90; i++) {
      stars.push({ x: rand() * W, y: rand() * H, r: 0.5 + rand() * 1.4, tw: rand() * Math.PI * 2 });
    }

    function fireTowards(x, y) {
      if (paused || state.over || disposed) return;
      const dx = x - state.shooter.x;
      const dy = y - state.shooter.y;
      if (Math.hypot(dx, dy) < 4) return;
      state.shooter.angle = Math.atan2(dy, dx);
      const pace = SHOT_SPEED;
      state.shots.push({
        x: state.shooter.x + Math.cos(state.shooter.angle) * 26,
        y: state.shooter.y + Math.sin(state.shooter.angle) * 26,
        vx: Math.cos(state.shooter.angle) * pace,
        vy: Math.sin(state.shooter.angle) * pace,
        color: state.shooter.current,
      });
      state.shooter.current = state.shooter.next;
      state.shooter.next = Math.floor(state.random() * state.colors);
      state.fired += 1;
      canvas.focus({ preventScroll: true });
    }

    function canvasPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * W,
        y: ((event.clientY - rect.top) / rect.height) * H,
      };
    }

    function handlePointerMove(event) {
      if (paused || state.over) return;
      const point = canvasPoint(event);
      const dx = point.x - state.shooter.x;
      const dy = point.y - state.shooter.y;
      if (Math.hypot(dx, dy) > 4) state.shooter.angle = Math.atan2(dy, dx);
    }

    function handlePointerDown(event) {
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      const point = canvasPoint(event);
      fireTowards(point.x, point.y);
    }

    function handleClick(event) {
      const target = event.target.closest('button');
      if (!target || !cab.contains(target)) return;
      if (target.hasAttribute('data-zm-new')) {
        newRun();
      } else if (target.hasAttribute('data-zm-pause')) {
        togglePause();
        canvas.focus({ preventScroll: true });
      }
    }

    function handleKeydown(event) {
      if (!cab.contains(document.activeElement) && document.activeElement !== document.body) return;
      const key = event.key;
      if (key === 'ArrowLeft') {
        event.preventDefault();
        state.shooter.angle -= 0.09;
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        state.shooter.angle += 0.09;
      } else if (key === ' ') {
        event.preventDefault();
        fireTowards(
          state.shooter.x + Math.cos(state.shooter.angle) * 100,
          state.shooter.y + Math.sin(state.shooter.angle) * 100,
        );
      } else if (key === 'p' || key === 'P') {
        event.preventDefault();
        togglePause();
      } else if (key === 'n' || key === 'N') {
        event.preventDefault();
        newRun();
      }
    }

    function togglePause() {
      if (state.over) return;
      paused = !paused;
      pauseBtn.textContent = paused ? 'Resume' : 'Pause';
      last = performance.now();
    }

    function newRun() {
      state = createState(1, Math.random, buildTrack());
      paused = false;
      pauseBtn.textContent = 'Pause';
      last = performance.now();
      syncHud();
    }

    function syncHud() {
      scoreEl.textContent = String(state.score);
      levelEl.textContent = `${state.level}/${MAX_LEVEL}`;
      livesEl.textContent = String(state.lives);
      comboEl.textContent = `×${state.combo}`;
      shotsEl.textContent = String(state.fired);
      status.textContent = statusText(state);
    }

    function update(dt) {
      spawnTick(state, dt);
      advanceChain(state, dt);
      const track = state.track;
      for (let i = state.shots.length - 1; i >= 0; i--) {
        const shot = state.shots[i];
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        if (shot.x < -20 || shot.x > W + 20 || shot.y < -20 || shot.y > H + 20) {
          state.shots.splice(i, 1);
          registerMiss(state);
          continue;
        }
        let hit = -1;
        let hitDist = BALL_R * 2;
        for (let b = 0; b < state.balls.length; b++) {
          const pos = pointAt(track, state.balls[b].s);
          const d = Math.hypot(pos.x - shot.x, pos.y - shot.y);
          if (d < hitDist) {
            hitDist = d;
            hit = b;
          }
        }
        if (hit >= 0) {
          state.shots.splice(i, 1);
          const s = closestS(track, shot.x, shot.y);
          const index = insertOrb(state, { color: shot.color, s });
          const popped = resolveMatches(state, index);
          if (!popped) registerMiss(state);
          else state.shake = Math.max(state.shake, 2.5);
        }
      }
      for (let i = state.bursts.length - 1; i >= 0; i--) {
        const p = state.bursts[i];
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        if (p.age >= p.life) state.bursts.splice(i, 1);
      }
      for (let i = state.floaters.length - 1; i >= 0; i--) {
        const f = state.floaters[i];
        f.age += dt;
        f.y -= 34 * dt;
        if (f.age >= f.life) state.floaters.splice(i, 1);
      }
      if (state.shake > 0) state.shake = Math.max(0, state.shake - 34 * dt);
      if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
      if (state.banner) {
        state.banner.age += dt;
        if (state.banner.age >= state.banner.life) state.banner = null;
      }
      checkBreach(state);
      checkChamberClear(state);
    }

    function drawOrb(x, y, color, scale = 1) {
      const pal = PALETTE[color % PALETTE.length];
      const r = BALL_R * scale;
      const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
      grad.addColorStop(0, pal.hi);
      grad.addColorStop(0.55, pal.base);
      grad.addColorStop(1, pal.lo);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAINT.rim;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = PAINT.glint;
      ctx.beginPath();
      ctx.ellipse(x - r * 0.32, y - r * 0.42, r * 0.2, r * 0.12, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    function render() {
      const track = state.track;
      ctx.save();
      if (state.shake > 0) {
        ctx.translate((state.random() - 0.5) * state.shake, (state.random() - 0.5) * state.shake);
      }
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0d2033');
      bg.addColorStop(0.55, '#081423');
      bg.addColorStop(1, '#050b14');
      ctx.fillStyle = bg;
      ctx.fillRect(-14, -14, W + 28, H + 28);

      ctx.fillStyle = PAINT.star;
      for (const star of stars) {
        const alpha = 0.25 + 0.35 * Math.abs(Math.sin(elapsed * 0.7 + star.tw));
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const glow = ctx.createRadialGradient(track.cx, track.cy, 10, track.cx, track.cy, 190);
      glow.addColorStop(0, 'rgba(212,175,55,.20)');
      glow.addColorStop(1, 'rgba(212,175,55,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      track.points.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.strokeStyle = PAINT.barrel;
      ctx.lineWidth = BALL_R * 2 + 12;
      ctx.stroke();
      ctx.strokeStyle = PAINT.groove;
      ctx.lineWidth = BALL_R * 2 + 5;
      ctx.stroke();
      ctx.strokeStyle = PAINT.trackEdge;
      ctx.lineWidth = 2;
      ctx.stroke();

      const entry = track.points[0];
      ctx.strokeStyle = PAINT.portal;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(entry.x, entry.y, BALL_R + 5 + Math.sin(elapsed * 3) * 2, 0, Math.PI * 2);
      ctx.stroke();

      const exit = track.points[track.points.length - 1];
      for (let ring = 0; ring < 3; ring++) {
        const t = (elapsed * 0.9 + ring / 3) % 1;
        ctx.strokeStyle = `rgba(229,72,77,${0.7 * (1 - t)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(exit.x, exit.y, 6 + t * 26, elapsed * 2 + ring, elapsed * 2 + ring + Math.PI * 1.4);
        ctx.stroke();
      }

      for (const ball of state.balls) {
        const pos = pointAt(track, ball.s);
        ctx.fillStyle = PAINT.ballShadow;
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y + 4, BALL_R * 0.9, BALL_R * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        drawOrb(pos.x, pos.y, ball.color);
      }
      for (const shot of state.shots) drawOrb(shot.x, shot.y, shot.color, 0.95);

      ctx.globalCompositeOperation = 'lighter';
      for (const p of state.bursts) {
        const t = p.age / p.life;
        const pal = PALETTE[p.color % PALETTE.length];
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = pal.hi;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + t * 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      ctx.textAlign = 'center';
      for (const f of state.floaters) {
        ctx.globalAlpha = Math.max(0, 1 - f.age / f.life);
        ctx.font = TYPE.floater;
        ctx.fillStyle = PAINT.gold;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      const sh = state.shooter;
      ctx.fillStyle = PAINT.pedestalShadow;
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y + 20, 44, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      const ped = ctx.createRadialGradient(sh.x - 10, sh.y - 12, 6, sh.x, sh.y, 34);
      ped.addColorStop(0, '#4a5a74');
      ped.addColorStop(1, '#1a2334');
      ctx.fillStyle = ped;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAINT.brass;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(sh.angle);
      ctx.fillStyle = PAINT.barrel;
      ctx.strokeStyle = PAINT.brass;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(6, -8, 30, 16, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      drawOrb(sh.x, sh.y, sh.current, 1.05);
      ctx.globalAlpha = 0.9;
      drawOrb(sh.x - 44, sh.y + 26, sh.next, 0.62);
      ctx.globalAlpha = 1;
      ctx.fillStyle = PAINT.caption;
      ctx.font = TYPE.caption;
      ctx.fillText('next', sh.x - 44, sh.y + 48);
      ctx.save();
      ctx.setLineDash([4, 7]);
      ctx.strokeStyle = PAINT.aim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sh.x + Math.cos(sh.angle) * 40, sh.y + Math.sin(sh.angle) * 40);
      ctx.lineTo(sh.x + Math.cos(sh.angle) * 120, sh.y + Math.sin(sh.angle) * 120);
      ctx.stroke();
      ctx.restore();

      if (state.banner) {
        const t = state.banner.age / state.banner.life;
        ctx.globalAlpha = t < 0.15 ? t / 0.15 : Math.max(0, 1 - Math.max(0, t - 0.6) / 0.4);
        ctx.font = TYPE.banner;
        ctx.fillStyle = PAINT.gold;
        ctx.fillText(state.banner.text, W / 2, H / 2 - 40);
        ctx.globalAlpha = 1;
      }
      if (paused && !state.over) {
        ctx.fillStyle = PAINT.veil;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = PAINT.ink;
        ctx.font = TYPE.title;
        ctx.fillText('Paused', W / 2, H / 2);
        ctx.font = TYPE.sub;
        ctx.fillStyle = PAINT.dim;
        ctx.fillText('Press P or Resume to continue', W / 2, H / 2 + 30);
      }
      if (state.over === 'win') {
        ctx.fillStyle = PAINT.veilWin;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = PAINT.gold;
        ctx.font = TYPE.titleWin;
        ctx.fillText('Sanctum cleansed!', W / 2, H / 2 - 12);
        ctx.fillStyle = PAINT.ink;
        ctx.font = TYPE.body;
        ctx.fillText(`Score ${state.score} · ${state.fired} shots`, W / 2, H / 2 + 20);
      } else if (state.over === 'lose') {
        ctx.fillStyle = PAINT.veilLose;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = PAINT.lose;
        ctx.font = TYPE.title;
        ctx.fillText('The serpent broke through', W / 2, H / 2 - 12);
        ctx.fillStyle = PAINT.ink;
        ctx.font = TYPE.body;
        ctx.fillText(`Score ${state.score} · chamber ${state.level}`, W / 2, H / 2 + 20);
      }
      if (state.flash > 0) {
        ctx.fillStyle = `rgba(229,72,77,${state.flash * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    function frame(now) {
      if (disposed) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      elapsed += dt;
      if (!paused && !state.over) update(dt);
      else if (state.banner && !state.over) {
        state.banner.age += dt;
        if (state.banner.age >= state.banner.life) state.banner = null;
      }
      render();
      syncHud();
      raf = requestAnimationFrame(frame);
    }

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerDown);
    cab.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);
    syncHud();
    last = performance.now();
    raf = requestAnimationFrame(frame);
    canvas.focus({ preventScroll: true });

    return function cleanup() {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      cab.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeydown);
    };
  }

  window.AizanoiArcadeZuma = {
    BALL_R, SPACING, MAX_LEVEL, PALETTE: PALETTE.map((entry) => entry.base),
    buildTrack, pointAt, closestS, levelConfig,
    createState, spawnTick, advanceChain, insertOrb,
    resolveMatches, registerMiss, checkBreach, checkChamberClear,
    mount,
  };
})();
