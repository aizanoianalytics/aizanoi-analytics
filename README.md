# Aizanoi Analytics

Open-source source code for [aizanoianalytics.com](https://aizanoianalytics.com).

## Repository layout

- `frontend/` — static Windows XP-inspired website, browser games and the standalone Historic World
- `frontend/historic-world/` — self-contained WebGL reconstruction served at `/historic-world/`
- `backend/` — Node.js/Express API
- `infra/` — sanitized nginx/systemd deployment examples; production files and credentials stay on the server

## Local development

### Frontend

Serve `frontend/` with any static HTTP server.

### Backend

```bash
cd backend
cp .env.example .env
npm install
node server.js
```

Never commit `.env` or real API keys. See `.gitignore`.

## Production

Production credentials, TLS keys, systemd units, and server-specific configuration stay outside this public repository.
