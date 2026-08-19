import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envExample = readFileSync(resolve(root, 'backend/.env.example'), 'utf8');
const server = readFileSync(resolve(root, 'backend/server.js'), 'utf8');

test('external AI integration is removed fail-closed', () => {
  assert.doesNotMatch(envExample, /GROQ_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY/);
  assert.doesNotMatch(server, /api\.groq\.com|generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(server, /GROQ_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY/);
  assert.match(server, /app\.all\(['"]\/api\/chat['"]/);
  assert.match(server, /status\(410\)/);
  assert.match(server, /aiEnabled:\s*false/);
});

test('backend remains bound to loopback behind the reverse proxy', () => {
  assert.match(server, /app\.listen\(PORT,\s*['"]127\.0\.0\.1['"]/);
});

test('sensitive POST endpoint rejects untrusted request origins', () => {
  assert.match(server, /function requireTrustedOrigin/);
  assert.match(server, /app\.use\(['"]\/api\/terminal\/exec['"],\s*requireTrustedOrigin/);
  assert.match(server, /Cross-site request rejected/);
});

test('terminal implementation never dispatches user input through a shell', () => {
  assert.doesNotMatch(server, /require\(['"]child_process['"]\)/);
  assert.doesNotMatch(server, /from ['"]node:child_process['"]/);
  assert.doesNotMatch(server, /\bexec\s*\(/);
  assert.doesNotMatch(server, /\bspawn\s*\(/);
  assert.match(server, /SAFE_COMMANDS/);
  assert.match(server, /SANDBOX_DIR/);
});
