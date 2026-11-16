# Tests Index

Scope: repository regression, browser, security, navigation-topology and visual validation.

## Use this area when

- a runtime or navigation change needs regression coverage;
- a security boundary needs validation;
- browser/device behavior changes;
- modular architecture guards or unplug tests change;
- repository `index.md` routing or top-level/module navigation changes.

## Enforced architecture and navigation gates

The top-level regression suite verifies:

- manifest schema and unique ids;
- declared dependencies/capabilities;
- no cross-module private imports or direct concrete Workspace imports from app-private code;
- no dependency cycles or ambiguous capability providers;
- generated registry consistency;
- optional module disable/remove behavior;
- canonical `src/index.js` public entries;
- module-directory ownership with no flat JavaScript app implementations under `frontend/js/v3/apps/`;
- discovered app modules are represented by the parent apps index;
- major repository routers point to the expected current subsystems;
- local Markdown links in canonical indexes resolve to real repository paths.

Focused module tests protect app-specific ownership and lifecycle contracts. Cross-cutting architecture and product regression tests belong here; browser-only lifecycle scenarios live under `tests/browser/` and are wired into CI when they guard real visitor behavior.

## Test ownership

Every browser-driving suite has exactly one owner, so removing a suite from routine CI never leaves it unrun:

| Owner | Trigger | Suites |
|---|---|---|
| `Aizanoi CI` (required: `validate`, `browser-smoke`, `lighthouse`) | every PR and `main` push | `cross-browser-critical.mjs` (Chromium), `cross-device-critical.mjs` (desktop/tablet/mobile), `service-worker-browser.mjs`, `aizanoi-browser-smoke.mjs` (the Aizanoi WebGL world, promoted into routine CI now that it is the only heavyweight world), `browser/aizanoi-os-launch.test.mjs` (AizanoiOS Aizanoi launcher smoke), `browser/trade-arena.test.mjs` (historical simulation, strict CSP workers/charts and independent shell lifecycle), `browser/snake-royale.test.mjs`, `browser/snake-royale-accessibility.test.mjs`, `browser/snake-royale-custom-bot.test.mjs`, `browser/arcade-custom-bot.test.mjs`, `browser/sudoku.test.mjs` (four-level local Sudoku, real launcher, keyboard/touch solve and responsive cleanup), `browser/solitaire.test.mjs` (Klondike draw/undo/new-game, keyboard and touch play, responsive cleanup), `browser/zuma.test.mjs` (Zuma-like marble shooter: rendered-scene proof, trusted firing, pause/keyboard/new-run, responsive cleanup), `browser/chess.test.mjs`, `browser/chess-review.test.mjs`, `browser/maze-chase.test.mjs`, `browser/maze-chase-regressions.test.mjs`, `browser/maze-chase-custom-bot.test.mjs`, `browser/capture-flag.test.mjs`, `browser/capture-flag-accessibility.test.mjs`, `browser/capture-flag-custom-bot.test.mjs`, `browser/holdem.test.mjs`, `browser/holdem-regressions.test.mjs`, `browser/holdem-custom-bot.test.mjs`, `browser/football.test.mjs`, `browser/football-custom-bot.test.mjs`, `browser/anatolian-pact.test.mjs`, `browser/anatolian-pact-review.test.mjs`, `browser/anatolian-pact-custom-bot.test.mjs` (standalone matches, trusted human input, accessibility and custom-bot failures; eleven dedicated `arcade-browser` matrix shards feed the required `browser-smoke` result), `browser/aizanoi-wars.test.mjs` (standalone WebGL gameplay under strict CSP and distinct AizanoiOS desktop window), `browser/aizanoi-os-snake-royale.test.mjs` (desktop/tablet/phone in-shell game, real match, worker cleanup and missing roster), `browser/aizanoi-os-videos.test.mjs` (desktop TV explore actions stay inside the window), `representative-a11y.mjs`, and `browser/nginx-production-policy.test.mjs` — the Nginx production-policy gate is deliberately a routine required check, not a Full QA item, because a policy regression must block a merge rather than wait for a weekly run |
| `Aizanoi Full QA` (weekly + `workflow_dispatch`) | scheduled/manual | the expensive product browser suites under `tests/browser/` **except** any suite intentionally assigned to routine CI (all browser suites listed in the routine CI row above), including `tableau-hello.test.mjs` (pilot connectivity states) and `tableau-date-picker.test.mjs` (date-picker SDK-transport suite: real app, stubbed Tableau API, 3 mapped sheets + 1 excluded), plus `field-system-v3-browser-smoke.mjs` and the deep Aizanoi traversal `aizanoi-browser-smoke.mjs`, the New HR Collection browser QA for both **PACS** (`pacs-browser-qa.mjs`, which also generates its own synthetic import fixture via `fixtures/make-pacs-qa-fixture.mjs`) and **Recruitment Analytics** (`recruitment-report-browser-qa.mjs` (monthly/quarterly/annual report aggregates and independent specialist filters), `recruitment-analytics-browser-qa.mjs` plus the privacy/schema/export behavior gate `recruitment-intern-browser-qa.mjs`), and the `*-visual-capture.mjs` suites — Aizanoi, Field System and Markets — whose hero frames are luma-gated so a black capture fails the run instead of being published as visual evidence |
| `Cross-browser critical smoke` (weekly + manual) | scheduled/manual | `cross-browser-critical.mjs` under Firefox and WebKit |
| Local / operator-only | ad hoc | `entry-battery.mjs` and `webkit-entry-probe.mjs` — operator **diagnostics**, not gates: they contain no assertions, and the first defaults to the live production host. Run them by hand to reproduce a reported device problem; never wire them into CI as pass/fail gates.  |

Software-rendered WebGL suites must run sequentially: parallel worlds time each other out on a small runner.

Branch protection is **not** verified by CI. A repository cannot read its own protection rules without elevated credentials, so the deterministic contract is the workflow assertions in `tests/test-ownership.test.mjs`; the separate live check runs only where a `gh` CLI with admin scope happens to exist and otherwise reports itself as **skipped**, never as verified. The authoritative required routine checks are `validate`, `browser-smoke` and `lighthouse` — see `docs/HERMES_OPERATIONS.md`.

Run the applicable validation commands from root `AGENTS.md`; do not weaken a failing safety or architecture test simply to make CI green. Narrow compatibility exceptions must remain explicit and exact.
