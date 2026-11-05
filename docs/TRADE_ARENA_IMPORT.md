# Trade Arena import

Owner supplied archive: https://tmpfiles.org/wzAGTwOggoGj/aizanoi-trade-arena.zip

SHA256: `527ccaa1dc00247cc35f1896185b47375e103434b41b9bc9ba201a07b881a5ec`.

Imported runtime ownership: [arena router](../frontend/arcade/trade-arena/index.md). The machine-readable [byte inventory](trade-arena-import.json) records imported/current and supplied hashes. Windows separators were normalized. Bot strategies and historical JSON remain unchanged. Only browser dependencies were imported: no screenshots, Node hosts, installers, dev instructions or unavailable CLI commands. Universe metadata was relocated to engine/universe.js.

Integration adaptations: canonical standalone document, independent AizanoiOS frame lifecycle, local fonts, external scripts only, static stylesheet/data-attribute presentation, allowlisted classic-worker strategy imports replacing Function evaluation, scoped storage, chart cleanup and route teardown. No production CSP changes or backend required. Lightweight Charts is supplied version 4.2.0, copyright TradingView, Apache-2.0 (license header retained); visible TradingView attribution is included. No broader license for the archive is inferred.

## Supplement 2026-11-01

The owner added eight OpenAI strategies (GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Astra, GPT-6 Sol, GPT-6 Luna, GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.6 Luna). Each was written by its model through the openai-codex OAuth provider in an isolated workspace with the same inputs as the original entrants: BOT_API, engine, CLI runner and historical data cut at 2024-12-31, a 45-minute wall-clock and 50-iteration budget, no rival sources. Their files, the 13-bot roster and the recomputed engine-1.1 Season 1 league (points 25-18-15-12-10-8-6-4-2-1 for places 1-10) are recorded under `supplements` in the byte inventory; the worker allowlist lists exactly the roster's files. Production-log counts for these bots are tool calls, not agent turns. The same provenance limits below apply.

## Supplement 2026-11-02

House bot **Basket Builder** (`bots/house/basket.js`) joins the roster. It is an Aizanoi house strategy, not an AI-model entry: every ~2 weeks it reads the market regime (breadth, average trend, SPY trend and VIX when present) and rebuilds a basket of up to 8 uptrending assets ranked by risk-adjusted momentum, inverse-volatility weighted (max 20 % each, max 3 per sector), with total exposure between 20 % and 95 % by regime. It was written after the 2024-12-31 cutoff, so it is labelled as a house bot; its parameters were fixed before any race and were not tuned on race results. The Season 1 league was recomputed with all 14 bots on engine 1.1 on an idle machine (zero bot errors or timeouts); the 13-bot table is kept on the owner workstation as `league-v1.1-13bots.json` and is not shipped.

## Supplement 2026-11-03 (engine 1.2, bot contract v2)

- **Long/short.** Contract v2 (`BOT_API.md`) documents negative target weights. Engine 1.2 charges an annual borrow fee on short market value (crypto 8 %, stocks 3 %) and 6 % on negative cash, closes the whole book with a margin call when gross exposure passes twice the race limit, never lets a 1× book borrow, and labels trades (`open/add/reduce/close/short/cover/flip/liquidated`). Long-only cash races are byte-for-byte unchanged (verified on the Season 1 bots). The race setup offers 1×/1.5×/2× gross.
- **Ten new AI bots**, each written once under the same protocol as the earlier entrants (data cut at 2024-12-31, 45-minute wall clock, no rival sources) but with the contract v2 prompt: Claude Opus 5.5 (Claude Code), Muse Spark 1.3 (OpenCode Go, owner-approved paid model) and eight free OpenCode models (DeepSeek V4.1 Flash, GLM 5.3 Flash, Beam, Iceman, MiMo V2.6 Flash, Nemotron 3.5 Super, Nemotron 3.5 Lightning, Flint 40B). Sessions that hit the 45-minute limit keep their last `bot.js`, as before. Strategy texts for sessions that ended without a summary were written by the integrator from the code. Trailing line whitespace was normalized (CI whitespace gate); no code changed. At the owner's request the GLM 5.3 Flash bot's display name was changed from "Tide Rider" (a clash with the Opus bot) to "Dragon Rider"; its logic is unchanged. Every file passed six smoke races (crypto/stocks/mixed/blind/4h/BIST, long-only and long/short) with zero errors and no forbidden APIs before it was allowlisted.
- **Aizo Bot** (`bots/house/aizo.js`), a house bot written by the integrator to the owner's rules, not an AI-model entry and written after the cutoff: short when the close is above EMA 7/21/50/100/200 with RSI(14) > 70 and above its level 1 week, 1 month, 6 months, 1 year and 3 years ago (unseen 1-year/3-year levels skipped); long in the mirror case (RSI < 30). Every signal opens a fresh 10 % lot; long lots have no stop and sell only the principal at +20 %, keeping the rest forever; short lots close at ±20 %. Parameters are the owner's and were not tuned on race results.
- **Borsa Istanbul.** 30 BIST stocks (`<TICKER>.IS`) and the BIST 100 index from the Yahoo chart API (the endpoint yfinance uses), TRY, 2014 onwards (pre-2014 rows carry the 2005 redenomination and unadjusted splits; the CCOLA 2024 split is booked on the wrong day upstream and is corrected by ÷11 before 2024-08-01). They race as `market: 'stocks'` with `exchange: 'BIST'`, `currency: 'TRY'`, are never mixed with USD assets and are benchmarked against BIST 100 (`xu100Ret20` context field).
- **Live tails.** The archive stays immutable. `scripts/trade-arena/update_live.py` (stdlib Python, public endpoints only) publishes post-archive closed bars to `/var/lib/aizanoi-trade-arena/live/`, served at `/arcade/trade-arena/live/`. The browser appends them all-or-nothing; the repository ships an archive-only placeholder manifest.
- **Basket advisor** (`#/advisor`): the viewer enters a basket (or pastes a list, or sends a bot basket from the Basket page); chosen bots trade the last 12 months, then on the latest close see that basket as `state.portfolio` and answer with targets, shown as close/trim/add/open/flip/keep actions and a consensus. Bots with no new signal are compared on their own current basket. Paper only, stays in the browser.
- **Randomness.** Races remain exactly reproducible by default (same data, rules and seed 7). The new *Market noise* option draws a fresh seed per start and moves fills inside the bar range, varies slippage and lets ~5 % of fills slip a bar; draws depend only on (seed, bar, asset), so every bot meets the same market. *Luck check* on the results replays the race ten times with noise and a random 80 % of the assets and reports wins and the return range per bot. League races do not use noise.
- **Season 2** (`data/league-ls.json`): long/short races at 1.5× gross and Borsa Istanbul races for the full roster; Season 1 is recomputed with the new bots (long-only, same 17 races).

## Server integration correction

CI caught Flint's reassignment of a `const longs` binding in its bearish/short branch. The deployed strategy changes only that binding to `let`; a regression test proves the supplied version silently returned null and the corrected version emits a short. The inventory retains the supplied `sourceSha256` and records the corrected current hash. Imported league standings were not recomputed after this correction and therefore describe the supplied strategy, not this repaired short branch. Browser-suite promise teardown was also made lint-compliant without changing its timeout.

## Data and provenance limits

This is an owner-supplied historical snapshot, not independently fetched or verified market data. Model names, claimed strategy authorship, session times, cutoff and league outcomes are source labels, not verified model evaluation results. The 14-bot Season 1 league shipped here was recomputed by the owner with engine 1.1 (see Supplements 2026-11-01 and 2026-11-02 above), not by this integration; its engineNotes refer to a prior league-v1.0.json and a league-v1.1-5bots.json, neither of which the archive supplies, so neither historical table is advertised as installed. No unavailable tools or historical league file are advertised as installed. No inference about model intelligence, pretraining isolation, redistribution permissions or future performance is warranted. Paper money only; no live orders, credentials, provider calls or investment advice.

Historical JSON is intentionally retained for all supplied timeframes and strategies. Publication permission is an exact set of paths in tests/audit/security-publish-boundary.test.mjs; no recursive JSON exemption. Each imported payload hash is recorded in trade-arena-import.json. Data are loaded on demand, not shell precached.

## Integration safety gates

- The unchanged TradingView distribution now includes its full upstream v4.2.0 `LICENSE` and `NOTICE` from `https://github.com/tradingview/lightweight-charts/tree/v4.2.0`. Visible NOTICE attribution and a TradingView link appear above every page. The optional chart logo is disabled through `layout.attributionLogo` because that widget injects a CSP-blocked style element; no vendor code or policy is modified.
- Stock 1h/4h **races are disabled** in presets, validation and the common market-engine entry. The supplied session-close/terminal-quote ordering has not been corrected or certified. Raw intraday files remain available for inspection, and the untouched imported league may include those unreliable sessions; do not treat it as a validated ranking.
- Every selected-market, context and funding file must load. A missing or malformed historical download fails the race; failed downloads are removed from the worker cache. Failed initialization/retirement never creates an ordinary persisted result.
- Strategy hosts have one outstanding request and an absolute hard timeout, with timers and promises settled on close. Race worker error/messageerror and bootstrap deadline surface failure. Starts no longer await source downloads, removing the reentrant-start fetch race. Explorer fetches are aborted and invalidated on routing; replaced charts and their ResizeObservers are explicitly released.

## Mixed daily markets and diagnostic preservation

The current `mixed` race includes BIST, US stocks and crypto. Its numeraire is USD;
standalone `bist` remains nominal TRY. No owner OHLCV, strategy or imported league bytes
were rewritten, and imported league tables have **not** been recomputed for this engine.

ECB historical reference source: <https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip>.
The committed derived artifact has 5,592 modern TRY fixings, 2005-01-03–2026-11-04,
from ZIP SHA256 `971a5cbf650f9e96663cf1218801c3054249e2bb57070d427db5a44931393f59`.
`scripts/trade-arena/update_fx.py` reproducibly derives TRY per USD as TRY per EUR / USD
per EUR. ECB attribution and its [reuse/disclaimer](https://www.ecb.europa.eu/services/disclaimer/html/index.en.html)
are retained. This is a derived reference cross-rate, **not** an official executable USD/TRY quote.
ECB rates are information-purpose references published around 16:00 CET on working days;
our conservative availability is the following calendar day at 00:00 UTC. Use only the
last reference available at the simulated UTC day's start and hold it for the entire day,
including the close. Weekends/holidays carry the reference; over 7 days fails closed.
This deliberately lagged convention never interpolates or backfills future fixings.

Daily bars are session-date labels, not simultaneous exchange opens. Decisions see all
completed daily closes at the following UTC midnight. The next available bar of each asset
is eligible to fill; there are no invented weekend/holiday stock fills. Mixed target notionals
mark the current venue at its open, earlier venues at their already-observed opens,
and unopened/closed venues at prior closes, all at that day's known FX.
Execution order is crypto UTC open, Istanbul, New York, with sells before buys **within**
a session. A later US sale cannot fund an earlier BIST buy in a cash account. Costs, borrow
and margin accounting remain in the common numeraire. This is a daily reference-price paper
model, not intraday matching, settlement, FX spread, holiday-calendar or market-impact modelling.
Available source bars define sessions; unaudited stock intraday racing stays disabled.
Mixed margin calls are observed after all daily closes and queue forced liquidation at
each asset's next available open; closed stocks are never liquidated at a stale quote.
Basket/Advisor retain their existing USD-only crypto + US scope (or separate TRY BIST)
through an explicit `usdAssetsOnly` request flag; their basket-entry currency contract is unchanged.

OHLCV price features/history and BIST-100 beta use per-session lagged USD conversions;
US stocks use SPY, BIST uses XU100, crypto uses BTC. Both stock hold benchmarks appear
when both exchanges participate and follow their own actual session bars/fees/FX. Closed
BIST holdings still revalue with known FX on the union calendar. Cached feature rows remain
the last completed session's features while closed (the current valuation may differ).
Macro `xu100Ret20` intentionally remains a native TRY index return. Chart warm-up uses
the same converted bars as the worker; non-tradable revaluations are not synthetic candles.

The worker host now retains the **first** fatal cause across later calls and cleanup;
hard deadlines still have the same timing and are classified as timeouts. The failed-race
screen names affected bot IDs/names and their actual initialization/retirement cause.
This fixes proven diagnostic loss, **not** an unobserved spontaneous-crash root cause.
All selected bots continue to run concurrently; no cap, pool or deadline loosening was added.

## Verification

Focused Node contracts: tests/trade-arena.test.mjs. Real browser suite: tests/browser/trade-arena.test.mjs, including strict production CSP, shipped worker startup, historical computation, chart/explorer, responsive and shell teardown. Routine CI runs it in the existing fail-closed arcade matrix, owned by Aizanoi CI. This document does not claim production deployment.
