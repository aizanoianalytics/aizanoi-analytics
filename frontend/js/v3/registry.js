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
  { id:'worlds', label:'Historical Worlds', short:'Worlds', group:'research', icon:'/assets/icons/ancient-world.svg', module:'/js/v3/apps/worlds.js', description:'Aizanoi, Rome and Athens in one field index', keywords:['worlds','aizanoi','rome','athens','history','archaeology'] },
  { id:'archive', label:'Field Archive', short:'Archive', group:'research', icon:'/assets/icons/field-archive.svg', module:'/js/v3/apps/archive.js', description:'Local records, sources, datasets and captures', keywords:['archive','files','records','sources','local'] },
  { id:'notes', label:'Field Notes', short:'Notes', group:'research', icon:'/assets/icons/notepad.svg', module:'/js/v3/apps/research.js', description:'Observations, hypotheses and source reviews', keywords:['notes','write','observation','hypothesis'] },
  { id:'data-lab', label:'Data Lab', short:'Data', group:'research', icon:'/assets/icons/data-lab.svg', module:'/js/v3/apps/research.js', description:'Inspect local CSV and JSON datasets', keywords:['data','csv','json','table','dataset'] },
  { id:'source-reader', label:'Source Reader', short:'Sources', group:'research', icon:'/assets/icons/source-reader.svg', module:'/js/v3/apps/research.js', description:'Read local PDF, Markdown and text sources', keywords:['source','reader','pdf','markdown','citation'] },
  { id:'artifact-viewer', label:'Artifact Viewer', short:'Viewer', group:'research', icon:'/assets/icons/artifact-viewer.svg', module:'/js/v3/apps/research.js', description:'Inspect visual records with provenance', keywords:['artifact','image','viewer','photo','provenance'] },
  { id:'projects', label:'Projects', short:'Projects', group:'research', icon:'/assets/icons/projects.svg', module:'/js/v3/apps/projects.js', description:'Field System, Historical Worlds and research work', keywords:['projects','field system','historical worlds','research'] },
  { id:'terminal', label:'Field Terminal', short:'Terminal', group:'tools', icon:'/assets/icons/terminal.svg', module:'/js/v3/apps/terminal.js', description:'Browser-only commands for the field workspace', keywords:['terminal','command','worlds','evidence','session'] },
  { id:'monitor', label:'Workspace Monitor', short:'Monitor', group:'tools', icon:'/assets/icons/workspace-monitor.svg', module:'/js/v3/apps/monitor.js', description:'Real local storage, session and PWA status', keywords:['monitor','storage','offline','pwa','session','viewport'] },
  { id:'videos', label:'Aizanoi TV', short:'TV', group:'tools', icon:'/assets/icons/aizanoi-tv.svg', module:'/js/v3/apps/media.js', description:'Walkthroughs, methods and field stories', keywords:['video','tv','walkthrough','method','story'] },
  { id:'games', label:'Experiments', short:'Games', group:'tools', icon:'/assets/icons/games.svg', module:'/js/v3/apps/games.js', description:'Small local interaction experiments', keywords:['games','experiments','snake','mines','brick'] }
]);

const APP_MAP = new Map(APPS.map((app) => [app.id, app]));
const WORLD_MAP = new Map(WORLDS.map((world) => [world.id, world]));

export function appById(id) { return APP_MAP.get(String(id || '')) || null; }
export function worldById(id) { return WORLD_MAP.get(String(id || '')) || null; }
export function appsByGroup(group) { return APPS.filter((app) => app.group === group); }
export function searchableEntries() {
  return [
    ...WORLDS.map((world) => ({ type:'world', id:world.id, label:world.label, description:world.era, keywords:[world.label,world.era,world.summary] })),
    ...APPS.map((app) => ({ type:'app', id:app.id, label:app.label, description:app.description, keywords:[app.label,app.short,app.description,...app.keywords] }))
  ];
}
