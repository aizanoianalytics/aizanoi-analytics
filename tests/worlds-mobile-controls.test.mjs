import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Controls } from '../frontend/worlds/shared/engine/controls.js';

function withNavigatorAndWindow({ userAgent, maxTouchPoints, innerWidth }, fn) {
  const previousNavigator = globalThis.navigator;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent, maxTouchPoints },
  });
  globalThis.window = { innerWidth, ontouchstart: null };
  try {
    return fn();
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: previousNavigator,
    });
    globalThis.window = previousWindow;
  }
}

test('iPadOS desktop-class user agents still receive touch controls', () => {
  const detected = withNavigatorAndWindow({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
    maxTouchPoints: 5,
    innerWidth: 1194,
  }, () => Controls.prototype._detectMobile());
  assert.equal(detected, true);
});

test('floating joystick stays centered under the thumb and resets after release', () => {
  const pad = {
    offsetWidth: 120,
    offsetHeight: 120,
    style: {},
    classList: { add() {}, remove() {} },
  };
  const knob = { style: {} };
  const controls = {
    enabled: true,
    _moveTouchId: null,
    _joystickOrigin: { x: 0, y: 0 },
    _joystickCurrent: { x: 0, y: 0 },
    _movePad: pad,
    _moveKnob: knob,
  };
  const event = {
    preventDefault() {},
    changedTouches: [{ identifier: 7, clientX: 200, clientY: 300 }],
  };

  Controls.prototype._onJoystickStart.call(controls, event);
  assert.equal(pad.style.left, '140px');
  assert.equal(pad.style.top, '240px');

  Controls.prototype._onJoystickMove.call(controls, {
    preventDefault() {},
    changedTouches: [{ identifier: 7, clientX: 260, clientY: 300 }],
  });
  assert.equal(knob.style.transform, 'translate(calc(-50% + 50px), calc(-50% + 0px))');

  Controls.prototype._onJoystickEnd.call(controls, event);
  assert.equal(pad.style.left, '');
  assert.equal(pad.style.top, '');
  assert.equal(knob.style.transform, '');
});

test('intro modal remains scrollable on landscape phones', () => {
  const css = readFileSync('frontend/worlds/shared/css/base-theme.css', 'utf8');
  const overlay = css.match(/\.modal-overlay\s*\{([^}]*)\}/)?.[1] || '';
  const content = css.match(/\.intro-content\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(overlay, /overflow-y\s*:\s*auto/);
  assert.match(content, /max-height\s*:\s*calc\(100dvh\s*-\s*24px\)/);
  assert.match(content, /overflow-y\s*:\s*auto/);
});

test('decorative touch-look overlay cannot intercept canvas gestures', () => {
  const css = readFileSync('frontend/worlds/shared/css/base-theme.css', 'utf8');
  const rule = css.match(/\.touch-look-area\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /pointer-events\s*:\s*none/);
});
