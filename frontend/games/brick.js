(function() {
  const container = document.getElementById('game-brick-container');
  if (!container) return;
  const W = 400, H = 300, PADDLE_W = 70, PADDLE_H = 10, BALL_R = 6;
  let paddleX, ballX, ballY, ballDX, ballDY, bricks, score, lives, over, interval;

  function init() {
    paddleX = (W - PADDLE_W) / 2;
    ballX = W / 2; ballY = H - 30;
    ballDX = 3; ballDY = -3;
    score = 0; lives = 3; over = false;
    if (interval) clearInterval(interval);
    bricks = [];
    const rows = 5, cols = 8;
    const bw = (W - 20) / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      bricks.push({ x: 10 + c * bw, y: 30 + r * 18, w: bw - 2, h: 14, alive: true, color: ['#cc0000','#ff7820','#0a7c0a','#1a5fd6','#800000'][r] });
    }
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'border:2px solid #555;background:#000;display:block;';
    canvas.id = 'brick-canvas';
    canvas.tabIndex = 1;
    container.appendChild(canvas);
    const status = document.createElement('div');
    status.id = 'brick-status';
    status.style.cssText = 'margin-top:8px;font-family:Tahoma,sans-serif;font-size:11px;';
    container.appendChild(status);
    const btn = document.createElement('button');
    btn.textContent = 'New Game';
    btn.style.cssText = 'margin-top:6px;font-family:Tahoma,sans-serif;font-size:11px;padding:4px 12px;';
    btn.onclick = init;
    container.appendChild(btn);
    canvas.focus();
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('mousemove', onMouse);
    draw();
    interval = setInterval(tick, 16);
  }

  function onKey(e) {
    if (e.key === 'ArrowLeft' && paddleX > 0) paddleX -= 20;
    if (e.key === 'ArrowRight' && paddleX < W - PADDLE_W) paddleX += 20;
    if (e.key === ' ' && over) init();
  }

  function onMouse(e) {
    const c = e.currentTarget;
    const rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    paddleX = Math.max(0, Math.min(W - PADDLE_W, x - PADDLE_W / 2));
  }

  function tick() {
    if (over) return;
    ballX += ballDX;
    ballY += ballDY;
    if (ballX < BALL_R) { ballX = BALL_R; ballDX = -ballDX; }
    if (ballX > W - BALL_R) { ballX = W - BALL_R; ballDX = -ballDX; }
    if (ballY < BALL_R) { ballY = BALL_R; ballDY = -ballDY; }
    // Paddle
    if (ballY > H - 30 - BALL_R && ballY < H - 10 &&
        ballX > paddleX && ballX < paddleX + PADDLE_W) {
      ballDY = -Math.abs(ballDY);
      ballDX = ((ballX - paddleX) / PADDLE_W - 0.5) * 6;
    }
    // Brick collision
    for (const b of bricks) {
      if (!b.alive) continue;
      if (ballX > b.x && ballX < b.x + b.w && ballY > b.y && ballY < b.y + b.h) {
        b.alive = false;
        ballDY = -ballDY;
        score += 10;
        break;
      }
    }
    // Win?
    if (bricks.every(b => !b.alive)) end(true);
    // Lose ball
    if (ballY > H) {
      lives--;
      if (lives <= 0) end(false);
      else { ballX = W / 2; ballY = H - 30; ballDX = 3; ballDY = -3; paddleX = (W - PADDLE_W) / 2; }
    }
    draw();
  }

  function draw() {
    const c = document.getElementById('brick-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // Bricks
    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(b.x, b.y, b.w, 2);
    }
    // Paddle
    ctx.fillStyle = '#1a5fd6';
    ctx.fillRect(paddleX, H - 20, PADDLE_W, PADDLE_H);
    // Ball
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    const status = document.getElementById('brick-status');
    if (status) status.textContent = 'Score: ' + score + ' · Lives: ' + lives + ' · Arrow keys or mouse to move paddle' + (over ? ' · GAME OVER — press Space or New' : '');
  }

  function end(won) {
    over = true;
    if (interval) clearInterval(interval);
    saveScore('brick', score);
  }

  function saveScore(game, score) {
    try {
      const key = 'aizanoi-games';
      const scores = JSON.parse(localStorage.getItem(key) || '{}');
      if (!scores[game]) scores[game] = [];
      scores[game].push({ score, at: new Date().toISOString() });
      if (scores[game].length > 20) scores[game] = scores[game].slice(-20);
      localStorage.setItem(key, JSON.stringify(scores));
    } catch(e) {}
  }

  init();
})();