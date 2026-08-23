# Aizanoi News content

This directory stores Git-tracked source records used to build the public static News feed.

- `_template.json` is the canonical item example.
- publishable item files belong in `content/news/items/`.
- `scripts/news/build-news.mjs` validates those files and atomically generates the complete `frontend/news/` tree, including `index.json`.

The generated public feed is intentionally summary-only. Full third-party article text must never be stored here.

Recommended categories:
- `ai`
- `technology`
- `economy-markets`
- `football`

Each item requires `retrievedAt`, named author and editor identities, a `corrections` history array, and at least one source with publisher, public URL and publication date. Summaries must be original and 80–600 characters.

The compiler writes:
- the edition feed at `frontend/news/index.json`;
- the current landing at `/news/`;
- immutable daily paths at `/news/YYYY-MM-DD/`;
- section archives at `/news/category/<category>/`;
- RSS at `/news/rss.xml`.

Build time is deterministic: `SOURCE_DATE_EPOCH` wins when set; otherwise it is derived from the newest item retrieval time (or Unix epoch for an empty collection).

Hermes should use `docs/HERMES_OPERATIONS.md` and `CONTENT_POLICY.md` for the publishing workflow.
