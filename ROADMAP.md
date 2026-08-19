# Aizanoi Analytics Roadmap

This roadmap describes product direction, not a promise of delivery dates.

The project is intentionally selective: the goal is not to maximize the number of features, cities or UI panels. The goal is to make **Aizanoi-centered interactive history deeper, more legible and more trustworthy** while keeping the public runtime simple.

## Current baseline — 2026.08

Completed foundations:

- static-only public production architecture;
- browser-only Field Terminal;
- external AI integration removed / fail-closed;
- unified desktop, tablet and mobile Field System;
- synchronized 11-app launcher;
- Field Archive, Notes, Data Lab, Source Reader, Artifact Viewer and Workspace Monitor;
- Aizanoi Historic World;
- Late Antique Rome (AD 410–476);
- Classical Athens (450–430 BCE);
- shared Ancient World traversal/input/evidence/performance contracts;
- regression, Chromium, visual, Lighthouse and security CI;
- public documentation and contribution/security policies.

## Next major focus — Historical World depth

### Aizanoi Historic World 2.x

Aizanoi is the center of the project. The next major development effort should improve depth rather than add decorative OS surface area.

Priority areas:

- stronger landmark fidelity;
- better terrain / elevation readability;
- improved stairs, support surfaces and collision boundaries;
- denser but historically defensible urban fabric;
- guided exploration / curated tour path;
- map and orientation layer;
- clearer landmark arrival framing;
- stronger evidence / uncertainty presentation;
- richer contextual panels for temple, theatre/stadium, riverfront and residential areas;
- mobile performance and touch movement polish;
- visual atmosphere that supports historical readability without implying false certainty.

### Evidence UX

Make the distinction between source, inference and atmosphere easier to understand while exploring.

Possible work:

- evidence badges that open concise source/methodology context;
- per-landmark evidence summaries;
- source links or citations where licensing and format allow;
- reconstruction-confidence language shared across cities;
- clearer separation of archaeological evidence from procedural infill.

### Guided exploration

A visitor should be able to understand why a place matters without already knowing the site.

Possible work:

- optional guided route;
- short landmark introductions;
- timeline / period context;
- “why this reconstruction looks this way” notes;
- return-to-map / next-landmark flow.

## Rome and Athens

Rome and Athens should remain comparative historical worlds, not compete with Aizanoi for project identity.

Priorities:

- preserve shared engine parity;
- improve city-specific grounding and landmark framing;
- strengthen research manifests and methodology presentation;
- avoid city-specific forks of shared movement/input behavior;
- keep performance predictable on mobile and mid-range hardware.

## Field System

The Field System is now a stable product frame. Near-term work should emphasize refinement, not app-count growth.

Preferred improvements:

- clearer first-visit onboarding;
- better relationship between Worlds and local research tools;
- import/export ergonomics for local research data;
- stronger source-to-artifact navigation;
- accessibility and real-device touch verification;
- fewer legacy compatibility layers over time through careful mechanical extraction.

Not a near-term priority:

- adding many more launcher apps;
- rebuilding the interface in a large framework for its own sake;
- turning the OS shell into the primary attraction of the project.

## Research and documentation

- expand Aizanoi-specific research documentation;
- keep Rome/Athens source verification data auditable;
- document reconstruction assumptions near implementation;
- keep methodology readable for non-developers;
- add a concise contributor guide for historical data submissions if outside contributions increase.

## Performance and accessibility

- preserve Lighthouse budgets;
- profile Historic World bottlenecks before large rendering rewrites;
- keep adaptive quality centralized;
- test mobile controls on real devices;
- continue keyboard/focus/reduced-motion support;
- periodically perform manual VoiceOver/NVDA checks where practical.

## Security and operations

The preferred direction is to keep reducing unnecessary public attack surface.

- keep the visitor-facing application static unless a reviewed requirement changes that decision;
- keep Terminal browser-only;
- keep local research data local by default;
- keep production secrets/config outside the repository;
- maintain regression coverage for historical `/api/*` fail-closed behavior;
- keep GitHub Actions permissions minimal and actions pinned.

## Public launch / communication

Planned presentation work outside core runtime:

- stronger project walkthroughs;
- video essays / build logs through Aizanoi TV and external video platforms;
- clearer explanation of research methodology;
- release notes for major visible milestones;
- better showcase material for historical worlds as they mature.

## Explicitly not planned right now

These are not forbidden forever, but they are outside the current product strategy:

- user accounts;
- public comments;
- social feeds;
- multiplayer;
- public shared leaderboards;
- server-side terminal execution;
- external AI chat inside the public site;
- a visitor-facing application backend for features that can remain browser-native;
- a full framework rewrite without measured product/performance benefit.

## Decision rule

When choosing between two next features, prefer the one that makes the project more:

1. historically legible;
2. evidence-aware;
3. explorable;
4. reliable across devices;
5. simple to operate securely.

If a change mainly adds surface area without improving one of those dimensions, it is probably not the next priority.
