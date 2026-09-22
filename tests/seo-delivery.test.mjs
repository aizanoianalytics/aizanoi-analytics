import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const sitemap = read('frontend/sitemap.xml');
const feed = JSON.parse(read('frontend/news/index.json'));
const robots = read('frontend/robots.txt');
const nginx = read('infra/nginx/aizanoianalytics.com.conf.example');
const infra = read('infra/README.md');

const itemDate = (item) => item.publishedAt.slice(0, 10);
const storySlug = (item) => item.id.startsWith(`${itemDate(item)}-`) ? item.id.slice(11) : item.id;
const storyPath = (item) => `/news/${item.kind === 'weekly' ? 'weekly/' : ''}${itemDate(item)}/${storySlug(item)}/`;
const canonicalBase = [
  '/', '/news/', '/news/about/', '/privacy/', '/tv/', '/analytics/', '/analytics/markets/', '/analytics/dashboards/hr-analytics-full-set/',
  '/analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/',
  '/analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/',
  '/analytics/dashboards/hr-analytics-full-set/hr-administration-deep-dive/',
  '/analytics/dashboards/hr-analytics-full-set/store-operations-tracking/',
  '/analytics/dashboards/hr-analytics-full-set/store-learning-compliance/',
  '/analytics/dashboards/hr-analytics-full-set/learning-academy-analytics/',
  '/analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/',
  '/analytics/dashboards/hr-analytics-full-set/corporate-goals/',
  '/analytics/dashboards/hr-analytics-full-set/workforce-time-attendance/',
  '/analytics/dashboards/hr-analytics-full-set/workforce-turnover/',
  '/analytics/dashboards/new-hr-collection/',
  '/analytics/dashboards/new-hr-collection/pacs/',
  '/analytics/dashboards/new-hr-collection/recruitment-analytics/',
  '/worlds/', '/forge/', '/journal/', '/labs/', '/arcade/',
  '/worlds/aizanoi-225/', '/worlds/rome-410-476/', '/worlds/athens-450-430/', '/worlds/iga-airport/'
];
const canonical = [
  ...canonicalBase,
  ...(feed.weeklyEditions || []).map((edition) => edition.path),
  ...feed.editions.map((edition) => edition.path),
  ...feed.items.map(storyPath),
  ...feed.categories.map((slug) => `/news/category/${slug}/`)
];

test('New HR collection exposes parseable CollectionPage JSON-LD', () => {
  const html = read('frontend/analytics/dashboards/new-hr-collection/index.html');
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(raw, 'Collection page must include JSON-LD');
  const jsonLd = JSON.parse(raw);
  assert.equal(jsonLd['@context'], 'https://schema.org');
  assert.equal(jsonLd['@type'], 'CollectionPage');
});

test('targeted public and internal pages expose the intended metadata boundary', () => {
  const dungeon = read('frontend/dungeon/index.html');
  const preview = read('frontend/web-editor-preview/index.html');
  const pacs = read('frontend/analytics/dashboards/new-hr-collection/pacs/index.html');
  const recruitment = read('frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html');

  assert.match(dungeon, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover">/);
  assert.doesNotMatch(dungeon, /(?:maximum-scale|user-scalable)\s*=/i);
  assert.match(dungeon, /<meta name="description" content="[^"]+">/);
  assert.match(dungeon, /<link rel="canonical" href="https:\/\/aizanoianalytics\.com\/dungeon\/">/);

  assert.match(pacs, /<meta name="description" content="[^"]+">/);
  assert.match(pacs, /<link rel="canonical" href="https:\/\/aizanoianalytics\.com\/analytics\/dashboards\/new-hr-collection\/pacs\/">/);
  for (const property of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image']) {
    assert.match(pacs, new RegExp(`<meta property="${property}" content="[^"]+">`));
  }

  assert.match(recruitment, /<link rel="canonical" href="https:\/\/aizanoianalytics\.com\/analytics\/dashboards\/new-hr-collection\/recruitment-analytics\/">/);

  assert.match(preview, /<meta name="robots" content="noindex,nofollow">/);
  assert.doesNotMatch(preview, /<link rel="canonical"/i);
  assert.doesNotMatch(preview, /<meta property="og:/i);
});

test('sitemap reflects canonical products, privacy, Historical Worlds and generated News discovery routes', () => {
  const urls = [...sitemap.matchAll(/<url>\s*<loc>https:\/\/aizanoianalytics\.com([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)]
    .map(([, path, lastmod]) => ({ path, lastmod }));
  assert.deepEqual(urls.map(({ path }) => path), canonical);
  for (const { lastmod } of urls) assert.match(lastmod, /^\d{4}-\d{2}-\d{2}$/);
  for (const edition of feed.editions) assert.ok(urls.some(({ path }) => path === edition.path), `${edition.path} missing from sitemap`);
  for (const item of feed.items) assert.ok(urls.some(({ path }) => path === storyPath(item)), `${item.id} permanent story route missing from sitemap`);
  for (const slug of feed.categories) assert.ok(urls.some(({ path }) => path === `/news/category/${slug}/`), `${slug} category missing from sitemap`);
  assert.ok(urls.some(({ path }) => path === '/privacy/'), 'privacy route missing from sitemap');
  assert.doesNotMatch(sitemap, /\/(?:projects|videos|games|ancient-world|docs|changelog|terms)\//);
  assert.doesNotMatch(sitemap, /<changefreq>|<priority>/);
});

test('robots advertises both general and dedicated News sitemaps', () => {
  assert.match(robots, /Sitemap: https:\/\/aizanoianalytics\.com\/sitemap\.xml/);
  assert.match(robots, /Sitemap: https:\/\/aizanoianalytics\.com\/news\/sitemap\.xml/);
});

test('legacy product paths permanently redirect to canonical landings', () => {
  for (const [from, to] of [['videos','tv'], ['games','arcade'], ['projects','forge']]) {
    assert.match(nginx, new RegExp(`location = /${from} \\{ return 301 /${to}/; \\}`));
    assert.match(nginx, new RegExp(`location = /${from}/ \\{ return 301 /${to}/; \\}`));
    assert.match(infra, new RegExp(`/${from}.*→.*?/${to}`, 'i'));
  }
});

test('static delivery shares hardened headers and compresses web asset MIME types', () => {
  assert.match(nginx, /include snippets\/aizanoi-static-security-headers\.conf;/);
  assert.match(nginx, /gzip_types[^;]*application\/javascript[^;]*text\/css[^;]*application\/json[^;]*image\/svg\+xml;/s);
  assert.match(nginx, /location \^~ \/worlds\/aizanoi-225\/[\s\S]*include snippets\/aizanoi-historical-world-security-headers\.conf;/);
  assert.match(nginx, /location \^~ \/worlds\/shared\/[\s\S]*include snippets\/aizanoi-historical-world-security-headers\.conf;/);
  assert.doesNotMatch(nginx, /script-src[^;\n]*unsafe-inline/);
});
