import { enabledModuleById } from './module-registry.generated.js';
import { STATIC_SEARCH_ENTRIES } from './search-index.generated.js';

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

const APP_DEFINITIONS = Object.freeze([
  { id:'news', label:'Aizanoi News', short:'News', group:'media', icon:'/assets/icons/aizanoi-news.svg', moduleId:'news', description:'Original source-linked daily briefings across AI, Technology, Economy / Markets and Football', keywords:['news','daily','ai','technology','markets','economy','football','sources'] },
  { id:'videos', label:'Aizanoi TV', short:'TV', group:'media', icon:'/assets/icons/aizanoi-tv.svg', moduleId:'videos', description:'The English-language Aizanoi channel for AI, technology, markets, cinema, football and conversations', keywords:['video','youtube','ai','technology','markets','cinema','football','conversation'] },
  { id:'analytics', label:'Analytics', short:'Analytics', group:'studio', icon:'/assets/icons/aizanoi-dashboards.svg', moduleId:'analytics', description:'Public dashboards, data products, model comparisons and analytical utilities by Aizanoi Analytics', keywords:['analytics','dashboard','dashboards','data','markets','models','tools','aizanoi analytics'] },
  { id:'worlds', label:'Historical Worlds', short:'Worlds', group:'explore', icon:'/assets/icons/aizanoi-worlds.svg', moduleId:'worlds', description:'Evidence-aware walkable Aizanoi, Rome and Athens', keywords:['worlds','aizanoi','rome','athens','history','archaeology'] },
  { id:'forge', label:'Aizanoi Forge', short:'Forge', group:'studio', icon:'/assets/icons/aizanoi-forge.svg', moduleId:'forge', description:'Source, builds and open projects with GitHub as the canonical source of truth', keywords:['forge','source','github','code','open source','builds','projects'] },
  { id:'journal', label:'Aizanoi Journal', short:'Journal', group:'media', icon:'/assets/icons/aizanoi-journal.svg', moduleId:'journal', description:'Analysis, essays, commentary and long-form research', keywords:['journal','analysis','essay','commentary','research','opinion'] },
  { id:'labs', label:'Aizanoi Labs', short:'Labs', group:'explore', icon:'/assets/icons/aizanoi-labs.svg', moduleId:'labs', description:'Experimental, prototype and archived technical ideas', keywords:['labs','experiment','prototype','webgl','webgpu','creative coding'] },
  { id:'games', label:'Aizanoi Arcade', short:'Arcade', group:'explore', icon:'/assets/icons/aizanoi-arcade.svg', moduleId:'games', description:'Playable local browser games', keywords:['games','arcade','snake','mines','brick','tetris','play'] },
  { id:'workspace', label:'Workspace', short:'Files', group:'studio', icon:'/assets/icons/aizanoi-forge.svg', moduleId:'workspace', description:'Local file explorer for documents, photos and audio stored in this browser', keywords:['files','workspace','documents','folders','storage','local'] },
  { id:'notepad', label:'Notepad', short:'Notepad', group:'studio', icon:'/assets/icons/aizanoi-journal.svg', moduleId:'notepad', description:'Plain-text editor that saves documents into the Workspace', keywords:['notepad','text','editor','notes','txt'] },
  { id:'web-editor', label:'Aizanoi Web Editor', short:'Web Editor', group:'studio', icon:'/assets/icons/web-editor.svg', moduleId:'web-editor', description:'Local HTML, CSS and JavaScript playground with a sandboxed live preview and Workspace project storage', keywords:['web editor','html','css','javascript','js','code','playground','preview','editor'] },
  { id:'calculator', label:'Calculator', short:'Calculator', group:'studio', icon:'/assets/icons/control-panel.svg', moduleId:'calculator', description:'Standard four-function calculator with memory keys', keywords:['calculator','calc','math','arithmetic'] },
  { id:'browser', label:'Browser', short:'Browser', group:'studio', icon:'/assets/icons/browser.svg', moduleId:'browser', description:'Sandboxed web browser with address/search bar and an external-browser fallback', keywords:['browser','web','internet','search','website','url'] },
  { id:'camera', label:'Camera', short:'Camera', group:'media', icon:'/assets/icons/camera.svg', moduleId:'camera', description:'Local camera capture — photos stay on this device', keywords:['camera','photo','webcam','picture','capture'] },
  { id:'winamp', label:'Winamp', short:'Winamp', group:'media', icon:'/assets/icons/winamp.svg', moduleId:'winamp', description:'Playlist player for local and Workspace audio', keywords:['winamp','music','audio','player','playlist','mp3'] },
  { id:'recycle-bin', label:'Recycle Bin', short:'Recycle Bin', group:'studio', icon:'/assets/icons/aizanoi-recycle-bin.svg', moduleId:'recycle-bin', description:'Restore or permanently delete trashed Workspace items', keywords:['recycle','bin','trash','delete','restore'] }
]);

function resolveAppDefinition(definition) {
  if (!definition.moduleId) return definition;
  const installed = enabledModuleById(definition.moduleId);
  if (!installed) return null;
  const { moduleId, ...app } = definition;
  return { ...app, module: installed.entry, requires: installed.requires };
}

export const APPS = Object.freeze(APP_DEFINITIONS.map(resolveAppDefinition).filter(Boolean));
export const ALL_APPS = APPS;

const APP_MAP = new Map(ALL_APPS.map((app) => [app.id, app]));
const WORLD_MAP = new Map(WORLDS.map((world) => [world.id, world]));
const APP_ALIASES = Object.freeze({ tv:'videos', arcade:'games' });

export function appById(id) { return APP_MAP.get(String(id || '')) || null; }
export function canonicalAppId(id) {
  const value=String(id || '');
  return APP_ALIASES[value] || (APP_MAP.has(value) ? value : null);
}
export function worldById(id) { return WORLD_MAP.get(String(id || '')) || null; }
export function appsByGroup(group) { return ALL_APPS.filter((app) => app.group === group); }
export function searchableEntries() {
  return [
    ...WORLDS.map((world) => ({ type:'world', id:world.id, label:world.label, description:world.era, keywords:[world.label,world.era,world.summary] })),
    ...APPS.map((app) => ({ type:'app', id:app.id, label:app.label, description:app.description, keywords:[app.label,app.short,app.description,...app.keywords] })),
    ...STATIC_SEARCH_ENTRIES
  ];
}
