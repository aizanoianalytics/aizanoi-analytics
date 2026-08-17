from pathlib import Path

path = Path('frontend/ancient-cities/rome-410-476/index.html')
text = path.read_text(encoding='utf-8')

if 'id="evidence"' in text and "./js/methodology.js" in text:
    print('Rome methodology UI already present.')
    raise SystemExit(0)

controls_old = '<button id="audio">Sound: off</button><button id="sources">Sources</button>'
controls_new = '<button id="audio">Sound: off</button><button id="evidence">Evidence</button><button id="sources">Sources</button>'
if text.count(controls_old) != 1:
    raise SystemExit(f'Expected one controls insertion point, found {text.count(controls_old)}')
text = text.replace(controls_old, controls_new, 1)

marker = '<script type="module">\nif(!window.__AIZANOI_WEBGL_UNAVAILABLE__){import(\'./js/app.js\')'
method = '<script type="module">\nimport(\'./js/methodology.js\').catch((error)=>console.error(\'Rome methodology module failed:\',error));\n</script>\n<script type="module">\nif(!window.__AIZANOI_WEBGL_UNAVAILABLE__){import(\'./js/app.js\')'
if text.count(marker) != 1:
    raise SystemExit(f'Expected one renderer module marker, found {text.count(marker)}')
text = text.replace(marker, method, 1)

path.write_text(text, encoding='utf-8')
print('Patched Rome Evidence control and methodology module import.')
