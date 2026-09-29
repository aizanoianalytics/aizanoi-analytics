// Section 14: "Guided Tour should feel like a real experience, not a sequence
// of teleports." It should have clear progress, stop title, short explanatory
// text, source/evidence context, next/previous where sensible, skip/exit and
// accessible focus, plus resume/reset logic if useful. Evidence mode must
// distinguish evidence classes without destroying readability, and source links
// must correspond to the relevant landmark.
//
// The browser audit measures all of this in the running world. This suite is
// the fast half.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const tour = read('frontend/worlds/shared/engine/tour.js');
const boot = read('frontend/worlds/aizanoi-225/js/bootstrap.js');
const html = read('frontend/worlds/aizanoi-225/index.html');
const css = read('frontend/worlds/shared/css/base-theme.css');
const city = read('frontend/worlds/aizanoi-225/js/city-data.js');

// Slice one method body out by brace matching, so assertions never depend on
// where a method happens to sit in the file.
const methodBody = (source, name) => {
  const start = source.indexOf(`\n  ${name}(`);
  assert.ok(start > 0, `must define ${name}`);
  let depth = 0;
  for (let j = source.indexOf('{', start); j < source.length; j++) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}' && --depth === 0) return source.slice(start, j + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
};


test('the tour shows real progress rather than only a stop number', () => {
  assert.match(tour, /tour-bar__progress/, 'the panel must render a progress bar');
  assert.match(tour, /role="progressbar"/, 'the bar must be exposed as a progressbar');
  assert.match(tour, /style\.width = `\$\{pct\}%`/, 'the bar must actually fill per stop');
  // A bar that never resets between stops reads as broken, so it is derived
  // from the index rather than accumulated.
  const body = methodBody(tour, 'goToStop');
  assert.match(body, /const pct = total > 1 \? \(index \/ \(total - 1\)\) \* 100 : 100;/,
    'the fill must be derived from the stop index, not accumulated');
  // And it must be announced, not only painted.
  assert.match(body, /aria-valuetext/, 'the bar must expose a readable value text');
  assert.match(body, /aria-valuenow/, 'the bar must expose its current position');
});

test('each stop carries its own source and evidence context', () => {
  const body = methodBody(tour, 'renderEvidence');
  // Source links must correspond to the relevant landmark, so the lookup is
  // keyed on the stop's own id rather than on list order.
  assert.match(body, /sources\.find\(\(src\) => src\.id === stop\.id\)/,
    'the source must be matched on the stop id, not on position');
  assert.match(body, /src\.id === building\.id/, 'the building id is the fallback key');
  assert.match(body, /source\?\.title/, 'the matched source must be shown to the visitor');
  // Evidence class is read from the shape the world actually uses.
  assert.match(body, /building\.evidence\?\.level/,
    'the evidence level must be read from evidence.level, not from a bare string');
});

test('evidence classes are distinguished by text, not by colour alone', () => {
  assert.match(tour, /EVIDENCE_LABELS/, 'evidence classes must have human-readable names');
  assert.match(methodBody(tour, 'renderEvidence'), /labelForEvidenceClass\(cls\)/, 'the label must be shown');
  // Every class the world actually declares must have a label, or a stop
  // renders a raw internal key to the visitor.
  for (const level of [...city.matchAll(/level:\s*'(\w+)'/g)].map((m) => m[1])) {
    assert.match(tour, new RegExp(`${level}:`),
      `evidence level "${level}" is used in the world data but has no visitor-facing label`);
  }
  // Distinct classes must also be visually distinct, without relying on hue.
  const classRules = [...css.matchAll(/data-evidence-class="(\w+)"\] \{([^}]*)\}/g)];
  assert.ok(classRules.length >= 1, 'evidence classes must have their own visual treatment');
  for (const [, cls, body] of classRules) {
    assert.ok(body.includes('border-left-color'),
      `evidence class "${cls}" must be distinguished by a visible rule`);
  }
});

test('the tour can be skipped, exited and restarted', () => {
  assert.match(html, /id="btn-tour"/, 'the tour must be startable from a control');
  assert.match(tour, /id="btn-tour-close"/, 'the panel must offer a close control');
  assert.match(tour, /id="btn-tour-reset"/, 'the panel must offer a restart control');
  assert.match(tour, /restart\(\)\s*\{[\s\S]{0,80}this\.currentStop = 0;/,
    'restart must return to the first stop');
  // Restart and resume must be different: start() keeps the visitor's place.
  assert.doesNotMatch(methodBody(tour, 'start'), /this\.currentStop = 0/,
    'start must resume rather than silently reset the visitor\'s progress');
});

test('next and previous are honest about the ends of the tour', () => {
  const body = methodBody(tour, 'goToStop');
  assert.match(body, /prevBtn\.disabled = index === 0/,
    'Prev must be disabled at the first stop instead of doing nothing');
  assert.match(body, /index >= total - 1 \? 'Finish/,
    'the last stop must say what its Next button does');
  // And the next() walk must actually terminate.
  assert.match(methodBody(tour, 'next'), /this\.stop\(\)/,
    'advancing past the last stop must end the tour');
});

test('the tour manages focus for keyboard and screen-reader visitors', () => {
  const start = methodBody(tour, 'start');
  assert.match(start, /_returnFocus = document\.activeElement/,
    'the opener must be captured before focus moves into the panel');
  assert.match(start, /closeBtn\?\.focus/,
    'entering the tour must move focus to the exit control');
  const stop = methodBody(tour, 'stop');
  assert.match(stop, /_returnFocus\?\.focus/,
    'exiting must return focus to the control that opened the tour');
});

test('the exit returns the visitor to wherever they actually came from', () => {
  // A hard-coded href sent a visitor who launched the world from the desktop
  // to a marketing page instead of back to the shell.
  assert.match(html, /id="btn-world-exit"/, 'there must be an exit control');
  assert.doesNotMatch(html, /<a href="\/worlds\/" class="hud-btn world-exit"/,
    'the exit must not be a hard-coded link to the landing page');
  assert.match(boot, /AIZANOI_OS\?\.closeApp \? 'shell' : 'page'/,
    'the exit must detect whether the world was launched from the shell');
  assert.match(boot, /AIZANOI_OS\.closeApp\('aizanoi'\)/,
    'the shell-hosted exit must close the window it was opened in');
  assert.match(boot, /window\.location\.assign\('\/worlds\/'\)/,
    'a directly opened world must still have somewhere to go');
  assert.match(boot, /try \{[\s\S]{0,200}?closeApp\('aizanoi'\)[\s\S]{0,200}?catch \(error\)/,
    'a failing shell close must be caught rather than leaving the visitor stuck');
  assert.match(boot, /Shell close failed[\s\S]{0,120}location\.assign|\}\s*\n\s*window\.location\.assign\('\/worlds\/'\)/,
    'the fallback path must still lead somewhere');
  // Escape is the keyboard exit, and a modal must still own it.
  assert.match(boot, /event\.key !== 'Escape'/, 'Escape must leave the world');
  assert.match(boot, /aria-modal="true"/, 'a modal must keep Escape while it is open');
  // The accessible name must describe the actual destination.
  assert.match(boot, /refreshExitLabel/, 'the exit label must reflect where it leads');
});

test('the evidence colour toggle remains available and stateful', () => {
  assert.match(html, /id="btn-evidence"[\s\S]{0,120}aria-pressed="false"/,
    'the evidence control must expose its state to assistive tech');
  assert.match(read('frontend/worlds/shared/engine/ui.js'), /evidenceActive/,
    'the UI must track whether evidence mode is on');
});

test('the tour audit is registered as an operator diagnostic', () => {
  assert.match(read('tests/test-ownership.test.mjs'), /aizanoi-tour-audit\.mjs/,
    'the tour audit must be owned, or it becomes an untracked script');
});
