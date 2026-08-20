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
6. run `nginx -t` before reloading any production Nginx configuration;
7. test `/`, all three Historical Worlds and critical app assets;
8. verify historical API fail-closed behavior;
9. verify security headers on both HTML and static-asset responses;
10. verify mutable HTML/JS/CSS revalidate rather than remaining fresh under an old release;
11. check for new browser/server errors;
12. keep the rollback until the release has been exercised normally.

Source-controlled reference: `infra/nginx/aizanoianalytics.com.conf.example`.

## Static delivery checks

Production Nginx should be verified for:

- gzip (and optionally Brotli if the installed module supports it);
- `application/manifest+json` for `.webmanifest`;
- revalidation/no-cache behavior for root HTML, manifest, `service-worker.js`, unhashed JS/CSS and Historical World code;
- longer caching only for relatively stable image/icon/media assets;
- `/.well-known/security.txt`;
- CSP allowing `blob:` only where the browser-local PDF reader requires it (`frame-src`), without allowing inline JavaScript;
- security headers remaining present on responses that also carry cache policy headers;
- no application `proxy_pass` or listener on the retired visitor backend;
- `/api/chat -> 410` and other `/api/* -> 404`.

The reference config intentionally uses Nginx `expires` inside cache-specific locations rather than location-level `add_header Cache-Control`; on common Nginx versions, a location-level `add_header` would otherwise stop inheritance of the server-level security headers.

The Field System service worker precaches only the small core shell with `cache: reload` and must fail installation rather than activate a partial precache. App CSS, research modules and Historical Worlds intentionally remain network-lazy. Once requested, same-origin static assets use network-first delivery so mutable files can revalidate immediately after a release; a successful response refreshes the runtime cache and that cache is used only as the offline/network-failure fallback. When the core precache or delivery contract changes in a future release, bump the `aizanoi-field-shell-*` cache version so activation can retire the previous shell cache cleanly.

Do not use long-lived `immutable` caching until asset filenames are content-hashed.

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
