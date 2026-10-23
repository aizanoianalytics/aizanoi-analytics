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
  const masterVolume = Math.max(0, Math.min(1, Number(options.volume ?? 0.7)));
  let context = null;
  let master = null;
  let enabled = true;
  let destroyed = false;

  function initialise() {
    if (!Context || destroyed) return false;
    if (context) return true;
    try {
      context = new Context();
      master = context.createGain();
      master.gain.value = masterVolume;
      master.connect(context.destination);
      return true;
    } catch (_) {
      context = null;
      master = null;
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
    if (!context || !master || context.state === 'suspended' || destroyed || !enabled) return false;
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
      envelope.connect(master);
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

  function setVolumes({ master: masterVolume, music, sfx } = {}) {
    void music; void sfx;
    if (finite(masterVolume) && master) {
      try { master.gain.value = Math.max(0, Math.min(1, masterVolume)); return true; } catch (_) { return false; }
    }
    return false;
  }

  const finite = (value) => typeof value === 'number' && Number.isFinite(value);

  async function destroy() {
    if (destroyed) return;
    destroyed = true;
    try { master?.disconnect(); } catch (_) {}
    try { await context?.close?.(); } catch (_) {}
    master = null;
    context = null;
  }

  return {
    get available() { return Boolean(Context); },
    get active() { return Boolean(context && context.state !== 'suspended' && !destroyed); },
    cues: Object.keys(CUES),
    resume,
    play,
    setEnabled,
    setVolumes,
    destroy,
  };
}
