const STORAGE_KEY = 'aizanoi_dungeon_settings_v1';

const DEFAULTS = {
  autoAim: true,
  magnet: true,
  showMinimap: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

export function saveSettings(next) {
  const merged = { ...loadSettings(), ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (_) {}
  return merged;
}

export function toggleDungeonFullscreen(element) {
  const node = element || document.documentElement;
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const req = node.requestFullscreen || node.webkitRequestFullscreen;
      return req ? req.call(node) : Promise.resolve();
    }
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    return exit ? exit.call(document) : Promise.resolve();
  } catch (_) {
    return Promise.resolve();
  }
}

export function isDungeonFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}
