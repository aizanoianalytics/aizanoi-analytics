#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/hr/sanitize-public-dashboard.mjs <generated-dashboard.html> [...]');
  process.exit(2);
}

const PIPELINE = resolve('analytics/dashboards/hr-analytics-full-set/production-pipeline');
const OUTPUTS = resolve(PIPELINE, 'dashboardlar');
const PUBLIC_DOWNLOAD = 'hr-analytics-full-set-synthetic-output.xlsx';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function workbookBasenames() {
  const names = new Set();
  for (const directory of [PIPELINE, OUTPUTS]) {
    let entries = [];
    try { entries = await readdir(directory, { withFileTypes:true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.isFile() && /\.xlsx$/i.test(entry.name) && entry.name !== PUBLIC_DOWNLOAD) names.add(entry.name);
    }
  }
  // The canonical integrated output is generated during every rebuild, but keep
  // it explicit so standalone sanitizer/audit runs remain deterministic too.
  names.add('icmal_sorgu_sonuc.xlsx');
  return [...names].sort((a, b) => b.length - a.length || a.localeCompare(b, 'en'));
}

const replacements = Object.freeze([
  [/Turnike, Tekno ve Arvato kayıtları/g, 'Turnike ve harici sistem kayıtları'],
  [/Arvato OTIF/g, 'Lojistik OTIF'],
  [/\bArvato\b/g, 'Lojistik Sağlayıcı'],
]);

const prohibited = Object.freeze([
  { label:'external/vendor identifier', pattern:/\bArvato\b/i },
]);

const internalWorkbooks = await workbookBasenames();

for (const file of files) {
  let html = await readFile(file, 'utf8');
  for (const [pattern, replacement] of replacements) html = html.replace(pattern, replacement);

  for (const workbook of internalWorkbooks) {
    const replacement = workbook === 'fiili_list.xlsx' ? 'synthetic-workforce-roster' : 'synthetic-hr-dataset';
    html = html.replace(new RegExp(escapeRegExp(workbook), 'gi'), replacement);
  }

  // Normalize source metadata after basename replacement. The values remain
  // useful provenance labels without exposing build-machine workbook names.
  html = html
    .replace(/("source_file"\s*:\s*")synthetic-hr-dataset("?)/gi, '$1synthetic-hr-dataset$2')
    .replace(/("source"\s*:\s*")synthetic-hr-dataset("?)/gi, '$1synthetic-hr-dataset$2')
    .replace(/("fiili_source"\s*:\s*")synthetic-workforce-roster("?)/gi, '$1synthetic-workforce-roster$2')
    .replace(/Kaynak:\s*synthetic-hr-dataset/gi, 'Kaynak: Sentetik HR veri seti');

  const violations = prohibited.filter(({ pattern }) => pattern.test(html));
  const residualWorkbook = internalWorkbooks.find((workbook) => new RegExp(escapeRegExp(workbook), 'i').test(html));
  const unexpectedWorkbook = [...html.matchAll(/([^\s<>"'`]+\.xlsx)\b/gi)]
    .map((match) => basename(match[1]))
    .find((name) => name !== PUBLIC_DOWNLOAD);

  if (violations.length || residualWorkbook || unexpectedWorkbook) {
    const labels = violations.map((item) => item.label);
    if (residualWorkbook || unexpectedWorkbook) labels.push('internal workbook filename');
    console.error(`${file}: public HR sanitization incomplete: ${[...new Set(labels)].join(', ')}`);
    if (residualWorkbook) console.error(`  residual internal workbook: ${residualWorkbook}`);
    if (unexpectedWorkbook) console.error(`  unexpected workbook token: ${unexpectedWorkbook}`);
    process.exitCode = 1;
    continue;
  }
  await writeFile(file, html);
}

if (!process.exitCode) console.log(`Sanitized ${files.length} public HR dashboard HTML file(s); ${internalWorkbooks.length} internal workbook basename(s) protected.`);
