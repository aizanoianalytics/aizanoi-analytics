import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const X_URL = 'https://x.com/AizanoiHQ';
const GITHUB_URL = 'https://github.com/aizanoianalytics/aizanoi-analytics';
const EMAIL = 'aizanoianalytics@protonmail.com';
const TWITTER_SITE = '<meta name="twitter:site" content="@AizanoiHQ">';
const productLandings = ['analytics', 'tv', 'worlds', 'forge', 'journal', 'labs', 'arcade'];

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

test('AizanoiOS exposes the exact Aizo identity copy and safe public contact destinations', () => {
  const platform = read('frontend/js/v3/brand-platform.js');
  for (const copy of [
    'AIZO / ONLINE',
    'Aizo is on X. Unfortunately.',
    'AI, data, cinema, football, markets, experiments, and questionable opinions from a small piece of ancient marble.',
    'Follow @AizanoiHQ ↗',
    'Contact Aizanoi Analytics ↗',
    EMAIL
  ]) assert.ok(platform.includes(copy), `missing exact Aizo copy: ${copy}`);
  assert.match(platform, /const AIZO_X_URL='https:\/\/x\.com\/AizanoiHQ'/);
  assert.match(platform, /href="\$\{AIZO_X_URL\}" target="_blank" rel="noopener noreferrer"/);
  assert.match(platform, /const PUBLIC_EMAIL='aizanoianalytics@protonmail\.com'/);
  assert.match(platform, /href="mailto:\$\{PUBLIC_EMAIL\}"/);
});

test('root metadata keeps Aizanoi Analytics as the Organization and publishes X plus public email', () => {
  const html = read('frontend/index.html');
  assert.ok(html.includes(TWITTER_SITE));
  const graph = jsonLd(html).find((entry) => Array.isArray(entry['@graph']))?.['@graph'];
  assert.ok(graph, 'root JSON-LD graph missing');
  const organization = graph.find((entry) => entry['@type'] === 'Organization');
  assert.equal(organization?.name, 'Aizanoi Analytics');
  assert.deepEqual(organization?.sameAs, [GITHUB_URL, X_URL]);
  assert.equal(organization?.email, `mailto:${EMAIL}`);
});

test('canonical product landings expose shared X, GitHub and email destinations with twitter site metadata', () => {
  for (const route of productLandings) {
    const html = read(`frontend/${route}/index.html`);
    assert.ok(html.includes(TWITTER_SITE), `${route} missing twitter:site`);
    assert.match(html, new RegExp(`<a href="${X_URL.replaceAll('/', '\\/')}" target="_blank" rel="noopener noreferrer">X — @AizanoiHQ<\\/a>`), `${route} missing safe X link`);
    assert.match(html, new RegExp(`<a href="${GITHUB_URL.replaceAll('/', '\\/')}" target="_blank" rel="noopener noreferrer">GitHub<\\/a>`), `${route} missing safe GitHub link`);
    assert.match(html, new RegExp(`<a href="mailto:${EMAIL.replace('.', '\\.')}"[^>]*>Email<\\/a>`), `${route} missing public email link`);
    assert.doesNotMatch(html, /Aizo is on X\. Unfortunately\./, `${route} must not repeat the Aizo joke`);
  }
});
