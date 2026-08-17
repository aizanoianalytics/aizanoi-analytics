(function() {
  const container = document.getElementById('game-snake-container');
  if (!container) return;
  const W = 20, H = 15, CELL = 20;
  let snake, dir, food, score, over, interval;

  function init() {
    snake = [{x: 10, y: 7}, {x: 9, y: 7}, {x: 8, y: 7}];
    dir = {x: 1, y: 0};
    score = 0; over = false;
    if (interval) clearInterval(interval);
    placeFood();
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = W * CELL;
    canvas.height = H * CELL;
    canvas.style.cssText = 'border:2px solid #555;background:#000;display:block;';
    canvas.id = 'snake-canvas';
    canvas.tabIndex = 1;
    container.appendChild(canvas);
    const status = document.createElement('div');
    status.id = 'snake-status';
    status.style.cssText = 'margin-top:8px;font-family:Tahoma,sans-serif;font-size:11px;';
    container.appendChild(status);
    const btn = document.createElement('button');
    btn.textContent = 'New Game';
    btn.style.cssText = 'margin-top:6px;font-family:Tahoma,sans-serif;font-size:11px;padding:4px 12px;';
    btn.onclick = init;
    container.appendChild(btn);
    canvas.focus();
    canvas.addEventListener('keydown', onKey);
    draw();
    interval = setInterval(tick, 130);
  }

  function placeFood() {
    while (true) {
      const x = Math.floor(Math.random() * W);
      const y = Math.floor(Math.random() * H);
      if (!snake.some(s => s.x === x && s.y === y)) { food = { x, y }; return; }
    }
  }

  function tick() {
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= W || head.y >= H) { end(); return; }
    if (snake.some(s => s.x === head.x && s.y === head.y)) { end(); return; }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) { score += 10; placeFood(); }
    else snake.pop();
    draw();
  }

  function onKey(e) {
    const k = e.key;
    if (k === 'ArrowUp' && dir.y !== 1) dir = { x: 0, y: -1 };
    else if (k === 'ArrowDown' && dir.y !== -1) dir = { x: 0, y: 1 };
    else if (k === 'ArrowLeft' && dir.x !== 1) dir = { x: -1, y: 0 };
    else if (k === 'ArrowRight' && dir.x !== -1) dir = { x: 1, y: 0 };
    else if (k === ' ' && over) init();
  }

  function draw() {
    const c = document.getElementById('snake-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    // Food
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4);
    // Snake
    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#0a7c0a' : '#1a5fd6';
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });
    const status = document.getElementById('snake-status');
    if (status) status.textContent = 'Score: ' + score + ' · Arrow keys to move · ' + (over ? 'GAME OVER — press Space or click New' : 'Eat red dots');
  }

  function end() {
    over = true;
    if (interval) clearInterval(interval);
    saveScore('snake', score);
    const status = document.getElementById('snake-status');
    if (status) status.textContent = 'Game over. Score: ' + score + ' · Press Space or New Game';
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