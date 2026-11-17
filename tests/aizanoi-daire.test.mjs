import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../frontend/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Daire is a standalone walkable apartment under strict CSP', () => {
  const html = read('arcade/daire/index.html');
  const css = read('arcade/daire/daire.css');
  const src = read('arcade/daire/daire.js');
  assert.match(html, /<title>Ev/);
  assert.match(html, /<link rel="stylesheet" href="\.\/daire\.css">/);
  assert.match(html, /<script src="\/arcade\/factory\/engine\.js" defer><\/script>/);
  assert.match(html, /<script src="\.\/daire\.js" defer><\/script>/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)|<style\b|\son\w+=|\sstyle=/i);
  assert.match(css, /#boot\[hidden\]\s*\{/);
  assert.doesNotMatch(src, /style="|\.style\.cssText/);
  for (const marker of ['Salon', 'Yatak odası', 'Mavi puf', 'Çalışma masası', 'Lavabo', 'Klozet', 'Ayakkabı kartonu', 'İki buzdolabı', '4 · Balkon', 'enerji içeceği', 'ev-level', 'mergeStatic']) {
    assert.match(src, new RegExp(marker), marker);
  }
  assert.doesNotMatch(src, /anlatılmadı/);
  assert.match(read('arcade/daire/index.md'), /Room 4 is the balcony/);
});
