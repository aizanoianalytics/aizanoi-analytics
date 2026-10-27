(function () {
  'use strict';

  const map = PactEngine.MAP;
  const list = value => Array.isArray(value) ? value : Object.values(value);
  const provinces = list(map.provinces);
  const byId = new Map(provinces.map(p => [p.id, p]));
  const powers = Array.isArray(map.powers) ? map.powers :
    Object.entries(map.powers).map(([id, p]) => ({ id, ...p }));
  const colors = Object.fromEntries(powers.map(p => [p.id || p.name, p.color]));
  const root3 = Math.sqrt(3);
  const logical = (col, row) => [root3 * (col + (row & 1) / 2), row * 1.5];

  // Recover the engine's pixel origin and scale from its province centroids.
  function fit(axis) {
    const points = provinces.map(p => {
      const mean = p.hexes.reduce((sum, h) => sum + logical(...h)[axis], 0) / p.hexes.length;
      return [mean, p.centre[axis]];
    });
    const x = points.reduce((s, p) => s + p[0], 0) / points.length;
    const y = points.reduce((s, p) => s + p[1], 0) / points.length;
    const den = points.reduce((s, p) => s + (p[0] - x) ** 2, 0);
    const scale = points.reduce((s, p) => s + (p[0] - x) * (p[1] - y), 0) / den;
    return { scale, offset: y - scale * x };
  }

  const fx = fit(0);
  const fy = fit(1);
  const size = (fx.scale + fy.scale) / 2;
  const point = (col, row) => {
    const [x, y] = logical(col, row);
    return [x * size + fx.offset, y * size + fy.offset];
  };
  const cells = [];
  map.rows.forEach((row, r) => [...row].forEach((id, c) => {
    if (id !== ' ') cells.push({ id, c, r, xy: point(c, r) });
  }));
  const bounds = {
    left: Math.min(...cells.map(h => h.xy[0])) - size - 8,
    top: Math.min(...cells.map(h => h.xy[1])) - size - 8,
    right: Math.max(...cells.map(h => h.xy[0])) + size + 8,
    bottom: Math.max(...cells.map(h => h.xy[1])) + size + 8
  };
  bounds.width = bounds.right - bounds.left;
  bounds.height = bounds.bottom - bounds.top;

  function neighbors(c, r) {
    const odd = r & 1;
    return [
      [c + odd, r - 1], [c + 1, r], [c + odd, r + 1],
      [c - 1 + odd, r + 1], [c - 1, r], [c - 1 + odd, r - 1]
    ];
  }

  function create(canvas, options = {}) {
    const ctx = canvas.getContext('2d');
    let game = null;
    let view = {};
    let transform = { scale: 1, x: 0, y: 0 };
    let destroyed = false;
    canvas.style.setProperty('--ap-map-ratio', String(bounds.width / bounds.height));

    function polygon(x, y) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 90) * Math.PI / 180;
        const px = x + size * Math.cos(angle);
        const py = y + size * Math.sin(angle);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
    }

    function star(x, y, color, home) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 - Math.PI / 2;
        const radius = i % 2 ? 3 : 7;
        ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      if (home) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }

    function unit(u) {
      const p = byId.get(u.at);
      if (!p) return;
      const [x, y] = p.centre;
      ctx.fillStyle = colors[u.power] || '#ffffff';
      ctx.strokeStyle = '#0b0f18';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (u.type === 'fleet') {
        ctx.roundRect(x - 10, y - 8, 20, 10, [2, 2, 7, 7]);
      } else {
        ctx.arc(x, y - 4, 9, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      if (u.type === 'fleet') {
        ctx.moveTo(x, y - 17);
        ctx.lineTo(x, y - 7);
        ctx.moveTo(x + 1, y - 16);
        ctx.lineTo(x + 8, y - 9);
        ctx.lineTo(x + 1, y - 9);
      } else {
        ctx.moveTo(x - 4, y - 8);
        ctx.lineTo(x + 4, y - 8);
        ctx.lineTo(x + 3, y - 2);
        ctx.lineTo(x, y + 1);
        ctx.lineTo(x - 3, y - 2);
        ctx.closePath();
      }
      ctx.stroke();
    }

    function arrow(order, arrows) {
      const start = byId.get(order.from);
      const end = byId.get(order.to || order.from);
      if (!start || !end) return;
      const [x, y] = start.centre;
      let [tx, ty] = end.centre;
      const failed = order.outcome && !['success', 'kept'].includes(order.outcome);
      ctx.save();
      ctx.globalAlpha = failed ? 0.4 : 0.95;
      ctx.strokeStyle = colors[order.power] || '#ffffff';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 3;
      if (order.kind === 'hold' || order.kind === 'support-hold' && order.from === order.to) {
        ctx.strokeRect(x - 12, y - 15, 24, 24);
      } else {
        let cx = (x + tx) / 2;
        let cy = (y + ty) / 2;
        if (order.kind.startsWith('support')) {
          const target = arrows.find(a => a.kind === 'move' && a.to === order.to && a.from !== order.from);
          if (target && order.kind !== 'support-hold') {
            const origin = byId.get(target.from);
            tx = (tx + origin.centre[0]) / 2;
            ty = (ty + origin.centre[1]) / 2;
          }
          cx = (x + tx) / 2 - (ty - y) * 0.18;
          cy = (y + ty) / 2 + (tx - x) * 0.18;
          ctx.setLineDash([6, 5]);
        }
        const angle = Math.atan2(ty - cy, tx - cx);
        tx -= Math.cos(angle) * 11;
        ty -= Math.sin(angle) * 11;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(cx, cy, tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - 9 * Math.cos(angle - 0.45), ty - 9 * Math.sin(angle - 0.45));
        ctx.lineTo(tx - 9 * Math.cos(angle + 0.45), ty - 9 * Math.sin(angle + 0.45));
        ctx.closePath();
        ctx.fill();
      }
      if (failed) {
        const mx = (x + tx) / 2;
        const my = (y + ty) / 2;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(mx - 5, my - 5);
        ctx.lineTo(mx + 5, my + 5);
        ctx.moveTo(mx + 5, my - 5);
        ctx.lineTo(mx - 5, my + 5);
        ctx.stroke();
      }
      ctx.restore();
    }

    function draw() {
      if (destroyed) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0f1526';
      ctx.fillRect(0, 0, rect.width, rect.height);
      const scale = Math.min(rect.width / bounds.width, rect.height / bounds.height);
      const x = (rect.width - bounds.width * scale) / 2 - bounds.left * scale;
      const y = (rect.height - bounds.height * scale) / 2 - bounds.top * scale;
      transform = { scale, x, y };
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      const owners = game ? game.owners() : {};
      const units = game ? game.units() : [];
      const occupied = new Map(units.map(u => [u.at, u.power]));
      const highlights = new Set(view.highlight || []);

      for (const h of cells) {
        const [hx, hy] = h.xy;
        const p = byId.get(h.id);
        if (!p) {
          ctx.strokeStyle = '#193044';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(hx - size / 3, hy);
          ctx.quadraticCurveTo(hx, hy - 3, hx + size / 3, hy);
          ctx.stroke();
          continue;
        }
        polygon(hx, hy);
        ctx.fillStyle = p.type === 'sea' ? '#12305a' : '#2a3550';
        ctx.fill();
        const owner = p.sc ? owners[p.id] : occupied.get(p.id);
        if (p.type === 'land' && owner) {
          ctx.save();
          ctx.globalAlpha = p.sc ? 0.35 : 0.2;
          ctx.fillStyle = colors[owner] || '#ffffff';
          ctx.fill();
          ctx.restore();
        }
        if (highlights.has(p.id) || view.selected === p.id) {
          ctx.save();
          ctx.globalAlpha = view.selected === p.id ? 0.35 : 0.2;
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.restore();
        }
        const ns = neighbors(h.c, h.r);
        for (let i = 0; i < 6; i++) {
          const [nc, nr] = ns[i];
          if (map.rows[nr] && map.rows[nr][nc] === h.id) continue;
          const a = (i * 60 - 90) * Math.PI / 180;
          const b = ((i + 1) * 60 - 90) * Math.PI / 180;
          ctx.beginPath();
          ctx.moveTo(hx + size * Math.cos(a), hy + size * Math.sin(a));
          ctx.lineTo(hx + size * Math.cos(b), hy + size * Math.sin(b));
          ctx.strokeStyle = view.selected === p.id ? '#ffffff' : '#0b0f18';
          ctx.lineWidth = view.selected === p.id ? 2.8 : 2;
          ctx.stroke();
        }
      }

      for (const p of provinces) {
        const [px, py] = p.centre;
        if (p.sc) {
          star(px - 17, py - 6, colors[owners[p.id]] || '#ffffff', Boolean(p.home));
        }
        ctx.font = `${p.type === 'sea' ? 'italic ' : ''}${Math.max(10, size * 0.48)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.strokeStyle = '#0b0f18';
        ctx.lineWidth = 3;
        ctx.strokeText(p.name, px, py + 10);
        ctx.fillStyle = p.type === 'sea' ? '#a9c7ed' : '#f1f5fc';
        ctx.fillText(p.name, px, py + 10);
      }
      if (!view.fog) {
        units.forEach(unit);
        const arrows = view.arrows || [];
        arrows.forEach(a => arrow(a, arrows));
      }
    }

    function hit(event) {
      if (destroyed || !transform.scale) return;
      const rect = canvas.getBoundingClientRect();
      const px = ((event.clientX - rect.left - transform.x) / transform.scale - fx.offset) / size;
      const py = ((event.clientY - rect.top - transform.y) / transform.scale - fy.offset) / size;
      const q = root3 / 3 * px - py / 3;
      const r = 2 / 3 * py;
      let rx = Math.round(q);
      let rz = Math.round(r);
      const ry = Math.round(-q - r);
      const dx = Math.abs(rx - q);
      const dz = Math.abs(rz - r);
      const dy = Math.abs(ry + q + r);
      if (dx > dy && dx > dz) rx = -ry - rz;
      else if (dz > dy) rz = -rx - ry;
      const col = rx + (rz - (rz & 1)) / 2;
      const id = map.rows[rz] && map.rows[rz][col];
      if (byId.has(id) && options.onProvince) options.onProvince(id, event);
    }

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    canvas.addEventListener('pointerup', hit);
    window.addEventListener('resize', draw);
    draw();

    return {
      update(nextGame, nextView = {}) {
        game = nextGame;
        view = nextView;
        draw();
      },
      destroy() {
        destroyed = true;
        observer.disconnect();
        canvas.removeEventListener('pointerup', hit);
        window.removeEventListener('resize', draw);
      }
    };
  }

  window.PactMap = { create };
})();
