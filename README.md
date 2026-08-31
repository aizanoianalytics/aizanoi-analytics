<p align="center"><img src="https://raw.githubusercontent.com/aizanoianalytics/aizanoi-analytics/main/frontend/assets/branding/aizanoi-og.png" alt="Aizanoi Analytics" width="100%"></p>
<h1 align="center">Aizanoi Analytics</h1>
<p align="center"><strong>Media, data, software, research and interactive worlds.</strong></p>
<p align="center"><a href="https://aizanoianalytics.com"><strong>Live site</strong></a> · <a href="https://aizanoianalytics.com/news/"><strong>News</strong></a> · <a href="https://aizanoianalytics.com/tv/"><strong>TV</strong></a> · <a href="https://aizanoianalytics.com/analytics/"><strong>Analytics</strong></a> · <a href="https://aizanoianalytics.com/worlds/"><strong>Historical Worlds</strong></a></p>

## What is Aizanoi Analytics?
**Aizanoi Analytics** is the company and umbrella digital studio behind the public products in this repository. **AizanoiOS** is its adaptive browser-native operating-system-style shell.

Public product families: **Aizanoi News**, **Aizanoi TV**, **Aizanoi Journal**, **Analytics**, **Aizanoi Forge**, **Historical Worlds**, **Aizanoi Labs** and **Aizanoi Arcade**. See [`PRODUCT.md`](PRODUCT.md) for the canonical contract.

## AizanoiOS
- **Desktop:** wallpaper-first home, seven focused shortcuts, freeform windows and centered dock.
- **Tablet:** touch-first two-pane home, larger app grid and focused large windows.
- **Mobile:** phone-like home, glanceable widgets, public app grid, compact dock and fullscreen app surfaces.

Workspace documents, Camera photos and Winamp imports stay local in IndexedDB. The state store migrates from the former `aizanoi-field-system-v3` namespace to `aizanoi-os-state-v1`; v4 dual-writes the old key for one release window, and the deprecated `AIZANOI_FIELD_SYSTEM` runtime alias is scheduled for removal with v5.

### Offline contract
After the service worker installs successfully, the **AizanoiOS shell/home is guaranteed offline**. Lazy app modules and standalone product pages are network-first and become available offline after they have been successfully used/cached. Historical Worlds and large Analytics exports are not promised as cold-install offline payloads. This bounded contract keeps first install small and avoids silently caching large experiences.

## Aizanoi News
News is static-first and source-led: sources → Hermes → `content/news/items/*.json` → `scripts/news/build-news.mjs` → generated public editions/RSS/sitemap → AizanoiOS. Every publishable item requires original Aizanoi News summary text and source attribution. See [`CONTENT_POLICY.md`](CONTENT_POLICY.md) and [`docs/HERMES_OPERATIONS.md`](docs/HERMES_OPERATIONS.md).

## Historical Worlds
| World | Period / focus |
|---|---|
| **Aizanoi** | Roman Phrygia · c. AD 2nd–3rd century |
| **Rome** | Late Antiquity · AD 410–476 |
| **Athens** | Classical period · c. 432–430 BCE |

Documented/source-supported, archaeological, inferred, atmospheric and disputed information remain explicitly separated.

## Static-first architecture
Nginx serves static HTML/CSS/JavaScript/JSON/assets. There is no visitor-facing general backend, public remote shell or public Hermes runtime. Historical `/api/chat` remains failed closed. Secrets and production credentials do not belong in this repository. See [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`SECURITY.md`](SECURITY.md).

## Repository map
```text
.
├── frontend/                  # production static application
│   ├── news/                  # generated News feed, editions, category archives and RSS
│   ├── analytics/             # public Analytics landing + canonical catalog + dashboard outputs
│   ├── js/v3/                 # AizanoiOS + product platform + apps
│   │   └── apps/games/        # Aizanoi Arcade module and its owned game assets
│   ├── styles/                # desktop + adaptive device shell
│   ├── historic-world/        # Aizanoi
│   └── ancient-cities/        # Rome + Athens
├── content/news/              # Git-tracked News source records/templates
├── scripts/                   # deterministic generators and deployment helpers
├── research/                  # Historical research/source material
├── tests/                     # regression/browser/security/visual QA
├── docs/                      # maintained documentation/runbooks
└── infra/                     # sanitized deployment references
```

## Development
```bash
git clone https://github.com/aizanoianalytics/aizanoi-analytics.git
cd aizanoi-analytics
python3 -m http.server 4173 --directory frontend
```
Open `http://127.0.0.1:4173/`. Browser QA dependencies are centrally pinned in `package.json`; CI materializes the npm lock and then runs the browser/Lighthouse gates.

Useful validation:
```bash
node scripts/news/build-news.mjs
node --test tests/*.test.mjs
```

## Project principles
**Aizanoi Analytics is the umbrella brand.** One coherent family of public products. Original value before aggregation. Sources before claims. GitHub is the software source of truth. Static first. Device-appropriate UX. Historical evidence before spectacle. Regression and rendered review before release.

## License
Released under the [MIT License](LICENSE).
