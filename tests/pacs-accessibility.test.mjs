import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../frontend/analytics/dashboards/new-hr-collection/pacs/index.html', import.meta.url), 'utf8');

test('workbook picker has a real button and a non-clickable-div dropzone', () => {
  assert.match(html, /<button type="button" class="button" id="pacsChooseBtn">Choose workbook<\/button>/);
  assert.doesNotMatch(html, /id="pacsDropzone"[^>]*onclick/);
  assert.match(html, /dz\.addEventListener\('drop'/);
});

test('drill-down has keyboard-accessible buttons', () => {
  assert.match(html, /<button type="button" class="person-link/);
  assert.match(html, /data-open-person=/);
  assert.match(html, /data-open-org=/);
  assert.doesNotMatch(html, /<div class="person-link/);
});

test('coarse pointers get 44px targets', () => {
  assert.match(html, /@media \(pointer:coarse\)\{[\s\S]*min-height:44px/);
});

test('filter menu is labelled, traps Tab and restores focus', () => {
  assert.match(html, /aria-label="Search \$\{escapeHtml\(colLabel\)\} values"/);
  assert.match(html, /role', 'dialog'/);
  assert.match(html, /anchor\.focus\(\)/);
  assert.match(html, /ev\.key !== 'Tab'/);
});

test('portable export discloses embedded records and confirms visitor data', () => {
  assert.match(html, /id="exportNote">Includes all currently loaded employee records/);
  assert.match(html, /visitor_workbook = true/);
  assert.match(html, /window\.confirm\('This portable file will embed every employee record/);
});

test('import view states local-only processing and escapes error text', () => {
  assert.match(html, /Your data stays in this browser/);
  assert.match(html, /escapeHtml\(\(err && err\.message\)/);
  assert.match(html, /id="pacsUploadStatus"[^>]*role="status"/);
});
