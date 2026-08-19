# Infrastructure examples

These are sanitized reference configurations for deployment. **Production Nginx/TLS files and credentials are maintained on the server and are not copied from this directory automatically.** A Git merge therefore does not, by itself, update the live Hetzner configuration.

- `nginx/aizanoianalytics.com.conf.example` — static frontend, real 404/500/503 behavior, Ancient World routes, security-header/CSP baseline and fail-closed historical API paths

The public Aizanoi web runtime no longer requires a Node/Express backend or an `aizanoi-backend.service` systemd unit. Hermes Agent is a separate server service and is outside this visitor-facing deployment example.

## Nginx baseline decisions

The reference Nginx configuration intentionally documents the operational assumptions that must match production:

- unknown URLs return a real HTTP 404 instead of a soft-SPA 200;
- `404.html`, `500.html` and `503.html` are the custom visitor-facing error documents;
- Rome, Athens and Historic World standalone routes are explicitly served;
- `/api/chat` returns `410 Gone` for stale historical clients;
- every other `/api/*` path returns 404; there is no application reverse proxy;
- CSP blocks plugins/objects and constrains network/frame origins, while still allowing inline script/style during the remaining legacy OS-shell transition;
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` are emitted at the edge.

## Production update checklist

When the example changes in Git, apply the corresponding production change deliberately:

1. compare the server's active Nginx virtual host with the example;
2. preserve the real domain, TLS certificate paths and server-specific settings;
3. remove obsolete Aizanoi application proxy locations when moving to the static-only build;
4. run `nginx -t` before reload;
5. reload rather than restart when possible;
6. verify `/`, `/historic-world/`, Rome, Athens, `/api/chat`, another missing `/api/...` path and the custom error documents;
7. verify no Aizanoi Node listener remains on port 3001 after the static migration;
8. keep secrets and production backups outside this repository.

The examples are documentation and reviewable deployment inputs, not an automatic deployment mechanism.
