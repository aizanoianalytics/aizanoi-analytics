import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const engine = resolve(root, 'frontend/ancient-world/engine');

function readEngineFile(relative) {
  return readFileSync(resolve(engine, relative), 'utf8');
}

/* ---- structural: files exist and are non-empty ---- */

test('world-tour.js exists and is non-empty', () => {
  const path = resolve(engine, 'world-tour.js');
  assert.ok(existsSync(path), 'world-tour.js must exist');
  const content = readFileSync(path, 'utf8');
  assert.ok(content.length > 500, `world-tour.js too short: ${content.length} chars`);
});

test('world-tour.css exists and is non-empty', () => {
  const path = resolve(engine, 'world-tour.css');
  assert.ok(existsSync(path), 'world-tour.css must exist');
  const content = readFileSync(path, 'utf8');
  assert.ok(content.length > 500, `world-tour.css too short: ${content.length} chars`);
});

/* ---- wiring: imported in city-bootstrap.js and navigation.js ---- */

test('world-tour.js is imported in city-bootstrap.js', () => {
  const content = readEngineFile('city-bootstrap.js');
  assert.ok(
    content.includes("import './world-tour.js'") || content.includes('import "./world-tour.js"'),
    'city-bootstrap.js must import world-tour.js',
  );
});

test('world-tour.js is imported in navigation.js', () => {
  const content = readEngineFile('navigation.js');
  assert.ok(
    content.includes("import './world-tour.js'") || content.includes('import "./world-tour.js"'),
    'navigation.js must import world-tour.js',
  );
});

/* ---- world-tour.js static analysis ---- */

test('world-tour.js sets window.__WORLD_TOUR__ guard', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(content.includes('__WORLD_TOUR__'), 'must set __WORLD_TOUR__ guard');
});

test('world-tour.js detects all four worlds', () => {
  const content = readEngineFile('world-tour.js');
  for (const world of ['aizanoi', 'rome', 'athens', 'iga']) {
    assert.ok(
      content.includes(`'${world}'`) || content.includes(`"${world}"`),
      `must detect world: ${world}`,
    );
  }
});

test('world-tour.js defines curated itineraries for all four worlds', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(content.includes('ITINERARIES'), 'must define ITINERARIES');
  for (const world of ['aizanoi', 'rome', 'athens', 'iga']) {
    assert.ok(content.includes(`${world}:`), `must have itinerary for ${world}`);
  }
});

test('world-tour.js uses real landmark IDs from city data', async () => {
  const content = readEngineFile('world-tour.js');

  /* Aizanoi landmarks must exist in historic-world/data/city.js */
  const { BUILDINGS: aizanoiB } = await import(
    resolve(root, 'frontend/historic-world/data/city.js')
  );
  const aizanoiIds = new Set(aizanoiB.map((b) => b.id));
  /* At least temple, agora, greatbath must be in the itinerary */
  for (const id of ['temple', 'agora', 'greatbath']) {
    assert.ok(aizanoiIds.has(id), `Aizanoi landmark ${id} must exist in data`);
    assert.ok(content.includes(`'${id}'`), `world-tour itinerary must reference ${id}`);
  }

  /* Rome landmarks */
  const { BUILDINGS: romeB } = await import(
    resolve(root, 'frontend/ancient-cities/rome-410-476/data/city.js')
  );
  const romeIds = new Set(romeB.map((b) => b.id));
  for (const id of ['colosseum', 'forum', 'pantheon']) {
    assert.ok(romeIds.has(id), `Rome landmark ${id} must exist in data`);
    assert.ok(content.includes(`'${id}'`), `world-tour itinerary must reference ${id}`);
  }

  /* Athens landmarks */
  const { BUILDINGS: athensB } = await import(
    resolve(root, 'frontend/ancient-cities/athens-450-430/data/city.js')
  );
  const athensIds = new Set(athensB.map((b) => b.id));
  for (const id of ['parthenon', 'propylaea', 'hephaisteion']) {
    assert.ok(athensIds.has(id), `Athens landmark ${id} must exist in data`);
    assert.ok(content.includes(`'${id}'`), `world-tour itinerary must reference ${id}`);
  }

  /* İGA landmarks */
  const { BUILDINGS: igaB } = await import(
    resolve(root, 'frontend/iga/data/airport.js')
  );
  const igaIds = new Set(igaB.map((b) => b.id));
  for (const id of ['terminal', 'security', 'tower']) {
    assert.ok(igaIds.has(id), `İGA landmark ${id} must exist in data`);
    assert.ok(content.includes(`'${id}'`), `world-tour itinerary must reference ${id}`);
  }
});

test('world-tour.js uses safe DOM textContent (no innerHTML for user text)', () => {
  const content = readEngineFile('world-tour.js');
  /* Allow innerHTML only for the select option default and CSS loading */
  const lines = content.split('\n');
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    /* Skip comments */
    if (line.startsWith('//') || line.startsWith('*')) continue;
    /* innerHTML for user-facing text content is not allowed */
    if (
      line.includes('.innerHTML') &&
      !line.includes('option value') &&
      !line.includes('world-tour')
    ) {
      violations.push(`Line ${i + 1}: ${line.slice(0, 80)}`);
    }
  }
  assert.equal(
    violations.length, 0,
    `No innerHTML for user text. Violations:\n${violations.join('\n')}`,
  );
});

test('world-tour.js uses no inline style attributes', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(
    !content.includes('.style.'),
    'Must not set inline styles via .style. property',
  );
});

test('world-tour.js has keyboard control for ArrowRight, ArrowLeft, Escape', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(content.includes("'ArrowRight'"), 'Must handle ArrowRight key');
  assert.ok(content.includes("'ArrowLeft'"), 'Must handle ArrowLeft key');
  assert.ok(content.includes("'Escape'"), 'Must handle Escape key to close');
});

test('world-tour.js has close functionality', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(content.includes('close'), 'Must have a close function');
  assert.ok(content.includes('hidden'), 'Must hide card on close');
});

test('world-tour.js has next/previous navigation', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(content.includes('goNext') || content.includes('Next'), 'Must have next navigation');
  assert.ok(content.includes('goPrev') || content.includes('Previous'), 'Must have previous navigation');
});

test('world-tour.js uses runtime teleportTo (not timers)', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(
    content.includes('teleportTo'),
    'Must use debug.teleportTo for navigation',
  );
  assert.ok(
    !content.includes('setTimeout') || content.includes('setTimeout') && content.includes('waitForDebug'),
    'Should prefer lifecycle over timers (setTimeout only acceptable for timeout fallback)',
  );
});

test('world-tour.js does not trap input from existing controls', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(
    content.includes('INPUT') || content.includes('tagName'),
    'Must check target.tagName to avoid trapping input',
  );
});

test('world-tour.js cleans up event listeners', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(
    content.includes('removeEventListener'),
    'Must removeEventListener for teardown',
  );
});

test('world-tour.js does not reference city-experience.js or mobile-controls', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(!content.includes('city-experience'), 'Must not reference city-experience.js');
  assert.ok(!content.includes('mobile-controls'), 'Must not reference mobile-controls');
});

/* ---- CSS: no CSP violations, no inline style elements ---- */

test('world-tour.css has valid selector structure', () => {
  const content = readEngineFile('world-tour.css');
  assert.ok(content.includes('.wt-'), 'CSS must use wt- class prefix');
  assert.ok(content.includes('.wt-card'), 'Must style the card');
  assert.ok(content.includes('.wt-toggle'), 'Must style the toggle button');
  assert.ok(content.includes('.wt-controls'), 'Must style controls');
  assert.ok(content.includes('.wt-btn'), 'Must style buttons');
});

test('world-tour.css respects reduced-motion', () => {
  const content = readEngineFile('world-tour.css');
  assert.ok(
    content.includes('prefers-reduced-motion'),
    'Must respect prefers-reduced-motion',
  );
});

test('world-tour.css has mobile adaptation', () => {
  const content = readEngineFile('world-tour.css');
  assert.ok(
    content.includes('max-width') || content.includes('pointer:coarse'),
    'Must adapt for mobile/touch devices',
  );
});

/* ---- world-tour.js does not modify geometry or spawn positions ---- */

test('world-tour.js does not modify spawn or geometry', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(!content.includes('spawn'), 'Must not reference spawn positions');
  assert.ok(!content.includes('bounds'), 'Must not modify world bounds');
  assert.ok(!content.includes('BUILDINGS'), 'Must not modify building data');
  assert.ok(!content.includes('STREETS'), 'Must not modify street data');
});

/* ---- world-tour.js has ?tour=1 URL parameter support ---- */

test('world-tour.js supports ?tour=1 URL parameter', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(content.includes('tour'), 'Must support tour URL parameter');
  assert.ok(content.includes("'tour'"), "Must check for 'tour' param");
});

/* ---- world-tour.js integrates with lifecycle ---- */

test('world-tour.js waits for __ANCIENT_WORLD_DEBUG__ before booting', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(
    content.includes('__ANCIENT_WORLD_DEBUG__'),
    'Must wait for debug runtime',
  );
});

test('world-tour.js has touch swipe support', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(content.includes('touchstart'), 'Must handle touchstart');
  assert.ok(content.includes('touchend'), 'Must handle touchend');
});

test('world-tour.js creates accessible ARIA attributes', () => {
  const content = readEngineFile('world-tour.js');
  assert.ok(content.includes('aria-label'), 'Must set aria-label');
  assert.ok(content.includes("setAttribute('role'"), 'Must set role attributes');
  assert.ok(content.includes('aria-pressed'), 'Must set aria-pressed on toggle');
});

test('world-tour.js creates DOM elements via document.createElement (no template strings)', () => {
  const content = readEngineFile('world-tour.js');
  /* Should use createElement for card elements, not innerHTML template */
  assert.ok(
    content.includes('createElement'),
    'Must use createElement for DOM construction',
  );
});

test('tour orients the camera toward the authored look target after each teleport', () => {
  const content = readEngineFile('world-tour.js');
  // The tour must not leave the camera at the volume facade default: after teleportTo
  // it should read the authored teleportViews[id].look and aim the player there.
  assert.match(content, /teleportViews/, 'tour must read authored views');
  assert.match(content, /orientCamera|aimCamera|lookTarget|atan2/, 'tour must orient the camera');
});
