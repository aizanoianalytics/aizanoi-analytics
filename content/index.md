# Content Index

Scope: Git-tracked source content used to generate public outputs.

## Route by task

- Aizanoi News source records/templates → `news/`
- News publication rules → `../CONTENT_POLICY.md`
- News build/validation code → `../scripts/news/`
- Generated/public News output → `../frontend/news/`

## Boundary

Treat `content/` as source material, not generated output. Keep provenance and editorial records here; do not hand-edit generated frontend output when a source/build path exists.

For News work, follow the source → build → generated-output path instead of scanning the entire frontend.