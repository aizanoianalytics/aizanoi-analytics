#!/usr/bin/env bash
# Rebuild and publish the HR Analytics Full Set from the parity-preserved
# ten-stage Python pipeline and committed synthetic-only source workbooks.
#
# Run from anywhere; the script resolves the repository root from its own path.
# Set REGENERATE_SYNTHETIC_INPUTS=1 only when @oai/artifact-tool is available
# and you intentionally want to recreate all 27 synthetic source workbooks.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

SOURCE_ROOT="analytics/dashboards/hr-analytics-full-set"
PIPELINE="${SOURCE_ROOT}/production-pipeline"
OUTPUTS="${PIPELINE}/dashboardlar"
PUBLIC="frontend/analytics/dashboards/hr-analytics-full-set"
SYNTHETIC_DOWNLOAD="${PUBLIC}/downloads/hr-analytics-full-set-synthetic-output.xlsx"
DECORATOR="scripts/hr/decorate-public-dashboard.mjs"
LOCALIZER="scripts/hr/localize-public-dashboard-en.mjs"
SANITIZER="scripts/hr/sanitize-public-dashboard.mjs"
HARDENER="scripts/hr/harden-generated-dashboard-html.mjs"
ENGLISH_RUNTIME="${PUBLIC}/hr-public-en.js"
VISIBLE_ENGLISH_RUNTIME="${PUBLIC}/hr-public-en-visible.js"

EXPECTED_INPUT_COUNT=27
INPUT_COUNT=$(find "${PIPELINE}" -maxdepth 1 -type f -name '*.xlsx' | wc -l | tr -d '[:space:]')
if [[ "${INPUT_COUNT}" != "${EXPECTED_INPUT_COUNT}" ]]; then
  echo "FATAL: expected ${EXPECTED_INPUT_COUNT} committed synthetic source workbooks, found ${INPUT_COUNT}" >&2
  exit 2
fi

if [[ "${REGENERATE_SYNTHETIC_INPUTS:-0}" == "1" ]]; then
  echo "[1/4] regenerating 27 deterministic synthetic source workbooks"
  node "${SOURCE_ROOT}/tools/generate_synthetic_source_workbooks.mjs" "${PIPELINE}"
else
  echo "[1/4] using 27 committed synthetic source workbooks"
  echo "      (set REGENERATE_SYNTHETIC_INPUTS=1 to recreate them intentionally)"
fi

INPUT_COUNT=$(find "${PIPELINE}" -maxdepth 1 -type f -name '*.xlsx' | wc -l | tr -d '[:space:]')
if [[ "${INPUT_COUNT}" != "${EXPECTED_INPUT_COUNT}" ]]; then
  echo "FATAL: synthetic source workbook count changed after regeneration: ${INPUT_COUNT}" >&2
  exit 3
fi

echo "[2/4] running the canonical ten-stage HR production pipeline"
python3 "${PIPELINE}/run_full_pipeline.py"

# Keep the parity-preserved Python source untouched while hardening the generated
# static HTML at the artifact boundary. These transformations are deterministic,
# idempotent and only escape data-derived text before it reaches HTML/SVG sinks.
node "${HARDENER}" \
  "${OUTPUTS}/ERD_P_admin.html" \
  "${OUTPUTS}/magaza_takip_dosya.html" \
  "${OUTPUTS}/performans_dashboard.html"

declare -A HTML_MAP=(
  ["ik_takip_dashboard.html"]="hr-executive-board-full-history/index.html"
  ["ik_takip_dashboard_2024_gunumuz.html"]="hr-executive-board-current/index.html"
  ["ERD_P_admin.html"]="hr-administration-deep-dive/index.html"
  ["magaza_takip_dosya.html"]="store-operations-tracking/index.html"
  ["turnover_dashboard.html"]="workforce-turnover/index.html"
  ["magaza_uyum_dashboard.html"]="store-learning-compliance/index.html"
  ["akademi_dashboard.html"]="learning-academy-analytics/index.html"
  ["performans_dashboard.html"]="performance-hiring-turnover/index.html"
  ["hedefler_dashboard.html"]="corporate-goals/index.html"
  ["pdks_takip_dashboard.html"]="workforce-time-attendance/index.html"
)

echo "[3/4] syncing generated artifacts to canonical public routes"
for source_name in "${!HTML_MAP[@]}"; do
  src="${OUTPUTS}/${source_name}"
  dst="${PUBLIC}/${HTML_MAP[${source_name}]}"
  if [[ ! -s "${src}" ]]; then
    echo "FATAL: pipeline output missing or empty: ${src}" >&2
    exit 4
  fi
  mkdir -p "$(dirname "${dst}")"
  cp "${src}" "${dst}"
done

PUBLIC_DASHBOARD_HTML=(
  "${PUBLIC}/corporate-goals/index.html"
  "${PUBLIC}/hr-administration-deep-dive/index.html"
  "${PUBLIC}/hr-executive-board-current/index.html"
  "${PUBLIC}/hr-executive-board-full-history/index.html"
  "${PUBLIC}/learning-academy-analytics/index.html"
  "${PUBLIC}/performance-hiring-turnover/index.html"
  "${PUBLIC}/store-learning-compliance/index.html"
  "${PUBLIC}/store-operations-tracking/index.html"
  "${PUBLIC}/workforce-time-attendance/index.html"
  "${PUBLIC}/workforce-turnover/index.html"
)

# Public chrome, metadata and language declaration belong to the publish layer,
# not the ten-stage analytics calculation pipeline. The decorator reads titles,
# summaries and interface-language metadata from the canonical Analytics catalog.
node "${DECORATOR}" "${PUBLIC_DASHBOARD_HTML[@]}"

# English presentation is also a publish-layer concern. The localizer preserves
# raw embedded data and business-logic values, and translates only rendered
# visitor-facing presentation through a deterministic shared runtime. It also
# switches explicit number/date presentation formatters from tr-TR to en-US.
node "${LOCALIZER}" "${PUBLIC_DASHBOARD_HTML[@]}"

# The executive boards embed the same PDKS document. Copy the fully decorated
# and localized canonical public artifact so the exact-hash dependency remains
# true; the publish chrome hides itself automatically when rendered in-frame.
for executive in hr-executive-board-current hr-executive-board-full-history; do
  cp "${PUBLIC}/workforce-time-attendance/index.html" "${PUBLIC}/${executive}/pdks_takip_dashboard.html"
done

GENERATED_PUBLIC_HTML=(
  "${PUBLIC}/corporate-goals/index.html"
  "${PUBLIC}/hr-administration-deep-dive/index.html"
  "${PUBLIC}/hr-executive-board-current/index.html"
  "${PUBLIC}/hr-executive-board-current/pdks_takip_dashboard.html"
  "${PUBLIC}/hr-executive-board-full-history/index.html"
  "${PUBLIC}/hr-executive-board-full-history/pdks_takip_dashboard.html"
  "${PUBLIC}/learning-academy-analytics/index.html"
  "${PUBLIC}/performance-hiring-turnover/index.html"
  "${PUBLIC}/store-learning-compliance/index.html"
  "${PUBLIC}/store-operations-tracking/index.html"
  "${PUBLIC}/workforce-time-attendance/index.html"
  "${PUBLIC}/workforce-turnover/index.html"
)

# The production pipeline keeps its original synthetic input filenames for
# parity/rebuild purposes. Public HTML receives a separate deterministic
# sanitization boundary so internal workbook labels and vendor identifiers do
# not become visitor-facing metadata or explanatory copy. Sanitization remains
# the final content mutation at the public boundary.
node "${SANITIZER}" "${GENERATED_PUBLIC_HTML[@]}"

# Fail closed if the committed English runtime/tag/visitor-format locale drifts.
node "${LOCALIZER}" --check "${GENERATED_PUBLIC_HTML[@]}"
node --check "${ENGLISH_RUNTIME}"
node --check "${VISIBLE_ENGLISH_RUNTIME}"

# Preserve exact regenerated public HTML and both English presentation runtimes
# in CI diagnostics so committed outputs can be synchronized from canonical output.
mkdir -p artifacts/diagnostics
tar -czf artifacts/diagnostics/hr-public-generated-html.tar.gz \
  "${GENERATED_PUBLIC_HTML[@]}" \
  "${ENGLISH_RUNTIME}" \
  "${VISIBLE_ENGLISH_RUNTIME}"

mkdir -p "$(dirname "${SYNTHETIC_DOWNLOAD}")"
cp "${OUTPUTS}/icmal_sorgu_sonuc.xlsx" "${SYNTHETIC_DOWNLOAD}"

EXPECTED_PUBLIC=(
  index.html
  hr-public-en.js
  hr-public-en-visible.js
  corporate-goals/index.html
  hr-administration-deep-dive/index.html
  hr-executive-board-current/index.html
  hr-executive-board-current/pdks_takip_dashboard.html
  hr-executive-board-full-history/index.html
  hr-executive-board-full-history/pdks_takip_dashboard.html
  learning-academy-analytics/index.html
  performance-hiring-turnover/index.html
  store-learning-compliance/index.html
  store-operations-tracking/index.html
  workforce-time-attendance/index.html
  workforce-turnover/index.html
  downloads/hr-analytics-full-set-synthetic-output.xlsx
)

missing=()
for rel in "${EXPECTED_PUBLIC[@]}"; do
  if [[ ! -s "${PUBLIC}/${rel}" ]]; then
    missing+=("${PUBLIC}/${rel}")
  fi
done
if (( ${#missing[@]} > 0 )); then
  echo "FATAL: missing or empty public HR artifacts:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 5
fi

if ! cmp -s "${OUTPUTS}/icmal_sorgu_sonuc.xlsx" "${SYNTHETIC_DOWNLOAD}"; then
  echo "FATAL: public synthetic workbook diverges from integrated pipeline output" >&2
  exit 6
fi

leaks=$(cd frontend && find . -type f \( \
  -name '*.py' -o \
  -name 'pipeline-manifest.json' -o \
  \( -name '*.xlsx' ! -path './analytics/dashboards/hr-analytics-full-set/downloads/hr-analytics-full-set-synthetic-output.xlsx' \) \
\) -print 2>/dev/null || true)
if [[ -n "${leaks}" ]]; then
  echo "FATAL: undeclared source/build artifacts leaked into frontend/:" >&2
  printf '%s\n' "${leaks}" >&2
  exit 7
fi

echo "[4/4] running HR audit contracts"
python3 scripts/verify-hr-historical-event-dates.py
node --test \
  tests/audit/hr-analytics-full-set.test.mjs \
  tests/audit/hr-generated-html-security.test.mjs \
  tests/audit/hr-public-artifact-safety.test.mjs \
  tests/audit/hr-public-entity-safety.test.mjs \
  tests/audit/security-publish-boundary.test.mjs

echo "[done] HR Analytics Full Set rebuilt and verified"
