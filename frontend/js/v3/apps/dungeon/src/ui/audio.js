const CUES = Object.freeze({
  swing: { wave: 'triangle', from: 210, to: 95, duration: 0.09, gain: 0.08 },
  hit: { wave: 'square', from: 95, to: 58, duration: 0.07, gain: 0.1 },
  crit: { wave: 'sawtooth', from: 520, to: 180, duration: 0.16, gain: 0.11 },
  dash: { wave: 'sine', from: 130, to: 420, duration: 0.12, gain: 0.07 },
  hurt: { wave: 'sawtooth', from: 150, to: 52, duration: 0.2, gain: 0.1 },
  loot: { wave: 'sine', from: 440, to: 880, duration: 0.18, gain: 0.08 },
  portal: { wave: 'sine', from: 180, to: 610, duration: 0.5, gain: 0.06 },
  boss: { wave: 'square', from: 72, to: 42, duration: 0.65, gain: 0.09 },
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

  function synth(cue, intensity) {
    if (!context || !master || context.state === 'suspended' || destroyed || !enabled) return false;
    try {
      const now = context.currentTime;
      const amount = Math.max(0.2, Math.min(2, Number(intensity) || 1));
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = cue.wave;
      oscillator.frequency.setValueAtTime(cue.from * amount, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, cue.to), now + cue.duration);
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
    return synth(cue, options.intensity);
  }

  function setEnabled(value) { enabled = Boolean(value); return enabled; }

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
    destroy,
  };
}
