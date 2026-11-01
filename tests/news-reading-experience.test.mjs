import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const daily = read('frontend/news/2026-10-11/index.html');
const weekly = read('frontend/news/weekly/2026-09-07/index.html');
const story = read('frontend/news/2026-10-11/telecom-selloff-spacex-spectrum-deal/index.html');
const css = read('frontend/news/news.css');

test('news pages expose a skip link and a focusable main landmark', () => {
  for (const html of [daily, weekly, story, read('frontend/news/index.html'), read('frontend/news/about/index.html')]) {
    assert.match(html, /<a class="skip-link" href="#main">/);
    assert.match(html, /<main id="main" tabindex="-1"/);
  }
});

test('editions link to previous, next and latest editions', () => {
  assert.match(daily, /rel="prev" href="\/news\/2026-10-10\/"/);
  assert.match(daily, /rel="next" href="\/news\/2026-10-12\/"/);
  assert.match(daily, /class="edition-latest" href="\/news\/"/);
  assert.match(weekly, /rel="prev" href="\/news\/weekly\/2026-08-31\/"/);
  assert.match(weekly, /class="edition-latest" href="\/news\/weekly\/2026-10-26\/"/);
  assert.match(story, /aria-label="More from this edition"/);
});

test('weekly edition states its real date range instead of "week ending today"', () => {
  assert.doesNotMatch(weekly, /week ending today/);
  assert.match(weekly, /published Monday, 7 September 2026\. Sources dated /);
});

test('story cards show category, date and source links with 44px touch targets', () => {
  assert.match(daily, /<div class="card-meta"><p class="kicker">[^<]+<\/p><time datetime="[^"]+">\d{4}-\d{2}-\d{2}<\/time>/);
  assert.match(css, /\.source-line a,\.article-sources a\{[^}]*min-height:44px/);
});

test('news css supports dark mode, focus-visible and print', () => {
  assert.match(css, /prefers-color-scheme:dark/);
  assert.match(css, /a:focus-visible/);
  assert.match(css, /@media print/);
});
