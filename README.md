# Aizanoi Analytics

Open-source source code for [aizanoianalytics.com](https://aizanoianalytics.com).

Aizanoi Analytics is intentionally deployed as a **static-only public web application**. Visitor-facing tools, including the Aizanoi Terminal, run in the browser and do not execute server commands or require an application backend.

## Repository layout

- `frontend/` — static Aizanoi Field System, browser games and historical-world experiences
- `frontend/historic-world/` — self-contained WebGL reconstruction served at `/historic-world/`
- `frontend/ancient-cities/` — renderer-neutral source-led city experiences
  - `rome-410-476/` — Late Antique Rome, AD 410–476, with the shared Ancient World engine
  - `athens-450-430/` — Classical Athens of Pericles, 450–430 BCE
- `frontend/ancient-world/` — shared traversal, lifecycle, navigation, evidence and adaptive performance modules
- `tests/` — Node regression tests plus Chromium browser smoke coverage
- `infra/` — sanitized Nginx deployment reference; production TLS and server-specific configuration stay on the server

## Local development

Serve `frontend/` with any static HTTP server. For example:

```bash
python3 -m http.server 4173 --directory frontend
```

Then open `http://127.0.0.1:4173/`.

## Security model

- No visitor-facing Node/Express application backend is required in production.
- The Terminal is a browser-only virtual shell with a fixed in-memory filesystem.
- External AI provider integration is removed and the AI UI is fail-closed.
- Local Field Archive files, notes and datasets stay in browser storage unless the user explicitly exports them.
- Historical `/api/chat` receives `410 Gone`; other `/api/*` paths fail closed at Nginx.
- GitHub Actions run regression, browser, Lighthouse and security checks.

Never commit `.env`, API keys, tokens, passwords, private keys, certificates or production backups.

## Production

Production TLS keys and server-specific Nginx configuration stay outside this public repository. A Git merge does not by itself deploy or alter the live Hetzner server.

## License

Released under the [MIT License](LICENSE).
