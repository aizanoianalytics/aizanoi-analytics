# Aizanoi Arcade

Scope: public static arena pages, local bot workers and shared browser controls. No visitor backend; multiplayer means local seats, not network play.

## Arena owners

- [AI Snake Royale](snake-royale/index.md) — simultaneous snake arena and shared shell renderer.
- [Chess](chess/index.md) — legal moves, board and worker matches.
- [Maze Chase](maze-chase/index.md) — maze, ghosts and human controls.
- [Capture the Flag](capture-flag/index.md) — team arena and accessibility.
- [Hold'em](holdem/index.md) — poker table, betting and worker lifecycle.
- [Football](football/index.md) — team pitch and keyboard/touch controls.
- [Anatolian Pact](anatolian-pact/index.md) — strategy orders and authored map data.
- [Shared browser modules](shared/index.md) — input and in-memory custom-bot loading; worker isolation is not a hostile-code sandbox.

Each arena owns its BOT_API.md contract, roster, engine, runner and page. The public landing is `index.html`; AizanoiOS catalog/lifecycle ownership stays with `../js/v3/registry.js` and the corresponding shell app modules.

## Validation and private tooling

- [Test ownership](../../tests/index.md) — routine arcade browser matrix, regression and publication gates.
- [Private arena CLI](../../scripts/arcade/README.md) — offline tournament tooling; never published as a backend.
