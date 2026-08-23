import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const script = path.join(root, 'scripts/news/build-news.mjs');
const brandHubsUrl = pathToFileURL(path.join(root, 'frontend/js/v3/apps/brand-hubs.js')).href;

const fixture = {
  id: '2026-08-22-model-release',
  title: 'A new model release shifts the open-weight frontier',
  summary: 'A research lab released model weights and a technical report, giving independent developers a new basis for testing efficiency, safety and practical deployment trade-offs.',
  category: 'ai',
  publishedAt: '2026-08-22T09:30:00Z',
  updatedAt: '2026-08-22T10:00:00Z',
  retrievedAt: '2026-08-22T11:00:00Z',
  author: { name: 'Aizanoi News Desk' },
  editor: { name: 'Mara Ellis' },
  corrections: [
    { note: 'Clarified that the release includes model weights.', correctedAt: '2026-08-22T10:00:00Z' }
  ],
  tags: ['models'],
  sources: [
    { publisher: 'Example Research Lab', url: 'https://example.org/research/model-release', publishedAt: '2026-08-22T08:45:00Z' }
  ]
};

async function projectWith(items = []) {
  const dir = await mkdtemp(path.join(tmpdir(), 'aizanoi-news-'));
  await mkdir(path.join(dir, 'scripts/news'), { recursive: true });
  await mkdir(path.join(dir, 'content/news/items'), { recursive: true });
  await cp(script, path.join(dir, 'scripts/news/build-news.mjs'));
  for (const [index, item] of items.entries()) {
    await writeFile(path.join(dir, `content/news/items/item-${index}.json`), `${JSON.stringify(item, null, 2)}\n`);
  }
  return dir;
}

function build(dir, env = {}) {
  return spawnSync(process.execPath, ['scripts/news/build-news.mjs'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

const read = (dir, file) => readFile(path.join(dir, file), 'utf8');

test('build emits deterministic edition, archive, category, feed and RSS artifacts', async () => {
  const dir = await projectWith([fixture]);
  const first = build(dir);
  assert.equal(first.status, 0, first.stderr);

  const files = [
    'frontend/content/news/index.json',
    'frontend/news/index.html',
    'frontend/news/2026-08-22/index.html',
    'frontend/news/category/ai/index.html',
    'frontend/news/rss.xml'
  ];
  const before = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await read(dir, file)])));
  const second = build(dir);
  assert.equal(second.status, 0, second.stderr);
  const after = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await read(dir, file)])));
  assert.deepEqual(after, before, 'unchanged inputs must produce byte-identical output');

  const feed = JSON.parse(before['frontend/content/news/index.json']);
  assert.equal(feed.schemaVersion, 2);
  assert.equal(feed.generatedAt, '2026-08-22T11:00:00.000Z');
  assert.deepEqual(feed.editions, [{ date: '2026-08-22', path: '/news/2026-08-22/', itemCount: 1 }]);
  assert.equal(feed.items[0].author.name, 'Aizanoi News Desk');
  assert.equal(feed.items[0].editor.name, 'Mara Ellis');
  assert.equal(feed.items[0].retrievedAt, '2026-08-22T11:00:00.000Z');
  assert.equal(feed.items[0].corrections[0].note, fixture.corrections[0].note);

  assert.match(before['frontend/news/index.html'], /The Daily Edition/);
  assert.match(before['frontend/news/index.html'], /2026-08-22/);
  assert.match(before['frontend/news/index.html'], /rel="canonical" href="https:\/\/aizanoianalytics\.com\/news\/"/);
  assert.match(before['frontend/news/index.html'], /property="og:title"/);
  assert.match(before['frontend/news/index.html'], /application\/ld\+json/);
  assert.match(before['frontend/news/2026-08-22/index.html'], /rel="canonical" href="https:\/\/aizanoianalytics\.com\/news\/2026-08-22\/"/);
  assert.match(before['frontend/news/2026-08-22/index.html'], /NewsArticle/);
  assert.match(before['frontend/news/2026-08-22/index.html'], /Example Research Lab/);
  assert.match(before['frontend/news/2026-08-22/index.html'], /id="2026-08-22-model-release"/);
  assert.match(before['frontend/news/category/ai/index.html'], /AI Archive/);
  assert.match(before['frontend/news/rss.xml'], /<rss version="2\.0"/);
  assert.match(before['frontend/news/rss.xml'], /https:\/\/example\.org\/research\/model-release/);
  assert.doesNotMatch(Object.values(before).join('\n'), /Hermes/i);
});

test('SOURCE_DATE_EPOCH controls generated metadata without changing item dates', async () => {
  const dir = await projectWith([fixture]);
  const result = build(dir, { SOURCE_DATE_EPOCH: '0' });
  assert.equal(result.status, 0, result.stderr);
  const feed = JSON.parse(await read(dir, 'frontend/content/news/index.json'));
  assert.equal(feed.generatedAt, '1970-01-01T00:00:00.000Z');
  assert.equal(feed.items[0].publishedAt, '2026-08-22T09:30:00.000Z');
  assert.match(await read(dir, 'frontend/news/rss.xml'), /Thu, 01 Jan 1970 00:00:00 GMT/);
});

test('validation rejects a source dated after it was retrieved', async () => {
  const invalid = structuredClone(fixture);
  invalid.sources[0].publishedAt = '2026-08-23T08:45:00Z';
  const dir = await projectWith([invalid]);
  const result = build(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source publication date cannot follow retrievedAt/);
});

test('validation rejects impossible source publication dates', async () => {
  const invalid = structuredClone(fixture);
  invalid.sources[0].publishedAt = '2026-02-30T08:45:00Z';
  const dir = await projectWith([invalid]);
  const result = build(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sources\[0\]\.publishedAt must be an ISO 8601 date-time/);
});

test('validation requires updatedAt to include the complete correction history', async () => {
  const invalid = structuredClone(fixture);
  invalid.corrections[0].correctedAt = '2026-08-22T10:30:00Z';
  const dir = await projectWith([invalid]);
  const result = build(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /correction time cannot follow updatedAt/);
});

test('News app presents the current edition feed and archive destination', async () => {
  const { renderNewsFeed } = await import(brandHubsUrl);
  const html = renderNewsFeed({
    editions: [{ date: '2026-08-22', path: '/news/2026-08-22/', itemCount: 1 }],
    items: [fixture]
  });
  assert.match(html, /Current edition/);
  assert.match(html, /href="\/news\/2026-08-22\/"/);
  assert.match(html, /A new model release/);
  assert.match(html, /Example Research Lab/);
  assert.match(html, /href="\/news\/"/);
  assert.doesNotMatch(html, /Hermes/i);
});

test('rebuild removes editions that are no longer present in source items', async () => {
  const dir = await projectWith([fixture]);
  assert.equal(build(dir).status, 0);
  await rm(path.join(dir, 'content/news/items/item-0.json'));
  const rebuilt = build(dir);
  assert.equal(rebuilt.status, 0, rebuilt.stderr);
  await assert.rejects(read(dir, 'frontend/news/2026-08-22/index.html'), { code: 'ENOENT' });
  const landing = await read(dir, 'frontend/news/index.html');
  assert.match(landing, /No edition has been published yet/);
  assert.doesNotMatch(landing, /model release/i);
});
