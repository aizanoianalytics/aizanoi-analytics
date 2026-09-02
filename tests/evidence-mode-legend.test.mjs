import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVIDENCE_LEVELS, EVIDENCE_MODE_ORDER } from '../frontend/ancient-world/engine/evidence.js';

const source=readFileSync(new URL('../frontend/ancient-world/engine/evidence-mode.js',import.meta.url),'utf8');

test('Research Lens legend keeps canonical evidence taxonomy and text labels',()=>{
  assert.deepEqual(EVIDENCE_MODE_ORDER,['archaeological','documented','inferred','atmospheric','disputed']);
  for(const id of EVIDENCE_MODE_ORDER){
    assert.ok(EVIDENCE_LEVELS[id]?.short,`${id} short label missing`);
    assert.ok(EVIDENCE_LEVELS[id]?.label,`${id} descriptive label missing`);
  }
  assert.match(source,/Every category is named in text; color is a secondary cue/);
  assert.match(source,/awResearchLegendCopy/);
  assert.match(source,/\$\{esc\(item\.short\)\}/);
  assert.match(source,/\$\{esc\(item\.label\)\}/);
  assert.match(source,/aria-hidden="true" style="background:\$\{item\.color\}"/);
  assert.match(source,/aria-label="\$\{count\} labelled places"/);
});

test('Research Lens exposes descriptive certainty text beyond the legend',()=>{
  assert.match(source,/\$\{esc\(display\.label\)\} · \$\{esc\(detail\)\}/);
  assert.match(source,/\$\{esc\(display\.label\)\} · \$\{Math\.round\(distance\)\} m/);
  assert.match(source,/aria-hidden="true" style="background:\$\{display\.color\}"/);
});

test('Research Lens legend collapses to one readable column on narrow phones',()=>{
  assert.match(source,/@media\(max-width:520px\)\{\.awResearchLegend\{grid-template-columns:1fr\}/);
  assert.match(source,/\.awResearchPanel\{right:8px;bottom:64px;width:calc\(100vw - 16px\);max-height:56vh\}/);
});
