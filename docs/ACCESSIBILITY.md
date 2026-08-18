# Accessibility release checks

Automated tests cover semantics and keyboard-critical behavior, but assistive technology still requires a human smoke test before accessibility-sensitive releases.

## Automated expectations

- Desktop icons, task items, Start-menu items, context menus and windows expose roles/labels.
- Focus is visible for keyboard users.
- Start menu supports Arrow Up/Down, Home and End.
- Desktop icons can be opened by keyboard and navigated without a mouse.
- Chat log is a live region and composer supports Enter/Shift+Enter without accidental IME submission.
- Dynamic notifications/context menus receive semantics after insertion.
- Reduced-motion preference disables non-essential animation.
- Mobile windows respect safe-area insets and dynamic viewport height.
- Browser smoke must report no page errors on tested desktop/mobile routes.

## Manual NVDA smoke (Windows)

1. Open `/` with NVDA running.
2. Tab to Start and confirm the control is announced with a useful name/state.
3. Navigate the Start menu by keyboard; open Aizanoi AI.
4. Confirm the window title/dialog relationship is announced.
5. Move to the chat composer, enter a multiline prompt, submit it and verify the reply is announced without repeatedly reading the whole log.
6. Open/close a context menu and verify focus is recoverable.
7. Open Ancient World, return with the persistent `← Aizanoi OS` control and confirm focus returns to a usable document location.

## Manual VoiceOver smoke (iOS/macOS)

1. Open the site with VoiceOver and verify desktop/application labels are concise.
2. Open Aizanoi AI and confirm composer/send/copy/clear/retry controls are separately reachable.
3. On iOS, focus the composer and ensure the software keyboard does not cover the active input/send area.
4. Open Ancient World and verify HUD controls do not create an unusable focus loop.
5. Confirm the Back to Aizanoi OS control remains reachable after fullscreen/pointer interaction where supported.

## Contrast / motion

- Recheck titlebar text, selected desktop icon labels, disabled menu items, chat bubbles and Ancient World HUD text whenever palette/backgrounds change.
- Test `prefers-reduced-motion: reduce` after adding animation.
- Do not use color alone to communicate error, selected or evidence state.

## Scope note

Passing automated CI is not equivalent to NVDA/VoiceOver certification. These manual checks are deliberately documented rather than falsely marked as automated.
