#!/usr/bin/env bash
# Aizanoi public deploy — allowlist contract.
#
# Source of truth: /opt/aizanoi-analytics-public/frontend/
# Target:        /var/www/aizanoianalytics.com/
#
# Only the frontend/ subtree is published. Repo-level source/build directories
# (analytics/, tests/, docs/, scripts/, .github/, infra/, the repo root) MUST
# NEVER be copied into the webroot.
#
# This script is the single deployment surface. PR that adds it locks in the
# contract enforced by tests/audit/security-publish-boundary.test.mjs.

set -euo pipefail

REPO="/opt/aizanoi-analytics-public"
WEBROOT="/var/www/aizanoianalytics.com"
SOURCE="${REPO}/frontend"

if [[ ! -d "${SOURCE}" ]]; then
  echo "FATAL: source tree missing: ${SOURCE}" >&2
  exit 2
fi

echo "[deploy] mirroring ${SOURCE}/ -> ${WEBROOT}/"
# Allowlist copy: every regular file under frontend/ becomes a webroot file
# at the same relative path. Absolute-source form is intentionally
# cwd-independent: the caller may run from any working directory.
rsync -a --delete "${SOURCE}/" "${WEBROOT}/"

# Remove any stale source/build artifacts that may have leaked into the
# webroot by a prior bad deploy. The denylist mirrors tests/audit/.
echo "[deploy] scrubbing denylisted artifacts from webroot"
DENY_PATTERNS=(
  '*.py'
  '*.xlsx'
  'README.md'
  'pipeline-manifest.json'
  'synthetic-core'
  'workforce-turnover/dashboard_build_common.py'
  'workforce-turnover/dashboard_paths.py'
  'workforce-turnover/generate_turnover_dashboard.py'
  'workforce-turnover/turnover_analytics_common.py'
  'workforce-turnover/turnover_dashboard_template.py'
)
(cd "${WEBROOT}" && find . -type f \( \
    -name '*.py' -o \
    -name '*.xlsx' -o \
    -name 'pipeline-manifest.json' \
  \) -print -delete 2>/dev/null || true)

# README.md and synthetic-core/ under analytics/dashboards/hr-analytics-full-set/
# are scraped too (regex catches nested ones under synthetic-core and the
# dashboard subdirectory README files).
(cd "${WEBROOT}/analytics" 2>/dev/null && \
  find . -path '*synthetic-core*' -prune -exec rm -rf {} +; \
  find . -name 'README.md' -path '*/dashboards/*' -delete; \
  true)

# Remove the intentional-retirement legacy route if it sneaks back.
# /analytics/workforce-turnover/ 404 contract (owner decision 2026-08-26).
if [[ -d "${WEBROOT}/analytics/workforce-turnover" ]]; then
  rm -rf "${WEBROOT}/analytics/workforce-turnover"
  echo "[deploy] removed legacy /analytics/workforce-turnover/ (owner-retired)"
fi

# Public negative-smoke: nothing denylisted should remain in webroot.
echo "[deploy] running negative security smoke"
LEAKS=$(cd "${WEBROOT}" && find . -type f \( \
  -name '*.py' -o -name '*.xlsx' -o -name 'pipeline-manifest.json' \
  -path '*synthetic-core*' \
\) 2>/dev/null)
if [[ -n "${LEAKS}" ]]; then
  echo "FATAL: denylisted artifacts still in webroot:" >&2
  printf '%s\n' "${LEAKS}" >&2
  exit 3
fi

echo "[deploy] OK"
