import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');
const manifest=JSON.parse(read('frontend/js/v3/apps/web-editor/manifest.json'));
const app=read('frontend/js/v3/apps/web-editor/src/app.js');
const capabilities=read('frontend/js/v3/apps/web-editor/src/capabilities.js');
const runner=read('frontend/web-editor-preview/runner.js');
const workspace=read('frontend/js/v3/apps/workspace/src/app.js');
const registry=read('frontend/js/v3/registry.js');
const generated=read('frontend/js/v3/module-registry.generated.js');
const css=read('frontend/js/v3/apps/web-editor/src/web-editor.css');

test('Aizanoi Web Editor is a discoverable capability-scoped desktop module',()=>{
  assert.equal(manifest.id,'web-editor');
  assert.equal(manifest.entry,'./src/index.js');
  assert.deepEqual(manifest.requires,['filesystem','dialog','notifications','sound']);
  assert.match(generated,/id: "web-editor"[\s\S]*entry: "\/js\/v3\/apps\/web-editor\/src\/index\.js"/);
  assert.match(registry,/id:'web-editor'.*icon:'\/assets\/icons\/web-editor\.svg'/s);
  assert.ok(existsSync('frontend/assets/icons/web-editor.svg'));
  for(const method of ['allNodes','childrenOf','createFile','createFolder','getNode','readFileBlob','updateFileContent'])assert.match(capabilities,new RegExp(`['"]${method}['"]`));
});

test('Web Editor persists the canonical three-file project shape under Editor',()=>{
  assert.match(app,/FILES=Object\.freeze\(\{html:'index\.html',css:'style\.css',js:'script\.js'\}\)/);
  assert.match(app,/createFolder\(\{name:'Editor',parent:rootId\}\)/);
  assert.match(app,/createFile\(\{name,parent:folderId,blob,mime:MIME\[key\]\}\)/);
  assert.match(app,/updateFileContent\(existing\.id,blob\)/);
  assert.match(app,/Workspace \/ Editor/);
});

test('Workspace routes web source files to Web Editor before generic text handling',()=>{
  assert.match(workspace,/function isWebSource/);
  assert.match(workspace,/if\(isWebSource\(node\)\)apps\.open\('web-editor',\{fileId:node\.id\}\);else if\(mime\.startsWith\('text\/'\)/);
});

test('preview transport never runs authored code in the AizanoiOS shell',()=>{
  assert.match(app,/sandbox="allow-scripts"/);
  assert.doesNotMatch(app,/srcdoc|allow-same-origin|allow-top-navigation|allow-popups|allow-forms/);
  assert.match(app,/postMessage\(\{type:MESSAGE_RUN/);
  assert.match(runner,/event\.source!==parent/);
  assert.match(runner,/new Function/);
  assert.doesNotMatch(runner,/indexedDB|localStorage|sessionStorage/);
});

test('Web Editor functional type never drops below 11px',()=>{
  const tiny=[...css.matchAll(/font(?:-size)?\s*:\s*([0-9.]+)px/gi)].map((match)=>Number(match[1])).filter((value)=>value>0&&value<11);
  assert.deepEqual(tiny,[]);
});
