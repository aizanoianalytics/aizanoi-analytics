import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const architecture = read('ARCHITECTURE.md');
const policy = read('CONTENT_POLICY.md');
const hermes = read('docs/HERMES_OPERATIONS.md');
const experience = read('frontend/worlds/shared/engine/ui.js');
const sw = read('frontend/service-worker.js');

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

test('service worker upgrade policy avoids automatic skipWaiting', () => {
  const installBlock = sw.match(/self\.addEventListener\('install',[\s\S]*?\n\}\);/)?.[0] || '';
  assert.doesNotMatch(installBlock, /skipWaiting/);
  assert.match(architecture, /updates do not call `skipWaiting\(\)` automatically/);
});
