'use strict';
// Snake Royale: deterministic bounded survival search.
module.exports = { name: 'Aegis', move: function move(state) {
  try { return decide(state); } catch (_) { return 'up'; }
}};

function decide(s) {
  const W=s.width,H=s.height,N=W*H, me=s.you, names=['up','right','down','left'];
  const dx=[0,1,0,-1],dy=[-1,0,1,0];
  const ix=(x,y)=>y*W+x;
  const head=ix(me.head.x,me.head.y), own=me.body.map(p=>ix(p.x,p.y));
  let ring=0;while(ring<Math.floor(Math.min(W,H)/2)-1 && s.hazards.some(p=>p.x===ring && p.y===Math.floor(H/2)))ring++;
  // The active storm is represented by its actual cells (rather than inferred from the schedule).
  const hazard=new Uint8Array(N), food=new Int16Array(N).fill(-1), others=[];
  for(const p of s.hazards) hazard[ix(p.x,p.y)]=1;
  for(let k=0;k<s.food.length && k<30;k++) food[ix(s.food[k].x,s.food[k].y)]=k;
  for(const t of s.snakes) if(t.id!==me.id) others.push({body:t.body.map(p=>ix(p.x,p.y)),len:t.length,head:ix(t.head.x,t.head.y)});
  const edge=(i)=>Math.min(i%W,(i/W)|0,W-1-i%W,H-1-((i/W)|0));
  const step=(i,d)=>{let x=i%W+dx[d],y=((i/W)|0)+dy[d];return x<0||y<0||x>=W||y>=H?-1:ix(x,y)};
  const blocked=new Uint8Array(N);
  for(let i=0;i<N;i++) blocked[i]=hazard[i];
  for(const t of others) for(const a of t.body) blocked[a]=1;
  // Distance from rivals on an otherwise open board; used only as a soft territorial signal.
  const oppDist=new Int16Array(N).fill(999);
  let q=new Int16Array(N),l=0,r=0;
  for(const t of others) if(oppDist[t.head]) {oppDist[t.head]=0;q[r++]=t.head;}
  while(l<r){let a=q[l++];for(let d=0;d<4;d++){let b=step(a,d);if(b>=0&&!blocked[b]&&oppDist[b]>oppDist[a]+1){oppDist[b]=oppDist[a]+1;q[r++]=b;}}}
  function forecast(t) {
    // The new ring is applied after this turn, so positions at that turn are still legal.
    let e=ring;
    if(s.nextShrinkTurn>=s.turn && t+s.turn>s.nextShrinkTurn && ring<Math.floor(Math.min(W,H)/2)-1) e=ring+1;
    return e;
  }
  function danger(i,bodylen,at) {
    let bad=0;
    for(const t of others){let md=Math.abs(i%W-t.head%W)+Math.abs(((i/W)|0)-((t.head/W)|0));
      if(at===1 && md===1 && t.len>=bodylen) return 10000;
      if(at===1 && md===1) bad+=8;
      if(at<=3 && md<=at && (at-md)%2===0) bad+=t.len>=bodylen ? 26/(at) : 2;
    }
    return bad;
  }
  function accessible(i,body,at) {
    let occ=new Uint8Array(N);for(const a of body)occ[a]=1;
    for(const t of others)for(const a of t.body)occ[a]=1;
    let seen=new Uint8Array(N),qq=new Int16Array(N),h=0,z=0,territory=0,minFood=999;
    seen[i]=1;qq[z++]=i;
    while(h<z){let a=qq[h++],depth=seen[a]-1;
      if(oppDist[a]>depth+at)territory++;
      if(food[a]>=0)minFood=Math.min(minFood,depth);
      for(let d=0;d<4;d++){let b=step(a,d);if(b>=0&&!seen[b]&&!occ[b]&&!hazard[b]){seen[b]=seen[a]+1;qq[z++]=b;}}
    }
    return {area:z,territory,dist:minFood};
  }
  const horizon=Math.min(17,Math.max(10,Math.floor(N/7))),width=48;
  let best=-1e15,bestDir=0;
  for(let first=0;first<4;first++) {
    let beam=[{body:own,mask:0,health:me.health,score:0}],rootArea=0,rootTerritory=0,rootFood=999,aliveDepth=0,top=-1e15;
    for(let t=1;t<=horizon && beam.length;t++) {
      let next=[];
      for(const node of beam){
        let a=node.body[0];
        for(let d=0;d<4;d++){
          if(t===1 && d!==first)continue;
          let b=step(a,d);if(b<0||hazard[b])continue;
          let fi=food[b],eat=fi>=0 && !(node.mask&(1<<fi));
          let health=eat?100:node.health-1;if(health<=0)continue;
          let len=node.body.length;
          let selfHit=false;for(let k=0;k<len-(eat?0:1);k++)if(node.body[k]===b){selfHit=true;break;}
          if(selfHit)continue;
          // An opponent's last segment vacates unless it eats. Treat the rest as solid.
          let hit=false;
          for(const o of others){let count=Math.max(1,o.body.length-Math.max(1,t));for(let k=0;k<count;k++)if(o.body[k]===b){hit=true;break;}if(hit)break;}
          if(hit)continue;
          let nb=[b,...node.body];if(!eat)nb.pop();
          let threat=danger(b,nb.length,t);if(threat>=10000)continue;
          let e=edge(b), f=forecast(t);
          if(e<f)continue;
          let stormPenalty=(s.nextShrinkTurn-s.turn<18 && e===f)?2:0;
          let score=node.score - threat - stormPenalty;
          if(eat)score+=node.health<25?115:node.health<45?65:node.health<65?25:nb.length<5?14:-22;
          if(eat && nb.length>7)score-=Math.min(24,nb.length-7)*4;
          score+=0.7*Math.min(e,4);
          if(t===1){let a0=accessible(b,nb,t);rootArea=a0.area;rootTerritory=a0.territory;rootFood=a0.dist;}
          // Avoid growing into too-small cavities; empty space is insurance, not an end in itself.
          let exits=0;for(let j=0;j<4;j++){let c=step(b,j);if(c>=0&&!hazard[c]&&!nb.includes(c)&&!blocked[c])exits++;}
          score+=exits*2.2;
          if(t<=3 && oppDist[b]<=t+1 && others.length)score-=Math.max(0,8-(oppDist[b]-t)*2);
          next.push({body:nb,mask:node.mask|(eat?(1<<fi):0),health,score});
        }
      }
      next.sort((a,b)=>b.score-a.score);
      // Keep distinct body/head configurations so a single cycling path doesn't consume the beam.
      let seen=new Set(),unique=[];
      for(const n of next){let key=n.body.slice(0,Math.min(n.body.length,7)).join(',')+':'+n.mask;if(!seen.has(key)){seen.add(key);unique.push(n);if(unique.length>=width)break;}}
      beam=unique;
      if(beam.length){aliveDepth=t;top=beam[0].score;}
    }
    if(!aliveDepth)continue;
    let score=aliveDepth*180 + top;

    score+=Math.min(rootArea,me.length+25)*3 + Math.min(rootArea,100)*0.3;
    score+=Math.min(rootTerritory,45)*0.7;
    if(rootArea<me.length+2)score-=220+(me.length+2-rootArea)*20;
    if(rootFood<999 && rootFood+2<me.health)score+=(me.health<35?80:me.health<65?32:4)/(rootFood+2);
    if(score>best){best=score;bestDir=first;}
  }
  return names[bestDir];
}
