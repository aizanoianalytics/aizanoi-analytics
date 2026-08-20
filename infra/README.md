# Infrastructure examples

These are sanitized reference configurations for deployment. **Production Nginx/TLS files and credentials are maintained on the server and are not copied from this directory automatically.** A Git merge therefore does not, by itself, update the live Hetzner configuration.

- `nginx/aizanoianalytics.com.conf.example` — static frontend, real 404/500/503 behavior, Historical World routes, compression/cache guidance, security-header/CSP baseline and fail-closed historical API paths

The public Aizanoi web runtime does not require a Node/Express backend or an `aizanoi-backend.service` systemd unit. Hermes Agent is a separate server service and is outside this visitor-facing deployment example.

## Nginx baseline decisions

The reference Nginx configuration intentionally documents the operational assumptions that must match production:

- unknown URLs return a real HTTP 404 instead of a soft-SPA 200;
- `404.html`, `500.html` and `503.html` are the custom visitor-facing error documents;
- Aizanoi, Rome and Athens Historical World routes are explicitly served;
- `/api/chat` returns `410 Gone` for stale historical clients;
- every other `/api/*` path returns 404; there is no application reverse proxy;
- Field System v3 uses external JavaScript and canonical stylesheet layers; `script-src` therefore needs no `unsafe-inline`;
- `style-src 'unsafe-inline'` remains only for small city-local inline presentation metadata in the existing Historical World sources and should be removed when that markup is extracted;
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP and CORP are emitted at the edge;
- root HTML, the manifest and service worker revalidate; unhashed application modules/styles use bounded caches; static assets use a longer cache;
- gzip is enabled in the example. Brotli is an optional production addition only when the installed Nginx build exposes the Brotli module.

## Production update checklist

When the example changes in Git, apply the corresponding production change deliberately:

1. compare the server's active Nginx virtual host with the example;
2. preserve the real domain, TLS certificate paths and server-specific settings;
3. preserve the static-only boundary: no Aizanoi application reverse proxy or visitor-facing Node listener;
4. run `nginx -t` before reload;
5. reload rather than restart when possible;
6. verify `/`, `/historic-world/`, Rome, Athens, `/api/chat`, another missing `/api/...` path and the custom error documents;
7. verify compression and cache headers from the public edge rather than assuming the example is active;
8. keep credentials, production snapshots and off-site backups outside this repository.

## Provider / server settings that Git cannot prove

The repository can document these items but a commit cannot claim they are enabled. Verify them separately when doing an infrastructure review:

- public gzip/Brotli and cache-header behavior from the live domain;
- provider firewall and backup/snapshot policy;
- encrypted off-site backup coverage and restore testing;
- repository settings such as branch protection, Dependabot and private vulnerability reporting when those settings are intentionally used.

These examples are reviewable deployment inputs, not an automatic deployment mechanism. Production remains unchanged until the server-side deployment process applies and verifies a release.
