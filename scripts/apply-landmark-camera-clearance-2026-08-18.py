from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)

# Shared camera-volume clearance helper.
path = ROOT / 'frontend/ancient-world/engine/landmark-framing.js'
text = path.read_text()
anchor = """export function landmarkCandidateScore({ clearance = 0, visibility = 0, distance = 0, desiredDistance = 0 }) {
  return clearance * 20 + visibility * 48 - Math.abs(distance - desiredDistance) * 0.08;
}
"""
replacement = """export function landmarkCameraClearance({ candidate, obstacles = [], ignoreId = null, minHeight = 4 } = {}) {
  if (!candidate) return 0;
  let nearest = Infinity;
  for (const obstacle of obstacles) {
    if (!obstacle || obstacle.id === ignoreId || (Number(obstacle.h) || 0) < minHeight) continue;
    const width = Math.max(0, Number(obstacle.w) || 0);
    const depth = Math.max(0, Number(obstacle.d) || 0);
    if (!width || !depth) continue;
    const angle = -(Number(obstacle.rot) || 0);
    const dx = (Number(candidate.x) || 0) - (Number(obstacle.x) || 0);
    const dz = (Number(candidate.z) || 0) - (Number(obstacle.z) || 0);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const lx = dx * ca - dz * sa;
    const lz = dx * sa + dz * ca;
    const qx = Math.abs(lx) - width / 2;
    const qz = Math.abs(lz) - depth / 2;
    const outside = Math.hypot(Math.max(0, qx), Math.max(0, qz));
    nearest = Math.min(nearest, outside);
  }
  return Number.isFinite(nearest) ? nearest : 100;
}

export function landmarkCandidateScore({ clearance = 0, visibility = 0, cameraClearance = 0, distance = 0, desiredDistance = 0 }) {
  return clearance * 20 + visibility * 48 + Math.min(30, Math.max(0, cameraClearance)) * 7 - Math.abs(distance - desiredDistance) * 0.08;
}
"""
text = replace_once(text, anchor, replacement, 'shared camera clearance')
path.write_text(text)

old_import = "import { landmarkCandidateScore, landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkSightClearance, landmarkViewDirections, traversalApproachClearance } from '../../../ancient-world/engine/landmark-framing.js';"
new_import = "import { landmarkCameraClearance, landmarkCandidateScore, landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkSightClearance, landmarkViewDirections, traversalApproachClearance } from '../../../ancient-world/engine/landmark-framing.js';"
old_candidate = """    const support = traversal.absoluteSupportAt(candidate.x, candidate.z);
    const visibility = clearance < 0 ? -1 : landmarkSightClearance({
      candidate,
      target: building,
      eyeY: support.y + EYE_HEIGHT,
      targetY: lookY,
      collide: traversal.collide,
      heightAt: terrainHeightAt,
    });
    const framed = distance >= Math.max(26, footprint * 0.92);
    return {
      ...candidate,
      clearance,
      visibility,
      distance,
      score: framed ? landmarkCandidateScore({ clearance, visibility, distance, desiredDistance }) : -1000 - Math.abs(distance - desiredDistance),
    };
"""
new_candidate = """    const support = traversal.absoluteSupportAt(candidate.x, candidate.z);
    const visibility = clearance < 0 ? -1 : landmarkSightClearance({
      candidate,
      target: building,
      eyeY: support.y + EYE_HEIGHT,
      targetY: lookY,
      collide: traversal.collide,
      heightAt: terrainHeightAt,
    });
    const cameraClearance = landmarkCameraClearance({
      candidate,
      obstacles: [...BUILDINGS, ...URBAN_FABRIC],
      ignoreId: building.id,
      minHeight: 4,
    });
    const framed = distance >= Math.max(26, footprint * 0.92);
    return {
      ...candidate,
      clearance,
      visibility,
      cameraClearance,
      distance,
      score: framed ? landmarkCandidateScore({ clearance, visibility, cameraClearance, distance, desiredDistance }) : -1000 - Math.abs(distance - desiredDistance),
    };
"""
old_choose = "let chosen = candidates.find((candidate) => candidate.clearance >= 3 && candidate.visibility >= 4) || candidates[0];"
new_choose = "let chosen = candidates.find((candidate) => candidate.clearance >= 3 && candidate.visibility >= 4 && candidate.cameraClearance >= 12) || candidates[0];"

for slug in ['rome-410-476', 'athens-450-430']:
    app = ROOT / f'frontend/ancient-cities/{slug}/js/app.js'
    source = app.read_text()
    source = replace_once(source, old_import, new_import, f'{slug} camera-clearance import')
    source = replace_once(source, old_candidate, new_candidate, f'{slug} camera-clearance candidate')
    source = replace_once(source, old_choose, new_choose, f'{slug} camera-clearance chooser')
    app.write_text(source)

# Shared unit coverage.
test_path = ROOT / 'tests/landmark-framing.test.mjs'
test = test_path.read_text()
test = replace_once(
    test,
    "import { landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkSightClearance, landmarkViewDirections, traversalApproachClearance } from '../frontend/ancient-world/engine/landmark-framing.js';",
    "import { landmarkCameraClearance, landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkSightClearance, landmarkViewDirections, traversalApproachClearance } from '../frontend/ancient-world/engine/landmark-framing.js';",
    'camera-clearance test import',
)
addition = """
test('landmark camera clearance respects rotated high building footprints', () => {
  const obstacles = [{ id:'palace', x:0, z:0, w:100, d:60, h:30, rot:0 }];
  assert.equal(landmarkCameraClearance({ candidate:{x:55,z:0}, obstacles }), 5);
  assert.ok(landmarkCameraClearance({ candidate:{x:90,z:0}, obstacles }) >= 40);
  assert.equal(landmarkCameraClearance({ candidate:{x:0,z:0}, obstacles, ignoreId:'palace' }), 100);
});
"""
if 'landmark camera clearance respects rotated high building footprints' not in test:
    test += addition
test_path.write_text(test)
print('landmark camera-clearance patch applied')
