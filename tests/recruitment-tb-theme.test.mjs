import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboardPath = 'frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html';
const html = readFileSync(dashboardPath, 'utf8');

test('pink tb-theme is selectable, persisted and restored', () => {
  assert.match(html, /:root\[data-theme="tb-theme"\]\s*\{/);
  assert.match(html, /data-theme-set="tb-theme"[^>]*>[^<]*<i[^>]*><\/i>tb-theme<\/button>/);
  assert.match(html, /\["momentum",\s*"night",\s*"tb-theme",\s*"forest",\s*"forest-light"\]\.includes\(name\)/);
  assert.match(html, /savedTheme === "tb-theme"/);
  assert.match(html, /--t-brand:\s*#d94f8a/);
  assert.match(html, /--t-brand-l:\s*#fde8f2/);
  assert.match(html, /data-theme="tb-theme"[\s\S]*?\.ip-btn[^\{]*\{[^}]*color:\s*#24101a/);
});

test('night theme uses a pastel status palette with dark accessible active text', () => {
  const night = html.match(/:root\[data-theme="night"\]\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  for (const pastel of ['#8fb9e8', '#f3a07d', '#74c9a9', '#f2ca79', '#eda8c1', '#8fc98f', '#b8afea', '#ef9b9b']) {
    assert.match(night, new RegExp(pastel));
  }
  assert.match(html, /data-theme="night"[\s\S]*?\.ip-btn[^\{]*\{[^}]*color:\s*#24101a/);
});

test('weekly intern workload is removed', () => {
  assert.doesNotMatch(html, /Haftalık stajyer yükü/i);
  assert.doesNotMatch(html, /function\s+internWeeklyLoadHtml/);
});

test('unit intern status uses an accessible radial infographic', () => {
  assert.match(html, /function\s+internUnitRadialHtml\(items\)/);
  assert.match(html, /class="ip-unit-radial"/);
  assert.match(html, /<svg[^>]*role="img"[^>]*aria-label="Birim bazında stajda olan ve başlayacak stajyerler"/);
  assert.match(html, /class="ip-unit-radial-center"/);
  assert.match(html, /internUnitRadialHtml\(unitItems\)/);
  const unitItemsSource = html.slice(html.indexOf('const unitItems'), html.indexOf('host.innerHTML', html.indexOf('const unitItems')));
  assert.doesNotMatch(unitItemsSource, /\.slice\(0,\s*8\)/);
  assert.doesNotMatch(html, /vzStackedRows\(unitItems,\s*INTERN_LIFE_SEGS/);
});

test('active intern modal traps focus and isolates the background', () => {
  assert.match(html, /function\s+setInternActiveModalIsolation\(active\)/);
  assert.match(html, /sibling\.inert\s*=\s*active/);
  assert.match(html, /event\.key\s*===\s*"Tab"[\s\S]*?internActiveModal/);
});

test('supplied dashboard keeps all three workbook routing destinations', () => {
  assert.match(html, /if \(outcome\.kind === "recruitment"\) recruitmentLoaded = true/);
  assert.match(html, /if \(outcome\.kind === "intern"\) internLoaded = true/);
  assert.match(html, /if \(outcome\.kind === "candidate"\) candidateLoaded = true/);
  assert.match(html, /const KIND_LABEL = \{ recruitment: "İşe alım panosu", intern: "Staj paneli", candidate: "Aday Takip panosu" \}/);
});
