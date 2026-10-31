'use strict';
module.exports = {
  name: 'Iceman',
  move(state) {
    const you = state.you;
    if (!you.alive || you.respawnIn) return 'stay';
    const width = state.width, height = state.height, grid = state.grid, tunnelRow = state.tunnelRow;
    const dirs = MazeEngine.DIRS;
    const dirList = ['up','right','down','left'];
    const key = (x,y)=>y*width+x;
    const rev = {up:'down',down:'up',left:'right',right:'left',stay:'stay'};
    function getLegal(x,y,role,fromCell){
      const moves=[];
      for(let i=0;i<dirList.length;i++){
        const d=dirList[i];
        let nx=x+dirs[d][0], ny=y+dirs[d][1];
        if(y===tunnelRow) nx=(nx+width)%width;
        if(ny<0||ny>=height) continue;
        const cell=grid[ny][nx];
        if(!cell||cell==='#') continue;
        if(role==='runner'){
          if(cell==='G'||cell==='-') continue;
          moves.push({x:nx,y:ny,dir:d,cell});
        }else if(role==='ghost'){
          if(fromCell==='G' && cell!=='G' && cell!=='-') continue;
          if(cell==='G' && fromCell!=='G' && fromCell!=='-') continue;
          if(you.inPen && you.releaseIn>1 && cell!=='G') continue;
          moves.push({x:nx,y:ny,dir:d,cell});
        }
      }
      return moves;
    }
    function bfs(sources,role){
      const dist=new Map(), q=[], head=0;
      for(let i=0;i<sources.length;i++){const s=sources[i];const k=key(s.x,s.y);if(!dist.has(k)){dist.set(k,0);q.push({x:s.x,y:s.y});}}
      while(head<q.length){const cur=q[head++];const dcur=dist.get(key(cur.x,cur.y));const moves=getLegal(cur.x,cur.y,role,grid[cur.y][cur.x]);for(let i=0;i<moves.length;i++){const m=moves[i];const mk=key(m.x,m.y);if(dist.has(mk))continue;dist.set(mk,dcur+1);q.push({x:m.x,y:m.y});}}
      return dist;
    }
    const legal=getLegal(you.x,you.y,you.role,grid[you.y][you.x]);
    if(legal.length===0)return 'stay';
    if(you.role==='ghost'){
      const doors=[];for(let y=0;y<height;y++){const row=grid[y];for(let x=0;x<width;x++){if(row[x]==='-')doors.push({x,y});}}
      const live=state.runners.filter(r=>r.alive&&!r.respawnIn);
      if(live.length===0)return legal[Math.floor(Math.random()*legal.length)].dir;
      if(you.inPen){
        if(doors.length){const dd=bfs(doors,'ghost');legal.sort((a,b)=>{const da=dd.get(key(a.x,a.y));const db=dd.get(key(b.x,b.y));if(da===undefined)return 1;if(db===undefined)return -1;return da-db;});return legal[0].dir;}
      }else{
        if(you.frightened){
          const rd=bfs(live,'ghost');legal.sort((a,b)=>{const da=rd.get(key(a.x,a.y));const db=rd.get(key(b.x,b.y));if(da===undefined)return 1;if(db===undefined)return -1;return db-da;});
          return legal[0].dir;
        }else{
          const gi=state.ghosts.findIndex(g=>g.id===you.id);
          const fy=bfs([you],'ghost');
          const ord=live.slice().sort((a,b)=>{const da=fy.get(key(a.x,a.y));const db=fy.get(key(b.x,b.y));if(da===undefined)return 1;if(db===undefined)return -1;return da-db;});
          let tgt=ord[gi%ord.length]||ord[0];
          if(tgt&&tgt.dir&&tgt.dir!=='stay'){let px=tgt.x,py=tgt.y;for(let s=0;s<4;s++){const tn=getLegal(px,py,'runner',grid[py][px]);const f=tn.find(m=>m.dir===tgt.dir);if(!f)break;px=f.x;py=f.y;}tgt={x:px,y:py};}
          const td=bfs([tgt],'ghost');
          legal.sort((a,b)=>{const da=td.get(key(a.x,a.y));const db=td.get(key(b.x,b.y));if(da===undefined)return 1;if(db===undefined)return -1;return da-db;});
          const nr=legal.filter(m=>m.dir!==rev[you.dir]);
          if(nr.length){nr.sort((a,b)=>{const da=td.get(key(a.x,a.y));const db=td.get(key(b.x,b.y));if(da===undefined)return 1;if(db===undefined)return -1;return da-db;});return nr[0].dir;}
          return legal[0].dir;
        }
      }
      return legal[0].dir;
    }else if(you.role==='runner'){
      const threats=state.ghosts.filter(g=>!g.inPen&&!g.frightened&&g.alive);
      const frightened=state.ghosts.filter(g=>!g.inPen&&g.frightened&&!g.frightImmune);
      const thd=bfs(threats,'ghost');
      const fd=bfs(frightened,'ghost');
      const pellets=[];for(let y=0;y<height;y++){const row=grid[y];for(let x=0;x<width;x++){const c=row[x];if(c==='.')pellets.push({x,y,power:false});else if(c==='o')pellets.push({x,y,power:true});}}
      if(frightened.length&&state.frightTicksLeft>0){for(let i=0;i<legal.length;i++){const m=legal[i];const fdd=fd.get(key(m.x,m.y));const tdd=thd.get(key(m.x,m.y));if(fdd!==undefined&&fdd<=1){if(tdd===undefined||tdd>fdd+1)return m.dir;}}}
      const scored=[];
      for(let i=0;i<legal.length;i++){const m=legal[i];let score=0;const tdd=thd.get(key(m.x,m.y));const safe=tdd===undefined?1000:tdd;if(safe<=1&&!you.invulnerable){scored.push({dir:m.dir,score:-20000});continue;}else if(safe<=2&&!you.invulnerable)score-=800;else if(safe<=3&&!you.invulnerable)score-=200;else if(safe<=4&&!you.invulnerable)score-=50;
        if(frightened.length&&state.frightTicksLeft>0){const fdd=fd.get(key(m.x,m.y));if(fdd!==undefined&&fdd<12&&state.frightTicksLeft>fdd+2)score+=70-fdd*4;}
        const c2=grid[m.y][m.x];if(c2==='o'){if(threats.length&&safe<10)score+=60;else score+=12;}else if(c2==='.'){score+=14;}
        if(pellets.length){const pd=bfs(pellets,'runner');const pdd=pd.get(key(m.x,m.y));if(pdd!==undefined){score+=Math.max(0,30-pdd*0.7);if(pdd<4)score+=10;}}
        if(m.dir===rev[you.dir]){if(safe<=5&&!you.invulnerable)score-=30;else score-=4;}else score+=3;if(m.dir!=='stay')score+=1;scored.push({dir:m.dir,score});}
      scored.sort((a,b)=>b.score-a.score);
      if(scored.length&&scored[0].score<-15000){const esc=legal.filter(m=>{const tdd=thd.get(key(m.x,m.y));return tdd===undefined||tdd>4;});if(esc.length){esc.sort((a,b)=>{const ta=thd.get(key(a.x,a.y))||10000;const tb=thd.get(key(b.x,b.y))||10000;return tb-ta;});return esc[0].dir;}}
      return scored[0].dir;
    }
    return legal[0].dir;
  }
};