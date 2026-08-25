# Audit hardening — 2026-08-25

This engineering batch addresses confirmed findings from the August 25 multi-model audit without expanding Dashboards, TV, Journal, Labs or Arcade product content.

## Included

- Windows-portable ESM imports in Historical World tests.
- Removal of visitor-facing retired `Field System` branding while preserving internal compatibility keys/ids where migration risk outweighs cosmetic value.
- Aizanoi News v2 compiler: permanent article pages, editorial priority, optional image provenance, public methodology/AI-assistance disclosure, dedicated News sitemap, permanent RSS links and expanded structured data.
- News CI now rebuilds generated output before regression/browser/Lighthouse gates.
- Rome inferred/schematic massing is explicitly `plausible` in the live wrapper.
- Historical World presentation hides dormant legacy Aizanoi controls instead of advertising behavior the shared runtime does not own; AD 301 remains source context rather than a false visual layer.
- Service-worker upgrades no longer force a waiting worker over already-open AizanoiOS clients.
- Contrast, touch-target and reduced-motion polish in canonical style owners.
- Current accessibility, architecture, News policy and Hermes operations documentation aligned to the implemented contracts.

## Deliberately not included

- No new Dashboards product.
- No TV, Journal, Labs or Arcade content expansion.
- No framework rewrite, backend, account system or compatibility-key rename.
- The unused Historical World shader/environment modules and adaptive-quality controller are not force-enabled in this batch; they change rendered WebGL output and should be integrated only in a focused visual/performance change that can be judged against browser captures rather than by static audit alone.
