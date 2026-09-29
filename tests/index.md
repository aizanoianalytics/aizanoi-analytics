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
| `Aizanoi CI` (required: `validate`, `browser-smoke`, `lighthouse`) | every PR and `main` push | `cross-browser-critical.mjs` (Chromium), `cross-device-critical.mjs` (desktop/tablet/mobile), `service-worker-browser.mjs`, `representative-a11y.mjs`, and `browser/nginx-production-policy.test.mjs` — the Nginx production-policy gate is deliberately a routine required check, not a Full QA item, because a policy regression must block a merge rather than wait for a weekly run |
| `Aizanoi Full QA` (weekly + `workflow_dispatch`) | scheduled/manual | the expensive product browser suites under `tests/browser/` **except** any suite intentionally assigned to routine CI (currently only `nginx-production-policy.test.mjs`), plus `field-system-v3-browser-smoke.mjs`, `worlds-browser-smoke.mjs`, `fly-simulation-browser.test.mjs`, the New HR Collection browser QA for both **PACS** (`pacs-browser-qa.mjs`, which also generates its own synthetic import fixture via `fixtures/make-pacs-qa-fixture.mjs`) and **Recruitment Analytics** (`recruitment-analytics-browser-qa.mjs`), and the three `*-visual-capture.mjs` suites, whose hero frames are luma-gated so a black capture fails the run instead of being published as visual evidence, plus the deterministic `worlds-clear-view-azimuth.test.mjs`, `worlds-arrival-framing.test.mjs` and `aizanoi-compaction-fit.test.mjs` layout contracts |
| `Cross-browser critical smoke` (weekly + manual) | scheduled/manual | `cross-browser-critical.mjs` under Firefox and WebKit |
| Local / operator-only | ad hoc | `entry-battery.mjs` and `webkit-entry-probe.mjs` — operator **diagnostics**, not gates: they contain no assertions, and the first defaults to the live production host. Run them by hand to reproduce a reported device problem; never wire them into CI as pass/fail gates. |
| Local / operator-only | ad hoc | Fly House `scripts/fly-world/build_scene*.py`, `author_heroes.py` and `environment_export.py` — require Blender (`bpy`) and cannot run in CI. The committed `environment.json`/`fly-physics.json` artifacts are what CI validates. |

Software-rendered WebGL suites must run sequentially: parallel worlds time each other out on a small runner.

Branch protection is **not** verified by CI. A repository cannot read its own protection rules without elevated credentials, so the deterministic contract is the workflow assertions in `tests/test-ownership.test.mjs`; the separate live check runs only where a `gh` CLI with admin scope happens to exist and otherwise reports itself as **skipped**, never as verified. The authoritative required routine checks are `validate`, `browser-smoke` and `lighthouse` — see `docs/HERMES_OPERATIONS.md`.

Run the applicable validation commands from root `AGENTS.md`; do not weaken a failing safety or architecture test simply to make CI green. Narrow compatibility exceptions must remain explicit and exact.
