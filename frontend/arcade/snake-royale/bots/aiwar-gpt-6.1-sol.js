'use strict';

// Aras / Citadel: simultaneous adversarial search with temporal territory.
var botName = 'Citadel';
module.exports = (function () {
  const names = ['up', 'down', 'left', 'right'];
  let W, H, N, adj, edge, cap, rootId, nodes, budget, interval = 20;
  let lastTurn = -1, lastNext = -1;
  function setup(s) {
    W = s.width; H = s.height; N = W * H;
    adj = Array.from({length:N}, (_,p) => {
      let x=p%W,y=(p/W)|0;
      return [y? p-W:-1,y<H-1?p+W:-1,x?p-1:-1,x<W-1?p+1:-1];
    });
    edge = Array.from({length:N},(_,p)=>Math.min(p%W,W-1-p%W,(p/W)|0,H-1-((p/W)|0)));
    cap = Math.max(0,Math.floor(Math.min(W,H)/2)-1);
  }
  function ringAt(g,dt) {
    return Math.min(cap,g.ring+(g.turn+dt>g.next?1+Math.floor((g.turn+dt-g.next-1)/interval):0));
  }
  function occupancy(g) {
    let occ = new Int16Array(N); occ.fill(-1);
    g.ss.forEach((s,i)=>{if(s.alive) for(let k=0;k<s.b.length-1;k++) occ[s.b[k]]=i;});
    return occ;
  }
  function actions(g,i,occ) {
    const s=g.ss[i], out=[];
    if(!s.alive)return [0];
    for(let d=0;d<4;d++) {
      let p=adj[s.b[0]][d];
      if(p<0||edge[p]<g.ring||occ[p]>=0||(!g.food.has(p)&&s.hp<=1))continue;
      // A food move retains this snake's own tail.
      if(g.food.has(p)&&p===s.b[s.b.length-1])continue;
      out.push(d);
    }
    return out.length?out:[0,1,2,3];
  }
  function step(g,ds) {
    const food=new Set(g.food), eaten=new Set();
    const ss=g.ss.map((s,i)=>{
      if(!s.alive)return s;
      let p=adj[s.b[0]][ds[i]], eat=food.has(p);
      let b=[p].concat(s.b); if(!eat)b.pop();else eaten.add(p);
      return {b,hp:eat?g.heal:s.hp-1,alive:true};
    });
    eaten.forEach(p=>food.delete(p));
    let occ=new Uint8Array(N);
    for(const s of ss)if(s.alive)for(let k=1;k<s.b.length;k++)if(s.b[k]>=0)occ[s.b[k]]=1;
    let dead=[];
    ss.forEach((s,i)=>{
      if(!s.alive)return;
      let p=s.b[0];
      if(p<0||edge[p]<g.ring||s.hp<=0||occ[p]){dead.push(i);return;}
      for(let j=0;j<ss.length;j++)if(j!==i&&ss[j].alive&&ss[j].b[0]===p&&ss[j].b.length>=s.b.length){dead.push(i);break;}
    });
    dead.forEach(i=>{ss[i].alive=false;ss[i].deadTurn=g.turn;});
    let ring=g.ring,next=g.next;
    if(g.turn>=next){ring=Math.min(cap,ring+1);next+=interval;}
    for(const p of food)if(edge[p]<ring)food.delete(p);
    return {ss,food,turn:g.turn+1,ring,next,heal:g.heal};
  }
  function distances(g,i,release,strict) {
    const s=g.ss[i], dist=new Int16Array(N);dist.fill(-1);
    const q=new Int16Array(N);let a=0,z=0; q[z++]=s.b[0];dist[s.b[0]]=0;
    while(a<z){let p=q[a++],t=dist[p]+1;
      for(let d=0;d<4;d++){let v=adj[p][d];
        if(v<0||dist[v]>=0||edge[v]<ringAt(g,t-1))continue;
        if(strict?release[v]>1:release[v]>t)continue;
        dist[v]=t;q[z++]=v;
      }
    }
    return dist;
  }
  function evaluate(g) {
    nodes++;
    const me=g.ss[rootId], alive=g.ss.reduce((n,s)=>n+(s.alive?1:0),0);
    if(!me.alive){
      if(!alive){
        const rivals=g.ss.filter((s,i)=>i!==rootId&&s.deadTurn>=me.deadTurn);
        if(rivals.some(s=>s.deadTurn>me.deadTurn))return -900000;
        const max=rivals.length?Math.max(...rivals.map(s=>s.b.length)):0;
        return me.b.length>max?900000-g.turn*10:me.b.length===max?-5000:-900000;
      }
      return -1000000+g.turn*10;
    }
    if(alive===1&&g.ss.length>1)return 1000000-g.turn*10;
    const release=new Int16Array(N);
    g.ss.forEach(s=>{if(s.alive)for(let k=0;k<s.b.length;k++)release[s.b[k]]=Math.max(release[s.b[k]],s.b.length-k);});
    const ids=[], maps=[];
    g.ss.forEach((s,i)=>{if(s.alive){ids.push(i);maps.push(distances(g,i,release,false));}});
    const mi=ids.indexOf(rootId), md=maps[mi];
    let area=0, contested=0, oppArea=0, foodDist=999, foodValue=0;
    for(let p=0;p<N;p++){
      if(md[p]<0)continue;
      let winner=mi, best=md[p];
      for(let j=0;j<maps.length;j++)if(j!==mi&&maps[j][p]>=0){
        let d=maps[j][p];
        if(d<best||(d===best&&g.ss[ids[j]].b.length>=g.ss[ids[winner]].b.length)){best=d;winner=j;}
      }
      if(winner===mi){area++;if(g.food.has(p)){foodDist=Math.min(foodDist,md[p]);foodValue+=1/(md[p]+1);}}
      else {oppArea++;if(best===md[p])contested++;}
    }
    // A physically connected pocket is not safe merely because its tail will move.
    const sd=distances(g,rootId,release,true);
    let space=0;for(let p=0;p<N;p++)if(sd[p]>=0)space++;
    let nearest=999;
    for(const p of g.food)if(md[p]>=0)nearest=Math.min(nearest,md[p]);
    if(foodDist===999)foodDist=nearest;
    const len=me.b.length;
    let score=area*2.6-oppArea*0.55+Math.min(space,len+7)*1.2;
    score-=Math.max(0,len+2-space)*13;
    let maxOpp=0;
    g.ss.forEach((s,i)=>{if(i!==rootId&&s.alive)maxOpp=Math.max(maxOpp,s.b.length);});
    score+=Math.min(5,len-maxOpp)*10+len*2;
    if(foodDist<999){
      let urgency=me.hp<35?4.5:me.hp<65?2.0:1.0;
      score-=foodDist*urgency;
      score+=foodValue*(len<=maxOpp+1?22:10);
      if(nearest>=me.hp)score-=150+(nearest-me.hp)*12;
    }else if(me.hp<25)score-=(25-me.hp)*6;
    score+=Math.min(me.hp,75)*0.12;
    let h=me.b[0], exits=0;
    for(const v of adj[h])if(v>=0&&edge[v]>=g.ring&&release[v]<=1)exits++;
    if(exits<2)score-=(2-exits)*19;
    let future=ringAt(g,Math.min(8,Math.max(2,len)));
    if(edge[h]<future)score-=20+(future-edge[h])*12;
    score-= (Math.abs(h%W-(W-1)/2)+Math.abs(((h/W)|0)-(H-1)/2))*0.65;
    return score;
  }
  function quick(g,i,d,occ) {
    let s=g.ss[i],p=adj[s.b[0]][d];if(p<0||edge[p]<g.ring||occ[p]>=0)return -100000;
    let sc=g.food.has(p)?22:0;
    let fd=999;for(const f of g.food)fd=Math.min(fd,Math.abs(f%W-p%W)+Math.abs(((f/W)|0)-((p/W)|0)));
    if(fd<999)sc-=fd*(s.hp<35?4:1.3);
    let exits=0;for(const v of adj[p])if(v>=0&&edge[v]>=g.ring&&occ[v]<0)exits++;
    sc+=exits*5+edge[p];
    g.ss.forEach((o,j)=>{if(j!==i&&o.alive){let dist=Math.abs(o.b[0]%W-p%W)+Math.abs(((o.b[0]/W)|0)-((p/W)|0));if(dist===1)sc+=s.b.length>o.b.length?8:-35;}});
    return sc;
  }
  function choices(g) {
    let occ=occupancy(g);
    return g.ss.map((s,i)=>actions(g,i,occ).sort((a,b)=>quick(g,i,b,occ)-quick(g,i,a,occ)));
  }
  function scenarios(g,lists) {
    let base=lists.map(a=>a[0]), out=[];
    const opponents=[];
    g.ss.forEach((s,i)=>{if(i!==rootId&&s.alive)opponents.push(i);});
    if(opponents.length<=2){
      function rec(k){if(k===opponents.length){out.push(base.slice());return;}let i=opponents[k];for(const d of lists[i]){base[i]=d;rec(k+1);}}rec(0);
    }else{
      out.push(base.slice());
      for(const i of opponents)for(let j=1;j<lists[i].length;j++){let a=base.slice();a[i]=lists[i][j];out.push(a);}
    }
    return out;
  }
  function search(g,depth,alpha) {
    if(depth===0||nodes>budget||!g.ss[rootId].alive||g.ss.filter(s=>s.alive).length===1)return evaluate(g);
    const lists=choices(g);
    // Keep every immediate reply at the root. Deeper multiplayer replies are
    // ordered, and distant heads cannot create a tactical collision in time.
    if(g.ss.length>2){
      const h=g.ss[rootId].b[0];
      g.ss.forEach((s,i)=>{
        if(i===rootId||!s.alive)return;
        const p=s.b[0],dist=Math.abs(p%W-h%W)+Math.abs(((p/W)|0)-((h/W)|0));
        lists[i]=lists[i].slice(0,dist>2*depth+2?1:2);
      });
    }
    const cases=scenarios(g,lists);
    let best=-Infinity;
    for(const d of lists[rootId]){
      let worst=Infinity;
      for(const ds of cases){ds[rootId]=d;let ng=step(g,ds),v=search(ng,depth-1,Math.max(alpha,best));worst=Math.min(worst,v);if(worst<=Math.max(alpha,best))break;}
      if(worst>best)best=worst;
    }
    return best;
  }
  function move(state) {
    if(!state||!state.you)return 'up';
    if(!adj||W!==state.width||H!==state.height)setup(state);
    if(lastTurn>=0&&state.turn>lastTurn&&lastNext>=0&&state.nextShrinkTurn>lastNext)interval=state.nextShrinkTurn-lastNext;
    if(state.turn<=lastTurn)interval=20;
    lastTurn=state.turn;lastNext=state.nextShrinkTurn;
    rootId=state.snakes.findIndex(s=>s.id===state.you.id);
    if(rootId<0)return 'up';
    let ring=0;while(ring<cap&&state.hazards.some(p=>p.x===ring&&p.y===ring))ring++;
    const g={ss:state.snakes.map(s=>({b:s.body.map(p=>p.y*W+p.x),hp:s.health,alive:true})),food:new Set(state.food.map(p=>p.y*W+p.x)),turn:state.turn,ring,next:state.nextShrinkTurn,heal:Math.max(100,...state.snakes.map(s=>s.health))};
    const lists=choices(g), cases=scenarios(g,lists);
    let best=-Infinity, answer=lists[rootId][0];nodes=0;budget=6500;
    const depth=g.ss.length<=2?3:g.ss.length<=4?2:1;
    for(const d of lists[rootId]){
      let worst=Infinity, total=0, count=0;
      for(const ds of cases){ds[rootId]=d;let ng=step(g,ds),v=search(ng,depth-1,best);worst=Math.min(worst,v);total+=v;count++;if(worst<best-0.001)break;}
      let val=worst;
      if(val>best+0.001){best=val;answer=d;}
    }
    return names[answer]||'up';
  }
  move.botName='Citadel';
  return move;
})();
