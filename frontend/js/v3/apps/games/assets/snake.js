(function() {
  const container = document.getElementById('game-snake-container');
  if (!container) return;

  const W = 20, H = 15, CELL = 20;
  let snake, dir, pendingDir, food, score, over, interval, pulse = 0, paused = false;

  function init() {
    snake = [{x:10,y:7},{x:9,y:7},{x:8,y:7}];
    dir = pendingDir = {x:1,y:0};
    score = 0; over = false; pulse = 0; paused = false;
    if (interval) clearInterval(interval);
    placeFood();

    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px;background:linear-gradient(145deg,#dbe4ef,#bbc8d8);border:1px solid #8b9aad;box-shadow:inset 1px 1px #fff;max-width:100%;overflow:auto;';

    const shell = document.createElement('div');
    shell.style.cssText = 'width:min(100%,420px);background:#0b1321;border:3px solid #43546c;border-radius:8px;padding:8px;box-shadow:inset 0 0 0 2px #111b2b,0 5px 14px rgba(0,0,0,.18);';
    const bar = document.createElement('div');
    bar.style.cssText = 'height:30px;display:flex;align-items:center;justify-content:space-between;padding:0 5px;color:#dcecff;font:700 11px Tahoma,sans-serif;letter-spacing:.05em;';
    bar.innerHTML = '<span>AIZANOI SNAKE</span><span id="snake-score">0000</span>';
    shell.appendChild(bar);

    const canvas = document.createElement('canvas');
    canvas.width = W * CELL; canvas.height = H * CELL;
    canvas.id = 'snake-canvas'; canvas.tabIndex = 0;
    canvas.setAttribute('aria-label','Snake game. Use arrow keys, or tap the playfield in the direction you want to turn.');
    canvas.style.cssText = 'width:100%;height:auto;aspect-ratio:4/3;background:#07111d;display:block;border:1px solid #4d6580;border-radius:3px;image-rendering:auto;touch-action:none;';
    shell.appendChild(canvas);
    container.appendChild(shell);

    const status = document.createElement('div');
    status.id = 'snake-status';
    status.style.cssText = 'width:min(100%,420px);padding:7px 9px;background:#eef4fb;border:1px solid #9daabd;color:#27384f;font:11px/1.35 Tahoma,sans-serif;';
    container.appendChild(status);
    if (window.AizanoiGames) container.appendChild(window.AizanoiGames.toolbar({ game:'snake', onPause:togglePause, onRestart:init }));

    const btn = document.createElement('button');
    btn.textContent = 'New Game';
    btn.type = 'button';
    btn.style.cssText = 'min-height:38px;padding:7px 16px;border:1px solid #6f7ee5;border-radius:8px;background:#5265db;color:#fff;font:700 12px/1 Tahoma,sans-serif;cursor:pointer;box-shadow:0 3px 10px rgba(28,43,90,.2);';
    btn.onclick = init;
    container.appendChild(btn);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.focus(); draw();
    interval = setInterval(tick, 118);
  }

  function placeFood() {
    do { food = {x:Math.floor(Math.random()*W), y:Math.floor(Math.random()*H)}; }
    while (snake.some(s => s.x === food.x && s.y === food.y));
  }

  function setDirection(name) {
    const next = name === 'up' ? {x:0,y:-1} : name === 'down' ? {x:0,y:1} : name === 'left' ? {x:-1,y:0} : {x:1,y:0};
    if (next.x === -dir.x && next.y === -dir.y) return;
    pendingDir = next;
  }

  function onPointerDown(e) {
    const canvas = e.currentTarget;
    canvas.focus();
    if (e.pointerType === 'mouse' || !snake?.length) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const headX = (snake[0].x + .5) * CELL;
    const headY = (snake[0].y + .5) * CELL;
    const dx = x - headX, dy = y - headY;
    if (Math.abs(dx) < CELL * .4 && Math.abs(dy) < CELL * .4) return;
    setDirection(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
  }

  function isEditableTarget(target) {
    return target instanceof HTMLElement && (target.matches('input,textarea,select,[contenteditable="true"]') || target.isContentEditable);
  }

  function onKey(e) {
    if (!container.isConnected || container.offsetParent === null || isEditableTarget(e.target)) return;
    const gameWindow = container.closest('.az-window');
    if (gameWindow && !gameWindow.classList.contains('is-active')) return;
    const map = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
    if (map[e.key]) { e.preventDefault(); setDirection(map[e.key]); }
    else if ((e.key === ' ' || e.key === 'Enter') && over) { e.preventDefault(); init(); }
    else if (e.key.toLowerCase() === 'p' && !over) { e.preventDefault(); togglePause(); }
  }

  if (typeof window.__aizanoiSnakeKeyHandler === 'function') {
    window.removeEventListener('keydown', window.__aizanoiSnakeKeyHandler);
  }
  window.__aizanoiSnakeKeyHandler = onKey;
  window.addEventListener('keydown', onKey);

  function tick() {
    if (!container.isConnected) {
      if (interval) clearInterval(interval);
      interval = null;
      if (window.__aizanoiSnakeKeyHandler === onKey) {
        window.removeEventListener('keydown', onKey);
        delete window.__aizanoiSnakeKeyHandler;
      }
      return;
    }
    if (over || paused) return;
    dir = pendingDir;
    const head = {x:snake[0].x + dir.x, y:snake[0].y + dir.y};
    if (head.x < 0 || head.y < 0 || head.x >= W || head.y >= H || snake.some(s => s.x === head.x && s.y === head.y)) { end(); return; }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) { score += 10; pulse = 5; placeFood(); }
    else snake.pop();
    if (pulse > 0) pulse--;
    draw();
  }

  function rounded(ctx,x,y,w,h,r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x,y,w,h,r) : ctx.rect(x,y,w,h);
    ctx.fill();
  }

  function draw() {
    const c = document.getElementById('snake-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const bg = ctx.createLinearGradient(0,0,0,c.height);
    bg.addColorStop(0,'#081828'); bg.addColorStop(1,'#030b13');
    ctx.fillStyle = bg; ctx.fillRect(0,0,c.width,c.height);

    ctx.strokeStyle = 'rgba(104,155,192,.10)'; ctx.lineWidth = 1;
    for (let x=0;x<=W;x++){ctx.beginPath();ctx.moveTo(x*CELL+.5,0);ctx.lineTo(x*CELL+.5,c.height);ctx.stroke();}
    for (let y=0;y<=H;y++){ctx.beginPath();ctx.moveTo(0,y*CELL+.5);ctx.lineTo(c.width,y*CELL+.5);ctx.stroke();}

    const fx = food.x*CELL + CELL/2, fy = food.y*CELL + CELL/2;
    ctx.save(); ctx.shadowColor = '#ff6d55'; ctx.shadowBlur = 14 + pulse*2;
    const fg = ctx.createRadialGradient(fx-3,fy-4,2,fx,fy,9);
    fg.addColorStop(0,'#fff0ae'); fg.addColorStop(.24,'#ff855f'); fg.addColorStop(1,'#c8242d');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx,fy,7.5,0,Math.PI*2); ctx.fill(); ctx.restore();

    snake.slice().reverse().forEach((s, revIndex) => {
      const i = snake.length - 1 - revIndex;
      const x=s.x*CELL+2,y=s.y*CELL+2,w=CELL-4;
      const g=ctx.createLinearGradient(x,y,x+w,y+w);
      if (i===0){g.addColorStop(0,'#78f0b2');g.addColorStop(1,'#168f62');ctx.shadowColor='#4ff1aa';ctx.shadowBlur=10;}
      else {g.addColorStop(0,'#45a6e6');g.addColorStop(1,'#205cb8');ctx.shadowBlur=0;}
      ctx.fillStyle=g; rounded(ctx,x,y,w,w,4);
      ctx.fillStyle='rgba(255,255,255,.18)'; ctx.fillRect(x+3,y+3,w-6,2);
      if(i===0){
        ctx.shadowBlur=0; ctx.fillStyle='#06131e';
        const ex=dir.y!==0?4:dir.x>0?11:4, ex2=dir.y!==0?11:ex;
        const ey=dir.x!==0?5:dir.y>0?11:5, ey2=dir.x!==0?11:ey;
        ctx.beginPath();ctx.arc(x+ex, y+ey,1.6,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(x+ex2,y+ey2,1.6,0,Math.PI*2);ctx.fill();
      }
    });
    ctx.shadowBlur=0;

    if (paused && !over) {
      ctx.fillStyle='rgba(2,8,14,.58)';ctx.fillRect(0,0,c.width,c.height);
      ctx.textAlign='center';ctx.fillStyle='#eef8ff';ctx.font='700 25px Segoe UI,Tahoma';ctx.fillText('PAUSED',c.width/2,c.height/2);
    }
    if (over) {
      ctx.fillStyle='rgba(2,8,14,.68)';ctx.fillRect(0,0,c.width,c.height);
      ctx.textAlign='center';ctx.fillStyle='#eef8ff';ctx.font='700 28px Segoe UI,Tahoma';ctx.fillText('GAME OVER',c.width/2,c.height/2-8);
      ctx.fillStyle='#8fc9ef';ctx.font='13px Segoe UI,Tahoma';ctx.fillText('Press Space / Enter or New Game',c.width/2,c.height/2+20);
    }

    const scoreEl=document.getElementById('snake-score'); if(scoreEl) scoreEl.textContent=String(score).padStart(4,'0');
    const status=document.getElementById('snake-status');
    if(status) status.textContent=paused ? 'Paused · Press P or Resume' : (over ? 'Run ended · Score: '+score : 'Score: '+score+' · Arrow keys or tap around the snake to turn · Eat the glowing signal');
  }

  function togglePause() {
    if (over) return;
    paused = !paused;
    const button = container.querySelector('[data-game-action="pause"]');
    if (button) { button.textContent = paused ? 'Resume' : 'Pause'; button.setAttribute('aria-pressed', paused ? 'true' : 'false'); }
    draw();
  }

  function end() {
    over = true;
    if (interval) clearInterval(interval);
    interval = null;
    saveScore('snake', score);
    window.AizanoiGames?.refreshToolbar(container, 'snake');
    draw();
  }

  function saveScore(game, score) {
    try {
      if(window.AizanoiGames){window.AizanoiGames.save(game,score);return;}
      const key='aizanoi-games',scores=JSON.parse(localStorage.getItem(key)||'{}');
      if(!scores[game])scores[game]=[];
      scores[game].push({score,at:new Date().toISOString()});
      if(scores[game].length>20)scores[game]=scores[game].slice(-20);
      localStorage.setItem(key,JSON.stringify(scores));
    } catch(_) {}
  }

  init();
})();
