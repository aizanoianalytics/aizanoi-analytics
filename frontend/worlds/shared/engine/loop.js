/**
 * loop.js — Fixed-Timestep Game Loop, Pose Blending & Frame Metrics
 * Aizanoi Analytics unified worlds runtime
 *
 * A shared render-loop core for every world's main.js. Three problems solved:
 *
 * 1. Deterministic simulation. Feeding raw frame deltas into movement, gravity
 *    and collision makes physics differ between a 60 Hz desktop and a
 *    throttled 30 Hz phone, and one long frame lets a fast mover tunnel through
 *    thin geometry. The loop accumulates real time and advances the simulation
 *    in fixed SIM_DT slices, so every device runs identical steps. Rendering
 *    still happens on every animation frame.
 *
 * 2. Smooth presentation between steps. The simulation state lives in its own
 *    vector (NEVER in camera.position directly once this loop is used — the
 *    renderer would otherwise read a half-blended position back into the
 *    simulation and the player would drift at fractional speed). PoseBlender
 *    eases the camera from the state as it was at frame start to the state as
 *    the steps left it, using the fractional accumulator as the blend factor.
 *    The camera's look orientation is NOT blended: mouse/touch look is applied
 *    per display frame by controls.js and is already display-rate.
 *
 * 3. Honest performance numbers. FrameMetrics keeps a ring buffer of recent
 *    frame times and reports p50/p95/max — p95 is the number that reveals a
 *    device is hitching; an average hides it.
 *
 * Usage (in a world's main.js):
 *   const simPos = new THREE.Vector3(SPAWN.x, PLAYER_HEIGHT, SPAWN.z);
 *   const pose = new PoseBlender(simPos);
 *   const metrics = new FrameMetrics();
 *   const loop = new GameLoop({
 *     step: stepSimulation,                 // dt is always SIM_DT
 *     render: drawFrame,                    // (frameDt, alpha)
 *     beforeSteps: () => pose.capture(),    // snapshot pre-step state
 *     metrics,
 *   });
 *   renderer.setAnimationLoop((now) => loop.frame(now));
 *   // each drawFrame: camera.position.copy(pose.sample(alpha)) before rendering
 */

/* ── Constants ────────────────────────────────────────────── */

const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
const MAX_FRAME_DT = 0.25;      // ignore absurd pauses (tab switch, debugger)
const MAX_STEPS_PER_FRAME = 5;  // spiral-of-death guard: shed debt, stay responsive

/* ── Pose blending ────────────────────────────────────────── */

/**
 * Blends a simulation position vector into a display-safe camera position.
 * The blended output is written to a separate vector; the simulation state is
 * never fed back from the renderer.
 */
export class PoseBlender {
  /**
   * @param {THREE.Vector3} state - the live simulation position (mutated by the
   *        fixed steps); kept as the authoritative state vector.
   */
  constructor(state) {
    this.state = state;
    this._previous = state.clone();
    this._output = state.clone();
  }

  /** Snapshot the state as it enters this frame's step batch. */
  capture() {
    this._previous.copy(this.state);
  }

  /** Hard-sync after teleports/spawns/intro handoff — no glide across the jump. */
  snap() {
    this._previous.copy(this.state);
    this._output.copy(this.state);
    return this._output;
  }

  /**
   * @param {number} alpha - fraction of the next step already accrued [0,1]
   * @returns {THREE.Vector3} the blended display position (reused instance)
   */
  sample(alpha) {
    const t = Math.max(0, Math.min(1, alpha));
    this._output.lerpVectors(this._previous, this.state, t);
    return this._output;
  }
}

/* ── Frame metrics ────────────────────────────────────────── */

const METRICS_CAPACITY = 600; // ~10s at 60 fps

export class FrameMetrics {
  constructor(capacity = METRICS_CAPACITY) {
    this._times = new Float32Array(capacity);
    this._capacity = capacity;
    this._count = 0;
    this._index = 0;
  }

  record(frameMs) {
    this._times[this._index] = frameMs;
    this._index = (this._index + 1) % this._capacity;
    if (this._count < this._capacity) this._count++;
  }

  /** @returns {{p50:number,p95:number,max:number,fps:number}} milliseconds */
  summary() {
    const n = this._count;
    if (!n) return { p50: 0, p95: 0, max: 0, fps: 0 };
    const sorted = Array.from(this._times.subarray(0, n)).sort((a, b) => a - b);
    const at = (q) => sorted[Math.max(0, Math.ceil(n * q) - 1)];
    return {
      p50: at(0.5),
      p95: at(0.95),
      max: sorted[n - 1],
      fps: 1000 / (sorted.reduce((s, v) => s + v, 0) / n),
    };
  }

  reset() {
    this._count = 0;
    this._index = 0;
  }
}

/* ── Game loop ────────────────────────────────────────────── */

export class GameLoop {
  /**
   * @param {object} hooks
   * @param {(dt:number)=>void} hooks.step   Fixed-dt simulation step.
   * @param {(frameDt:number, alpha:number)=>void} hooks.render  Draw one frame.
   * @param {()=>void} [hooks.beforeSteps]   Called each frame before the step
   *        batch (pose.capture goes here).
   * @param {FrameMetrics} [hooks.metrics]   Optional metrics recorder.
   */
  constructor({ step, render, beforeSteps = null, metrics = null }) {
    this.step = step;
    this.render = render;
    this.beforeSteps = beforeSteps;
    this.metrics = metrics;
    this.accumulator = 0;
    this._last = null;
  }

  /** Call once per animation frame (inside renderer.setAnimationLoop). */
  frame(now = performance.now()) {
    if (this._last === null) {
      // First frame: establish the clock, draw once, step nothing — there is
      // no elapsed time to simulate yet.
      this._last = now;
      this.render(0, 0);
      return;
    }
    let frameDt = (now - this._last) / 1000;
    this._last = now;
    if (frameDt < 0) frameDt = 0;          // monotonic guard
    if (frameDt > MAX_FRAME_DT) frameDt = MAX_FRAME_DT;

    if (this.metrics) this.metrics.record(frameDt * 1000);

    if (this.beforeSteps) this.beforeSteps();

    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
      this.step(SIM_DT);
      this.accumulator -= SIM_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME && this.accumulator > SIM_DT) {
      this.accumulator = 0; // shed backlog rather than spiral
    }

    // Fraction of the next step already accrued → interpolation factor
    this.render(frameDt, Math.min(this.accumulator * SIM_HZ, 1));
  }
}
