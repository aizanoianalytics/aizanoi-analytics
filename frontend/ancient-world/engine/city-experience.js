/* Shared historical-world presentation shell.
   This module only reorganises existing controls. It intentionally does not own
   traversal, evidence, rendering or city data. */
(function installHistoricalWorldExperience(){
  if(typeof window==='undefined'||typeof document==='undefined')return;
  if(window.__AIZANOI_CITY_EXPERIENCE__)return;
  window.__AIZANOI_CITY_EXPERIENCE__=true;

  const cssId='ancient-world-experience-style';
  if(!document.getElementById(cssId)){
    const link=document.createElement('link');
    link.id=cssId;link.rel='stylesheet';
    link.href=new URL('./city-experience.css',import.meta.url).href;
    document.head.appendChild(link);
  }

  const $=(s,r=document)=>r.querySelector(s);
  const body=document.body;
  if(!body)return;
  const city=body.dataset.city||($('#hud')?'aizanoi':'');
  if(!city)return;
  const compact=matchMedia('(pointer:coarse)').matches||innerWidth<=820;
  const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);

  // The shared presentation layer owns only the temporary menu state, but it
  // must prevent the underlying city from continuing to walk while that menu is
  // being used. Capture-phase blocking works with both the mature Aizanoi input
  // handler and the shared Rome/Athens traversal layer without coupling to either.
  document.addEventListener('keydown',(event)=>{
    if(!body.classList.contains('aw-tools-open')||!movementKeys.has(event.code))return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);
  document.addEventListener('keyup',(event)=>{
    if(!body.classList.contains('aw-tools-open')||!movementKeys.has(event.code))return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);

  function button(id,label){
    const el=document.createElement('button');
    el.type='button';el.id=id;el.textContent=label;
    return el;
  }

  function installDrawer(host,secondaryIds,mapTarget){
    if(!host||$('#aw-tools-toggle'))return;
    const toggle=button('aw-tools-toggle','Explore');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-controls','aw-tools-panel');
    const panel=document.createElement('div');
    panel.id='aw-tools-panel';panel.className='aw-tools-panel';panel.hidden=true;
    panel.setAttribute('role','group');panel.setAttribute('aria-label','Historical world tools');

    if(mapTarget&&!compact){
      const mapToggle=button('aw-mini-toggle','Map');
      mapToggle.setAttribute('aria-pressed','false');
      mapToggle.addEventListener('click',()=>{
        const open=!mapTarget.classList.contains('aw-map-open');
        mapTarget.classList.toggle('aw-map-open',open);
        mapToggle.setAttribute('aria-pressed',String(open));
        mapToggle.textContent=open?'Hide map':'Map';
      });
      panel.appendChild(mapToggle);
    }

    for(const id of secondaryIds){
      const el=document.getElementById(id);
      if(el)panel.appendChild(el);
    }

    host.appendChild(toggle);
    body.appendChild(panel);

    const close=()=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false');body.classList.remove('aw-tools-open')};
    const open=()=>{
      try{document.exitPointerLock?.()}catch(_){}
      panel.hidden=false;
      toggle.setAttribute('aria-expanded','true');
      body.classList.add('aw-tools-open');
      const active=document.activeElement;
      if(active&&active!==toggle&&typeof active.blur==='function')active.blur();
      toggle.focus({preventScroll:true});
    };
    toggle.addEventListener('click',(event)=>{event.stopPropagation();panel.hidden?open():close()});
    panel.addEventListener('click',(event)=>event.stopPropagation());
    document.addEventListener('pointerdown',(event)=>{if(!panel.hidden&&!panel.contains(event.target)&&event.target!==toggle)close()});
    document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&!panel.hidden)close()});
    return {toggle,panel,close};
  }

  if(city==='aizanoi'){
    const hud=$('#hud');
    const top=$('.topbar',hud||document);
    body.dataset.city='aizanoi';
    $('.deviceChip',hud||document)?.remove();
    const bottom=$('.bottomBar',hud||document);
    const ids=['resumeBtn','settingsBtn','fullscreenBtn','tourBtn','atlasBtn','sourcesBtn','soundBtn','timeWrap'];
    const result=installDrawer(top,ids,$('#mapBox'));
    const hint=$('.controlHint',bottom||document);
    if(hint&&result?.panel)result.panel.appendChild(hint);
    return;
  }

  if(city==='rome'||city==='athens'){
    const controls=$('.controls');
    const mini=$('.miniWrap');
    installDrawer(controls,['atlas','modern','audio','evidence','sources'],mini);
  }
})();
