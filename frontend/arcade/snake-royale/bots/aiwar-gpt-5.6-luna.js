'use strict';

// Serpent Prime: survival-first territory control with food and collision forecasting.
var DIRECTIONS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'right', dx: 1, dy: 0 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 }
];
var VALID = { up: 1, down: 1, left: 1, right: 1 };

function move(state) {
  try { return choose(state); } catch (e) { return 'up'; }
}

function choose(s) {
  var W = s.width, H = s.height, N = W * H, me = s.you;
  if (!me || !me.head) return 'up';
  var hazards = new Uint8Array(N), occupied = new Uint8Array(N);
  var i, x, y;
  for (i = 0; i < (s.hazards || []).length; i++) {
    x = s.hazards[i].x; y = s.hazards[i].y;
    if (x >= 0 && y >= 0 && x < W && y < H) hazards[y * W + x] = 1;
  }
  var snakes = s.snakes || [], rivals = [];
  for (i = 0; i < snakes.length; i++) {
    var sn = snakes[i];
    if (sn.id !== me.id) rivals.push(sn);
    for (var k = 0; k < (sn.body || []).length; k++) {
      x = sn.body[k].x; y = sn.body[k].y;
      if (x >= 0 && y >= 0 && x < W && y < H) occupied[y * W + x] = 1;
    }
  }

  var best = 'up', bestScore = -1e100;
  for (i = 0; i < DIRECTIONS.length; i++) {
    var d = DIRECTIONS[i], nx = me.head.x + d.dx, ny = me.head.y + d.dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    var p = ny * W + nx, score = 0, fatal = false;
    if (hazards[p]) fatal = true;
    // A non-growing tail normally vacates. Treat our tail and rival tails as soft.
    if (occupied[p]) {
      var hitSelf = false, hitRival = null;
      for (k = 1; k < me.body.length; k++) if (me.body[k].x === nx && me.body[k].y === ny) hitSelf = true;
      for (var r = 0; r < rivals.length; r++) {
        var rb = rivals[r].body || [];
        for (k = 1; k < rb.length; k++) if (rb[k].x === nx && rb[k].y === ny) hitRival = rivals[r];
      }
      if (hitSelf && (me.body.length < 2 || me.body[1].x === nx && me.body[1].y === ny || !(me.body[me.body.length - 1].x === nx && me.body[me.body.length - 1].y === ny && !hasFood(s.food, nx, ny)))) fatal = true;
      if (hitRival && !(hitRival.body.length > 1 && hitRival.body[hitRival.body.length - 1].x === nx && hitRival.body[hitRival.body.length - 1].y === ny && !hasFood(s.food, nx, ny))) fatal = true;
    }
    // A rival of equal or greater length can contest any shared destination.
    for (r = 0; r < rivals.length; r++) {
      var oh = rivals[r].head;
      if (Math.abs(oh.x - nx) + Math.abs(oh.y - ny) === 1 && rivals[r].length >= me.length) score -= 9000;
      if (oh.x === nx && oh.y === ny) fatal = true;
    }
    if (fatal) { score -= 1000000; }

    // Build the post-move body layout. This catches the common long-snake
    // failure mode where a greedy food chase coils into its own body.
    var blocked = new Uint8Array(N), eats = hasFood(s.food, nx, ny);
    for (r = 0; r < rivals.length; r++) {
      var rb2 = rivals[r].body || [];
      for (k = 1; k < rb2.length; k++) {
        var rs = rb2[k];
        if (k === rb2.length - 1 && !hasFood(s.food, rs.x, rs.y)) continue;
        blocked[rs.y * W + rs.x] = 1;
      }
    }
    // Old head becomes a body segment; old tail vanishes unless we eat.
    for (k = 0; k < me.body.length - (eats ? 0 : 1); k++) {
      var os = me.body[k]; blocked[os.y * W + os.x] = 1;
    }
    blocked[p] = 0;
    // Opponent heads can move away, so do not count them as permanent walls.
    for (r = 0; r < rivals.length; r++) {
      oh = rivals[r].head; blocked[oh.y * W + oh.x] = 0;
    }
    var area = flood(W, H, blocked, hazards, nx, ny);
    // A route to our tail is a strong indicator that the move remains unwindable.
    var tailNow = eats ? me.body[me.body.length - 1] : me.body[Math.max(0, me.body.length - 2)];
    var tailCell = tailNow.y * W + tailNow.x;
    if (area.dist[tailCell] < 0) score -= 3000;
    var territory = 0;
    for (var cell = 0; cell < N; cell++) if (area.dist[cell] >= 0) {
      var cx = cell % W, cy = (cell - cx) / W, nearest = 999;
      for (r = 0; r < rivals.length; r++) {
        var q = rivals[r].head;
        var md = Math.abs(cx - q.x) + Math.abs(cy - q.y);
        if (md < nearest) nearest = md;
      }
      if (!rivals.length || area[cell] + 1 < nearest) territory++;
    }
    score += Math.min(area.count, 100) * 14 + territory * 2.2;
    if (area.count < me.length + 2) score -= 7000;

    var foodDist = nearestFood(area, s.food || [], W);
    if (foodDist < 999) {
      var urgency = me.health < 20 ? 170 : me.health < 40 ? 75 : me.health < 65 ? 25 : 7;
      if (foodDist < me.health - 1) score += urgency / (foodDist + 1);
      else score -= 50;
    }
    // Prefer a central safe region as the storm approaches, but never overrule survival.
    var edge = Math.min(nx, ny, W - 1 - nx, H - 1 - ny);
    var turns = (s.nextShrinkTurn || 999) - (s.turn || 0);
    if (turns < 35 || (s.hazards && s.hazards.length)) score -= (Math.abs(nx - (W - 1) / 2) + Math.abs(ny - (H - 1) / 2)) * 3;
    if (edge === 0) score -= turns < 25 ? 500 : 25;
    if (hasFood(s.food, nx, ny)) score += me.health < 75 ? 300 : 35;
    // Mild deterministic tie-breaker: preserve a broad, non-edge route.
    score -= i * 0.001;
    if (score > bestScore) { bestScore = score; best = d.name; }
  }
  return VALID[best] ? best : 'up';
}

function hasFood(food, x, y) {
  for (var i = 0; i < (food || []).length; i++) if (food[i].x === x && food[i].y === y) return true;
  return false;
}

function flood(W, H, blocked, hazards, sx, sy) {
  var N = W * H, dist = new Int16Array(N), q = new Int32Array(N), i;
  for (i = 0; i < N; i++) dist[i] = -1;
  var start = sy * W + sx, head = 0, tail = 0, count = 0;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H || blocked[start] || hazards[start]) return { dist: dist, count: 0 };
  dist[start] = 0; q[tail++] = start;
  while (head < tail) {
    i = q[head++]; count++;
    var x = i % W, y = (i - x) / W;
    var ni;
    if (x > 0) { ni = i - 1; if (!blocked[ni] && !hazards[ni] && dist[ni] < 0) { dist[ni] = dist[i] + 1; q[tail++] = ni; } }
    if (x + 1 < W) { ni = i + 1; if (!blocked[ni] && !hazards[ni] && dist[ni] < 0) { dist[ni] = dist[i] + 1; q[tail++] = ni; } }
    if (y > 0) { ni = i - W; if (!blocked[ni] && !hazards[ni] && dist[ni] < 0) { dist[ni] = dist[i] + 1; q[tail++] = ni; } }
    if (y + 1 < H) { ni = i + W; if (!blocked[ni] && !hazards[ni] && dist[ni] < 0) { dist[ni] = dist[i] + 1; q[tail++] = ni; } }
  }
  return { dist: dist, count: count };
}

function nearestFood(area, food, W) {
  var best = 999;
  for (var i = 0; i < food.length; i++) {
    var f = food[i], d = area.dist[f.y * W + f.x];
    if (d >= 0 && d < best) best = d;
  }
  return best;
}

module.exports = { name: 'Serpent Prime', move: move };
