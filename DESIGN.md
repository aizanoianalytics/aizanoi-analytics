# AizanoiOS — Design System

AizanoiOS is the browser-native shell for **Aizanoi**, an independent digital studio for media, data, software, research and interactive worlds.

It is deliberately not a generic dark dashboard and it must not imitate one operating system pixel-for-pixel.

## Core visual direction

The default shell is **bright, spacious and wallpaper-first**.

Do:
- let the wallpaper occupy most of the screen;
- keep permanent system chrome small;
- use translucent light surfaces with readable dark text;
- keep desktop shortcuts sparse;
- use color to make the OS feel alive without turning every card into an accent block;
- let each product family have a little personality inside a coherent shell.

Do not:
- restore the old near-black research dashboard as the default shell;
- rebuild Home as a dense grid of every app;
- put all Workbench tools on the desktop;
- copy Apple, Microsoft or Ubuntu branding/assets;
- force archaeology styling onto News, TV, Analytics or Forge.

## Brand hierarchy

Aizanoi is the umbrella brand. AizanoiOS is the shell.

Permanent desktop/dock priorities:
1. **Aizanoi News**
2. **Aizanoi TV**
3. **Aizanoi Analytics**
4. **Historical Worlds**
5. **Aizanoi Forge**

Secondary public families live in Applications/Search:
- Aizanoi Journal
- Aizanoi Labs
- Aizanoi Arcade
- Aizanoi Workbench

Workbench internals should not visually compete with the public product families.

## Desktop anatomy

On large screens:
1. compact top system bar;
2. wallpaper desktop;
3. sparse public shortcuts;
4. one small contextual widget (Today at Aizanoi or resume a world);
5. freeform windows;
6. centered translucent dock;
7. search/command palette;
8. spacious Applications launcher.

The desktop itself is Home. Show Desktop minimizes open windows instead of navigating to a dashboard.

## Palette

Canonical tokens remain `--az-*`.

Default shell colors are light:
- cool sky/ice canvas;
- translucent white/pale blue-grey surfaces;
- deep navy/slate text;
- indigo/periwinkle primary accent;
- clear blue secondary accent.

Historical evidence colors remain semantic and explicit:
- documented — teal + label;
- archaeological — brass + label;
- inferred — terracotta/rust + label;
- atmospheric — neutral + label;
- disputed — warning + dashed/label treatment.

News/TV/Analytics/Forge should not inherit evidence colors merely for decoration.

## Typography

- shell/UI: system sans / Inter-class sans;
- long-form Journal/Notes: serif is allowed;
- data/instrumentation/metadata: system monospace.

Functional text stays at least 11–12 px. Touch targets stay at least 44×44 px where coarse input is expected.

## Window model

`frontend/js/v3/shell.js` remains the only window manager.

Desktop supports drag, resize, minimize, maximize/restore, close, keyboard move/resize, active focus/z-order and saved local rectangles.

Tablet becomes a focused large-window workspace. Mobile uses fullscreen-equivalent app frames rather than a miniature desktop.

## Dock

The dock is a primary identity surface.

- centered on desktop;
- light translucent material with blur/shadow;
- only the five core apps are permanently pinned;
- running non-pinned apps may appear dynamically;
- pointer-proximity magnification is restrained;
- no magnification on coarse pointers or reduced-motion mode.

## Product surfaces

### News
Readable editorial cards, visible category, date and source links. Avoid faux newspaper clutter.

### TV
Video/series presentation may be cinematic, but companion research/source links remain easy to find.

### Analytics
Data products should prioritize information hierarchy, clarity and usable controls over decorative dashboard density.

### Forge
Project/source cards should make Launch / Source / Documentation / Version states obvious where applicable.

### Historical Worlds
Cinematic/fullscreen and city-specific visual language remains appropriate.

### Labs
Experimental status should be visually explicit.

### Arcade
Playful presentation is allowed inside the app without changing the OS shell into a game UI.

### Workbench
Calm utility surfaces. Notes/Source Reader may use warm paper; Terminal stays dark; Artifact Viewer may use a dark inspection stage.

## Dialogs and accessibility

Every canonical overlay/dialog:
- records its opener;
- moves initial focus inside;
- traps Tab;
- makes background inert;
- closes with Escape;
- restores focus to the opener.

`prefers-reduced-motion` and local reduce-motion settings remove nonessential motion/magnification.

## Quality gate

A shell/product change is incomplete until applicable checks cover:
- desktop/tablet/mobile layout;
- no horizontal overflow;
- route/window consistency;
- launcher/search visibility rules;
- dialog focus/inert/restore;
- 44 px coarse-pointer target floor;
- reduced-motion behavior;
- no serious/critical accessibility regression;
- no fatal browser/console errors;
- final rendered review.
