import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const script = path.join(root, 'scripts/news/build-news.mjs');

const firstSentence = 'The Aizanoi News Desk confirmed a detailed development after checking multiple source records, preserving the essential actors, timing, numbers and immediate consequence so the daily edition remains useful on its own.';
const secondSentence = 'The permanent article keeps this additional verified context so readers who open the story receive more than the edition-level scan.';
const fixture = {
  id: '2026-09-02-summary-depth-contract',
  title: 'News edition and permanent article surfaces preserve different reading depths',
  summary: `${firstSentence} ${secondSentence}`,
  category: 'technology',
  priority: 70,
  publishedAt: '2026-09-02T08:00:00Z',
  updatedAt: '2026-09-02T08:00:00Z',
  retrievedAt: '2026-09-02T08:10:00Z',
  author: { name: 'Aizanoi News Desk' },
  editor: { name: 'Aizanoi Editorial Desk' },
  image: null,
  corrections: [],
  tags: ['News'],
  sources: [
    {
      publisher: 'Example Source',
      url: 'https://example.com/report',
      publishedAt: '2026-09-02T07:30:00Z'
    }
  ]
};

async function buildFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'aizanoi-news-depth-'));
  await mkdir(path.join(dir, 'scripts/news'), { recursive: true });
  await mkdir(path.join(dir, 'content/news/items'), { recursive: true });
  await cp(script, path.join(dir, 'scripts/news/build-news.mjs'));
  await writeFile(path.join(dir, 'content/news/items/item.json'), `${JSON.stringify(fixture, null, 2)}\n`);
  const result = spawnSync(process.execPath, ['scripts/news/build-news.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return dir;
}

function visibleSummary(html) {
  return html.match(/<p class="summary">([^<]+)<\/p>/)?.[1];
}

function articleDeck(html) {
  return html.match(/<p class="article-deck">([^<]+)<\/p>/)?.[1];
}

test('daily edition uses a concise sentence while permanent article keeps the canonical full summary', async () => {
  const dir = await buildFixture();
  const edition = await readFile(path.join(dir, 'frontend/news/2026-09-02/index.html'), 'utf8');
  const article = await readFile(path.join(dir, 'frontend/news/2026-09-02/summary-depth-contract/index.html'), 'utf8');

  assert.equal(visibleSummary(edition), firstSentence);
  assert.equal(articleDeck(article), fixture.summary);
  assert.doesNotMatch(visibleSummary(edition), /additional verified context/);
  assert.match(articleDeck(article), /additional verified context/);
});
