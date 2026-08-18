from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / 'frontend/ancient-cities/rome-410-476/js/app.js',
    ROOT / 'frontend/ancient-cities/athens-450-430/js/app.js',
]

OLD_LOOK = """function lookAtTarget(x, z) {
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

NEW_LOOK = """function lookAtTarget(x, z, targetY = null) {
  const dx = x - player.x;
  const dz = z - player.z;
  player.yaw = Math.atan2(dx, -dz);
  if (targetY == null) {
    player.pitch = -0.03;
    return;
  }
  const horizontal = Math.hypot(dx, dz) || 1;
  player.pitch = Math.max(-0.20, Math.min(0.24, Math.atan2(targetY - player.y, horizontal)));
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
  last = performance.now();
  drawRegionalMap();
  $('#place').textContent = label;
  canvas.focus({ preventScroll: true });
  return spawn;
}
"""

OLD_TELEPORT = """function teleport(id) {
  const building = BUILDINGS.find((item) => item.id === id);
  if (!building) return false;
  const offsets = [
    [0, -building.d * 0.84 - 12],
    [building.w * 0.84 + 12, 0],
    [0, building.d * 0.84 + 12],
    [-building.w * 0.84 - 12, 0],
  ];
  const candidates = offsets.map(([ox, oz]) => {
    const candidate = traversal.resolveSpawn(building.x + ox, building.z + oz, 28);
    return {
      ...candidate,
      clearance: traversal.collide(candidate.x, candidate.z) ? -1 : teleportForwardClearance(candidate, building),
    };
  });
  candidates.sort((a, b) => b.clearance - a.clearance);
  let chosen = candidates.find((candidate) => candidate.clearance >= 3) || candidates[0];
  if (!chosen || chosen.clearance < 0) {
    chosen = traversal.resolveSpawn(building.x, building.z - building.d * 0.84 - 12, 30);
  }
  teleportToPoint(chosen.x, chosen.z, { lookX: building.x, lookZ: building.z, label: building.name });
  $('#jump').value = '';
  return true;
}
"""

NEW_TELEPORT = """function landmarkViewRadius(building) {
  const footprint = Math.max(Number(building.w) || 0, Number(building.d) || 0);
  const height = Math.max(0, Number(building.h) || 0);
  // Use the largest footprint axis so long monuments are not framed from only
  // one narrow-side clearance. This doubles as a future-city camera contract.
  return Math.min(270, Math.max(36, footprint * 1.38 + height * 0.55 + 22));
}

function teleport(id) {
  const building = BUILDINGS.find((item) => item.id === id);
  if (!building) return false;
  const radius = landmarkViewRadius(building);
  const diagonal = radius * 0.72;
  const offsets = [
    [0, -radius], [radius, 0], [0, radius], [-radius, 0],
    [diagonal, -diagonal], [diagonal, diagonal], [-diagonal, diagonal], [-diagonal, -diagonal],
  ];
  const candidates = offsets.map(([ox, oz]) => {
    const candidate = traversal.resolveSpawn(building.x + ox, building.z + oz, Math.min(44, Math.max(24, radius * 0.18)));
    const distance = Math.hypot(candidate.x - building.x, candidate.z - building.z);
    const clearance = traversal.collide(candidate.x, candidate.z) ? -1 : teleportForwardClearance(candidate, building);
    const framing = Math.max(0, 1 - Math.abs(distance - radius) / Math.max(1, radius));
    return { ...candidate, clearance, framing, score: clearance * 3 + framing * 2 };
  });
  candidates.sort((a, b) => b.score - a.score);
  let chosen = candidates.find((candidate) => candidate.clearance >= 3) || candidates[0];
  if (!chosen || chosen.clearance < 0) {
    chosen = traversal.resolveSpawn(building.x, building.z - radius, Math.min(48, radius * 0.20));
  }
  const targetGround = typeof baseY === 'function' ? baseY(building) : terrainHeightAt(building.x, building.z);
  const lookY = targetGround + Math.max(1.8, (Number(building.h) || 0) * 0.44);
  teleportToPoint(chosen.x, chosen.z, { lookX: building.x, lookZ: building.z, lookY, label: building.name });
  $('#jump').value = '';
  return true;
}
"""

for path in FILES:
    text = path.read_text()
    if text.count(OLD_LOOK) != 1:
        raise SystemExit(f'{path}: expected one look/teleportToPoint block')
    if text.count(OLD_TELEPORT) != 1:
        raise SystemExit(f'{path}: expected one teleport block')
    text = text.replace(OLD_LOOK, NEW_LOOK, 1).replace(OLD_TELEPORT, NEW_TELEPORT, 1)
    path.write_text(text)

rome = FILES[0]
text = rome.read_text()
mast = re.compile(r"\n  if \(!TOUCH\) \{\n    const mastCount = 24;.*?\n  \}\n\}\n\nfunction amphitheatre", re.S)
replacement = "\n}\n\nfunction amphitheatre"
text, count = mast.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('Rome: Colosseum mast block not found')
rome.write_text(text)

# Extend regression coverage rather than depending on screenshot review alone.
test = ROOT / 'tests/final-polish.test.mjs'
s = test.read_text()
needle = "test('Rome and Athens have city-specific final hero/detail vocabulary',()=>{\n"
addition = """test('landmark teleports use cinematic footprint-aware framing',()=>{\n  for (const source of [rome,athens]) {\n    assert.match(source,/function landmarkViewRadius/);\n    assert.match(source,/footprint \* 1\\.38/);\n    assert.match(source,/lookY/);\n    assert.match(source,/Math\\.atan2\\(targetY - player\\.y, horizontal\\)/);\n    assert.match(source,/diagonal = radius \* 0\\.72/);\n  }\n});\n\n"""
if addition not in s:
    if needle not in s: raise SystemExit('test insertion point missing')
    s = s.replace(needle, addition + needle, 1)
    test.write_text(s)

print('Landmark framing fix applied')
