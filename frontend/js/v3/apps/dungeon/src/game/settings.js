// Dungeon settings: persisted player preferences, separate from the run save
// so a run reset never wipes unlocks or comfort options.
// Key: aizanoi.dungeon.settings.v1
export const SETTINGS_KEY = 'aizanoi.dungeon.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  assistMode: 'assist',
  autoFireReserve: 25,
  targetPriority: 'threat',
  masterVolume: 0.7,
  musicVolume: 0.7,
  sfxVolume: 0.7,
  shake: 100,
  reducedMotion: false,
  damageNumbers: true,
  highContrast: false,
  quality: 'auto',
  leftHanded: false,
  trainingDone: false,
});

const VALID_MODES = ['manual', 'assist', 'auto'];
const VALID_RESERVES = [0, 25, 50];
const VALID_PRIORITIES = ['nearest', 'threat', 'lowest'];
const VALID_QUALITY = ['low', 'medium', 'high', 'auto'];

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export function parseSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return settings;
  if (VALID_MODES.includes(raw.assistMode)) settings.assistMode = raw.assistMode;
  if (VALID_RESERVES.includes(raw.autoFireReserve)) settings.autoFireReserve = raw.autoFireReserve;
  if (VALID_PRIORITIES.includes(raw.targetPriority)) settings.targetPriority = raw.targetPriority;
  if (finite(raw.masterVolume)) settings.masterVolume = Math.max(0, Math.min(1, raw.masterVolume));
  if (finite(raw.musicVolume)) settings.musicVolume = Math.max(0, Math.min(1, raw.musicVolume));
  if (finite(raw.sfxVolume)) settings.sfxVolume = Math.max(0, Math.min(1, raw.sfxVolume));
  if (finite(raw.shake)) settings.shake = Math.max(0, Math.min(100, raw.shake));
  if (typeof raw.reducedMotion === 'boolean') settings.reducedMotion = raw.reducedMotion;
  if (typeof raw.damageNumbers === 'boolean') settings.damageNumbers = raw.damageNumbers;
  if (typeof raw.highContrast === 'boolean') settings.highContrast = raw.highContrast;
  if (VALID_QUALITY.includes(raw.quality)) settings.quality = raw.quality;
  if (typeof raw.leftHanded === 'boolean') settings.leftHanded = raw.leftHanded;
  if (typeof raw.trainingDone === 'boolean') settings.trainingDone = raw.trainingDone;
  return settings;
}

export function loadSettings(storage) {
  try {
    const raw = storage?.getItem?.(SETTINGS_KEY);
    if (raw == null) return { ...DEFAULT_SETTINGS };
    return parseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage, settings) {
  try {
    storage?.setItem?.(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }));
    return { saved: true };
  } catch {
    return { saved: false };
  }
}

// Daily seed: deterministic from the local date, no server. YYYY-MM-DD.
export function dailySeed(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `aizo-daily-${year}-${month}-${day}`;
}
