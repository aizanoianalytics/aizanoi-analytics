import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const origin = 'https://aizanoianalytics.com';
const landings = {
  tv: { app:'videos', title:'Aizanoi TV', phrase:'Coming Soon' },
  analytics: { app:'analytics', title:'Analytics', phrase:'HR Analytics Full Set' },
  worlds: { app:'worlds', title:'Historical Worlds', phrase:'Rome' },
  forge: { app:'forge', title:'Aizanoi Forge', phrase:'Source' },
  journal: { app:'journal', title:'Aizanoi Journal', phrase:'in development' },
  labs: { app:'labs', title:'Aizanoi Labs', phrase:'in development' },
  arcade: { app:'games', title:'Aizanoi Arcade', phrase:'Snake' }
};
const productRoutes = ['news', ...Object.keys(landings)];
const sharedNav = [
  ['/news/', 'News'], ['/tv/', 'TV'], ['/analytics/', 'Analytics'], ['/worlds/', 'Worlds'],
  ['/forge/', 'Forge'], ['/journal/', 'Journal'], ['/labs/', 'Labs'], ['/arcade/', 'Arcade']
];

function metadata(html, route, expected) {
  assert.match(html, new RegExp(`<title>[^<]*${expected.title}[^<]*<\\/title>`));
  assert.match(html, /<meta name="description" content="[^"]{40,}">/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${origin}/${route}/">`));
  assert.match(html, new RegExp(`<meta property="og:url" content="${origin}/${route}/">`));
  assert.match(html, /<meta property="og:site_name" content="Aizanoi Analytics">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /<meta property="og:image"/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta name="twitter:title"/);
  assert.match(html, /<meta name="twitter:description"/);
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(json, `${route} needs JSON-LD`);
  const structured = JSON.parse(json);
  assert.equal(structured.url, `${origin}/${route}/`);
  assert.equal(structured.name, expected.title);
  assert.equal(structured.isPartOf?.name, 'Aizanoi Analytics');
}

test('root document exposes Aizanoi Analytics structured metadata and canonical product links without executable inline script', () => {
  const root = read('frontend/index.html');
  assert.match(root, /application\/ld\+json/);
  assert.match(root, /"@type":"Organization","name":"Aizanoi Analytics"/);
  assert.match(root, /"@type":"WebSite","name":"Aizanoi Analytics"/);
  for (const route of productRoutes) assert.match(root, new RegExp(`href="/${route}/"`));
  assert.match(root, /href="\/analytics\/">Analytics<\/a>/);
  assert.doesNotMatch(root, /<script(?![^>]*type="application\/ld\+json")(?![^>]*src=)[^>]*>/i);
});

test('product routes are static, indexable landing documents with shared News-first navigation', () => {
  for (const [route, expected] of Object.entries(landings)) {
    const file = `frontend/${route}/index.html`;
    assert.ok(existsSync(file), `${file} missing`);
    const html = read(file);
    metadata(html, route, expected);
    assert.match(html, new RegExp(expected.phrase, 'i'));
    assert.match(html, new RegExp(`href="/\\?app=${expected.app}"`));
    assert.match(html, /<h1>/);
    assert.match(html, /<span>Aizanoi Analytics<\/span>/);
    for (const [href, label] of sharedNav) {
      assert.match(html, new RegExp(`<a href="${href.replaceAll('/', '\\/')}">${label}<\\/a>`), `${route} navigation must expose ${label}`);
    }
  }
});

test('TV truthfully advertises a future companion without fabricated videos', () => {
  const html = read('frontend/tv/index.html');
  assert.match(html, /future English-language YouTube channel companion/i);
  assert.match(html, /No videos have been published here yet/i);
  assert.doesNotMatch(html, /<iframe|youtube\.com\/embed|youtu\.be\//i);
});

test('secondary product placeholders state their current status honestly', () => {
  for (const route of ['journal', 'labs']) {
    const html = read(`frontend/${route}/index.html`);
    assert.match(html, /Status:\s*In development/i);
    assert.doesNotMatch(html, /customer|subscriber|latest release|available now/i);
  }
  const analytics = read('frontend/analytics/index.html');
  assert.match(analytics, /Dashboard collection · 10 live products/i);
  assert.match(analytics, /complete 22-module production code from 27 newly created synthetic source workbooks/i);
  assert.match(analytics, /href="\/analytics\/dashboards\/hr-analytics-full-set\/"/);
});

test('Forge exposes repository-backed project status, version, demo and source metadata', () => {
  const html = read('frontend/forge/index.html');
  for (const field of ['Status', 'Version', 'Demo', 'Source']) assert.match(html, new RegExp(`<dt>${field}<\\/dt>`));
  assert.match(html, /aizanoianalytics\/aizanoi-analytics/);
  assert.match(html, /AizanoiOS/);
  assert.match(html, /Historical Worlds/);
  assert.match(html, /Aizanoi Arcade/);
});

test('PWA and repository discovery point to canonical static product routes', () => {
  const manifest = read('frontend/manifest.webmanifest');
  const readme = read('README.md');
  for (const route of ['/news/', '/tv/', '/analytics/', '/worlds/']) {
    assert.match(manifest, new RegExp(`"url":"${route.replaceAll('/', '\\/')}"`));
    assert.match(readme, new RegExp(`https://aizanoianalytics\\.com${route}`));
  }
  assert.match(manifest, /"name":"Analytics"/);
});

test('Rome and Athens publish canonical and social discovery metadata', () => {
  for (const [slug, name] of [['rome-410-476', 'Rome'], ['athens-450-430', 'Athens']]) {
    const html = read(`frontend/ancient-cities/${slug}/index.html`);
    const url = `${origin}/ancient-cities/${slug}/`;
    assert.match(html, new RegExp(`<link rel="canonical" href="${url}">`));
    assert.match(html, new RegExp(`<meta property="og:url" content="${url}">`));
    assert.match(html, new RegExp(`<meta property="og:title" content="[^"]*${name}`));
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /<meta name="twitter:title"/);
  }
});
