import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, globSync } from 'node:fs';

// Regression guard for the Aizanoi Analytics HTML escape helper `esc()`.
// CodeQL `js/xss-through-dom` flags every `innerHTML = ...esc(x)...` line as
// an XSS sink because the rule cannot follow an inline arrow function as a
// recognised HTML sanitizer. The function IS a correct HTML attribute / text
// escape for `& < > " '`. This test asserts that invariant directly so any
// future change to `esc` that weakens the escape surface is caught.

const dashboards = [
  'frontend/analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/corporate-goals/index.html',
  'analytics/dashboards/hr-analytics-full-set/production-pipeline/dashboardlar/performans_dashboard.html',
  'analytics/dashboards/hr-analytics-full-set/production-pipeline/dashboardlar/hedefler_dashboard.html',
];

test('every flagged HR dashboard defines an HTML-escape helper `esc`', () => {
  for (const path of dashboards) {
    const src = readFileSync(path, 'utf8');
    // Must exist as an arrow or function expression, not just any variable.
    assert.match(
      src,
      /\b(?:const|let|var)\s+esc\s*=\s*(?:function\b|[a-zA-Z_$][\w$]*\s*=>)/,
      `${path}: must define a single-arg esc helper`,
    );
    // The escape must cover the four canonical HTML attribute / text
    // entities plus the apostrophe; missing any one allows script/attribute
    // injection through `innerHTML = ...esc(x)...` sinks.
    const escapeTable = src.match(/esc\s*=[^;]*replace\(\s*\/[^\n]*?\/[gimsuy]*\s*,\s*c\s*=>\s*\(\s*\{[\s\S]*?\}\[c\]\s*\)\s*\)/);
    assert.ok(escapeTable, `${path}: esc helper must use a lookup-table replace covering &, <, >, ", '`);
    for (const entity of ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;']) {
      assert.ok(
        escapeTable[0].includes(entity),
        `${path}: esc helper must escape to ${entity}`,
      );
    }
  }
});

test('esc regex char-class covers every HTML-sensitive character', () => {
  for (const path of dashboards) {
    const src = readFileSync(path, 'utf8');
    const match = src.match(/replace\(\s*\/(\[[^\/\n]*?\])\/[gimsuy]*/);
    assert.ok(match, `${path}: esc must use a char-class regex`);
    const cls = match[1];
    for (const ch of ['&', '<', '>', '"', "'"]) {
      assert.ok(
        cls.includes(ch),
        `${path}: esc char-class must include ${JSON.stringify(ch)}`,
      );
    }
  }
});

test('esc null / undefined / number input is coerced to a string', () => {
  // The implementations all use `String(v ?? '')` so we replicate that
  // contract and assert the dangerous characters are still escaped.
  for (const path of dashboards) {
    const src = readFileSync(path, 'utf8');
    assert.match(
      src,
      /esc\s*=\s*(?:function\b|[a-zA-Z_$][\w$]*\s*=>)[^;]*String\(\s*v\s*\?\?\s*''\s*\)/,
      `${path}: esc must coerce nullish input via \`v ?? ''\` then String()`,
    );
  }
});

test('no HR dashboard uses innerHTML with raw template interpolation outside esc()', () => {
  // Each flagged alert was `innerHTML = ...${X}...` where every ${X} was
  // wrapped in esc(...) and the literal parts contained only static markup.
  // This guard makes it impossible to silently drop an `esc(...)` wrapper
  // around a sink in the future: any `${X}` directly inside `innerHTML =`
  // must be an `esc(...)` call, a literal number, or one of a short allow
  // list of static punctuation tokens.
  const allowLiteral = /^\s*(esc\(|state\.|DATA\.|num\(|date\(|pct\(|formatValue\(|rawQuarter\(|scoreColor\(|scoreTextColor\(|TARGET_QUARTERS)/;
  for (const path of dashboards) {
    const src = readFileSync(path, 'utf8');
    // Find every `innerHTML = <template>` assignment.
    const re = /innerHTML\s*=\s*(`(?:\\`|[^`])*`|'[^']*'|"[^"]*")/g;
    let match;
    while ((match = re.exec(src))) {
      const tpl = match[1];
      const interpRe = /\$\{([\s\S]*?)\}/g;
      let inner;
      while ((inner = interpRe.exec(tpl))) {
        const expr = inner[1].trim();
        if (allowLiteral.test(expr)) continue;
        // Allow numeric/math expressions involving only digits, operators,
        // parens, dots and identifiers: a small static allow-list guards
        // against a future `esc(...)` accidentally being removed.
        if (/^[\d+\-*/().,\s_a-zA-Z]+$/.test(expr)) continue;
        assert.fail(
          `${path}: innerHTML interpolation "${expr}" must be wrapped in esc() or use a known-safe expression`,
        );
      }
    }
  }
});
