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
// numeric/structural primitives, statically-defined literal data tables, and
// individually audited helpers. Classification rules added on 2026-09:
//
//   - A numeric/loop index proves nothing about the HTML-safety of the VALUE
//     read through it (`r[k]`, `row[i]`, `c[3]`). Raw dynamic indexed access
//     is unsafe by default; only lookups into a statically-defined literal
//     table (verified non-empty by table-lookup-returns-literals.test.mjs) or
//     an esc()-wrapped indexed access pass.
//   - Helper names are never trusted by name. Each SAFE_CALL entry is an
//     individually audited, return-type-proven formatter (see definitions
//     next to the regex). Anything outside that list must be esc()'d.

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
// Bare numeric loop-index identifiers. Only identifiers that sit in the
// `.map((row, i) => ...)` / `.forEach((el, i) => ...)` index position in these
// dashboards: `ci` (column index of the filter button) and `i` (row/point
// index). A loop *key* like `k` (from `['p80','p100',...].map(k => ...)`) is
// NOT numeric — it must go through esc().
const SAFE_NUMERIC_ID = /^(ci|i)$/;
// Pre-escaped HTML fragment assembled inside the shared `table(...)` helper.
// Every interpolation in the fragment is esc()-wrapped at construction time
// (see table-header-construction-escapes-all-interpolations.test.mjs), so
// splicing the fragment into an innerHTML template is safe.
const SAFE_TEMPLATE_VAR = /^(header)$/;
// Escaped `summaryText()` / `countText()` results of the same helper family.
//
// SAFE_CALL is the *return-type-proven* formatter list. Every entry below was
// individually audited against its dashboard definition:
//   - esc                 → lookup-table HTML escape (& < > " ')
//   - num / pct           → en-US locale number or nullish '—'
//   - date                → toLocaleDateString or nullish '—'
//   - formatValue         → finite-number check then num()/literal units
//   - rawQuarter          → `finite(...)` (Number.isFinite filter) or null
//   - scoreColor          → hex from the static SCORE_BANDS table or '#94a3b8'
//   - scoreTextColor      → literal '#13243a' / '#fff'
//   - monthLabel          → month name from a static array + numeric year,
//                           or String(m) — always esc()'d at its call sites,
//                           kept on the list as defense-in-depth
//   summaryText / countText → their bodies interpolate only esc() or
//   numeric `.length`/`.size`; the audited-body test below re-proves that
//   contract on every run.
// Formatters that were REMOVED from this list after audit (2026-09):
//   - tablePlain → returns the raw cell value (String(v)); it feeds the
//     filter-panel option Set, never an innerHTML sink. It must not be
//     classifiable as safe for an innerHTML sink.
//   - tableCell  → `esc(v ?? '—')` fallback, but with a column formatter it
//     returns `c.fmt(v,r)` unescaped. That is only safe because (a) every
//     innerHTML use of `c.fmt` output is itself wrapped in esc() at the sink
//     (KPIS/call-site contract below) and (b) the table(...) sink's row
//     template is the audited `${esc(c.cls)||''}${tableCell(c,r)}` exact
//     expression registered in SAFE_EXACT_EXPRESSIONS. The column-formatter
//     test re-proves the esc-at-sink contract on every run, so the
//     name-based allow stays narrow and monitored.
//   - shortMonth / monthName / targetStatus / formatValue / rawQuarter /
//     scoreColor / scoreTextColor / poolPeople / TARGET_QUARTERS → either
//     do not exist in the scanned dashboards or never appear as a raw
//     innerHTML interpolation; keeping their names on a global allow-list
//     would launder any future helper that happens to share the name.
//     `formatValue`-style number-only helpers remain safe *at their call
//     sites* because those sites wrap them in esc().
const SAFE_CALL = /^(esc|num|pct|date|monthLabel|summaryText|countText)\(/;
// Optional chained property access on a SAFE_CALL result is also allowed.
const SAFE_TRAILER = /^(\.[a-zA-Z_$][\w$]*|\?\.|\?\?\s*(?:null|''|""))*$/;
// Exact, whitespace-normalised expressions that the broad regexes above
// intentionally do NOT cover. Each entry is a full literal match — a future
// call site that differs in any character falls through to `unsafe`.
//
// Reviewed forms:
//   - `esc(c.cls)||''` / `esc(c.sub)||''` — esc() result OR static literal.
//   - `tableCell(c,r)` — audited above; every other `c.fmt` HTML return is
//     esc()-protected by the column-formatter-returns-safe-html test.
const SAFE_EXACT_EXPRESSIONS = new Set([
  "esc(c.cls)||''",
  "esc(c.sub)||''",
  "tableCell(c,r)",
]);
// Numeric arithmetic over literal numbers (layout math), e.g. `920/4`,
// `x*1.15`. A dynamic indexed value must never reach this rule — indexed
// access is only ever safe when wrapped in esc() (see negative cases).
const NUM_LITERAL = /\d+(?:\.\d+)?/;
const SAFE_ARITHMETIC = new RegExp(
  `^${NUM_LITERAL.source}(?:\\s*[+\\-*/]\\s*${NUM_LITERAL.source})+(?:\\.toFixed\\(\\d+\\))?$`,
);

function isStaticTernary(e) {
  const branches = e.match(/\?\s*(?:"[^"]*"|''|'[^']*')\s*:\s*(?:"[^"]*"|''|'[^']*')$/);
  if (!branches) return false;
  const cond = e.slice(0, e.length - branches[0].length);
  return !/^\s*$/.test(cond) && !/[$]/.test(cond) && !/`/.test(cond);
}

function classifyInterpolation(expr) {
  const e = expr.trim();
  if (SAFE_PRIMITIVE.test(e)) return 'safe-primitive';
  if (SAFE_TERNARY.test(e) || isStaticTernary(e)) return 'safe-ternary';
  if (SAFE_NUMERIC_ID.test(e)) return 'safe-numeric-id';
  if (SAFE_TEMPLATE_VAR.test(e)) return 'safe-template-var';
  if (SAFE_EXACT_EXPRESSIONS.has(e)) return 'safe-exact-expression';
  if (SAFE_ARITHMETIC.test(e)) return 'safe-numeric-arithmetic';
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
  //   - a return-type-proven safe formatter (num/pct/date/formatValue/...)
  //   - a numeric literal / arithmetic / static ternary
  //   - a lookup into a statically-defined literal table
  // Anything else (a bare identifier, state.*, DATA.*, r[k], option,
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

test('innerHTML-fragment variables must have every interpolation esc()-protected', () => {
  // `${header}` is on SAFE_TEMPLATE_VAR only because the shared table(...)
  // helper builds it from fully esc()-protected parts. If a future edit drops
  // an esc() there, the fragment would smuggle raw data into the sink — this
  // test fails first.
  for (const path of dashboards) {
    const src = readFileSync(path, 'utf8');
    let m;
    const re = /(?:const|let|var)\s+(header|tableHeader|tableBody|tableSvg)\s*=\s*`/g;
    while ((m = re.exec(src))) {
      const varName = m[1];
      let j = m.index + m[0].length;
      while (j < src.length) {
        if (src[j] === '\\' && j + 1 < src.length) { j += 2; continue; }
        if (src[j] === '`') break;
        j++;
      }
      const tpl = src.slice(m.index + m[0].length, j);
      const innerRe = /\$\{([\s\S]*?)\}/g;
      let inner;
      while ((inner = innerRe.exec(tpl))) {
        const e = inner[1];
        const cls = classifyInterpolation(e);
        if (cls.startsWith('unsafe:') || cls === 'safe-numeric-id') {
          // A raw loop-index number in an attribute is tolerated elsewhere,
          // but a fragment variable must not even carry one — keep it strict.
          assert.fail(
            `${path}: fragment variable "${varName}" interpolates "${e}" (classified ${cls}); every part must be esc()-wrapped or a verified safe formatter`,
          );
        }
        // Nested fragments: the filter-row `c.cls||''` must be esc()-protected too.
        if (/^(?!esc\()[a-zA-Z_$][\w$]*(\|\||&&|\?|\.)/.test(e.trim())) {
          assert.fail(
            `${path}: fragment variable "${varName}" interpolates unescaped expression "${e}"`,
          );
        }
      }
    }
  }
});

test('column formatters rendered through tableCell return esc()-safe HTML', () => {
  // `tableCell(c,r)` returns `c.fmt(v,r)` unescaped. The exact-string allow
  // entry for `tableCell(c,r)` is therefore only justified while every
  // `fmt:` callback used with the shared table(...) helper returns either a
  // plain formatted value (num/pct/date — all en-US locale numbers or '—')
  // or an HTML fragment whose every interpolation is esc()-wrapped. A future
  // `fmt: v => \`<b>${v}</b>\`` would smuggle data into the sink — this test
  // fails first.
  const SAFE_FMT_PREFIX = /^(esc|num|pct|date)\(/;
  for (const path of dashboards) {
    const src = readFileSync(path, 'utf8');
    // fmt callbacks appear as `['key','Label',<expr>...]` column defs.
    for (const m of src.matchAll(/\['[^']+','[^']+',([a-zA-Z_$][\w$]*)=>([^\]\n]{1,120})/g)) {
      const body = m[2].trim();
      // HTML-returning callback (template literal body): all interps safe?
      if (body.startsWith('`')) {
        const end = body.indexOf('`', 1);
        assert.notEqual(end, -1, `${path}: unterminated template in fmt callback ${JSON.stringify(body.slice(0, 60))}`);
        const tpl = body.slice(1, end);
        for (const im of tpl.matchAll(/\$\{([^}]*)\}/g)) {
          assert.ok(
            SAFE_FMT_PREFIX.test(im[1].trim()),
            `${path}: fmt callback interpolates raw "${im[1]}" — must be esc()/num/pct/date wrapped`,
          );
        }
      }
    }
  }
});

test('classification rejects the documented negative regression cases', () => {
  // Each of these would be a real XSS vector if it reached innerHTML raw.
  // The classifier must label them as UNSAFE — tolerating any "safe" bucket
  // here would let a broad allow-list creep back in unnoticed.
  const negatives = [
    '${userInput}',          // bare identifier — attacker-controlled name
    '${state.search}',       // bare state.* member — runtime attacker-controlled
    '${DATA.label}',         // bare DATA.* member — JSON-driven attacker-controlled
    '${option}',             // bare identifier in dropdown loop
    // Bare identifier interpolation of a runtime-derived (not template-literal
    // constant) string — would smuggle HTML into the rendered sink.
    '${runtimeLabel}',
    // Indexed access through a dynamic or literal-free key. The key being a
    // loop index proves nothing about the VALUE; all three were classified
    // "safe-indexed-access" by the blanket regex until 2026-09.
    '${r[k]}',
    '${row[i]}',
    '${c[3]}',
    // Same value families the blanket regex used to launder through ?? ''
    '${r[k] ?? \'\'}',
    '${counts[k]||0}',
    '${order}',
  ];
  for (const expr of negatives) {
    const inner = expr.replace(/^\$\{|\}$/g, '');
    const cls = classifyInterpolation(inner);
    assert.ok(cls.startsWith('unsafe:'),
      `expected "${inner}" to be classified as unsafe (got ${cls})`);
  }
});
