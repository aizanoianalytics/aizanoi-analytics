import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read=(file)=>readFileSync(file,'utf8');
const index=read('frontend/index.html');
const registry=read('frontend/js/v3/registry.js');
const shell=read('frontend/js/v3/shell.js');
const brandHubs=read('frontend/js/v3/apps/brand-hubs.js');
const nginx=read('infra/nginx/aizanoianalytics.com.conf.example');

const retired=/Aizanoi AI|HR AI|\/hr-analytics\/|api\.groq\.com|generativelanguage\.googleapis\.com/i;
const retiredToolFiles=[
  'frontend/js/v3/archive-store.js',
  'frontend/js/v3/apps/archive.js',
  'frontend/js/v3/apps/research.js',
  'frontend/js/v3/apps/projects.js',
  'frontend/js/v3/apps/terminal.js',
  'frontend/js/v3/apps/monitor.js'
];

test('retired AI product is absent from canonical discovery surfaces',()=>{
  for(const [name,source] of Object.entries({index,registry,shell})) assert.doesNotMatch(source,retired,`${name} still exposes retired AI product`);
  assert.equal(existsSync('frontend/js/chat.js'),false);
  assert.equal(existsSync('frontend/assets/icons/aizanoi-ai.svg'),false);
});

test('retired Workbench implementation is absent instead of merely hidden',()=>{
  for(const file of retiredToolFiles) assert.equal(existsSync(file),false,`${file} returned after Workbench retirement`);
  for(const id of ['workbench','archive','notes','data-lab','source-reader','artifact-viewer','projects','terminal','monitor']) {
    assert.doesNotMatch(registry,new RegExp(`id:['\"]${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}['\"]`),`${id} returned to the public registry`);
  }
  assert.doesNotMatch(brandHubs,/Aizanoi Workbench|Local Data Lab|Open Data Lab|Field Archive|Field Notes|Source Reader|Artifact Viewer|Field Terminal|Workspace Monitor/i,'retired tool copy returned to a public hub');
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

test('cache locations preserve security headers and revalidate mutable unversioned code',()=>{
  assert.equal((nginx.match(/^\s*add_header\s+Cache-Control\b/gm)||[]).length,0,'location-level Cache-Control add_header can suppress inherited security headers');
  assert.match(nginx,/location \^~ \/styles\/[\s\S]*expires -1;/);
  assert.match(nginx,/location \^~ \/js\/[\s\S]*expires -1;/);
  assert.match(nginx,/location \^~ \/historic-world\/[\s\S]*expires -1;/);
  assert.match(nginx,/location \^~ \/ancient-cities\/rome-410-476\/[\s\S]*expires -1;/);
  assert.match(nginx,/location \^~ \/assets\/[\s\S]*expires 7d;/);
  assert.match(nginx,/X-Content-Type-Options/);
  assert.match(nginx,/Content-Security-Policy/);
});
