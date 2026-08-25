# Accessibility release checks

AizanoiOS targets WCAG 2.2 AA behavior for the canonical shell while acknowledging that automated browser checks are not a substitute for assistive-technology testing.

## Automated expectations

CI verifies applicable surfaces for:

- no serious/critical axe-core violations on representative AizanoiOS and product flows;
- useful accessible names on visible icon-only controls;
- visible keyboard focus;
- dialog opener capture, initial focus, Tab containment, background `inert`, Escape close and focus restore;
- desktop route/window lifecycle consistency;
- 44 px minimum height for visible coarse-pointer actions in the tested mobile shell;
- no horizontal overflow at compact mobile widths;
- fullscreen-equivalent mobile app surfaces;
- reduced-motion support;
- no fatal browser/page errors in the tested desktop/tablet/mobile routes;
- Historical World browser/traversal regression.

## Keyboard-only AizanoiOS smoke

1. Open `/` without using a pointer.
2. Tab through Home and confirm focus order follows the visible hierarchy and all current public app destinations remain reachable.
3. Press `Ctrl+K` / `Cmd+K`, type a world or app name, navigate results with arrows and open with Enter.
4. Open an app and use the Window menu to enter keyboard **Move** and **Resize** modes. Arrow keys change position/size, Shift uses larger steps, Enter accepts and Escape cancels.
5. Minimize/maximize/restore/close the app and confirm route intent remains coherent.
6. Open Settings or Applications; Tab must remain inside until the dialog closes.
7. Use browser Back/Forward with multiple apps open and confirm it changes active intent rather than silently destroying unrelated windows.

## Historical Worlds keyboard/input smoke

1. Enter Aizanoi, Rome and Athens from AizanoiOS.
2. Open the shared Explore drawer. Movement keys must not move the player while secondary UI is open.
3. Escape closes the drawer.
4. Use landmark jump/teleport, then move normally; automated traversal checks cover all maintained landmark targets.
5. Use **AizanoiOS** from Explore and confirm the OS offers a resumable local Historical World session.
6. Pointer-lock experiences must retain an Escape path. Any drag-look fallback shown in visitor copy must be verified in a real browser before release.

## Manual NVDA smoke (Windows)

1. Open `/` with NVDA.
2. Confirm the Aizanoi Analytics brand/Home, Search, Settings, Historical Worlds and current public app cards have concise names.
3. Open Applications and the command palette; confirm each is announced as a modal dialog and Tab does not escape behind it.
4. Close each dialog and verify focus returns to the invoking control or a deterministic fallback.
5. Open Aizanoi News and verify edition navigation, headlines, bylines, corrections and source links are announced coherently.
6. Enter a Historical World and confirm persistent AizanoiOS navigation and the Explore drawer do not create a focus trap.
7. Use a landmark selector and confirm the resulting place/evidence information remains discoverable without pointer-only interaction.

## Manual VoiceOver / TalkBack smoke

1. At 390 CSS px or a real phone, confirm Home can be traversed without horizontal scrolling.
2. Verify Home/Search/Applications actions, app icons and app chrome are individually announced.
3. Open News and a second public app surface; confirm fullscreen-equivalent mobile presentation keeps navigation reachable.
4. Enter a Historical World and confirm Explore and AizanoiOS return actions are reachable.
5. Verify touch movement/inspect/map controls have usable targets and accessible names.
6. Rotate portrait/landscape and confirm critical world controls remain usable.

## Zoom, contrast and motion

Before accessibility-sensitive releases:

- test 200% zoom and 320 CSS px reflow;
- test `prefers-reduced-motion: reduce` and the in-product Reduce motion preference;
- inspect forced-colors/high-contrast behavior when available;
- keep functional text at least 11–12 px and reading surfaces around 16 px;
- keep required text pairs at WCAG AA contrast;
- never use color alone for evidence/state;
- check that fixed docks, overlays and Historical World controls do not obscure focused elements.

## Localization readiness

Primary public language is English. Long future localized labels and eventual RTL support should not rely on fixed text widths. Prefer logical CSS properties when new layout code is added. Do not introduce isolated locale-dependent UI strings unless the surrounding surface is intentionally localized.

## Scope note

Passing automated CI is not equivalent to NVDA, VoiceOver or TalkBack certification. Manual AT checks remain explicitly documented rather than being falsely reported as automated.
