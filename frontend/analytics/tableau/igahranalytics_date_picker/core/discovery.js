/* igahranalytics_date_picker — filter discovery (pure adapter, no UI).
 *
 * Discovery reads ONLY existing filter metadata: worksheet.getFiltersAsync()
 * plus each filter's getFieldAsync(). It never calls underlying/summary data
 * APIs and never invents fields — only DATE/DATETIME captions Tableau already
 * exposes are returned as mapping candidates.
 */

function sheetIdentity(sheet, index) {
  return {
    id: String(sheet.id ?? sheet.name ?? `sheet-${index}`),
    name: String(sheet.name ?? sheet.id ?? `sheet-${index}`),
  };
}

function normalizeDateType(value) {
  // Official Tableau Extensions API DataType enum values are lowercase:
  // DataType.Date === "date", DataType.DateTime === "date-time".
  // Accept legacy/fixture spellings too, but always emit our canonical values.
  const compact = String(value || '').trim().toLowerCase().replace(/[\s_-]/g, '');
  if (compact === 'date') return 'DATE';
  if (compact === 'datetime') return 'DATETIME';
  return null;
}

function valueCandidates(dataValue) {
  if (dataValue === undefined || dataValue === null) return [];
  if (dataValue instanceof Date) return [dataValue];
  if (typeof dataValue !== 'object') return [dataValue];
  return [dataValue.nativeValue, dataValue.value, dataValue.formattedValue]
    .filter((value) => value !== undefined && value !== null);
}

function dateShape(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getHours() || value.getMinutes() || value.getSeconds() || value.getMilliseconds()
      ? 'DATETIME' : 'DATE';
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  // Tableau filter DataValues commonly expose ISO native values and a
  // locale-formatted companion (the owner's Desktop shows 1.01.2025).
  const iso = /^\d{4}-\d{1,2}-\d{1,2}(?:[T\s](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(?:Z|[+-]\d{2}:?\d{2})?)?$/;
  const local = /^\d{1,2}[./-]\d{1,2}[./-]\d{4}(?:[T\s](\d{1,2}:\d{2}(?::\d{2})?))?$/;
  const match = text.match(iso) || text.match(local);
  return match ? (match[1] ? 'DATETIME' : 'DATE') : null;
}

function inferFilterDateType(filter) {
  const filterType = String(filter?.filterType || '').trim().toLowerCase();
  if (filterType === 'relative-date' || filterType === 'relativedate') return 'DATE';
  if (filterType !== 'range') return null;
  const low = valueCandidates(filter.minValue).map(dateShape).find(Boolean);
  const high = valueCandidates(filter.maxValue).map(dateShape).find(Boolean);
  if (!low || !high) return null; // Do not mistake numeric range filters for dates.
  return low === 'DATETIME' || high === 'DATETIME' ? 'DATETIME' : 'DATE';
}

/**
 * List worksheets with their compatible DATE/DATETIME field captions.
 * Sheets whose metadata cannot be read report an empty field list with an
 * error note instead of failing the whole discovery pass.
 */
export async function discoverWorksheets(worksheets) {
  const sheets = Array.isArray(worksheets) ? worksheets : [];
  const out = [];
  for (const [index, sheet] of sheets.entries()) {
    const identity = sheetIdentity(sheet, index);
    let filters;
    try {
      filters = await sheet.getFiltersAsync();
    } catch (error) {
      out.push({
        ...identity,
        fields: [],
        error: errorMessage(error),
        diagnostics: { filterCount: 0, inspectedCount: 0, compatibleCount: 0 },
      });
      continue;
    }
    const list = Array.isArray(filters) ? filters : [];
    const fields = [];
    const seen = new Set();
    const observedTypes = [];
    let inspectedCount = 0;
    for (const filter of list) {
      let field;
      try {
        field = await filter.getFieldAsync();
        inspectedCount += 1;
        observedTypes.push(field?.dataType === undefined || field?.dataType === null
          ? '(missing)' : String(field.dataType));
      } catch {
        continue;
      }
      const dataType = normalizeDateType(field?.dataType) || inferFilterDateType(filter);
      if (!dataType) continue;
      const caption = String(filter.fieldName ?? field.name ?? '').trim();
      if (!caption) continue;
      const dedupeKey = `${caption}\u0000${dataType}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      fields.push({ caption, dataType });
    }
    out.push({
      ...identity,
      fields,
      diagnostics: {
        filterCount: list.length,
        inspectedCount,
        compatibleCount: fields.length,
        observedTypes,
      },
    });
  }
  return out;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
