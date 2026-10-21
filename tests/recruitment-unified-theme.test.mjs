import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html', 'utf8');

test('every recruitment view shares the Intern lavender design tokens', () => {
  assert.match(html, /--recruit-primary:\s*#6c5dd3/);
  assert.match(html, /--recruit-canvas:\s*#f7f5fc/);
  assert.match(html, /--recruit-card-radius:\s*18px/);
  assert.match(html, /body\s*\{[^}]*background:\s*var\(--recruit-canvas\)/s);
  assert.match(html, /\.app-header\s*\{[^}]*background:\s*var\(--recruit-surface\)/s);
});

test('navigation, filters, cards, KPIs and tables use one global theme', () => {
  assert.match(html, /\.nav-tab\.is-active\s*\{[^}]*background:\s*var\(--recruit-primary\)/s);
  assert.match(html, /\.filter-bar\s*\{[^}]*border-radius:\s*var\(--recruit-card-radius\)/s);
  assert.match(html, /\.card\s*\{[^}]*border-radius:\s*var\(--recruit-card-radius\)/s);
  assert.match(html, /\.kpi-card\s*\{[^}]*border-radius:\s*var\(--recruit-card-radius\)/s);
  assert.match(html, /table thead th\s*\{[^}]*background:\s*var\(--recruit-lavender\)/s);
  assert.match(html, /\.settings-list-panel\s*\{[^}]*border-radius:\s*14px/s);
});

test('the shared theme preserves semantic status colors and accessible focus', () => {
  assert.match(html, /--recruit-success:\s*#4cb050/);
  assert.match(html, /--recruit-warning:\s*#f7a531/);
  assert.match(html, /--recruit-danger:\s*#f05a4f/);
  assert.match(html, /:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--recruit-primary\)/s);
});

test('the shared muted tokens clear WCAG AA on every surface they sit on', () => {
  const luminance = (hex) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(parseInt(hex.slice(0, 2), 16)) + 0.7152 * f(parseInt(hex.slice(2, 4), 16)) + 0.0722 * f(parseInt(hex.slice(4, 6), 16));
  };
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const token = (name) => {
    const match = html.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `missing ${name} token`);
    return match[1];
  };
  const surfaces = ['#ffffff', '#f7f5fc', '#f4f1fe', '#ebe6fd'];
  for (const name of ['--slate-500', '--recruit-muted']) {
    const hex = token(name);
    for (const surface of surfaces) {
      const value = ratio(luminance(hex.slice(1)), luminance(surface.slice(1)));
      assert.ok(value >= 4.5, `${name} ${hex} on ${surface} is ${value.toFixed(2)}:1, needs >= 4.5`);
    }
  }
});
