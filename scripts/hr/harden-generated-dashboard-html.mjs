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
    // PR-1: renderPoolSearch now uses esc() for the data-add attribute value
    // (was unescaped ${p.i}; p.i is a numeric poolPeople index but escape makes
    // the helper consistent with every other interpolation in the same template).
    // Idempotent guard: only apply if not already esc()'d.
    ['data-add="${p.i}"', 'data-add="${esc(p.i)}"'],
    // renderBonusSettings writes user-editable bonus coefficients (persisted
    // in localStorage under aizanoi_bonus_settings_v2) into the `value="..."`
    // attribute of inputs inside an innerHTML template. The key loop variable
    // `k` ranges over a fixed literal list, but the VALUE r[k] is
    // attacker-influenced local state — it must be esc()'d, never classified
    // safe just because the index is numeric. Idempotent guard: the canonical
    // Python template already emits the esc() form.
    ["data-key=\"${k}\" value=\"${r[k]??''}\"", "data-key=\"${esc(k)}\" value=\"${esc(r[k]??'')}\""],
    ['data-bonus-grade="${esc(r.grade)}" value="${r.value}"', 'data-bonus-grade="${esc(r.grade)}" value="${esc(r.value)}"'],
    // The delete-scenario button column formatter interpolates the row index
    // raw into a data attribute inside an innerHTML template. v is numeric in
    // practice but the formatter contract cannot prove it — escape at source.
    ['data-del-scenario="${v}"', 'data-del-scenario="${esc(v)}"'],
  ]],
  ['hedefler_dashboard.html', [
    // PR-1: the canonical Python template (hedefler_dashboard_template.py) now
    // writes esc() around data-period values and CSS-custom-property tones.
    // The hardener's idempotent guard ensures these substitutions are
    // no-ops if the template already includes esc() — we register them
    // explicitly so the hardener accepts this file in its input set and
    // emits "already hardened" rather than failing with "no plan registered".
    ['data-period="${p.key}"', 'data-period="${esc(p.key)}"'],
    ['style="--tone:${c[3]}"', 'style="--tone:${esc(c[3])}"'],
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
