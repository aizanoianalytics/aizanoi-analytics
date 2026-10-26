import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('Markets lazy stylesheet scopes every document-level selector to its own root', () => {
  const css = read('frontend/analytics/markets/markets.css');
  for (const bare of [/^:root\s*\{/m, /^\*\s*\{/, /^html, body\s*\{/m, /^body\s*\{/m, /^a\s*\{/m, /^main\s*\{/m, /^h1\s*\{/m, /^h2\s*\{/m, /^button, input, select\s*\{/m, /^\.method\s*\{/m, /^\.method a\s*\{/m, /^\.eyebrow\s*\{/m, /^\.visually-hidden\s*\{/m, /^h1 span\s*\{/m]) {
    assert.doesNotMatch(css, bare, 'a bare document selector leaks into the OS shell when Markets mounts');
  }
  assert.match(css, /body:has\(> \.market-head\)/, 'standalone Markets pages keep their document styling');
  assert.match(css, /\.market-product/, 'the mounted OS dashboard root keeps its styling');
});

test('Labs video fallback honors hidden and reports loading, failure and retry', () => {
  const app = read('frontend/js/v3/apps/labs/src/app.js');
  const css = read('frontend/styles/apps.css');
  assert.match(css, /\.az-labs-video-empty\[hidden\][\s\S]*?display:none/, 'author display:grid must not override the hidden attribute');
  assert.match(app, /data-video-retry/, 'a failed video must offer an explicit retry control');
  assert.match(app, /Loading · MP4/, 'an unready video must not claim to be attached');
  assert.match(app, /Unavailable · MP4/, 'a failed video must say so in its status');
  assert.match(app, /Ready · MP4/, 'a loaded video must confirm readiness');
  assert.match(app, /video\.load\(\)/, 'retry must reload the media element');
  assert.match(app, /mediaCleanup/, 'media listeners must be released on unmount');
});

test('simple-card headings wrap unbroken identifiers instead of overflowing', () => {
  const css = read('frontend/styles/apps.css');
  assert.match(css, /\.az-simple-card h3 [\s\S]*?overflow-wrap:anywhere/, 'long identifiers must wrap inside their card');
  assert.match(read('frontend/js/v3/apps/forge/src/app.js'), /aizanoianalytics\/aizanoi-analytics/, 'the literal repository name is preserved');
});
