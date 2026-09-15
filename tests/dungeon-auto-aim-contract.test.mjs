import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../frontend/js/v3/apps/dungeon/js/scenes/GameScene.js', import.meta.url), 'utf8');
const aizoSource = readFileSync(new URL('../frontend/js/v3/apps/dungeon/js/entities/Aizo.js', import.meta.url), 'utf8');

test('auto-aim selects nearest active alive enemy with a linear search', () => {
  assert.match(source, /let nearest = null/);
  assert.match(source, /if \(!enemy\.active \|\| enemy\.hp <= 0\) return/);
  assert.match(source, /if \(d2 <= minDistSq\)/);
  assert.match(source, /this\.player\.lastDirection/);
  assert.match(source, /this\.player\.attack\(/);
});

test('auto-aim keeps its cooldown and does not attack without a valid target', () => {
  assert.match(source, /this\._nextAutoAim = time \+ 420/);
  assert.match(source, /if \(!nearest\) return/);
  assert.match(source, /this\.player\.isAttacking \|\| this\.player\.isDead/);
});

test('auto-aim passes its chosen target to Aizo.attack so the arc matches the rotation', () => {
  // Regression guard for the target-consistency contract: GameScene picks
  // an enemy, rotates the player toward it, and then must hand the same
  // target to Aizo.attack(). Otherwise Aizo.attack() would re-run its own
  // nearest-in-range search and could swap the chosen enemy for a closer
  // destructible structure, breaking the visual rotation we just performed.
  // Manual/space/touch/mouse attacks deliberately call attack() with no
  // argument so the existing per-frame behaviour is preserved.
  const autoAimBlock = source.match(/autoAimAttack\(time\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(autoAimBlock, 'autoAimAttack method must exist');
  assert.match(autoAimBlock[0], /this\.player\.attack\(nearest\)/,
    'auto-aim must pass the chosen target to Aizo.attack');
  assert.doesNotMatch(autoAimBlock[0], /this\.player\.attack\(\)/,
    'auto-aim must not call Aizo.attack without the chosen target');
});

test('Aizo.attack accepts an explicit target and prefers it over a closer destructible', () => {
  // Source-level contract: Aizo.attack(targetOrDirection = null) must
  // validate and short-circuit on the explicit target when it is still in
  // range, alive, and not the player base. The fallback to "nearest
  // candidate" must remain when no target is provided so manual/space/
  // touch attacks do not change behaviour.
  assert.match(aizoSource, /attack\(targetOrDirection = null\) \{/);
  assert.match(aizoSource, /if \(!targetOrDirection\) return null;/);
  assert.match(aizoSource, /if \(!targetOrDirection\.active\) return null;/);
  assert.match(aizoSource, /const hp = targetOrDirection\.hp;/);
  assert.match(aizoSource, /if \(targetOrDirection\.isPlayerBase === true\) return null;/);
  assert.match(aizoSource, /return dist <= range \? targetOrDirection : null;/);
  assert.match(aizoSource, /if \(explicitTarget && candidateTargets\.includes\(explicitTarget\)\) \{/);
  assert.match(aizoSource, /nearest = explicitTarget;/);
  // Manual path is preserved: when no explicit target is given we still
  // walk the candidate pool and pick the nearest in range.
  assert.match(aizoSource, /candidateTargets\.forEach\(\(target\) => \{/);
});

test('Aizo.attack explicit-target validation rejects inactive, dead or out-of-range candidates', () => {
  // Behavioural contract: explicit target MUST be validated against active,
  // alive, not-the-base, in-range. A stale or out-of-range target must NOT
  // silently short-circuit the manual nearest-in-range search; this keeps
  // touch/space/mouse attacks honest when an auto-aim frame is in flight.
  assert.match(aizoSource, /if \(!targetOrDirection\) return null;/);
  assert.match(aizoSource, /if \(!targetOrDirection\.active\) return null;/);
  assert.match(aizoSource, /if \(hp === undefined \|\| hp <= 0\) return null;/);
  assert.match(aizoSource, /if \(targetOrDirection\.isPlayerBase === true\) return null;/);
  assert.match(aizoSource, /return dist <= range \? targetOrDirection : null;/);
});

test('minimap visibility is controlled by persisted settings', () => {
  const ui = readFileSync(new URL('../frontend/js/v3/apps/dungeon/js/scenes/UIScene.js', import.meta.url), 'utf8');
  assert.match(ui, /loadSettings\(\)\.showMinimap !== false/);
  assert.match(ui, /if \(!this\.minimapEnabled\) return/);
});

test('minimap container child order is bg -> graphics -> hint (dots render above background)', () => {
  // Regression guard for the Phaser display-list ordering. Earlier the
  // container was [graphics, background, hint] which made the dark
  // background rectangle render ON TOP of every minimap dot and occlude
  // them. Phaser draws children in array-add order, so the explicit list
  // MUST be background first, then dots, then label.
  const ui = readFileSync(new URL('../frontend/js/v3/apps/dungeon/js/scenes/UIScene.js', import.meta.url), 'utf8');
  assert.match(ui, /this\.minimapBg = this\.add\.rectangle/);
  assert.match(ui, /this\.minimapGfx = this\.add\.graphics/);
  // Order of assignment: bg must be assigned BEFORE graphics.
  const bgIdx = ui.indexOf('this.minimapBg = this.add.rectangle');
  const gfxIdx = ui.indexOf('this.minimapGfx = this.add.graphics');
  assert.ok(bgIdx > -1 && gfxIdx > -1 && bgIdx < gfxIdx,
    'minimap background must be created before the graphics layer');
  // The container.add call must list bg first.
  const addMatch = ui.match(/this\.minimapContainer\.add\(\[([^\]]+)\]\)/);
  assert.ok(addMatch, 'minimapContainer.add must use a literal array');
  const order = addMatch[1].split(',').map((s) => s.trim());
  assert.deepEqual(order, ['this.minimapBg', 'this.minimapGfx', 'this.minimapHint'],
    `minimap child order must be bg -> graphics -> hint, got [${order.join(', ')}]`);
});

test('toggleMinimap persists setting and flips UIScene.minimapContainer visibility', () => {
  // Regression contract for the in-game minimap toggle. The ESC menu path
  // persists the new value, applies it to the live container, and updates
  // the UIScene's enabled flag so the next update() skip respects it.
  const game = readFileSync(new URL('../frontend/js/v3/apps/dungeon/js/scenes/GameScene.js', import.meta.url), 'utf8');
  assert.match(game, /saveSettings\(\{ showMinimap: next \}\)/);
  assert.match(game, /this\.scene\.get\('UIScene'\)\?\.minimapContainer\?\.setVisible\(next\)/);
  assert.match(game, /if \(ui\) ui\.minimapEnabled = next/);
});
