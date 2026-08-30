# Tests Index

Scope: repository regression, browser, security and visual validation.

## Use this area when

- a runtime or navigation change needs regression coverage;
- a security boundary needs validation;
- browser/device behavior changes;
- modular architecture guards or unplug tests change.

## Enforced modular architecture gates

The top-level regression suite verifies:

- manifest schema and unique ids;
- declared dependencies/capabilities;
- no cross-module private imports or direct concrete Workspace imports from app-private code;
- no dependency cycles or ambiguous capability providers;
- generated registry consistency;
- optional module disable/remove behavior;
- canonical `src/index.js` public entries;
- module-directory ownership with no flat JavaScript app implementations under `frontend/js/v3/apps/`.

Focused module tests protect app-specific ownership and lifecycle contracts. Cross-cutting architecture and product regression tests belong here; browser-only lifecycle scenarios live under `tests/browser/` and are wired into CI when they guard real visitor behavior.

Run the applicable validation commands from root `AGENTS.md`; do not weaken a failing safety or architecture test simply to make CI green. Narrow compatibility exceptions must remain explicit and exact.
