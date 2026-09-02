const MESSAGE_RUN='aizanoi-web-editor-run';
const MESSAGE_READY='aizanoi-web-editor-ready';
const MESSAGE_DONE='aizanoi-web-editor-done';
const MESSAGE_ERROR='aizanoi-web-editor-error';

function send(type,payload={}){
  parent.postMessage({type,...payload},'*');
}
function serializeError(error){
  if(error instanceof Error)return error.stack||error.message||String(error);
  return String(error??'Unknown preview error');
}
function copyStylesheetLinks(parsed){
  for(const node of parsed.querySelectorAll('link[rel~="stylesheet"][href]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=node.getAttribute('href');
    const media=node.getAttribute('media');
    if(media)link.media=media;
    document.head.appendChild(link);
  }
}
async function runExternalScript(spec){
  await new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=spec.src;
    if(spec.type)script.type=spec.type;
    script.onload=()=>resolve();
    script.onerror=()=>reject(new Error(`Could not load script: ${spec.src}`));
    document.head.appendChild(script);
  });
}
async function executeScript(spec){
  if(spec.src){await runExternalScript(spec);return;}
  if(spec.type&&spec.type!=='text/javascript'&&spec.type!=='application/javascript')return;
  if(!spec.code.trim())return;
  const fn=new Function(`${spec.code}\n//# sourceURL=aizanoi-web-editor-inline.js`);
  fn.call(window);
}
async function render(source={}){
  const parsed=new DOMParser().parseFromString(String(source.html||''),'text/html');
  const scripts=[...parsed.querySelectorAll('script')].map((node)=>({
    src:node.getAttribute('src')||'',
    type:String(node.getAttribute('type')||'').trim().toLowerCase(),
    code:node.textContent||'',
  }));
  parsed.querySelectorAll('script').forEach((node)=>node.remove());

  document.title=parsed.title||'Aizanoi Web Editor Preview';
  copyStylesheetLinks(parsed);

  const inlineStyles=[...parsed.querySelectorAll('style')].map((node)=>node.textContent||'');
  const style=document.createElement('style');
  style.textContent=`${inlineStyles.join('\n')}\n${String(source.css||'')}`;
  document.head.appendChild(style);

  document.body.innerHTML=parsed.body?.innerHTML||'';
  for(const script of scripts)await executeScript(script);

  const js=String(source.js||'');
  if(js.trim()){
    const fn=new Function(`${js}\n//# sourceURL=aizanoi-web-editor-script.js`);
    fn.call(window);
  }
  send(MESSAGE_DONE);
}

window.addEventListener('error',(event)=>send(MESSAGE_ERROR,{message:serializeError(event.error||event.message)}));
window.addEventListener('unhandledrejection',(event)=>send(MESSAGE_ERROR,{message:serializeError(event.reason)}));
window.addEventListener('message',(event)=>{
  if(event.source!==parent||event.data?.type!==MESSAGE_RUN)return;
  render(event.data.source).catch((error)=>send(MESSAGE_ERROR,{message:serializeError(error)}));
});

send(MESSAGE_READY);
