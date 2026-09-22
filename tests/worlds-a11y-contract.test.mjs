import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const worlds = ['aizanoi-225', 'athens-450-430', 'rome-410-476', 'iga-airport'];
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('all Historical Worlds intro dialogs have accessible names and labelled teleport search', () => {
  for (const slug of worlds) {
    const html = read(`frontend/worlds/${slug}/index.html`);
    assert.match(
      html,
      /<div id="intro-modal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="intro-title"/,
      `${slug}: intro dialog is missing its accessible name`,
    );
    assert.match(html, /<h1 id="intro-title"/, `${slug}: intro title id is missing`);
    assert.match(html, /<label class="sr-only" for="teleport-search">/, `${slug}: teleport search label is missing`);
    assert.match(html, /id="teleport-search"[^>]*aria-label="Search fast travel locations"/, `${slug}: teleport search aria-label is missing`);
  }
});

test('Historical Worlds toggle controls expose an initial pressed state', () => {
  const toggleDefaults = {
    'btn-tour': 'false',
    'btn-map': 'true',
    'btn-mobile-map': 'true',
    'btn-audio': 'false',
    'btn-evidence': 'false',
    'btn-daynight': 'false',
  };

  for (const slug of worlds) {
    const html = read(`frontend/worlds/${slug}/index.html`);
    for (const [id, value] of Object.entries(toggleDefaults)) {
      assert.match(html, new RegExp(`id="${id}"[^>]*aria-pressed="${value}"`), `${slug}: ${id} lacks aria-pressed=${value}`);
    }
    assert.match(html, /id="btn-teleport"[^>]*aria-controls="teleport-menu"[^>]*aria-expanded="false"/);
  }
});

test('shared world UI owns modal focus, inert background, keyboard trap and teleport buttons', () => {
  const ui = read('frontend/worlds/shared/engine/ui.js');
  assert.match(ui, /this\._modalStates = new Map\(\)/);
  assert.match(ui, /state\.opener = opener/);
  assert.match(ui, /node\.inert = true/);
  assert.match(ui, /_restoreBackgroundInert/);
  assert.match(ui, /e\.key === 'Tab'/);
  assert.match(ui, /e\.code === 'Escape'/);
  assert.match(ui, /this\.closeModal\(this\._activeModal\)/);
  assert.match(ui, /first\.focus\(\{ preventScroll: true \}\)/);
  assert.match(ui, /last\.focus\(\{ preventScroll: true \}\)/);
  assert.match(ui, /document\.activeElement === opener/);
  assert.match(ui, /button\.type = 'button'/);
  assert.match(ui, /button\.className = 'teleport-item'/);
});

test('each world routes intro and modal triggers through the shared accessibility lifecycle', () => {
  for (const slug of worlds) {
    const main = read(`frontend/worlds/${slug}/js/main.js`);
    assert.match(main, /ui\.openModal\('intro-modal', null, document\.getElementById\('btn-enter'\)\)/, `${slug}: intro does not use shared modal opening`);
    assert.match(main, /ui\.closeModal\(introModal\)/, `${slug}: intro does not use shared modal closing`);
    assert.match(main, /ui\.toggleTeleportMenu\(e\.currentTarget\)/, `${slug}: teleport opener is not recorded`);
    assert.match(main, /ui\.showSourcesModal\(e\.currentTarget\)/, `${slug}: sources opener is not recorded`);
  }
});

test('teleport button styling preserves the world HUD appearance while exposing focus', () => {
  const css = read('frontend/worlds/shared/css/base-theme.css');
  assert.match(css, /\.teleport-item[\s\S]*?font: inherit/);
  assert.match(css, /\.teleport-item:focus-visible[\s\S]*?outline: 2px solid var\(--gold\)/);
});
