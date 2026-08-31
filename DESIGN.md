# AizanoiOS — Design System

AizanoiOS is the browser-native shell for **Aizanoi Analytics**, the umbrella company and public brand for media, data, software, research and interactive worlds in this repository.

`Aizanoi` may appear as a short-form product identity, but the company/umbrella name is Aizanoi Analytics.

It is deliberately not a generic dark dashboard and it must not imitate any operating system pixel-for-pixel.

## Core visual direction

The shell is **bright, spacious, wallpaper-first and device-aware**.

Do:
- let wallpaper and depth create atmosphere instead of dense chrome;
- use translucent light surfaces with readable dark text;
- keep icons simple, recognizable and consistent;
- make touch targets at least 44×44 px where coarse input is expected;
- let each product family have personality inside one coherent Aizanoi Analytics identity;
- adapt composition when the form factor changes.

Do not:
- restore the old near-black research dashboard;
- expose retired Workbench/power tools;
- shrink the desktop layout until it “fits” a phone;
- copy Apple, Google, Microsoft or Ubuntu branding/assets;
- fabricate phone status indicators, weather, battery, Wi-Fi or system telemetry.

## Brand hierarchy

**Aizanoi Analytics** is the umbrella/company brand. **AizanoiOS** is the shell.

Core public destinations:
1. **Aizanoi News**
2. **Aizanoi TV**
3. **Analytics**
4. **Historical Worlds**
5. **Aizanoi Forge**

Secondary public families:
- Aizanoi Journal
- Aizanoi Labs
- Aizanoi Arcade

Analytics uses `/analytics/` as its stable public route and `analytics` as its internal app id. Dashboards are one interface format within Analytics.

## Desktop — large screens

On `>=1200px`:
1. compact top system bar;
2. wallpaper desktop;
3. seven focused shortcuts — the five core destinations plus Arcade and Recycle Bin;
4. one small contextual widget;
5. freeform windows;
6. centered translucent dock;
7. Search and Applications launcher.

The desktop itself is Home. Show Desktop minimizes open windows instead of navigating to a dashboard.

## Tablet — medium and expanded screens

Tablet is a **touch-first workspace**, not a scaled desktop.

On `600–1199px`:
- use a two-pane home;
- reserve one pane for Aizanoi Analytics identity, date and one useful contextual card;
- use the main pane for a large touch-friendly app grid and two small feature/supporting cards;
- keep the bottom dock compact and centered;
- open apps in focused, large rounded windows rather than freeform desktop rectangles;
- let the number of grid columns adapt between narrower and wider tablets.

## Mobile — compact screens

Mobile is a **phone-like AizanoiOS home screen**.

On `<600px`:
- show a clear Aizanoi Analytics header and real local date;
- provide two small glanceable widgets with direct actions;
- expose every public app in a four-column icon grid when space allows;
- keep a compact bottom dock for Home + the most important destinations + Applications;
- hide nonessential running-app clutter from the dock;
- use fullscreen-equivalent app surfaces;
- collapse the Applications launcher into a bottom-sheet/app-drawer style surface;
- keep Search easy to reach from the home screen.

## App icons

- Keep primary symbols centered and simple.
- Use one consistent rounded-square container language across phone and tablet.
- Use canonical product asset names rather than retired Workbench names.
- Avoid text inside the icon itself when the label already appears below.
- Avoid tiny illustrative detail that becomes unreadable at mobile sizes.
- Maintain consistent optical weight even when source SVGs differ.

## Widgets

Widgets must be glanceable and useful:
- one concept per card;
- short copy;
- one obvious action;
- no fake dynamic data;
- no dashboard density.

Useful initial widget subjects are News and a Historical World resume/explore action.

## Dock

Desktop:
- five core pinned apps;
- restrained pointer-proximity magnification;
- running non-pinned apps may appear.

Tablet:
- same core identity, slightly reduced touch-friendly dock;
- no pointer-only magnification requirement.

Mobile:
- Home + News + TV + Analytics + Worlds + Applications;
- Forge remains available in the app grid/launcher but is not forced into the compact dock;
- running non-pinned apps do not expand the dock.

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
- long-form Journal: serif is allowed;
- data/instrumentation/metadata: system monospace.

Functional text stays at least 11–12 px. Touch targets stay at least 44×44 px where coarse input is expected.

## Window model

`frontend/js/v3/shell.js` remains the only window manager.

Desktop supports drag, resize, minimize, maximize/restore, close, keyboard move/resize, active focus/z-order and saved local rectangles.

Tablet uses focused large rounded windows. Mobile uses fullscreen-equivalent app frames. Device-specific presentation must not fork routing or app state.

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
- desktop, tablet and mobile as distinct presentations;
- 320–430 px mobile widths and common tablet widths;
- portrait/landscape-friendly responsive behavior;
- no horizontal overflow;
- route/window consistency;
- launcher/search visibility rules;
- dialog focus/inert/restore;
- 44 px coarse-pointer target floor;
- reduced-motion behavior;
- no serious/critical accessibility regression;
- no fatal browser/console errors;
- final rendered review.