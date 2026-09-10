import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../frontend/worlds/shared/vendor/three.module.js';

class FakeWindow extends EventTarget {}

function installDom() {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const window = new FakeWindow();
  const document = {
    body: { appendChild() {} },
    createElement() {
      return {
        id: '',
        className: '',
        innerHTML: '',
        style: {},
        querySelector() { return { textContent: '' }; },
      };
    },
  };
  globalThis.window = window;
  globalThis.document = document;
  return () => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  };
}

test('the Enter pointerdown cannot consume the later tap-to-skip listener', async (t) => {
  const restore = installDom();
  try {
    const { IntroSequence } = await import('../frontend/worlds/shared/engine/intro.js');
    const controls = {
      enabled: true,
      disable() { this.enabled = false; },
      enable() { this.enabled = true; },
    };
    const camera = {
      position: new THREE.Vector3(),
      lookAt() {},
    };
    const intro = new IntroSequence(camera, {}, controls);
    t.after(() => intro.skipIntro());
    intro.curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(0, 1.7, 1),
    ]);
    intro.lookAtCurve = intro.curve;
    intro.onComplete = () => controls.enable();

    // A real button interaction emits pointerdown before click/start(). That
    // pre-entry event must not consume the listener intended to skip the intro.
    window.dispatchEvent(new Event('pointerdown'));
    intro.start();
    assert.equal(controls.enabled, false);

    window.dispatchEvent(new Event('pointerdown'));
    assert.equal(intro.isComplete, true);
    assert.equal(controls.enabled, true);
  } finally {
    restore();
  }
});
