# Aizanoi Field System v3 — Design System

Aizanoi is not a generic browser desktop and should not imitate a single operating system. The product is a **domain-specific digital archaeology workspace** with three connected contexts:

1. **Field Instrument** — shell, command palette, status and navigation: dark, precise and quiet.
2. **Archive Room** — notes, sources, metadata and reading: warm paper, generous rhythm and comfortable typography.
3. **Cinematic Expedition** — Historical Worlds: full-bleed scene, minimal HUD and evidence on demand.

The visual redesign takes interaction inspiration from modern web-OS experiments such as macOS Web, Vivek Patel's Ubuntu/Web desktop, Hyggshi OS Web Edition and Win12 Web: generous negative space, restrained translucency, coherent docks/shelves and adaptive window chrome. Those products are references, not templates. Aizanoi keeps its own archaeological identity.

## Product hierarchy

Home is not an app dump. The hierarchy is:

1. **Mission / Continue Field Session** — answer “what should I do first?”
2. **Historical Worlds** — Aizanoi, Rome, Athens
3. **Research Workspace** — Archive, Notes, Data, Sources, Viewer, Projects
4. **Tools & Experiments** — Terminal, Monitor, TV, Experiments

The catalog stays equivalent across desktop, tablet and mobile while presentation adapts.

## Canonical tokens

All new Field System tokens use the `--az-*` namespace and live in `frontend/styles/tokens.css`.

Core palette:

| Token | Value | Role |
|---|---|---|
| `--az-canvas` | `#0B1212` | field canvas |
| `--az-paper` | `#E9E1D1` | reading / note surface |
| `--az-ink` | `#242B28` | paper ink |
| `--az-text` | `#F1EBDD` | primary dark-shell text |
| `--az-brass` | `#C4A36B` | evidence/primary emphasis |
| `--az-teal` | `#73AAA4` | interactive/local state |
| `--az-rust` | `#A76553` | inferred/reconstruction accent |
| `--az-focus` | `#9BD8D1` | keyboard focus |

### Evidence language

Evidence is never communicated by color alone.

- documented — teal + label
- archaeological — brass + label
- inferred — rust + label
- atmospheric — neutral + label
- disputed — warning + dashed/label treatment

## Typography

- display: Georgia / suitable open serif
- UI: system sans / Inter-class sans when available
- instrumentation: system monospace

Rules:

- functional text: **minimum 11 px**
- normal UI: **12–14 px**
- reading surfaces: **16 px / ~28 px line height**
- tiny uppercase mono is not a substitute for hierarchy
- faint text is decorative only, never required instructions or metadata

## Space and shape

Spacing scale: `4, 8, 12, 16, 24, 32, 48`.

- controls: ~8 px radius
- cards: ~14 px
- windows: ~18 px
- dialogs: ~20 px
- touch controls: minimum 44×44 px

Translucency is used to separate system chrome from the field canvas, not as decoration everywhere. Reading surfaces remain opaque and comfortable.

## Responsive model

| Layout | Width | Default behavior |
|---|---:|---|
| Compact | `<600px` | fullscreen-equivalent apps + bottom navigation |
| Medium | `600–839px` | single focus workspace |
| Expanded | `840–1199px` | large focus workspace, touch-sized chrome |
| Large | `≥1200px` | freeform desktop windows |

Input capability matters as much as width. Hover-only actions are not required on coarse-pointer layouts.

## Window model

There is one canonical window lifecycle in `frontend/js/v3/shell.js`.

- desktop: drag, resize, minimize, maximize/restore, close and keyboard move/resize through Window menu
- tablet: focus workspace with touch-sized chrome rather than miniature desktop controls
- mobile: fullscreen-equivalent app frame; minimize/maximize chrome is hidden
- URL represents **active app intent**, not the entire open-window snapshot
- local Workspace Store records open apps, active app and desktop window rectangles

No app creates a second window manager.

## Dialog model

Every canonical overlay/dialog:

- records its opener
- places initial focus inside
- traps Tab while open
- makes the background inert
- closes with Escape
- restores focus to the opener

## Motion

Motion exists only to communicate state.

- hover/press: ~80–100 ms
- window/overlay: ~180–220 ms
- transform + opacity preferred
- `prefers-reduced-motion` removes nonessential transitions
- returning users should never wait through a long decorative boot

## Historical Worlds

World mode is the most immersive surface. Persistent HUD is deliberately small; secondary controls live behind **Explore**. A Field System return action preserves a browser-local Field Session so the user can return to research tools and later continue the world.

City-specific archaeology stays city-local. Shared UI/traversal code must never imply that generic geometry is documented evidence.

## Anti-patterns

Do not:

- add another “final polish” stylesheet to override previous layers
- introduce a second token namespace
- restore retired AI/backend/XP surfaces
- make every app equally prominent on Home
- fabricate CPU/server/network metrics
- implement a real remote shell under the Field Terminal name
- use photorealism as a proxy for archaeological certainty
- hide required actions behind hover on touch devices
- introduce a framework rewrite only for architectural fashion

## Quality gate

A design change is not complete until applicable tests cover:

- desktop/tablet/mobile layout
- no horizontal overflow
- 44 px coarse-pointer target floor
- useful accessible names
- dialog focus/inert/restore
- route/window consistency
- zero serious/critical axe violations in automated surfaces
- zero new fatal browser/console errors
- final rendered screenshot review
