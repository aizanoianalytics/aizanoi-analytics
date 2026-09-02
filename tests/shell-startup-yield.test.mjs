import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell=readFileSync(new URL('../frontend/js/v3/shell.js',import.meta.url),'utf8');
const main=readFileSync(new URL('../frontend/js/v3/main.js',import.meta.url),'utf8');

test('AizanoiOS skips the superseded legacy home render and yields workspace restoration',()=>{
  const mount=shell.slice(shell.indexOf('export function mountShell()'));
  assert.match(mount,/root\.innerHTML=shellTemplate\(\);\s*renderShelf\(\);\s*renderClock\(\);/,
    'Shell chrome must mount before the product platform is installed');
  assert.doesNotMatch(mount,/renderHome\(\)/,
    'The legacy generic home must not render during boot because installAizanoiOS immediately owns the home surface');
  assert.match(main,/const api=mountShell\(\);installReducedMotionSync\(api\);installAizanoiOS\(api\);installBrandPlatform\(api\);/,
    'The startup optimization depends on the canonical platform installation order');
  assert.match(mount,/requestAnimationFrame\(\(\)=>restoreWorkspace\(\)\.catch\(/,
    'Workspace restoration must stay off the initial shell mount task');
});
