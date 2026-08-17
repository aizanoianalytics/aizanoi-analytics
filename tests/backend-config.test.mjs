import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envExample = readFileSync(resolve(root, 'backend/.env.example'), 'utf8');
const server = readFileSync(resolve(root, 'backend/server.js'), 'utf8');

test('Google fallback uses the same environment key documented in .env.example', () => {
  assert.match(envExample, /^GOOGLE_API_KEY=/m);
  assert.doesNotMatch(envExample, /^GEMINI_API_KEY=/m);
  assert.match(server, /process\.env\.GOOGLE_API_KEY/);
});

test('backend remains bound to loopback behind the reverse proxy', () => {
  assert.match(server, /app\.listen\(PORT,\s*['"]127\.0\.0\.1['"]/);
});

test('terminal implementation does not dispatch user input through child_process shell execution', () => {
  assert.doesNotMatch(server, /require\(['"]child_process['"]\)/);
  assert.doesNotMatch(server, /from ['"]node:child_process['"]/);
  assert.match(server, /SAFE_COMMANDS/);
});
