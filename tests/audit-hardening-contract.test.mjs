import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const architecture = read('ARCHITECTURE.md');
const policy = read('CONTENT_POLICY.md');
const hermes = read('docs/HERMES_OPERATIONS.md');
const experience = read('frontend/ancient-world/engine/city-experience.js');
const sw = read('frontend/service-worker.js');

test('audit hardening keeps News v2 and deployment contracts documented together', () => {
  assert.match(architecture, /permanent article pages/);
  assert.match(architecture, /\/news\/sitemap\.xml/);
  assert.match(policy, /AI-assisted production/);
  assert.match(policy, /priority/);
  assert.match(hermes, /permanent article pages/);
  assert.match(hermes, /node scripts\/news\/build-news\.mjs/);
});

test('historical world public controls do not advertise dormant legacy behavior', () => {
  assert.match(experience, /settingsBtn','viewSettings','mobileLabels/);
  assert.match(experience, /aria-hidden/);
  assert.match(experience, /era301\.remove/);
  assert.doesNotMatch(experience, /DRAG fallback|L labels/);
});

test('service worker upgrade policy avoids automatic skipWaiting', () => {
  const installBlock = sw.match(/self\.addEventListener\('install',[\s\S]*?\n\}\);/)?.[0] || '';
  assert.doesNotMatch(installBlock, /skipWaiting/);
  assert.match(architecture, /updates do not call `skipWaiting\(\)` automatically/);
});
