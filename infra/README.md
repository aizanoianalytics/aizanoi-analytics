# Infrastructure examples

These are sanitized reference configurations for deployment. **Production nginx/systemd files and credentials are maintained on the server and are not copied from this directory automatically.** A Git merge therefore does not, by itself, update the live Hetzner configuration.

- `nginx/aizanoianalytics.com.conf.example` — static frontend, real 404/500/503 behavior, Ancient World routes, security-header/CSP baseline and `/api/` reverse proxy
- `systemd/aizanoi-backend.service.example` — backend service shape; verify the real Node path before use

## Nginx baseline decisions

The reference Nginx configuration intentionally documents the operational assumptions that must match production:

- unknown URLs return a real HTTP 404 instead of a soft-SPA 200;
- `404.html`, `500.html` and `503.html` are the custom visitor-facing error documents;
- Rome, Athens and Historic World standalone routes are explicitly served;
- `/api/` stays behind the loopback-only Node service;
- API proxy read/send timeouts are **85 seconds**, long enough for the backend's sequential provider fallback chain and the browser's 80-second request guard;
- CSP blocks plugins/objects and constrains network/frame origins, while still allowing inline script/style during the remaining legacy OS-shell transition;
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` are emitted at the edge.

## Production update checklist

When the example changes in Git, apply the corresponding production change deliberately:

1. compare the server's active Nginx virtual host with the example;
2. preserve the real domain, TLS certificate paths and any server-specific limits;
3. run `nginx -t` before reload;
4. reload rather than restart when possible;
5. verify `/`, `/historic-world/`, Rome, Athens, `/api/health`, a missing URL, and the custom error documents;
6. keep secrets only in the server environment / `.env`, never in this repository.

The examples are documentation and reviewable deployment inputs, not an automatic deployment mechanism.
