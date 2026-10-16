/* igahranalytics_date_picker — settings schema (pure, no Tableau dependency).
 *
 * Only non-sensitive configuration is persisted: worksheet identifiers, field
 * captions, locale and UI preferences. Employee rows, credentials, filter
 * values and workbook data must never enter this object.
 */

export const SCHEMA_VERSION = 1;

/** Product default locale: Turkish, with English as the user-selectable option. */
export const DEFAULT_LOCALE = 'tr-TR';

const LOCALES = new Set(['tr-TR', 'en-US']);

function normalizeLocale(value) {
  return LOCALES.has(value) ? value : 'tr-TR';
}

function normalizeFieldType(value) {
  const type = String(value || 'DATE').toUpperCase();
  return type === 'DATETIME' ? 'DATETIME' : 'DATE';
}

function asBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeTarget(raw) {
  const worksheetName = String(raw.worksheetName ?? raw.sheetName ?? '');
  const fieldCaption = String(raw.fieldCaption ?? '');
  if (!worksheetName || !fieldCaption) return null;
  return {
    worksheetId: String(raw.worksheetId ?? ''),
    worksheetName,
    fieldCaption,
    fieldType: normalizeFieldType(raw.fieldType),
    enabled: asBool(raw.enabled, true),
    resetEnabled: asBool(raw.resetEnabled, true),
  };
}

export function defaultSettings() {
  return { version: SCHEMA_VERSION, locale: 'tr-TR', targets: [] };
}

/**
 * Parse persisted settings text. Corrupt input falls back to defaults;
 * legacy `{ locale, mappings: [...] }` payloads migrate to `{ targets: [...] }`.
 */
export function parseSettings(text) {
  let raw;
  try {
    raw = JSON.parse(String(text));
  } catch {
    return defaultSettings();
  }
  if (!raw || typeof raw !== 'object') return defaultSettings();
  const legacy = Array.isArray(raw.mappings) ? raw.mappings : [];
  const current = Array.isArray(raw.targets) ? raw.targets : legacy;
  const targets = [];
  for (const entry of current) {
    if (!entry || typeof entry !== 'object') continue;
    const target = normalizeTarget(entry);
    if (target) targets.push(target);
  }
  return {
    version: SCHEMA_VERSION,
    locale: normalizeLocale(raw.locale),
    targets,
  };
}

/** Serialize with an explicit allowlist so unknown/sensitive keys never persist. */
export function serializeSettings(settings) {
  const targets = Array.isArray(settings.targets) ? settings.targets : [];
  const clean = [];
  for (const entry of targets) {
    const target = normalizeTarget(entry);
    if (target) clean.push(target);
  }
  return JSON.stringify({
    version: SCHEMA_VERSION,
    locale: normalizeLocale(settings.locale),
    targets: clean,
  });
}

/**
 * Resolve a persisted target against live worksheets. Object id wins (it
 * survives renames); otherwise an exact worksheet name resolves only when it
 * is unique. Ambiguous or missing references return null — never a guess.
 */
export function resolveWorksheet(ref, worksheets) {
  const sheets = Array.isArray(worksheets) ? worksheets : [];
  const id = String(ref.worksheetId ?? '');
  if (id) {
    const byId = sheets.find((sheet) => String(sheet.id) === id);
    if (byId) return byId;
  }
  const name = String(ref.worksheetName ?? '');
  if (!name) return null;
  const matches = sheets.filter((sheet) => sheet.name === name);
  return matches.length === 1 ? matches[0] : null;
}
