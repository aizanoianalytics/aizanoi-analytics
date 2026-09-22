#!/usr/bin/env bash
# Aizanoi public deploy — staged release + atomic promotion contract.
#
# Source of truth: /opt/aizanoi-analytics-public/frontend/
# Active path:     /var/www/aizanoianalytics.com -> versioned release directory
# Release store:   /var/www/aizanoianalytics.com-releases/
#
# Only the frontend/ subtree is published. A release is fully staged, scrubbed,
# checked and promoted before the active webroot changes. After the one-time
# migration from a legacy real directory to a symlink, promotion is an atomic
# symlink rename and the previous release remains available for rollback.

set -euo pipefail
umask 022

# Exclusive process lock to serialize concurrent releases (R05)
DEPLOY_LOCK="/tmp/aizanoi-deploy.lock"
exec 200>"${DEPLOY_LOCK}"
if ! flock -n 200; then
  echo "FATAL: another deployment is currently in progress; refusing concurrent release" >&2
  exit 1
fi

REPO="/opt/aizanoi-analytics-public"
WEBROOT="/var/www/aizanoianalytics.com"
RELEASE_ROOT="/var/www/aizanoianalytics.com-releases"
# Tests may point these names at an isolated fake installation; production
# defaults above remain explicit for the publish-boundary contract.
REPO="${AIZANOI_DEPLOY_REPO:-${REPO}}"
WEBROOT="${AIZANOI_DEPLOY_WEBROOT:-${WEBROOT}}"
RELEASE_ROOT="${AIZANOI_DEPLOY_RELEASE_ROOT:-${RELEASE_ROOT}}"
SOURCE="${REPO}/frontend"
PUBLIC_SYNTHETIC_XLSX="analytics/dashboards/hr-analytics-full-set/downloads/hr-analytics-full-set-synthetic-output.xlsx"
RELEASE_RETENTION_DEFAULT=5
RELEASE_RETENTION="${AIZANOI_DEPLOY_RELEASE_RETENTION:-${RELEASE_RETENTION_DEFAULT}}"

if [[ ! "${RELEASE_RETENTION}" =~ ^[1-9][0-9]*$ ]]; then
  echo "FATAL: AIZANOI_DEPLOY_RELEASE_RETENTION must be a positive integer" >&2
  exit 2
fi
if (( RELEASE_RETENTION > 1000 )); then
  echo "FATAL: AIZANOI_DEPLOY_RELEASE_RETENTION must be at most 1000" >&2
  exit 2
fi

# Exact-SHA gate is mandatory per HERMES_OPERATIONS.md and runs before any
# filesystem mutation so a missing/mismatched value fails closed immediately.
# Example:
#   AIZANOI_DEPLOY_SHA="$TARGET_SHA" bash scripts/deploy-public.sh
if [[ -z "${AIZANOI_DEPLOY_SHA:-}" ]]; then
  echo "FATAL: AIZANOI_DEPLOY_SHA env variable is required for production deployment (HERMES_OPERATIONS.md)." >&2
  echo "  usage: AIZANOI_DEPLOY_SHA=\"<approved-sha>\" bash scripts/deploy-public.sh" >&2
  exit 2
fi
if [[ ! -d "${SOURCE}" ]]; then
  echo "FATAL: source tree missing: ${SOURCE}" >&2
  exit 2
fi
if [[ ! -s "${SOURCE}/${PUBLIC_SYNTHETIC_XLSX}" ]]; then
  echo "FATAL: declared public synthetic workbook missing: ${SOURCE}/${PUBLIC_SYNTHETIC_XLSX}" >&2
  exit 2
fi
if [[ -n "$(git -C "${REPO}" status --porcelain)" ]]; then
  echo "FATAL: repository working tree is not clean; refusing deployment" >&2
  exit 2
fi

CURRENT_SHA="$(git -C "${REPO}" rev-parse HEAD)"
if [[ "${CURRENT_SHA}" != "${AIZANOI_DEPLOY_SHA}" ]]; then
  echo "FATAL: checked-out SHA ${CURRENT_SHA} does not match approved AIZANOI_DEPLOY_SHA ${AIZANOI_DEPLOY_SHA}" >&2
  exit 2
fi

# Fail closed before staging if the target filesystem cannot hold a second
# copy of the source tree. The 10% margin plus 64 MiB floor covers rsync
# metadata and small concurrent growth; retention intentionally runs only
# after health succeeds, so this preflight cannot depend on deleting releases.
RELEASE_FS_PATH="${RELEASE_ROOT}"
if [[ ! -e "${RELEASE_FS_PATH}" ]]; then
  RELEASE_FS_PATH="$(dirname -- "${RELEASE_FS_PATH}")"
fi
SOURCE_KB="$(du -sk "${SOURCE}" | awk 'NR == 1 { print $1 }')"
AVAILABLE_KB="$(df -Pk "${RELEASE_FS_PATH}" | awk 'NR == 2 { print $4 }')"
if [[ ! "${SOURCE_KB}" =~ ^[0-9]+$ || ! "${AVAILABLE_KB}" =~ ^[0-9]+$ ]]; then
  echo "FATAL: unable to verify free disk space for release staging" >&2
  exit 2
fi
SOURCE_MARGIN_KB=$(( (SOURCE_KB + 9) / 10 ))
REQUIRED_FREE_KB=$(( SOURCE_KB + SOURCE_MARGIN_KB ))
if (( REQUIRED_FREE_KB < 65536 )); then
  REQUIRED_FREE_KB=65536
fi
if (( AVAILABLE_KB < REQUIRED_FREE_KB )); then
  echo "FATAL: insufficient free disk space for release staging: ${AVAILABLE_KB} KiB available, ${REQUIRED_FREE_KB} KiB required" >&2
  exit 2
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_ID="${CURRENT_SHA}-${STAMP}"
STAGING="${RELEASE_ROOT}/.staging-${RELEASE_ID}-$$"
FINAL="${RELEASE_ROOT}/${RELEASE_ID}"
NEXT_LINK="${WEBROOT}.next.$$"
ROLLBACK_LINK="${WEBROOT}.rollback.$$"
ROLLBACK_TARGET="none"
LEGACY_ROLLBACK=""
SYMLINK_PROMOTED=0
HEALTH_OK=0

prune_old_releases() {
  local candidate base kept=0
  local -a releases=() sorted_releases=()

  # Only direct child directories with the exact release naming contract are
  # eligible. This deliberately excludes .staging-* entries, legacy-*
  # snapshots, arbitrary directories and anything nested below RELEASE_ROOT.
  while IFS= read -r -d '' candidate; do
    base="${candidate##*/}"
    if [[ "${base}" =~ ^[0-9a-f]{40}-[0-9]{8}T[0-9]{6}Z$ ]]; then
      releases+=("${base}")
    fi
  done < <(find "${RELEASE_ROOT}" -mindepth 1 -maxdepth 1 -type d -print0)

  if (( ${#releases[@]} == 0 )); then
    return 0
  fi

  # The timestamp is the second hyphen-separated field, so this keeps the
  # newest eligible releases independent of their SHA prefixes. FINAL and
  # ROLLBACK_TARGET are always protected separately from this count.
  mapfile -t sorted_releases < <(printf '%s\n' "${releases[@]}" | sort -t- -k2,2r -k1,1r)
  for base in "${sorted_releases[@]}"; do
    candidate="${RELEASE_ROOT}/${base}"
    if [[ "${candidate}" == "${FINAL}" || "${candidate}" == "${ROLLBACK_TARGET}" ]]; then
      continue
    fi
    if (( kept < RELEASE_RETENTION )); then
      kept=$(( kept + 1 ))
      continue
    fi
    echo "[deploy] pruning old release ${candidate}"
    rm -rf -- "${candidate}"
  done
}

cleanup() {
  local active=""
  rm -rf "${STAGING}" 2>/dev/null || true
  rm -f "${NEXT_LINK}" "${ROLLBACK_LINK}" 2>/dev/null || true

  # If promotion happened but post-promotion verification failed, restore the
  # prior versioned/legacy release before exiting with the original failure.
  if [[ "${SYMLINK_PROMOTED}" -eq 1 && "${HEALTH_OK}" -eq 0 && -L "${WEBROOT}" ]]; then
    active="$(readlink -f "${WEBROOT}" 2>/dev/null || true)"
    if [[ "${active}" == "${FINAL}" ]]; then
      if [[ "${ROLLBACK_TARGET}" != "none" && -d "${ROLLBACK_TARGET}" ]]; then
        ln -s "${ROLLBACK_TARGET}" "${ROLLBACK_LINK}" 2>/dev/null || true
        mv -Tf "${ROLLBACK_LINK}" "${WEBROOT}" 2>/dev/null || true
      else
        rm -f "${WEBROOT}" 2>/dev/null || true
      fi
      if command -v nginx >/dev/null 2>&1; then
        nginx -s reload >/dev/null 2>&1 || true
      fi
    fi
  fi

  # A failure during the one-time legacy-directory transition before the new
  # symlink is installed must put the original directory back in place.
  if [[ "${SYMLINK_PROMOTED}" -eq 0 && -n "${LEGACY_ROLLBACK}" && ! -e "${WEBROOT}" && ! -L "${WEBROOT}" && -d "${LEGACY_ROLLBACK}" ]]; then
    mv "${LEGACY_ROLLBACK}" "${WEBROOT}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

mkdir -p "${RELEASE_ROOT}" "${STAGING}"

echo "[deploy] staging ${SOURCE}/ -> ${STAGING}/"
rsync -a --delete \
  --exclude='*.bak' \
  --exclude='*.bak_*' \
  --exclude='*.broken_*' \
  --exclude='*.tmp' \
  --exclude='*.old' \
  --exclude='*~' \
  --exclude='*.swp' \
  --exclude='.DS_Store' \
  "${SOURCE}/" "${STAGING}/"

# A static release must never contain symlinks: rsync -a preserves them and
# Nginx could otherwise resolve a path outside the immutable release tree.
if find "${STAGING}" -type l -print -quit | grep -q .; then
  echo "FATAL: staged release contains symbolic links; refusing promotion" >&2
  exit 3
fi

# Remove source/build/editor artifacts before a release can be promoted.
echo "[deploy] scrubbing denylisted artifacts from staged release"
(
  cd "${STAGING}"
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

(
  cd "${STAGING}/analytics" 2>/dev/null || exit 0
  find . -path '*synthetic-core*' -prune -exec rm -rf {} +
  find . -name 'README.md' -path '*/dashboards/*' -delete
  true
)

# Owner-retired route: it must remain absent from every promoted release.
if [[ -d "${STAGING}/analytics/workforce-turnover" ]]; then
  rm -rf "${STAGING}/analytics/workforce-turnover"
  echo "[deploy] removed legacy /analytics/workforce-turnover/ (owner-retired)"
fi

# Negative security smoke runs against staging, never against a partially
# replaced live tree.
echo "[deploy] running staged negative security smoke"
LEAKS=$(
  cd "${STAGING}" && find . -type f \( \
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
  echo "FATAL: denylisted artifacts remain in staged release:" >&2
  printf '%s\n' "${LEAKS}" >&2
  exit 3
fi
if [[ ! -s "${STAGING}/${PUBLIC_SYNTHETIC_XLSX}" ]]; then
  echo "FATAL: public synthetic workbook is missing or empty after staging" >&2
  exit 4
fi
if [[ ! -s "${STAGING}/index.html" || ! -s "${STAGING}/release.js" || ! -s "${STAGING}/service-worker.js" ]]; then
  echo "FATAL: staged core shell assets are missing" >&2
  exit 4
fi

# Validate the installed production Nginx configuration before changing the
# active release. This does not reload Nginx; it only gates promotion.
if command -v nginx >/dev/null 2>&1; then
  echo "[deploy] validating Nginx configuration"
  nginx -t
else
  echo "FATAL: nginx executable not found; refusing production promotion" >&2
  exit 5
fi

# Freeze the verified staging tree under an immutable-by-convention release id.
mv "${STAGING}" "${FINAL}"
ln -s "${FINAL}" "${NEXT_LINK}"

if [[ -L "${WEBROOT}" ]]; then
  ROLLBACK_TARGET="$(readlink -f "${WEBROOT}" || true)"
  mv -Tf "${NEXT_LINK}" "${WEBROOT}"
elif [[ -d "${WEBROOT}" ]]; then
  # One-time transition for installations created before versioned releases.
  # The old directory is retained as a rollback snapshot.
  LEGACY_ROLLBACK="${RELEASE_ROOT}/legacy-${STAMP}"
  mv "${WEBROOT}" "${LEGACY_ROLLBACK}"
  ROLLBACK_TARGET="${LEGACY_ROLLBACK}"
  mv -Tf "${NEXT_LINK}" "${WEBROOT}"
elif [[ ! -e "${WEBROOT}" ]]; then
  mv -Tf "${NEXT_LINK}" "${WEBROOT}"
else
  echo "FATAL: active webroot is neither a directory, symlink nor absent: ${WEBROOT}" >&2
  exit 6
fi
SYMLINK_PROMOTED=1

# Verify the promoted pointer and minimum public payload before declaring the
# release successful. cleanup() restores ROLLBACK_TARGET on any failure here.
if [[ ! -L "${WEBROOT}" ]]; then
  echo "FATAL: promotion did not leave an active release symlink" >&2
  exit 7
fi
ACTIVE_TARGET="$(readlink -f "${WEBROOT}")"
if [[ "${ACTIVE_TARGET}" != "${FINAL}" ]]; then
  echo "FATAL: active release target mismatch: ${ACTIVE_TARGET} != ${FINAL}" >&2
  exit 7
fi
if [[ ! -s "${WEBROOT}/${PUBLIC_SYNTHETIC_XLSX}" ]]; then
  echo "FATAL: promoted public synthetic workbook is missing or empty" >&2
  exit 7
fi
if [[ ! -s "${WEBROOT}/index.html" || ! -s "${WEBROOT}/release.js" || ! -s "${WEBROOT}/service-worker.js" ]]; then
  echo "FATAL: promoted core shell assets are missing" >&2
  exit 7
fi

# Nginx must reload successfully after promotion, so it serves the exact
# release that was just validated. Any failure still rolls the symlink back.
if ! nginx -s reload; then
  echo "FATAL: Nginx reload failed after promotion" >&2
  exit 8
fi

# Post-promotion health smoke check (R04).
#
# The deployment is finalised only after the promoted release is observed
# serving real content from the canonical production host. Earlier versions
# accepted any 2xx/3xx on plain HTTP, which let the HTTP→HTTPS redirect
# itself count as "healthy" without ever proving the promoted release is
# actually serving on the HTTPS terminal. That is fail-open: a deploy that
# only broke the HTTPS path could still be marked successful.
#
# Contract:
#   1. curl is mandatory; missing client fails closed.
#   2. The probe MUST reach the canonical production host
#      (aizanoianalytics.com by default) and MUST resolve through the
#      server's own loopback so it never silently hits an external mirror.
#   3. The probe MUST follow redirects (curl -L). The terminal response
#      after redirect chain MUST be 2xx. A 3xx loop or a non-2xx terminal
#      (404/500/502/...) fails the deployment.
#   4. CI test runners that need to point the probe at a fake loopback
#      install may opt in with AIZANOI_DEPLOY_HEALTH_INSECURE_HTTP=1 and
#      override the host/port through AIZANOI_DEPLOY_HEALTH_HOST /
#      AIZANOI_DEPLOY_HEALTH_PORT. The override keeps the same
#      terminal-2xx-after-redirect contract and still fails closed on
#      unreachable loopback. Production must never set these.
if ! command -v curl >/dev/null 2>&1; then
  echo "FATAL: curl executable not found; refusing to finalize deployment" >&2
  exit 8
fi

HEALTH_HOST="${AIZANOI_DEPLOY_HEALTH_HOST:-aizanoianalytics.com}"
HEALTH_PORT="${AIZANOI_DEPLOY_HEALTH_PORT:-443}"
HEALTH_SCHEME="${AIZANOI_DEPLOY_HEALTH_SCHEME:-https}"
if [[ "${AIZANOI_DEPLOY_HEALTH_INSECURE_HTTP:-0}" == "1" ]]; then
  HEALTH_SCHEME="http"
fi

HEALTH_RESOLVE_FLAG=()
if [[ "${HEALTH_SCHEME}" == "https" ]]; then
  HEALTH_RESOLVE_FLAG=(--resolve "${HEALTH_HOST}:${HEALTH_PORT}:127.0.0.1")
fi
HEALTH_URL="${HEALTH_SCHEME}://${HEALTH_HOST}:${HEALTH_PORT}"

# Pre-check: the host must answer on its loopback proxy. If it doesn't, the
# promotion can never be verified and the deploy must fail closed.
if ! curl -sfI -L "${HEALTH_RESOLVE_FLAG[@]}" --max-time 10 "${HEALTH_URL}/" >/dev/null 2>&1; then
  echo "FATAL: post-promotion health pre-check failed: ${HEALTH_URL}/ unreachable through loopback" >&2
  exit 8
fi

echo "[deploy] running post-promotion HTTPS health smoke against ${HEALTH_URL}"
probe_failed=0
for path in "/" "/index.html" "/release.js" "/service-worker.js"; do
  # -L follows redirects (HTTP→HTTPS, trailing-slash, etc.).
  # --write-out '%{http_code}' captures the terminal status code after the
  # full redirect chain. %{num_redirects} lets us detect a redirect loop.
  # %{url_effective} tells us which URL finally answered.
  out=$(curl -s -L "${HEALTH_RESOLVE_FLAG[@]}" --max-time 10 \
    -o /dev/null \
    -w '%{http_code} %{num_redirects} %{url_effective}' \
    "${HEALTH_URL}${path}" || true)
  status=$(printf '%s' "${out}" | awk '{print $1}')
  redirects=$(printf '%s' "${out}" | awk '{print $2}')
  effective=$(printf '%s' "${out}" | awk '{print $3}')
  if (( redirects > 8 )); then
    echo "FATAL: post-promotion health check redirect loop for ${path} (redirects=${redirects})" >&2
    probe_failed=1
    break
  fi
  case "${status}" in
    2??)
      # Terminal 2xx is the only success contract. Anything else, including
      # 3xx that survived -L (broken redirect chain) and 4xx/5xx, fails.
      ;;
    *)
      echo "FATAL: post-promotion health check failed for ${path}: terminal=${status} redirects=${redirects} effective=${effective}" >&2
      probe_failed=1
      break
      ;;
  esac
done
if [[ "${probe_failed}" -ne 0 ]]; then
  exit 8
fi
HEALTH_OK=1
echo "[deploy] HTTPS health smoke passed (terminal 2xx confirmed for all probes)"

# Retention is deliberately post-health: a failed or rolled-back deployment
# never prunes the release store. A healthy deployment remains active if a
# non-critical cleanup deletion is refused by the filesystem.
if ! prune_old_releases; then
  echo "WARNING: release retention could not complete; active release remains ${FINAL}" >&2
fi

printf '[deploy] deployed commit: %s\n' "${CURRENT_SHA}"
printf '[deploy] active release: %s\n' "${FINAL}"
printf '[deploy] rollback target: %s\n' "${ROLLBACK_TARGET}"
echo "[deploy] OK"
