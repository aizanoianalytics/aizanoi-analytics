/* Shared historical-world presentation shell.
   This module reorganises existing controls without owning traversal, evidence,
   rendering or city data. It also records lightweight browser-local field-session
   context so a world can return to the Field System without losing orientation. */
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
  const params=new URL(location.href).searchParams;
  const SESSION_KEY='aizanoi-field-session-v1';
  const route=location.pathname;

  function currentLandmark(){
    return params.get('jump')||params.get('landmark')||null;
  }

  function saveSession(landmark=currentLandmark()){
    try{
      const previous=JSON.parse(localStorage.getItem(SESSION_KEY)||'{}');
      const previousLandmark=previous?.worldId===city?previous.landmark:null;
      const next={...previous,worldId:city,landmark:landmark||previousLandmark||null,route,source:'historical-world',updatedAt:Date.now()};
      localStorage.setItem(SESSION_KEY,JSON.stringify(next));
    }catch(_){}
  }

  saveSession();
  window.addEventListener('pagehide',()=>saveSession(),{once:true});

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

  function addFieldSystemReturn(panel){
    const back=button('aw-field-system-return','Field System');
    back.className='aw-field-system-return';
    back.setAttribute('aria-label','Return to Aizanoi Field System');
    back.addEventListener('click',()=>{
      saveSession();
      location.href='/?app=worlds&from=historical-world';
    });
    panel.prepend(back);
  }

  function installDrawer(host,secondaryIds,mapTarget){
    if(!host||$('#aw-tools-toggle'))return;
    const toggle=button('aw-tools-toggle','Explore');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-controls','aw-tools-panel');
    const panel=document.createElement('div');
    panel.id='aw-tools-panel';panel.className='aw-tools-panel';panel.hidden=true;
    panel.setAttribute('role','group');panel.setAttribute('aria-label','Historical world tools');

    addFieldSystemReturn(panel);

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
    const bottom=$('.bottomBar',hud||document);
    const ids=['resumeBtn','settingsBtn','fullscreenBtn','tourBtn','atlasBtn','sourcesBtn','soundBtn','timeWrap'];
    const result=installDrawer(top,ids,$('#mapBox'));
    const hint=$('.controlHint',bottom||document);
    if(hint&&result?.panel)result.panel.appendChild(hint);
    const teleport=$('#teleport');
    teleport?.addEventListener('change',()=>saveSession(teleport.value||null));
    return;
  }

  if(city==='rome'||city==='athens'){
    const controls=$('.controls');
    const mini=$('.miniWrap');
    installDrawer(controls,['atlas','modern','audio','evidence','sources'],mini);
    const jump=$('#jump');
    jump?.addEventListener('change',()=>saveSession(jump.value||null));
  }
})();
