import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboardPath = 'frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html';
const html = readFileSync(dashboardPath, 'utf8');
const SHAREPOINT = 'https://igairportaero-my.sharepoint.com/:x:/g/personal/furkan_cakmak_igairport_aero/IQDHYNfzo2bAT7yoJKW6Q9cBARs_TyxhYtNL5vT7AvV4aO8?e=wSB2tT&ovuser=5aa63893-b271-4562-b8b5-ddf329374aca%2Ceda.kartal%40igairport.aero';
const DOWNLOAD = `${SHAREPOINT}&download=1`;
const BACKEND = 'http://localhost:18923/recruitment-dosya';

test('Recruitment Excel Loader mirrors the intern live-workbook controls with the approved link', () => {
  assert.match(html, /id="recruitmentLiveCard"/);
  assert.match(html, /id="recruitmentLiveOpen"/);
  assert.ok(html.includes(`href="${SHAREPOINT}"`), 'open action must preserve the approved SharePoint link exactly');
  assert.match(html, /id="recruitmentLiveDownload"/);
  assert.ok(html.includes(`href="${DOWNLOAD}"`), 'download action must derive from the approved SharePoint link');
  assert.match(html, /id="recruitmentBackendUrl"/);
  assert.ok(html.includes(`value="${BACKEND}"`), 'recruitment needs a distinct editable backend endpoint');
  assert.match(html, /id="recruitmentBackendLoadBtn"/);
  assert.doesNotMatch(html, /<iframe[^>]*recruitmentLive/i);
});

test('Recruitment backend load is read-only and reuses the ordinary dashboard import pipeline', () => {
  const start = html.indexOf('async function handleRecruitmentBackendLoad');
  assert.ok(start > 0, 'missing recruitment backend loader');
  const fn = html.slice(start, start + 5000);
  assert.match(fn, /fetch\s*\(/);
  assert.doesNotMatch(fn, /method:\s*["']POST/i);
  assert.match(fn, /arrayBuffer\(\)/);
  assert.match(fn, /ingestRecruitmentWorkbook\s*\(/);
  assert.doesNotMatch(fn, /localStorage|sessionStorage|indexedDB|sendBeacon|WebSocket|XMLHttpRequest/);
  assert.match(html, /recruitmentBackendLoadBtn[\s\S]*?handleRecruitmentBackendLoad/);
});

test('Hosted HTTPS mode disables the localhost companion service before CSP or mixed-content failure', () => {
  assert.match(html, /function configureRecruitmentBackendAvailability\(\)/);
  assert.match(html, /window\.location\.protocol === "https:"/);
  assert.match(html, /window\.location\.hostname/);
  assert.match(html, /recruitmentBackendLoadBtn[\s\S]*?disabled = hostedHttps/);
  assert.match(html, /recruitmentBackendUrl[\s\S]*?disabled = hostedHttps/);
  assert.match(html, /configureRecruitmentBackendAvailability\(\)/);
});

test('Local recruitment upload and backend upload share one workbook parser', () => {
  assert.match(html, /async function ingestRecruitmentWorkbook\(buffer, sourceName\)/);
  assert.match(html, /const RECRUITMENT_WORKBOOK_HEADERS = Object\.freeze\(\["check_area", \.\.\.FIELD_KEYS\]\)/);
  assert.match(html, /invalidHeaders[\s\S]*?Recruitment workbook headers do not match the required A.Q schema/);
  const localStart = html.indexOf('async function handleExcelFile');
  const localFn = html.slice(localStart, localStart + 1800);
  assert.match(localFn, /ingestRecruitmentWorkbook\(buffer, file\.name\)/);
  assert.match(html, /XLSX\.read\(buffer, \{ type: "array", cellDates: true, cellFormula: false \}\)/);
  assert.match(html, /applyPayload\(payload\)/);
});
