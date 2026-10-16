/* igahranalytics_date_picker — range-filter apply engine (no UI, no storage).
 *
 * Semantics:
 * - Only explicitly enabled targets are touched; worksheets without a target
 *   (opt-out / excluded) are never called.
 * - Each worksheet receives its own configured field caption via
 *   applyRangeFilterAsync(caption, { min, max, nullOption }).
 * - Concurrency is capped at 3; per-target results are collected so partial
 *   success is reported truthfully and Retry can target only failures.
 * - Verification re-reads the resulting filter metadata: a matching caption
 *   with matching day bounds is `applied-verified`; unreadable metadata is
 *   `applied-unverified`; a missing caption or mismatched bounds is
 *   `mismatch`; a rejected apply is `failed`.
 * - createLatestQueue serializes Apply presses so overlapping requests cannot
 *   interleave: the running request finishes, superseded pending requests
 *   resolve `{ superseded: true }`, and only the latest committed range runs.
 */

import { parseCivilDate, toTableauRange } from './dates.js';
import { resolveWorksheet } from './settings.js';

export const MAX_CONCURRENCY = 3;
export const NULL_OPTION = 'NON_NULL_VALUES';

function sameDay(value, civil) {
  return (
    value instanceof Date &&
    !Number.isNaN(value.getTime()) &&
    value.getFullYear() === civil.year &&
    value.getMonth() === civil.month - 1 &&
    value.getDate() === civil.day
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function verifyApplied(sheet, caption, start, end) {
  let filters;
  try {
    filters = await sheet.getFiltersAsync();
  } catch {
    return { status: 'applied-unverified', detail: 'filter metadata unavailable after apply' };
  }
  const match = (Array.isArray(filters) ? filters : []).find(
    (filter) => String(filter.fieldName) === caption,
  );
  if (!match) {
    return { status: 'mismatch', detail: `no resulting filter named ${JSON.stringify(caption)}` };
  }
  if (match.minValue !== undefined && match.maxValue !== undefined) {
    if (sameDay(match.minValue, start) && sameDay(match.maxValue, end)) {
      return { status: 'applied-verified' };
    }
    return { status: 'mismatch', detail: 'resulting filter bounds differ from the applied range' };
  }
  return { status: 'applied-verified' };
}

async function runWithLimit(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  const workers = new Array(Math.min(limit, tasks.length)).fill(null).map(async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Apply one civil range to every selected target. Returns per-target results
 * in target order: { worksheetId, worksheetName, fieldCaption, status, detail? }.
 */
export async function applyMappings({
  worksheets,
  targets,
  start,
  end,
  nullOption = NULL_OPTION,
  onlyWorksheetIds = null,
} = {}) {
  const startCivil = typeof start === 'string' ? parseCivilDate(start) : start;
  const endCivil = typeof end === 'string' ? parseCivilDate(end) : end;
  const sheets = Array.isArray(worksheets) ? worksheets : [];
  const selected = (Array.isArray(targets) ? targets : []).filter(
    (target) => target.enabled !== false
      && (!onlyWorksheetIds || onlyWorksheetIds.has(target.worksheetId)),
  );
  const tasks = selected.map((target) => async () => {
    const sheet = resolveWorksheet(target, sheets);
    if (!sheet) {
      return {
        worksheetId: target.worksheetId,
        worksheetName: target.worksheetName,
        fieldCaption: target.fieldCaption,
        status: 'skipped',
        detail: 'worksheet not found or mapping is ambiguous',
      };
    }
    let range;
    try {
      range = toTableauRange(startCivil, endCivil, target.fieldType);
    } catch (error) {
      return {
        worksheetId: target.worksheetId,
        worksheetName: target.worksheetName,
        fieldCaption: target.fieldCaption,
        status: 'failed',
        detail: errorMessage(error),
      };
    }
    try {
      await sheet.applyRangeFilterAsync(target.fieldCaption, {
        min: range.min,
        max: range.max,
        nullOption,
      });
    } catch (error) {
      return {
        worksheetId: target.worksheetId,
        worksheetName: target.worksheetName,
        fieldCaption: target.fieldCaption,
        status: 'failed',
        detail: errorMessage(error),
      };
    }
    const verdict = await verifyApplied(sheet, target.fieldCaption, startCivil, endCivil);
    return {
      worksheetId: target.worksheetId,
      worksheetName: target.worksheetName,
      fieldCaption: target.fieldCaption,
      ...verdict,
    };
  });
  return runWithLimit(tasks, MAX_CONCURRENCY);
}

/**
 * Clear only mapped targets that opted into Reset. Unrelated filters and
 * reset-disabled mappings are never touched.
 */
export async function clearMappings({ worksheets, targets } = {}) {
  const sheets = Array.isArray(worksheets) ? worksheets : [];
  const selected = (Array.isArray(targets) ? targets : []).filter(
    (target) => target.enabled !== false && target.resetEnabled !== false,
  );
  const tasks = selected.map((target) => async () => {
    const sheet = resolveWorksheet(target, sheets);
    if (!sheet) {
      return {
        worksheetId: target.worksheetId,
        worksheetName: target.worksheetName,
        fieldCaption: target.fieldCaption,
        status: 'skipped',
        detail: 'worksheet not found or mapping is ambiguous',
      };
    }
    try {
      await sheet.clearFilterAsync(target.fieldCaption);
      return {
        worksheetId: target.worksheetId,
        worksheetName: target.worksheetName,
        fieldCaption: target.fieldCaption,
        status: 'cleared',
      };
    } catch (error) {
      return {
        worksheetId: target.worksheetId,
        worksheetName: target.worksheetName,
        fieldCaption: target.fieldCaption,
        status: 'failed',
        detail: errorMessage(error),
      };
    }
  });
  return runWithLimit(tasks, MAX_CONCURRENCY);
}

/** Latest-wins serializer: at most one worker runs; pending collapses to latest. */
export function createLatestQueue(worker) {
  let busy = false;
  let pending = null;
  async function execute(task) {
    try {
      const value = await worker(task.value);
      task.resolve(value);
    } catch (error) {
      task.reject(error);
    } finally {
      if (pending) {
        const nextTask = pending;
        pending = null;
        execute(nextTask);
      } else {
        busy = false;
      }
    }
  }
  return {
    run(value) {
      return new Promise((resolve, reject) => {
        const task = { value, resolve, reject };
        if (!busy) {
          busy = true;
          execute(task);
        } else {
          if (pending) pending.resolve({ superseded: true });
          pending = task;
        }
      });
    },
  };
}
