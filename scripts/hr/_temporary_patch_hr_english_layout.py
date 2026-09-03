from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def replace_once(path, old, new):
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')

# Public-only translated labels are longer than the canonical Turkish labels.
# Keep the canonical generator untouched; make only the published Corporate Goals
# reading guide grid shrink-safe.
decorator = ROOT / 'scripts/hr/decorate-public-dashboard.mjs'
replace_once(
    decorator,
    '  .aizanoi-public-dashboard-bar__language{margin-left:auto;padding:3px 8px;border:1px solid rgba(165,180,252,.35);border-radius:999px;background:rgba(79,70,229,.16);color:#e0e7ff;white-space:nowrap}\n  .aizanoi-embedded-dashboard .aizanoi-public-dashboard-bar{display:none!important}',
    '  .aizanoi-public-dashboard-bar__language{margin-left:auto;padding:3px 8px;border:1px solid rgba(165,180,252,.35);border-radius:999px;background:rgba(79,70,229,.16);color:#e0e7ff;white-space:nowrap}\n  body[data-aizanoi-dashboard="corporate-goals"] .status-grid{grid-template-columns:repeat(4,minmax(0,1fr))}\n  body[data-aizanoi-dashboard="corporate-goals"] .status-item{grid-template-columns:auto minmax(0,1fr) auto;min-width:0}\n  body[data-aizanoi-dashboard="corporate-goals"] .status-item span{min-width:0;overflow-wrap:anywhere}\n  body[data-aizanoi-dashboard="corporate-goals"] .color-scale{min-width:0}\n  .aizanoi-embedded-dashboard .aizanoi-public-dashboard-bar{display:none!important}'
)
replace_once(
    decorator,
    "  next = next.replace(/<body\\b([^>]*)>/i, (body) => `${body}\\n${navigationBlock()}`);",
    "  next = next.replace(/<body\\b([^>]*)>/i, (_body, attrs) => {\n    const cleanAttrs = attrs.replace(/\\s+data-aizanoi-dashboard\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s>]+)/i, '');\n    return `<body data-aizanoi-dashboard=\"${escapeHtml(dashboardId)}\"${cleanAttrs}>\\n${navigationBlock()}`;\n  });"
)

visible = ROOT / 'frontend/analytics/dashboards/hr-analytics-full-set/hr-public-en-visible.js'
replace_once(
    visible,
    "    'Dış Aday': 'External Candidate'",
    "    'Maksimum': 'Maximum',\n    'Turuncu': 'Orange',\n    'Skor Okuma Rehberi': 'Score Reading Guide',\n    'CEO Hedefleri': 'CEO Goals',\n    'Kapsam: CEO Hedefleri': 'Scope: CEO Goals',\n    'Kaynak: synthetic-hr-dataset': 'Source: synthetic-hr-dataset',\n    'Ocak-Mart': 'January-March',\n    'Dış Aday': 'External Candidate'"
)

qa = ROOT / 'tests/hr-analytics-browser-qa.mjs'
replace_once(qa, 'hedef|hesap', 'hedef|hedefleri|hesap')
replace_once(qa, 'kayit|kayıt|kidem', 'kayit|kayıt|kaynak|kapsam|kidem')
replace_once(qa, 'maas|maaş|merkez', 'maas|maaş|maksimum|mart|merkez')
replace_once(qa, 'onceki|önceki|ortalama', 'ocak|onceki|önceki|ortalama')
replace_once(qa, 'puan|riskli', 'puan|rehberi|riskli')
replace_once(qa, 'tur|tür|unvan', 'tur|tür|turuncu|unvan')

print('Applied targeted Corporate Goals translated-layout fix and strengthened English detector.')
