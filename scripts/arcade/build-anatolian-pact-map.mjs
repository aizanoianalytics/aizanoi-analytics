/**
 * Natural Earth 1:50m land and lakes, public domain:
 * https://www.naturalearthdata.com/about/terms-of-use/
 *
 * No network access or dependencies. Node >= 22.
 *
 * Province seeds are real archaeological sites. Initial ownership is a
 * land-constrained hex-distance Voronoi partition. A connected boundary-cell
 * balancing pass reduces oversized inland provinces without moving city seeds.
 * Provinces smaller than three hexes still merge into their longest-border
 * neighbour.
 *
 * Rasterisation cannot preserve sub-hex straits. The Bosporus and Dardanelles
 * are opened along their real geographic centre lines. Other islands except
 * Cyprus, and disconnected sub-hex coastal fragments, are suppressed.
 *
 * Pointy hexes use one uniform geographic scale, corrected by cos(39 degrees).
 * The cropped bounds and approximately 0.128-degree radius give 56 columns
 * and 40 rows without stretching either axis.
 */
import { readFile, writeFile } from 'node:fs/promises';

const input = new URL('../../frontend/arcade/anatolian-pact/data/anatolia-geo.json', import.meta.url);
const output = new URL('../../frontend/arcade/anatolian-pact/map-data.js', import.meta.url);
const previewOnly = process.argv.includes('--preview');
const unknown = process.argv.slice(2).filter(x => x !== '--preview');
if (unknown.length) throw new Error(`Unknown option: ${unknown.join(', ')}. Supported: --preview`);

const geo = JSON.parse(await readFile(input, 'utf8'));
const check = (condition, message) => {
  if (!condition) throw new Error(`Anatolian map invariant: ${message}`);
};
check(Array.isArray(geo.land) && Array.isArray(geo.lakes), 'input must contain land and lakes rings');
check(geo.bbox?.length === 4, 'input must contain bbox');
check(/Natural Earth/i.test(geo.source), 'input must identify its Natural Earth source');

const cosLat = Math.cos(39 * Math.PI / 180);
const lonMin = 24.5;
const latMax = 42.5;
const latMin = 34.85;
const lonMax = 40.2;

/*
 * Complete input gazetteer: name, longitude, latitude.
 *
 * Komana Pontike is at Gümenek near Tokat, not Komana in Cappadocia.
 * Nikopolis is the Pontic city near modern Suşehri, not another Nikopolis.
 * These more precise seeds avoid confusing similarly named ancient cities.
 */
const cities = [
  ['Byzantion', 29.0, 41.0], ['Perinthos', 28.0, 41.0],
  ['Kyzikos', 27.9, 40.4], ['Alexandria Troas', 26.2, 39.8],
  ['Pergamon', 27.2, 39.1], ['Sardis', 28.0, 38.5],
  ['Smyrna', 27.1, 38.4], ['Ephesos', 27.3, 37.9],
  ['Miletos', 27.3, 37.5], ['Halikarnassos', 27.4, 37.0],
  ['Knidos', 27.4, 36.7], ['Stratonikeia', 28.0, 37.3],
  ['Xanthos', 29.3, 36.4], ['Patara', 29.3, 36.3],
  ['Attaleia', 30.7, 36.9], ['Side', 31.4, 36.8],
  ['Selge', 31.1, 37.2], ['Laodikeia', 29.1, 37.8],
  ['Apameia', 30.2, 38.1], ['Kibyra', 29.5, 37.2],
  ['Aizanoi', 29.6, 39.2], ['Kotiaion', 30.0, 39.4],
  ['Dorylaion', 30.5, 39.8], ['Synnada', 30.5, 38.5],
  ['Philomelion', 31.4, 38.4], ['Pessinous', 31.8, 39.4],
  ['Gordion', 32.0, 39.7], ['Ankyra', 32.9, 39.9],
  ['Amorion', 31.3, 39.0], ['Ikonion', 32.5, 37.9],
  ['Laranda', 33.2, 37.2], ['Tyana', 34.6, 37.8],
  ['Kaisareia', 35.5, 38.7], ['Komana Cappadocia', 36.3, 38.3],
  ['Amaseia', 35.8, 40.7], ['Sinope', 35.2, 42.0],
  ['Amisos', 36.3, 41.3], ['Herakleia Pontike', 31.4, 41.3],
  ['Komana Pontike', 36.057, 40.329],
  ['Nikopolis', 38.1, 40.3],
  ['Zela', 35.887, 40.302],
  ['Nikomedeia', 29.9, 40.8], ['Nikaia', 29.7, 40.4],
  ['Prusa', 29.1, 40.2], ['Tarsos', 34.9, 36.9],
  ['Issos', 36.2, 37.0], ['Anazarbos', 35.9, 37.3],
  ['Seleukeia', 33.9, 36.4], ['Melitene', 38.4, 38.4],
  ['Sebasteia', 37.0, 39.7], ['Trapezous', 39.7, 41.0],
  ['Salamis', 33.9, 35.2]
].map(([name, lon, lat]) => ({ name, lon, lat }));

/*
 * Closely spaced sites are omitted before tessellation. Dorylaion makes room
 * for the eastern sites within the existing 36–40 land-province contract.
 * Komana Pontike and Zela remain subject to the unchanged tiny-province rule.
 */
const omitted = new Set([
  'Perinthos', 'Knidos', 'Patara', 'Side', 'Selge', 'Kibyra',
  'Apameia', 'Philomelion', 'Amorion', 'Komana Cappadocia', 'Dorylaion'
]);
const selected = cities.filter(c => !omitted.has(c.name));
const cityByName = new Map(cities.map(c => [c.name, c]));
const protectedNames = new Set([
  'Byzantion', 'Salamis', 'Aizanoi', 'Ankyra', 'Nikomedeia', 'Trapezous'
]);
const powerSpecs = [
  ['Phrygia', '#e8875b', ['Aizanoi', 'Kotiaion', 'Synnada'], false],
  ['Lydia', '#ffd84d', ['Sardis', 'Smyrna', 'Ephesos'], true],
  ['Caria', '#22d3ee', ['Halikarnassos', 'Miletos', 'Stratonikeia'], true],
  ['Bithynia', '#c99bff', ['Nikomedeia', 'Nikaia', 'Prusa'], true],
  ['Galatia', '#10c08e', ['Ankyra', 'Gordion', 'Pessinous'], false],
  ['Cilicia', '#ff4d4d', ['Tarsos', 'Issos', 'Anazarbos'], true]
];
const seaSpecs = [
  ['Pontus West', 30.2, 41.5],
  ['Pontus Central', 34.0, 42.2],
  ['Pontus East', 38.7, 41.3],
  ['Propontis', 28.1, 40.7],
  ['Hellespont', 26.5, 40.2],
  ['Aegean North', 25.9, 39.8],
  ['Aegean Central', 26.3, 38.5],
  ['Aegean South', 26.8, 37.5],
  ['Rhodian Sea', 27.8, 36.5],
  ['Lycian Sea', 29.6, 36.0],
  ['Pamphylian Gulf', 31.0, 36.5],
  ['Cilician Sea', 33.5, 35.9],
  ['Gulf of Issos', 35.8, 36.65],
  ['Cyprian Sea', 33.5, 35.5]
];
/* These are geographic waterway control points, not province outlines. */
const waterway = [
  [29.15, 41.50], [29.10, 41.25], [29.04, 41.10],
  [29.00, 41.00], [28.65, 40.82], [28.10, 40.70],
  [27.50, 40.60], [27.00, 40.48], [26.65, 40.33],
  [26.40, 40.15], [26.20, 40.03], [25.95, 39.80]
];

function inside(lon, lat, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) &&
        lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function ringArea(ring) {
  return Math.abs(ring.reduce((sum, [x, y], i) => {
    const [u, v] = ring[(i + 1) % ring.length];
    return sum + x * v - u * y;
  }, 0)) / 2;
}
const mainlandRing = [...geo.land].sort((a, b) => ringArea(b) - ringArea(a))[0];
const cyprusRing = geo.land.find(r => inside(33.4, 35.0, r));
check(mainlandRing && cyprusRing, 'cannot identify mainland and Cyprus polygons');
const tuzRings = geo.lakes.filter(r =>
  ringArea(r) > 0.05 && r.some(([lon, lat]) => lon > 32.8 && lon < 34 && lat > 38 && lat < 39.5));

/* Europe/Asia divider follows the straits, including the Marmara crossing. */
function divider(lat) {
  const line = [...waterway].sort((a, b) => a[1] - b[1]);
  if (lat <= line[0][1]) return line[0][0];
  for (let i = 1; i < line.length; i++) {
    if (lat <= line[i][1]) {
      const [a, b] = [line[i - 1], line[i]];
      return a[0] + (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]);
    }
  }
  return 29.15;
}

function build(hexSize, phase) {
  const dx = Math.sqrt(3) * hexSize;
  const dy = 1.5 * hexSize;
  const width = Math.ceil((lonMax - lonMin) * cosLat / dx);
  const height = Math.ceil((latMax - latMin) / dy);
  const cells = [];
  const at = (x, y) => x >= 0 && y >= 0 && x < width && y < height ? y * width + x : -1;
  const excluded = (lon, lat) =>
    lon > lonMax || lat < latMin || lon > 35.9 && lat < 36.45;

  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const lon = lonMin + dx * (x + (y & 1) / 2 + 0.5 + phase) / cosLat;
    const lat = latMax - dy * (y + 0.5);
    let kind = 'sea', region = null;

    /*
     * Apply the southeast exclusion before testing either land or water.
     * Otherwise the Levant is removed but its coastal sea band survives.
     */
    if (excluded(lon, lat)) kind = 'off';
    else if (inside(lon, lat, cyprusRing)) {
      kind = 'land'; region = 'Cyprus';
    } else if (inside(lon, lat, mainlandRing)) {
      const europe = lon < divider(lat);
      if (europe) {
        if (lon >= 26 && lat >= 40.6 && lat <= 42) {
          kind = 'land'; region = 'Thrace';
        } else kind = 'off';
      } else if (lat > 42.15) kind = 'off';
      else {
        kind = 'land'; region = 'Anatolia';
      }
    }
    if (kind === 'land' && tuzRings.some(r => inside(lon, lat, r))) kind = 'lake';
    cells.push({ x, y, lon, lat, kind, region, label: null });
  }

  const ns = i => {
    const { x, y } = cells[i], side = y & 1 ? 1 : -1;
    return [[x - 1, y], [x + 1, y], [x, y - 1], [x + side, y - 1],
      [x, y + 1], [x + side, y + 1]].map(([a, b]) => at(a, b)).filter(i => i >= 0);
  };
  const neighbours = cells.map((_, i) => ns(i));
  const distance2 = (cell, lon, lat) =>
    ((cell.lon - lon) * cosLat) ** 2 + (cell.lat - lat) ** 2;
  const nearest = (lon, lat, predicate, reserved = new Set()) => {
    let best = -1, score = Infinity;
    cells.forEach((c, i) => {
      if (!predicate(c, i) || reserved.has(i)) return;
      const d = distance2(c, lon, lat);
      if (d < score) { best = i; score = d; }
    });
    check(best >= 0, `no eligible hex near ${lon}, ${lat}`);
    return best;
  };

  function components(predicate) {
    const unseen = new Set(cells.flatMap((c, i) => predicate(c, i) ? [i] : []));
    const result = [];
    while (unseen.size) {
      const start = unseen.values().next().value, queue = [start];
      unseen.delete(start);
      for (let k = 0; k < queue.length; k++) for (const n of neighbours[queue[k]]) {
        if (unseen.delete(n)) queue.push(n);
      }
      result.push(queue);
    }
    return result.sort((a, b) => b.length - a.length);
  }

  /* Dijkstra without a dependency; the grid has only a few thousand cells. */
  function shortest(start, goal, allowed, cost = () => 1) {
    const dist = new Float64Array(cells.length).fill(Infinity);
    const parent = new Int32Array(cells.length).fill(-1);
    const done = new Uint8Array(cells.length);
    dist[start] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < cells.length; i++) {
        if (!done[i] && dist[i] < best) { u = i; best = dist[i]; }
      }
      if (u < 0) return null;
      if (goal(u)) {
        const path = [];
        for (let v = u; v >= 0; v = parent[v]) path.push(v);
        return path.reverse();
      }
      done[u] = 1;
      for (const n of neighbours[u]) {
        if (!allowed(cells[n], n)) continue;
        const d = best + cost(cells[n], n);
        if (d < dist[n]) { dist[n] = d; parent[n] = u; }
      }
    }
  }

  const canal = [];
  for (let k = 0; k < waterway.length - 1; k++) {
    const [a, b] = [waterway[k], waterway[k + 1]];
    const eligible = c => !excluded(c.lon, c.lat);
    const start = nearest(...a, eligible);
    const end = nearest(...b, eligible);
    const vx = (b[0] - a[0]) * cosLat, vy = b[1] - a[1];
    const path = shortest(start, i => i === end, eligible, c => {
      const px = (c.lon - a[0]) * cosLat, py = c.lat - a[1];
      const t = Math.max(0, Math.min(1, (px * vx + py * vy) / (vx * vx + vy * vy)));
      return 1 + 100 * Math.hypot(px - t * vx, py - t * vy);
    });
    check(path, `cannot rasterise waterway segment ${k}`);
    for (const i of path) {
      cells[i].kind = 'sea';
      cells[i].region = null;
      if (canal.at(-1) !== i) canal.push(i);
    }
  }

  /* A one-cell strait must also prevent diagonal army crossings. */
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].kind !== 'land' || cells[i].region !== 'Thrace') continue;
    for (const n of neighbours[i]) {
      if (cells[n].kind === 'land' && cells[n].region === 'Anatolia') {
        cells[n].kind = 'sea'; cells[n].region = null;
      }
    }
  }

  for (const region of ['Anatolia', 'Thrace', 'Cyprus']) {
    const parts = components(c => c.kind === 'land' && c.region === region);
    check(parts.length, `missing ${region} land component`);
    for (const part of parts.slice(1)) for (const i of part) {
      cells[i].kind = 'sea'; cells[i].region = null;
    }
  }

  const reserved = new Set();
  const active = selected.map(city => {
    const region = city.name === 'Salamis' ? 'Cyprus' :
      city.name === 'Byzantion' ? 'Thrace' : 'Anatolia';
    const seed = nearest(city.lon, city.lat,
      c => c.kind === 'land' && c.region === region, reserved);
    check(distance2(cells[seed], city.lon, city.lat) < 0.5 ** 2,
      `${city.name}: no land seed within 0.5 projected degree`);
    reserved.add(seed);
    return { ...city, region, seed };
  });

  const landQueue = [];
  active.forEach((city, index) => {
    cells[city.seed].label = index;
    landQueue.push(city.seed);
  });
  for (let k = 0; k < landQueue.length; k++) {
    const u = landQueue[k];
    for (const n of neighbours[u]) {
      if (cells[n].kind === 'land' && cells[n].label === null) {
        cells[n].label = cells[u].label;
        landQueue.push(n);
      }
    }
  }
  check(cells.every(c => c.kind !== 'land' || c.label !== null),
    'land-constrained Voronoi left an unseeded component');

  function landGroups() {
    const groups = new Map();
    cells.forEach((c, i) => {
      if (c.kind !== 'land') return;
      if (!groups.has(c.label)) groups.set(c.label, []);
      groups.get(c.label).push(i);
    });
    return groups;
  }

  /* The minimum size and longest-shared-border merge rule are unchanged. */
  for (;;) {
    const groups = landGroups();
    const tiny = [...groups].filter(([, indices]) => indices.length < 3)
      .sort((a, b) => a[1].length - b[1].length || a[0] - b[0])[0];
    if (!tiny) break;
    const [label, indices] = tiny;
    check(!protectedNames.has(active[label].name),
      `${active[label].name}: protected province has only ${indices.length} hexes`);
    const borders = new Map();
    for (const i of indices) for (const n of neighbours[i]) {
      const c = cells[n];
      if (c.kind === 'land' && c.label !== label) {
        borders.set(c.label, (borders.get(c.label) || 0) + 1);
      }
    }
    const target = [...borders].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
    check(target !== undefined, `${active[label].name}: tiny province has no land neighbour`);
    for (const i of indices) cells[i].label = target;
  }

  /*
   * Balance through legal, single-cell boundary transfers. Each transfer:
   *   - keeps the surviving city's seed in its own province;
   *   - leaves at least three donor hexes;
   *   - preserves the donor's connectivity;
   *   - attaches directly to the recipient;
   *   - strictly decreases the sum of squared province sizes.
   *
   * Geographic distance is the tie-breaker, not an excuse to cross water.
   * Stop once the largest province is at most 2.5 times the land median.
   */
  function balanceLand() {
    const groups = landGroups();
    const sizes = new Map([...groups].map(([label, indices]) => [label, indices.length]));
    const median = () => {
      const values = [...sizes.values()].sort((a, b) => a - b);
      const middle = Math.floor(values.length / 2);
      return values.length & 1 ? values[middle] :
        (values[middle - 1] + values[middle]) / 2;
    };
    const connectedWithout = (label, removed) => {
      const start = active[label].seed;
      if (start === removed || cells[start].label !== label) return false;
      const seen = new Set([start]), queue = [start];
      for (let k = 0; k < queue.length; k++) {
        for (const n of neighbours[queue[k]]) {
          if (n !== removed && cells[n].kind === 'land' &&
              cells[n].label === label && !seen.has(n)) {
            seen.add(n); queue.push(n);
          }
        }
      }
      return seen.size === sizes.get(label) - 1;
    };

    for (;;) {
      if (Math.max(...sizes.values()) <= 2.5 * median()) return;

      const transfers = [];
      cells.forEach((cell, index) => {
        if (cell.kind !== 'land') return;
        const from = cell.label;
        if (sizes.get(from) <= 3 || active[from].seed === index) return;
        const targets = new Set(neighbours[index]
          .filter(n => cells[n].kind === 'land' && cells[n].label !== from)
          .map(n => cells[n].label));
        for (const to of targets) {
          const gain = sizes.get(from) - sizes.get(to) - 1;
          if (gain <= 0) continue;
          const geographicCost =
            distance2(cell, active[to].lon, active[to].lat) -
            distance2(cell, active[from].lon, active[from].lat);
          transfers.push({ index, from, to, gain, geographicCost });
        }
      });
      transfers.sort((a, b) => b.gain - a.gain ||
        a.geographicCost - b.geographicCost || a.index - b.index || a.to - b.to);
      const chosen = transfers.find(t => connectedWithout(t.from, t.index));
      if (!chosen) return;
      cells[chosen.index].label = chosen.to;
      sizes.set(chosen.from, sizes.get(chosen.from) - 1);
      sizes.set(chosen.to, sizes.get(chosen.to) + 1);
    }
  }
  balanceLand();

  const groups = landGroups();
  check(groups.size >= 36 && groups.size <= 40,
    `land province count ${groups.size}; expected 36–40 after tiny-province merges`);

  /* Distance from real retained land, not from the rectangular map edge. */
  const coastDistance = new Int32Array(cells.length).fill(1e6);
  const coastQueue = [];
  cells.forEach((c, i) => {
    if (c.kind === 'land') { coastDistance[i] = 0; coastQueue.push(i); }
  });
  for (let k = 0; k < coastQueue.length; k++) {
    const u = coastQueue[k];
    for (const n of neighbours[u]) if (cells[n].kind === 'sea' &&
        coastDistance[n] > coastDistance[u] + 1) {
      coastDistance[n] = coastDistance[u] + 1;
      coastQueue.push(n);
    }
  }
  const playable = new Set();
  cells.forEach((c, i) => {
    if (c.kind === 'sea' && (coastDistance[i] <= 3 ||
        c.lon > 26.8 && c.lon < 29.3 && c.lat > 40.4 && c.lat < 41.05)) playable.add(i);
  });
  canal.forEach(i => playable.add(i));

  /* Join raster coastal bands, using the least offshore sea-only route. */
  for (;;) {
    const parts = components((c, i) => playable.has(i));
    check(parts.length, 'no playable sea');
    if (parts.length === 1) break;
    const main = new Set(parts[0]);
    const start = parts[1][0];
    const path = shortest(start, i => main.has(i),
      c => c.kind === 'sea', (c, i) => 1 + Math.max(0, coastDistance[i] - 3) * 20);
    check(path, 'coastal sea bands cannot be connected without crossing land or off-map geography');
    check(path.every(i => coastDistance[i] <= 5 || canal.includes(i)),
      'connecting coastal sea bands would require more than five hexes offshore');
    path.forEach(i => playable.add(i));
  }

  /*
   * Reserve contiguous sections of the real strait route as connected sea
   * sources. Every other sea province starts at one nearest geographic seed.
   * Subsequent sea BFS guarantees connected provinces.
   */
  const seaLabels = new Int32Array(cells.length).fill(-1);
  const seaQueue = [];
  const uniqueCanal = [...new Set(canal)];
  const marks = [
    nearest(29.08, 41.25, (c, i) => uniqueCanal.includes(i)),
    nearest(26.90, 40.48, (c, i) => uniqueCanal.includes(i)),
    nearest(26.20, 40.03, (c, i) => uniqueCanal.includes(i))
  ].map(i => uniqueCanal.indexOf(i));
  check(marks[0] < marks[1] && marks[1] < marks[2],
    'geographic strait anchors must be ordered north to south');
  uniqueCanal.forEach((i, index) => {
    const label = index <= marks[0] ? 0 : index <= marks[1] ? 3 :
      index <= marks[2] ? 4 : 5;
    seaLabels[i] = label;
    seaQueue.push(i);
  });
  seaSpecs.forEach(([name, lon, lat], label) => {
    if ([0, 3, 4, 5].includes(label)) return;
    const seed = nearest(lon, lat,
      (c, i) => playable.has(i) && seaLabels[i] < 0);
    check(distance2(cells[seed], lon, lat) < 1.2 ** 2,
      `${name}: geographic sea seed could not be placed locally`);
    seaLabels[seed] = label;
    seaQueue.push(seed);
  });
  for (let k = 0; k < seaQueue.length; k++) {
    const u = seaQueue[k];
    for (const n of neighbours[u]) if (playable.has(n) && seaLabels[n] < 0) {
      seaLabels[n] = seaLabels[u];
      seaQueue.push(n);
    }
  }

  /*
   * Single UTF-16 uppercase letters, continuing into Greek capitals.
   * Consumers must use metadata, not A–Z tests.
   */
  const alphabet = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ');
  const provinces = [];
  const landId = new Map();
  [...groups.keys()].sort((a, b) => a - b).forEach((label, index) => {
    const id = alphabet[index];
    check(id?.length === 1 && id.toUpperCase() === id && id.toLowerCase() !== id,
      `invalid uppercase province code at index ${index}`);
    landId.set(label, id);
    provinces.push({ id, name: active[label].name, type: 'land', sc: false, home: null });
  });
  seaSpecs.forEach(([name], index) => provinces.push({
    id: String.fromCharCode(97 + index), name, type: 'sea', sc: false, home: null
  }));
  const byId = new Map(provinces.map(p => [p.id, p]));
  const idAt = cells.map((c, i) => c.kind === 'land' ? landId.get(c.label) :
    playable.has(i) ? String.fromCharCode(97 + seaLabels[i]) :
      c.kind === 'off' ? ' ' : '~');
  const adjacency = Object.fromEntries(provinces.map(p => [p.id, new Set()]));
  cells.forEach((c, i) => {
    const id = idAt[i];
    if (!byId.has(id)) return;
    for (const n of neighbours[i]) if (idAt[n] !== id && byId.has(idAt[n])) adjacency[id].add(idAt[n]);
  });
  const coastal = id => byId.get(id).type === 'land' &&
    [...adjacency[id]].some(n => byId.get(n).type === 'sea');
  const provinceCells = id => cells.flatMap((c, i) => idAt[i] === id ? [i] : []);
  const provinceCity = id => cityByName.get(byId.get(id).name);

  /* Prefer the exact surviving home city; otherwise nearest regional city. */
  const usedHomes = new Set();
  const powers = powerSpecs.map(([name, colour, names, wantsFleet]) => {
    const homes = names.map(cityName => {
      const city = cityByName.get(cityName);
      const exact = provinces.find(p => p.type === 'land' && p.name === cityName && !usedHomes.has(p.id));
      const candidates = provinces.filter(p => p.type === 'land' && !usedHomes.has(p.id) &&
        active.find(c => c.name === p.name)?.region === 'Anatolia');
      candidates.sort((a, b) => {
        const ca = provinceCity(a.id), cb = provinceCity(b.id);
        return distance2(ca, city.lon, city.lat) - distance2(cb, city.lon, city.lat);
      });
      const chosen = exact || candidates[0];
      check(chosen, `${name}: missing replacement home for ${cityName}`);
      check(distance2(provinceCity(chosen.id), city.lon, city.lat) <= 1.1 ** 2,
        `${name}: replacement for ${cityName} is outside its region`);
      usedHomes.add(chosen.id);
      chosen.sc = true; chosen.home = name;
      return chosen.id;
    });
    const fleet = wantsFleet ? homes.find(coastal) : null;
    check(!wantsFleet || fleet, `${name}: no coastal home for its starting fleet`);
    return { name, colour, homes, units: homes.map(at => ({ type: at === fleet ? 'fleet' : 'army', at })) };
  });

  const canMove = (type, from, to) => {
    if (!adjacency[from].has(to)) return false;
    if (type === 'army') return byId.get(to).type === 'land';
    if (byId.get(to).type === 'land' && !coastal(to)) return false;
    return byId.get(from).type === 'sea' || byId.get(to).type === 'sea' ||
      [...adjacency[from]].some(n => byId.get(n).type === 'sea' && adjacency[to].has(n));
  };
  const arrival = powers.map(power => {
    const best = Object.fromEntries(provinces.map(p => [p.id, Infinity]));
    for (const unit of power.units) {
      const queue = [[unit.at, 0]], seen = new Set([unit.at]);
      for (let k = 0; k < queue.length; k++) {
        const [id, depth] = queue[k];
        best[id] = Math.min(best[id], depth);
        for (const n of adjacency[id]) if (!seen.has(n) && canMove(unit.type, id, n)) {
          seen.add(n); queue.push([n, depth + 1]);
        }
      }
    }
    return best;
  });
  const preferred = new Set([
    'Byzantion', 'Pergamon', 'Ikonion', 'Kaisareia', 'Sinope', 'Attaleia', 'Salamis',
    'Laodikeia', 'Tyana'
  ]);
  const candidates = provinces.filter(p => p.type === 'land' && !p.home).map(p => {
    const distances = arrival.map(d => d[p.id]);
    const first = Math.min(...distances);
    return { id: p.id, first, winners: distances.flatMap((d, i) => d === first ? [i] : []) };
  }).filter(c => Number.isFinite(c.first));
  const options = powers.map((power, index) => candidates.filter(c => c.winners.includes(index))
    .sort((a, b) => a.first - b.first ||
      Number(preferred.has(byId.get(b.id).name)) - Number(preferred.has(byId.get(a.id).name)) ||
      a.id.localeCompare(b.id)));
  let neutrals = null;
  function choose(powerIndex, chosen, counts) {
    if (powerIndex === powers.length) {
      if (counts.every(n => n >= 1 && n <= 2)) neutrals = [...chosen];
      return Boolean(neutrals);
    }
    for (const candidate of options[powerIndex]) {
      if (chosen.includes(candidate.id)) continue;
      const next = [...counts];
      candidate.winners.forEach(i => next[i]++);
      if (next.some(n => n > 2)) continue;
      if (choose(powerIndex + 1, [...chosen, candidate.id], next)) return true;
    }
    return false;
  }
  choose(0, [], powers.map(() => 0));
  check(neutrals, 'cannot choose six neutral centres giving each power 1–2 earliest-reachable opportunities');
  neutrals.forEach(id => { byId.get(id).sc = true; });

  const rows = Array.from({ length: height }, (_, y) =>
    idAt.slice(y * width, (y + 1) * width).join(''));
  check(rows.every(row => row.length === width), 'rows must have equal UTF-16 lengths');
  check(idAt.every(id => id === '~' || id === ' ' || byId.has(id)),
    'a used province code has no definition');
  check(cells.every((c, i) => !excluded(c.lon, c.lat) || idAt[i] === ' '),
    'cropped geography must remain blank, including coastal water');
  check(width >= 56 && width <= 60 && height >= 38 && height <= 40,
    `unexpected cropped raster dimensions ${width} × ${height}`);

  for (const province of provinces) {
    const indices = provinceCells(province.id);
    check(indices.length, `${province.name}: defined province has no hexes`);
    if (province.type === 'land') check(indices.length >= 3, `${province.name}: fewer than three land hexes`);
    const allowed = new Set(indices), seen = new Set([indices[0]]), queue = [indices[0]];
    for (let k = 0; k < queue.length; k++) for (const n of neighbours[queue[k]]) {
      if (allowed.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
    }
    check(seen.size === indices.length, `${province.name}: province is not one connected hex cluster`);
    for (const n of adjacency[province.id]) check(adjacency[n].has(province.id),
      `${province.name}: asymmetric adjacency`);
  }

  const landSizes = [...groups.values()].map(indices => indices.length).sort((a, b) => a - b);
  const middle = Math.floor(landSizes.length / 2);
  const medianLandSize = landSizes.length & 1 ? landSizes[middle] :
    (landSizes[middle - 1] + landSizes[middle]) / 2;
  check(landSizes.at(-1) <= 2.5 * medianLandSize,
    `largest land province ${landSizes.at(-1)} exceeds 2.5 × median ${medianLandSize}`);

  const landParts = components(c => c.kind === 'land');
  check(landParts.length === 3, `expected mainland, Thrace and Cyprus; found ${landParts.length} land components`);
  const regionSets = landParts.map(part => new Set(part.map(i => cells[i].region)));
  check(regionSets.every(set => set.size === 1) &&
    new Set(regionSets.map(set => [...set][0])).size === 3, 'land components cross geographic regions');
  const thrace = provinces.find(p => p.name === 'Byzantion');
  const cyprus = provinces.find(p => p.name === 'Salamis');
  check(coastal(thrace.id), 'Thrace must be coastal');
  check([...adjacency[thrace.id]].some(id =>
    ['Pontus West', 'Propontis', 'Hellespont', 'Aegean North'].includes(byId.get(id).name)),
  'Thrace must touch a strait-access sea');
  check(adjacency[cyprus.id].has(provinces.find(p => p.name === 'Cyprian Sea').id),
    'Cyprus must touch the Cyprian Sea');
  const graphSeen = new Set([provinces[0].id]), graphQueue = [...graphSeen];
  for (let k = 0; k < graphQueue.length; k++) for (const n of adjacency[graphQueue[k]]) {
    if (!graphSeen.has(n)) { graphSeen.add(n); graphQueue.push(n); }
  }
  check(graphSeen.size === provinces.length, 'whole land-and-sea province graph must be connected');
  const straits = ['Pontus West', 'Propontis', 'Hellespont', 'Aegean North']
    .map(name => provinces.find(p => p.name === name).id);
  for (let i = 1; i < straits.length; i++) check(adjacency[straits[i - 1]].has(straits[i]),
    `missing sea passage ${byId.get(straits[i - 1]).name} -> ${byId.get(straits[i]).name}`);
  check(provinces.filter(p => p.sc).length === 24, 'exactly 24 supply centres required');
  check(provinces.filter(p => p.sc && !p.home).length === 6, 'exactly six neutral centres required');
  for (const power of powers) {
    check(power.homes.length === 3 && new Set(power.homes).size === 3, `${power.name}: three distinct homes required`);
    check(power.homes.every(id => byId.get(id)?.home === power.name && byId.get(id).sc),
      `${power.name}: home ownership mismatch`);
    check(power.units.length === 3 && power.units.every(u =>
      power.homes.includes(u.at) && (u.type === 'army' || coastal(u.at))),
    `${power.name}: invalid starting units`);
  }
  const centre = name => {
    const p = provinces.find(p => p.name === name);
    check(p, `missing required geography province ${name}`);
    const indices = provinceCells(p.id);
    return indices.reduce((sum, i) =>
      [sum[0] + cells[i].lon / indices.length, sum[1] + cells[i].lat / indices.length], [0, 0]);
  };
  check(centre('Aizanoi')[0] < centre('Ankyra')[0] &&
    centre('Aizanoi')[1] < centre('Nikomedeia')[1], 'Aizanoi geographic ordering failed');
  const pontic = ['Herakleia Pontike', 'Sinope', 'Amisos', 'Trapezous', 'Komana Pontike', 'Nikopolis', 'Zela']
    .filter(name => provinces.some(p => p.name === name));
  check(pontic.every(name => centre(name)[0] <= centre('Trapezous')[0]),
    'Trapezous must be the easternmost Pontic province');

  return {
    source: geo.source,
    rows,
    provinces,
    powers,
    victory: 13,
    hex: { orientation: 'pointy', offset: 'odd-r' },
    projection: { lonMin, latMax, cosLat, hexSize }
  };
}

/*
 * Search only uniform scales that retain the requested cropped dimensions.
 * Every attempted result is fully validated; no partially valid map is written.
 */
let result;
const failures = [];
outer: for (const size of [0.128, 0.1279, 0.1278, 0.1277, 0.1276]) {
  for (const phase of [0, 0.15, -0.15, 0.3, -0.3]) {
    try {
      result = build(size, phase);
      result.projection.lonMin += Math.sqrt(3) * size * phase / cosLat;
      break outer;
    } catch (error) {
      failures.push(`hexSize=${size}, phase=${phase}: ${error.message}`);
    }
  }
}
if (!result) throw new Error(`No valid geographic raster found:\n${failures.join('\n')}`);

const header = 'Generated by scripts/arcade/build-anatolian-pact-map.mjs from Natural Earth (public domain). Do not edit by hand.';
const generated = `/* ${header} */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PactMapData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return ${JSON.stringify(result, null, 2)};
});
`;
if (!previewOnly) await writeFile(output, generated, 'utf8');
console.log(result.rows.join('\n'));
console.log('\nLegend: space = off-map; ~ = open sea / impassable lake');
for (const p of result.provinces) {
  console.log(`${p.id}  ${p.name} (${p.type})${p.sc ? ' ★' : ''}${p.home ? ` [${p.home} home]` : ''}`);
}
console.log(`\n${result.rows[0].length} columns × ${result.rows.length} rows; ` +
  `${result.provinces.filter(p => p.type === 'land').length} land; ` +
  `${result.provinces.filter(p => p.type === 'sea').length} sea; 24 centres; victory 13.`);
if (!previewOnly) console.log(`Written ${output.href}`);
