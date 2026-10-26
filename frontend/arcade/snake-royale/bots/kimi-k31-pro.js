'use strict';

var DIRS = [
  { x: 0, y: -1, name: 'up' },
  { x: 0, y: 1, name: 'down' },
  { x: -1, y: 0, name: 'left' },
  { x: 1, y: 0, name: 'right' }
];
var INF = 1000000000;

var lastTurn = -1;
var lastWidth = 0;
var lastHeight = 0;
var recentHeads = [];

function move(state) {
  var started = Date.now();
  try {
    return decide(state, started);
  } catch (err) {
    return emergencyMove(state);
  }
}

function decide(state, started) {
  var me = state.you;
  var w = state.width;
  var h = state.height;
  var n = w * h;
  var turn = state.turn;
  var snakes = state.snakes || [me];
  var enemies = [];
  var i, j, d, p;

  for (i = 0; i < snakes.length; i++) {
    if (snakes[i].id !== me.id) enemies.push(snakes[i]);
  }

  var hazards = new Uint8Array(n);
  var foodSet = new Uint8Array(n);

  for (i = 0; i < state.hazards.length; i++) {
    p = cellIndex(state.hazards[i].x, state.hazards[i].y, w, h);
    if (p >= 0) hazards[p] = 1;
  }
  for (i = 0; i < state.food.length; i++) {
    p = cellIndex(state.food[i].x, state.food[i].y, w, h);
    if (p >= 0) foodSet[p] = 1;
  }

  var storm = {
    w: w,
    h: h,
    nextRing: findNextRing(hazards, w, h),
    nextShrinkTurn: state.nextShrinkTurn
  };

  var occupied = new Int16Array(n);
  var fixedEnemies = new Int16Array(n);
  var enemyData = [];

  for (i = 0; i < snakes.length; i++) {
    var s = snakes[i];
    var isMe = s.id === me.id;
    var tailMightStay = !isMe && couldEatNext(s, state.food, w, h);
    var last = s.body.length - 1;

    for (j = 0; j < s.body.length; j++) {
      if (j === last && !tailMightStay) continue;
      p = cellIndex(s.body[j].x, s.body[j].y, w, h);
      if (p >= 0) occupied[p]++;
    }

    if (!isMe) {
      for (j = 0; j < s.body.length; j++) {
        if (j === last && !tailMightStay) continue;
        p = cellIndex(s.body[j].x, s.body[j].y, w, h);
        if (p >= 0) fixedEnemies[p]++;
      }

      enemyData.push({
        snake: s,
        head: cellIndex(s.head.x, s.head.y, w, h),
        distance: Math.abs(s.head.x - me.head.x) + Math.abs(s.head.y - me.head.y),
        map: null
      });
    }
  }

  enemyData.sort(function(a, b) {
    return a.distance - b.distance;
  });

  for (i = 0; i < enemyData.length && i < 6; i++) {
    enemyData[i].map = floodFill(
      enemyData[i].head,
      occupied,
      hazards,
      w,
      h
    );
  }

  var evaluationHazards = hazards.slice();
  if (
    storm.nextShrinkTurn - turn <= 5 &&
    storm.nextRing <= maximumRing(w, h)
  ) {
    for (p = 0; p < n; p++) {
      if (ringOfIndex(p, w, h) === storm.nextRing) {
        evaluationHazards[p] = 1;
      }
    }
  }

  var ownBody = [];
  for (i = 0; i < me.body.length; i++) {
    ownBody.push(cellIndex(me.body[i].x, me.body[i].y, w, h));
  }
  var ownTail = ownBody.length ? ownBody[ownBody.length - 1] : -1;
  var myHead = cellIndex(me.head.x, me.head.y, w, h);

  if (turn <= lastTurn || w !== lastWidth || h !== lastHeight) {
    recentHeads = [];
  }
  if (turn !== lastTurn) {
    recentHeads.push(myHead);
    if (recentHeads.length > 12) recentHeads.shift();
    lastTurn = turn;
    lastWidth = w;
    lastHeight = h;
  }

  var candidates = [];

  for (d = 0; d < 4; d++) {
    var nx = me.head.x + DIRS[d].x;
    var ny = me.head.y + DIRS[d].y;
    p = cellIndex(nx, ny, w, h);

    var candidate = {
      dir: d,
      p: p,
      x: nx,
      y: ny,
      eat: p >= 0 && foodSet[p] === 1,
      dead: false,
      risk: 0,
      prey: 0,
      score: -INF
    };

    if (p < 0 || deadlyAtTurn(p, turn + 1, hazards, storm)) {
      candidate.dead = true;
      candidates.push(candidate);
      continue;
    }

    for (i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      var headDistance =
        Math.abs(enemy.head.x - nx) + Math.abs(enemy.head.y - ny);

      if (headDistance === 1) {
        if (
          enemy.health === 1 &&
          !couldEatNext(enemy, state.food, w, h)
        ) {
          continue;
        }

        if (enemy.length >= me.length) candidate.risk++;
        else candidate.prey++;
      }
    }

    candidates.push(candidate);
  }

  for (d = 0; d < candidates.length; d++) {
    var c = candidates[d];
    if (c.dead) continue;

    if (c.eat && ownTail >= 0) occupied[ownTail]++;

    if (occupied[c.p] !== 0) {
      c.dead = true;
      c.score = -INF;
      if (c.eat && ownTail >= 0) occupied[ownTail]--;
      continue;
    }

    occupied[c.p]++;

    var areaInfo = floodFill(c.p, occupied, evaluationHazards, w, h);
    var projectedBody = [c.p].concat(ownBody);
    if (!c.eat) projectedBody.pop();

    var forecast = forecastDepth(
      projectedBody,
      fixedEnemies,
      hazards,
      storm,
      turn + 1,
      4
    );

    var score = 0;
    var length = me.length;
    var desiredSpace = length + 3;

    score += Math.min(areaInfo.area, length * 4 + 12) * 5;

    if (areaInfo.area < desiredSpace) {
      score -= (desiredSpace - areaInfo.area) * 45;
    }
    if (areaInfo.area <= 2) score -= 500;

    score += forecast * 120;
    if (forecast < 4) score -= (4 - forecast) * 900;

    score -= c.risk * 25000;
    score += c.prey * 400;

    var urgency = Math.max(0, Math.min(1, (70 - me.health) / 70));
    var bestFoodValue = 0;
    var reachableFood = false;

    for (i = 0; i < state.food.length; i++) {
      var f = state.food[i];
      var fp = cellIndex(f.x, f.y, w, h);
      if (fp < 0) continue;

      var foodDistance = areaInfo.dist[fp];
      if (foodDistance < 0) continue;

      var arrivalTurn = turn + 1 + foodDistance;
      if (deadlyAtTurn(fp, arrivalTurn, hazards, storm)) continue;

      reachableFood = true;

      var nearestEnemyDistance = 99;
      var nearestEnemyLength = 0;

      for (j = 0; j < enemyData.length; j++) {
        var ed;
        var data = enemyData[j];

        if (data.map) {
          ed = data.map.dist[fp] >= 0 ? data.map.dist[fp] : 99;
        } else {
          ed =
            Math.abs(data.snake.head.x - f.x) +
            Math.abs(data.snake.head.y - f.y);
        }

        if (ed < nearestEnemyDistance) {
          nearestEnemyDistance = ed;
          nearestEnemyLength = data.snake.length;
        }
      }

      var value =
        25 / (foodDistance + 1) +
        urgency * 650 / (foodDistance + 1);

      if (me.health < 18) {
        value += 2500 / (foodDistance + 1);
      }

      if (
        nearestEnemyDistance < foodDistance &&
        nearestEnemyLength >= me.length
      ) {
        value *= 0.2;
      } else if (foodDistance <= nearestEnemyDistance) {
        value += 20 / (foodDistance + 1);
      }

      if (value > bestFoodValue) bestFoodValue = value;
    }

    score += bestFoodValue;

    if (!reachableFood) {
      score -= me.health < 45 ? (46 - me.health) * 25 : 30;
    }

    if (c.eat) {
      score += 15;
      if (me.health > 80 && areaInfo.area < length * 1.5) {
        score -= 80;
      }
    }

    for (i = 0; i < enemyData.length && i < 4; i++) {
      var rival = enemyData[i].snake;
      var rivalInfo = floodFill(
        enemyData[i].head,
        occupied,
        evaluationHazards,
        w,
        h
      );
      var escapes = countEnemyEscapes(
        rival,
        occupied,
        evaluationHazards,
        w,
        h
      );

      if (
        rivalInfo.area < rival.length + 2 &&
        areaInfo.area > rivalInfo.area
      ) {
        var trapBonus = (rival.length + 2 - rivalInfo.area) * 22;
        if (me.length > rival.length) trapBonus *= 1.5;
        score += trapBonus;
      }

      if (escapes === 0) score += 180;
      else if (escapes === 1) score += 45;

      if (
        areaInfo.area < length &&
        rival.length >= length &&
        enemyData[i].distance < 6
      ) {
        score -= (6 - enemyData[i].distance) * 55;
      }
    }

    var shrinkTurn = shrinkTimeForCell(c.p, storm);
    var shrinkIn = shrinkTurn - (turn + 1);

    if (shrinkIn <= 6) score -= (7 - shrinkIn) * 140;
    if (shrinkIn <= 16) score -= (17 - shrinkIn) * 4;

    var ring = ringOfIndex(c.p, w, h);
    score += ring * (turn > 135 ? 22 : turn > 95 ? 5 : 1);

    if (enemies.length === 1) {
      var opponentDistance =
        Math.abs(enemies[0].head.x - nx) +
        Math.abs(enemies[0].head.y - ny);

      if (me.length > enemies[0].length + 1) {
        score += Math.max(0, 12 - opponentDistance) * 4;
      } else if (me.length < enemies[0].length) {
        score += Math.min(10, opponentDistance) * 3;
      }
    }

    if (
      urgency < 0.4 &&
      areaInfo.area < length * 2 &&
      ownTail >= 0 &&
      areaInfo.dist[ownTail] >= 0
    ) {
      score += 40 - areaInfo.dist[ownTail] * 3;
    }

    for (i = 0; i < recentHeads.length; i++) {
      if (recentHeads[i] === c.p) score -= 7;
    }

    c.score = score;

    occupied[c.p]--;
    if (c.eat && ownTail >= 0) occupied[ownTail]--;
  }

  var ranked = candidates.slice();
  ranked.sort(function(a, b) {
    return b.score - a.score || a.dir - b.dir;
  });

  var best = ranked[0];
  var deadline = started + 34;

  if (
    enemies.length === 1 &&
    best &&
    !best.dead &&
    Date.now() < deadline - 2
  ) {
    var simulation = makeSimulation(
      state,
      me,
      enemies[0],
      hazards,
      storm
    );

    var order = [];
    for (i = 0; i < ranked.length; i++) order.push(ranked[i].dir);

    var searched = searchDuel(simulation, order, deadline);
    if (searched >= 0) return DIRS[searched].name;
  }

  return best ? DIRS[best.dir].name : 'up';
}

function cellIndex(x, y, w, h) {
  return x >= 0 && x < w && y >= 0 && y < h ? y * w + x : -1;
}

function maximumRing(w, h) {
  return Math.floor((Math.min(w, h) - 1) / 2);
}

function ringOfIndex(p, w, h) {
  var x = p % w;
  var y = Math.floor(p / w);
  return Math.min(x, y, w - 1 - x, h - 1 - y);
}

function findNextRing(hazards, w, h) {
  var maxRing = maximumRing(w, h);
  var ring, p;

  for (ring = 0; ring <= maxRing; ring++) {
    var found = false;
    for (p = 0; p < hazards.length; p++) {
      if (hazards[p] && ringOfIndex(p, w, h) === ring) {
        found = true;
        break;
      }
    }
    if (!found) return ring;
  }
  return maxRing + 1;
}

function shrinkTimeForCell(p, storm) {
  if (p < 0 || storm.nextRing > maximumRing(storm.w, storm.h)) {
    return INF;
  }

  var ring = ringOfIndex(p, storm.w, storm.h);
  if (ring < storm.nextRing) return -INF;

  return storm.nextShrinkTurn + 20 * (ring - storm.nextRing);
}

function deadlyAtTurn(p, futureTurn, hazards, storm) {
  if (p < 0 || hazards[p]) return true;

  var shrinkTurn = shrinkTimeForCell(p, storm);
  return shrinkTurn <= futureTurn;
}

function couldEatNext(snake, food, w, h) {
  for (var i = 0; i < food.length; i++) {
    if (
      Math.abs(food[i].x - snake.head.x) +
        Math.abs(food[i].y - snake.head.y) ===
      1
    ) {
      return true;
    }
  }
  return false;
}

function floodFill(start, occupied, hazards, w, h) {
  var n = w * h;
  var dist = new Int16Array(n);
  var queue = new Int16Array(n);
  dist.fill(-1);

  var head = 0;
  var tail = 0;
  var area = 0;

  if (start < 0 || hazards[start]) {
    return { area: 0, dist: dist };
  }

  dist[start] = 0;
  queue[tail++] = start;

  while (head < tail) {
    var p = queue[head++];
    area++;

    var x = p % w;
    var y = Math.floor(p / w);

    for (var d = 0; d < 4; d++) {
      var np = cellIndex(x + DIRS[d].x, y + DIRS[d].y, w, h);
      if (
        np >= 0 &&
        dist[np] < 0 &&
        !hazards[np] &&
        occupied[np] === 0
      ) {
        dist[np] = dist[p] + 1;
        queue[tail++] = np;
      }
    }
  }

  return { area: area, dist: dist };
}

function forecastDepth(body, fixed, hazards, storm, startingTurn, cap) {
  var grid = fixed.slice();
  var i;

  for (i = 0; i < body.length; i++) {
    if (body[i] >= 0) grid[body[i]]++;
  }

  function recurse(currentTurn, depth) {
    if (depth >= cap) return depth;

    var best = depth;
    var headCell = body[0];
    var x = headCell % storm.w;
    var y = Math.floor(headCell / storm.w);

    for (var d = 0; d < 4; d++) {
      var np = cellIndex(
        x + DIRS[d].x,
        y + DIRS[d].y,
        storm.w,
        storm.h
      );

      if (
        np < 0 ||
        deadlyAtTurn(np, currentTurn + 1, hazards, storm)
      ) {
        continue;
      }

      var oldTail = body.pop();
      if (oldTail >= 0) grid[oldTail]--;

      if (grid[np] === 0) {
        grid[np]++;
        body.unshift(np);

        var reached = recurse(currentTurn + 1, depth + 1);
        if (reached > best) best = reached;

        body.shift();
        grid[np]--;
      }

      body.push(oldTail);
      if (oldTail >= 0) grid[oldTail]++;
    }

    return best;
  }

  return recurse(startingTurn, 0);
}

function countEnemyEscapes(enemy, occupied, hazards, w, h) {
  var count = 0;

  for (var d = 0; d < 4; d++) {
    var p = cellIndex(
      enemy.head.x + DIRS[d].x,
      enemy.head.y + DIRS[d].y,
      w,
      h
    );

    if (p >= 0 && !hazards[p] && occupied[p] === 0) count++;
  }
  return count;
}

function makeSimulation(state, me, opponent, hazards, storm) {
  var w = state.width;
  var h = state.height;

  function convert(s) {
    var body = [];
    for (var i = 0; i < s.body.length; i++) {
      body.push(cellIndex(s.body[i].x, s.body[i].y, w, h));
    }
    return {
      b: body,
      l: s.length,
      h: s.health,
      dead: false
    };
  }

  var food = [];
  for (var i = 0; i < state.food.length; i++) {
    food.push(cellIndex(state.food[i].x, state.food[i].y, w, h));
  }

  return {
    w: w,
    h: h,
    n: w * h,
    turn: state.turn,
    a: convert(me),
    b: convert(opponent),
    food: food,
    hazards: hazards,
    nextRing: storm.nextRing,
    nextShrinkTurn: storm.nextShrinkTurn
  };
}

function simulationStorm(sim) {
  return {
    w: sim.w,
    h: sim.h,
    nextRing: sim.nextRing,
    nextShrinkTurn: sim.nextShrinkTurn
  };
}

function simulationOptions(sim, which) {
  var s = which === 0 ? sim.a : sim.b;
  if (s.dead) return [0];

  var blocked = new Uint8Array(sim.n);
  var snakes = [sim.a, sim.b];
  var storm = simulationStorm(sim);
  var i, j;

  for (i = 0; i < 2; i++) {
    var body = snakes[i].b;
    for (j = 0; j < body.length; j++) {
      if (j === body.length - 1) continue;
      if (body[j] >= 0) blocked[body[j]] = 1;
    }
  }

  var headCell = s.b[0];
  var x = headCell % sim.w;
  var y = Math.floor(headCell / sim.w);
  var options = [];

  for (var d = 0; d < 4; d++) {
    var p = cellIndex(x + DIRS[d].x, y + DIRS[d].y, sim.w, sim.h);

    if (
      p >= 0 &&
      !blocked[p] &&
      !deadlyAtTurn(p, sim.turn + 1, sim.hazards, storm)
    ) {
      options.push(d);
    }
  }

  return options.length ? options : [0];
}

function advanceSimulationStorm(sim, newTurn) {
  var hazards = sim.hazards;
  var nextRing = sim.nextRing;
  var nextShrinkTurn = sim.nextShrinkTurn;
  var maxRing = maximumRing(sim.w, sim.h);

  if (newTurn >= nextShrinkTurn && nextRing <= maxRing) {
    hazards = hazards.slice();

    while (newTurn >= nextShrinkTurn && nextRing <= maxRing) {
      for (var p = 0; p < sim.n; p++) {
        if (ringOfIndex(p, sim.w, sim.h) === nextRing) {
          hazards[p] = 1;
        }
      }
      nextRing++;
      nextShrinkTurn += 20;
    }
  }

  return {
    hazards: hazards,
    nextRing: nextRing,
    nextShrinkTurn: nextShrinkTurn
  };
}

function simulationStep(sim, aMove, bMove) {
  var newTurn = sim.turn + 1;
  var storm = advanceSimulationStorm(sim, newTurn);

  var aOldHead = sim.a.b[0];
  var bOldHead = sim.b.b[0];

  var aHead = cellIndex(
    aOldHead % sim.w + DIRS[aMove].x,
    Math.floor(aOldHead / sim.w) + DIRS[aMove].y,
    sim.w,
    sim.h
  );
  var bHead = cellIndex(
    bOldHead % sim.w + DIRS[bMove].x,
    Math.floor(bOldHead / sim.w) + DIRS[bMove].y,
    sim.w,
    sim.h
  );

  var aEat = aHead >= 0 && sim.food.indexOf(aHead) >= 0;
  var bEat = bHead >= 0 && sim.food.indexOf(bHead) >= 0;

  var aBody = [aHead].concat(sim.a.b);
  var bBody = [bHead].concat(sim.b.b);

  if (!aEat) aBody.pop();
  if (!bEat) bBody.pop();

  var aHealth = aEat ? 100 : sim.a.h - 1;
  var bHealth = bEat ? 100 : sim.b.h - 1;
  var aLength = sim.a.l + (aEat ? 1 : 0);
  var bLength = sim.b.l + (bEat ? 1 : 0);

  var aDead = aHead < 0 || storm.hazards[aHead] === 1 || aHealth <= 0;
  var bDead = bHead < 0 || storm.hazards[bHead] === 1 || bHealth <= 0;

  var heads = [aHead, bHead];
  var bodies = [aBody, bBody];
  var dead = [aDead, bDead];

  for (var i = 0; i < 2; i++) {
    if (dead[i] || heads[i] < 0) continue;

    for (var j = 0; j < 2; j++) {
      var start = i === j ? 1 : 0;

      for (var k = start; k < bodies[j].length; k++) {
        if (i !== j && k === 0) continue;

        if (bodies[j][k] === heads[i]) {
          dead[i] = true;
          break;
        }
      }
      if (dead[i]) break;
    }
  }

  if (
    aHead >= 0 &&
    aHead === bHead &&
    !dead[0] &&
    !dead[1]
  ) {
    if (aLength === bLength) {
      dead[0] = true;
      dead[1] = true;
    } else if (aLength < bLength) {
      dead[0] = true;
    } else {
      dead[1] = true;
    }
  }

  var food = [];
  for (i = 0; i < sim.food.length; i++) {
    var f = sim.food[i];
    if ((aEat && f === aHead) || (bEat && f === bHead)) continue;
    food.push(f);
  }

  return {
    w: sim.w,
    h: sim.h,
    n: sim.n,
    turn: newTurn,
    a: { b: aBody, l: aLength, h: aHealth, dead: dead[0] },
    b: { b: bBody, l: bLength, h: bHealth, dead: dead[1] },
    food: food,
    hazards: storm.hazards,
    nextRing: storm.nextRing,
    nextShrinkTurn: storm.nextShrinkTurn
  };
}

function terminalScore(sim, depth) {
  if (!sim.a.dead && !sim.b.dead) return null;

  if (sim.a.dead && sim.b.dead) {
    return -200000 + (sim.a.l - sim.b.l) * 1000;
  }
  if (sim.b.dead) {
    return 10000000 + depth * 10000 + sim.a.l * 100;
  }
  return -10000000 - depth * 10000 - sim.a.l * 100;
}

function simulationMetrics(sim, snake) {
  var blocked = new Uint8Array(sim.n);
  var snakes = [sim.a, sim.b];
  var i, j;

  for (i = 0; i < 2; i++) {
    for (j = 0; j < snakes[i].b.length; j++) {
      if (j === snakes[i].b.length - 1) continue;
      var p = snakes[i].b[j];
      if (p >= 0) blocked[p] = 1;
    }
  }

  var dist = new Int16Array(sim.n);
  var queue = new Int16Array(sim.n);
  dist.fill(-1);

  var start = snake.b[0];
  var head = 0;
  var tail = 0;
  var area = 0;

  dist[start] = 0;
  queue[tail++] = start;

  while (head < tail) {
    var current = queue[head++];
    area++;

    var x = current % sim.w;
    var y = Math.floor(current / sim.w);

    for (var d = 0; d < 4; d++) {
      var np = cellIndex(x + DIRS[d].x, y + DIRS[d].y, sim.w, sim.h);
      if (
        np >= 0 &&
        dist[np] < 0 &&
        !blocked[np] &&
        !sim.hazards[np]
      ) {
        dist[np] = dist[current] + 1;
        queue[tail++] = np;
      }
    }
  }

  var mobility = 0;
  var sx = start % sim.w;
  var sy = Math.floor(start / sim.w);

  for (d = 0; d < 4; d++) {
    var adjacent = cellIndex(
      sx + DIRS[d].x,
      sy + DIRS[d].y,
      sim.w,
      sim.h
    );
    if (
      adjacent >= 0 &&
      !blocked[adjacent] &&
      !sim.hazards[adjacent]
    ) {
      mobility++;
    }
  }

  var nearestFood = 99;
  for (i = 0; i < sim.food.length; i++) {
    var fp = sim.food[i];
    if (fp >= 0 && dist[fp] >= 0 && dist[fp] < nearestFood) {
      nearestFood = dist[fp];
    }
  }

  return {
    area: area,
    mobility: mobility,
    food: nearestFood
  };
}

function evaluateSimulation(sim) {
  var a = simulationMetrics(sim, sim.a);
  var b = simulationMetrics(sim, sim.b);

  var score =
    (Math.min(a.area, 90) - Math.min(b.area, 90)) * 24 +
    (sim.a.l - sim.b.l) * 90 +
    (sim.a.h - sim.b.h) * 1.5 +
    (a.mobility - b.mobility) * 45;

  if (a.area < sim.a.l + 1) {
    score -= (sim.a.l + 1 - a.area) * 45;
  }
  if (b.area < sim.b.l + 1) {
    score += (sim.b.l + 1 - b.area) * 45;
  }

  var aNeed = Math.max(5, 70 - sim.a.h);
  var bNeed = Math.max(5, 70 - sim.b.h);

  score -= aNeed * Math.min(a.food, 25) * 1.5;
  score += bNeed * Math.min(b.food, 25) * 1.5;

  var aHead = sim.a.b[0];
  var bHead = sim.b.b[0];
  var ax = aHead % sim.w;
  var ay = Math.floor(aHead / sim.w);
  var bx = bHead % sim.w;
  var by = Math.floor(bHead / sim.w);
  var separation = Math.abs(ax - bx) + Math.abs(ay - by);

  if (sim.a.l > sim.b.l) score -= separation * 3;
  else if (sim.a.l < sim.b.l) score += separation * 2;

  var ringWeight = sim.turn > 120 ? 12 : 2;
  score +=
    (ringOfIndex(aHead, sim.w, sim.h) -
      ringOfIndex(bHead, sim.w, sim.h)) *
    ringWeight;

  return score;
}

function searchValue(sim, depth, alpha, control) {
  if (control.failed) return 0;

  var terminal = terminalScore(sim, depth);
  if (terminal !== null) return terminal;
  if (depth <= 0) return evaluateSimulation(sim);

  control.nodes++;
  if (
    control.nodes % 24 === 0 &&
    Date.now() > control.deadline
  ) {
    control.failed = true;
    return 0;
  }

  var aOptions = simulationOptions(sim, 0);
  var bOptions = simulationOptions(sim, 1);
  var best = -INF;
  var localAlpha = alpha;

  for (var i = 0; i < aOptions.length; i++) {
    var worst = INF;

    for (var j = 0; j < bOptions.length; j++) {
      var child = simulationStep(sim, aOptions[i], bOptions[j]);
      var value = searchValue(
        child,
        depth - 1,
        localAlpha,
        control
      );

      if (control.failed) return 0;
      if (value < worst) worst = value;
      if (worst <= localAlpha) break;
    }

    if (worst > best) best = worst;
    if (best > localAlpha) localAlpha = best;
  }

  return best;
}

function searchDuelRoot(sim, depth, order, control) {
  var bOptions = simulationOptions(sim, 1);
  var bestValue = -INF;
  var bestMove = order[0];
  var alpha = -INF;

  for (var i = 0; i < order.length; i++) {
    if (Date.now() > control.deadline) {
      control.failed = true;
      break;
    }

    var worst = INF;

    for (var j = 0; j < bOptions.length; j++) {
      var child = simulationStep(sim, order[i], bOptions[j]);
      var value = searchValue(child, depth - 1, alpha, control);

      if (control.failed) break;
      if (value < worst) worst = value;
      if (worst <= alpha) break;
    }

    if (control.failed) break;

    if (worst > bestValue) {
      bestValue = worst;
      bestMove = order[i];
    }
    if (bestValue > alpha) alpha = bestValue;
  }

  return { move: bestMove, value: bestValue };
}

function searchDuel(sim, order, deadline) {
  var control = {
    deadline: deadline,
    nodes: 0,
    failed: false
  };

  var bestMove = order[0];

  for (var depth = 2; depth <= 4; depth++) {
    if (Date.now() >= deadline - 1) break;

    control.failed = false;
    var result = searchDuelRoot(sim, depth, order, control);

    if (control.failed) break;

    bestMove = result.move;

    if (result.value > 9000000) break;
  }

  return bestMove;
}

function emergencyMove(state) {
  try {
    var me = state.you;
    var w = state.width;
    var h = state.height;

    for (var d = 0; d < 4; d++) {
      var x = me.head.x + DIRS[d].x;
      var y = me.head.y + DIRS[d].y;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;

      var blocked = false;
      var i, j;

      for (i = 0; i < state.hazards.length; i++) {
        if (state.hazards[i].x === x && state.hazards[i].y === y) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      for (i = 0; i < state.snakes.length && !blocked; i++) {
        var body = state.snakes[i].body;
        for (j = 0; j < body.length - 1; j++) {
          if (body[j].x === x && body[j].y === y) {
            blocked = true;
            break;
          }
        }
      }

      if (!blocked) return DIRS[d].name;
    }
  } catch (err) {}

  return 'up';
}

module.exports = { name: 'Basilisk', move };
