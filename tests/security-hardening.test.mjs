import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read=(file)=>readFileSync(file,'utf8');
const index=read('frontend/index.html');
const registry=read('frontend/js/v3/registry.js');
const shell=read('frontend/js/v3/shell.js');
const archive=read('frontend/js/v3/archive-store.js');
const terminal=read('frontend/js/v3/apps/terminal.js');
const monitor=read('frontend/js/v3/apps/monitor.js');
const nginx=read('infra/nginx/aizanoianalytics.com.conf.example');

const retired=/Aizanoi AI|HR AI|\/hr-analytics\/|api\.groq\.com|generativelanguage\.googleapis\.com/i;

test('retired AI product is absent from canonical discovery surfaces',()=>{
  for(const [name,source] of Object.entries({index,registry,shell})) assert.doesNotMatch(source,retired,`${name} still exposes retired AI product`);
  assert.equal(existsSync('frontend/js/chat.js'),false);
  assert.equal(existsSync('frontend/assets/icons/aizanoi-ai.svg'),false);
});

test('terminal cannot issue network or server commands',()=>{
  assert.match(terminal,/browser-local field commands only/i);
  assert.doesNotMatch(terminal,/fetch\s*\(|XMLHttpRequest|WebSocket|\/api\/terminal\/exec/);
  assert.doesNotMatch(terminal,/child_process|\bexec\s*\(|\bspawn\s*\(/);
});

test('workspace monitor has no backend health dependency',()=>{
  assert.match(monitor,/navigator\.storage|storageEstimate/);
  assert.doesNotMatch(monitor,/\/api\/health|fetch\s*\(/);
});

test('archive accepts local files without egress primitives and normalizes restored metadata',()=>{
  assert.match(archive,/indexedDB\.open/);
  assert.match(archive,/MAX_FILE_BYTES/);
  assert.match(archive,/function normalizeMeta/);
  assert.match(archive,/tags:Array\.isArray\(raw\.tags\)/);
  assert.match(archive,/meta:normalizeMeta\(record\.meta, name\)/);
  assert.match(archive,/encoded\.length>Math\.ceil\(MAX_FILE_BYTES\*4\/3\)\+8/);
  assert.doesNotMatch(archive,/fetch\s*\(|XMLHttpRequest|WebSocket/);
});

test('shell escapes dynamic notification and command content',()=>{
  assert.match(shell,/function escapeHtml/);
  assert.match(shell,/escapeHtml\(title\)/);
  assert.match(shell,/escapeHtml\(body\)/);
  assert.match(shell,/escapeHtml\(row\.label\)/);
});

test('reverse proxy exposes no application backend',()=>{
  assert.match(nginx,/location = \/api\/chat[\s\S]*return 410;/);
  assert.match(nginx,/location \^~ \/api\/[\s\S]*return 404;/);
  assert.doesNotMatch(nginx,/proxy_pass|127\.0\.0\.1:3001/);
});

test('new shell no longer requires inline JavaScript CSP permission',()=>{
  assert.doesNotMatch(index,/<script(?![^>]*src=)[^>]*>/i);
  assert.match(nginx,/script-src 'self';/);
  assert.doesNotMatch(nginx,/script-src[^;]*'unsafe-inline'/);
  assert.match(nginx,/frame-src 'self' blob:/);
});

test('cache locations preserve inherited security headers on common nginx versions',()=>{
  assert.equal((nginx.match(/add_header Cache-Control/g)||[]).length,0,'location-level Cache-Control add_header can suppress inherited security headers');
  assert.match(nginx,/expires -1;/);
  assert.match(nginx,/expires 1d;/);
  assert.match(nginx,/X-Content-Type-Options/);
  assert.match(nginx,/Content-Security-Policy/);
});
