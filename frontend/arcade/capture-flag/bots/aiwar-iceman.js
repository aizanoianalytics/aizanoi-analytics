'use strict';

const DIRS = [
  ['up', 0, -1],
  ['down', 0, 1],
  ['left', -1, 0],
  ['right', 1, 0]
];

function dist(a,b){
  if(!a||!b||a.x==null||b.x==null) return 1000000;
  return Math.abs(a.x-b.x) + Math.abs(a.y-b.y);
}

function pushHeap(heap, item){
  let i = heap.length;
  heap.push(item);
  while(i > 0){
    let p = (i-1) >> 1;
    if(heap[p].cost <= item.cost) break;
    heap[i] = heap[p];
    i = p;
  }
  heap[i] = item;
}
function popHeap(heap){
  if(heap.length === 0) return null;
  let first = heap[0];
  let last = heap.pop();
  if(heap.length === 0) return first;
  let i = 0;
  while(i*2 + 1 < heap.length){
    let child = i*2 + 1;
    if(child+1 < heap.length && heap[child+1].cost < heap[child].cost) child++;
    if(last.cost <= heap[child].cost) break;
    heap[i] = heap[child];
    i = child;
  }
  heap[i] = last;
  return first;
}

module.exports = function move(state){
  const you = state.you;
  if(you.jailed || you.respawnIn > 0) return 'stay';
  
  const team = state.team;
  const enemyTeam = team === 'west' ? 'east' : 'west';
  const w = state.width, h = state.height;
  const grid = state.grid;
  const border = state.border;
  const ownHalf = x => team === 'west' ? x < border : x > border;
  const inEnemyHalf = x => team === 'west' ? x > border : x < border;
  
  const allies = [you, ...(state.teammates||[])];
  const enemies = state.enemies || [];
  const livingEnemies = enemies.filter(e=>!e.jailed && e.respawnIn === 0 && e.x != null);
  const enemiesInOurHalf = livingEnemies.filter(e=>ownHalf(e.x));
  const enemyAttackers = livingEnemies.filter(e=>!ownHalf(e.x) && e.x !== border);
  
  const enemyFlag = state.flags[enemyTeam];
  const enemyJail = state.zones[enemyTeam].jail;
  const myPrisoners = allies.filter(a=>a.jailed);
  
  const order = allies.slice().sort((a,b)=>{
    const sa=String(a.id), sb=String(b.id);
    if(sa<sb)return -1; if(sa>sb)return 1; return 0;
  });
  const isCaptain = order.length>0 && order[0].id === you.id;
  const isVice = order.length>1 && order[1].id === you.id;
  
  // A* with risk
  function astar(goalFn, riskFn){
    const size = w*h;
    const costArr = new Array(size).fill(Infinity);
    const firstMove = new Array(size).fill(null);
    const heap = [];
    const sk = you.y*w + you.x;
    costArr[sk] = 0;
    firstMove[sk] = 'stay';
    pushHeap(heap, {x:you.x, y:you.y, cost:0, fm:'stay'});
    while(heap.length > 0){
      const cur = popHeap(heap);
      if(!cur) break;
      const ck = cur.y*w + cur.x;
      if(cur.cost > costArr[ck] + 1e-12) continue;
      if(goalFn(cur.x, cur.y)){
        if(cur.x === you.x && cur.y === you.y) return 'stay';
        return cur.fm === 'stay' ? firstMove[ck] || 'stay' : cur.fm;
      }
      for(let di=0;di<DIRS.length;di++){
        const da = DIRS[di];
        const nx = cur.x + da[1], ny = cur.y + da[2];
        if(nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if(grid[ny][nx] === '#') continue;
        // if defending role and we restrict? squad blocks going out if defending? check squad logic
        // squad: if defending, don't go to !ownHalf(x) - they patrol home area
        const nk = ny*w + nx;
        let ncost = cur.cost + 1;
        if(riskFn) ncost += riskFn(nx, ny);
        if(ncost < costArr[nk]){
          costArr[nk] = ncost;
          let fm = cur.fm;
          if(cur.fm === 'stay') fm = da[0];
          else fm = cur.fm;
          firstMove[nk] = fm;
          pushHeap(heap, {x:nx, y:ny, cost:ncost, fm:fm});
        }
      }
    }
    return 'stay';
  }
  
  // role like squad
  const defending = order.length > 1 && isCaptain && !you.carrying;
  
  // If carrying
  if(you.carrying){
    let m = astar(x=>ownHalf(x), (nx,ny)=>{
      if(ownHalf(nx)) return 0;
      let cost = 0;
      for(let i=0;i<enemyAttackers.length;i++){
        const e = enemyAttackers[i];
        const ed = dist({x:nx,y:ny}, e);
        if(ed <= 2) cost += 80;
        else if(ed === 3) cost += 25;
        else if(ed === 4) cost += 8;
      }
      return cost;
    });
    if(m !== 'stay') return m;
    m = astar(x=>ownHalf(x), null);
    if(m !== 'stay') return m;
    return 'stay';
  }
  
  // Rescue like squad
  let doRescue = false;
  if(!you.carrying && myPrisoners.length > 0){
    const raiders = order.filter(a => a.id !== order[0].id && !a.jailed && a.respawnIn === 0 && !a.carrying);
    if(raiders.length > 0 && raiders[0].id === you.id){
      doRescue = true;
    } else if(raiders.length === 0 && isVice && myPrisoners.length > 0){
      doRescue = true;
    } else if(raiders.length === 0 && !isCaptain && myPrisoners.length > 0){
      doRescue = true;
    }
  }
  if(doRescue){
    let m = astar((x,y)=>{
      for(let i=0;i<enemyJail.length;i++){
        if(dist({x,y}, enemyJail[i]) <= 1) return true;
      }
      return false;
    }, (nx,ny)=>{
      if(ownHalf(nx)) return 0;
      let cost = 0;
      for(let i=0;i<enemyAttackers.length;i++){
        const e = enemyAttackers[i];
        const ed = dist({x:nx,y:ny}, e);
        if(ed <= 2) cost += 100;
        else if(ed === 3) cost += 30;
        else if(ed === 4) cost += 10;
      }
      return cost;
    });
    if(m !== 'stay') return m;
  }
  
  // Defense
  if(defending){
    const intruders = livingEnemies.filter(a=>ownHalf(a.x));
    let target;
    if(intruders.length > 0){
      intruders.sort((a,b)=>{
        if(!!b.carrying !== !!a.carrying) return (b.carrying?1:0)-(a.carrying?1:0);
        return dist(you,a)-dist(you,b);
      });
      target = intruders[0];
      let m = astar((x,y)=>dist({x,y},target)<=1, null);
      if(m !== 'stay') return m;
    }else{
      const home = state.flags[team].home;
      const patrol = (state.zones[team].home || []).filter(p=>dist(p,home)===1);
      const t = patrol.length ? patrol[Math.floor(state.tick/8) % patrol.length] : home[0] || {x:you.x,y:you.y};
      let m = astar((x,y)=>x===t.x && y===t.y, null);
      if(m !== 'stay') return m;
    }
  }else if(!doRescue && enemiesInOurHalf.length > 0){
    // others help defend
    if(isVice || enemiesInOurHalf.some(e=>e.carrying)){
      const intr = enemiesInOurHalf.slice().sort((a,b)=>{if(!!b.carrying!==!!a.carrying)return (b.carrying?1:0)-(a.carrying?1:0); return dist(you,a)-dist(you,b);})[0];
      let m = astar((x,y)=>dist({x,y},intr)<=1, null);
      if(m !== 'stay') return m;
    }
  }
  
  // Attack
  if(enemyFlag && !enemyFlag.carrier){
    let m = astar((x,y)=>x===enemyFlag.x && y===enemyFlag.y, (nx,ny)=>{
      if(ownHalf(nx)) return 0;
      let cost = 0;
      for(let i=0;i<enemyAttackers.length;i++){
        const e = enemyAttackers[i];
        const ed = dist({x:nx,y:ny}, e);
        if(ed <= 2) cost += 90;
        else if(ed === 3) cost += 28;
        else if(ed === 4) cost += 9;
      }
      return cost;
    });
    if(m !== 'stay') return m;
  }else if(enemyFlag && enemyFlag.carrier){
    const carrier = livingEnemies.find(e=>e.id === enemyFlag.carrier);
    if(carrier && !ownHalf(carrier.x)){
      let m = astar((x,y)=>dist({x,y},carrier)<=2, (nx,ny)=>{
        if(ownHalf(nx)) return 0;
        let cost = 0;
        for(let i=0;i<enemyAttackers.length;i++){
          const e = enemyAttackers[i];
          const ed = dist({x:nx,y:ny}, e);
          if(ed <= 2) cost += 90;
          else if(ed === 3) cost += 28;
          else if(ed === 4) cost += 9;
        }
        return cost;
      });
      if(m !== 'stay') return m;
    }
    let m = astar((x,y)=>x===enemyFlag.x && y===enemyFlag.y, null);
    if(m !== 'stay') return m;
  }
  
  // Push forward
  let m = astar((x,y)=>inEnemyHalf(x), (nx,ny)=>{
    if(ownHalf(nx)) return 0;
    let cost = 0;
    for(let i=0;i<enemyAttackers.length;i++){
      const e = enemyAttackers[i];
      const ed = dist({x:nx,y:ny}, e);
      if(ed <= 2) cost += 60;
      else if(ed === 3) cost += 20;
      else if(ed === 4) cost += 7;
    }
    return cost;
  });
  if(m !== 'stay') return m;
  m = astar((x,y)=>inEnemyHalf(x), null);
  if(m !== 'stay') return m;
  return 'stay';
};
