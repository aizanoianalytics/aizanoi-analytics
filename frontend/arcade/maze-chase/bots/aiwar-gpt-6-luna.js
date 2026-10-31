'use strict';
module.exports = {name:'Ariadne', move:function(s){
 const a=s.you,w=s.width,h=s.height,g=s.grid, dirs=['up','right','down','left'];
 const key=(x,y)=>y*w+x, pos=k=>({x:k%w,y:(k/w)|0});
 function next(x,y,d,role,pen,release){let dx=d==='left'?-1:d==='right'?1:0,dy=d==='up'?-1:d==='down'?1:0;let nx=x+dx,ny=y+dy;if(y===s.tunnelRow&&dy===0)nx=(nx+w)%w;if(ny<0||ny>=h||nx<0||nx>=w)return null;let c=g[ny][nx],f=g[y][x];if(c==='#')return null;if(role==='runner'&&(c==='G'||c==='-'))return null;if(role==='ghost'){if(f==='G'&&c!=='G'&&c!=='-')return null;if((c==='G'||c==='-')&&f!=='G'&&f!=='-')return null;if(pen&&release>1&&c!=='G')return null;}return {x:nx,y:ny,dir:d,k:key(nx,ny)};}
 function adj(x,y,role,pen,release){return dirs.map(d=>next(x,y,d,role,pen,release)).filter(Boolean)}
 function bfs(sources,role){let dist=new Int16Array(w*h);dist.fill(30000);let q=[];for(const p of sources)if(p&&p.x>=0&&p.x<w&&dist[key(p.x,p.y)]===30000){dist[key(p.x,p.y)]=0;q.push(key(p.x,p.y));}for(let i=0;i<q.length;i++){let u=q[i],p=pos(u);for(const n of adj(p.x,p.y,role,false,0))if(dist[n.k]===30000){dist[n.k]=dist[u]+1;q.push(n.k)}}return dist;}
 let legal=adj(a.x,a.y,a.role,a.inPen,a.releaseIn);if(!legal.length)return 'stay';let nt=s.tick+1;
 if(a.role==='runner'){
   if(a.respawnIn)return 'stay';
   const hazards=s.ghosts.filter(z=>!z.inPen&&!z.frightened), edibles=s.ghosts.filter(z=>!z.inPen&&z.frightened);
   const danger=bfs(hazards,'ghost'), edible=bfs(edibles,'ghost');
   let pellets=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(g[y][x]==='.'||g[y][x]==='o')pellets.push({x,y,p:g[y][x]==='o'});
   const live=s.runners.filter(r=>r.alive&&!r.respawnIn);
   let best=legal[0],bs=-1e20;
   for(const n of legal){let dmap=bfs([n],'runner'), safety=danger[n.k], score=0;
     for(const t of pellets){let d=dmap[key(t.x,t.y)];if(d>=30000)continue;let others=live.filter(r=>r.id!==a.id).reduce((m,r)=>Math.min(m,Math.abs(r.x-t.x)+Math.abs(r.y-t.y)),999);let v=t.p? (s.frightTicksLeft>5?18:32):10;let gain=v/(d+1);if(others<d+2)gain*=.25;score=Math.max(score,gain);}
     if(!a.invulnerable&&hazards.length){if(safety<=1)score-=2000;else if(safety<=3)score-=80/(safety);else score-=5/(safety+1);}
     if(edibles.length&&s.frightTicksLeft>1){let e=edible[n.k];if(e< s.frightTicksLeft-2)score+=Math.min(20,s.nextGhostPoints/40)/(e+1);}
     if(g[n.y][n.x]==='o'&&hazards.length)score+=18;
     if(n.dir===a.dir)score+=.025;
     if(score>bs){bs=score;best=n;}
   }return best.dir;
 }
 if(a.frightened&&!a.inPen&&nt%2)return 'stay';
 if(a.inPen){const door=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(g[y][x]==='-')door.push({x,y});let dm=bfs(door,'ghost');return legal.sort((u,v)=>dm[u.k]-dm[v.k])[0].dir;}
 let runners=s.runners.filter(r=>r.alive&&!r.respawnIn);if(!runners.length)return legal[0].dir;
 if(a.frightened){let dm=bfs(runners,'runner');return legal.sort((u,v)=>dm[v.k]-dm[u.k])[0].dir;}
 let best=legal[0],bs=1e20;
 for(const r of runners){let predicted={x:r.x,y:r.y};for(let i=0;i<3;i++){let q=next(predicted.x,predicted.y,r.dir,'runner',false,0);if(!q)break;predicted=q;}let dm=bfs([predicted],'ghost');for(const n of legal){let val=dm[n.k];if(val<bs){bs=val;best=n;}}}
 return best.dir;
}};
