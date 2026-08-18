from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)

for slug in ['rome-410-476', 'athens-450-430']:
    path = ROOT / f'frontend/ancient-cities/{slug}/js/app.js'
    text = path.read_text()
    text = replace_once(
        text,
        "function teleportToPoint(x, z, { lookX = null, lookZ = null, lookY = null, label = 'destination' } = {}) {\n  clearMovementState();\n  const spawn = traversal.resolveSpawn(x, z);",
        "function teleportToPoint(x, z, { lookX = null, lookZ = null, lookY = null, label = 'destination', resolved = false } = {}) {\n  clearMovementState();\n  const spawn = resolved ? { x, z } : traversal.resolveSpawn(x, z);",
        f'{slug} resolved teleport option',
    )
    text = replace_once(
        text,
        "teleportToPoint(chosen.x, chosen.z, { lookX: building.x, lookZ: building.z, lookY, label: building.name });",
        "teleportToPoint(chosen.x, chosen.z, { lookX: building.x, lookZ: building.z, lookY, label: building.name, resolved: true });",
        f'{slug} landmark resolved call',
    )
    path.write_text(text)

path = ROOT / 'tests/landmark-framing.test.mjs'
test = path.read_text()
needle = "assert.match(source, /arrivalUntil/);"
replacement = "assert.match(source, /arrivalUntil/);\n    assert.match(source, /resolved = false/);\n    assert.match(source, /resolved: true/);"
if needle not in test:
    raise SystemExit('landmark framing source assertion anchor missing')
path.write_text(test.replace(needle, replacement, 1))
print('landmark double-resolve fix applied')
