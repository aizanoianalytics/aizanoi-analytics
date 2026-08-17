# Aizanoi Analytics — Implementation Report

Refactor of Aizanoi Analytics into a real platform with SEO, routing, accessibility, performance and security. Work tracked across 8 phases plus documentation.

## Architecture — Before

- Single `index.html` (~108 KB) served directly by nginx.
- A small Node/Express backend proxied under `/api/` providing `/api/health`, `/api/chat`, `/api/terminal/exec`.
- No real routing, no SEO metadata, no sitemap, no robots.txt, no canonical domain redirect, no 404 page.
- AI persona: a generic Turkish chatbot.
- Front-end exposed nothing in plaintext, but CSP and security headers were minimal.
- Single "Aizanoi Market" placeholder app on the desktop.

## Architecture — After

- AizanoiOS-style SPA with **real URL routing** (`pushState` + `popstate`) for:
  `/`, `/hr-analytics/`, `/ancient-world/`, `/games/`, `/projects/`, `/videos/`, `/about/`, `/docs/`, `/changelog/`, `/privacy/`, `/terms/`.
- SEO foundation: per-route title, meta description, OpenGraph, Twitter Cards, JSON-LD (WebSite + Organization), canonical, sitemap.xml, robots.txt.
- Canonical domain enforcement: HTTP→HTTPS, www→non-www.
- Legacy `/ai/` → 301 → `/hr-analytics/`. Legacy `/market/*` → 410 Gone.
- Aizanoi AI scoped to **HR & People Analytics** with a short, focused system prompt and Markdown-safe rendering with code blocks.
- Welcome window on first visit (with `Don't show again` localStorage preference).
- Mobile app launcher for `<768px` viewports.
- System actions wired to the Start menu: Shut Down, Log Off, Lock, Run, Search, Control Panel, Recycle Bin.
- Recycle Bin reframed as **Deprecated Experiments** (archive list).
- Three games (Mines, Snake, Brick Breaker) loaded lazily per click into the Games window.
- Ancient World foundation: landing + 360° stylized panorama + interactive hotspots + schematic map + site info. Data-driven engine; more cities can be added.

## Files Created

```
frontend/
├── index.html                                # main SPA
├── icons/                                    # Windows XP PNGs (cached for 24h)
├── pages/
│   ├── changelog.json                        # releases feed
│   └── projects.json                          # portfolio feed
├── games/
│   ├── mines.js                              # Minesweeper-style
│   ├── snake.js                              # Snake
│   └── brick.js                              # Brick Breaker
├── robots.txt                                 # allows /, blocks /api/ and /market/
└── sitemap.xml                                # all public routes

backend/
├── server.js                                  # Express backend, Groq + Google fallback
├── package.json                               # Runtime dependencies
└── .env.example                               # Placeholder configuration; real .env is never committed
```

## Files Modified

- `index.html` — added SEO metadata, OpenGraph, Twitter Cards, JSON-LD, route map, SPA router, Markdown-safe render function, Welcome window, Mobile launcher, system actions, Control Panel, Games launcher, Ancient World engine, aria-label additions.
- `server.js` — short HR & People Analytics system prompt, HSTS, Permissions-Policy, sanitized error logs.
- nginx config — SPA fallback, /ai/ 301, /market/* 410, HSTS + Permissions-Policy + cache headers, www→non-www, HTTP→HTTPS.
- 47 icons in `icons/` (from earlier work, unchanged).

## Routes

| Route              | Behaviour                                      |
|--------------------|------------------------------------------------|
| `/`                | Desktop / mobile launcher                      |
| `/hr-analytics/`   | Opens Aizanoi AI window                         |
| `/ancient-world/`  | Opens the legacy Ancient World launcher and site information window |
| `/historic-world/` | Opens the standalone Aizanoi 3D Historic World reconstruction |
| `/games/`          | Opens Games launcher                            |
| `/projects/`       | Opens Projects window (loads `pages/projects.json`) |
| `/videos/`         | Opens Aizanoi TV window (Coming Soon placeholder) |
| `/about/`          | Opens About window                              |
| `/docs/`           | Opens Docs window                                |
| `/changelog/`      | Opens System Updates window (loads `pages/changelog.json`) |
| `/privacy/`        | Opens Privacy window                            |
| `/terms/`          | Opens Terms window                              |
| `/ai/`             | 301 redirect to `/hr-analytics/`                |
| `/market/*`        | 410 Gone                                       |
| `/pages/*.json`    | Static (changelog, projects)                    |
| `/games/*.js`      | Static (lazy-loaded by Games window)            |
| `/icons/*`         | Static                                         |

## Redirects

- `http://aizanoianalytics.com/*` → `https://aizanoianalytics.com/*` (301)
- `https://www.aizanoianalytics.com/*` → `https://aizanoianalytics.com/*` (301)
- `https://aizanoianalytics.com/ai/` → `https://aizanoianalytics.com/hr-analytics/` (301)

## Historic World V8

The new self-contained WebGL reconstruction lives at `frontend/historic-world/index.html` and is served at `/historic-world/`. The legacy `/ancient-world/` XP window remains as the site's information and entry launcher. The 3D experience has no CDN dependency and keeps its research/source and uncertainty UI inside the standalone route.

## Aizanoi AI Backend

- Express on port 3001.
- Routes: `POST /api/chat`, `GET /api/health`, `POST /api/terminal/exec`.
- AI provider chain: Groq → Google fallback.
- SYSTEM_PROMPT: short, HR & People Analytics-scoped, identity locked to `Aizanoi AI — HR & People Analytics Assistant`.
- No file upload, no auth, no retention of chat on our side.

## HR System Prompt Location

`backend/server.js`, top of file, `const SYSTEM_PROMPT = ...`.

## Ancient World Architecture

- Engine: data-driven city config. Adding a new city = adding an entry in a future `pages/ancient/<city>.json` with metadata, scene assets, POIs and spawn point.
- Current MVP: **Roman Aizanoi**. Stylized 360° panorama of the Temple of Zeus area, with one interactive hotspot explaining the temple.
- Sources cited via the Site Information panel and obvious visual disclaimers. No fabricated historical detail.

## Games Architecture

- Independent `games/*.js` modules. Each game looks for a `#game-<name>-container` element inside the Games window and runs there.
- Scores saved in `localStorage['aizanoi-games']`, last 20 per game.
- No server-side scoring.

## Mobile Architecture

- `<768px` viewport: desktop and taskbar hidden, mobile launcher shown.
- Mobile launcher uses `<a href="/…/">` so each tile has a real URL — works with deep links, back button, refresh, bookmark.

## SEO Changes

- Per-route `<title>`, `<meta name="description">`, OpenGraph (`og:title`, `og:description`, `og:url`, `og:image`), Twitter Cards (`twitter:title`, `twitter:description`, `twitter:image`).
- `<link rel="canonical">` per route.
- JSON-LD: WebSite + Organization schemas.
- `/robots.txt`: allows `/`, blocks `/api/` and `/market/`, references sitemap.
- `/sitemap.xml`: 11 public routes.
- `/market/*` retired (410 Gone) so legacy Google index can be cleaned.
- Canonical domain enforced.

## Performance Changes

- Cache-Control: HTML `no-store`; PNG `immutable 24h`; fonts/CSS/JS `1h`.
- Pre-rendered chat body markup → fewer layout shifts on window open.
- Per-route lazy init for Games and Ancient World (only runs when their window opens).
- Single HTML still large (~160 KB) but compressed by nginx on the wire; the SPA loads once.

## Security Changes

- Backend: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy (geolocation/microphone/camera off).
- Nginx: same headers for the HTML route + static assets.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- AI markdown rendered via a small in-house `renderMarkdownSafe` (HTML-escape + Markdown rules) so AI output never reaches `innerHTML` un-escaped.
- `.env` is chmod 600, root-only, never served.
- `/api/` paths disallowed in `robots.txt`.

## Remaining TODOs

- Real YouTube channel URL (`YOUTUBE_CHANNEL_URL`) integration once the channel is open.
- Photo-realistic 3D environment for Ancient World (currently stylized silhouette + map).
- Lighthouse run on production (not run from this environment).
- Long-term: split `index.html` into separate `.css` / `.js` files if the SPA keeps growing.
- SEO sitemap update frequency could move to a tiny generator script.

## Search Console Manual Steps

See `SEARCH_CONSOLE_CHECKLIST.md`.

## How to Add a Game

1. Create `games/<name>.js`. Inside an IIFE, look for `#game-<name>-container` and render into it.
2. Add a tile in the Games window's body with `data-game="<name>"` (see existing tiles).
3. Optional: extend the score-recording key in `games/*.js` to save to `localStorage['aizanoi-games'][<name>]`.

## How to Add an Ancient World City

1. Create `pages/ancient/<city>.json` with metadata, era, civilization, scene assets, POIs.
2. In the Ancient World landing body, add a button with `data-view="<city>"` and a matching `<div id="ancient-<city>">…</div>` panel.
3. Extend `wireAncientIfNeeded()` to load and switch to the new panel.

## How to Add a Changelog Entry

1. Append a new entry to `pages/changelog.json` `entries` with `version`, `date`, and `added`/`improved`/`fixed`/`removed` arrays.
2. Do **not** invent past releases; only record work that has actually happened.