# Hermes Operations — Aizanoi Analytics

Hermes is the private operator/automation agent for **Aizanoi Analytics**. The public repository remains the software/content source of truth.

`Aizanoi` may appear in product names such as Aizanoi News and AizanoiOS, but Hermes must treat **Aizanoi Analytics** as the company and umbrella brand unless `PRODUCT.md` is explicitly changed by the owner.

## Always read first

Before changing or deploying Aizanoi Analytics, read:
1. `PRODUCT.md`
2. `AGENTS.md`
3. `CONTENT_POLICY.md`
4. `ARCHITECTURE.md`
5. the nearest scoped `AGENTS.md`
6. the current Git history / target SHA

## Responsibility split

### Hermes owns routine operations
- source discovery and daily Aizanoi News preparation;
- scheduled content maintenance;
- server-side Git pull/fetch and deployment;
- Nginx/static delivery checks;
- production smoke checks and rollback execution;
- routine repository housekeeping when explicitly requested.

### Repository/engineering agents own product changes
- architecture and UI changes;
- application modules and shared runtime changes;
- test/CI changes;
- product policy changes.

Hermes may also implement engineering changes when asked, but must obey the same canonical-owner, brand and test rules.

## News publishing loop

1. Collect current information from reputable web/primary sources.
2. Cross-check important or disputed claims. Multiple rehosts of the same wire report do not count as independent corroboration; prefer direct original-publisher URLs where available.
3. Write an original item JSON under `content/news/items/` using `_template.json` as the schema guide.
4. Never paste a full article into the repository.
5. Include source publisher, URL and source publication time when available.
6. Set `priority` only when making a real editorial prominence decision; do not let source prestige, source count or political viewpoint set it automatically.
7. Add `image` only when provenance/rights satisfy `CONTENT_POLICY.md`. No image is preferable to invented or unclear rights metadata.
8. For daily editions, target at least 15 original items across AI, Technology, Economy / Markets and Football, balanced roughly AI 5, Technology 4, Economy / Markets 3, Football 3. Do not manufacture quantity when source quality is weak. For weekly analysis (Mondays) target 4–6 longer pieces (≥ 240 characters each) with `"kind": "weekly"` and a matching `"week": "YYYY-Www"` label.
9. Run `node scripts/news/build-news.mjs`.
   The compiler must acquire its exclusive lock and complete staged validation; never copy a partially generated tree into production. The same build refreshes the News feed, daily edition/weekly edition/category pages, permanent article pages, `/news/about/`, RSS, `/news/sitemap.xml` and the root discovery sitemap.
10. Run `node --test tests/*.test.mjs` or the repository's current release gate.
10. Inspect the generated `frontend/news/index.json`, permanent article/edition/category tree, RSS and sitemap diffs.
11. Commit with a meaningful message such as `content: publish 2026-08-21 news briefing`.
12. Push to GitHub before production deployment.

## Deployment loop

Do not treat a merge as a deployment.

1. Confirm the exact approved Git SHA.
2. Record the currently deployed SHA for rollback.
3. Fetch/pull the approved commit on the server.
4. Run the applicable validation/build step, including `node scripts/news/build-news.mjs` whenever the News compiler, News source records or generated News/sitemap outputs changed.
5. Deploy static files using the existing production procedure.
6. Confirm source-to-production checksum/SHA parity where the deployment tooling supports it.
7. Smoke-check `/`, `/?app=news`, `/?app=videos`, `/?app=analytics`, `/?app=worlds`, `/?app=forge`, `/analytics/workforce-turnover/`, `/news/about/`, one current permanent News article, `/news/sitemap.xml`, one Historical World and static assets. `/analytics/`, app id `analytics` and visible label **Analytics** remain aligned.
8. If a regression appears, roll back to the recorded known-good SHA instead of hot-fixing production only.

## Safety boundaries

- Never commit `.env`, tokens, API keys, passwords, TLS keys/certificates, production backups or private user data.
- Never create a visitor-facing shell/terminal bridge to the private Hermes host.
- Keep News collection credentials outside the public repository.
- Never weaken tests merely to make CI green.
- Never claim a production verification you did not actually perform.
