import { enabledModuleById } from './module-registry.generated.js';

const APP_DEFINITIONS = Object.freeze([
  { id:'news', label:'Aizanoi News', short:'News', group:'media', icon:'/assets/icons/aizanoi-news.svg', moduleId:'news', description:'Original source-linked daily briefings across AI, Technology, Economy / Markets and Football', keywords:['news','daily','ai','technology','markets','economy','football','sources'] },
  { id:'videos', label:'Aizanoi TV', short:'TV', group:'media', icon:'/assets/icons/aizanoi-tv.svg', moduleId:'videos', description:'The English-language Aizanoi channel for AI, technology, markets, cinema, football and conversations', keywords:['video','youtube','ai','technology','markets','cinema','football','conversation'] },
  { id:'analytics', label:'Analytics', short:'Analytics', group:'studio', icon:'/assets/icons/aizanoi-dashboards.svg', moduleId:'analytics', description:'Public dashboards, data products, model comparisons and analytical utilities by Aizanoi Analytics', keywords:['analytics','dashboard','dashboards','data','markets','models','tools','aizanoi analytics'] },
  { id:'markets', label:'Aizanoi Markets', short:'Markets', group:'studio', icon:'/assets/icons/aizanoi-markets.svg', moduleId:'markets', description:'Focused US equities and crypto daily-close intelligence with momentum, volatility, relative strength and data-quality signals', keywords:['markets','stocks','crypto','equities','ticker','trading','finance','dashboard','us','btc','eth'] },
  { id:'aizanoi', label:'Aizanoi', short:'Aizanoi', group:'explore', icon:'/assets/icons/aizanoi-worlds.svg', moduleId:'aizanoi', description:'Flagship evidence-aware interactive reconstruction of Roman Phrygia, c. AD 225', keywords:['aizanoi','worlds','history','archaeology','webgl'] },
  { id:'forge', label:'Aizanoi Forge', short:'Forge', group:'studio', icon:'/assets/icons/aizanoi-forge.svg', moduleId:'forge', description:'Source, builds and open projects with GitHub as the canonical source of truth', keywords:['forge','source','github','code','open source','builds','projects'] },
  { id:'journal', label:'Aizanoi Journal', short:'Journal', group:'media', icon:'/assets/icons/aizanoi-journal.svg', moduleId:'journal', description:'Analysis, essays, commentary and long-form research', keywords:['journal','analysis','essay','commentary','research','opinion'] },
  { id:'labs', label:'Aizanoi Labs', short:'Labs', group:'explore', icon:'/assets/icons/aizanoi-labs.svg', moduleId:'labs', description:'Experimental, prototype and archived technical ideas', keywords:['labs','experiment','prototype','webgl','webgpu','creative coding'] },
  { id:'games', label:'Aizanoi Arcade', short:'Arcade', group:'explore', icon:'/assets/icons/aizanoi-arcade.svg', moduleId:'games', description:'Playable local browser games', keywords:['games','arcade','snake','mines','brick','tetris','play'] },
  { id:'dungeon', label:'Aizanoi Dungeon', short:'Dungeon', group:'explore', icon:'/assets/icons/aizanoi-dungeon.svg', moduleId:'dungeon', fullscreen:true, description:'Aizo\'s Awakening — a 10-chapter retro dungeon-crawler RPG in the Zeus Temple and Penkalas catacombs', keywords:['dungeon','rpg','aizo','phaser','zeus','temple','penkalas','action','adventure'] },
  { id:'workspace', label:'Workspace', short:'Files', group:'studio', icon:'/assets/icons/aizanoi-forge.svg', moduleId:'workspace', description:'Local file explorer for documents, photos and audio stored in this browser', keywords:['files','workspace','documents','folders','storage','local'] },
  { id:'notepad', label:'Notepad', short:'Notepad', group:'studio', icon:'/assets/icons/aizanoi-journal.svg', moduleId:'notepad', description:'Plain-text editor that saves documents into the Workspace', keywords:['notepad','text','editor','notes','txt'] },
  { id:'web-editor', label:'Aizanoi Web Editor', short:'Web Editor', group:'studio', icon:'/assets/icons/web-editor.svg', moduleId:'web-editor', description:'Local HTML, CSS and JavaScript playground with a sandboxed live preview and Workspace project storage', keywords:['web editor','html','css','javascript','js','code','playground','preview','editor'] },
  { id:'calculator', label:'Calculator', short:'Calculator', group:'studio', icon:'/assets/icons/control-panel.svg', moduleId:'calculator', description:'Standard four-function calculator with memory keys', keywords:['calculator','calc','math','arithmetic'] },
  { id:'browser', label:'Browser', short:'Browser', group:'studio', icon:'/assets/icons/browser.svg', moduleId:'browser', description:'Sandboxed web browser with address/search bar and an external-browser fallback', keywords:['browser','web','internet','search','website','url'] },
  { id:'camera', label:'Camera', short:'Camera', group:'media', icon:'/assets/icons/camera.svg', moduleId:'camera', description:'Local camera capture — photos stay on this device', keywords:['camera','photo','webcam','picture','capture'] },
  { id:'winamp', label:'Winamp', short:'Winamp', group:'media', icon:'/assets/icons/winamp.svg', moduleId:'winamp', description:'Playlist player for local and Workspace audio', keywords:['winamp','music','audio','player','playlist','mp3'] },
  { id:'flowerseller', label:'Flowerseller', short:'Flowers', group:'explore', icon:'/assets/icons/aizanoi-flowerseller.svg', moduleId:'flowerseller', description:'A boutique flower shop proof of concept with original arrangements and a real-backend build guide', keywords:['flowers','flower shop','bouquet','gift','delivery','store','poc'] },
  { id:'recycle-bin', label:'Recycle Bin', short:'Recycle Bin', group:'studio', icon:'/assets/icons/aizanoi-recycle-bin.svg', moduleId:'recycle-bin', description:'Restore or permanently delete trashed Workspace items', keywords:['recycle','bin','trash','delete','restore'] },
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
const APP_ALIASES = Object.freeze({ tv:'videos', arcade:'games' });

export function appById(id) { return APP_MAP.get(String(id || '')) || null; }
export function canonicalAppId(id) {
  const value=String(id || '');
  return APP_ALIASES[value] || (APP_MAP.has(value) ? value : null);
}
export function appsByGroup(group) { return ALL_APPS.filter((app) => app.group === group); }
export function searchableEntries(extraEntries=[]) {
  return [
    ...APPS.map((app) => ({ type:'app', id:app.id, label:app.label, description:app.description, keywords:[app.label,app.short,app.description,...app.keywords] })),
    ...extraEntries
  ];
}
