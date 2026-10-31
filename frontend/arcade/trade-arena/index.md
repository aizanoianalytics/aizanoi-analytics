# AI Trade Arena

Public entry: `index.html` at `/arcade/trade-arena/`. Independent AizanoiOS entry: [trade-arena module](../../js/v3/apps/trade-arena/index.md).

- `ui/`: page, race/explorer rendering, worker hosts and locally vendored Lightweight Charts 4.2.0.
- `engine/`: supplied simulation/features/bars and browser universe metadata (relocated from supplied tools/universe.mjs).
- `bots/`: unchanged owner strategies and roster. [Bot API](BOT_API.md). Only shipped paths can run; workers are resource isolation, not a hostile-code sandbox. No uploads or runtime code evaluation.
- `data/`: owner-supplied historical catalog, league snapshot, raw bars and funding. Deliberately published by exact-path JSON allowance, never fetched from a live provider.
- Storage: `trade-arena:theme`, `trade-arena:pick`, `trade-arena:history`; no existing user keys are deleted or migrated.
- [Import provenance](../../../docs/TRADE_ARENA_IMPORT.md); private browser implementation is not a cross-module API.
- Tests: `tests/trade-arena.test.mjs`, `tests/browser/trade-arena.test.mjs`; routine arcade CI ownership.
