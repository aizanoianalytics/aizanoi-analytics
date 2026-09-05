import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVIDENCE_LEVELS, EVIDENCE_MODE_ORDER } from '../frontend/ancient-world/engine/evidence.js';

// Research Lens markup now lives in `evidence-mode.js`. The CSS that drives
// the legend/panel/toggle lives in `evidence-mode.css` — both must continue
// to satisfy the historical-world CSP (no inline style attributes, no runtime
// `<style>` element injection).
const jsSource = readFileSync(new URL('../frontend/ancient-world/engine/evidence-mode.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../frontend/ancient-world/engine/evidence-mode.css', import.meta.url), 'utf8');

test('Research Lens legend keeps canonical evidence taxonomy and text labels', () => {
  assert.deepEqual(EVIDENCE_MODE_ORDER, ['archaeological', 'documented', 'inferred', 'atmospheric', 'disputed']);
  for (const id of EVIDENCE_MODE_ORDER) {
    assert.ok(EVIDENCE_LEVELS[id]?.short, `${id} short label missing`);
    assert.ok(EVIDENCE_LEVELS[id]?.label, `${id} descriptive label missing`);
  }
  assert.match(jsSource, /Every category is named in text; color is a secondary cue/);
  assert.match(jsSource, /awResearchLegendCopy/);
  assert.match(jsSource, /\$\{esc\(item\.short\)\}/);
  assert.match(jsSource, /\$\{esc\(item\.label\)\}/);
  // Dot colors are applied via the `data-evidence-dot` hook so the markup
  // itself stays free of inline `style="..."` attributes (CSP style-src 'self').
  assert.match(jsSource, /data-evidence-dot/);
  assert.match(jsSource, /aria-label="\$\{count\} labelled places"/);
});

test('Research Lens exposes descriptive certainty text beyond the legend', () => {
  assert.match(jsSource, /\$\{esc\(display\.label\)\} · \$\{esc\(detail\)\}/);
  assert.match(jsSource, /\$\{esc\(display\.label\)\} · \$\{Math\.round\(distance\)\} m/);
  // Color is propagated through paintDotColors() rather than into the markup.
  assert.match(jsSource, /paintDotColors/);
  assert.match(jsSource, /style\.setProperty\('--aw-dot-color'/);
});

test('Research Lens legend collapses to one readable column on narrow phones', () => {
  // The breakpoint rules were lifted verbatim from the prior inline `<style>`
  // payload into `evidence-mode.css` so they continue to apply.
  assert.match(cssSource, /@media\(max-width:520px\)\{\.awResearchLegend\{grid-template-columns:1fr\}/);
  assert.match(cssSource, /\.awResearchPanel\{right:8px;bottom:64px;width:calc\(100vw - 16px\);max-height:56vh\}/);
});

test('Research Lens stylesheet is loaded as a same-origin CSS link, never an inline block', () => {
  // Defensive: even if a future change reintroduces the helper, it must not
  // append an inline `<style>` element. The actual stylesheet is linked from
  // every Historical World entry page.
  assert.doesNotMatch(jsSource, /document\.createElement\(\s*['"]style['"]\s*\)/);
  assert.doesNotMatch(jsSource, /style\s*=\s*['"][^'"]*\$\{/);
});