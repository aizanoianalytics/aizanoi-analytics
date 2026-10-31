'use strict';

module.exports = function move(state) {
  try {
    const you = state.you;
    if (!you || !you.head || !Array.isArray(you.body)) return 'up';
    const W = state.width, H = state.height;
    const dirs = [{n:'up',x:0,y:-1},{n:'right',x:1,y:0},{n:'down',x:0,y:1},{n:'left',x:-1,y:0}];
    const key = (x,y) => x+','+y;
    const food = new Set((state.food||[]).map(p=>key(p.x,p.y)));
    const hazard = new Set((state.hazards||[]).map(p=>key(p.x,p.y)));
    const snakes = state.snakes||[you];
    const ownId = you.id;
    const occ = new Set();
    for (const s of snakes) {
      const body = s.body || [];
      // Tails normally vacate; retain if that snake is about to eat.
      const willEat = food.has(key(s.head.x,s.head.y));
      for (let i=0;i<body.length;i++) {
        if (i===body.length-1 && !willEat) continue;
        if (i===0) continue;
        occ.add(key(body[i].x,body[i].y));
      }
    }
    const inBounds=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
    const safe=(x,y)=>inBounds(x,y)&&!hazard.has(key(x,y))&&!occ.has(key(x,y));
    const head=you.head;
    let best='up', bestScore=-Infinity;
    for (const d of dirs) {
      const x=head.x+d.x,y=head.y+d.y,k=key(x,y), eats=food.has(k);
      if (!safe(x,y)) continue;
      let score=0;
      // Immediate collision risk from adjacent enemy heads; longer snake can win head-on.
      for (const s of snakes) if (s.id!==ownId) {
        const dist=Math.abs(s.head.x-x)+Math.abs(s.head.y-y);
        if (dist===1) score -= s.length>=you.length+(eats?1:0) ? 180 : 24;
      }
      // Flood fill reachable safe area, with tail movement approximated as open.
      const seen=new Set([k]), q=[[x,y]];
      for(let qi=0;qi<q.length&&qi< W*H;qi++) {
        const [cx,cy]=q[qi];
        for(const a of dirs){const nx=cx+a.x,ny=cy+a.y,nk=key(nx,ny);if(!seen.has(nk)&&safe(nx,ny)){seen.add(nk);q.push([nx,ny]);}}
      }
      const area=seen.size;
      score += Math.min(area, you.length+8)*2.2 + Math.min(area, W*H)*0.45;
      if(area < you.length+(eats?1:0)) score-=120;
      if(eats) score+= you.health<55?80:24;
      // Prefer food by BFS distance, with urgency from health.
      let foodDist=Infinity;
      if(food.size){const dist=new Map([[k,0]]), q2=[[x,y]];for(let qi=0;qi<q2.length;qi++){const [cx,cy]=q2[qi],dd=dist.get(key(cx,cy));if(food.has(key(cx,cy))){foodDist=dd;break;}for(const a of dirs){const nx=cx+a.x,ny=cy+a.y,nk=key(nx,ny);if(safe(nx,ny)&&!dist.has(nk)){dist.set(nk,dd+1);q2.push([nx,ny]);}}}}
      if(foodDist<Infinity) score += Math.max(0, 32-foodDist*2)*(you.health<45?2.0:0.65);
      if(you.health<Math.min(40,foodDist+2)) score-=foodDist*2;
      // Avoid being trapped against storm edge; anticipate next ring.
      if(state.nextShrinkTurn-state.turn<=4 && state.turn>=130){const ring=(state.hazards||[]).length?Math.min(...(state.hazards||[]).map(p=>p.x)):0; if(ring===0){const margin=Math.min(x,y,W-1-x,H-1-y);score+=margin*1.5;}}
      // Small center bias early, negligible late.
      score -= (Math.abs(x-(W-1)/2)+Math.abs(y-(H-1)/2))*0.22;
      if(score>bestScore){bestScore=score;best=d.n;}
    }
    return best;
  } catch (_) { return 'up'; }
};
