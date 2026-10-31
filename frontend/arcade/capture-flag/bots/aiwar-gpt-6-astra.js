'use strict';

// Aegis: territorial interception and risk-aware, coordinated raiding.
module.exports = (() => {
  const names = ['up', 'down', 'left', 'right', 'stay'];
  let board = null, previous = new Map(), lastTick = -1, visits = null;
  const active = a => !a.jailed && a.respawnIn === 0 && a.x !== null && a.y !== null;
  const compare = (a,b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  function prepare(s) {
    const signature = s.width + ':' + s.height + ':' + s.grid.join('');
    if (board && board.signature === signature) return;
    const w=s.width,h=s.height,n=w*h, adj=Array.from({length:n},()=>[]), xs=new Int16Array(n), ys=new Int16Array(n);
    for(let p=0;p<n;p++) {
      const x=p%w,y=(p/w)|0; xs[p]=x; ys[p]=y;
      if(s.grid[y][x]==='#') continue;
      for(let a=0;a<5;a++) {
        const nx=x+(a===2?-1:a===3?1:0),ny=y+(a===0?-1:a===1?1:0);
        if(nx>=0&&nx<w&&ny>=0&&ny<h&&s.grid[ny][nx]!== '#') adj[p].push([ny*w+nx,a]);
      }
    }
    board={signature,w,h,n,adj,xs,ys}; visits=new Float64Array(n); previous=new Map();
  }
  function bfs(goals, allowed) {
    const {n,adj}=board,d=new Int32Array(n);d.fill(1000000);
    const q=new Int32Array(n);let head=0,tail=0;
    for(const p of goals) if(d[p]!==0 && (!allowed||allowed(p))) {d[p]=0;q[tail++]=p;}
    while(head<tail) {const p=q[head++];for(const [v] of adj[p]) if(d[v]>d[p]+1&&(!allowed||allowed(v))) {d[v]=d[p]+1;q[tail++]=v;}}
    return d;
  }
  function weighted(goals, risk, allowed) {
    const {n,adj}=board,d=new Float64Array(n);d.fill(1e12);
    const heap=[];
    function push(p,c) {let i=heap.length;heap.push([p,c]);while(i){const j=(i-1)>>1;if(heap[j][1]<=c)break;heap[i]=heap[j];i=j;}heap[i]=[p,c];}
    function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1][1]<heap[j][1])j++;if(last[1]<=heap[j][1])break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;}
    for(const p of goals) if(!allowed||allowed(p)){d[p]=0;push(p,0);}
    while(heap.length){const [p,c]=pop();if(c!==d[p])continue;for(const [v] of adj[p]){if(v===p||(allowed&&!allowed(v)))continue;const t=c+1+risk[p];if(t<d[v]){d[v]=t;push(v,t);}}}
    return d;
  }
  function move(s) {
    const me=s.you;if(!active(me))return 'stay';prepare(s);
    const {w,h,n,adj,xs,ys}=board, pos=a=>a.y*w+a.x, md=(a,b)=>Math.abs(xs[a]-xs[b])+Math.abs(ys[a]-ys[b]);
    const own=p=>s.team==='west'?xs[p]<s.border:xs[p]>s.border;
    const hostile=p=>s.team==='west'?xs[p]>s.border:xs[p]<s.border;
    const foe=s.team==='west'?'east':'west',start=pos(me), home=pos(s.flags[s.team].home), flag=pos(s.flags[foe].home);
    if(s.tick<=lastTick){visits.fill(0);previous.clear();}lastTick=s.tick;visits[start]+=1;
    const all=[me,...s.teammates].sort(compare), friends=all.filter(active), enemies=s.enemies.filter(active);
    const intruders=enemies.filter(e=>own(pos(e))), homeD=bfs([home]), myD=bfs([start]);
    const enemyData=enemies.map(e=>({a:e,p:pos(e),d:bfs([pos(e)]),old:previous.get(e.id)}));
    const escape=[];for(let y=0;y<h;y++){const x=s.border+(s.team==='west'?-1:1),p=y*w+x;if(adj[p].length)escape.push(p);}
    const escapeD=bfs(escape);
    const anchor=all.find(active);
    let guard=!me.carrying&&anchor&&anchor.id===me.id;
    // A lone player holds home while a threat exists, else raids only
    // when the jail clock allows a full round trip.
    if(all.length===1 && guard){
      const acute=enemyData.some(e=>e.a.carrying||own(e.p)||xs[e.p]===s.border);
      const release=s.enemies.length?Math.min(...s.enemies.map(e=>e.jailed?40-e.jailTicks:e.respawnIn>0?e.respawnIn:1)):99;
      if(!acute && release>myD[flag]+escapeD[flag]+2)guard=false;
    }
    if(guard && enemies.length===0 && s.enemies.every(e=>e.jailed && 40-e.jailTicks>myD[flag]+escapeD[flag]+3))guard=false;
    let goals=[flag],target=null,defending=guard,rescuing=false;
    if(me.carrying)goals=escape;
    else if(guard){
      // Sit on the stand: sharing its cell tags any grabber before pickup.
      // Chasing a same-speed intruder from behind never catches; engage only
      // intruders committed to the flag or the jail, and cut off carriers at
      // the border instead of following them.
      goals=[home];
      const carrier=enemyData.find(e=>e.a.carrying&&own(e.p));
      if(carrier){
        let cut=escape[0],best=1000000;
        for(const q of escape){if(carrier.d[q]<best){best=carrier.d[q];cut=q;}}
        goals=cut===undefined?[home]:myD[carrier.p]<=3?[carrier.p,cut]:[cut];
        target=carrier;
      }else{
        const jailCells=s.zones[s.team].jail.map(pos), jailD=bfs(jailCells);
        const committed=enemyData.filter(e=>own(e.p)&&(homeD[e.p]<=3||jailD[e.p]<=3));
        committed.sort((a,b)=>homeD[a.p]-homeD[b.p]||compare(a.a,b.a));
        if(committed.length&&start!==home){goals=[committed[0].p];target=committed[0];}
      }
    }else if(!me.carrying){
      // Nearby defenders intercept opportunistically without abandoning a raid.
      const possible=enemyData.filter(e=>own(e.p)&&own(start)&&myD[e.p]<=7);
      possible.sort((a,b)=>Number(b.a.carrying)-Number(a.a.carrying)||myD[a.p]-myD[b.p]);
      if(possible.length){
        const e=possible[0];
        const closer=friends.some(f=>f.id!==me.id&&!f.carrying&&e.d[pos(f)]<myD[e.p]-1);
        if(!closer || e.a.carrying){target=e;goals=[e.p];defending=true;}
      }
      const prisoners=all.filter(a=>a.jailed&&a.jailTicks<32);
      if(!defending&&prisoners.length){
        const jailGoals=[];for(const j of s.zones[foe].jail)for(const [p] of adj[pos(j)])if(!jailGoals.includes(p))jailGoals.push(p);
        const jd=bfs(jailGoals);
        const eligible=friends.filter(a=>!a.carrying&&(!anchor||a.id!==anchor.id)).sort((a,b)=>jd[pos(a)]-jd[pos(b)]||compare(a,b));
        if(eligible.length&&eligible[0].id===me.id&&jd[start]+4<Math.max(...prisoners.map(a=>40-a.jailTicks))&& (jd[start]<myD[flag]+8||prisoners.length>1)){goals=jailGoals;rescuing=true;}
      }
      if(!defending&&!rescuing&&s.flags[foe].carrier!==null){
        // Do not follow the carrier home: wait near the resetting flag.
        goals=[flag];
      }
    }
    const risk=new Float64Array(n), immediate=new Float64Array(n);
    for(let p=0;p<n;p++)if(hostile(p)&&adj[p].length){
      for(const e of enemyData){
        let tagMoves=0,total=0,min=1000000;
        for(const [q] of adj[e.p]) {total++;if(hostile(q)&&md(p,q)<=1)tagMoves++;}
        immediate[p]+=tagMoves/(total||1);
        // Distances to tag cells, rather than Manhattan distances through walls.
        min=e.d[p];for(const [q] of adj[p])if(hostile(q))min=Math.min(min,e.d[q]);
        risk[p]+=min<=1?90:min===2?17:min===3?5:min===4?1.7:min===5?0.5:0;
      }
    }
    const allowed=defending&&own(start)?own:null;
    const route=weighted(goals,risk,allowed);
    let best=-Infinity,action='stay';
    const rank=all.findIndex(a=>a.id===me.id);
    for(const [p,a] of adj[start]){
      if(allowed&&!own(p))continue;
      let value=-route[p]-risk[p]-(a===4?0.22:0);
      if(hostile(p)) {
        value-=immediate[p]*(me.carrying?2200:1100);
        // A move that is safe now but has no safe continuation is a trap.
        let exit=0;
        for(const [q] of adj[p])if(!hostile(q)||enemyData.every(e=>{
          let dist=e.d[q];for(const [z] of adj[q])if(hostile(z))dist=Math.min(dist,e.d[z]);return dist>2;
        }))exit++;
        if(exit===0)value-=35;
      }
      if(own(p))for(const e of enemyData){
        let count=0, options=0, predicted=0;
        const old=e.old, vx=old?xs[e.p]-old.x:0,vy=old?ys[e.p]-old.y:0;
        for(const [q] of adj[e.p]){
          if(!own(q))continue;options++;
          if(md(p,q)<=1){count++;if(xs[q]===xs[e.p]+vx&&ys[q]===ys[e.p]+vy)predicted=1;}
        }
        if(count){value+=count/(options||1)*(e.a.carrying?90:25)+predicted*8;if(count===adj[e.p].length)value+=80;}
      }
      if(target){
        // Intercept a carrier on its route to neutral territory.
        if(target.a.carrying)value-=0.22*Math.abs(xs[p]-s.border);
        if(target.old){const nx=xs[target.p]+xs[target.p]-target.old.x,ny=ys[target.p]+ys[target.p]-target.old.y;value-=0.12*(Math.abs(xs[p]-nx)+Math.abs(ys[p]-ny));}
      }
      if(!defending&&!me.carrying){
        value-=Math.min(visits[p],15)*0.12;
        // Spread equal-cost approaches across lanes and avoid stacking raiders.
        const lane=Math.max(0,Math.min(h-1,ys[flag]+(rank%2?1:-1)*(2+rank)));
        value-=0.018*Math.abs(ys[p]-lane);
        for(const f of friends)if(f.id!==me.id&&!f.carrying&&pos(f)===p)value-=0.18;
      }
      if(guard&&!target)value-=0.03*homeD[p];
      if(value>best+1e-8){best=value;action=names[a];}
    }
    previous=new Map(enemies.map(e=>[e.id,{x:e.x,y:e.y}]));
    return action;
  }
  return {name:'Aegis',move};
})();
