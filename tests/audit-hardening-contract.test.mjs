import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const architecture = read('ARCHITECTURE.md');
const policy = read('CONTENT_POLICY.md');
const hermes = read('docs/HERMES_OPERATIONS.md');
const experience = read('frontend/worlds/shared/engine/ui.js');
const sw = read('frontend/service-worker.js');
const shellEntry = read('frontend/js/v3/main.js');
const worldsEntry = read('frontend/js/worlds-entry-net.js');

test('audit hardening keeps News v2 and deployment contracts documented together', () => {
  assert.match(architecture, /permanent article pages/);
  assert.match(architecture, /\/news\/sitemap\.xml/);
  assert.match(policy, /AI-assisted publishing/);
  assert.match(policy, /AI-assisted tools may support source discovery, drafting and production/);
  assert.match(policy, /priority/);
  assert.match(hermes, /permanent article pages/);
  assert.match(hermes, /node scripts\/news\/build-news\.mjs/);
});

test('world UI exposes evidence and sources without retired legacy controls', () => {
  assert.match(experience, /Sources & Reconstruction Notes/);
  assert.match(experience, /toggleEvidence/);
  assert.doesNotMatch(experience, /era301|Field System|DRAG fallback/);
});

test('service worker upgrade policy force-activates complete releases', () => {
  assert.match(sw, /const MAX_RUNTIME_ENTRIES\s*=\s*128/);
  assert.match(sw, /new Request\(url,\{cache:'reload'\}\)/);
  assert.match(sw, /self\.addEventListener\('install',\s*\(event\)\s*=>\s*event\.waitUntil\(precacheShell\(\)\.then\(\(\)\s*=>\s*self\.skipWaiting\(\)\)\)\);/);
  assert.match(sw, /self\.addEventListener\('activate',[\s\S]*?self\.clients\.claim\(\)/);
  assert.match(architecture, /non-core runtime entries are capped at `128`/);
  assert.match(architecture, /install calls `skipWaiting\(\)` only after the complete precache succeeds/);
  assert.match(architecture, /activate calls `clients\.claim\(\)`/);
  assert.match(architecture, /`updateViaCache: 'none'`/);
  assert.match(shellEntry, /serviceWorker\.register\('\/service-worker\.js',\{scope:'\/',updateViaCache:'none'\}\)/);
  assert.match(worldsEntry, /serviceWorker\.register\('\/service-worker\.js', \{ scope: '\/', updateViaCache: 'none' \}\)/);
});
