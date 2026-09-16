# Blender → Aizanoi Worlds pipeline (hibrit)

Hedef: `frontend/worlds/<id>/` procedural layout korunur; Blender'da pişen
hero asset'ler `frontend/worlds/shared/assets/glb/<id>/` altına Draco-sız
`.glb` olarak düşer, runtime'da `GLTFLoader` (vendored, `shared/vendor/`)
ile lazy-load edilir. Procedural builder düşene kadar fallback olarak kalır.

Klasör:
- `scripts/` — Blender headless üretim scriptleri (`blender --background -P`)
- `exports/` — ara `.blend` + `.glb` çıktıları (repo'ya sadece final `.glb` girer)
- `presets/` — export presetleri (ölçek: 1 birim = 1 m, +Y up, -Z forward)

Kurallar (AGENTS.md):
- Runtime CDN yok; texture gömülü (`.glb` + `COPYING.assets`).
- Lisans: sadece CC0 (Poly Haven) veya kurum içi üretim. Bkz. `ASSET_SOURCES.md`.
- Poly bütçesi (optimize gerçekçi): hero bina ≤ 25k tri, prop ≤ 5k tri,
  2k texture max, mobilde `DeviceProfile low` tier'da GLB yerine procedural fallback.

Kullanım (Blender kurulunca):
  blender --background --python scripts/temple_of_zeus_hero.py -- --out exports/aizanoi-225/temple_of_zeus.glb
