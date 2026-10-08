import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dashboardPath = 'frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html';
const html = readFileSync(dashboardPath, 'utf8');

const EMBED_VIEW = 'https://igairportaero-my.sharepoint.com/:x:/g/personal/furkan_cakmak_igairport_aero/IQCbFZYRxjZlQbglXYNtVZmwAbmN26iPLnmgcjx_vuI-zLY?rtime=xBgjuSwl30g&action=embedview';
const DOWNLOAD = 'https://igairportaero-my.sharepoint.com/:x:/g/personal/furkan_cakmak_igairport_aero/IQCbFZYRxjZlQbglXYNtVZmwAbmN26iPLnmgcjx_vuI-zLY?rtime=xBgjuSwl30g&download=1';
const BACKEND_DEFAULT = 'http://localhost:18923/dosya';

function liveCard() {
  const start = html.indexOf('id="internLiveCard"');
  assert.ok(start > 0, 'missing Canli Gorunum card');
  return html.slice(Math.max(0, start - 500), start + 6000);
}

test('Intern panel adds a discoverable Canli Gorunum card with lazy SharePoint embedview iframe', () => {
  const card = liveCard();
  assert.match(card, /Canl. G.r.n.m/);
  assert.match(html, /<div[^>]+data-view-panel="intern-recruitment"[\s\S]*?id="internLiveCard"/);
  assert.match(html, /id="internLiveFrame"/);
  assert.match(html, /<iframe[^>]*id="internLiveFrame"[^>]*loading="lazy"/);
  assert.match(html, /<iframe[^>]*title="[^"]+"/);
  assert.ok(html.includes(`src="${EMBED_VIEW}"`), 'iframe must point at the SharePoint embedview URL');
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

test('Backend auto-load flow reuses the existing SheetJS parse, schema validation and internState pipeline', () => {
  assert.match(html, /<label[^>]*for="internBackendUrl"/);
  assert.match(html, /id="internBackendUrl"/);
  assert.ok(html.includes(`value="${BACKEND_DEFAULT}"`), 'backend URL input must default to the local proxy');
  assert.match(html, /id="internBackendLoadBtn"/);
  assert.match(html, /function handleInternBackendLoad\(\)/);
  assert.match(html, /handleInternBackendLoad[\s\S]*?fetch\s*\(/);
  assert.match(html, /handleInternBackendLoad[\s\S]*?arrayBuffer\(\)/);
  assert.match(html, /handleInternBackendLoad[\s\S]*?XLSX\.read\s*\(/);
  assert.match(html, /handleInternBackendLoad[\s\S]*?findInternRecruitmentSheet\s*\(/);
  assert.match(html, /handleInternBackendLoad[\s\S]*?renderInternRecruitmentRawData\s*\(/);
  assert.match(html, /handleInternBackendLoad[\s\S]*?toast\s*\(/);
  assert.match(html, /internBackendLoadBtn[\s\S]*?handleInternBackendLoad/);
});

test('Backend fetch is a read-only GET and the iframe is never scraped cross-origin', () => {
  const start = html.indexOf('function handleInternBackendLoad');
  assert.ok(start > 0, 'missing backend loader');
  const fn = html.slice(start, start + 4000);
  assert.doesNotMatch(fn, /localStorage|sessionStorage|indexedDB|sendBeacon|WebSocket|XMLHttpRequest/);
  assert.doesNotMatch(fn, /method:\s*["']POST/i);
  assert.match(html, /cross-origin/i);
  assert.match(html, /same-origin policy/i);
  assert.doesNotMatch(html, /getElementById\(["']internLiveFrame["']\)/);
  assert.doesNotMatch(html, /querySelector\([^)]*internLiveFrame/);
});

test('Live card follows the dashboard card/button/filter language and stays accessible and responsive', () => {
  const card = liveCard();
  assert.match(card, /class="card"/);
  assert.match(card, /class="card-header"/);
  assert.match(card, /class="card-title"/);
  assert.match(card, /class="card-subtitle"/);
  assert.match(html, /id="internBackendLoadBtn"[^>]*class="btn/);
  assert.match(html, /<label[^>]*for="internBackendUrl"[^>]*>/);
  assert.match(html, /<label[^>]*for="internBackendUrl"[^>]*>[^<]*Backend/i);
  assert.match(html, /#internLiveCard/);
  assert.match(html, /#internLiveFrame\s*\{[^}]*width:\s*100%/);
  assert.match(html, /@media[^{]*\{[\s\S]*?#internLiveFrame[\s\S]*?\}/);
  assert.match(html, /internBackendUrl[^>]*aria-describedby|aria-describedby[^>]*internBackend/i);
});
