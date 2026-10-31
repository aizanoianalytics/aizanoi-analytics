'use strict';

module.exports = function decide(state) {
    const you = state.you;
    const ball = state.ball;
    const field = state.field;

    const dx = ball.x - you.x;
    const dy = ball.y - you.y;
    const distance = Math.hypot(dx, dy);

    let moveX = 0;
    let moveY = 0;
    let kick = false;

    // Kickoff phase: our team has the kickoff
    if (state.phase === 'kickoff' && state.kickoffTeam === state.team) {
        // Move toward ball and kick if in range
        if (distance > 0 && distance <= field.kickRange && you.kickCooldown === 0) {
            kick = true;
        }
        if (distance > 0) {
            const speed = Math.min(1, distance / 60);
            moveX = (dx / distance) * speed;
            moveY = (dy / distance) * speed;
        }
    } else if (state.phase === 'kickoff') {
        // Opponent's kickoff - move toward ball to get position
        if (distance > 0) {
            const speed = Math.min(1, distance / 80);
            moveX = (dx / distance) * speed;
            moveY = (dy / distance) * speed;
        }
    } else {
        // Play phase

        // Check if ball is near our goal (danger)
        const ballNearOwnGoal = ball.x < -350 && Math.abs(ball.y) < 60;
        // Check if ball is near enemy goal (opportunity)
        const ballNearEnemyGoal = ball.x > 350 && Math.abs(ball.y) < 60;

        if (ballNearOwnGoal) {
            // Emergency: clear the ball away from our goal
            moveX = 0.5;
            moveY = -ball.y * 0.3;
            if (you.kickCooldown === 0 && distance <= field.kickRange) {
                kick = true;
            }
        } else if (ballNearEnemyGoal) {
            // Offensive: go for shot on goal
            if (you.kickCooldown === 0 && distance <= field.kickRange) {
                kick = true;
            }
        } else {
            // General play: go toward ball
            if (distance > 50) {
                if (distance > 0) {
                    moveX = dx / distance;
                    moveY = dy / distance;
                }
            } else if (distance > 20) {
                // Medium distance - position for shot angle
                const targetX = 350;
                const targetY = 0;
                const toTargetX = targetX - you.x;
                const toTargetY = targetY - you.y;
                const targetDist = Math.hypot(toTargetX, toTargetY);
                if (targetDist > 0) {
                    moveX = toTargetX / targetDist;
                    moveY = toTargetY / targetDist;
                }
            } else {
                // Close to ball - shoot if cooldown allows, else position for shot
                if (you.kickCooldown === 0 && distance <= field.kickRange) {
                    kick = true;
                } else {
                    // Position for best shot angle toward enemy goal
                    const goalCenterX = 420;
                    const goalCenterY = 0;
                    const toGoalX = goalCenterX - you.x;
                    const toGoalY = goalCenterY - you.y;
                    const goalDist = Math.hypot(toGoalX, toGoalY);
                    if (goalDist > 0) {
                        moveX = toGoalX / goalDist;
                        moveY = toGoalY / goalDist;
                    }
                }
            }
        }
    }

    // Clamp movement values to [-1, 1]
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    moveX = clamp(moveX);
    moveY = clamp(moveY);
    kick = !!kick;

    return { x: moveX, y: moveY, kick };
};