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

test('Web Editor uses one source surface and persists one HTML file directly under Editor',()=>{
  assert.match(app,/const HTML_MIME='text\/html'/);
  assert.match(app,/createFolder\(\{name:'Editor',parent:rootId\}\)/);
  assert.match(app,/createFile\(\{name:fileName,parent:editorFolderId,blob,mime:HTML_MIME\}\)/);
  assert.match(app,/updateFileContent\(target\.id,blob\)/);
  assert.match(app,/one HTML file in Workspace \/ Editor/);
  assert.match(app,/data-web-source spellcheck="false"/);
  assert.doesNotMatch(app,/data-web-tab=/);
  assert.doesNotMatch(app,/role="tablist"/);
});

test('legacy three-file projects remain readable and convert into a single HTML document',()=>{
  assert.match(app,/function mergeLegacySources/);
  assert.match(app,/byName\.get\('style\.css'\)/);
  assert.match(app,/byName\.get\('script\.js'\)/);
  assert.match(app,/legacy project loaded · save to convert/);
});

test('Workspace routes only HTML documents to Web Editor while standalone CSS and JavaScript stay editable in Notepad',()=>{
  assert.match(workspace,/function isWebSource\(node\).*return \/\\\.html\?\$\/\.test\(name\)\|\|mime==='text\/html'/s);
  assert.match(workspace,/function isCodeText\(node\).*application\/javascript.*\\\.\(\?:css\|m\?js\)/s);
  assert.match(workspace,/if\(isWebSource\(node\)\)apps\.open\('web-editor',\{fileId:node\.id\}\);else if\(isCodeText\(node\)\)apps\.open\('notepad',\{fileId:node\.id\}\)/);
});

test('preview transport never runs authored code in the AizanoiOS shell and reports runner startup failures',()=>{
  assert.match(app,/sandbox="allow-scripts"/);
  assert.doesNotMatch(app,/srcdoc|allow-same-origin|allow-top-navigation|allow-popups|allow-forms/);
  assert.match(app,/postMessage\(\{type:MESSAGE_RUN/);
  assert.match(app,/Preview could not start\. The server preview policy may be missing or blocked\./);
  assert.match(runner,/event\.source!==parent/);
  assert.match(runner,/new Function/);
  assert.doesNotMatch(runner,/indexedDB|localStorage|sessionStorage/);
});

test('Web Editor removes duplicate chrome and keeps a compact one-toolbar split view',()=>{
  assert.doesNotMatch(app,/az-app-toolbar/);
  assert.doesNotMatch(css,/az-web-editor-tabs|az-web-editor-tab|az-web-editor-preview-head/);
  assert.match(css,/\.az-web-editor-layout[\s\S]*grid-template-columns/);
  assert.match(css,/\.az-web-editor-security[\s\S]*position:absolute/);
});

test('Web Editor functional type never drops below 11px',()=>{
  const tiny=[...css.matchAll(/font(?:-size)?\s*:\s*([0-9.]+)px/gi)].map((match)=>Number(match[1])).filter((value)=>value>0&&value<11);
  assert.deepEqual(tiny,[]);
});
