# Aizanoi Analytics Roadmap

This roadmap describes product direction, not delivery promises. The project is intentionally selective: **deepen the current product before adding new surface area**.

## Current 2026 baseline

Completed/maintained foundations:

- static-only visitor runtime and fail-closed historical API paths;
- Aizanoi, Late Antique Rome and Classical Athens as walkable Historical Worlds;
- shared traversal/input/evidence behavior plus 51-landmark browser QA;
- browser-local Archive, Notes, Data, Source Reader and Artifact Viewer;
- browser-only Field Terminal;
- responsive desktop/tablet/mobile product identity;
- GitHub regression, Chromium, visual and Lighthouse gates;
- public architecture/design/security/contribution documentation.

## Field System v3

The immediate architectural goal is to finish v3 as the single product truth:

- one app/world registry;
- one window/router/dialog lifecycle;
- one `--az-*` token system;
- Worlds-first Home with a useful first mission and field-session resume;
- lazy noncritical applications;
- no retired AI/XP compatibility surface;
- readable typography and 44 px coarse-pointer target floor;
- useful Archive sample/metadata workflow;
- world → research → world session continuity;
- source/security/performance/browser gates that prevent compatibility debt from returning.

The goal is not to add another theme. v3 removes the need for the former compatibility/polish stack.

## Research-product depth

After the v3 foundation is stable, the highest-value product work is deeper research interoperability rather than more launcher apps:

- editable Archive metadata: place, period, source, rights, confidence and tags;
- annotation/relationship links;
- portable archive manifest and export/restore;
- richer source citations/backlinks in Notes;
- dataset transform/reproducibility history;
- compare workflows in Source Reader / Artifact Viewer;
- JSON-LD / CSV / IIIF-friendly export where it genuinely improves interoperability.

## Historical Worlds

The three worlds are feature-complete enough to freeze as a baseline unless real user testing finds a defect. Future changes should be measured and evidence-led:

- preserve traversal and city-specific archaeology;
- improve material/lighting/atmosphere only when readability improves;
- keep documented/inferred/atmospheric boundaries explicit;
- optionally add curated guided narratives using the existing landmark data;
- never use photorealism as a substitute for historical confidence.

Aizanoi remains the center of the project; Rome and Athens are comparative worlds.

## Performance

Priorities:

- keep the root shell small;
- lazy-load app code/styles;
- enable production compression;
- use bounded caching while filenames are unhashed;
- introduce content-hashed immutable assets only with a reliable build/deploy path;
- progressively tighten Lighthouse budgets based on stable measured runs;
- add privacy-preserving real-user Web Vitals only if it can avoid collecting private Archive/Notes content.

## Accessibility

Continue toward:

- zero serious/critical automated axe violations;
- keyboard-only shell lifecycle;
- modal focus/inert/restore guarantees;
- 44 px coarse-pointer controls;
- 200% zoom / 320 CSS px reflow;
- manual NVDA/VoiceOver/TalkBack checks on meaningful releases;
- reduced-motion and high-contrast resilience.

## Operations

Repository work should support, but never falsely claim, provider-side completion of:

- protected `main` / required CI checks;
- Dependabot alerts/security updates and private vulnerability reporting;
- encrypted off-site backups with restore drills;
- accepted SSH login monitoring;
- production gzip/Brotli/cache verification;
- release tags/notes and production checksum parity.

See [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Explicitly not planned

Unless a concrete requirement changes the architecture:

- public AI chat;
- visitor-facing Node/backend runtime;
- server-side terminal execution;
- user accounts/social feeds/multiplayer;
- a framework rewrite for fashion;
- many more launcher apps;
- a fourth Historical World before the existing product has real-user feedback.

## Decision rule

Prefer changes that make Aizanoi more:

1. historically legible;
2. evidence-aware;
3. calm and easy to explore;
4. reliable across devices;
5. interoperable for research;
6. simple to operate securely.

If a change mainly creates more chrome or maintenance surface, it is probably not the next priority.