# Browser Module

Purpose: a sandboxed AizanoiOS web browser surface with an address/search bar, simple navigation history and an explicit external-browser fallback.

## Public entry

- Runtime entry → `src/index.js`
- Manifest → `manifest.json`

Everything else under `src/` and `assets/` is private to this module.

## Required capabilities

None. Browser is a zero-capability module and does not receive filesystem, media, dialog or private shell implementations.

## Security boundary

- Only HTTPS destinations are embedded; plain HTTP input is upgraded to HTTPS.
- Non-URL text becomes a Google search URL.
- The remote page runs inside a sandboxed `iframe`.
- The app never proxies remote content through Aizanoi Analytics and never receives credentials or server-side secrets.
- Some websites deliberately deny iframe embedding with their own `X-Frame-Options` or `frame-ancestors` policy. The **Open external** action is the supported fallback for those sites.
- The root static CSP must permit sandboxed HTTPS frames for this module; this does not bypass a destination site's own embedding policy.

## Owned assets

- `assets/browser.css` — module-local Browser UI styles.
- `/assets/icons/browser.svg` — public launcher icon referenced by the canonical registry.

## Lifecycle

Cleanup removes Browser-owned listeners, clears the iframe and releases the module stylesheet reference.

## Navigation behavior

Back and Forward cover destinations explicitly entered through the Browser address bar. Cross-origin iframe pages cannot expose their internal link history to the parent shell because of the browser same-origin policy.

## Tests

Architecture, registry, sandbox and URL-normalization contracts are covered by `../../../../../tests/aizanoi-os-browser-module.test.mjs`. Security-header coverage remains in `../../../../../tests/security-hardening.test.mjs`.
