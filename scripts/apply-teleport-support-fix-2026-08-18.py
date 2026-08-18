from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)

for slug in ['rome-410-476', 'athens-450-430']:
    path = ROOT / f'frontend/ancient-cities/{slug}/js/app.js'
    text = path.read_text()
    text = replace_once(
        text,
        "import { landmarkCandidateScore, landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkViewDirections } from '../../../ancient-world/engine/landmark-framing.js';",
        "import { landmarkCandidateScore, landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkViewDirections, traversalApproachClearance } from '../../../ancient-world/engine/landmark-framing.js';",
        f'{slug} framing import',
    )
    old = """function teleportForwardClearance(candidate, building) {
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
"""
    new = """function teleportForwardClearance(candidate, building) {
  return traversalApproachClearance({
    candidate,
    target: building,
    collide: traversal.collide,
    absoluteSupportAt: traversal.absoluteSupportAt,
    resolveSupport: traversal.resolveSupport,
  });
}
"""
    text = replace_once(text, old, new, f'{slug} traversal-aware clearance')
    path.write_text(text)

test_path = ROOT / 'tests/landmark-framing.test.mjs'
test = test_path.read_text()
test = replace_once(
    test,
    "import { landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkViewDirections } from '../frontend/ancient-world/engine/landmark-framing.js';",
    "import { landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkViewDirections, traversalApproachClearance } from '../frontend/ancient-world/engine/landmark-framing.js';",
    'landmark test import',
)
addition = """
test('landmark approach clearance rejects traversal-breaking support changes', () => {
  const flat = traversalApproachClearance({
    candidate: { x:0, z:0 }, target: { x:0, z:-20 },
    collide: () => false,
    absoluteSupportAt: () => ({ y:0 }),
    resolveSupport: (_x, _z, currentY) => ({ y:currentY, blockedRise:false, blockedDrop:false }),
  });
  assert.equal(flat, 7);

  let calls = 0;
  const broken = traversalApproachClearance({
    candidate: { x:0, z:0 }, target: { x:0, z:-20 },
    collide: () => false,
    absoluteSupportAt: () => ({ y:0 }),
    resolveSupport: () => {
      calls += 1;
      return { y:0, blockedRise:false, blockedDrop:calls >= 2 };
    },
  });
  assert.equal(broken, 1);
});
"""
if 'landmark approach clearance rejects traversal-breaking support changes' not in test:
    test += addition
test_path.write_text(test)
print('Traversal-aware teleport support patch applied')
