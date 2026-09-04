import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAudit } from '../scripts/ci/npm-audit-gate.mjs';

function report(vulnerabilities) {
  return JSON.stringify({ metadata: { vulnerabilities } });
}

test('passes a valid report with zero high and critical vulnerabilities', () => {
  assert.equal(classifyAudit({ status: 0, stdout: report({ info: 0, low: 2, moderate: 1, high: 0, critical: 0 }) }).outcome, 'pass');
});

test('fails valid reports containing high or critical vulnerabilities', () => {
  assert.equal(classifyAudit({ status: 1, stdout: report({ high: 1, critical: 0 }) }).outcome, 'fail');
  assert.equal(classifyAudit({ status: 1, stdout: report({ high: 0, critical: 2 }) }).outcome, 'fail');
});

test('allows only recognized registry endpoint/network failures without a report', () => {
  const cases = [
    'npm warn audit 503 Service Unavailable - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick',
    'npm warn audit 400 Bad Request - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick',
    'npm error audit endpoint returned an error',
    'request to registry failed: ETIMEDOUT',
  ];
  for (const stderr of cases) {
    assert.equal(classifyAudit({ status: 1, stderr }).outcome, 'transient', stderr);
  }
});

test('fails unknown errors, malformed output and non-audit HTTP errors', () => {
  const cases = [
    { status: 1, stdout: 'not json', stderr: 'unknown failure' },
    { status: 1, stdout: JSON.stringify({ error: 'bad package data' }), stderr: '' },
    { status: 1, stderr: '400 Bad Request from https://example.invalid/api' },
  ];
  for (const input of cases) assert.equal(classifyAudit(input).outcome, 'fail');
});

test('treats a killed/timed-out npm process as transient', () => {
  assert.equal(classifyAudit({ status: null, signal: 'SIGTERM' }).outcome, 'transient');
});
