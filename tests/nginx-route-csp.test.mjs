import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const nginxExample = readFileSync('infra/nginx/aizanoianalytics.com.conf.example', 'utf8');
const snippet = readFileSync('infra/nginx/snippets/aizanoi-dungeon-markets-security-headers.conf.example', 'utf8');
const fixture = readFileSync('scripts/ci/with-production-nginx.sh', 'utf8');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('dungeon/markets snippet pins a strict CSP without unsafe tokens', () => {
  assert.match(snippet, /Content-Security-Policy/);
  assert.match(snippet, /script-src 'self'/);
  assert.doesNotMatch(snippet, /unsafe-inline/);
  assert.doesNotMatch(snippet, /unsafe-eval/);
});

for (const route of ['/dungeon/', '/analytics/markets/']) {
  test(`repo nginx example scopes the CSP snippet to ${route}`, () => {
    const block = nginxExample.match(new RegExp(`location \\^~ ${esc(route)} \\{[^}]*\\}`));
    assert.ok(block, `no location block for ${route}`);
    assert.match(block[0], /aizanoi-dungeon-markets-security-headers\.conf/);
  });

  test(`production nginx fixture mirrors the CSP scope for ${route}`, () => {
    const block = fixture.match(new RegExp(`location \\^~ ${esc(route)} \\{[\\s\\S]*?\\n    \\}`));
    assert.ok(block, `no fixture location block for ${route}`);
    assert.match(block[0], /aizanoi-dungeon-markets-security-headers\.conf\.example/);
  });
}
