// js/constants.js
// Aizanoi Dungeon — Core Balance Constants & Configurations

export const GAME_CONFIG = {
  width: 960,
  height: 640,
  tileSize: 32,
  parent: 'game-container',
};

export const AIZO_BASE_STATS = {
  hp: 120,               // Mermer idol dayanıklılığı
  hpRegen: 1.5,          // HP / saniye
  hpRegenBase: 6.0,      // Zeus Sunağı alanında 4x can yenileme
  attackDamage: 12,      // Mermer kıymığı temel vuruş gücü
  attackSpeed: 1.0,      // Saniyede vuruş
  attackRange: 48,       // Piksel (1.5 tile)
  moveSpeed: 165,        // Süzülme hızı (piksel/sn)
  armor: 8,              // Doğal mermer zırhı
  critChance: 0.06,      // %6 kritik şansı
  critMultiplier: 1.6,   // 1.6x kritik hasar
  lifesteal: 0,          // Can çalma yüzdesi
};

export const LEVEL_UP_BONUS = {
  hp: 12,
  attackDamage: 2,
  armor: 1,
};

export const xpForLevel = (level) => 50 + (level * 35);

export const RESPAWN_CONFIG = {
  baseDelay: 3.0,
  perLevelDelay: 0.8,
  hpPercent: 1.0,
  goldLoss: 0,
  xpLoss: 0,
};

export const COLOR_PALETTE = {
  aizoMarble: '#F4F3EE',
  aizoEyes: '#1A1A1A',
  zeusCrack: '#A569BD',
  zeusCyan: '#00D2FF',
  antiqueBrass: '#C5A059',
  goldHighlight: '#D4AC0D',
  oliveGreen: '#27AE60',
  templeStone: '#4A3B32',
  slateDark: '#1E293B',
  enemyRed: '#922B21',
};
