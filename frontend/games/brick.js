(function() {
  const container = document.getElementById('game-brick-container');
  if (!container) return;

  const W=400,H=300,PADDLE_W=76,PADDLE_H=11,BALL_R=6;
  let paddleX,ballX,ballY,ballDX,ballDY,bricks,score,lives,over,interval,particles=[],trail=[],paused=false;

  function init(){
    paddleX=(W-PADDLE_W)/2;ballX=W/2;ballY=H-38;ballDX=3;ballDY=-3;score=0;lives=3;over=false;paused=false;particles=[];trail=[];
    if(interval)clearInterval(interval);
    bricks=[];
    const rows=5,cols=8,bw=(W-24)/cols;
    const palette=[['#ff7f76','#bb2535'],['#ffc15f','#db6f2f'],['#79d77f','#2d8b57'],['#61b9f6','#2a62bc'],['#aa86e8','#5c42a4']];
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)bricks.push({x:12+c*bw,y:38+r*19,w:bw-3,h:14,alive:true,colors:palette[r]});

    container.innerHTML='';
    container.style.cssText='display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px;background:linear-gradient(145deg,#dbe4ef,#b8c5d6);border:1px solid #8999ac;box-shadow:inset 1px 1px #fff;max-width:100%;overflow:auto;';
    const shell=document.createElement('div');
    shell.style.cssText='width:min(100%,420px);background:#09101d;border:3px solid #445873;border-radius:8px;padding:8px;box-shadow:inset 0 0 0 2px #111c2b,0 5px 14px rgba(0,0,0,.18);';
    const bar=document.createElement('div');
    bar.style.cssText='height:30px;display:flex;align-items:center;justify-content:space-between;padding:0 5px;color:#dfeeff;font:700 11px Tahoma,sans-serif;letter-spacing:.05em;';
    bar.innerHTML='<span>AIZANOI BREAKOUT</span><span><span id="brick-score">0000</span> · ♥ <span id="brick-lives">3</span></span>';
    shell.appendChild(bar);
    const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;canvas.id='brick-canvas';canvas.tabIndex=0;
    canvas.setAttribute('aria-label','Brick Breaker game. Move with arrow keys, mouse or touch.');
    canvas.style.cssText='width:100%;height:auto;aspect-ratio:4/3;background:#050a12;display:block;border:1px solid #4c6079;border-radius:3px;touch-action:none;';
    shell.appendChild(canvas);container.appendChild(shell);
    const status=document.createElement('div');status.id='brick-status';status.style.cssText='width:min(100%,420px);padding:7px 9px;background:#eef4fb;border:1px solid #9daabd;color:#27384f;font:11px/1.35 Tahoma,sans-serif;';container.appendChild(status);
    if(window.AizanoiGames)container.appendChild(window.AizanoiGames.toolbar({game:'brick',onPause:togglePause,onRestart:init}));
    const btn=document.createElement('button');btn.textContent='New Game';btn.style.cssText='font:11px Tahoma,sans-serif;padding:5px 14px;';btn.onclick=init;container.appendChild(btn);
    canvas.addEventListener('keydown',onKey);canvas.addEventListener('mousemove',onPointer);canvas.addEventListener('pointermove',onPointer);canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture?.(e.pointerId);onPointer(e);canvas.focus();});
    canvas.focus();draw();interval=setInterval(tick,16);
  }

  function onKey(e){if(e.key==='ArrowLeft'){e.preventDefault();paddleX=Math.max(0,paddleX-22);}if(e.key==='ArrowRight'){e.preventDefault();paddleX=Math.min(W-PADDLE_W,paddleX+22);}if((e.key===' '||e.key==='Enter')&&over){e.preventDefault();init();}if(e.key.toLowerCase()==='p'&&!over){e.preventDefault();togglePause();}}
  function onPointer(e){const c=e.currentTarget,rect=c.getBoundingClientRect(),x=(e.clientX-rect.left)*(W/rect.width);if(Number.isFinite(x))paddleX=Math.max(0,Math.min(W-PADDLE_W,x-PADDLE_W/2));}

  function burst(x,y,color){for(let i=0;i<10;i++)particles.push({x,y,vx:(Math.random()-.5)*4.2,vy:(Math.random()-.8)*4,life:22+Math.random()*16,color});}
  function resetBall(){ballX=W/2;ballY=H-38;ballDX=Math.random()>.5?3:-3;ballDY=-3;paddleX=(W-PADDLE_W)/2;trail=[];}

  function tick(){
    // Switching games or closing the Games window removes this container.
    // Stop the high-frequency timer rather than letting an orphaned loop run.
    if(!container.isConnected){if(interval)clearInterval(interval);interval=null;return;}
    particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.08;p.life--;});particles=particles.filter(p=>p.life>0);
    if(over||paused){draw();return;}
    trail.push({x:ballX,y:ballY});if(trail.length>7)trail.shift();
    ballX+=ballDX;ballY+=ballDY;
    if(ballX<BALL_R){ballX=BALL_R;ballDX=Math.abs(ballDX);}if(ballX>W-BALL_R){ballX=W-BALL_R;ballDX=-Math.abs(ballDX);}if(ballY<BALL_R){ballY=BALL_R;ballDY=Math.abs(ballDY);}
    if(ballY>H-32-BALL_R&&ballY<H-15&&ballX>paddleX-2&&ballX<paddleX+PADDLE_W+2&&ballDY>0){ballY=H-32-BALL_R;ballDY=-Math.abs(ballDY);ballDX=((ballX-paddleX)/PADDLE_W-.5)*7;burst(ballX,ballY,'#76c7ff');}
    for(const b of bricks){if(!b.alive)continue;if(ballX+BALL_R>b.x&&ballX-BALL_R<b.x+b.w&&ballY+BALL_R>b.y&&ballY-BALL_R<b.y+b.h){b.alive=false;ballDY=-ballDY;score+=10;burst(ballX,ballY,b.colors[0]);break;}}
    if(bricks.every(b=>!b.alive)){end(true);return;}
    if(ballY>H+BALL_R){lives--;if(lives<=0){end(false);return;}resetBall();}
    draw();
  }

  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,r):ctx.rect(x,y,w,h);ctx.fill();}
  function draw(){
    const c=document.getElementById('brick-canvas');if(!c)return;const ctx=c.getContext('2d');
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#07172a');bg.addColorStop(1,'#02060b');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    for(let i=0;i<38;i++){const x=(i*83)%W,y=(i*47)%H,a=.12+((i%5)/25);ctx.fillStyle='rgba(155,205,255,'+a+')';ctx.fillRect(x,y,1+(i%2),1+(i%2));}
    ctx.fillStyle='rgba(48,102,159,.10)';for(let y=22;y<H;y+=22)ctx.fillRect(0,y,W,1);

    for(const b of bricks){if(!b.alive)continue;ctx.save();ctx.shadowColor=b.colors[0];ctx.shadowBlur=6;const g=ctx.createLinearGradient(b.x,b.y,b.x,b.y+b.h);g.addColorStop(0,b.colors[0]);g.addColorStop(1,b.colors[1]);ctx.fillStyle=g;roundRect(ctx,b.x,b.y,b.w,b.h,3);ctx.shadowBlur=0;ctx.fillStyle='rgba(255,255,255,.34)';ctx.fillRect(b.x+3,b.y+2,b.w-6,2);ctx.restore();}

    trail.forEach((p,i)=>{const alpha=(i+1)/trail.length*.22;ctx.fillStyle='rgba(151,218,255,'+alpha+')';ctx.beginPath();ctx.arc(p.x,p.y,BALL_R*(i+1)/trail.length,0,Math.PI*2);ctx.fill();});
    ctx.save();ctx.shadowColor='#82dcff';ctx.shadowBlur=15;const pg=ctx.createLinearGradient(paddleX,H-25,paddleX+PADDLE_W,H-14);pg.addColorStop(0,'#2e72c9');pg.addColorStop(.5,'#8fd5ff');pg.addColorStop(1,'#2653a3');ctx.fillStyle=pg;roundRect(ctx,paddleX,H-24,PADDLE_W,PADDLE_H,5);ctx.restore();
    ctx.save();ctx.shadowColor='#d9f5ff';ctx.shadowBlur=13;const ballG=ctx.createRadialGradient(ballX-2,ballY-2,1,ballX,ballY,BALL_R);ballG.addColorStop(0,'#fff');ballG.addColorStop(.4,'#ccecff');ballG.addColorStop(1,'#659ad0');ctx.fillStyle=ballG;ctx.beginPath();ctx.arc(ballX,ballY,BALL_R,0,Math.PI*2);ctx.fill();ctx.restore();

    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/36);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,2.5,2.5);}ctx.globalAlpha=1;
    if(paused&&!over){ctx.fillStyle='rgba(2,8,14,.58)';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.fillStyle='#eef8ff';ctx.font='700 25px Segoe UI,Tahoma';ctx.fillText('PAUSED',W/2,H/2);}
    if(over){ctx.fillStyle='rgba(2,8,14,.72)';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.fillStyle='#f2f7ff';ctx.font='700 27px Segoe UI,Tahoma';ctx.fillText(bricks.every(b=>!b.alive)?'STAGE CLEAR':'GAME OVER',W/2,H/2-8);ctx.fillStyle='#91c8ef';ctx.font='13px Segoe UI,Tahoma';ctx.fillText('Score '+score+' · Press Space / Enter or New Game',W/2,H/2+20);}
    const s=document.getElementById('brick-score'),l=document.getElementById('brick-lives'),st=document.getElementById('brick-status');if(s)s.textContent=String(score).padStart(4,'0');if(l)l.textContent=lives;if(st)st.textContent=paused?'Paused · Press P or Resume':(over?'Round complete · Score: '+score:'Mouse, touch or arrows move the paddle · Clear every signal block');
  }

  function togglePause(){if(over)return;paused=!paused;const button=container.querySelector('[data-game-action="pause"]');if(button){button.textContent=paused?'Resume':'Pause';button.setAttribute('aria-pressed',paused?'true':'false');}draw();}
  function end(won){over=true;if(interval)clearInterval(interval);interval=null;saveScore('brick',score);window.AizanoiGames?.refreshToolbar(container,'brick');if(won)burst(W/2,H/2,'#ffd36b');draw();}
  function saveScore(game,score){try{if(window.AizanoiGames){window.AizanoiGames.save(game,score);return;}const key='aizanoi-games',scores=JSON.parse(localStorage.getItem(key)||'{}');if(!scores[game])scores[game]=[];scores[game].push({score,at:new Date().toISOString()});if(scores[game].length>20)scores[game]=scores[game].slice(-20);localStorage.setItem(key,JSON.stringify(scores));}catch(_){}}
  init();
})();