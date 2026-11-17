# Aizanoi Factory

Standalone route `/arcade/factory/`. Ultra HD 3D architectural free-roam space depicting the glass-gilding factory (`Cam Tezyinat Fabrikası`), a cement ramp without rails, courtyard vehicles, and enterable interior rooms.

- `index.html`: CSP-compatible Turkish UI shell with HUD controls, quality switch, touch dock, live 2D architectural minimap canvas, `[1]`–`[9]` quick-jump bookmarks, and `[H]` help modal.
- `factory.css`: Externalized HUD, crosshair, prompt pill, toast, minimap, bookmark bar, touch dock, and boot overlay styles (no inline style attributes).
- `engine.js`: Vendored Three.js r180 and procedural PBR/post-processing runtime adapted from Aizanoi Wars (`window.AZ_ENGINE`), bundled without source maps; do not edit minified vendor symbols without a full rebuild.
- `vehicles.js`: Courtyard 3D vehicles — black 2005 Honda CR-V, black Porsche 928S, and red Dodge truck with smooth steel cargo bed and ball-tipped front bumper guide poles.
- `factory_interior.js`: Cement ramp from the doorway, 87 pallet climb course up to 5.40 m and the office roof at 3.46 m, stacked trays with tall spacer glasses, Office 2 computer, horizontal gilding lathes, kiln, furnished offices, kitchen and vintage WCs.
- `factory.js`: Perimeter stone walls with three 4.2 m gates, expanded wild grass, lighting atmospheres (`[T]`), Walk/Drone camera (`[V]`), flashlight (`[F]`), quality ladder (`[Q]`), and 2D blueprint minimap.
- `THIRD_PARTY_NOTICES.txt`: Upstream Three.js r180 MIT license notice.

Free-roam exploration only: no combat, backend calls, external fonts, or inline scripts/styles required.
