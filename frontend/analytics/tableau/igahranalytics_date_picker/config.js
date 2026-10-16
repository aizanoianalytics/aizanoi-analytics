/* IGA HR Analytics — Date Picker (configuration dialog).
 *
 * This dialog is the ONLY place that persists Tableau settings
 * (settings.set + saveAsync). It discovers worksheets of the CURRENT
 * dashboard from existing filter metadata only (getFiltersAsync +
 * filter.getFieldAsync), offers opt-in per-sheet DATE/DATETIME caption
 * mapping, and stores non-sensitive configuration under one versioned key.
 * Outside Tableau it runs against an honest labeled mock and previews the
 * exact payload instead of saving.
 */
import { discoverWorksheets } from './core/discovery.js';
import {
  parseSettings,
  serializeSettings,
  defaultSettings,
  SCHEMA_VERSION,
} from './core/settings.js';

const SETTINGS_KEY = 'igahranalytics_date_picker';

const STRINGS = {
  'tr-TR': {
    title: 'Uzantı yapılandırması',
    sheets: 'Çalışma sayfaları',
    hint: 'Yalnızca bu panodaki sayfalar listelenir. Her sayfa için kullanmak istediğiniz tarih alanını seçin; seçilmeyen sayfalara dokunulmaz.',
    save: 'Kaydet', cancel: 'Vazgeç', lang: 'Dil',
    resetLine: 'Temizle düğmesinden etkilensin',
    ready: 'Hazır', missingField: 'Tarih alanı yok', stale: 'Eşleşme eskimiş — alan artık yok',
    saved: 'Kaydedildi. İletişim kutusu kapanıyor…',
    mockNote: 'Standalone deneme — sentetik pano. Kaydet, Tableau’ya yazmaz; kaydedilecek içeriği aşağıda gösterir.',
    noSheets: 'Bu panoda çalışma sayfası bulunamadı.',
    privacy: 'Yalnızca sayfa adları ve alan başlıkları saklanır; satır verisi, kimlik bilgisi ve telemetri yoktur.',
  },
  'en-US': {
    title: 'Extension configuration',
    sheets: 'Worksheets',
    hint: 'Only sheets on this dashboard are listed. Pick the date field to use per sheet; unselected sheets are never touched.',
    save: 'Save', cancel: 'Cancel', lang: 'Language',
    resetLine: 'Affected by Reset',
    ready: 'Ready', missingField: 'No date field', stale: 'Mapping is stale — field no longer exists',
    saved: 'Saved. Closing the dialog…',
    mockNote: 'Standalone mock — synthetic dashboard. Save does not write to Tableau; it previews the payload below.',
    noSheets: 'No worksheets found on this dashboard.',
    privacy: 'Only sheet names and field captions are stored; no row data, credentials or telemetry.',
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

const els = {
  title: document.getElementById('dlg-title'),
  mode: document.getElementById('dlg-mode'),
  mockNote: document.getElementById('dlg-mocknote'),
  error: document.getElementById('dlg-error'),
  langH: document.getElementById('dlg-lang-h'),
  tr: document.getElementById('dlg-tr'),
  en: document.getElementById('dlg-en'),
  sheetsH: document.getElementById('dlg-sheets-h'),
  sheetsHint: document.getElementById('dlg-sheets-hint'),
  list: document.getElementById('mapping-list'),
  save: document.getElementById('save-btn'),
  cancel: document.getElementById('cancel-btn'),
  savedH: document.getElementById('dlg-saved-h'),
  saved: document.getElementById('dlg-saved'),
  privacy: document.getElementById('dlg-privacy'),
};

const state = {
  locale: 'tr-TR',
  mode: 'boot',
  tableauApi: null,
  discovery: [],
  settings: defaultSettings(),
  rows: new Map(),
};

function t() {
  return STRINGS[state.locale] || STRINGS['tr-TR'];
}

function sdkPresent() {
  return typeof tableau !== 'undefined' && tableau && tableau.extensions &&
    typeof tableau.extensions.initializeDialogAsync === 'function';
}

function renderStatic() {
  const s = t();
  document.documentElement.lang = state.locale === 'en-US' ? 'en' : 'tr';
  els.title.textContent = s.title;
  els.langH.textContent = s.lang;
  els.sheetsH.textContent = s.sheets;
  els.sheetsHint.textContent = s.hint;
  els.save.textContent = s.save;
  els.cancel.textContent = s.cancel;
  els.privacy.textContent = s.privacy;
  els.tr.setAttribute('aria-pressed', String(state.locale !== 'en-US'));
  els.en.setAttribute('aria-pressed', String(state.locale === 'en-US'));
  if (state.mode === 'mock') {
    els.mockNote.hidden = false;
    els.mockNote.textContent = s.mockNote;
  }
  renderList();
}

function healthFor(row, discovered) {
  if (!row.enabled) return { key: 'ready', text: t().ready, off: true };
  if (discovered && discovered.fields.length === 0) return { key: 'missing', text: t().missingField };
  if (discovered && row.caption && !discovered.fields.some((f) => f.caption === row.caption)) {
    return { key: 'stale', text: t().stale };
  }
  return { key: 'ready', text: t().ready };
}

function renderList() {
  const s = t();
  els.list.innerHTML = '';
  if (state.discovery.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dp-hint';
    empty.textContent = s.noSheets;
    els.list.appendChild(empty);
    return;
  }
  for (const sheet of state.discovery) {
    const row = state.rows.get(sheet.id) || { enabled: false, caption: '', resetEnabled: true };
    const item = document.createElement('li');
    item.className = 'dp-sheet mapping-row';
    item.dataset.sheet = sheet.id;

    const top = document.createElement('div');
    top.className = 'dp-sheet-row';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = row.enabled;
    check.setAttribute('aria-label', sheet.name);
    check.addEventListener('change', () => {
      row.enabled = check.checked;
      if (row.enabled && !row.caption && sheet.fields.length === 1) row.caption = sheet.fields[0].caption;
      state.rows.set(sheet.id, row);
      renderList();
    });
    const name = document.createElement('span');
    name.className = 'dp-sheet-name';
    name.textContent = sheet.name;
    const health = healthFor(row, sheet);
    const badge = document.createElement('span');
    badge.className = 'dp-health';
    badge.dataset.health = health.key;
    badge.textContent = health.text;
    top.append(check, name, badge);

    const pickRow = document.createElement('div');
    pickRow.className = 'dp-sheet-row';
    pickRow.style.marginTop = '8px';
    const select = document.createElement('select');
    select.setAttribute('aria-label', `${sheet.name} date field`);
    select.disabled = !row.enabled;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '—';
    select.appendChild(placeholder);
    const known = new Set(sheet.fields.map((f) => f.caption));
    for (const field of sheet.fields) {
      const option = document.createElement('option');
      option.value = field.caption;
      option.textContent = `${field.caption} (${field.dataType})`;
      select.appendChild(option);
    }
    if (row.caption && !known.has(row.caption)) {
      const stale = document.createElement('option');
      stale.value = row.caption;
      stale.textContent = `${row.caption} (${s.stale})`;
      select.appendChild(stale);
    }
    select.value = row.caption || '';
    select.addEventListener('change', () => {
      row.caption = select.value;
      const picked = sheet.fields.find((f) => f.caption === select.value);
      row.fieldType = picked ? picked.dataType : row.fieldType;
      state.rows.set(sheet.id, row);
      renderList();
    });
    pickRow.appendChild(select);

    const resetLine = document.createElement('label');
    resetLine.className = 'dp-resetline';
    const resetCheck = document.createElement('input');
    resetCheck.type = 'checkbox';
    resetCheck.checked = row.resetEnabled !== false;
    resetCheck.disabled = !row.enabled;
    resetCheck.addEventListener('change', () => {
      row.resetEnabled = resetCheck.checked;
      state.rows.set(sheet.id, row);
    });
    resetLine.append(resetCheck, document.createTextNode(s.resetLine));

    item.append(top, pickRow, resetLine);
    els.list.appendChild(item);
  }
}

function collectSettings() {
  const targets = [];
  for (const sheet of state.discovery) {
    const row = state.rows.get(sheet.id);
    if (!row || !row.enabled || !row.caption) continue;
    const picked = sheet.fields.find((f) => f.caption === row.caption);
    targets.push({
      worksheetId: sheet.id,
      worksheetName: sheet.name,
      fieldCaption: row.caption,
      fieldType: picked ? picked.dataType : (row.fieldType || 'DATE'),
      enabled: true,
      resetEnabled: row.resetEnabled !== false,
    });
  }
  return { version: SCHEMA_VERSION, locale: state.locale, targets };
}

function showError(text) {
  if (!text) {
    els.error.hidden = true;
    els.error.textContent = '';
    return;
  }
  els.error.hidden = false;
  els.error.textContent = text;
}

async function onSave() {
  const payload = collectSettings();
  const text = serializeSettings(payload);
  if (state.mode !== 'tableau') {
    els.savedH.hidden = false;
    els.saved.hidden = false;
    els.saved.textContent = text;
    return;
  }
  try {
    state.tableauApi.extensions.settings.set(SETTINGS_KEY, text);
    await state.tableauApi.extensions.settings.saveAsync();
  } catch {
    showError(t().saved);
    return;
  }
  try {
    await state.tableauApi.extensions.ui.closeDialog('saved');
  } catch {
    // The settings are saved; a stuck dialog is a minor Tableau-side issue.
  }
}

async function onCancel() {
  if (state.mode !== 'tableau') {
    window.history.back();
    return;
  }
  try {
    await state.tableauApi.extensions.ui.closeDialog('cancelled');
  } catch {
    window.history.back();
  }
}

function seedRows() {
  state.rows.clear();
  const byKey = new Map();
  for (const target of state.settings.targets) {
    byKey.set(target.worksheetId || target.worksheetName, target);
  }
  for (const sheet of state.discovery) {
    const existing = byKey.get(sheet.id) || byKey.get(sheet.name);
    if (existing) {
      state.rows.set(sheet.id, {
        enabled: existing.enabled !== false,
        caption: existing.fieldCaption || '',
        fieldType: existing.fieldType || 'DATE',
        resetEnabled: existing.resetEnabled !== false,
      });
    } else {
      state.rows.set(sheet.id, { enabled: false, caption: '', fieldType: 'DATE', resetEnabled: true });
    }
  }
}

function mockDiscovery() {
  return [
    { id: 'mock-headcount', name: 'Headcount (demo)', fields: [{ caption: 'processing_time', dataType: 'DATETIME' }] },
    { id: 'mock-turnover', name: 'Turnover (demo)', fields: [{ caption: 'exit_date', dataType: 'DATE' }] },
    { id: 'mock-recruiting', name: 'Recruiting (demo)', fields: [{ caption: 'duzeltilmis_max_date', dataType: 'DATE' }] },
  ];
}

async function bootTableau() {
  // The init handshake already ran in boot(): the real SDK populates
  // dashboardContent only there, so it must NOT be probed before init
  // (probing it pre-init is what stranded the dialog in mock mode).
  state.tableauApi = tableau;
  els.mode.textContent = 'Tableau Desktop';
  const dashboard = tableau.extensions.dashboardContent &&
    tableau.extensions.dashboardContent.dashboard;
  if (!dashboard || !Array.isArray(dashboard.worksheets)) {
    bootMock();
    return;
  }
  state.mode = 'tableau';
  try {
    state.settings = parseSettings(tableau.extensions.settings.get(SETTINGS_KEY));
    if (state.settings.locale) state.locale = state.settings.locale;
  } catch {
    state.settings = parseSettings('');
  }
  state.discovery = await discoverWorksheets(dashboard.worksheets);
  seedRows();
  renderStatic();
}

function bootMock() {
  state.mode = 'mock';
  els.mode.textContent = 'Standalone mock (synthetic dashboard)';
  state.discovery = mockDiscovery();
  state.settings = parseSettings(JSON.stringify({
    version: 1,
    locale: state.locale,
    targets: [
      { worksheetId: 'mock-headcount', worksheetName: 'Headcount (demo)', fieldCaption: 'processing_time', fieldType: 'DATETIME', enabled: true, resetEnabled: true },
    ],
  }));
  seedRows();
  renderStatic();
}

els.save.addEventListener('click', onSave);
els.cancel.addEventListener('click', onCancel);
els.tr.addEventListener('click', () => { state.locale = 'tr-TR'; renderStatic(); });
els.en.addEventListener('click', () => { state.locale = 'en-US'; renderStatic(); });

if (sdkPresent()) {
  // A dialog page must use initializeDialogAsync (official docs). The real
  // SDK leaves dashboardContent undefined until that handshake resolves, and
  // a host-less page never resolves it — race it so plain-browser loads
  // still fall back to the honest mock instead of hanging on "Loading…".
  const handshake = Promise.race([
    Promise.resolve().then(() => tableau.extensions.initializeDialogAsync()),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('dialog-handshake-timeout')), 1500);
    }),
  ]);
  void handshake.then(
    () => bootTableau(),
    () => bootMock(),
  );
} else {
  bootMock();
}

// Test hook: read-only state probe for the browser suite.
window.__datePickerConfig = {
  getState: () => ({
    mode: state.mode,
    rows: [...state.rows.entries()].map(([id, row]) => ({ id, ...row })),
    payload: serializeSettings(collectSettings()),
  }),
};
