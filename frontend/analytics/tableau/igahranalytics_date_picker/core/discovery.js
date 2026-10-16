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
      out.push({ ...identity, fields: [], error: errorMessage(error) });
      continue;
    }
    const fields = [];
    for (const filter of Array.isArray(filters) ? filters : []) {
      let field;
      try {
        field = await filter.getFieldAsync();
      } catch {
        continue;
      }
      const dataType = String(field?.dataType || '').toUpperCase();
      if (dataType !== 'DATE' && dataType !== 'DATETIME') continue;
      const caption = String(filter.fieldName ?? field.name ?? '');
      if (!caption) continue;
      fields.push({ caption, dataType });
    }
    out.push({ ...identity, fields });
  }
  return out;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
