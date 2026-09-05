import { installBackToOS } from "../../ancient-world/engine/navigation.js";
const destroyHistoricWorld = () => {
  try { window.__AIZANOI_DEBUG__?.resetMovementState?.(); } catch (_) {}
  try { document.exitPointerLock?.(); } catch (_) {}
};
const historicDebug = window.__AIZANOI_DEBUG__;
// Use the opposite bank of the already collision-safe central bridge approach for
// the generic Penkalas riverfront jump. The west-bank approach sits beside dense
// inferred housing; mirroring the vector across the bridge centre exposes river,
// quay and bridge relationships while teleportTo still resolves final spawn safety.
if (historicDebug?.teleportViews?.bridge3) {
  const bridgeView = historicDebug.teleportViews.bridge3;
  historicDebug.teleportViews.penkalas = {
    pos: [
      bridgeView.look[0] * 2 - bridgeView.pos[0],
      bridgeView.look[1] * 2 - bridgeView.pos[1],
    ],
    look: [...bridgeView.look],
  };
}
window.__ANCIENT_WORLD_DESTROY__ = destroyHistoricWorld;
if (historicDebug) window.__ANCIENT_WORLD_DEBUG__ = historicDebug;
installBackToOS({ onBeforeExit: destroyHistoricWorld });

