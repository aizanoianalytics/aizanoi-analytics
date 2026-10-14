import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const tokens = read('frontend/styles/tokens.css');
const base = read('frontend/styles/base.css');
const components = read('frontend/styles/components.css');
const shell = read('frontend/js/v3/shell.js');
const os = read('frontend/js/v3/aizanoi-os.js');

const errors = ['404', '500', '503'].map((code) => read(`frontend/${code}.html`));

test('canonical tokens expose layered light surfaces and spring motion', () => {
  assert.match(tokens, /--az-surface-0:/);
  assert.match(tokens, /--az-surface-1:/);
  assert.match(tokens, /--az-surface-2:/);
  assert.match(tokens, /--az-ease-out-expo:/);
  assert.match(tokens, /--az-ease-spring:/);
});

test('global controls use spring feedback and a double focus ring', () => {
  assert.match(base, /:focus-visible[^}]*box-shadow:[^}]*0 0 0 2px[^}]*0 0 0 5px/s);
  assert.match(components, /\.az-button:active[^}]*scale\(\.97\)/);
  assert.match(components, /var\(--az-ease-out-expo\)/);
});

test('data and KPI surfaces use tabular numeric alignment', () => {
  assert.match(base, /font-variant-numeric:\s*tabular-nums/);
  assert.match(base, /\.az-kpi|\.az-markets|\[data-numeric\]/);
});

test('app loading placeholder is a stable shimmer skeleton', () => {
  assert.match(shell, /az-skeleton/);
  assert.match(shell, /az-skeleton-line/);
  assert.match(components, /@keyframes az-shimmer/);
  assert.match(components, /prefers-reduced-motion:[^}]*reduce/s);
});

test('pointer glow is requestAnimationFrame-driven and opt-in', () => {
  assert.match(os, /function installPointerGlow\(/);
  assert.match(os, /requestAnimationFrame/);
  assert.match(os, /--az-pointer-x/);
  assert.match(os, /setAttribute\('data-az-glow'/);
  assert.match(components, /\.az-pointer-glow/);
  assert.match(os, /matches\(':hover'\)/, 'stale rAF frame must not re-glow a card the pointer left');
});

test('empty and error states remain actionable and use canonical surfaces', () => {
  assert.match(components, /\.az-empty-state[^}]*min-height/);
  assert.match(components, /\.az-error-page[^}]*background:/);
  for (const page of errors) {
    assert.match(page, /az-error-page/);
    assert.match(page, /az-button az-button-primary/);
    assert.match(page, /href="\/"/);
  }
});

test('coarse-pointer controls retain the 44px interaction floor', () => {
  assert.match(components, /@media \(pointer:coarse\)[\s\S]*min-height:\s*44px/);
  assert.match(base, /overflow-x:\s*hidden/);
});
