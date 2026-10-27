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
        tick: game.tick, width: game.width, height: game.height,
        grid: game.grid(), agents,
        fright: state ? state.frightTicksLeft : 0,
        power: state ? state.powerPellets.length > 0 : false,
        finished: game.finished(),
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

    function wallOutline(cell, offsetX, offsetY) {
      const edges = [];
      const outgoing = new Map();
      const wall = (x, y) => Boolean(current.grid[y] && current.grid[y][x] === '#');

      function edge(x, y, nextX, nextY, direction) {
        const segment = { x, y, nextX, nextY, direction, used: false };
        const key = `${x},${y}`;
        if (!outgoing.has(key)) outgoing.set(key, []);
        outgoing.get(key).push(segment);
        edges.push(segment);
      }

      ctx.fillStyle = '#111d35';
      current.grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] !== '#') continue;
          ctx.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
          if (!wall(x, y - 1)) edge(x, y, x + 1, y, 0);
          if (!wall(x + 1, y)) edge(x + 1, y, x + 1, y + 1, 1);
          if (!wall(x, y + 1)) edge(x + 1, y + 1, x, y + 1, 2);
          if (!wall(x - 1, y)) edge(x, y + 1, x, y, 3);
        }
      });
      ctx.save();
      ctx.beginPath();
      for (const first of edges) {
        if (first.used) continue;
        const vertices = [];
        let segment = first;
        while (segment && !segment.used) {
          segment.used = true;
          vertices.push([segment.x, segment.y]);
          if (segment.nextX === first.x && segment.nextY === first.y) break;
          const candidates = outgoing.get(`${segment.nextX},${segment.nextY}`) || [];
          const direction = segment.direction;
          segment = [1, 0, 3, 2].map(turn => candidates.find(candidate =>
            !candidate.used && candidate.direction === (direction + turn) % 4
          )).find(Boolean);
        }
        if (vertices.length < 3) continue;
        const corners = vertices.map((vertex, index) => {
          const before = vertices[(index + vertices.length - 1) % vertices.length];
          const after = vertices[(index + 1) % vertices.length];
          const radius = 0.16;
          return {
            x: offsetX + vertex[0] * cell,
            y: offsetY + vertex[1] * cell,
            entryX: offsetX + (vertex[0] + (before[0] - vertex[0]) * radius) * cell,
            entryY: offsetY + (vertex[1] + (before[1] - vertex[1]) * radius) * cell,
            exitX: offsetX + (vertex[0] + (after[0] - vertex[0]) * radius) * cell,
            exitY: offsetY + (vertex[1] + (after[1] - vertex[1]) * radius) * cell,
          };
        });
        ctx.moveTo(corners[0].entryX, corners[0].entryY);
        corners.forEach(corner => {
          ctx.lineTo(corner.entryX, corner.entryY);
          ctx.quadraticCurveTo(corner.x, corner.y, corner.exitX, corner.exitY);
        });
        ctx.closePath();
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#4779ff';
      ctx.lineWidth = Math.max(1.5, cell * 0.09);
      ctx.shadowColor = '#3467ff';
      ctx.shadowBlur = cell * 0.22;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#a6c3ff';
      ctx.lineWidth = Math.max(0.6, cell * 0.025);
      ctx.globalAlpha = 0.65;
      ctx.stroke();
      ctx.restore();
    }

    function maze(cell, offsetX, offsetY, time) {
      wallOutline(cell, offsetX, offsetY);
      current.grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const tile = row[x];
          const px = offsetX + x * cell;
          const py = offsetY + y * cell;
          if (tile === '.') {
            disc(px + cell / 2, py + cell / 2, Math.max(1, cell * 0.075), '#ffe8b0');
          } else if (tile === 'o') {
            const pulse = reduced.matches || current.finished
              ? 1 : 0.9 + Math.sin(time / 300) * 0.1;
            ctx.shadowColor = '#ffe8b0';
            ctx.shadowBlur = cell * 0.35;
            disc(px + cell / 2, py + cell / 2, cell * 0.23 * pulse, '#ffe8b0');
            ctx.shadowBlur = 0;
          } else if (tile === '-') {
            ctx.strokeStyle = '#ffade7';
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
      if (agent.invulnerable) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, cell * 0.055);
        ctx.beginPath();
        ctx.arc(0, 0, cell * 0.47, 0, Math.PI * 2);
        ctx.stroke();
      }
      const mouth = reduced.matches || current.finished
        ? 0.2 : 0.12 + (1 + Math.sin(time / 110)) * 0.13;
      const angle = ANGLES[agent.dir] ?? 0;
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, cell * 0.4, mouth, Math.PI * 2 - mouth);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      disc(cell * 0.035, -cell * 0.2, cell * 0.045, '#081120');
      ctx.rotate(-angle);
    }

    function ghost(agent, cell, color) {
      const frightened = agent.frightened;
      const warning = frightened && current.fright > 0 && current.fright <= 15;
      const body = frightened ? '#4d66ff' : color;
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
        disc(-cell * 0.13, -cell * 0.07, cell * 0.05, '#ffffff');
        disc(cell * 0.13, -cell * 0.07, cell * 0.05, '#ffffff');
        ctx.strokeStyle = warning ? '#ffe28a' : '#ffffff';
        ctx.lineWidth = Math.max(1, cell * 0.05);
        ctx.beginPath();
        ctx.moveTo(-cell * 0.2, cell * 0.17);
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(cell * (-0.12 + i * 0.08), cell * (i % 2 ? 0.17 : 0.11));
        }
        ctx.stroke();
        if (warning) {
          ctx.fillStyle = '#ffe28a';
          ctx.fillRect(-cell * 0.025, -cell * 0.3, cell * 0.05, cell * 0.1);
        }
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

    function marker(agent, cell, x, y, index) {
      const number = /^[rg]\d+$/.test(agent.id)
        ? agent.id.slice(1) : String(index + 1);
      const text = `${agent.role === 'runner' ? 'R' : 'G'}${number}`;
      const size = Math.max(8, cell * 0.29);
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const width = ctx.measureText(text).width + 5;
      const height = size + 3;
      const px = Math.max(width / 2, Math.min(cssWidth - width / 2, x));
      const py = Math.max(height / 2, Math.min(cssHeight - height / 2, y + cell * 0.58));
      ctx.fillStyle = '#081120';
      ctx.fillRect(px - width / 2, py - height / 2, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, px, py);
    }

    function draw(time) {
      frame = 0;
      if (destroyed || !current || !cssWidth || !cssHeight) return;
      const nextRatio = Math.max(1, window.devicePixelRatio || 1);
      if (ratio !== nextRatio) resize();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = '#081120';
      ctx.fillRect(0, 0, cssWidth, cssHeight);
      const cell = Math.min(cssWidth / current.width, cssHeight / current.height);
      const offsetX = (cssWidth - cell * current.width) / 2;
      const offsetY = (cssHeight - cell * current.height) / 2;
      const progress = duration ? Math.min(1, Math.max(0, (time - started) / duration)) : 1;
      maze(cell, offsetX, offsetY, time);
      const visible = [];
      const indices = { runner: 0, ghost: 0 };
      current.agents.forEach(agent => {
        const index = indices[agent.role]++;
        if (!agent.alive || agent.respawnIn > 0) return;
        const [x, y] = position(agent, progress);
        const px = offsetX + (x + 0.5) * cell;
        const py = offsetY + (y + 0.5) * cell;
        const color = colors[agent.id] || '#ffd84d';
        visible.push({ agent, x: px, y: py, index });
        ctx.save();
        ctx.translate(px, py);
        ctx.shadowColor = color;
        ctx.shadowBlur = cell * 0.25;
        if (agent.role === 'runner') runner(agent, cell, time, color);
        else ghost(agent, cell, color);
        ctx.restore();
      });
      ctx.save();
      ctx.shadowBlur = 0;
      visible.forEach(item => marker(item.agent, cell, item.x, item.y, item.index));
      ctx.restore();

      const moving = !reduced.matches && (progress < 1 || (!current.finished &&
        (current.power || current.agents.some(a =>
          a.alive && !a.respawnIn && (a.role === 'runner' || a.frightened)))));
      if (moving) requestDraw();
    }

    function update(game, nextColors = {}, options = {}) {
      if (destroyed) return;
      previous = new Map((current ? current.agents : []).map(agent => [agent.id, agent]));
      current = snapshot(game);
      colors = { ...nextColors };
      started = performance.now();
      duration = reduced.matches ? 0 : Math.max(0, Number(options.duration) || 0);
      canvas.setAttribute('aria-label',
        `Maze Chase, tick ${current.tick}. ` +
        `${current.agents.filter(a => a.role === 'runner' && a.alive).length} runners remaining. ` +
        'Seat markers R1–R4 and G1–G6 correspond to the score cards.');
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
