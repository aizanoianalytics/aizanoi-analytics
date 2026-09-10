import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Markets Python ingestion and publication contracts pass', () => {
  const result = spawnSync('python3', ['tests/markets_pipeline_test.py'], { encoding:'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
