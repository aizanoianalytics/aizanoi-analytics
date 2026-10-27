(function () {
  'use strict';

  const DEFAULT_COLORS = { west: '#e8875b', east: '#22d3ee' };

  function point(cell) {
    return Array.isArray(cell) ? { x: cell[0], y: cell[1] } : cell;
  }

  function initials(name, id) {
    const words = String(name || id).trim().split(/\s+/);
    const label = words.slice(0, 2).map(word => word[0] || '').join('');
    return `${label.toUpperCase()}${String(id).slice(-1)}`.slice(0, 4);
  }

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

    function color(team) {
      return colors[team] || DEFAULT_COLORS[team];
    }

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
        ? 1
        : Math.min(1, Math.max(0, (now - started) / duration));

      const old = new Map(previous.map(agent => [agent.id, agent]));

      return snapshot.agents.map(agent => {
        const before = old.get(agent.id);
        if (!before) return { ...agent };

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
      const points = cells.map(point);
      if (!points.length) return null;

      const xs = points.map(cell => cell.x);
      const ys = points.map(cell => cell.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);

      return {
        x,
        y,
        width: Math.max(...xs) - x + 1,
        height: Math.max(...ys) - y + 1,
      };
    }

    function drawZones() {
      for (const team of ['west', 'east']) {
        const zone = snapshot.zones[team];
        context.strokeStyle = color(team);
        context.lineWidth = 0.055;
        context.globalAlpha = 0.65;

        const home = bounds(zone.home);
        if (home) {
          context.strokeRect(
            home.x + 0.08,
            home.y + 0.08,
            home.width - 0.16,
            home.height - 0.16,
          );
        }

        const jail = bounds(zone.jail);
        if (jail) {
          context.fillStyle = color(team);
          context.globalAlpha = 0.08;
          context.fillRect(jail.x, jail.y, jail.width, jail.height);
          context.globalAlpha = 0.65;
          context.strokeRect(
            jail.x + 0.08,
            jail.y + 0.08,
            jail.width - 0.16,
            jail.height - 0.16,
          );

          for (let x = jail.x + 0.35; x < jail.x + jail.width; x += 0.35) {
            context.beginPath();
            context.moveTo(x, jail.y + 0.1);
            context.lineTo(x, jail.y + jail.height - 0.1);
            context.stroke();
          }
        }
      }

      context.globalAlpha = 1;
    }

    function drawField() {
      const { width, height, border } = snapshot;
      context.fillStyle = '#0f1526';
      context.fillRect(0, 0, width, height);

      context.globalAlpha = 0.1;
      context.fillStyle = color('west');
      context.fillRect(0, 0, border, height);
      context.fillStyle = color('east');
      context.fillRect(border + 1, 0, width - border - 1, height);
      context.globalAlpha = 1;

      context.strokeStyle = '#243047';
      context.lineWidth = 0.015;
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

      context.strokeStyle = '#a6b2c9';
      context.lineWidth = 0.045;
      context.setLineDash([0.22, 0.24]);
      context.beginPath();
      context.moveTo(border + 0.5, 0);
      context.lineTo(border + 0.5, height);
      context.stroke();
      context.setLineDash([]);

      context.fillStyle = '#2a3550';
      context.shadowColor = '#536789';
      context.shadowBlur = 5 * dpr;

      snapshot.grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] === '#') context.fillRect(x + 0.07, y + 0.07, 0.86, 0.86);
        }
      });

      context.shadowBlur = 0;
      drawZones();
    }

    function pennant(x, y, team, carried) {
      context.save();
      context.translate(x, y);
      if (carried) context.scale(0.75, 0.75);

      context.strokeStyle = '#e6edf7';
      context.lineWidth = 0.065;
      context.beginPath();
      context.moveTo(-0.16, 0.35);
      context.lineTo(-0.16, -0.4);
      context.stroke();

      context.fillStyle = color(team);
      context.shadowColor = color(team);
      context.shadowBlur = 9 * dpr;
      context.beginPath();
      context.moveTo(-0.12, -0.4);
      context.lineTo(0.4, -0.22);
      context.lineTo(-0.12, -0.02);
      context.closePath();
      context.fill();
      context.restore();
    }

    function drawFlags(agents) {
      for (const team of ['west', 'east']) {
        const flag = snapshot.flags[team];

        if (flag.carrier !== null && flag.carrier !== undefined) {
          const carrier = agents.find(agent => agent.id === flag.carrier);
          if (carrier && !carrier.jailed && !carrier.respawnIn) {
            pennant(carrier.x + 0.76, carrier.y + 0.03, team, true);
          }
        } else {
          pennant(flag.x + 0.5, flag.y + 0.5, team, false);
        }
      }
    }

    function drawAgents(agents, now) {
      agents.forEach(agent => {
        if (agent.respawnIn > 0 && !agent.jailed) return;

        const x = agent.x + 0.5;
        const y = agent.y + 0.5;
        const tint = color(agent.team);

        context.save();
        context.globalAlpha = agent.jailed ? 0.35 : 1;
        context.fillStyle = tint;
        context.shadowColor = tint;
        context.shadowBlur = agent.jailed ? 0 : 10 * dpr;

        context.beginPath();
        context.arc(x, y, 0.31, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;

        context.strokeStyle = '#f4f7ff';
        context.lineWidth = 0.035;
        context.stroke();

        if (agent.carrying) {
          const radius = reduced.matches
            ? 0.43
            : 0.43 + Math.sin(now / 180) * 0.055;

          context.strokeStyle = tint;
          context.lineWidth = 0.06;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.stroke();
        }

        context.fillStyle = '#08111f';
        context.font = 'bold 0.25px system-ui, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(initials(agent.name, agent.id), x, y, 0.52);
        context.restore();
      });
    }

    function draw(now) {
      frame = null;
      if (destroyed || !snapshot || !cssWidth || !cssHeight) return;

      const ratio = window.devicePixelRatio || 1;
      if (ratio !== dpr) resize();

      context.setTransform(
        canvas.width / snapshot.width,
        0,
        0,
        canvas.height / snapshot.height,
        0,
        0,
      );

      const agents = positions(now);
      drawField();
      drawAgents(agents, now);
      drawFlags(agents);

      if (!reduced.matches && !document.hidden) schedule();
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
        width: game.width,
        height: game.height,
        grid: game.grid(),
        agents: game.agents(),
        flags: game.flags(),
        zones,
        border: zones.border,
      };

      canvas.style.setProperty('--field-ratio', `${game.width} / ${game.height}`);
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
