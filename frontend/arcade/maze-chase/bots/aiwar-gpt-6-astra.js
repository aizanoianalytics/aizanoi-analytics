'use strict';

// A bounded receding-horizon planner. All coordinates are graph vertices.
module.exports = (() => {
  const names = ['up','right','down','left','stay'];
  const dx = [0,1,0,-1], dy = [-1,0,1,0];
  let C, lastTick = -1, visits, oldPos = -1;
  const INF = 30000;
  function build(s) {
    const n=s.width*s.height, r=Array.from({length:n},()=>[]), g=Array.from({length:n},()=>[]), cells=s.grid.join('').split('');
    for(let p=0;p<n;p++) {
      if(cells[p]==='#') continue;
      const x=p%s.width,y=(p/s.width)|0;
      for(let d=0;d<4;d++) {
        let xx=x+dx[d], yy=y+dy[d];
        if(y===s.tunnelRow && dx[d]) xx=(xx+s.width)%s.width;
        if(xx<0||xx>=s.width||yy<0||yy>=s.height) continue;
        const q=yy*s.width+xx,a=cells[p],b=cells[q];
        if(b==='#') continue;
        if(a!=='G'&&a!=='-'&&b!=='G'&&b!=='-') r[p].push([q,d]);
        if(!(a==='G'&&b!=='G'&&b!=='-')&&!(b==='G'&&a!=='G'&&a!=='-')) g[p].push([q,d]);
      }
    }
    C={n,r,g,cells,w:s.width,h:s.height,cache:new Map()}; visits=new Float32Array(n);oldPos=-1;
  }
  function dist(source, ghost=false) {
    const key=source*2+(ghost?1:0);
    if(C.cache.has(key)) return C.cache.get(key);
    const a=new Int16Array(C.n);a.fill(INF);a[source]=0;
    const queue=new Int32Array(C.n);queue[0]=source;let end=1;
    const graph=ghost?C.g:C.r;
    for(let i=0;i<end;i++) { const p=queue[i];for(const e of graph[p]) if(a[e[0]]===INF){a[e[0]]=a[p]+1;queue[end++]=e[0];} }
    // Keep memory bounded even on the largest supported boards.
    if(C.cache.size>900) C.cache.clear();
    C.cache.set(key,a);return a;
  }
  function multi(sources,graph) {
    const a=new Int16Array(C.n);a.fill(INF);const q=new Int32Array(C.n);let end=0;
    for(const p of sources) if(a[p]) {a[p]=0;q[end++]=p;}
    for(let i=0;i<end;i++)for(const e of graph[q[i]])if(a[e[0]]===INF){a[e[0]]=a[q[i]]+1;q[end++]=e[0];}
    return a;
  }
  function run(s,p,legal) {
    const you=s.you, ghosts=s.ghosts.map(g=>({g,p:g.y*C.w+g.x,d:dist(g.y*C.w+g.x,true)}));
    const pellets=[],powers=[];
    for(let i=0;i<C.n;i++){if(C.cells[i]==='.'||C.cells[i]==='o')pellets.push(i);if(C.cells[i]==='o')powers.push(i);}
    const pd=multi(pellets,C.r),powerDist=multi(powers,C.r);
    // The final pickup wins even when contact costs the last life.
    if(pellets.length===1) {
      const finish=legal.find(e=>e[0]===pellets[0]);
      if(finish)return names[finish[1]];
    }
    const mates=s.runners.filter(a=>a.id!==you.id&&a.alive&&!a.respawnIn).map(a=>dist(a.y*C.w+a.x));
    const nearDanger=Math.min(INF,...ghosts.filter(o=>!o.g.frightened).map(o=>o.d[p]+(o.g.inPen?o.g.releaseIn:0)));
    const horizon=12, width=44;
    let beam=[{p,prev:-1,first:4,score:0,path:[],power:0}],best=null;
    for(let t=1;t<=horizon;t++) {
      const out=[];const dedup=new Map();
      for(const b of beam) {
        const edges=t===1?legal:C.r[b.p];
        for(const [q,dir] of edges) {
          let score=b.score, power=b.power;
          const seen=b.path.includes(q),c=C.cells[q];
          if(c==='o'&&!seen)power=t;
          const protectedNow=you.invulnerableTicksLeft>t;
          let danger=INF,lethal=false;
          for(const o of ghosts) {
            const g=o.g, d=o.d[q];
            const edible=(power && t-power<s.frightDuration)||(!g.frightImmune&&g.frightened&&s.frightTicksLeft>t);
            if(edible) {
              if(!g.inPen && !seen && d<=1 && s.frightTicksLeft>t+2) score+= (t===1?9:1.1);
              continue;
            }
            if(protectedNow)continue;
            let reach=t;
            if(g.inPen)reach-=Math.max(0,g.releaseIn-1);
            if(g.frightened)reach=Math.max(0,t-Math.min(t,s.frightTicksLeft-1)/2);
            const margin=d-Math.min(reach,5);
            danger=Math.min(danger,margin);
            if(t===1 && !g.inPen && (d<=(g.frightened&&(s.tick+1)%2?0:1)))lethal=true;
          }
          const discount=Math.pow(.91,t-1);
          if(lethal)score-=20000;
          if(danger<1)score-=discount*(t<=2?160:24)*(1-danger*.22);
          else if(danger<4)score-=discount*(4-danger)*1.8;
          if(!seen&&(c==='.'||c==='o')) {
            let value=c==='.'?10:(s.frightTicksLeft>16&&nearDanger>6?9:18);
            if(c==='o'&&nearDanger<10)value+=22;
            if(mates.some(d=>d[q]<t-1))value*=.32;
            score+=discount*value;
          }
          score-=discount*(seen?3.2:0.12+Math.min(visits[q],15)*.24);
          if(q===b.prev)score-=1.4;
          if(t===1&&names[dir]===you.dir)score+=.15;
          const path=b.path.concat(q);
          const obj={p:q,prev:b.p,first:t===1?dir:b.first,score,path,power};
          obj.rank=score-2.4*pd[q]+(nearDanger<10&&!power?Math.max(0,12-powerDist[q])*.25:0);
          const key=q*20+obj.first*4+(power?1:0);
          const previous=dedup.get(key);
          if(!previous||previous.rank<obj.rank)dedup.set(key,obj);
        }
      }
      for(const b of dedup.values())out.push(b);
      out.sort((a,b)=>b.rank-a.rank);beam=out.slice(0,width);
      if(!beam.length)break;
      best=beam[0];
    }
    return best?names[best.first]:'stay';
  }
  function hunt(s,p,legal) {
    const you=s.you, live=s.runners.filter(r=>r.alive&&!r.respawnIn);
    if(you.inPen) {
      const exits=[];for(let i=0;i<C.n;i++)if(C.cells[i]==='-')for(const e of C.g[i])if(C.cells[e[0]]!=='G')exits.push(e[0]);
      const d=multi(exits,C.g);legal.sort((a,b)=>d[a[0]]-d[b[0]]);return names[legal[0][1]];
    }
    if(!live.length)return 'stay';
    const rd=live.map(r=>({r,p:r.y*C.w+r.x,d:dist(r.y*C.w+r.x,true)}));
    if(you.frightened&&s.frightTicksLeft>1) {
      // Prefer pen refuge: runners cannot follow through the door.
      let best=legal[0],value=-Infinity;
      for(const e of legal){let v=Math.min(...rd.map(o=>o.d[e[0]]));v+=C.g[e[0]].length*.16; if(C.cells[e[0]]==='-'||C.cells[e[0]]==='G')v+=30;v-=visits[e[0]]*.08;if(v>value){value=v;best=e;}}
      return names[best[1]];
    }
    const from=dist(p,true),others=s.ghosts.filter(g=>g.id!==you.id&&!g.inPen&&!g.frightened).map(g=>({p:g.y*C.w+g.x,d:dist(g.y*C.w+g.x,true)}));
    let target=rd[0],tv=Infinity;
    for(const o of rd){const d=from[o.p], close=others.filter(g=>g.d[o.p]<d).length;const v=d+close*4+Math.max(0,o.r.invulnerableTicksLeft-d)*2;if(v<tv){tv=v;target=o;}}
    // Predict a plausible escape route, then race to a forward intercept.
    const path=[target.p];let cur=target.p,prev=-1,heading=names.indexOf(target.r.dir);
    for(let t=1;t<=10;t++) {
      let best=-1,bv=-Infinity,bd=heading;
      for(const [q,d] of C.r[cur]) {
        let safety=from[q];for(const g of others)safety=Math.min(safety,g.d[q]);
        let v=Math.min(safety,9)*1.6+(C.cells[q]==='.'?1.6:0)+(C.cells[q]==='o'?7:0)+(d===heading?1.3:0)-(q===prev?7:0)-(path.includes(q)?3:0);
        if(v>bv){bv=v;best=q;bd=d;}
      }
      if(best<0)break;prev=cur;cur=best;heading=bd;path.push(cur);
    }
    let aim=target.p;
    for(let t=1;t<path.length;t++) {
      if(from[path[t]]<=t+1 && !others.some(g=>g.d[path[t]]+1<from[path[t]])){aim=path[t];break;}
      if(t<=5&&others.some(g=>g.d[target.p]<from[target.p]-1))aim=path[t];
    }
    const ad=dist(aim,true);let best=legal[0],bv=-Infinity;
    for(const e of legal) {
      const q=e[0];let value=-ad[q]-target.d[q]*.15;
      // Collisions are simultaneous: cover likely runner destinations, not just its old square.
      if(target.r.invulnerableTicksLeft<=1) {
        if(q===path[1])value+=2.7;
        if(q===target.p)value+=1.2;
      }
      for(const g of others)if(g.p===q)value-=1.4;
      if(C.cells[q]==='G'||C.cells[q]==='-')value-=12;
      for(const o of rd) for(const [v] of C.r[o.p]) if(C.cells[v]==='o'&&(q===v||q===o.p))value-=35;
      value-=Math.min(visits[q],20)*.035;
      if(names[e[1]]===you.dir)value+=.12;
      if(value>bv){bv=value;best=e;}
    }
    return names[best[1]];
  }
  return {name:'Ariadne',move(s) {
    if(!C||s.tick<=lastTick||s.width!==C.w||s.height!==C.h)build(s);
    lastTick=s.tick;C.cells=s.grid.join('').split('');
    const a=s.you,p=a.y*s.width+a.x;
    if(!a.alive||a.respawnIn)return 'stay';
    if(a.role==='ghost'&&a.frightened&&s.frightTicksLeft>1&&(s.tick+1)%2)return 'stay';
    if(oldPos!==p)visits[p]+=1;else visits[p]+=.3;oldPos=p;
    if(s.tick%40===0)for(let i=0;i<C.n;i++)visits[i]*=.65;
    let legal=(a.role==='runner'?C.r:C.g)[p].filter(e=>!(a.role==='ghost'&&a.inPen&&a.releaseIn>1&&C.cells[e[0]]!=='G'));
    if(!legal.length)return 'stay';
    if(a.role==='runner')return run(s,p,legal.concat([[p,4]]));
    return hunt(s,p,legal);
  }};
})();
