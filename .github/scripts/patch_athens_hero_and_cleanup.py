from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROME = ROOT / 'frontend/ancient-cities/rome-410-476'
ATHENS = ROOT / 'frontend/ancient-cities/athens-450-430'


def replace_once(path, old, new, label):
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match in {path}, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


# Remove obsolete city-local D-pad/look-pad listeners now that both cities use
# the shared analog controller. This must be identical in both current apps.
legacy_input = """  $$('[data-move]').forEach((button) => {
    const code = button.dataset.move;
    const down = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      keys.add(code);
    };
    const up = (event) => {
      event.preventDefault();
      keys.delete(code);
    };
    lifecycle.listen(button, 'pointerdown', down);
    lifecycle.listen(button, 'pointerup', up);
    lifecycle.listen(button, 'pointercancel', up);
    lifecycle.listen(button, 'lostpointercapture', up);
  });

  const lookPad = $('#lookPad');
  if (lookPad) {
    let pointer = null;
    let lastX = 0;
    let lastY = 0;
    lifecycle.listen(lookPad, 'pointerdown', (event) => {
      event.preventDefault();
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      lookPad.setPointerCapture?.(event.pointerId);
    });
    lifecycle.listen(lookPad, 'pointermove', (event) => {
      if (event.pointerId !== pointer || modalOpen()) return;
      event.preventDefault();
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (Math.hypot(dx, dy) < 1.5) return;
      player.yaw -= dx * 0.0052;
      player.pitch = Math.max(-1.1, Math.min(0.8, player.pitch - dy * 0.0042));
    });
    const stop = (event) => { if (event.pointerId === pointer) pointer = null; };
    lifecycle.listen(lookPad, 'pointerup', stop);
    lifecycle.listen(lookPad, 'pointercancel', stop);
    lifecycle.listen(lookPad, 'lostpointercapture', stop);
  }
"""
for app in [ROME / 'js/app.js', ATHENS / 'js/app.js']:
    replace_once(app, legacy_input, '', f'remove legacy mobile listeners from {app.parent.parent.name}')

# Remove obsolete inline D-pad CSS from both city HTML pages. Shared mobile CSS
# is now the only mobile control presentation source.
legacy_css = ".touchControls{display:none;position:fixed;z-index:8;left:12px;right:12px;bottom:12px;pointer-events:none;align-items:end;justify-content:space-between}.movePad{display:grid;grid-template-columns:46px 46px 46px;grid-template-rows:42px 42px;gap:5px;pointer-events:auto}.movePad button{border:1px solid rgba(235,197,125,.38);background:rgba(22,19,15,.74);color:#f5dfb6;border-radius:9px;font-size:16px;backdrop-filter:blur(9px);touch-action:none;box-shadow:0 5px 18px rgba(0,0,0,.25)}.lookPad{width:42vw;max-width:210px;height:90px;border:1px solid rgba(235,197,125,.26);border-radius:12px;background:linear-gradient(135deg,rgba(24,21,17,.6),rgba(12,11,9,.28));color:#d9c39e;display:grid;place-items:center;text-align:center;font:9px/1.35 system-ui;letter-spacing:.08em;pointer-events:auto;touch-action:none;backdrop-filter:blur(7px)}\n"
for html in [ROME / 'index.html', ATHENS / 'index.html']:
    replace_once(html, legacy_css, '', f'remove legacy D-pad CSS from {html.parent.name}')
    text = html.read_text(encoding='utf-8')
    if '.touchControls{display:flex}' not in text:
        raise SystemExit(f'legacy touch media selector missing in {html}')
    html.write_text(text.replace('.touchControls{display:flex}', ''), encoding='utf-8')

# Athens hero architecture: the generic temple builder is intentionally kept for
# secondary sanctuaries, while the Parthenon and Propylaea get recognizable
# Classical silhouettes comparable to Aizanoi's custom Zeus-temple treatment.
athens_app = ATHENS / 'js/app.js'
hero_code = r'''
function parthenonHero(building, color) {
  const ground = baseY(building);
  const podiumH = Math.max(1.25, building.h * 0.12);
  // Three visible stylobate steps, exaggerated only enough to read at WebGL scale.
  for (let step = 0; step < 3; step++) {
    const inset = step * 0.55;
    box(
      building.x,
      ground + step * (podiumH / 3),
      building.z,
      building.w + 3.2 - inset * 2,
      podiumH / 3 + 0.04,
      building.d + 3.2 - inset * 2,
      step === 2 ? C.marbleLight : C.limestone,
    );
  }

  const stylobate = ground + podiumH;
  const columnH = building.h * 0.56;
  const radius = Math.max(0.38, Math.min(0.62, building.w / 86));
  const frontCount = TOUCH ? 8 : 8;
  const sideCount = TOUCH ? 13 : 17;
  const xMin = building.x - building.w * 0.44;
  const xMax = building.x + building.w * 0.44;
  const zMin = building.z - building.d * 0.44;
  const zMax = building.z + building.d * 0.44;

  for (let i = 0; i < frontCount; i++) {
    const x = xMin + (xMax - xMin) * (i / (frontCount - 1));
    cylinder(x, stylobate, zMin, radius, columnH, C.marbleLight, TOUCH ? 8 : 12);
    cylinder(x, stylobate, zMax, radius, columnH, C.marbleLight, TOUCH ? 8 : 12);
  }
  for (let i = 1; i < sideCount - 1; i++) {
    const z = zMin + (zMax - zMin) * (i / (sideCount - 1));
    cylinder(xMin, stylobate, z, radius, columnH, C.marbleLight, TOUCH ? 8 : 12);
    cylinder(xMax, stylobate, z, radius, columnH, C.marbleLight, TOUCH ? 8 : 12);
  }

  // Cella + pronaos massing. The peristyle remains visually separate.
  box(building.x, stylobate + 0.05, building.z, building.w * 0.52, columnH * 0.88, building.d * 0.50, color);
  const entablatureY = stylobate + columnH;
  box(building.x, entablatureY, building.z, building.w * 0.94, 1.15, building.d * 0.94, C.marble);
  pitchedBuilding(
    building.x,
    entablatureY + 1.10,
    building.z,
    building.w * 0.88,
    Math.max(3.2, building.h * 0.22),
    building.d * 0.84,
    C.marbleLight,
  );
}

function propylaeaHero(building, color) {
  const ground = baseY(building);
  const podium = 0.75;
  box(building.x, ground, building.z, building.w + 2.2, podium, building.d + 2.0, C.limestone);
  const hallY = ground + podium;
  pitchedBuilding(building.x, hallY, building.z, building.w * 0.60, building.h - podium, building.d * 0.74, color);
  const wingW = building.w * 0.19;
  box(building.x - building.w * 0.39, hallY, building.z, wingW, building.h * 0.62, building.d * 0.88, C.marble);
  box(building.x + building.w * 0.39, hallY, building.z, wingW, building.h * 0.62, building.d * 0.88, C.marble);
  const columns = building.id === 'propylaea' ? 6 : 4;
  for (let i = 0; i < columns; i++) {
    const x = building.x - building.w * 0.25 + i * (building.w * 0.50 / Math.max(1, columns - 1));
    cylinder(x, hallY, building.z - building.d * 0.42, 0.48, building.h * 0.52, C.marbleLight, 10);
  }
}
'''.strip()
replace_once(
    athens_app,
    'function ellipticalCylinder(cx, y, cz, rx, rz, height, color, segments = 36) {',
    hero_code + '\n\nfunction ellipticalCylinder(cx, y, cz, rx, rz, height, color, segments = 36) {',
    'insert Athens hero builders',
)
replace_once(
    athens_app,
    "  if (building.type === 'wall') return wall(building);\n  if (building.type === 'gate') return arch(building.x, ground, building.z, building.w, building.h, building.d, color);\n  if (building.id === 'pantheon') pantheon(building, color);\n  else if (building.type === 'temple') temple(building, color);",
    "  if (building.type === 'wall') return wall(building);\n  if (building.type === 'gate') return arch(building.x, ground, building.z, building.w, building.h, building.d, color);\n  if (building.id === 'parthenon') parthenonHero(building, color);\n  else if (building.id === 'propylaea' || building.id === 'propylaea-east') propylaeaHero(building, color);\n  else if (building.id === 'pantheon') pantheon(building, color);\n  else if (building.type === 'temple') temple(building, color);",
    'dispatch Athens hero builders',
)

print('Athens hero + legacy mobile cleanup patch applied')
