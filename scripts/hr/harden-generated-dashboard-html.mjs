#!/usr/bin/env node

import { basename } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

// The canonical generators embed static JSON in application/json script tags.
// Keep source-parity Python untouched and escape data-derived text here before
// generated HTML/SVG templates are parsed by the browser.
const plans = new Map([
  ['ERD_P_admin.html', [
    ['${fmt(r.risk_puani,1)}', '${esc(fmt(r.risk_puani,1))}'],
    ['${fmt(r.performans_bilesik,1)}', '${esc(fmt(r.performans_bilesik,1))}'],
  ]],
  ['magaza_takip_dosya.html', [
    ['${shortMonth(r.month)}', '${esc(shortMonth(r.month))}'],
    ['${monthName(r.month)}', '${esc(monthName(r.month))}'],
    ['${monthName(pt.m)}', '${esc(monthName(pt.m))}'],
    ['${def.fmt(last?.[def.key]||0)}', '${esc(def.fmt(last?.[def.key]||0))}'],
    ['${def.fmt(r[def.key])}', '${esc(def.fmt(r[def.key]))}'],
    ['${pct(pt.v)}', '${esc(pct(pt.v))}'],
  ]],
  ['performans_dashboard.html', [
    // The dashboard template reads these values from its embedded JSON data
    // and writes them through innerHTML. Escape every data-derived display
    // value at the generated-artifact boundary before browser HTML parsing.
    ['${num(DATA.meta.person_count,0)}', '${esc(num(DATA.meta.person_count,0))}'],
    ['${num(DATA.meta.mandatory_count,0)}', '${esc(num(DATA.meta.mandatory_count,0))}'],
    ['<option>${y}</option>', '<option>${esc(y)}</option>'],
    ['<option>${m}</option>', '<option>${esc(m)}</option>'],
    ['<option value="${m}">${monthLabel(m)}</option>', '<option value="${esc(m)}">${esc(monthLabel(m))}</option>'],
  ]],
]);

function replaceRequired(text, unsafeToken, safeToken, fileName) {
  if (text.includes(unsafeToken)) {
    return text.split(unsafeToken).join(safeToken);
  }
  if (text.includes(safeToken)) {
    return text;
  }
  throw new Error(`${fileName}: expected generated HTML token was not found: ${unsafeToken}`);
}

async function harden(filePath) {
  const fileName = basename(filePath);
  const plan = plans.get(fileName);
  if (!plan) {
    throw new Error(`No generated-dashboard hardening plan registered for ${fileName}`);
  }

  const original = await readFile(filePath, 'utf8');
  let hardened = original;
  for (const [unsafeToken, safeToken] of plan) {
    hardened = replaceRequired(hardened, unsafeToken, safeToken, fileName);
  }

  if (hardened !== original) {
    await writeFile(filePath, hardened, 'utf8');
    console.log(`[hr-hardening] hardened ${filePath}`);
  } else {
    console.log(`[hr-hardening] already hardened ${filePath}`);
  }
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/hr/harden-generated-dashboard-html.mjs <generated-html> [...]');
  process.exit(2);
}

for (const file of files) {
  await harden(file);
}
