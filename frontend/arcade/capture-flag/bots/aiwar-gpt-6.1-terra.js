'use strict';
module.exports = {
  name: 'Aegis',
  move(s) {
    const me=s.you, W=s.width, H=s.height, B=s.border, west=s.team==='west';
    if(me.jailed || me.respawnIn || me.x===null || me.y===null) return 'stay';
    const dirs=[[0,-1,'up'],[1,0,'right'],[0,1,'down'],[-1,0,'left'],[0,0,'stay']];
    const N=W*H, idx=(x,y)=>y*W+x, open=(x,y)=>x>=0&&x<W&&y>=0&&y<H&&s.grid[y][x]==='.';
    const own=x=>west?x<B:x>B, hostile=x=>west?x>B:x<B;
    const active=a=>!a.jailed && a.respawnIn===0 && a.x!==null && a.y!==null;
    const enemies=s.enemies.filter(active), friends=[me].concat(s.teammates.filter(active));
    const enemyTeam=west?'east':'west', flag=s.flags[enemyTeam];
    function bfs(goals, restricted) {
      const dist=new Int32Array(N); dist.fill(-1); const q=new Int32Array(N); let h=0,t=0;
      for(const p of goals) if(open(p.x,p.y) && (!restricted || restricted(p.x,p.y))) {let k=idx(p.x,p.y); if(dist[k]<0){dist[k]=0;q[t++]=k;}}
      while(h<t){const k=q[h++],x=k%W,y=(k/W)|0; for(let j=0;j<4;j++){const nx=x+dirs[j][0],ny=y+dirs[j][1];if(open(nx,ny)&&(!restricted||restricted(nx,ny))){const nk=idx(nx,ny);if(dist[nk]<0){dist[nk]=dist[k]+1;q[t++]=nk;}}}}
      return dist;
    }
    const prisoners=s.teammates.filter(a=>a.jailed);
    const intruders=enemies.filter(a=>own(a.x));
    let target=[], role='attack';
    if(me.carrying) {
      role='escape';
      const x=west?B-1:B+1; for(let y=0;y<H;y++) if(open(x,y)) target.push({x,y});
    } else {
      let chosen=null, chosenScore=1e9;
      for(const e of intruders){
        const d=bfs([{x:e.x,y:e.y}],(x)=>own(x));
        const md=d[idx(me.x,me.y)]; if(md<0) continue;
        let rank=0; for(const f of friends) if(f.id!==me.id){const fd=d[idx(f.x,f.y)];if(fd>=0 && (fd<md || (fd===md && String(f.id)<String(me.id)))) rank++;}
        const threat=e.carrying?0:Math.abs(e.x-s.flags[s.team].home.x)+Math.abs(e.y-s.flags[s.team].home.y);
        if(rank===0 && md<=Math.max(8, 16-threat/2) && md+threat*.3<chosenScore){chosen=e;chosenScore=md+threat*.3;}
      }
      if(chosen){role='defend';target=[{x:chosen.x,y:chosen.y}];}
      else if(prisoners.length){
        const rescue=[];for(const c of s.zones[enemyTeam].jail) for(const d of dirs){let x=c.x+d[0],y=c.y+d[1];if(open(x,y)) rescue.push({x,y});}
        const rd=bfs(rescue), mine=rd[idx(me.x,me.y)]; let nearest=true;
        for(const f of friends) if(f.id!==me.id){const fd=rd[idx(f.x,f.y)];if(fd>=0&&(fd<mine||(fd===mine&&String(f.id)<String(me.id))))nearest=false;}
        const remaining=Math.max(...prisoners.map(a=>40-a.jailTicks));
        if(nearest&&mine>=0&&mine<remaining+5&&(prisoners.length>1||mine<20)){role='rescue';target=rescue;}
      }
      if(!target.length && friends.length>1 && !me.carrying) {
        const all=[me].concat(s.teammates).sort((a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
        if(all[0].id===me.id){
          role='patrol';
          const home=s.flags[s.team].home, x=west?Math.min(B-1,home.x+4):Math.max(B+1,home.x-4);
          for(let y=Math.max(0,home.y-2);y<=Math.min(H-1,home.y+2);y++) if(open(x,y))target.push({x,y});
          if(!target.length)target=[home];
        }
      }
      if(!target.length){
        if(flag.carrier!==null){
          role='support'; const x=west?B-1:B+1; for(let y=0;y<H;y++) if(open(x,y))target.push({x,y});
        } else target=[flag.home];
      }
    }
    const dist=bfs(target, role==='defend' ? x=>own(x) : null);
    const risk=new Float32Array(N);
    if(role!=='defend') for(const e of enemies){
      const positions=[];for(const d of dirs){const x=e.x+d[0],y=e.y+d[1]; if(open(x,y)&&hostile(x))positions.push([x,y]);}
      for(const p of positions) for(let dy=-3;dy<=3;dy++) for(let dx=-3;dx<=3;dx++){
        const man=Math.abs(dx)+Math.abs(dy); if(man>3)continue;const x=p[0]+dx,y=p[1]+dy;if(!open(x,y)||!hostile(x))continue;
        const k=idx(x,y), r=man<=1?1:man===2?.12:.025; if(r>risk[k])risk[k]=r;
      }
    }
    let best='stay', bestVal=Infinity;
    for(let j=0;j<dirs.length;j++){
      const [dx,dy,name]=dirs[j], x=me.x+dx,y=me.y+dy;if(!open(x,y))continue;
      const k=idx(x,y); let d=dist[k];if(d<0)continue;
      let val=d + risk[k]*(role==='escape'?4:2);
      if(role==='defend'){
        let tag=false;for(const e of intruders) if(Math.abs(x-e.x)+Math.abs(y-e.y)<=1) tag=true;
        if(tag) val-=1.2;
      }
      if(name==='stay') val+=0.22;
      if(role==='attack') for(const f of friends) if(f.id!==me.id && f.x===x && f.y===y) val+=0.3;
      if(val<bestVal){bestVal=val;best=name;}
    }
    return best;
  }
};
