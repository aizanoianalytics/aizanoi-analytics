import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const sitemap = read('frontend/sitemap.xml');
const nginx = read('infra/nginx/aizanoianalytics.com.conf.example');
const infra = read('infra/README.md');

const canonical = [
  '/', '/news/', '/tv/', '/analytics/', '/worlds/', '/forge/', '/journal/', '/labs/', '/arcade/',
  '/historic-world/', '/ancient-cities/rome-410-476/', '/ancient-cities/athens-450-430/'
];

test('sitemap reflects only the canonical product and Historical Worlds architecture', () => {
  const urls = [...sitemap.matchAll(/<url>\s*<loc>https:\/\/aizanoianalytics\.com([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)]
    .map(([, path, lastmod]) => ({ path, lastmod }));
  assert.deepEqual(urls.map(({ path }) => path), canonical);
  for (const { lastmod } of urls) assert.match(lastmod, /^\d{4}-\d{2}-\d{2}$/);
  assert.doesNotMatch(sitemap, /\/(?:projects|videos|games|ancient-world|about|docs|changelog|privacy|terms)\//);
  assert.doesNotMatch(sitemap, /<changefreq>|<priority>/);
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
  assert.match(nginx, /location \^~ \/ancient-cities\/[\s\S]*include snippets\/aizanoi-historical-world-security-headers\.conf;/);
  assert.match(nginx, /location \^~ \/historic-world\/[\s\S]*include snippets\/aizanoi-historical-world-security-headers\.conf;/);
  assert.doesNotMatch(nginx, /script-src[^;\n]*unsafe-inline/);
});
