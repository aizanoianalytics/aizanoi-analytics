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
