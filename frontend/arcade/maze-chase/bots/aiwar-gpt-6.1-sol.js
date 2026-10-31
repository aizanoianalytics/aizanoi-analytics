'use strict';

// Ariadne: topology-aware collection and simultaneous-move pursuit.
module.exports = (() => {
  const names = ['up', 'right', 'down', 'left', 'stay'];
  const dx = [0, 1, 0, -1], dy = [-1, 0, 1, 0];
  let topology = '', R, G, cells, doors, exterior, N, W;
  let rd, gd, visits, lastTick = -1, lastPellets = -1, lastProgress = 0;
  const INF = 30000;
  function setup(s) {
    const sig = s.width + ':' + s.tunnelRow + ':' + s.grid.map(r => r.replace(/[.o]/g, ' ')).join('');
    if (sig === topology && s.tick > lastTick) { lastTick = s.tick; return; }
    topology = sig; lastTick = s.tick; lastPellets = s.pellets; lastProgress = s.tick; W = s.width; N = W * s.height;
    R = Array.from({length:N}, () => []); G = Array.from({length:N}, () => []);
    cells = []; doors = []; exterior = []; rd = []; gd = []; visits = new Float64Array(N);
    for (let p = 0; p < N; p++) {
      const x = p % W, y = (p / W) | 0, a = s.grid[y][x];
      if (a === '#') continue;
      cells.push(p); if (a === '-') doors.push(p);
      if (a !== 'G' && a !== '-') exterior.push(p);
      for (let d = 0; d < 4; d++) {
        let nx = x + dx[d], ny = y + dy[d];
        if (y === s.tunnelRow && (d === 1 || d === 3)) nx = (nx + W) % W;
        if (ny < 0 || ny >= s.height || nx < 0 || nx >= W) continue;
        const b = s.grid[ny][nx], q = ny * W + nx;
        if (b === '#') continue;
        if (a !== 'G' && a !== '-' && b !== 'G' && b !== '-') R[p].push([q,d]);
        if ((a !== 'G' || b === 'G' || b === '-') && (b !== 'G' || a === 'G' || a === '-')) G[p].push([q,d]);
      }
    }
  }
  const pos = a => a.y * W + a.x;
  function distances(p, ghost) {
    const cache = ghost ? gd : rd;
    if (cache[p]) return cache[p];
    const a = new Int16Array(N); a.fill(INF); a[p] = 0;
    const queue = new Int32Array(N); queue[0] = p; let n = 1;
    const graph = ghost ? G : R;
    for (let i = 0; i < n; i++) {
      const v = queue[i], k = a[v] + 1;
      for (const e of graph[v]) if (a[e[0]] === INF) { a[e[0]] = k; queue[n++] = e[0]; }
    }
    cache[p] = a; return a;
  }
  const dist = (a,b,g=false) => distances(a,g)[b];
  function legal(s, a) {
    const p = pos(a);
    if (a.role === 'runner') return R[p].concat([[p,4]]);
    if (a.frightened && s.frightTicksLeft > 1 && (s.tick + 1) % 2) return [[p,4]];
    return G[p].filter(e => !a.inPen || a.releaseIn <= 1 || s.grid[(e[0]/W)|0][e[0]%W] === 'G').concat([[p,4]]);
  }
  function runner(s) {
    const a = s.you, start = pos(a), options = legal(s,a);
    visits[start] += 1;
    if (s.pellets !== lastPellets) { lastPellets = s.pellets; lastProgress = s.tick; }
    const stalled = s.tick - lastProgress;
    const urgency = s.pellets < 12 ? 3 : 1;
    const food = new Uint8Array(N), value = new Float64Array(N);
    const other = s.runners.filter(r => r.id !== a.id && r.alive && !r.respawnIn).map(r => distances(pos(r),false));
    const from = distances(start,false);
    const gs = s.ghosts.map(g => ({a:g, p:pos(g), d:distances(pos(g),true)}));
    let nearest = INF;
    for (const g of gs) if (!g.a.inPen && (!g.a.frightened || s.frightTicksLeft < 5)) nearest = Math.min(nearest,g.d[start]);
    const targets = [];
    for (const p of exterior) {
      const c = s.grid[(p/W)|0][p%W];
      if (c !== '.' && c !== 'o') continue;
      food[p] = c === 'o' ? 2 : 1;
      let v = c === 'o' ? (s.frightTicksLeft > 16 ? 0.9 : nearest < 10 ? 3.8 : 1.4) : 1;
      for (const d of other) if (d[p] + 2 < from[p]) v *= 0.42;
      value[p] = v * urgency;
      targets.push(p);
    }
    // Global potential prevents local loops when a region has been cleared.
    const goals = targets.map(p => {
      let danger = INF;
      for (const g of gs) if (!g.a.frightened && !g.a.inPen) danger = Math.min(danger,g.d[p]);
      const route = from[p] + (danger < 4 && food[p] !== 2 && !a.invulnerable ? (4-danger)*3 : 0);
      return {p, cost:route / Math.max(0.55,Math.sqrt(value[p]))};
    }).sort((x,y) => x.cost-y.cost).slice(0,16);
    const potentials = goals.map(g => ({d:distances(g.p,false), w:Math.sqrt(value[g.p])}));
    function potential(p, path) {
      let best = INF;
      for (let i=0;i<goals.length;i++) {
        if (s.pellets > 12 && stalled < 30 && path.includes(goals[i].p)) continue;
        best = Math.min(best,potentials[i].d[p]/potentials[i].w);
      }
      return best === INF ? 0 : -(stalled > 40 ? 0.95 : 0.45) * best;
    }
    let beam = [{p:start, prev:-1, path:[], gs:gs.map(g=>g.p), power:0, eaten:0, score:0, first:4, collected:0}];
    let answer = 4, bestFinal = -Infinity;
    const horizon = s.pellets < 12 ? 18 : nearest < 10 ? 13 : 10;
    const width = nearest < 10 ? 48 : 28;
    for (let t = 1; t <= horizon; t++) {
      const next = [];
      for (const b of beam) {
        if (b.dead) { next.push(b); continue; }
        const moves = t === 1 ? options : R[b.p].concat([[b.p,4]]);
        for (const [p,dir] of moves) {
          const fresh = food[p] && !b.path.includes(p);
          const power = fresh && food[p] === 2 ? t + s.frightDuration : b.power;
          const powered = power > t;
          const protectedNow = a.invulnerableTicksLeft > t;
          let score = b.score, minD = INF, eaten = b.eaten, death = false;
          const gps = b.gs.slice();
          for (let i = 0; i < gs.length; i++) {
            const g = gs[i], ga = g.a;
            if ((eaten >> i) & 1) continue;
            let gp = b.gs[i];
            const afraid = powered || (ga.frightened && s.frightTicksLeft > t);
            const skip = afraid && (s.tick+t)%2 && !(powered && b.power === 0);
            if (!skip) {
              let chosen = gp, best = afraid ? -Infinity : Infinity;
              const target = distances(b.p,true);
              for (const [q] of G[gp].concat([[gp,4]])) {
                const c = s.grid[(q/W)|0][q%W];
                if (ga.inPen && ga.releaseIn > t && c !== 'G') continue;
                const v = target[q] + (q===gp ? (afraid ? -0.05 : 0.05) : 0);
                if (afraid ? v > best : v < best) {best=v; chosen=q;}
              }
              gp=chosen;
            }
            gps[i]=gp;
            const c = s.grid[(gp/W)|0][gp%W];
            if (c === 'G' || c === '-') continue;
            const d = dist(gp,p,true);
            const contact = p===gp || (p===b.gs[i] && gp===b.p);
            if (afraid) {
              if (contact) { eaten |= 1<<i; score += 0.6*Math.pow(0.96,t); }
              continue;
            }
            if (!protectedNow) {
              minD=Math.min(minD,d);
              if (contact) death=true;
              // First-ply safety is exact against every possible ghost action.
              if (t===1 && (g.d[p]<=1 || (p===g.p && g.d[start]<=1))) death=true;
            }
          }
          const collected = b.collected + (fresh ? 1 : 0);
          if (collected >= s.pellets) {
            return names[t===1 ? dir : b.first];
          }
          if (death) score -= (a.lives > 1 && stalled > 65 ? 35 : 1300) * Math.pow(0.93,t);
          if (fresh) score += value[p]*Math.pow(0.97,t);
          if (!protectedNow && !powered) {
            score -= (minD < 2 ? 3.5 : minD < 3 ? 1 : minD < 5 ? 0.16 : 0)*Math.pow(0.94,t);
            // An adversarial reach envelope is a soft warning beyond the first step.
            let margin=INF;
            for (const g of gs) if (!g.a.frightened && !g.a.inPen) margin=Math.min(margin,g.d[p]-t);
            if (margin <= 0) score -= 0.18*Math.pow(0.95,t);
          }
          if (p===b.p) score-=0.42;
          if (p===b.prev) score-=0.16;
          if (b.path.includes(p)) score-=0.30;
          score-=Math.min(10,visits[p])*0.018;
          const path=b.path.concat(p);
          const first=t===1 ? dir : b.first;
          const evaluation=score+potential(p,path)+Math.min(minD,9)*0.045;
          next.push({p,prev:b.p,path,gs:gps,power,eaten,score,first,evaluation,collected,dead:death});
        }
      }
      next.sort((x,y)=>y.evaluation-x.evaluation);
      // Preserve alternative routes, not dozens of equivalent permutations.
      const seen=new Map(); beam=[];
      for (const b of next) {
        const key=b.p*5+b.first+N*5*(b.power?1:0);
        const count=seen.get(key)||0;
        if(count>=2) continue;
        seen.set(key,count+1); beam.push(b);
        if(beam.length>=width) break;
      }
      if(!beam.length) break;
      answer=beam[0].first; bestFinal=beam[0].evaluation;
    }
    return names[answer];
  }
  function ghost(s) {
    const a=s.you, p=pos(a), opts=legal(s,a);
    if(opts.length===1) return names[opts[0][1]];
    const live=s.runners.filter(r=>r.alive && r.respawnIn<=1);
    if(a.inPen) {
      // Wait at the cell beside the door rather than wasting the release slot.
      let best=Infinity, action=4;
      for(const [q,d] of opts) {
        let v=INF;
        for(const z of exterior) if(G[z].some(e=>doors.includes(e[0]))) v=Math.min(v,dist(q,z,true));
        if(v<best) {best=v;action=d;}
      }
      return names[action];
    }
    if(!live.length) return names[opts.reduce((b,e)=>dist(e[0],pos(s.runners.find(r=>r.alive)||s.runners[0]),true)<dist(b[0],pos(s.runners.find(r=>r.alive)||s.runners[0]),true)?e:b)[1]];
    const pursuers=s.ghosts.filter(g=>!g.inPen && (!g.frightened || s.frightTicksLeft<=1));
    const power=s.powerPellets.map(pos);
    if(a.frightened && s.frightTicksLeft>1) {
      // Being eaten grants immunity: trade a short pen timeout for a
      // dangerous early return during a long fright, rather than flee forever.
      const sacrifice=s.frightTicksLeft>30 && live.some(r=>dist(p,pos(r),true)<15);
      let best=-Infinity,action=4;
      for(const [q,d] of opts) {
        let safety=INF;
        for(const r of live) safety=Math.min(safety,dist(pos(r),q,true));
        let v=(sacrifice?-safety:safety)*5+Math.min(4,G[q].length)*0.15;
        for(const r of live) if(!sacrifice && dist(pos(r),q,true)<=1) v-=100;
        if(d===4)v-=0.1;
        if(v>best){best=v;action=d;}
      }
      return names[action];
    }
    // Assign pressure to uncovered runners, retaining close and vulnerable targets.
    let target=live[0], rank=Infinity;
    for(const r of live) {
      const rp=pos(r), d=dist(p,rp,true);
      let closer=0;
      for(const g of pursuers) if(g.id!==a.id && dist(pos(g),rp,true)<d-1) closer++;
      const v=d+closer*5+Math.min(12,r.invulnerableTicksLeft)*0.8;
      if(v<rank){rank=v;target=r;}
    }
    const rp=pos(target), mates=pursuers.filter(g=>g.id!==a.id && dist(pos(g),rp,true)<22).map(pos);
    const nearestMate=mates.reduce((v,q)=>Math.min(v,dist(q,rp,true)),INF);
    // An off-angle intercept goal breaks equal-speed tail chasing.
    let projection=rp, previous=-1;
    const heading=names.indexOf(target.dir);
    for(let k=0;k<Math.min(7,Math.max(2,dist(p,rp,true)-nearestMate+2));k++) {
      const choices=R[projection].filter(e=>e[0]!==previous);
      if(!choices.length)break;
      let chosen=choices.find(e=>e[1]===heading);
      if(!chosen) {
        let best=-Infinity;
        for(const e of choices) {
          let safety=dist(p,e[0],true);
          for(const q of mates)safety=Math.min(safety,dist(q,e[0],true));
          const c=s.grid[(e[0]/W)|0][e[0]%W];
          const v=safety+(c==='.'?0.7:c==='o'?3:0);
          if(v>best){best=v;chosen=e;}
        }
      }
      previous=projection;projection=chosen[0];
    }
    const ownDistance=dist(p,rp,true);
    const offAngle=nearestMate+2<ownDistance || pursuers.some(g=>g.id<a.id && dist(pos(g),rp,true)<=ownDistance+1);
    let nodes=0;
    function evaluate(r,g,ms,t) {
      let ds=[dist(g,r,true)];
      for(const q of ms)ds.push(dist(q,r,true));
      ds.sort((x,y)=>x-y);
      let v=ds[0]*3.2+Math.min(ds[1]||20,20)*0.7+dist(g,r,true)*0.6;
      for(const z of power) {
        const d=dist(r,z);
        if(d<7)v+=(7-d)*1.7;
      }
      let escapes=0;
      for(const [q] of R[r]) if(Math.min(dist(g,q,true),...ms.map(m=>dist(m,q,true)))>1)escapes++;
      v+=escapes*0.7;
      for(const q of ms)if(q===g)v+=2.4;
      return v;
    }
    function teammateStep(ms,r,g) {
      return ms.map((m,i)=>{
        let best=Infinity, chosen=m;
        for(const [q] of G[m]) {
          let v=dist(q,r,true);
          if(q===g)v+=0.6;
          for(let j=0;j<i;j++)if(q===ms[j])v+=0.25;
          if(v<best){best=v;chosen=q;}
        }
        return chosen;
      });
    }
    function search(r,g,ms,t,depth,alpha,beta) {
      if(!depth || ++nodes>10000) return evaluate(r,g,ms,t);
      const nextMs=teammateStep(ms,r,g);
      let result=Infinity;
      const gm=G[g].concat([[g,4]]).slice().sort((x,y)=>dist(x[0],r,true)-dist(y[0],r,true));
      for(const [ng] of gm) {
        let worst=-Infinity;
        const rm=R[r].concat([[r,4]]);
        for(const [nr] of rm) {
          let caught=nr===ng || (nr===g && ng===r);
          for(let i=0;i<ms.length;i++)if(nr===nextMs[i]||(nr===ms[i]&&nextMs[i]===r))caught=true;
          const newPower=power.includes(nr);
          const protectedNow=target.invulnerableTicksLeft>t;
          let v;
          if(caught&&!newPower&&!protectedNow)v=-160+5*t;
          else if(newPower)v=90+evaluate(nr,ng,nextMs,t);
          else v=search(nr,ng,nextMs,t+1,depth-1,alpha,Math.min(beta,result));
          worst=Math.max(worst,v);
          if(worst>=Math.min(beta,result))break;
        }
        result=Math.min(result,worst);
        if(result<=alpha)break;
      }
      return result;
    }
    let best=Infinity, action=4;
    const ms=teammateStep(mates,rp,p);
    for(const [q,d] of opts) {
      let worst=-Infinity;
      for(const [nr] of R[rp].concat([[rp,4]])) {
        let caught=nr===q || (nr===p && q===rp);
        for(let i=0;i<mates.length;i++)if(nr===ms[i]||(nr===mates[i]&&ms[i]===rp))caught=true;
        let v;
        if(caught&&!power.includes(nr)&&target.invulnerableTicksLeft<=1)v=-155;
        else if(power.includes(nr))v=90+evaluate(nr,q,ms,1);
        else v=search(nr,q,ms,2,2,-Infinity,Infinity);
        worst=Math.max(worst,v);
      }
      let v=worst+(offAngle?dist(q,projection,true)*2.4:dist(q,rp,true)*0.06);
      if(d===4)v+=0.12;
      if(d===names.indexOf(a.dir))v-=0.025;
      // Avoid immediate power-pellet ambushes by any runner, not just the target.
      for(const r of live)for(const z of power)if(dist(pos(r),z)<=1 && dist(q,z,true)<=1)v+=30;
      if(v<best){best=v;action=d;}
    }
    return names[action];
  }
  return {name:'Ariadne', move(s) {
    setup(s);
    if(!s.you.alive || s.you.respawnIn) return 'stay';
    return s.you.role==='runner' ? runner(s) : ghost(s);
  }};
})();
