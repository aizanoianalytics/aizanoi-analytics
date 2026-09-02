# Infrastructure examples

These are sanitized reference configurations for deployment. **Production Nginx/TLS files and credentials are maintained on the server and are not copied from this directory automatically.** A Git merge therefore does not, by itself, update the live Hetzner configuration.

- `nginx/aizanoianalytics.com.conf.example` — static frontend, canonical redirects, real 404/500/503 behavior, Historical World routes, compression/cache guidance and fail-closed historical API paths;
- `nginx/snippets/aizanoi-static-security-headers.conf.example` — shared strict header/CSP baseline for the shell, landings and assets;
- `nginx/snippets/aizanoi-web-editor-preview-headers.conf.example` — isolated CSP for the sandboxed Web Editor preview runner; this is the only AizanoiOS route allowed to evaluate visitor-authored browser code;
- `nginx/snippets/aizanoi-hr-analytics-security-headers.conf.example` — complete route-scoped header set for the original self-contained HR dashboard exports;
- `nginx/snippets/aizanoi-historical-world-security-headers.conf.example` — complete route-scoped header set for worlds that still require inline boot code.

The public Aizanoi web runtime does not require a Node/Express backend or an `aizanoi-backend.service` systemd unit. Hermes Agent is a separate server service and is outside this visitor-facing deployment example.

## Nginx baseline decisions

The reference Nginx configuration intentionally documents the operational assumptions that must match production:

- unknown URLs return a real HTTP 404 instead of a soft-SPA 200;
- `404.html`, `500.html` and `503.html` are the custom visitor-facing error documents;
- Aizanoi, Rome and Athens Historical World routes are explicitly served;
- `/api/chat` returns `410 Gone` for stale historical clients;
- every other `/api/*` path returns 404; there is no application reverse proxy;
- the shell, product landings and shared assets use the strict shared CSP: neither `script-src` nor `style-src` permits `unsafe-inline`;
- `/web-editor-preview/` is the sole route with the Web Editor preview policy; it permits authored script/style execution only because the parent embeds it with an opaque-origin iframe sandbox that omits same-origin, forms, popups, downloads and top navigation;
- the HR Analytics Full Set keeps the original generator's self-contained HTML format, so only that exact route loads the HR-specific header snippet that permits embedded scripts and styles;
- Historical Worlds still contain city-local inline boot scripts and styles, so only their exact route locations load the historical-world header snippet that permits inline code;
- legacy `/videos` → `/tv/`, `/games` → `/arcade/` and `/projects` → `/forge/` redirects preserve old bookmarks without keeping duplicate discovery URLs;
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP and CORP are emitted at the edge;
- root HTML, the manifest and service worker revalidate; unhashed application modules/styles use bounded caches; static assets use a longer cache;
- gzip is enabled in the example. Brotli is an optional production addition only when the installed Nginx build exposes the Brotli module.

## Production update checklist

When the example changes in Git, apply the corresponding production change deliberately:

1. compare the server's active Nginx virtual host with the example;
2. preserve the real domain, TLS certificate paths and server-specific settings;
3. preserve the static-only boundary: no Aizanoi application reverse proxy or visitor-facing Node listener;
4. install/update every route-scoped header snippet referenced by the virtual host, including the Web Editor preview snippet when that feature is released;
5. run `nginx -t` before reload;
6. reload rather than restart when possible;
7. verify `/`, `/web-editor-preview/`, the HR Analytics Full Set and one interactive dashboard, `/historic-world/`, Rome, Athens, `/api/chat`, another missing `/api/...` path and the custom error documents;
8. verify compression and cache headers from the public edge rather than assuming the example is active;
9. keep credentials, production snapshots and off-site backups outside this repository.

## Provider / server settings that Git cannot prove

The repository can document these items but a commit cannot claim they are enabled. Verify them separately when doing an infrastructure review:

- public gzip/Brotli and cache-header behavior from the live domain;
- provider firewall and backup/snapshot policy;
- encrypted off-site backup coverage and restore testing;
- repository settings such as branch protection, Dependabot and private vulnerability reporting when those settings are intentionally used.

These examples are reviewable deployment inputs, not an automatic deployment mechanism. Production remains unchanged until the server-side deployment process applies and verifies a release.
