# Operations and recovery checklist

This document separates source-controlled product work from provider/server actions that require independent evidence. Do not mark an item complete merely because configuration guidance exists in Git.

## GitHub repository controls

Recommended `main` policy:

- require pull requests before merge;
- block force-push and branch deletion;
- require the Aizanoi CI `validate`, `browser-smoke` and `lighthouse` jobs;
- enable Dependabot alerts and security updates;
- enable private vulnerability reporting;
- keep secret scanning/push protection enabled;
- use `.github/CODEOWNERS` for workflow, service-worker and security-sensitive source.

These settings live in GitHub repository administration, not in the static web runtime. Verify them in GitHub after configuration rather than inferring them from this file.

## Production deployment

Before every production frontend rollout:

1. record the exact Git commit SHA;
2. create a timestamped rollback snapshot outside the active webroot;
3. verify the snapshot is readable;
4. deploy only the intended static runtime files;
5. verify source ↔ production checksums for changed files;
6. test `/`, all three Historical Worlds and critical app assets;
7. verify historical API fail-closed behavior;
8. check for new browser/server errors;
9. keep the rollback until the release has been exercised normally.

Source-controlled reference: `infra/nginx/aizanoianalytics.com.conf.example`.

## Static delivery checks

Production Nginx should be verified for:

- gzip (and optionally Brotli if the installed module supports it);
- `application/manifest+json` for `.webmanifest`;
- no-cache/revalidate behavior for root HTML and manifest;
- no-store for `service-worker.js`;
- bounded caching for unhashed JS/CSS;
- longer caching for stable image/icon assets;
- `/.well-known/security.txt`;
- no application `proxy_pass` or listener on the retired visitor backend;
- `/api/chat -> 410` and other `/api/* -> 404`.

Do not use one-year `immutable` caching until asset filenames are content-hashed.

## Off-site disaster recovery

A rollback directory on the same VPS protects against a bad deploy, not against VPS/disk/account loss.

Minimum off-site backup set:

- production frontend snapshot;
- sanitized inventory/checksums;
- `/etc/nginx` configuration;
- SSH daemon configuration;
- firewall/UFW state export;
- Fail2ban configuration;
- deployment/restore manifest.

Recommended retention:

- 7 daily copies;
- 4 weekly copies;
- encrypted storage in a different failure domain (for example a Storage Box/object store or separate provider);
- monthly restore drill into a disposable directory/host.

A restore drill is successful only when files are downloaded, checksums verified and the static site can be served from the restored copy.

## SSH monitoring

The current authentication method is an explicit operations decision and should not be silently changed by application deployment. Regardless of authentication method, monitor successful logins:

- retain auth logs;
- alert on accepted SSH login;
- periodically review source addresses and Fail2ban recidivism;
- verify provider Console/Rescue access before relying on emergency recovery;
- keep the root password long, unique and managed outside this repository.

## Release verification record

A production report should state facts under these headings:

```text
DEPLOYED COMMIT
ROLLBACK SNAPSHOT
CHECKSUM PARITY
ROOT / PWA
FIELD SYSTEM DESKTOP
FIELD SYSTEM TABLET
FIELD SYSTEM MOBILE
HISTORICAL WORLDS
STATIC SECURITY
DELIVERY HEADERS
ERROR / REGRESSION CHECK
FINAL STATUS
```

Do not report real-browser interaction, provider firewall state, off-site backup success or PWA activation on a user's device unless it was actually observed.