import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dashboardPath = 'frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html';
const html = readFileSync(dashboardPath, 'utf8');

const EMBED_VIEW = 'https://igairportaero-my.sharepoint.com/:x:/g/personal/furkan_cakmak_igairport_aero/IQCbFZYRxjZlQbglXYNtVZmwAbmN26iPLnmgcjx_vuI-zLY?rtime=xBgjuSwl30g&action=embedview';
const DOWNLOAD = 'https://igairportaero-my.sharepoint.com/:x:/g/personal/furkan_cakmak_igairport_aero/IQCbFZYRxjZlQbglXYNtVZmwAbmN26iPLnmgcjx_vuI-zLY?rtime=xBgjuSwl30g&download=1';

function liveCard() {
  const start = html.indexOf('id="internLiveCard"');
  assert.ok(start > 0, 'missing Canli Gorunum card');
  return html.slice(Math.max(0, start - 500), start + 6000);
}

test('Intern panel adds a discoverable Canli Gorunum card without a blocked SharePoint iframe', () => {
  const card = liveCard();
  assert.match(card, /Canl. G.r.n.m/);
  assert.match(html, /<div[^>]+data-view-panel="import"[\s\S]*?id="internLiveCard"/);
  assert.doesNotMatch(html, /id="internLiveFrame"/);
  assert.doesNotMatch(html, /<iframe[^>]*internLive/);
  assert.match(html, /id="internLiveOpen"/);
  assert.match(html, /target="_blank"/);
  assert.ok(html.includes(`href="${EMBED_VIEW}"`), 'open link must point at the SharePoint file URL');
  assert.match(html, /SharePoint[^\n<]*engell|engell[^\n<]*SharePoint/i);
  assert.match(html, /internet gerekir/i);
});

test('Canli Gorunum card links the current Excel download without embedding applicant rows', () => {
  assert.match(html, /id="internLiveDownload"/);
  assert.ok(html.includes(`href="${DOWNLOAD}"`), 'download link must use the SharePoint download=1 URL');
  assert.match(html, /G.ncel Exceli indir/);
  const tracked = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
  assert.equal(tracked.status, 0, tracked.stderr);
  assert.doesNotMatch(tracked.stdout, /İGA Staj Başvuru Formu\.xlsx|IGA-Staj-Basvuru-Formu\.xlsx/);
  assert.doesNotMatch(html, /<script[^>]+id="internRecruitmentEmbeddedData"/);
});

test('Import Center carries no backend controls and no network upload path', () => {
  assert.doesNotMatch(html, /internBackendUrl/);
  assert.doesNotMatch(html, /internBackendLoadBtn/);
  assert.doesNotMatch(html, /handleInternBackendLoad/);
  assert.doesNotMatch(html, /localhost:18923/);
  assert.doesNotMatch(html, /id="internLiveFrame"/);
  assert.doesNotMatch(html, /<iframe[^>]*internLive/);
});

test('Unified routing feeds the existing SheetJS parse, schema validation and internState pipeline', () => {
  assert.match(html, /async function routeSingleWorkbook\(file\)/);
  assert.match(html, /routeSingleWorkbook[\s\S]*?detectWorkbookKind\(buffer\)/);
  assert.match(html, /routeSingleWorkbook[\s\S]*?resetInternRecruitmentState\(\)/);
  assert.match(html, /routeSingleWorkbook[\s\S]*?findInternRecruitmentSheet\s*\(/);
  assert.match(html, /routeSingleWorkbook[\s\S]*?renderInternRecruitmentRawData\s*\(/);
  assert.match(html, /handleUnifiedExcelFiles[\s\S]*?toast\s*\(/);
  const start = html.indexOf('async function routeSingleWorkbook');
  assert.ok(start > 0, 'missing unified router');
  const fn = html.slice(start, start + 4000);
  assert.doesNotMatch(fn, /localStorage|sessionStorage|indexedDB|sendBeacon|WebSocket|XMLHttpRequest/);
  assert.doesNotMatch(fn, /method:\s*["']POST/i);
  assert.match(html, /cross-origin/i);
  assert.match(html, /same-origin policy/i);
});

test('Page lock asks the password on every load and never persists unlock', () => {
  assert.match(html, /id="internPageLock"/);
  assert.match(html, /id="internPageLockInput"/);
  assert.match(html, /id="internPageLockBtn"/);
  assert.match(html, /id="internPageLockError"/);
  assert.match(html, /function (unlockInternPage|handleInternPageUnlock)/);
  assert.match(html, /crypto\.subtle\.digest\(\s*["']SHA-256["']/);
  assert.match(html, /INTERN_PAGE_LOCK_HASH\s*=\s*["'][0-9a-f]{64}["']/);
  const start = html.indexOf('id="internPageLock"');
  const card = html.slice(Math.max(0, start - 2000), start + 8000);
  assert.doesNotMatch(card, /localStorage|sessionStorage/);
});

test('Lock verifier exposes no plaintext password in tracked files', () => {
  assert.doesNotMatch(html, /Timur1905/);
  const tracked = spawnSync('git', ['grep', '-l', 'Timur1905', '--', ':!*.log', ':!tests/recruitment-intern-live.test.mjs'], { encoding: 'utf8' });
  assert.equal((tracked.stdout || '').trim(), '');
});
test('Live card follows the dashboard card/button/filter language and stays accessible and responsive', () => {
  const card = liveCard();
  assert.match(card, /class="card"/);
  assert.match(card, /class="card-header"/);
  assert.match(card, /class="card-title"/);
  assert.match(card, /class="card-subtitle"/);
  assert.match(html, /id="unifiedExcelDropzone"[^>]*tabindex="0"[^>]*role="button"/);
  assert.match(html, /id="unifiedExcelInput"[^>]*multiple/);
  assert.match(html, /#internLiveCard/);
  assert.match(html, /#internLiveCard\s*\{[^}]*scroll-margin-top/);
  assert.match(html, /@media[^{]*\{[\s\S]*?\.import-grid[\s\S]*?\}/);
  assert.match(html, /id="internImportResult"[^>]*role="status"/);
});
