import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboardPath = 'frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html';
const html = readFileSync(dashboardPath, 'utf8');
const SHAREPOINT = 'https://igairportaero-my.sharepoint.com/:x:/g/personal/furkan_cakmak_igairport_aero/IQDHYNfzo2bAT7yoJKW6Q9cBARs_TyxhYtNL5vT7AvV4aO8?e=wSB2tT&ovuser=5aa63893-b271-4562-b8b5-ddf329374aca%2Ceda.kartal%40igairport.aero';
const DOWNLOAD = `${SHAREPOINT}&download=1`;

test('Excel Import Center hosts both workbooks with their approved SharePoint actions', () => {
  assert.match(html, /<div[^>]+data-view-panel="import"[\s\S]*?id="recruitmentLiveCard"/);
  assert.match(html, /<div[^>]+data-view-panel="import"[\s\S]*?id="internLiveCard"/);
  assert.match(html, /id="recruitmentLiveOpen"/);
  assert.ok(html.includes(`href="${SHAREPOINT}"`), 'open action must preserve the approved SharePoint link exactly');
  assert.match(html, /id="recruitmentLiveDownload"/);
  assert.ok(html.includes(`href="${DOWNLOAD}"`), 'download action must derive from the approved SharePoint link');
  assert.match(html, /id="internLiveOpen"/);
  assert.match(html, /id="internLiveDownload"/);
  assert.doesNotMatch(html, /<iframe[^>]*recruitmentLive/i);
});

test('Backend URL controls are gone from markup, styles, and logic', () => {
  assert.doesNotMatch(html, /recruitmentBackendUrl/);
  assert.doesNotMatch(html, /recruitmentBackendLoadBtn/);
  assert.doesNotMatch(html, /recruitmentBackendHint/);
  assert.doesNotMatch(html, /internBackendUrl/);
  assert.doesNotMatch(html, /internBackendLoadBtn/);
  assert.doesNotMatch(html, /internBackendHint/);
  assert.doesNotMatch(html, /handleRecruitmentBackendLoad/);
  assert.doesNotMatch(html, /handleInternBackendLoad/);
  assert.doesNotMatch(html, /configureRecruitmentBackendAvailability/);
  assert.doesNotMatch(html, /localhost:18923/);
});

test('Unified multi-file dropzone routes every workbook by header schema', () => {
  assert.match(html, /id="unifiedExcelDropzone"/);
  assert.match(html, /id="unifiedExcelInput"[^>]*multiple/);
  assert.match(html, /id="unifiedImportResult"/);
  assert.match(html, /id="excelFileInput"[^>]*multiple/);
  assert.match(html, /id="internRecruitmentFileInput"[^>]*multiple/);
  assert.match(html, /async function handleUnifiedExcelFiles\(fileList, target\)/);
  assert.match(html, /function detectWorkbookKind\(buffer\)/);
  assert.match(html, /async function routeSingleWorkbook\(file\)/);
  assert.match(html, /RECRUITMENT_WORKBOOK_HEADERS\.every/);
  assert.match(html, /INTERN_RECRUITMENT_HEADERS\.every/);
  assert.match(html, /beklenen iki yapıdan birine uymuyor/);
  assert.match(html, /bindImportDropzone\("#unifiedExcelDropzone", "#unifiedExcelInput", "#unifiedImportResult"\)/);
  assert.match(html, /bindImportDropzone\("#excelDropzone", "#excelFileInput", "#importResult"\)/);
  assert.match(html, /bindImportDropzone\("#internRecruitmentDropzone", "#internRecruitmentFileInput", "#internImportResult"\)/);
});

test('Local recruitment upload and unified upload share one workbook parser', () => {
  assert.match(html, /async function ingestRecruitmentWorkbook\(buffer, sourceName\)/);
  assert.match(html, /const RECRUITMENT_WORKBOOK_HEADERS = Object\.freeze\(\["check_area", \.\.\.FIELD_KEYS\]\)/);
  assert.match(html, /invalidHeaders[\s\S]*?Recruitment workbook headers do not match the required A.Q schema/);
  const localStart = html.indexOf('async function handleExcelFile');
  const localFn = html.slice(localStart, localStart + 800);
  assert.match(localFn, /handleUnifiedExcelFiles\(\[file\], \$\("#importResult"\)\)/);
  assert.match(html, /XLSX\.read\(buffer, \{ type: "array", cellDates: true, cellFormula: false \}\)/);
  assert.match(html, /applyPayload\(payload\)/);
});
