# Aizanoi Factory

Standalone route `/arcade/factory/`. Ultra HD 3D glass-gilding factory (`Aizanoi Glass Gilding Factory`) with two playable modes: **Free Tour** architectural exploration and **Battle Mode** powered by Aizanoi Wars combat dynamics.

- `index.html`: CSP-compatible English UI shell with Mode Selection overlay (`Free Tour` / `Battle Mode`), HUD controls, Combat HUD (wave, hostiles, kills, health, PAC-9 ammo/reserve, hitmarker, damage flash), quality switch, touch dock, live 2D architectural/tactical minimap canvas, `[1]`–`[9]` quick-jump bookmarks, and `[H]` help modal.
- `factory.css`: Externalized HUD, mode selection modal, combat HUD, crosshair, hitmarker, prompt pill, toast, minimap, bookmark bar, touch dock, and boot overlay styles (no inline style attributes).
- `engine.js`: Vendored Three.js r180 and procedural PBR/post-processing + combat runtime adapted from Aizanoi Wars (`window.AZ_ENGINE`, including `createCombat`, `createWeapon`, and `createEnemies`), bundled without source maps; do not edit minified vendor symbols without a full rebuild.
- `vehicles.js`: Courtyard 3D vehicles — black 2005 Honda CR-V, black Porsche 928S, and red Dodge truck with smooth steel cargo bed and ball-tipped front bumper guide poles.
- `factory_interior.js`: Cement ramp from the doorway, 87 pallet climb course up to 5.40 m and the office roof at 3.46 m, stacked trays with tall spacer glasses, Office 2 computer, horizontal gilding lathes, kiln, furnished offices, kitchen, and vintage WCs (all signage and interactions in English).
- `factory.js`: Perimeter stone walls with three 4.2 m gates, expanded wild grass, lighting atmospheres (`[T]`), Walk/Drone camera (`[V]`), flashlight (`[F]`), quality ladder (`[Q]`), 2D blueprint minimap with live enemy radar, Mode Switcher (`[G]`), tactical resupply crates, and escalating Gull & Hound combat waves.
- `THIRD_PARTY_NOTICES.txt`: Upstream Three.js r180 MIT license notice.

Self-contained static client experience: no backend calls, external fonts, or inline scripts/styles required.
