import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

test('analytics hub ships a complete static catalog including Tableau', () => {
  const html = read('frontend/analytics/index.html');
  assert.doesNotMatch(html, /Loading the canonical public product catalog/);
  for (const href of ['/analytics/markets/', '/analytics/dashboards/new-hr-collection/', '/analytics/tableau/']) {
    assert.ok(html.includes(`href="${href}"`), `static catalog must link ${href}`);
  }
  assert.match(html, /Tableau Extensions/);
});

test('analytics app.js enhances without losing the static catalog on failure', () => {
  const js = read('frontend/analytics/app.js');
  assert.match(js, /try\s*\{/);
  assert.match(js, /catch\s*\(/);
});

test('tableau catalog: no typo, no white-on-white CTA, honest validation claims', () => {
  const html = read('frontend/analytics/tableau/index.html');
  const css = read('frontend/analytics/tableau/catalog.css');
  assert.doesNotMatch(html, /TABLET/);
  assert.match(html, /TABLEAU DASHBOARD EXTENSION/);
  assert.doesNotMatch(html, /verified against 2023\.1/i);
  assert.match(html, /not yet confirmed/i);
  assert.match(css, /\.analytics-section \.analytics-btn-ghost\{[^}]*color:#1d4ed8/);
  assert.match(css, /\.analytics-section \.analytics-btn\{[^}]*background:var\(--blue\)/);
  assert.match(html, /property="og:image"/);
});

test('new HR collection hub declares English', () => {
  assert.match(read('frontend/analytics/dashboards/new-hr-collection/index.html'), /<html lang="en">/);
});
