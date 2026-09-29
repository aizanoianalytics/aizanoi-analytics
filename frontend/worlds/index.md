# Aizanoi World — repository router

Scope: the canonical public home of the Aizanoi interactive world.

Aizanoi is **not** one entry in a multi-world catalog. It is the primary
interactive world of Aizanoi Analytics, and the only one.

## What lives here

- `aizanoi-225/` — the Aizanoi runtime itself. Owns the scene, its data, its
  procedural builders, its evidence records and its assets.
- `shared/` — the Three.js/runtime infrastructure the Aizanoi world still
  requires: controls, collision, UI, environment, water, vegetation, particles,
  audio, common procedural assets and the locally vendored Three.js r174 stack.

## Public routes

- `/worlds/` — the Aizanoi product landing page.
- `/worlds/aizanoi-225/` — the WebGL scene. This is the canonical scene source
  of truth; the AizanoiOS app module under `js/v3/apps/aizanoi/` only opens it
  and must not duplicate it.

`/historic-world/`, `/ancient-cities/*` and `/iga/` are compatibility redirects
only. Do not add runtime code there.

## Evidence and source ownership

Every structure carries an evidence classification — documented, archaeological
or inferred. Those distinctions are owned by the Aizanoi scene/evidence data and
must stay distinguishable. **Never upgrade an inferred element to documented
because it renders well.** See `CONTENT_POLICY.md` at the repository root for the
broader sourcing rules.

## Runtime contract

The world is a static ES module bundle over the shared runtime. There is no
runtime CDN, no build step, no account or backend requirement and no external
model dependency. Do not add `.gltf`/`.glb` files or a second Three.js copy
without an explicit architecture decision.

Studio-authored low-poly `.glb` kits are an accepted, explicit architecture
decision: they are produced by in-repo Blender headless scripts, live under the
world's own `assets/` folder, and are loaded exclusively through
`shared/engine/asset-kit.js` over the single vendored Three.js r174 +
`shared/vendor/GLTFLoader.js` stack.

## Where to go next

- Scene, monument, layout or evidence work → `aizanoi-225/js/`
- Engine, controls, collision, framing or asset-kit work → `shared/engine/`
- AizanoiOS launcher behavior → `../js/v3/apps/aizanoi/index.md`
- Aizanoi architecture and security policy → `../../ARCHITECTURE.md`, `../../SECURITY.md`
- Validation and QA ownership → `../../../tests/index.md`
- Content/sourcing policy → `../../CONTENT_POLICY.md`
