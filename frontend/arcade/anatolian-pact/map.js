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

  const vertex = (xy, i) => {
    const a = (i * 60 - 90) * Math.PI / 180;
    return [xy[0] + size * Math.cos(a), xy[1] + size * Math.sin(a)];
  };

  /* Edge i connects vertex i to i+1, starting with the north-east edge. */
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

  /*
   * Discard internal hex edges and stitch exposed edges into closed loops.
   * This avoids antialiased seams between neighbouring hex fills.
   */
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
        if (key(end) === first) { path.closePath(); break; }
        const next = starts.get(key(end))?.find(index => !used.has(index));
        if (next === undefined) throw new Error('Open province boundary loop');
        current = next;
      }
    }
    return path;
  }
  const paths = new Map(provinces.map(p => [p.id, unionPath(segments.get(p.id))]));

  /*
   * Union all retained map cells into one water backdrop. Land and playable
   * seas cover it later. Blank cells stay genuinely blank, including the
   * southeastern geographic cutout. No individual open-water hex is filled.
   */
  const footprintEdges = [];
  for (const h of cells) {
    edgeNeighbours(h.c, h.r).forEach(([c, r], edge) => {
      const other = map.rows[r]?.[c];
      if (other !== undefined && other !== ' ') return;
      footprintEdges.push([vertex(h.xy, edge), vertex(h.xy, edge + 1)]);
    });
  }
  const footprint = unionPath(footprintEdges);

  /* Distinguish Tuz from decorative open water using the projection. */
  const projection = PactMapData.projection;
  const lakeCells = new Set();
  for (const h of cells) {
    if (h.id !== '~') continue;
    const lon = projection.lonMin + root3 * projection.hexSize *
      (h.c + (h.r & 1) / 2 + 0.5) / projection.cosLat;
    const lat = projection.latMax - 1.5 * projection.hexSize * (h.r + 0.5);
    if (lon > 32.8 && lon < 34 && lat > 38.3 && lat < 39.4) {
      lakeCells.add(`${h.c},${h.r}`);
    }
  }
  const lakeEdges = [];
  for (const h of cells) {
    if (!lakeCells.has(`${h.c},${h.r}`)) continue;
    edgeNeighbours(h.c, h.r).forEach(([c, r], edge) => {
      if (lakeCells.has(`${c},${r}`)) return;
      lakeEdges.push([vertex(h.xy, edge), vertex(h.xy, edge + 1)]);
    });
  }
  const tuz = unionPath(lakeEdges);

  const landColor = p => {
    const hash = Array.from(p.name).reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
    const shift = hash % 11 - 5;
    return `rgb(${58 + shift},${52 + shift},${38 + shift})`;
  };
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function create(canvas, options = {}) {
    const ctx = canvas.getContext('2d');
    let game = null, view = {}, destroyed = false;
    let transform = { scale: 1, x: 0, y: 0 };
    const ratio = bounds.width / bounds.height;
    canvas.style.setProperty('--ap-map-ratio', String(ratio));
    canvas.style.aspectRatio = String(ratio);

    /*
     * Geometry is expressed in hex radii. Screen-space minimums are converted
     * back to map coordinates, so DPR and responsive CSS cannot shrink text
     * or line widths below their intended CSS-pixel sizes.
     */
    const css = pixels => pixels / transform.scale;

    function star(x, y, color, home) {
      const outer = Math.max(size * 0.48, css(3.5));
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 - Math.PI / 2;
        const radius = i % 2 ? outer * 0.43 : outer;
        const px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.strokeStyle = '#091321';
      ctx.lineWidth = css(1.5);
      ctx.stroke(); ctx.fill();
      if (home) {
        ctx.beginPath(); ctx.arc(x, y, outer * 1.35, 0, Math.PI * 2);
        ctx.strokeStyle = color; ctx.lineWidth = css(1.2); ctx.stroke();
      }
      ctx.restore();
    }

    function unit(u) {
      const p = byId.get(u.at);
      if (!p) return;
      const [x, y] = p.centre;
      const radius = size * 0.8;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = colors[u.power] || '#ffffff';
      ctx.strokeStyle = '#091321';
      ctx.lineWidth = css(1.5);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (u.type === 'fleet') {
        ctx.moveTo(-radius, -radius * 0.05);
        ctx.lineTo(radius, -radius * 0.05);
        ctx.lineTo(radius * 0.65, radius * 0.65);
        ctx.lineTo(-radius * 0.65, radius * 0.65);
        ctx.closePath();
      } else {
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
      }
      ctx.fill(); ctx.stroke();

      ctx.beginPath();
      if (u.type === 'fleet') {
        ctx.moveTo(-radius * 0.1, -radius * 0.9);
        ctx.lineTo(-radius * 0.1, -radius * 0.08);
        ctx.moveTo(radius * 0.05, -radius * 0.85);
        ctx.lineTo(radius * 0.8, -radius * 0.2);
        ctx.lineTo(radius * 0.05, -radius * 0.2);
        ctx.closePath();
      } else {
        ctx.moveTo(-radius * 0.44, -radius * 0.42);
        ctx.lineTo(radius * 0.44, -radius * 0.42);
        ctx.lineTo(radius * 0.32, radius * 0.2);
        ctx.lineTo(0, radius * 0.5);
        ctx.lineTo(-radius * 0.32, radius * 0.2);
        ctx.closePath();
      }
      ctx.stroke();
      ctx.restore();
    }

    function arrow(order, arrows) {
      const start = byId.get(order.from), end = byId.get(order.to || order.from);
      if (!start || !end) return;
      const [x, y] = start.centre;
      let [tx, ty] = end.centre;
      const failed = order.outcome && !['success', 'kept'].includes(order.outcome);
      ctx.save();
      ctx.globalAlpha = failed ? 0.4 : 0.95;
      ctx.strokeStyle = colors[order.power] || '#ffffff';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = Math.max(size * 0.16, css(3));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (order.kind === 'hold' || order.kind === 'support-hold' && order.from === order.to) {
        const radius = size * 1.1;
        ctx.strokeRect(x - radius, y - radius, radius * 2, radius * 2);
      } else {
        if (order.kind.startsWith('support')) {
          const target = arrows.find(a => a.kind === 'move' &&
            a.to === order.to && a.from !== order.from);
          const origin = target && byId.get(target.from);
          if (origin && order.kind !== 'support-hold') {
            tx = (tx + origin.centre[0]) / 2;
            ty = (ty + origin.centre[1]) / 2;
          }
          ctx.setLineDash([
            Math.max(size * 0.65, css(4)),
            Math.max(size * 0.45, css(3))
          ]);
        }

        let cx = (x + tx) / 2, cy = (y + ty) / 2;
        if (order.kind.startsWith('support')) {
          cx -= (ty - y) * 0.18;
          cy += (tx - x) * 0.18;
        }
        const angle = Math.atan2(ty - cy, tx - cx);
        const distance = Math.hypot(tx - x, ty - y);
        const clearance = Math.min(size * 0.95, distance * 0.2);
        const head = Math.min(size * 2, distance * 0.42);
        tx -= Math.cos(angle) * clearance;
        ty -= Math.sin(angle) * clearance;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(cx, cy, tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - head * Math.cos(angle - 0.36), ty - head * Math.sin(angle - 0.36));
        ctx.lineTo(tx - head * Math.cos(angle + 0.36), ty - head * Math.sin(angle + 0.36));
        ctx.closePath(); ctx.fill();
      }

      if (failed) {
        const mx = (x + tx) / 2, my = (y + ty) / 2;
        const radius = Math.max(size * 0.4, css(3));
        ctx.setLineDash([]);
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(mx - radius, my - radius); ctx.lineTo(mx + radius, my + radius);
        ctx.moveTo(mx + radius, my - radius); ctx.lineTo(mx - radius, my + radius);
        ctx.stroke();
      }
      ctx.restore();
    }

    function strokeSegments(lines, color, width) {
      ctx.beginPath();
      for (const [a, b] of lines) { ctx.moveTo(...a); ctx.lineTo(...b); }
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }

    /*
     * Split names only at spaces. Choose the shortest balanced layout that
     * fits the province's available width; never shrink below the CSS minimum.
     * Long names can use up to three lines on narrow displays.
     */
    function labelLines(name, availableWidth) {
      const words = name.split(' ');
      if (words.length === 1 || ctx.measureText(name).width <= availableWidth) return [name];

      let best = [name], bestScore = Infinity;
      function partition(index, lines) {
        if (index === words.length) {
          const widths = lines.map(line => ctx.measureText(line).width);
          const widest = Math.max(...widths);
          const overflow = Math.max(0, widest - availableWidth);
          const score = overflow * 1000 + lines.length * 12 +
            widest - Math.min(...widths);
          if (score < bestScore) { bestScore = score; best = [...lines]; }
          return;
        }
        if (lines.length === 3) return;
        for (let end = index + 1; end <= words.length; end++) {
          partition(end, [...lines, words.slice(index, end).join(' ')]);
        }
      }
      partition(0, []);
      return best;
    }

    const labelWidths = new Map(provinces.map(p => {
      const xs = p.hexes.map(([c, r]) => map.pixel(c, r)[0]);
      return [p.id, Math.max(size * 2.5, (Math.max(...xs) - Math.min(...xs) + root3 * size) * 0.82)];
    }));

    function label(p) {
      const [x, y] = p.centre;
      const sea = p.type === 'sea';
      const screenRadius = size * transform.scale;
      const areaFactor = clamp(Math.sqrt(p.hexes.length / 18), 0.9, 1.45);
      const pixels = sea ?
        clamp(screenRadius * 0.95, 11, 13) :
        clamp(screenRadius * 1.1 * areaFactor, 11, 16);
      const fontSize = css(pixels);
      ctx.save();
      ctx.font = `${sea ? 'italic 500' : '700'} ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#08111f';
      ctx.lineWidth = css(3.5);
      ctx.fillStyle = sea ? '#b8d9f5' : '#ffffff';

      const lines = labelLines(p.name, labelWidths.get(p.id));
      const lineHeight = fontSize * 1.12;
      const top = y + (sea ? size * 0.35 : size * 1.1);
      lines.forEach((line, index) => {
        const py = top + index * lineHeight;
        ctx.strokeText(line, x, py);
        ctx.fillText(line, x, py);
      });
      ctx.restore();
    }

    function draw() {
      if (destroyed) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width; canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b101b';
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

      /* One calm, solid water fill: no hex seams, grid, or repeated waves. */
      ctx.fillStyle = '#0c2038';
      ctx.fill(footprint);
      ctx.fillStyle = '#2a5a7a';
      ctx.fill(tuz);

      for (const p of provinces) {
        const path = paths.get(p.id);
        ctx.fillStyle = p.type === 'sea' ? '#163454' : landColor(p);
        ctx.fill(path);
        const owner = p.sc ? owners[p.id] : occupied.get(p.id);
        if (p.type === 'land' && owner) {
          ctx.save(); ctx.globalAlpha = p.sc ? 0.35 : 0.2;
          ctx.fillStyle = colors[owner] || '#ffffff';
          ctx.fill(path); ctx.restore();
        }
        if (highlights.has(p.id) || view.selected === p.id) {
          ctx.save(); ctx.globalAlpha = view.selected === p.id ? 0.35 : 0.2;
          ctx.fillStyle = '#ffffff';
          ctx.fill(path); ctx.restore();
        }
      }

      strokeSegments(borders, '#0b1522', Math.max(size * 0.09, css(0.8)));
      ctx.save();
      ctx.shadowColor = '#9fd3ff';
      ctx.shadowBlur = 3;
      strokeSegments(coasts, '#91bcd9', Math.max(size * 0.07, css(0.8)));
      ctx.restore();

      if (byId.has(view.selected)) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(size * 0.16, css(2));
        ctx.stroke(paths.get(view.selected));
      }

      if (!view.fog) {
        const arrows = view.arrows || [];
        arrows.forEach(a => arrow(a, arrows));
      }

      /*
       * Symbols and labels sit above orders. Stars are offset from units by
       * hex-relative distances, rather than the old fixed-coordinate offsets.
       */
      for (const p of provinces) {
        if (!p.sc) continue;
        const [px, py] = p.centre;
        star(px - size * 1.35, py - size * 0.1,
          colors[owners[p.id]] || '#ffffff', Boolean(p.home));
      }
      if (!view.fog) units.forEach(unit);
      provinces.forEach(label);
      ctx.restore();

      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#08111f';
      ctx.lineWidth = 3;
      const credit = 'Natural Earth · public domain';
      ctx.strokeText(credit, rect.width - 9, rect.height - 7);
      ctx.fillStyle = '#b0c5dc';
      ctx.fillText(credit, rect.width - 9, rect.height - 7);
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
      if (byId.has(id) && options.onProvince) options.onProvince(id, event);
    }

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    canvas.addEventListener('pointerup', hit);
    window.addEventListener('resize', draw);
    draw();

    return {
      update(nextGame, nextView = {}) { game = nextGame; view = nextView; draw(); },
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
