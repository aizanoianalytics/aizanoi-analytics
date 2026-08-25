# Aizanoi News content

This directory stores Git-tracked source records used to build the public static News feed.

- `_template.json` is the canonical item example.
- publishable item files belong in `content/news/items/`.
- `scripts/news/build-news.mjs` validates those files and atomically generates the complete `frontend/news/` tree, including `index.json`.

The compiler runs only in the private Git checkout, never in the live Nginx webroot. It uses an exclusive PID lock, same-filesystem staging, complete staged-artifact validation, rollback backup and interrupted-build recovery before replacing the generated tree. Public readers see a release only after Git commit, CI and the exact-SHA deployment gate.

The generated public feed is intentionally summary-only. Full third-party article text must never be stored here.

Recommended categories:
- `ai`
- `technology`
- `economy-markets`
- `football`

Each item requires `retrievedAt`, named author and editor identities, a `corrections` history array, and at least one source with publisher, public URL and publication date. Summaries must be original and 80–600 characters.

Daily items use `kind: "daily"` (default if omitted). The daily edition is the current `news/YYYY-MM-DD/` page.

Weekly items add `"kind": "weekly"` and a `"week": "YYYY-Www"` label that must match the ISO week of their publication date. They generate a separate permanent page at `news/weekly/YYYY-MM-DD/` and a corresponding permanent article. The `index.json` feed exposes a parallel `weeklyEditions` array. Weekly summaries must be at least 240 characters to qualify as analysis paragraphs rather than headline rewrites.

The compiler writes:
- the edition feed at `frontend/news/index.json`;
- the current landing at `/news/`;
- immutable daily paths at `/news/YYYY-MM-DD/`;
- section archives at `/news/category/<category>/`;
- RSS at `/news/rss.xml`.

Build time is deterministic: `SOURCE_DATE_EPOCH` wins when set; otherwise it is derived from the newest item retrieval time (or Unix epoch for an empty collection).

Hermes should use `docs/HERMES_OPERATIONS.md` and `CONTENT_POLICY.md` for the publishing workflow.
