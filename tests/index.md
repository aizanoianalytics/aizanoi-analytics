# Tests Index

Scope: repository regression, browser, security and visual validation.

## Use this area when

- a runtime or navigation change needs regression coverage;
- a security boundary needs validation;
- browser/device behavior changes;
- modular architecture guards or unplug tests are introduced.

## Modularity target

Future architecture tests should verify:

- manifest schema and unique ids;
- declared dependencies/capabilities;
- no cross-module private imports;
- no dependency cycles;
- generated registry consistency;
- optional module disable/remove behavior.

Module-local unit tests may live with a migrated module. Cross-cutting architecture and product regression tests belong here.

Run the applicable validation commands from root `AGENTS.md`; do not weaken a failing safety or architecture test simply to make CI green.