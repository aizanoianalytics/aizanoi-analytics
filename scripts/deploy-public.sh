#!/usr/bin/env bash
# Aizanoi public deploy — allowlist contract.
#
# Source of truth: /opt/aizanoi-analytics-public/frontend/
# Target:        /var/www/aizanoianalytics.com/
#
# Only the frontend/ subtree is published. Repo-level source/build directories
# (analytics/, tests/, docs/, scripts/, .github/, infra/, the repo root) MUST
# NEVER be copied into the webroot.

set -euo pipefail

REPO="/opt/aizanoi-analytics-public"
WEBROOT="/var/www/aizanoianalytics.com"
SOURCE="${REPO}/frontend"
PUBLIC_SYNTHETIC_XLSX="analytics/dashboards/hr-analytics-full-set/downloads/hr-analytics-full-set-synthetic-output.xlsx"

if [[ ! -d "${SOURCE}" ]]; then
  echo "FATAL: source tree missing: ${SOURCE}" >&2
  exit 2
fi

if [[ ! -s "${SOURCE}/${PUBLIC_SYNTHETIC_XLSX}" ]]; then
  echo "FATAL: declared public synthetic workbook missing: ${SOURCE}/${PUBLIC_SYNTHETIC_XLSX}" >&2
  exit 2
fi

echo "[deploy] mirroring ${SOURCE}/ -> ${WEBROOT}/"
# frontend/ is the public source tree, but local/editor artifacts inside it are
# never publishable even when Git ignores them. Exclude them before transfer;
# the later scrub also deletes stale copies that may already exist in webroot.
# Absolute-source form is intentionally cwd-independent.
rsync -a --delete \
  --exclude='*.bak' \
  --exclude='*.bak_*' \
  --exclude='*.broken_*' \
  --exclude='*.tmp' \
  --exclude='*.old' \
  --exclude='*~' \
  --exclude='*.swp' \
  --exclude='.DS_Store' \
  "${SOURCE}/" "${WEBROOT}/"

# Remove stale source/build/editor artifacts that may have leaked into the
# webroot by a prior bad deploy. One explicitly declared synthetic workbook is
# a public product download and must survive the scrub.
echo "[deploy] scrubbing denylisted artifacts from webroot"
(
  cd "${WEBROOT}"
  find . -type f \( \
      -name '*.py' -o \
      -name 'pipeline-manifest.json' -o \
      -name '*.bak' -o \
      -name '*.bak_*' -o \
      -name '*.broken_*' -o \
      -name '*.tmp' -o \
      -name '*.old' -o \
      -name '*~' -o \
      -name '*.swp' -o \
      -name '.DS_Store' -o \
      \( -name '*.xlsx' ! -path "./${PUBLIC_SYNTHETIC_XLSX}" \) \
    \) -print -delete 2>/dev/null || true
)

# README.md and synthetic-core/ under analytics/dashboards/hr-analytics-full-set/
# are build/source artifacts rather than public product assets.
(
  cd "${WEBROOT}/analytics" 2>/dev/null || exit 0
  find . -path '*synthetic-core*' -prune -exec rm -rf {} +
  find . -name 'README.md' -path '*/dashboards/*' -delete
  true
)

# Remove the intentional-retirement legacy route if it sneaks back.
# /analytics/workforce-turnover/ 404 contract (owner decision 2026-08-26).
if [[ -d "${WEBROOT}/analytics/workforce-turnover" ]]; then
  rm -rf "${WEBROOT}/analytics/workforce-turnover"
  echo "[deploy] removed legacy /analytics/workforce-turnover/ (owner-retired)"
fi

# Public negative-smoke: no undeclared source/build/editor artifact may remain,
# while the declared synthetic workbook must still be present and non-empty.
echo "[deploy] running negative security smoke"
LEAKS=$(
  cd "${WEBROOT}" && find . -type f \( \
    -name '*.py' -o \
    -name 'pipeline-manifest.json' -o \
    -name '*.bak' -o \
    -name '*.bak_*' -o \
    -name '*.broken_*' -o \
    -name '*.tmp' -o \
    -name '*.old' -o \
    -name '*~' -o \
    -name '*.swp' -o \
    -name '.DS_Store' -o \
    \( -name '*.xlsx' ! -path "./${PUBLIC_SYNTHETIC_XLSX}" \) \
  \) -print 2>/dev/null || true
)
if [[ -n "${LEAKS}" ]]; then
  echo "FATAL: denylisted artifacts still in webroot:" >&2
  printf '%s\n' "${LEAKS}" >&2
  exit 3
fi
if [[ ! -s "${WEBROOT}/${PUBLIC_SYNTHETIC_XLSX}" ]]; then
  echo "FATAL: public synthetic workbook was removed or is empty after deploy" >&2
  exit 4
fi

echo "[deploy] OK"
