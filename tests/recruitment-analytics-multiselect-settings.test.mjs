import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html";
const html = readFileSync(path, "utf8");
const fields = ["year", "unit", "responsible", "status", "level_category", "resource"];

test("Recruitment global dimensions use Excel-style multi-select shells", () => {
  for (const field of fields) {
    assert.match(html, new RegExp(`data-multi-filter="${field}"`));
    assert.doesNotMatch(html, new RegExp(`<select[^>]+data-global-filter="${field}"`));
  }
  assert.match(html, /data-global-filter="q"/);
  assert.match(html, /data-multi-select-all/);
  assert.match(html, /data-multi-clear/);
  assert.match(html, /data-multi-apply/);
  assert.match(html, /data-multi-cancel/);
  assert.match(html, /state\.filterDrafts\[field\] = new Set\(applied\)/);
});

test("Recruitment multi-select state is applied as an array filter", () => {
  assert.match(html, /if \(Array\.isArray\(val\)\)/);
  assert.match(html, /if \(val\.length === 0\) return false/);
  assert.match(html, /if \(!val\.includes\(text\(record\[key\]\)\)\) return false/);
  assert.match(html, /options\.filter\(value => draft\.has\(value\)\)/);
});

test("Recruitment Settings exposes adjacent Included and Excluded controls", () => {
  assert.match(html, /data-view="settings"/);
  assert.match(html, /data-view-panel="settings"/);
  assert.match(html, /data-settings-dimension="unit"/);
  assert.match(html, /data-settings-dimension="position_name"/);
  assert.match(html, />Included</);
  assert.match(html, />Excluded</);
  assert.match(html, /Exclude selected →/);
  assert.match(html, /← Include selected/);
  assert.match(html, /id="resetRecruitmentExclusions"/);
});

test("Settings exclusions are browser-local and form a global analysis boundary", () => {
  assert.match(html, /aizanoi-recruitment-settings-v1/);
  assert.match(html, /localStorage\.getItem\(SETTINGS_STORAGE_KEY\)/);
  assert.match(html, /localStorage\.setItem\(SETTINGS_STORAGE_KEY/);
  assert.match(html, /function recordExcluded\(record\)/);
  assert.match(html, /state\.excludedValues\.unit\.has\(text\(record\.unit\)\)/);
  assert.match(html, /state\.excludedValues\.position_name\.has\(text\(record\.position_name\)\)/);
  assert.match(html, /function recordMatches\(record, filters\) \{\s*if \(recordExcluded\(record\)\) return false/);
  assert.match(html, /function reconcileGlobalFiltersToOptions\(\)/);
  assert.match(html, /reconcileGlobalFiltersToOptions\(\);/);
});

test("Reset Filters does not erase Settings exclusions", () => {
  const resetStart = html.indexOf('$("#clearGlobalFilters").addEventListener');
  const resetEnd = html.indexOf('document.addEventListener("input", event => {', resetStart);
  assert.ok(resetStart >= 0 && resetEnd > resetStart);
  const resetBlock = html.slice(resetStart, resetEnd);
  assert.doesNotMatch(resetBlock, /excludedValues\.[a-z_]+\.clear\(/);
  assert.match(html, /function resetRecruitmentExclusions\(\)/);
});

test("Settings remains usable on narrow screens", () => {
  assert.match(html, /@media \(max-width: 820px\)[\s\S]*?\.nav-tabs \{ width: 100%; max-width: 100%; overflow-x: auto;/);
  assert.match(html, /\.settings-transfer-grid \{ grid-template-columns: minmax\(0, 1fr\); min-width: 0; \}/);
  assert.match(html, /\.settings-transfer-actions \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); width: 100%; min-width: 0; \}/);
  assert.match(html, /\.settings-transfer-actions \.btn \{ width: auto; min-width: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere; \}/);
});
