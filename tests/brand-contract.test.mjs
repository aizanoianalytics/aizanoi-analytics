import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const registry = read('frontend/js/v3/registry.js');
const platform = read('frontend/js/v3/brand-platform.js');
const hubs = read('frontend/js/v3/apps/brand-hubs.js');
const analyticsApp = read('frontend/js/v3/apps/analytics/src/app.js');
const manifest = read('frontend/manifest.webmanifest');
const errorPages = ['frontend/404.html', 'frontend/500.html', 'frontend/503.html'].map(read).join('\n');
const historicalNavigation = read('frontend/ancient-world/engine/navigation.js');
const historicalExperience = read('frontend/ancient-world/engine/city-experience.js');

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

test('AizanoiOS keeps the stable analytics id while presenting Analytics to users', () => {
  assert.match(registry, /id:'analytics', label:'Analytics', short:'Analytics'/);
  assert.match(registry, /keywords:\['analytics','dashboard','dashboards'/);
  assert.match(analyticsApp, /shell\('Analytics', 'HR Analytics Full Set'/);
  assert.match(platform, /data-context-action="analytics">Analytics</);
  assert.doesNotMatch(registry, /id:'analytics', label:'Aizanoi Analytics'/);
});

test('Analytics app presents only the HR Analytics Full Set product', () => {
  assert.match(analyticsApp, /HR Analytics[\s\S]*Full Set/);
  assert.match(analyticsApp, /10[\s\S]*live dashboard surfaces/);
  assert.match(analyticsApp, /27[\s\S]*synthetic source workbooks/);
  assert.doesNotMatch(analyticsApp, /Workforce Turnover Analytics|PRODUCT STANDARD|DATA SAFETY/);
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
  assert.match(analyticsApp, /built by Aizanoi Analytics/);
});

test('device dates stay English regardless of browser locale', () => {
  assert.match(platform, /toLocaleDateString\('en-GB'/);
  assert.doesNotMatch(platform, /toLocaleDateString\(\[\]/);
});

test('public error and Historical Worlds navigation copy no longer exposes the retired Field System name', () => {
  const publicCopy = `${errorPages}\n${historicalNavigation}\n${historicalExperience}`;
  assert.doesNotMatch(publicCopy, /Field System/);
  assert.match(errorPages, /Aizanoi Analytics/);
  assert.match(historicalNavigation, /← AizanoiOS/);
  assert.match(historicalExperience, /Return to AizanoiOS/);
});
