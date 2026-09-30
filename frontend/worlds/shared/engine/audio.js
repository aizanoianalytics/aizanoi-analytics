/* shared/engine/audio.js — Procedural WebAudio ambience & SFX for Aizanoi & Labs.
 *
 * Architecture contract:
 *  - 100% synthesized procedural audio using Web Audio API (Oscillators, BiquadFilters,
 *    Pink/Brown/White noise buffers, custom envelopes, and algorithmic impulse responses).
 *  - Zero external media file dependencies — zero bandwidth overhead, instantly cached.
 *  - Safe fallbacks: every public method safely no-ops if WebAudio is blocked/unavailable.
 *  - Supports soundsets: 'mediterranean' (default), 'aizanoi'.
 */

export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.compressor = null;
        this.masterGain = null;
        this.reverbNode = null;
        this.reverbGain = null;
        this.dryGain = null;
        this.isInitialized = false;
        this.soundset = 'mediterranean';

        // Continuous ambient bed gains and filters
        this.windGain = null;
        this.windFilter = null;
        this.windSubGain = null;
        this.windSubFilter = null;

        this.cicadaGain = null;
        this.cicadaOsc1 = null;
        this.cicadaOsc2 = null;

        this.crowdGain = null;
        this.crowdFilter = null;

        this.waterGain = null;
        this.waterFilter = null;
        this.waterLowGain = null;
        this.waterLowFilter = null;

        this.fireGain = null;

        // Scheduling and timers
        this.nextBirdTime = 0;
        this.nextFootstepTime = 0;
        this.nextCrackleTime = 0;
        this.nextMillCreakTime = 0;
        this.footstepLeft = true;

        this.muted = false;
        this.prevVolume = 1.0;

        // Cached noise buffers
        this._whiteNoiseBuffer = null;
        this._pinkNoiseBuffer = null;
        this._brownNoiseBuffer = null;
        this._impulseBuffer = null;

        this._lifecycleInstalled = false;
        this._gestureArmed = false;
    }

    // ------------------------------------------------------------------ Setup

    /**
     * Per-world ambience profile:
     *  - 'mediterranean' (default): wind + cicadas/crickets + birds + crowd + water + fire
     *  - 'aizanoi': mediterranean + Penkalas river rush + wooden water mill creak
     */
    setSoundset(name) {
        try {
            const valid = ['aizanoi', 'mediterranean'];
            this.soundset = valid.includes(name) ? name : 'mediterranean';
            if (this.isInitialized) this._applySoundsetGains();
        } catch { /* never throw across the world boundary */ }
    }

    _applySoundsetGains() {
        if (!this.isInitialized || !this.ctx) return;
        try {
            const now = this._now();

            // Wind & Airflow
            this._setTarget(this.windGain, 0.14, now, 0.6);

            // Crowd wash
            this._setTarget(this.crowdGain, 0.035, now, 0.6);

            // Hearth / Fire crackle
            this._setTarget(this.fireGain, 0.025, now, 0.6);

            // Insects (day cicadas, night crickets)
            if (this.cicadaGain) {
                this._setTarget(this.cicadaGain, 0.05, now, 0.6);
            }

            // Room / Hall Reverb wet level
            if (this.reverbGain) {
                this._setTarget(this.reverbGain, 0.12, now, 0.5);
            }
        } catch { /* gain automation must never break the frame loop */ }
    }

    /**
     * Build the audio graph. Safe to call repeatedly; returns true when the graph
     * is up. Returns false (never throws) when WebAudio is unavailable.
     */
    init() {
        if (this.isInitialized && this.ctx) return true;
        try {
            const AC = this._audioCtor();
            if (typeof AC !== 'function') return false;
            this.ctx = new AC();
            if (!this.ctx) return false;

            // Dynamics compressor glues mix, prevents mobile speaker clipping
            this.compressor = this._safeCreate('createDynamicsCompressor');
            if (this.compressor) {
                try {
                    this.compressor.threshold.value = -16;
                    this.compressor.knee.value = 10;
                    this.compressor.ratio.value = 4.5;
                    this.compressor.attack.value = 0.003;
                    this.compressor.release.value = 0.15;
                } catch { /* read-only stubs in tests */ }
            }

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 1.0;

            // Algorithmic convolution reverb for space & depth
            this._setupReverb();

            try {
                if (this.compressor) {
                    this.compressor.connect(this.masterGain);
                    this.masterGain.connect(this.ctx.destination);
                } else {
                    this.masterGain.connect(this.ctx.destination);
                }
            } catch { /* stubbed contexts in tests */ }

            // Build all ambient sound generators
            const builders = [
                '_setupWind', '_setupCicadas', '_setupCrowd', '_setupWater',
                '_setupFire'
            ];
            for (const b of builders) {
                try { this[b](); } catch { /* keep remaining mix alive */ }
            }
            this._applySoundsetGains();

            this.isInitialized = true;
            if (this._isSuspended()) {
                this.resume();
                this._armGestureResume();
            }
            if (this.muted) {
                try { this.masterGain.gain.value = 0; } catch { /* no-op */ }
            }
            return true;
        } catch {
            this.isInitialized = false;
            return false;
        }
    }

    resume() {
        try {
            if (this.ctx && this._isSuspended()) {
                const r = this.ctx.resume();
                if (r && typeof r.catch === 'function') r.catch(() => {});
            }
        } catch { /* no-op */ }
    }

    installLifecycleResume(documentRef) {
        try {
            const doc = documentRef || (typeof document !== 'undefined' ? document : null);
            if (!doc || typeof doc.addEventListener !== 'function') return;
            if (this._lifecycleInstalled) return;
            this._lifecycleInstalled = true;
            doc.addEventListener('visibilitychange', () => {
                try {
                    if (doc.visibilityState === 'visible') this.resume();
                } catch { /* no-op */ }
            });
            doc.addEventListener('pointerdown', () => this.resume(), { passive: true });
        } catch { /* best effort */ }
    }

    // ------------------------------------------------------------ Bed Builders

    _bus() {
        return this.compressor || this.masterGain || null;
    }

    _setupReverb() {
        try {
            const convolver = this._safeCreate('createConvolver');
            if (convolver) {
                convolver.buffer = this._createImpulseResponse(1.8, 2.2);
                this.reverbNode = convolver;
                this.reverbGain = this.ctx.createGain();
                this.reverbGain.gain.value = 0.12;
                this.dryGain = this.ctx.createGain();
                this.dryGain.gain.value = 0.95;

                convolver.connect(this.reverbGain);
                this.reverbGain.connect(this.compressor || this.masterGain);
            }
        } catch { /* reverb is enhancement; never block core audio */ }
    }

    _setupWind() {
        // Dual-layer wind: Pink noise body + deep low-frequency sweep LFOs
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._getPinkNoiseBuffer();
        noise.loop = true;

        this.windFilter = this.ctx.createBiquadFilter();
        this.windFilter.type = 'lowpass';
        this.windFilter.frequency.value = 360;

        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0.14;

        // Slow organic breath LFOs (gust + gentle swell)
        const lfo1 = this.ctx.createOscillator();
        lfo1.frequency.value = 0.06;
        const lfo1Gain = this.ctx.createGain();
        lfo1Gain.gain.value = 0.055;

        const lfo2 = this.ctx.createOscillator();
        lfo2.frequency.value = 0.14;
        const lfo2Gain = this.ctx.createGain();
        lfo2Gain.gain.value = 0.028;

        lfo1.connect(lfo1Gain);
        lfo1Gain.connect(this.windGain.gain);
        lfo2.connect(lfo2Gain);
        lfo2Gain.connect(this.windGain.gain);

        noise.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this._bus());

        noise.start();
        lfo1.start();
        lfo2.start();
        this.windNoise = noise;
    }

    _setupCicadas() {
        // Detuned high sines chopped with ~30 Hz tremolo
        this.cicadaOsc1 = this.ctx.createOscillator();
        this.cicadaOsc2 = this.ctx.createOscillator();
        this.cicadaOsc1.type = 'sine';
        this.cicadaOsc2.type = 'sine';
        this.cicadaOsc1.frequency.value = 4250;
        this.cicadaOsc2.frequency.value = 4550;

        const tremolo = this.ctx.createOscillator();
        tremolo.type = 'sine';
        tremolo.frequency.value = 30;

        const tremoloGain = this.ctx.createGain();
        tremoloGain.gain.value = 0.28;

        this.cicadaGain = this.ctx.createGain();
        this.cicadaGain.gain.value = 0.0;

        tremolo.connect(tremoloGain);
        tremoloGain.connect(this.cicadaGain.gain);

        this.cicadaOsc1.connect(this.cicadaGain);
        this.cicadaOsc2.connect(this.cicadaGain);
        this.cicadaGain.connect(this._bus());

        this.cicadaOsc1.start();
        this.cicadaOsc2.start();
        tremolo.start();
    }

    _setupCrowd() {
        // Vocal-range filtered noise with slow conversation swell
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._getPinkNoiseBuffer();
        noise.loop = true;

        this.crowdFilter = this.ctx.createBiquadFilter();
        this.crowdFilter.type = 'bandpass';
        this.crowdFilter.frequency.value = 540;
        this.crowdFilter.Q.value = 0.65;

        this.crowdGain = this.ctx.createGain();
        this.crowdGain.gain.value = 0.035;

        const swell = this.ctx.createOscillator();
        swell.frequency.value = 0.08;
        const swellGain = this.ctx.createGain();
        swellGain.gain.value = 0.01;
        swell.connect(swellGain);
        swellGain.connect(this.crowdGain.gain);

        noise.connect(this.crowdFilter);
        this.crowdFilter.connect(this.crowdGain);
        this.crowdGain.connect(this._bus());

        noise.start();
        swell.start();
        this.crowdNoise = noise;
    }

    _setupWater() {
        // Proximity-driven river and spring layers: shimmering bandpass + deep body
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._getPinkNoiseBuffer();
        noise.loop = true;

        this.waterFilter = this.ctx.createBiquadFilter();
        this.waterFilter.type = 'bandpass';
        this.waterFilter.frequency.value = 860;
        this.waterFilter.Q.value = 1.0;

        this.waterLowFilter = this.ctx.createBiquadFilter();
        this.waterLowFilter.type = 'lowpass';
        this.waterLowFilter.frequency.value = 320;

        this.waterGain = this.ctx.createGain();
        this.waterGain.gain.value = 0;
        this.waterLowGain = this.ctx.createGain();
        this.waterLowGain.gain.value = 0;

        // Gentle wandering shimmer
        const wander = this.ctx.createOscillator();
        wander.frequency.value = 0.12;
        const wanderGain = this.ctx.createGain();
        wanderGain.gain.value = 180;
        wander.connect(wanderGain);
        wanderGain.connect(this.waterFilter.frequency);

        noise.connect(this.waterFilter);
        this.waterFilter.connect(this.waterGain);
        this.waterGain.connect(this._bus());

        noise.connect(this.waterLowFilter);
        this.waterLowFilter.connect(this.waterLowGain);
        this.waterLowGain.connect(this._bus());

        noise.start();
        wander.start();
        this.waterNoise = noise;
    }

    _setupFire() {
        // Hearth/campfire warm lowpassed bed
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._getBrownNoiseBuffer();
        noise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 850;

        this.fireGain = this.ctx.createGain();
        this.fireGain.gain.value = 0.025;

        const flicker = this.ctx.createOscillator();
        flicker.frequency.value = 8.5;
        const flickerGain = this.ctx.createGain();
        flickerGain.gain.value = 0.007;
        flicker.connect(flickerGain);
        flickerGain.connect(this.fireGain.gain);

        noise.connect(filter);
        filter.connect(this.fireGain);
        this.fireGain.connect(this._bus());

        noise.start();
        flicker.start();
        this.fireNoise = noise;
    }

    // ------------------------------------------------------------- One-shots

    /**
     * Enhanced surface-aware procedural footsteps:
     * stone, marble, wood, gravel, water, tile
     */
    _playFootstep(surface = 'stone') {
        try {
            if (!this.isInitialized || !this.ctx || this.muted) return;
            const now = this._now();

            const profiles = {
                stone: { type: 'lowpass', freq: 1100, peak: 0.11, dur: 0.09, q: 0.6 },
                marble: { type: 'bandpass', freq: 1600, peak: 0.13, dur: 0.07, q: 1.2 },
                wood: { type: 'lowpass', freq: 420, peak: 0.14, dur: 0.12, q: 0.8 },
                gravel: { type: 'bandpass', freq: 1350, peak: 0.09, dur: 0.11, q: 0.5 },
                dirt: { type: 'lowpass', freq: 520, peak: 0.08, dur: 0.10, q: 0.5 },
                grass: { type: 'lowpass', freq: 480, peak: 0.06, dur: 0.10, q: 0.5 },
                water: { type: 'bandpass', freq: 1450, peak: 0.18, dur: 0.14, q: 0.9 },
                tile: { type: 'bandpass', freq: 2100, peak: 0.12, dur: 0.06, q: 1.4 },
            };
            const p = profiles[surface] || profiles.stone;

            const noise = this.ctx.createBufferSource();
            noise.buffer = (surface === 'wood' || surface === 'dirt')
                ? this._getBrownNoiseBuffer()
                : this._getWhiteNoiseBuffer();

            const filter = this.ctx.createBiquadFilter();
            filter.type = p.type;
            filter.frequency.value = p.freq;
            filter.Q.value = p.q;

            const gain = this.ctx.createGain();

            // Wood / Tile thump transient
            if (surface === 'wood' || surface === 'marble' || surface === 'tile') {
                const subOsc = this.ctx.createOscillator();
                const subGain = this.ctx.createGain();
                subOsc.type = 'sine';
                subOsc.frequency.setValueAtTime(surface === 'wood' ? 85 : 190, now);
                subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.05);

                subGain.gain.setValueAtTime(0.06, now);
                subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

                subOsc.connect(subGain);
                subGain.connect(gain);
                subOsc.start(now);
                subOsc.stop(now + 0.07);
            }

            noise.connect(filter);
            filter.connect(gain);

            // Stereo panning
            let tail = gain;
            try {
                if (typeof this.ctx.createStereoPanner === 'function') {
                    const panner = this.ctx.createStereoPanner();
                    panner.pan.value = this.footstepLeft ? -0.28 : 0.28;
                    gain.connect(panner);
                    tail = panner;
                }
            } catch { /* mono fallback */ }
            this.footstepLeft = !this.footstepLeft;

            tail.connect(this._bus());

            gain.gain.setValueAtTime(p.peak, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + p.dur);

            noise.start(now);
            noise.stop(now + p.dur + 0.02);
        } catch { /* footsteps must never throw */ }
    }

    jump() {
        try {
            if (!this.isInitialized || !this.ctx || this.muted) return;
            const now = this._now();
            const noise = this.ctx.createBufferSource();
            noise.buffer = this._getPinkNoiseBuffer();
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(280, now);
            filter.frequency.exponentialRampToValueAtTime(1550, now + 0.24);
            filter.Q.value = 1.3;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.08, now + 0.07);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this._bus());
            noise.start(now);
            noise.stop(now + 0.3);
        } catch { /* no-op */ }
    }

    land(fallSpeed = 6) {
        try {
            if (!this.isInitialized || !this.ctx || this.muted) return;
            const now = this._now();
            const speed = (typeof fallSpeed === 'number' && isFinite(fallSpeed)) ? fallSpeed : 6;
            const intensity = Math.min(1.2, Math.max(0.3, speed / 12));

            const noise = this.ctx.createBufferSource();
            noise.buffer = this._getBrownNoiseBuffer();

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 160 + intensity * 240;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.18 * intensity, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this._bus());

            noise.start(now);
            noise.stop(now + 0.22);
        } catch { /* no-op */ }
    }

    uiClick() {
        try {
            if (!this.isInitialized || !this.ctx || this.muted) return;
            const now = this._now();
            [[920.0, 0.0], [1380.0, 0.04]].forEach(([freq, delay]) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.0001, now + delay);
                gain.gain.exponentialRampToValueAtTime(0.05, now + delay + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.08);
                osc.connect(gain);
                gain.connect(this._bus());
                osc.start(now + delay);
                osc.stop(now + delay + 0.09);
            });
        } catch { /* no-op */ }
    }

    _playBirdChirp() {
        try {
            if (!this.isInitialized || !this.ctx || this.muted) return;
            const now = this._now();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';

            const duration = 0.12 + Math.random() * 0.18;
            const startF = 2200 + Math.random() * 800;
            const endF = 3200 + Math.random() * 900;

            osc.frequency.setValueAtTime(startF, now);
            osc.frequency.exponentialRampToValueAtTime(endF, now + duration);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.075, now + duration * 0.25);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            osc.connect(gain);
            gain.connect(this._bus());
            osc.start(now);
            osc.stop(now + duration + 0.02);
        } catch { /* no-op */ }
    }

    _playFireCrackle() {
        try {
            if (!this.isInitialized || !this.ctx || this.muted) return;
            const now = this._now();
            const noise = this.ctx.createBufferSource();
            noise.buffer = this._getWhiteNoiseBuffer();
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 1600 + Math.random() * 1400;

            const gain = this.ctx.createGain();
            const peak = 0.015 + Math.random() * 0.025;
            gain.gain.setValueAtTime(peak, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04 + Math.random() * 0.05);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this._bus());
            noise.start(now);
            noise.stop(now + 0.12);
        } catch { /* no-op */ }
    }

    _playWaterMillCreak() {
        try {
            if (!this.isInitialized || !this.ctx || this.muted) return;
            const now = this._now();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.linearRampToValueAtTime(110, now + 0.25);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.03, now + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

            osc.connect(gain);
            gain.connect(this._bus());
            osc.start(now);
            osc.stop(now + 0.4);
        } catch { /* no-op */ }
    }

    // ------------------------------------------------------------------- Loop

    update(dt, playerPos, isNight, isMoving, isRunning, opts = {}) {
        try {
            if (!this.isInitialized || !this.ctx) return;
            const now = this._now();
            const s = this.soundset;
            const o = (opts && typeof opts === 'object') ? opts : {};

            // Proximity-based water sound (rivers/harbors)
            if (Array.isArray(o.waters) && o.waters.length && playerPos) {
                let best = Infinity;
                for (const w of o.waters) {
                    if (!w) continue;
                    const dx = (playerPos.x || 0) - (w.x || 0);
                    const dz = (playerPos.z ?? 0) - (w.z ?? 0);
                    const d = Math.sqrt(dx * dx + dz * dz);
                    if (d < best) best = d;
                }
                const radius = 95;
                const t = best === Infinity ? 0 : Math.max(0, 1 - best / radius);
                const target = t * t * 0.42;
                this._setTarget(this.waterGain, target, now, 0.4);
                if (this.waterFilter) {
                    try { this.waterFilter.frequency.setTargetAtTime(550 + t * 520, now, 0.4); } catch { /* no-op */ }
                }
                this._setTarget(this.waterLowGain, target * 0.7, now, 0.4);
            } else {
                this._setTarget(this.waterGain, 0.0, now, 0.6);
                this._setTarget(this.waterLowGain, 0.0, now, 0.6);
            }

            // Soundset-specific timers & scheduler
            if (isNight) {
                const chance = Math.random();
                if (chance < 0.025) this._setTarget(this.cicadaGain, 0.065, now, 0.5);
                else if (chance < 0.05) this._setTarget(this.cicadaGain, 0.0, now, 1.0);
            } else {
                const chance = Math.random();
                if (chance < 0.015) this._setTarget(this.cicadaGain, 0.11, now, 0.5);
                else if (chance < 0.03) this._setTarget(this.cicadaGain, 0.0, now, 1.0);
            }

            if (!isNight && now > this.nextBirdTime) {
                this._playBirdChirp();
                this.nextBirdTime = now + 4 + Math.random() * 12;
            }

            if (now > this.nextCrackleTime) {
                this._playFireCrackle();
                this.nextCrackleTime = now + 0.2 + Math.random() * 1.0;
            }

            // Aizanoi Penkalas water mill creak
            if (s === 'aizanoi' && now > this.nextMillCreakTime) {
                this._playWaterMillCreak();
                this.nextMillCreakTime = now + 8 + Math.random() * 12;
            }

            // Surface-aware footsteps
            if (isMoving && now > this.nextFootstepTime) {
                let surface = o.surface;
                if (!surface) {
                    if (Array.isArray(o.waters) && o.waters.length && this._nearWater(playerPos, o.waters)) {
                        surface = 'water';
                    } else {
                        surface = 'stone';
                    }
                }
                this._playFootstep(surface);
                this.nextFootstepTime = now + (isRunning ? 0.28 : 0.48);
            }
        } catch { /* frame loop must never break */ }
    }

    _nearWater(playerPos, waters) {
        try {
            if (!playerPos || !Array.isArray(waters)) return false;
            for (const w of waters) {
                if (!w) continue;
                const dx = (playerPos.x || 0) - (w.x || 0);
                const dz = (playerPos.z ?? 0) - (w.z ?? 0);
                if (Math.sqrt(dx * dx + dz * dz) < 25) return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    // ------------------------------------------------------------------ Volume

    setMasterVolume(v) {
        try {
            const clamped = Math.max(0, Math.min(1, Number(v) || 0));
            if (this.muted) {
                this.prevVolume = clamped > 0 ? clamped : this.prevVolume;
                return;
            }
            if (this.masterGain && this.ctx) {
                this.masterGain.gain.setTargetAtTime(clamped, this._now(), 0.1);
            }
            this.prevVolume = clamped;
        } catch { /* no-op */ }
    }

    mute() {
        try {
            if (!this.muted) {
                let current = 1.0;
                try {
                    current = (this.masterGain && typeof this.masterGain.gain.value === 'number')
                        ? this.masterGain.gain.value
                        : this.prevVolume;
                } catch { current = this.prevVolume; }
                this.prevVolume = current;
            }
            this.muted = true;
            if (this.masterGain && this.ctx) {
                try { this.masterGain.gain.setTargetAtTime(0, this._now(), 0.05); }
                catch { try { this.masterGain.gain.value = 0; } catch { /* no-op */ } }
            }
        } catch { this.muted = true; }
    }

    unmute() {
        try {
            this.muted = false;
            const target = (typeof this.prevVolume === 'number' && this.prevVolume > 0)
                ? Math.min(1, this.prevVolume)
                : 1.0;
            if (this.masterGain && this.ctx) {
                try { this.masterGain.gain.setTargetAtTime(target, this._now(), 0.05); }
                catch { try { this.masterGain.gain.value = target; } catch { /* no-op */ } }
            }
        } catch { this.muted = false; }
    }

    dispose() {
        try {
            if (this.ctx) {
                try {
                    const r = this.ctx.close();
                    if (r && typeof r.catch === 'function') r.catch(() => {});
                } catch { /* already closed */ }
                this.ctx = null;
            }
        } catch { /* no-op */ }
        this.isInitialized = false;
        this._lifecycleInstalled = false;
        this._gestureArmed = false;
        this.compressor = null;
        this.masterGain = null;
        this.reverbNode = null;
        this.reverbGain = null;
        this.windGain = null;
        this.cicadaGain = null;
        this.crowdGain = null;
        this.waterGain = null;
        this.waterLowGain = null;
        this.fireGain = null;
    }

    // ---------------------------------------------------------------- Helpers

    _audioCtor() {
        try {
            const g = (typeof globalThis !== 'undefined') ? globalThis : {};
            const w = (g.window && typeof g.window === 'object') ? g.window : g;
            return w.AudioContext || w.webkitAudioContext || null;
        } catch {
            return null;
        }
    }

    _isSuspended() {
        try {
            return !!(this.ctx && this.ctx.state === 'suspended');
        } catch {
            return false;
        }
    }

    _now() {
        try {
            return (this.ctx && typeof this.ctx.currentTime === 'number')
                ? this.ctx.currentTime
                : 0;
        } catch {
            return 0;
        }
    }

    _setTarget(gainNode, value, now, tc) {
        try {
            if (!gainNode || !gainNode.gain) return;
            gainNode.gain.setTargetAtTime(value, now, tc);
        } catch { /* a dead bed must not kill the mix */ }
    }

    _safeCreate(method) {
        try {
            return (this.ctx && typeof this.ctx[method] === 'function')
                ? this.ctx[method]()
                : null;
        } catch {
            return null;
        }
    }

    _armGestureResume() {
        try {
            if (this._gestureArmed) return;
            const g = (typeof globalThis !== 'undefined') ? globalThis : {};
            const doc = g.document;
            if (!doc || typeof doc.addEventListener !== 'function') return;
            this._gestureArmed = true;
            const wake = () => {
                try {
                    if (!this.ctx) this.init();
                    else this.resume();
                } catch { /* no-op */ }
            };
            doc.addEventListener('pointerdown', wake, { once: true, passive: true });
            doc.addEventListener('keydown', wake, { once: true });
        } catch { /* best effort */ }
    }

    // Noise generators: White, Pink (1/f), Brown (1/f^2)

    _getWhiteNoiseBuffer() {
        if (this._whiteNoiseBuffer) return this._whiteNoiseBuffer;
        const len = Math.max(1, Math.floor(this.ctx.sampleRate * 2.0));
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this._whiteNoiseBuffer = buf;
        return buf;
    }

    _getPinkNoiseBuffer() {
        if (this._pinkNoiseBuffer) return this._pinkNoiseBuffer;
        const len = Math.max(1, Math.floor(this.ctx.sampleRate * 4.0));
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        // Paul Kellet's filtered pink noise algorithm
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
        }
        this._pinkNoiseBuffer = buf;
        return buf;
    }

    _getBrownNoiseBuffer() {
        if (this._brownNoiseBuffer) return this._brownNoiseBuffer;
        const len = Math.max(1, Math.floor(this.ctx.sampleRate * 4.0));
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        let last = 0.0;
        for (let i = 0; i < len; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (last + (0.02 * white)) / 1.02;
            last = data[i];
            data[i] *= 3.5; // Gain compensation
        }
        this._brownNoiseBuffer = buf;
        return buf;
    }

    _createImpulseResponse(duration = 1.5, decay = 2.0) {
        const rate = this.ctx.sampleRate;
        const length = Math.max(1, Math.floor(rate * duration));
        const impulse = this.ctx.createBuffer(2, length, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        for (let i = 0; i < length; i++) {
            const t = i / rate;
            const exp = Math.exp(-t * decay);
            left[i] = (Math.random() * 2 - 1) * exp;
            right[i] = (Math.random() * 2 - 1) * exp;
        }
        return impulse;
    }
}
