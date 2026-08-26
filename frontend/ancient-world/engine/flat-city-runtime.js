import { createTraversalSystem, rectCollider, walkRect } from './traversal.js';
import { createLifecycle } from './lifecycle.js';
import { installMobileControls } from './mobile-controls.js';
import { installBackToOS } from './navigation.js';
import { createAdaptiveQualityController } from './performance.js';
import { ANCIENT_CITY_FRAGMENT_SHADER } from './surface-shader.js';
import { createAncientSkyRenderer, createAncientWaterRenderer, waterRibbon } from './environment-renderer.js';
import { ANCIENT_MATERIALS as M } from '../assets/materials.js';
import { createBlockyAssetLibrary } from '../assets/blocky-asset-library.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const $ = (selector) => document.querySelector(selector);

function normal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookMatrix(player) {
  const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
  const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
  const fx = sy * cp, fy = sp, fz = -cy * cp;
  const rx = cy, ry = 0, rz = sy;
  const ux = -sy * sp, uy = cp, uz = cy * sp;
  const px = player.x, py = player.y, pz = player.z;
  return new Float32Array([
    rx, ux, -fx, 0,
    ry, uy, -fy, 0,
    rz, uz, -fz, 0,
    -(rx * px + ry * py + rz * pz),
    -(ux * px + uy * py + uz * pz),
    fx * px + fy * py + fz * pz,
    1,
  ]);
}

class SceneGeometry {
  constructor({ mobile = false } = {}) {
    this.mobile = mobile;
    this.vertices = [];
    this.colliders = [];
    this.walkSurfaces = [];
    this.layers = new Map([['base', []], ['301', []], ['425', []]]);
    this.layer = 'base';
  }

  target() { return this.layers.get(this.layer) || this.layers.get('base'); }
  setLayer(layer = 'base') { this.layer = String(layer); if (!this.layers.has(this.layer)) this.layers.set(this.layer, []); }

  localPoint(cx, cz, lx, lz, rot = 0) {
    if (!rot) return [cx + lx, cz + lz];
    const c = Math.cos(rot), s = Math.sin(rot);
    return [cx + lx * c - lz * s, cz + lx * s + lz * c];
  }

  vertex(p, n, c) { this.target().push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2]); }
  tri(a, b, c, colour) { const n = normal(a, b, c); this.vertex(a, n, colour); this.vertex(b, n, colour); this.vertex(c, n, colour); }
  quad(a, b, c, d, colour) { this.tri(a, b, c, colour); this.tri(a, c, d, colour); }

  box(cx, y, cz, w, h, d, colour, rot = 0) {
    const q = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => this.localPoint(cx, cz, x, z, rot));
    const p = (i, py) => [q[i][0], py, q[i][1]];
    const y1 = y + h;
    this.quad(p(1, y), p(0, y), p(0, y1), p(1, y1), colour);
    this.quad(p(2, y), p(1, y), p(1, y1), p(2, y1), colour);
    this.quad(p(3, y), p(2, y), p(2, y1), p(3, y1), colour);
    this.quad(p(0, y), p(3, y), p(3, y1), p(0, y1), colour);
    this.quad(p(0, y1), p(3, y1), p(2, y1), p(1, y1), colour);
    this.quad(p(0, y), p(1, y), p(2, y), p(3, y), colour);
  }

  roof(cx, y, cz, w, h, d, colour, rot = 0) {
    const a2 = this.localPoint(cx, cz, -w / 2, -d / 2, rot), b2 = this.localPoint(cx, cz, w / 2, -d / 2, rot);
    const c2 = this.localPoint(cx, cz, w / 2, d / 2, rot), d2 = this.localPoint(cx, cz, -w / 2, d / 2, rot);
    const r1 = this.localPoint(cx, cz, -w / 2, 0, rot), r2 = this.localPoint(cx, cz, w / 2, 0, rot);
    const a = [a2[0], y, a2[1]], b = [b2[0], y, b2[1]], c = [c2[0], y, c2[1]], d0 = [d2[0], y, d2[1]];
    const rr1 = [r1[0], y + h, r1[1]], rr2 = [r2[0], y + h, r2[1]];
    this.quad(a, rr1, rr2, b, colour);
    this.quad(rr1, d0, c, rr2, colour);
    this.tri(a, d0, rr1, colour);
    this.tri(b, rr2, c, colour);
  }

  cylinder(cx, y, cz, r, h, colour, segments = 16) {
    const count = this.mobile ? Math.min(segments, 12) : segments;
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count, b = (i + 1) * TAU / count;
      const p0 = [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      const p1 = [cx + Math.cos(b) * r, y, cz + Math.sin(b) * r];
      const p2 = [p1[0], y + h, p1[2]], p3 = [p0[0], y + h, p0[2]];
      this.quad(p0, p1, p2, p3, colour);
      this.tri([cx, y + h, cz], p3, p2, colour);
    }
  }

  ellipseRing(cx, y, cz, rx, rz, h, colour, segments = 24) {
    const count = this.mobile ? Math.min(segments, 18) : segments;
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count, b = (i + 1) * TAU / count;
      const p0 = [cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz];
      const p1 = [cx + Math.cos(b) * rx, y, cz + Math.sin(b) * rz];
      const p2 = [p1[0], y + h, p1[2]], p3 = [p0[0], y + h, p0[2]];
      this.quad(p0, p1, p2, p3, colour);
    }
  }

  column(x, y, z, r, h, colour) {
    this.cylinder(x, y, z, r * 1.16, Math.max(0.15, h * 0.06), colour, 10);
    this.cylinder(x, y + h * 0.06, z, r, h * 0.84, colour, 10);
    this.cylinder(x, y + h * 0.9, z, r * 1.18, h * 0.1, colour, 10);
  }

  collider(x, z, w, d, rot = 0, tag = 'solid') { this.colliders.push(rectCollider(x, z, w, d, rot, tag)); }
  walkRect(x, z, w, d, y, rot = 0, tag = 'surface') { this.walkSurfaces.push(walkRect(x, z, w, d, y, rot, tag, true)); }

  stats() {
    let triangles = 0;
    const layers = {};
    for (const [name, data] of this.layers) {
      const tris = data.length / 27;
      layers[name] = tris;
      triangles += tris;
    }
    return { triangles, layers, colliders: this.colliders.length, walkSurfaces: this.walkSurfaces.length };
  }
}

function roadGeometry(scene, street) {
  const points = street.points || [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (!length) continue;
    const angle = Math.atan2(dz, dx);
    scene.box((a[0] + b[0]) / 2, 0.012, (a[1] + b[1]) / 2, length, 0.035, street.width || 10, M.roadLight, angle);
  }
}

function rotatedRectPoints({ x, z, w, d, rot = 0, y = 0.04 }) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const point = (lx, lz) => [x + lx * c - lz * s, y, z + lx * s + lz * c];
  return [point(-w / 2, -d / 2), point(w / 2, -d / 2), point(w / 2, d / 2), point(-w / 2, d / 2)];
}

function waterGeometry(water) {
  if (water.type === 'rect') {
    return [{ points: rotatedRectPoints({ ...water, y:0.04 }), color:M.water }];
  }
  const surfaces = [];
  const points = water.points || [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01) continue;
    surfaces.push(waterRibbon({ x0:a[0], z0:a[1], x1:b[0], z1:b[1], halfWidth:(water.width || 22) / 2, y:0.04, color:M.water }));
  }
  return surfaces;
}

function boundsFromCity(buildings, regions, fallback = { minX: -900, maxX: 900, minZ: -900, maxZ: 900 }) {
  const xs = [], zs = [];
  for (const item of [...(buildings || []), ...(regions || [])]) {
    if (Number.isFinite(item.x)) xs.push(item.x - (item.w || 0) / 2, item.x + (item.w || 0) / 2);
    if (Number.isFinite(item.z)) zs.push(item.z - (item.d || 0) / 2, item.z + (item.d || 0) / 2);
  }
  if (!xs.length || !zs.length) return fallback;
  return { minX: Math.min(...xs) - 100, maxX: Math.max(...xs) + 100, minZ: Math.min(...zs) - 100, maxZ: Math.max(...zs) + 100 };
}

function evidenceLevel(record) {
  if (typeof record?.evidence === 'string') return record.evidence;
  return record?.evidence?.level || (record?.source ? 'documented' : 'plausible');
}

function recordDetail(record) {
  return record?.detail || record?.note || record?.evidence?.note || 'Source-led reconstruction record.';
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl) {
  const vs = `
attribute vec3 aPos;
attribute vec3 aN;
attribute vec3 aColor;
uniform mat4 uProj;
uniform mat4 uView;
varying vec3 vN;
varying vec3 vC;
varying vec3 vW;
varying float vDepth;
void main(){
  vec4 viewPos=uView*vec4(aPos,1.0);
  vN=aN;
  vC=aColor;
  vW=aPos;
  vDepth=max(0.0,-viewPos.z);
  gl_Position=uProj*viewPos;
}`;
  const vertex = createShader(gl, gl.VERTEX_SHADER, vs);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, ANCIENT_CITY_FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  const ok = gl.getProgramParameter(program, gl.LINK_STATUS);
  const message = gl.getProgramInfoLog(program) || 'Program link failed';
  gl.detachShader(program, vertex);
  gl.detachShader(program, fragment);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!ok) { gl.deleteProgram(program); throw new Error(message); }
  return program;
}

function makeBuffer(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return { buffer, count: data.length / 9 };
}

function sourceMap(sources = []) { return new Map(sources.map((s) => [s.id, s])); }

export function startFlatBlockyCity({
  city,
  sources = [],
  regions = [],
  streets = [],
  buildings = [],
  urbanFabric = [],
  waters = [],
  bounds = null,
  spawn = null,
  ui = 'standard',
  era = null,
  cityRoute = null,
} = {}) {
  if (!city) throw new TypeError('startFlatBlockyCity requires city metadata.');
  const canvas = $('#glCanvas');
  if (!canvas) throw new Error('Missing #glCanvas.');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL is unavailable.');

  const TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches || innerWidth < 820;
  const EYE_HEIGHT = 1.68;
  const WALK_SPEED = 3.8;
  const SPRINT_SPEED = 7.2;
  const lifecycle = createLifecycle();
  const quality = createAdaptiveQualityController({ mobile:TOUCH });
  const scene = new SceneGeometry({ mobile: TOUCH });
  const allBuildings = [...buildings, ...urbanFabric];
  const worldBounds = bounds || boundsFromCity(allBuildings, regions);
  const width = Math.max(400, worldBounds.maxX - worldBounds.minX + 80);
  const depth = Math.max(400, worldBounds.maxZ - worldBounds.minZ + 80);
  scene.box((worldBounds.minX + worldBounds.maxX) / 2, -0.24, (worldBounds.minZ + worldBounds.maxZ) / 2, width, 0.24, depth, M.dryGrass);
  for (const street of streets) roadGeometry(scene, street);

  const assets = createBlockyAssetLibrary(scene);
  for (const record of allBuildings) {
    scene.setLayer(record.era && Number(record.era) >= 425 ? '425' : record.era && Number(record.era) >= 301 ? '301' : 'base');
    assets.render(record);
  }
  scene.setLayer('base');

  const initial = spawn || city.spawn || { x: 0, z: 0, yaw: Math.PI, pitch: -0.03 };
  const player = { x: initial.x || 0, z: initial.z || 0, y: EYE_HEIGHT, floorY: 0, surfaceTag: 'flat ground', yaw: initial.yaw ?? Math.PI, pitch: initial.pitch ?? -0.03 };
  const traversal = createTraversalSystem({
    player,
    colliders: scene.colliders,
    walkSurfaces: scene.walkSurfaces,
    hazards: [],
    bounds: worldBounds,
    baseHeightAt: () => 0,
    eyeHeight: EYE_HEIGHT,
  });

  const program = createProgram(gl);
  const skyRenderer = createAncientSkyRenderer(gl);
  const waterSurfaces = waters.flatMap(waterGeometry);
  const waterRenderer = createAncientWaterRenderer(gl, waterSurfaces);
  const locations = Object.freeze({
    aPos: gl.getAttribLocation(program, 'aPos'),
    aN: gl.getAttribLocation(program, 'aN'),
    aColor: gl.getAttribLocation(program, 'aColor'),
    uProj: gl.getUniformLocation(program, 'uProj'),
    uView: gl.getUniformLocation(program, 'uView'),
    uSun: gl.getUniformLocation(program, 'uSun'),
    uFog: gl.getUniformLocation(program, 'uFog'),
    uFogDensity: gl.getUniformLocation(program, 'uFogDensity'),
    uAmbient: gl.getUniformLocation(program, 'uAmbient'),
  });
  const buffers = new Map([...scene.layers].map(([name, data]) => [name, makeBuffer(gl, data)]));
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  lifecycle.addCleanup(() => {
    for (const entry of buffers.values()) gl.deleteBuffer(entry.buffer);
    skyRenderer.destroy();
    waterRenderer.destroy();
    gl.deleteProgram(program);
  });

  const keys = new Set();
  let started = false, locked = false, rendered = false, last = performance.now(), currentEra = era || 225, dayHour = 15, walkSpeed = WALK_SPEED;
  let movementLockUntil = 0, audio = null, modernOverlay = false, arrivalIdentity = null;
  const sourceById = sourceMap(sources);
  const landmarkRecords = buildings.filter((b) => b.name && b.type !== 'wall' && b.type !== 'urban-fabric');
  const landmarkById = new Map(landmarkRecords.map((b) => [b.id, b]));
  const bridges = buildings.filter((b) => b.type === 'bridge');

  function active(record) { return !record.era || Number(record.era) <= currentEra; }
  function resetMovementState() { keys.clear(); mobile.reset(); movementLockUntil = performance.now() + 80; }
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, quality.pixelRatioCap());
    const w = Math.max(1, Math.floor(innerWidth * dpr)), h = Math.max(1, Math.floor(innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }

  function bindAndDraw(entry) {
    if (!entry || !entry.count) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffer);
    gl.enableVertexAttribArray(locations.aPos); gl.vertexAttribPointer(locations.aPos, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(locations.aN); gl.vertexAttribPointer(locations.aN, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(locations.aColor); gl.vertexAttribPointer(locations.aColor, 3, gl.FLOAT, false, 36, 24);
    gl.drawArrays(gl.TRIANGLES, 0, entry.count);
  }

  function lightForHour(hour) {
    const t = clamp((hour - 6) / 13, 0, 1);
    const alt = Math.sin(t * Math.PI);
    return {
      sun: [Math.cos(t * Math.PI * 1.4), Math.max(0.22, alt), -Math.sin(t * Math.PI * 1.4)],
      fog: [0.62 + alt * 0.16, 0.61 + alt * 0.14, 0.55 + alt * 0.11],
      sky: [0.46 + alt * 0.26, 0.50 + alt * 0.25, 0.52 + alt * 0.24],
      skyTop: [0.30 + alt * 0.28, 0.38 + alt * 0.29, 0.47 + alt * 0.28],
      skyHorizon: [0.70 + alt * 0.16, 0.61 + alt * 0.17, 0.49 + alt * 0.19],
      ambient: 0.42 + alt * 0.2,
    };
  }

  function update(dt) {
    if (!started || performance.now() < movementLockUntil) return;
    const mobileState = mobile.snapshot();
    let forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) - mobileState.moveY;
    let side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + mobileState.moveX;
    const mag = Math.hypot(forward, side);
    if (mag > 1) { forward /= mag; side /= mag; }
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight') || mobileState.running;
    const speed = running ? SPRINT_SPEED : walkSpeed;
    const dx = (Math.sin(player.yaw) * forward + Math.cos(player.yaw) * side) * speed * dt;
    const dz = (-Math.cos(player.yaw) * forward + Math.sin(player.yaw) * side) * speed * dt;
    if (dx || dz) traversal.moveWithSubsteps(dx, dz);
    player.y = player.floorY + EYE_HEIGHT;
  }

  function render(now = performance.now()) {
    const frameDt = Math.max(0.001, Math.min(0.25, (now - last) / 1000));
    last = now;
    quality.sample(frameDt);
    resize();
    update(Math.min(0.05, frameDt));

    const light = lightForHour(dayHour);
    const projection = perspective(62 * Math.PI / 180, canvas.width / canvas.height, 0.08, 2800);
    const view = lookMatrix(player);
    const fogDensity = TOUCH ? 0.00078 : 0.00062;
    const sunYaw = Math.atan2(light.sun[0], -light.sun[2]);

    gl.clearColor(light.sky[0], light.sky[1], light.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    skyRenderer.draw({ top:light.skyTop, horizon:light.skyHorizon, yaw:player.yaw, pitch:player.pitch, sunYaw, time:now * 0.001 });

    gl.useProgram(program);
    gl.uniformMatrix4fv(locations.uProj, false, projection);
    gl.uniformMatrix4fv(locations.uView, false, view);
    gl.uniform3fv(locations.uSun, new Float32Array(light.sun));
    gl.uniform3fv(locations.uFog, new Float32Array(light.fog));
    gl.uniform1f(locations.uFogDensity, fogDensity);
    gl.uniform1f(locations.uAmbient, light.ambient);
    bindAndDraw(buffers.get('base'));
    if (currentEra >= 301) bindAndDraw(buffers.get('301'));
    if (currentEra >= 425) bindAndDraw(buffers.get('425'));

    waterRenderer.draw({ projection, view, fog:light.fog, fogDensity, time:now * 0.001 });
    drawMiniMap();
    updatePlace();
    if (ui === 'aizanoi') updateAizanoiHud();
    rendered = true;
    lifecycle.frame(render);
  }

  function nearestLandmark(max = 90) {
    let best = null, bd = Infinity;
    for (const b of landmarkRecords) {
      if (!active(b)) continue;
      const d = Math.hypot(player.x - b.x, player.z - b.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best && bd <= Math.max(max, Math.max(best.w || 0, best.d || 0) * 0.65) ? { record: best, distance: bd } : null;
  }

  function candidateSpawn(record) {
    const distance = Math.max(18, Math.max(record.w || 12, record.d || 12) * 0.78 + 10);
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    for (const [dx, dz] of dirs) {
      const x = record.x + dx * distance, z = record.z + dz * distance;
      if (!traversal.collide(x, z)) return { x, z };
    }
    return traversal.resolveSpawn(record.x + distance, record.z, 70);
  }

  const teleportViews = {};
  for (const b of landmarkRecords) {
    const p = candidateSpawn(b);
    teleportViews[b.id] = { pos: [p.x, p.z], look: [b.x, b.z] };
  }

  function teleportTo(id, { lock = true } = {}) {
    const record = landmarkById.get(id);
    if (!record) return false;
    const view = teleportViews[id] || { pos: [record.x + 24, record.z], look: [record.x, record.z] };
    const spawnPoint = traversal.resolveSpawn(view.pos[0], view.pos[1], 80);
    traversal.snapPlayerToSupport(spawnPoint.x, spawnPoint.z);
    const dx = view.look[0] - player.x, dz = view.look[1] - player.z;
    player.yaw = Math.atan2(dx, -dz);
    player.pitch = -0.04;
    resetMovementState();
    movementLockUntil = performance.now() + 140;
    arrivalIdentity = { record, x: player.x, z: player.z };
    setPlace(record.name, recordDetail(record));
    if (lock && !TOUCH && started) setTimeout(() => requestLock(false), 0);
    return true;
  }

  function openInspect(record = nearestLandmark()?.record) {
    if (!record) return toast('No labelled monument is close enough.');
    if (ui === 'aizanoi') return openAizanoiInfo(record);
    const modal = $('#modal'), title = $('#modalTitle'), body = $('#modalBody');
    if (!modal || !title || !body) return;
    title.textContent = record.name;
    const source = sourceById.get(record.source);
    body.innerHTML = `<p><b>${evidenceLevel(record).toUpperCase()}</b> evidence</p><p>${recordDetail(record)}</p>${source ? `<p><a target="_blank" rel="noopener" href="${source.url}">${source.title}</a></p>` : ''}`;
    modal.classList.remove('hidden');
    if (locked) document.exitPointerLock?.();
  }

  function openAizanoiInfo(record) {
    const panel = $('#info');
    if (!panel) return;
    $('#infoTitle') && ($('#infoTitle').textContent = record.name);
    $('#infoMeta') && ($('#infoMeta').textContent = record.meta || record.type?.toUpperCase() || 'MONUMENT');
    const cert = $('#infoCert'); if (cert) { cert.className = `cert ${evidenceLevel(record) === 'archaeological' ? 'high' : evidenceLevel(record) === 'plausible' ? 'inf' : 'medium'}`; cert.textContent = `${evidenceLevel(record)} evidence`; }
    $('#infoBody') && ($('#infoBody').innerHTML = `<p>${recordDetail(record)}</p>`);
    document.body.classList.add('infoOpen');
    if (locked) document.exitPointerLock?.();
  }

  function atlasHtml() {
    return `<p>Flat-ground city atlas. Terrain elevation is intentionally disabled; roads, water and monument coordinates remain city data.</p><div class="regionGrid">${regions.map((r) => `<button class="region" data-region="${r.id}"><b>${r.name}</b><span>${r.note || ''}</span></button>`).join('')}</div>`;
  }

  function openAtlas() {
    if (ui === 'aizanoi') {
      $('#atlasOverlay')?.classList.remove('hidden'); drawAizanoiAtlas(); if (locked) document.exitPointerLock?.(); return;
    }
    const modal = $('#modal'), title = $('#modalTitle'), body = $('#modalBody'); if (!modal || !title || !body) return;
    title.textContent = city.atlasTitle || `${city.title} · city atlas`; body.innerHTML = atlasHtml(); modal.classList.remove('hidden');
    body.querySelectorAll('[data-region]').forEach((button) => button.addEventListener('click', () => {
      const region = regions.find((r) => String(r.id) === button.dataset.region); if (!region) return;
      const target = landmarkRecords.find((b) => b.region === region.id) || { id: null, x: region.x, z: region.z, name: region.name };
      if (target.id) teleportTo(target.id, { lock: false }); else { traversal.snapPlayerToSupport(region.x, region.z); setPlace(region.name, region.note || 'Region'); }
      modal.classList.add('hidden');
    }));
    if (locked) document.exitPointerLock?.();
  }

  function openSources() {
    if (ui === 'aizanoi') { $('#sourcesOverlay')?.classList.remove('hidden'); if (locked) document.exitPointerLock?.(); return; }
    const modal = $('#modal'), title = $('#modalTitle'), body = $('#modalBody'); if (!modal || !title || !body) return;
    title.textContent = 'Sources'; body.innerHTML = sources.map((s) => `<p><a target="_blank" rel="noopener" href="${s.url}">${s.title}</a></p>`).join('') || '<p>No source records.</p>'; modal.classList.remove('hidden');
    if (locked) document.exitPointerLock?.();
  }

  function openEvidence() {
    const counts = new Map(); for (const b of buildings) counts.set(evidenceLevel(b), (counts.get(evidenceLevel(b)) || 0) + 1);
    if (ui === 'aizanoi') { $('#atlasOverlay')?.classList.remove('hidden'); return; }
    const modal = $('#modal'), title = $('#modalTitle'), body = $('#modalBody'); if (!modal || !title || !body) return;
    title.textContent = 'Evidence model'; body.innerHTML = `<p>The renderer is deliberately blocky/low-poly. Visual simplicity does not change the underlying evidence labels.</p>${[...counts].map(([k, v]) => `<p><b>${k}</b>: ${v}</p>`).join('')}`; modal.classList.remove('hidden');
  }

  function setPlace(name, detail) {
    if (ui === 'aizanoi') { $('#locName') && ($('#locName').textContent = name); return; }
    $('#place') && ($('#place').textContent = name); $('#detail') && ($('#detail').textContent = detail || 'Flat-ground Ancient World');
  }

  function updatePlace() {
    if (arrivalIdentity) {
      if (Math.hypot(player.x - arrivalIdentity.x, player.z - arrivalIdentity.z) <= 3.5) {
        setPlace(arrivalIdentity.record.name, recordDetail(arrivalIdentity.record));
        return;
      }
      arrivalIdentity = null;
    }
    const nearest = nearestLandmark(130);
    if (nearest) setPlace(nearest.record.name, recordDetail(nearest.record));
    else if (ui !== 'aizanoi') setPlace(city.title, 'Flat-ground blocky reconstruction · WASD to walk');
  }

  function mapBounds() { return { ...worldBounds, pad: 10 }; }

  function projectMap(x, z, w, h) {
    const b = mapBounds(), pad = 10;
    return [pad + (x - b.minX) / (b.maxX - b.minX) * (w - pad * 2), h - pad - (z - b.minZ) / (b.maxZ - b.minZ) * (h - pad * 2)];
  }

  function drawMap(ctx, w, h, detailed = false) {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#171812'; ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (const water of waters) {
      ctx.strokeStyle = '#557f86'; ctx.lineWidth = detailed ? 12 : 7;
      if (water.type === 'rect') {
        const p = projectMap(water.x, water.z, w, h); const p2 = projectMap(water.x + water.w / 2, water.z + water.d / 2, w, h);
        ctx.fillStyle = '#466f77'; ctx.fillRect(p[0] - Math.abs(p2[0] - p[0]), p[1] - Math.abs(p2[1] - p[1]), Math.abs(p2[0] - p[0]) * 2, Math.abs(p2[1] - p[1]) * 2);
      } else {
        ctx.beginPath(); (water.points || []).forEach((q, i) => { const p = projectMap(q[0], q[1], w, h); i ? ctx.lineTo(...p) : ctx.moveTo(...p); }); ctx.stroke();
      }
    }
    for (const street of streets) { ctx.strokeStyle = '#7d705b'; ctx.lineWidth = detailed ? 3 : 1.5; ctx.beginPath(); street.points.forEach((q, i) => { const p = projectMap(q[0], q[1], w, h); i ? ctx.lineTo(...p) : ctx.moveTo(...p); }); ctx.stroke(); }
    for (const b of landmarkRecords) { if (!active(b)) continue; const p = projectMap(b.x, b.z, w, h); ctx.fillStyle = evidenceLevel(b) === 'plausible' ? '#9b7b61' : '#d6a65d'; ctx.beginPath(); ctx.arc(p[0], p[1], detailed ? 4.5 : 3, 0, TAU); ctx.fill(); if (detailed) { ctx.fillStyle = '#eadfc9'; ctx.font = '10px system-ui'; ctx.fillText(b.name, p[0] + 6, p[1] - 5); } }
    const p = projectMap(player.x, player.z, w, h); ctx.fillStyle = '#fff2d7'; ctx.beginPath(); ctx.arc(p[0], p[1], detailed ? 5 : 3.5, 0, TAU); ctx.fill();
  }

  function drawMiniMap() {
    const canvas2 = ui === 'aizanoi' ? $('#miniMap') : $('#minimap'); if (!canvas2) return;
    drawMap(canvas2.getContext('2d'), canvas2.width, canvas2.height, false);
  }

  function drawAizanoiAtlas() {
    const atlas = $('#atlasCanvas'); if (!atlas) return;
    drawMap(atlas.getContext('2d'), atlas.width, atlas.height, true);
  }

  function updateAizanoiHud() {
    const deg = ((180 - player.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    $('#headingCardinal') && ($('#headingCardinal').textContent = dirs[Math.round(deg / 45) % 8]);
    $('#headingDegrees') && ($('#headingDegrees').textContent = `${String(Math.round(deg)).padStart(3, '0')}°`);
    $('#elevationValue') && ($('#elevationValue').textContent = `+${player.floorY.toFixed(1)} m`);
    $('#surfaceName') && ($('#surfaceName').textContent = player.surfaceTag || 'flat ground');
  }

  function requestLock(showMessage = true) {
    if (TOUCH || !started || document.pointerLockElement === canvas) return;
    try { canvas.requestPointerLock?.(); if (showMessage) toast('Mouse look locked · Esc releases it'); } catch (_) {}
  }

  function onMouseMove(event) { if (!locked) return; player.yaw += event.movementX * 0.00185; player.pitch = clamp(player.pitch - event.movementY * 0.00165, -1.3, 1.3); }
  function onKeyDown(event) {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) { keys.add(event.code); if (started) event.preventDefault(); }
    if (event.code === 'KeyE' && started) openInspect();
    if (event.code === 'KeyM' && started) openAtlas();
  }
  function onKeyUp(event) { keys.delete(event.code); }
  lifecycle.listen(document, 'keydown', onKeyDown); lifecycle.listen(document, 'keyup', onKeyUp);
  lifecycle.listen(document, 'mousemove', onMouseMove);
  lifecycle.listen(document, 'pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked) resetMovementState(); });
  lifecycle.listen(canvas, 'click', () => { if (started && !TOUCH) requestLock(false); });
  lifecycle.listen(window, 'blur', resetMovementState);
  lifecycle.listen(document, 'visibilitychange', () => { if (document.hidden) resetMovementState(); });

  const mobile = installMobileControls({
    canvas,
    lifecycle,
    enabled: TOUCH,
    isActive: () => started,
    isBlocked: () => false,
    onLook: (dx, dy) => { player.yaw += dx; player.pitch = clamp(player.pitch - dy, -1.25, 1.25); },
    onInspect: () => openInspect(),
    onMap: () => openAtlas(),
  });

  function populateJump(select) {
    if (!select) return;
    if (ui === 'standard') select.innerHTML = '<option value="">Jump to landmark…</option>';
    const existing = new Set([...select.options].map((o) => o.value));
    for (const b of landmarkRecords) if (!existing.has(b.id)) select.add(new Option(b.name, b.id));
    select.addEventListener('change', (event) => { const id = event.target.value; event.target.value = ''; if (id) teleportTo(id); });
  }

  function setupStandardUI() {
    $('#introText') && ($('#introText').textContent = city.description || 'Source-led flat-ground reconstruction.');
    populateJump($('#jump'));
    $('#enter')?.addEventListener('click', () => { $('#intro')?.classList.add('hidden'); started = true; canvas.focus(); if (!TOUCH) requestLock(false); });
    $('#inspect')?.addEventListener('click', () => openInspect());
    $('#atlas')?.addEventListener('click', openAtlas);
    $('#sources')?.addEventListener('click', openSources);
    $('#evidence')?.addEventListener('click', openEvidence);
    $('#modern')?.addEventListener('click', (event) => { modernOverlay = !modernOverlay; event.currentTarget.textContent = `Modern overlay: ${modernOverlay ? 'on' : 'off'}`; toast(modernOverlay ? 'Modern orientation overlay enabled on atlas/minimap.' : 'Modern orientation overlay disabled.'); });
    $('#audio')?.addEventListener('click', (event) => { toggleAudio(); event.currentTarget.textContent = audio?.enabled ? 'Sound: on' : 'Sound: off'; });
    $('#modalClose')?.addEventListener('click', () => $('#modal')?.classList.add('hidden'));
  }

  function setupAizanoiUI() {
    $('#loading')?.classList.add('hidden'); $('#boot')?.classList.remove('hidden');
    populateJump($('#teleport'));
    const tour = landmarkRecords.slice(0, 10); let tourIndex = Math.max(0, tour.findIndex((record) => record.id === 'temple'));
    const updateTour = () => { const r = tour[tourIndex]; $('#tourTitle') && ($('#tourTitle').textContent = r?.name || 'Guided walk'); $('#tourText') && ($('#tourText').textContent = r ? recordDetail(r) : ''); };
    const enterWorld = ({ guided = false } = {}) => {
      $('#boot')?.classList.add('hidden'); $('#hud')?.classList.remove('hidden'); started = true; canvas.focus();
      if (guided) {
        updateTour(); $('#tourCard')?.classList.remove('hidden');
        const first = tour[tourIndex]; if (first) teleportTo(first.id, { lock: false });
      } else if (!TOUCH) requestLock(false);
    };
    $('#guidedEnterBtn')?.addEventListener('click', () => enterWorld({ guided: true }));
    $('#enterBtn')?.addEventListener('click', () => enterWorld());
    $('#atlasBtn')?.addEventListener('click', openAtlas); $('#mapOpenBtn')?.addEventListener('click', openAtlas); $('#openAtlasIntro')?.addEventListener('click', openAtlas);
    $('#atlasClose')?.addEventListener('click', () => $('#atlasOverlay')?.classList.add('hidden'));
    $('#sourcesBtn')?.addEventListener('click', openSources); $('#openSourcesIntro')?.addEventListener('click', openSources); $('#sourcesClose')?.addEventListener('click', () => $('#sourcesOverlay')?.classList.add('hidden'));
    $('#infoClose')?.addEventListener('click', () => document.body.classList.remove('infoOpen'));
    $('#soundBtn')?.addEventListener('click', (event) => { toggleAudio(); event.currentTarget.textContent = audio?.enabled ? 'AMBIENCE: ON' : 'AMBIENCE: OFF'; });
    $('#fullscreenBtn')?.addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.(); else await document.exitFullscreen?.(); } catch (_) {} });
    $('#resumeBtn')?.addEventListener('click', () => requestLock(true));
    $('#walkSpeedSlider')?.addEventListener('input', (e) => { walkSpeed = Number(e.target.value) || WALK_SPEED; $('#walkSpeedValue') && ($('#walkSpeedValue').textContent = `${walkSpeed.toFixed(1)} m/s`); });
    $('#timeSlider')?.addEventListener('input', (e) => { dayHour = Number(e.target.value) || 15; const hr = Math.floor(dayHour), min = Math.round((dayHour - hr) * 60); $('#timeLabel') && ($('#timeLabel').textContent = `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`); });
    document.querySelectorAll('.eraBtn').forEach((button) => button.addEventListener('click', () => { currentEra = Number(button.dataset.era) || 225; document.querySelectorAll('.eraBtn').forEach((b) => b.classList.toggle('active', b === button)); toast(`${currentEra} · flat-ground city layer`); }));
    $('#tourBtn')?.addEventListener('click', () => { $('#tourCard')?.classList.toggle('hidden'); updateTour(); });
    $('#tourPrev')?.addEventListener('click', () => { tourIndex = (tourIndex - 1 + tour.length) % tour.length; updateTour(); });
    $('#tourNext')?.addEventListener('click', () => { tourIndex = (tourIndex + 1) % tour.length; updateTour(); });
    $('#tourVisit')?.addEventListener('click', () => { const r = tour[tourIndex]; if (r) teleportTo(r.id, { lock: false }); $('#tourCard')?.classList.add('hidden'); });
    $('#tourClose')?.addEventListener('click', () => $('#tourCard')?.classList.add('hidden'));
    drawAizanoiAtlas();
  }

  function toggleAudio() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return toast('Web Audio unavailable.');
      const ctx = lifecycle.trackAudioContext(new AC());
      const gain = ctx.createGain(); gain.gain.value = 0.018;
      const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 82;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 180;
      osc.connect(filter).connect(gain).connect(ctx.destination); osc.start(); audio = { ctx, gain, osc, enabled: true };
    } else { audio.enabled = !audio.enabled; audio.gain.gain.setTargetAtTime(audio.enabled ? 0.018 : 0, audio.ctx.currentTime, 0.08); }
  }

  function toast(message) {
    const node = $('#toast'); if (node) { node.textContent = message; node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 1800); }
    else console.info(`[Ancient World] ${message}`);
  }

  if (ui === 'aizanoi') setupAizanoiUI(); else setupStandardUI();

  function readinessSnapshot() {
    const now = performance.now();
    const travelLockRemainingMs = Math.max(0, movementLockUntil - now);
    const focused = document.hasFocus();
    const pointerLocked = document.pointerLockElement === canvas && locked;
    const inputReady = started && focused && (TOUCH || pointerLocked);
    const mobileState = mobile.snapshot();
    const movementInputActive = ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some((code) => keys.has(code)) ||
      Math.hypot(mobileState.moveX, mobileState.moveY) > 0;
    return {
      rendered,
      started,
      focused,
      pointerLocked,
      travelLocked: travelLockRemainingMs > 0,
      travelLockRemainingMs,
      inputReady,
      movementInputActive,
      playable: rendered && inputReady && travelLockRemainingMs === 0,
    };
  }

  const debug = {
    get player() { return { x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch, floorY: player.floorY, surfaceTag: player.surfaceTag }; },
    setPlayer(x, z, floor = null) { traversal.snapPlayerToSupport(x, z); if (floor != null) { player.floorY = floor; player.y = floor + EYE_HEIGHT; } return this.player; },
    teleportTo,
    collide: traversal.collide,
    resetMovementState,
    absoluteSupportAt: traversal.absoluteSupportAt,
    resolveSupport: traversal.resolveSupport,
    moveWithSubsteps: traversal.moveWithSubsteps,
    get activeKeys() { return [...keys]; },
    get readiness() { return readinessSnapshot(); },
    get quality() { return quality.snapshot(); },
    forceQualityTier(tier) { return quality.forceTier(tier); },
    get geometry() { return { ...scene.stats(), houses: urbanFabric.length, roads: streets.length, bridges: bridges.length, flatGround: true, waterSurfaces:waterSurfaces.length, assetTypes: assets.types.length }; },
    get traversal() { return { floorY: player.floorY, eyeY: player.y, eyeHeight: EYE_HEIGHT, support: traversal.resolveSupport(player.x, player.z, player.floorY), surfaceTag: player.surfaceTag, flatGround: true }; },
    get movementLockUntil() { return movementLockUntil; },
    step(dt = 0.016) { movementLockUntil = 0; update(dt); },
    unlockMovement() { movementLockUntil = 0; },
    landmarks: landmarkRecords,
    bridges,
    teleportViews,
    stairFlights: [],
    assets: assets.types,
    renderer: Object.freeze({ surfaceShader:'procedural-multiscale', proceduralSky:true, animatedWater:true, adaptiveQuality:true }),
    world: { flatGround: true, bounds: worldBounds, route: cityRoute },
  };

  window.__ANCIENT_WORLD_DEBUG__ = debug;
  if (ui === 'aizanoi') window.__AIZANOI_DEBUG__ = Object.assign(window.__AIZANOI_DEBUG__ || {}, debug);
  window.__ANCIENT_WORLD_DESTROY__ = () => lifecycle.destroy();
  installBackToOS({ onBeforeExit: () => lifecycle.destroy() });
  lifecycle.listen(window, 'pagehide', () => lifecycle.destroy(), { once: true });

  lifecycle.frame(render);
  return { debug, destroy: () => lifecycle.destroy(), assets, scene };
}

export const FLAT_CITY_RUNTIME = Object.freeze({
  renderer: 'custom-webgl-blocky',
  terrain: 'flat-y0',
  eyeHeight: 1.68,
  walkSpeed: 3.8,
  sprintSpeed: 7.2,
  surfaceShader: 'procedural-multiscale',
  proceduralSky: true,
  animatedWater: true,
  adaptiveQuality: true,
  trueVoxelEngine: false,
});
