"use strict";
(function(){
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const canvas=$("#glCanvas"), loading=$("#loading"), boot=$("#boot"), hud=$("#hud");
const HAS_TOUCH=("ontouchstart" in window)||(navigator.maxTouchPoints>0);
const COARSE_POINTER=matchMedia("(pointer:coarse)").matches;
const FINE_POINTER=matchMedia("(pointer:fine)").matches;
const TOUCH=(COARSE_POINTER&&!FINE_POINTER)||(HAS_TOUCH&&innerWidth<820);
const MOBILE=(TOUCH||innerWidth<820);
const DETAIL=MOBILE?.58:1;
const TEST_MODE=!!window.__AIZANOI_TEST__;
let renderQuality=MOBILE?1.0:1.25;
document.body.classList.toggle("touchMode",TOUCH);
const stage=$("#loadingStage"), progress=$("#progressBar"), loadError=$("#loadError");

function setStage(text,pct){stage.textContent=text;progress.style.width=pct+"%"}
function fail(msg,err){
  loadError.classList.remove("hidden");
  loadError.innerHTML="<b>Initialization stopped.</b><br>"+msg+(err?"<br><span style='opacity:.75'>"+String(err.message||err)+"</span>":"")+"<br><br>This build has no CDN dependency. Try reloading the page; if the message persists, WebGL may be disabled in this browser. On mobile, Chrome/Edge/Safari with hardware acceleration enabled is recommended.<br><br><button id='fallbackAtlasBtn' class='primary' style='font-size:10px;padding:10px 14px'>OPEN THE RESEARCH ATLAS INSTEAD</button>";
  setStage("Unable to start the 3D engine.",100);
  setTimeout(()=>{const b=$("#fallbackAtlasBtn");if(b)b.onclick=()=>{loading.classList.add("hidden");drawAtlas();populateAtlasPlaces();$("#atlasOverlay").classList.remove("hidden")}},0);
}
window.addEventListener("error",e=>{ if(!boot.classList.contains("hidden")||!loading.classList.contains("hidden")) fail("A JavaScript error occurred.",e.error||e.message) });

/* -------------------- deterministic helpers -------------------- */
let seed=0xA12A01;
function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
function rand(a,b){return a+(b-a)*rnd()}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function lerp(a,b,t){return a+(b-a)*t}
function dist2(x,z,x2,z2){const dx=x-x2,dz=z-z2;return Math.hypot(dx,dz)}
function hex(h){return [((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255]}
const C={
 limestone:hex(0xb7a98f),limestone2:hex(0xa89778),marble:hex(0xd8ceb9),marbleLight:hex(0xe5ddca),
 plaster:hex(0xc3a379),plaster2:hex(0xa47c58),plaster3:hex(0xd0b78f),roof:hex(0x8f5135),roof2:hex(0x74402e),
 wood:hex(0x5a3c27),darkStone:hex(0x6a6256),road:hex(0x8d7c64),roadLight:hex(0x9a8a70),earth:hex(0x8c7650),
 dryGrass:hex(0x99905e),field:hex(0xb0a060),field2:hex(0x8f914e),vine:hex(0x6d7e47),tree:hex(0x607348),tree2:hex(0x71885c),
 bronze:hex(0x6a5b36),red:hex(0x844737),mosaicDark:hex(0x34322b),mosaicLight:hex(0xd6c5a0),
 citizen1:hex(0x9b5d48),citizen2:hex(0xb89367),citizen3:hex(0x6d6c82),skin:hex(0xb98563),white:hex(0xeee4d0)
};

/* -------------------- tiny WebGL mesh builder -------------------- */
class Builder{
  constructor(){this.v=[];this.tris=0}
  vertex(p,n,c){this.v.push(p[0],p[1],p[2],n[0],n[1],n[2],c[0],c[1],c[2])}
  tri(a,b,c,col){
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
    const n=[nx,ny,nz];this.vertex(a,n,col);this.vertex(b,n,col);this.vertex(c,n,col);this.tris++;
  }
  quad(a,b,c,d,col){this.tri(a,b,c,col);this.tri(a,c,d,col)}
}
const B=new Builder(), B301=new Builder(), B425=new Builder(), BW=new Builder();
const colliders=[], bridges=[], houseFootprints=[], mapRoads=[], fieldPolys=[], walkSurfaces=[], hazardZones=[], stairFlights=[];
function rotXZ(x,z,cx,cz,a){const dx=x-cx,dz=z-cz,ca=Math.cos(a),sa=Math.sin(a);return [cx+dx*ca-dz*sa,cz+dx*sa+dz*ca]}
function addBox(builder,cx,cy,cz,sx,sy,sz,col,rot=0,collide=false){
 const y0=cy-sy/2,y1=cy+sy/2;let pts=[[-sx/2,-sz/2],[sx/2,-sz/2],[sx/2,sz/2],[-sx/2,sz/2]].map(q=>rotXZ(cx+q[0],cz+q[1],cx,cz,rot));
 const p=(i,y)=>[pts[i][0],y,pts[i][1]];
 // outward-facing side normals; culling is disabled, but correct normals are essential for believable sunlight
 builder.quad(p(1,y0),p(0,y0),p(0,y1),p(1,y1),col);builder.quad(p(2,y0),p(1,y0),p(1,y1),p(2,y1),col);
 builder.quad(p(3,y0),p(2,y0),p(2,y1),p(3,y1),col);builder.quad(p(0,y0),p(3,y0),p(3,y1),p(0,y1),col);
 builder.quad(p(0,y1),p(3,y1),p(2,y1),p(1,y1),col);builder.quad(p(0,y0),p(1,y0),p(2,y0),p(3,y0),col);
 if(collide){colliders.push({x:cx,z:cz,hx:sx/2,hz:sz/2,rot})}
}
function addCylinder(builder,cx,y,cz,r,h,seg,col,cap=true){
 if(MOBILE)seg=Math.min(seg,10);
 const y0=y,y1=y+h;
 for(let i=0;i<seg;i++){const a=i*Math.PI*2/seg,b=(i+1)*Math.PI*2/seg;
  const p0=[cx+Math.cos(a)*r,y0,cz+Math.sin(a)*r],p1=[cx+Math.cos(b)*r,y0,cz+Math.sin(b)*r],
        p2=[cx+Math.cos(b)*r,y1,cz+Math.sin(b)*r],p3=[cx+Math.cos(a)*r,y1,cz+Math.sin(a)*r];
  builder.quad(p0,p3,p2,p1,col);if(cap){builder.tri([cx,y1,cz],p2,p3,col);builder.tri([cx,y0,cz],p0,p1,col)}
 }
}
function addColumn(builder,x,y,z,h=9.51,r=.52,col=C.marbleLight,ionic=true){
 addCylinder(builder,x,y,z,r*1.28,.28,12,col);addCylinder(builder,x,y+.28,z,r*1.02,h-.72,14,col);addCylinder(builder,x,y+h-.44,z,r*1.18,.24,12,col);
 addBox(builder,x,y+h-.10,z,r*3.0,.28,r*2.1,col);
 if(ionic){addCylinder(builder,x-r*.72,y+h-.16,z,r*.22,r*.42,8,col);addCylinder(builder,x+r*.72,y+h-.16,z,r*.22,r*.42,8,col)}
}
function addGableRoof(builder,cx,y,cz,w,d,rise,col,rot=0){
 // local points, ridge along width (x)
 const local=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
 const P=local.map(q=>rotXZ(cx+q[0],cz+q[1],cx,cz,rot));
 const R1=rotXZ(cx-w/2,cz,cx,cz,rot),R2=rotXZ(cx+w/2,cz,cx,cz,rot);
 const a=[P[0][0],y,P[0][1]],b=[P[1][0],y,P[1][1]],c=[P[2][0],y,P[2][1]],d0=[P[3][0],y,P[3][1]],
       r1=[R1[0],y+rise,R1[1]],r2=[R2[0],y+rise,R2[1]];
 builder.quad(a,r1,r2,b,col);builder.quad(r1,d0,c,r2,col);builder.tri(a,d0,r1,col);builder.tri(b,r2,c,col);
}
function addWallBetween(builder,x1,z1,x2,z2,h,t,col,y=0){
 const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz),ang=Math.atan2(dz,dx);
 addBox(builder,(x1+x2)/2,y+h/2,(z1+z2)/2,len,h,t,col,ang);
}
function registerWalkRect(cx,cz,sx,sz,y,rot=0,tag="surface",solidBelow=true){
 walkSurfaces.push({type:"rect",cx,cz,hx:sx/2,hz:sz/2,y,rot,tag,solidBelow});
}
function registerWalkDisk(cx,cz,r,y,tag="surface",solidBelow=true){walkSurfaces.push({type:"disk",cx,cz,r,y,tag,solidBelow})}
function registerWalkRampBetween(x1,z1,y1,x2,z2,y2,width,tag="ramp",solidBelow=true){
 const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz)||1;
 walkSurfaces.push({type:"ramp",x1,z1,y1,x2,z2,y2,width,len,dx:dx/len,dz:dz/len,tag,solidBelow});
}
function registerHazardRect(cx,cz,sx,sz,rot=0,tag="hazard"){
 hazardZones.push({type:"rect",cx,cz,hx:sx/2,hz:sz/2,rot,tag});
}
function registerHazardDisk(cx,cz,r,tag="hazard"){hazardZones.push({type:"disk",cx,cz,r,tag})}
function pointInOrientedRect(x,z,o,pad=0){
 const dx=x-o.cx,dz=z-o.cz,ca=Math.cos(-o.rot),sa=Math.sin(-o.rot),lx=dx*ca-dz*sa,lz=dx*sa+dz*ca;
 return Math.abs(lx)<=o.hx+pad&&Math.abs(lz)<=o.hz+pad;
}
function addWalkRampBetween(builder,x1,z1,y1,x2,z2,y2,width,col,tag="ramp",solidBelow=true){
 const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len,w=width/2;
 builder.quad([x1+nx*w,y1,z1+nz*w],[x2+nx*w,y2,z2+nz*w],[x2-nx*w,y2,z2-nz*w],[x1-nx*w,y1,z1-nz*w],col);
 registerWalkRampBetween(x1,z1,y1,x2,z2,y2,width,tag,solidBelow);
}
function addWalkStaircase(builder,startX,startZ,rot,width,stepDepth,count,stepHeight,baseY,col,tag="stairs"){
 const fx=-Math.sin(rot),fz=Math.cos(rot);
 stairFlights.push({tag,count,stepHeight,stepDepth,width,start:[startX,startZ],rot});
 for(let i=0;i<count;i++){
  const top=baseY+(i+1)*stepHeight,depth=stepDepth+.06,cx=startX+fx*(i+.5)*stepDepth,cz=startZ+fz*(i+.5)*stepDepth;
  addBox(builder,cx,baseY+(top-baseY)/2,cz,width,top-baseY,depth,col,rot,false);
  registerWalkRect(cx,cz,width-.04,depth+Math.min(.42,stepDepth*.42),top,rot,tag+" · tread "+(i+1),true);
  // dark nose line makes each tread legible from normal eye height
  if(!MOBILE||i%2===0){const ex=startX+fx*((i+1)*stepDepth-.045),ez=startZ+fz*((i+1)*stepDepth-.045);addBox(builder,ex,top+.018,ez,width-.12,.036,.09,C.darkStone,rot,false)}
 }
}
function addWalkStaircaseBetween(builder,x1,z1,y1,x2,z2,y2,width,count,col,tag="stairs"){
 // Normalize low -> high so the same geometry is safely traversable in both directions.
 if(y2<y1){const tx=x1,tz=z1,ty=y1;x1=x2;z1=z2;y1=y2;x2=tx;z2=tz;y2=ty}
 const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz)||1,ux=dx/len,uz=dz/len,stepDepth=len/count,stepHeight=(y2-y1)/count,rot=Math.atan2(-ux,uz);
 stairFlights.push({tag,count,stepHeight,stepDepth,width,start:[x1,z1],end:[x2,z2],rot});
 for(let i=0;i<count;i++){
  const top=y1+(i+1)*stepHeight,cx=x1+ux*(i+.5)*stepDepth,cz=z1+uz*(i+.5)*stepDepth,depth=stepDepth+.07;
  addBox(builder,cx,y1+(top-y1)/2,cz,width,top-y1,depth,col,rot,false);
  registerWalkRect(cx,cz,width-.05,depth+Math.min(.42,stepDepth*.42),top,rot,tag+" · tread "+(i+1),true);
  if(!MOBILE||i%2===0){const ex=x1+ux*((i+1)*stepDepth-.045),ez=z1+uz*((i+1)*stepDepth-.045);addBox(builder,ex,top+.018,ez,width-.14,.036,.09,C.darkStone,rot,false)}
 }
}
function polylineOffsets(points,half){
 const out=[];
 for(let i=0;i<points.length;i++){
  const p=points[i];let n1=null,n2=null;
  if(i>0){const a=points[i-1],dx=p[0]-a[0],dz=p[1]-a[1],l=Math.hypot(dx,dz)||1;n1=[-dz/l,dx/l]}
  if(i<points.length-1){const b=points[i+1],dx=b[0]-p[0],dz=b[1]-p[1],l=Math.hypot(dx,dz)||1;n2=[-dz/l,dx/l]}
  if(!n1)n1=n2;if(!n2)n2=n1;let mx=n1[0]+n2[0],mz=n1[1]+n2[1],ml=Math.hypot(mx,mz);
  if(ml<.08){mx=n2[0];mz=n2[1];ml=1}mx/=ml;mz/=ml;let denom=mx*n2[0]+mz*n2[1],scale=half/Math.max(.38,Math.abs(denom));scale=Math.min(scale,half*2.2);out.push([mx*scale,mz*scale]);
 }
 return out;
}
function addRoad(points,width=7,col=C.road,builder=B){
 const era=builder===B425?425:builder===B301?301:0;mapRoads.push({points,width,era});const off=polylineOffsets(points,width/2);
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],oa=off[i],ob=off[i+1];builder.quad([a[0]+oa[0],.04,a[1]+oa[1]],[b[0]+ob[0],.04,b[1]+ob[1]],[b[0]-ob[0],.04,b[1]-ob[1]],[a[0]-oa[0],.04,a[1]-oa[1]],col)}
}
function addDisk(builder,cx,y,cz,r,seg,col){for(let i=0;i<seg;i++){const a=i*Math.PI*2/seg,b=(i+1)*Math.PI*2/seg;builder.tri([cx,y,cz],[cx+Math.cos(b)*r,y,cz+Math.sin(b)*r],[cx+Math.cos(a)*r,y,cz+Math.sin(a)*r],col)}}
function addRing(builder,cx,y,cz,r0,r1,seg,col,start=0,end=Math.PI*2,raise=0){
 if(MOBILE)seg=Math.min(seg,32);
 for(let i=0;i<seg;i++){const a=lerp(start,end,i/seg),b=lerp(start,end,(i+1)/seg),ya=y+raise*i/seg,yb=y+raise*(i+1)/seg;
  builder.quad([cx+Math.cos(a)*r0,ya,cz+Math.sin(a)*r0],[cx+Math.cos(b)*r0,yb,cz+Math.sin(b)*r0],[cx+Math.cos(b)*r1,yb,cz+Math.sin(b)*r1],[cx+Math.cos(a)*r1,ya,cz+Math.sin(a)*r1],col)
 }}
function addHill(cx,cz,r,h,col){
 const rings=MOBILE?5:7,seg=MOBILE?20:32;let prev=[];
 for(let ri=0;ri<=rings;ri++){
  const t=ri/rings,rr=r*t,yy=h*Math.pow(Math.cos(t*Math.PI*.5),1.45)-.16;const curr=[];
  if(ri===0){curr.push([cx,yy,cz]);prev=curr;continue}
  for(let i=0;i<seg;i++){const a=i*Math.PI*2/seg,jitter=1+Math.sin(i*2.17+cx*.013+cz*.009)*.035;curr.push([cx+Math.cos(a)*rr*jitter,yy*(1+Math.sin(i*1.7+ri)*.018),cz+Math.sin(a)*rr*jitter])}
  if(ri===1){for(let i=0;i<seg;i++)B.tri(prev[0],curr[(i+1)%seg],curr[i],col)}
  else{for(let i=0;i<seg;i++)B.quad(prev[i],prev[(i+1)%seg],curr[(i+1)%seg],curr[i],col)}
  prev=curr;
 }
}
function addTree(x,z,s=1){
 addCylinder(B,x,0,z,.20*s,2.25*s,7,C.wood);
 addCylinder(B,x,1.55*s,z,.92*s,1.15*s,8,rnd()>.5?C.tree:C.tree2);
 addCylinder(B,x-.24*s,2.16*s,z+.12*s,.72*s,.86*s,7,C.tree2);
 addCylinder(B,x+.30*s,2.05*s,z-.18*s,.64*s,.82*s,7,C.tree);
}
function addShrub(x,z,s=1){addCylinder(B,x,.03,z,.42*s,.58*s,7,rnd()>.5?C.tree:C.tree2)}
function addAmphora(x,z,s=1,col=C.red){
 addCylinder(B,x,.03,z,.23*s,.58*s,7,col);addCylinder(B,x,.52*s,z,.13*s,.28*s,7,col);addCylinder(B,x,.78*s,z,.18*s,.08*s,7,col);
}
function addCrate(x,z,s=1){addBox(B,x,.24*s,z,.72*s,.48*s,.62*s,C.wood,rand(-.18,.18));addBox(B,x,.52*s,z,.76*s,.05*s,.66*s,C.darkStone)}
function addCart(x,z,rot=0,s=1){
 addBox(B,x,.72*s,z,2.5*s,.18*s,1.35*s,C.wood,rot);
 addBox(B,x,.99*s,z,2.25*s,.52*s,1.12*s,C.wood,rot);
 const p1=facadePoint(x,z,rot,-.82*s,.72*s),p2=facadePoint(x,z,rot,.82*s,.72*s),p3=facadePoint(x,z,rot,-.82*s,-.72*s),p4=facadePoint(x,z,rot,.82*s,-.72*s);
 for(const p of [p1,p2,p3,p4])addBox(B,p[0],.46*s,p[1],.16*s,.78*s,.78*s,C.darkStone,rot);
 const shaft=facadePoint(x,z,rot,0,1.75*s);addBox(B,shaft[0],.73*s,shaft[1],.12*s,.12*s,2.4*s,C.wood,rot);
}
function addPerson(){return;} // compatibility stub; V8 emits no mannequin NPC geometry.
function addStall(x,z,rot=0){
 addBox(B,x,.55,z,3.7,1.1,1.6,C.wood,rot);addBox(B,x,2.25,z,4.4,.16,2.35,rnd()>.48?C.red:C.citizen2,rot);
 addBox(B,x-1.5*Math.cos(rot),1.6,z-1.5*Math.sin(rot),.13,2.1,.13,C.wood,rot);addBox(B,x+1.5*Math.cos(rot),1.6,z+1.5*Math.sin(rot),.13,2.1,.13,C.wood,rot);
 if(!MOBILE||rnd()>.35){const p1=facadePoint(x,z,rot,-.7,.25),p2=facadePoint(x,z,rot,.55,.28);addCrate(p1[0],p1[1],.75);addAmphora(p2[0],p2[1],.8)}
}
function addRoadCurbs(points,width=7){
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l,o=width*.5+.36;
  addWallBetween(B,a[0]+nx*o,a[1]+nz*o,b[0]+nx*o,b[1]+nz*o,.16,.34,C.limestone2,.04);
  addWallBetween(B,a[0]-nx*o,a[1]-nz*o,b[0]-nx*o,b[1]-nz*o,.16,.34,C.limestone2,.04);
 }
}
function addTombBomos(x,z,scale=1,col=C.limestone){
 addBox(B,x,.65*scale,z,1.1*scale,1.3*scale,.75*scale,col);addBox(B,x,1.4*scale,z,1.3*scale,.18*scale,.9*scale,col);
}
function facadePoint(x,z,rot,side,front){return [x+Math.cos(rot)*side-Math.sin(rot)*front,z+Math.sin(rot)*side+Math.cos(rot)*front]}
function addHouse(x,z,w,d,h,rot=0,wealth=0,shop=false){
 const wall=wealth===2?C.plaster3:wealth===1?C.plaster:C.plaster2,roof=wealth===2?C.roof:C.roof2;
 // stone socle + plastered masonry body: visually much less “plain box” than V2
 addBox(B,x,.38,z,w+.22,.76,d+.22,C.limestone2,rot);
 addBox(B,x,.76+(h-.76)/2,z,w,h-.76,d,wall,rot,true);
 addBox(B,x,h+.08,z,w+1.0,.18,d+1.0,C.wood,rot);
 addGableRoof(B,x,h+.18,z,w+1.25,d+1.25,Math.min(1.65,d*.19),roof,rot);
 // ridge tile / cap makes roof silhouettes read at street level
 addBox(B,x,h+Math.min(1.65,d*.19)+.20,z,w+1.12,.13,.20,C.roof2,rot);
 houseFootprints.push({x,z,w,d,rot,wealth,shop});
 const front=d/2+.065;
 let p=facadePoint(x,z,rot,0,front);addBox(B,p[0],1.15,p[1],1.12,2.28,.12,C.wood,rot);
 // stone jambs/lintel
 for(const side of [-.72,.72]){p=facadePoint(x,z,rot,side,front+.04);addBox(B,p[0],1.25,p[1],.16,2.55,.18,C.limestone,rot)}
 p=facadePoint(x,z,rot,0,front+.04);addBox(B,p[0],2.52,p[1],1.6,.18,.18,C.limestone,rot);
 const upper=h>4.15?1:0;if(upper){
   for(const side of [-w*.26,w*.26]){p=facadePoint(x,z,rot,side,front+.045);addBox(B,p[0],Math.min(h-1.05,3.25),p[1],1.05,1.12,.14,C.darkStone,rot);addBox(B,p[0],Math.min(h-.45,3.86),p[1],1.3,.10,.22,C.limestone,rot)}
 }
 if(shop){
   p=facadePoint(x,z,rot,-w*.22,front+.08);addBox(B,p[0],1.35,p[1],Math.min(2.8,w*.32),2.25,.16,C.darkStone,rot);
   // fabric shade projects from façade
   const ap=facadePoint(x,z,rot,-w*.22,front+1.15);addBox(B,ap[0],2.55,ap[1],Math.min(3.5,w*.42),.10,2.15,(rnd()>.5?C.red:C.citizen3),rot);
   if(!MOBILE||rnd()>.42){const g1=facadePoint(x,z,rot,w*.18,front+.72),g2=facadePoint(x,z,rot,w*.34,front+.62);addAmphora(g1[0],g1[1],.72);addCrate(g2[0],g2[1],.62)}
 }
 // occasional side annex / courtyard wall makes frontages irregular
 if(wealth>0&&rnd()>.55){const q=facadePoint(x,z,rot,w*.42,-d*.52);addBox(B,q[0],.8,q[1],w*.24,1.6,d*.35,C.limestone2,rot);if(rnd()>.45)addShrub(q[0]+1.1,q[1]+.8,.8)}
}
function addCourtyardHouse(x,z,w,d,rot=0){
 const a=rotXZ(x-w*.28,z-d*.18,x,z,rot),b=rotXZ(x+w*.26,z+d*.22,x,z,rot);
 addHouse(a[0],a[1],w*.48,d*.5,4.4,rot,2,false);addHouse(b[0],b[1],w*.42,d*.38,3.7,rot,1,false);
 // true perimeter walls with an entrance gap on the street-facing side
 let p=facadePoint(x,z,rot,0,-d*.5);addBox(B,p[0],.82,p[1],w,1.64,.42,C.limestone2,rot);
 for(const side of [-1,1]){p=facadePoint(x,z,rot,side*w*.5,0);addBox(B,p[0],.82,p[1],.42,1.64,d,C.limestone2,rot)}
 const seg=Math.max(2.2,w*.5-1.6);for(const side of [-1,1]){p=facadePoint(x,z,rot,side*(w*.25+.8),d*.5);addBox(B,p[0],.82,p[1],seg,1.64,.42,C.limestone2,rot)}
 if(!MOBILE||rnd()>.35){p=facadePoint(x,z,rot,0,0);addShrub(p[0],p[1],.95)}
}

function addStreetFrontage(points,spacing=16,offset=13,shopChance=.18,wealthBias=.35){
 const step=MOBILE?spacing*1.48:spacing;
 for(let si=0;si<points.length-1;si++){
  const a=points[si],b=points[si+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,tx=dx/len,tz=dz/len,nx=-tz,nz=tx;
  for(let q=step*.55;q<len-step*.25;q+=step){
   for(const side of [-1,1]){
    if(MOBILE&&rnd()>.78)continue;
    const jitter=rand(-1.2,1.2),cx=a[0]+tx*q+nx*(offset*side+jitter),cz=a[1]+tz*q+nz*(offset*side+jitter);
    const w=rand(7.8,12.8),d=rand(7.0,11.5),h=rand(3.8,6.4),frontX=-nx*side,frontZ=-nz*side,rot=Math.atan2(-frontX,frontZ);
    const wealth=rnd()<wealthBias?1:(rnd()>.91?2:0),shop=rnd()<shopChance;
    if(okayHouse(cx,cz,w,d))addHouse(cx,cz,w,d,h,rot+rand(-.035,.035),wealth,shop);
   }
  }
 }
}
function nearestStreetFacingRotation(x,z){
 let best=1e9,bestRot=0;
 for(const road of mapRoads){
  if(road.era&&road.era!==0)continue;
  const pts=road.points;
  for(let i=0;i<pts.length-1;i++){
   const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len2=dx*dx+dz*dz||1;
   const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/len2,0,1),px=a[0]+dx*t,pz=a[1]+dz*t,len=Math.sqrt(len2)||1,nx=-dz/len,nz=dx/len;
   const d=dist2(x,z,px,pz);
   if(d<best){
    best=d;
    const side=((x-px)*nx+(z-pz)*nz)>=0?1:-1;
    const frontX=-nx*side,frontZ=-nz*side;
    bestRot=Math.atan2(-frontX,frontZ)+rand(-.05,.05);
   }
  }
 }
 return bestRot;
}
function addQuarterInfill(cx,cz,rx,rz,count,shopChance=.12,wealthBias=.32,courtyardChance=.18){
 let placed=0,tries=0,maxTries=count*20;
 while(placed<count&&tries<maxTries){tries++;
  const x=rand(cx-rx,cx+rx),z=rand(cz-rz,cz+rz),w=rand(7.8,13.8),d=rand(7.2,12.4),rot=nearestStreetFacingRotation(x,z),wealth=rnd()<wealthBias?1:(rnd()>.925?2:0),shop=rnd()<shopChance;
  const courtyard=rnd()<courtyardChance&&w>10&&d>10,cw=courtyard?w*1.45:w,cd=courtyard?d*1.45:d;
  if(!okayHouse(x,z,cw,cd))continue;
  if(courtyard)addCourtyardHouse(x,z,cw,cd,rot); else addHouse(x,z,w,d,rand(3.9,6.4),rot,wealth,shop);
  placed++;
 }
}
function addBackdropQuarter(cx,cz,rows,cols,stepX,stepZ,rot=0){
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  if(MOBILE&&rnd()>.72)continue;
  const ox=(c-(cols-1)/2)*stepX+rand(-1.4,1.4),oz=(r-(rows-1)/2)*stepZ+rand(-1.4,1.4),p=rotXZ(cx+ox,cz+oz,cx,cz,rot);
  const w=rand(7.4,11.5),d=rand(6.8,10.8),h=rand(3.1,5.2),rr=rot+rand(-.08,.08),wall=rnd()>.68?C.plaster:C.plaster2,roof=rnd()>.5?C.roof:C.roof2;
  addBox(B,p[0],.34,p[1],w+.16,.68,d+.16,C.limestone2,rr,false);
  addBox(B,p[0],.68+(h-.68)/2,p[1],w,h-.68,d,wall,rr,false);
  addBox(B,p[0],h+.08,p[1],w+.8,.16,d+.8,C.wood,rr,false);
  addGableRoof(B,p[0],h+.16,p[1],w+1.0,d+1.0,Math.min(1.4,d*.18),roof,rr);
 }
}
function addField(cx,cz,w,d,rot,col=C.field){
 // broad field + furrows
 addBox(B,cx,.015,cz,w,.03,d,col,rot);
 fieldPolys.push({cx,cz,w,d,rot,col});
 const count=Math.floor(d/5);for(let i=0;i<count;i++){const oz=-d/2+3+i*5,pt=rotXZ(cx,cz+oz,cx,cz,rot);addBox(B,pt[0],.045,pt[1],w*.94,.04,.22,C.earth,rot)}
}
function addVineyard(cx,cz,w,d,rot=0){
 addBox(B,cx,.014,cz,w,.028,d,C.field2,rot);fieldPolys.push({cx,cz,w,d,rot,col:C.field2});
 for(let z=-d/2+3;z<d/2;z+=5)for(let x=-w/2+3;x<w/2;x+=4.5){const p=rotXZ(cx+x,cz+z,cx,cz,rot);addCylinder(B,p[0],0,p[1],.07,.65,5,C.wood);addCylinder(B,p[0],.45,p[1],.35,.35,6,C.vine)}
}

/* -------------------- river geometry -------------------- */
const riverPts=[[-20,-1150],[5,-900],[30,-690],[63,-470],[92,-285],[120,-105],[151,90],[190,305],[230,535],[265,790],[292,1040]];
function riverXAt(z){
 for(let i=0;i<riverPts.length-1;i++){const a=riverPts[i],b=riverPts[i+1];if(z>=a[1]&&z<=b[1]){const t=(z-a[1])/(b[1]-a[1]);return lerp(a[0],b[0],t)}}return z<riverPts[0][1]?riverPts[0][0]:riverPts[riverPts.length-1][0]
}
function ribbon(builder,pts,width){
 const off=polylineOffsets(pts,width/2);
 for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],oa=off[i],ob=off[i+1];builder.quad([a[0]+oa[0],.12,a[1]+oa[1]],[b[0]+ob[0],.12,b[1]+ob[1]],[b[0]-ob[0],.12,b[1]-ob[1]],[a[0]-oa[0],.12,a[1]-oa[1]],[.32,.52,.53])}
}
function addBridgeArchFace(builder,cx,cy,cz,r,thick,rot,sideOffset,col){
 const seg=MOBILE?8:14;
 for(let i=0;i<seg;i++){
  const a=Math.PI*i/seg,b=Math.PI*(i+1)/seg;
  const u0=Math.cos(a)*r,u1=Math.cos(b)*r,v0=Math.sin(a)*r*.28,v1=Math.sin(b)*r*.28;
  const u0i=Math.cos(a)*(r-thick),u1i=Math.cos(b)*(r-thick),v0i=Math.sin(a)*(r-thick)*.28,v1i=Math.sin(b)*(r-thick)*.28;
  const P=(u,v)=>{const x=cx+Math.cos(rot)*u-Math.sin(rot)*sideOffset,z=cz+Math.sin(rot)*u+Math.cos(rot)*sideOffset;return [x,cy+v,z]};
  if(sideOffset>0)builder.quad(P(u0,v0),P(u1,v1),P(u1i,v1i),P(u0i,v0i),col);else builder.quad(P(u0i,v0i),P(u1i,v1i),P(u1,v1),P(u0,v0),col);
 }
}
function bridgeAt(z,id,name,major=true){
 const x=riverXAt(z),dz=2,dx=riverXAt(z+dz)-riverXAt(z-dz),tang=Math.atan2(2*dz,dx),cross=tang+Math.PI/2,len=major?55:46,w=major?8.7:6.8,deckTop=3.01;
 addBox(B,x,2.72,z,len,.58,w,C.limestone,cross,false);
 registerWalkRect(x,z,len-1.4,w-.5,deckTop,cross,id+" deck",false);
 const off=w/2-.23,ox=-Math.sin(cross)*off,oz=Math.cos(cross)*off;
 addBox(B,x+ox,3.48,z+oz,len,.82,.46,C.limestone,cross);addBox(B,x-ox,3.48,z-oz,len,.82,.46,C.limestone,cross);
 const arches=major?3:2,span=(len-5)/arches,r=Math.min(8.2,span*.43);
 for(let j=0;j<=arches;j++){const u=-len/2+2.5+j*span,px=x+Math.cos(cross)*u,pz=z+Math.sin(cross)*u;addBox(B,px,1.27,pz,2.3,2.55,w+1.0,C.darkStone,cross)}
 for(let j=0;j<arches;j++){const u=-len/2+2.5+span*(j+.5),ax=x+Math.cos(cross)*u,az=z+Math.sin(cross)*u;addBridgeArchFace(B,ax,.40,az,r,1.0,cross,off+.03,C.limestone2);addBridgeArchFace(B,ax,.40,az,r,1.0,cross,-off-.03,C.limestone2)}
 // Walkable approach ramps. The earlier build visually raised the bridge but never raised the player onto it.
 const ux=Math.cos(cross),uz=Math.sin(cross),rampLen=major?17:14;
 for(const s of [-1,1]){
  const ex=x+ux*s*(len/2-.7),ez=z+uz*s*(len/2-.7),gx=x+ux*s*(len/2+rampLen),gz=z+uz*s*(len/2+rampLen);
  addWalkRampBetween(B,gx,gz,.06,ex,ez,deckTop,w-.7,C.roadLight,id+" approach",true);
  // low segmented curb lines make the climb readable and frame the safe walking corridor without becoming collision walls
  const rdx=ex-gx,rdz=ez-gz,rl=Math.hypot(rdx,rdz)||1,rx=rdx/rl,rz=rdz/rl,rnx=-rz,rnz=rx;
  for(const edge of [-1,1])for(let k=0;k<7;k++){const t0=k/7,t1=(k+1)/7,ax=lerp(gx,ex,t0)+rnx*edge*(w*.5-.22),az=lerp(gz,ez,t0)+rnz*edge*(w*.5-.22),bx=lerp(gx,ex,t1)+rnx*edge*(w*.5-.22),bz=lerp(gz,ez,t1)+rnz*edge*(w*.5-.22),yy=lerp(.06,deckTop,(t0+t1)*.5);addWallBetween(B,ax,az,bx,bz,.18,.18,C.limestone2,yy+.015)}
 }
 bridges.push({x,z,len,w,rot:cross,id,name,major,deckTop});
}
ribbon(BW,riverPts,31);

/* -------------------- monuments + research records -------------------- */
const landmarks=[];
function lm(id,name,x,z,radius,meta,certainty,stats,body,sources,era=0){
 const o={id,name,x,z,radius,meta,certainty,stats,body,sources,era};landmarks.push(o);return o
}
const SRC={
 temple:["DPU — Temple of Zeus","https://aizanoi.dpu.edu.tr/en/index/sayfa/13884/temple-of-zeus-in-aizanoi"],
 stadium:["DPU — Theatre–Stadium","https://aizanoi.dpu.edu.tr/en/index/sayfa/13885/theatre-stadion-structure-complex"],
 agora:["DPU — Agora & Propylon","https://aizanoi.dpu.edu.tr/en/index/sayfa/13886/agora-and-the-propylon"],
 fountain:["DPU — Agora Nymphaeum","https://aizanoi.dpu.edu.tr/en/index/sayfa/13887/fountainnymphaeum-structure-in-agora"],
 bath:["DPU — Bath–Palaestra","https://aizanoi.dpu.edu.tr/en/index/sayfa/13888/roman-bath-palaestra-structure-complex"],
 mosaic:["DPU — Mosaic Bath","https://aizanoi.dpu.edu.tr/en/index/sayfa/13889/mosaic-bath"],
 street:["DPU — Colonnaded Street","https://aizanoi.dpu.edu.tr/en/index/sayfa/13890/columned-street"],
 mac:["DPU — Macellum","https://aizanoi.dpu.edu.tr/en/index/sayfa/13891/macellum"],
 odeon:["DPU — Odeon / Bouleuterion","https://aizanoi.dpu.edu.tr/en/index/sayfa/13892/odeon-bouleterion"],
 meter:["DPU — Meter Steunene","https://aizanoi.dpu.edu.tr/en/index/sayfa/13893/sacred-place-of-the-meter-steunene-cybele"],
 river:["DPU — Penkalas & Bridges","https://aizanoi.dpu.edu.tr/en/index/sayfa/13894/penkalas-and-the-bridges"],
 urban:["Tandoğan & Erdoğan 2020 — urban plan","https://dergipark.org.tr/en/download/article-file/1136042"],
 penkalas:["Özer & Özcan 2022 — Penkalas archaeology","https://dergipark.org.tr/en/pub/iuarts/article/1021334"],
 theatreTopos:["Türkan 2025 — Theatre topos inscriptions","https://philiajournal.com/index.php/phl/en/article/view/281"],
 funerary:["Türkan & Corsten 2024 — New inscriptions","https://dergipark.org.tr/en/pub/gephyra/article/1271108"]
};

/* terrain */
addBox(B,50,-.22,-200,3600,.4,3600,C.dryGrass);
addHill(-820,880,540,52,C.field2);addHill(650,970,520,44,C.tree2);addHill(900,-640,670,60,C.field2);addHill(-900,-980,610,46,C.field2);

/* outer fields and agricultural landscape */
for(let i=0;i<(MOBILE?14:30);i++){const side=i%2?1:-1,x=side*rand(520,1150),z=rand(-850,920),w=rand(80,180),d=rand(70,160),r=rand(-.35,.35);addField(x,z,w,d,r,i%3===0?C.field2:C.field)}
addVineyard(-740,-160,150,110,.16);addVineyard(710,150,145,110,-.22);addVineyard(-610,530,140,100,.08);
for(let i=0;i<(MOBILE?42:90);i++){let z=rand(-800,850),x=riverXAt(z)+(rnd()<.5?-1:1)*rand(22,54);addTree(x,z,rand(.75,1.25))}

/* organic roads: regional and urban */
addRoad([[-780,-410],[-540,-315],[-330,-220],[-190,-130],[-50,-70],[88,-20],[260,25],[520,95],[830,160]],8.5,C.roadLight);
addRoad([[-435,680],[-360,500],[-300,320],[-220,150],[-140,15],[-55,-165],[-30,-350]],7.8);
addRoad([[-540,250],[-395,220],[-270,135],[-165,40],[-65,-12]],7.0);
addRoad([[-150,-330],[-60,-275],[35,-220],[130,-150],[260,-70],[430,-15]],6.5);
addRoad([[0,-600],[35,-470],[78,-355],[100,-240],[105,-120],[125,25],[160,175],[220,350]],6.3);
addRoad([[-320,510],[-250,580],[-220,680],[-210,800]],7.0);
addRoad([[195,150],[300,220],[430,290],[600,360]],6.8);
addRoad([[-280,-470],[-420,-570],[-620,-670]],6.7);
// stone-edged civic routes: subtle curb lines create readable street canyons at first-person height
addRoadCurbs([[-540,250],[-395,220],[-270,135],[-165,40],[-65,-12]],7.0);
addRoadCurbs([[-150,-330],[-60,-275],[35,-220],[130,-150],[260,-70],[430,-15]],6.5);
addRoadCurbs([[0,-600],[35,-470],[78,-355],[100,-240],[105,-120],[125,25],[160,175],[220,350]],6.3);


/* bridges and quay walls */
bridgeAt(-360,"bridge1","Southern Roman Bridge",true);
bridgeAt(-160,"bridge2","Market / Agora Bridge",true);
bridgeAt(70,"bridge3","Central Roman Bridge",true);
bridgeAt(300,"bridge4","Northern Roman Bridge",true);
for(let z=-430;z<=390;z+=24){const x=riverXAt(z),dx=riverXAt(z+2)-riverXAt(z-2),ang=Math.atan2(4,dx),cross=ang+Math.PI/2; // tangent/normal
 const nx=Math.cos(cross)*17,nz=Math.sin(cross)*17;addBox(B,x+nx,1.05,z+nz,1.5,2.1,23,C.limestone2,ang);addBox(B,x-nx,1.05,z-nz,1.5,2.1,23,C.limestone2,ang);
}
lm("penkalas","Penkalas River & Quays",125,45,95,"URBAN HYDRAULICS · 2nd c. AD","high",
 [["Ancient name","Penkalas"],["Modern watercourse","Kocaçay / Bedir River"],["Urban engineering","Quays + four monumental bridges"],["Roman dam","~3 km south of the centre"]],
 `<p>The Penkalas is not scenery added around the city; it is one of Aizanoi's principal urban organisers. Official excavation material records <b>four bridges constructed by the Eurykles family in the Hadrianic period</b> and stone quay walls built along the intervening riverbanks.</p><h3>What you are walking through</h3><p>The river channel, bridge sequence and fortified urban banks are rendered as a continuous civic corridor. The exact Roman shoreline varied through time, so the water width and planting are reconstructed rather than surveyed to centimetre accuracy.</p><p>The broader Penkalas project has also produced reused funerary blocks from later phases, reminding us that the riverfront itself changed significantly in Late Antiquity.</p>`,[SRC.river,SRC.penkalas,SRC.funerary]);

/* Temple of Zeus */
(function(){
 const cx=-160,cz=20;
 // temenos terrace and boundary. East wall is split to make the monumental approach physically readable.
 addBox(B,cx,1.0,cz,118,2,104,C.limestone2);registerWalkRect(cx,cz,116,102,2.0,0,"Zeus temenos terrace",true);
 addBox(B,cx-58,2.25,cz,1.8,4.5,104,C.limestone2);
 addBox(B,cx+58,2.25,cz-31,1.8,4.5,42,C.limestone2);addBox(B,cx+58,2.25,cz+31,1.8,4.5,42,C.limestone2);
 addBox(B,cx,2.25,cz-51,118,4.5,1.8,C.limestone2);addBox(B,cx,2.25,cz+51,118,4.5,1.8,C.limestone2);
 // ten-step eastern approach from city level to the sanctuary terrace
 addWalkStaircase(B,cx+64,cz,Math.PI/2,14,1.25,10,.20,0,C.marble,"Zeus sanctuary approach");
 // V8 podium ascent: twelve lower treads replace the old 42 cm ledges, improving human-scale height perception and bidirectional traversal.
 for(let i=0;i<12;i++){const top=2.0+(i+1)*.28,cy=2.0+(top-2.0)/2,sx=61-i*.55,sz=41-i*.45;addBox(B,cx,cy,cz,sx,top-2.0,sz,C.marble);registerWalkRect(cx,cz,sx-.04,sz-.04,top,0,"Zeus podium stair · tread "+(i+1),true);if(!MOBILE||i%2===0){addBox(B,cx+sx/2-.04,top+.018,cz,.08,.036,sz-.2,C.darkStone);addBox(B,cx-sx/2+.04,top+.018,cz,.08,.036,sz-.2,C.darkStone)}}
 const baseY=4.3;addBox(B,cx,baseY,cz,55,2.3,35,C.marble,0,false);registerWalkRect(cx,cz,54.6,34.6,5.45,0,"Zeus podium",true);
 const x0=cx-24.5,x1=cx+24.5,z0=cz-14.5,z1=cz+14.5;
 for(let i=0;i<15;i++){const x=lerp(x0,x1,i/14);addColumn(B,x,5.45,z0);addColumn(B,x,5.45,z1)}
 for(let i=1;i<7;i++){const z=lerp(z0,z1,i/7);addColumn(B,x0,5.45,z);addColumn(B,x1,5.45,z)}
 addBox(B,cx,10.2,cz,37,10.2,18,C.marble,0,true);
 // continuous entablature and pale tiled roof restore the temple silhouette
 addBox(B,cx,15.15,cz-15.05,53.5,1.18,1.35,C.marbleLight);addBox(B,cx,15.15,cz+15.05,53.5,1.18,1.35,C.marbleLight);
 addBox(B,cx-25.05,15.15,cz,1.35,1.18,31.3,C.marbleLight);addBox(B,cx+25.05,15.15,cz,1.35,1.18,31.3,C.marbleLight);
 addGableRoof(B,cx,15.78,cz,55.7,34.4,5.7,C.marbleLight,0);
 // shallow polychrome frieze cue; explicitly reconstructed
 addBox(B,cx,14.70,cz-15.78,45,.34,.16,C.red);
 // east altar axis (the walkable approach stair is generated above)
 addBox(B,cx+38,2.90,cz,7.4,1.25,5.4,C.marble);
 // underground chamber entrance cue on west
 addBox(B,cx-28,3.2,cz,2.0,3.3,4.8,C.darkStone);
 // bronze east door, altar furniture and acroteria cues (reconstructed decorative completion)
 addBox(B,cx+18.62,10.1,cz,.18,5.9,6.4,C.bronze,0);
 addBox(B,cx+38,3.65,cz,5.7,.45,4.1,C.marble);addCylinder(B,cx+38,3.9,cz,.72,.38,10,C.bronze);
 for(const zz of [-13.7,13.7]){addCylinder(B,cx-24.8,16.05,cz+zz,.30,1.05,7,C.marbleLight);addCylinder(B,cx+24.8,16.05,cz+zz,.30,1.05,7,C.marbleLight)}
 lm("temple","Temple of Zeus",cx,cz,92,"SANCTUARY · AD 92 → HADRIANIC PERIOD","high",
 [["Podium","35 × 55 m"],["Order","Ionic; octastyle pseudodipteros"],["Peristyle","8 × 15; 42 columns total"],["Column height","~9.51 m incl. base/capital"],["Lower space","Large semicircular-vaulted chamber"]],
 `<p>Aizanoi's Zeus temple stands on a mound with occupation extending far earlier than the Roman monument. The official excavation page dates the start of construction to <b>AD 92 under Domitian</b>, with work continuing into the Hadrianic period.</p><h3>Architecture</h3><p>The temple is an <b>octastyle pseudodipteros</b>: eight columns on each short façade and fifteen along each long side, with 42 surrounding columns in total. The monolithic shafts, bases and Ionic capitals reach about 9.51 m.</p><p>The cella is raised on a podium and a large vaulted chamber extends beneath ground level. Interpretations of this lower chamber include storage and a relationship with the cult of Meter Steunene; the excavation authority presents both views rather than a single certainty.</p><h3>Politics written on the walls</h3><p>Greek and Latin inscriptions on the pronaos walls document disputes over the rents of <i>kleroi</i>, temple lands, in the Hadrianic period. They turn the building into a document of landholding and imperial-local negotiation as well as cult.</p><h3>Reconstruction note</h3><p>The podium proportions, column count and approximate column height are evidence-led. The complete roof, painted surfaces, doors, altar elevation and detailed interior furnishings are reconstructed.</p>`,[SRC.temple,SRC.urban]);
})();

/* Agora + Propylon + Nymphaeum + Heroon + shops */
(function(){
 const cx=-65,cz=-35;
 addBox(B,cx,.10,cz,98,.16,82,C.roadLight);
 // south stoa block / shops
 addBox(B,cx,3.1,cz-49,97,6.2,18,C.plaster,0,true);
 for(let x=-108;x<=-22;x+=12){addBox(B,x,1.45,cz-39.8,8.2,2.7,.22,C.wood);addBox(B,x,.65,cz-33.3,5.5,1.1,4,C.wood)}
 // west stoa & east colonnade
 for(let z=cz-36;z<=cz+35;z+=6.7){addColumn(B,cx-46,.2,z,5.8,.34,C.marble,false);addColumn(B,cx+44,.2,z,5.8,.34,C.marble,false)}
 for(let x=cx-45;x<=cx+43;x+=6.5)addColumn(B,x,.2,cz-39,5.8,.34,C.marble,false);
 // tie the colonnades together with low entablatures instead of isolated poles
 addBox(B,cx-46,6.05,cz,1.0,.48,77,C.marbleLight);addBox(B,cx+44,6.05,cz,1.0,.48,77,C.marbleLight);addBox(B,cx,6.05,cz-39,91,.48,1.0,C.marbleLight);
 // civic statues / honorific bases and clustered market goods
 for(const q of [[cx-18,cz+12],[cx+8,cz+18],[cx+25,cz-4]]){addBox(B,q[0],.55,q[1],2.0,1.1,2.0,C.marble);addCylinder(B,q[0],1.1,q[1],.20,2.2,8,C.bronze)}
 for(let i=0;i<(MOBILE?5:11);i++){addAmphora(cx-31+i*5.3,cz-31+(i%2)*2.2,.72);if(i%3===0)addCrate(cx-29+i*5.3,cz-27,.68)}
 // Propylon: 30 real treads rising westward from agora level toward the sanctuary terrace.
 // The exact landing geometry remains schematic, but traversal now matches the visible stair flight.
 addWalkStaircaseBetween(B,cx-23,cz+1,.10,cx-42,cz+1,2.02,14.5,30,C.marble,"Propylon monumental stair");
 addBox(B,cx-44,2.02,cz+1,5.0,.16,14.5,C.marble,0,false);registerWalkRect(cx-44,cz+1,4.9,14.35,2.10,0,"Propylon upper landing",true);
 for(let x=cx-61;x<=cx-42;x+=6.3)for(let z=cz-3;z<=cz+5;z+=8)addColumn(B,x,2.8,z,7.2,.43,C.marbleLight,true);
 // nymphaeum, 5.23 diameter foundation
 addCylinder(B,cx+35,.08,cz+29,3.05,.42,24,C.marble);addCylinder(B,cx+35,.48,cz+29,2.62,.16,24,[.32,.53,.55]);registerHazardDisk(cx+35,cz+29,2.55,"Agora nymphaeum basin");addColumn(B,cx+35,.65,cz+29,3.5,.35,C.marble,false);
 // heroon at eastern stoa
 addBox(B,cx+49,1.0,cz+8,11,2,10,C.marble);addColumn(B,cx+46,2.0,cz+3,5.5,.34,C.marbleLight);addColumn(B,cx+52,2.0,cz+3,5.5,.34,C.marbleLight);
 lm("agora","Agora, Propylon & Nymphaeum",cx,cz,90,"CIVIC CENTRE · IMPERIAL PERIOD","high",
 [["Agora E–W axis","97.36 m"],["West stoa width","8.88 m"],["South stoa width","19.20 m"],["Propylon","30.70 × 14.50 m"],["Propylon stair","30 steps"],["Nymphaeum diameter","5.23 m"]],
 `<p>The agora occupies the plain <b>between the Temple of Zeus and the Penkalas</b>. Its east–west dimension is known as 97.36 m; its northern boundary is not fully determined, so the reconstruction does not pretend that every side is equally secure.</p><h3>Shops and production</h3><p>The south stoa differs from the others and contained a row of excavated shops. Finds include lamps associated with lamp/oil retail and more than a thousand bone objects at shops involved in bone working and sale. Those activities are represented here with market fronts rather than generic empty colonnades.</p><h3>Propylon</h3><p>The monumental link toward the Zeus sanctuary measures 30.70 × 14.50 m. Recent excavation exposed the foundations and changed earlier ideas about its restitution. The official page records a 30-step ascent with landings; the elevation you see is therefore intentionally schematic.</p><h3>Water display</h3><p>The agora nymphaeum discovered in 2022 has a 5.23 m foundation diameter. Marble base and parapet blocks formed a basin with a central water channel and a terracotta-pipe drainage line to the north.</p>`,[SRC.agora,SRC.fountain]);
})();

/* Bouleuterion / Odeon and Doric hall cue */
(function(){
 const cx=-78,cz=-142;
 addBox(B,cx,.16,cz,48,.3,45,C.limestone);
 addBox(B,cx,3.0,cz-20,48,6,5,C.limestone,0,true);
 for(let r=8;r<22;r+=2.15)addRing(B,cx,.3+(r-8)*.18,cz+5,r-1.65,r,48,C.limestone,0,Math.PI);
 for(const a of [.25*Math.PI,.5*Math.PI,.75*Math.PI]){const x1=cx+Math.cos(a)*8.5,z1=cz+5+Math.sin(a)*8.5,x2=cx+Math.cos(a)*21.5,z2=cz+5+Math.sin(a)*21.5;addWalkStaircaseBetween(B,x1,z1,.10,x2,z2,2.73,1.35,15,C.darkStone,"Odeon radial stair")}
 addBox(B,cx,2.8,cz+4,37,5.6,4,C.marble);
 // adjacent doric hall axis
 for(let i=0;i<9;i++)addColumn(B,cx+30+i*6.3,.1,cz-9,5.3,.33,C.limestone,false);
 lm("odeon","Bouleuterion / Odeon",cx,cz,52,"COUNCIL / PERFORMANCE · 1st c. AD onward","high",
 [["Plan","Square envelope; semicircular cavea"],["Initial interpretation","Bouleuterion / council hall"],["Later use","Odeon, with stage additions"],["Longevity","Used into the Middle Byzantine period"]],
 `<p>Southeast of the Zeus temenos, among the agora and other public structures, stands a square-plan building with a semicircular seating area. Excavation evidence suggests it was first a <b>bouleuterion</b>—a place of civic debate and decisions—and later adapted as an <b>odeon</b>.</p><p>The later phase includes a scaenae frons but no full pulpitum, which is one of the clues behind the changing interpretation. Some entrances and seating reused earlier material. The building's long life makes it a useful reminder that Aizanoi's urban monuments were repeatedly modified rather than frozen at one date.</p>`,[SRC.odeon,SRC.urban]);
})();

/* Great Bath - Palaestra */
(function(){
 const cx=-315,cz=280;
 // huge palaestra outline 110x145
 addBox(B,cx,.06,cz,110,.08,145,C.earth);
 for(const side of [-1,1]){for(let z=cz-65;z<=cz+65;z+=8.5)addColumn(B,cx+side*51,.1,z,5.2,.32,C.limestone,false)}
 for(const side of [-1,1]){for(let x=cx-45;x<=cx+45;x+=8.5)addColumn(B,x,.1,cz+side*67,.0+5.2,.32,C.limestone,false)}
 // bath block southwest corner
 const bx=cx-40,bz=cz-27;
 // V7 opens the bath mass into courts and rooms rather than rendering one opaque block
 addBox(B,bx,3.2,bz-30.5,68,6.4,2.2,C.limestone,0,true);addBox(B,bx,3.2,bz+30.5,68,6.4,2.2,C.limestone,0,true);
 addBox(B,bx-32.9,3.2,bz,2.2,6.4,61,C.limestone,0,true);addBox(B,bx+32.9,3.2,bz,2.2,6.4,61,C.limestone,0,true);
 // internal thermal rooms, lower connecting walls and vaulted/apsed volume cues
 addBox(B,bx-15,3.7,bz-3,22,7.4,22,C.plaster3,0,true);addBox(B,bx+13,3.7,bz-3,24,7.4,22,C.plaster3,0,true);
 addBox(B,bx,2.1,bz+15,50,4.2,2.0,C.limestone2,0,true);
 addCylinder(B,bx-14,0,bz+19,11,6.5,18,C.limestone);addCylinder(B,bx+14,0,bz+19,11,6.5,18,C.limestone);
 // natatio exact 18 x 4.70
 addBox(B,cx+8,.05,cz+20,18,.10,4.7,C.marble);addBox(B,cx+8,.11,cz+20,16.8,.09,3.6,[.31,.55,.57]);registerHazardRect(cx+8,cz+20,16.4,3.4,0,"natatio");
 // hypocaust piers at exposed corner
 for(let x=bx-28;x<bx-9;x+=3)for(let z=bz-29;z<bz-13;z+=3)addBox(B,x,.35,z,.7,.7,.7,C.red);
 // palaestra furniture / planting cues keep the enormous exercise court visually inhabited
 for(let i=0;i<(MOBILE?6:13);i++){const px=cx-35+i*6.2,pz=cz+42+(i%2)*5;addBox(B,px,.35,pz,2.6,.7,.65,C.wood);if(i%3===0)addShrub(px+2.2,pz,.75)}
 lm("greatbath","Great Bath–Palaestra",cx,cz,105,"THERMAE / ATHLETICS · MID-2nd c. AD","high",
 [["Palaestra","110 × 145 m"],["Natatio","18 × 4.70 m"],["Pool depth","~1 m"],["Bath type","Minor Imperial"],["Orientation","Southwest"],["Notable find","Marble Hygieia statue"]],
 `<p>One of Aizanoi's largest civic complexes lies northwest of the Zeus sanctuary. The official excavation description dates it around the <b>mid-2nd century AD</b> and identifies a minor Imperial bath plan with symmetrical principal bathing rooms.</p><h3>Bath sequence</h3><p>The complex includes the expected thermal logic of cold and hot rooms, service spaces and richly finished interiors. A marble statue of <b>Hygieia</b> was recovered from an apse. Marble revetment fragments demonstrate high-quality interior decoration.</p><h3>Palaestra and pool</h3><p>The palaestra is given as <b>110 × 145 m</b>. The natatio excavated in 2019 measures <b>18 × 4.70 m</b> and about 1 m deep. Those dimensions are directly reflected in the model; the complete colonnade and roof lines are reconstructed.</p>`,[SRC.bath,SRC.urban]);
})();

/* Stadium - Theatre */
(function(){
 const sx=-230,stageZ=680;
 // stadium track extending south from stage
 addBox(B,sx,.05,stageZ-125,58,.10,220,C.earth);
 // side seating low slopes: stepped long rows
 for(let k=0;k<10;k++){const off=31+k*1.8,h=.38+k*.36;addBox(B,sx-off,h/2,stageZ-125,2.0,h,215,C.limestone);addBox(B,sx+off,h/2,stageZ-125,2.0,h,215,C.limestone)}
 // curved southern end
 for(let r=30;r<=47;r+=2.2)addRing(B,sx,.2+(r-30)*.13,stageZ-233,r-1.8,r,48,C.limestone,Math.PI,Math.PI*2);
 // stepped access aisles across the low stadium tribunals
 for(const zz of [stageZ-205,stageZ-150,stageZ-95,stageZ-45]){
  addWalkStaircaseBetween(B,sx-30.5,zz,.10,sx-48,zz,3.62,1.55,20,C.darkStone,"West stadium stair");
  addWalkStaircaseBetween(B,sx+30.5,zz,.10,sx+48,zz,3.62,1.55,20,C.darkStone,"East stadium stair");
 }
 // shared stage building
 addBox(B,sx,9.2,stageZ,82,18.4,15,C.limestone,0,true);
 addBox(B,sx,14.2,stageZ,75,10,9,C.marble);
 for(let i=0;i<7;i++)addColumn(B,sx-30+i*10,18.2,stageZ+7.7,6,.38,C.marbleLight);
 for(let i=0;i<6;i++){const xx=sx-25+i*10;addBox(B,xx,12.2,stageZ+7.25,5.4,5.8,.35,C.darkStone);addBox(B,xx,15.25,stageZ+7.05,6.0,.28,.50,C.marbleLight)}
 // theatre north, cavea radius ~51.75m derived from specialist database; lower rows + upper structure
 const tcx=sx,tcz=stageZ+68;
 addDisk(B,tcx,.12,tcz,17.65,48,C.marble);
 for(let r=19;r<=51;r+=2.25)addRing(B,tcx,.2+(r-19)*.24,tcz,r-1.75,r,64,C.limestone,0,Math.PI);
 // radial stair breaks represented with darker strips
 for(let i=0;i<9;i++){const a=i*Math.PI/8;const x1=tcx+Math.cos(a)*20,z1=tcz+Math.sin(a)*20,x2=tcx+Math.cos(a)*50,z2=tcz+Math.sin(a)*50;addWalkStaircaseBetween(B,x1,z1,.10,x2,z2,7.64,1.45,42,C.darkStone,"Theatre cavea stair")}
 lm("stadium","Stadium",sx,stageZ-125,120,"SPECTACLE COMPLEX · 1st–3rd c. AD","high",
 [["Estimated capacity","~13,000"],["Tribune profile","Unusually low inclination"],["Relation to theatre","Same axis; shared stage building"],["West side","Lodge and passageways"],["Entrances","Hierarchically differentiated"]],
 `<p>The stadium forms the southern half of Aizanoi's extraordinary theatre–stadium complex. The two venues align on one axis and use opposite sides of the same stage building. The official excavation page calls this arrangement unique in antiquity.</p><p>The stadium's seating is described as having a relatively low inclination, with a gentle outward curve near the middle. The western tribune had a lodge and passageways and differed in material quality; entrance remains suggest hierarchical access.</p><p>The long footprint here is scaled from published plans rather than presented as a newly measured exact stadium length. The securely sourced figure used in the interpretation is its approximately <b>13,000 spectator capacity</b>.</p>`,[SRC.stadium,SRC.urban]);
 lm("theatre","Theatre",tcx,tcz,92,"THEATRE · IMPERIAL PERIOD","high",
 [["Estimated capacity","~20,000"],["Cavea","Ima + summa separated by diazoma"],["Vomitoria","14 at diazoma level"],["Stage building","Expanded to three storeys"],["Civic seating","Topos inscriptions identify phylai"]],
 `<p>The theatre opens north from the shared stage building. Its lower cavea leans against the natural slope; the upper cavea was supported on vaulted substructures and has largely collapsed archaeologically.</p><h3>Movement and architecture</h3><p>Fourteen vomitoria at diazoma level connected circulation passages with stairways into the upper seating. The stage building began as a one-storey structure and was later raised by two additional storeys, with marble architectural ornament on the façade.</p><h3>Who sat where?</h3><p>A 2025 study of 33 <i>topos</i> inscriptions from excavations in the orchestra, ima cavea and diazoma adds unusually intimate civic detail. Inscriptions name Aizanoi's <b>phylai</b> (civic tribes): Hadriane, Asklepias, Dionysias and Metroas are identified, with Heraklea probably completing a five-phylai structure. Other inscriptions record individual seat reservations and perhaps patrons.</p><p>The model's cavea diameter is guided by specialist published measurements, while the decorative completion of the stage façade is reconstructed.</p>`,[SRC.stadium,SRC.theatreTopos]);
})();

/* Mosaic Bath */
(function(){
 const cx=285,cz=105;
 // perimeter and room walls leave the mosaic/hypocaust visible instead of sealing it in a box
 addBox(B,cx,2.8,cz-22,50,5.6,2.0,C.limestone,0,true);addBox(B,cx,2.8,cz+22,50,5.6,2.0,C.limestone,0,true);
 addBox(B,cx-24,2.8,cz,2.0,5.6,42,C.limestone,0,true);addBox(B,cx+24,2.8,cz,2.0,5.6,42,C.limestone,0,true);
 // room pattern
 addBox(B,cx-14,3.2,cz-10,16,6.4,2.0,C.plaster3,0,true);addBox(B,cx+6,3.2,cz-10,18,6.4,2.0,C.plaster3,0,true);addBox(B,cx+16,2.9,cz+12,2.0,5.8,14,C.plaster,0,true);
 // hypocaust visible grid
 for(let x=cx-21;x<cx-3;x+=2.6)for(let z=cz+10;z<cz+20;z+=2.6)addBox(B,x,.33,z,.55,.66,.55,C.red);
 // mosaic floor checker
 for(let i=0;i<12;i++)for(let j=0;j<9;j++)addBox(B,cx-20+i*1.6,.08,cz-18+j*1.6,1.5,.04,1.5,(i+j)%2?C.mosaicDark:C.mosaicLight);
 // 425 reuse cue
 addBox(B425,cx,5.0,cz+2,3,10,42,C.limestone);addBox(B425,cx,5.0,cz+2,44,10,3,C.limestone);
 lm("mosaicbath","Mosaic Bath",cx,cz,58,"THERMAE · 2nd–3rd c. AD","high",
 [["Approx. date","2nd–3rd c. AD"],["Heating","Hypocaust"],["Rooms","Apodyterium, tepidarium, calidarium, frigidarium"],["Mosaic","Satyr and maenad"],["Later history","Basilical / church reuse"]],
 `<p>The bath east of the river preserves a conventional Roman thermal sequence with <b>hypocaust heating</b>, changing room and cold, warm and hot spaces. Its best-known floor mosaic depicts a <b>satyr and maenad</b>, connecting the interior decoration to Dionysian imagery.</p><p>The excavated bath later lost its original identity: mosaic-bearing areas were converted to a basilical arrangement and, in the Justinianic period, to a church. The AD 425 layer shows only schematic reuse walls because those transformations span phases and should not be collapsed into a false single date.</p>`,[SRC.mosaic,SRC.urban]);
})();

/* Macellum */
(function(){
 const cx=60,cz=-300;
 addDisk(B,cx,.08,cz,26,40,C.roadLight);
 // circular central tholos/market feature, 13.27m diameter
 addCylinder(B,cx,.1,cz,7.25,1.1,32,C.marble);registerWalkDisk(cx,cz,7.05,1.20,"Macellum central podium",true);
 addWalkStaircaseBetween(B,cx,cz-10,.08,cx,cz-6.45,1.20,2.9,6,C.marble,"Macellum podium stair");
 for(let i=0;i<12;i++){const a=i*Math.PI*2/12,x=cx+Math.cos(a)*6.1,z=cz+Math.sin(a)*6.1;addColumn(B,x,1.15,z,4.8,.31,C.marbleLight,false)}
 // shop ring
 for(let i=0;i<16;i++){const a=i*Math.PI*2/16,x=cx+Math.cos(a)*23,z=cz+Math.sin(a)*23;addBox(B,x,2.25,z,8,4.5,6,C.plaster,a,true);addGableRoof(B,x,4.55,z,8.6,6.5,1.0,i%2?C.roof:C.roof2,a);if((!MOBILE||i%2===0)&&i%3!==1){const q=facadePoint(x,z,a,0,3.6);addAmphora(q[0],q[1],.72);addCrate(q[0]+Math.cos(a)*.8,q[1]+Math.sin(a)*.8,.58)}}
 // 301 edict panels
 for(let i=0;i<12;i++){const a=i*Math.PI*2/12,x=cx+Math.cos(a)*7.35,z=cz+Math.sin(a)*7.35;addBox(B301,x,1.15,z,2.3,2.3,.16,C.marbleLight,-a)}
 lm("macellum","Macellum & Price Edict",cx,cz,58,"FOOD MARKET · 2nd c. AD / EDICT AD 301","high",
 [["Central structure diameter","13.27 m"],["Original segmentation","12 whole + 4 half sections"],["Function","Macellum / food market"],["Edict layer","AD 301"],["Languages","Greek and Latin copies"]],
 `<p>The Macellum is a Roman market complex centred on a circular podium structure. The excavation authority explicitly cautions against the popular modern label “stock exchange”: the building is a <b>macellum</b>, associated with foods such as meat, fish, olive oil and baked products.</p><h3>AD 301</h3><p>The outer podium carried Greek and Latin copies of Diocletian's <i>Edictum de Pretiis Rerum Venalium</i>, the Maximum Price Edict of AD 301. It attempted to regulate maximum prices across the Empire. Switch to <b>AD 301</b> to reveal the inscription panels around the reconstructed circular monument.</p><p>The documented circular diameter is 13.27 m. Shop façades and merchandise displays beyond the core footprint are reconstructed.</p>`,[SRC.mac]);
})();

/* 5th-century colonnaded street */
(function(){
 const startZ=-335,endZ=-760,cx=15;
 addRoad([[cx,startZ],[10,-450],[-5,-575],[-18,endZ]],8,C.roadLight,B425);
 for(let z=startZ;z>=endZ;z-=11){const x=riverXAt(z)-82;addColumn(B425,x,.08,z,5.6,.34,(Math.floor(Math.abs(z))%3)?C.marble:C.limestone,false);addColumn(B425,x+18,.08,z,5.6,.34,C.marble,false)}
 for(let z=startZ-8;z>=endZ;z-=26){const x=riverXAt(z)-82;addBox(B425,x-13,2.4,z,9,4.8,11,C.plaster2,0);addBox(B425,x+31,2.4,z,9,4.8,11,C.plaster2,0)}
 lm("street","Early 5th-Century Colonnaded Street",-65,-540,90,"LATE ANTIQUE STREET · EARLY 5th c.","high",
 [["Date","Early 5th century"],["Estimated original length","~450 m"],["Material","Extensive spolia"],["Notable reuse","Elements linked to Temple of Artemis"]],
 `<p>This street belongs to the <b>early 5th century</b>, not to the mature 2nd-century city. It is therefore hidden in the AD 225 and AD 301 views and appears only in the AD 425 layer.</p><p>Its original length is estimated at about 450 m. Columns and entablature pieces differ because the street made extensive use of <b>spolia</b>. Some reused material has been associated with a 1st-century Temple of Artemis, including an architrave naming Artemis and Asklepiades.</p><p>The shop fronts along the street are reconstructed to communicate its commercial character; the mismatched column materials intentionally visualise reuse.</p>`,[SRC.street],425);
})();

/* Necropolises */
function buildNecropolis(id,name,cx,cz,count,spread){
 count=Math.max(14,Math.round(count*(MOBILE?.55:1)));
 for(let i=0;i<count;i++){const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*spread,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;if(i%5===0){addBox(B,x,.65,z,2.4,1.3,1.1,C.limestone);addGableRoof(B,x,1.3,z,2.8,1.5,.6,C.limestone)}else addTombBomos(x,z,rand(.7,1.2))}
 lm(id,name,cx,cz,spread+25,"FUNERARY LANDSCAPE · ROMAN IMPERIAL PERIOD","medium",
 [["Setting","Outside dense civic core / approach roads"],["Common monument cue","Bomos and stele forms"],["Evidence","Inscriptions, funerary altars, northern necropolis excavation"]],
 `<p>Aizanoi's funerary landscape contains numerous inscribed monuments. Studies of its <i>bomoi</i>—altar-shaped funerary markers—show garlands, busts and symbols that helped express identity and commemoration. Later riverfront construction also reused tombstones as building material.</p><p>The precise density and placement of every tomb represented here are not a surveyed cemetery plan. The zone is placed from archaeological mapping, while individual monuments are generated to convey the character of an extra-urban necropolis.</p>`,[SRC.funerary,SRC.urban]);
}
buildNecropolis("westnec","Western Necropolis",-620,130,58,110);
buildNecropolis("northnec","Northern Necropolis",-220,970,64,120);
buildNecropolis("southnec","Southern Necropolis",-240,-760,45,100);

/* urban residential fabric — V3: street-frontage quarters instead of random scatter */
const avoid=[
 {x:-160,z:20,r:98},{x:-65,z:-35,r:98},{x:-78,z:-142,r:64},{x:-315,z:280,r:115},
 {x:-230,z:560,r:122},{x:-230,z:748,r:102},{x:285,z:105,r:72},{x:60,z:-300,r:74}
];
function okayHouse(x,z,w,d){
 if(Math.abs(x-riverXAt(z))<38)return false;
 for(const a of avoid)if(dist2(x,z,a.x,a.z)<a.r+Math.max(w,d)*.55)return false;
 for(const h of houseFootprints)if(dist2(x,z,h.x,h.z)<Math.max(7,(Math.max(w,d)+Math.max(h.w,h.d))*.44))return false;
 return true;
}
// The lines below follow the monument-to-river movement axes already drawn above. Houses face streets, creating readable lanes and irregular blocks.
addStreetFrontage([[-560,-320],[-420,-275],[-330,-220],[-240,-158],[-190,-130]],15,14,.10,.32);
addStreetFrontage([[-190,-130],[-128,-88],[-70,-72],[15,-45]],14,13,.36,.44);
addStreetFrontage([[-465,220],[-390,210],[-325,180],[-270,135],[-215,85]],15,14,.12,.38);
addStreetFrontage([[-430,515],[-370,430],[-330,340],[-292,252]],17,15,.08,.28);
addStreetFrontage([[190,145],[275,195],[350,240],[445,292],[560,340]],16,14,.13,.32);
addStreetFrontage([[155,-120],[240,-75],[340,-38],[445,2]],15,13,.18,.31);
addStreetFrontage([[82,-355],[96,-270],[108,-205],[110,-125]],14,13,.34,.34);
addStreetFrontage([[-270,-470],[-375,-555],[-500,-625]],17,15,.06,.24);
// secondary alleys create block depth, but remain sparse enough to read the major civic axes
const alleys=[[[-505,-245],[-472,-170],[-420,-100]],[[-345,-170],[-385,-70],[-430,10]],[[285,-130],[335,-205],[385,-255]],[[300,330],[350,390],[410,435]],[[-110,350],[-70,420],[-55,495]]];
for(const a of alleys){addRoad(a,4.0,C.road);addStreetFrontage(a,18,10,.08,.30)}
// a few larger compounds anchor wealthier plots without pretending their exact footprints are excavated
[[-440,32],[-390,-120],[365,82],[392,-240],[-45,300]].forEach((p,i)=>{if(okayHouse(p[0],p[1],23,21))addCourtyardHouse(p[0],p[1],23,21,(i-2)*.07)});

/* V5 density pass: tertiary lanes, denser frontage, infill blocks and distant urban massing */
const tertiaryLanes=[
 [[-548,-112],[-492,-38],[-438,38]],
 [[-382,-92],[-312,-26],[-236,18],[-155,56]],
 [[-295,315],[-225,282],[-150,236],[-76,190]],
 [[35,78],[122,54],[205,34],[287,14]],
 [[275,86],[350,90],[430,105]],
 [[295,245],[245,172],[208,112]],
 [[448,255],[404,184],[366,118]],
 [[88,-240],[172,-247],[254,-255],[342,-252]],
 [[-155,-360],[-72,-336],[8,-316],[82,-304]],
 [[-468,122],[-410,88],[-352,48],[-298,4]],
 [[190,-24],[265,10],[344,48],[426,96]],
 [[226,310],[318,348],[403,386]]
];
for(const lane of tertiaryLanes){addRoad(lane,4.3,C.road);addStreetFrontage(lane,14.5,11.4,.12,.34)}
addQuarterInfill(-405,-60,155,115,MOBILE?26:72,.12,.34,.18);
addQuarterInfill(315,-80,168,120,MOBILE?28:82,.17,.31,.12);
addQuarterInfill(332,210,160,108,MOBILE?18:54,.10,.26,.08);
addQuarterInfill(-328,248,145,120,MOBILE?16:42,.08,.33,.15);
addQuarterInfill(-350,-265,130,94,MOBILE?12:34,.09,.25,.10);
addQuarterInfill(112,-238,110,66,MOBILE?10:28,.28,.22,.06);
// visually close the empty outskirts with simplified, non-colliding house masses
addBackdropQuarter(-585,-70,4,7,20,17,.18);
addBackdropQuarter(-570,210,4,8,20,17,-.08);
addBackdropQuarter(535,118,5,8,19,17,-.12);
addBackdropQuarter(550,-145,4,7,20,17,.04);
addBackdropQuarter(-430,-355,4,7,19,17,.16);
addBackdropQuarter(246,360,3,7,18,17,.22);

/* market life and civic detail */
for(let i=0;i<(MOBILE?12:26);i++)addStall(-120+i*8.2,-104+(i%3)*4.4,(i%3-1)*.05);
for(let i=0;i<(MOBILE?14:28);i++){const a=rnd()*Math.PI*2,r=rand(11,34);addStall(60+Math.cos(a)*r,-300+Math.sin(a)*r,a+Math.PI/2)}
addCart(-126,-117,.18,.92);addCart(89,-325,-.35,.88);addCart(-255,209,.62,.9);
/* V8: mannequin NPC pass removed; scale/life is carried by props and architecture. */
// small-scale street clutter is intentionally concentrated rather than evenly scattered
for(let i=0;i<(MOBILE?18:55);i++){const z=rand(-390,360),x=(rnd()>.5?1:-1)*rand(115,470);if(okayHouse(x,z,1,1)&&Math.abs(x-riverXAt(z))>24){if(i%3===0)addCrate(x,z,.55);else if(i%3===1)addAmphora(x,z,.62);else addShrub(x,z,.55)}}
for(let i=0;i<(MOBILE?24:72);i++){const z=rand(-360,400),x=rand(-500,520);if(okayHouse(x,z,2,2)&&Math.abs(x-riverXAt(z))>28){if(i%4===0)addTree(x,z,rand(.55,.78));else addShrub(x,z,rand(.55,.9))}}



/* V7 destination-life pass: each major jump point has human-scale activity instead of an empty monument island */
/* V8: mannequin NPC pass removed; scale/life is carried by props and architecture. */
for(let i=0;i<(MOBILE?3:7);i++)addStall(-87, -34+i*14,Math.PI*.5);
/* V8: mannequin NPC pass removed; scale/life is carried by props and architecture. */
/* V8: mannequin NPC pass removed; scale/life is carried by props and architecture. */
for(let i=0;i<(MOBILE?3:8);i++)addStall(-270+i*12,414,0);
/* V8: mannequin NPC pass removed; scale/life is carried by props and architecture. */
/* V8: mannequin NPC pass removed; scale/life is carried by props and architecture. */

/* V8 street-life pass without mannequin NPCs: carts, storage, awnings and benches provide scale without uncanny figures. */
for(const q of [[-168,-86,.2],[-126,-118,-.1],[-12,-212,.35],[112,-252,-.4],[248,-32,.12],[350,18,-.28],[-360,96,.44],[-432,-42,-.18]])addCart(q[0],q[1],q[2],.9);
for(const q of [[-148,-73],[ -104,-96],[-38,-196],[78,-242],[205,-45],[302,5],[-330,116],[-407,-28]]){addCrate(q[0],q[1],.72);addAmphora(q[0]+1.0,q[1]+.45,.72)}
for(const q of [[-92,-118,0],[18,-263,.1],[154,-188,-.15],[319,44,.06]]){addBox(B,q[0],.31,q[1],3.0,.62,.65,C.wood,q[2]);addBox(B,q[0],.68,q[1],2.6,.10,.62,C.darkStone,q[2])}

/* rural animals = simple low silhouettes */
for(let i=0;i<(MOBILE?24:68);i++){const x=rand(500,785),z=rand(-470,400);addBox(B,x,.55,z,1.35,.8,.7,C.white,rand(-.5,.5));addBox(B,x+.8,.72,z,.45,.45,.45,C.darkStone)}

/* remote compressed landscape: dam and Meter Steunene */
(function(){
 const z=-1200,x=riverXAt(z);
 addWallBetween(B,x-60,z-4,x+60,z+4,5.2,5.5,C.limestone);
 for(let i=0;i<10;i++)addBox(B,x-50+i*11,3.4,z,6,1.2,8,C.limestone);
 lm("dam","Roman River Dam",x,z,80,"HYDRAULIC WORK · ROMAN PERIOD","high",
 [["Location in reality","~3 km south of city centre"],["Material","Large limestone blocks"],["Chronology","Contemporary with bridges and quays (official page)"],["Map treatment","Distance compressed for browser exploration"]],
 `<p>About <b>3 km south of the ancient city centre</b>, a Roman dam built of large limestone blocks forms part of the same broad hydraulic programme as the bridges and quay walls.</p><p>In this browser world the southern landscape is spatially compressed: reaching the dam does not require a literal three-kilometre walk. The atlas clearly marks the real-world distance while the 3D zone preserves the conceptual sequence from city to water-control infrastructure.</p>`,[SRC.river]);
})();
(function(){
 const cx=-420,cz=-1400;
 addHill(cx,cz,180,35,C.darkStone);addCylinder(B,cx-24,0,cz,8,7,24,C.darkStone);addCylinder(B,cx+16,0,cz-8,7,7,24,C.darkStone);
 // cave mouth as dark wall opening cue
 addBox(B,cx-72,8,cz+5,28,16,6,C.darkStone);addBox(B,cx-72,6,cz+1,14,10,7,[.08,.08,.07]);
 lm("meter","Sanctuary of Meter Steunene",cx,cz,100,"OPEN-AIR SANCTUARY · 4 km SOUTH","high",
 [["Location in reality","~4 km south of Zeus temple"],["Landscape","Steep slope / open-air ritual area"],["Ritual structures","Two cylindrical monuments"],["Literary tradition","Steunos cave; Meter gave birth to Zeus"]],
 `<p>The open-air sanctuary of <b>Meter Steunene</b> lies about 4 km south of the Zeus temple on a steep slope. Strabo links the goddess's epithet to a cave called Steunos; Pausanias reports the Aizanoian belief that Meter Steunene gave birth to Zeus there.</p><p>The official archaeological description identifies two cylindrical ritual monuments traditionally called the <b>taurobolium</b> and <b>criobolium</b>, associated with bull and ram sacrifice. The cave entrance is no longer accessible because of collapse.</p><p>As with the Roman dam, this zone is compressed into the browser landscape. Ritual staging, vegetation and cave appearance are illustrative.</p>`,[SRC.meter,SRC.temple]);
})();

/* map-only district markers */
lm("reswest","Western Residential Quarter",-420,-80,75,"URBAN FABRIC · RECONSTRUCTED","inferred",
 [["Evidence level","Street / house fabric inferred"],["Basis","Organic plan + surviving axes + Roman Anatolian domestic analogies"]],
 `<p>This quarter is an <b>atmospheric reconstruction</b>, not an excavated housing block. Aizanoi's published plans establish an organic, non-grid settlement pattern; the individual houses, courtyards, roofs, workshops and lanes are generated to make the city inhabitable in first person without pretending their exact footprints are known.</p>`,[SRC.urban]);
lm("reseast","Eastern Residential Quarter",360,-80,75,"URBAN FABRIC · RECONSTRUCTED","inferred",
 [["Evidence level","Inferred domestic fabric"],["Chronology","High Imperial atmosphere"]],
 `<p>Domestic blocks on the eastern bank are intentionally varied in orientation so the city does not become a generic orthogonal Roman grid. Shopfronts, courtyards and roof forms are reconstructed from regional Roman urban patterns rather than claimed Aizanoi house excavations.</p>`,[SRC.urban]);

// perimeter relief + tree bands reduce the sense of a flat empty void beyond the explored city
[[-920,-760,260,42],[-980,140,310,54],[-865,920,300,58],[885,-520,250,40],[960,160,300,56],[820,930,260,46],[-1200,-1380,360,70]].forEach(h=>addHill(h[0],h[1],h[2],h[3],C.darkStone));
for(let i=0;i<(MOBILE?42:120);i++){const edge=i%2===0,x=edge?rand(-980,-760):rand(690,930),z=rand(-760,980);addTree(x,z,rand(.85,1.3))}
for(let i=0;i<(MOBILE?28:70);i++){const x=rand(-620,640),z=rand(-760,-620);addTree(x,z,rand(.8,1.25))}

/* labels */
const labelsEnabled={value:false};
function labelMonuments(){/* labels are 2D overlay handled in renderHUD for low cost */}

/* -------------------- WebGL program -------------------- */
let gl,program,waterProgram,skyProgram,skyBuffer,bufBase,buf301,buf425,bufWater,counts={},ready=false;
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function makeProgram(vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p}
function makeSkyBuffer(){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);return b}
function drawSky(L,now){gl.disable(gl.DEPTH_TEST);gl.useProgram(skyProgram);gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);const a=gl.getAttribLocation(skyProgram,"aPos");gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);const top=[L.sky[0]*.72,L.sky[1]*.88,Math.min(1,L.sky[2]*1.28)],hor=[L.fog[0]*1.03,L.fog[1]*.99,L.fog[2]*.88];const t=clamp((dayHour-6)/13,0,1),sunAz=-1.2+t*2.3,sunYaw=sunAz+Math.PI/2;let rel=sunYaw-player.yaw;while(rel>Math.PI)rel-=Math.PI*2;while(rel<-Math.PI)rel+=Math.PI*2;gl.uniform3fv(gl.getUniformLocation(skyProgram,"uTop"),new Float32Array(top));gl.uniform3fv(gl.getUniformLocation(skyProgram,"uHorizon"),new Float32Array(hor));gl.uniform1f(gl.getUniformLocation(skyProgram,"uHour"),dayHour);gl.uniform1f(gl.getUniformLocation(skyProgram,"uSunRel"),rel);gl.uniform1f(gl.getUniformLocation(skyProgram,"uPitch"),player.pitch);gl.uniform1f(gl.getUniformLocation(skyProgram,"uTime"),(now||performance.now())*.001);gl.uniform1f(gl.getUniformLocation(skyProgram,"uYaw"),player.yaw);gl.drawArrays(gl.TRIANGLES,0,6);gl.enable(gl.DEPTH_TEST)}
const VS=`
attribute vec3 aPos;attribute vec3 aNormal;attribute vec3 aColor;
uniform mat4 uProj;uniform mat4 uView;varying vec3 vN;varying vec3 vC;varying vec3 vW;
void main(){vN=aNormal;vC=aColor;vW=aPos;gl_Position=uProj*uView*vec4(aPos,1.0);}
`;
const FS=`
precision mediump float;varying vec3 vN;varying vec3 vC;varying vec3 vW;
uniform vec3 uSun;uniform vec3 uFog;uniform float uFogD;uniform float uAmbient;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gridLine(float v,float scale,float width){float f=abs(fract(v*scale)-.5);return 1.0-smoothstep(.5-width,.5,f);}
void main(){
 vec3 n=normalize(vN),sun=normalize(uSun);float nd=max(dot(n,sun),0.0),bounce=max(dot(n,-sun),0.0),hemi=.5+.5*n.y;
 float light=uAmbient+nd*.67+bounce*.055+hemi*.10;vec3 c=vC*(.66+light*.56);
 float lum=dot(vC,vec3(.299,.587,.114));float grain=(hash(floor(vW.xz*1.65))-.5)*.052;
 // ground: broader mottling and tiny dust breakup
 if(n.y>.78&&vW.y<.45){float g1=hash(floor(vW.xz*.24)),g2=hash(floor(vW.xz*.95));c*=.92+g1*.14+g2*.035;}
 // pale masonry / plaster: horizontal courses and irregular vertical joints
 if(abs(n.y)<.60&&lum>.34){float course=smoothstep(.91,.99,fract(vW.y*.78));float vertical=smoothstep(.945,.995,fract((vW.x+vW.z)*.31+floor(vW.y*.78)*.37));c*=1.0-course*.085-vertical*.035;}
 // terracotta roofs: thin repeated banding makes tile fields read without image textures
 float roofMask=smoothstep(.10,.22,vC.r-vC.g)*(1.0-smoothstep(.64,.82,lum))*smoothstep(.16,.98,n.y);
 float tiles=(gridLine(vW.x+vW.z,.72,.055)+gridLine(vW.x-vW.z,.46,.045))*.5;c*=1.0-roofMask*tiles*.055;
 // soft contact-darkening at ground level gives objects more weight
 float contact=1.0-.10*(1.0-smoothstep(.12,1.8,vW.y))*max(0.0,1.0-n.y*.35);c*=contact;
 c*=1.0+grain;c=mix(c,c*vec3(1.10,1.025,.90),nd*.22);c=mix(c,c*vec3(.88,.94,1.03),(1.0-nd)*.055);
 float z=gl_FragCoord.z/gl_FragCoord.w;float fog=1.0-exp(-uFogD*uFogD*z*z);fog=clamp(fog,0.0,.91);
 gl_FragColor=vec4(mix(c,uFog,fog),1.0);
}`;
const SKYVS=`attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0.9999,1.0);}`;
const SKYFS=`precision mediump float;varying vec2 vUv;uniform vec3 uTop;uniform vec3 uHorizon;uniform float uHour;uniform float uSunRel;uniform float uPitch;uniform float uTime;uniform float uYaw;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.;v+=.56*n2(p);p=p*2.03+2.7;v+=.28*n2(p);p=p*2.01+4.2;v+=.14*n2(p);return v;}
void main(){
 float y=clamp(vUv.y,0.0,1.0),h=smoothstep(0.0,.72,y);vec3 c=mix(uHorizon,uTop,h);
 vec2 cuv=vec2(vUv.x+uYaw*.085+uTime*.0012,vUv.y+uPitch*.07);float cloud=fbm(cuv*vec2(5.2,3.0)+vec2(0.0,1.4));cloud=smoothstep(.57,.78,cloud)*smoothstep(.18,.50,y)*(1.0-smoothstep(.88,1.0,y));
 c=mix(c,vec3(.94,.90,.82),cloud*.17);
 float front=smoothstep(1.72,1.20,abs(uSunRel));float sunx=.5+sin(uSunRel)*.57;float suny=.70-uPitch*.24;float d=distance(vUv,vec2(sunx,suny));c+=vec3(1.0,.72,.34)*smoothstep(.13,0.0,d)*.38*front;c+=vec3(1.0,.86,.58)*smoothstep(.035,0.0,d)*.72*front;
 c+=vec3(.72,.61,.47)*(1.0-smoothstep(.0,.22,y))*.14;gl_FragColor=vec4(c,1.0);
}`;
const WVS=`
attribute vec3 aPos;attribute vec3 aNormal;attribute vec3 aColor;uniform mat4 uProj;uniform mat4 uView;uniform float uTime;
varying vec3 vC;varying vec3 vW;
void main(){vec3 p=aPos;p.y+=sin(p.x*.09+p.z*.045+uTime)*.12+sin(p.z*.08-uTime*.7)*.05;vC=aColor;vW=p;gl_Position=uProj*uView*vec4(p,1.0);}
`;
const WFS=`
precision mediump float;varying vec3 vC;varying vec3 vW;uniform vec3 uFog;uniform float uFogD;
void main(){float w1=sin(vW.x*.13+vW.z*.07),w2=sin(vW.z*.19-vW.x*.04);float shimmer=.88+.10*w1+.04*w2;vec3 c=mix(vC,vec3(.22,.42,.43),.32)*shimmer;c+=vec3(.18,.20,.17)*max(0.0,w1)*.12;float z=gl_FragCoord.z/gl_FragCoord.w;float fog=clamp(1.0-exp(-uFogD*uFogD*z*z),0.0,.84);gl_FragColor=vec4(mix(c,uFog,fog),.83);}
`;
function makeBuffer(builder){const arr=new Float32Array(builder.v),b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.STATIC_DRAW);return {b,count:arr.length/9,tris:builder.tris}}
function bindAndDraw(obj,p){
 if(!obj||!obj.count)return;gl.bindBuffer(gl.ARRAY_BUFFER,obj.b);const stride=9*4;
 const ap=gl.getAttribLocation(p,"aPos"),an=gl.getAttribLocation(p,"aNormal"),ac=gl.getAttribLocation(p,"aColor");
 gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,3,gl.FLOAT,false,stride,0);
 gl.enableVertexAttribArray(an);gl.vertexAttribPointer(an,3,gl.FLOAT,false,stride,3*4);
 gl.enableVertexAttribArray(ac);gl.vertexAttribPointer(ac,3,gl.FLOAT,false,stride,6*4);
 gl.drawArrays(gl.TRIANGLES,0,obj.count);
}
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0])}
function lookAt(eye,target,up){
 let zx=eye[0]-target[0],zy=eye[1]-target[1],zz=eye[2]-target[2],zl=Math.hypot(zx,zy,zz)||1;zx/=zl;zy/=zl;zz/=zl;
 let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx,xl=Math.hypot(xx,xy,xz)||1;xx/=xl;xy/=xl;xz/=xl;
 let yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
 return new Float32Array([xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-(xx*eye[0]+xy*eye[1]+xz*eye[2]),-(yx*eye[0]+yy*eye[1]+yz*eye[2]),-(zx*eye[0]+zy*eye[1]+zz*eye[2]),1]);
}

/* -------------------- player / V7 traversal -------------------- */
const EYE_HEIGHT=1.68,MAX_STEP_UP=.46,MAX_STEP_DOWN=.62;
const player={x:-5,y:EYE_HEIGHT,z:-85,yaw:-1.08,pitch:-.02,speed:3.8,sprint:7.2,floorY:0,surfaceTag:"ground"};
const keys=new Set();let locked=false,currentEra=225,last=performance.now(),mapFrame=0,gameStarted=false,movementLockUntil=0;
let mobileMoveX=0,mobileMoveY=0,mobileRun=false,lookPointer=null,lookLastX=0,lookLastY=0;
let mouseSensitivity=1,userFov=MOBILE?70:62,headBobEnabled=true,moveBlend=0,walkClock=0,mouseDrag=null,mouseDragDistance=0;
function onBridge(x,z){for(const b of bridges){const dx=x-b.x,dz=z-b.z,ca=Math.cos(-b.rot),sa=Math.sin(-b.rot),lx=dx*ca-dz*sa,lz=dx*sa+dz*ca;if(Math.abs(lx)<b.len/2-1&&Math.abs(lz)<b.w/2)return true}return false}
function inRiver(x,z){return Math.abs(x-riverXAt(z))<15.8&&!onBridge(x,z)}
const COLLIDER_CELL=42,colliderGrid=new Map();let colliderGridReady=false;
function colliderKey(ix,iz){return ix+","+iz}
function buildColliderGrid(){
 colliderGrid.clear();
 for(const c of colliders){const ca=Math.abs(Math.cos(c.rot)),sa=Math.abs(Math.sin(c.rot)),ax=c.hx*ca+c.hz*sa+.8,az=c.hx*sa+c.hz*ca+.8,minX=Math.floor((c.x-ax)/COLLIDER_CELL),maxX=Math.floor((c.x+ax)/COLLIDER_CELL),minZ=Math.floor((c.z-az)/COLLIDER_CELL),maxZ=Math.floor((c.z+az)/COLLIDER_CELL);for(let ix=minX;ix<=maxX;ix++)for(let iz=minZ;iz<=maxZ;iz++){const k=colliderKey(ix,iz);let a=colliderGrid.get(k);if(!a)colliderGrid.set(k,a=[]);a.push(c)}}
 colliderGridReady=true;
}
function nearbyColliders(x,z){if(!colliderGridReady)buildColliderGrid();const ix=Math.floor(x/COLLIDER_CELL),iz=Math.floor(z/COLLIDER_CELL),out=[],seen=new Set();for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const a=colliderGrid.get(colliderKey(ix+dx,iz+dz));if(!a)continue;for(const c of a)if(!seen.has(c)){seen.add(c);out.push(c)}}return out}
function inHazard(x,z){for(const q of hazardZones){if(q.type==="disk"){if(dist2(x,z,q.cx,q.cz)<=q.r+.15)return true}else if(pointInOrientedRect(x,z,q,.15))return true}return false}
function collide(x,z){
 if(inRiver(x,z)||inHazard(x,z))return true;
 const pr=.48;
 for(const c of nearbyColliders(x,z)){const dx=x-c.x,dz=z-c.z,ca=Math.cos(-c.rot),sa=Math.sin(-c.rot),lx=dx*ca-dz*sa,lz=dx*sa+dz*ca;if(Math.abs(lx)<c.hx+pr&&Math.abs(lz)<c.hz+pr)return true}
 return false;
}
function surfaceHeightAt(s,x,z){
 if(s.type==="rect"){
  const dx=x-s.cx,dz=z-s.cz,ca=Math.cos(-s.rot),sa=Math.sin(-s.rot),lx=dx*ca-dz*sa,lz=dx*sa+dz*ca;
  return Math.abs(lx)<=s.hx&&Math.abs(lz)<=s.hz?s.y:null;
 }
 if(s.type==="ramp"){
  const rx=x-s.x1,rz=z-s.z1,t=(rx*s.dx+rz*s.dz)/s.len;if(t<0||t>1)return null;
  const px=s.x1+s.dx*t*s.len,pz=s.z1+s.dz*t*s.len,lateral=Math.abs((x-px)*(-s.dz)+(z-pz)*s.dx);
  return lateral<=s.width/2?lerp(s.y1,s.y2,t):null;
 }
 if(s.type==="disk")return dist2(x,z,s.cx,s.cz)<=s.r?s.y:null;
 return null;
}
function walkCandidatesAt(x,z){
 const all=[],stairs=[];
 for(const s of walkSurfaces){const y=surfaceHeightAt(s,x,z);if(y==null)continue;const c={s,y};all.push(c);if((s.tag||"").includes("· tread"))stairs.push(c)}
 // A tread physically cuts through/onto the platform it serves. Giving that tread priority prevents the terrace/platform surface from masking the descending stair below it.
 return stairs.length?stairs:all;
}
function absoluteSupportAt(x,z){
 let best=0,tag="ground";
 for(const c of walkCandidatesAt(x,z)){if(c.y>best){best=c.y;tag=c.s.tag}}
 return {y:best,tag};
}
function resolveSupport(x,z,currentY=0){
 let best=0,bestTag="ground",higherSolid=false;
 for(const c of walkCandidatesAt(x,z)){const y=c.y,s=c.s;
  if(y<=currentY+MAX_STEP_UP+.018){if(y>best){best=y;bestTag=s.tag}}
  else if(s.solidBelow)higherSolid=true;
 }
 const rise=best-currentY,drop=currentY-best;
 return {y:best,tag:bestTag,blockedRise:higherSolid&&best<=currentY+.025,blockedDrop:drop>MAX_STEP_DOWN+.018,rise,drop};
}
function groundY(){return player.floorY+EYE_HEIGHT}
function tryTraverse(nx,nz){
 if(collide(nx,nz))return false;
 const q=resolveSupport(nx,nz,player.floorY);
 if(q.blockedRise||q.blockedDrop)return false;
 player.x=nx;player.z=nz;player.floorY=q.y;player.surfaceTag=q.tag;return true;
}
function moveWithSubsteps(dx,dz){
 const dist=Math.hypot(dx,dz),parts=Math.max(1,Math.ceil(dist/.16)),sx=dx/parts,sz=dz/parts;let moved=false;
 for(let i=0;i<parts;i++){
  const nx=player.x+sx,nz=player.z+sz;
  if(tryTraverse(nx,nz)){moved=true;continue}
  // controlled wall/curb slide, also sub-stepped so a frame hitch cannot skip a tread.
  if(tryTraverse(nx,player.z)){moved=true;continue}
  if(tryTraverse(player.x,nz)){moved=true;continue}
  break;
 }
 return moved;
}
function updatePlayer(dt){
 if(performance.now()<movementLockUntil||worldUIOpen())return;
 // Clamp long background-tab frames before collision traversal.
 dt=Math.min(dt,.05);
 let f=(keys.has("KeyW")?1:0)-(keys.has("KeyS")?1:0),r=(keys.has("KeyD")?1:0)-(keys.has("KeyA")?1:0);
 if(TOUCH){f+=-mobileMoveY;r+=mobileMoveX}
 const moving=!!(f||r),sprinting=(keys.has("ShiftLeft")||keys.has("ShiftRight")||mobileRun);
 moveBlend+=((moving?1:0)-moveBlend)*Math.min(1,dt*9);
 if(moving){const l=Math.hypot(f,r);if(l>1){f/=l;r/=l}const onStair=(player.surfaceTag||"").includes("tread"),onRamp=(player.surfaceTag||"").includes("approach"),surfaceFactor=onStair?(sprinting?.74:.88):(onRamp?.90:1),sp=(sprinting?player.sprint:player.speed)*surfaceFactor,sy=Math.sin(player.yaw),cy=Math.cos(player.yaw);
  const dx=(sy*f+cy*r)*sp*dt,dz=(-cy*f+sy*r)*sp*dt;moveWithSubsteps(dx,dz);
  walkClock+=dt*(sprinting?10.0:6.5);
 }
 const targetEye=player.floorY+EYE_HEIGHT,delta=targetEye-player.y;
 // Exponential step settling keeps discrete treads readable but avoids the old camera teleport/floating effect.
 const settle=1-Math.exp(-dt*(delta>=0?22:18));player.y+=delta*settle;if(Math.abs(targetEye-player.y)<.0015)player.y=targetEye;
}
function currentView(){
 const cp=Math.cos(player.pitch),sy=Math.sin(player.yaw),cy=Math.cos(player.yaw),f=[sy*cp,Math.sin(player.pitch),-cy*cp];
 const verticalError=Math.abs((player.floorY+EYE_HEIGHT)-player.y),stable=clamp(1-verticalError*3.2,.18,1);
 const bob=headBobEnabled?Math.sin(walkClock*2)*.017*moveBlend*stable:0,sway=headBobEnabled?Math.sin(walkClock)*.008*moveBlend*stable:0;
 const eye=[player.x+cy*sway,player.y+bob,player.z+sy*sway];
 return lookAt(eye,[eye[0]+f[0],eye[1]+f[1],eye[2]+f[2]],[0,1,0]);
}

/* -------------------- WebGL render -------------------- */
let dayHour=15;
function lightForHour(h){
 const t=clamp((h-6)/13,0,1),alt=Math.sin(t*Math.PI),az=-1.2+t*2.3;
 const sun=[Math.cos(az)*.55,Math.max(.12,alt),Math.sin(az)*.55];
 const dawn=Math.min(1,alt*1.7),fog=[lerp(.47,.73,dawn),lerp(.47,.70,dawn),lerp(.43,.60,dawn)];
 return {sun,fog,ambient:lerp(.48,.68,dawn),sky:[fog[0]*.92,fog[1]*1.02,fog[2]*1.08]}
}
function resize(){
 const cap=MOBILE?1.18:1.72,dpr=Math.min(devicePixelRatio||1,cap)*renderQuality,w=Math.max(1,Math.floor(innerWidth*dpr)),h=Math.max(1,Math.floor(innerHeight*dpr));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h)}
}
function render(t){
 if(!ready)return;resize();const now=t||performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;if(gameStarted)updatePlayer(dt);
 const L=lightForHour(dayHour);gl.clearColor(L.sky[0],L.sky[1],L.sky[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);drawSky(L,now);gl.clear(gl.DEPTH_BUFFER_BIT);
 const proj=perspective(userFov*Math.PI/180,canvas.width/canvas.height,.08,2600),view=currentView();
 gl.useProgram(program);gl.uniformMatrix4fv(gl.getUniformLocation(program,"uProj"),false,proj);gl.uniformMatrix4fv(gl.getUniformLocation(program,"uView"),false,view);
 gl.uniform3fv(gl.getUniformLocation(program,"uSun"),new Float32Array(L.sun));gl.uniform3fv(gl.getUniformLocation(program,"uFog"),new Float32Array(L.fog));
 gl.uniform1f(gl.getUniformLocation(program,"uFogD"),MOBILE?.00074:.00060);gl.uniform1f(gl.getUniformLocation(program,"uAmbient"),L.ambient);
 bindAndDraw(bufBase,program);if(currentEra>=301)bindAndDraw(buf301,program);if(currentEra>=425)bindAndDraw(buf425,program);
 gl.useProgram(waterProgram);gl.uniformMatrix4fv(gl.getUniformLocation(waterProgram,"uProj"),false,proj);gl.uniformMatrix4fv(gl.getUniformLocation(waterProgram,"uView"),false,view);
 gl.uniform3fv(gl.getUniformLocation(waterProgram,"uFog"),new Float32Array(L.fog));gl.uniform1f(gl.getUniformLocation(waterProgram,"uFogD"),MOBILE?.00074:.00060);gl.uniform1f(gl.getUniformLocation(waterProgram,"uTime"),now*.001);
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);bindAndDraw(bufWater,waterProgram);gl.depthMask(true);gl.disable(gl.BLEND);
 if(gameStarted){updateProximity();updateHeading();if((mapFrame++%4)===0){drawMiniMap();renderLabels()}}
 requestAnimationFrame(render);
}

/* -------------------- info and map data -------------------- */
function activeLandmark(l){return !l.era||currentEra>=l.era}
function nearest(){
 let best=null,bd=1e9;for(const l of landmarks){if(!activeLandmark(l))continue;const d=dist2(player.x,player.z,l.x,l.z);if(d<bd){bd=d;best=l}}
 return best&&bd<best.radius?{l:best,d:bd}:null
}
function certText(c){return c==="high"?"High archaeological confidence":c==="medium"?"Medium confidence / partial restitution":"Inferred urban fabric / low certainty"}
function sourceHTML(srcs){return (srcs||[]).map(s=>`<a class="srcLink" target="_blank" rel="noopener" href="${s[1]}">↗ ${s[0]}</a>`).join("")}
function openInfo(l){
 $("#infoMeta").textContent=l.meta;$("#infoTitle").textContent=l.name;const ce=$("#infoCert");ce.className="cert "+l.certainty;ce.textContent=certText(l.certainty);
 let st='<div class="statTable">'+(l.stats||[]).map(r=>`<span>${r[0]}</span><span>${r[1]}</span>`).join("")+'</div>';
 $("#infoBody").innerHTML=st+l.body+'<div class="sep"></div><h3>Research links</h3>'+sourceHTML(l.sources)+'<div class="sep"></div><p style="color:#9b8d79;font-size:9px">Visualisation rule: measured monument facts are kept separate from reconstructed roofs, façades, street-life props, domestic plots and other atmosphere. “High confidence” does not mean every visible brick is excavated.</p>';
 document.body.classList.add("infoOpen");if(locked)document.exitPointerLock();
}
function updateProximity(){
 const n=nearest(),p=$("#prompt");if(n){p.style.opacity=1;$("#promptText").textContent=`inspect ${n.l.name}`}else p.style.opacity=0;
 let best=null,bd=1e9;for(const l of landmarks){if(!activeLandmark(l))continue;const d=dist2(player.x,player.z,l.x,l.z);if(d<bd){bd=d;best=l}}
 $("#locName").textContent=best&&bd<150?best.name:(player.z<-900?"Southern sacred landscape":Math.abs(player.x-riverXAt(player.z))<60?"Penkalas riverfront":"Aizanoi urban fabric");
}
function openNearest(){const n=nearest();if(n)openInfo(n.l);else toast("No labelled monument is close enough. Open the atlas to choose a site.")}
function updateHeading(){const deg=((180-player.yaw*180/Math.PI)%360+360)%360,dirs=["N","NE","E","SE","S","SW","W","NW"];$("#headingCardinal").textContent=dirs[Math.round(deg/45)%8];$("#headingDegrees").textContent=String(Math.round(deg)).padStart(3,"0")+"°";const ev=$("#elevationValue");if(ev)ev.textContent=(player.floorY>=0?"+":"")+player.floorY.toFixed(1)+" m";const sn=$("#surfaceName");if(sn)sn.textContent=player.surfaceTag||"ground"}

/* map projections */
const coreBounds={minX:-760,maxX:850,minZ:-860,maxZ:1080};
function mapProject(x,z,W,H,pad=26){return [pad+(x-coreBounds.minX)/(coreBounds.maxX-coreBounds.minX)*(W-pad*2),H-pad-(z-coreBounds.minZ)/(coreBounds.maxZ-coreBounds.minZ)*(H-pad*2)]}
function drawMapBase(ctx,W,H,detailed=false){
 ctx.clearRect(0,0,W,H);ctx.fillStyle="#171812";ctx.fillRect(0,0,W,H);
 // fields
 ctx.save();ctx.globalAlpha=.25;for(const f of fieldPolys){const p=mapProject(f.cx,f.cz,W,H);ctx.translate(p[0],p[1]);ctx.rotate(-f.rot);const sx=f.w/(coreBounds.maxX-coreBounds.minX)*(W-52),sz=f.d/(coreBounds.maxZ-coreBounds.minZ)*(H-52);ctx.fillStyle="#8c8750";ctx.fillRect(-sx/2,-sz/2,sx,sz);ctx.rotate(f.rot);ctx.translate(-p[0],-p[1])}ctx.restore();
 // roads
 ctx.lineCap="round";for(const rd of mapRoads){if(rd.era&&currentEra<rd.era)continue;ctx.strokeStyle="#7d705b";ctx.lineWidth=detailed?4:2;ctx.beginPath();rd.points.forEach((q,i)=>{const p=mapProject(q[0],q[1],W,H);i?ctx.lineTo(...p):ctx.moveTo(...p)});ctx.stroke()}
 // river
 ctx.strokeStyle="#517a79";ctx.lineWidth=detailed?20:12;ctx.beginPath();riverPts.forEach((q,i)=>{const p=mapProject(q[0],q[1],W,H);i?ctx.lineTo(...p):ctx.moveTo(...p)});ctx.stroke();
 // quays
 ctx.strokeStyle="#8c8a77";ctx.lineWidth=detailed?2.2:1;ctx.beginPath();for(let z=-430;z<400;z+=20){let x=riverXAt(z)-18,p=mapProject(x,z,W,H);if(z===-430)ctx.moveTo(...p);else ctx.lineTo(...p)}ctx.stroke();ctx.beginPath();for(let z=-430;z<400;z+=20){let x=riverXAt(z)+18,p=mapProject(x,z,W,H);if(z===-430)ctx.moveTo(...p);else ctx.lineTo(...p)}ctx.stroke();
 // houses
 ctx.fillStyle="#615a4c";ctx.globalAlpha=.9;for(const h of houseFootprints){const p=mapProject(h.x,h.z,W,H),sx=Math.max(1.5,h.w/(coreBounds.maxX-coreBounds.minX)*(W-52)),sz=Math.max(1.5,h.d/(coreBounds.maxZ-coreBounds.minZ)*(H-52));ctx.save();ctx.translate(...p);ctx.rotate(-h.rot);ctx.fillRect(-sx/2,-sz/2,sx,sz);ctx.restore()}ctx.globalAlpha=1;
 // bridges
 ctx.strokeStyle="#c3b395";ctx.lineWidth=detailed?5:3;for(const b of bridges){const p=mapProject(b.x,b.z,W,H),scale=(W-52)/(coreBounds.maxX-coreBounds.minX);ctx.save();ctx.translate(...p);ctx.rotate(-b.rot);ctx.beginPath();ctx.moveTo(-b.len*.5*scale,0);ctx.lineTo(b.len*.5*scale,0);ctx.stroke();ctx.restore()}
 // landmarks
 for(const l of landmarks){if(l.x<coreBounds.minX||l.x>coreBounds.maxX||l.z<coreBounds.minZ||l.z>coreBounds.maxZ||!activeLandmark(l))continue;const p=mapProject(l.x,l.z,W,H);ctx.fillStyle=l.certainty==="inferred"?"#9b7b61":"#d6a65d";ctx.beginPath();ctx.arc(p[0],p[1],detailed?5:3.5,0,Math.PI*2);ctx.fill();if(detailed){ctx.fillStyle="#e8dcc7";ctx.font="11px system-ui";ctx.fillText(l.name,p[0]+8,p[1]-6)}}
}
let miniBaseCanvas=null,miniBaseEra=-1;
function ensureMiniBase(){
 const c=$("#miniMap");if(!miniBaseCanvas){miniBaseCanvas=document.createElement("canvas");miniBaseCanvas.width=c.width;miniBaseCanvas.height=c.height}
 if(miniBaseEra!==currentEra){drawMapBase(miniBaseCanvas.getContext("2d"),miniBaseCanvas.width,miniBaseCanvas.height,false);miniBaseEra=currentEra}
}
function drawMiniMap(){
 const c=$("#miniMap"),ctx=c.getContext("2d"),W=c.width,H=c.height;ensureMiniBase();ctx.clearRect(0,0,W,H);ctx.drawImage(miniBaseCanvas,0,0);
 const p=mapProject(player.x,player.z,W,H);ctx.save();ctx.translate(...p);ctx.rotate(player.yaw);ctx.fillStyle="#fff2d7";ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(7,8);ctx.lineTo(0,5);ctx.lineTo(-7,8);ctx.closePath();ctx.fill();ctx.restore();
}
function drawAtlas(){
 const c=$("#atlasCanvas"),ctx=c.getContext("2d"),W=c.width,H=c.height;drawMapBase(ctx,W,H,true);
 // title / scale / north
 ctx.fillStyle="rgba(12,12,9,.72)";ctx.fillRect(20,18,390,76);ctx.fillStyle="#ead5b0";ctx.font="600 25px Georgia";ctx.fillText("AIZANOI · reconstructed plan",38,49);ctx.fillStyle="#b8a68d";ctx.font="12px system-ui";ctx.fillText("High Imperial reference layer · c. AD 225",38,72);
 ctx.strokeStyle="#e5d1ad";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(W-90,90);ctx.lineTo(W-90,35);ctx.stroke();ctx.beginPath();ctx.moveTo(W-90,35);ctx.lineTo(W-98,50);ctx.lineTo(W-82,50);ctx.closePath();ctx.fillStyle="#e5d1ad";ctx.fill();ctx.font="12px system-ui";ctx.fillText("N",W-95,27);
 // scale 200m
 const mpx=200/(coreBounds.maxX-coreBounds.minX)*(W-52);ctx.strokeStyle="#e5d1ad";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(42,H-42);ctx.lineTo(42+mpx,H-42);ctx.stroke();ctx.fillStyle="#c7b69d";ctx.font="11px system-ui";ctx.fillText("0",39,H-51);ctx.fillText("200 m",42+mpx-32,H-51);
 // annotations for remote landscape
 ctx.fillStyle="#a99679";ctx.font="11px system-ui";ctx.fillText("↓ Roman dam ~3 km south (compressed 3D zone)",W-430,H-60);ctx.fillText("↓ Meter Steunene ~4 km south (compressed 3D zone)",W-430,H-40);
}
function populateAtlasPlaces(){
 const ids=["temple","agora","greatbath","stadium","theatre","mosaicbath","odeon","macellum","penkalas","reswest","reseast","westnec","northnec","southnec","street","dam","meter"];
 const wrap=$("#atlasPlaces");wrap.innerHTML=ids.map(id=>{const l=landmarks.find(x=>x.id===id);return `<button class="placeBtn" data-place="${id}"><b>${l.name}</b><span>${l.meta}</span></button>`}).join("");
 wrap.querySelectorAll(".placeBtn").forEach(b=>b.onclick=()=>{const l=landmarks.find(x=>x.id===b.dataset.place);closeAtlas(false);teleportTo(l.id,{lock:false});openInfo(l)});
}

/* 2D labels in viewport */
let labelLayer;
function makeLabelLayer(){labelLayer=document.createElement("div");labelLayer.style.cssText="position:fixed;inset:0;z-index:19;pointer-events:none";document.body.appendChild(labelLayer)}
function worldToScreen(x,y,z){
 const cp=Math.cos(player.pitch),sp=Math.sin(player.pitch),sy=Math.sin(player.yaw),cy=Math.cos(player.yaw);
 let dx=x-player.x,dy=y-player.y,dz=z-player.z;
 // inverse yaw then pitch into camera coords, forward = -Z
 let rx=cy*dx+sy*dz,rz=-sy*dx+cy*dz;
 let ry=cp*dy-sp*rz,rz2=sp*dy+cp*rz;
 if(rz2>=-.2)return null;const f=1/Math.tan(userFov*Math.PI/360),aspect=innerWidth/innerHeight,ndcX=(rx/(-rz2))*f/aspect,ndcY=(ry/(-rz2))*f;
 if(Math.abs(ndcX)>1.15||Math.abs(ndcY)>1.15)return null;return [(ndcX*.5+.5)*innerWidth,(-ndcY*.5+.5)*innerHeight,-rz2]
}
function renderLabels(){
 if(!labelsEnabled.value){labelLayer.innerHTML="";return}
 let html="";for(const l of landmarks){if(!activeLandmark(l))continue;const d=dist2(player.x,player.z,l.x,l.z);if(d>500)continue;const p=worldToScreen(l.x,12,l.z);if(!p)continue;html+=`<div style="position:absolute;left:${p[0]}px;top:${p[1]}px;transform:translate(-50%,-50%);padding:5px 7px;border:1px solid rgba(231,198,143,.25);border-radius:7px;background:rgba(16,14,11,.72);font:700 8px system-ui;color:#ead7b7;white-space:nowrap">${l.name}<span style="display:block;font-weight:400;color:#9d8d77;text-align:center;margin-top:1px">${Math.round(d)} m</span></div>`}
 labelLayer.innerHTML=html;
}

/* -------------------- eras, teleports, tour -------------------- */
function setEra(y){
 currentEra=y;miniBaseEra=-1;$$(".eraBtn").forEach(b=>b.classList.toggle("active",+b.dataset.era===y));
 toast(y===225?"AD 225 — High Imperial Aizanoi":y===301?"AD 301 — Maximum Price Edict at the Macellum":"AD 425 — early-5th-century colonnaded street + Late Antique reuse");
 drawMiniMap();drawAtlas();
}
function bridgeTeleportView(id,side=1){const b=bridges.find(q=>q.id===id);if(!b)return {pos:[0,0],look:[0,0]};const ux=Math.cos(b.rot),uz=Math.sin(b.rot),rampLen=b.major?17:14,d=b.len/2+rampLen+4;return {pos:[b.x+ux*side*d,b.z+uz*side*d],look:[b.x,b.z]}}
const teleportViews={
 temple:{pos:[-68,20],look:[-160,20]},
 agora:{pos:[28,-34],look:[-65,-35]},
 greatbath:{pos:[-315,188],look:[-315,280]},
 stadium:{pos:[-230,405],look:[-230,555]},
 theatre:{pos:[-230,820],look:[-230,748]},
 mosaicbath:{pos:[342,105],look:[285,105]},
 odeon:{pos:[-25,-142],look:[-78,-142]},
 macellum:{pos:[60,-342],look:[60,-300]},
 penkalas:{pos:[88,45],look:[125,45]},
 bridge2:bridgeTeleportView("bridge2",1),
 bridge3:bridgeTeleportView("bridge3",1),
 westnec:{pos:[-555,130],look:[-620,130]},
 northnec:{pos:[-220,885],look:[-220,970]},
 southnec:{pos:[-240,-690],look:[-240,-760]},
 dam:{pos:[-72,-1195],look:[riverXAt(-1200),-1200]},
 meter:{pos:[-420,-1288],look:[-420,-1400]},
 reswest:{pos:[-355,-65],look:[-420,-80]},
 reseast:{pos:[300,-65],look:[360,-80]},
 street:{pos:[-96,-485],look:[-65,-540]}
};
function resetMovementState(){
 keys.clear();mobileMoveX=mobileMoveY=0;mobileRun=false;lookPointer=null;mouseDrag=null;mouseDragDistance=0;
 const knob=$("#moveKnob");if(knob)knob.style.transform="translate(0px,0px)";const run=$("#mobileRun");if(run)run.classList.remove("primaryTouch");
}
function isSafeSpawn(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&!collide(x,z)&&!inRiver(x,z)}
function resolveSpawn(x,z){
 if(isSafeSpawn(x,z))return {x,z};
 for(let r=3;r<=38;r+=3){for(let i=0;i<24;i++){const a=i*Math.PI*2/24,nx=x+Math.cos(a)*r,nz=z+Math.sin(a)*r;if(isSafeSpawn(nx,nz))return {x:nx,z:nz}}}
 return {x,z};
}
function travelFlash(name){
 const f=$("#teleportFlash"),c=$("#travelCaption");if(!f)return;c.textContent=name?"Travelling · "+name:"Travelling through Aizanoi";f.classList.add("on");document.body.classList.add("traveling");clearTimeout(travelFlash._t);travelFlash._t=setTimeout(()=>{f.classList.remove("on");document.body.classList.remove("traveling")},235);
}
function teleportTo(id,opts={}){
 if(id==="street"&&currentEra<425)setEra(425);
 const view=teleportViews[id];if(!view){toast("Jump target not found.");return false}
 resetMovementState();movementLockUntil=performance.now()+320;last=performance.now();
 const s=resolveSpawn(view.pos[0],view.pos[1]),tx=view.look[0],tz=view.look[1];player.x=s.x;player.z=s.z;player.pitch=0;const sq=absoluteSupportAt(player.x,player.z);player.floorY=sq.y;player.surfaceTag=sq.tag;player.y=player.floorY+EYE_HEIGHT;player.yaw=Math.atan2(tx-player.x,-(tz-player.z));
 travelFlash((landmarks.find(l=>l.id===id)||bridges.find(b=>b.id===id)||{name:id}).name);
 const ae=document.activeElement;if(ae&&ae!==canvas&&typeof ae.blur==="function")ae.blur();canvas.focus({preventScroll:true});
 if(opts.lock!==false&&!TOUCH&&gameStarted&&!worldUIOpen())setTimeout(()=>tryLockMouse(false),260);
 drawMiniMap();return true;
}
const tour=[
 ["temple","1 · Temple of Zeus","Begin on the west bank at the dominant sanctuary. The raised podium and surrounding court organise the western civic landscape."],
 ["agora","2 · Agora & Propylon","Move east toward the civic heart between sanctuary and river, where the agora, propylon and water display form a public approach."],
 ["macellum","3 · Macellum","Walk south-east to the circular market building with its later Price Edict inscriptions."],
 ["stadium","4 · Stadium","Follow the north road to the large spectacle complex. The stadium's low-sloping seating leads directly to the shared stage building."],
 ["greatbath","5 · Great Bath–Palaestra","Return west to the major bath-gymnasium ensemble, one of the strongest anchors of the northern urban quarter."],
 ["bridge3","6 · River corridor","Finish on the Penkalas where bridges and quays make clear that the river is part of the city—not scenery around it."]
];
let tourIndex=0;
function toggleTour(){const c=$("#tourCard");c.classList.toggle("hidden");if(!c.classList.contains("hidden")){tourIndex=0;updateTour();if(locked)document.exitPointerLock()}}

/* -------------------- controls/UI -------------------- */
function toast(s){const e=$("#toast");e.textContent=s;e.classList.add("toastOn");clearTimeout(toast._t);toast._t=setTimeout(()=>e.classList.remove("toastOn"),2400)}
function worldUIOpen(){return document.body.classList.contains("infoOpen")||!$("#atlasOverlay").classList.contains("hidden")||!$("#sourcesOverlay").classList.contains("hidden")||!$("#viewSettings").classList.contains("hidden")||!$("#tourCard").classList.contains("hidden")}
function updateMouseState(){const b=$("#resumeBtn");if(!b)return;b.classList.toggle("locked",locked);b.textContent=locked?"MOUSE: LOCKED":"MOUSE: CLICK TO LOCK"}
function tryLockMouse(showMessage=false){
 if(TOUCH||!gameStarted||worldUIOpen()||!canvas.requestPointerLock)return;
 try{const r=canvas.requestPointerLock();if(r&&typeof r.catch==="function")r.catch(()=>{if(showMessage)toast("Mouse lock was blocked — hold left or right mouse and drag to look.")})}
 catch(e){if(showMessage)toast("Mouse lock was blocked — hold left or right mouse and drag to look.")}
}
canvas.addEventListener("contextmenu",e=>e.preventDefault());
canvas.addEventListener("pointerdown",e=>{
 if(TOUCH||!gameStarted||locked||worldUIOpen()||(e.button!==0&&e.button!==2))return;
 mouseDrag={id:e.pointerId,x:e.clientX,y:e.clientY};mouseDragDistance=0;canvas.setPointerCapture?.(e.pointerId);e.preventDefault();
});
canvas.addEventListener("pointermove",e=>{
 if(!mouseDrag||e.pointerId!==mouseDrag.id||locked)return;
 const dx=e.clientX-mouseDrag.x,dy=e.clientY-mouseDrag.y;mouseDrag.x=e.clientX;mouseDrag.y=e.clientY;mouseDragDistance+=Math.abs(dx)+Math.abs(dy);
 player.yaw+=dx*.00315*mouseSensitivity;player.pitch-=dy*.00285*mouseSensitivity;player.pitch=clamp(player.pitch,-1.35,1.35);e.preventDefault();
});
function finishMouseDrag(e){if(!mouseDrag||e.pointerId!==mouseDrag.id)return;const shortClick=mouseDragDistance<7;mouseDrag=null;if(shortClick)tryLockMouse(true)}
canvas.addEventListener("pointerup",finishMouseDrag);canvas.addEventListener("pointercancel",e=>{if(mouseDrag&&e.pointerId===mouseDrag.id)mouseDrag=null});
document.addEventListener("pointerlockchange",()=>{const was=locked;locked=document.pointerLockElement===canvas;updateMouseState();if(locked){const ae=document.activeElement;if(ae&&ae!==canvas&&typeof ae.blur==="function")ae.blur();canvas.focus({preventScroll:true});toast("Mouse look locked · move the mouse to turn · Esc releases it")}else if(was)resetMovementState()});
document.addEventListener("pointerlockerror",()=>{locked=false;updateMouseState();toast("Pointer Lock unavailable — hold left or right mouse and drag to look.")});
document.addEventListener("mousemove",e=>{if(!locked)return;player.yaw+=e.movementX*.00185*mouseSensitivity;player.pitch-=e.movementY*.00165*mouseSensitivity;player.pitch=clamp(player.pitch,-1.35,1.35)});

function installTouchControls(){
 if(!TOUCH)return;
 const pad=$("#movePad"),knob=$("#moveKnob"),run=$("#mobileRun");let joyId=null;
 const resetJoy=()=>{joyId=null;mobileMoveX=mobileMoveY=0;knob.style.transform="translate(0px,0px)"};
 pad.addEventListener("pointerdown",e=>{joyId=e.pointerId;pad.setPointerCapture(e.pointerId);e.preventDefault()});
 pad.addEventListener("pointermove",e=>{if(e.pointerId!==joyId)return;const r=pad.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,m=Math.hypot(dx,dy)||1,max=43,k=Math.min(1,max/m),px=dx*k,py=dy*k;mobileMoveX=clamp(px/max,-1,1);mobileMoveY=clamp(py/max,-1,1);knob.style.transform=`translate(${px}px,${py}px)`;e.preventDefault()});
 pad.addEventListener("pointerup",resetJoy);pad.addEventListener("pointercancel",resetJoy);
 const runOn=e=>{mobileRun=true;run.classList.add("primaryTouch");run.setPointerCapture?.(e.pointerId);e.preventDefault()},runOff=()=>{mobileRun=false;run.classList.remove("primaryTouch")};run.addEventListener("pointerdown",runOn);run.addEventListener("pointerup",runOff);run.addEventListener("pointercancel",runOff);
 canvas.addEventListener("pointerdown",e=>{if(!gameStarted||e.clientX<innerWidth*.35)return;lookPointer=e.pointerId;lookLastX=e.clientX;lookLastY=e.clientY;canvas.setPointerCapture?.(e.pointerId);e.preventDefault()});
 canvas.addEventListener("pointermove",e=>{if(e.pointerId!==lookPointer)return;const dx=e.clientX-lookLastX,dy=e.clientY-lookLastY;lookLastX=e.clientX;lookLastY=e.clientY;player.yaw+=dx*.0060;player.pitch-=dy*.0054;player.pitch=clamp(player.pitch,-1.25,1.25);e.preventDefault()});
 const endLook=e=>{if(e.pointerId===lookPointer)lookPointer=null};canvas.addEventListener("pointerup",endLook);canvas.addEventListener("pointercancel",endLook);
 $("#mobileInspect").onclick=openNearest;$("#mobileMap").onclick=openAtlas;$("#mobileLabels").onclick=()=>{labelsEnabled.value=!labelsEnabled.value;toast(labelsEnabled.value?"Monument labels enabled":"Monument labels hidden")};
}
installTouchControls();
function uiOwnsKeyboard(){const e=document.activeElement;if(!e)return false;return /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(e.tagName)||e.isContentEditable}
function clearOnFocusLoss(){resetMovementState();last=performance.now()}
window.addEventListener("blur",clearOnFocusLoss);document.addEventListener("visibilitychange",()=>{if(document.hidden)clearOnFocusLoss()});
document.addEventListener("keydown",e=>{
 const movementKey=["KeyW","KeyA","KeyS","KeyD","ShiftLeft","ShiftRight"].includes(e.code),uiFocus=uiOwnsKeyboard();
 if(movementKey&&gameStarted&&!worldUIOpen()&&(!uiFocus||locked)){keys.add(e.code);e.preventDefault()}
 if(uiFocus&&!locked)return;
 if(e.code==="ArrowLeft"){player.yaw-=.07*mouseSensitivity;e.preventDefault()}if(e.code==="ArrowRight"){player.yaw+=.07*mouseSensitivity;e.preventDefault()}
 if(e.code==="ArrowUp"){player.pitch=clamp(player.pitch+.045*mouseSensitivity,-1.35,1.35);e.preventDefault()}if(e.code==="ArrowDown"){player.pitch=clamp(player.pitch-.045*mouseSensitivity,-1.35,1.35);e.preventDefault()}
 if(e.code==="KeyE"&&gameStarted&&!worldUIOpen())openNearest();
 if(e.code==="KeyM"&&gameStarted&&!uiFocus)openAtlas();
 if(e.code==="KeyL"&&gameStarted&&!uiFocus){labelsEnabled.value=!labelsEnabled.value;toast(labelsEnabled.value?"Monument labels enabled":"Monument labels hidden")}
 if(e.code==="KeyF"&&gameStarted&&!uiFocus)toggleFullscreen();
});
document.addEventListener("keyup",e=>keys.delete(e.code));
function resumeLookFromGesture(){if(!TOUCH&&gameStarted)tryLockMouse(false)}
$("#infoClose").onclick=()=>{document.body.classList.remove("infoOpen");resumeLookFromGesture()};
$("#resumeBtn").onclick=()=>tryLockMouse(true);
$("#settingsBtn").onclick=()=>{if(locked)document.exitPointerLock();$("#viewSettings").classList.toggle("hidden")};
$("#settingsClose").onclick=()=>{$("#viewSettings").classList.add("hidden");resumeLookFromGesture()};
$("#mouseSensitivity").oninput=e=>{mouseSensitivity=+e.target.value;$("#mouseSensitivityValue").textContent=Math.round(mouseSensitivity*100)+"%"};
$("#fovSlider").value=String(userFov);$("#fovValue").textContent=Math.round(userFov)+"°";$("#fovSlider").oninput=e=>{userFov=+e.target.value;$("#fovValue").textContent=Math.round(userFov)+"°"};$("#walkSpeedSlider").value=String(player.speed);$("#walkSpeedValue").textContent=player.speed.toFixed(1)+" m/s";$("#walkSpeedSlider").oninput=e=>{player.speed=+e.target.value;player.sprint=player.speed*1.9;$("#walkSpeedValue").textContent=player.speed.toFixed(1)+" m/s"};
$("#qualitySlider").value=String(renderQuality);$("#qualityValue").textContent=Math.round(renderQuality*100)+"%";$("#qualitySlider").oninput=e=>{renderQuality=+e.target.value;$("#qualityValue").textContent=Math.round(renderQuality*100)+"%"};
$("#headBobToggle").onchange=e=>headBobEnabled=e.target.checked;
async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.();else await document.exitFullscreen?.()}catch(e){toast("Fullscreen is unavailable in this browser.")}}
$("#fullscreenBtn").onclick=async e=>{await toggleFullscreen();e.currentTarget.blur();canvas.focus({preventScroll:true});if(!TOUCH)setTimeout(()=>tryLockMouse(false),0)};
$("#teleport").onchange=e=>{const id=e.target.value,label=e.target.options[e.target.selectedIndex]?.text||"destination";e.target.value="";e.target.blur();resetMovementState();if(id){teleportTo(id);toast("Arrived at "+label)}};
$("#teleport").addEventListener("keydown",e=>{if(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown"].includes(e.code))e.stopPropagation()});
$$(".eraBtn").forEach(b=>b.onclick=()=>{setEra(+b.dataset.era);b.blur();canvas.focus({preventScroll:true});if(!TOUCH)setTimeout(()=>tryLockMouse(false),0)});
$("#timeSlider").oninput=e=>{dayHour=+e.target.value;const hr=Math.floor(dayHour),mi=Math.round((dayHour-hr)*60);$("#timeLabel").textContent=String(hr).padStart(2,"0")+":"+String(mi).padStart(2,"0")};$("#timeSlider").onchange=e=>{e.target.blur();canvas.focus({preventScroll:true});if(!TOUCH)tryLockMouse(false)};
$("#tourBtn").onclick=toggleTour;$("#tourPrev").onclick=()=>{tourIndex=(tourIndex-1+tour.length)%tour.length;updateTour()};$("#tourNext").onclick=()=>{tourIndex=(tourIndex+1)%tour.length;updateTour()};
$("#tourVisit").onclick=()=>{const id=tour[tourIndex][0];$("#tourCard").classList.add("hidden");teleportTo(id,{lock:false});const l=landmarks.find(x=>x.id===id);if(l)openInfo(l)};$("#tourClose").onclick=()=>{$("#tourCard").classList.add("hidden");resumeLookFromGesture()};

/* atlas */
function openAtlas(){if(locked)document.exitPointerLock();$("#atlasOverlay").classList.remove("hidden");drawAtlas()}
function closeAtlas(resume=true){$("#atlasOverlay").classList.add("hidden");if(resume)resumeLookFromGesture()}
$("#atlasBtn").onclick=openAtlas;$("#mapOpenBtn").onclick=openAtlas;$("#openAtlasIntro").onclick=openAtlas;$("#atlasClose").onclick=closeAtlas;
$$(".tab").forEach(b=>b.onclick=()=>{
 $$(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");const t=b.dataset.tab;
 $("#atlasCanvas").classList.toggle("hidden",t==="texier");$("#texierImg").classList.toggle("hidden",t!=="texier");$("#texierLayer").classList.toggle("hidden",t!=="texier");
 $("#atlasReconSide").classList.toggle("hidden",t==="evidence");$("#atlasEvidenceSide").classList.toggle("hidden",t!=="evidence");
 if(t==="recon")drawAtlas();
});
function openSources(){if(locked)document.exitPointerLock();$("#sourcesOverlay").classList.remove("hidden")}
$("#sourcesBtn").onclick=openSources;$("#openSourcesIntro").onclick=openSources;$("#sourcesClose").onclick=()=>{$("#sourcesOverlay").classList.add("hidden");resumeLookFromGesture()};

/* ambience */
let audio=null;
function toggleAudio(){
 if(!audio){const AC=window.AudioContext||window.webkitAudioContext;if(!AC){toast("Web Audio is unavailable in this browser.");return}
  const ctx=new AC(),buf=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1);
  const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=650;const g=ctx.createGain();g.gain.value=.022;src.connect(lp).connect(g).connect(ctx.destination);src.start();audio={ctx,g};$("#soundBtn").textContent="AMBIENCE: ON"
 }else{const on=audio.g.gain.value>.001;audio.g.gain.setTargetAtTime(on?0:.022,audio.ctx.currentTime,.08);$("#soundBtn").textContent=on?"AMBIENCE: OFF":"AMBIENCE: ON"}
}
$("#soundBtn").onclick=e=>{toggleAudio();e.currentTarget.blur();canvas.focus({preventScroll:true});if(!TOUCH)setTimeout(()=>tryLockMouse(false),0)};

/* start */
$("#enterBtn").onclick=()=>{
 boot.classList.add("hidden");hud.classList.remove("hidden");gameStarted=true;last=performance.now();canvas.focus();$("#modeLabel").textContent=TOUCH?"TOUCH · MOBILE OPTIMIZED":(HAS_TOUCH&&FINE_POINTER?"HYBRID · MOUSE + TOUCH":"DESKTOP · HIGH DETAIL");updateMouseState();if(!TOUCH)tryLockMouse(false);toast(TOUCH?"AD 225 · Left thumb moves · drag right side to look":"AD 225 · Mouse look enabled · if lock is blocked, hold and drag");
};


window.__AIZANOI_DEBUG__={
 get player(){return {x:player.x,y:player.y,z:player.z,yaw:player.yaw,pitch:player.pitch,floorY:player.floorY,surfaceTag:player.surfaceTag}},
 setPlayer(x,z,floor=null){player.x=x;player.z=z;const q=floor==null?absoluteSupportAt(x,z):{y:floor,tag:"debug"};player.floorY=q.y;player.surfaceTag=q.tag;player.y=player.floorY+EYE_HEIGHT;return this.player},
 teleportTo,collide,inRiver,onBridge,resetMovementState,absoluteSupportAt,resolveSupport,moveWithSubsteps,
 get activeKeys(){return Array.from(keys)},
 get geometry(){return {baseTriangles:B.tris,era301Triangles:B301.tris,era425Triangles:B425.tris,waterTriangles:BW.tris,houses:houseFootprints.length,colliders:colliders.length,roads:mapRoads.length,walkSurfaces:walkSurfaces.length,stairFlights:stairFlights.length,hazards:hazardZones.length,colliderGridCells:colliderGridReady?colliderGrid.size:0}},
 get traversal(){return {floorY:player.floorY,eyeY:player.y,eyeHeight:EYE_HEIGHT,maxStepUp:MAX_STEP_UP,maxStepDown:MAX_STEP_DOWN,support:resolveSupport(player.x,player.z,player.floorY),surfaceTag:player.surfaceTag}},
 get movementLockUntil(){return movementLockUntil},
 step(dt=.016){movementLockUntil=0;updatePlayer(dt)},
 unlockMovement(){movementLockUntil=0},
 landmarks,bridges,teleportViews,stairFlights
};

/* -------------------- initialization -------------------- */
async function init(){
 try{
  setStage("Building the Penkalas river corridor…",16);await new Promise(r=>requestAnimationFrame(r));
  setStage("Assembling temples, baths, markets and spectacle buildings…",40);await new Promise(r=>requestAnimationFrame(r));
  setStage(MOBILE?"Optimising dense quarters, safe travel and touch controls…":"Building tread-by-tread stairs, elevation surfaces and architectural detail…",63);await new Promise(r=>requestAnimationFrame(r));
  gl=canvas.getContext("webgl",{alpha:false,antialias:true,powerPreference:"high-performance"})||canvas.getContext("experimental-webgl");
  if(!gl)throw new Error("WebGL context could not be created.");
  setStage("Compiling the self-contained WebGL renderer…",76);
  program=makeProgram(VS,FS);waterProgram=makeProgram(WVS,WFS);skyProgram=makeProgram(SKYVS,SKYFS);skyBuffer=makeSkyBuffer();gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  bufBase=makeBuffer(B);buf301=makeBuffer(B301);buf425=makeBuffer(B425);bufWater=makeBuffer(BW);
  counts={base:B.tris,era301:B301.tris,era425:B425.tris,water:BW.tris};
  setStage("Drawing the archaeological atlas and checking historical layers…",91);makeLabelLayer();populateAtlasPlaces();drawAtlas();drawMiniMap();
  await new Promise(r=>requestAnimationFrame(r));
  ready=true;setStage(`Ready · ${MOBILE?"mobile-optimised":"high-detail"} · ${Math.round(B.tris+B301.tris+B425.tris+BW.tris).toLocaleString()} triangles`,100);
  setTimeout(()=>{loading.classList.add("hidden");boot.classList.remove("hidden");requestAnimationFrame(render)},240);
 }catch(e){console.error(e);fail("The browser could not initialize the reconstruction.",e)}
}
init();
})();
