import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const chat = read('frontend/js/chat.js');
const router = read('frontend/js/os-router.js');
const sw = read('frontend/service-worker.js');
const polish = read('frontend/js/os-product-polish.js');

test('retired Aizanoi AI surfaces are removed before and after shell mount', () => {
  assert.match(chat, /function retireAizanoiAiSurfaces/);
  assert.match(chat, /\[data-app="chatbot"\]/);
  assert.match(chat, /\.az-command-result/);
  assert.match(chat, /MutationObserver/);
  assert.match(chat, /appId === 'chatbot'/);
  assert.doesNotMatch(chat, /fetch\s*\(/);
});

test('retired HR route cannot reopen the chatbot app', () => {
  assert.doesNotMatch(router, /['"]hr-analytics['"]\s*:\s*['"]chatbot['"]/);
  assert.doesNotMatch(router, /chatbot\s*:\s*['"]hr-analytics['"]/);
  assert.match(router, /slug === 'hr-analytics'/);
  assert.match(router, /appId === 'chatbot'/);
});

test('legacy polish remains a second fail-closed UI layer', () => {
  assert.match(polish, /removeLegacyAiEntrypoints/);
  assert.match(polish, /\[data-app="chatbot"\]/);
});

test('service worker cache rolls after the retired surface fix', () => {
  assert.match(sw, /aizanoi-field-shell-v2\.1\.3/);
  assert.match(sw, /key\.startsWith\('aizanoi-field-shell-'\)/);
});
