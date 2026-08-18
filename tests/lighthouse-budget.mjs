import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('Usage: node tests/lighthouse-budget.mjs <report.json>');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const categories = report.categories || {};

const budgets = {
  performance: 0.65,
  accessibility: 0.90,
  'best-practices': 0.85,
  seo: 0.90,
};

for (const [name, minimum] of Object.entries(budgets)) {
  const score = categories[name]?.score;
  assert.equal(typeof score, 'number', `Lighthouse category ${name} missing`);
  assert.ok(score >= minimum, `${name} score ${score.toFixed(2)} is below ${minimum.toFixed(2)}`);
}

const requiredAudits = ['document-title','meta-description','viewport','http-status-code','is-crawlable'];
for (const id of requiredAudits) {
  const audit = report.audits?.[id];
  if (!audit || audit.score === null) continue;
  assert.ok(audit.score >= 0.9, `${id} audit failed (${audit.score})`);
}

console.log('Lighthouse budgets passed:', Object.fromEntries(Object.keys(budgets).map((name)=>[name,categories[name].score])));
