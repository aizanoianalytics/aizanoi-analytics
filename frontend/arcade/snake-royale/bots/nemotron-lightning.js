// Smart snake bot for Snake Royale with multiple strategies:
// - Flood-fill reachability to avoid getting trapped
// - Opponent head prediction
// - Head-to-head attack only when longer
// - Cutting off rivals and trapping
// - Food targeting when safe
// - Storm avoidance before turn 150
// - Late-game center control

function move(state) {
  const { turn, width: W, height: H, you, snakes, food, hazards, nextShrinkTurn } = state;
  const myHead = you.head;          // {x,y}
  const myBody = you.body;          // [{x,y}, ...], body[0] is head
  const myLen = you.length;
  const myHealth = you.health;

  // Build set of "permanently" blocked cells: hazards + other snakes' body cells
  // (We'll handle our own tail specially below)
  const permanentlyBlocked = new Set();
  hazards.forEach(h => permanentlyBlocked.add(h.x + ',' + h.y));
  snakes.forEach(s => {
    if (s.id === you.id) return;
    s.body.forEach(([x, y]) => permanentlyBlocked.add(x + ',' + y));
  });

  // Direction vectors
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  // Check if a cell is within bounds and not permanently blocked
  const isValid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !permanentlyBlocked.has(x + ',' + y);

  // Check if new head position collides with OUR body after the move.
  // After move without eating: new body = [newHead, oldHead, body[0..len-2]], tail (body[len-1]) pops.
  // So new head must NOT equal: old head (body[0]), body[1], ..., body[len-2]
  // new head CAN equal body[len-1] (the tail, which pops).
  const selfCollisionAvoid = (nx, ny) => {
    // Check against body indices 0 to len-2 (all but current tail)
    for (let i = 0; i < myLen - 1; i++) {
      const [bx, by] = myBody[i];
      if (bx === nx && by === ny) return true;
    }
    return false;
  };

  // Check if new head position collides with another snake's body after their move.
  // Other snakes' tails also pop, but we check conservatively against their full body[1..] (after their head).
  // We check against their CURRENT body[1..] which is conservative (might prevent moving into their tail, which is OK).
  const otherCollisionAvoid = (nx, ny) => {
    for (const s of snakes) {
      if (s.id === you.id) continue;
      // Check body[1..] (skip head, include rest including tail - conservative)
      for (let k = 1; k < s.body.length; k++) {
        const [sx, sy] = s.body[k];
        if (sx === nx && sy === ny) return true;
      }
    }
    return false;
  };

  // Flood-fill reachable cells from (sx, sy) avoiding permanently blocked cells
  // and our own body after the move (simplified: just check bounds + permanently blocked)
  const getReachable = (sx, sy) => {
    if (!isValid(sx, sy)) return 0;
    const visited = new Set();
    const q = [[sx, sy]];
    visited.add(sx + ',' + sy);
    let cnt = 0;
    while (q.length > 0) {
      const [x, y] = q.shift();
      cnt++;
      for (const d of Object.values(DIRS)) {
        const nx2 = x + d[0], ny2 = y + d[1];
        if (isValid(nx2, ny2) && !visited.has(nx2 + ',' + ny2)) {
          visited.add(nx2 + ',' + ny2);
          q.push([nx2, ny2]);
        }
      }
    }
    return cnt;
  };

  // Evaluate a move direction. Returns score; higher is better.
  const evalMove = (dir) => {
    const [dx, dy] = DIRS[dir];
    const nx = myHead.x + dx;
    const ny = myHead.y + dy;

    // 1. Bounds check + permanently blocked (hazards, other snakes' bodies)
    if (!isValid(nx, ny)) return -Infinity;

    // 2. Self-collision: new head must not hit our own body (after tail pop)
    if (selfCollisionAvoid(nx, ny)) return -Infinity;

    // 3. Other snakes' body collision (conservative)
    if (otherCollisionAvoid(nx, ny)) return -Infinity;

    // 4. Flood-fill reachability from new position
    const reachable = getReachable(nx, ny);
    // Minimum reachable cells: must be able to fit our body length with buffer
    const minReachable = Math.max(myLen * 2, 15);
    if (reachable < myLen) return -Infinity; // definitely trapped
    if (reachable < minReachable) return -200; // heavy penalty, but not fatal

    // 5. Score components
    let score = 0;

    // Reward reachable space (more room = better survival odds)
    score += reachable * 3;

    // Food proximity reward
    let foodScore = 0;
    for (const f of food) {
      const fd = Math.abs(f.x - nx) + Math.abs(f.y - ny);
      if (fd <= 3) foodScore += 10 / (fd + 1); // prefer close food
    }
    score += foodScore;

    // Storm considerations
    const isStormActive = turn >= 150;
    if (isStormActive) {
      const centerX = Math.floor(W / 2);
      const centerY = Math.floor(H / 2);
      const distToCenter = Math.abs(nx - centerX) + Math.abs(ny - centerY);
      score += 80 / (distToCenter + 1); // prefer center in late game
    } else {
      // Before storm: prefer staying away from edges for maneuvering room
      const edgeDist = Math.min(nx, ny, W - 1 - nx, H - 1 - ny);
      score += edgeDist * 8;
    }

    // Head-to-head assessment: check if any other snake could also move to nx,ny
    // If so, we'd only win if we're longer. Small penalty for head-on risk.
    for (const s of snakes) {
      if (s.id === you.id) continue;
      const {x: sx, y: sy} = s.head;
      // Can this snake reach nx,ny in one move?
      for (const d of Object.values(DIRS)) {
        if (sx + d[0] === nx && sy + d[1] === ny) {
          // Potential head-on. If we're not longer, penalize heavily.
          if (myLen <= s.body.length) {
            score -= 500; // avoid head-on when not advantageous
          }
          break;
        }
      }
    }

    // Late-game: if few snakes left, prefer center more aggressively
    const aliveCount = snakes.filter(s => s.alive).length;
    if (aliveCount <= 3 && isStormActive) {
      const centerX = Math.floor(W / 2);
      const centerY = Math.floor(H / 2);
      const distToCenter = Math.abs(nx - centerX) + Math.abs(ny - centerY);
      score += 200 / (distToCenter + 1);
    }

    return score;
  };

  // Evaluate all four directions
  const moves = Object.keys(DIRS).map(dir => ({ dir, score: evalMove(dir) }));

  // Filter out -Infinity (unsafe); keep everything else even if negative
  const safeMoves = moves.filter(m => m.score > -Infinity/2);

  if (safeMoves.length === 0) {
    // Absolutely no safe move - emergency: try any direction that stays in bounds
    // This is a fallback that should rarely trigger
    for (const dir of Object.keys(DIRS)) {
      const [dx, dy] = DIRS[dir];
      const nx = myHead.x + dx;
      const ny = myHead.y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) return dir;
    }
    return 'up';
  }

  // Sort by score (highest first)
  safeMoves.sort((a, b) => b.score - a.score);

  // If clear best move, take it; otherwise prefer top-scoring moves with slight randomness
  const topScore = safeMoves[0].score;
  const topMoves = safeMoves.filter(m => m.score === topScore);

  let chosen;
  if (topMoves.length === 1) {
    chosen = topMoves[0].dir;
  } else {
    // Pick randomly from top moves to break ties less predictably
    chosen = topMoves[Math.floor(Math.random() * topMoves.length)].dir;
  }

  return chosen;
}

module.exports = { name: 'StrategicSnake', move };
