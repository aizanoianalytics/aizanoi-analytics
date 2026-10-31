'use strict';
// Citadel: time-aware territory, food and simultaneous head safety.
function move(state) {
  const me=state.you;
  if(!me || !me.head) return 'up';
  const W=state.width,H=state.height,N=W*H;
  const names=['up','down','left','right'],dx=[0,0,-1,1],dy=[-1,1,0,0];
  const id=(x,y)=>y*W+x,pos=p=>id(p.x,p.y);
  const neighbors=Array.from({length:N},(_,k)=>{
    const x=k%W,y=(k/W)|0,a=[];
    for(let d=0;d<4;d++){const X=x+dx[d],Y=y+dy[d];if(X>=0&&X<W&&Y>=0&&Y<H)a.push(id(X,Y));}
    return a;
  });
  const food=new Uint8Array(N),hazard=new Uint8Array(N);
  for(const p of state.food)if(p.x>=0&&p.y>=0&&p.x<W&&p.y<H)food[pos(p)]=1;
  for(const p of state.hazards)if(p.x>=0&&p.y>=0&&p.x<W&&p.y<H)hazard[pos(p)]=1;
  let ring=0; const cap=Math.floor(Math.min(W,H)/2)-1;
  while(ring<cap && hazard[id(ring,ring)])ring++;
  const shrinkIn=state.nextShrinkTurn-state.turn;
  const margin=k=>Math.min(k%W,(k/W)|0,W-1-k%W,H-1-((k/W)|0));
  const blocked=new Int16Array(N),release=new Int16Array(N),ownBody=new Uint8Array(N);
  for(const s of state.snakes){
    const own=s.id===me.id; let mightEat=false;
    if(!own)for(const n of neighbors[pos(s.head)])if(food[n])mightEat=true;
    for(let i=0;i<s.body.length;i++){
      const k=pos(s.body[i]),t=s.body.length-i+(own?0:(mightEat?1:0));
      if(t>release[k])release[k]=t;
      if(own)ownBody[k]=1;
      if(i<s.body.length-1||(!own&&mightEat))blocked[k]=1;
    }
  }
  const danger=new Int8Array(N),pressure=new Float32Array(N);
  const opponentDist=new Int16Array(N);opponentDist.fill(32000);
  const oq=new Int32Array(N);let oh=0,ot=0;
  for(const s of state.snakes)if(s.id!==me.id){const p=pos(s.head);if(opponentDist[p]!==0){opponentDist[p]=0;oq[ot++]=p;}}
  while(oh<ot){const k=oq[oh++],t=opponentDist[k]+1;for(const n of neighbors[k])if(!hazard[n]&&release[n]<=t&&opponentDist[n]>t){opponentDist[n]=t;oq[ot++]=n;}}
  for(const s of state.snakes){
    if(s.id===me.id)continue;
    for(const n of neighbors[pos(s.head)]){
      if(hazard[n]||blocked[n]||(s.health<=1&&!food[n]))continue;
      const enemyLen=s.length+(food[n]?1:0),ourLen=me.length+(food[n]?1:0);
      if(enemyLen>=ourLen)danger[n]++;
      for(const z of neighbors[n])pressure[z]+=enemyLen>=ourLen?1:0.2;
    }
  }
  const head=pos(me.head);let best=-Infinity,answer='up';
  for(let d=0;d<4;d++){
    const x=me.head.x+dx[d],y=me.head.y+dy[d];
    if(x<0||y<0||x>=W||y>=H)continue;
    const start=id(x,y),eating=!!food[start];
    if(hazard[start]||blocked[start]||(eating&&pos(me.body[me.body.length-1])===start)||(me.health<=1&&!eating))continue;
    const dist=new Int16Array(N);dist.fill(-1);
    const q=new Int32Array(N);let rd=0,wr=0;q[wr++]=start;dist[start]=1;
    let area=0,foodDistance=999,exits=0,nearArea=0,safeArea=0,territory=0;
    while(rd<wr){
      const k=q[rd++],t=dist[k];area++;
      if(t<opponentDist[k])territory++;
      if(t<=6)nearArea++;
      if(margin(k)>ring)safeArea++;
      if(food[k]&&t<foodDistance&&(margin(k)>ring||shrinkIn>=t))foodDistance=t;
      for(const n of neighbors[k]){
        if(dist[n]>=0||hazard[n])continue;
        const nt=t+1;let rel=release[n];
        if(n===head)rel=Math.max(rel,me.length+(eating?1:0));
        else if(eating&&ownBody[n])rel++;
        if(rel>nt)continue;
        if(ring<cap&&shrinkIn>=0&&nt>shrinkIn+1&&margin(n)<=ring)continue;
        dist[n]=nt;q[wr++]=n;
      }
    }
    for(const n of neighbors[start])if(!hazard[n]&&release[n]<2&&n!==head)exits++;
    const need=Math.max(0,55-me.health),required=me.length+3;
    let score=-danger[start]*950-pressure[start]*2.5;
    if(area<required)score-=300+25*(required-area);
    score+=Math.min(area,required*3)*1.4+Math.min(nearArea,20)*0.7+territory*2;
    if(exits===0)score-=90;else if(exits===1)score-=14;
    if(foodDistance<999){
      score+=(need>0?2.6+need*0.20:1.0)*Math.max(0,18-foodDistance);
      if(foodDistance>=me.health)score-=250;
    }else if(me.health<40)score-=180;
    if(eating)score+=Math.max(0,65-me.health)*1.8+(me.length<6?12:0)-(me.length>12&&me.health>70?16:0);
    const m=margin(start);
    if(ring<cap&&shrinkIn<20){
      if(m<=ring)score-=Math.max(0,20-shrinkIn)*3;
      if(safeArea<required)score-=60;
    }
    const cx=(W-1)/2,cy=(H-1)/2;
    score-=(Math.abs(x-cx)+Math.abs(y-cy))*(state.turn>state.nextShrinkTurn-35?0.9:0.07);
    score+=d*0.0001;
    if(score>best){best=score;answer=names[d];}
  }
  return answer;
}
module.exports = { name: 'Citadel', move };
