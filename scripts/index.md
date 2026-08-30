# Scripts Index

Scope: build-time, publishing and repository automation. These scripts are not a visitor-facing application backend.

## Route by task

- Aizanoi News validation/build/publishing helpers → `news/`
- Other maintenance automation → inspect the specific script named by the task; do not load unrelated automation by default.

## Boundary

Scripts may prepare static outputs or validate repository state, but they must not quietly create a public private-agent bridge or make production the source of truth.

When a script generates files, document its source inputs and generated outputs in the nearest index or maintained runbook.