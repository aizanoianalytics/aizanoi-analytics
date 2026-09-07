import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=process.cwd();
const read=(p)=>readFileSync(path.join(root,p),'utf8');
const worlds=[
  ['aizanoi-225','Aizanoi'],['rome-410-476','Rome'],['athens-450-430','Athens'],['iga-airport','Istanbul Airport']
];
function walk(dir,out=[]){for(const item of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);item.isDirectory()?walk(p,out):out.push(p);}return out;}

test('worlds are canonical and legacy runtime trees are redirect-only',()=>{
  assert.equal(existsSync('frontend/ancient-world'),false);
  const legacy={
    'frontend/historic-world':['index.html'],
    'frontend/ancient-cities':['athens-450-430/index.html','index.html','rome-410-476/index.html'],
    'frontend/iga':['index.html'],
  };
  for(const [dir,expected] of Object.entries(legacy)){
    const files=walk(dir).map((p)=>path.relative(dir,p).replaceAll('\\','/')).sort();
    assert.deepEqual(files,expected.sort(),`${dir} contains non-redirect legacy runtime files`);
  }
  for(const [slug] of worlds)assert.ok(existsSync(`frontend/worlds/${slug}/index.html`),`${slug} missing`);
});

test('four entry pages use local strict-CSP-compatible static resources',()=>{
  for(const [slug,name] of worlds){
    const html=read(`frontend/worlds/${slug}/index.html`);
    assert.match(html,new RegExp(`<link rel="canonical" href="https://aizanoianalytics\\.com/worlds/${slug}/">`));
    assert.match(html,/href="\.\.\/shared\/css\/base-theme\.css"/);
    const entry=slug==='aizanoi-225'?'bootstrap':'main';
    assert.match(html,new RegExp(`type="module" src="\\.\\/js\\/${entry}\\.js"`));
    assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>|<style\b|style="|type="importmap"/i,`${name} reintroduced inline runtime content`);
  }
  for(const file of walk('frontend/worlds/shared/engine').filter((p)=>p.endsWith('.js'))){assert.doesNotMatch(readFileSync(file,'utf8'),/\.style\.cssText\s*=/,`${path.relative(root,file)} reintroduced cssText`);}
});

test('one local Three.js r174 vendor serves every world with no runtime CDN or model files',()=>{
  const vendor=walk('frontend/worlds').filter((p)=>/three\.(?:core|module)\.js$/.test(p.replaceAll('\\','/')));
  assert.deepEqual(vendor.map((p)=>path.relative(root,p).replaceAll('\\','/')).sort(),[
    'frontend/worlds/shared/vendor/three.core.js','frontend/worlds/shared/vendor/three.module.js'
  ]);
  assert.match(read('frontend/worlds/shared/vendor/three.core.js'),/const REVISION = '174'/);
  const files=walk('frontend/worlds');
  for(const file of files){
    const rel=path.relative(root,file).replaceAll('\\','/');
    assert.doesNotMatch(rel,/\.(?:gltf|glb|bat|sh)$/i);
    if(!/\.(?:js|html|css|md)$/.test(file))continue;
    const source=readFileSync(file,'utf8');
    assert.doesNotMatch(source,/\b(?:import|from)\s*\(?\s*['"]https?:\/\//,`${rel} has a runtime CDN import`);
  }
});

test('all authored relative module imports resolve and use the shared runtime',()=>{
  const js=walk('frontend/worlds').filter((p)=>p.endsWith('.js')&&!p.includes(`${path.sep}vendor${path.sep}`));
  for(const file of js){
    const src=readFileSync(file,'utf8');
    for(const m of src.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)){
      const spec=m[1]; if(!spec.startsWith('.'))continue;
      const target=path.resolve(path.dirname(file),spec);
      assert.ok(existsSync(target),`${path.relative(root,file)} -> ${spec} missing`);
    }
  }
  for(const [slug] of worlds){const main=read(`frontend/worlds/${slug}/js/main.js`);assert.match(main,/\.\.\/\.\.\/shared\/engine\/controls\.js/);assert.match(main,/\.\.\/\.\.\/shared\/engine\/collision\.js/);assert.match(main,/__WORLD_DEBUG__/);}
  assert.match(read('frontend/worlds/aizanoi-225/js/bootstrap.js'),/import\(['"]\.\/main\.js['"]\)/);
});

test('source-led hero records survive the migration without certainty inflation',async()=>{
  const specs=[
    ['aizanoi-225','js/city-data.js',['temple','macellum','theatre']],
    ['rome-410-476','js/city-data.js',['colosseum','pantheon']],
    ['athens-450-430','js/city-data.js',['parthenon','propylaea']],
    ['iga-airport','js/airport-data.js',['terminal','tower']],
  ];
  for(const [slug,file,ids] of specs){
    const mod=await import(pathToFileURL(path.join(root,'frontend/worlds',slug,file)).href+`?t=${Date.now()}-${slug}`);
    const found=new Set(mod.BUILDINGS.map((b)=>b.id));
    for(const id of ids)assert.ok(found.has(id),`${slug} missing ${id}`);
    assert.ok(mod.SOURCES.length>=2,`${slug} source ledger too small`);
    assert.ok(mod.BUILDINGS.every((b)=>b.evidence?.level),`${slug} has an unlabeled building evidence record`);
  }
  assert.doesNotMatch(read('frontend/worlds/aizanoi-225/js/city-data.js'),/world'?s earliest stock exchange/i);
  assert.match(read('frontend/worlds/iga-airport/js/airport-data.js'),/AECOM/i);
  assert.match(read('frontend/worlds/iga-airport/js/airport-data.js'),/Pininfarina/i);
});

test('registry, portal, sitemap builder and nginx agree on canonical routes',()=>{
  const registry=read('frontend/js/v3/registry.js'),portal=read('frontend/worlds/index.html'),news=read('scripts/news/build-news.mjs'),nginx=read('infra/nginx/aizanoianalytics.com.conf.example');
  for(const [slug] of worlds){const route=`/worlds/${slug}/`;assert.match(registry,new RegExp(route.replaceAll('/','\\/')));assert.match(portal,new RegExp(route.replaceAll('/','\\/')));assert.match(news,new RegExp(route.replaceAll('/','\\/')));assert.match(nginx,new RegExp(`location \\^~ ${route.replaceAll('/','\\/')}`));}
  assert.match(nginx,/location \^~ \/worlds\/shared\/[\s\S]*aizanoi-historical-world-security-headers\.conf/);
  for(const [legacy,target] of [['historic-world','worlds/aizanoi-225'],['iga','worlds/iga-airport']])assert.match(nginx,new RegExp(`/${legacy}[\\s\\S]*301 /${target}/`));
});
