# Aizanoi News content

This directory stores Git-tracked source records used to build the public static News feed.

- `_template.json` is the canonical item example.
- publishable item files belong in `content/news/items/`.
- `scripts/news/build-news.mjs` validates those files and generates `frontend/content/news/index.json`.

The generated public feed is intentionally summary-only. Full third-party article text must never be stored here.

Recommended categories:
- `ai-technology`
- `markets-economy`
- `world`
- `sports`
- `culture`

Hermes should use `docs/HERMES_OPERATIONS.md` and `CONTENT_POLICY.md` for the publishing workflow.
