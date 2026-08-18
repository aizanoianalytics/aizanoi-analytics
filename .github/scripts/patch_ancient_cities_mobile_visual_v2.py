from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: Path, old: str, new: str, label: str):
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match in {path}, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_all_checked(path: Path, old: str, new: str, minimum: int, label: str):
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f'{label}: expected at least {minimum} matches in {path}, found {count}')
    path.write_text(text.replace(old, new), encoding='utf-8')


BRANCH_FILES = {
    'rome': ROOT / 'frontend/ancient-cities/rome-410-476',
    'athens': ROOT / 'frontend/ancient-cities/athens-450-430',
}

# ---------------------------------------------------------------------------
# HTML: shared styles, city identity and Aizanoi-style mobile controls.
# ---------------------------------------------------------------------------
for city, base in BRANCH_FILES.items():
    html = base / 'index.html'
    title = 'ROME · AD 410–476 — Aizanoi Analytics' if city == 'rome' else 'ATHENS · 450–430 BCE — Aizanoi Analytics'
    replace_once(
        html,
        f'<title>{title}</title>',
        f'<title>{title}</title>\n<link rel="stylesheet" href="../../ancient-world/engine/mobile-controls.css">\n<link rel="stylesheet" href="../../ancient-world/engine/city-polish.css">',
        f'{city} shared css links',
    )
    replace_once(html, '<body>', f'<body data-city="{city}">', f'{city} body identity')

    old_mobile = '<div class="touchControls" id="touchControls" aria-label="Mobile exploration controls"><div class="movePad"><span></span><button data-move="KeyW" aria-label="Walk forward">▲</button><span></span><button data-move="KeyA" aria-label="Strafe left">◀</button><button data-move="KeyS" aria-label="Walk backward">▼</button><button data-move="KeyD" aria-label="Strafe right">▶</button></div><div class="lookPad" id="lookPad">DRAG TO LOOK<br><span style="opacity:.65">tap scene to explore</span></div></div>'
    city_label = 'ROME · TOUCH' if city == 'rome' else 'ATHENS · TOUCH'
    new_mobile = (
        '<div id="mobileControls" hidden aria-label="Mobile exploration controls">'
        f'<div id="mobileCompass">{city_label}</div>'
        '<div id="movePad" aria-label="Movement joystick"><div id="moveKnob"></div></div>'
        '<div id="lookHint">DRAG RIGHT SIDE · LOOK</div>'
        '<div class="mobileActionRail">'
        '<button id="mobileRun" class="mobileAction" aria-label="Hold to run">RUN</button>'
        '<button id="mobileInspect" class="mobileAction" aria-label="Inspect nearest landmark">INSPECT</button>'
        '<button id="mobileMap" class="mobileAction" aria-label="Open city atlas">MAP</button>'
        '</div></div>'
    )
    replace_once(html, old_mobile, new_mobile, f'{city} mobile control DOM')

# Athens copy cleanup in visible HTML.
athens_html = BRANCH_FILES['athens'] / 'index.html'
replace_once(
    athens_html,
    "<p>This is a source-led city model: named monuments, roads and churches are placed from archaeological/topographical evidence; unresolved residential massing is deliberately schematic. It portrays a living but damaged Rome between the Thirty Years' Peace and the Plague of Athens—not a pristine imperial postcard.</p>",
    "<p>This source-led reconstruction presents Classical Athens during the Periclean building programme. Named monuments and major routes are grounded in archaeological, topographical and historical evidence; unresolved residential fabric is deliberately shown as plausible reconstruction rather than measured fact.</p>",
    'Athens intro copy',
)

# ---------------------------------------------------------------------------
# JS: shared analog controls, Aizanoi-like walking feel and city-specific polish.
# ---------------------------------------------------------------------------
for city, base in BRANCH_FILES.items():
    app = base / 'js/app.js'
    replace_once(
        app,
        "import { createAdaptiveQualityController } from '../../../ancient-world/engine/performance.js';",
        "import { createAdaptiveQualityController } from '../../../ancient-world/engine/performance.js';\nimport { installMobileControls } from '../../../ancient-world/engine/mobile-controls.js';",
        f'{city} mobile import',
    )
    replace_once(
        app,
        "let moveBlend = 0;\nlet walkClock = 0;",
        "let moveBlend = 0;\nlet walkClock = 0;\nlet mobileControls = null;",
        f'{city} mobile state',
    )
    replace_once(
        app,
        "  const eye = [player.x, player.y, player.z];\n  return lookAt(eye, [eye[0] + forward[0], eye[1] + forward[1], eye[2] + forward[2]], [0, 1, 0]);",
        "  const stable = Math.max(0.2, Math.min(1, 1 - Math.abs((player.floorY + EYE_HEIGHT) - player.y) * 3.2));\n  const bob = Math.sin(walkClock * 2) * 0.017 * moveBlend * stable;\n  const sway = Math.sin(walkClock) * 0.008 * moveBlend * stable;\n  const cy = Math.cos(player.yaw);\n  const sy = Math.sin(player.yaw);\n  const eye = [player.x + cy * sway, player.y + bob, player.z + sy * sway];\n  return lookAt(eye, [eye[0] + forward[0], eye[1] + forward[1], eye[2] + forward[2]], [0, 1, 0]);",
        f'{city} walking camera polish',
    )
    replace_once(
        app,
        "function clearMovementState() {\n  keys.clear();\n  last = performance.now();\n}",
        "function clearMovementState() {\n  keys.clear();\n  mobileControls?.reset();\n  last = performance.now();\n}",
        f'{city} movement reset',
    )
    replace_once(
        app,
        "  let forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);\n  let right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);\n  const moving = Boolean(forward || right);",
        "  let forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);\n  let right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);\n  const mobile = mobileControls?.snapshot() || { moveX: 0, moveY: 0, running: false };\n  if (TOUCH) {\n    forward += -mobile.moveY;\n    right += mobile.moveX;\n  }\n  const moving = Boolean(forward || right);",
        f'{city} analog movement vector',
    )
    replace_once(
        app,
        "    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? player.sprint : player.speed;",
        "    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight') || mobile.running;\n    const speed = sprinting ? player.sprint : player.speed;",
        f'{city} mobile run',
    )
    replace_once(
        app,
        "    walkClock += dt * (speed > player.speed ? 9.0 : 6.0);",
        "    walkClock += dt * (sprinting ? 9.5 : 6.2);",
        f'{city} walk cadence',
    )
    replace_once(
        app,
        "installEvidenceStyles();\ninstallInput();\ninstallBackToOS({ onBeforeExit: () => lifecycle.destroy() });",
        "installEvidenceStyles();\ninstallInput();\nmobileControls = installMobileControls({\n  canvas,\n  lifecycle,\n  enabled: TOUCH,\n  isActive: () => gameStarted,\n  isBlocked: modalOpen,\n  onLook: (dx, dy) => {\n    player.yaw += dx;\n    player.pitch = Math.max(-1.15, Math.min(0.85, player.pitch - dy));\n  },\n  onInspect: nearestInfo,\n  onMap: openAtlas,\n});\ninstallBackToOS({ onBeforeExit: () => lifecycle.destroy() });",
        f'{city} shared mobile install',
    )

# City-specific lighting / field-of-view gives each place a distinct atmosphere.
rome_app = BRANCH_FILES['rome'] / 'js/app.js'
replace_once(
    rome_app,
    "  const fog = modernOverlay ? [0.48, 0.60, 0.64] : [0.57, 0.53, 0.45];\n  gl.clearColor(fog[0] * 0.82, fog[1] * 0.88, fog[2] * 0.92, 1);",
    "  const fog = modernOverlay ? [0.48, 0.60, 0.64] : [0.55, 0.49, 0.41];\n  gl.clearColor(fog[0] * 0.82, fog[1] * 0.86, fog[2] * 0.90, 1);",
    'Rome atmosphere',
)
replace_once(rome_app, "perspective(62 * Math.PI / 180,", "perspective((TOUCH ? 70 : 67) * Math.PI / 180,", 'Rome FOV')
replace_once(rome_app, "new Float32Array([0.42, 0.82, 0.28])", "new Float32Array([0.50, 0.84, 0.27])", 'Rome sun')
replace_once(rome_app, "gl.uniform1f(locations.uAmbient, 0.42);", "gl.uniform1f(locations.uAmbient, 0.47);", 'Rome ambient')
replace_once(rome_app, "TOUCH ? 0.00078 : 0.00062", "TOUCH ? 0.00072 : 0.00056", 'Rome fog density')

athens_app = BRANCH_FILES['athens'] / 'js/app.js'
replace_once(
    athens_app,
    "  const fog = modernOverlay ? [0.48, 0.60, 0.64] : [0.57, 0.53, 0.45];\n  gl.clearColor(fog[0] * 0.82, fog[1] * 0.88, fog[2] * 0.92, 1);",
    "  const fog = modernOverlay ? [0.48, 0.60, 0.64] : [0.69, 0.67, 0.57];\n  gl.clearColor(fog[0] * 0.91, fog[1] * 0.94, fog[2] * 0.98, 1);",
    'Athens atmosphere',
)
replace_once(athens_app, "perspective(62 * Math.PI / 180,", "perspective((TOUCH ? 72 : 69) * Math.PI / 180,", 'Athens FOV')
replace_once(athens_app, "new Float32Array([0.42, 0.82, 0.28])", "new Float32Array([0.36, 0.92, 0.24])", 'Athens sun')
replace_once(athens_app, "gl.uniform1f(locations.uAmbient, 0.42);", "gl.uniform1f(locations.uAmbient, 0.52);", 'Athens ambient')
replace_once(athens_app, "TOUCH ? 0.00078 : 0.00062", "TOUCH ? 0.00066 : 0.00050", 'Athens fog density')

# Athens-specific terminology cleanup in renderer/UI.
replacements = [
    ("MODERN ALIGNMENT OVERLAY · schematic relation to present Rome", "MODERN ALIGNMENT OVERLAY · schematic relation to present-day Athens"),
    ("${best.region === 'all' ? 'city circuit' : `Regio ${best.region}`}", "${best.region === 'all' ? 'city circuit' : `District · ${best.region}`}"),
    ("Walk the late-antique city", "Walk Classical Athens"),
    ("setModal('Regional atlas · 14 Augustan regiones'", "setModal('District atlas · Classical Athens'"),
    ("{ label: `Regio ${region.id} · ${region.name}` }", "{ label: region.name }"),
    ("${building.region === 'all' ? 'city circuit' : `Regio ${building.region}`}", "${building.region === 'all' ? 'city circuit' : `District · ${building.region}`}"),
    ("where fifth-century elevation evidence is incomplete", "where Classical-period elevation evidence is incomplete"),
]
for old, new in replacements:
    replace_all_checked(athens_app, old, new, 1, f'Athens copy cleanup: {old[:28]}')

# Remove the dormant Rome/Tiber dependency from Athens' generic island branch.
old_island = "  else if (building.type === 'island') {\n    const islandY = Math.max(TIBER.waterY + 0.75, ground);\n    box(building.x, TIBER.waterY - 0.2, building.z, building.w, islandY - TIBER.waterY + 0.2, building.d, C.grass);\n    walkSurfaces.push(walkRect(building.x, building.z, building.w - 2, building.d - 2, islandY, 0, `${building.id} surface`, false));\n  }"
new_island = "  else if (building.type === 'island') {\n    const islandY = ground + 0.35;\n    box(building.x, ground - 0.15, building.z, building.w, 0.5, building.d, C.grass);\n    walkSurfaces.push(walkRect(building.x, building.z, building.w - 2, building.d - 2, islandY, 0, `${building.id} surface`, false));\n  }"
replace_once(athens_app, old_island, new_island, 'Athens remove Tiber copy dependency')

# Atmosphere micro-detail: deterministic vegetation to reduce empty-world feeling
# without claiming exact archaeological placement.
rome_detail = r'''
function decorativeCypress(x, z, scale = 1) {
  const ground = terrainHeightAt(x, z);
  cylinder(x, ground, z, 0.20 * scale, 2.2 * scale, C.timber, 7);
  cylinder(x, ground + 1.7 * scale, z, 0.82 * scale, 3.7 * scale, C.grass, TOUCH ? 7 : 10);
  cylinder(x, ground + 4.1 * scale, z, 0.54 * scale, 2.2 * scale, C.grass, TOUCH ? 7 : 10);
}

function buildAtmosphericDetails() {
  REGIONS.forEach((region, index) => {
    const count = TOUCH ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const angle = index * 2.17 + i * 2.8;
      const x = region.x + Math.cos(angle) * Math.min(52, region.w * 0.30);
      const z = region.z + Math.sin(angle) * Math.min(48, region.d * 0.30);
      if (Math.abs(x - TIBER.x) < TIBER.halfWidth + 18) continue;
      const occupied = BUILDINGS.some((building) => Math.abs(building.x - x) < building.w * 0.62 && Math.abs(building.z - z) < building.d * 0.62);
      if (!occupied) decorativeCypress(x, z, 0.85 + (index % 3) * 0.12);
    }
  });
}
'''.strip()
athens_detail = r'''
function decorativeOlive(x, z, scale = 1) {
  const ground = terrainHeightAt(x, z);
  cylinder(x, ground, z, 0.24 * scale, 2.1 * scale, C.timber, 7);
  cylinder(x - 0.38 * scale, ground + 1.65 * scale, z, 1.18 * scale, 1.9 * scale, C.grass, TOUCH ? 7 : 10);
  cylinder(x + 0.52 * scale, ground + 1.8 * scale, z + 0.22 * scale, 1.05 * scale, 1.7 * scale, C.grass, TOUCH ? 7 : 10);
}

function buildAtmosphericDetails() {
  REGIONS.forEach((region, index) => {
    const count = TOUCH ? 1 : (region.id === 'acropolis' ? 2 : 3);
    for (let i = 0; i < count; i++) {
      const angle = index * 2.31 + i * 2.16;
      const x = region.x + Math.cos(angle) * Math.min(58, region.w * 0.32);
      const z = region.z + Math.sin(angle) * Math.min(54, region.d * 0.32);
      const occupied = BUILDINGS.some((building) => Math.abs(building.x - x) < building.w * 0.65 && Math.abs(building.z - z) < building.d * 0.65);
      if (!occupied) decorativeOlive(x, z, 0.78 + ((index + i) % 3) * 0.12);
    }
  });
}
'''.strip()
marker = "// Terrain is the physical and visual base. Roads, named monuments and inferred\n// fabric are then layered on top of exactly the same height function."
replace_once(rome_app, marker, rome_detail + "\n\n" + marker, 'Rome micro landscape function')
replace_once(athens_app, marker, athens_detail + "\n\n" + marker, 'Athens micro landscape function')
replace_once(
    rome_app,
    "for (const building of URBAN_FABRIC) renderUrbanFabric(building);\nconst ROME_HAZARDS = buildTiberHazards();",
    "for (const building of URBAN_FABRIC) renderUrbanFabric(building);\nbuildAtmosphericDetails();\nconst ROME_HAZARDS = buildTiberHazards();",
    'Rome micro landscape call',
)
replace_once(
    athens_app,
    "for (const building of URBAN_FABRIC) renderUrbanFabric(building);\nconst ATHENS_HAZARDS = buildStreamHazards();",
    "for (const building of URBAN_FABRIC) renderUrbanFabric(building);\nbuildAtmosphericDetails();\nconst ATHENS_HAZARDS = buildStreamHazards();",
    'Athens micro landscape call',
)

# Clean the accidental Augustan filename without changing research contents.
old_research = ROOT / 'research/athens_450_430/augustan_athens_450_430.md'
new_research = ROOT / 'research/athens_450_430/classical_athens_450_430.md'
if old_research.exists():
    if new_research.exists():
        raise SystemExit('Athens research rename target already exists')
    old_research.rename(new_research)

print('Ancient city mobile + visual patch applied successfully')
