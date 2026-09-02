import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../frontend/js/v3/shell.js',import.meta.url),'utf8');

test('AizanoiOS yields non-critical home and workspace restoration after shell chrome mounts',()=>{
  const mount=source.slice(source.indexOf('export function mountShell()'));
  assert.match(mount,/root\.innerHTML=shellTemplate\(\);\s*renderShelf\(\);\s*renderClock\(\);\s*requestAnimationFrame\(\(\)=>renderHome\(\)\);/,
    'Home rendering must stay on the next animation frame instead of joining the initial shell mount task');
  assert.match(mount,/requestAnimationFrame\(\(\)=>restoreWorkspace\(\)\.catch\(/,
    'Workspace restoration must stay off the initial shell mount task');
  assert.doesNotMatch(mount,/root\.innerHTML=shellTemplate\(\);\s*renderHome\(\);/,
    'Home rendering regressed into the initial shell mount task');
});
