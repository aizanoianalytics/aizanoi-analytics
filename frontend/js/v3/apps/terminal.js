import { APPS, WORLDS } from '../registry.js';
import { getFieldSession } from '../store.js';

const FILES={
  'README.txt':'AIZANOI FIELD TERMINAL\nLOCAL VIRTUAL SHELL\n\nThis terminal exposes browser-local field commands only. It does not run server processes, network diagnostics or remote shell commands.\n',
  'docs/info.txt':'Commands are task-oriented: worlds, open <app>, find <term>, session, evidence, help, pwd, ls and cat <file>.\n'
};

const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function helpText(){return `Aizanoi Field Terminal\n\nhelp                 Show this task guide\nworlds               List historical worlds\nopen <app>            Open a Field System app\nfind <term>            Search app/world names\nsession               Show the current local field session\nevidence              Explain evidence labels\npwd                   Show virtual working path\nls                    List virtual files\ncat <file>             Read a virtual file\nclear                  Clear terminal output\n\nNo server, process, hostname or network commands are exposed.`;}

export async function mount({container,api}) {
  container.innerHTML=`<div class="az-terminal"><div class="az-terminal-output" data-terminal-output><p class="az-terminal-line az-terminal-brass">AIZANOI FIELD TERMINAL / LOCAL VIRTUAL SHELL</p><p class="az-terminal-line az-terminal-muted">Type <b>help</b> for field-oriented commands. Nothing here executes on the server.</p></div><form class="az-terminal-input-row" data-terminal-form><span class="az-terminal-prompt">aizanoi@field:~$</span><input class="az-terminal-input" data-terminal-input autocomplete="off" spellcheck="false" aria-label="Field Terminal command"></form></div>`;
  const output=container.querySelector('[data-terminal-output]');const input=container.querySelector('[data-terminal-input]');
  const print=(text='',kind='')=>{const p=document.createElement('p');p.className=`az-terminal-line${kind?` ${kind}`:''}`;p.textContent=text;output.appendChild(p);output.scrollTop=output.scrollHeight;};
  const run=async(raw)=>{const value=String(raw||'').trim();if(!value)return;print(`aizanoi@field:~$ ${value}`,'az-terminal-muted');const [command,...args]=value.split(/\s+/);const arg=args.join(' ');switch(command.toLowerCase()){
    case'help':print(helpText());break;
    case'worlds':WORLDS.forEach((world)=>print(`${world.id.padEnd(9)} ${world.label} — ${world.era}`));break;
    case'open':{const q=arg.toLowerCase();const app=APPS.find((item)=>[item.id,item.label,item.short].some((field)=>String(field).toLowerCase()===q));if(!app)print(`No app named “${arg}”. Try: ${APPS.map((a)=>a.id).join(', ')}`);else{print(`Opening ${app.label}…`);api.openApp(app.id);}break;}
    case'find':{const q=arg.toLowerCase();if(!q){print('Usage: find <term>');break;}const rows=[...WORLDS.map((x)=>({type:'world',label:x.label,text:`${x.label} ${x.era} ${x.summary}`})),...APPS.map((x)=>({type:'app',label:x.label,text:`${x.label} ${x.description} ${x.keywords.join(' ')}`}))].filter((x)=>x.text.toLowerCase().includes(q));rows.length?rows.forEach((x)=>print(`${x.type.padEnd(5)} ${x.label}`)):print('No local match.');break;}
    case'session':{const s=getFieldSession();print(s?`World: ${s.worldId}${s.landmark?` · landmark: ${s.landmark}`:''} · updated ${new Date(s.updatedAt).toLocaleString()}`:'No field session recorded yet. Open a Historical World from Home.');break;}
    case'evidence':print('documented = explicit source record\narchaeological = material/site evidence\ninferred = reasoned reconstruction, clearly labelled\natmospheric = contextual scene-setting\ndisputed = competing interpretations');break;
    case'pwd':print('/aizanoi');break;
    case'ls':print(Object.keys(FILES).join('\n'));break;
    case'cat':arg in FILES?print(FILES[arg]):print('Virtual file not found.');break;
    case'clear':output.innerHTML='';break;
    default:print(`Unknown local command: ${command}. Type help.`);break;
  }};
  const submit=(event)=>{event.preventDefault();const value=input.value;input.value='';run(value);};container.querySelector('[data-terminal-form]').addEventListener('submit',submit);setTimeout(()=>input.focus(),0);
  return()=>container.querySelector('[data-terminal-form]')?.removeEventListener('submit',submit);
}
