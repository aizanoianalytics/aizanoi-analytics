// Shared touch detection and terrain-support sampling for modular Ancient World cities.
// Keep these decisions renderer-neutral so Rome and Athens cannot drift apart.

export function detectTouchExperience({
  coarse = false,
  anyCoarse = false,
  touchPoints = 0,
  hasTouchEvent = false,
  viewportWidth = Number.POSITIVE_INFINITY,
} = {}) {
  return Boolean(coarse || anyCoarse || touchPoints > 0 || viewportWidth <= 760);
}

export function detectCurrentTouchExperience(win = window, nav = navigator) {
  return detectTouchExperience({
    coarse: win.matchMedia?.('(pointer: coarse)').matches,
    anyCoarse: win.matchMedia?.('(any-pointer: coarse)').matches,
    touchPoints: nav.maxTouchPoints || 0,
    hasTouchEvent: 'ontouchstart' in win,
    viewportWidth: win.innerWidth,
  });
}

function rotatePoint(x, z, cx, cz, angle = 0) {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [cx + dx * c - dz * s, cz + dx * s + dz * c];
}

export function footprintSupport(building, heightAt, inset = 0.46) {
  if (!building || typeof heightAt !== 'function') throw new TypeError('footprintSupport requires a building and height function.');
  const halfW = Math.max(0, (building.w || 0) * 0.5 * inset);
  const halfD = Math.max(0, (building.d || 0) * 0.5 * inset);
  const local = [[0, 0], [-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD], [-halfW, 0], [halfW, 0], [0, -halfD], [0, halfD]];
  const samples = local.map(([dx, dz]) => {
    const [x, z] = rotatePoint(building.x + dx, building.z + dz, building.x, building.z, building.rot || 0);
    return { x, z, y: heightAt(x, z) };
  });
  const heights = samples.map((sample) => sample.y);
  const baseY = Math.max(...heights);
  const minY = Math.min(...heights);
  return { baseY, minY, foundationDepth: Math.max(0, baseY - minY), samples };
}
