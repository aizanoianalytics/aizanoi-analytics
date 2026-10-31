'use strict';

const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
];

function bfs(W, H, blocked, sources, inf) {
  const N = W * H;
  const dist = new Int32Array(N);
  for (let i = 0; i < N; i++) dist[i] = inf;
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let s = 0; s < sources.length; s++) {
    const src = sources[s];
    if (!src) continue;
    if (src.x < 0 || src.x >= W || src.y < 0 || src.y >= H) continue;
    const i = src.y * W + src.x;
    if (blocked[i]) continue;
    if (dist[i] !== inf) continue;
    dist[i] = 0;
    q[qt++] = i;
  }
  while (qh < qt) {
    const i = q[qh++];
    const x = i % W;
    const y = Math.floor(i / W);
    const d = dist[i] + 1;
    if (y > 0) { const j = (y-1)*W + x; if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
    if (y < H-1) { const j = (y+1)*W + x; if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
    if (x > 0) { const j = y*W + (x-1); if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
    if (x < W-1) { const j = y*W + (x+1); if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
  }
  return dist;
}

function key(x,y){ return x+','+y; }
function move(state){ try { return decide(state); } catch(e){ return 'up'; } }

function decide(state) {
  const W = state.width, H = state.height, N = W*H;
  const INF = 1000000000;
  const me = state.you;
  if (!me || !me.head) return 'up';
  const turn = state.turn || 0;
  const nextShrink = typeof state.nextShrinkTurn === 'number' ? state.nextShrinkTurn : 1000000000;
  const myId = me.id;
  const myLen = me.length || (me.body ? me.body.length : 3);
  const myHealth = me.health || 100;

  const snakesAll = state.snakes || [];
  const hazardsArr = state.hazards || [];
  const foodList = state.food || [];

  const foodSet = new Set();
  for (let i=0;i<foodList.length;i++) foodSet.add(key(foodList[i].x, foodList[i].y));

  const rivals = [];
  for (let s=0;s<snakesAll.length;s++) if (snakesAll[s].id !== myId) rivals.push(snakesAll[s]);

  // Build blocked grid (all bodies + hazards)
  const blocked = new Uint8Array(N);
  for (let i=0;i<hazardsArr.length;i++) {
    const h = hazardsArr[i];
    if (h.x>=0&&h.x<W&&h.y>=0&&h.y<H) blocked[h.y*W+h.x] = 1;
  }
  for (let s=0;s<snakesAll.length;s++) {
    const body = snakesAll[s].body || [];
    for (let b=0;b<body.length;b++) {
      const seg = body[b];
      if (seg.x>=0&&seg.x<W&&seg.y>=0&&seg.y<H) blocked[seg.y*W+seg.x] = 1;
    }
  }

  const oppSources = [];
  for (let r=0;r<rivals.length;r++) if (rivals[r].head) oppSources.push(rivals[r].head);
  const oppDist = bfs(W, H, blocked, oppSources, INF);

  let bestDir = null, bestScore = -1e18;
  const cx = (W-1)/2, cy = (H-1)/2;

  for (let di=0;di<DIRS.length;di++) {
    const d = DIRS[di];
    const nx = me.head.x + d.dx, ny = me.head.y + d.dy;
    if (nx<0||nx>=W||ny<0||ny>=H) continue;
    const nidx = ny*W+nx;
    if (blocked[nidx]) continue;

    // head-to-head
    let badHead = false;
    let attackBonus = 0;
    const meWillEat = foodSet.has(key(nx,ny));
    const mePostLen = meWillEat ? myLen+1 : myLen;
    for (let r=0;r<rivals.length;r++) {
      const rh = rivals[r].head;
      if (!rh) continue;
      const man = Math.abs(rh.x-nx)+Math.abs(rh.y-ny);
      if (man === 1) {
        const rLen = rivals[r].length || (rivals[r].body?rivals[r].body.length:3);
        const rWillEat = foodSet.has(key(nx,ny));
        const rPostLen = rWillEat ? rLen+1 : rLen;
        if (rPostLen >= mePostLen) { badHead = true; break; }
        else attackBonus += 80;
      }
    }
    if (badHead) continue;

    // reachability
    const myDist = bfs(W, H, blocked, [{x:nx,y:ny}], INF);
    let reach = 0, territory = 0;
    for (let i=0;i<N;i++) {
      if (myDist[i] < INF) {
        reach++;
        if (myDist[i] + 1 < oppDist[i]) territory++;
      }
    }

    let score = 0;
    if (reach < myLen) score -= 6000 + (myLen - reach)*200;
    score += territory * 6;
    score += Math.min(reach, 90)*0.7;
    score += attackBonus;

    // food
    let foodDist = INF;
    for (let i=0;i<foodList.length;i++) {
      const f = foodList[i];
      const fi = f.y*W+f.x;
      if (myDist[fi] < INF && myDist[fi] < foodDist) foodDist = myDist[fi];
    }
    if (foodDist < INF) {
      let urg = 0.3;
      if (myHealth <= 20) urg = 12;
      else if (myHealth <= 35) urg = 8;
      else if (myHealth <= 55) urg = 4;
      else if (myHealth <= 75) urg = 1.5;
      else urg = 0.4;
      if (foodDist < myHealth - 1) score += urg * 45 / (foodDist + 1);
      else if (foodDist < myHealth) score += urg * 15 / (foodDist + 1);
      else score -= 35;
    } else if (myHealth < 45) score -= 120;

    // storm
    const edge = Math.min(nx,ny,W-1-nx,H-1-ny);
    const tts = nextShrink - turn;
    if (tts <= 35) {
      if (edge === 0) score -= tts <= 12 ? 220 : 70;
      else if (edge === 1) score -= tts <= 12 ? 90 : 35;
      else if (edge === 2) score -= 15;
    }
    if (turn >= 110) {
      if (edge <= 1) score -= 35;
    }
    const cdist = Math.abs(nx - cx) + Math.abs(ny - cy);
    score -= cdist * (turn > 90 ? 0.6 : 0.25);

    if (reach > myLen * 2) score += 12;
    if (score > bestScore) { bestScore = score; bestDir = d.name; }
  }

  if (bestDir) return bestDir;
  for (let di=0;di<DIRS.length;di++) {
    const d = DIRS[di];
    const nx = me.head.x+d.dx, ny = me.head.y+d.dy;
    if (nx>=0&&nx<W&&ny>=0&&ny<H && !blocked[ny*W+nx]) return d.name;
  }
  return 'up';
}

module.exports = { name: 'Iceman', move };
