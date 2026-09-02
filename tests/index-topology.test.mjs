import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { discoverModules } from '../scripts/modules/build-module-registry.mjs';

const root=process.cwd();
const read=(file)=>readFileSync(path.join(root,file),'utf8');
const escapeRegExp=(value)=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function assertLocalLinksResolve(file){
  const source=read(file);
  const pattern=/\[[^\]]*\]\(([^)]+)\)/g;
  for(const match of source.matchAll(pattern)){
    const href=match[1].trim();
    if(!href||href.startsWith('#')||/^(?:https?:|mailto:)/i.test(href))continue;
    const clean=href.split('#')[0].split('?')[0];
    const target=path.resolve(root,path.dirname(file),clean);
    assert.ok(existsSync(target),`${file} links to missing repository path: ${href}`);
  }
}

test('root index routes every canonical top-level work area',()=>{
  const source=read('index.md');
  for(const area of ['frontend','content','analytics','scripts','tests','research','infra','docs']){
    assert.match(source,new RegExp(`\\]\(${area}\\/index\\.md\\)`),`root index must route ${area}`);
  }
  assert.match(source,/\.github\/workflows\//,'root index must route repository automation');
});

test('apps index stays synchronized with manifest discovery',async()=>{
  const source=read('frontend/js/v3/apps/index.md');
  const modules=await discoverModules();
  for(const module of modules){
    assert.match(source,new RegExp(`\\]\(${escapeRegExp(module.id)}\\/index\\.md\\)`),`apps index is missing ${module.id}`);
  }
});

test('major routers expose current independently maintained subsystems',()=>{
  assert.match(read('frontend/index.md'),/web-editor-preview\//);
  assert.match(read('frontend/index.md'),/Historical Worlds naming map/);
  assert.match(read('analytics/index.md'),/dashboards\/hr-analytics-full-set\/index\.md/);
  assert.match(read('research/index.md'),/athens_450_430\//);
  assert.match(read('research/index.md'),/rome_410_476\//);
  assert.match(read('infra/index.md'),/nginx\//);
  for(const doc of ['README.md','HERMES_OPERATIONS.md','OPERATIONS.md','ACCESSIBILITY.md','FIELD_SYSTEM.md']){
    assert.match(read('docs/index.md'),new RegExp(escapeRegExp(doc)));
  }
});

test('canonical navigation indexes contain no broken relative Markdown links',async()=>{
  const modules=await discoverModules();
  const files=[
    'index.md',
    'frontend/index.md',
    'frontend/js/v3/index.md',
    'frontend/js/v3/apps/index.md',
    'analytics/index.md',
    'analytics/dashboards/hr-analytics-full-set/index.md',
    'content/index.md',
    'research/index.md',
    'scripts/index.md',
    'scripts/modules/index.md',
    'tests/index.md',
    'infra/index.md',
    'docs/index.md',
    ...modules.map((module)=>`frontend/js/v3/apps/${module.id}/index.md`)
  ];
  for(const file of files)assertLocalLinksResolve(file);
});
