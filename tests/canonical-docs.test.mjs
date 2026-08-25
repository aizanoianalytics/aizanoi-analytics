import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const docs = {
  field: read('docs/FIELD_SYSTEM.md'),
  contributing: read('CONTRIBUTING.md'),
  security: read('SECURITY.md'),
  product: read('PRODUCT.md'),
  agents: read('AGENTS.md'),
  readme: read('README.md'),
  design: read('DESIGN.md'),
  architecture: read('ARCHITECTURE.md'),
  content: read('CONTENT_POLICY.md'),
  roadmap: read('ROADMAP.md'),
  changelog: read('CHANGELOG.md'),
  docsReadme: read('docs/README.md'),
  operations: read('docs/OPERATIONS.md'),
  hermes: read('docs/HERMES_OPERATIONS.md')
};

const currentBrandDocs = [
  docs.product, docs.agents, docs.readme, docs.design, docs.architecture, docs.content,
  docs.roadmap, docs.field, docs.contributing, docs.security, docs.hermes
];

test('current AizanoiOS docs describe the eight-app public platform without retired Workbench surfaces', () => {
  assert.match(docs.field, /AizanoiOS/i);
  assert.match(docs.field, /3\. Analytics/);
  assert.doesNotMatch(docs.field, /3\. Aizanoi Analytics|11 canonical apps|Research Workspace|Field Terminal|Workspace Monitor/i);
  assert.match(docs.security, /retired/i);
  assert.match(docs.security, /Workbench/i);
});

test('canonical brand docs lock Aizanoi Analytics as umbrella company and Analytics as the analytical product', () => {
  for (const document of currentBrandDocs) {
    assert.match(document, /Aizanoi Analytics/i);
    assert.doesNotMatch(document, /Aizanoi is the umbrella brand|umbrella brand is \*\*Aizanoi\*\*|Aizanoi Analytics is one product family/i);
  }
  assert.match(docs.product, /Aizanoi Analytics.*company.*primary public brand.*umbrella/is);
  assert.match(docs.agents, /Aizanoi Analytics.*company and umbrella brand/is);
  assert.match(docs.hermes, /Aizanoi Analytics.*company and umbrella brand/is);
  assert.match(docs.architecture, /Aizanoi Analytics remains the company\/umbrella brand/is);
  assert.match(docs.contributing, /Aizanoi Analytics.*company and umbrella brand/is);
  assert.match(docs.product, /\*\*Analytics\*\*/);
  assert.match(docs.agents, /public label \*\*Analytics\*\*/);
  assert.match(docs.field, /visible analytical product; `\/analytics\/` and the internal app id `analytics` are stable contracts/i);
  assert.match(docs.product, /public route is `\/analytics\/`/);
  assert.match(docs.agents, /app id is `analytics`/);
  assert.match(docs.hermes, /visible label \*\*Analytics\*\*/);
});

test('maintained documentation no longer presents Field System or retired reader tooling as current operations', () => {
  assert.doesNotMatch(docs.docsReadme, /canonical Field System v3|v3 shell, app, responsive and local-workspace contract/i);
  assert.doesNotMatch(docs.operations, /The Field System service worker|aizanoi-field-shell|FIELD SYSTEM DESKTOP|FIELD SYSTEM TABLET|FIELD SYSTEM MOBILE|PDF reader/i);
  assert.doesNotMatch(docs.changelog, /^## Unreleased — Field System/m);
  assert.match(docs.changelog, /Superseded Field System consolidation/);
  assert.match(docs.changelog, /not the current public product contract/i);
});

test('contribution guidance points developers toward current canonical owners', () => {
  assert.match(docs.contributing, /Aizanoi Analytics/i);
  assert.match(docs.contributing, /Analytics/);
  assert.doesNotMatch(docs.contributing, /final\.css|polish\.css|unified\.css|responsive-fix\.css/i);
});

test('product documentation keeps the approved News categories and current product families visible', () => {
  for (const label of ['AI', 'Technology', 'Economy / Markets', 'Football']) assert.match(docs.product, new RegExp(label.replace('/', '\\/')));
  for (const label of ['Aizanoi News', 'Aizanoi TV', 'Analytics', 'Aizanoi Forge', 'Historical Worlds', 'Aizanoi Labs', 'Aizanoi Arcade']) {
    assert.match(docs.product, new RegExp(label));
  }
});
