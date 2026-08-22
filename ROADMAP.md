# Aizanoi Roadmap

This roadmap describes direction, not delivery promises.

## 2026 platform baseline

Aizanoi is an umbrella digital studio rather than a single-subject archaeology product. The current public platform includes:

- AizanoiOS as the adaptive browser-native shell;
- Aizanoi News;
- Aizanoi TV;
- Aizanoi Journal;
- Aizanoi Analytics;
- Aizanoi Forge;
- Historical Worlds;
- Aizanoi Labs;
- Aizanoi Arcade.

## Phase 1 — Brand platform foundation

- maintain `PRODUCT.md`, `AGENTS.md` and `CONTENT_POLICY.md` as canonical contracts;
- keep desktop sparse: News, TV, Analytics, Worlds, Forge;
- make mobile a phone-like Aizanoi home screen rather than a reduced desktop;
- make tablet a touch-first two-pane workspace;
- keep one public catalog across form factors;
- preserve existing Historical World behavior;
- keep the visitor runtime static-first.

The former Workbench/power-tool bundle is retired from the public product and should not be restored unless there is a new, explicit user-facing reason for it.

## Phase 2 — Aizanoi News

- Hermes-driven source discovery;
- original summary generation with mandatory attribution;
- build-time structured validation;
- five initial categories: AI & Technology, Markets & Economy, World, Sports, Culture;
- archive/search once the content volume justifies it;
- RSS/sitemap/structured data for published stories;
- correction metadata and transparent source provenance.

Do not turn News into a copied-article farm.

## Phase 3 — Aizanoi TV

- establish the English-language YouTube channel identity;
- publish companion pages with transcript/chapters when useful;
- attach meaningful sources to factual videos;
- cross-link relevant News, Journal, Analytics and Forge items;
- avoid eager third-party embeds when a lightweight preview/link is sufficient.

## Phase 4 — Aizanoi Analytics

- publish useful dashboards and interactive analytical tools;
- each production project should expose Launch / Source / Documentation / Version where applicable;
- prioritize data products that can stand alone as useful portfolio pieces;
- keep private/employer data out of the public repository.

## Phase 5 — Aizanoi Forge

- GitHub remains canonical;
- add project metadata, release state and source/build links;
- mirror/catalog repository information rather than maintaining a second independent source tree;
- surface open projects cleanly from AizanoiOS.

## Phase 6 — Journal, Labs and Arcade

### Journal
Long-form analysis, essays and commentary. News reports events; Journal interprets them.

### Labs
Experimental / Prototype / Archived status for WebGL/WebGPU/UI/audio/physics/generative work.

### Arcade
Playable browser games separated from technical experiments.

## Historical Worlds

Aizanoi, Rome and Athens remain maintained flagship experiences. Future worlds should be added only when the current three are stable and there is enough research/production capacity to support another city properly.

Evidence boundaries remain mandatory.

## Platform and operations

Priorities:
- Git-first deployment;
- exact-SHA production releases;
- rollback points and post-deploy smoke checks;
- compression and bounded caching;
- accessibility and device-specific desktop/tablet/mobile QA;
- privacy-preserving analytics if introduced;
- off-site backups/restore drills outside the public repository.

## Explicitly not planned in the current phase

Unless the owner explicitly changes the product constitution:
- accounts;
- comments/forums;
- social feeds;
- multiplayer/shared leaderboards;
- public AI chat;
- remote shell execution;
- visitor-facing research/power tools without a clear public use case;
- framework rewrites for fashion;
- a general visitor-facing backend.

## Decision rule

Prefer work that makes Aizanoi more:
1. useful;
2. distinctive;
3. trustworthy and source-aware;
4. easy to explore;
5. coherent across product families;
6. natural to use on the device in hand;
7. simple to operate securely.
