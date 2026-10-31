'use strict';

// Aegis: coordinated interception and risk-aware flag raids.
module.exports = {
  name: 'Aegis',
  move: (function () {
    let cache = null;
    const names = ['stay', 'up', 'down', 'left', 'right'];
    const dx = [0, 0, 0, -1, 1], dy = [0, -1, 1, 0, 0];
    const active = a => !a.jailed && a.respawnIn === 0 && a.x !== null && a.y !== null;
    function graph(s) {
      const signature = s.width + ':' + s.height + ':' + s.grid.join('');
      if (cache && cache.signature === signature) return cache;
      const w = s.width, h = s.height, n = w * h;
      const adj = Array.from({length:n}, () => []);
      const xs = new Int16Array(n), ys = new Int16Array(n);
      for (let p = 0; p < n; p++) {
        const x = p % w, y = (p / w) | 0; xs[p] = x; ys[p] = y;
        if (s.grid[y][x] === '#') continue;
        for (let a = 0; a < 5; a++) {
          const xx = x + dx[a], yy = y + dy[a];
          if (xx >= 0 && xx < w && yy >= 0 && yy < h && s.grid[yy][xx] !== '#') adj[p].push([yy*w+xx, a]);
        }
      }
      cache = {signature, w, h, n, adj, xs, ys};
      return cache;
    }
    function bfs(g, starts, allowed) {
      const d = new Int32Array(g.n); d.fill(1000000);
      const q = new Int32Array(g.n); let head = 0, tail = 0;
      for (const p of starts) if (d[p] && (!allowed || allowed(p))) { d[p] = 0; q[tail++] = p; }
      while (head < tail) {
        const p = q[head++], dd = d[p] + 1;
        for (const edge of g.adj[p]) {
          const v = edge[0];
          if (d[v] > dd && (!allowed || allowed(v))) { d[v] = dd; q[tail++] = v; }
        }
      }
      return d;
    }
    function push(h, p, c) {
      let i = h.length; h.push([p,c]);
      while (i) { const j=(i-1)>>>1; if(h[j][1]<=c)break; h[i]=h[j];i=j; } h[i]=[p,c];
    }
    function pop(h) {
      const a=h[0], b=h.pop(); if(!h.length)return a;
      let i=0; while(2*i+1<h.length){let j=2*i+1;if(j+1<h.length&&h[j+1][1]<h[j][1])j++;if(h[j][1]>=b[1])break;h[i]=h[j];i=j;}h[i]=b;return a;
    }
    return function move(s) {
      const me = s.you;
      if (!active(me)) return 'stay';
      const g = graph(s), w = g.w, n = g.n;
      const pos = a => a.y*w+a.x;
      // Huge fields cannot afford full threat mapping inside the deadline;
      // fall back to shortest-path racing plus one-step tag replies.
      const lean=n>4096;
      const home = p => s.team === 'west' ? g.xs[p] < s.border : g.xs[p] > s.border;
      const hostile = p => s.team === 'west' ? g.xs[p] > s.border : g.xs[p] < s.border;
      const md = (p,q) => Math.abs(g.xs[p]-g.xs[q])+Math.abs(g.ys[p]-g.ys[q]);
      const other = s.team === 'west' ? 'east' : 'west';
      const friends = [me].concat(s.teammates).sort((a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
      const live = friends.filter(active), enemies = s.enemies.filter(active);
      const p0=pos(me), ownStand=pos(s.flags[s.team].home), flag=pos(s.flags[other].home);
      const exits=[]; for(let p=0;p<n;p++)if(g.adj[p].length&&home(p))exits.push(p);
      const staticKey=s.team+':'+flag+':'+ownStand;
      if(g.staticKey!==staticKey){
        const hostileCells=[];for(let p=0;p<n;p++)if(hostile(p)&&g.adj[p].length)hostileCells.push(p);
        g.staticKey=staticKey;g.escape=bfs(g,exits);g.toFlag=bfs(g,[flag]);g.toHome=bfs(g,[ownStand]);g.enemyEscape=bfs(g,hostileCells);
      }
      const escape=g.escape, toFlag=g.toFlag, toHome=g.toHome;
      const allyD = new Map(); for(const a of live)allyD.set(a.id,bfs(g,[pos(a)]));
      const ed=enemies.map(a=>({a,p:pos(a),d:lean?null:bfs(g,[pos(a)])}));
      const nearest=new Int32Array(n);nearest.fill(1000000);
      const tagsUs=friends.reduce((v,a)=>v+a.tags,0),tagsThem=s.enemies.reduce((v,a)=>v+a.tags,0);
      const ahead=s.score[s.team]>s.score[other]||(s.score[s.team]===s.score[other]&&tagsUs>tagsThem);
      const behind=s.score[s.team]<s.score[other]||(s.score[s.team]===s.score[other]&&tagsUs<tagsThem);
      // Allocate distinct defenders to credible threats, using path interception.
      const assignments=new Map(), available=live.filter(a=>!a.carrying && !hostile(pos(a)));
      const solo=live.length<=1;
      const threats=ed.filter(e=>e.a.carrying||(!solo&&!hostile(e.p))).sort((a,b)=>Number(b.a.carrying)-Number(a.a.carrying)||toHome[a.p]-toHome[b.p]);
      for(const e of threats){
        let best=null;
        const enemyGoal=e.a.carrying ? g.enemyEscape : toHome;
        // Predict the shortest route; defenders aim ahead, not at a fleeing tail.
        let route=[e.p], cur=e.p;
        for(let t=0;t<Math.min(w+g.h,100);t++){
          let next=cur;for(const edge of g.adj[cur])if(enemyGoal[edge[0]]<enemyGoal[next])next=edge[0];
          if(next===cur)break;route.push(next);cur=next;
        }
        for(const a of available){
          if(assignments.has(a.id))continue;
          const d=allyD.get(a.id);let target=-1,intercept=1000000;
          for(let t=0;t<route.length;t++){
            const r=route[t];if(!home(r))continue;
            for(const edge of g.adj[r]){const q=edge[0];if(home(q)&&d[q]<=t+1&&t<intercept){target=q;intercept=t;}}
          }
          if(target<0){target=ownStand;intercept=d[e.p]+10;}
          const cost=intercept+0.05*d[target]+(hostile(pos(a))?50:0);
          if(!best||cost<best.cost)best={a,target,cost,e};
        }
        if(best)assignments.set(best.a.id,best);
      }
      // Keep one sentinel while an opponent is active. Move it upfield when safe.
      if(!solo&&!assignments.size&&enemies.length&&available.length){
        let guard=available[0];
        for(const a of available)if(allyD.get(a.id)[ownStand]<allyD.get(guard.id)[ownStand])guard=a;
        const approaching=ed.slice().sort((a,b)=>toHome[a.p]-toHome[b.p])[0];
        let target=ownStand;
        if(approaching){
          // Meet the attacker from the goal side, without surrendering the flag.
          let r=approaching.p;
          for(let t=0;t<w+g.h;t++){
            if(home(r)&&allyD.get(guard.id)[r]<=t+1){target=r;break;}
            let next=r;for(const edge of g.adj[r])if(toHome[edge[0]]<toHome[next])next=edge[0];
            if(next===r)break;r=next;
          }
        }
        assignments.set(guard.id,{a:guard,target,e:approaching});
      }
      let mode='raid', goals=[flag], targetEnemy=null;
      if(me.carrying){mode='escape';goals=exits;}
      else if(assignments.has(me.id)){
        const task=assignments.get(me.id); mode='defend';goals=[task.target];targetEnemy=task.e;
        // Do not give up a feasible capture during the opponents' jail window.
      } else {
        const jailed=s.teammates.filter(a=>a.jailed&&a.jailTicks<30);
        if(jailed.length){
          const rescue=[];for(let p=0;p<n;p++)if(g.adj[p].length&&s.zones[other].jail.some(j=>md(p,pos(j))<=1))rescue.push(p);
          const rd=bfs(g,rescue);
          const raiders=live.filter(a=>!a.carrying&&!assignments.has(a.id)).sort((a,b)=>rd[pos(a)]-rd[pos(b)]||(String(a.id)<String(b.id)?-1:1));
          if(raiders.length&&raiders[0].id===me.id && (rd[p0]<toFlag[p0]+5||jailed.length>=2)){mode='rescue';goals=rescue;}
        }
        // Space raiders along different lanes instead of forming one easy tag.
        if(s.flags[other].carrier!==null){mode='support';goals=exits.filter(p=>g.xs[p]===(s.team==='west'?s.border-1:s.border+1));}
      }
      // Earliest time a defender can threaten a square; tags cross walls.
      // A lone racer takes the shortest line: detours lose mirror races.
      const pureRace=lean||(solo&&!ed.some(e=>e.a.carrying));
      // Carriers race straight home and do not hunt; every other enemy may
      // still turn and defend, so only carriers leave the risk map.
      // Immediate adjacency stays covered by the all-enemy reply check.
      const defenders=ed.filter(e=>!e.a.carrying);
      if(mode!=='defend'&&!pureRace)for(const e of defenders) for(let p=0;p<n;p++)if(hostile(p)&&g.adj[p].length){
        let d=e.d[p]; const x=g.xs[p],y=g.ys[p];
        for(let k=1;k<5;k++){const xx=x+dx[k],yy=y+dy[k];if(xx>=0&&xx<w&&yy>=0&&yy<g.h){const q=yy*w+xx;if(hostile(q)&&g.adj[q].length)d=Math.min(d,e.d[q]);}}
        if(d<nearest[p])nearest[p]=d;
      }
      const distance=bfs(g,goals,mode==='defend'?p=>!hostile(p):null);
      const risk=new Float64Array(n);
      for(let p=0;p<n;p++)if(hostile(p)&&g.adj[p].length){
        const d=nearest[p];
        risk[p]=d<=1?75:d===2?22:d===3?9:d===4?4:d===5?1.7:d===6?0.6:0;
        if(mode==='escape')risk[p]*=1.2;
      }
      // Reverse weighted shortest paths give global, obstacle-aware routing.
      const cost=(lean||mode==='defend'||!ed.length||pureRace)?distance:new Float64Array(n);
      const heap=[];
      if(cost!==distance){
        cost.fill(Infinity);
        for(const p of goals)if(g.adj[p].length){cost[p]=0;push(heap,p,0);}
        while(heap.length){const [p,c]=pop(heap);if(c!==cost[p])continue;
          for(const edge of g.adj[p]){const q=edge[0];if(q===p)continue;
            const nc=c+1+risk[p];if(nc<cost[q]){cost[q]=nc;push(heap,q,nc);}
          }
        }
      }
      let bestAction='stay',bestScore=-Infinity;
      const myDistances=allyD.get(me.id);
      for(const [p,action] of g.adj[p0]){
        if(mode==='defend'&&hostile(p))continue;
        let score=-cost[p]-risk[p]-(action===0?0.16:0);
        if(!Number.isFinite(score))score=-distance[p];
        // All possible enemy replies, not just their last observed heading.
        let death=0,predictedTags=0,guaranteedTags=0;
        for(const e of ed){
          let bad=0,total=0,tag=0;
          for(const [q] of g.adj[e.p]){
            total++;
            if(hostile(p)&&hostile(q)&&(md(p,q)<=1||(p===e.p&&q===p0)))bad++;
            if(home(p)&&home(q)&&(md(p,q)<=1||(p===e.p&&q===p0)))tag++;
          }
          if(bad)death=Math.max(death,0.6+0.4*bad/total);
          if(tag===total)guaranteedTags+=e.a.carrying?4:1;
          if(tag){
            const objective=e.a.carrying?escape:toHome;
            let min=Infinity,hit=0,cnt=0;
            for(const [q]of g.adj[e.p]){const v=e.a.carrying?-g.xs[q]*(s.team==='west'?1:-1):objective[q];if(v<min){min=v;cnt=0;hit=0;}if(v===min){cnt++;if(home(p)&&home(q)&&md(p,q)<=1)hit++;}}
            predictedTags+=(e.a.carrying?4:1)*(hit/Math.max(1,cnt));
          }
        }
        score-=death*(me.carrying?1600:1100);
        score+=guaranteedTags*180+predictedTags*28;
        if(!lean&&hostile(p)&&!death){
          // Reject moves into traps with no robust continuation for four steps.
          let frontier=[p],seen=new Uint8Array(n);seen[p]=1;let survived=0,escaped=false;
          for(let t=2;t<=5;t++){
            const next=[];
            for(const r of frontier)for(const [q]of g.adj[r]){
              if(!hostile(q)){escaped=true;break;}
              if(nearest[q]>t&&!seen[q]){seen[q]=1;next.push(q);}
            }
            if(escaped){survived=5;break;}if(!next.length)break;frontier=next;survived=t;
          }
          score-=(5-survived)*5;
          // Retain room to evade; one-cell pockets are costly even if unoccupied.
          score+=Math.min(4,g.adj[p].length)*0.18;
        }
        if(mode==='raid'&&live.length>1&&hostile(p)){
          for(const a of live)if(a.id!==me.id&&!a.carrying&&hostile(pos(a)))score-=Math.max(0,4-md(p,pos(a)))*0.65;
        }
        if(mode==='defend'&&targetEnemy){
          // Small preference for covering the stand over following a decoy.
          score-=0.025*toHome[p];
        }
        if(mode==='escape'&&home(p))score+=3000;
        if(mode==='rescue'&&goals.includes(p)&&!death)score+=80;
        if(mode==='raid'&&p===flag&&s.flags[other].carrier===null&&!death)score+=60;
        // Coordinate tie-breaking in mirrored terrain without random dithering.
        score+=0.0001*(s.team==='west'?g.xs[p]:-g.xs[p]);
        if(score>bestScore){bestScore=score;bestAction=names[action];}
      }
      return bestAction;
    };
  })()
};
