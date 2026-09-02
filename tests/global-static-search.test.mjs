import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { STATIC_SEARCH_ENTRIES } from '../frontend/js/v3/search-index.generated.js';

const registry=readFileSync(new URL('../frontend/js/v3/registry.js',import.meta.url),'utf8');
const shell=readFileSync(new URL('../frontend/js/v3/shell.js',import.meta.url),'utf8');

test('static search index is deterministic and covers News plus Analytics content',()=>{
  execFileSync(process.execPath,['scripts/search/build-search-index.mjs','--check'],{stdio:'pipe'});
  assert.ok(STATIC_SEARCH_ENTRIES.length>100,'generated index should include the current News archive and Analytics catalog');
  assert.ok(STATIC_SEARCH_ENTRIES.some((entry)=>entry.kind==='News'&&entry.href==='/news/2026-09-02/aisi-cyber-eval-incident/'),'known permanent News article must be searchable');
  assert.ok(STATIC_SEARCH_ENTRIES.some((entry)=>entry.kind==='Analytics'&&entry.href==='/analytics/dashboards/hr-analytics-full-set/workforce-turnover/'),'HR Turnover dashboard must be searchable');
  assert.ok(STATIC_SEARCH_ENTRIES.every((entry)=>entry.type==='content'&&entry.id&&entry.label&&entry.description&&entry.href),'generated entries must expose the runtime search contract');
});

test('existing Cmd/Ctrl+K palette consumes static content without introducing a parallel search surface',()=>{
  assert.doesNotMatch(registry,/search-index\.generated\.js/,'static content index must not join initial registry evaluation');
  assert.match(registry,/\.\.\.extraEntries/);
  assert.match(shell,/import\('\.\/search-index\.generated\.js'\)/,'static content index should lazy-load when search opens');
  assert.match(shell,/searchableEntries\(staticSearchEntries\)/);
  assert.match(shell,/\['action','world','app','content'\]/);
  assert.match(shell,/row\.type==='content'\)location\.href=row\.href/);
  assert.match(shell,/type==='content'\?'Content'/);
  assert.match(shell,/event\.ctrlKey\|\|event\.metaKey/);
  assert.match(shell,/event\.key\.toLowerCase\(\)==='k'/);
  assert.equal((shell.match(/id="az-command-overlay"/g)||[]).length,1,'global search should continue using exactly one command overlay');
});
