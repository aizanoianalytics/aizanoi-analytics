import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../frontend/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Aizanoi Factory is a standalone static Arcade route under strict CSP', () => {
  const html = read('arcade/factory/index.html');
  const css = read('arcade/factory/factory.css');
  const engine = read('arcade/factory/engine.js');
  const vehicles = read('arcade/factory/vehicles.js');
  const interior = read('arcade/factory/factory_interior.js');
  const factory = read('arcade/factory/factory.js');

  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>Aizanoi Factory/);
  assert.match(html, /<link rel="canonical" href="https:\/\/aizanoianalytics\.com\/arcade\/factory\/">/);
  assert.match(html, /<link rel="stylesheet" href="\.\/factory\.css">/);
  for (const script of ['engine.js', 'vehicles.js', 'factory_interior.js', 'factory.js']) {
    assert.match(html, new RegExp(`<script src="\\./${script}" defer></script>`));
  }
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)|<style\b|\son\w+=|\sstyle=/i);
  assert.doesNotMatch(html, /https:\/\/fonts\.googleapis\.com/);

  assert.match(css, /#view/);
  assert.match(css, /#boot\[hidden\]\s*\{/);

  assert.match(engine, /window\.__THREE__="180"/);
  assert.match(engine, /AZ_ENGINE/);
  assert.match(engine, /createCombat:\s*zv/);
  assert.match(engine, /createWeapon:\s*dm/);
  assert.match(engine, /createEnemies:\s*Em/);
  for (const [name, source] of [
    ['engine.js', engine],
    ['vehicles.js', vehicles],
    ['factory_interior.js', interior],
    ['factory.js', factory],
  ]) {
    assert.doesNotMatch(source, /style="|\.style\.cssText/, `${name} must not inject inline style attributes under strict CSP`);
  }

  assert.ok(existsSync(new URL('arcade/factory/THIRD_PARTY_NOTICES.txt', root)));
  assert.match(read('arcade/index.md'), /factory\/index\.md/);
});

test('Factory exposes English UI, Free Tour / Battle Mode selector, Aizanoi Wars combat, quality control, and touch dock', () => {
  const html = read('arcade/factory/index.html');
  const css = read('arcade/factory/factory.css');
  const factory = read('arcade/factory/factory.js');
  const notes = read('arcade/factory/index.md');
  const interior = read('arcade/factory/factory_interior.js');

  assert.match(html, /id="btn-quality"/);
  assert.match(html, /id="quality-label"/);
  assert.match(html, /id="touch-dock"/);
  assert.match(html, /Left thumb move/);
  assert.match(html, /Right thumb look/);
  assert.match(html, /id="mode-modal"/);
  assert.match(html, /id="btn-start-tour"/);
  assert.match(html, /id="btn-start-combat"/);
  assert.match(html, /id="combat-hud"/);
  assert.match(html, /id="combat-ammo"/);
  assert.match(html, /id="combat-hp"/);
  assert.match(html, /id="combat-wave"/);
  assert.match(html, /id="combat-objectives"/);
  assert.match(html, /id="combat-objective-bar"/);
  assert.match(html, /id="combat-over-modal"/);

  assert.match(factory, /function chooseFactoryQuality/);
  assert.match(factory, /function createCyborgSystem/);
  assert.match(factory, /G\.render\.setQuality/);
  assert.match(factory, /aizanoi\.factory\.quality/);
  assert.match(factory, /shadow:\s*8192|shadow = Math\.max/);
  assert.match(factory, /function raiseSceneFinish/);
  assert.match(factory, /function enterTourMode/);
  assert.match(factory, /function enterCombatMode/);
  assert.match(factory, /E\.createCombat/);
  assert.match(factory, /E\.createWeapon/);
  assert.match(factory, /E\.createEnemies/);
  assert.match(factory, /invulnerable = true/);
  assert.match(factory, /invulnerable = false/);
  assert.match(factory, /4\.2m/);
  assert.match(factory, /maxAlive:\s*16/);
  assert.match(factory, /extractReady/);
  assert.match(factory, /factory-parachute-rig/);
  assert.match(factory, /makeHexSuitTexture/);

  assert.match(css, /#coords-readout[\s\S]*width:\s*18ch/);
  assert.match(css, /\.hud-actions[\s\S]*z-index:\s*30/);
  assert.match(css, /#touch-dock/);
  assert.match(css, /\.mode-modal/);
  assert.match(css, /\.combat-hud/);

  assert.doesNotMatch(notes, /fifteen loaded pallets|Steep solid loading ramp/);
  assert.match(notes, /87 pallet/);
  assert.match(notes, /cement ramp/i);
  assert.match(interior, /createTallSpacerGlass/);
  assert.match(interior, /PC Tower Case/);
  assert.match(interior, /GLASS GILDING KILN/);
  assert.match(interior, /LOADING RAMP/);
});
