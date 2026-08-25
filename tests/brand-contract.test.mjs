import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const registry = read('frontend/js/v3/registry.js');
const platform = read('frontend/js/v3/brand-platform.js');
const hubs = read('frontend/js/v3/apps/brand-hubs.js');
const manifest = read('frontend/manifest.webmanifest');

const canonicalIcons = [
  'aizanoi-news.svg',
  'aizanoi-tv.svg',
  'aizanoi-dashboards.svg',
  'aizanoi-worlds.svg',
  'aizanoi-forge.svg',
  'aizanoi-journal.svg',
  'aizanoi-labs.svg',
  'aizanoi-arcade.svg'
];
const retiredCatalogIconNames = [
  'source-reader.svg', 'data-lab.svg', 'ancient-world.svg', 'projects.svg',
  'notepad.svg', 'workspace-monitor.svg', 'games.svg'
];
const removedWorkbenchIcons = [
  'artifact-viewer.svg', 'data-lab.svg', 'field-archive.svg', 'games.svg', 'notepad.svg',
  'projects.svg', 'recycle-bin.svg', 'source-reader.svg', 'terminal.svg', 'workspace-monitor.svg'
];

test('AizanoiOS keeps analytics as compatibility id while presenting Dashboards to users', () => {
  assert.match(registry, /id:'analytics', label:'Dashboards', short:'Dashboards'/);
  assert.match(registry, /keywords:\['analytics','dashboard','dashboards'/);
  assert.match(hubs, /shell\('Dashboards','Data products, comparisons & utilities'/);
  assert.match(platform, /data-context-action="analytics">Dashboards</);
  assert.doesNotMatch(registry, /id:'analytics', label:'Aizanoi Analytics'/);
});

test('active product catalog uses canonical Aizanoi icon assets rather than retired Workbench filenames', () => {
  for (const icon of canonicalIcons) {
    assert.ok(existsSync(`frontend/assets/icons/${icon}`), `${icon} missing`);
    assert.match(registry + manifest, new RegExp(icon.replace('.', '\\.')));
  }
  for (const legacy of retiredCatalogIconNames) {
    assert.doesNotMatch(registry + manifest, new RegExp(legacy.replace('.', '\\.')));
  }
});

test('retired Workbench icon files remain removed from the public asset tree', () => {
  for (const icon of removedWorkbenchIcons) {
    assert.equal(existsSync(`frontend/assets/icons/${icon}`), false, `${icon} should remain retired`);
  }
});

test('adaptive shell presents Aizanoi Analytics as the primary brand', () => {
  assert.match(platform, /<h1>Aizanoi Analytics<\/h1>/);
  assert.match(platform, /TODAY AT AIZANOI ANALYTICS/);
  assert.match(platform, /Aizanoi Analytics apps/);
  assert.match(hubs, /built by Aizanoi Analytics/);
});
