import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ANALYTICS_SETS } from '../../frontend/analytics/catalog.js';

const META_START = '<!-- AIZANOI_PUBLIC_META_START -->';
const META_END = '<!-- AIZANOI_PUBLIC_META_END -->';
const BAR_START = '<!-- AIZANOI_PUBLIC_BAR_START -->';
const BAR_END = '<!-- AIZANOI_PUBLIC_BAR_END -->';
const SITE_ORIGIN = 'https://aizanoianalytics.com';
const HR_VISIBLE_EN_SRC = '/analytics/dashboards/hr-analytics-full-set/hr-public-en-visible.js';

const HR_SET = ANALYTICS_SETS.find((set) => set.id === 'hr-analytics-full-set');
if (!HR_SET) throw new Error('Canonical HR Analytics set is missing from frontend/analytics/catalog.js');
if (!HR_SET.interfaceLanguage || !HR_SET.interfaceLanguageCode) {
  throw new Error('HR Analytics set must declare interfaceLanguage and interfaceLanguageCode');
}

const DASHBOARDS = new Map(HR_SET.dashboards.map((dashboard) => {
  const match = dashboard.href.match(/\/([^/]+)\/$/);
  if (!match) throw new Error(`Dashboard route must end in /<id>/: ${dashboard.href}`);
  return [match[1], dashboard];
}));

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function stripManagedBlock(html, start, end) {
  const startIndex = html.indexOf(start);
  if (startIndex === -1) return html;
  if (html.indexOf(end, startIndex) === -1) {
    throw new Error(`Managed dashboard block is missing its closing marker: ${start}`);
  }
  const pattern = new RegExp(`[\\t ]*\\n?${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}[\\t ]*\\n?`, 'g');
  return html.replace(pattern, '\n');
}

function stripOwnedMetadata(html) {
  const patterns = [
    /<meta\b(?=[^>]*\bname\s*=\s*["']description["'])[^>]*>\s*/gi,
    /<meta\b(?=[^>]*\bname\s*=\s*["']theme-color["'])[^>]*>\s*/gi,
    /<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*>\s*/gi,
    /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:title["'])[^>]*>\s*/gi,
    /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:description["'])[^>]*>\s*/gi,
    /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:url["'])[^>]*>\s*/gi,
    /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:type["'])[^>]*>\s*/gi,
    /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:site_name["'])[^>]*>\s*/gi,
  ];
  return patterns.reduce((result, pattern) => result.replace(pattern, ''), html);
}

function withDocumentLanguage(html, languageCode) {
  return html.replace(/<html\b([^>]*)>/i, (_tag, attrs) => {
    const withoutLang = attrs.replace(/\s+lang\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '');
    return `<html lang="${escapeHtml(languageCode)}"${withoutLang}>`;
  });
}

function withTitle(html, title) {
  const titleMarkup = `<title>${escapeHtml(title)}</title>`;
  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, titleMarkup);
  }
  return html.replace(/<head\b[^>]*>/i, (head) => `${head}\n${titleMarkup}`);
}

function metadataBlock(dashboard) {
  const canonical = `${SITE_ORIGIN}${dashboard.href}`;
  const title = `${dashboard.title} — Aizanoi Analytics`;
  const description = dashboard.summary;
  return `${META_START}
<meta name="description" content="${escapeHtml(description)}">
<meta name="theme-color" content="#111827">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Aizanoi Analytics">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<style data-aizanoi-public-dashboard-style>
  .aizanoi-public-dashboard-bar{box-sizing:border-box;width:100%;min-height:38px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:7px 12px;border-bottom:1px solid rgba(148,163,184,.28);background:#111827;color:#e5e7eb;font:600 12px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.01em}
  .aizanoi-public-dashboard-bar a{min-height:24px;display:inline-flex;align-items:center;color:#f8fafc;text-decoration:none}
  .aizanoi-public-dashboard-bar a:hover,.aizanoi-public-dashboard-bar a:focus-visible{text-decoration:underline;text-underline-offset:3px}
  .aizanoi-public-dashboard-bar__language{margin-left:auto;padding:3px 8px;border:1px solid rgba(165,180,252,.35);border-radius:999px;background:rgba(79,70,229,.16);color:#e0e7ff;white-space:nowrap}
  body[data-aizanoi-dashboard="corporate-goals"] .status-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  body[data-aizanoi-dashboard="corporate-goals"] .status-item{grid-template-columns:auto minmax(0,1fr) auto;min-width:0}
  body[data-aizanoi-dashboard="corporate-goals"] .status-item span{min-width:0;overflow-wrap:anywhere}
  body[data-aizanoi-dashboard="corporate-goals"] .color-scale{min-width:0}
  .aizanoi-embedded-dashboard .aizanoi-public-dashboard-bar{display:none!important}
  @media(max-width:640px){.aizanoi-public-dashboard-bar{gap:7px;padding:7px 9px;font-size:11px}.aizanoi-public-dashboard-bar__language{width:100%;margin-left:0;border-radius:7px}}
</style>
<script>try{if(window.self!==window.top)document.documentElement.classList.add('aizanoi-embedded-dashboard')}catch{}</script>
<script data-aizanoi-hr-public-en-visible src="${HR_VISIBLE_EN_SRC}"></script>
${META_END}`;
}

function navigationBlock() {
  return `${BAR_START}
<nav class="aizanoi-public-dashboard-bar" aria-label="Aizanoi Analytics dashboard navigation">
  <a href="/analytics/dashboards/hr-analytics-full-set/" target="_top">Aizanoi Analytics · HR Analytics Full Set</a>
  <span aria-hidden="true">·</span>
  <a href="/analytics/" target="_top">Back to Analytics</a>
  <span class="aizanoi-public-dashboard-bar__language">Interface language: ${escapeHtml(HR_SET.interfaceLanguage)}</span>
</nav>
${BAR_END}`;
}

export function decorateDashboardHtml(html, dashboardId) {
  const dashboard = DASHBOARDS.get(dashboardId);
  if (!dashboard) throw new Error(`Unknown public HR dashboard id: ${dashboardId}`);
  if (!/<html\b/i.test(html) || !/<head\b/i.test(html) || !/<body\b/i.test(html)) {
    throw new Error(`${dashboardId} is missing a complete html/head/body document shell`);
  }

  let next = stripManagedBlock(html, META_START, META_END);
  next = stripManagedBlock(next, BAR_START, BAR_END);
  next = stripOwnedMetadata(next);
  next = withDocumentLanguage(next, HR_SET.interfaceLanguageCode);
  next = withTitle(next, `${dashboard.title} — Aizanoi Analytics`);
  next = next.replace(/<\/head>/i, `${metadataBlock(dashboard)}\n</head>`);
  next = next.replace(/<body\b([^>]*)>/i, (_body, attrs) => {
    const cleanAttrs = attrs.replace(/\s+data-aizanoi-dashboard\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '');
    return `<body data-aizanoi-dashboard="${escapeHtml(dashboardId)}"${cleanAttrs}>\n${navigationBlock()}`;
  });
  return next;
}

export function decorateDashboardFile(file) {
  const dashboardId = basename(dirname(file));
  const html = readFileSync(file, 'utf8');
  const decorated = decorateDashboardHtml(html, dashboardId);
  if (decorated !== html) writeFileSync(file, decorated, 'utf8');
  return dashboardId;
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error('Pass one or more canonical public HR dashboard HTML files');
  const decorated = files.map(decorateDashboardFile);
  console.log(`Decorated ${decorated.length} public HR dashboard(s): ${decorated.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
