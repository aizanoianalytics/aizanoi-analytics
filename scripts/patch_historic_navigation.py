from pathlib import Path

path = Path('frontend/historic-world/index.html')
text = path.read_text(encoding='utf-8')

if 'installBackToOS' in text:
    print('Historic World navigation already present; nothing to do.')
    raise SystemExit(0)

needle = '</body>\n</html>'
if text.count(needle) != 1:
    raise SystemExit(f'Expected exactly one closing body/html marker, found {text.count(needle)}')

insertion = '''<script type="module">\nimport { installBackToOS } from "../ancient-world/engine/navigation.js";\nconst destroyHistoricWorld = () => {\n  try { window.__AIZANOI_DEBUG__?.resetMovementState?.(); } catch (_) {}\n  try { document.exitPointerLock?.(); } catch (_) {}\n};\nwindow.__ANCIENT_WORLD_DESTROY__ = destroyHistoricWorld;\nif (window.__AIZANOI_DEBUG__) window.__ANCIENT_WORLD_DEBUG__ = window.__AIZANOI_DEBUG__;\ninstallBackToOS({ onBeforeExit: destroyHistoricWorld });\n</script>\n</body>\n</html>'''

path.write_text(text.replace(needle, insertion, 1), encoding='utf-8')
print('Patched Historic World with shared Back to Aizanoi OS navigation.')
