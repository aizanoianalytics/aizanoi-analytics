import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const privacy = readFileSync('frontend/privacy/index.html', 'utf8');
const camera = readFileSync('frontend/js/v3/apps/camera/src/app.js', 'utf8');
const workspaceBackup = readFileSync('frontend/js/v3/workspace/backup.js', 'utf8');
const workspaceFs = readFileSync('frontend/js/v3/workspace/fs.js', 'utf8');
const browserApp = readFileSync('frontend/js/v3/apps/browser/src/app.js', 'utf8');

test('public privacy route is indexable, canonical and uses published local assets only', () => {
  assert.match(privacy, /<link rel="canonical" href="https:\/\/aizanoianalytics\.com\/privacy\/">/);
  assert.match(privacy, /name="robots" content="index,follow/);
  assert.match(privacy, /\/styles\/landing\.css/);
  assert.doesNotMatch(privacy, /href="\/security\/"/);
  assert.doesNotMatch(privacy, /(?:google-analytics|googletagmanager|segment\.com|plausible\.io|mixpanel)/i);
});

test('privacy Workspace disclosure matches IndexedDB backup and persistence implementation', () => {
  assert.match(privacy, /Workspace uses this site’s browser storage \(IndexedDB\)/);
  assert.match(privacy, /versioned backup\/export and restore/i);
  assert.match(privacy, /persistent storage is not a backup/i);
  assert.match(workspaceFs, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(workspaceBackup, /exportBackup/);
  assert.match(workspaceBackup, /importBackup/);
  assert.match(workspaceBackup, /navigator\.storage\?\.persist/);
});

test('privacy Camera disclosure matches photo-only permission implementation', () => {
  assert.match(privacy, /does not request microphone access/i);
  assert.match(camera, /getUserMedia\(\{video:\{facingMode:'user'\},audio:false\}\)/);
  assert.doesNotMatch(camera, /getUserMedia\(\{video:false,audio:true\}\)/);
  assert.match(camera, /filesystem\.createFile/);
});

test('privacy Browser disclosure matches direct non-proxied navigation contract', () => {
  assert.match(privacy, /does not use an Aizanoi proxy/i);
  assert.match(privacy, /requested directly by your browser/i);
  assert.match(browserApp, /Direct browser connection · no Aizanoi proxy/i);
  assert.doesNotMatch(browserApp, /proxy_pass|fetch\(.*https?:\/\//s);
});

test('privacy page does not invent a server-log retention duration or cloud sync', () => {
  assert.match(privacy, /does not define a production access-log retention period/i);
  assert.match(privacy, /no public Aizanoi account system/i);
  assert.doesNotMatch(privacy, /retained for \d+ (?:day|days|month|months|year|years)/i);
});
