// js/data/optional-assets.js
// Deferred enhancement assets (touch sprites, WAV cues). Pure data so both
// BootScene and static tests can consume it without a Phaser runtime.

export const OPTIONAL_TOUCH_FILES = [
  ['touch-joystick-base', 'ui/touch-joystick-base.png'],
  ['touch-joystick-thumb', 'ui/touch-joystick-thumb.png'],
  ['touch-btn-attack', 'ui/touch-btn-attack.png'],
  ['touch-btn-skill1', 'ui/touch-btn-skill1.png'],
  ['touch-btn-skill2', 'ui/touch-btn-skill2.png'],
  ['touch-btn-utility', 'ui/touch-btn-utility.png'],
  ['touch-btn-interact', 'ui/touch-btn-interact.png'],
  ['touch-btn-menu', 'ui/touch-btn-menu.png'],
];

export const OPTIONAL_AUDIO_FILES = [
  ['ambient-cave', 'audio/ambient_cave_loop.wav'],
  ['sfx-shadow-dash', 'audio/shadow_dash.wav'],
  ['sfx-boss-warning', 'audio/boss_slam_warning.wav'],
  ['sfx-ancient-chime', 'audio/ancient_chime.wav'],
  ['sfx-gold-spark', 'audio/gold_spark.wav'],
];
