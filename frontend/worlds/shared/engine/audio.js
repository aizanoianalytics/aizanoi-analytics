/* shared/engine/audio.js — Procedural WebAudio ambience & SFX for Historical Worlds & Labs.
 *
 * Architecture contract:
 *  - 100% synthesized procedural audio using Web Audio API (Oscillators, BiquadFilters,
 *    Pink/Brown/White noise buffers, custom envelopes, and algorithmic impulse responses).
 *  - Zero external media file dependencies — zero bandwidth overhead, instantly cached.
 *  - Safe fallbacks: every public method safely no-ops if WebAudio is blocked/unavailable.
 *  - Supports soundsets: 'mediterranean', 'aizanoi', 'rome', 'athens', 'airport', 'flyworld'.
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

        // Airport-specific beds
        this.humGain = null;
        this.jetGain = null;
        this.jetFilter = null;
        this.conveyorGain = null; // İGA baggage-hall conveyor rumble

        // Specialized world beds (continuous layers; one-shot events live below)
        this.ruinGain = null;       // Rome late antiquity wind howl

        // Fly buzz oscillator (for Fly World)
        this.flyBuzzGain = null;
        this.flyBuzzOsc = null;

        // Scheduling and timers
        this.nextBirdTime = 0;
        this.nextFootstepTime = 0;
        this.nextCrackleTime = 0;
        this.nextJetTime = 0;
        this.nextChimeTime = 0;
        this.nextMillCreakTime = 0;
        this.nextClockTickTime = 0;
        this.clockTickTock = false;
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
     *  - 'rome': late antiquity wind howl + ruin hollow resonance + night owl + torches
     *  - 'athens': Acropolis high breeze + Agora murmur + bronze votive chimes + cicadas
     *  - 'airport' (İGA): vaulted hall hum + HVAC rumble + PA chimes + jet takeoffs
     *  - 'flyworld': domestic room tone + hearth fire + wall clock tick-tock + fly wing buzz
     */
    setSoundset(name) {
        try {
            const valid = ['airport', 'aizanoi', 'rome', 'athens', 'flyworld', 'mediterranean'];
            this.soundset = valid.includes(name) ? name : 'mediterranean';
            if (this.isInitialized) this._applySoundsetGains();
        } catch { /* never throw across the world boundary */ }
    }

    _applySoundsetGains() {
        if (!this.isInitialized || !this.ctx) return;
        try {
            const now = this._now();
            const s = this.soundset;
            const isAirport = s === 'airport';
            const isFly = s === 'flyworld';
            const isRome = s === 'rome';
            const isAthens = s === 'athens';
            const isAizanoi = s === 'aizanoi';

            // Wind & Airflow
            const windTarget = isAirport ? 0.04 : (isFly ? 0.015 : (isRome ? 0.20 : 0.14));
            this._setTarget(this.windGain, windTarget, now, 0.6);

            // Crowd wash
            const crowdTarget = isAirport ? 0.015 : (isFly ? 0.0 : (isAthens ? 0.05 : 0.035));
            this._setTarget(this.crowdGain, crowdTarget, now, 0.6);

            // Hearth / Fire crackle
            const fireTarget = isAirport ? 0.0 : (isFly ? 0.04 : (isRome ? 0.035 : 0.025));
            this._setTarget(this.fireGain, fireTarget, now, 0.6);

            // Terminal hum, jet bed & conveyor
            this._setTarget(this.humGain, isAirport ? 0.022 : 0.0, now, 0.6);
            this._setTarget(this.jetGain, isAirport ? 0.016 : 0.0, now, 0.8);
            if (this.conveyorGain) this._setTarget(this.conveyorGain, isAirport ? 0.012 : 0.0, now, 0.8);

            // Rome ruin howl (continuous); silent elsewhere
            if (this.ruinGain) this._setTarget(this.ruinGain, isRome ? 0.02 : 0.0, now, 0.8);

            // Fly buzz is proximity/event driven in update(); park it when leaving
            if (this.flyBuzzGain && !isFly) this._setTarget(this.flyBuzzGain, 0.0, now, 0.5);

            // Insects (day cicadas, night crickets)
            if (this.cicadaGain) {
                const cicadaAllowed = !isAirport && !isFly;
                this._setTarget(this.cicadaGain, cicadaAllowed ? 0.05 : 0.0, now, 0.6);
            }

            // Water (proximity-driven by update; park if leaving water-capable world)
            if (isAirport || isFly) {
                this._setTarget(this.waterGain, 0.0, now, 0.8);
                this._setTarget(this.waterLowGain, 0.0, now, 0.8);
            }

            // Room / Hall Reverb wet level
            if (this.reverbGain) {
                const revTarget = isAirport ? 0.28 : (isRome ? 0.22 : (isFly ? 0.06 : 0.12));
                this._setTarget(this.reverbGain, revTarget, now, 0.5);
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
                '_setupFire', '_setupHum', '_setupJet', '_setupConveyor',
                '_setupRuin', '_setupFlyBuzz'
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

    _setupHum() {
        // Airport 50 Hz mains electrical hum
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 50;
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 100;

        const mix2 = this.ctx.createGain();
        mix2.gain.value = 0.35;

        this.humGain = this.ctx.createGain();
        this.humGain.gain.value = 0.0;

        osc1.connect(this.humGain);
        osc2.connect(mix2);
        mix2.connect(this.humGain);
        this.humGain.connect(this._bus());

        osc1.start();
        osc2.start();
    }

    _setupJet() {
        // Deep apron rumble
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._getBrownNoiseBuffer();
        noise.loop = true;

        this.jetFilter = this.ctx.createBiquadFilter();
        this.jetFilter.type = 'lowpass';
        this.jetFilter.frequency.value = 110;

        this.jetGain = this.ctx.createGain();
        this.jetGain.gain.value = 0.0;

        const breathe = this.ctx.createOscillator();
        breathe.frequency.value = 0.045;
        const breatheGain = this.ctx.createGain();
        breatheGain.gain.value = 0.006;
        breathe.connect(breatheGain);
        breatheGain.connect(this.jetGain.gain);

        noise.connect(this.jetFilter);
        this.jetFilter.connect(this.jetGain);
        this.jetGain.connect(this._bus());

        noise.start();
        breathe.start();
        this.jetNoise = noise;
    }

    _setupConveyor() {
        // İGA baggage-hall conveyor rumble: looped brown noise, lowpassed
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._getBrownNoiseBuffer();
        noise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 220;

        this.conveyorGain = this.ctx.createGain();
        this.conveyorGain.gain.value = 0.0;

        const wobble = this.ctx.createOscillator();
        wobble.frequency.value = 0.07;
        const wobbleGain = this.ctx.createGain();
        wobbleGain.gain.value = 0.003;
        wobble.connect(wobbleGain);
        wobbleGain.connect(this.conveyorGain.gain);

        noise.connect(filter);
        filter.connect(this.conveyorGain);
        this.conveyorGain.connect(this._bus());

        noise.start();
        wobble.start();
    }

    _setupRuin() {
        // Rome hollow ruin howl: slow beating low sines through a narrow band
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 68;
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 102.5;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 300;
        filter.Q.value = 4.0;

        this.ruinGain = this.ctx.createGain();
        this.ruinGain.gain.value = 0.0;

        const drift = this.ctx.createOscillator();
        drift.frequency.value = 0.05;
        const driftGain = this.ctx.createGain();
        driftGain.gain.value = 0.006;
        drift.connect(driftGain);
        driftGain.connect(this.ruinGain.gain);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(this.ruinGain);
        this.ruinGain.connect(this._bus());

        osc1.start();
        osc2.start();
        drift.start();
    }

    _setupFlyBuzz() {
        // Fly World ~220 Hz micro-buzz
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 218;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 650;

        this.flyBuzzGain = this.ctx.createGain();
        this.flyBuzzGain.gain.value = 0.0;

        osc.connect(filter);
        filter.connect(this.flyBuzzGain);
        this.flyBuzzGain.connect(this._bus());

        osc.start();
        this.flyBuzzOsc = osc;
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

    _playPAChime() {
        try {
            if (!this.isInitialized || !this.ctx || this.muted) return;
            const now = this._now();
            // Pristine modern airport 3-tone chime (F5 -> A5 -> C6)
            [[698.46, 0.0], [880.00, 0.32], [1046.50, 0.64]].forEach(([freq, delay]) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.0001, now + delay);
                gain.gain.linearRampToValueAtTime(0.065, now + delay + 0.035);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.2);

                osc.connect(gain);
                gain.connect(this._bus());
                if (this.reverbNode) gain.connect(this.reverbNode);

                osc.start(now + delay);
                osc.stop(now + delay + 1.3);
            });
        } catch { /* no-op */ }
    }

    _playJetSwell() {
        try {
            if (!this.isInitialized || !this.ctx || this.muted) return;
            if (!this.jetGain) return;
            const now = this._now();
            const g = this.jetGain.gain;
            g.cancelScheduledValues(now);
            g.setValueAtTime(Math.max(0.0001, g.value || 0.015), now);
            g.linearRampToValueAtTime(0.075, now + 3.5);   // jet approach
            g.linearRampToValueAtTime(0.015, now + 9.0);   // fly away
        } catch { /* no-op */ }
    }

    _playClockTick() {
        try {
            if (!this.isInitialized || !this.ctx || this.muted) return;
            const now = this._now();
            const freq = this.clockTickTock ? 1200 : 960;
            this.clockTickTock = !this.clockTickTock;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.03);

            gain.gain.setValueAtTime(0.02, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

            osc.connect(gain);
            gain.connect(this._bus());
            osc.start(now);
            osc.stop(now + 0.04);
        } catch { /* no-op */ }
    }

    _playBronzeChime() {
        try {
            if (!this.isInitialized || !this.ctx || this.muted) return;
            const now = this._now();
            // Harmonically rich metallic shimmer (Classical Athens votive bell)
            [1420, 2130, 2840].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.linearRampToValueAtTime(0.025 / (idx + 1), now + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

                osc.connect(gain);
                gain.connect(this._bus());
                if (this.reverbNode) gain.connect(this.reverbNode);
                osc.start(now);
                osc.stop(now + 1.5);
            });
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
                let target = t * t * 0.42;
                if (s === 'airport') target *= 0.25;
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
            if (s === 'airport') {
                this._setTarget(this.windGain, 0.04, now, 1.0);
                this._setTarget(this.cicadaGain, 0.0, now, 1.0);
                this._setTarget(this.fireGain, 0.0, now, 1.0);
                if (now > this.nextBirdTime) {
                    this._playPAChime();
                    this.nextBirdTime = now + 40 + Math.random() * 45;
                }
                if (now > this.nextJetTime) {
                    this._playJetSwell();
                    this.nextJetTime = now + 20 + Math.random() * 30;
                }
            } else if (s === 'flyworld') {
                this._setTarget(this.windGain, 0.015, now, 1.0);
                this._setTarget(this.cicadaGain, 0.0, now, 1.0);
                this._setTarget(this.humGain, 0.0, now, 1.0);
                this._setTarget(this.jetGain, 0.0, now, 1.0);
                // Domestic micro-buzz bed (the future fly); parked by
                // _applySoundsetGains when leaving the room
                if (this.flyBuzzGain) this._setTarget(this.flyBuzzGain, 0.012, now, 1.0);
                // Hearth crackle
                if (now > this.nextCrackleTime) {
                    this._playFireCrackle();
                    this.nextCrackleTime = now + 0.2 + Math.random() * 0.8;
                }
                // Wall clock tick-tock
                if (now > this.nextClockTickTime) {
                    this._playClockTick();
                    this.nextClockTickTime = now + 1.0;
                }
            } else {
                // Mediterranean antiquities (Aizanoi, Rome, Athens)
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

                // Athens bronze votive chimes
                if (s === 'athens' && now > this.nextChimeTime) {
                    this._playBronzeChime();
                    this.nextChimeTime = now + 15 + Math.random() * 25;
                }

                // Aizanoi Penkalas water mill creak
                if (s === 'aizanoi' && now > this.nextMillCreakTime) {
                    this._playWaterMillCreak();
                    this.nextMillCreakTime = now + 8 + Math.random() * 12;
                }

                this._setTarget(this.humGain, 0.0, now, 1.0);
                this._setTarget(this.jetGain, 0.0, now, 1.0);
            }

            // Surface-aware footsteps
            if (isMoving && now > this.nextFootstepTime) {
                let surface = o.surface;
                if (!surface) {
                    if (Array.isArray(o.waters) && o.waters.length && this._nearWater(playerPos, o.waters)) {
                        surface = 'water';
                    } else if (s === 'airport') {
                        surface = 'tile';
                    } else if (s === 'flyworld') {
                        surface = 'wood';
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
        this.humGain = null;
        this.jetGain = null;
        this.flyBuzzGain = null;
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
