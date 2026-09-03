/** AizanoiOS system sounds — Web Audio with oscillator fallback (floppyy-inspired toneMap design). */

let contextPromise = null;
let soundFiles = null;

function audioContext() {
  if (!contextPromise) {
    contextPromise = new Promise((resolve, reject) => {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) { reject(new Error('Web Audio unavailable')); return; }
        resolve(new Ctx());
      } catch (error) { reject(error); }
    });
  }
  return contextPromise;
}

export function warmAudio() {
  return audioContext().then((ctx) => {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }).catch(() => null);
}

/* toneMap: [startFreq, endFreq, oscillatorType] — zero-asset synthesized sounds. */
const toneMap = {
  click: [650, 0, 'square'],
  open: [440, 660, 'triangle'],
  close: [330, 220, 'triangle'],
  error: [160, 110, 'sawtooth'],
  notification: [784, 988, 'sine'],
  startup: [523, 880, 'sine'],
  shutdown: [440, 220, 'sine'],
  camera: [900, 300, 'square'],
  trash: [300, 200, 'triangle'],
};

/* No shipped audio assets yet: fileMap is intentionally empty so every sound
 * goes through the oscillator fallback (zero 404s, zero downloads). Ship real
 * files later by adding entries here. */
const fileMap = {};

async function playFile(name) {
  const src = fileMap[name];
  if (!src) return false;
  try {
    if (!soundFiles) soundFiles = {};
    let buffer = soundFiles[name];
    if (buffer === undefined) {
      const response = await fetch(src);
      if (!response.ok) { soundFiles[name] = null; return false; }
      const data = await response.arrayBuffer();
      const ctx = await audioContext();
      buffer = await ctx.decodeAudioData(data);
      soundFiles[name] = buffer;
    }
    if (!buffer) return false;
    const ctx = await audioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    return true;
  } catch (_) {
    return false;
  }
}

async function playTone(name) {
  const tone = toneMap[name];
  if (!tone) return false;
  try {
    const ctx = await audioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const [start, end, type] = tone;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(start, ctx.currentTime);
    if (end && end !== start) osc.frequency.exponentialRampToValueAtTime(end, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    return true;
  } catch (_) {
    return false;
  }
}

/** Play a named system sound; prefers a real file when present, falls back to synthesis. */
export function playSound(name = 'click') {
  return playFile(name).then((played) => (played ? true : playTone(name))).catch(() => false);
}
