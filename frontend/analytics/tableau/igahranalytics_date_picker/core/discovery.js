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
    let inspectedCount = 0;
    for (const filter of list) {
      let field;
      try {
        field = await filter.getFieldAsync();
        inspectedCount += 1;
      } catch {
        continue;
      }
      const dataType = normalizeDateType(field?.dataType);
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
      },
    });
  }
  return out;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
