# Accessibility release checks

Field System v3 targets WCAG 2.2 AA behavior for its canonical shell while acknowledging that automated browser checks are not a substitute for assistive-technology testing.

## Automated expectations

CI verifies applicable surfaces for:

- no serious/critical axe-core violations on the v3 Home and Archive flow;
- useful accessible names on visible icon-only controls;
- visible keyboard focus;
- dialog opener capture, initial focus, Tab containment, background `inert`, Escape close and focus restore;
- desktop route/window lifecycle consistency;
- 44 px minimum height for visible coarse-pointer actions in the tested mobile shell;
- no horizontal overflow at 390 CSS px;
- fullscreen-equivalent mobile app surfaces;
- reduced-motion support;
- no fatal browser/page errors in the tested desktop/tablet/mobile routes;
- Historical World browser/traversal regression.

## Keyboard-only shell smoke

1. Open `/` without using a pointer.
2. Tab through Home and confirm focus order follows the visual hierarchy: mission, worlds, research apps, tools.
3. Press `Ctrl+K` / `Cmd+K`, type a world or app name, navigate results with arrows and open with Enter.
4. Open an app and use the Window menu to enter keyboard **Move** and **Resize** modes. Arrow keys change position/size, Shift uses larger steps, Enter accepts and Escape cancels.
5. Minimize/maximize/restore/close the app and confirm route intent remains coherent.
6. Open Settings or Open Apps; Tab must remain inside until the dialog closes.
7. Use browser Back/Forward with multiple apps open and confirm it changes active intent rather than silently destroying unrelated windows.

## Historical Worlds keyboard/input smoke

1. Enter each Historical World from Home.
2. Open the shared Explore drawer. Movement keys must not move the player while secondary UI is open.
3. Escape closes the drawer.
4. Use landmark jump/teleport, then move normally; the traversal suite also checks the current 51 landmark targets automatically.
5. Use **Field System** from Explore and confirm the OS offers a resumable local field session.
6. Pointer-lock experiences must retain an Escape path and drag-look fallback where supported.

## Manual NVDA smoke (Windows)

1. Open `/` with NVDA.
2. Confirm the Aizanoi brand/Home, Search, Settings, three Historical World cards and app cards have concise names.
3. Open Field Archive. Confirm collection navigation, search, record cards and Import/New Note actions are announced sensibly.
4. Open the command palette and confirm it is announced as a modal dialog; Tab does not escape behind it.
5. Close the dialog and verify focus returns to the invoking control.
6. Open Field Notes and confirm title/content inputs are separately named.
7. Enter a Historical World and confirm persistent navigation does not create a focus trap.

## Manual VoiceOver / TalkBack smoke

1. At 390 CSS px or a real phone, confirm Home can be traversed without horizontal scrolling.
2. Verify Home/Search/Open shelf actions and app chrome are individually announced.
3. Open Archive and horizontally navigate the collection rail; the current collection and record cards should remain discoverable.
4. Open Notes, focus the editor and confirm the software keyboard does not make active controls unreachable.
5. Enter a Historical World and confirm the Explore and Field System return actions are reachable.
6. Rotate portrait/landscape and confirm critical world controls remain usable.

## Zoom, contrast and motion

Before accessibility-sensitive releases:

- test 200% zoom and 320 CSS px reflow;
- test `prefers-reduced-motion: reduce`;
- inspect forced-colors/high-contrast behavior when available;
- keep functional text at least 11–12 px and reading surfaces around 16 px;
- keep required text pairs at WCAG AA contrast;
- never use color alone for evidence/state.

## Localization readiness

Long Turkish/German labels and eventual RTL support should not rely on fixed text widths. Prefer logical CSS properties when new layout code is added.

## Scope note

Passing automated CI is not equivalent to NVDA, VoiceOver or TalkBack certification. Manual AT checks remain explicitly documented rather than being falsely reported as automated.