(function () {
  'use strict';

  const map = PactEngine.MAP;
  const provinces = Object.values(map.provinces);
  const byId = new Map(provinces.map(p => [p.id, p]));
  const colors = Object.fromEntries(map.powers.map(p => [p.id, p.color]));
  const size = map.hexSize;
  const root3 = Math.sqrt(3);
  const cells = [];
  map.rows.forEach((row, r) => Array.from(row).forEach((id, c) => {
    if (id !== ' ') cells.push({ id, c, r, xy: map.pixel(c, r) });
  }));
  const pad = size * 1.12;
  const bounds = {
    left: Math.min(...cells.map(h => h.xy[0])) - pad,
    top: Math.min(...cells.map(h => h.xy[1])) - pad,
    right: Math.max(...cells.map(h => h.xy[0])) + pad,
    bottom: Math.max(...cells.map(h => h.xy[1])) + pad
  };
  bounds.width = bounds.right - bounds.left;
  bounds.height = bounds.bottom - bounds.top;

  function vertex(xy, i) {
    const a = (i * 60 - 90) * Math.PI / 180;
    return [xy[0] + size * Math.cos(a), xy[1] + size * Math.sin(a)];
  }

  function edgeNeighbours(c, r) {
    const odd = r & 1;
    return [[c + odd, r - 1], [c + 1, r], [c + odd, r + 1],
      [c - 1 + odd, r + 1], [c - 1, r], [c - 1 + odd, r - 1]];
  }

  const segments = new Map(provinces.map(p => [p.id, []]));
  const borders = [], coasts = [];
  for (const h of cells) {
    const p = byId.get(h.id);
    if (!p) continue;
    edgeNeighbours(h.c, h.r).forEach(([c, r], edge) => {
      const otherId = map.rows[r]?.[c];
      if (otherId === h.id) return;
      const a = vertex(h.xy, edge), b = vertex(h.xy, edge + 1);
      segments.get(h.id).push([a, b]);
      const other = byId.get(otherId);
      if (other && h.id > otherId) return;
      borders.push([a, b]);
      if (p.type === 'land' && (other?.type === 'sea' || otherId === '~') ||
          p.type === 'sea' && other?.type === 'land') coasts.push([a, b]);
    });
  }

  const key = p => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
  function unionPath(edges) {
    const path = new Path2D();
    const starts = new Map();
    edges.forEach((edge, i) => {
      const k = key(edge[0]);
      if (!starts.has(k)) starts.set(k, []);
      starts.get(k).push(i);
    });
    const used = new Set();
    for (let i = 0; i < edges.length; i++) {
      if (used.has(i)) continue;
      let current = i;
      const first = key(edges[i][0]);
      path.moveTo(...edges[i][0]);
      for (;;) {
        if (used.has(current)) throw new Error('Invalid province boundary loop');
        used.add(current);
        const end = edges[current][1];
        path.lineTo(...end);
        if (key(end) === first) {
          path.closePath();
          break;
        }
        const next = starts.get(key(end))?.find(index => !used.has(index));
        if (next === undefined) throw new Error('Open province boundary loop');
        current = next;
      }
    }
    return path;
  }
  const paths = new Map(provinces.map(p => [p.id, unionPath(segments.get(p.id))]));
  const footprintEdges = [];
  for (const h of cells) {
    edgeNeighbours(h.c, h.r).forEach(([c, r], edge) => {
      const other = map.rows[r]?.[c];
      if (other !== undefined && other !== ' ') return;
      footprintEdges.push([vertex(h.xy, edge), vertex(h.xy, edge + 1)]);
    });
  }
  const footprint = unionPath(footprintEdges);

  const projection = PactMapData.projection;
  const lakeCells = new Set();
  for (const h of cells) {
    if (h.id !== '~') continue;
    const lon = projection.lonMin + root3 * projection.hexSize *
      (h.c + (h.r & 1) / 2 + 0.5) / projection.cosLat;
    const lat = projection.latMax - 1.5 * projection.hexSize * (h.r + 0.5);
    if (lon > 32.8 && lon < 34 && lat > 38.3 && lat < 39.4) lakeCells.add(`${h.c},${h.r}`);
  }
  const lakeEdges = [];
  for (const h of cells) {
    if (!lakeCells.has(`${h.c},${h.r}`)) continue;
    edgeNeighbours(h.c, h.r).forEach(([c, r], edge) => {
      if (!lakeCells.has(`${c},${r}`)) lakeEdges.push([vertex(h.xy, edge), vertex(h.xy, edge + 1)]);
    });
  }
  const tuz = unionPath(lakeEdges);

  function create(canvas, options = {}) {
    const ctx = canvas.getContext('2d');
    let game = null, view = {}, destroyed = false;
    let transform = { scale: 1, x: 0, y: 0 };
    canvas.style.setProperty('--ap-map-ratio', String(bounds.width / bounds.height));
    const css = pixels => pixels / transform.scale;

    function star(x, y, color, home) {
      const outer = Math.max(size * 0.48, css(3));
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 - Math.PI / 2;
        const r = i % 2 ? outer * 0.43 : outer;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.strokeStyle = '#081321';
      ctx.lineWidth = css(1.3);
      ctx.stroke();
      ctx.fill();
      if (home) {
        ctx.beginPath();
        ctx.arc(x, y, outer * 1.4, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = css(1);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawUnit(u) {
      const p = byId.get(u.at);
      if (!p) return;
      const radius = Math.max(size * 0.8, css(4.5));
      ctx.save();
      ctx.translate(...p.centre);
      ctx.fillStyle = colors[u.power] || '#ffffff';
      ctx.strokeStyle = '#081321';
      ctx.lineWidth = css(1.4);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (u.type === 'fleet') {
        ctx.moveTo(-radius, -radius * 0.05);
        ctx.lineTo(radius, -radius * 0.05);
        ctx.lineTo(radius * 0.6, radius * 0.65);
        ctx.lineTo(-radius * 0.6, radius * 0.65);
        ctx.closePath();
      } else ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      if (u.type === 'fleet') {
        ctx.moveTo(0, -radius);
        ctx.lineTo(0, 0);
        ctx.moveTo(radius * 0.15, -radius * 0.9);
        ctx.lineTo(radius * 0.8, -radius * 0.2);
        ctx.lineTo(radius * 0.15, -radius * 0.2);
        ctx.closePath();
      } else {
        ctx.moveTo(-radius * 0.4, -radius * 0.35);
        ctx.lineTo(radius * 0.4, -radius * 0.35);
        ctx.lineTo(0, radius * 0.5);
        ctx.closePath();
      }
      ctx.stroke();
      ctx.restore();
    }

    function arrow(order) {
      const start = byId.get(order.from), end = byId.get(order.to || order.from);
      if (!start || !end) return;
      const [x, y] = start.centre;
      let [tx, ty] = end.centre;
      const failed = order.outcome && order.outcome !== 'success';
      ctx.save();
      ctx.globalAlpha = failed ? 0.55 : 0.95;
      ctx.strokeStyle = colors[order.power] || '#ffffff';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = css(2.4);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (order.kind === 'hold') {
        const r = Math.max(size, css(6));
        ctx.strokeRect(x - r, y - r, 2 * r, 2 * r);
      } else {
        const supporting = order.kind.startsWith('support');
        if (supporting) ctx.setLineDash([css(5), css(4)]);
        const dx = tx - x, dy = ty - y;
        const bend = supporting ? 0.14 : 0;
        const cx = (x + tx) / 2 - dy * bend, cy = (y + ty) / 2 + dx * bend;
        const angle = Math.atan2(ty - cy, tx - cx);
        const length = Math.hypot(dx, dy);
        const clearance = Math.min(Math.max(size, css(6)), length * 0.25);
        tx -= Math.cos(angle) * clearance;
        ty -= Math.sin(angle) * clearance;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(cx, cy, tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);
        const head = Math.min(css(10), length * 0.3);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - head * Math.cos(angle - 0.4), ty - head * Math.sin(angle - 0.4));
        ctx.lineTo(tx - head * Math.cos(angle + 0.4), ty - head * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
      }
      if (failed) {
        const mx = (x + tx) / 2, my = (y + ty) / 2, r = css(3);
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(mx - r, my - r);
        ctx.lineTo(mx + r, my + r);
        ctx.moveTo(mx + r, my - r);
        ctx.lineTo(mx - r, my + r);
        ctx.stroke();
      }
      ctx.restore();
    }

    function strokeSegments(lines, color, width) {
      ctx.beginPath();
      for (const [a, b] of lines) {
        ctx.moveTo(...a);
        ctx.lineTo(...b);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    function labels(rect, units) {
      const compact = rect.width < 620;
      const boxes = [];
      const gap = css(3);
      const overlaps = (a, b) =>
        a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
        a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
      units.forEach(u => {
        const p = byId.get(u.at);
        if (p) boxes.push({
          x: p.centre[0] - css(5), y: p.centre[1] - css(7),
          w: css(10), h: css(14)
        });
      });
      const sorted = [...provinces].sort((a, b) =>
        Number(b.id === view.selected || b.id === view.inspected) -
          Number(a.id === view.selected || a.id === view.inspected) ||
        Number(b.sc) - Number(a.sc) ||
        Number(a.type === 'sea') - Number(b.type === 'sea') ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const p of sorted) {
        const sea = p.type === 'sea';
        const font = css(compact ? 10 : sea ? 11 : 12);
        ctx.font = `${sea ? 'italic 500' : '700'} ${font}px system-ui, sans-serif`;
        const words = compact ? [p.id] : p.name.split(' ');
        let lines = [words.join(' ')];
        if (!compact && words.length > 1 && ctx.measureText(lines[0]).width > css(90)) {
          const middle = Math.ceil(words.length / 2);
          lines = [words.slice(0, middle).join(' '), words.slice(middle).join(' ')];
        }
        const w = Math.max(...lines.map(line => ctx.measureText(line).width)) + css(4);
        const h = font * 1.15 * lines.length;
        const [x, y] = p.centre;
        const offsets = [
          [0, css(9)], [0, -h - css(10)],
          [w * 0.25, css(12)], [-w * 0.25, -h - css(12)]
        ];
        let box = null;
        for (const [dx, dy] of offsets) {
          const candidate = { x: x + dx - w / 2, y: y + dy, w, h };
          const sx = candidate.x * transform.scale + transform.x;
          const sy = candidate.y * transform.scale + transform.y;
          if (sx < 3 || sy < 3 || sx + w * transform.scale > rect.width - 3 ||
              sy + h * transform.scale > rect.height - 18) continue;
          if (!boxes.some(other => overlaps(candidate, other))) {
            box = candidate;
            break;
          }
        }
        if (!box) continue;
        boxes.push(box);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#07111f';
        ctx.lineWidth = css(3);
        ctx.fillStyle = sea ? '#b7d9f2' : '#f5f8ff';
        lines.forEach((line, i) => {
          const ly = box.y + i * font * 1.15;
          ctx.strokeText(line, box.x + box.w / 2, ly);
          ctx.fillText(line, box.x + box.w / 2, ly);
        });
      }
    }

    function draw() {
      if (destroyed) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const backdrop = ctx.createLinearGradient(0, 0, rect.width, rect.height);
      backdrop.addColorStop(0, '#101c31');
      backdrop.addColorStop(1, '#080f1d');
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, rect.width, rect.height);
      const scale = Math.min(rect.width / bounds.width, rect.height / bounds.height);
      const x = (rect.width - bounds.width * scale) / 2 - bounds.left * scale;
      const y = (rect.height - bounds.height * scale) / 2 - bounds.top * scale;
      transform = { scale, x, y };
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      const owners = game ? game.owners() : {};
      const units = game ? game.units() : [];
      const occupied = new Map(units.map(u => [u.at, u.power]));
      const highlights = new Set(view.highlight || []);
      ctx.fillStyle = '#0c2038';
      ctx.fill(footprint);
      ctx.fillStyle = '#376c89';
      ctx.fill(tuz);
      for (const p of provinces) {
        const path = paths.get(p.id);
        ctx.fillStyle = p.type === 'sea' ? '#173954' : '#343d40';
        ctx.fill(path);
        const owner = p.sc ? owners[p.id] : occupied.get(p.id);
        if (p.type === 'land' && owner) {
          ctx.save();
          ctx.globalAlpha = p.sc ? 0.45 : 0.27;
          ctx.fillStyle = colors[owner] || '#ffffff';
          ctx.fill(path);
          ctx.restore();
        }
        if (highlights.has(p.id) || view.selected === p.id) {
          ctx.save();
          ctx.globalAlpha = view.selected === p.id ? 0.4 : 0.23;
          ctx.fillStyle = '#c6f8ff';
          ctx.fill(path);
          ctx.restore();
        }
      }
      strokeSegments(borders, '#081522', css(0.9));
      ctx.save();
      ctx.shadowColor = '#6dccff';
      ctx.shadowBlur = 3;
      strokeSegments(coasts, '#83b7d2', css(0.8));
      ctx.restore();
      for (const id of new Set([view.selected, view.inspected])) {
        if (!byId.has(id)) continue;
        ctx.strokeStyle = id === view.selected ? '#ffffff' : '#7eeaff';
        ctx.lineWidth = css(2);
        ctx.stroke(paths.get(id));
      }
      if (!view.fog) (view.arrows || []).forEach(arrow);
      for (const p of provinces) {
        if (!p.sc) continue;
        const offset = Math.max(size * 1.35, css(9));
        star(p.centre[0] - offset, p.centre[1],
          colors[owners[p.id]] || '#e7effa', Boolean(p.home));
      }
      if (!view.fog) units.forEach(drawUnit);
      labels(rect, view.fog ? [] : units);
      ctx.restore();
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#b3c9df';
      ctx.fillText('Natural Earth · public domain', rect.width - 8, rect.height - 5);
    }

    function hit(event) {
      if (destroyed || !transform.scale) return;
      const rect = canvas.getBoundingClientRect();
      const origin = map.pixel(0, 0);
      const px = ((event.clientX - rect.left - transform.x) / transform.scale - origin[0]) / size;
      const py = ((event.clientY - rect.top - transform.y) / transform.scale - origin[1]) / size;
      const q = root3 / 3 * px - py / 3, r = 2 / 3 * py;
      let rx = Math.round(q), rz = Math.round(r);
      const ry = Math.round(-q - r);
      const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
      if (dx > dy && dx > dz) rx = -ry - rz;
      else if (dz > dy) rz = -rx - ry;
      const col = rx + (rz - (rz & 1)) / 2;
      const id = map.rows[rz]?.[col];
      if (byId.has(id)) options.onProvince?.(id, event);
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
