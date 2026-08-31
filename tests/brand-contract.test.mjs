import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const registry = read('frontend/js/v3/registry.js');
const platform = read('frontend/js/v3/brand-platform.js');
const analyticsApp = read('frontend/js/v3/apps/analytics/src/app.js');
const analyticsCatalog = read('frontend/analytics/catalog.js');
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

test('AizanoiOS keeps the stable analytics id while presenting a scalable Analytics Sets catalog', () => {
  assert.match(registry, /id:'analytics', label:'Analytics', short:'Analytics'/);
  assert.match(registry, /keywords:\['analytics','dashboard','dashboards'/);
  assert.match(analyticsCatalog, /export const ANALYTICS_SETS/);
  assert.match(analyticsCatalog, /id:'hr-analytics-full-set'/);
  assert.match(analyticsApp, /data-analytics-set=/);
  assert.match(platform, /data-context-action="analytics">Analytics</);
  assert.doesNotMatch(registry, /id:'analytics', label:'Aizanoi Analytics'/);
});

test('Analytics Sets launches HR today and remains ready for future collections', () => {
  assert.match(analyticsCatalog, /HR Analytics[\s\S]*Full Set/);
  assert.match(analyticsCatalog, /10[\s\S]*live dashboard surfaces/);
  assert.match(analyticsCatalog, /27[\s\S]*synthetic source workbooks/);
  assert.match(analyticsApp, /More sets can land here/);
  assert.match(analyticsApp, /data-analytics-dashboard-inventory/);
  assert.match(analyticsCatalog, /Workforce Turnover Analytics/);
  assert.doesNotMatch(`${analyticsApp}\n${analyticsCatalog}`, /PRODUCT STANDARD|DATA SAFETY/);
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
  assert.equal(existsSync('frontend/assets/icons/aizanoi-recycle-bin.svg'), true, 'canonical Recycle Bin icon should exist');
});

test('adaptive shell presents Aizanoi Analytics as the primary brand', () => {
  assert.match(platform, /<h1>Aizanoi Analytics<\/h1>/);
  assert.match(platform, /TODAY AT AIZANOI ANALYTICS/);
  assert.match(platform, /Aizanoi Analytics apps/);
  assert.match(analyticsCatalog, /built by Aizanoi Analytics/);
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
