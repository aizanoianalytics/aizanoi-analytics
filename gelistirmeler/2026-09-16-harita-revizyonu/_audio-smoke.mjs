// _audio-smoke.mjs — TEST-ONLY throwaway harness for audio.js (not shipped to worlds).
// Stubs window/AudioContext with fakes, imports AudioSystem, calls every
// public method and asserts no-throw + expected node-graph structure.
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (cond, name) => {
    if (cond) { pass++; console.log('  PASS ' + name); }
    else { fail++; console.log('  FAIL ' + name); }
};
const mustNotThrow = (name, fn) => {
    try { fn(); pass++; console.log('  PASS ' + name + ' (no-throw)'); }
    catch (e) { fail++; console.log('  FAIL ' + name + ' threw: ' + (e && e.message)); }
};

// ---- Fake WebAudio graph -------------------------------------------------
function makeParam(v = 0) {
    return {
        value: v,
        setValueAtTime(val) { this.value = val; },
        linearRampToValueAtTime(val) { this.value = val; },
        exponentialRampToValueAtTime(val) { this.value = val; },
        setTargetAtTime(val) { this.value = val; },
        cancelScheduledValues() {},
    };
}
const created = { gain: [], osc: [], src: [], filter: [], panner: [] };
function makeNode(kind) {
    const node = {
        __kind: kind,
        gain: makeParam(0),
        frequency: makeParam(440),
        Q: makeParam(1),
        pan: makeParam(0),
        threshold: makeParam(0), knee: makeParam(0), ratio: makeParam(1),
        attack: makeParam(0), release: makeParam(0),
        type: '', loop: false, buffer: null,
        connect() {}, disconnect() {},
        start() {}, stop() {},
    };
    if (created[kind]) created[kind].push(node);
    return node;
}
function makeFakeContext(state = 'running') {
    return {
        state,
        sampleRate: 44100,
        currentTime: 100.0,
        destination: {},
        resumed: false,
        closed: false,
        createGain() { const n = makeNode('gain'); n.gain.value = 1.0; return n; },
        createOscillator() { return makeNode('osc'); },
        createBufferSource() { return makeNode('src'); },
        createBiquadFilter() { return makeNode('filter'); },
        createStereoPanner() { return makeNode('panner'); },
        createDynamicsCompressor() { return makeNode('gain'); },
        createBuffer(ch, len, rate) {
            return { getChannelData() { return new Float32Array(len); }, length: len };
        },
        resume() { this.resumed = true; this.state = 'running'; return Promise.resolve(); },
        close() { this.closed = true; this.state = 'closed'; return Promise.resolve(); },
    };
}

// Fake document for installLifecycleResume
const listeners = {};
globalThis.document = {
    visibilityState: 'visible',
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
};

// ---- 1. Degraded mode: no AudioContext at all -----------------------------
console.log('[1] degraded mode (no AudioContext)');
delete globalThis.window;
delete globalThis.AudioContext;
const modUrl = pathToFileURL('C:/Users/husey/aizanoi-analytics/frontend/worlds/shared/engine/audio.js').href;
const { AudioSystem } = await import(modUrl);
ok(typeof AudioSystem === 'function', 'AudioSystem class exported');
const dead = new AudioSystem();
mustNotThrow('init without AudioContext', () => dead.init());
ok(dead.isInitialized === false, 'stays uninitialized without AudioContext');
for (const [n, fn] of [
    ['setSoundset', () => dead.setSoundset('airport')],
    ['resume', () => dead.resume()],
    ['installLifecycleResume', () => dead.installLifecycleResume()],
    ['uiClick', () => dead.uiClick()],
    ['jump', () => dead.jump()],
    ['land', () => dead.land(9)],
    ['update', () => dead.update(0.016, { x: 0, z: 0 }, false, true, false, { waters: [{ x: 10, z: 5 }] })],
    ['setMasterVolume', () => dead.setMasterVolume(0.5)],
    ['mute', () => dead.mute()],
    ['unmute', () => dead.unmute()],
    ['dispose', () => dead.dispose()],
]) mustNotThrow('degraded ' + n, fn);

// ---- 2. Full mode with fakes ----------------------------------------------
console.log('[2] full mode (fake AudioContext)');
globalThis.window = { AudioContext: function () { return makeFakeContext('running'); } };
const a = new AudioSystem();
let initRet;
mustNotThrow('init', () => { initRet = a.init(); });
ok(initRet === true && a.isInitialized === true, 'init returns true + initialized');
ok(!!(a.masterGain && a.compressor && a.ctx), 'master chain nodes exist');
for (const bed of ['windGain', 'cicadaGain', 'crowdGain', 'waterGain', 'waterLowGain', 'fireGain', 'humGain', 'jetGain', 'conveyorGain', 'ruinGain', 'flyBuzzGain']) {
    ok(!!(a[bed] && a[bed].gain), 'bed node exists: ' + bed);
    ok(a[bed].gain.value <= 0.5, 'bed level conservative (<=0.5): ' + bed + '=' + a[bed].gain.value);
}
ok(a.masterGain.gain.value === 1.0, 'master gain unity');

// ---- 3. Soundsets ----------------------------------------------------------
console.log('[3] soundsets');
mustNotThrow('setSoundset airport', () => a.setSoundset('airport'));
ok(a.soundset === 'airport', 'soundset=airport stored');
mustNotThrow('setSoundset mediterranean', () => a.setSoundset('mediterranean'));
ok(a.soundset === 'mediterranean', 'soundset=mediterranean stored');
mustNotThrow('setSoundset garbage', () => a.setSoundset('mars'));
ok(a.soundset === 'mediterranean', 'unknown soundset falls back to mediterranean');

// ---- 4. update() proximity hook --------------------------------------------
console.log('[4] update hook');
const waters = [{ x: 5, z: 5 }, { x: -40, z: 60 }];
mustNotThrow('update medi day moving', () => a.update(0.016, { x: 0, y: 2, z: 0 }, false, true, true, { waters }));
mustNotThrow('update medi night idle', () => a.update(0.016, { x: 0, z: 0 }, true, false, false, { waters }));
mustNotThrow('update null playerPos', () => a.update(0.016, null, false, true, false, { waters }));
mustNotThrow('update no opts', () => a.update(0.016, { x: 0, z: 0 }, false, false, false));
mustNotThrow('update surface opt', () => a.update(0.016, { x: 0, z: 0 }, false, true, false, { waters, surface: 'grass' }));
a.setSoundset('airport');
mustNotThrow('update airport moving', () => a.update(0.016, { x: 0, z: 0 }, true, true, true, { waters }));
mustNotThrow('update airport idle', () => a.update(0.016, { x: 0, z: 0 }, false, false, false, {}));
ok(a.conveyorGain.gain.value > 0, 'airport drives conveyor bed: ' + a.conveyorGain.gain.value);
a.setSoundset('rome');
mustNotThrow('update rome', () => a.update(0.016, { x: 0, z: 0 }, false, false, false, {}));
ok(a.ruinGain.gain.value > 0, 'rome drives ruin-howl bed: ' + a.ruinGain.gain.value);
a.setSoundset('flyworld');
mustNotThrow('update flyworld', () => a.update(0.016, { x: 0, z: 0 }, false, true, false, { surface: 'wood' }));
ok(a.flyBuzzGain.gain.value > 0, 'flyworld drives fly-buzz bed: ' + a.flyBuzzGain.gain.value);
a.setSoundset('mediterranean');
// force timers to fire each one-shot path
a.nextBirdTime = 0; a.nextCrackleTime = 0; a.nextJetTime = 0; a.nextFootstepTime = 0;
mustNotThrow('update fires birds/crackle/footsteps', () => a.update(0.016, { x: 5, z: 5 }, false, true, true, { waters }));
a.setSoundset('airport');
a.nextBirdTime = 0; a.nextJetTime = 0;
mustNotThrow('update fires PA chime + jet swell', () => a.update(0.016, { x: 0, z: 0 }, false, false, false, {}));

// ---- 5. One-shots / levels --------------------------------------------------
console.log('[5] one-shots + levels');
for (const [n, fn] of [
    ['uiClick', () => a.uiClick()],
    ['jump', () => a.jump()],
    ['land default', () => a.land()],
    ['land fast', () => a.land(20)],
    ['land invalid', () => a.land(NaN)],
    ['setMasterVolume .4', () => a.setMasterVolume(0.4)],
    ['setMasterVolume clamp', () => a.setMasterVolume(99)],
    ['mute', () => a.mute()],
    ['uiClick while muted', () => a.uiClick()],
    ['jump while muted', () => a.jump()],
    ['setMasterVolume while muted', () => a.setMasterVolume(0.3)],
    ['unmute', () => a.unmute()],
    ['resume running', () => a.resume()],
    ['installLifecycleResume default', () => a.installLifecycleResume()],
    ['installLifecycleResume explicit', () => a.installLifecycleResume(globalThis.document)],
]) mustNotThrow(n, fn);
ok(a.muted === false, 'unmute clears muted flag');

// ---- 6. Suspended context ---------------------------------------------------
console.log('[6] suspended context');
globalThis.window = { AudioContext: function () { return makeFakeContext('suspended'); } };
const s = new AudioSystem();
mustNotThrow('init suspended', () => s.init());
ok(s.isInitialized === true, 'initializes even while suspended');
mustNotThrow('resume suspended', () => s.resume());
ok(s.ctx.resumed === true, 'resume() attempted on suspended ctx');
mustNotThrow('update suspended', () => s.update(0.016, { x: 0, z: 0 }, false, true, false, { waters: [] }));

// ---- 7. dispose --------------------------------------------------------------
console.log('[7] dispose');
mustNotThrow('dispose', () => a.dispose());
ok(a.isInitialized === false && a.ctx === null, 'dispose clears state');
for (const [n, fn] of [
    ['update after dispose', () => a.update(0.016, { x: 0, z: 0 }, false, true, false, {})],
    ['uiClick after dispose', () => a.uiClick()],
    ['mute after dispose', () => a.mute()],
    ['unmute after dispose', () => a.unmute()],
    ['setMasterVolume after dispose', () => a.setMasterVolume(0.5)],
    ['re-init after dispose', () => a.init()],
]) mustNotThrow(n, fn);

console.log(`\nSMOKE RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
