// Shared, self-hosted Canvas presentation. No engine objects are retained.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SnakeArenaRenderer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const distance = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  function snapshot(game, colors = {}, metadata = {}) {
    return {
      width: game.options.width, height: game.options.height, turn: game.turn,
      hazard: game.hazard, nextShrinkTurn: game.nextShrinkTurn,
      food: game.food.map(p => p.slice()),
      snakes: game.snakes.map((s, i) => ({ id: s.id, alive: s.alive, health: s.health,
        eaten: s.eaten || 0, color: /^#[0-9a-f]{6}$/i.test(colors[s.id]) ? colors[s.id] : '#80edc2',
        label: (metadata.fighters || game.snakes.map(v => v.id)).indexOf(s.id) === 0 ? 'A' : 'B',
        body: s.body.map(p => p.slice()) }))
    };
  }
  function validBody(body) {
    return body.every((p, i) => p.every(Number.isFinite) && (!i || distance(p, body[i - 1]) <= 1));
  }
  function interpolate(previous, current, progress) {
    const t = Math.max(0, Math.min(1, progress));
    return { ...current, snakes: current.snakes.map(s => {
      const old = previous && previous.snakes.find(p => p.id === s.id);
      // Only an actual one-cell engine step may interpolate. Never connect a row wrap,
      // reset, skipped turn, arbitrary teleport or an interrupted animation backlog.
      const valid = old && previous.width === current.width && previous.height === current.height &&
        current.turn === previous.turn + 1 && old.alive && validBody(old.body) && validBody(s.body) &&
        s.body.length >= old.body.length && s.body.length <= old.body.length + 1 &&
        old.body.length && s.body.length && distance(old.body[0], s.body[0]) === 1 &&
        s.body.slice(1).every((p, i) => same(p, old.body[i]));
      return { ...s, body: s.body.map((p, i) => {
        const q = valid && old.body[Math.min(i, old.body.length - 1)];
        return q ? [q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t] : p.slice();
      }) };
    }) };
  }
  function create(canvas, options = {}) {
    const ctx = canvas.getContext('2d');
    const host = typeof window !== 'undefined' ? window : globalThis;
    const request = options.requestAnimationFrame || host.requestAnimationFrame?.bind(host);
    const cancel = options.cancelAnimationFrame || host.cancelAnimationFrame?.bind(host);
    const now = options.now || (() => host.performance.now());
    const media = options.mediaQuery || host.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduced = options.reducedMotion ?? !!media?.matches;
    let current = null, previous = null, started = 0, duration = 140, raf = null, destroyed = false, particles = [];
    const circle = (x, y, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
    function paint(time) {
      if (!current || destroyed || !ctx) return;
      const age = Math.max(0, time - started), t = reduced || !duration ? 1 : Math.min(1, age / duration);
      const state = interpolate(previous, current, t);
      const cell = Math.min(canvas.width / state.width, canvas.height / state.height);
      const ox = (canvas.width - state.width * cell) / 2, oy = (canvas.height - state.height * cell) / 2;
      const phase = reduced ? 0 : time / 1000;
      ctx.save();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.fillStyle = '#080f20'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(ox, oy); ctx.scale(cell, cell);
      const W = state.width, H = state.height, h = state.hazard;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#14233b' : '#182a43'; ctx.fillRect(x, y, 1, 1);
      }
      // Clip the hatch to the storm ring; safe cells never receive hazard texture.
      if (h) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(h, h, W - h * 2, H - h * 2); ctx.clip('evenodd');
        ctx.fillStyle = 'rgba(211,48,137,.25)'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,99,188,.2)'; ctx.lineWidth = .045;
        for (let x = -H; x < W + H; x += .48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke(); }
        ctx.restore();
      }
      ctx.strokeStyle = h ? '#ff6cbd' : 'rgba(134,186,219,.35)'; ctx.lineWidth = .045;
      ctx.shadowColor = '#f75bb0'; ctx.shadowBlur = h ? cell * .22 : 0;
      ctx.strokeRect(h + .025, h + .025, W - h * 2 - .05, H - h * 2 - .05); ctx.shadowBlur = 0;
      state.food.forEach(([x, y], i) => {
        ctx.save(); ctx.translate(x + .5, y + .52);
        const pulse = 1 + .055 * Math.sin(phase * 3 + i);
        ctx.scale(pulse, pulse); ctx.shadowColor = '#ff466e'; ctx.shadowBlur = cell * .28;
        ctx.fillStyle = '#ff506e'; ctx.beginPath(); ctx.moveTo(0, -.19);
        ctx.bezierCurveTo(-.4, -.4, -.4, .25, -.08, .29); ctx.bezierCurveTo(0, .25, .06, .31, .12, .27);
        ctx.bezierCurveTo(.42, .14, .32, -.39, 0, -.19); ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#d5ab7a'; ctx.lineWidth = .045; ctx.beginPath(); ctx.moveTo(0, -.2); ctx.lineTo(.04, -.34); ctx.stroke();
        ctx.fillStyle = '#73efac'; ctx.beginPath(); ctx.ellipse(.12, -.31, .12, .055, -.5, 0, TAU); ctx.fill();
        circle(-.13, -.08, .045, '#ffd1d8'); ctx.restore();
      });
      state.snakes.forEach((s, index) => {
        if (!s.body.length) return;
        ctx.save(); ctx.globalAlpha = s.alive ? 1 : .23;
        // Separate disconnected input runs, rather than painting a false bridge.
        const runs = [[]];
        s.body.forEach((p, i) => { if (i && distance(p, s.body[i - 1]) > 1.01) runs.push([]); runs[runs.length - 1].push([p[0] + .5, p[1] + .5]); });
        function path(points) {
          ctx.beginPath(); ctx.moveTo(...points[0]);
          for (let i = 1; i < points.length - 1; i++) {
            const p = points[i], n = points[i + 1]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
          }
          if (points.length > 1) ctx.lineTo(...points[points.length - 1]);
          else { ctx.lineTo(points[0][0] + .001, points[0][1]); }
        }
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        runs.forEach(points => {
          path(points); ctx.strokeStyle = s.color; ctx.lineWidth = .76;
          ctx.shadowColor = s.color; ctx.shadowBlur = cell * .25; ctx.stroke(); ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = .12; ctx.stroke();
        });
        const head = s.body[0], neck = s.body.find(p => !same(p, head));
        const dx = neck ? head[0] - neck[0] : 0, dy = neck ? head[1] - neck[1] : -1;
        const angle = Math.atan2(dy, dx);
        ctx.save(); ctx.translate(head[0] + .5, head[1] + .5); ctx.rotate(angle);
        ctx.shadowColor = s.color; ctx.shadowBlur = cell * .15; circle(0, 0, .425, s.color); ctx.shadowBlur = 0;
        if (s.alive) [-1, 1].forEach(side => {
          circle(.16, side * .20, .125, '#f8fcff');
          const glance = reduced ? 0 : .018 * Math.sin(phase * 2.1 + index);
          circle(.203, side * .20 + glance, .06, '#091323'); circle(.221, side * .20 - .025, .018, '#fff');
        });
        ctx.restore();
        // Identity sits behind the eyes, never replacing the face.
        const bx = head[0] + .5 - Math.cos(angle) * .25, by = head[1] + .5 - Math.sin(angle) * .25;
        circle(bx, by, .145, '#101c30'); ctx.fillStyle = '#fff'; ctx.font = 'bold .19px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.label, bx, by + .007);
        ctx.restore();
      });
      if (!reduced) particles.forEach(p => {
        const t = Math.min(1, age / 650); ctx.globalAlpha = 1 - t;
        circle(p.x + p.dx * t, p.y + p.dy * t + .5 * t * t, .055 * (1 - t), p.color);
      });
      ctx.restore();
    }
    function frame(time) { raf = null; if (destroyed) return; paint(time); if (!reduced && time - started < Math.max(duration, 700)) schedule(); }
    function schedule() { if (raf === null && request && !destroyed) raf = request(frame); }
    function motionChange(event) {
      reduced = options.reducedMotion ?? event.matches;
      if (reduced && raf !== null) { cancel?.(raf); raf = null; }
      paint(now());
      if (!reduced && current) schedule();
    }
    media?.addEventListener?.('change', motionChange);
    return {
      update(game, colors, metadata = {}) {
        if (destroyed) return;
        previous = current; current = snapshot(game, colors, metadata); started = now();
        duration = Math.max(0, Math.min(260, Number(metadata.duration ?? options.duration ?? 140) || 0));
        particles = [];
        if (previous && current.turn === previous.turn + 1 && !reduced) current.snakes.forEach(s => {
          const old = previous.snakes.find(p => p.id === s.id);
          if (!old || !s.body.length || !(old.alive && !s.alive || s.eaten > old.eaten)) return;
          for (let i = 0; i < 12 && particles.length < 48; i++) {
            const angle = i * TAU / 12; particles.push({ x: s.body[0][0] + .5, y: s.body[0][1] + .5, dx: Math.cos(angle) * .8, dy: Math.sin(angle) * .8, color: s.alive ? '#ff8ba0' : s.color });
          }
        });
        paint(started); if (!reduced) schedule();
      },
      destroy() {
        if (destroyed) return; destroyed = true;
        if (raf !== null) cancel?.(raf); raf = null;
        media?.removeEventListener?.('change', motionChange);
        current = previous = null; particles = [];
      }
    };
  }
  return { create, snapshot, interpolate };
});
