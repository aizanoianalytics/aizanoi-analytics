'use strict';

// Cartographer: shortest-path pursuit and threat-aware pellet collection.
module.exports = {
  name: 'Cartographer',
  move(s) {
    const w=s.width,h=s.height,n=w*h, me=s.you, tick=s.tick+1;
    const dirs=['up','right','down','left'], dx=[0,1,0,-1],dy=[-1,0,1,0];
    const cell=i=>s.grid[(i/w)|0][i%w];
    const pos=a=>a.y*w+a.x;
    const at=pos(me);
    const edges=(i,ghost)=>{
      let x=i%w,y=(i/w)|0, out=[];
      for(let k=0;k<4;k++){
        let xx=x+dx[k], yy=y+dy[k];
        if(y===s.tunnelRow) xx=(xx+w)%w;
        if(xx<0||xx>=w||yy<0||yy>=h) continue;
        let j=yy*w+xx,c=cell(j),f=cell(i);
        if(c==='#') continue;
        if(!ghost && (c==='G'||c==='-')) continue;
        if(ghost && ((f==='G'&&c!=='G'&&c!=='-')||(c==='G'&&f!=='G'&&f!=='-'))) continue;
        out.push([j,k]);
      }
      return out;
    };
    const bfs=(start,ghost)=>{
      const d=new Int32Array(n); d.fill(99999); d[start]=0;
      const q=new Int32Array(n); let head=0,tail=0;q[tail++]=start;
      while(head<tail){let p=q[head++]; for(const [v] of edges(p,ghost)) if(d[v]===99999){d[v]=d[p]+1;q[tail++]=v;}}
      return d;
    };
    const choices=edges(at,me.role==='ghost').filter(([p])=>!(me.role==='ghost'&&me.inPen&&me.releaseIn>1&&cell(p)!=='G'));
    if(!choices.length) return 'stay';
    if(me.role==='ghost'){
      if(me.frightened && s.frightTicksLeft>1 && tick%2) return 'stay';
      const targets=s.runners.filter(r=>r.alive&&!r.respawnIn);
      if(me.inPen){
        let doors=[]; for(let i=0;i<n;i++) if(cell(i)==='-') doors.push(i);
        if(!doors.length)return 'stay';
        let dist=bfs(doors[0],true), best=choices[0], value=-1e9;
        for(const c of choices){let v=-dist[c[0]]+(cell(c[0])==='-'?0.1:0);if(v>value){value=v;best=c;}}
        return dirs[best[1]];
      }
      if(!targets.length) return 'stay';
      const ds=targets.map(r=>bfs(pos(r),true));
      let best=choices[0],value=-1e9;
      for(const c of choices){
        let score=me.frightened&&s.frightTicksLeft>2 ? 1e9 : -1e9;
        for(let i=0;i<targets.length;i++){
          const r=targets[i],d=ds[i][c[0]];
          let v=me.frightened&&s.frightTicksLeft>2 ? Math.min(d,12)*3 : -d*3;
          if(!me.frightened && r.invulnerableTicksLeft>d) v-=20;
          if(!me.frightened && r.dir!=='stay'){
            let k=dirs.indexOf(r.dir); if(k>=0){let x=r.x+dx[k],y=r.y+dy[k];if(r.y===s.tunnelRow)x=(x+w)%w;if(x>=0&&x<w&&y>=0&&y<h&&c[0]===y*w+x)v+=2;}
          }
          score=me.frightened&&s.frightTicksLeft>2 ? Math.min(score,v) : Math.max(score,v);
        }
        if(c[1]===dirs.indexOf(me.dir))score+=0.08;
        if(score>value){value=score;best=c;}
      }
      return dirs[best[1]];
    }
    const ghosts=s.ghosts.filter(g=>!g.inPen);
    const gd=ghosts.map(g=>bfs(pos(g),false));
    const other=s.runners.filter(r=>r.id!==me.id&&r.alive&&!r.respawnIn).map(r=>bfs(pos(r),false));
    let best=choices[0],bestScore=-1e20;
    for(const c of choices){
      const p=c[0], dist=bfs(p,false), power=cell(p)==='o';
      let risk=0;
      for(let i=0;i<ghosts.length;i++){
        let g=ghosts[i],d=gd[i][p];
        if(power||me.invulnerableTicksLeft>1)continue;
        if(g.frightened&&s.frightTicksLeft>2) continue;
        if(d<=1)risk+=10000;
        else if(d===2)risk+=180;
        else if(d===3)risk+=45;
        else if(d===4)risk+=12;
      }
      let nearest=99999,utility=0;
      for(let j=0;j<n;j++){
        let ch=cell(j),d=dist[j];if((ch!=='.'&&ch!=='o')||d>=99999)continue;
        let contest=1;
        for(const od of other)if(od[j]+1<d){contest=0.35;break;}
        const v=ch==='o'? (ghosts.some((g,i)=>!g.frightened&&gd[i][p]<6)?2.5:0.55):1;
        utility+=contest*v/(1+d*d*0.7);
        if(contest>0.5 && d<nearest)nearest=d;
      }
      let score=utility*12-Math.min(nearest,100)*0.8-risk;
      if(cell(p)==='.')score+=10;
      if(power){let danger=ghosts.some((g,i)=>!g.frightened&&gd[i][p]<6);score+=danger?35:2;}
      if(c[1]===dirs.indexOf(me.dir))score+=0.15;
      if(score>bestScore){bestScore=score;best=c;}
    }
    return dirs[best[1]];
  }
};
