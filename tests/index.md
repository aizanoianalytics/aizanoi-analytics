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

The 3D dungeon keeps its focused contracts in the top-level suite: `dungeon-3d-event-ring.test.mjs` (the event ring is a bounded buffer that is trimmed from the front, so a consumer must track sequence numbers rather than an index — without that the reward chest becomes unopenable and the run deadlocks), `dungeon-3d-melee-reach.test.mjs` (a swing at an enemy that is out of reach must not spend the cooldown or be counted as a swing), `dungeon-3d-archetypes.test.mjs` (every one of the eleven enemy archetypes must move or attack — five of them once shipped with no behaviour branch at all and stood still), `dungeon-3d-blessings.test.mjs` (the twelve blessings and the run ledger's counters), `dungeon-3d-evolution.test.mjs` (the elite affixes and the duo synergies do what their cards say, a lethal hit behind the guard still ends the run, and a missed enemy swing still spends its cooldown), `dungeon-3d-victory.test.mjs` (the ten-chapter win condition), `dungeon-3d-bow.test.mjs` and `dungeon-3d-flanker.test.mjs`.

## Test ownership

Every browser-driving suite has exactly one owner, so removing a suite from routine CI never leaves it unrun:

| Owner | Trigger | Suites |
|---|---|---|
| `Aizanoi CI` (required: `validate`, `browser-smoke`, `lighthouse`) | every PR and `main` push | `cross-browser-critical.mjs` (Chromium), `cross-device-critical.mjs` (desktop/tablet/mobile), `service-worker-browser.mjs`, `aizanoi-browser-smoke.mjs` (the Aizanoi WebGL world, promoted into routine CI now that it is the only heavyweight world), `browser/aizanoi-os-launch.test.mjs` (AizanoiOS Aizanoi launcher smoke), `browser/dungeon-3d-play.test.mjs` (the 3D dungeon boots a real Three.js scene, renders a lit frame, moves on real keyboard input and lands a real attack), `browser/dungeon-3d-ferryman.test.mjs` (the Styx Ferryman flanker model is fetched over HTTP from the live route, is a real GLB, and is parsed by the runtime's own GLTFLoader), `browser/dungeon-3d-persistence.test.mjs` (a saved run survives a page reopen, the menu offers Continue, and the claimed blessings are visible in the HUD), `browser/dungeon-3d-victory.test.mjs` (the run can actually be won: the tenth chapter shows the victory screen with a run ledger, and the ledger agrees with the state), `browser/dungeon-3d-shell-tokens.test.mjs` (the dungeon is mounted inside the AizanoiOS shell, so it must not redefine the shell's global colour tokens while it is open), `browser/snake-royale.test.mjs` (the arcade arena loads its whole fighter roster from `bots.json`, fights a real match to a verdict, states the failure instead of showing an empty picker when the manifest is unreachable, and the TV page embeds the real channel uploads through the privacy-enhanced player), `representative-a11y.mjs`, and `browser/nginx-production-policy.test.mjs` — the Nginx production-policy gate is deliberately a routine required check, not a Full QA item, because a policy regression must block a merge rather than wait for a weekly run |
| `Aizanoi Full QA` (weekly + `workflow_dispatch`) | scheduled/manual | the expensive product browser suites under `tests/browser/` **except** any suite intentionally assigned to routine CI (currently `nginx-production-policy.test.mjs` and `aizanoi-os-launch.test.mjs`), including `tableau-hello.test.mjs` (pilot connectivity states) and `tableau-date-picker.test.mjs` (date-picker SDK-transport suite: real app, stubbed Tableau API, 3 mapped sheets + 1 excluded), plus `field-system-v3-browser-smoke.mjs` and the deep Aizanoi traversal `aizanoi-browser-smoke.mjs`, the New HR Collection browser QA for both **PACS** (`pacs-browser-qa.mjs`, which also generates its own synthetic import fixture via `fixtures/make-pacs-qa-fixture.mjs`) and **Recruitment Analytics** (`recruitment-analytics-browser-qa.mjs` plus the privacy/schema/export behavior gate `recruitment-intern-browser-qa.mjs`), and the `*-visual-capture.mjs` suites — Aizanoi, Field System and Markets — whose hero frames are luma-gated so a black capture fails the run instead of being published as visual evidence |
| `Cross-browser critical smoke` (weekly + manual) | scheduled/manual | `cross-browser-critical.mjs` under Firefox and WebKit |
| Local / operator-only | ad hoc | `entry-battery.mjs` and `webkit-entry-probe.mjs` — operator **diagnostics**, not gates: they contain no assertions, and the first defaults to the live production host. Run them by hand to reproduce a reported device problem; never wire them into CI as pass/fail gates. The standalone dungeon contract is `dungeon-3d-facade.test.mjs` (manifest, route wiring, SEO head, registry check, GLB kit); the retired 2D gameplay harnesses `browser-dungeon-live-qa.mjs` and `browser-dungeon-mastery-qa.mjs` were deleted with the Phaser build. |

Software-rendered WebGL suites must run sequentially: parallel worlds time each other out on a small runner.

Branch protection is **not** verified by CI. A repository cannot read its own protection rules without elevated credentials, so the deterministic contract is the workflow assertions in `tests/test-ownership.test.mjs`; the separate live check runs only where a `gh` CLI with admin scope happens to exist and otherwise reports itself as **skipped**, never as verified. The authoritative required routine checks are `validate`, `browser-smoke` and `lighthouse` — see `docs/HERMES_OPERATIONS.md`.

Run the applicable validation commands from root `AGENTS.md`; do not weaken a failing safety or architecture test simply to make CI green. Narrow compatibility exceptions must remain explicit and exact.
