import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

for (const game of ['snake', 'brick']) {
  test(`${game} stops its timer when its game container is removed`, () => {
    const source = readFileSync(resolve(root, `frontend/games/${game}.js`), 'utf8');
    assert.match(source, /container\.isConnected/);
    assert.match(source, /clearInterval\(interval\)/);
    assert.match(source, /interval\s*=\s*null/);
  });
}
