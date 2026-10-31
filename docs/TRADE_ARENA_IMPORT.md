# Trade Arena import

Owner supplied archive: https://tmpfiles.org/wzAGTwOggoGj/aizanoi-trade-arena.zip

SHA256: `527ccaa1dc00247cc35f1896185b47375e103434b41b9bc9ba201a07b881a5ec`.

Imported runtime ownership: [arena router](../frontend/arcade/trade-arena/index.md). The machine-readable [byte inventory](trade-arena-import.json) records imported/current and supplied hashes. Windows separators were normalized. Bot strategies and historical JSON remain unchanged. Only browser dependencies were imported: no screenshots, Node hosts, installers, dev instructions or unavailable CLI commands. Universe metadata was relocated to engine/universe.js.

Integration adaptations: canonical standalone document, independent AizanoiOS frame lifecycle, local fonts, external scripts only, static stylesheet/data-attribute presentation, allowlisted classic-worker strategy imports replacing Function evaluation, scoped storage, chart cleanup and route teardown. No production CSP changes or backend required. Lightweight Charts is supplied version 4.2.0, copyright TradingView, Apache-2.0 (license header retained); visible TradingView attribution is included. No broader license for the archive is inferred.

## Data and provenance limits

This is an owner-supplied historical snapshot, not independently fetched or verified market data. Model names, claimed strategy authorship, session times, cutoff and league outcomes are source labels, not verified model evaluation results. The included league is imported, not recomputed by this integration; its engineNotes refer to a prior league-v1.0.json that the archive does not supply. No unavailable tools or historical league file are advertised as installed. No inference about model intelligence, pretraining isolation, redistribution permissions or future performance is warranted. Paper money only; no live orders, credentials, provider calls or investment advice.

Historical JSON is intentionally retained for all supplied timeframes and strategies. Publication permission is an exact set of paths in tests/audit/security-publish-boundary.test.mjs; no recursive JSON exemption. Each imported payload hash is recorded in trade-arena-import.json. Data are loaded on demand, not shell precached.

## Integration safety gates

- The unchanged TradingView distribution now includes its full upstream v4.2.0 `LICENSE` and `NOTICE` from `https://github.com/tradingview/lightweight-charts/tree/v4.2.0`. Visible NOTICE attribution and a TradingView link appear above every page. The optional chart logo is disabled through `layout.attributionLogo` because that widget injects a CSP-blocked style element; no vendor code or policy is modified.
- Stock 1h/4h **races are disabled** in presets, validation and the common market-engine entry. The supplied session-close/terminal-quote ordering has not been corrected or certified. Raw intraday files remain available for inspection, and the untouched imported league may include those unreliable sessions; do not treat it as a validated ranking.
- Every selected-market, context and funding file must load. A missing or malformed historical download fails the race; failed downloads are removed from the worker cache. Failed initialization/retirement never creates an ordinary persisted result.
- Strategy hosts have one outstanding request and an absolute hard timeout, with timers and promises settled on close. Race worker error/messageerror and bootstrap deadline surface failure. Starts no longer await source downloads, removing the reentrant-start fetch race. Explorer fetches are aborted and invalidated on routing; replaced charts and their ResizeObservers are explicitly released.

## Verification

Focused Node contracts: tests/trade-arena.test.mjs. Real browser suite: tests/browser/trade-arena.test.mjs, including strict production CSP, shipped worker startup, historical computation, chart/explorer, responsive and shell teardown. Routine CI runs it in the existing fail-closed arcade matrix, owned by Aizanoi CI. This document does not claim production deployment.
