import { CITY, SOURCES, REGIONS, STREETS, BUILDINGS, TELEPORTS } from '../data/city.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#glCanvas');
const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
if (!gl) throw new Error('WebGL is unavailable.');

const C = {
  earth:[.34,.27,.16], road:[.34,.31,.25], brick:[.43,.22,.14], brickDark:[.27,.13,.09],
  marble:[.68,.62,.50], roof:[.33,.13,.08], rubble:[.25,.21,.17], grass:[.28,.33,.16],
  water:[.12,.27,.31], wall:[.38,.25,.17], gold:[.77,.60,.30], modern:[.20,.58,.72], white:[.88,.82,.66]
};
const S = (h) => h.map(x => x / 255);
const stateColor = { standing:C.marble, working:C.brick, new:C.white, repaired:C.marble, fortified:C.wall, spoliated:C.brick, damaged:C.brickDark, ruined:C.rubble, burial:C.rubble, inferred:C.brick, default:C.brick };
const stateLabel = {standing:'Standing',working:'In use',new:'New in this period',repaired:'Repaired',fortified:'Fortified',spoliated:'Stripped / spoliated',damaged:'Damaged',ruined:'Ruined',burial:'Burial landscape',inferred:'Schematic urban fabric'};

// Compact geometry collector. Every record stays in one buffer for low-end devices.
const verts = [], colors = [];
function put(x,y,z,c){ verts.push(x,y,z); colors.push(...c); }
function quad(a,b,c,d,col){ put(...a,col);put(...b,col);put(...c,col);put(...a,col);put(...c,col);put(...d,col); }
function box(x,y,z,w,h,d,col){
 const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y0=y,y1=y+h;
 quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],col); quad([x1,y0,z1],[x0,y0,z1],[x0,y1,z1],[x1,y1,z1],col);
 quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],col); quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],col);
 quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],col);
}
function cylinder(x,y,z,r,h,col,n=14){
 for(let i=0;i<n;i++){ const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2; const p=[x+Math.cos(a)*r,y,z+Math.sin(a)*r],q=[x+Math.cos(b)*r,y,z+Math.sin(b)*r],P=[p[0],y+h,p[2]],Q=[q[0],y+h,q[2]];quad(p,q,Q,P,col); put([x,y+h,z][0],[x,y+h,z][1],[x,y+h,z][2],col);put(...P,col);put(...Q,col); }
}
function prism(x,y,z,w,h,d,col){
 box(x,y,z,w,h*.68,d,col); const y0=y+h*.68, x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,top=y+h;
 quad([x0,y0,z0],[x1,y0,z0],[x,y0,z1],[x,y0,z1],col);quad([x0,y0,z0],[x,y0,z1],[x,y0,z1],[x0,top,z0],col);quad([x1,y0,z0],[x1,top,z0],[x,y0,z1],[x,y0,z1],col);quad([x0,top,z0],[x1,top,z0],[x,y0,z1],[x,y0,z1],col);
}
function arch(x,y,z,w,h,d,col){
 box(x,y,z,w,h,d,col); box(x,y,z-d*.55,w*.43,h*.63,d*.2,C.road);
}
function temple(b,col){ box(b.x,0,b.z,b.w,b.h*.18,b.d,col); const rows=Math.max(4,Math.round(b.w/12)); for(let i=0;i<rows;i++){ const xx=b.x-b.w*.4+i*(b.w*.8/(rows-1)); cylinder(xx,b.h*.18,b.z-b.d*.32,1.7,b.h*.62,col,10); cylinder(xx,b.h*.18,b.z+b.d*.32,1.7,b.h*.62,col,10); } prism(b.x,b.h*.18,b.z,b.w,b.h*.82,b.d,col); }
function round(b,col){ cylinder(b.x,0,b.z,Math.min(b.w,b.d)/2,b.h*.65,col,20); cylinder(b.x,b.h*.65,b.z,Math.min(b.w,b.d)*.34,b.h*.35,col,20); }
function theatre(b,col){ cylinder(b.x,0,b.z,Math.max(b.w,b.d)*.46,b.h*.2,col,24); for(let r=0;r<4;r++) cylinder(b.x,b.h*.2+r*b.h*.14,b.z,Math.max(b.w,b.d)*(.42-r*.06),b.h*.14,col,24); }
function amphitheatre(b,col){ for(let r=0;r<5;r++) cylinder(b.x,b.h*r/5,b.z,Math.max(b.w,b.d)*(.52-r*.04),b.h/5,col,30); }
function bath(b,col){ box(b.x,0,b.z,b.w,b.h*.43,b.d,col); for(let i=-2;i<=2;i++) for(let j=-1;j<=1;j++) cylinder(b.x+i*b.w*.13,b.h*.43,b.z+j*b.d*.2,3,b.h*.40,col,12); }
function wall(b){ const w=b.w,d=b.d,h=b.h; for(let i=-w/2;i<=w/2;i+=34){box(b.x+i,0,b.z-d/2,32,h,6,C.wall);box(b.x+i,0,b.z+d/2,32,h,6,C.wall);} for(let i=-d/2;i<=d/2;i+=34){box(b.x-w/2,0,b.z+i,6,h,32,C.wall);box(b.x+w/2,0,b.z+i,6,h,32,C.wall);} for(let i=-w/2;i<=w/2;i+=68){for(const zz of [-d/2,d/2])box(b.x+i,0,b.z+zz,13,h+6,13,C.wall);} }
function road(points,width){ for(let i=1;i<points.length;i++){const [a,b]=[points[i-1],points[i]],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),ang=Math.atan2(dz,dx); const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2; box(x,-.4,z,len,0.5,width,C.road); } }
function scatteredRubble(b){ for(let i=0;i<Math.max(8,Math.floor(b.w*b.d/140));i++){const a=i*2.399,r=(i%7)/7*Math.max(b.w,b.d)*.42;box(b.x+Math.cos(a)*r,.02,b.z+Math.sin(a)*r,2+(i%4),1+(i%3),2+(i%3),C.rubble);} }
function renderBuilding(b){ const col=stateColor[b.state]||stateColor.default; if(b.type==='wall')return wall(b); if(b.type==='gate')return arch(b.x,0,b.z,b.w,b.h,b.d,col); if(b.type==='temple') temple(b,col); else if(['round','dome','round-church','mausoleum'].includes(b.type)) round(b,col); else if(['theatre','stadium','circus','arena'].includes(b.type)) theatre(b,col); else if(b.type==='amphitheatre') amphitheatre(b,col); else if(b.type==='bath') bath(b,col); else if(b.type==='arch') arch(b.x,0,b.z,b.w,b.h,b.d,col); else if(b.type==='aqueduct') { for(let i=-b.w/2;i<=b.w/2;i+=16) arch(b.x+i,0,b.z,13,b.h,b.d,col); } else if(b.type==='bridge'){box(b.x,0,b.z,b.w,5,b.d,col);for(let i=-b.w*.35;i<=b.w*.35;i+=b.w*.35)arch(b.x+i,0,b.z,b.w*.27,6,b.d,col);} else if(b.type==='island'){box(b.x,-.3,b.z,b.w,2,b.d,C.grass);} else if(b.type==='pyramid'){prism(b.x,0,b.z,b.w,b.h,b.d,col);} else prism(b.x,0,b.z,b.w,b.h,b.d,col); if(['ruined','damaged','spoliated'].includes(b.state))scatteredRubble(b); }

// Ground, river, regional street plan and source-backed landmarks.
box(-90,-1,0,1800,1,1500,C.earth); box(-505,-.6,0,92,.4,1290,C.water);
for(const s of STREETS) road(s.points,s.width);
for(const b of BUILDINGS) renderBuilding(b);

const program = makeProgram(`attribute vec3 aP;attribute vec3 aC;uniform mat4 uP,uV;varying vec3 vC;varying float vFog;void main(){vec4 p=uV*vec4(aP,1.0);gl_Position=uP*p;vC=aC;vFog=clamp((-p.z-130.0)/1300.0,0.0,1.0);}`,`precision mediump float;varying vec3 vC;varying float vFog;uniform vec3 uFog;void main(){vec3 c=mix(vC,uFog,vFog);gl_FragColor=vec4(c,1.0);}`);
function makeProgram(vs,fs){const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s};const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const interleaved=new Float32Array(verts.length*2);for(let i=0;i<verts.length/3;i++){interleaved.set(verts.slice(i*3,i*3+3),i*6);interleaved.set(colors.slice(i*3,i*3+3),i*6+3);}gl.bufferData(gl.ARRAY_BUFFER,interleaved,gl.STATIC_DRAW);

function perspective(fov,a,n,f){const t=1/Math.tan(fov/2),nf=1/(n-f);return new Float32Array([t/a,0,0,0,0,t,0,0,0,0,(f+n)*nf,-1,0,0,2*f*n*nf,0]);}
function mul(a,b){const o=new Float32Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function lookAt(e,c,u){let z=norm(sub(e,c)),x=norm(cross(u,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,e),-dot(y,e),-dot(z,e),1]);}
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l)};

// Elevated Forum-facing opening establishes the city scale before the user walks down into individual districts.
let player={x:-180,y:68,z:-265,yaw:Math.PI,pitch:-.47}, keys={}, last=0, locked=false, modernOverlay=false, audio=null;
function camera(){const cp=Math.cos(player.pitch), f=[Math.sin(player.yaw)*cp,Math.sin(player.pitch),-Math.cos(player.yaw)*cp], eye=[player.x,player.y+5,player.z];return lookAt(eye,[eye[0]+f[0],eye[1]+f[1],eye[2]+f[2]],[0,1,0]);}
function resize(){const d=Math.min(devicePixelRatio||1,1.5);canvas.width=innerWidth*d;canvas.height=innerHeight*d;canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';gl.viewport(0,0,canvas.width,canvas.height);}
function tick(t){const dt=Math.min(.05,(t-last||16)/1000);last=t;const speed=(keys.Shift?120:55)*dt,dx=(keys.KeyD?1:0)-(keys.KeyA?1:0),dz=(keys.KeyW?1:0)-(keys.KeyS?1:0);if(dx||dz){const l=Math.hypot(dx,dz);player.x+=(Math.cos(player.yaw)*dx+Math.sin(player.yaw)*dz)/l*speed;player.z+=(Math.sin(player.yaw)*dx-Math.cos(player.yaw)*dz)/l*speed;player.x=Math.max(-890,Math.min(650,player.x));player.z=Math.max(-700,Math.min(700,player.z));} draw();drawRegionalMap();requestAnimationFrame(tick);}
function draw(){resize();const fog=modernOverlay?[.48,.60,.64]:[.50,.47,.39];gl.clearColor(...fog,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(program);const stride=24,p=gl.getAttribLocation(program,'aP'),c=gl.getAttribLocation(program,'aC');gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.vertexAttribPointer(p,3,gl.FLOAT,false,stride,0);gl.enableVertexAttribArray(p);gl.vertexAttribPointer(c,3,gl.FLOAT,false,stride,12);gl.enableVertexAttribArray(c);gl.uniformMatrix4fv(gl.getUniformLocation(program,'uP'),false,perspective(1.08,canvas.width/canvas.height,.2,2600));gl.uniformMatrix4fv(gl.getUniformLocation(program,'uV'),false,camera());gl.uniform3fv(gl.getUniformLocation(program,'uFog'),fog);gl.drawArrays(gl.TRIANGLES,0,verts.length/3);if(modernOverlay) drawOverlay(); updateNearest();}
function drawOverlay(){const ctx=$('#overlay').getContext('2d');const c=$('#overlay');c.width=innerWidth;c.height=innerHeight;ctx.clearRect(0,0,c.width,c.height);ctx.strokeStyle='rgba(70,210,255,.55)';ctx.lineWidth=1;for(let i=0;i<17;i++){const x=(i/16)*c.width;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+innerHeight*.18,c.height);ctx.stroke();}ctx.fillStyle='rgba(160,235,255,.85)';ctx.font='12px system-ui';ctx.fillText('MODERN ALIGNMENT OVERLAY · schematic relation to present Rome',18,c.height-24);}

function updateNearest(){let best=null,d=1e9;for(const b of BUILDINGS){const dd=Math.hypot(b.x-player.x,b.z-player.z);if(dd<d){d=dd;best=b;}}if(best&&d<70){$('#place').textContent=best.name;$('#detail').textContent=`${stateLabel[best.state]||best.state} · ${best.region==='all'?'city circuit':'Regio '+best.region}`;}else{$('#place').textContent='Street level';$('#detail').textContent='Explore the late-antique city';}}
function drawRegionalMap(){const c=$('#minimap'),ctx=c.getContext('2d'),w=c.width=c.clientWidth*devicePixelRatio,h=c.height=c.clientHeight*devicePixelRatio;ctx.scale(devicePixelRatio,devicePixelRatio);const cw=c.clientWidth,ch=c.clientHeight;ctx.clearRect(0,0,cw,ch);ctx.fillStyle='#1b1b16';ctx.fillRect(0,0,cw,ch);const sx=cw/1800,sz=ch/1500,tx=(x)=> (x+990)*sx, tz=(z)=>(z+750)*sz;ctx.strokeStyle='#a16e42';ctx.lineWidth=1;ctx.strokeRect(tx(-775),tz(-640),1550*sx,1280*sz);for(const r of REGIONS){ctx.fillStyle='rgba(198,155,83,.12)';ctx.fillRect(tx(r.x-r.w/2),tz(r.z-r.d/2),r.w*sx,r.d*sz);ctx.strokeStyle='rgba(231,202,129,.36)';ctx.strokeRect(tx(r.x-r.w/2),tz(r.z-r.d/2),r.w*sx,r.d*sz);}ctx.strokeStyle='#4f94a6';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(tx(-505),0);ctx.lineTo(tx(-505),ch);ctx.stroke();for(const b of BUILDINGS.filter(x=>!['wall','insula','aqueduct'].includes(x.type))){ctx.fillStyle=b.type==='church'?'#e7d49c':b.state==='ruined'?'#6d5141':'#b68753';ctx.fillRect(tx(b.x)-2,tz(b.z)-2,4,4);}ctx.fillStyle='#f5f0d0';ctx.beginPath();ctx.arc(tx(player.x),tz(player.z),4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f3dab2';ctx.font='10px system-ui';ctx.fillText('14 REGIONES',8,14);}

function setModal(title,html){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden');}
function openAtlas(){const rows=REGIONS.map(r=>`<button class="region" data-region="${r.id}"><b>${r.id} · ${r.name}</b><span>${r.note}</span></button>`).join('');setModal('Regional atlas · 14 Augustan regiones',`<p>The regional minimap is schematic; it is intended for orientation, not cadastral certainty.</p><div class="regionGrid">${rows}</div>`);document.querySelectorAll('.region').forEach(el=>el.onclick=()=>{const r=REGIONS.find(x=>x.id===el.dataset.region);player.x=r.x;player.z=r.z;$('#modal').classList.add('hidden');});}
function openSources(){const rows=SOURCES.map(s=>`<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title}</a></li>`).join('');setModal('Research sources',`<p>This reconstruction treats source links as an open research trail. Some massing and domestic fabric remains schematic where archaeological evidence cannot resolve a fifth-century elevation.</p><ul>${rows}</ul><p><a href="./research/">Open the local research notes →</a></p>`);}
function toggleAudio(){if(!audio){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ctx=new AC(),noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),a=noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*(1-i/a.length);const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();src.buffer=noise;src.loop=true;filter.type='lowpass';filter.frequency.value=430;gain.gain.value=.025;src.connect(filter).connect(gain).connect(ctx.destination);src.start();audio={ctx,gain};$('#audio').textContent='Sound: on';}else{audio.gain.gain.value=audio.gain.gain.value?0:.025;$('#audio').textContent=audio.gain.gain.value?'Sound: on':'Sound: off';}}
function nearestInfo(){let b=BUILDINGS.reduce((p,x)=>Math.hypot(x.x-player.x,x.z-player.z)<Math.hypot(p.x-player.x,p.z-player.z)?x:p,BUILDINGS[0]);const source=SOURCES.find(s=>s.id===b.source);setModal(b.name,`<p><b>${stateLabel[b.state]||b.state}</b> · Regio ${b.region}</p><p>${b.detail}</p><p>Source: ${source?`<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a>`:'Research ledger'}</p>`);}
function teleport(id){const b=BUILDINGS.find(x=>x.id===id);if(b){player.x=b.x;player.z=b.z-b.d*.7;$('#jump').value='';}}

$('#atlas').onclick=openAtlas;$('#sources').onclick=openSources;$('#audio').onclick=toggleAudio;$('#inspect').onclick=nearestInfo;$('#modern').onclick=()=>{modernOverlay=!modernOverlay;$('#modern').textContent=modernOverlay?'Modern overlay: on':'Modern overlay: off';$('#overlay').getContext('2d').clearRect(0,0,innerWidth,innerHeight);};$('#modalClose').onclick=()=>$('#modal').classList.add('hidden');$('#jump').innerHTML='<option value="">Jump to landmark…</option>'+TELEPORTS.map(([id,n])=>`<option value="${id}">${n}</option>`).join('');$('#jump').onchange=e=>teleport(e.target.value);
canvas.addEventListener('click',()=>canvas.requestPointerLock());document.addEventListener('pointerlockchange',()=>locked=document.pointerLockElement===canvas);document.addEventListener('mousemove',e=>{if(locked){player.yaw-=e.movementX*.0024;player.pitch=Math.max(-.7,Math.min(.55,player.pitch-e.movementY*.002));}});addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyE')nearestInfo();});addEventListener('keyup',e=>keys[e.code]=false);addEventListener('blur',()=>keys={});
$('#enter').onclick=()=>{$('#intro').classList.add('hidden');canvas.focus();};
$('#title').textContent=CITY.title; $('#period').textContent=CITY.period; $('#introTitle').textContent=CITY.title; $('#introText').textContent=CITY.description;requestAnimationFrame(tick);
