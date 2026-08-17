# Aizanoi Analytics

Open-source source code for [aizanoianalytics.com](https://aizanoianalytics.com).

## Repository layout

- `frontend/` — static Windows XP-inspired website and browser games
- `backend/` — Node.js/Express API

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
