(function () {
  'use strict';

  const DEFAULT_COLORS = { west: '#e8875b', east: '#22d3ee' };

  function create(canvas) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let snapshot = null;
    let previous = [];
    let colors = DEFAULT_COLORS;
    let started = 0;
    let duration = 0;
    let frame = null;
    let destroyed = false;
    let cssWidth = 0;
    let cssHeight = 0;
    let dpr = 1;

    const color = team => colors[team] || DEFAULT_COLORS[team];

    function resize() {
      if (destroyed) return;
      const bounds = canvas.getBoundingClientRect();
      cssWidth = bounds.width;
      cssHeight = bounds.height;
      dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(cssWidth * dpr));
      const height = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      schedule();
    }

    function positions(now) {
      if (!snapshot) return [];
      const progress = reduced.matches || !duration
        ? 1 : Math.min(1, Math.max(0, (now - started) / duration));
      const old = new Map(previous.map(agent => [agent.id, agent]));
      return snapshot.agents.map(agent => {
        const before = old.get(agent.id);
        if (!before || agent.x === null || before.x === null) return { ...agent };
        const teleported = before.jailed !== agent.jailed ||
          Boolean(before.respawnIn) !== Boolean(agent.respawnIn) ||
          Math.abs(before.x - agent.x) + Math.abs(before.y - agent.y) > 1;
        if (teleported) return { ...agent };
        return {
          ...agent,
          x: before.x + (agent.x - before.x) * progress,
          y: before.y + (agent.y - before.y) * progress,
        };
      });
    }

    function bounds(cells) {
      const points = cells.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
      const x = Math.min(...points.map(p => p.x));
      const y = Math.min(...points.map(p => p.y));
      return {
        x, y,
        width: Math.max(...points.map(p => p.x)) - x + 1,
        height: Math.max(...points.map(p => p.y)) - y + 1,
      };
    }

    function drawField() {
      const { width, height, border } = snapshot;
      context.fillStyle = '#0b1424';
      context.fillRect(0, 0, width, height);
      for (const team of ['west', 'east']) {
        context.save();
        context.globalAlpha = 0.12;
        context.fillStyle = color(team);
        context.fillRect(team === 'west' ? 0 : border + 1, 0, border, height);
        context.restore();
      }
      context.fillStyle = '#d6e4ff0a';
      context.fillRect(border, 0, 1, height);
      context.strokeStyle = '#8198c21b';
      context.lineWidth = 0.018;
      context.beginPath();
      for (let x = 0; x <= width; x++) {
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
      for (let y = 0; y <= height; y++) {
        context.moveTo(0, y);
        context.lineTo(width, y);
      }
      context.stroke();

      context.save();
      context.strokeStyle = '#b7c9e9';
      context.lineWidth = 0.045;
      context.setLineDash([0.25, 0.28]);
      context.beginPath();
      context.moveTo(border + 0.5, 0);
      context.lineTo(border + 0.5, height);
      context.stroke();
      context.restore();

      snapshot.grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] !== '#') continue;
          context.fillStyle = '#080e1c';
          context.fillRect(x + 0.08, y + 0.13, 0.86, 0.85);
          context.fillStyle = '#3a4b68';
          context.fillRect(x + 0.07, y + 0.07, 0.86, 0.82);
          context.fillStyle = '#7084a5';
          context.fillRect(x + 0.07, y + 0.07, 0.86, 0.055);
        }
      });

      for (const team of ['west', 'east']) {
        const zone = snapshot.zones[team];
        const home = bounds(zone.home);
        const jail = bounds(zone.jail);
        context.save();
        context.strokeStyle = color(team);
        context.fillStyle = color(team);
        context.lineWidth = 0.06;
        context.globalAlpha = 0.09;
        context.fillRect(home.x, home.y, home.width, home.height);
        context.fillRect(jail.x, jail.y, jail.width, jail.height);
        context.globalAlpha = 0.8;
        context.strokeRect(home.x + 0.08, home.y + 0.08, home.width - 0.16, home.height - 0.16);
        context.strokeRect(jail.x + 0.08, jail.y + 0.08, jail.width - 0.16, jail.height - 0.16);
        for (let x = jail.x + 0.35; x < jail.x + jail.width; x += 0.35) {
          context.beginPath();
          context.moveTo(x, jail.y + 0.12);
          context.lineTo(x, jail.y + jail.height - 0.12);
          context.stroke();
        }
        const stand = snapshot.flags[team].home;
        context.globalAlpha = 1;
        context.fillStyle = '#0b1424';
        context.beginPath();
        context.arc(stand.x + 0.5, stand.y + 0.5, 0.4, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.restore();
      }
    }

    function pennant(x, y, team, carried) {
      context.save();
      context.translate(x, y);
      if (carried) context.scale(0.8, 0.8);
      context.strokeStyle = '#ffffff';
      context.lineWidth = 0.075;
      context.beginPath();
      context.moveTo(-0.16, 0.35);
      context.lineTo(-0.16, -0.4);
      context.stroke();
      context.fillStyle = color(team);
      context.shadowColor = color(team);
      context.shadowBlur = 7 * dpr;
      context.beginPath();
      context.moveTo(-0.12, -0.4);
      context.lineTo(0.43, -0.23);
      context.lineTo(-0.12, -0.02);
      context.closePath();
      context.fill();
      context.restore();
    }

    function drawAgents(agents, now) {
      const sx = cssWidth / snapshot.width;
      const sy = cssHeight / snapshot.height;
      const visible = agents.filter(a => a.x !== null && !a.respawnIn);
      const groups = new Map();
      for (const a of visible) {
        const target = snapshot.agents.find(item => item.id === a.id);
        const key = `${target.x},${target.y}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(a);
      }
      const placed = new Map();
      context.save();
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      for (const group of groups.values()) {
        group.forEach((agent, index) => {
          const crowded = group.length > 1;
          const angle = index * Math.PI * 2 / group.length - Math.PI / 2;
          const offset = crowded ? Math.min(sx, sy) * 0.28 : 0;
          const radius = crowded
            ? Math.max(4, Math.min(sx, sy) * 0.27)
            : Math.max(5.5, Math.min(sx, sy) * 0.4);
          const x = Math.max(radius + 1, Math.min(cssWidth - radius - 1,
            (agent.x + 0.5) * sx + Math.cos(angle) * offset));
          const y = Math.max(radius + 1, Math.min(cssHeight - radius - 1,
            (agent.y + 0.5) * sy + Math.sin(angle) * offset));
          const tint = agent.jailed ? '#a2adbf' : color(agent.team);
          placed.set(agent.id, { x, y });

          if (agent.carrying) {
            const pulse = reduced.matches ? 0 : Math.sin(now / 180) * 1.5;
            context.strokeStyle = tint;
            context.lineWidth = 2;
            context.beginPath();
            context.arc(x, y, radius + 3 + pulse, 0, Math.PI * 2);
            context.stroke();
          }

          context.fillStyle = tint;
          context.strokeStyle = '#f3f7ff';
          context.lineWidth = crowded ? 1 : 1.5;
          context.shadowColor = agent.jailed ? 'transparent' : tint;
          context.shadowBlur = agent.jailed ? 0 : 8;
          context.beginPath();
          if (agent.team === 'west') {
            context.arc(x, y, radius, 0, Math.PI * 2);
          } else {
            context.roundRect(x - radius, y - radius, radius * 2, radius * 2, radius * 0.4);
          }
          context.fill();
          context.stroke();
          context.shadowBlur = 0;

          context.fillStyle = '#071321';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.font = `800 ${Math.max(7, Math.min(12, radius * 0.95))}px system-ui, sans-serif`;
          context.fillText(String(agent.id).toUpperCase(), x, y + 0.3, radius * 1.85);
          if (agent.jailed) {
            context.strokeStyle = '#27364b';
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(x - radius * 0.6, y + radius * 0.65);
            context.lineTo(x + radius * 0.6, y + radius * 0.65);
            context.stroke();
          }
        });
      }
      context.restore();
      return placed;
    }

    function drawFlags(placed) {
      for (const team of ['west', 'east']) {
        const flag = snapshot.flags[team];
        if (flag.carrier === null) {
          pennant(flag.x + 0.5, flag.y + 0.5, team, false);
        } else {
          const carrier = placed.get(flag.carrier);
          if (carrier) {
            pennant(
              carrier.x / (cssWidth / snapshot.width) + 0.3,
              carrier.y / (cssHeight / snapshot.height) - 0.38,
              team, true,
            );
          }
        }
      }
    }

    function draw(now) {
      frame = null;
      if (destroyed || !snapshot || !cssWidth || !cssHeight || document.hidden) return;
      if ((window.devicePixelRatio || 1) !== dpr) resize();
      context.setTransform(canvas.width / snapshot.width, 0, 0,
        canvas.height / snapshot.height, 0, 0);
      drawField();
      const placed = drawAgents(positions(now), now);
      drawFlags(placed);
      const moving = duration > 0 && now - started < duration;
      const carrier = snapshot.agents.some(a => a.carrying);
      if (!reduced.matches && (moving || carrier)) schedule();
    }

    function schedule() {
      if (!destroyed && frame === null) frame = requestAnimationFrame(draw);
    }

    function update(game, nextColors = DEFAULT_COLORS, options = {}) {
      if (destroyed) return;
      const now = performance.now();
      previous = positions(now);
      colors = { ...DEFAULT_COLORS, ...nextColors };
      duration = Math.max(0, Number(options.duration) || 0);
      started = now;
      const zones = game.zones();
      snapshot = {
        width: game.width, height: game.height,
        grid: game.grid(), agents: game.agents(),
        flags: game.flags(), zones, border: zones.border,
      };
      canvas.style.setProperty('--field-ratio', `${game.width} / ${game.height}`);
      const descriptions = snapshot.agents.map(a => {
        const status = a.respawnIn ? `respawning in ${a.respawnIn} ticks`
          : a.jailed ? 'jailed'
          : `${a.x}, ${a.y}${a.carrying ? ', carrying enemy flag' : ''}`;
        return `${a.id}: ${a.name}, ${a.team}, ${status}`;
      });
      canvas.setAttribute('aria-label',
        `Capture the Flag arena. West left, East right. Tick ${game.tick}. ${descriptions.join('. ')}.`);
      schedule();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', schedule);
    reduced.addEventListener('change', schedule);
    resize();

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      observer.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', schedule);
      reduced.removeEventListener('change', schedule);
      snapshot = null;
      previous = [];
    }

    return { update, destroy };
  }

  window.FlagRenderer = { create };
})();
