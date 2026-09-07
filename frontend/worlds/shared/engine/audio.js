export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.isInitialized = false;
        
        this.windOsc = null;
        this.windGain = null;
        
        this.cicadaOsc1 = null;
        this.cicadaOsc2 = null;
        this.cicadaGain = null;
        
        this.crowdFilter = null;
        this.crowdGain = null;
        
        this.waterFilter = null;
        this.waterGain = null;
        
        this.nextBirdTime = 0;
        this.nextFootstepTime = 0;
        this.footstepLeft = true;
        this.muted = false;
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
        
        this.isInitialized = true;
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
        this.waterFilter.Q.value = 1.5;
        
        this.waterGain = this.ctx.createGain();
        this.waterGain.gain.value = 0;
        
        noise.connect(this.waterFilter);
        this.waterFilter.connect(this.waterGain);
        this.waterGain.connect(this.masterGain);
        
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

    _playFootstep() {
        if (!this.isInitialized) return;
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(0.1);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = this.footstepLeft ? -0.3 : 0.3;
        this.footstepLeft = !this.footstepLeft;
        
        const gain = this.ctx.createGain();
        
        noise.connect(filter);
        filter.connect(panner);
        panner.connect(gain);
        gain.connect(this.masterGain);
        
        const now = this.ctx.currentTime;
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        
        noise.start(now);
        noise.stop(now + 0.1);
    }

    update(dt, playerPos, isNight, isMoving, isRunning) {
        if (!this.isInitialized) return;
        
        const now = this.ctx.currentTime;
        
        // Cicadas
        if (isNight) {
            this.cicadaGain.gain.setTargetAtTime(0, now, 1.0);
        } else {
            // Random chirp cycle placeholder
            if (Math.random() < 0.01) {
                this.cicadaGain.gain.setTargetAtTime(0.1, now, 0.5);
            } else if (Math.random() < 0.01) {
                this.cicadaGain.gain.setTargetAtTime(0, now, 1.0);
            }
        }
        
        // Birds
        if (!isNight && now > this.nextBirdTime) {
            this._playBirdChirp();
            this.nextBirdTime = now + 3 + Math.random() * 12;
        }
        
        // Footsteps
        if (isMoving && now > this.nextFootstepTime) {
            this._playFootstep();
            this.nextFootstepTime = now + (isRunning ? 0.3 : 0.5);
        }
    }

    setMasterVolume(v) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.1);
        }
    }

    mute() { this.muted = true; this.setMasterVolume(0); }
    unmute() { this.muted = false; this.setMasterVolume(1); }
    
    dispose() {
        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
    }
}
