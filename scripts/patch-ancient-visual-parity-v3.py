from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ROME = ROOT / 'frontend/ancient-cities/rome-410-476/js/app.js'
ATHENS = ROOT / 'frontend/ancient-cities/athens-450-430/js/app.js'


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label):
    out, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one regex match, got {count}')
    return out


SHARED_IMPORT = """import { installMobileControls } from '../../../ancient-world/engine/mobile-controls.js';
import { ANCIENT_CITY_FRAGMENT_SHADER } from '../../../ancient-world/engine/surface-shader.js';
import {
  createAncientSkyRenderer,
  createAncientWaterRenderer,
  waterRect,
  waterRibbon,
} from '../../../ancient-world/engine/environment-renderer.js';"""

PITCHED = r"""function pitchedBuilding\(x, y, z, width, height, depth, color, rot = 0\) \{.*?\n\}\n\nfunction arch"""
PITCHED_REPLACEMENT = """function pitchedBuilding(x, y, z, width, height, depth, color, rot = 0) {
  const wallHeight = height * 0.72;
  box(x, y, z, width, wallHeight, depth, color, rot);
  const y0 = y + wallHeight;
  const top = y + height;
  const corners = [
    [-width / 2, -depth / 2],
    [ width / 2, -depth / 2],
    [ width / 2,  depth / 2],
    [-width / 2,  depth / 2],
  ].map(([lx, lz]) => {
    const [rx, rz] = rotateXZ(x + lx, z + lz, x, z, rot);
    return [rx, y0, rz];
  });
  const ridgeA2 = rotateXZ(x, z - depth / 2, x, z, rot);
  const ridgeB2 = rotateXZ(x, z + depth / 2, x, z, rot);
  const ridgeA = [ridgeA2[0], top, ridgeA2[1]];
  const ridgeB = [ridgeB2[0], top, ridgeB2[1]];
  tri(corners[0], corners[1], ridgeA, C.roof);
  tri(corners[2], corners[3], ridgeB, C.roof);
  quad(corners[0], ridgeA, ridgeB, corners[3], C.roof);
  quad(ridgeA, corners[1], corners[2], ridgeB, C.roof);
  // Aizanoi-style ridge cap makes roof silhouettes read at street level.
  box(x, top - 0.08, z, 0.28, 0.16, depth + 0.55, C.roof2 || C.roof, rot);
}

function arch"""

THEATRE = r"""function theatre\(building, color\) \{.*?\n\}\n\nfunction longStadium"""
THEATRE_REPLACEMENT = """function theatre(building, color) {
  const ground = baseY(building);
  const radius = Math.max(building.w, building.d) * 0.46;
  const rows = TOUCH ? 6 : 10;
  const segments = TOUCH ? 15 : 24;
  const orientation = building.rot || 0;
  // Stepped semicircular cavea: substantially closer to a theatre silhouette
  // than the old stack of full cylinders, while staying procedural.
  for (let row = 0; row < rows; row++) {
    const t = row / Math.max(1, rows - 1);
    const r = radius * (0.34 + t * 0.62);
    const rise = ground + row * Math.max(0.34, building.h * 0.052);
    const seatDepth = Math.max(1.5, radius * 0.052);
    const arcWidth = Math.max(2.1, Math.PI * r / segments * 0.92);
    for (let i = 0; i < segments; i++) {
      const a = (i / Math.max(1, segments - 1)) * Math.PI;
      const lx = Math.cos(a) * r;
      const lz = Math.sin(a) * r;
      const [x, z] = rotateXZ(building.x + lx, building.z + lz, building.x, building.z, orientation);
      box(x, rise, z, arcWidth, 0.42 + t * 0.22, seatDepth, row % 2 ? C.limestone : color, orientation + a + Math.PI / 2);
    }
  }
  const [stageX, stageZ] = rotateXZ(building.x, building.z - radius * 0.18, building.x, building.z, orientation);
  box(stageX, ground, stageZ, building.w * 0.74, Math.max(2.8, building.h * 0.30), Math.max(5, building.d * 0.16), C.brick, orientation);
  box(stageX, ground + Math.max(2.8, building.h * 0.30), stageZ, building.w * 0.78, 0.38, Math.max(5.4, building.d * 0.17), C.limestone, orientation);
}

function longStadium"""

INPUT_REPLACEMENT = """function installInput() {
  let mouseDrag = null;
  let mouseDragDistance = 0;

  const applyMouseLook = (dx, dy, horizontal = 0.00315, vertical = 0.00285) => {
    // Match the mature Aizanoi convention: positive horizontal mouse motion
    // increases yaw, so moving/dragging right turns the view right.
    player.yaw += dx * horizontal;
    player.pitch = Math.max(-1.15, Math.min(0.85, player.pitch - dy * vertical));
  };

  lifecycle.listen(canvas, 'pointerdown', (event) => {
    if (TOUCH || !gameStarted || locked || modalOpen()) return;
    mouseDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    mouseDragDistance = 0;
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  lifecycle.listen(canvas, 'pointermove', (event) => {
    if (TOUCH || !mouseDrag || event.pointerId !== mouseDrag.id || locked || modalOpen()) return;
    const dx = event.clientX - mouseDrag.x;
    const dy = event.clientY - mouseDrag.y;
    mouseDrag.x = event.clientX;
    mouseDrag.y = event.clientY;
    mouseDragDistance += Math.abs(dx) + Math.abs(dy);
    applyMouseLook(dx, dy);
    event.preventDefault();
  });
  const finishMouseDrag = (event) => {
    if (!mouseDrag || event.pointerId !== mouseDrag.id) return;
    const shortClick = mouseDragDistance < 7;
    mouseDrag = null;
    if (shortClick && gameStarted && FINE_POINTER && !modalOpen()) canvas.requestPointerLock?.();
  };
  lifecycle.listen(canvas, 'pointerup', finishMouseDrag);
  lifecycle.listen(canvas, 'pointercancel', (event) => { if (mouseDrag?.id === event.pointerId) mouseDrag = null; });

  lifecycle.listen(document, 'pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
  lifecycle.listen(document, 'pointerlockerror', () => { locked = false; });
  lifecycle.listen(document, 'mousemove', (event) => {
    if (!locked || modalOpen()) return;
    applyMouseLook(event.movementX, event.movementY, 0.00185, 0.00165);
  });
  lifecycle.listen(window, 'keydown', (event) => {
    if (modalOpen()) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    }
    if (event.code === 'KeyE' && gameStarted) nearestInfo();
  });
  lifecycle.listen(window, 'keyup', (event) => keys.delete(event.code));
  lifecycle.listen(window, 'blur', clearMovementState);
  lifecycle.listen(document, 'visibilitychange', () => { if (document.hidden) clearMovementState(); });
}

$('#atlas')"""

ROME_URBAN = """function facadePoint(building, side, front) {
  const rot = building.rot || 0;
  return [
    building.x + Math.cos(rot) * side - Math.sin(rot) * front,
    building.z + Math.sin(rot) * side + Math.cos(rot) * front,
  ];
}

function addRomanStreetDetail(building, ground) {
  const rot = building.rot || 0;
  const front = building.d / 2 + 0.07;
  // Stone socle, doorway, window rhythm and lintels establish human scale.
  box(building.x, ground, building.z, building.w + 0.24, 0.58, building.d + 0.24, C.limestone2, rot);
  let p = facadePoint(building, 0, front);
  box(p[0], ground + 0.58, p[1], Math.min(1.45, building.w * 0.18), 2.25, 0.16, C.timber, rot);
  const floors = Math.max(1, Math.min(3, building.floors || Math.round(building.h / 3.2)));
  for (let floor = 1; floor < floors; floor++) {
    const y = ground + 1.65 + floor * 2.45;
    if (y + 1.25 > ground + building.h * 0.72) break;
    for (const side of [-0.27, 0.27]) {
      p = facadePoint(building, building.w * side, front + 0.02);
      box(p[0], y, p[1], Math.min(1.35, building.w * 0.17), 1.18, 0.14, C.darkStone, rot);
      box(p[0], y + 1.18, p[1], Math.min(1.55, building.w * 0.19), 0.13, 0.20, C.limestone, rot);
    }
  }
  if (building.shopfront) {
    const shopSide = -building.w * 0.18;
    p = facadePoint(building, shopSide, front + 0.05);
    box(p[0], ground + 0.36, p[1], Math.min(3.2, building.w * 0.36), 2.30, 0.18, C.darkStone, rot);
    const awning = facadePoint(building, shopSide, front + 1.02);
    box(awning[0], ground + 2.55, awning[1], Math.min(3.8, building.w * 0.44), 0.10, 1.95, C.red, rot);
    if (!TOUCH) {
      const prop = facadePoint(building, building.w * 0.16, front + 0.70);
      box(prop[0], ground + 0.02, prop[1], 0.75, 0.68, 0.75, C.timber, rot + 0.18);
      cylinder(prop[0] + 0.72, ground + 0.02, prop[1] + 0.18, 0.22, 0.70, C.roof2, 8);
    }
  }
}

function renderUrbanFabric(building) {
  const ground = terrainHeightAt(building.x, building.z);
  const material = C[building.material] || C.brick;
  if (building.courtyard) {
    const wingW = building.w * 0.38;
    pitchedBuilding(building.x - building.w * 0.28, ground, building.z, wingW, building.h, building.d, material, building.rot);
    pitchedBuilding(building.x + building.w * 0.28, ground, building.z, wingW, building.h * 0.92, building.d, material, building.rot);
  } else {
    pitchedBuilding(building.x, ground, building.z, building.w, building.h, building.d, material, building.rot);
  }
  addRomanStreetDetail(building, ground);
  colliders.push(rectCollider(building.x, building.z, building.w, building.d, building.rot || 0, building.name));
}

function decorativeCypress"""

ATHENS_URBAN = """function facadePoint(building, side, front) {
  const rot = building.rot || 0;
  return [
    building.x + Math.cos(rot) * side - Math.sin(rot) * front,
    building.z + Math.sin(rot) * side + Math.cos(rot) * front,
  ];
}

function addAthenianStreetDetail(building, ground) {
  const rot = building.rot || 0;
  const front = building.d / 2 + 0.07;
  // Low stone base + plaster, timber openings and terracotta roof cues mirror
  // Aizanoi's street-level density without claiming excavated house elevations.
  box(building.x, ground, building.z, building.w + 0.22, 0.48, building.d + 0.22, C.limestone2, rot);
  let p = facadePoint(building, 0, front);
  box(p[0], ground + 0.48, p[1], Math.min(1.35, building.w * 0.18), 2.05, 0.15, C.timber, rot);
  const floors = Math.max(1, Math.min(2, building.floors || Math.round(building.h / 3.4)));
  if (floors > 1 && building.h > 5.1) {
    for (const side of [-0.25, 0.25]) {
      p = facadePoint(building, building.w * side, front + 0.02);
      box(p[0], ground + 3.10, p[1], Math.min(1.18, building.w * 0.16), 1.02, 0.13, C.darkStone, rot);
      box(p[0], ground + 4.12, p[1], Math.min(1.38, building.w * 0.18), 0.12, 0.18, C.limestone, rot);
    }
  }
  if (building.shopfront) {
    const shopSide = -building.w * 0.17;
    p = facadePoint(building, shopSide, front + 0.04);
    box(p[0], ground + 0.32, p[1], Math.min(3.0, building.w * 0.34), 2.15, 0.16, C.darkStone, rot);
    const awning = facadePoint(building, shopSide, front + 0.90);
    box(awning[0], ground + 2.42, awning[1], Math.min(3.55, building.w * 0.42), 0.09, 1.72, C.red, rot);
    if (!TOUCH) {
      const prop = facadePoint(building, building.w * 0.15, front + 0.62);
      cylinder(prop[0], ground + 0.02, prop[1], 0.20, 0.62, C.roof2, 8);
      cylinder(prop[0] + 0.50, ground + 0.02, prop[1] + 0.12, 0.17, 0.52, C.roof, 8);
    }
  }
}

function renderUrbanFabric(building) {
  const ground = terrainHeightAt(building.x, building.z);
  const material = building.material === 'brick' ? C.plaster2 : (C[building.material] || C.plaster3);
  if (building.courtyard) {
    const wingW = building.w * 0.38;
    pitchedBuilding(building.x - building.w * 0.28, ground, building.z, wingW, building.h, building.d, material, building.rot);
    pitchedBuilding(building.x + building.w * 0.28, ground, building.z, wingW, building.h * 0.92, building.d, material, building.rot);
  } else {
    pitchedBuilding(building.x, ground, building.z, building.w, building.h, building.d, material, building.rot);
  }
  addAthenianStreetDetail(building, ground);
  colliders.push(rectCollider(building.x, building.z, building.w, building.d, building.rot || 0, building.name));
}

function decorativeOlive"""

MAXENTIUS = """function maxentiusHero(building, color) {
  const ground = baseY(building);
  box(building.x, ground, building.z, building.w, 0.72, building.d, C.roadLight);
  const baySpacing = building.w * 0.26;
  for (let bay = -1; bay <= 1; bay++) {
    arch(
      building.x + bay * baySpacing,
      ground + 0.72,
      building.z,
      building.w * 0.22,
      building.h * 0.78,
      building.d * 0.56,
      bay === 0 ? C.brick : color,
    );
  }
  box(building.x, ground + building.h * 0.10, building.z + building.d * 0.38, building.w * 0.92, building.h * 0.58, building.d * 0.14, C.brickDark);
  for (let i = -2; i <= 2; i++) {
    box(building.x + i * building.w * 0.18, ground + 0.72, building.z - building.d * 0.34, 4.2, building.h * 0.54, 5.0, C.brickDark);
  }
}

function forum"""


def patch_common(path, city):
    text = path.read_text()
    text = replace_once(text, "import { installMobileControls } from '../../../ancient-world/engine/mobile-controls.js';", SHARED_IMPORT, f'{city} shared imports')
    text = regex_once(text, PITCHED, PITCHED_REPLACEMENT, f'{city} pitched building')
    text = regex_once(text, THEATRE, THEATRE_REPLACEMENT, f'{city} theatre')
    text = regex_once(text, r"const fragmentShader = `.*?`;\n\nfunction makeProgram", "const fragmentShader = ANCIENT_CITY_FRAGMENT_SHADER;\n\nfunction makeProgram", f'{city} fragment shader')
    text = regex_once(text, r"function installInput\(\) \{.*?\n\}\n\n\$\('#atlas'\)", INPUT_REPLACEMENT, f'{city} input')
    return text


rome = patch_common(ROME, 'Rome')
rome = regex_once(rome, r"function renderUrbanFabric\(building\) \{.*?\n\}\n\nfunction decorativeCypress", ROME_URBAN, 'Rome urban fabric')
rome = replace_once(rome, "function forum(building, color) {", MAXENTIUS.replace('function forum', 'function forum') + "(building, color) {", 'Rome Maxentius insertion')
rome = replace_once(rome, "else if (building.type === 'basilica') basilica(building, color, false);", "else if (building.id === 'maxentius') maxentiusHero(building, color);\n  else if (building.type === 'basilica') basilica(building, color, false);", 'Rome Maxentius routing')
rome = replace_once(rome, "});\n\nfunction perspective(fov, aspect, near, far) {", "});\n\nconst skyRenderer = createAncientSkyRenderer(gl);\nconst waterRenderer = createAncientWaterRenderer(gl, [\n  waterRect({\n    x0: TIBER.x - TIBER.halfWidth,\n    x1: TIBER.x + TIBER.halfWidth,\n    z0: WORLD_BOUNDS.minZ,\n    z1: WORLD_BOUNDS.maxZ,\n    y: TIBER.waterY + 0.035,\n    color: C.water,\n  }),\n]);\nlifecycle.addCleanup(() => { skyRenderer.destroy(); waterRenderer.destroy(); });\n\nfunction perspective(fov, aspect, near, far) {", 'Rome environment renderer init')
rome = regex_once(rome, r"function draw\(\) \{.*?\n\}\n\nfunction clearOverlay", """function draw() {
  resize();
  const fog = modernOverlay ? [0.48, 0.60, 0.64] : [0.55, 0.49, 0.41];
  const fogDensity = TOUCH ? 0.00072 : 0.00056;
  const projection = perspective((TOUCH ? 70 : 67) * Math.PI / 180, canvas.width / canvas.height, 0.08, 2600);
  const view = camera();
  gl.clearColor(fog[0] * 0.82, fog[1] * 0.86, fog[2] * 0.90, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  skyRenderer.draw({
    top: modernOverlay ? [0.43, 0.55, 0.63] : [0.36, 0.44, 0.52],
    horizon: modernOverlay ? [0.61, 0.65, 0.66] : [0.72, 0.57, 0.41],
    yaw: player.yaw,
    pitch: player.pitch,
    sunYaw: 0.92,
  });
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(program);

  const stride = 9 * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(locations.aP);
  gl.vertexAttribPointer(locations.aP, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(locations.aN);
  gl.vertexAttribPointer(locations.aN, 3, gl.FLOAT, false, stride, 3 * 4);
  gl.enableVertexAttribArray(locations.aC);
  gl.vertexAttribPointer(locations.aC, 3, gl.FLOAT, false, stride, 6 * 4);

  gl.uniformMatrix4fv(locations.uP, false, projection);
  gl.uniformMatrix4fv(locations.uV, false, view);
  gl.uniform3fv(locations.uFog, new Float32Array(fog));
  gl.uniform3fv(locations.uSun, new Float32Array([0.50, 0.84, 0.27]));
  gl.uniform1f(locations.uAmbient, 0.47);
  gl.uniform1f(locations.uFogDensity, fogDensity);
  gl.drawArrays(gl.TRIANGLES, 0, geometry.length / 9);
  waterRenderer.draw({ projection, view, fog, fogDensity });

  if (modernOverlay) drawOverlay();
  else clearOverlay();
  updateNearest();
}

function clearOverlay""", 'Rome draw')
ROME.write_text(rome)

athens = patch_common(ATHENS, 'Athens')
athens = regex_once(athens, r"function renderUrbanFabric\(building\) \{.*?\n\}\n\nfunction decorativeOlive", ATHENS_URBAN, 'Athens urban fabric')
athens = replace_once(athens, "});\n\nfunction perspective(fov, aspect, near, far) {", "});\n\nconst skyRenderer = createAncientSkyRenderer(gl);\nconst waterRenderer = createAncientWaterRenderer(gl, [\n  waterRect({\n    x0: ERIDANOS.x - ERIDANOS.halfWidth,\n    x1: ERIDANOS.x + ERIDANOS.halfWidth,\n    z0: WORLD_BOUNDS.minZ,\n    z1: WORLD_BOUNDS.maxZ,\n    y: ERIDANOS.waterY + 0.035,\n    color: C.water,\n  }),\n  waterRibbon({\n    x0: ILISSOS.x - 40,\n    z0: ILISSOS.zOffset - 16,\n    x1: ILISSOS.x + 360,\n    z1: ILISSOS.zOffset + 144,\n    halfWidth: ILISSOS.halfWidth,\n    y: ILISSOS.waterY + 0.035,\n    color: C.water,\n  }),\n]);\nlifecycle.addCleanup(() => { skyRenderer.destroy(); waterRenderer.destroy(); });\n\nfunction perspective(fov, aspect, near, far) {", 'Athens environment renderer init')
athens = regex_once(athens, r"function draw\(\) \{.*?\n\}\n\nfunction clearOverlay", """function draw() {
  resize();
  const fog = modernOverlay ? [0.48, 0.60, 0.64] : [0.69, 0.67, 0.57];
  const fogDensity = TOUCH ? 0.00066 : 0.00050;
  const projection = perspective((TOUCH ? 72 : 69) * Math.PI / 180, canvas.width / canvas.height, 0.08, 2600);
  const view = camera();
  gl.clearColor(fog[0] * 0.91, fog[1] * 0.94, fog[2] * 0.98, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  skyRenderer.draw({
    top: modernOverlay ? [0.43, 0.57, 0.68] : [0.40, 0.58, 0.72],
    horizon: modernOverlay ? [0.66, 0.70, 0.68] : [0.83, 0.76, 0.59],
    yaw: player.yaw,
    pitch: player.pitch,
    sunYaw: 0.72,
  });
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(program);

  const stride = 9 * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(locations.aP);
  gl.vertexAttribPointer(locations.aP, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(locations.aN);
  gl.vertexAttribPointer(locations.aN, 3, gl.FLOAT, false, stride, 3 * 4);
  gl.enableVertexAttribArray(locations.aC);
  gl.vertexAttribPointer(locations.aC, 3, gl.FLOAT, false, stride, 6 * 4);

  gl.uniformMatrix4fv(locations.uP, false, projection);
  gl.uniformMatrix4fv(locations.uV, false, view);
  gl.uniform3fv(locations.uFog, new Float32Array(fog));
  gl.uniform3fv(locations.uSun, new Float32Array([0.36, 0.92, 0.24]));
  gl.uniform1f(locations.uAmbient, 0.52);
  gl.uniform1f(locations.uFogDensity, fogDensity);
  gl.drawArrays(gl.TRIANGLES, 0, geometry.length / 9);
  waterRenderer.draw({ projection, view, fog, fogDensity });

  if (modernOverlay) drawOverlay();
  else clearOverlay();
  updateNearest();
}

function clearOverlay""", 'Athens draw')
ATHENS.write_text(athens)

TEST = ROOT / 'tests/ancient-world-visual-parity.test.mjs'
TEST.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const rome = read('frontend/ancient-cities/rome-410-476/js/app.js');
const athens = read('frontend/ancient-cities/athens-450-430/js/app.js');
const shader = read('frontend/ancient-world/engine/surface-shader.js');
const environment = read('frontend/ancient-world/engine/environment-renderer.js');
const materials = read('frontend/ancient-world/assets/materials.js');

test('Rome and Athens use the same horizontal mouse-look convention as Aizanoi', () => {
  for (const source of [rome, athens]) {
    assert.match(source, /player\.yaw \+= dx \* horizontal/);
    assert.doesNotMatch(source, /player\.yaw -= event\.movementX/);
    assert.match(source, /mouseDragDistance/);
    assert.match(source, /setPointerCapture/);
  }
});

test('shared renderer carries Aizanoi-derived material and atmosphere detail', () => {
  assert.match(shader, /gridLine/);
  assert.match(shader, /roofMask/);
  assert.match(shader, /course/);
  assert.match(environment, /fbm/);
  assert.match(environment, /createAncientSkyRenderer/);
  assert.match(environment, /createAncientWaterRenderer/);
  assert.match(environment, /shimmer/);
});

test('both cities render shared sky and animated water passes', () => {
  for (const source of [rome, athens]) {
    assert.match(source, /createAncientSkyRenderer/);
    assert.match(source, /createAncientWaterRenderer/);
    assert.match(source, /skyRenderer\.draw/);
    assert.match(source, /waterRenderer\.draw/);
    assert.match(source, /ANCIENT_CITY_FRAGMENT_SHADER/);
  }
});

test('street-level urban fabric has Aizanoi-style human-scale facade cues', () => {
  assert.match(rome, /addRomanStreetDetail/);
  assert.match(rome, /shopfront/);
  assert.match(rome, /C\.darkStone/);
  assert.match(athens, /addAthenianStreetDetail/);
  assert.match(athens, /C\.plaster2/);
  assert.match(athens, /C\.roof2/);
  assert.match(materials, /limestone2/);
  assert.match(materials, /plaster3/);
  assert.match(materials, /roof2/);
});

test('spectacle and hero buildings no longer rely only on generic massing', () => {
  for (const source of [rome, athens]) {
    assert.match(source, /Stepped semicircular cavea/);
  }
  assert.match(rome, /maxentiusHero/);
  assert.match(athens, /parthenonHero/);
  assert.match(athens, /propylaeaHero/);
});
""")

print('Ancient World visual parity patch applied successfully')
