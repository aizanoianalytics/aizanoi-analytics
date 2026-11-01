# Changelog

Aizanoi Analytics is developed as a continuous open-source project. This file records major public milestones rather than every internal commit.

## Unreleased — 2026-11 UX and quality pass

### Shell and brand

- new default **Morning** wallpaper plus **Blue hour** and the original **Aurora**, selectable in Settings; responsive AVIF/JPEG variants for desktop, tablet and phone; desktop text sits on tone-aware label chips so it stays readable on every wallpaper;
- one window-control design for every window (SVG glyphs, neutral until hover, Close turns warm); Calculator, Winamp and Arcade keep menu, minimize and close in a floating glass cluster instead of a lone cross; maximize/restore glyph follows state;
- new logo-derived app icons (favicon, PWA 192/512, maskable, Apple touch 180) and a real Open Graph image; Inter is now self-hosted;
- shell lifecycle: clicking inside a window no longer steals focus; compact-layout isolation is derived from overlay/layout/active-window state; stale async close verdicts cannot close a newer instance; one snapping implementation; window rectangles round-trip without drift; Reset local state confirms first and consults unsaved-work guards; the search box is a real combobox; more than ten open apps are refused instead of orphaning windows;
- removed ~160 dead CSS selectors from retired products and six unused wallpaper SVGs.

### Products

- Workspace/Notepad/Web Editor: Cancel can no longer trigger a destructive backup restore; saves are revision-bound; Web Editor Tab has a keyboard exit;
- Camera/Winamp/Calculator: late permission/playback results after close are discarded; clearer camera permission states; Winamp keyboard controls and empty state;
- Markets: the dark-mode theme no longer leaks into the shell document (it replaced the desktop wallpaper); stylesheets are reference-counted; real error state;
- Dungeon: modal settings/blessing flows, native-control key handling, honest audio controls, OS-or-local reduced motion;
- Arcade: four games rebuilt as mount/dispose modules in one cabinet look, input only while the game window is active, Mines keyboard flagging and 44 px cells;
- Trade Arena: eight OpenAI strategies added to the roster, recomputed 13-bot Season 1 league (25-18-15-12-10-8-6-4-2-1 points);
- landing pages, News, Analytics/Tableau and PACS: skip links, current-page navigation, token-based `landing.css`, edition navigation, honest validation wording, keyboard-operable PACS import/drill-down, export disclosure.

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
- introduced the current eight-app public catalog: News, TV, analytical products, Aizanoi, Forge, Journal, Labs and Arcade;
- retired the visitor-facing Archive, Notes, Data Lab, Source Reader, Artifact Viewer, Projects, Terminal and Workspace Monitor bundle;
- added static product landing pages, source-led News publishing, responsive device presentations and product-level SEO metadata;
- preserved a static-first visitor runtime behind Nginx.

## 2026-08-20 — Superseded Field System consolidation

> Historical note: the Field System/Research Workspace described in this milestone is **not the current public product contract**. Its visitor-facing Workbench applications were subsequently retired. Current architecture and product truth live in `PRODUCT.md`, `AGENTS.md`, `DESIGN.md` and `ARCHITECTURE.md`.

This milestone consolidated an earlier archaeological research-workspace iteration. It introduced the canonical v3 shell foundations, accessibility improvements, browser-local research tools and a shared Aizanoi bridge. Those experiments informed the current AizanoiOS architecture, but Archive, Notes, Data Lab, Source Reader, Artifact Viewer, Projects, Terminal and Workspace Monitor are no longer public applications.

## 2026-08-19 — Static public-launch baseline

- moved the public web runtime to static-only delivery;
- retired the visitor-facing Node/Express backend and external AI-provider runtime path;
- made historical `/api/chat` fail closed with `410 Gone` and other unknown `/api/*` paths fail closed;
- expanded desktop/tablet/mobile browser QA, accessibility checks, security policy and deployment documentation;
- established Aizanoi and local browser games as production-tested public surfaces.

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
