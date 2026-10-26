// Ouroboros — survival-first Snake Royale bot.
// Ideas: flood-fill reachable space (never enter pockets smaller than body),
// length-aware head-to-head logic (dodge longer heads, pressure shorter ones),
// hunger + growth aware food seeking, storm-aware centre control, loop breaking.
var lastMove = 'up';
var posHist = [];

function move(state) {
  try {
    var m = decide(state);
    lastMove = m;
    return m;
  } catch (e) {
    return lastMove || 'up';
  }
}

function decide(state) {
  var W = state.width, H = state.height, turn = state.turn, you = state.you;
  var hx = you.head.x, hy = you.head.y, myLen = you.length, myHealth = you.health;
  var DX = { up: 0, down: 0, left: -1, right: 1 };
  var DY = { up: -1, down: 1, left: 0, right: 0 };
  var moves = ['up', 'down', 'left', 'right'];

  var i, j, k;
  var foodSet = {};
  for (i = 0; i < state.food.length; i++) foodSet[state.food[i].x + ',' + state.food[i].y] = 1;
  var hz = {};
  for (i = 0; i < state.hazards.length; i++) hz[state.hazards[i].x + ',' + state.hazards[i].y] = 1;

  // current storm ring: hazard cells are exactly those with depth < ring
  var ring = 0;
  while (hz[ring + ',' + ring]) ring++;

  function inB(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function dep(x, y) {
    var a = x < W - 1 - x ? x : W - 1 - x;
    var b = y < H - 1 - y ? y : H - 1 - y;
    return a < b ? a : b;
  }

  var enemies = [];
  for (i = 0; i < state.snakes.length; i++) {
    if (state.snakes[i].id !== you.id) enemies.push(state.snakes[i]);
  }

  // Pessimistic tails: if an enemy head sits next to food it may eat (tail stays).
  var tailStays = {};
  for (i = 0; i < state.snakes.length; i++) {
    var s = state.snakes[i];
    var adj = false;
    if (foodSet[(s.head.x + 1) + ',' + s.head.y] || foodSet[(s.head.x - 1) + ',' + s.head.y] ||
        foodSet[s.head.x + ',' + (s.head.y + 1)] || foodSet[s.head.x + ',' + (s.head.y - 1)]) adj = true;
    tailStays[s.id] = adj;
  }

  var longerCount = 0;
  for (i = 0; i < enemies.length; i++) if (enemies[i].length > myLen) longerCount++;

  var hunger = myHealth < 25 ? 1 : (myHealth < 55 ? 0.65 : 0.28);
  if (longerCount > 0) hunger = Math.min(1, hunger + 0.3); // need growth to win head-ons

  var shrinkIn = state.nextShrinkTurn - turn;
  var late = turn / 120;
  if (late > 1) late = 1;
  if (ring > 0 || shrinkIn < 15) late = 1;

  var cx = (W - 1) / 2, cy = (H - 1) / 2;

  // nearest weaker-enemy distance from current head (for hunt bonus)
  var prevWeakDist = 9999, weakDiff = 0;
  for (i = 0; i < enemies.length; i++) {
    var e0 = enemies[i];
    if (e0.length < myLen) {
      var d0 = Math.abs(e0.head.x - hx) + Math.abs(e0.head.y - hy);
      if (d0 < prevWeakDist) { prevWeakDist = d0; weakDiff = myLen - e0.length; }
    }
  }

  var recent = {};
  var rh0 = posHist.length - 10;
  if (rh0 < 0) rh0 = 0;
  for (i = rh0; i < posHist.length; i++) recent[posHist[i]] = 1;

  var best = moves[0], bestScore = -1e18;
  var bestSafe = false;

  for (k = 0; k < 4; k++) {
    var m = moves[k];
    var nx = hx + DX[m], ny = hy + DY[m];
    var key = nx + ',' + ny;
    var eats = foodSet[key] ? 1 : 0;

    // occupancy next turn. Safety check is pessimistic (a tail that may stay
    // kills us if we step on it); flood fill is optimistic (tails usually
    // vacate, so they still connect space).
    var blocked = {}, open = {};
    for (i = 0; i < state.snakes.length; i++) {
      var sn = state.snakes[i];
      var keep = (sn.id === you.id) ? (eats === 1) : tailStays[sn.id];
      var keepOpen = (sn.id === you.id) ? (eats === 1) : false;
      var n = sn.body.length;
      for (j = 0; j < n; j++) {
        var cell = sn.body[j].x + ',' + sn.body[j].y;
        if (j === n - 1 && !keep) { /* vacates: free in both */ }
        else blocked[cell] = 1;
        if (j === n - 1 && !keepOpen) { /* vacates: free in both */ }
        else open[cell] = 1;
      }
    }

    var safe = inB(nx, ny) && !hz[key] && !blocked[key];
    var score;
    if (!safe) {
      // last resort ranking: prefer staying on board / off hazard over body hits
      score = -1e9 + (inB(nx, ny) ? 100 : 0) + (!hz[key] ? 10 : 0);
      if (score > bestScore && !bestSafe) { bestScore = score; best = m; }
      continue;
    }

    // flood fill from candidate
    var qx = [nx], qy = [ny], qd = [0], qh = 0;
    var seen = {};
    seen[key] = 1;
    var area = 0, foodDist = -1;
    while (qh < qx.length) {
      var px = qx[qh], py = qy[qh], pd = qd[qh];
      qh++;
      area++;
      if (foodDist < 0 && foodSet[px + ',' + py]) foodDist = pd;
      // 4 neighbours (flood uses optimistic occupancy: tails vacate)
      if (px + 1 < W) {
        var k1 = (px + 1) + ',' + py;
        if (!seen[k1] && !hz[k1] && !open[k1]) { seen[k1] = 1; qx.push(px + 1); qy.push(py); qd.push(pd + 1); }
      }
      if (px - 1 >= 0) {
        var k2 = (px - 1) + ',' + py;
        if (!seen[k2] && !hz[k2] && !open[k2]) { seen[k2] = 1; qx.push(px - 1); qy.push(py); qd.push(pd + 1); }
      }
      if (py + 1 < H) {
        var k3 = px + ',' + (py + 1);
        if (!seen[k3] && !hz[k3] && !open[k3]) { seen[k3] = 1; qx.push(px); qy.push(py + 1); qd.push(pd + 1); }
      }
      if (py - 1 >= 0) {
        var k4 = px + ',' + (py - 1);
        if (!seen[k4] && !hz[k4] && !open[k4]) { seen[k4] = 1; qx.push(px); qy.push(py - 1); qd.push(pd + 1); }
      }
    }

    if (area < myLen) {
      score = -10000 + area * 5; // doomed pocket: avoid unless everything is doomed
    } else {
      score = (area < 80 ? area : 80) * 8;
      if (area < myLen + 4) score -= (myLen + 4 - area) * 40; // tight squeeze

      // head-to-head threat: enemy head adjacent to our target cell
      var threat = 0, pressure = 0;
      for (i = 0; i < enemies.length; i++) {
        var en = enemies[i];
        var ed = Math.abs(en.head.x - nx) + Math.abs(en.head.y - ny);
        if (ed === 1) {
          if (en.length >= myLen) threat += (en.length === myLen ? 2 : 3);
          else pressure += (myLen - en.length);
        }
      }
      if (threat > 0) score -= 3000 * threat;
      else if (pressure > 0) score += 20 + pressure * 10; // we are the danger: constrain them

      // hunt weaker heads when healthy and spacious
      if (prevWeakDist < 9999 && myHealth > 35 && area > myLen + 6) {
        var nd = 9999;
        for (i = 0; i < enemies.length; i++) {
          var e2 = enemies[i];
          if (e2.length < myLen) {
            var dd = Math.abs(e2.head.x - nx) + Math.abs(e2.head.y - ny);
            if (dd < nd) nd = dd;
          }
        }
        if (nd < prevWeakDist) score += Math.min(30, weakDiff * 6 + 6);
      }

      // food: hungry snakes chase, full snakes only take free meals
      if (foodDist >= 0) {
        var fs = (34 - foodDist * 2) * hunger * 6;
        // contest check (manhattan proxy): longer rivals win races and set traps,
        // so give them a wide margin; equals raced tightly; shortlings ignored.
        var contested = false, trappedMeal = false;
        for (i = 0; i < state.food.length; i++) {
          var f = state.food[i];
          var dN = Math.abs(f.x - nx) + Math.abs(f.y - ny);
          if (dN <= foodDist + 1) {
            for (var t = 0; t < enemies.length; t++) {
              var de = Math.abs(enemies[t].head.x - f.x) + Math.abs(enemies[t].head.y - f.y);
              if (enemies[t].length > myLen) {
                if (de <= dN + 2) contested = true;
                if (de <= 2) trappedMeal = true;
              } else if (enemies[t].length === myLen) {
                if (de <= dN) contested = true;
                if (de <= 1) trappedMeal = true;
              }
            }
          }
        }
        if (contested && hunger < 0.6) fs *= 0.2;
        else if (contested) fs *= 0.5;
        if (trappedMeal && hunger < 0.9) fs *= 0.3;
        if (fs < 0) fs = 0;
        score += fs;
      }
      if (eats) {
        score += 60 + (100 - myHealth) * 1.2;
        if (longerCount > 0) score += 40;
      }

      // centre control, ramps up into the late game / storm
      var dc = Math.abs(nx - cx) + Math.abs(ny - cy);
      score -= dc * (1.5 + late * 4);
      if (dep(nx, ny) === 0) score -= 8; // early wall-hug caution

      // storm: don't stand on a ring that is about to close
      if (dep(nx, ny) === ring && ring > 0) {
        if (shrinkIn <= 1) score -= 500;
        else if (shrinkIn <= 4) score -= 120;
        else if (shrinkIn <= 10) score -= 30;
      } else if (dep(nx, ny) === ring && shrinkIn <= 2) {
        score -= 120;
      }

      if (recent[key]) score -= 25; // break loops
      score += Math.random() * 3;
    }

    if (!bestSafe || score > bestScore) {
      bestScore = score;
      best = m;
      bestSafe = true;
    }
  }

  posHist.push(hx + ',' + hy);
  if (posHist.length > 40) posHist.splice(0, posHist.length - 40);
  return best;
}

module.exports = { name: 'Ouroboros', move };
