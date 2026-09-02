#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/hr/sanitize-public-dashboard.mjs <generated-dashboard.html> [...]');
  process.exit(2);
}

const replacements = Object.freeze([
  [/Turnike, Tekno ve Arvato kayıtları/g, 'Turnike ve harici sistem kayıtları'],
  [/Arvato OTIF/g, 'Lojistik OTIF'],
  [/\bArvato\b/g, 'Lojistik Sağlayıcı'],
  [/"source_file":"[^"]+\.xlsx"/g, '"source_file":"synthetic-hr-dataset"'],
  [/"source":"[^"]+\.xlsx"/g, '"source":"synthetic-hr-dataset"'],
  [/"fiili_source":"[^"]+\.xlsx"/g, '"fiili_source":"synthetic-hr-dataset"'],
  [/Kaynak:\s*[^<`"']+\.xlsx/gi, 'Kaynak: Sentetik HR veri seti'],
]);

const prohibited = Object.freeze([
  { label:'external/vendor identifier', pattern:/\bArvato\b/i },
  { label:'internal workbook filename', pattern:/\b[^\s<>"'`]+\.xlsx\b/i },
]);

for (const file of files) {
  let html = await readFile(file, 'utf8');
  for (const [pattern, replacement] of replacements) html = html.replace(pattern, replacement);

  const violations = prohibited.filter(({ pattern }) => pattern.test(html));
  if (violations.length) {
    console.error(`${file}: public HR sanitization incomplete: ${violations.map((item) => item.label).join(', ')}`);
    process.exitCode = 1;
    continue;
  }
  await writeFile(file, html);
}

if (!process.exitCode) console.log(`Sanitized ${files.length} public HR dashboard HTML file(s).`);
