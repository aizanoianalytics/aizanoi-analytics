// js/data/status-effects.js
// Data-declared status effects. No per-effect timers; entity update advances them.

export const STATUS_EFFECTS = {
  poison: { id: 'poison', kind: 'dot', tickEveryMs: 1000, damagePerTick: 3, defaultDurationMs: 6000, tags: ['cleansable', 'curse'], stacking: 'refresh' },
  burn: { id: 'burn', kind: 'dot', tickEveryMs: 800, damagePerTick: 4, defaultDurationMs: 4000, tags: ['cleansable'], stacking: 'refresh' },
  bleed: { id: 'bleed', kind: 'dot', tickEveryMs: 1200, damagePerTick: 2, defaultDurationMs: 6000, tags: ['cleansable'], stacking: 'stack' },
  slow: { id: 'slow', kind: 'modifier', speedMultiplier: 0.55, defaultDurationMs: 3500, tags: ['cleansable'], stacking: 'refresh' },
  stun: { id: 'stun', kind: 'control', defaultDurationMs: 1200, tags: [], stacking: 'refresh' },
  regen: { id: 'regen', kind: 'hot', tickEveryMs: 1000, healPerTick: 4, defaultDurationMs: 5000, tags: ['beneficial'], stacking: 'refresh' },
  shield_aura: { id: 'shield_aura', kind: 'buff', defaultDurationMs: 8000, tags: ['beneficial'], stacking: 'reject' },
};

export function statusDef(id) {
  return STATUS_EFFECTS[id] || null;
}
