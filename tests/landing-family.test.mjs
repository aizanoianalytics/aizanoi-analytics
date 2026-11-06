import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(f, 'utf8');
const pages = { tv: '/tv/', journal: '/journal/', labs: '/labs/', forge: '/forge/', worlds: '/worlds/', arcade: '/arcade/' };

test('landing pages share skip link, tokens, current-page nav, main target and privacy link', () => {
  for (const [dir, route] of [...Object.entries(pages), ['privacy', '/privacy/']]) {
    const html = read(`frontend/${dir}/index.html`);
    assert.match(html, /<a class="skip-link" href="#main">Skip to content<\/a>/, dir);
    assert.match(html, /<main id="main" tabindex="-1">/, dir);
    assert.ok(html.indexOf('/styles/tokens.css') > 0 && html.indexOf('/styles/tokens.css') < html.indexOf('/styles/landing.css'), dir);
    assert.match(html, /<h1>/, dir);
    assert.match(html, /href="\/privacy\/"/, dir);
    assert.match(html, /https:\/\/aizanoianalytics\.com\/assets\/branding\/aizanoi-og\.png/, dir);
    if (dir !== 'privacy') {
      assert.equal((html.match(/aria-current="page"/g) || []).length, 1, `${dir} nav marks exactly one current page`);
      assert.match(html, new RegExp(`<a href="${route}" aria-current="page">`), dir);
    }
  }
});

test('Arcade is English and its share metadata matches the fourteen-experience catalog', () => {
  const html = read('frontend/arcade/index.html');
  assert.doesNotMatch(html, /Hemen Oyna|Uyanışı|Antik|mahzen/);
  assert.match(html, /Aizanoi Dungeon: Aizo’s Awakening/);
  for (const m of html.match(/<meta (?:property="og:description"|name="twitter:description"|name="description") content="[^"]*"/g)) {
    assert.doesNotMatch(m, /\bfour\b/i, m);
    assert.match(m, /[Ff]ourteen/, m);
  }
  for (const game of ['Sudoku', 'Signal Snake', 'Survey Mines', 'Strata Breaker', 'Blockfall']) assert.match(html, new RegExp(`aria-label="Play ${game} in the AizanoiOS Arcade"`));
});

test('error pages expose an h1 and no h3', () => {
  for (const f of ['404', '500', '503']) {
    const html = read(`frontend/${f}.html`);
    assert.match(html, /<h1>/);
    assert.doesNotMatch(html, /<h3>/);
  }
});

test('release badge script is CSP-safe and reads AIZANOI_RELEASE', () => {
  const js = read('frontend/forge/release-badge.js');
  assert.match(js, /AIZANOI_RELEASE/);
  assert.doesNotMatch(js, /eval\(|new Function|innerHTML/);
});

test('Forge build label identifies the served AizanoiOS release and links commits', () => {
  const html = read('frontend/forge/index.html');
  assert.match(html, /exact commit/);
  assert.match(html, /commits\/main/);
  const js = read('frontend/forge/release-badge.js');
  assert.match(js, /exact commit/);
});

test('TV episode catalog is dated, playable and honestly sourced', () => {
  const html = read('frontend/tv/index.html');
  assert.match(html, /id="boeing"/);
  assert.match(html, /watch\?v=28O9FbRGCBY/);
  assert.match(html, /<time datetime="2026-11-01">1 November 2026<\/time>/);
  assert.match(html, /watch\?v=8O9TK08sI_w/);
  assert.match(html, /<time datetime="2026-10-28">28 October 2026<\/time>/);
  assert.match(html, /NTSB/);
  assert.match(html, /portseattle\.org/);
  assert.doesNotMatch(html, /independent reporting/);
  assert.match(html, /not presented as on-location field reporting/);
});

test('Analytics shell buttons stay single-line on narrow cards', () => {
  const css = read('frontend/styles/landing.css');
  assert.doesNotMatch(css, /--az-accent\s*:/);
  assert.match(css, /forced-colors/);
  assert.match(css, /white-space: nowrap/);
});

test('landing.css is token-based and scoped to the landing body', () => {
  const css = read('frontend/styles/landing.css');
  assert.doesNotMatch(css, /--az-accent\s*:/);
  assert.match(css, /\.skip-link/);
  assert.match(css, /prefers-reduced-motion/);
  assert.ok(css.split('\n').length > 80, 'stylesheet must stay readable, not minified');
});

test('Labs prototype card does not pose as a launchable item', () => {
  const html = read('frontend/labs/index.html');
  assert.match(html, /Nothing to launch yet/);
});
