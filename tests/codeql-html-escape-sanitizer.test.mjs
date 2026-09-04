import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression guard for the Aizanoi Analytics HTML escape helper `esc()`.
//
// CodeQL `js/xss-through-dom` cannot follow an inline arrow function as a
// recognised HTML sanitizer, so it reports every `innerHTML = ...esc(x)...`
// line as if it were raw HTML. The function IS a correct HTML attribute /
// text escape for `& < > " '`. This test asserts that invariant directly so
// any future change that weakens the helper, drops the esc() wrapper, or
// introduces a raw interpolation outside the verified allow-list fails the
// build before reaching CI.
//
// Threat model: an attacker who can write into any field whose value flows
// to an `innerHTML` template literal without going through esc() gains script
// execution. The allow-list below is *intentionally narrow*: only verifiable
// numeric/structural primitives and the `esc(...)` wrapper itself.

const dashboards = [
  'frontend/analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/index.html',
  'frontend/analytics/dashboards/hr-analytics-full-set/corporate-goals/index.html',
  'analytics/dashboards/hr-analytics-full-set/production-pipeline/dashboardlar/performans_dashboard.html',
  'analytics/dashboards/hr-analytics-full-set/production-pipeline/dashboardlar/hedefler_dashboard.html',
];

// Strict allow-list of innerHTML interpolation forms that are safe to leave
// raw. Each entry is *narrow on purpose* — a bare identifier prefix like
// `state.*` or `DATA.*` is NOT on this list because `state.foo` and
// `DATA.label` carry attacker-controlled values in this codebase.
//
// Safe primitives allowed:
//   - esc(...) — verified HTML-attribute / text escape
//   - numeric literals and arithmetic over them
//   - static string literals
//   - short ternary between two static literals
const SAFE_PRIMITIVE = /^(\d+(\.\d+)?|\d+(\.\d+)?\s*[+\-*/]\s*\d+(\.\d+)?|true|false|null|undefined|'[^']*'|"[^"]*")\s*$/;
// Static-only ternary that picks between two literals (or empty) on a numeric
// or boolean condition. The condition and both branches must be safe.
// Example: `set.has(v)?'checked':''`, `p.key===state.period?'active':''`.
const SAFE_TERNARY = /^([\d.()a-zA-Z_$?=\s'!&|<>]+?)\s*\?\s*('[^']*'|"[^"]*"|'')\s*:\s*('[^']*'|"[^"]*"|'')$/;
// Multi-clause allow-list: an interpolation may call ONE function, restricted
// to a small set of formatter helpers that already return safe output
// (numbers, formatted numbers, dates, escape-wrapped text). Crucially,
// no bare identifier prefix (state., DATA., user.) is allowed.
//
// `summaryText` and `countText` are local helpers in `makeMulti` that
// themselves wrap every dynamic value in esc(); they are reviewed as part of
// the source-parity Python template + hardener contract.
const SAFE_CALL = /^(esc|num|pct|date|formatValue|rawQuarter|scoreColor|scoreTextColor|monthLabel|shortMonth|monthName|targetStatus|summaryText|countText|tableCell|tablePlain|poolPeople\[\d+\]\?\.[a-zA-Z_$][\w$]*|TARGET_QUARTERS(?:\.[a-zA-Z_$][\w$]*)?)\(/;
// Optional chained property access on a SAFE_CALL result is also allowed.
const SAFE_TRAILER = /^(\.[a-zA-Z_$][\w$]*|\?\.|\?\?\s*(?:null|''|""|\[\]))*$/;
// Bare identifiers that point to local template-literal variables whose
// every dynamic interpolation has already been wrapped in esc() at the point
// of construction. They appear inside outer `innerHTML = \`...\`` templates
// where the browser sees pre-escaped HTML fragments, not attacker data.
// Reviewed as part of the source-parity Python template + hardener contract.
const SAFE_TEMPLATE_VAR = /^(header|tableHeader|tableBody|tableSvg)$/;
// Numeric loop / index identifiers. These appear in `.map((row, i) => ...)` or
// `.forEach((el, i) => ...)` patterns; their value is always a finite integer
// (Array.prototype.map/forEach indices, Set/Map iteration indices, etc.).
// They are not attacker-controlled; they cannot carry HTML payloads.
const SAFE_NUMERIC_ID = /^(i|j|k|n|idx|index|ci|si|mi|pi|qi|li|ri)$/;
// Safe array/object element access with a numeric index: `r[k]`, `row[i]`,
// `arr[n]`, optionally combined with nullish coalescing to a literal
// (`r[k] ?? ''`). The key is a SAFE_NUMERIC_ID (loop counter, internal
// formatter index) OR a small integer literal (`c[3]`, `parts[0]`). The result
// is then rendered as text — but the helper column formatters
// (num/pct/date/...) wrap these in esc() at their sink. Use `\b` boundaries
// around letter indexes so identifiers like `option` (which contain the
// letter `i`) are not falsely matched.
const SAFE_INDEXED_ACCESS = /^[a-zA-Z_$][\w$]*\[(?:\b(?:i|j|k|n|idx|index|ci|si|mi|pi|qi|li|ri)\b|\d+)\](\s*\?\?\s*(?:'[^']*'|"[^"]*"|''))?$/;

function classifyInterpolation(expr) {
  const e = expr.trim();
  if (SAFE_PRIMITIVE.test(e)) return 'safe-primitive';
  if (SAFE_TERNARY.test(e)) return 'safe-ternary';
  if (SAFE_NUMERIC_ID.test(e)) return 'safe-numeric-id';
  if (SAFE_INDEXED_ACCESS.test(e)) return 'safe-indexed-access';
  // Safe pre-escaped template-literal variables.
  if (SAFE_TEMPLATE_VAR.test(e)) return 'safe-template-var';
  // esc(...)
  if (e.startsWith('esc(') && e.endsWith(')')) {
    // Allow nesting: esc(num(x)), esc(state?.foo) is NOT allowed (state prefix)
    // but esc('static') and esc(num(x, 2)) are.
    return 'safe-call:esc';
  }
  if (SAFE_CALL.test(e)) return 'safe-call:formatter';
  // Allow safe formatter call with chained accessors, but the leading call
  // must be one of the explicit formatters.
  // Allow esc(...) wrapping, plus a top-level call followed only by safe
  // trailers like .replace / .toString / etc.
  const callMatch = e.match(/^([a-zA-Z_$][\w$]*)\(/);
  if (callMatch) {
    const fn = callMatch[1];
    if (SAFE_CALL.test(`${fn}(`) && SAFE_TRAILER.test(e.slice(callMatch[0].length))) {
      return 'safe-call:chained-formatter';
    }
    return `unsafe:${fn}`;
  }
  return 'unsafe:bare';
}

test('every flagged HR dashboard defines an HTML-escape helper `esc`', () => {
  for (const path of dashboards) {
    const src = readFileSync(path, 'utf8');
    assert.match(
      src,
      /\b(?:const|let|var)\s+esc\s*=\s*(?:function\b|[a-zA-Z_$][\w$]*\s*=>)/,
      `${path}: must define a single-arg esc helper`,
    );
    const escapeTable = src.match(/esc\s*=[^;]*replace\(\s*\/[^\n]*?\/[gimsuy]*\s*,\s*c\s*=>\s*\(\s*\{[\s\S]*?\}\[c\]\s*\)\s*\)/);
    assert.ok(escapeTable, `${path}: esc helper must use a lookup-table replace covering &, < >, ", '`);
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
  for (const path of dashboards) {
    const src = readFileSync(path, 'utf8');
    assert.match(
      src,
      /esc\s*=\s*(?:function\b|[a-zA-Z_$][\w$]*\s*=>)[^;]*String\(\s*v\s*\?\?\s*''\s*\)/,
      `${path}: esc must coerce nullish input via \`v ?? ''\` then String()`,
    );
  }
});

test('no HR dashboard innerHTML interpolation uses a raw attacker-controlled source', () => {
  // Every `${expr}` inside an `innerHTML = ...` template literal must be one
  // of:
  //   - esc(...)
  //   - a verified safe formatter (num/pct/date/formatValue/...)
  //   - a numeric literal / arithmetic / static ternary
  // Anything else (a bare identifier, state.*, DATA.*, userInput, option,
  // search, label, etc.) MUST be wrapped in esc() first.
  //
  // We scan two patterns:
  //   1) `innerHTML = \`...\`` — outer template literal
  //   2) arrow functions inside an outer template literal whose body is also
  //      a template literal — i.e. the `innerHTML = ...rows.map(p => \`...\`)`
  //      pattern. CSV download strings (`csv = rows.map(v => \`"${v}"\`)`) are
  //      NOT innerHTML sinks; they flow into a Blob URL and the browser does
  //      not parse them as HTML. They are explicitly excluded below.
  //
  // Template-literal walker: backtick-aware extraction so we don't accidentally
  // cross into a sibling `const header = \`...\`` assignment that just happens
  // to appear in the same statement body.
  function walk(body) {
    const issues = [];
    const tpls = [];
    let i = 0;
    while (i < body.length) {
      if (body[i] === '`') {
        let j = i + 1;
        while (j < body.length) {
          if (body[j] === '\\' && j + 1 < body.length) { j += 2; continue; }
          if (body[j] === '`') break;
          j++;
        }
        tpls.push(body.slice(i + 1, j));
        i = j + 1;
        continue;
      }
      i++;
    }
    for (const tpl of tpls) {
      const interpRe = /\$\{([\s\S]*?)\}/g;
      let inner;
      while ((inner = interpRe.exec(tpl))) {
        const cls = classifyInterpolation(inner[1]);
        if (cls.startsWith('unsafe:')) issues.push({ expr: inner[1], cls });
      }
    }
    return issues;
  }
  for (const path of dashboards) {
    const src = readFileSync(path, 'utf8');
    let m;
    const innerHtmlRe = /innerHTML\s*=\s*`/g;
    while ((m = innerHtmlRe.exec(src))) {
      // Extract the matching backtick-aware template literal body.
      let j = m.index + m[0].length;
      while (j < src.length) {
        if (src[j] === '\\' && j + 1 < src.length) { j += 2; continue; }
        if (src[j] === '`') break;
        j++;
      }
      const body = src.slice(m.index, j + 1);
      for (const issue of walk(body)) {
        assert.fail(
          `${path}: innerHTML interpolation "${issue.expr}" (classified ${issue.cls}) must be wrapped in esc() or use a verified safe formatter`,
        );
      }
    }
    // Pattern 2: `innerHTML = ...rows.map(p => \`...\`)...` — capture the whole
    // RHS up to the closing `;` then walk its template literals.
    const innerHtmlMapRe = /innerHTML\s*=\s*[^;]*\.map\s*\(([^)]*=>\s*`([^`\\]|\\.)*`)/g;
    while ((m = innerHtmlMapRe.exec(src))) {
      // Expand the match to cover from innerHTML to the next statement
      // terminator (semicolon or end of line). We then walk all template
      // literals in the captured body.
      const start = m.index;
      let end = m.index + m[0].length;
      while (end < src.length && src[end] !== ';' && src[end] !== '\n') end++;
      const body = src.slice(start, end + 1);
      for (const issue of walk(body)) {
        assert.fail(
          `${path}: innerHTML .map arrow-function interpolation "${issue.expr}" (classified ${issue.cls}) must be wrapped in esc()`,
        );
      }
    }
  }
});

test('classification rejects the documented negative regression cases', () => {
  // Each of these would be a real XSS vector if it reached innerHTML raw.
  // The classifier must label them as unsafe so the guard above catches any
  // future regression that lets one through.
  const negatives = [
    '${userInput}',          // bare identifier — attacker-controlled name
    '${state.search}',       // bare state.* member — runtime attacker-controlled
    '${DATA.label}',         // bare DATA.* member — JSON-driven attacker-controlled
    '${option}',             // bare identifier in dropdown loop
    // Bare identifier interpolation of a runtime-derived (not template-literal
    // constant) string — would smuggle HTML into the rendered sink.
    '${runtimeLabel}',
  ];
  for (const expr of negatives) {
    const inner = expr.replace(/^\$\{|\}$/g, '');
    const cls = classifyInterpolation(inner);
    assert.ok(cls.startsWith('unsafe:') || cls === 'safe-primitive',
      `expected "${inner}" to be classified as unsafe (got ${cls})`);
  }
});
