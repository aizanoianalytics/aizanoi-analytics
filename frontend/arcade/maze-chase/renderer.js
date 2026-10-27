(function () {
  'use strict';

  const ANGLES = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  const EYES = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1], stay: [0, 0] };

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas rendering is unavailable');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let destroyed = false;
    let frame = 0;
    let current = null;
    let previous = new Map();
    let colors = {};
    let started = 0;
    let duration = 0;
    let cssWidth = 0;
    let cssHeight = 0;
    let ratio = 1;

    function requestDraw() {
      if (!destroyed && !frame) frame = requestAnimationFrame(draw);
    }

    function resize() {
      if (destroyed) return;
      const bounds = canvas.getBoundingClientRect();
      cssWidth = bounds.width;
      cssHeight = bounds.height;
      ratio = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(cssWidth * ratio));
      const height = Math.max(1, Math.round(cssHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      requestDraw();
    }

    function snapshot(game) {
      const agents = game.agents();
      const state = agents.length ? game.botState(agents[0].id) : null;
      return {
        tick: game.tick,
        width: game.width,
        height: game.height,
        grid: game.grid(),
        agents,
        fright: state ? state.frightTicksLeft : 0,
        power: state ? state.powerPellets.length > 0 : false,
      };
    }

    function position(agent, progress) {
      const old = previous.get(agent.id);
      if (!old || reduced.matches || !old.alive || !agent.alive ||
          old.respawnIn > 0 || agent.respawnIn > 0 ||
          old.inPen !== agent.inPen ||
          Math.abs(old.x - agent.x) + Math.abs(old.y - agent.y) > 1) {
        return [agent.x, agent.y];
      }
      return [
        old.x + (agent.x - old.x) * progress,
        old.y + (agent.y - old.y) * progress,
      ];
    }

    function disc(x, y, radius, color) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    function maze(cell, offsetX, offsetY, time) {
      current.grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const tile = row[x];
          const px = offsetX + x * cell;
          const py = offsetY + y * cell;
          if (tile === '#') {
            ctx.strokeStyle = '#3b6cff';
            ctx.fillStyle = '#111f40';
            ctx.lineWidth = Math.max(1, cell * 0.065);
            ctx.shadowColor = '#3b6cff';
            ctx.shadowBlur = cell * 0.2;
            ctx.beginPath();
            ctx.roundRect(px + cell * 0.12, py + cell * 0.12,
              cell * 0.76, cell * 0.76, cell * 0.2);
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
          } else if (tile === '.') {
            disc(px + cell / 2, py + cell / 2, cell * 0.075, '#ffe8b0');
          } else if (tile === 'o') {
            const pulse = reduced.matches ? 1 : 0.87 + Math.sin(time / 180) * 0.13;
            ctx.shadowColor = '#ffe8b0';
            ctx.shadowBlur = cell * 0.4;
            disc(px + cell / 2, py + cell / 2, cell * 0.23 * pulse, '#ffe8b0');
            ctx.shadowBlur = 0;
          } else if (tile === '-') {
            ctx.strokeStyle = '#f4a9df';
            ctx.lineWidth = Math.max(1, cell * 0.12);
            ctx.beginPath();
            ctx.moveTo(px + cell * 0.1, py + cell * 0.5);
            ctx.lineTo(px + cell * 0.9, py + cell * 0.5);
            ctx.stroke();
          }
        }
      });
    }

    function runner(agent, cell, time, color) {
      if (agent.invulnerable && !reduced.matches &&
          Math.floor(time / 100) % 2 === 0) ctx.globalAlpha = 0.35;

      const mouth = reduced.matches ? 0.2 : 0.12 + (1 + Math.sin(time / 75)) * 0.13;
      const angle = ANGLES[agent.dir] ?? 0;
      const radius = cell * 0.4;

      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, mouth, Math.PI * 2 - mouth);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      disc(cell * 0.035, -cell * 0.2, cell * 0.045, '#0f1526');
      ctx.rotate(-angle);
      ctx.globalAlpha = 1;
    }

    function ghost(agent, cell, time, color) {
      const frightened = agent.frightened;
      const warning = frightened && current.fright > 0 && current.fright <= 15;
      const white = warning && (reduced.matches || Math.floor(time / 120) % 2 === 0);
      const body = frightened ? (white ? '#f4f6fb' : '#2a3cff') : color;
      const face = frightened && white ? '#2a3cff' : '#ffffff';
      const radius = cell * 0.39;
      ctx.fillStyle = body;
      ctx.shadowColor = body;
      ctx.beginPath();
      ctx.arc(0, -cell * 0.04, radius, Math.PI, 0);
      ctx.lineTo(radius, cell * 0.36);
      for (let i = 0; i < 6; i++) {
        ctx.lineTo(radius - (i + 1) * radius / 3,
          cell * (i % 2 === 0 ? 0.23 : 0.36));
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      if (frightened) {
        disc(-cell * 0.13, -cell * 0.07, cell * 0.05, face);
        disc(cell * 0.13, -cell * 0.07, cell * 0.05, face);
        ctx.strokeStyle = face;
        ctx.lineWidth = Math.max(1, cell * 0.045);
        ctx.beginPath();
        ctx.moveTo(-cell * 0.2, cell * 0.17);
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(cell * (-0.12 + i * 0.08), cell * (i % 2 ? 0.17 : 0.11));
        }
        ctx.stroke();
        return;
      }

      const look = EYES[agent.dir] || [0, 0];
      [-1, 1].forEach(side => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(side * cell * 0.15, -cell * 0.07,
          cell * 0.11, cell * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        disc(side * cell * 0.15 + look[0] * cell * 0.035,
          -cell * 0.07 + look[1] * cell * 0.045, cell * 0.055, '#152650');
      });
    }

    function agentLabel(agent, cell) {
      const text = String(agent.name || agent.id).slice(0, 28);
      ctx.font = `600 ${Math.max(7, cell * 0.3)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const width = Math.min(cell * 3.8, ctx.measureText(text).width + cell * 0.25);
      ctx.fillStyle = '#0f1526';
      ctx.globalAlpha = 0.9;
      ctx.fillRect(-width / 2, cell * 0.4, width, cell * 0.4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f4f6fb';
      ctx.fillText(text, 0, cell * 0.61, width - cell * 0.12);
    }

    function draw(time) {
      frame = 0;
      if (destroyed || !current || !cssWidth || !cssHeight) return;

      const nextRatio = Math.max(1, window.devicePixelRatio || 1);
      if (ratio !== nextRatio) resize();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = '#0f1526';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      const cell = Math.min(cssWidth / current.width, cssHeight / current.height);
      const offsetX = (cssWidth - cell * current.width) / 2;
      const offsetY = (cssHeight - cell * current.height) / 2;
      const progress = duration ? Math.min(1, Math.max(0, (time - started) / duration)) : 1;
      maze(cell, offsetX, offsetY, time);

      current.agents.forEach(agent => {
        if (!agent.alive || agent.respawnIn > 0) return;
        const [x, y] = position(agent, progress);
        const color = colors[agent.id] || '#ffd84d';
        ctx.save();
        ctx.translate(offsetX + (x + 0.5) * cell, offsetY + (y + 0.5) * cell);
        ctx.shadowColor = color;
        ctx.shadowBlur = cell * 0.4;
        if (agent.role === 'runner') runner(agent, cell, time, color);
        else ghost(agent, cell, time, color);
        ctx.shadowBlur = 0;
        agentLabel(agent, cell);
        ctx.restore();
      });

      const moving = !reduced.matches &&
        (progress < 1 || current.power || current.agents.some(agent =>
          agent.alive && (agent.role === 'runner' || agent.frightened)));
      if (moving) requestDraw();
    }

    function update(game, nextColors = {}, options = {}) {
      if (destroyed) return;
      previous = new Map((current ? current.agents : []).map(agent => [agent.id, agent]));
      current = snapshot(game);
      colors = { ...nextColors };
      started = performance.now();
      duration = reduced.matches ? 0 : Math.max(0, Number(options.duration) || 0);
      resize();
      requestDraw();
    }

    function motionChanged() {
      if (reduced.matches) duration = 0;
      requestDraw();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener('resize', resize);
    reduced.addEventListener('change', motionChanged);
    resize();

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      window.removeEventListener('resize', resize);
      reduced.removeEventListener('change', motionChanged);
      current = null;
      previous.clear();
    }

    return { update, destroy };
  }

  window.MazeRenderer = { create };
})();
