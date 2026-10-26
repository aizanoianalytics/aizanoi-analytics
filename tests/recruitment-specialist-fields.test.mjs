import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html', 'utf8');

test('both specialist filters have the exact requested label and independent source keys', () => {
  assert.match(html, /<label>İşe Alım Uzmanı<\/label>\s*<div class="multi-filter" data-multi-filter="responsible"/);
  assert.match(html, /\["recruiter", "İşe Alım Uzmanı"\]/);
  assert.match(html, /recruiter: ctClean\(get\(row, "Recruiter"\)\)/);
  assert.match(html, /text\(record\[key\]\)/);
  assert.match(html, /ct\.filters\[/);
  assert.match(html, /state\.globalFilters\[/);
});
