const PROFILES = Object.freeze({
  swing: { shake: 0.08, stop: 0, particles: 0, color: 'bronze' },
  hit: { shake: 0.22, stop: 30, particles: 7, color: 'ember' },
  crit: { shake: 0.48, stop: 60, particles: 16, color: 'gold' },
  dash: { shake: 0.12, stop: 0, particles: 8, color: 'mist' },
  bow: { shake: 0.1, stop: 0, particles: 5, color: 'bronze' },
  // The arrow landing. It is quieter than a melee hit but it still needs its
  // own read, otherwise a bow shot and a sword swing look identical.
  'bow-hit': { shake: 0.16, stop: 30, particles: 6, color: 'bronze' },
  hurt: { shake: 0.38, stop: 60, particles: 10, color: 'blood' },
  loot: { shake: 0, stop: 0, particles: 9, color: 'gold' },
  portal: { shake: 0.18, stop: 20, particles: 18, color: 'arcane' },
  boss: { shake: 0.62, stop: 100, particles: 24, color: 'blood' },
  // Hit-stop tiers: light 30 (hit/bow-hit), heavy 60 (crit/hurt), boss 100,
  // parry 120. Parry and phantom-step also trigger a short slow-mo.
  parry: { shake: 0.3, stop: 120, slowMo: 350, particles: 14, color: 'gold' },
  special: { shake: 0.55, stop: 60, particles: 22, color: 'arcane' },
});

function prefersReducedMotion() {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
}

/** Map game events to plain effect records; renderers remain fully decoupled. */
export function createFeedbackBus(options = {}) {
  const listeners = new Map();
  const random = typeof options.random === 'function' ? options.random : Math.random;
  let reducedMotion = options.reducedMotion ?? prefersReducedMotion();
  let sequence = 0;

  function on(type, listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    const group = listeners.get(type) || new Set();
    group.add(listener);
    listeners.set(type, group);
    return () => group.delete(listener);
  }

  function dispatch(type, record) {
    for (const listener of listeners.get(type) || []) {
      try { listener(record); } catch (_) {}
    }
  }

  function effect(type, details) {
    return Object.freeze({ id: ++sequence, type, ...details });
  }

  function emit(name, payload = {}) {
    const profile = PROFILES[name];
    if (!profile) return [];
    const position = payload.position || { x: 0, y: 0, z: 0 };
    const intensity = Math.max(0, Number(payload.intensity ?? 1));
    const effects = [];

    if (profile.shake > 0 && !reducedMotion) {
      const angle = random() * Math.PI * 2;
      effects.push(effect('screen-shake', {
        impulse: {
          x: Math.cos(angle) * profile.shake * intensity,
          y: Math.sin(angle) * profile.shake * intensity,
        },
        magnitude: profile.shake * intensity,
        durationMs: Math.round(90 + profile.shake * 150),
      }));
    }
    if (profile.stop > 0 && !reducedMotion) {
      effects.push(effect('hit-stop', { durationMs: Math.round(profile.stop * Math.min(intensity || 1, 1.5)) }));
    }
    if (profile.slowMo > 0 && !reducedMotion) {
      effects.push(effect('slow-mo', { durationMs: profile.slowMo }));
    }
    if (payload.damage !== undefined) {
      effects.push(effect('floating-damage', {
        value: Math.max(0, Number(payload.damage) || 0),
        critical: name === 'crit',
        position: { ...position },
      }));
    }
    if (profile.particles > 0) {
      effects.push(effect('particle-burst', {
        count: reducedMotion ? Math.min(3, profile.particles) : Math.round(profile.particles * intensity),
        color: profile.color,
        position: { ...position },
        spread: reducedMotion ? 0.1 : 0.55,
        lifetimeMs: reducedMotion ? 120 : 420,
      }));
    }

    options.audio?.play?.(name, { intensity });
    if (name === 'loot' && payload.label) options.hud?.addLoot?.(payload.label);
    if (name === 'boss' && payload.label) options.hud?.announce?.(payload.label);
    dispatch(name, Object.freeze({ name, payload, effects }));
    effects.forEach((record) => dispatch('effect', record));
    return effects;
  }

  function setReducedMotion(value) { reducedMotion = Boolean(value); }
  function clear() { listeners.clear(); }

  return {
    on,
    emit,
    clear,
    setReducedMotion,
    get reducedMotion() { return reducedMotion; },
    events: Object.keys(PROFILES),
  };
}
