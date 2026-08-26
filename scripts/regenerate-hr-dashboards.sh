#!/usr/bin/env bash
# Regenerate the HR Analytics Full Set catalog and the standalone Workforce
# Turnover dashboard from the synthetic workbook.
#
# This is a thin orchestration over the existing generator scripts; it does not
# rewrite them. Run from repo root:  bash scripts/regenerate-hr-dashboards.sh
#
# Order matters:
#   1. synthetic-core generator (Node) writes the deterministic HR demo core.
#   2. shared-core generator (Python) emits the 9 dashboards that share the
#      common HTML/CSS/JS contract.
#   3. Workforce Turnover generator (Python) emits the standalone 8-view dashboard.
#   4. Sanity check: every expected dashboard index.html exists under
#      frontend/analytics/dashboards/hr-analytics-full-set/.

set -euo pipefail
cd /opt/aizanoi-analytics-public

EXPECTED=(
  index.html
  corporate-goals/index.html
  hr-administration-deep-dive/index.html
  hr-executive-board-current/index.html
  hr-executive-board-full-history/index.html
  learning-academy-analytics/index.html
  performance-hiring-turnover/index.html
  store-learning-compliance/index.html
  store-operations-tracking/index.html
  workforce-time-attendance/index.html
  workforce-turnover/index.html
)

echo "[1/3] synthetic-core: deterministic HR Demo Core workbook (optional)"
# The repo commits the pre-built xlsx so the Python generators do not depend on
# the Node synthetic-core regenerator running. If @oai/artifact-tool is
# installed, run the Node regen for parity; otherwise use the committed xlsx.
if node analytics/dashboards/hr-analytics-full-set/synthetic-core/generate_hr_demo_core.mjs 2>/dev/null; then
  echo "[1/3] Node synthetic-core regen OK"
else
  echo "[1/3] Node synthetic-core skipped (deps missing or workbook pinned); using committed xlsx"
fi

echo "[2/3] shared-core: 9 dashboards (HTML/CSS/JS + chart data)"
python3 analytics/dashboards/hr-analytics-full-set/generate_full_set_dashboards.py

echo "[3/3] standalone: Workforce Turnover (8-view + forecast)"
python3 analytics/dashboards/hr-analytics-full-set/workforce-turnover/generate_turnover_dashboard.py

echo
echo "[check] verifying expected dashboard outputs"
missing=()
for rel in "${EXPECTED[@]}"; do
  f="frontend/analytics/dashboards/hr-analytics-full-set/${rel}"
  if [[ ! -s "$f" ]]; then
    missing+=("$f")
  fi
done
if (( ${#missing[@]} > 0 )); then
  echo "FATAL: missing or empty dashboard outputs:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 3
fi
echo "[check] OK: 11 dashboards emitted"

# Final regression contract: no build artifacts leaked into the public tree.
echo "[check] denylist regression"
leaks=$(cd frontend && find . -type f \( \
  -name '*.py' -o \
  -name '*.xlsx' -o \
  -name 'pipeline-manifest.json' \
\) 2>/dev/null || true)
if [[ -n "$leaks" ]]; then
  echo "FATAL: denylisted artifacts leaked into frontend/:" >&2
  printf '%s\n' "$leaks" >&2
  exit 4
fi
echo "[check] OK: no source/build artifacts under frontend/"
echo "[done] HR Analytics Full Set regenerated"
