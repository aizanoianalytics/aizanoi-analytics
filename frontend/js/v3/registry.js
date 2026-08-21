export const WORLDS = Object.freeze([
  {
    id:'aizanoi', label:'Aizanoi', era:'Roman Phrygia · c. AD 2nd–3rd century', route:'/historic-world/',
    summary:'Temple of Zeus, theatre–stadium, Penkalas riverfront and a source-led reconstruction of the ancient city.',
    duration:'10 min guided survey', evidence:'Documented + archaeological + inferred', accent:'brass'
  },
  {
    id:'rome', label:'Rome', era:'Late Antiquity · AD 410–476', route:'/ancient-cities/rome-410-476/',
    summary:'Walk a transformed imperial capital from the Forum and Colosseum to churches, baths and dense late-antique districts.',
    duration:'Free explore', evidence:'Source-led + explicitly inferred fabric', accent:'rust'
  },
  {
    id:'athens', label:'Athens', era:'Classical period · c. 432–430 BCE', route:'/ancient-cities/athens-450-430/',
    summary:'Move between the Acropolis, Agora, Pnyx and civic landscape with reconstruction confidence kept visible.',
    duration:'Free explore', evidence:'Source-led + explicitly inferred fabric', accent:'teal'
  }
]);

export const APPS = Object.freeze([
  { id:'news', label:'Aizanoi News', short:'News', group:'media', icon:'/assets/icons/source-reader.svg', module:'/js/v3/apps/brand-hubs.js', description:'Original source-linked daily briefings across technology, markets, world, sports and culture', keywords:['news','daily','technology','markets','economy','sports','culture','sources'] },
  { id:'videos', label:'Aizanoi TV', short:'TV', group:'media', icon:'/assets/icons/aizanoi-tv.svg', module:'/js/v3/apps/media.js', description:'The English-language Aizanoi channel for AI, technology, markets, cinema, football and conversations', keywords:['video','youtube','ai','technology','markets','cinema','football','conversation'] },
  { id:'analytics', label:'Aizanoi Analytics', short:'Analytics', group:'studio', icon:'/assets/icons/data-lab.svg', module:'/js/v3/apps/brand-hubs.js', description:'Public dashboards, data products, model comparisons and analytical utilities', keywords:['analytics','dashboard','data','markets','models','tools'] },
  { id:'worlds', label:'Historical Worlds', short:'Worlds', group:'explore', icon:'/assets/icons/ancient-world.svg', module:'/js/v3/apps/worlds.js', description:'Evidence-aware walkable Aizanoi, Rome and Athens', keywords:['worlds','aizanoi','rome','athens','history','archaeology'] },
  { id:'forge', label:'Aizanoi Forge', short:'Forge', group:'studio', icon:'/assets/icons/projects.svg', module:'/js/v3/apps/brand-hubs.js', description:'Source, builds and open projects with GitHub as the canonical source of truth', keywords:['forge','source','github','code','open source','builds','projects'] },
  { id:'journal', label:'Aizanoi Journal', short:'Journal', group:'media', icon:'/assets/icons/notepad.svg', module:'/js/v3/apps/brand-hubs.js', description:'Analysis, essays, commentary and long-form research', keywords:['journal','analysis','essay','commentary','research','opinion'] },
  { id:'labs', label:'Aizanoi Labs', short:'Labs', group:'explore', icon:'/assets/icons/workspace-monitor.svg', module:'/js/v3/apps/brand-hubs.js', description:'Experimental, prototype and archived technical ideas', keywords:['labs','experiment','prototype','webgl','webgpu','creative coding'] },
  { id:'games', label:'Aizanoi Arcade', short:'Arcade', group:'explore', icon:'/assets/icons/games.svg', module:'/js/v3/apps/games.js', description:'Playable local browser games', keywords:['games','arcade','snake','mines','brick','play'] },
  { id:'workbench', label:'Aizanoi Workbench', short:'Workbench', group:'studio', icon:'/assets/icons/field-archive.svg', module:'/js/v3/apps/brand-hubs.js', description:'Local research and power tools collected behind one workspace', keywords:['workbench','archive','notes','data','sources','terminal','monitor'] }
]);

export const WORKBENCH_APPS = Object.freeze([
  { id:'archive', label:'Field Archive', short:'Archive', group:'workbench', icon:'/assets/icons/field-archive.svg', module:'/js/v3/apps/archive.js', description:'Local records, sources, datasets and captures', keywords:['archive','files','records','sources','local'] },
  { id:'notes', label:'Field Notes', short:'Notes', group:'workbench', icon:'/assets/icons/notepad.svg', module:'/js/v3/apps/research.js', description:'Observations, hypotheses and source reviews', keywords:['notes','write','observation','hypothesis'] },
  { id:'data-lab', label:'Data Lab', short:'Data', group:'workbench', icon:'/assets/icons/data-lab.svg', module:'/js/v3/apps/research.js', description:'Inspect local CSV and JSON datasets', keywords:['data','csv','json','table','dataset'] },
  { id:'source-reader', label:'Source Reader', short:'Sources', group:'workbench', icon:'/assets/icons/source-reader.svg', module:'/js/v3/apps/research.js', description:'Read local PDF, Markdown and text sources', keywords:['source','reader','pdf','markdown','citation'] },
  { id:'artifact-viewer', label:'Artifact Viewer', short:'Viewer', group:'workbench', icon:'/assets/icons/artifact-viewer.svg', module:'/js/v3/apps/research.js', description:'Inspect visual records with provenance', keywords:['artifact','image','viewer','photo','provenance'] },
  { id:'projects', label:'Projects', short:'Projects', group:'workbench', icon:'/assets/icons/projects.svg', module:'/js/v3/apps/projects.js', description:'Internal project and research workspace', keywords:['projects','historical worlds','research'] },
  { id:'terminal', label:'Field Terminal', short:'Terminal', group:'workbench', icon:'/assets/icons/terminal.svg', module:'/js/v3/apps/terminal.js', description:'Browser-only commands for the local workspace', keywords:['terminal','command','worlds','evidence','session'] },
  { id:'monitor', label:'Workspace Monitor', short:'Monitor', group:'workbench', icon:'/assets/icons/workspace-monitor.svg', module:'/js/v3/apps/monitor.js', description:'Real local storage, session and PWA status', keywords:['monitor','storage','offline','pwa','session','viewport'] }
]);

export const ALL_APPS = Object.freeze([...APPS, ...WORKBENCH_APPS]);

const APP_MAP = new Map(ALL_APPS.map((app) => [app.id, app]));
const WORLD_MAP = new Map(WORLDS.map((world) => [world.id, world]));

export function appById(id) { return APP_MAP.get(String(id || '')) || null; }
export function worldById(id) { return WORLD_MAP.get(String(id || '')) || null; }
export function appsByGroup(group) { return ALL_APPS.filter((app) => app.group === group); }
export function searchableEntries() {
  return [
    ...WORLDS.map((world) => ({ type:'world', id:world.id, label:world.label, description:world.era, keywords:[world.label,world.era,world.summary] })),
    ...APPS.map((app) => ({ type:'app', id:app.id, label:app.label, description:app.description, keywords:[app.label,app.short,app.description,...app.keywords] }))
  ];
}
