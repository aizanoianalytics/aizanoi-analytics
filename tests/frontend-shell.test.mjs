import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const index = readFileSync(resolve(root, 'frontend/index.html'), 'utf8');

function inlineScripts(html) {
  const scripts = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) scripts.push(match[1]);
  return scripts;
}

test('frontend shell inline scripts remain syntactically valid', () => {
  const scripts = inlineScripts(index);
  assert.ok(scripts.length >= 2, 'expected multiple inline scripts in the SPA shell');
  scripts.forEach((source, i) => {
    assert.doesNotThrow(() => new vm.Script(source, { filename: `index-inline-${i + 1}.js` }));
  });
});

test('removed Market app is not exposed by frontend registries', () => {
  assert.doesNotMatch(index, /market:\s*['"]\/icons\/Run\.png/);
  assert.doesNotMatch(index, /['"]market['"]\s*:\s*['"]market['"]/);
});

test('Aizanoi historical copy uses current UNESCO tentative-list status', () => {
  assert.match(index, /UNESCO World Heritage Tentative List since 2012/);
  assert.doesNotMatch(index, /World Heritage List in 2025/);
});

test('Control Panel launcher opens the Control Panel app', () => {
  assert.match(index, /a === ['"]control['"]\) openApp\(['"]control['"]\)/);
});

test('boot has an independent escape hatch before the main application scripts', () => {
  assert.match(index, /__aizanoiBootEscape/);
  assert.match(index, /desktop\.style\.visibility = ['"]visible['"]/);
});

test('window controls and Start menu expose basic keyboard semantics', () => {
  assert.match(index, /aria-label="Minimize window"/);
  assert.match(index, /aria-label="Maximize or restore window"/);
  assert.match(index, /aria-label="Close window"/);
  assert.match(index, /Open Start menu/);
});

test('Aizanoi TV is exposed in the desktop app registry', () => {
  assert.match(index, /id:\s*['"]videos['"],\s*label:\s*['"]Aizanoi TV['"]/);
  assert.match(index, /aizanoi-tv\.svg/);
});

test('known orphaned dropdown CSS block does not reappear', () => {
  assert.doesNotMatch(index, /}\s*background:\s*#fff;\s*border:\s*2px solid #6f9bdc;\s*box-shadow:[\s\S]{0,180}?z-index:\s*5000;/);
});
