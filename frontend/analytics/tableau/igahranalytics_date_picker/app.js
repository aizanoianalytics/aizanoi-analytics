/* IGA HR Analytics — Date Picker (main UI).
 *
 * Contract: filter UI only. This module initializes the Extensions API,
 * reads worksheet/filter METADATA (getFiltersAsync + filter.getFieldAsync),
 * and writes range filters per configured caption (applyRangeFilterAsync /
 * clearFilterAsync). It never reads row-level data, never stores workbook
 * data, never contacts the network, and never persists Tableau settings —
 * settings are written exclusively by the configuration dialog (config.js).
 */
import {
  parseCivilDate,
  formatCivilDate,
  civilToString,
  daysInMonth,
  presetRange,
} from './core/dates.js';
import { parseSettings, resolveWorksheet } from './core/settings.js';
import { applyMappings, clearMappings, createLatestQueue, NULL_OPTION } from './core/apply.js';
import { discoverWorksheets } from './core/discovery.js';

const APP_URL = 'https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/';
const SETTINGS_KEY = 'igahranalytics_date_picker';
const DEFAULT_LOCALE = 'tr-TR';
const PRESET_ORDER = [
  'this-month', 'last-month', 'this-year', 'last-year',
  'last-30-days', 'last-12-calendar-months', 'custom',
];

const MONTHS = {
  'tr-TR': ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
  'en-US': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const WEEKDAYS = {
  // tr-TR weeks start on Monday per the product spec.
  'tr-TR': ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
  'en-US': ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const STRINGS = {
  'tr-TR': {
    presets: {
      'this-month': 'Bu ay', 'last-month': 'Geçen ay', 'this-year': 'Bu yıl',
      'last-year': 'Geçen yıl', 'last-30-days': 'Son 30 gün',
      'last-12-calendar-months': 'Son 12 ay', 'custom': 'Özel aralık',
    },
    start: 'Başlangıç tarihi', end: 'Bitiş tarihi', apply: 'Uygula', reset: 'Temizle',
    retry: 'Başarısızları yeniden dene', details: 'Ayrıntılar',
    connected: 'Tableau bağlı', mock: 'Standalone mock', applying: 'Uygulanıyor…',
    applied: 'Uygulandı', partial: 'Kısmi başarı', failed: 'Başarısız',
    cleared: 'Temizlendi', idle: 'Hazır', notConfigured: 'Yapılandırılmadı',
    configTitle: 'Yapılandırma özeti', openConfig: 'Yapılandırma penceresini aç',
    configHintTableau: 'Eşleştirmeleri değiştirmek için uzantı bölgesine sağ tıklayın → Yapılandır… seçeneğini kullanın.',
    configHintMock: 'Deneme kipinde eşleştirmeler sabittir; gerçek yapılandırma Tableau içindeki iletişim kutusundan yapılır.',
    appliedLabel: (s, e) => `Uygulanan aralık: ${s} – ${e}`,
    draftLabel: (s, e) => `Taslak: ${s} – ${e} (henüz uygulanmadı)`,
    invalidRange: 'Geçersiz aralık: başlangıç, bitişten sonra olamaz ve tarihler gerçek takvim günleri olmalıdır (1900–2100).',
    noTargets: 'Uygulanacak hedef yok. Önce Tableau içinde Yapılandır… ile en az bir çalışma sayfası eşleştirin.',
    summaryLine: (ok, total) => `${total} hedeften ${ok} tanesi güncellendi`,
    mockNote: 'Standalone mock — synthetic sample data, Tableau’ya bağlı değil. Buradaki “başarı” gerçek bir filtre anlamına gelmez.',
    privacy: 'Yalnızca filtre üstverisi okunur; satır verisi okunmaz, ağ çağrısı yapılmaz, telemetri yoktur.',
    modeTableau: 'Tableau Desktop içinde çalışıyor', modeMock: 'Düz tarayıcıda çalışıyor (deneme)',
  },
  'en-US': {
    presets: {
      'this-month': 'This month', 'last-month': 'Last month', 'this-year': 'This year',
      'last-year': 'Last year', 'last-30-days': 'Last 30 days',
      'last-12-calendar-months': 'Last 12 months', 'custom': 'Custom range',
    },
    start: 'Start date', end: 'End date', apply: 'Apply', reset: 'Reset',
    retry: 'Retry failed', details: 'Details',
    connected: 'Tableau connected', mock: 'Standalone mock', applying: 'Applying…',
    applied: 'Applied', partial: 'Partial success', failed: 'Failed',
    cleared: 'Cleared', idle: 'Ready', notConfigured: 'Not configured',
    configTitle: 'Configuration summary', openConfig: 'Open configuration dialog',
    configHintTableau: 'To change mappings, right-click the extension zone and choose Configure… from the Tableau context menu.',
    configHintMock: 'Mappings are fixed in mock mode; real configuration happens in the Tableau dialog.',
    appliedLabel: (s, e) => `Applied range: ${s} – ${e}`,
    draftLabel: (s, e) => `Draft: ${s} – ${e} (not applied yet)`,
    invalidRange: 'Invalid range: start must not be after end, and dates must be real calendar days (1900–2100).',
    noTargets: 'No targets to apply. Map at least one worksheet via Configure… inside Tableau first.',
    summaryLine: (ok, total) => `Updated ${ok} of ${total} targets`,
    mockNote: 'Standalone mock — synthetic sample data, not connected to Tableau. “Success” here proves no real filter.',
    privacy: 'Reads filter metadata only; no row data, no network calls, no telemetry.',
    modeTableau: 'Running inside Tableau Desktop', modeMock: 'Running in a plain browser (mock)',
  },
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayCivil(now = new Date()) {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

const els = {
  appTitle: document.getElementById('app-title'),
  modeLine: document.getElementById('mode-line'),
  mockBanner: document.getElementById('mock-banner'),
  gear: document.getElementById('gear-btn'),
  panel: document.getElementById('config-popover'),
  configHeading: document.getElementById('config-heading'),
  configSummary: document.getElementById('config-summary'),
  configHint: document.getElementById('config-hint'),
  configAction: document.getElementById('config-action'),
  presetRow: document.getElementById('preset-row'),
  startLabel: document.getElementById('start-label'),
  endLabel: document.getElementById('end-label'),
  startInput: document.getElementById('start-input'),
  endInput: document.getElementById('end-input'),
  calendarBtn: document.getElementById('calendar-btn'),
  calendar: document.getElementById('calendar-popover'),
  calPrev: document.getElementById('cal-prev'),
  calTitle: document.getElementById('cal-title'),
  calNext: document.getElementById('cal-next'),
  calWeek: document.getElementById('cal-week'),
  calGrid: document.getElementById('cal-grid'),
  appliedLine: document.getElementById('applied-line'),
  formError: document.getElementById('form-error'),
  applyButton: document.getElementById('apply-btn'),
  resetButton: document.getElementById('reset-btn'),
  retryButton: document.getElementById('retry-btn'),
  badge: document.getElementById('status-badge'),
  message: document.getElementById('status-message'),
  details: document.getElementById('result-details'),
  resultSummary: document.getElementById('result-summary'),
  resultList: document.getElementById('result-list'),
  privacy: document.getElementById('privacy-note'),
  localeTr: document.getElementById('locale-tr'),
  localeEn: document.getElementById('locale-en'),
};

const state = {
  locale: DEFAULT_LOCALE,
  mode: 'boot',
  dashboard: null,
  settings: parseSettings(''),
  draft: { start: '', end: '', preset: 'last-30-days' },
  applied: null,
  lastResults: [],
  tableauApi: null,
  calView: null,
  calAnchor: null,
};

function t() {
  return STRINGS[state.locale] || STRINGS['tr-TR'];
}

function nullOptionValue() {
  const api = state.tableauApi;
  if (api && api.FilterNullOption && api.FilterNullOption.NonNullValues) {
    return api.FilterNullOption.NonNullValues;
  }
  return NULL_OPTION;
}

function setBadge(status, text) {
  els.badge.dataset.state = status;
  els.badge.textContent = text;
}

function showError(text) {
  if (!text) {
    els.formError.hidden = true;
    els.formError.textContent = '';
    return;
  }
  els.formError.hidden = false;
  els.formError.textContent = text;
}

function enabledTargets() {
  return state.settings.targets.filter((target) => target.enabled !== false);
}

function renderStatic() {
  const s = t();
  document.documentElement.lang = state.locale === 'en-US' ? 'en' : 'tr';
  els.appTitle.textContent = state.locale === 'en-US'
    ? 'IGA HR Analytics — Date Picker' : 'IGA HR Analitik — Tarih Seçici';
  els.configHeading.textContent = s.configTitle;
  els.configHint.textContent = state.mode === 'tableau' ? s.configHintTableau : s.configHintMock;
  els.startLabel.textContent = s.start;
  els.endLabel.textContent = s.end;
  els.applyButton.textContent = s.apply;
  els.resetButton.textContent = s.reset;
  els.retryButton.textContent = s.retry;
  els.resultSummary.textContent = s.details;
  els.privacy.textContent = s.privacy;
  els.localeTr.setAttribute('aria-pressed', String(state.locale !== 'en-US'));
  els.localeEn.setAttribute('aria-pressed', String(state.locale === 'en-US'));
  els.presetRow.innerHTML = '';
  for (const id of PRESET_ORDER) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dp-preset';
    button.dataset.preset = id;
    button.textContent = s.presets[id] || id;
    button.setAttribute('aria-pressed', String(state.draft.preset === id));
    button.addEventListener('click', () => selectPreset(id));
    els.presetRow.appendChild(button);
  }
  if (state.mode === 'mock') {
    els.mockBanner.hidden = false;
    els.mockBanner.textContent = s.mockNote;
  }
  renderConfigSummary();
  renderCalendar();
}

function renderConfigSummary() {
  const targets = enabledTargets();
  if (targets.length === 0) {
    els.configSummary.innerHTML = `<p class="dp-hint">${escapeHtml(t().notConfigured)}</p>`;
  } else {
    els.configSummary.innerHTML = '<ul class="dp-results">' + targets.map((target) => {
      const sheet = state.dashboard ? resolveWorksheet(target, state.dashboard.worksheets) : null;
      const health = sheet ? 'ready' : 'missing';
      const label = sheet ? `${target.worksheetName} → ${target.fieldCaption}`
        : `${target.worksheetName} → ${target.fieldCaption} (missing)`;
      return `<li><span class="dp-health" data-health="${health}">${escapeHtml(label)}</span></li>`;
    }).join('') + '</ul>';
  }
  els.configAction.innerHTML = '';
  if (state.mode === 'tableau') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dp-ghost';
    button.textContent = t().openConfig;
    button.addEventListener('click', openConfigure);
    els.configAction.appendChild(button);
  } else {
    const link = document.createElement('a');
    link.className = 'dp-ghost';
    link.href = './config.html';
    link.textContent = t().openConfig;
    link.style.cssText = 'display:inline-flex;align-items:center;text-decoration:none;min-height:44px;padding:10px 18px;border-radius:10px;';
    els.configAction.appendChild(link);
  }
}

function renderDraft() {
  els.startInput.value = state.draft.start;
  els.endInput.value = state.draft.end;
  const s = t();
  if (state.draft.start && state.draft.end) {
    try {
      const a = formatCivilDate(parseCivilDate(state.draft.start), state.locale);
      const b = formatCivilDate(parseCivilDate(state.draft.end), state.locale);
      els.appliedLine.textContent = state.applied &&
        state.applied.start === state.draft.start && state.applied.end === state.draft.end
        ? s.appliedLabel(a, b) : s.draftLabel(a, b);
    } catch {
      els.appliedLine.textContent = '';
    }
  } else {
    els.appliedLine.textContent = '';
  }
  for (const button of els.presetRow.querySelectorAll('.dp-preset')) {
    button.setAttribute('aria-pressed', String(button.dataset.preset === state.draft.preset));
  }
  renderCalendar();
}

function selectPreset(id) {
  state.draft.preset = id;
  if (id !== 'custom') {
    try {
      const range = presetRange(id, todayCivil());
      state.draft.start = range.start;
      state.draft.end = range.end;
    } catch {
      // keep current draft; validation surfaces the problem on Apply
    }
  }
  showError('');
  renderDraft();
  renderStatic();
}

function readDraftFromInputs() {
  state.draft.preset = 'custom';
  state.draft.start = els.startInput.value;
  state.draft.end = els.endInput.value;
  showError('');
  renderDraft();
  renderStatic();
}

function validateDraft() {
  try {
    const start = parseCivilDate(state.draft.start);
    const end = parseCivilDate(state.draft.end);
    if (start.year > end.year || (start.year === end.year && (start.month > end.month ||
      (start.month === end.month && start.day > end.day)))) {
      return null;
    }
    return { start: state.draft.start, end: state.draft.end };
  } catch {
    return null;
  }
}

/* Compact popover calendar: month navigation, locale week start, keyboard
 * operation, visual range highlight. First click anchors the range start,
 * the second click completes it; a third click starts over. */
function calViewCivil() {
  if (state.calView) return state.calView;
  try {
    const end = parseCivilDate(state.draft.end);
    return { year: end.year, month: end.month };
  } catch {
    const today = todayCivil();
    return { year: today.year, month: today.month };
  }
}

function renderCalendar() {
  const view = calViewCivil();
  state.calView = view;
  const months = MONTHS[state.locale] || MONTHS['tr-TR'];
  els.calTitle.textContent = `${months[view.month - 1]} ${view.year}`;
  const week = WEEKDAYS[state.locale] || WEEKDAYS['tr-TR'];
  els.calWeek.innerHTML = week.map((d) => `<span>${escapeHtml(d)}</span>`).join('');
  const mondayFirst = state.locale !== 'en-US';
  const firstDow = new Date(view.year, view.month - 1, 1).getDay();
  const blanks = mondayFirst ? (firstDow + 6) % 7 : firstDow;
  const total = daysInMonth(view.year, view.month);
  let start = null;
  let end = null;
  try {
    start = parseCivilDate(state.draft.start);
    end = parseCivilDate(state.draft.end);
  } catch { /* no highlight without a valid draft */ }
  const inRange = (day) => {
    if (!start || !end) return false;
    const cur = civilToString({ year: view.year, month: view.month, day });
    return civilToString(start) <= cur && cur <= civilToString(end);
  };
  els.calGrid.innerHTML = '';
  for (let i = 0; i < blanks; i += 1) {
    const pad = document.createElement('span');
    pad.className = 'dp-calpad';
    pad.setAttribute('aria-hidden', 'true');
    els.calGrid.appendChild(pad);
  }
  for (let day = 1; day <= total; day += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dp-calday' + (inRange(day) ? ' in-range' : '');
    button.textContent = String(day);
    button.dataset.day = String(day);
    button.setAttribute('aria-label', `${day} ${months[view.month - 1]} ${view.year}`);
    button.addEventListener('click', () => pickCalendarDay(day));
    els.calGrid.appendChild(button);
  }
}

function pickCalendarDay(day) {
  const view = calViewCivil();
  const picked = civilToString({ year: view.year, month: view.month, day });
  if (!state.calAnchor || (state.draft.start && state.draft.end && state.calAnchor.done)) {
    state.calAnchor = { start: picked, done: false };
    state.draft.start = picked;
    state.draft.end = picked;
  } else {
    const [a, b] = [state.calAnchor.start, picked].sort();
    state.draft.start = a;
    state.draft.end = b;
    state.calAnchor.done = true;
  }
  state.draft.preset = 'custom';
  showError('');
  renderDraft();
  renderStatic();
}

function shiftCalendarMonth(delta) {
  const view = calViewCivil();
  const probe = new Date(view.year, view.month - 1 + delta, 1, 12, 0, 0, 0);
  state.calView = { year: probe.getFullYear(), month: probe.getMonth() + 1 };
  renderCalendar();
}

function toggleCalendar(open) {
  const willOpen = open ?? els.calendar.hidden;
  els.calendar.hidden = !willOpen;
  els.calendarBtn.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) {
    renderCalendar();
    const focusDay = els.calGrid.querySelector('.dp-calday');
    if (focusDay) focusDay.focus();
  } else {
    els.calendarBtn.focus();
  }
}

function renderResults(results) {
  state.lastResults = results;
  const s = t();
  const okStatuses = new Set(['applied-verified', 'applied-unverified', 'cleared']);
  const ok = results.filter((r) => okStatuses.has(r.status)).length;
  const failed = results.filter((r) => r.status === 'failed');
  const cleared = results.filter((r) => r.status === 'cleared').length;
  if (results.length === 0) {
    els.details.hidden = true;
    els.retryButton.hidden = true;
    return;
  }
  els.details.hidden = false;
  els.resultSummary.textContent = `${s.details} — ${s.summaryLine(ok, results.length)}`;
  els.resultList.innerHTML = results.map((r) => {
    const cls = r.status === 'failed' || r.status === 'mismatch' ? 'st-fail'
      : (r.status === 'mismatch' ? 'st-warn' : 'st-ok');
    const extra = r.reason || r.detail ? ` — ${r.reason || r.detail}` : '';
    return `<li><span class="${cls}">${escapeHtml(`${r.worksheetName} → ${r.fieldCaption}: ${r.status}`)}${escapeHtml(extra)}</span></li>`;
  }).join('');
  els.retryButton.hidden = failed.length === 0;
  if (failed.length === 0 && cleared === results.length) {
    setBadge('cleared', `${s.cleared} — ${results.length}`);
    els.message.textContent = '';
  } else if (failed.length === 0 && ok === results.length) {
    setBadge('applied', `${s.applied} — ${s.summaryLine(ok, results.length)}`);
    els.message.textContent = '';
  } else if (ok > 0) {
    setBadge('partial', `${s.partial} — ${s.summaryLine(ok, results.length)}`);
    els.message.textContent = '';
  } else {
    setBadge('failed', s.failed);
    els.message.textContent = '';
  }
}

// The single serialized worker behind Apply/Reset: overlapping presses
// collapse so only the latest committed range reaches Tableau.
const queue = createLatestQueue(async (operation) => {
  if (operation.kind === 'clear') return doClear();
  return doApply(operation);
});

async function doApply(operation) {
  const s = t();
  const targets = enabledTargets();
  if (targets.length === 0) {
    setBadge('not-configured', s.notConfigured);
    els.message.textContent = s.noTargets;
    return [];
  }
  setBadge('applying', s.applying);
  els.message.textContent = '';
  els.retryButton.hidden = true;
  const results = await applyMappings({
    worksheets: state.dashboard.worksheets,
    targets,
    start: operation.start,
    end: operation.end,
    nullOption: nullOptionValue(),
    onlyWorksheetIds: operation.retryOf ? new Set(operation.retryOf) : null,
  });
  if (results.some((r) => r.status === 'applied-verified' || r.status === 'applied-unverified')) {
    state.applied = { start: operation.start, end: operation.end };
  }
  renderDraft();
  renderConfigSummary();
  renderResults(results);
  return results;
}

async function doClear() {
  const s = t();
  setBadge('applying', s.applying);
  const results = await clearMappings({
    worksheets: state.dashboard.worksheets,
    targets: enabledTargets(),
  });
  const failed = results.filter((r) => r.status === 'failed');
  state.applied = null;
  renderDraft();
  renderConfigSummary();
  renderResults(results);
  return results;
}

async function onApply() {
  const valid = validateDraft();
  if (!valid) {
    showError(t().invalidRange);
    return;
  }
  showError('');
  // Every press goes through the latest-wins queue; a superseded press simply
  // yields to the newer committed range already in flight.
  await queue.run({ kind: 'apply', start: valid.start, end: valid.end });
}

async function onReset() {
  await queue.run({ kind: 'clear' });
}

async function onRetry() {
  const failedIds = state.lastResults
    .filter((r) => r.status === 'failed')
    .map((r) => r.worksheetId)
    .filter(Boolean);
  if (failedIds.length === 0) return;
  const valid = validateDraft() || state.applied;
  if (!valid) {
    showError(t().invalidRange);
    return;
  }
  await queue.run({ kind: 'apply', start: valid.start, end: valid.end, retryOf: failedIds });
}

// Registered as the Tableau extension context-menu Configure handler via
// initializeAsync({ configure }). Opens the mapping dialog; settings are
// saved there, never here.
async function openConfigure() {
  const api = state.tableauApi;
  if (!api || !api.extensions || !api.extensions.ui || !api.extensions.ui.displayDialogAsync) {
    els.gear.setAttribute('aria-expanded', 'true');
    els.panel.hidden = false;
    return;
  }
  const url = new URL('./config.html', window.location.href).href;
  try {
    await api.extensions.ui.displayDialogAsync(url, '', { height: 640, width: 560 });
  } catch {
    showError(t().configHintTableau);
    return;
  }
  await refreshFromTableau();
}

function readStoredSettings() {
  const ext = state.tableauApi.extensions;
  try {
    const raw = ext.settings.get(SETTINGS_KEY);
    if (typeof raw === 'string' && raw) return parseSettings(raw);
  } catch { /* fall through to defaults */ }
  return parseSettings('');
}

async function refreshFromTableau() {
  state.settings = readStoredSettings();
  if (state.settings.locale) state.locale = state.settings.locale;
  renderStatic();
  renderDraft();
}

function hasTableauApi() {
  // Same probe as the hello pilot: the SDK installs window.tableau before
  // initialization, but dashboardContent is populated only by
  // initializeAsync, so it must NOT be part of the pre-init check.
  return typeof tableau !== 'undefined' && tableau && tableau.extensions &&
    typeof tableau.extensions.initializeAsync === 'function';
}

// Honest standalone mock: synthetic worksheets with fixed demo captions,
// clearly labeled, used for screenshots and plain-browser checks only.
function createMockDashboard() {
  const latency = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  function mockFilter(caption, dataType) {
    return {
      fieldName: caption,
      minValue: undefined,
      maxValue: undefined,
      async getFieldAsync() {
        await latency(2);
        return { name: caption, dataType };
      },
    };
  }
  function mockSheet(id, name, dateCaption, dataType, seed) {
    const filters = [
      mockFilter(dateCaption, dataType),
      { fieldName: 'Organization', async getFieldAsync() { return { name: 'Organization', dataType: 'STRING' }; } },
    ];
    if (seed) {
      filters[0].minValue = new Date(2025, 0, 1);
      filters[0].maxValue = dataType === 'DATETIME' ? new Date(2025, 2, 31, 23, 59, 59, 999) : new Date(2025, 2, 31);
    }
    return {
      id, name,
      async getFiltersAsync() {
        await latency(3);
        return filters;
      },
      async applyRangeFilterAsync(caption, range) {
        await latency(8);
        const target = filters.find((f) => f.fieldName === caption);
        if (!target) throw new Error(`mock: no filter named ${caption}`);
        target.minValue = range.min;
        target.maxValue = range.max;
        target.nullOption = range.nullOption;
      },
      async clearFilterAsync(caption) {
        await latency(5);
        const target = filters.find((f) => f.fieldName === caption);
        if (!target) throw new Error(`mock: no filter named ${caption}`);
        target.minValue = undefined;
        target.maxValue = undefined;
      },
    };
  }
  const worksheets = [
    mockSheet('mock-headcount', 'Headcount (demo)', 'processing_time', 'DATETIME', true),
    mockSheet('mock-turnover', 'Turnover (demo)', 'exit_date', 'DATE', true),
    mockSheet('mock-recruiting', 'Recruiting (demo)', 'duzeltilmis_max_date', 'DATE', true),
    mockSheet('mock-excluded', 'Exits excluded (demo)', 'exit_date', 'DATE', false),
  ];
  return { worksheets };
}

function mockSettings() {
  return parseSettings(JSON.stringify({
    version: 1,
    locale: state.locale,
    targets: [
      { worksheetId: 'mock-headcount', worksheetName: 'Headcount (demo)', fieldCaption: 'processing_time', fieldType: 'DATETIME', enabled: true, resetEnabled: true },
      { worksheetId: 'mock-turnover', worksheetName: 'Turnover (demo)', fieldCaption: 'exit_date', fieldType: 'DATE', enabled: true, resetEnabled: true },
      { worksheetId: 'mock-recruiting', worksheetName: 'Recruiting (demo)', fieldCaption: 'duzeltilmis_max_date', fieldType: 'DATE', enabled: true, resetEnabled: false },
    ],
  }));
}

async function bootTableau() {
  state.tableauApi = tableau;
  els.modeLine.textContent = t().modeTableau;
  setBadge('applying', t().applying);
  try {
    await tableau.extensions.initializeAsync({ configure: openConfigure });
  } catch {
    setBadge('error', t().failed);
    els.message.textContent = `Tableau did not complete the extension handshake. Check that the extension URL is reachable and the manifest points to ${APP_URL}`;
    return;
  }
  state.mode = 'tableau';
  state.dashboard = tableau.extensions.dashboardContent.dashboard;
  state.settings = readStoredSettings();
  if (state.settings.locale) state.locale = state.settings.locale;
  try {
    await discoverWorksheets(state.dashboard.worksheets);
  } catch {
    // discovery is advisory; the last saved mappings still apply
  }
  const range = presetRange('last-30-days', todayCivil());
  state.draft = { start: range.start, end: range.end, preset: 'last-30-days' };
  setBadge('connected', t().connected);
  els.message.textContent = '';
  els.modeLine.textContent = t().modeTableau;
  renderStatic();
  renderDraft();
}

function bootMock() {
  state.mode = 'mock';
  state.dashboard = createMockDashboard();
  state.settings = mockSettings();
  const range = presetRange('last-30-days', todayCivil());
  state.draft = { start: range.start, end: range.end, preset: 'last-30-days' };
  els.modeLine.textContent = t().modeMock;
  setBadge('mock', t().mock);
  els.message.textContent = '';
  renderStatic();
  renderDraft();
}

els.applyButton.addEventListener('click', onApply);
els.resetButton.addEventListener('click', onReset);
els.retryButton.addEventListener('click', onRetry);
els.startInput.addEventListener('change', readDraftFromInputs);
els.endInput.addEventListener('change', readDraftFromInputs);
els.calendarBtn.addEventListener('click', () => toggleCalendar());
els.calPrev.addEventListener('click', () => shiftCalendarMonth(-1));
els.calNext.addEventListener('click', () => shiftCalendarMonth(1));
els.calGrid.addEventListener('keydown', (event) => {
  const current = event.target.closest('.dp-calday');
  if (!current) return;
  const day = Number(current.dataset.day);
  if (event.key === 'Escape') {
    event.preventDefault();
    toggleCalendar(false);
    return;
  }
  const view = calViewCivil();
  const total = daysInMonth(view.year, view.month);
  let next = null;
  if (event.key === 'ArrowLeft') next = day - 1;
  else if (event.key === 'ArrowRight') next = day + 1;
  else if (event.key === 'ArrowUp') next = day - 7;
  else if (event.key === 'ArrowDown') next = day + 7;
  else if (event.key === 'Home') next = 1;
  else if (event.key === 'End') next = total;
  if (next === null) return;
  event.preventDefault();
  if (next >= 1 && next <= total) {
    const el = els.calGrid.querySelector(`[data-day="${next}"]`);
    if (el) el.focus();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!els.calendar.hidden) toggleCalendar(false);
  else if (!els.panel.hidden) {
    els.panel.hidden = true;
    els.gear.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('click', (event) => {
  if (!els.calendar.hidden && !event.target.closest('#calendar-popover') && !event.target.closest('#calendar-btn')) {
    toggleCalendar(false);
  }
});
els.gear.addEventListener('click', () => {
  const open = els.panel.hidden;
  els.panel.hidden = !open;
  els.gear.setAttribute('aria-expanded', String(open));
});
els.localeTr.addEventListener('click', () => { state.locale = 'tr-TR'; renderStatic(); renderDraft(); });
els.localeEn.addEventListener('click', () => { state.locale = 'en-US'; renderStatic(); renderDraft(); });

if (hasTableauApi()) {
  void bootTableau();
} else {
  bootMock();
}

// Test hook: read-only state probe for the browser suite (no Tableau access).
window.__datePicker = {
  getState: () => ({
    mode: state.mode,
    draft: { ...state.draft },
    applied: state.applied ? { ...state.applied } : null,
    results: state.lastResults.map((r) => ({ ...r })),
  }),
};
