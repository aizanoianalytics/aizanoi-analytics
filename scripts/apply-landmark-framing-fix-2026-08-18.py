from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
BRANCH_NOTE = 'final landmark framing fix'


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one exact match, found {count}')
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected one regex match, found {count}')
    return updated


def patch_city(path):
    text = path.read_text()
    text = replace_once(
        text,
        "import { installBackToOS } from '../../../ancient-world/engine/navigation.js';",
        "import { installBackToOS } from '../../../ancient-world/engine/navigation.js';\nimport { landmarkCandidateScore, landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkViewDirections } from '../../../ancient-world/engine/landmark-framing.js';",
        f'{path.name} framing import',
    )
    text = replace_once(
        text,
        'let mobileControls = null;',
        "let mobileControls = null;\nlet arrivalLabel = null;\nlet arrivalUntil = 0;",
        f'{path.name} arrival state',
    )
    text = replace_once(
        text,
        "function updateNearest() {\n  let best = null;",
        "function updateNearest() {\n  if (arrivalLabel && performance.now() < arrivalUntil) return;\n  if (arrivalLabel) arrivalLabel = null;\n  let best = null;",
        f'{path.name} arrival guard',
    )
    old_look = """function lookAtTarget(x, z) {
  player.yaw = Math.atan2(x - player.x, -(z - player.z));
  player.pitch = -0.03;
}

function teleportToPoint(x, z, { lookX = null, lookZ = null, label = 'destination' } = {}) {
  clearMovementState();
  const spawn = traversal.resolveSpawn(x, z);
  const support = traversal.absoluteSupportAt(spawn.x, spawn.z);
  player.x = spawn.x;
  player.z = spawn.z;
  player.floorY = support.y;
  player.surfaceTag = support.tag;
  player.y = support.y + EYE_HEIGHT;
  if (lookX != null && lookZ != null) lookAtTarget(lookX, lookZ);
  last = performance.now();
  drawRegionalMap();
  $('#place').textContent = label;
  canvas.focus({ preventScroll: true });
  return spawn;
}
"""
    new_look = """function lookAtTarget(x, z, targetY = null) {
  const dx = x - player.x;
  const dz = z - player.z;
  player.yaw = Math.atan2(dx, -dz);
  if (targetY == null) {
    player.pitch = -0.01;
    return;
  }
  player.pitch = landmarkLookPitch({
    eyeY: player.floorY + EYE_HEIGHT,
    targetY,
    horizontalDistance: Math.hypot(dx, dz),
  });
}

function teleportToPoint(x, z, { lookX = null, lookZ = null, lookY = null, label = 'destination' } = {}) {
  clearMovementState();
  const spawn = traversal.resolveSpawn(x, z);
  const support = traversal.absoluteSupportAt(spawn.x, spawn.z);
  player.x = spawn.x;
  player.z = spawn.z;
  player.floorY = support.y;
  player.surfaceTag = support.tag;
  player.y = support.y + EYE_HEIGHT;
  if (lookX != null && lookZ != null) lookAtTarget(lookX, lookZ, lookY);
  arrivalLabel = label;
  arrivalUntil = performance.now() + 2600;
  last = performance.now();
  drawRegionalMap();
  $('#place').textContent = label;
  $('#detail').textContent = `Landmark arrival · ${support.tag || 'ground'} · ${support.y.toFixed(1)} m`;
  canvas.focus({ preventScroll: true });
  return spawn;
}
"""
    text = replace_once(text, old_look, new_look, f'{path.name} smart look')

    teleport_pattern = r"function teleport\(id\) \{.*?\n\}\n\nfunction openAtlas\(\) \{"
    teleport_replacement = """function teleport(id) {
  const building = BUILDINGS.find((item) => item.id === id);
  if (!building) return false;
  const desiredDistance = landmarkFramingDistance(building);
  const footprint = Math.max(building.w || 0, building.d || 0);
  const searchRadius = Math.max(34, Math.min(58, desiredDistance * 0.26));
  const candidates = landmarkViewDirections().map(([dx, dz]) => {
    const wantedX = building.x + dx * desiredDistance;
    const wantedZ = building.z + dz * desiredDistance;
    const candidate = traversal.resolveSpawn(wantedX, wantedZ, searchRadius);
    const distance = Math.hypot(building.x - candidate.x, building.z - candidate.z);
    const clearance = traversal.collide(candidate.x, candidate.z) ? -1 : teleportForwardClearance(candidate, building);
    const framed = distance >= Math.max(26, footprint * 0.92);
    return {
      ...candidate,
      clearance,
      distance,
      score: framed ? landmarkCandidateScore({ clearance, distance, desiredDistance }) : -1000 - Math.abs(distance - desiredDistance),
    };
  });
  candidates.sort((a, b) => b.score - a.score);
  let chosen = candidates[0];
  if (!chosen || chosen.score < -900) {
    chosen = traversal.resolveSpawn(building.x, building.z - desiredDistance, Math.max(38, searchRadius));
  }
  const lookY = landmarkLookHeight(building, terrainHeightAt(building.x, building.z));
  teleportToPoint(chosen.x, chosen.z, { lookX: building.x, lookZ: building.z, lookY, label: building.name });
  $('#jump').value = '';
  return true;
}

function openAtlas() {"""
    text = regex_once(text, teleport_pattern, teleport_replacement, f'{path.name} framing teleport', flags=re.S)
    path.write_text(text)


rome_path = ROOT / 'frontend/ancient-cities/rome-410-476/js/app.js'
patch_city(rome_path)
rome = rome_path.read_text()
rome = regex_once(
    rome,
    r"\n  if \(!TOUCH\) \{\n    const mastCount = 24;.*?\n  \}\n\}",
    "\n}",
    'remove floating Colosseum mast cues',
    flags=re.S,
)
rome_path.write_text(rome)

athens_path = ROOT / 'frontend/ancient-cities/athens-450-430/js/app.js'
patch_city(athens_path)

historic_path = ROOT / 'frontend/historic-world/index.html'
historic = historic_path.read_text()
historic = replace_once(
    historic,
    ' temple:{pos:[-160,-70],look:[-160,20]},',
    ' temple:{pos:[-68,20],look:[-160,20]},',
    'Aizanoi Zeus eastern approach teleport',
)
historic_path.write_text(historic)

(ROOT / 'tests/landmark-framing.test.mjs').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkViewDirections } from '../frontend/ancient-world/engine/landmark-framing.js';

const root = resolve(import.meta.dirname, '..');

test('shared landmark framing scales back from large monuments', () => {
  assert.ok(landmarkFramingDistance({ w:125, d:102, h:48 }) > 180);
  assert.ok(landmarkFramingDistance({ w:46, d:22, h:16 }) > 70);
  assert.equal(landmarkViewDirections().length, 8);
});

test('shared landmark look targets the upper mass without extreme pitch', () => {
  const targetY = landmarkLookHeight({ h:48 }, 3);
  const pitch = landmarkLookPitch({ eyeY:4.7, targetY, horizontalDistance:190 });
  assert.ok(pitch > 0 && pitch < 0.2);
});

for (const city of ['rome-410-476','athens-450-430']) {
  test(`${city} uses shared cinematic landmark framing`, () => {
    const source = readFileSync(resolve(root, `frontend/ancient-cities/${city}/js/app.js`), 'utf8');
    assert.match(source, /landmarkFramingDistance/);
    assert.match(source, /landmarkViewDirections/);
    assert.match(source, /lookY/);
    assert.match(source, /arrivalUntil/);
  });
}

test('Aizanoi Temple jump uses the open eastern sanctuary approach', () => {
  const source = readFileSync(resolve(root, 'frontend/historic-world/index.html'), 'utf8');
  assert.match(source, /temple:\{pos:\[-68,20\],look:\[-160,20\]\}/);
});
""")
print(BRANCH_NOTE, 'applied')
