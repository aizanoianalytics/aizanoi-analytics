const dirs = [
    {name: 'up', dx: 0, dy: -1},
    {name: 'down', dx: 0, dy: 1},
    {name: 'left', dx: -1, dy: 0},
    {name: 'right', dx: 1, dy: 0}
];

function evaluateMove(startX, startY, grid, W, H, foodSet, targetX, targetY) {
    const dist = new Int16Array(W * H).fill(-1);
    const queue = [startY * W + startX];
    dist[startY * W + startX] = 0;
    let count = 0;
    let head = 0;

    let minFoodDist = Infinity;
    let minCenterDist = Infinity;

    while(head < queue.length) {
        const curr = queue[head++];
        count++;
        const d = dist[curr];

        if (foodSet.has(curr) && d < minFoodDist) {
            minFoodDist = d;
        }

        const cx = curr % W;
        const cy = (curr - cx) / W;
        const centerDist = Math.abs(cx - targetX) + Math.abs(cy - targetY);
        if (centerDist < minCenterDist) {
            minCenterDist = centerDist;
        }

        if (cy > 0) {
            const nidx = curr - W;
            if (!grid[nidx] && dist[nidx] === -1) {
                dist[nidx] = d + 1;
                queue.push(nidx);
            }
        }
        if (cy < H - 1) {
            const nidx = curr + W;
            if (!grid[nidx] && dist[nidx] === -1) {
                dist[nidx] = d + 1;
                queue.push(nidx);
            }
        }
        if (cx > 0) {
            const nidx = curr - 1;
            if (!grid[nidx] && dist[nidx] === -1) {
                dist[nidx] = d + 1;
                queue.push(nidx);
            }
        }
        if (cx < W - 1) {
            const nidx = curr + 1;
            if (!grid[nidx] && dist[nidx] === -1) {
                dist[nidx] = d + 1;
                queue.push(nidx);
            }
        }
    }
    return { count, minFoodDist, minCenterDist };
}

function getMoveScore(evalData, state, myLen, myHealth) {
    let score = 0;

    // Heavily penalize moves that trap us in a space smaller than our body
    if (evalData.count < myLen) {
        score -= 10000;
    }
    score += evalData.count * 10;

    // Food weighting based on health urgency
    if (evalData.minFoodDist !== Infinity) {
        let foodWeight = 2;
        if (myHealth < 40) foodWeight = 10;
        else if (myHealth < 70) foodWeight = 5;
        score += Math.max(0, 50 - evalData.minFoodDist) * foodWeight;
    }

    // Storm awareness: move to center as shrink approaches
    let centerWeight = 2;
    if (state.turn >= 130) {
        const turnsToShrink = state.nextShrinkTurn - state.turn;
        if (turnsToShrink <= 10 && turnsToShrink >= 0) {
            centerWeight += (10 - turnsToShrink) * 3;
        }
    }
    score += Math.max(0, 30 - evalData.minCenterDist) * centerWeight;

    return score;
}

function getPrimaryMoves(head, grid, danger, W, H) {
    const moves = [];
    for (const d of dirs) {
        const nx = head.x + d.dx;
        const ny = head.y + d.dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
            const idx = ny * W + nx;
            if (grid[idx] === 0 && danger[idx] === 0) {
                moves.push({ dir: d.name, x: nx, y: ny });
            }
        }
    }
    return moves;
}

function move(state) {
    const W = state.width;
    const H = state.height;
    const myLen = state.you.length;
    const myHealth = state.you.health;

    const grid = new Uint8Array(W * H);
    const danger = new Uint8Array(W * H);

    // 1. Map hazards
    for (const h of state.hazards) {
        grid[h.y * W + h.x] = 1;
    }

    // 2. Map all snake bodies (conservative approach: block all current segments)
    for (const s of state.snakes) {
        for (let i = 0; i < s.body.length; i++) {
            grid[s.body[i].y * W + s.body[i].x] = 1;
        }
    }

    // 3. Map danger zones (avoid head-to-head with longer/equal snakes)
    for (const s of state.snakes) {
        if (s.id === state.you.id) continue;
        const hx = s.head.x;
        const hy = s.head.y;
        for (const d of dirs) {
            const nx = hx + d.dx;
            const ny = hy + d.dy;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                if (s.length >= myLen) {
                    danger[ny * W + nx] = 1;
                }
            }
        }
    }

    // Get safe moves
    let possibleMoves = getPrimaryMoves(state.you.head, grid, danger, W, H);

    // Fallback 1: Ignore danger zones if trapped
    if (possibleMoves.length === 0) {
        possibleMoves = getPrimaryMoves(state.you.head, grid, new Uint8Array(W * H), W, H);
    }

    // Fallback 2: Unblock tails and heads (desperation mode)
    if (possibleMoves.length === 0) {
        const grid2 = new Uint8Array(grid);
        for (const s of state.snakes) {
            if (s.body.length > 0) {
                const tail = s.body[s.body.length - 1];
                grid2[tail.y * W + tail.x] = 0;
            }
            grid2[s.head.y * W + s.head.x] = 0;
        }
        possibleMoves = getPrimaryMoves(state.you.head, grid2, new Uint8Array(W * H), W, H);
    }

    // Fallback 3: Absolute last resort (avoid syntax/timeout errors)
    if (possibleMoves.length === 0) {
        for (const d of dirs) {
            const nx = state.you.head.x + d.dx;
            const ny = state.you.head.y + d.dy;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                let isHazard = false;
                for (const h of state.hazards) {
                    if (h.x === nx && h.y === ny) { isHazard = true; break; }
                }
                if (!isHazard) return d.name;
            }
        }
        return 'up';
    }

    // Setup evaluation constants
    const foodSet = new Set();
    for (const f of state.food) foodSet.add(f.y * W + f.x);
    const targetX = (W - 1) / 2;
    const targetY = (H - 1) / 2;

    let bestMove = possibleMoves[0];
    let bestScore = -Infinity;

    // Evaluate and score each possible move
    for (const m of possibleMoves) {
        const evalData = evaluateMove(m.x, m.y, grid, W, H, foodSet, targetX, targetY);
        let score = getMoveScore(evalData, state, myLen, myHealth);

        // Hunt bonus: position adjacent to shorter snakes to force advantageous collisions or trap them
        for (const s of state.snakes) {
            if (s.id === state.you.id) continue;
            if (s.length < myLen) {
                const hx = s.head.x;
                const hy = s.head.y;
                if (Math.abs(m.x - hx) + Math.abs(m.y - hy) === 1) {
                     score += 50;
                }
            }
        }

        // Safety net: heavily penalize reversing into our own neck
        if (state.you.body.length > 1) {
            const neck = state.you.body[1];
            if (m.x === neck.x && m.y === neck.y) {
                score -= 100000;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMove = m;
        }
    }

    return bestMove.dir;
}

module.exports = { name: 'ApexPredator', move };
