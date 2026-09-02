#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/hr/sanitize-public-dashboard.mjs <generated-dashboard.html> [...]');
  process.exit(2);
}

const PIPELINE = resolve('analytics/dashboards/hr-analytics-full-set/production-pipeline');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function collectWorkbookBasenames(directory, names = new Set()) {
  let entries = [];
  try { entries = await readdir(directory, { withFileTypes:true }); } catch { return names; }
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collectWorkbookBasenames(path, names);
    else if (entry.isFile() && /\.xlsx$/i.test(entry.name)) names.add(entry.name);
  }
  return names;
}

async function workbookBasenames() {
  const names = await collectWorkbookBasenames(PIPELINE);
  // Canonical integrated output is created during rebuild. Keep it explicit so
  // standalone sanitizer/audit runs protect it before a fresh rebuild too.
  names.add('icmal_sorgu_sonuc.xlsx');
  return [...names].sort((a, b) => b.length - a.length || a.localeCompare(b, 'en'));
}

const replacements = Object.freeze([
  [/Turnike, Tekno ve Arvato kayıtları/g, 'Turnike ve harici sistem kayıtları'],
  [/Arvato OTIF/g, 'Lojistik OTIF'],
  [/\bArvato\b/g, 'Lojistik Sağlayıcı'],
  [/\bAyaydın Merkez\b/g, 'Kurumsal Merkez'],
  [/\bTekno\b/g, 'Harici Sistem'],
]);

const prohibitedIdentifiers = Object.freeze([
  { category:'vendor', label:'Arvato vendor identifier', pattern:/\bArvato\b/i },
  { category:'partner', label:'Tekno partner identifier', pattern:/\bTekno\b/i },
  { category:'company', label:'Ayaydın company identifier', pattern:/\bAyaydın\b/i },
]);

const identityMetadata = /"(company|brand|vendor|partner|customer|client|project)(?:_name|_id|_code)"\s*:\s*"([^"]+)"/gi;
const personMetadata = /"(employee_name|person_name|contact_name|manager_name)"\s*:\s*"([^"]+)"/gi;
const allowedSyntheticIdentity = /^(?:aizanoi|aurelia|borealis|cyrene|synthetic|example|generic|logistics|lojistik|external|harici|corporate|kurumsal|employee\b|person\b)/i;
const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const allowedEmailDomain = /(?:^|\.)(?:example\.com|example\.org|example\.net|aizanoi\.test|invalid)$/i;
const sourceMetadata = /"(?:source_file|source|fiili_source)"\s*:\s*"([^"]*\.xlsx)"/gi;

function identityViolations(html) {
  const violations = [];
  for (const rule of prohibitedIdentifiers) if (rule.pattern.test(html)) violations.push(`${rule.category}: ${rule.label}`);

  for (const match of html.matchAll(identityMetadata)) {
    const [, key, value] = match;
    if (!allowedSyntheticIdentity.test(value.trim())) violations.push(`${key}: non-synthetic public identity metadata`);
  }
  for (const match of html.matchAll(personMetadata)) {
    const [, key, value] = match;
    if (!allowedSyntheticIdentity.test(value.trim())) violations.push(`${key}: person identity metadata`);
  }
  for (const match of html.matchAll(emailPattern)) {
    const domain = match[1];
    if (!allowedEmailDomain.test(domain)) violations.push('email: non-fixture address');
  }
  for (const match of html.matchAll(sourceMetadata)) violations.push(`source metadata: ${match[1]}`);
  return [...new Set(violations)];
}

const internalWorkbooks = await workbookBasenames();

for (const file of files) {
  let html = await readFile(file, 'utf8');
  for (const [pattern, replacement] of replacements) html = html.replace(pattern, replacement);

  for (const workbook of internalWorkbooks) {
    const replacement = workbook === 'fiili_list.xlsx' ? 'synthetic-workforce-roster' : 'synthetic-hr-dataset';
    html = html.replace(new RegExp(escapeRegExp(workbook), 'gi'), replacement);
  }

  // Normalize visitor-facing provenance after exact basename replacement. We do
  // not ban arbitrary `.xlsx` text because generated JS may legitimately carry
  // parser/regex literals such as `\\.xlsx`.
  html = html.replace(/Kaynak:\s*synthetic-hr-dataset/gi, 'Kaynak: Sentetik HR veri seti');

  const violations = identityViolations(html);
  const residualWorkbook = internalWorkbooks.find((workbook) => new RegExp(escapeRegExp(workbook), 'i').test(html));
  if (residualWorkbook) violations.push(`internal workbook filename: ${residualWorkbook}`);

  if (violations.length) {
    console.error(`${file}: public HR sanitization incomplete`);
    for (const violation of [...new Set(violations)]) console.error(`  - ${violation}`);
    process.exitCode = 1;
    continue;
  }
  await writeFile(file, html);
}

if (!process.exitCode) console.log(`Sanitized ${files.length} public HR dashboard HTML file(s); ${internalWorkbooks.length} internal workbook basename(s) protected.`);
