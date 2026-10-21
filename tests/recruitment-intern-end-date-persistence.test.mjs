import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboardPath = 'frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html';
const html = readFileSync(dashboardPath, 'utf8');

test('manual intern end dates use stable applicant keys and persist in portable HTML settings', () => {
  assert.match(html, /function internApplicantKey\(rowIdx\)/);
  assert.match(html, /T\.C\. Kimlik Numarası/);
  assert.match(html, /const id = String\(internCell\(rowIdx, "Id"\)/);
  assert.match(html, /Telefon numaranız/);
  assert.match(html, /function hydrateInternEndOverrides\(payload\)/);
  assert.match(html, /function syncInternEndOverridesToPayload\(\)/);
  assert.match(html, /settings\.internEndDateOverrides/);
  assert.match(html, /syncInternEndOverridesToPayload\(\)[\s\S]*?JSON\.stringify\(state\.portablePayload\)/);
});

test('intern import restores manual dates even when automatic calculation fails', () => {
  assert.match(html, /calculatedEnd = calcInternEndDate/);
  assert.match(html, /catch \(error\)[\s\S]*?calculationError = error/);
  assert.match(html, /const override = internEndOverrides\.get\(internApplicantKey\(rowIdx\)\)/);
  assert.match(html, /if \(!override && calculationError\) throw calculationError/);
  assert.match(html, /override \|\| calculatedEnd/);
});

test('page lock remains a fixed full-viewport modal before unlock', () => {
  assert.match(html, /#internPageLock\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*z-index:\s*9999/);
  assert.match(html, /#internPageLock\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(html, /\.page-lock-box\s*\{/);
});

test('resetting a manual end date removes its persisted setting', () => {
  assert.match(html, /internEndOverrides\.delete\(internApplicantKey\(rowIdx\)\)/);
  assert.match(html, /internEndOverrides\.set\(key, new Date\(y, m - 1, d\)\)/);
  assert.match(html, /syncInternEndOverridesToPayload\(\)/);
});
