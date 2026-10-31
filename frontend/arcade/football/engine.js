(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FootballEngine = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STEPS_PER_SECOND = 60;
  const PLAYER_RADIUS = 15;
  const BALL_RADIUS = 10;
  const POSTS = [[-420, -65], [-420, 65], [420, -65], [420, 65]];

  function number(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  function action(input) {
    const value = input || {};
    return {
      x: Math.max(-1, Math.min(1, number(value.x, 0))),
      y: Math.max(-1, Math.min(1, number(value.y, 0))),
      kick: value.kick === true
    };
  }

  function mirrorInput(input, team) {
    const value = action(input);
    if (team === 'blue') value.x = -value.x;
    return value;
  }

  function other(team) {
    return team === 'red' ? 'blue' : 'red';
  }

  function compareIds(a, b) {
    if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
    const left = String(a.id);
    const right = String(b.id);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function collide(a, b, radius, inverseA, inverseB) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) return false;
    const nx = distance > 0 ? dx / distance : 1;
    const ny = distance > 0 ? dy / distance : 0;
    const inverse = inverseA + inverseB;
    const overlap = radius - distance;
    a.x -= nx * overlap * inverseA / inverse;
    a.y -= ny * overlap * inverseA / inverse;
    b.x += nx * overlap * inverseB / inverse;
    b.y += ny * overlap * inverseB / inverse;
    const velocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (velocity < 0) {
      const impulse = -1.5 * velocity / inverse;
      a.vx -= impulse * nx * inverseA;
      a.vy -= impulse * ny * inverseA;
      b.vx += impulse * nx * inverseB;
      b.vy += impulse * ny * inverseB;
    }
    return overlap > 0 || velocity < 0;
  }

  function wall(body, axis, limit, bounce) {
    const velocity = axis === 'x' ? 'vx' : 'vy';
    if (body[axis] > limit) {
      body[axis] = limit;
      if (body[velocity] > 0) body[velocity] *= -bounce;
    } else if (body[axis] < -limit) {
      body[axis] = -limit;
      if (body[velocity] < 0) body[velocity] *= -bounce;
    }
  }

  function create(seats, options) {
    options = options || {};
    if (!Array.isArray(seats)) throw new TypeError('Seats must be an array.');
    const ids = new Set();
    const counts = { red: 0, blue: 0 };
    const players = seats.map(function (seat) {
      if (!seat || !['red', 'blue'].includes(seat.team) ||
          !['string', 'number'].includes(typeof seat.id) ||
          (typeof seat.id === 'number' && !Number.isFinite(seat.id)) ||
          ids.has(String(seat.id))) {
        throw new TypeError('Each seat needs a unique id and a valid team.');
      }
      ids.add(String(seat.id));
      counts[seat.team] += 1;
      return {
        id: seat.id, team: seat.team, name: String(seat.name || seat.id),
        x: 0, y: 0, vx: 0, vy: 0, kicking: false,
        heldKick: false, cooldown: 0, lastTouchStep: -1,
        goals: 0, kicks: 0, touches: 0, ownGoals: 0
      };
    });
    if (counts.red < 1 || counts.blue < 1 || counts.red > 4 || counts.blue > 4) {
      throw new RangeError('Each team needs one to four seats.');
    }

    const duration = Math.max(1, Math.round(number(options.time, 120) * 60));
    const scoreLimit = Math.max(0, Math.floor(number(options.scoreLimit, 3)));
    const decisionEvery = Math.max(1, Math.floor(number(options.decisionEvery, 3)));
    if (!Number.isSafeInteger(duration) || !Number.isSafeInteger(scoreLimit) ||
        !Number.isSafeInteger(decisionEvery)) {
      throw new RangeError('Match settings must produce safe integer step counts.');
    }

    // Preserve public roster order, but never use it as a simulation tie-break.
    const squads = {
      red: players.filter(player => player.team === 'red').sort(compareIds),
      blue: players.filter(player => player.team === 'blue').sort(compareIds)
    };
    const canonical = [];
    for (let index = 0; index < 4; index++) {
      if (squads.red[index]) canonical.push(squads.red[index]);
      if (squads.blue[index]) canonical.push(squads.blue[index]);
    }
    const ball = { x: 0, y: 0, vx: 0, vy: 0 };
    const score = { red: 0, blue: 0 };
    let steps = 0;
    let phase = 'kickoff';
    let kickoffTeam = 'red';
    let freeze = 0;
    let ending = null;
    let touches = [];

    function orderedPlayers() {
      return steps % 2 === 1 ? canonical : canonical.slice().reverse();
    }

    function kickoff() {
      phase = 'kickoff';
      freeze = 0;
      Object.assign(ball, { x: 0, y: 0, vx: 0, vy: 0 });
      touches = [];
      for (const team of ['red', 'blue']) {
        const squad = squads[team];
        squad.forEach(function (player, index) {
          const sign = team === 'red' ? -1 : 1;
          player.x = sign * (index === 0 ? 95 : 210 + (index % 2) * 65);
          player.y = index === 0 ? 0 : (index - squad.length / 2) * 85;
          player.vx = 0;
          player.vy = 0;
          player.kicking = false;
          player.heldKick = false;
          player.cooldown = 0;
        });
      }
    }

    function touch(player) {
      if (player.lastTouchStep !== steps) {
        player.touches += 1;
        player.lastTouchStep = steps;
      }
      const previous = touches[touches.length - 1];
      if (previous && previous.id === player.id) {
        previous.step = steps;
      } else {
        touches.push({ id: player.id, team: player.team, step: steps });
        touches = touches.slice(-2);
      }
      if (phase === 'kickoff' && player.team === kickoffTeam) phase = 'play';
    }

    function restrictPlayer(player) {
      wall(player, 'x', 435, 0.5);
      wall(player, 'y', 215, 0.5);
      if (phase !== 'kickoff' || player.team === kickoffTeam) return;
      const sign = player.team === 'red' ? -1 : 1;
      if (player.x * sign < PLAYER_RADIUS) {
        player.x = sign * PLAYER_RADIUS;
        if (player.vx * sign < 0) player.vx = 0;
      }
      const distance = Math.hypot(player.x, player.y);
      const exclusion = 70 + PLAYER_RADIUS;
      if (distance < exclusion) {
        const nx = distance > 0 ? player.x / distance : sign;
        const ny = distance > 0 ? player.y / distance : 0;
        player.x = nx * exclusion;
        player.y = ny * exclusion;
        const inward = player.vx * nx + player.vy * ny;
        if (inward < 0) {
          player.vx -= inward * nx;
          player.vy -= inward * ny;
        }
      }
    }

    function ballWalls(events) {
      for (const point of POSTS) {
        const post = { x: point[0], y: point[1], vx: 0, vy: 0 };
        if (collide(post, ball, 18, 0, 1) &&
            !events.some(event => event.type === 'post' &&
              event.x === post.x && event.y === post.y)) {
          events.push({ type: 'post', x: post.x, y: post.y });
        }
      }
      if (Math.abs(ball.y) >= 65) wall(ball, 'x', 410, 0.5);
      if (Math.abs(ball.x) <= 420) {
        wall(ball, 'y', 190, 0.5);
      } else {
        wall(ball, 'y', 55, 0.5);
        wall(ball, 'x', 450, 0.5);
      }
    }

    function goal(events) {
      if (Math.abs(ball.x) <= 430 || Math.abs(ball.y) > 55) return;
      const team = ball.x > 0 ? 'red' : 'blue';
      score[team] += 1;
      const last = touches[touches.length - 1];
      const previous = touches[touches.length - 2];
      const scorer = last ? players.find(player => player.id === last.id) : null;
      const ownGoal = Boolean(scorer && scorer.team !== team);
      if (scorer) {
        if (ownGoal) scorer.ownGoals += 1;
        else scorer.goals += 1;
      }
      events.push({
        type: 'goal', team, scorer: scorer ? scorer.id : null, ownGoal,
        assist: !ownGoal && previous && previous.team === team ? previous.id : null,
        score: { red: score.red, blue: score.blue }
      });
      phase = 'goal';
      freeze = 90;
      kickoffTeam = other(team);
      if (scoreLimit > 0 && score[team] >= scoreLimit) ending = 'score-limit';
    }

    function move(inputs) {
      for (const player of canonical) {
        const input = action(inputs && Object.hasOwn(inputs, player.id) ? inputs[player.id] : null);
        const length = Math.hypot(input.x, input.y);
        const scale = length > 0 ? 1 / length : 0;
        const acceleration = input.kick ? 0.07 : 0.11;
        player.vx = (player.vx + input.x * scale * acceleration) * 0.96;
        player.vy = (player.vy + input.y * scale * acceleration) * 0.96;
        player.kicking = input.kick;
        player.cooldown = Math.max(0, player.cooldown - 1);
        restrictPlayer(player);
      }
      ball.vx *= 0.99;
      ball.vy *= 0.99;
    }

    function contacts() {
      const order = orderedPlayers();
      for (let pass = 0; pass < 4; pass += 1) {
        for (let i = 0; i < order.length; i += 1) {
          for (let j = i + 1; j < order.length; j += 1) {
            collide(order[i], order[j], 30, 0.5, 0.5);
          }
        }
        for (const player of order) restrictPlayer(player);
        for (const player of order) {
          if (phase === 'kickoff' && player.team !== kickoffTeam) continue;
          if (collide(player, ball, 25, 0.5, 1)) touch(player);
        }
        for (const player of order) restrictPlayer(player);
      }
    }

    function kicks(events) {
      const eligible = [];
      const kickoff = phase === 'kickoff';
      // All kick directions/ranges use the same pre-kick ball position.
      for (const player of orderedPlayers()) {
        const rising = player.kicking && !player.heldKick;
        const ready = rising || player.cooldown === 0;
        if (player.kicking && ready && !(kickoff && player.team !== kickoffTeam)) {
          const dx = ball.x - player.x;
          const dy = ball.y - player.y;
          const distance = Math.hypot(dx, dy);
          if (distance <= 29) {
            eligible.push({
              player,
              nx: distance > 0 ? dx / distance : (player.team === 'red' ? 1 : -1),
              ny: distance > 0 ? dy / distance : 0
            });
          }
        }
        player.heldKick = player.kicking;
      }
      for (const item of eligible) {
        const player = item.player;
        ball.vx += item.nx * 5;
        ball.vy += item.ny * 5;
        player.cooldown = 10;
        player.kicks += 1;
        touch(player);
        events.push({ type: 'kick', player: player.id, x: ball.x, y: ball.y });
      }
    }

    function integrate(events) {
      // Re-evaluate after contacts transfer momentum. Every body travels at
      // most four pitch units per slice; damping/acceleration occur only once.
      let remaining = 1;
      while (remaining > 1e-12 && phase !== 'goal') {
        let speed = Math.hypot(ball.vx, ball.vy);
        for (const player of canonical) {
          speed = Math.max(speed, Math.hypot(player.vx, player.vy));
        }
        const fraction = Math.min(remaining, 4 / Math.max(4, speed));
        for (const player of canonical) {
          player.x += player.vx * fraction;
          player.y += player.vy * fraction;
          restrictPlayer(player);
        }
        ball.x += ball.vx * fraction;
        ball.y += ball.vy * fraction;
        contacts();
        ballWalls(events);
        goal(events);
        remaining -= fraction;
      }
    }

    function step(inputs) {
      if (ending) return [];
      const events = [];
      steps += 1;
      if (phase === 'goal') {
        freeze -= 1;
        if (freeze === 0) {
          kickoff();
          events.push({ type: 'kickoff', team: kickoffTeam });
        }
      } else {
        move(inputs);
        integrate(events);
        if (phase !== 'goal') kicks(events);
      }
      if (!ending && steps >= duration) ending = 'time';
      return events;
    }

    function state() {
      return {
        step: steps,
        timeLeft: Math.max(0, (duration - steps) / 60),
        phase,
        score: { red: score.red, blue: score.blue },
        ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy },
        players: players.map(function (player) {
          return {
            id: player.id, team: player.team, name: player.name,
            x: player.x, y: player.y, vx: player.vx, vy: player.vy,
            kicking: player.kicking, heldKick: player.heldKick,
            kickCooldown: player.cooldown,
            goals: player.goals, kicks: player.kicks,
            touches: player.touches, ownGoals: player.ownGoals
          };
        }),
        kickoffTeam,
        goalFreezeSteps: freeze,
        lastTouches: touches.map(entry => ({ ...entry })),
        rules: {
          stepsPerSecond: STEPS_PER_SECOND,
          time: duration / 60,
          scoreLimit,
          decisionEvery
        }
      };
    }

    function botState(id) {
      const player = players.find(entry => entry.id === id);
      if (!player) throw new RangeError('Unknown player id.');
      const snapshot = state();
      if (player.team === 'blue') {
        for (const body of [snapshot.ball].concat(snapshot.players)) {
          body.x = -body.x;
          body.vx = -body.vx;
        }
      }
      snapshot.you = snapshot.players.find(entry => entry.id === id);
      snapshot.team = player.team;
      snapshot.teammates = snapshot.players.filter(entry =>
        entry.team === player.team && entry.id !== id);
      snapshot.opponents = snapshot.players.filter(entry => entry.team !== player.team);
      snapshot.field = {
        width: 840, height: 400, goalWidth: 130, playerRadius: 15,
        ballRadius: 10, kickRange: 29, ownGoalX: -420, enemyGoalX: 420,
        outerMargin: 30, goalDepth: 40, postRadius: 8, centreCircleRadius: 70
      };
      return snapshot;
    }

    function result() {
      if (!ending) return null;
      return {
        winner: score.red === score.blue ? null : (score.red > score.blue ? 'red' : 'blue'),
        score: { red: score.red, blue: score.blue }, reason: ending, steps,
        players: players.map(function (player) {
          return {
            id: player.id, team: player.team, name: player.name,
            goals: player.goals, kicks: player.kicks, touches: player.touches,
            ownGoals: player.ownGoals
          };
        })
      };
    }

    kickoff();
    return Object.freeze({
      step, state, botState, result,
      finished: function () { return ending !== null; },
      get steps() { return steps; }
    });
  }

  return Object.freeze({ create, STEPS_PER_SECOND, mirrorInput });
}));
