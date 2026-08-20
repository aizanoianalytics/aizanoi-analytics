# Changelog

Aizanoi Analytics is developed as a continuous open-source project. This file records major public milestones rather than every internal commit.

## Unreleased — Field System v3

### Product / design

- rebuilt the root product as **Aizanoi Field System v3**, an archaeological field-workspace rather than a generic OS imitation;
- introduced a calmer and more spacious visual system with restrained translucent chrome, warm paper research surfaces and Worlds-first hierarchy;
- reorganized Home around a recommended/continuing field mission, Historical Worlds, Research Workspace and secondary Tools & Experiments;
- kept one coherent product catalog across desktop, tablet and mobile while adapting window behavior to the available space/input model;
- added `DESIGN.md` as the canonical visual/interaction contract.

### Architecture

- replaced the compatibility-on-compatibility shell with one canonical v3 registry, workspace store, window/router/dialog lifecycle and command system;
- retired the previous global OS CSS stack and legacy shell/workbench/product-polish JavaScript layers;
- reduced the initial root document to a small semantic bootstrap with four initial stylesheets and one ES module;
- moved noncritical research/tool applications behind lazy module loading and lazy app styles;
- standardized Field System design tokens under a single `--az-*` namespace;
- introduced one shared IndexedDB Archive store for Archive, Notes, Data Lab, Source Reader and Artifact Viewer.

### Research workspace

- added useful first-launch Archive sample records instead of an empty canvas;
- added Archive metadata inspection, local imports and record-to-app routing;
- added Field Note templates for observation, reconstruction hypothesis and source review with local autosave;
- added local CSV/JSON Data Lab preview and “send summary to Notes” workflow;
- added local PDF/Markdown/text Source Reader and citation/note actions;
- added local image Artifact Viewer with provenance metadata;
- rewrote Projects around current Field System, Historical Worlds and research work only.

### Historical Worlds integration

- kept the finalized Aizanoi/Rome/Athens traversal/evidence baseline intact;
- added a lightweight browser-local Field Session bridge between a Historical World and the Field System;
- added a shared **Field System** return action inside the Historical World Explore drawer;
- kept the 51-landmark walk/traversal regression as a release blocker.

### Terminal / Monitor

- replaced generic shell cosplay with domain commands such as `worlds`, `open`, `find`, `session` and `evidence`;
- kept Field Terminal browser-only with no remote/server command path;
- changed Workspace Monitor to browser-observable facts only: storage, open apps, service-worker state, connectivity, viewport/install mode and field-session context.

### Legacy retirement / product truth

- removed retired Aizanoi AI / HR AI discovery, manifest, registry and compatibility surfaces from the public frontend;
- removed legacy XP icon pack and compatibility shell files;
- aligned root HTML, meta/OG/Twitter, manifest and error surfaces with the current static/local-first digital archaeology product;
- removed the invalid legacy SVG transform from the root shell by removing the old monolithic markup entirely.

### Accessibility / QA

- introduced modal opener capture, initial focus, Tab containment, background `inert`, Escape close and focus restore;
- added keyboard window Move/Resize through the Window menu;
- enforced a 44 px mobile/coarse-pointer target floor on canonical shell actions;
- raised canonical functional typography to an 11 px minimum;
- added axe-core serious/critical browser gates for representative desktop/mobile Field System surfaces;
- added route/window consistency and app-lazy-loading Chromium assertions;
- replaced the compatibility-shell QA matrix with Field System v3 tests and rendered desktop/tablet/mobile review captures.

### Static delivery / operations guidance

- added `/.well-known/security.txt` to the static tree;
- updated the sanitized Nginx reference with gzip, explicit manifest MIME, bounded cache policy, stronger static security headers and no application proxy;
- added `docs/OPERATIONS.md` to separate provider/server tasks from source-controlled facts;
- added `CODEOWNERS` for security-sensitive runtime, workflow and historical-evidence surfaces.

See [ROADMAP.md](ROADMAP.md), [DESIGN.md](DESIGN.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## 2026-08-19 — Field System public-launch baseline

This milestone records the compatibility-era public baseline before the v3 consolidation above.

### Added / improved

- unified Aizanoi Field System across desktop, tablet and mobile;
- synchronized 11-app launcher;
- consistent application interiors and touch-friendly tablet/mobile layouts;
- expanded desktop/tablet/mobile Chromium product smoke coverage;
- expanded final visual-review capture;
- public project showcase documentation, contribution policy, security policy and roadmap.

### Terminal

- moved fully to a browser-only virtual shell;
- removed historical Windows / host-shell presentation leaks;
- standardized Field Terminal identity;
- added browser assertions that Terminal produces no application API requests.

### Security / architecture

- public web runtime became static-only;
- visitor-facing Node/Express backend retired;
- port/backend dependency removed from public application architecture;
- historical `/api/chat` fails closed with `410 Gone`;
- other historical/unknown `/api/*` routes fail closed;
- external AI provider integration removed from the active runtime;
- production deployment examples aligned with static Nginx serving.

### Quality

- regression suite expanded to cover product contracts, static runtime, security, historical worlds and local tools;
- Chromium smoke tests covered Field System, Terminal, workstation applications, Rome and Athens;
- Lighthouse budgets remained a release gate;
- visual review artifacts generated for desktop, tablet, mobile and historical worlds.

## 2026-08-17 — Ancient World shared-engine expansion

### Added / improved

- Late Antique Rome (AD 410–476) modular historical world;
- Classical Athens (450–430 BCE) modular historical world;
- reusable Ancient World engine contracts for traversal/support surfaces, lifecycle/teardown, mobile controls, navigation, evidence, adaptive performance and shared environment helpers;
- city research/manifests separated from rendering behavior;
- city template for future historical environments without cloning the full engine;
- research folders and verified-source material expanded for Rome and Athens.

## Earlier development

Earlier commits established Aizanoi Historic World, the original browser-OS/Field System concept, local games/projects, Archive/Notes/Data experiments, PWA support, responsive hardening and the first CI/deployment documentation.

For fine-grained history, use the repository commit and pull-request timeline.
