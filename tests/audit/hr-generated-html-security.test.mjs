import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = {
  adminSource: 'analytics/dashboards/hr-analytics-full-set/production-pipeline/dashboardlar/ERD_P_admin.html',
  adminPublic: 'frontend/analytics/dashboards/hr-analytics-full-set/hr-administration-deep-dive/index.html',
  storeSource: 'analytics/dashboards/hr-analytics-full-set/production-pipeline/dashboardlar/magaza_takip_dosya.html',
  storePublic: 'frontend/analytics/dashboards/hr-analytics-full-set/store-operations-tracking/index.html',
  performanceSource: 'analytics/dashboards/hr-analytics-full-set/production-pipeline/dashboardlar/performans_dashboard.html',
  performancePublic: 'frontend/analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/index.html',
};

function read(path) {
  return readFileSync(path, 'utf8');
}

test('admin generated scatter labels escape formatted data before HTML parsing', () => {
  for (const path of [files.adminSource, files.adminPublic]) {
    const html = read(path);
    assert.match(html, /\$\{esc\(fmt\(r\.risk_puani,1\)\)\}/, `${path}: risk label must be escaped`);
    assert.match(html, /\$\{esc\(fmt\(r\.performans_bilesik,1\)\)\}/, `${path}: performance label must be escaped`);
    assert.doesNotMatch(html, /\$\{fmt\(r\.risk_puani,1\)\}/, `${path}: raw risk label reached an HTML template`);
    assert.doesNotMatch(html, /\$\{fmt\(r\.performans_bilesik,1\)\}/, `${path}: raw performance label reached an HTML template`);
  }
});

test('store generated chart labels escape data-derived month/value text before HTML parsing', () => {
  for (const path of [files.storeSource, files.storePublic]) {
    const html = read(path);
    const required = [
      '${esc(shortMonth(r.month))}',
      '${esc(monthName(r.month))}',
      '${esc(monthName(pt.m))}',
      '${esc(def.fmt(last?.[def.key]||0))}',
      '${esc(def.fmt(r[def.key]))}',
      '${esc(pct(pt.v))}',
    ];
    for (const token of required) {
      assert.ok(html.includes(token), `${path}: missing hardened token ${token}`);
    }

    const forbidden = [
      '${shortMonth(r.month)}',
      '${monthName(r.month)}',
      '${monthName(pt.m)}',
      '${def.fmt(last?.[def.key]||0)}',
      '${def.fmt(r[def.key])}',
      '${pct(pt.v)}',
    ];
    for (const token of forbidden) {
      assert.ok(!html.includes(token), `${path}: raw data-derived token remains in HTML template: ${token}`);
    }
  }
});

test('performance month options escape values and visible labels before HTML parsing', () => {
  for (const path of [files.performanceSource, files.performancePublic]) {
    const html = read(path);
    const safe = '<option value="${esc(m)}">${esc(monthLabel(m))}</option>';
    const raw = '<option value="${m}">${monthLabel(m)}</option>';
    assert.ok(html.includes(safe), `${path}: missing hardened month option`);
    assert.ok(!html.includes(raw), `${path}: raw month option remains`);
  }
});
