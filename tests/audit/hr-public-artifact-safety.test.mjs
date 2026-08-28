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
const formerId = /\b(?:10007|2208|14794|10373|10723|1076)\b/;
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

test('HR text sources and generated public assets contain no known former identities', () => {
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
    if (prohibitedIdentity.test(body)) findings.push(`${path.relative(repoRoot, file)}: prohibited identity`);
    if (formerId.test(body)) findings.push(`${path.relative(repoRoot, file)}: former identifier`);
    for (const email of body.match(emailPattern) || []) {
      if (!allowedEmail(email)) findings.push(`${path.relative(repoRoot, file)}: non-test email ${email}`);
    }
  }
  assert.deepEqual(findings, []);
});

test('all committed HR XLSX payloads are valid ZIPs with synthetic-only identity strings', () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const script = String.raw`
import json, pathlib, re, sys, zipfile
pipeline = pathlib.Path(sys.argv[1])
extra = [pathlib.Path(value) for value in sys.argv[2:]]
files = sorted(pipeline.glob('*.xlsx')) + extra
prohibited = re.compile(r'ipekyol|erduran|Taner Kerti', re.I)
email_re = re.compile(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', re.I)
findings = []
for file in files:
    if not file.exists():
        findings.append(f'{file}: missing')
        continue
    if not zipfile.is_zipfile(file):
        findings.append(f'{file}: invalid xlsx/zip')
        continue
    chunks = []
    with zipfile.ZipFile(file) as archive:
        for name in archive.namelist():
            if name.lower().endswith(('.xml', '.rels')):
                chunks.append(archive.read(name).decode('utf-8', errors='ignore'))
    text = '\n'.join(chunks)
    if prohibited.search(text):
        findings.append(f'{file}: prohibited identity')
    for email in email_re.findall(text):
        if not email.lower().endswith('@example.test'):
            findings.append(f'{file}: non-test email {email}')
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
  assert.doesNotMatch(body, /synthetic-core\/generate_hr_demo_core|generate_full_set_dashboards\.py/);
  assert.doesNotMatch(body, /workforce-turnover\/generate_turnover_dashboard\.py/);
});

test('deploy scrub preserves the one declared public synthetic workbook and rejects all other XLSX files', () => {
  const body = readFileSync(path.join(repoRoot, 'scripts/deploy-public.sh'), 'utf8');
  assert.ok(body.includes('PUBLIC_SYNTHETIC_XLSX="analytics/dashboards/hr-analytics-full-set/downloads/hr-analytics-full-set-synthetic-output.xlsx"'));
  assert.ok(body.includes('! -path "./${PUBLIC_SYNTHETIC_XLSX}"'));
  assert.ok(body.includes('if [[ ! -s "${WEBROOT}/${PUBLIC_SYNTHETIC_XLSX}" ]]'));
});
