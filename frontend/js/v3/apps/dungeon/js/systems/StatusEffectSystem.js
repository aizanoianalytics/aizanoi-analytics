// js/systems/StatusEffectSystem.js
// Entity-owned status lifecycle, advanced by scene delta (no Phaser timers).
import { statusDef } from '../data/status-effects.js';

export class StatusEffectSystem {
  /** Apply (or refresh/stack) a status on `holder.statuses` (Map). */
  static apply(holder, effectId, opts = {}) {
    const def = statusDef(effectId);
    if (!def || !holder) return null;
    holder.statuses ||= new Map();
    const existing = holder.statuses.get(effectId);
    const durationMs = opts.durationMs ?? def.defaultDurationMs;
    if (existing) {
      if (def.stacking === 'reject') return existing;
      if (def.stacking === 'stack') {
        existing.stacks = (existing.stacks || 1) + 1;
        existing.remainingMs = Math.max(existing.remainingMs, durationMs);
        existing.elapsedSinceTick = 0;
        return existing;
      }
      existing.remainingMs = durationMs; // refresh
      existing.elapsedSinceTick = 0;
      return existing;
    }
    const inst = {
      id: effectId, remainingMs: durationMs, elapsedSinceTick: 0,
      stacks: 1, source: opts.source || null,
    };
    holder.statuses.set(effectId, inst);
    return inst;
  }

  static remove(holder, effectId) {
    return holder?.statuses?.delete(effectId) || false;
  }

  /** Remove effects carrying any of `tags` (e.g. shrine cleanse). */
  static cleanse(holder, tags = ['cleansable', 'curse']) {
    if (!holder?.statuses) return 0;
    let removed = 0;
    for (const [id] of Array.from(holder.statuses)) {
      const def = statusDef(id);
      if (def?.tags?.some((t) => tags.includes(t))) {
        holder.statuses.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Advance all statuses by dtMs. `handlers` hooks damage/heal without
   * importing entity code: { damage(holder, amount, effectId), heal(...) }.
   * Frame-rate independent: ticks use accumulated time.
   */
  static update(holder, dtMs, handlers = {}) {
    if (!holder?.statuses?.size) return [];
    const fired = [];
    for (const [id, inst] of Array.from(holder.statuses)) {
      const def = statusDef(id);
      if (!def) { holder.statuses.delete(id); continue; }
      inst.remainingMs -= dtMs;
      inst.elapsedSinceTick = (inst.elapsedSinceTick || 0) + dtMs;
      const every = def.tickEveryMs || 0;
      if (every > 0 && inst.remainingMs > 0) {
        while (inst.elapsedSinceTick >= every) {
          inst.elapsedSinceTick -= every;
          if (def.kind === 'dot' && handlers.damage) {
            handlers.damage(holder, (def.damagePerTick || 0) * (inst.stacks || 1), id);
            fired.push({ id, kind: 'tick' });
          } else if (def.kind === 'hot' && handlers.heal) {
            handlers.heal(holder, def.healPerTick || 0, id);
            fired.push({ id, kind: 'heal-tick' });
          }
        }
      }
      if (inst.remainingMs <= 0) holder.statuses.delete(id);
    }
    return fired;
  }

  static speedMultiplier(holder) {
    if (!holder?.statuses?.has('slow')) return 1;
    return statusDef('slow').speedMultiplier || 1;
  }

  static isStunned(holder) {
    return Boolean(holder?.statuses?.has('stun'));
  }

  static serialize(holder) {
    if (!holder?.statuses) return [];
    return Array.from(holder.statuses.values()).map((s) => ({ ...s }));
  }

  static deserialize(holder, arr) {
    holder.statuses = new Map();
    if (Array.isArray(arr)) {
      for (const s of arr) {
        if (s && statusDef(s.id)) holder.statuses.set(s.id, { ...s });
      }
    }
    return holder.statuses;
  }
}
