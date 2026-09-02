import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { discoverModules } from '../scripts/modules/build-module-registry.mjs';

const root=process.cwd();
const read=(file)=>readFileSync(path.join(root,file),'utf8');

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
    assert.ok(source.includes(`](${area}/index.md)`),`root index must route ${area}`);
  }
  assert.ok(source.includes('.github/workflows/'),'root index must route repository automation');
});

test('apps index stays synchronized with manifest discovery',async()=>{
  const source=read('frontend/js/v3/apps/index.md');
  const modules=await discoverModules();
  for(const module of modules){
    assert.ok(source.includes(`](${module.id}/index.md)`),`apps index is missing ${module.id}`);
  }
});

test('major routers expose current independently maintained subsystems',()=>{
  assert.ok(read('frontend/index.md').includes('web-editor-preview/'));
  assert.ok(read('frontend/index.md').includes('Historical Worlds naming map'));
  assert.ok(read('analytics/index.md').includes('dashboards/hr-analytics-full-set/index.md'));
  assert.ok(read('research/index.md').includes('athens_450_430/'));
  assert.ok(read('research/index.md').includes('rome_410_476/'));
  assert.ok(read('infra/index.md').includes('nginx/'));
  const docs=read('docs/index.md');
  for(const doc of ['README.md','HERMES_OPERATIONS.md','OPERATIONS.md','ACCESSIBILITY.md','FIELD_SYSTEM.md']){
    assert.ok(docs.includes(doc),`docs index is missing ${doc}`);
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
