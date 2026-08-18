from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / 'frontend/ancient-cities/rome-410-476/js/app.js',
    ROOT / 'frontend/ancient-cities/athens-450-430/js/app.js',
]

OLD = """function teleport(id) {
  const building = BUILDINGS.find((item) => item.id === id);
  if (!building) return false;
  const offsets = [
    [0, -building.d * 0.72 - 8],
    [building.w * 0.72 + 8, 0],
    [0, building.d * 0.72 + 8],
    [-building.w * 0.72 - 8, 0],
  ];
  let chosen = null;
  for (const [ox, oz] of offsets) {
    const candidate = traversal.resolveSpawn(building.x + ox, building.z + oz, 22);
    if (!traversal.collide(candidate.x, candidate.z)) {
      chosen = candidate;
      break;
    }
  }
  chosen ||= traversal.resolveSpawn(building.x, building.z - building.d * 0.72 - 8);
  teleportToPoint(chosen.x, chosen.z, { lookX: building.x, lookZ: building.z, label: building.name });
  $('#jump').value = '';
  return true;
}
"""

NEW = """function teleportForwardClearance(candidate, building) {
  const dx = building.x - candidate.x;
  const dz = building.z - candidate.z;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  let clear = 0;
  for (const distance of [1.25, 2.5, 4.0, 5.5]) {
    const x = candidate.x + ux * distance;
    const z = candidate.z + uz * distance;
    if (!traversal.collide(x, z)) clear += 1;
  }
  return clear;
}

function teleport(id) {
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

for path in FILES:
    text = path.read_text()
    count = text.count(OLD)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one teleport block, found {count}')
    path.write_text(text.replace(OLD, NEW, 1))

TEST = ROOT / 'tests/ancient-world-visual-parity.test.mjs'
text = TEST.read_text()
needle = """test('Rome and Athens use the same horizontal mouse-look convention as Aizanoi', () => {\n"""
addition = """test('teleports prefer a spawn with forward walking clearance', () => {\n  for (const source of [rome, athens]) {\n    assert.match(source, /teleportForwardClearance/);\n    assert.match(source, /candidate\.clearance >= 3/);\n    assert.match(source, /building\.d \* 0\.84/);\n  }\n});\n\n"""
if addition not in text:
    if needle not in text:
        raise SystemExit('visual parity test insertion point missing')
    text = text.replace(needle, addition + needle, 1)
    TEST.write_text(text)

print('Teleport clearance patch applied')
