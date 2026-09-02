import { mountWebEditor } from './app.js';
import { resolveWebEditorCapabilities } from './capabilities.js';

const STYLE_HREF='/js/v3/apps/web-editor/src/web-editor.css';
function ensureStyles(){
  if(document.querySelector(`link[href="${STYLE_HREF}"]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=STYLE_HREF;
  document.head.appendChild(link);
}

/** Public AizanoiOS module entry. */
export async function mount(context){
  ensureStyles();
  const capabilities=resolveWebEditorCapabilities(context);
  return mountWebEditor({...context,capabilities});
}
