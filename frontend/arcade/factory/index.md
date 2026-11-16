# Aizanoi Factory

Standalone route `/arcade/factory/`. Ultra HD 3D architectural free-roam space depicting the glass-gilding factory (`Cam Tezyinat Fabrikası`), loading ramp, courtyard vehicles, and enterable interior rooms (offices, kitchen, gilding benches, kiln, and WCs).

- `index.html`: CSP-compatible Turkish UI shell with HUD controls, live 2D architectural minimap canvas, `[1]`–`[9]` quick-jump bookmarks, and `[H]` help modal.
- `factory.css`: Externalized HUD, crosshair, prompt pill, toast, minimap, bookmark bar, and boot overlay styles (no inline style attributes).
- `engine.js`: Vendored Three.js r180 and procedural PBR/post-processing runtime adapted from Aizanoi Wars (`window.AZ_ENGINE`), bundled without source maps; do not edit minified vendor symbols without a full rebuild.
- `vehicles.js`: Courtyard 3D vehicles — black 2005 Honda CR-V, black Porsche 928S, and red Dodge truck with smooth steel cargo bed and ball-tipped front bumper guide poles.
- `factory_interior.js`: Steep solid loading ramp starting directly at the factory doorway, enterable hinged/sliding doors, two large `Paketleme Masası` stations, fifteen loaded pallets, horizontal side-spinning glass-gilding lathes, `Cam Tezyinat Fırını`, furnished `Ofis 1`, `Ofis 2`, `Mutfak`, top-slab clutter (`Y = 3.46 m`, no stairs), and vintage WCs.
- `factory.js`: Perimeter stone walls, natural dirt yard and foliage, compact 4-post open garage, lighting atmospheres (`[T]`), Walk/Drone camera toggle (`[V]`), flashlight (`[F]`), and 2D blueprint minimap renderer.
- `THIRD_PARTY_NOTICES.txt`: Upstream Three.js r180 MIT license notice.

Free-roam exploration only: no combat, backend calls, external fonts, or inline scripts/styles required.
