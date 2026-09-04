#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const AUDIT_ENDPOINT = /registry\.npmjs\.org\/-\/npm\/v1\/security\/(?:audits\/quick|advisories\/bulk)/i;
const TRANSIENT_NETWORK = /(?:audit endpoint returned an error|\b(?:ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND)\b|network timeout|socket hang up)/i;
const AUDIT_HTTP_ERROR = /\b(?:400 Bad Request|429 Too Many Requests|5\d\d (?:Service Unavailable|Internal Server Error|Bad Gateway|Gateway Timeout))\b/i;

export function classifyAudit({ status, signal, error, stdout = '', stderr = '' }) {
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    report = null;
  }

  const vulnerabilities = report?.metadata?.vulnerabilities;
  if (vulnerabilities && typeof vulnerabilities === 'object') {
    const high = Number(vulnerabilities.high || 0);
    const critical = Number(vulnerabilities.critical || 0);
    if (high > 0 || critical > 0) {
      return { outcome: 'fail', reason: `npm audit found ${high} high and ${critical} critical vulnerabilities` };
    }
    return { outcome: 'pass', reason: 'npm audit found zero high/critical vulnerabilities' };
  }

  const diagnostic = [stdout, stderr, signal ? `signal=${signal}` : '', error?.code ? `error=${error.code}` : ''].join('\n');
  const timedOut = status == null && (signal === 'SIGTERM' || error?.code === 'ETIMEDOUT');
  const recognizedRegistryFailure = TRANSIENT_NETWORK.test(diagnostic) ||
    (AUDIT_ENDPOINT.test(diagnostic) && AUDIT_HTTP_ERROR.test(diagnostic));
  if (recognizedRegistryFailure || timedOut) {
    return { outcome: 'transient', reason: 'npm registry audit endpoint unavailable; no vulnerability report was returned' };
  }

  return { outcome: 'fail', reason: `npm audit failed without a valid vulnerability report (exit ${status ?? 'unknown'})` };
}

function run() {
  const prefixAt = process.argv.indexOf('--prefix');
  const prefix = prefixAt >= 0 ? process.argv[prefixAt + 1] : null;
  if (prefixAt >= 0 && !prefix) {
    console.error('[npm-audit-gate] --prefix requires a path');
    process.exit(2);
  }

  const args = [];
  if (prefix) args.push('--prefix', prefix);
  args.push('audit', '--audit-level=high', '--json');
  const result = spawnSync('npm', args, {
    encoding: 'utf8',
    timeout: 90_000,
    killSignal: 'SIGTERM',
    env: {
      ...process.env,
      npm_config_fetch_timeout: '60000',
      npm_config_fetch_retries: '0',
    },
  });

  const classification = classifyAudit(result);
  const stream = classification.outcome === 'pass' ? process.stdout : process.stderr;
  stream.write(`[npm-audit-gate] ${classification.outcome.toUpperCase()}: ${classification.reason}\n`);

  if (classification.outcome === 'fail') {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(1);
  }

  // A transient registry failure is explicitly non-blocking. It is distinct
  // from a valid audit report containing high/critical vulnerabilities, which
  // always exits 1 above.
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run();
