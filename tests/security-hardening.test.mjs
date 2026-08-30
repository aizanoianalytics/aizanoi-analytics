import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read=(file)=>readFileSync(file,'utf8');
const index=read('frontend/index.html');
const registry=read('frontend/js/v3/registry.js');
const shell=read('frontend/js/v3/shell.js');
const productModules=[
  'frontend/js/v3/apps/analytics/src/app.js',
  'frontend/js/v3/apps/forge/src/app.js',
  'frontend/js/v3/apps/journal/src/app.js',
  'frontend/js/v3/apps/labs/src/app.js',
  'frontend/js/v3/apps/news/src/app.js'
].map(read).join('\n');
const nginx=read('infra/nginx/aizanoianalytics.com.conf.example');
const staticHeaders=read('infra/nginx/snippets/aizanoi-static-security-headers.conf.example');
const historicalHeaders=read('infra/nginx/snippets/aizanoi-historical-world-security-headers.conf.example');
const hrAnalyticsHeaders=read('infra/nginx/snippets/aizanoi-hr-analytics-security-headers.conf.example');

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
  assert.equal(existsSync('frontend/js/v3/apps/brand-hubs.js'),false,'retired shared brand hub returned');
  assert.doesNotMatch(productModules,/Aizanoi Workbench|Local Data Lab|Open Data Lab|Field Archive|Field Notes|Source Reader|Artifact Viewer|Field Terminal|Workspace Monitor/i,'retired tool copy returned to a product module');
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
  assert.doesNotMatch(index,/<script(?![^>]*type="application\/ld\+json")(?![^>]*src=)[^>]*>/i);
  assert.match(index,/<script type="application\/ld\+json">/);
  assert.match(nginx,/include snippets\/aizanoi-static-security-headers\.conf;/);
  assert.match(staticHeaders,/script-src 'self';/);
  assert.doesNotMatch(staticHeaders,/script-src[^;]*'unsafe-inline'/);
  assert.match(staticHeaders,/frame-src 'self' https:\/\/www\.youtube\.com/);
  assert.match(historicalHeaders,/script-src 'self' 'unsafe-inline';/,'Historical Worlds retain their explicitly scoped inline bootstrap policy');
  assert.match(nginx,/location \^~ \/analytics\/dashboards\/hr-analytics-full-set\/[\s\S]*include snippets\/aizanoi-hr-analytics-security-headers\.conf;/);
  assert.match(hrAnalyticsHeaders,/script-src 'self' 'unsafe-inline';/,'Original self-contained HR exports retain their route-scoped inline policy');
  assert.match(hrAnalyticsHeaders,/style-src 'self' 'unsafe-inline';/);
});

test('cache locations preserve security headers and revalidate mutable unversioned code',()=>{
  assert.equal((nginx.match(/^\s*add_header\s+Cache-Control\b/gm)||[]).length,0,'location-level Cache-Control add_header can suppress inherited security headers');
  assert.match(nginx,/location \^~ \/styles\/[\s\S]*expires -1;/);
  assert.match(nginx,/location \^~ \/js\/[\s\S]*expires -1;/);
  assert.match(nginx,/location \^~ \/historic-world\/[\s\S]*expires -1;/);
  assert.match(nginx,/location \^~ \/ancient-cities\/[\s\S]*expires -1;/);
  assert.match(nginx,/location \^~ \/assets\/[\s\S]*expires 7d;/);
  assert.match(staticHeaders,/X-Content-Type-Options/);
  assert.match(staticHeaders,/Content-Security-Policy/);
  assert.match(historicalHeaders,/X-Content-Type-Options/);
  assert.match(historicalHeaders,/Content-Security-Policy/);
  assert.match(hrAnalyticsHeaders,/X-Content-Type-Options/);
  assert.match(hrAnalyticsHeaders,/Content-Security-Policy/);
});
