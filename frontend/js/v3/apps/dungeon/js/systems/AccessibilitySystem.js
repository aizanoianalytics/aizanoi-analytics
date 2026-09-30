// Section 22: "Accessibility: reduced screen shake; reduced flash option;
// volume control; readable contrast; scalable/readable text; non-audio
// telegraphs for critical cues; keyboard accessibility for menus."
//
// The Dungeon shook the camera through fourteen separate direct calls to
// Phaser's shake(), in three files, none of which consulted a setting. There
// was one preference, `effects: 'full' | 'reduced'`, and nothing read it. A
// player who gets motion sick from screen shake has no way to turn it off, and
// wiring 14 call sites individually is exactly the kind of change that misses
// one. So the shake goes through a single helper, and the setting is read there.
import { loadSettings, saveSettings } from './SettingsSystem.js';

/** Respect both the saved preference and the OS-level motion preference. */
export function reducedMotionActive() {
  const s = loadSettings();
  if (s.reducedShake) return true;
  // Someone who has asked their operating system to reduce motion has already
  // answered this question; a game that overrides that is not respecting it.
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/**
 * The only screen-shake entry point.
 *
 * This does not call Phaser's cam.shake(), and that is not a style choice. In
 * Phaser 3.80 `Camera.shake()` forwards to `this.shakeEffect`, and `Shake` was
 * removed from the shipped FX set -- there is no Phaser.FX.Shake and there is no
 * addPrePipeline to install one. So the fourteen shake() calls in this game were
 * never shaking the screen: the function existed, it was callable, and it moved
 * nothing. The audit found this by asking the camera to shake and reading back a
 * frame that never changed.
 *
 * The shake is applied here instead, as a decaying offset on the camera's
 * scroll. It is real motion on screen, which is what makes the "reduced shake"
 * preference mean something rather than being a switch for an invisible effect.
 *
 * Off means off, not "a little": a shake at 0.004 intensity is still motion, and
 * for someone who set the preference it is motion they did not ask for.
 */
export function shakeCamera(scene, duration, intensity) {
  const cam = scene?.cameras?.main;
  if (!cam) return;
  if (reducedMotionActive()) return;

  // `intensity` is a fraction of the viewport in Phaser's API, so the same
  // numbers the game already passes produce the same amount of travel here.
  const amp = Math.max(0, Number(intensity) || 0) * (cam.width || 960);
  const ms = Math.max(1, Number(duration) || 0);
  if (amp < 0.2) return;

  // A shake already in flight is replaced, not stacked: a boss slam during a
  // charge should not add up to a third of the screen of motion.
  if (cam.__aizanoiShake) cam.__aizanoiShake.stop();
  if (scene.tweens?.killTweensOf) scene.tweens.killTweensOf(cam.__aizanoiShakeTarget);


  // The scene drives the whole thing from its own update(), on Phaser's clock:
  // requestAnimationFrame here would run on the browser's clock, so the shake
  // would keep going while the game is paused and would drift out of step with
  // the frame it is trying to move.
  const tween = {
    elapsed: 0,
    duration: ms,
    amp,
    start: null,
    applied: { x: 0, y: 0 },
    stop() { this.stopped = true; }
  };
  cam.__aizanoiShake = tween;
  cam.__aizanoiShakeOffset = { x: 0, y: 0 };
  tween.start = { x: cam.scrollX, y: cam.scrollY };
}

/**
 * Advance every camera shake by one frame and write the offset out. Called from
 * the scene's update, after the camera has followed the player, so the shake is
 * a displacement on top of the real scroll rather than a replacement for it.
 */
export function updateCameraShake(scene, delta) {
  const cam = scene?.cameras?.main;
  const t = cam?.__aizanoiShake;
  if (!t || t.stopped) return;
  t.elapsed += delta;
  if (t.elapsed >= t.duration) {
    cam.__aizanoiShake = null;
    cam.__aizanoiShakeOffset = null;
    cam.setScroll(t.start.x, t.start.y);
    return;
  }
  const decay = 1 - t.elapsed / t.duration;
  // Two out-of-phase waves read as a knock rather than a wobble.
  const e = t.elapsed;
  const ox = Math.sin(e / 42) * t.amp * decay;
  const oy = Math.cos(e / 37) * t.amp * decay * 0.7;
  cam.__aizanoiShakeOffset = { x: ox, y: oy };
  // Apply it to the real scroll, on top of where the follow left the camera.
  // Additive, so it composes with the follow rather than replacing it: an
  // absolute setScroll would fight the follow and drag the camera off the player.
  const followX = cam.scrollX - t.applied.x;
  const followY = cam.scrollY - t.applied.y;
  t.applied = { x: ox, y: oy };
  cam.setScroll(followX + ox, followY + oy);
}

/**
 * The offset a shake added this frame. The scene subtracts it from the camera
 * scroll after following the player, so the shake composes with the follow
 * instead of fighting it.
 */
export function shakeOffset(scene) {
  return scene?.cameras?.main?.__aizanoiShakeOffset || { x: 0, y: 0 };
}

/** Clear a shake in progress, for a chapter change or a pause. */
export function stopCameraShake(scene) {
  const cam = scene?.cameras?.main;
  if (cam?.__aizanoiShake) cam.__aizanoiShake.stop();
  if (cam) cam.__aizanoiShakeOffset = null;
}

/** True when critical cues must carry a non-audio channel as well. */
export function nonAudioTelegraphsActive() {
  return Boolean(loadSettings().nonAudioTelegraphs);
}

/** Readable-contrast mode: lifts the text colour the HUD draws with. */
export function contrastBoost() {
  return Boolean(loadSettings().highContrast);
}

/**
 * UI scale, clamped. Phaser renders text at whatever size it is handed, so this
 * is a multiplier every HUD element has to pass through rather than a CSS change
 * that would not reach a canvas.
 */
export function uiScale() {
  const raw = Number(loadSettings().uiScale);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(2, Math.max(0.85, raw));
}

/** The set of accessibility preferences, for the options screen. */
export function loadAccessibilitySettings() {
  const s = loadSettings();
  return {
    reducedShake: Boolean(s.reducedShake),
    nonAudioTelegraphs: Boolean(s.nonAudioTelegraphs),
    highContrast: Boolean(s.highContrast),
    uiScale: uiScale(),
    masterVolume: typeof s.masterVolume === 'number' ? s.masterVolume : 1
  };
}

export function saveAccessibilitySettings(patch) {
  return saveSettings({
    reducedShake: Boolean(patch.reducedShake),
    nonAudioTelegraphs: Boolean(patch.nonAudioTelegraphs),
    highContrast: Boolean(patch.highContrast),
    uiScale: Math.min(2, Math.max(0.85, Number(patch.uiScale) || 1)),
    masterVolume: Math.min(1, Math.max(0, Number(patch.masterVolume ?? 1)))
  });
}
