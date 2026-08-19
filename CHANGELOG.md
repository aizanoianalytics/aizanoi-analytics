# Changelog

Aizanoi Analytics is developed as a continuous open-source project. This file records major public milestones rather than every internal commit.

## Unreleased

### Planned direction

- deeper Aizanoi Historic World fidelity and guided exploration;
- stronger evidence / uncertainty presentation;
- improved map, landmark and research-navigation UX;
- continued mobile performance and accessibility work.

See [ROADMAP.md](ROADMAP.md).

## 2026-08-19 — Field System public-launch baseline

### Added / improved

- unified Aizanoi Field System across desktop, tablet and mobile;
- synchronized 11-app launcher:
  - Worlds
  - Archive
  - Notes
  - Data
  - Sources
  - Viewer
  - Projects
  - Terminal
  - Monitor
  - TV
  - Games;
- consistent application interiors and touch-friendly tablet/mobile layouts;
- final product-polish layer for legacy and workstation applications;
- expanded desktop/tablet/mobile Chromium product smoke coverage;
- expanded final visual-review capture;
- public project showcase documentation, contribution policy, security policy and roadmap.

### Terminal

- moved fully to a browser-only virtual shell;
- fixed in-memory filesystem and fixed command set;
- removed historical Windows / host-shell presentation leaks;
- standardized `Field Terminal`, `AIZANOI FIELD TERMINAL / LOCAL VIRTUAL SHELL` and `aizanoi@field:~$` identity;
- added browser assertions that Terminal produces no application API requests.

### Security / architecture

- public web runtime is static-only;
- visitor-facing Node/Express backend retired;
- port/backend dependency removed from the public application architecture;
- historical `/api/chat` fails closed with `410 Gone`;
- other historical/unknown `/api/*` routes fail closed;
- external AI provider integration removed;
- stale AI launch/navigation/command surfaces fail closed;
- production deployment examples aligned with static Nginx serving;
- GitHub Actions security and dependency workflows kept pinned and audited.

### Quality

- regression suite expanded to cover OS product contracts, static runtime, security, historical worlds and local tools;
- Chromium smoke tests cover Aizanoi OS, Terminal, workstation applications, Rome and Athens;
- Lighthouse budgets remain a release gate;
- visual review artifacts generated for desktop, tablet, mobile and historical worlds.

## 2026-08-17 — Ancient World shared-engine expansion

### Added / improved

- Late Antique Rome (AD 410–476) modular historical world;
- Classical Athens (450–430 BCE) modular historical world;
- reusable Ancient World engine contracts for:
  - traversal and support surfaces;
  - lifecycle and teardown;
  - mobile controls;
  - navigation;
  - evidence presentation;
  - adaptive performance;
  - shared surface/environment rendering;
  - landmark arrival framing;
- city research/manifests separated from rendering behavior;
- city template for adding future historical environments without cloning the full engine;
- research folders and verified-source material expanded for Rome and Athens.

## Earlier development

Earlier commits established:

- Aizanoi Historic World as the original interactive historical environment;
- Aizanoi OS / Field System concept;
- local browser games and projects surfaces;
- Archive / Notes / Data Lab experimentation;
- PWA/service-worker support;
- accessibility and responsive hardening;
- CI, browser smoke and deployment documentation.

For fine-grained history, use the repository commit and pull-request timeline.
