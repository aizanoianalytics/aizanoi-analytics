/**
 * Shared Historical Worlds boot helpers.
 * City mains keep city-specific orchestration; this module owns the
 * repeated loading UI, WebGL2 gate and debug-hook installation.
 */

import { showFatalInitError } from './loading-safety.js';

export function bindLoading(options = {}) {
  const loadingEl = document.getElementById(options.screenId || 'loading-screen');
  const loadingProgress = document.getElementById(options.progressId || 'loading-progress');
  const loadingText = document.querySelector(options.titleSelector || '.loading-title');
  return {
    element: loadingEl,
    setProgress(pct, msg) {
      if (loadingProgress) loadingProgress.style.width = `${pct}%`;
      if (loadingText && msg != null) loadingText.textContent = msg;
    },
    dismiss() {
      loadingEl?.remove();
    },
  };
}

export function exposeWorldDebug(api) {
  window.__WORLD_DEBUG__ = api;
  return api;
}

export function markWorldTeleport(buildingId) {
  window.__WORLD_LAST_TELEPORT__ = buildingId;
}

export function lastWorldTeleport() {
  return window.__WORLD_LAST_TELEPORT__;
}

export function bootWhenWebGL2(worldName, init) {
  const net = window.__WORLDS_ENTRY_NET__;
  if (!net?.requireWebGL2(worldName)) {
    console.warn(`${worldName}: WebGL 2 unavailable; entry blocked by worlds-entry-net.`);
    return false;
  }
  Promise.resolve()
    .then(init)
    .catch((err) => {
      console.error(`${worldName} init failed:`, err);
      net.recordInitCatch?.(worldName, err);
      showFatalInitError(err, worldName);
    });
  return true;
}
