let lastMove = 'up';

function move(state) {
  try {
    const me = state.you;
    if (!me || !me.head || !state.width || !state.height) return lastMove;

    const w = state.width;
    const h = state.height;
    const food = state.food || [];
    const snakes = state.snakes || [];
    const hazards = state.hazards || [];
    const myBody = me.body || [];
    const myLength = me.length || myBody.length || 1;
    const health = me.health == null ? 100 : me.health;

    const dirs = [
      { name: 'up', x: 0, y: -1 },
      { name: 'down', x: 0, y: 1 },
      { name: 'left', x: -1, y: 0 },
      { name: 'right', x: 1, y: 0 }
    ];

    function key(x, y) {
      return x + ',' + y;
    }

    function edgeAt(x, y) {
      return Math.min(x, y, w - 1 - x, h - 1 - y);
    }

    const hazardSet = new Set();
    for (let i = 0; i < hazards.length; i++) {
      hazardSet.add(key(hazards[i].x, hazards[i].y));
    }

    const foodSet = new Set();
    for (let i = 0; i < food.length; i++) {
      foodSet.add(key(food[i].x, food[i].y));
    }

    const blocked = new Set();
    const enemyTails = new Set();
    const enemies = [];
    let ownTailKey = null;

    for (let i = 0; i < snakes.length; i++) {
      const s = snakes[i];
      if (!s || !s.head) continue;
      const body = s.body || [];
      const slen = s.length || body.length || 1;
      const isMe = s.id === me.id;

      for (let j = 0; j < body.length - 1; j++) {
        blocked.add(key(body[j].x, body[j].y));
      }

      if (body.length > 0) {
        const tail = body[body.length - 1];
        if (isMe) ownTailKey = key(tail.x, tail.y);
        else enemyTails.add(key(tail.x, tail.y));
      }

      if (!isMe) {
        enemies.push({
          head: s.head,
          length: slen,
          body: body
        });
      }
    }

    if (!ownTailKey && myBody.length) {
      const t = myBody[myBody.length - 1];
      ownTailKey = key(t.x, t.y);
    }

    let existingRings = 0;
    const maxRings = Math.max(0, Math.floor(Math.min(w, h) / 2) - 1);
    while (existingRings < maxRings && hazardSet.has(key(existingRings, existingRings))) {
      existingRings++;
    }

    let closingRing = -1;
    if (state.nextShrinkTurn != null &&
        state.turn === state.nextShrinkTurn &&
        existingRings < maxRings) {
      closingRing = existingRings;
    }

    function isFutureRing(x, y) {
      return closingRing >= 0 && edgeAt(x, y) === closingRing;
    }

    function enemyMayEat(enemy) {
      for (let i = 0; i < food.length; i++) {
        if (Math.abs(enemy.head.x - food[i].x) + Math.abs(enemy.head.y - food[i].y) === 1) {
          return true;
        }
      }
      return false;
    }

    function flood(startX, startY, eating, startKey) {
      const extraBlocked = eating ? ownTailKey : null;
      const total = w * h;
      const seen = new Array(total);
      const queue = new Array(total);
      let qhead = 0;
      let qtail = 0;
      const startId = startY * w + startX;
      queue[qtail++] = startId;
      seen[startId] = true;

      let area = 0;
      let nearestFood = Infinity;
      let degree = 0;

      while (qhead < qtail) {
        const id = queue[qhead++];
        const x = id % w;
        const y = Math.floor(id / w);
        const dist = Math.floor((qhead - 1 === 0 ? 0 : 0));

        area++;

        const hereKey = key(x, y);
        if (foodSet.has(hereKey) && !(isFutureRing(x, y) && hereKey !== startKey)) {
          let d = 0;
          let walk = id;
          while (walk !== startId) {
            const px = walk % w;
            const py = Math.floor(walk / w);
            let found = false;
            const candidates = [
              [px - 1, py],
              [px + 1, py],
              [px, py - 1],
              [px, py + 1]
            ];
            for (let z = 0; z < candidates.length; z++) {
              const nx = candidates[z][0];
              const ny = candidates[z][1];
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const nid = ny * w + nx;
              if (seen[nid] && nid < walk) {
                walk = nid;
                d++;
                found = true;
                break;
              }
            }
            if (!found || d > total) {
              d = Infinity;
              break;
            }
          }
          if (d < nearestFood) nearestFood = d;
        }

        for (let d = 0; d < dirs.length; d++) {
          const nx = x + dirs[d].x;
          const ny = y + dirs[d].y;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nk = key(nx, ny);
          if (hazardSet.has(nk)) continue;
          if (blocked.has(nk)) continue;
          if (extraBlocked && nk === extraBlocked) continue;
          if (isFutureRing(nx, ny) && nk !== startKey) continue;

          const nid = ny * w + nx;
          if (!seen[nid]) {
            seen[nid] = true;
            queue[qtail++] = nid;
          }
        }
      }

      for (let d = 0; d < dirs.length; d++) {
        const nx = startX + dirs[d].x;
        const ny = startY + dirs[d].y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = key(nx, ny);
        if (hazardSet.has(nk) || blocked.has(nk)) continue;
        if (extraBlocked && nk === extraBlocked) continue;
        if (isFutureRing(nx, ny)) continue;
        degree++;
      }

      if (foodSet.has(startKey)) nearestFood = 0;

      return { area: area, foodDistance: nearestFood, degree: degree };
    }

    let bestMove = lastMove;
    let bestScore = -Infinity;

    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      const x = me.head.x + d.x;
      const y = me.head.y + d.y;
      const k = key(x, y);
      const eating = foodSet.has(k);
      let fatal = false;
      let headFatal = false;

      if (x < 0 || y < 0 || x >= w || y >= h) fatal = true;
      if (!fatal && hazardSet.has(k)) fatal = true;
      if (!fatal && blocked.has(k)) fatal = true;
      if (!fatal && eating && ownTailKey === k) fatal = true;

      for (let e = 0; e < enemies.length; e++) {
        const enemy = enemies[e];
        const hd = Math.abs(enemy.head.x - x) + Math.abs(enemy.head.y - y);
        if (hd === 1 && enemy.length >= myLength) {
          headFatal = true;
        }
      }

      let score;
      if (fatal) {
        score = -1000000000 - Math.random();
      } else if (headFatal) {
        score = -100000000 + Math.random();
      } else {
        const fill = flood(x, y, eating, k);
        score = fill.area * 3.3;
        score += fill.degree * 15;
        score += edgeAt(x, y) * 2.5;

        if (isFutureRing(x, y)) score -= 42;

        if (enemyTails.has(k)) {
          let dangerousTail = false;
          for (let e = 0; e < enemies.length; e++) {
            const tail = enemies[e].body.length ? enemies[e].body[enemies[e].body.length - 1] : null;
            if (tail && key(tail.x, tail.y) === k && enemyMayEat(enemies[e])) {
              dangerousTail = true;
              break;
            }
          }
          score -= dangerousTail ? 55 : 20;
        }

        if (eating) score += 70;

        const fd = fill.foodDistance;
        if (fd !== Infinity) {
          const foodWeight = 7 + Math.max(0, 70 - health) * 0.5;
          score -= fd * foodWeight;
          if (health <= fd + 2) {
            score -= (fd + 3 - health) * 2200;
          }
        } else if (health < 50) {
          score -= (50 - health) * 22;
        }

        if (fill.area <= myLength) score -= 230;
        if (fill.area <= Math.max(4, Math.floor(myLength / 2))) score -= 350;

        for (let e = 0; e < enemies.length; e++) {
          const enemy = enemies[e];
          const dist = Math.abs(enemy.head.x - x) + Math.abs(enemy.head.y - y);

          if (enemy.length < myLength) {
            if (dist === 1) score += 10;
            else if (dist === 2) score += 3;
          } else {
            if (dist <= 5) score -= (6 - dist) * 3;
          }

          if (eating && dist <= 2 && enemy.length >= myLength) {
            score -= (3 - dist) * 12;
          }
        }

        score += Math.random() * 0.01;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = d.name;
      }
    }

    lastMove = bestMove;
    return bestMove;
  } catch (err) {
    return lastMove;
  }
}

module.exports = { name: 'Terrapin', move };
