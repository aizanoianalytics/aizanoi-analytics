// Regression test: Historical Worlds (Rome, Athens, IGA, Aizanoi) and their
// shared engine must render without violating a strict Content Security Policy
// of `script-src 'self'; style-src 'self'`. Inline `<style>` blocks,
// `style.textContent = ...` on a created `<style>` element, and HTML
// `style="..."` attributes injected via innerHTML are all blocked by that
// policy. Individual element style property setters (e.g. `el.style.transform`)
// are still permitted and out of scope here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');

// Files that participate in Historical Worlds (Rome, Athens, Aizanoi, IGA)
// and the shared engine that bootstraps them. Touch controls and overlay
// label files are part of this surface per the task scope.
const engineFiles = [
  'frontend/ancient-world/engine/city-bootstrap.js',
  'frontend/ancient-world/engine/flat-city-runtime.js',
  'frontend/ancient-world/engine/city-compatibility.js',
  'frontend/ancient-world/engine/city-experience.js',
  'frontend/ancient-world/engine/city-experience.css',
  'frontend/ancient-world/engine/city-polish.css',
  'frontend/ancient-world/engine/city-experience.js',
  'frontend/ancient-world/engine/evidence.js',
  'frontend/ancient-world/engine/evidence-mode.js',
  'frontend/ancient-world/engine/navigation.js',
  'frontend/ancient-world/engine/mobile-controls.js',
  'frontend/ancient-world/engine/mobile-controls.css',
  'frontend/ancient-world/engine/landmark-framing.js',
  'frontend/ancient-world/engine/lifecycle.js',
  'frontend/ancient-world/engine/surface-shader.js',
  'frontend/ancient-world/engine/performance.js',
  'frontend/ancient-world/engine/traversal.js',
  'frontend/ancient-world/engine/evidence.js',
  'frontend/ancient-world/engine/environment-renderer.js',
];

const cityFiles = [
  'frontend/ancient-cities/rome-410-476/index.html',
  'frontend/ancient-cities/rome-410-476/js/app.js',
  'frontend/ancient-cities/rome-410-476/js/boot.js',
  'frontend/ancient-cities/rome-410-476/js/methodology.js',
  'frontend/ancient-cities/rome-410-476/css/terminal.css',
  'frontend/ancient-cities/athens-450-430/index.html',
  'frontend/ancient-cities/athens-450-430/js/app.js',
  'frontend/ancient-cities/athens-450-430/js/boot.js',
  'frontend/ancient-cities/athens-450-430/js/methodology.js',
  'frontend/ancient-cities/athens-450-430/css/terminal.css',
  'frontend/iga/index.html',
  'frontend/iga/js/app.js',
  'frontend/iga/js/boot.js',
  'frontend/iga/js/methodology.js',
  'frontend/iga/css/terminal.css',
  'frontend/historic-world/app.js',
  'frontend/historic-world/index.html',
];

// Forbidden runtime patterns. Each pattern targets a specific CSP violation:
//   `inlineStyleElement`: createElement('style') with .textContent write
//   `inlineStyleAttribute`: style="..." injected via innerHTML/template
//   `insertRule`: sheet.insertRule(...) for runtime-injected style rules
//
// Individual style property setters (el.style.X = Y) are NOT forbidden —
// they are still permitted under style-src 'self'.
const FORBIDDEN = [
  {
    name: 'inlineStyleElement',
    regex: /document\.createElement\(\s*['"]style['"]\s*\)/,
  },
  {
    name: 'inlineStyleAttribute',
    regex: /style\s*=\s*['"][^'"]*\$\{/,
  },
  {
    name: 'insertRule',
    regex: /\.insertRule\(/,
  },
];

// Detects a <style>.textContent = "..." assignment by looking for a CSS
// payload that starts with a selector-ish character and contains CSS braces.
// Plain element text writes (e.g. labels, numeric strings) never match.
const TEXT_CONTENT_STYLE_WRITE = /\.textContent\s*=\s*[`'"]\s*[.#@a-zA-Z][^`'"]*\{[^`'"]*\}/;

function collectIssues(relativePath) {
  const source = read(relativePath);
  const issues = [];
  for (const { name, regex } of FORBIDDEN) {
    if (regex.test(source)) {
      issues.push(`${relativePath} contains forbidden ${name} pattern (${regex})`);
    }
  }
  // textContent writes that look like a stylesheet payload (start with a CSS selector
  // or contain common CSS tokens) target the inline-style CSP rule.
  if (TEXT_CONTENT_STYLE_WRITE.test(source)) {
    issues.push(`${relativePath} writes a CSS payload via .textContent (CSP inline-style block)`);
  }
  return issues;
}

test('Historical Worlds shared engine avoids inline-style CSP violations', () => {
  const issues = engineFiles.flatMap(collectIssues);
  assert.deepEqual(issues, [], issues.join('\n') || 'unexpected inline-style content');
});

test('Rome, Athens, IGA and Aizanoi city code avoids inline-style CSP violations', () => {
  const issues = cityFiles.flatMap(collectIssues);
  assert.deepEqual(issues, [], issues.join('\n') || 'unexpected inline-style content');
});

test('historical-world nginx CSP is strict: no unsafe-inline in script-src or style-src', () => {
  const snippet = read('infra/nginx/snippets/aizanoi-historical-world-security-headers.conf.example');
  assert.doesNotMatch(snippet, /script-src[^;]*'unsafe-inline'/, 'historical CSP still permits unsafe-inline scripts');
  assert.doesNotMatch(snippet, /style-src[^;]*'unsafe-inline'/, 'historical CSP still permits unsafe-inline styles');
  assert.match(snippet, /script-src 'self';/);
  assert.match(snippet, /style-src 'self';/);
});

test('Historical World index pages link every required engine stylesheet', () => {
  // The new evidence / evidence-mode / navigation stylesheets must be linked
  // from every Historical World entry page so the previous `<style>` blocks
  // are replaced with same-origin stylesheets.
  const newSheets = [
    'evidence.css',
    'evidence-mode.css',
    'navigation.css',
  ];
  const indexPages = [
    'frontend/ancient-cities/rome-410-476/index.html',
    'frontend/ancient-cities/athens-450-430/index.html',
    'frontend/iga/index.html',
  ];
  for (const page of indexPages) {
    const html = read(page);
    for (const sheet of newSheets) {
      assert.match(
        html,
        new RegExp(`href=["'][^"']*${sheet.replace('.', '\\.')}["']`),
        `${page} does not link ${sheet}`,
      );
    }
  }
});