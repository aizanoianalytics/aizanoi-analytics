## Summary

<!-- What changed and why? Keep this concise. -->

## Scope

Affected areas:

- [ ] AizanoiOS shell (window/dock/dialog/lifecycle)
- [ ] AizanoiOS device layer (desktop / tablet / mobile)
- [ ] AizanoiOS module (manifest/capability boundary, lifecycle/unplug)
- [ ] News (article / archive / sitemap / generated wiring)
- [ ] TV (legacy `/tv/` route surface)
- [ ] Journal (legacy `/journal/` route surface)
- [ ] Analytics — landing + catalog
- [ ] Analytics — HR Analytics Full Set (10 dashboards)
- [ ] Analytics — New HR Collection (PACS, Recruitment)
- [ ] Forge (legacy `/forge/` route surface)
- [ ] Labs
- [ ] Arcade
- [ ] Historical Worlds — index + Aizanoi
- [ ] Historical Worlds — Rome / Athens
- [ ] Shared Ancient World engine
- [ ] Browser-local utilities (Workspace, Notepad, Calculator, Camera, Winamp, Recycle Bin, Web Editor)
- [ ] Browser / iframe sandbox
- [ ] Security / runtime headers
- [ ] CI / deployment
- [ ] Documentation only
- [ ] N/A

## Historical evidence impact

<!-- If this changes a reconstruction, city data or historical claim: what sources/assumptions support it? Is anything inferred/procedural? Write N/A when not applicable. Compatibility items below remain deliberately. -->

## Compatibility contract awareness

- [ ] `AIZANOI_FIELD_SYSTEM` alias preserved
- [ ] `aizanoi-field-system-v3` legacy state dual-write preserved
- [ ] legacy world-session migration keys preserved
- [ ] `docs/FIELD_SYSTEM.md` filename preserved
- [ ] N/A — out of scope for this change

## Security / runtime impact

- [ ] Public runtime remains static-first / browser-local
- [ ] No new visitor-facing backend/API
- [ ] No new outbound network calls from browser code
- [ ] No local workspace data is silently sent externally
- [ ] No secrets / production-private files are included
- [ ] Module boundaries (requires / provides / capabilities) preserved
- [ ] Capability provider ambiguity avoided (no two modules exporting the same capability id)
- [ ] N/A — documentation-only change

Explain any intentionally changed security/runtime boundary:

## Cross-device check

- [ ] Desktop ≥ 1200px checked
- [ ] Tablet 600–1199px checked
- [ ] Mobile 320–430px checked
- [ ] Landscape compact checked
- [ ] No horizontal overflow
- [ ] 44px coarse-pointer targets respected
- [ ] Reduced-motion respected
- [ ] Keyboard / focus behaviour considered
- [ ] N/A — no interactive UI change

## Module lifecycle / unplug (when a module changed)

- [ ] Module owns its assets / storage; no shared mutable state outside the capability boundary
- [ ] Capability declared in `requires` / `provides` matches actual use
- [ ] Close path removes listeners, timers, media streams, object URLs and async continuations
- [ ] Reopen after close is deterministic (no leaked handles)
- [ ] Module is exercised by the unplug simulation (`tests/aizanoi-os-module-shape.test.mjs` or similar)
- [ ] N/A — no module changed

## Tests

- [ ] `node scripts/modules/build-module-registry.mjs --check`
- [ ] `node --test tests/aizanoi-os-module-discovery.test.mjs tests/aizanoi-os-module-boundaries.test.mjs tests/aizanoi-os-module-shape.test.mjs tests/aizanoi-os-capabilities.test.mjs`
- [ ] `node --test tests/*.test.mjs`
- [ ] `git diff --check`
- [ ] Relevant browser smoke tests
- [ ] Manual Firefox + WebKit critical smoke (for cross-browser visual surface)
- [ ] Visual review / screenshots for presentation changes
- [ ] Historical-world movement / landmark checks where relevant
- [ ] N/A — documentation-only change

## Visuals

<!-- Add screenshots / video when the UI, historical world or visual reconstruction changed. -->

## Notes for review

<!-- Anything fragile, deferred or intentionally out of scope? -->
