import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const script = path.join(root, 'scripts/news/build-news.mjs');
const fixture = {
  id:'2026-08-22-sitemap-fixture',
  title:'A sitemap fixture validates News discovery publishing',
  summary:'This deliberately complete fixture gives the News build enough structured content to validate edition, permanent story and category discovery URLs without relying on production content.',
  category:'ai', priority:75,
  publishedAt:'2026-08-22T09:30:00Z',
  updatedAt:'2026-08-22T09:30:00Z',
  retrievedAt:'2026-08-22T10:00:00Z',
  author:{ name:'Aizanoi News Desk' },
  editor:{ name:'Aizanoi Editorial Desk' },
  corrections:[], tags:['test'],
  sources:[{ publisher:'Example Research Lab', url:'https://example.org/news', publishedAt:'2026-08-22T08:30:00Z' }]
};

async function project() {
  const dir = await mkdtemp(path.join(tmpdir(), 'aizanoi-news-sitemap-'));
  await mkdir(path.join(dir, 'scripts/news'), { recursive:true });
  await mkdir(path.join(dir, 'content/news/items'), { recursive:true });
  await cp(script, path.join(dir, 'scripts/news/build-news.mjs'));
  await writeFile(path.join(dir, 'content/news/items/item.json'), `${JSON.stringify(fixture, null, 2)}\n`);
  return dir;
}
function build(dir, env={}) {
  return spawnSync(process.execPath, ['scripts/news/build-news.mjs'], { cwd:dir, encoding:'utf8', env:{ ...process.env, ...env } });
}

test('News build publishes editions, permanent stories, methodology and categories into root sitemap', async () => {
  const dir = await project();
  const result = build(dir);
  assert.equal(result.status, 0, result.stderr);
  const sitemap = await readFile(path.join(dir, 'frontend/sitemap.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/aizanoianalytics\.com\/news\/2026-08-22\//);
  assert.match(sitemap, /https:\/\/aizanoianalytics\.com\/news\/2026-08-22\/sitemap-fixture\//);
  assert.match(sitemap, /https:\/\/aizanoianalytics\.com\/news\/about\//);
  for (const slug of ['ai','technology','economy-markets','football']) {
    assert.match(sitemap, new RegExp(`https:\\/\\/aizanoianalytics\\.com\\/news\\/category\\/${slug}\\/`));
  }
  assert.match(sitemap, /https:\/\/aizanoianalytics\.com\/analytics\//);
  assert.match(sitemap, /<lastmod>2026-08-22<\/lastmod>/);
});

test('dedicated News sitemap uses Google News namespace and permanent story URLs', async () => {
  const dir = await project();
  const result = build(dir);
  assert.equal(result.status, 0, result.stderr);
  const newsSitemap = await readFile(path.join(dir, 'frontend/news/sitemap.xml'), 'utf8');
  assert.match(newsSitemap, /xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/);
  assert.match(newsSitemap, /<loc>https:\/\/aizanoianalytics\.com\/news\/2026-08-22\/sitemap-fixture\/<\/loc>/);
  assert.match(newsSitemap, /<news:name>Aizanoi News<\/news:name>/);
  assert.match(newsSitemap, /<news:language>en<\/news:language>/);
  assert.match(newsSitemap, /<news:publication_date>2026-08-22T09:30:00\.000Z<\/news:publication_date>/);
  assert.match(newsSitemap, /<news:title>A sitemap fixture validates News discovery publishing<\/news:title>/);
});

test('failed staged News build preserves the previously published root and News sitemaps', async () => {
  const dir = await project();
  assert.equal(build(dir).status, 0);
  const sitemapPath = path.join(dir, 'frontend/sitemap.xml');
  const newsSitemapPath = path.join(dir, 'frontend/news/sitemap.xml');
  const before = await readFile(sitemapPath, 'utf8');
  const beforeNews = await readFile(newsSitemapPath, 'utf8');
  const failed = build(dir, { AIZANOI_NEWS_FAIL_AFTER_STAGE:'1' });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Injected failure after staged News validation/);
  assert.equal(await readFile(sitemapPath, 'utf8'), before);
  assert.equal(await readFile(newsSitemapPath, 'utf8'), beforeNews);
});
