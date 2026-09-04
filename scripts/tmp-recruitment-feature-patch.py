from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html"
TEST_PATH = ROOT / "tests/recruitment-analytics-multiselect-settings.test.mjs"

src = HTML_PATH.read_text(encoding="utf-8")
original = src


def replace_once(old: str, new: str, label: str) -> None:
    global src
    count = src.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    src = src.replace(old, new, 1)


def sub_once(pattern: str, repl: str, label: str) -> None:
    global src
    src, count = re.subn(pattern, repl, src, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one regex match, found {count}")


# 1) Replace the six single-select global filters with Excel-style multi-select shells.
filter_specs = [
    ("year", "All Years"),
    ("unit", "All Units"),
    ("responsible", "All Specialists"),
    ("status", "All Statuses"),
    ("level_category", "All Categories"),
    ("resource", "All Channels"),
]
for field, placeholder in filter_specs:
    pattern = (
        rf'<select class="filter-control" data-global-filter="{re.escape(field)}">\s*'
        rf'<option value="">{re.escape(placeholder)}</option>\s*'</n        rf'</select>'
    )
    # Build pattern without accidental Python source concatenation artifacts.
    pattern = (
        rf'<select class="filter-control" data-global-filter="{re.escape(field)}">\s*'
        rf'<option value="">{re.escape(placeholder)}</option>\s*'
        rf'</select>'
    )
    replacement = f'''<div class="multi-filter" data-multi-filter="{field}" data-placeholder="{placeholder}">
          <button type="button" class="filter-control multi-filter-trigger" data-multi-trigger aria-haspopup="dialog" aria-expanded="false">
            <span data-multi-label>{placeholder}</span>
            <span class="multi-filter-caret" aria-hidden="true">▾</span>
          </button>
          <div class="multi-filter-popover" data-multi-popover hidden></div>
        </div>'''
    src, count = re.subn(pattern, replacement, src, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"global filter {field}: expected exactly one select, found {count}")

# 2) Settings navigation lives beside Data Contract / Excel Loader, without redesigning the shell.
nav_anchor = '''      <button type="button" class="nav-tab" data-view="import">
        <span>Excel Loader</span>
      </button>'''
nav_replacement = '''      <button type="button" class="nav-tab" data-view="settings">
        <span>Settings</span>
      </button>
      <button type="button" class="nav-tab" data-view="import">
        <span>Excel Loader</span>
      </button>'''
replace_once(nav_anchor, nav_replacement, "settings nav")

# 3) Settings view: Included and Excluded are deliberately adjacent for each managed dimension.
settings_view = '''    <!-- VIEW 7: RECRUITMENT SETTINGS -->
    <div class="view-panel" data-view-panel="settings">
      <article class="card recruitment-settings-card">
        <div class="card-header settings-header">
          <div>
            <h3 class="card-title">Recruitment Settings</h3>
            <p class="card-subtitle">Manage the analysis scope without changing the source workbook. Exclusions apply to every KPI, chart, pipeline and table on this dashboard and are stored only in this browser.</p>
          </div>
          <button type="button" class="btn btn-white" id="resetRecruitmentExclusions">Reset exclusions</button>
        </div>
        <div class="settings-summary" id="settingsExclusionSummary" aria-live="polite"></div>

        <section class="settings-dimension" data-settings-dimension="unit">
          <div class="settings-dimension-head">
            <div>
              <h4>Business Unit</h4>
              <p>Move units between Included and Excluded. Excluded units disappear from the global Business Unit filter and from all analysis views.</p>
            </div>
          </div>
          <div class="settings-transfer-grid">
            <div class="settings-list-panel">
              <div class="settings-list-head"><strong>Included</strong><span data-settings-count="included">0</span></div>
              <input type="search" class="filter-control settings-search" data-settings-search="included" placeholder="Search included business units..." aria-label="Search included business units">
              <div class="settings-values" data-settings-list="included" role="group" aria-label="Included business units"></div>
            </div>
            <div class="settings-transfer-actions" aria-label="Business Unit inclusion controls">
              <button type="button" class="btn btn-primary" data-settings-action="exclude" data-field="unit">Exclude selected →</button>
              <button type="button" class="btn btn-white" data-settings-action="include" data-field="unit">← Include selected</button>
            </div>
            <div class="settings-list-panel settings-excluded-panel">
              <div class="settings-list-head"><strong>Excluded</strong><span data-settings-count="excluded">0</span></div>
              <input type="search" class="filter-control settings-search" data-settings-search="excluded" placeholder="Search excluded business units..." aria-label="Search excluded business units">
              <div class="settings-values" data-settings-list="excluded" role="group" aria-label="Excluded business units"></div>
            </div>
          </div>
        </section>

        <section class="settings-dimension" data-settings-dimension="position_name">
          <div class="settings-dimension-head">
            <div>
              <h4>Position Name</h4>
              <p>Exclude position names from the analysis scope or move them back into Included when you want them restored.</p>
            </div>
          </div>
          <div class="settings-transfer-grid">
            <div class="settings-list-panel">
              <div class="settings-list-head"><strong>Included</strong><span data-settings-count="included">0</span></div>
              <input type="search" class="filter-control settings-search" data-settings-search="included" placeholder="Search included positions..." aria-label="Search included positions">
              <div class="settings-values" data-settings-list="included" role="group" aria-label="Included position names"></div>
            </div>
            <div class="settings-transfer-actions" aria-label="Position Name inclusion controls">
              <button type="button" class="btn btn-primary" data-settings-action="exclude" data-field="position_name">Exclude selected →</button>
              <button type="button" class="btn btn-white" data-settings-action="include" data-field="position_name">← Include selected</button>
            </div>
            <div class="settings-list-panel settings-excluded-panel">
              <div class="settings-list-head"><strong>Excluded</strong><span data-settings-count="excluded">0</span></div>
              <input type="search" class="filter-control settings-search" data-settings-search="excluded" placeholder="Search excluded positions..." aria-label="Search excluded positions">
              <div class="settings-values" data-settings-list="excluded" role="group" aria-label="Excluded position names"></div>
            </div>
          </div>
        </section>
      </article>
    </div>

    <!-- VIEW 8: EXCEL LOADER & EXPORT -->'''
replace_once('    <!-- VIEW 7: EXCEL LOADER & EXPORT -->', settings_view, "settings view")

# 4) Styling follows existing dashboard tokens. No new design system / dependency.
css = r'''

    /* Recruitment multi-select filters and browser-local Settings */
    .multi-filter { position: relative; min-width: 0; }
    .multi-filter-trigger { width: 100%; min-width: 150px; display: flex; align-items: center; justify-content: space-between; gap: 0.65rem; text-align: left; cursor: pointer; }
    .multi-filter-trigger [data-multi-label] { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .multi-filter-caret { flex: 0 0 auto; color: var(--slate-500); font-size: 0.75rem; }
    .multi-filter-popover { position: absolute; z-index: 80; top: calc(100% + 0.4rem); left: 0; width: min(320px, calc(100vw - 2rem)); padding: 0.75rem; border: 1px solid var(--slate-200); border-radius: 10px; background: #fff; box-shadow: 0 18px 44px rgba(15, 23, 42, 0.16); }
    .multi-filter-popover[hidden] { display: none !important; }
    .multi-filter-search { width: 100%; margin-bottom: 0.55rem; }
    .multi-filter-actions-row, .multi-filter-footer { display: flex; align-items: center; justify-content: space-between; gap: 0.45rem; }
    .multi-filter-actions-row { margin-bottom: 0.5rem; }
    .multi-filter-options { max-height: 250px; overflow: auto; border: 1px solid var(--slate-100); border-radius: 8px; background: var(--slate-50); }
    .multi-filter-option, .settings-option { display: flex; align-items: flex-start; gap: 0.55rem; padding: 0.5rem 0.6rem; cursor: pointer; color: var(--slate-800); line-height: 1.25; }
    .multi-filter-option + .multi-filter-option, .settings-option + .settings-option { border-top: 1px solid var(--slate-100); }
    .multi-filter-option:hover, .settings-option:hover { background: #fff; }
    .multi-filter-option input, .settings-option input { margin-top: 0.08rem; accent-color: var(--blue-600); }
    .multi-filter-count { padding: 0.55rem 0.1rem; font-size: 0.75rem; color: var(--slate-500); }
    .multi-filter-empty, .settings-empty { padding: 0.8rem; color: var(--slate-500); font-size: 0.8rem; text-align: center; }
    .multi-filter-footer { padding-top: 0.6rem; border-top: 1px solid var(--slate-100); }

    .recruitment-settings-card { overflow: visible; }
    .settings-header { align-items: flex-start; gap: 1rem; }
    .settings-header .card-subtitle { max-width: 860px; margin-top: 0.3rem; color: var(--slate-500); font-size: 0.82rem; line-height: 1.5; }
    .settings-summary { margin: 0 1.25rem 1rem; padding: 0.65rem 0.8rem; border: 1px solid var(--slate-200); border-radius: 8px; background: var(--slate-50); color: var(--slate-600); font-size: 0.8rem; }
    .settings-dimension { margin: 0 1.25rem 1.25rem; padding-top: 1.1rem; border-top: 1px solid var(--slate-200); }
    .settings-dimension:first-of-type { border-top: 0; padding-top: 0; }
    .settings-dimension-head { margin-bottom: 0.8rem; }
    .settings-dimension-head h4 { margin: 0 0 0.25rem; color: var(--slate-900); font-size: 0.95rem; }
    .settings-dimension-head p { margin: 0; color: var(--slate-500); font-size: 0.78rem; line-height: 1.45; }
    .settings-transfer-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 0.8rem; align-items: stretch; }
    .settings-list-panel { min-width: 0; padding: 0.75rem; border: 1px solid var(--slate-200); border-radius: 10px; background: #fff; }
    .settings-excluded-panel { background: #fffaf9; border-color: #fed7d2; }
    .settings-list-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.55rem; color: var(--slate-800); font-size: 0.82rem; }
    .settings-list-head span { color: var(--slate-500); font-variant-numeric: tabular-nums; }
    .settings-search { width: 100%; margin-bottom: 0.55rem; }
    .settings-values { min-height: 220px; max-height: 340px; overflow: auto; border: 1px solid var(--slate-100); border-radius: 8px; background: var(--slate-50); }
    .settings-transfer-actions { display: flex; flex-direction: column; justify-content: center; gap: 0.55rem; min-width: 154px; }
    .settings-transfer-actions .btn { width: 100%; white-space: nowrap; }
    .settings-transfer-actions .btn:disabled { opacity: 0.45; cursor: not-allowed; }

    @media (max-width: 820px) {
      .multi-filter-popover { position: fixed; top: 12vh; left: 1rem; right: 1rem; width: auto; max-height: 76vh; overflow: auto; }
      .settings-transfer-grid { grid-template-columns: 1fr; }
      .settings-transfer-actions { flex-direction: row; min-width: 0; }
      .settings-transfer-actions .btn { white-space: normal; }
      .settings-values { min-height: 160px; max-height: 260px; }
      .settings-header { flex-direction: column; }
    }
'''
if '</style>' not in src:
    raise SystemExit('style close anchor missing')
src = src.replace('</style>', css + '\n  </style>', 1)

# 5) Extend state with multi-select drafts and browser-local exclusions.
state_anchor = '      globalFilters: {},\n      cumulativeDimension: "unit",'
state_replacement = '''      globalFilters: {},
      filterOptions: {},
      filterDrafts: {},
      excludedValues: {
        unit: new Set(),
        position_name: new Set()
      },
      settingsSelection: {
        unit: { included: new Set(), excluded: new Set() },
        position_name: { included: new Set(), excluded: new Set() }
      },
      cumulativeDimension: "unit",'''
replace_once(state_anchor, state_replacement, "state extension")

# 6) Settings are loaded before portableTemplateHtml is captured; only preferences, never source data.
init_anchor = '''    window.addEventListener("DOMContentLoaded", () => {
      initEvents();'''
init_replacement = '''    window.addEventListener("DOMContentLoaded", () => {
      loadRecruitmentSettings();
      initEvents();
      renderSettings();'''
replace_once(init_anchor, init_replacement, "DOMContentLoaded settings load")

# 7) Whenever a new payload is loaded, reconcile top-filter options and redraw Settings.
apply_anchor = '''      populateFilterOptions();
      renderAll();
    }

    function uniqueValues(field)'''
apply_replacement = '''      populateFilterOptions();
      renderSettings();
      renderAll();
    }

    function uniqueValues(field)'''
replace_once(apply_anchor, apply_replacement, "applyPayload settings render")

# 8) Replace old select population with multi-select + Settings helpers.
helpers = r'''    function uniqueValues(field, records = state.records) {
      return Array.from(new Set(records.map(r => text(r[field])).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, "tr"));
    }

    const GLOBAL_MULTI_FILTERS = [
      ["year", "All Years"],
      ["unit", "All Units"],
      ["responsible", "All Specialists"],
      ["status", "All Statuses"],
      ["level_category", "All Categories"],
      ["resource", "All Channels"]
    ];
    const SETTINGS_STORAGE_KEY = "aizanoi-recruitment-settings-v1";
    const SETTINGS_FIELDS = ["unit", "position_name"];

    function recordExcluded(record) {
      return state.excludedValues.unit.has(text(record.unit)) ||
        state.excludedValues.position_name.has(text(record.position_name));
    }

    function recordsInsideSettingsScope() {
      return state.records.filter(record => !recordExcluded(record));
    }

    function loadRecruitmentSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const excluded = parsed && typeof parsed === "object" ? parsed.excluded : null;
        SETTINGS_FIELDS.forEach(field => {
          const values = excluded && Array.isArray(excluded[field]) ? excluded[field] : [];
          state.excludedValues[field] = new Set(values.map(text).filter(Boolean));
        });
      } catch (err) {
        console.warn("Recruitment settings could not be restored; continuing with defaults.", err);
      }
    }

    function persistRecruitmentSettings() {
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
          excluded: {
            unit: Array.from(state.excludedValues.unit),
            position_name: Array.from(state.excludedValues.position_name)
          }
        }));
      } catch (err) {
        console.warn("Recruitment settings could not be saved in this browser.", err);
      }
    }

    function filterPlaceholder(field) {
      return GLOBAL_MULTI_FILTERS.find(([key]) => key === field)?.[1] || "All";
    }

    function closeMultiFilter(field) {
      const root = document.querySelector(`[data-multi-filter="${field}"]`);
      if (!root) return;
      const popover = root.querySelector("[data-multi-popover]");
      const trigger = root.querySelector("[data-multi-trigger]");
      if (popover) popover.hidden = true;
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      delete state.filterDrafts[field];
    }

    function closeAllMultiFilters(exceptField = "") {
      GLOBAL_MULTI_FILTERS.forEach(([field]) => {
        if (field !== exceptField) closeMultiFilter(field);
      });
    }

    function updateMultiFilterTrigger(field) {
      const root = document.querySelector(`[data-multi-filter="${field}"]`);
      if (!root) return;
      const label = root.querySelector("[data-multi-label]");
      if (!label) return;
      const options = state.filterOptions[field] || [];
      const hasApplied = Object.prototype.hasOwnProperty.call(state.globalFilters, field);
      const selected = hasApplied && Array.isArray(state.globalFilters[field]) ? state.globalFilters[field] : options;
      if (!hasApplied || (options.length && selected.length === options.length)) {
        label.textContent = filterPlaceholder(field);
      } else if (selected.length === 0) {
        label.textContent = "None selected";
      } else if (selected.length === 1) {
        label.textContent = selected[0];
      } else {
        label.textContent = `${selected.length} selected`;
      }
      label.title = selected.length && hasApplied ? selected.join(", ") : filterPlaceholder(field);
    }

    function renderMultiFilterOptions(field) {
      const root = document.querySelector(`[data-multi-filter="${field}"]`);
      if (!root) return;
      const popover = root.querySelector("[data-multi-popover]");
      if (!popover || popover.hidden || !state.filterDrafts[field]) return;
      const options = state.filterOptions[field] || [];
      const draft = state.filterDrafts[field];
      const search = popover.querySelector("[data-multi-search]");
      const query = fold(search?.value || "");
      const visible = options.filter(value => !query || fold(value).includes(query));
      const list = popover.querySelector("[data-multi-options]");
      const count = popover.querySelector("[data-multi-count]");
      if (list) {
        list.innerHTML = visible.length ? visible.map(value => `
          <label class="multi-filter-option">
            <input type="checkbox" data-multi-option value="${escapeHtml(value)}" ${draft.has(value) ? "checked" : ""}>
            <span>${escapeHtml(value)}</span>
          </label>
        `).join("") : '<div class="multi-filter-empty">No matching values.</div>';
      }
      if (count) count.textContent = `${draft.size} selected · ${visible.length} shown · ${options.length} total`;
    }

    function openMultiFilter(field) {
      closeAllMultiFilters(field);
      const root = document.querySelector(`[data-multi-filter="${field}"]`);
      if (!root) return;
      const options = state.filterOptions[field] || [];
      const hasApplied = Object.prototype.hasOwnProperty.call(state.globalFilters, field);
      const applied = hasApplied && Array.isArray(state.globalFilters[field]) ? state.globalFilters[field] : options;
      state.filterDrafts[field] = new Set(applied);
      const popover = root.querySelector("[data-multi-popover]");
      const trigger = root.querySelector("[data-multi-trigger]");
      if (!popover || !trigger) return;
      popover.innerHTML = `
        <input type="search" class="filter-control multi-filter-search" data-multi-search placeholder="Search values..." aria-label="Search ${escapeHtml(field)} filter values">
        <div class="multi-filter-actions-row">
          <button type="button" class="btn btn-white" data-multi-select-all>Select All</button>
          <button type="button" class="btn btn-white" data-multi-clear>Clear</button>
        </div>
        <div class="multi-filter-options" data-multi-options role="group" aria-label="${escapeHtml(field)} values"></div>
        <div class="multi-filter-count" data-multi-count aria-live="polite"></div>
        <div class="multi-filter-footer">
          <button type="button" class="btn btn-white" data-multi-cancel>Cancel</button>
          <button type="button" class="btn btn-primary" data-multi-apply>Apply</button>
        </div>`;
      popover.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      renderMultiFilterOptions(field);
      popover.querySelector("[data-multi-search]")?.focus();
    }

    function applyMultiFilter(field) {
      const options = state.filterOptions[field] || [];
      const draft = state.filterDrafts[field] || new Set();
      const selected = options.filter(value => draft.has(value));
      if (options.length === selected.length) {
        delete state.globalFilters[field];
      } else {
        state.globalFilters[field] = selected;
      }
      closeMultiFilter(field);
      updateMultiFilterTrigger(field);
      state.candidatePage = 1;
      state.recordPage = 1;
      renderAll();
    }

    function reconcileGlobalFiltersToOptions() {
      GLOBAL_MULTI_FILTERS.forEach(([field]) => {
        if (!Object.prototype.hasOwnProperty.call(state.globalFilters, field)) return;
        const current = Array.isArray(state.globalFilters[field]) ? state.globalFilters[field] : [];
        const options = state.filterOptions[field] || [];
        const valid = current.filter(value => options.includes(value));
        if (current.length > 0 && valid.length === 0) {
          delete state.globalFilters[field];
        } else if (options.length > 0 && valid.length === options.length) {
          delete state.globalFilters[field];
        } else {
          state.globalFilters[field] = valid;
        }
      });
    }

    function populateFilterOptions() {
      const scoped = recordsInsideSettingsScope();
      GLOBAL_MULTI_FILTERS.forEach(([field]) => {
        state.filterOptions[field] = uniqueValues(field, scoped);
      });
      reconcileGlobalFiltersToOptions();
      closeAllMultiFilters();
      GLOBAL_MULTI_FILTERS.forEach(([field]) => updateMultiFilterTrigger(field));
    }

    function renderSettingsDimension(field) {
      const root = document.querySelector(`[data-settings-dimension="${field}"]`);
      if (!root) return;
      const all = uniqueValues(field);
      const excluded = state.excludedValues[field];
      const selection = state.settingsSelection[field];
      const sides = {
        included: all.filter(value => !excluded.has(value)),
        excluded: all.filter(value => excluded.has(value))
      };

      ["included", "excluded"].forEach(side => {
        const base = sides[side];
        for (const value of Array.from(selection[side])) {
          if (!base.includes(value)) selection[side].delete(value);
        }
        const search = root.querySelector(`[data-settings-search="${side}"]`);
        const q = fold(search?.value || "");
        const visible = base.filter(value => !q || fold(value).includes(q));
        const list = root.querySelector(`[data-settings-list="${side}"]`);
        const count = root.querySelector(`[data-settings-count="${side}"]`);
        if (list) {
          list.innerHTML = visible.length ? visible.map(value => `
            <label class="settings-option">
              <input type="checkbox" data-settings-check="${side}" data-field="${field}" value="${escapeHtml(value)}" ${selection[side].has(value) ? "checked" : ""}>
              <span>${escapeHtml(value)}</span>
            </label>
          `).join("") : `<div class="settings-empty">${q ? "No matching values." : `No ${side} values.`}</div>`;
        }
        if (count) count.textContent = `${base.length}`;
      });

      const excludeButton = root.querySelector('[data-settings-action="exclude"]');
      const includeButton = root.querySelector('[data-settings-action="include"]');
      if (excludeButton) excludeButton.disabled = selection.included.size === 0;
      if (includeButton) includeButton.disabled = selection.excluded.size === 0;
    }

    function renderSettings() {
      SETTINGS_FIELDS.forEach(renderSettingsDimension);
      const summary = $("#settingsExclusionSummary");
      if (summary) {
        const unitCount = uniqueValues("unit").filter(value => state.excludedValues.unit.has(value)).length;
        const positionCount = uniqueValues("position_name").filter(value => state.excludedValues.position_name.has(value)).length;
        summary.textContent = `${unitCount} Business Unit${unitCount === 1 ? "" : "s"} excluded · ${positionCount} Position Name${positionCount === 1 ? "" : "s"} excluded`;
      }
    }

    function refreshAfterSettingsChange() {
      persistRecruitmentSettings();
      populateFilterOptions();
      renderSettings();
      state.candidatePage = 1;
      state.recordPage = 1;
      renderAll();
    }

    function transferSettingsValues(field, action) {
      if (!SETTINGS_FIELDS.includes(field)) return;
      const selection = state.settingsSelection[field];
      if (action === "exclude") {
        selection.included.forEach(value => state.excludedValues[field].add(value));
      } else if (action === "include") {
        selection.excluded.forEach(value => state.excludedValues[field].delete(value));
      } else {
        return;
      }
      selection.included.clear();
      selection.excluded.clear();
      refreshAfterSettingsChange();
    }

    function resetRecruitmentExclusions() {
      SETTINGS_FIELDS.forEach(field => {
        state.excludedValues[field].clear();
        state.settingsSelection[field].included.clear();
        state.settingsSelection[field].excluded.clear();
      });
      refreshAfterSettingsChange();
    }

    function recordMatches'''
pattern = r'    function uniqueValues\(field\) \{.*?\n    \}\n\n    function populateFilterOptions\(\) \{.*?\n    \}\n\n    function recordMatches'
sub_once(pattern, helpers, "multi-filter helper replacement")

# 9) Exclusions are the global analysis boundary; multi-select arrays are first-class filters.
record_matches = r'''    function recordMatches(record, filters) {
      if (recordExcluded(record)) return false;
      for (const [key, val] of Object.entries(filters)) {
        if (key === "q") {
          if (!val) continue;
          if (!record.search_text.includes(fold(val))) return false;
          continue;
        }
        if (Array.isArray(val)) {
          if (val.length === 0) return false;
          if (!val.includes(text(record[key]))) return false;
          continue;
        }
        if (val && text(record[key]) !== val) return false;
      }
      return true;
    }

    function filteredRecords'''
pattern = r'    function recordMatches\(record, filters\) \{.*?\n    \}\n\n    function filteredRecords'
sub_once(pattern, record_matches, "recordMatches replacement")

# 10) Event wiring: q remains live text search, multi-selects use Apply/Cancel draft semantics.
old_events = '''      // Global Filters
      $$("[data-global-filter]").forEach(el => {
        const evt = el.type === "search" ? "input" : "change";
        el.addEventListener(evt, () => {
          state.globalFilters[el.dataset.globalFilter] = el.value;
          state.candidatePage = 1;
          state.recordPage = 1;
          renderAll();
        });
      });

      $("#clearGlobalFilters").addEventListener("click", () => {
        state.globalFilters = {};
        $$("[data-global-filter]").forEach(el => el.value = "");
        state.candidatePage = 1;
        state.recordPage = 1;
        renderAll();
      });'''
new_events = r'''      // Global Filters: Universal Search stays live; dimensions use Excel-style Apply/Cancel multi-selects.
      $$('[data-global-filter="q"]').forEach(el => {
        el.addEventListener("input", () => {
          state.globalFilters.q = el.value;
          state.candidatePage = 1;
          state.recordPage = 1;
          renderAll();
        });
      });

      const globalFilterBar = $("#globalFilterBar");
      globalFilterBar.addEventListener("click", event => {
        const trigger = event.target.closest("[data-multi-trigger]");
        if (trigger) {
          const root = trigger.closest("[data-multi-filter]");
          const field = root?.dataset.multiFilter;
          const popover = root?.querySelector("[data-multi-popover]");
          if (!field || !popover) return;
          if (popover.hidden) openMultiFilter(field); else closeMultiFilter(field);
          return;
        }
        const root = event.target.closest("[data-multi-filter]");
        if (!root) return;
        const field = root.dataset.multiFilter;
        const draft = state.filterDrafts[field];
        if (!draft) return;
        if (event.target.closest("[data-multi-select-all]")) {
          state.filterDrafts[field] = new Set(state.filterOptions[field] || []);
          renderMultiFilterOptions(field);
        } else if (event.target.closest("[data-multi-clear]")) {
          draft.clear();
          renderMultiFilterOptions(field);
        } else if (event.target.closest("[data-multi-apply]")) {
          applyMultiFilter(field);
        } else if (event.target.closest("[data-multi-cancel]")) {
          closeMultiFilter(field);
        }
      });

      globalFilterBar.addEventListener("input", event => {
        if (event.target.matches("[data-multi-search]")) {
          const field = event.target.closest("[data-multi-filter]")?.dataset.multiFilter;
          if (field) renderMultiFilterOptions(field);
        }
      });

      globalFilterBar.addEventListener("change", event => {
        if (!event.target.matches("[data-multi-option]")) return;
        const field = event.target.closest("[data-multi-filter]")?.dataset.multiFilter;
        const draft = field ? state.filterDrafts[field] : null;
        if (!field || !draft) return;
        if (event.target.checked) draft.add(event.target.value); else draft.delete(event.target.value);
        renderMultiFilterOptions(field);
      });

      document.addEventListener("click", event => {
        if (!event.target.closest(".multi-filter")) closeAllMultiFilters();
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeAllMultiFilters();
      });

      $("#clearGlobalFilters").addEventListener("click", () => {
        state.globalFilters = {};
        const q = document.querySelector('[data-global-filter="q"]');
        if (q) q.value = "";
        closeAllMultiFilters();
        GLOBAL_MULTI_FILTERS.forEach(([field]) => updateMultiFilterTrigger(field));
        state.candidatePage = 1;
        state.recordPage = 1;
        renderAll();
      });

      document.addEventListener("input", event => {
        if (!event.target.matches("[data-settings-search]")) return;
        const field = event.target.closest("[data-settings-dimension]")?.dataset.settingsDimension;
        if (field) renderSettingsDimension(field);
      });

      document.addEventListener("change", event => {
        if (!event.target.matches("[data-settings-check]")) return;
        const field = event.target.dataset.field;
        const side = event.target.dataset.settingsCheck;
        if (!SETTINGS_FIELDS.includes(field) || !["included", "excluded"].includes(side)) return;
        const set = state.settingsSelection[field][side];
        if (event.target.checked) set.add(event.target.value); else set.delete(event.target.value);
        renderSettingsDimension(field);
      });

      document.addEventListener("click", event => {
        const action = event.target.closest("[data-settings-action]");
        if (action) transferSettingsValues(action.dataset.field, action.dataset.settingsAction);
      });
      $("#resetRecruitmentExclusions").addEventListener("click", resetRecruitmentExclusions);'''
replace_once(old_events, new_events, "global filter / settings events")

if src == original:
    raise SystemExit("patch produced no changes")

HTML_PATH.write_text(src, encoding="utf-8")

# Persistent regression test: static because the dashboard intentionally has no runtime test dependency.
test_src = r'''import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "frontend/analytics/dashboards/new-hr-collection/recruitment-analytics/index.html";
const html = readFileSync(path, "utf8");
const fields = ["year", "unit", "responsible", "status", "level_category", "resource"];

test("Recruitment global dimensions use Excel-style multi-select shells", () => {
  for (const field of fields) {
    assert.match(html, new RegExp(`data-multi-filter="${field}"`));
    assert.doesNotMatch(html, new RegExp(`<select[^>]+data-global-filter="${field}"`));
  }
  assert.match(html, /data-global-filter="q"/);
  assert.match(html, /data-multi-select-all/);
  assert.match(html, /data-multi-clear/);
  assert.match(html, /data-multi-apply/);
  assert.match(html, /data-multi-cancel/);
  assert.match(html, /state\.filterDrafts\[field\] = new Set\(applied\)/);
});

test("Recruitment multi-select state is applied as an array filter", () => {
  assert.match(html, /if \(Array\.isArray\(val\)\)/);
  assert.match(html, /if \(val\.length === 0\) return false/);
  assert.match(html, /if \(!val\.includes\(text\(record\[key\]\)\)\) return false/);
  assert.match(html, /options\.filter\(value => draft\.has\(value\)\)/);
});

test("Recruitment Settings exposes adjacent Included and Excluded controls", () => {
  assert.match(html, /data-view="settings"/);
  assert.match(html, /data-view-panel="settings"/);
  assert.match(html, /data-settings-dimension="unit"/);
  assert.match(html, /data-settings-dimension="position_name"/);
  assert.match(html, />Included</);
  assert.match(html, />Excluded</);
  assert.match(html, /Exclude selected →/);
  assert.match(html, /← Include selected/);
  assert.match(html, /id="resetRecruitmentExclusions"/);
});

test("Settings exclusions are browser-local and form a global analysis boundary", () => {
  assert.match(html, /aizanoi-recruitment-settings-v1/);
  assert.match(html, /localStorage\.getItem\(SETTINGS_STORAGE_KEY\)/);
  assert.match(html, /localStorage\.setItem\(SETTINGS_STORAGE_KEY/);
  assert.match(html, /function recordExcluded\(record\)/);
  assert.match(html, /state\.excludedValues\.unit\.has\(text\(record\.unit\)\)/);
  assert.match(html, /state\.excludedValues\.position_name\.has\(text\(record\.position_name\)\)/);
  assert.match(html, /function recordMatches\(record, filters\) \{\s*if \(recordExcluded\(record\)\) return false/);
});

test("Reset Filters does not erase Settings exclusions", () => {
  const resetStart = html.indexOf('$("#clearGlobalFilters").addEventListener');
  const resetEnd = html.indexOf('document.addEventListener("input", event => {', resetStart);
  assert.ok(resetStart >= 0 && resetEnd > resetStart);
  const resetBlock = html.slice(resetStart, resetEnd);
  assert.doesNotMatch(resetBlock, /excludedValues\.[a-z_]+\.clear\(/);
  assert.match(html, /function resetRecruitmentExclusions\(\)/);
});

test("Settings remains usable on narrow screens", () => {
  assert.match(html, /@media \(max-width: 820px\)[\s\S]*?\.settings-transfer-grid \{ grid-template-columns: 1fr; \}/);
});
'''
TEST_PATH.write_text(test_src, encoding="utf-8")
print(f"patched {HTML_PATH.relative_to(ROOT)} and wrote {TEST_PATH.relative_to(ROOT)}")
