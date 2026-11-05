# AI Trade Arena

Public entry: `index.html` at `/arcade/trade-arena/`. Independent AizanoiOS entry: [trade-arena module](../../js/v3/apps/trade-arena/index.md).

- `ui/`: page, race/explorer rendering, worker hosts and locally vendored Lightweight Charts 4.2.0. `basket.js` owns `#/basket`; `advisor.js` owns `#/advisor`; `live.js` owns closed-bar top-ups.
- `engine/`: simulation/features/bars and browser universe metadata. `fx.js` owns causal historical USD/TRY conversion for daily mixed BIST + US + crypto races; standalone BIST remains TRY.
- `bots/`: owner strategies and roster, with the exact reversible Flint binding correction documented in provenance. [Bot API](BOT_API.md). Only shipped paths can run; workers are resource isolation, not a hostile-code sandbox. No uploads or runtime code evaluation.
- `data/`: immutable owner-supplied catalog, league snapshots, raw bars and funding; separately derived ECB `fx-usdtry.json` (source hash and availability policy embedded). Deliberately published by exact-path JSON allowance.
- `live/`: archive-only placeholder; production replaces this route with private-updater static tails. Browsers never contact upstream providers. [Updater and deployment inputs](../../../scripts/trade-arena/index.md).
- Storage: `trade-arena:theme`, `trade-arena:pick`, `trade-arena:history`, `trade-arena:my-basket`; no existing user keys are deleted or migrated.
- [Import provenance](../../../docs/TRADE_ARENA_IMPORT.md); private browser implementation is not a cross-module API. Imported standings are not recomputed by deployment.
- Tests: `tests/trade-arena.test.mjs`, `tests/trade-arena-v3.test.mjs`, `tests/browser/trade-arena.test.mjs`; routine arcade CI ownership.
- Conservative failure policy: a failed/retired strategy fails the whole race, Basket or Advisor calculation. Select fewer/different advisors and retry; partial consensus is not certified. A partial live manifest disables live mode, and missing/inconsistent series coverage falls back to the whole archive.
