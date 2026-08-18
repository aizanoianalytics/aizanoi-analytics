from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)

old_import = "import { landmarkCandidateScore, landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkViewDirections, traversalApproachClearance } from '../../../ancient-world/engine/landmark-framing.js';"
new_import = "import { landmarkCandidateScore, landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkSightClearance, landmarkViewDirections, traversalApproachClearance } from '../../../ancient-world/engine/landmark-framing.js';"
old_teleport = """function teleport(id) {
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
"""
new_teleport = """function teleport(id) {
  const building = BUILDINGS.find((item) => item.id === id);
  if (!building) return false;
  const desiredDistance = landmarkFramingDistance(building);
  const footprint = Math.max(building.w || 0, building.d || 0);
  const searchRadius = Math.max(34, Math.min(58, desiredDistance * 0.26));
  const lookY = landmarkLookHeight(building, terrainHeightAt(building.x, building.z));
  const candidates = landmarkViewDirections().map(([dx, dz]) => {
    const wantedX = building.x + dx * desiredDistance;
    const wantedZ = building.z + dz * desiredDistance;
    const candidate = traversal.resolveSpawn(wantedX, wantedZ, searchRadius);
    const distance = Math.hypot(building.x - candidate.x, building.z - candidate.z);
    const clearance = traversal.collide(candidate.x, candidate.z) ? -1 : teleportForwardClearance(candidate, building);
    const support = traversal.absoluteSupportAt(candidate.x, candidate.z);
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
  });
  candidates.sort((a, b) => b.score - a.score);
  let chosen = candidates.find((candidate) => candidate.clearance >= 3 && candidate.visibility >= 4) || candidates[0];
  if (!chosen || chosen.score < -900) {
    chosen = traversal.resolveSpawn(building.x, building.z - desiredDistance, Math.max(38, searchRadius));
  }
  teleportToPoint(chosen.x, chosen.z, { lookX: building.x, lookZ: building.z, lookY, label: building.name });
  $('#jump').value = '';
  return true;
}
"""

for slug in ['rome-410-476', 'athens-450-430']:
    path = ROOT / f'frontend/ancient-cities/{slug}/js/app.js'
    text = path.read_text()
    text = replace_once(text, old_import, new_import, f'{slug} sightline import')
    text = replace_once(text, old_teleport, new_teleport, f'{slug} sightline teleport')
    path.write_text(text)

path = ROOT / 'tests/landmark-framing.test.mjs'
test = path.read_text()
test = replace_once(
    test,
    "import { landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkViewDirections, traversalApproachClearance } from '../frontend/ancient-world/engine/landmark-framing.js';",
    "import { landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkSightClearance, landmarkViewDirections, traversalApproachClearance } from '../frontend/ancient-world/engine/landmark-framing.js';",
    'sightline test import',
)
addition = """
test('landmark sight clearance rejects terrain or solids crossing the view ray', () => {
  const clear = landmarkSightClearance({
    candidate:{x:0,z:0}, target:{x:0,z:-100}, eyeY:3, targetY:14,
    collide:()=>false, heightAt:()=>0,
  });
  assert.equal(clear, 7);
  const blocked = landmarkSightClearance({
    candidate:{x:0,z:0}, target:{x:0,z:-100}, eyeY:3, targetY:14,
    collide:(_x,z)=>z < -25, heightAt:()=>0,
  });
  assert.ok(blocked < clear);
});
"""
if 'landmark sight clearance rejects terrain or solids crossing the view ray' not in test:
    test += addition
path.write_text(test)
print('Landmark sightline patch applied')
