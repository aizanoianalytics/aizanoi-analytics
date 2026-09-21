import test from 'node:test';
import assert from 'node:assert/strict';

const { esc, urlAttr, renderHTML } = await import('../frontend/js/v3/apps/flowerseller/src/safe.js');

test('esc escapes the five dangerous characters and handles null/undefined', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc('"><script>x</script>'), '&quot;&gt;&lt;script&gt;x&lt;/script&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc('Tom & Jerry'), 'Tom &amp; Jerry');
});

test('urlAttr rejects javascript:/data:/vbscript: schemes', () => {
  assert.equal(urlAttr('javascript:alert(1)'), '');
  assert.equal(urlAttr('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(urlAttr('vbscript:msgbox(1)'), '');
  assert.equal(urlAttr('https://example.com/x.jpg'), 'https://example.com/x.jpg');
  assert.equal(urlAttr('  JaVaScRiPt:alert(1)'), '');
});

test('renderHTML applies esc to every value and urlAttr to image/src', () => {
  const tpl = (d) => `<img src="${d.image}" alt="${d.alt}">${d.text}`;
  const out = renderHTML(tpl, { image: 'javascript:alert(1)', alt: '<bad>', text: '"><script>x</script>' });
  assert.match(out, /src=""/);
  assert.match(out, /alt="&lt;bad&gt;"/);
  assert.match(out, /&quot;&gt;&lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(out, /javascript:alert\(1\)/);
});

test('esc output never contains raw script tags even when input has them', () => {
  const evil = '<script>alert("xss")</script>';
  assert.equal(esc(evil).includes('<script>'), false);
  assert.equal(esc(evil).includes('&lt;script&gt;'), true);
});
