import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const docs = {
  field:readFileSync('docs/FIELD_SYSTEM.md', 'utf8'),
  contributing:readFileSync('CONTRIBUTING.md', 'utf8'),
  security:readFileSync('SECURITY.md', 'utf8'),
  product:readFileSync('PRODUCT.md', 'utf8'),
  readme:readFileSync('README.md', 'utf8'),
  roadmap:readFileSync('ROADMAP.md', 'utf8')
};
const obsoletePaths = /os-state\.js|os-shell\.js|os-unified\.js|os-product-polish\.js|os-workbench|archive-store\.js|frontend\/js\/terminal\.js/;

test('canonical shell documentation describes the current eight-app AizanoiOS catalog', () => {
  assert.match(docs.field, /^# AizanoiOS/m);
  assert.match(docs.field, /eight public apps/i);
  assert.match(docs.field, /Workbench.*retired/i);
  assert.match(docs.field, /frontend\/js\/v3\/registry\.js/);
  assert.match(docs.field, /static product landings/i);
  assert.doesNotMatch(docs.field, /11 canonical apps|Research Workspace|Field Terminal|Workspace Monitor/);
});

test('contribution guidance points only to current canonical owners', () => {
  assert.match(docs.contributing, /AizanoiOS contributions/);
  assert.match(docs.contributing, /frontend\/js\/v3\/shell\.js/);
  assert.match(docs.contributing, /frontend\/styles\/device-shell\.css/);
  assert.match(docs.contributing, /retired Workbench/i);
  assert.doesNotMatch(docs.contributing, obsoletePaths);
});

test('security policy scopes the retired Workbench as absent rather than supported', () => {
  assert.match(docs.security, /Workbench.*retired/i);
  assert.match(docs.security, /no public remote shell/i);
  assert.match(docs.security, /service worker/i);
  assert.doesNotMatch(docs.security, /Field Terminal is|Field Archive|Field Notes|Data Lab.*designed to stay/);
  assert.doesNotMatch(docs.security, obsoletePaths);
});

test('canonical product documents define the approved four-section News scope', () => {
  for (const source of [docs.product, docs.readme, docs.roadmap]) {
    assert.match(source, /AI, Technology, Economy \/ Markets and Football/i);
    assert.doesNotMatch(source, /World, Sports and Culture|five initial categories/i);
  }
});
