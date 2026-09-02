const MESSAGE_RUN='aizanoi-web-editor-run';
const MESSAGE_READY='aizanoi-web-editor-ready';
const MESSAGE_DONE='aizanoi-web-editor-done';
const MESSAGE_ERROR='aizanoi-web-editor-error';
const MESSAGE_CONSOLE='aizanoi-web-editor-console';
let activeRunId=0;

function send(type,payload={}){
  parent.postMessage({type,runId:activeRunId,...payload},'*');
}
function serializeError(error){
  if(error instanceof Error)return error.stack||error.message||String(error);
  return String(error??'Unknown preview error');
}
function serializeConsoleValue(value){
  const crop=(text)=>String(text).length>1200?`${String(text).slice(0,1199)}…`:String(text);
  if(typeof value==='string')return crop(value);
  if(typeof value==='undefined')return 'undefined';
  if(typeof value==='bigint')return `${value}n`;
  if(typeof value==='symbol'||typeof value==='function')return crop(String(value));
  if(value instanceof Error)return crop(value.stack||value.message||String(value));
  const seen=new WeakSet();
  try{
    const json=JSON.stringify(value,(key,current)=>{
      if(typeof current==='bigint')return `${current}n`;
      if(current&&typeof current==='object'){
        if(seen.has(current))return '[Circular]';
        seen.add(current);
      }
      return current;
    });
    return crop(json===undefined?String(value):json);
  }catch{return crop(String(value));}
}
const nativeConsole=Object.freeze({
  log:console.log.bind(console),
  warn:console.warn.bind(console),
  error:console.error.bind(console),
});
for(const level of ['log','warn','error']){
  console[level]=(...args)=>{
    nativeConsole[level](...args);
    send(MESSAGE_CONSOLE,{level,args:args.map(serializeConsoleValue)});
  };
}
function reportRuntimeError(error,{prefix=''}={}){
  const detail=serializeError(error);
  const message=prefix?`${prefix}: ${detail}`:detail;
  send(MESSAGE_CONSOLE,{level:'error',args:[message]});
  send(MESSAGE_ERROR,{message:detail});
}
const nativeSetTimeout=window.setTimeout.bind(window);
const nativeSetInterval=window.setInterval.bind(window);
const nativePromiseReject=Promise.reject;
const nativePromiseThen=Promise.prototype.then;
const nativePromiseCatch=Promise.prototype.catch;
const trackedRejections=new WeakMap();
const reportedRejections=new WeakSet();
function markRejectionHandled(promise){
  const record=trackedRejections.get(promise);
  if(record)record.handled=true;
}
function reportUnhandledPromise(promise,reason){
  if(promise&&reportedRejections.has(promise))return;
  if(promise)reportedRejections.add(promise);
  reportRuntimeError(reason,{prefix:'Unhandled rejection'});
}
Promise.reject=function(reason){
  const promise=nativePromiseReject.call(this,reason);
  const record={reason,handled:false};
  trackedRejections.set(promise,record);
  nativeSetTimeout(()=>{
    if(!record.handled)reportUnhandledPromise(promise,reason);
  },0);
  return promise;
};
Promise.prototype.then=function(onFulfilled,onRejected){
  if(typeof onRejected==='function')markRejectionHandled(this);
  return nativePromiseThen.call(this,onFulfilled,onRejected);
};
Promise.prototype.catch=function(onRejected){
  if(typeof onRejected==='function')markRejectionHandled(this);
  return nativePromiseCatch.call(this,onRejected);
};
function wrapScheduledCallback(callback){
  if(typeof callback!=='function')return callback;
  return (...args)=>{
    try{
      const result=callback.apply(window,args);
      if(result&&typeof result.then==='function'){
        nativePromiseThen.call(result,undefined,(error)=>reportUnhandledPromise(result,error));
      }
      return result;
    }catch(error){reportRuntimeError(error);return undefined;}
  };
}
window.setTimeout=(callback,delay,...args)=>nativeSetTimeout(wrapScheduledCallback(callback),delay,...args);
window.setInterval=(callback,delay,...args)=>nativeSetInterval(wrapScheduledCallback(callback),delay,...args);
function copyStylesheetLinks(parsed){
  for(const node of [...parsed.querySelectorAll('link[rel~="stylesheet"][href]')]){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=node.getAttribute('href');
    const media=node.getAttribute('media');
    if(media)link.media=media;
    document.head.appendChild(link);
    node.remove();
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
  parsed.querySelectorAll('style').forEach((node)=>node.remove());
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

window.onerror=(message,_source,_line,_column,error)=>{
  reportRuntimeError(error||message);
  return false;
};
window.addEventListener('unhandledrejection',(event)=>{
  reportUnhandledPromise(event.promise,event.reason);
});
window.addEventListener('message',(event)=>{
  if(event.source!==parent||event.data?.type!==MESSAGE_RUN)return;
  activeRunId=Number(event.data.runId)||0;
  render(event.data.source).catch((error)=>reportRuntimeError(error));
});

parent.postMessage({type:MESSAGE_READY},'*');
