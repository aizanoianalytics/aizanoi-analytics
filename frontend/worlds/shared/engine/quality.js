/* quality.js — Device Profile & Adaptive Resolution
 * Aizanoi Analytics unified worlds runtime
 *
 * Two problems solved:
 *
 * 1. One-time device tiering. The four worlds previously booted every device
 *    at the same quality: DPR up to 2, PCFSoft 2048px shadows, antialias on.
 *    A throttled phone renders that at single-digit fps while the user waits
 *    minutes for a playable frame. DeviceProfile classifies the device once
 *    (mobile/tablet, cores, memory) and returns per-tier renderer settings.
 *
 * 2. Continuous adaptation. Device tiering alone cannot see a thermal-throttled
 *    flagship or a SwiftShader fallback. AdaptiveResolution polls the shared
 *    FrameMetrics summary on a cooldown and walks the pixel ratio down when the
 *    p95 frame time blows the budget, back up when there is sustained headroom.
 *    It never re-adjusts more often than the cooldown so the picture doesn't
 *    pump, and it stops at a floor instead of chasing an unplayable scene to
 *    zero resolution.
 *
 * Dependency-free: takes the renderer duck-typed ({ setPixelRatio }), so tests
 * can drive it with a double.
 */

/* ── Device tier (measured once at boot) ──────────────────── */

export function DeviceProfile(navigatorRef = typeof navigator !== 'undefined' ? navigator : undefined) {
  const ua = navigatorRef?.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigatorRef?.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isMobileUA = isIOS || isAndroid || /Mobile|Tablet/.test(ua);
  const cores = navigatorRef?.hardwareConcurrency || 4;
  const memGB = navigatorRef?.deviceMemory || 4;
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;

  let tier;
  if (isMobileUA && (cores <= 4 || memGB <= 3)) tier = 'low';
  else if (isMobileUA) tier = 'mid';
  else if (cores >= 8 && memGB >= 8) tier = 'high';
  else tier = 'mid';

  const TIER = {
    low:  { dprCap: 1.25, shadowMapSize: 1024, shadowRadius: 1, antialias: false },
    mid:  { dprCap: 1.5,  shadowMapSize: 2048, shadowRadius: 2, antialias: true },
    high: { dprCap: 2,    shadowMapSize: 2048, shadowRadius: 2, antialias: true },
  };

  return {
    tier,
    isMobile: isMobileUA,
    isIOS,
    dpr,
    ...TIER[tier],
    /** Effective starting pixel ratio: DPR clamped by the tier cap. */
    startPixelRatio: Math.min(dpr, TIER[tier].dprCap),
  };
}

/* ── Adaptive resolution governor ──────────────────────────── */

export class AdaptiveResolution {
  /**
   * @param {object} renderer - duck-typed { setPixelRatio(ratio) }
   * @param {object} metrics  - FrameMetrics instance (summary() → {p95,...})
   * @param {object} [opts]
   * @param {number} [opts.budgetMs]      - target p95 frame time (16.7 = 60fps)
   * @param {number} [opts.cooldownMs]    - minimum interval between adjustments
   * @param {number} [opts.minRatio]      - never scale below this
   * @param {number} [opts.maxRatio]      - never scale above this
   */
  constructor(renderer, metrics, opts = {}) {
    this.renderer = renderer;
    this.metrics = metrics;
    this.budgetMs = opts.budgetMs ?? 22;      // ~45fps budget; mobile-first
    this.cooldownMs = opts.cooldownMs ?? 2500;
    this.sampleIntervalMs = opts.sampleIntervalMs ?? 500;
    this.minRatio = opts.minRatio ?? 0.6;
    this.maxRatio = opts.maxRatio ?? Math.max(1, renderer.getPixelRatio?.() ?? 1);
    this._lastChange = -Infinity;
    this._lastPoll = -Infinity;
    this._overBudgetStreak = 0;
    this._underBudgetStreak = 0;
    this.adjustments = 0;
  }

  /** Current pixel ratio the renderer was last set to. */
  get ratio() {
    return this.renderer.getPixelRatio?.() ?? this.maxRatio;
  }

  /**
   * Poll once per display frame (constant-time); metrics are only summarized on a
   * bounded sampling interval, and resolution only changes after consecutive
   * sampled breaches plus the cooldown. A GC pause cannot pump resolution, and
   * sorting the metrics ring never becomes per-frame work.
   */
  update(now = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
    if (now - this._lastPoll < this.sampleIntervalMs) return;
    this._lastPoll = now;
    const summary = this.metrics?.summary?.();
    if (!summary || !(summary.p95 > 0)) return;

    if (summary.p95 > this.budgetMs) {
      this._overBudgetStreak += 1;
      this._underBudgetStreak = 0;
    } else if (summary.p95 < this.budgetMs * 0.55) {
      this._underBudgetStreak += 1;
      this._overBudgetStreak = 0;
    } else {
      this._overBudgetStreak = 0;
      this._underBudgetStreak = 0;
    }

    if (now - this._lastChange < this.cooldownMs) return;

    let next = null;
    if (this._overBudgetStreak >= 3 && this.ratio > this.minRatio) {
      // Step down ~15% — gentle enough not to visibly pump.
      next = Math.max(this.minRatio, this.ratio * 0.85);
      this._overBudgetStreak = 0;
    } else if (this._underBudgetStreak >= 12 && this.ratio < this.maxRatio) {
      next = Math.min(this.maxRatio, this.ratio * 1.1);
      this._underBudgetStreak = 0;
    }

    if (next !== null) {
      this.renderer.setPixelRatio(next);
      this._lastChange = now;
      this.adjustments += 1;
    }
  }
}
