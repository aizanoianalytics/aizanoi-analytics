# Changelog

Aizanoi Analytics is developed as a continuous open-source project. This file records major public milestones rather than every internal commit.

## Unreleased — Aizanoi Analytics platform cleanup

### Brand / product truth

- locked **Aizanoi Analytics** as the company and umbrella public brand;
- retained `Aizanoi` as short-form identity inside product names rather than a separate parent brand;
- renamed the user-facing analytical product to **Dashboards** while preserving `/analytics/` and app id `analytics` for compatibility;
- aligned AizanoiOS, static product landings, metadata and maintained documentation with that hierarchy.

### Discovery / publishing

- added Aizanoi News to shared product navigation;
- expanded News sitemap coverage to daily editions and category archives;
- strengthened regression coverage so maintained documentation, navigation and sitemap discovery cannot silently drift back to retired contracts.

### Asset cleanup

- moved active AizanoiOS products away from retired Workbench icon filenames to canonical product icon names.

## 2026-08-23 — AizanoiOS umbrella platform baseline

- established AizanoiOS as the adaptive browser-native shell across desktop, tablet and mobile;
- introduced the current eight-app public catalog: News, TV, analytical products, Historical Worlds, Forge, Journal, Labs and Arcade;
- retired the visitor-facing Archive, Notes, Data Lab, Source Reader, Artifact Viewer, Projects, Terminal and Workspace Monitor bundle;
- added static product landing pages, source-led News publishing, responsive device presentations and product-level SEO metadata;
- preserved a static-first visitor runtime behind Nginx.

## 2026-08-20 — Superseded Field System consolidation

> Historical note: the Field System/Research Workspace described in this milestone is **not the current public product contract**. Its visitor-facing Workbench applications were subsequently retired. Current architecture and product truth live in `PRODUCT.md`, `AGENTS.md`, `DESIGN.md` and `ARCHITECTURE.md`.

This milestone consolidated an earlier archaeological research-workspace iteration. It introduced the canonical v3 shell foundations, accessibility improvements, browser-local research tools and a shared Historical Worlds bridge. Those experiments informed the current AizanoiOS architecture, but Archive, Notes, Data Lab, Source Reader, Artifact Viewer, Projects, Terminal and Workspace Monitor are no longer public applications.

## 2026-08-19 — Static public-launch baseline

- moved the public web runtime to static-only delivery;
- retired the visitor-facing Node/Express backend and external AI-provider runtime path;
- made historical `/api/chat` fail closed with `410 Gone` and other unknown `/api/*` paths fail closed;
- expanded desktop/tablet/mobile browser QA, accessibility checks, security policy and deployment documentation;
- established Historical Worlds and local browser games as production-tested public surfaces.

## 2026-08-17 — Ancient World shared-engine expansion

### Added / improved

- Late Antique Rome (AD 410–476) modular historical world;
- Classical Athens (450–430 BCE) modular historical world;
- reusable Ancient World engine contracts for traversal/support surfaces, lifecycle/teardown, mobile controls, navigation, evidence, adaptive performance and shared environment helpers;
- city research/manifests separated from rendering behavior;
- city template for future historical environments without cloning the full engine;
- research folders and verified-source material expanded for Rome and Athens.

## Earlier development

Earlier commits established Aizanoi Historic World, the original browser-OS/Field System experiments, local games, PWA support, responsive hardening and the first CI/deployment documentation.

For fine-grained history, use the repository commit and pull-request timeline.
