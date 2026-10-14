// js/systems/CombatLogSystem.js
// Bounded structured combat event stream (presentation-independent).
const MAX_ENTRIES = 120;

export class CombatLogSystem {
  constructor(limit = MAX_ENTRIES) {
    this.limit = limit;
    this.entries = [];
    this.seq = 0;
  }
  push(event) {
    const entry = { seq: this.seq++, t: Date.now(), ...event };
    this.entries.push(entry);
    while (this.entries.length > this.limit) this.entries.shift();
    return entry;
  }
  recent(n = 5) {
    return this.entries.slice(-n);
  }
  clear() {
    this.entries = [];
  }
  serialize() {
    return this.entries.slice();
  }
}

export function logAttack(log, { source, target, damage, isCritical, damageType, killed }) {
  if (!log) return null;
  return log.push({
    kind: 'attack', source, target,
    damage, isCritical: Boolean(isCritical),
    damageType: damageType || 'physical', killed: Boolean(killed),
  });
}
