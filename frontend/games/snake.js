(function() {
  const container = document.getElementById('game-snake-container');
  if (!container) return;

  const W = 20, H = 15, CELL = 20;
  let snake, dir, pendingDir, food, score, over, interval, pulse = 0;

  function init() {
    snake = [{x:10,y:7},{x:9,y:7},{x:8,y:7}];
    dir = pendingDir = {x:1,y:0};
    score = 0; over = false; pulse = 0;
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
    canvas.setAttribute('aria-label','Snake game. Use arrow keys or touch controls.');
    canvas.style.cssText = 'width:100%;height:auto;aspect-ratio:4/3;background:#07111d;display:block;border:1px solid #4d6580;border-radius:3px;image-rendering:auto;touch-action:none;';
    shell.appendChild(canvas);
    container.appendChild(shell);

    const status = document.createElement('div');
    status.id = 'snake-status';
    status.style.cssText = 'width:min(100%,420px);padding:7px 9px;background:#eef4fb;border:1px solid #9daabd;color:#27384f;font:11px/1.35 Tahoma,sans-serif;';
    container.appendChild(status);

    const controls = document.createElement('div');
    controls.id = 'snake-dpad';
    controls.style.cssText = 'display:grid;grid-template-columns:46px 46px 46px;grid-template-rows:38px 38px;gap:5px;user-select:none;touch-action:none;';
    controls.innerHTML = '<span></span><button data-d="up" aria-label="Move up">▲</button><span></span><button data-d="left" aria-label="Move left">◀</button><button data-d="down" aria-label="Move down">▼</button><button data-d="right" aria-label="Move right">▶</button>';
    controls.querySelectorAll('button').forEach(b => {
      b.style.cssText = 'padding:0;font:bold 17px Tahoma,sans-serif;background:linear-gradient(#fbfdff,#c8d5e5);border:1px solid #788ba5;border-radius:5px;color:#224a7d;box-shadow:inset 0 1px #fff;touch-action:manipulation;';
      const go = (e) => { e.preventDefault(); setDirection(b.dataset.d); canvas.focus(); };
      b.addEventListener('pointerdown', go);
    });
    container.appendChild(controls);

    const btn = document.createElement('button');
    btn.textContent = 'New Game';
    btn.style.cssText = 'font:11px Tahoma,sans-serif;padding:5px 14px;';
    btn.onclick = init;
    container.appendChild(btn);

    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', () => canvas.focus());
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

  function onKey(e) {
    const map = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
    if (map[e.key]) { e.preventDefault(); setDirection(map[e.key]); }
    else if ((e.key === ' ' || e.key === 'Enter') && over) { e.preventDefault(); init(); }
  }

  function tick() {
    // The Games window/game loader removes this container when switching games
    // or closing the window. Stop the timer immediately instead of leaving an
    // orphaned interval running in the background.
    if (!container.isConnected) {
      if (interval) clearInterval(interval);
      interval = null;
      return;
    }
    if (over) return;
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

    if (over) {
      ctx.fillStyle='rgba(2,8,14,.68)';ctx.fillRect(0,0,c.width,c.height);
      ctx.textAlign='center';ctx.fillStyle='#eef8ff';ctx.font='700 28px Segoe UI,Tahoma';ctx.fillText('GAME OVER',c.width/2,c.height/2-8);
      ctx.fillStyle='#8fc9ef';ctx.font='13px Segoe UI,Tahoma';ctx.fillText('Press Space / Enter or New Game',c.width/2,c.height/2+20);
    }

    const scoreEl=document.getElementById('snake-score'); if(scoreEl) scoreEl.textContent=String(score).padStart(4,'0');
    const status=document.getElementById('snake-status');
    if(status) status.textContent=over ? 'Run ended · Score: '+score : 'Score: '+score+' · Arrow keys or D-pad · Eat the glowing signal';
  }

  function end() {
    over = true;
    if (interval) clearInterval(interval);
    interval = null;
    saveScore('snake', score); draw();
  }

  function saveScore(game, score) {
    try {
      const key='aizanoi-games',scores=JSON.parse(localStorage.getItem(key)||'{}');
      if(!scores[game])scores[game]=[];
      scores[game].push({score,at:new Date().toISOString()});
      if(scores[game].length>20)scores[game]=scores[game].slice(-20);
      localStorage.setItem(key,JSON.stringify(scores));
    } catch(_) {}
  }

  init();
})();