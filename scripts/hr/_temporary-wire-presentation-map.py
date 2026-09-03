from pathlib import Path

path = Path('scripts/hr/localize-public-dashboard-en.mjs')
text = path.read_text()

if "const PRESENTATION_FILE" not in text:
    text = text.replace(
        "const OVERRIDES_FILE = resolve(HERE, 'hr-public-en-overrides.json');\n",
        "const OVERRIDES_FILE = resolve(HERE, 'hr-public-en-overrides.json');\nconst PRESENTATION_FILE = resolve(HERE, 'hr-public-en-presentation-map.json');\n",
        1,
    )

if "const presentation = JSON.parse" not in text:
    text = text.replace(
        "const overrides = JSON.parse(readFileSync(OVERRIDES_FILE, 'utf8'));\nif (oracle.schemaVersion !== 1 || overrides.schemaVersion !== 1) {",
        "const overrides = JSON.parse(readFileSync(OVERRIDES_FILE, 'utf8'));\nconst presentation = JSON.parse(readFileSync(PRESENTATION_FILE, 'utf8'));\nif (oracle.schemaVersion !== 1 || overrides.schemaVersion !== 1 || presentation.schemaVersion !== 1) {",
        1,
    )

anchor = "for (const [source, target] of Object.entries(overrides.exact || {})) addExact(source, target, 'override:exact', { override: true });\n"
if "presentation:value" not in text:
    text = text.replace(
        anchor,
        anchor
        + "for (const [source, target] of Object.entries(presentation.values || {})) addExact(source, target, 'presentation:value', { override: true });\n"
        + "for (const [source, target] of Object.entries(presentation.exact || {})) addExact(source, target, 'presentation:exact', { override: true });\n",
        1,
    )

marker = "    const middleDot=value.split(' · ');"
if "reason match" not in text:
    block = r"""    m=value.match(/^(\\d+)\\s+değerlendirilen KPI$/u); if(m) return m[1]+' evaluated KPIs';
    m=value.match(/^(\\d+)\\s+çeyrek$/u); if(m) return m[1]+' quarter';
    m=value.match(/^(\\d+)\\s+evden \\+ (\\d+)\\s+harici$/u); if(m) return m[1]+' remote + '+m[2]+' external';
    m=value.match(/^(\\d+)\\s*\\/\\s*(\\d+)\\s+kayıt gösteriliyor\\.$/u); if(m) return m[1]+' / '+m[2]+' records shown.';
    m=value.match(/^Toplam:\\s*(.+)$/u); if(m) return 'Total: '+m[1];
    m=value.match(/^Son 12 ay turnover\\s*(.+)$/u); if(m) return 'Last 12 months turnover '+m[1];
    m=value.match(/^Eksik:\\s*(.+)$/u); if(m) return 'Missing: '+(EXACT[m[1]]||m[1]);
    m=value.match(/^Toplam puan\\s*(.+)$/u); if(m) return 'Total score '+m[1];
    m=value.match(/^Çok zayıf odak bileşen:\\s*(.+)$/u); if(m) return 'Very weak focus component: '+m[1];
    m=value.match(/^Turnover üst %10:\\s*(.+)$/u); if(m) return 'Turnover top 10%: '+m[1];
    m=value.match(/^(\\d+)\\s+bileşen\\s+(\\d+)\\s+altı$/u); if(m) return m[1]+' components below '+m[2];
    m=value.match(/^%([\\d.]+)\\s+neden eşleşmesi$/u); if(m) return '%'+m[1]+' reason match';
    m=value.match(/^Örn\\.\\s*(.+)$/u); if(m) return 'e.g. '+m[1];
    m=value.match(/^(Mağaza|Merkez)\\s+(\\d{4})$/u); if(m) return (m[1]==='Mağaza'?'Store':'Head Office')+' '+m[2];
    m=value.match(/^(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\\s+(\\d{4})\\s+· Seçili metrik:\\s*(.+)$/u); if(m) return MONTHS[m[1]]+' '+m[2]+' · Selected metric: '+(EXACT[m[3]]||m[3]);
    m=value.match(/^Fiili liste:\\s*(.+?) · (\\d+) eşleşen \\/ (\\d+) eşleşmeyen sicil$/u); if(m) return 'Actual roster: '+m[1]+' · '+m[2]+' matched / '+m[3]+' unmatched employee IDs';
"""
    text = text.replace(marker, block + marker, 1)

path.write_text(text)

for filename in [
    'scripts/hr/_temporary-wire-presentation-map.py',
    '.github/workflows/_temporary-hr-wire-presentation-map.yml',
    '.github/workflows/_temporary-hr-apply-presentation-map.yml',
]:
    p = Path(filename)
    if p.exists():
        p.unlink()
