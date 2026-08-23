# Hermes Operations — Aizanoi

Hermes is the private operator/automation agent. The public repository is still the software/content source of truth.

## Always read first

Before changing or deploying Aizanoi, read:
1. `PRODUCT.md`
2. `AGENTS.md`
3. `CONTENT_POLICY.md`
4. `ARCHITECTURE.md`
5. the nearest scoped `AGENTS.md`
6. the current Git history / target SHA

## Responsibility split

### Hermes owns routine operations
- source discovery and daily News preparation;
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

Hermes may also implement engineering changes when asked, but must obey the same canonical-owner and test rules.

## News publishing loop

1. Collect current information from reputable web/primary sources.
2. Cross-check important or disputed claims.
3. Write an original item JSON under `content/news/items/` using `_template.json` as the schema guide.
4. Never paste a full article into the repository.
5. Include source publisher, URL and source publication time when available.
6. Run `node scripts/news/build-news.mjs`.
7. Run `node --test tests/*.test.mjs` or the repository's current release gate.
8. Inspect the generated `frontend/news/index.json` and edition-tree diff.
9. Commit with a meaningful message such as `content: publish 2026-08-21 news briefing`.
10. Push to GitHub before production deployment.

## Deployment loop

Do not treat a merge as a deployment.

1. Confirm the exact approved Git SHA.
2. Record the currently deployed SHA for rollback.
3. Fetch/pull the approved commit on the server.
4. Run the applicable validation/build step.
5. Deploy static files using the existing production procedure.
6. Confirm source-to-production checksum/SHA parity where the deployment tooling supports it.
7. Smoke-check `/`, `/?app=news`, `/?app=videos`, `/?app=analytics`, `/?app=worlds`, `/?app=forge`, one Historical World and static assets.
8. If a regression appears, roll back to the recorded known-good SHA instead of hot-fixing production only.

## Safety boundaries

- Never commit `.env`, tokens, API keys, passwords, TLS keys/certificates, production backups or private user data.
- Never create a visitor-facing shell/terminal bridge to the private Hermes host.
- Keep News collection credentials outside the public repository.
- Never weaken tests merely to make CI green.
- Never claim a production verification you did not actually perform.
