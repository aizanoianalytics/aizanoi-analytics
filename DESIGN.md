# AizanoiOS — Design System

AizanoiOS is a browser-native digital archaeology desktop. It is deliberately **not** a generic dark research dashboard and it must not imitate one operating system pixel-for-pixel.

The shell combines proven interaction ideas from three reference families while keeping its own visual identity:

- **macOS-style web desktops** — calm top chrome, a tactile dock, magnification, clear active-app state and lightweight traffic-light window controls;
- **Ubuntu-style web desktops** — a real desktop surface, recognizable app launcher, strong shortcut semantics and a sense that applications live on a desktop rather than inside a landing page;
- **Win12-style web desktops** — bright wallpaper-first composition, airy Mica-like surfaces, modern rounded windows and restrained translucency.

These are interaction references, not assets or templates. AizanoiOS uses original wallpaper, Aizanoi branding, archaeology-specific applications and its own evidence language.

## Core visual direction

The default shell is **bright, spacious and wallpaper-first**.

Do:
- let the wallpaper occupy most of the screen;
- keep permanent system chrome small;
- use translucent white/light surfaces with readable dark text;
- reserve dark surfaces for content that benefits from them, such as Terminal, image viewing and cinematic Historical Worlds;
- keep desktop shortcuts sparse and useful;
- use color to make the OS feel alive without turning every card into an accent block.

Do not:
- restore the old near-black green Field System canvas as the default shell;
- rebuild the old Home page as a stack of mission/world/research/tool cards;
- fill empty desktop space merely because it is available;
- apply archaeological parchment/brass styling to every OS control;
- copy Apple, Microsoft or Ubuntu branding/assets.

## Desktop anatomy

On large desktop screens the canonical composition is:

1. **Top system bar** — AizanoiOS brand, Desktop/Explore/Archive/Apps and compact status controls.
2. **Wallpaper desktop** — original AizanoiOS landscape artwork with a sparse shortcut area.
3. **Session widget** — one small optional resume/explore card; never a page-sized hero.
4. **Freeform windows** — draggable, resizable, minimizable and maximizable.
5. **Dock** — centered, translucent, icon-led and capable of pointer-proximity magnification.
6. **Spotlight-style search** — commands, apps and worlds.
7. **Launchpad-style Applications view** — all apps/worlds in one spacious overlay.

The desktop itself is Home. “Show Desktop” minimizes open windows instead of navigating to a dashboard.

## Palette

Canonical tokens remain in `frontend/styles/tokens.css` under `--az-*`.

Default shell colors are light:

- canvas: cool sky/ice blue;
- surfaces: translucent white and pale blue-grey;
- text: deep navy/slate;
- primary accent: indigo/periwinkle;
- secondary accent: clear blue;
- archaeology accents: brass, teal and terracotta only where semantically useful.

Evidence semantics remain distinct and must not rely on color alone:

- documented — teal + label;
- archaeological — brass + label;
- inferred — terracotta/rust + label;
- atmospheric — neutral + label;
- disputed — warning + dashed/label treatment.

## Typography

- shell/UI: system sans / Inter-class sans;
- reading and long-form notes: serif is allowed and encouraged;
- instrumentation/metadata: system monospace.

Functional text stays at least 11–12 px. Touch targets stay at least 44×44 px where coarse input is expected.

## Window model

`frontend/js/v3/shell.js` remains the only window manager.

Desktop:
- drag and resize;
- minimize;
- maximize/restore;
- close;
- keyboard move/resize through Window menu;
- active window focus/z-order;
- saved browser-local rectangles.

The title bar uses compact traffic-light controls as an interaction cue, while AizanoiOS retains its own app icons and window styling.

Tablet uses a focused large-window workspace. Mobile uses fullscreen-equivalent app frames rather than a miniature desktop.

The URL still represents active app intent; local workspace state owns the wider open-window snapshot.

## Dock

The dock is a primary identity surface.

- centered on desktop;
- translucent light material with blur and soft shadow;
- pinned apps + running non-pinned apps;
- active/open indicators;
- pointer-proximity magnification with restrained maximum scale;
- no magnification on coarse pointers or reduced-motion mode;
- mobile reduces to essential navigation instead of squeezing a desktop dock onto the screen.

## Applications

Application content uses light neutral surfaces by default so the OS remains coherent.

Exceptions are intentional:
- Notes/Source Reader may use warm paper reading surfaces;
- Terminal remains dark;
- Artifact Viewer may use a dark inspection stage;
- Historical Worlds remain cinematic/fullscreen and can use their city-specific visual language.

Do not force every app into the wallpaper aesthetic; the shell should frame tools without overpowering them.

## Dialogs and accessibility

Every canonical overlay/dialog:
- records its opener;
- moves initial focus inside;
- traps Tab;
- makes the background inert;
- closes with Escape;
- restores focus to the opener.

`prefers-reduced-motion` and the local reduce-motion setting remove nonessential transitions/magnification.

## Product boundaries

AizanoiOS remains static-first and browser-local. The redesign does not justify adding accounts, social features, fabricated system telemetry, remote shell execution or a public backend.

Historical evidence rules are unchanged. Generic geometry or visual polish must never upgrade archaeological certainty.

## Quality gate

A shell change is incomplete until applicable checks cover:
- desktop/tablet/mobile layout;
- no horizontal overflow;
- route/window consistency;
- dialog focus/inert/restore;
- 44 px coarse-pointer target floor;
- reduced-motion behavior;
- no new serious/critical accessibility violations;
- no new fatal browser/console errors;
- final rendered screenshot review.
