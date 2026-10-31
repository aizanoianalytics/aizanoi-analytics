'use strict';

// One independent copy of this module is loaded per seat.
let topology = null;
let intended = -1;
const names = ['up', 'right', 'down', 'left'];
const dx = [0, 1, 0, -1], dy = [-1, 0, 1, 0];

function graph(s) {
  const w = s.width, h = s.height, n = w * h;
  if (topology && topology.w === w && topology.h === h && topology.row === s.tunnelRow && topology.signature === s.grid.map(r => r.replace(/[.o]/g, ' ')).join('')) return topology;
  const signature = s.grid.map(r => r.replace(/[.o]/g, ' ')).join('');
  const runner = Array.from({length:n}, () => [-1,-1,-1,-1]);
  const ghost = Array.from({length:n}, () => [-1,-1,-1,-1]);
  const cells = signature;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const p=y*w+x, from=cells[p];
    if (from==='#') continue;
    for (let d=0;d<4;d++) {
      let xx=x+dx[d], yy=y+dy[d];
      if (y===s.tunnelRow) xx=(xx+w)%w;
      if (xx<0||xx>=w||yy<0||yy>=h) continue;
      const q=yy*w+xx, to=cells[q];
      if (to==='#') continue;
      if (from!=='G' && from!=='-' && to!=='G' && to!=='-') runner[p][d]=q;
      if (!(from==='G' && to!=='G' && to!=='-') && !(to==='G' && from!=='G' && from!=='-')) ghost[p][d]=q;
    }
  }
  topology={w,h,row:s.tunnelRow,signature,runner,ghost,cells};
  return topology;
}
function bfs(edges, starts) {
  const n=edges.length, dist=new Int16Array(n); dist.fill(30000);
  const queue=new Int32Array(n); let head=0,tail=0;
  for (const p of starts) if (p>=0 && dist[p]===30000) {dist[p]=0; queue[tail++]=p;}
  while(head<tail) {
    const p=queue[head++], step=dist[p]+1, e=edges[p];
    for(let i=0;i<4;i++) {const q=e[i]; if(q>=0 && dist[q]>step) {dist[q]=step;queue[tail++]=q;}}
  }
  return dist;
}
function route(edges, start, penalty) {
  const n=edges.length, costs=new Float64Array(n), first=new Int8Array(n), steps=new Int16Array(n);
  costs.fill(Infinity);first.fill(-1); steps.fill(30000);
  const heap=[];
  function push(p,v) {let i=heap.length;heap.push([p,v]);while(i){let parent=(i-1)>>1;if(heap[parent][1]<=v)break;heap[i]=heap[parent];i=parent;}heap[i]=[p,v];}
  function pop(){const result=heap[0], last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let j=2*i+1;if(j+1<heap.length && heap[j+1][1]<heap[j][1])j++;if(heap[j][1]>=last[1])break;heap[i]=heap[j];i=j;}heap[i]=last;}return result;}
  costs[start]=0;steps[start]=0;push(start,0);
  while(heap.length){const [p,c]=pop();if(c!==costs[p])continue;const e=edges[p];
    for(let d=0;d<4;d++){const q=e[d];if(q<0)continue;
      const value=c+1+penalty(q,steps[p]+1,p);
      if(value+1e-7<costs[q]){costs[q]=value;steps[q]=steps[p]+1;first[q]=p===start?d:first[p];push(q,value);}
    }
  }
  return {costs,first,steps};
}
function position(a,w){return a.y*w+a.x;}

module.exports = {name:'Labyrinth Strategist', move(s) {
  const me=s.you;
  if(!me.alive || me.respawnIn) return 'stay';
  const t=s.tick+1, g=graph(s), w=s.width, start=position(me,w);
  const edges=me.role==='runner'?g.runner:g.ghost;
  const legal=[];
  for(let d=0;d<4;d++) if(edges[start][d]>=0 && !(me.role==='ghost' && me.inPen && me.releaseIn>1 && g.cells[edges[start][d]]!=='G')) legal.push(d);
  if(!legal.length) return 'stay';
  const runners=s.runners.filter(a=>a.alive && a.respawnIn<=1);
  const ghosts=s.ghosts.filter(a=>!a.inPen);
  if(me.role==='ghost') {
    if(me.frightened && s.frightTicksLeft>1 && t%2) return 'stay';
    if(me.inPen){
      const doors=[];for(let p=0;p<g.cells.length;p++) if(g.cells[p]==='-')doors.push(p);
      const dd=bfs(g.ghost,doors);
      let best=legal[0], score=30000;
      for(const d of legal){const q=edges[start][d];const v=dd[q]+(g.cells[q]==='-'&&me.releaseIn>1?10000:0);
        if(v<score){score=v;best=d;}}
      return names[best];
    }
    if(!runners.length)return names[legal[0]];
    const maps=runners.map(r=>bfs(g.ghost,[position(r,w)]));
    if(me.frightened && s.frightTicksLeft>3) {
      let best=legal[0],value=-Infinity;
      for(const d of legal){let q=edges[start][d], proximity=Infinity;
        for(let i=0;i<runners.length;i++) proximity=Math.min(proximity,maps[i][q]-(runners[i].invulnerable?0:0));
        const v=Math.min(proximity,12)*3 + (q===start?-2:0) + (names[d]===me.dir?.1:0);
        if(v>value){value=v;best=d;}}
      return names[best];
    }
    let best=legal[0],value=Infinity;
    for(const d of legal){const q=edges[start][d];let v=Infinity;
      for(let i=0;i<runners.length;i++){
        const r=runners[i], rp=position(r,w), rDist=maps[i][q];
        // Pursue the next corridor, not just the runner's previous location.
        const heading=names.indexOf(r.dir), forward=heading>=0?g.runner[rp][heading]:-1;
        const lead=forward>=0?bfs(g.ghost,[forward])[q]:30000;
        const distance=Math.min(rDist,lead+0.5);
        const candidate=distance+(r.invulnerableTicksLeft>distance+2?2:0)+(r.respawnIn?4:0);
        if(candidate<v)v=candidate;
      }
      if(names[d]===me.dir)v-=0.14;
      if(v<value){value=v;best=d;}
    }
    return names[best];
  }
  // Reachability-based pickup routing with collision risk and teammate allocation.
  const dangerous=ghosts.filter(a=>!a.frightened || s.frightTicksLeft<=1);
  const danger=bfs(g.ghost,dangerous.map(a=>position(a,w)));
  const protectedNow=me.invulnerableTicksLeft>1;
  const powerNow=s.grid[me.y][me.x]==='o';
  const pen=(q,steps,p)=>{
    if(protectedNow && steps<me.invulnerableTicksLeft-1)return 0;
    if(g.cells[q]==='o')return 0;
    const v=danger[q];
    if(v<=1 && steps<=2)return 100;
    if(v===2 && steps<=3)return 13;
    if(v===3 && steps<=4)return 3.5;
    if(v<=Math.min(steps+1,5))return 1.3;
    return 0;
  };
  const path=route(edges,start,pen);
  const other=s.runners.filter(r=>r.id!==me.id && r.alive && !r.respawnIn);
  const friendDistances=other.map(r=>bfs(edges,[position(r,w)]));
  let goal=-1, best=Infinity;
  for(let y=0;y<s.height;y++)for(let x=0;x<w;x++){
    const c=s.grid[y][x];if(c!=='.'&&c!=='o')continue;
    const p=y*w+x, d=path.costs[p];if(!Number.isFinite(d))continue;
    let claimed=0;
    for(const fd of friendDistances)if(fd[p]+1<path.steps[p])claimed+=Math.min(7,(path.steps[p]-fd[p])*0.65);
    let density=0;
    // Favor corridors with nearby remaining food, not isolated crumbs.
    for(const q of g.runner[p]) if(q>=0 && (s.grid[Math.floor(q/w)][q%w]==='.'||s.grid[Math.floor(q/w)][q%w]==='o')) density++;
    let v=d+claimed-Math.min(1.1,density*0.4);
    if(c==='o') {
      if(danger[p]<10 && !protectedNow)v-=Math.max(0,5-danger[p])*1.4+2;
      else if(s.frightTicksLeft>Math.max(12,path.steps[p]+6))v+=6;
      else v-=0.3;
    }
    if(p===intended)v-=1.4;
    if(p===start)v-=0.7;
    if(v<best){best=v;goal=p;}
  }
  intended=goal;
  const edible=ghosts.filter(a=>a.frightened && s.frightTicksLeft>2);
  if(edible.length && !dangerous.length && s.frightTicksLeft>4){
    for(const a of edible){const p=position(a,w), d=path.steps[p];
      if(d<s.frightTicksLeft-2 && d<7 && path.costs[p]-Math.min(7,s.nextGhostPoints/150)<best){goal=p;best=path.costs[p]-Math.min(7,s.nextGhostPoints/150);}
    }
  }
  let chosen=goal>=0?path.first[goal]:-1;
  if(goal===start && s.grid[me.y][me.x]==='.'){
    // Standing still collects a pellet on this tick.
    if(danger[start]>1 || protectedNow || powerNow)return 'stay';
  }
  if(chosen<0){let value=Infinity;for(const d of legal){const q=edges[start][d], score=danger[q]<=1?100:danger[q]<=2?10:0;
    if(score<value){value=score;chosen=d;}}}
  // Verify exact one-tick collision possibilities, including head-on swaps.
  if(!protectedNow && chosen>=0){
    const risk=d=>{
      const q=d<0?start:edges[start][d];if(q<0)return 1e5;
      if(s.grid[Math.floor(q/w)][q%w]==='o')return 0;
      let count=0;
      for(const a of dangerous){const gp=position(a,w);
        if(q===gp || (gp===q && q===start))count+=100;
        for(const next of g.ghost[gp])if(next===q || (next===start && gp===q))count+=100;
      }
      return count;
    };
    if(risk(chosen)>0){let alt=chosen,val=1e9;
      for(const d of legal.concat([-1])){const q=d<0?start:edges[start][d], v=risk(d)*100+(goal>=0?path.costs[q]:0)+(d<0?1:0);
        if(v<val){val=v;alt=d;}}
      chosen=alt;
    }
  }
  return chosen<0?'stay':names[chosen];
}};
