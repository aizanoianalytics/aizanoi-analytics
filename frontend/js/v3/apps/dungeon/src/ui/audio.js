const CUES = Object.freeze({
  swing: { wave: 'triangle', from: 210, to: 95, duration: 0.09, gain: 0.08 },
  hit: { wave: 'square', from: 95, to: 58, duration: 0.07, gain: 0.1 },
  crit: { wave: 'sawtooth', from: 520, to: 180, duration: 0.16, gain: 0.11 },
  dash: { wave: 'sine', from: 130, to: 420, duration: 0.12, gain: 0.07 },
  bow: { wave: 'triangle', from: 640, to: 300, duration: 0.1, gain: 0.07 },
  'bow-hit': { wave: 'square', from: 300, to: 140, duration: 0.07, gain: 0.08 },
  hurt: { wave: 'sawtooth', from: 150, to: 52, duration: 0.2, gain: 0.1 },
  loot: { wave: 'sine', from: 440, to: 880, duration: 0.18, gain: 0.08 },
  portal: { wave: 'sine', from: 180, to: 610, duration: 0.5, gain: 0.06 },
  boss: { wave: 'square', from: 72, to: 42, duration: 0.65, gain: 0.09 },
  parry: { wave: 'sawtooth', from: 880, to: 220, duration: 0.22, gain: 0.1 },
  special: { wave: 'sawtooth', from: 140, to: 620, duration: 0.4, gain: 0.1 },
  rhythm: { wave: 'sine', from: 660, to: 990, duration: 0.12, gain: 0.06 },
  'focus-shot': { wave: 'triangle', from: 880, to: 240, duration: 0.2, gain: 0.08 },
});

/**
 * Small dependency-free WebAudio synthesizer. The context is created only by
 * resume(), so callers can invoke it directly from a pointer/key gesture.
 */
export function createAudioManager(options = {}) {
  const Context = options.AudioContext === undefined
    ? (globalThis.AudioContext || globalThis.webkitAudioContext)
    : options.AudioContext;
  // Requested levels live outside the AudioContext so a volume set before the
  // first gesture-driven resume() still applies once the graph exists.
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const levels = { master: clamp01(Number(options.volume ?? 0.7)), sfx: 1 };
  let context = null;
  let master = null;
  let sfxBus = null;

  let enabled = true;
  let destroyed = false;

  function initialise() {
    if (!Context || destroyed) return false;
    if (context) return true;
    try {
      context = new Context();
      master = context.createGain();
      sfxBus = context.createGain();

      master.gain.value = levels.master;
      sfxBus.gain.value = levels.sfx;

      sfxBus.connect(master);

      master.connect(context.destination);
      return true;
    } catch (_) {
      context = null;
      master = null;
      sfxBus = null;

      return false;
    }
  }

  async function resume() {
    if (!initialise()) return false;
    try {
      if (context.state === 'suspended' && context.resume) await context.resume();
      return context.state !== 'suspended' && !destroyed;
    } catch (_) {
      return false;
    }
  }

  function synth(cue, intensity, variant = 0) {
    if (!context || !sfxBus || context.state === 'suspended' || destroyed || !enabled) return false;
    try {
      const now = context.currentTime;
      const amount = Math.max(0.2, Math.min(2, Number(intensity) || 1));
      // SFX variation: 4 pitch variants per cue so repeats do not fatigue.
      const detune = 1 + ((Number(variant) || 0) % 4) * 0.06;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = cue.wave;
      oscillator.frequency.setValueAtTime(cue.from * amount * detune, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, cue.to * detune), now + cue.duration);
      envelope.gain.setValueAtTime(Math.max(0.0001, cue.gain * amount), now);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + cue.duration);
      oscillator.connect(envelope);
      envelope.connect(sfxBus);
      oscillator.start(now);
      oscillator.stop(now + cue.duration + 0.01);
      return true;
    } catch (_) {
      return false;
    }
  }

  function play(name, options = {}) {
    const cue = CUES[name];
    if (!cue) return false;
    // A caller-supplied variant selects a pitch; otherwise rotate cheaply.
    const variant = options.variant ?? (playCounter = (playCounter + 1) % 4);
    return synth(cue, options.intensity, variant);
  }
  let playCounter = 0;

  function setEnabled(value) { enabled = Boolean(value); return enabled; }

  // This synth only produces effects; there is no music track or music slider.
  function setVolumes({ master: masterVolume, sfx } = {}) {
    let changed = false;
    if (finite(masterVolume)) { levels.master = clamp01(masterVolume); changed = true; }

    if (finite(sfx)) { levels.sfx = clamp01(sfx); changed = true; }
    if (!changed) return false;
    try {
      if (master) master.gain.value = levels.master;

      if (sfxBus) sfxBus.gain.value = levels.sfx;
    } catch (_) { return false; }
    return true;
  }

  const finite = (value) => typeof value === 'number' && Number.isFinite(value);

  async function destroy() {
    if (destroyed) return;
    destroyed = true;
    try { sfxBus?.disconnect(); } catch (_) {}
    try { master?.disconnect(); } catch (_) {}
    try { await context?.close?.(); } catch (_) {}
    master = null;
    sfxBus = null;

    context = null;
  }

  return {
    get available() { return Boolean(Context); },
    get active() { return Boolean(context && context.state !== 'suspended' && !destroyed); },
    cues: Object.keys(CUES),
    get volumes() { return { ...levels }; },
    resume,
    play,
    setEnabled,
    setVolumes,
    destroy,
  };
}
