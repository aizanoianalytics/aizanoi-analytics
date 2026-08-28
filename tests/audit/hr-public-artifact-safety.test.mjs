import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const sourceRoot = path.join(repoRoot, 'analytics/dashboards/hr-analytics-full-set');
const pipelineRoot = path.join(sourceRoot, 'production-pipeline');
const publicRoot = path.join(repoRoot, 'frontend/analytics/dashboards/hr-analytics-full-set');
const publicWorkbook = path.join(publicRoot, 'downloads/hr-analytics-full-set-synthetic-output.xlsx');
const integratedWorkbook = path.join(pipelineRoot, 'dashboardlar/icmal_sorgu_sonuc.xlsx');

const prohibitedIdentity = /ipekyol|erduran|Taner Kerti/i;
const formerIds = ['10007', '2208', '14794', '10373', '10723', '1076'];
const formerId = new RegExp(`\\b(?:${formerIds.join('|')})\\b`);
const formerIdGlobal = new RegExp(`\\b(?:${formerIds.join('|')})\\b`, 'g');
const idContext = /sicil|employee[\s_-]*(?:id|no|number)|personnel[\s_-]*(?:id|no|number)|personel[\s_-]*(?:id|no|numara)|çalışan[\s_-]*(?:id|no|numara)|calisan[\s_-]*(?:id|no|numara)/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function listFiles(root) {
  const out = [];
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function allowedEmail(email) {
  return /@example\.test$/i.test(email) || /@aizanoianalytics\.com$/i.test(email);
}

function contextualFormerIds(body) {
  const findings = [];
  formerIdGlobal.lastIndex = 0;
  for (const match of body.matchAll(formerIdGlobal)) {
    const start = Math.max(0, match.index - 140);
    const end = Math.min(body.length, match.index + match[0].length + 140);
    const context = body.slice(start, end);
    if (idContext.test(context)) {
      findings.push(`${match[0]} near identity field: ${context.replace(/\s+/g, ' ').slice(0, 220)}`);
    }
  }
  return findings;
}

test('HR source code contains no known former identity constants', () => {
  const strictSourceFiles = [
    ...listFiles(pipelineRoot),
    ...listFiles(path.join(sourceRoot, 'tools')),
    path.join(sourceRoot, 'README.md'),
    path.join(sourceRoot, 'pipeline-manifest.json'),
  ].filter((file) => /\.(?:py|mjs|js|json|md|txt)$/i.test(file));

  const findings = [];
  for (const file of strictSourceFiles) {
    const body = readFileSync(file, 'utf8');
    const identity = body.match(prohibitedIdentity);
    if (identity) findings.push(`${path.relative(repoRoot, file)}: prohibited identity ${identity[0]}`);
    const id = body.match(formerId);
    if (id) findings.push(`${path.relative(repoRoot, file)}: former identifier ${id[0]}`);
    for (const email of body.match(emailPattern) || []) {
      if (!allowedEmail(email)) findings.push(`${path.relative(repoRoot, file)}: non-test email ${email}`);
    }
  }
  assert.deepEqual(findings, []);
});

test('HR templates and generated public assets contain no identity-bearing former IDs', () => {
  const textFiles = [
    ...listFiles(pipelineRoot),
    ...listFiles(path.join(sourceRoot, 'tools')),
    ...listFiles(publicRoot),
    path.join(sourceRoot, 'README.md'),
    path.join(sourceRoot, 'pipeline-manifest.json'),
  ].filter((file) => /\.(?:py|html|js|css|mjs|json|md|txt)$/i.test(file));

  const findings = [];
  for (const file of textFiles) {
    const body = readFileSync(file, 'utf8');
    const identity = body.match(prohibitedIdentity);
    if (identity) findings.push(`${path.relative(repoRoot, file)}: prohibited identity ${identity[0]}`);
    for (const detail of contextualFormerIds(body)) {
      findings.push(`${path.relative(repoRoot, file)}: ${detail}`);
    }
    for (const email of body.match(emailPattern) || []) {
      if (!allowedEmail(email)) findings.push(`${path.relative(repoRoot, file)}: non-test email ${email}`);
    }
  }
  assert.deepEqual(findings, []);
});

test('all committed HR XLSX payloads are valid and synthetic-only in identity-bearing columns', () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const script = String.raw`
import json, pathlib, re, sys, zipfile, xml.etree.ElementTree as ET
pipeline = pathlib.Path(sys.argv[1])
extra = [pathlib.Path(value) for value in sys.argv[2:]]
files = sorted(pipeline.glob('*.xlsx')) + extra
prohibited = re.compile(r'ipekyol|erduran|Taner Kerti', re.I)
email_re = re.compile(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', re.I)
former_ids = {'10007', '2208', '14794', '10373', '10723', '1076'}
id_header = re.compile(r'sicil|employee[ _-]*(?:id|no|number)|personnel[ _-]*(?:id|no|number)|personel[ _-]*(?:id|no|numara)|calisan[ _-]*(?:id|no|numara)', re.I)
findings = []

def local(tag):
    return tag.rsplit('}', 1)[-1]

def col_from_ref(ref):
    match = re.match(r'([A-Z]+)', ref or '')
    return match.group(1) if match else ''

def norm(value):
    return str(value or '').lower().translate(str.maketrans({'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u'}))

for file in files:
    if not file.exists():
        findings.append(f'{file}: missing')
        continue
    if not zipfile.is_zipfile(file):
        findings.append(f'{file}: invalid xlsx/zip')
        continue
    with zipfile.ZipFile(file) as archive:
        names = set(archive.namelist())
        shared = []
        if 'xl/sharedStrings.xml' in names:
            root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            for si in root:
                if local(si.tag) != 'si':
                    continue
                shared.append(''.join(node.text or '' for node in si.iter() if local(node.tag) == 't'))

        raw_text = []
        for name in names:
            if name.lower().endswith(('.xml', '.rels')):
                raw_text.append(archive.read(name).decode('utf-8', errors='ignore'))
        joined = '\n'.join(raw_text)
        if prohibited.search(joined):
            findings.append(f'{file}: prohibited identity')
        for email in email_re.findall(joined):
            if not email.lower().endswith('@example.test'):
                findings.append(f'{file}: non-test email {email}')

        for name in sorted(n for n in names if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')):
            root = ET.fromstring(archive.read(name))
            rows = []
            for row in root.iter():
                if local(row.tag) != 'row':
                    continue
                row_number = int(row.attrib.get('r', '0') or 0)
                cells = {}
                for cell in row:
                    if local(cell.tag) != 'c':
                        continue
                    col = col_from_ref(cell.attrib.get('r', ''))
                    ctype = cell.attrib.get('t', '')
                    value = ''
                    if ctype == 'inlineStr':
                        value = ''.join(node.text or '' for node in cell.iter() if local(node.tag) == 't')
                    else:
                        v = next((node for node in cell if local(node.tag) == 'v'), None)
                        if v is not None and v.text is not None:
                            value = v.text
                            if ctype == 's':
                                try:
                                    value = shared[int(value)]
                                except (ValueError, IndexError):
                                    pass
                    cells[col] = str(value).strip()
                if cells:
                    rows.append((row_number, cells))

            identity_columns = set()
            for row_number, cells in rows:
                if row_number > 40:
                    continue
                for col, value in cells.items():
                    if id_header.search(norm(value)):
                        identity_columns.add(col)
            for row_number, cells in rows:
                for col in identity_columns:
                    value = cells.get(col, '').strip()
                    if value in former_ids:
                        findings.append(f'{file}:{name}:{col}{row_number}: former identifier {value} in identity column')
print(json.dumps(findings, ensure_ascii=False))
`;
  const findings = JSON.parse(execFileSync(
    python,
    ['-c', script, pipelineRoot, integratedWorkbook, publicWorkbook],
    { encoding: 'utf8' },
  ));
  assert.deepEqual(findings, []);
});

test('canonical HR rebuild script targets the restored ten-stage pipeline, not removed shared-core files', () => {
  const body = readFileSync(path.join(repoRoot, 'scripts/regenerate-hr-dashboards.sh'), 'utf8');
  assert.match(body, /production-pipeline\/run_full_pipeline\.py/);
  assert.match(body, /generate_synthetic_source_workbooks\.mjs/);
  assert.match(body, /hr-analytics-full-set-synthetic-output\.xlsx/);
  assert.match(body, /hr-public-artifact-safety\.test\.mjs/);
  assert.doesNotMatch(body, /synthetic-core\/generate_hr_demo_core|generate_full_set_dashboards\.py/);
  assert.doesNotMatch(body, /workforce-turnover\/generate_turnover_dashboard\.py/);
});

test('deploy scrub preserves the one declared public synthetic workbook and rejects all other XLSX files', () => {
  const body = readFileSync(path.join(repoRoot, 'scripts/deploy-public.sh'), 'utf8');
  assert.ok(body.includes('PUBLIC_SYNTHETIC_XLSX="analytics/dashboards/hr-analytics-full-set/downloads/hr-analytics-full-set-synthetic-output.xlsx"'));
  assert.ok(body.includes('! -path "./${PUBLIC_SYNTHETIC_XLSX}"'));
  assert.ok(body.includes('if [[ ! -s "${WEBROOT}/${PUBLIC_SYNTHETIC_XLSX}" ]]'));
});
