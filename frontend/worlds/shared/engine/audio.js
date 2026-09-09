export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.isInitialized = false;
        this.soundset = 'mediterranean';

        this.windOsc = null;
        this.windGain = null;

        this.cicadaOsc1 = null;
        this.cicadaOsc2 = null;
        this.cicadaGain = null;

        this.crowdFilter = null;
        this.crowdGain = null;

        this.waterFilter = null;
        this.waterGain = null;
        this.waterLowFilter = null;
        this.waterLowGain = null;

        this.nextBirdTime = 0;
        this.nextFootstepTime = 0;
        this.footstepLeft = true;
        this.muted = false;
        this.prevVolume = 1.0;
    }

    /**
     * Per-world ambience profile.
     *  - 'mediterranean': wind + cicadas + birds + crowd + water  (Aizanoi/Rome/Athens)
     *  - 'airport':       terminal hall tone + PA chime + apron wind (İGA)
     * Silences layers that do not exist in the world instead of playing a
     * Mediterranean countryside soundscape everywhere.
     */
    setSoundset(name) {
        this.soundset = (name === 'airport') ? 'airport' : 'mediterranean';
        if (this.isInitialized) this._applySoundsetGains();
    }

    _applySoundsetGains() {
        const now = this.ctx.currentTime;
        const airport = this.soundset === 'airport';
        this.cicadaGain.gain.setTargetAtTime(airport ? 0 : this.cicadaGain.gain.value, now, 0.5);
        this.crowdGain.gain.setTargetAtTime(airport ? 0.012 : 0.05, now, 0.5);
        // Water stays proximity-driven (update()); the set only caps it.
    }

    init() {
        if (this.isInitialized) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1.0;
        this.masterGain.connect(this.ctx.destination);

        this._setupWind();
        this._setupCicadas();
        this._setupCrowd();
        this._setupWater();
        this._applySoundsetGains();

        this.isInitialized = true;
    }

    /** Resume a suspended AudioContext (autoplay policy / iOS). Safe to call repeatedly. */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    _createNoiseBuffer(duration) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    _setupWind() {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(5);
        noise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;

        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0.2;

        // LFO for wind
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 0.1;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.1;

        lfo.connect(lfoGain);
        lfoGain.connect(this.windGain.gain);

        noise.connect(filter);
        filter.connect(this.windGain);
        this.windGain.connect(this.masterGain);

        noise.start();
        lfo.start();
    }

    _setupCicadas() {
        this.cicadaOsc1 = this.ctx.createOscillator();
        this.cicadaOsc2 = this.ctx.createOscillator();

        this.cicadaOsc1.frequency.value = 4500;
        this.cicadaOsc2.frequency.value = 4600;

        const tremolo = this.ctx.createOscillator();
        tremolo.frequency.value = 40;

        const tremoloGain = this.ctx.createGain();
        tremoloGain.gain.value = 0.5;

        this.cicadaGain = this.ctx.createGain();
        this.cicadaGain.gain.value = 0.0;

        tremolo.connect(tremoloGain);
        tremoloGain.connect(this.cicadaGain.gain);

        this.cicadaOsc1.connect(this.cicadaGain);
        this.cicadaOsc2.connect(this.cicadaGain);
        this.cicadaGain.connect(this.masterGain);

        this.cicadaOsc1.start();
        this.cicadaOsc2.start();
        tremolo.start();
    }

    _setupCrowd() {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(10);
        noise.loop = true;

        this.crowdFilter = this.ctx.createBiquadFilter();
        this.crowdFilter.type = 'lowpass';
        this.crowdFilter.frequency.value = 200;

        this.crowdGain = this.ctx.createGain();
        this.crowdGain.gain.value = 0.05;

        noise.connect(this.crowdFilter);
        this.crowdFilter.connect(this.crowdGain);
        this.crowdGain.connect(this.masterGain);

        noise.start();
    }

    _setupWater() {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(5);
        noise.loop = true;

        this.waterFilter = this.ctx.createBiquadFilter();
        this.waterFilter.type = 'bandpass';
        this.waterFilter.frequency.value = 800;
        this.waterFilter.Q.value = 1.4;

        this.waterLowFilter = this.ctx.createBiquadFilter();
        this.waterLowFilter.type = 'lowpass';
        this.waterLowFilter.frequency.value = 340;

        this.waterGain = this.ctx.createGain();
        this.waterGain.gain.value = 0;

        this.waterLowGain = this.ctx.createGain();
        this.waterLowGain.gain.value = 0;

        noise.connect(this.waterFilter);
        this.waterFilter.connect(this.waterGain);
        this.waterGain.connect(this.masterGain);

        noise.connect(this.waterLowFilter);
        this.waterLowFilter.connect(this.waterLowGain);
        this.waterLowGain.connect(this.masterGain);

        noise.start();
    }

    _playBirdChirp() {
        if (!this.isInitialized) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.masterGain);

        const now = this.ctx.currentTime;
        const duration = 0.1 + Math.random() * 0.2;

        osc.frequency.setValueAtTime(2000 + Math.random() * 1000, now);
        osc.frequency.exponentialRampToValueAtTime(3000 + Math.random() * 1000, now + duration);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + duration * 0.2);
        gain.gain.linearRampToValueAtTime(0, now + duration);

        osc.start(now);
        osc.stop(now + duration);
    }

    /**
     * UI feedback blip — soft two-tone tick for HUD button presses.
     * Deliberately quiet (0.05 peak) so it never competes with ambience.
     */
    uiClick() {
        if (!this.isInitialized || this.muted) return;
        const now = this.ctx.currentTime;
        [[880.0, 0.0], [1320.0, 0.045]].forEach(([freq, delay]) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.05, now + delay + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.09);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now + delay);
            osc.stop(now + delay + 0.1);
        });
    }

    /**
     * Jump whoosh — filtered noise swell on take-off.
     */
    jump() {
        if (!this.isInitialized || this.muted) return;
        const now = this.ctx.currentTime;
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._getNoiseBuffer();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(300, now);
        filter.frequency.exponentialRampToValueAtTime(1400, now + 0.22);
        filter.Q.value = 1.2;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.07, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.3);
    }

    /**
     * Landing thud — low filtered noise burst, intensity scales with fall speed.
     */
    land(fallSpeed = 6) {
        if (!this.isInitialized || this.muted) return;
        const now = this.ctx.currentTime;
        const intensity = Math.min(1, Math.max(0.25, fallSpeed / 14));
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._getNoiseBuffer();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200 + intensity * 260;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.14 * intensity, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.2);
    }

    _getNoiseBuffer() {
        if (this._noiseBuffer) return this._noiseBuffer;
        const len = this.ctx.sampleRate * 0.5;
        this._noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        return this._noiseBuffer;
    }

    _playFootstep(surface = 'stone') {
        if (!this.isInitialized) return;

        const noise = this.ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(0.1);

        const filter = this.ctx.createBiquadFilter();
        if (surface === 'water') {
            filter.type = 'bandpass';
            filter.frequency.value = 1400;
            filter.Q.value = 0.8;
        } else {
            filter.type = 'lowpass';
            filter.frequency.value = 1000;
        }

        const panner = this.ctx.createStereoPanner();
        panner.pan.value = this.footstepLeft ? -0.3 : 0.3;
        this.footstepLeft = !this.footstepLeft;

        const gain = this.ctx.createGain();

        noise.connect(filter);
        filter.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterGain);

        const now = this.ctx.currentTime;
        const peak = surface === 'water' ? 0.16 : 0.1;
        gain.gain.setValueAtTime(peak, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        noise.start(now);
        noise.stop(now + 0.1);
    }

    /**
     * @param {object} opts
     *  waters: [{x,z,radius?}] world-space water sample points (rivers → dense points)
     *  surface: 'stone' | 'grass' | 'water' — overrides surface detection for the step
     */
    update(dt, playerPos, isNight, isMoving, isRunning, opts = {}) {
        if (!this.isInitialized) return;

        const now = this.ctx.currentTime;
        const airport = this.soundset === 'airport';

        // ---- Geospatial water (rivers/springs) — distance to nearest sample point
        if (Array.isArray(opts.waters) && opts.waters.length && playerPos) {
            let best = Infinity;
            for (const w of opts.waters) {
                const dx = playerPos.x - w.x;
                const dz = (playerPos.z ?? 0) - w.z;
                const d = Math.sqrt(dx * dx + dz * dz);
                if (d < best) best = d;
            }
            const radius = 95;                       // audible range in world units
            const t = Math.max(0, 1 - best / radius);
            const target = t * t * 0.38;             // fade + level cap
            this.waterGain.gain.setTargetAtTime(target, now, 0.4);
            this.waterFilter.frequency.setTargetAtTime(550 + t * 500, now, 0.4);
            if (this.waterLowGain) {
                this.waterLowGain.gain.setTargetAtTime(target * 0.65, now, 0.4);
            }
        }

        if (airport) {
            // Terminal hall tone: filtered wind as HVAC rumble + occasional PA chime
            this.windGain.gain.setTargetAtTime(0.05, now, 1.0);
            this.cicadaGain.gain.setTargetAtTime(0, now, 1.0);
            if (now > this.nextBirdTime) {          // reuse bird timer as PA chime timer
                this._playPAChime();
                this.nextBirdTime = now + 45 + Math.random() * 45;
            }
        } else {
            // ---- Cicadas (day) / crickets (night)
            if (isNight) {
                if (Math.random() < 0.02) {
                    this.cicadaGain.gain.setTargetAtTime(0.06, now, 0.5);
                } else if (Math.random() < 0.02) {
                    this.cicadaGain.gain.setTargetAtTime(0, now, 1.0);
                }
            } else {
                if (Math.random() < 0.01) {
                    this.cicadaGain.gain.setTargetAtTime(0.1, now, 0.5);
                } else if (Math.random() < 0.01) {
                    this.cicadaGain.gain.setTargetAtTime(0, now, 1.0);
                }
            }

            // ---- Birds (day only)
            if (!isNight && now > this.nextBirdTime) {
                this._playBirdChirp();
                this.nextBirdTime = now + 3 + Math.random() * 12;
            }
        }

        // ---- Footsteps (surface-aware)
        if (isMoving && now > this.nextFootstepTime) {
            const surface = opts.surface
                || (Array.isArray(opts.waters) && opts.waters.length && this._nearWater(playerPos, opts.waters) ? 'water' : 'stone');
            this._playFootstep(surface);
            this.nextFootstepTime = now + (isRunning ? 0.3 : 0.5);
        }
    }

    _nearWater(playerPos, waters) {
        for (const w of waters) {
            const dx = playerPos.x - w.x;
            const dz = (playerPos.z ?? 0) - w.z;
            if (Math.sqrt(dx * dx + dz * dz) < 25) return true;
        }
        return false;
    }

    _playPAChime() {
        if (!this.isInitialized) return;
        const now = this.ctx.currentTime;
        // Two-tone boarding chime (C6 → G5), soft sine bells
        [[1046.5, 0.0], [784.0, 0.35]].forEach(([freq, delay]) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(this.masterGain);
            gain.gain.setValueAtTime(0, now + delay);
            gain.gain.linearRampToValueAtTime(0.05, now + delay + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.9);
            osc.start(now + delay);
            osc.stop(now + delay + 1.0);
        });
    }

    setMasterVolume(v) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.1);
        }
    }

    mute() {
        if (!this.muted) this.prevVolume = this.masterGain ? this.masterGain.gain.value : 1.0;
        this.muted = true;
        this.setMasterVolume(0);
    }
    unmute() {
        this.muted = false;
        this.setMasterVolume(this.prevVolume > 0 ? this.prevVolume : 1.0);
    }

    dispose() {
        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
    }
}
