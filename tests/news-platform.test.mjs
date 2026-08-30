import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const script = path.join(root, 'scripts/news/build-news.mjs');
const newsAppUrl = pathToFileURL(path.join(root, 'frontend/js/v3/apps/news/src/app.js')).href;

const fixture = {
  id: '2026-08-22-model-release',
  title: 'A new model release shifts the open-weight frontier',
  summary: 'A research lab released model weights and a technical report, giving independent developers a new basis for testing efficiency, safety and practical deployment trade-offs.',
  category: 'ai',
  priority: 80,
  publishedAt: '2026-08-22T09:30:00Z',
  updatedAt: '2026-08-22T10:00:00Z',
  retrievedAt: '2026-08-22T11:00:00Z',
  author: { name: 'Aizanoi News Desk' },
  editor: { name: 'Mara Ellis' },
  image: null,
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

test('build emits deterministic edition, permanent article, methodology, category, feed, RSS and News sitemap artifacts', async () => {
  const dir = await projectWith([fixture]);
  const first = build(dir);
  assert.equal(first.status, 0, first.stderr);

  const files = [
    'frontend/news/index.json',
    'frontend/news/index.html',
    'frontend/news/2026-08-22/index.html',
    'frontend/news/2026-08-22/model-release/index.html',
    'frontend/news/about/index.html',
    'frontend/news/category/ai/index.html',
    'frontend/news/rss.xml',
    'frontend/news/sitemap.xml',
    'frontend/sitemap.xml'
  ];
  const before = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await read(dir, file)])));
  const second = build(dir);
  assert.equal(second.status, 0, second.stderr);
  const after = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await read(dir, file)])));
  assert.deepEqual(after, before, 'unchanged inputs must produce byte-identical output');

  const feed = JSON.parse(before['frontend/news/index.json']);
  assert.equal(feed.schemaVersion, 4);
  assert.equal(feed.generatedAt, '2026-08-22T11:00:00.000Z');
  assert.deepEqual(feed.editions, [{ date: '2026-08-22', path: '/news/2026-08-22/', itemCount: 1 }]);
  assert.equal(feed.items[0].priority, 80);
  assert.equal(feed.items[0].author.name, 'Aizanoi News Desk');
  assert.equal(feed.items[0].editor.name, 'Mara Ellis');
  assert.equal(feed.items[0].retrievedAt, '2026-08-22T11:00:00.000Z');
  assert.equal(feed.items[0].corrections[0].note, fixture.corrections[0].note);

  assert.match(before['frontend/news/index.html'], /The Daily Edition/);
  assert.match(before['frontend/news/index.html'], /href="\/news\/2026-08-22\/model-release\/"/);
  assert.match(before['frontend/news/index.html'], /AI-assisted production is disclosed/);
  assert.match(before['frontend/news/2026-08-22/index.html'], /rel="canonical" href="https:\/\/aizanoianalytics\.com\/news\/2026-08-22\/"/);
  assert.match(before['frontend/news/2026-08-22/model-release/index.html'], /rel="canonical" href="https:\/\/aizanoianalytics\.com\/news\/2026-08-22\/model-release\/"/);
  assert.match(before['frontend/news/2026-08-22/model-release/index.html'], /NewsArticle/);
  assert.match(before['frontend/news/2026-08-22/model-release/index.html'], /Example Research Lab/);
  assert.match(before['frontend/news/2026-08-22/model-release/index.html'], /Corrections \(1\)/);
  assert.match(before['frontend/news/about/index.html'], /AI-assisted production/);
  assert.match(before['frontend/news/about/index.html'], /Rehosts of the same wire report/);
  assert.match(before['frontend/news/category/ai/index.html'], /AI Archive/);
  assert.match(before['frontend/news/rss.xml'], /<atom:link/);
  assert.match(before['frontend/news/rss.xml'], /https:\/\/aizanoianalytics\.com\/news\/2026-08-22\/model-release\//);
  assert.match(before['frontend/news/sitemap.xml'], /xmlns:news=/);
  assert.match(before['frontend/sitemap.xml'], /https:\/\/aizanoianalytics\.com\/news\/2026-08-22\/model-release\//);
  assert.doesNotMatch(Object.values(before).join('\n'), /Hermes/i);
});

test('priority determines lead placement within the same publication timestamp', async () => {
  const low = structuredClone(fixture);
  low.id = '2026-08-22-a-low-priority';
  low.title = 'Lower-priority item that sorts earlier by identifier';
  low.priority = 20;
  const high = structuredClone(fixture);
  high.id = '2026-08-22-z-high-priority';
  high.title = 'Higher-priority item selected by the editorial desk';
  high.priority = 95;
  const dir = await projectWith([low, high]);
  const result = build(dir);
  assert.equal(result.status, 0, result.stderr);
  const html = await read(dir, 'frontend/news/2026-08-22/index.html');
  const lead = html.match(/<article[^>]*class="story lead"[\s\S]*?<h2><a[^>]*>([^<]+)<\/a>/)?.[1];
  assert.equal(lead, high.title);
});

test('SOURCE_DATE_EPOCH controls generated metadata without changing item dates', async () => {
  const dir = await projectWith([fixture]);
  const result = build(dir, { SOURCE_DATE_EPOCH: '0' });
  assert.equal(result.status, 0, result.stderr);
  const feed = JSON.parse(await read(dir, 'frontend/news/index.json'));
  assert.equal(feed.generatedAt, '1970-01-01T00:00:00.000Z');
  assert.equal(feed.items[0].publishedAt, '2026-08-22T09:30:00.000Z');
  assert.match(await read(dir, 'frontend/news/rss.xml'), /Thu, 01 Jan 1970 00:00:00 GMT/);
});

test('validation rejects invalid editorial priority', async () => {
  const invalid = structuredClone(fixture);
  invalid.priority = 101;
  const dir = await projectWith([invalid]);
  const result = build(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /priority must be an integer from 0 to 100/);
});

test('validation rejects malformed story image provenance records', async () => {
  const invalid = structuredClone(fixture);
  invalid.image = { url:'javascript:alert(1)', alt:'Unsafe image' };
  const dir = await projectWith([invalid]);
  const result = build(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /image\.url must be a public http or https URL without credentials/);
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
  const { renderNewsFeed } = await import(newsAppUrl);
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

test('News app surfaces the current weekly edition alongside the daily edition', async () => {
  const { renderNewsFeed } = await import(newsAppUrl);
  const html = renderNewsFeed({
    editions: [{ date: '2026-08-31', path: '/news/2026-08-31/', itemCount: 8 }],
    weeklyEditions: [{ date: '2026-08-31', week: '2026-W36', path: '/news/weekly/2026-08-31/', itemCount: 1 }],
    items: [
      { ...fixture, publishedAt:'2026-08-31T05:30:00Z', updatedAt:'2026-08-31T05:30:00Z', retrievedAt:'2026-08-31T05:30:00Z', id:'2026-08-31-daily' },
      { ...weeklyFixture, publishedAt:'2026-08-31T06:00:00Z' }
    ]
  });
  assert.match(html, /Weekly edition · 2026-W36/);
  assert.match(html, /href="\/news\/weekly\/2026-08-31\/"/);
  assert.match(html, /ECB July survey/);
  assert.doesNotMatch(html, /Hermes/i);
});

test('rebuild removes editions and permanent article routes that are no longer present in source items', async () => {
  const dir = await projectWith([fixture]);
  assert.equal(build(dir).status, 0);
  await rm(path.join(dir, 'content/news/items/item-0.json'));
  const rebuilt = build(dir);
  assert.equal(rebuilt.status, 0, rebuilt.stderr);
  await assert.rejects(read(dir, 'frontend/news/2026-08-22/index.html'), { code: 'ENOENT' });
  await assert.rejects(read(dir, 'frontend/news/2026-08-22/model-release/index.html'), { code: 'ENOENT' });
  const landing = await read(dir, 'frontend/news/index.html');
  assert.match(landing, /No edition has been published yet/);
  assert.doesNotMatch(landing, /model release/i);
});

test('exclusive build lock rejects overlapping News generation', async () => {
  const dir = await projectWith([fixture]);
  await mkdir(path.join(dir, 'frontend'), { recursive:true });
  await writeFile(path.join(dir, '.aizanoi-news-build.lock'), `${process.pid}\n`);
  const result = build(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /News build already in progress/);
});

test('failed staged build preserves the previous complete News tree', async () => {
  const dir = await projectWith([fixture]);
  assert.equal(build(dir).status, 0);
  const before = await read(dir, 'frontend/news/index.html');
  const beforeArticle = await read(dir, 'frontend/news/2026-08-22/model-release/index.html');
  const failed = build(dir, { AIZANOI_NEWS_FAIL_AFTER_STAGE:'1' });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Injected failure after staged News validation/);
  assert.equal(await read(dir, 'frontend/news/index.html'), before);
  assert.equal(await read(dir, 'frontend/news/2026-08-22/model-release/index.html'), beforeArticle);
});

test('stale lock and interrupted promotion recover before the next build', async () => {
  const dir = await projectWith([fixture]);
  assert.equal(build(dir).status, 0);
  const frontend = path.join(dir, 'frontend');
  await rename(path.join(frontend, 'news'), path.join(frontend, '.aizanoi-news-backup-crashed'));
  await mkdir(path.join(frontend, '.aizanoi-news-stage-crashed'));
  await writeFile(path.join(frontend, '.aizanoi-news-stage-crashed/partial'), 'partial');
  await writeFile(path.join(dir, '.aizanoi-news-build.lock'), '2147483647\n');
  const recovered = build(dir);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.match(await read(dir, 'frontend/news/index.html'), /The Daily Edition/);
  assert.match(await read(dir, 'frontend/news/2026-08-22/model-release/index.html'), /NewsArticle/);
  const leftovers = (await readdir(frontend)).filter((name) => name.startsWith('.aizanoi-news-'));
  assert.deepEqual(leftovers, []);
  await assert.rejects(readFile(path.join(dir, '.aizanoi-news-build.lock')), { code:'ENOENT' });
});

test('SOURCE_DATE_EPOCH rejects typo-scale timestamps', async () => {
  const dir = await projectWith([fixture]);
  const result = build(dir, { SOURCE_DATE_EPOCH:'999999999999999' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SOURCE_DATE_EPOCH: must be a realistic Unix timestamp/);
});

const weeklyFixture = {
  id: '2026-08-31-ecb-inflation-expectations',
  kind: 'weekly',
  title: 'ECB July survey: euro-area consumers trim near-term inflation expectations',
  summary: 'A reading of the European Central Bank\'s July consumer expectations survey, putting the July release in context with the prior three months, the five-year anchor and the surveyed growth and unemployment outlook — drawing only on the central bank\'s published release and the prior waves it links to.',
  category: 'economy-markets',
  priority: 70,
  week: '2026-W36',
  publishedAt: '2026-08-31T06:00:00Z',
  updatedAt: '2026-08-31T06:00:00Z',
  retrievedAt: '2026-08-31T05:30:00Z',
  author: { name: 'Aizanoi Weekly Desk' },
  editor: { name: 'Aizanoi Editorial Desk' },
  image: null,
  corrections: [],
  tags: ['weekly', 'ECB', 'inflation expectations'],
  sources: [
    { publisher: 'European Central Bank', url: 'https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.pr260821~a044fdddd9.en.html', publishedAt: '2026-08-21T08:00:00Z' }
  ]
};

test('weekly edition is generated at /news/weekly/YYYY-MM-DD/ with its own feed entry and sitemap exposure', async () => {
  const dir = await projectWith([weeklyFixture]);
  const result = build(dir);
  assert.equal(result.status, 0, result.stderr);
  const index = JSON.parse(await read(dir, 'frontend/news/index.json'));
  assert.equal(index.schemaVersion, 4);
  assert.equal(index.weeklyEditions.length, 1);
  assert.equal(index.weeklyEditions[0].date, '2026-08-31');
  assert.equal(index.weeklyEditions[0].week, '2026-W36');
  assert.equal(index.weeklyEditions[0].path, '/news/weekly/2026-08-31/');
  assert.equal(index.weeklyEditions[0].itemCount, 1);
  assert.equal(index.items[0].kind, 'weekly');
  const weeklyHtml = await read(dir, 'frontend/news/weekly/2026-08-31/index.html');
  assert.match(weeklyHtml, /The Weekly Edition/);
  assert.match(weeklyHtml, /rel="canonical" href="https:\/\/aizanoianalytics\.com\/news\/weekly\/2026-08-31\/"/);
  assert.match(weeklyHtml, /NewsArticle/);
  assert.match(weeklyHtml, /European Central Bank/);
  const articleHtml = await read(dir, 'frontend/news/weekly/2026-08-31/ecb-inflation-expectations/index.html');
  assert.match(articleHtml, /rel="canonical" href="https:\/\/aizanoianalytics\.com\/news\/weekly\/2026-08-31\/ecb-inflation-expectations\/"/);
  assert.match(articleHtml, /NewsArticle/);
  const landing = await read(dir, 'frontend/news/index.html');
  assert.match(landing, /href="\/news\/weekly\/2026-08-31\/"/);
  assert.match(landing, /Weekly archive/);
  assert.match(await read(dir, 'frontend/sitemap.xml'), /\/news\/weekly\/2026-08-31\//);
  assert.match(await read(dir, 'frontend/news/rss.xml'), /<category>Weekly<\/category>/);
  assert.doesNotMatch(`${weeklyHtml}\n${landing}`, /Hermes/i);
});

test('weekly item must declare week and a longer minimum summary', async () => {
  const tooShort = structuredClone(weeklyFixture);
  tooShort.summary = 'Short weekly summary that must be at least 240 characters to be considered a real analysis paragraph rather than a daily headline rewrite — the editorial desk has been clear about this minimum length requirement.';
  tooShort.summary = tooShort.summary.slice(0, 120);
  tooShort.id = '2026-08-31-weekly-too-short';
  const dir = await projectWith([tooShort]);
  const result = build(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /item-0\.json: summary must be at least 240 characters/);
});

test('weekly item must not pretend to a week that does not contain its publication date', async () => {
  const wrongWeek = structuredClone(weeklyFixture);
  wrongWeek.id = '2026-08-31-weekly-wrong-week';
  wrongWeek.week = '2026-W01';
  const dir = await projectWith([wrongWeek]);
  const result = build(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /week must match the ISO week of publishedAt/);
});
