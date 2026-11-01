/** Aizanoi Arcade — Strata Breaker. Explicit mount/dispose factory; styling lives in arcade.css. */
(function () {
  'use strict';
  const W = 400, H = 300, PADDLE_W = 76, PADDLE_H = 11, BALL_R = 6;
  const FRAME_MS = 1000 / 60;
  const FONT = '"Inter", system-ui, "Segoe UI", sans-serif';

  function mount(container) {
    const utils = window.AizanoiGames;
    let paddleX, ballX, ballY, ballDX, ballDY, bricks, score, lives, over, won, particles = [], trail = [], paused = false;
    let rafId = null, lastFrame = 0, accumulator = 0, disposed = false;

    container.innerHTML = `
      <div class="ag-cab" data-game="brick">
        <div class="ag-hud">
          <div class="ag-stat"><span>Score</span><output id="brick-score">0000</output></div>
          <div class="ag-stat"><span>Lives</span><output id="brick-lives" aria-label="Lives left">3</output></div>
        </div>
        <div class="ag-screen"><canvas id="brick-canvas" width="${W}" height="${H}" tabindex="0" aria-label="Strata Breaker playfield. Move the paddle with the arrow keys, the mouse, or by dragging a finger across the playfield."></canvas></div>
        <p class="ag-status" id="brick-status"></p>
        <p class="ag-hint"><kbd>←</kbd><kbd>→</kbd> or drag to move the paddle · <kbd>P</kbd> pause · <kbd>Space</kbd> restart.</p>
      </div>`;
    const cab = container.querySelector('.ag-cab');
    const canvas = container.querySelector('#brick-canvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = container.querySelector('#brick-score');
    const livesEl = container.querySelector('#brick-lives');
    const statusEl = container.querySelector('#brick-status');
    cab.insertBefore(utils.toolbar({ game: 'brick', onPause: togglePause, onRestart: init }), cab.querySelector('.ag-screen'));
    const say = utils.liveRegion(cab);

    function stopLoop() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null; lastFrame = 0; accumulator = 0;
    }
    function startLoop() { stopLoop(); rafId = requestAnimationFrame(frame); }

    function frame(now) {
      if (disposed) return;
      if (!container.isConnected) { dispose(); return; }
      if (!lastFrame) lastFrame = now;
      const elapsed = Math.min(80, Math.max(0, now - lastFrame));
      lastFrame = now;
      if (!paused && !over) {
        accumulator += elapsed;
        let steps = 0;
        while (accumulator >= FRAME_MS && steps < 4 && !over) { tickStep(); accumulator -= FRAME_MS; steps++; }
        if (steps === 4) accumulator = 0;
      }
      draw();
      if (!over) rafId = requestAnimationFrame(frame); else rafId = null;
    }

    function init() {
      paddleX = (W - PADDLE_W) / 2; ballX = W / 2; ballY = H - 38; ballDX = 3; ballDY = -3;
      score = 0; lives = 3; over = false; won = false; paused = false; particles = []; trail = [];
      utils.setPauseButton(container, false);
      stopLoop();
      bricks = [];
      const rows = 5, cols = 8, bw = (W - 24) / cols;
      const palette = [['#ff7f76', '#bb2535'], ['#ffc15f', '#db6f2f'], ['#79d77f', '#2d8b57'], ['#61b9f6', '#2a62bc'], ['#aa86e8', '#5c42a4']];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) bricks.push({ x: 12 + c * bw, y: 38 + r * 19, w: bw - 3, h: 14, alive: true, colors: palette[r] });
      draw(); startLoop();
      canvas.focus({ preventScroll: true });
    }

    function onKey(e) {
      if (!utils.acceptsKey(container, e, canvas)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); paddleX = Math.max(0, paddleX - 22); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); paddleX = Math.min(W - PADDLE_W, paddleX + 22); }
      else if ((e.key === ' ' || e.key === 'Enter') && over) { e.preventDefault(); init(); }
      else if (e.key.toLowerCase() === 'p' && !over) { e.preventDefault(); togglePause(); }
    }
    function onPointer(e) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const x = (e.clientX - rect.left) * (W / rect.width);
      if (Number.isFinite(x)) paddleX = Math.max(0, Math.min(W - PADDLE_W, x - PADDLE_W / 2));
    }
    function onPointerDown(e) {
      canvas.setPointerCapture?.(e.pointerId);
      onPointer(e);
      canvas.focus({ preventScroll: true });
    }
    function onVisibility() { if (document.hidden && !paused && !over) togglePause(); }

    function burst(x, y, color) { for (let i = 0; i < 10; i++) particles.push({ x, y, vx: (Math.random() - .5) * 4.2, vy: (Math.random() - .8) * 4, life: 22 + Math.random() * 16, color }); }
    function resetBall() { ballX = W / 2; ballY = H - 38; ballDX = Math.random() > .5 ? 3 : -3; ballDY = -3; paddleX = (W - PADDLE_W) / 2; trail = []; }

    function tickStep() {
      particles.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += .08; p.life--; });
      particles = particles.filter((p) => p.life > 0);
      trail.push({ x: ballX, y: ballY }); if (trail.length > 7) trail.shift();
      ballX += ballDX; ballY += ballDY;
      if (ballX < BALL_R) { ballX = BALL_R; ballDX = Math.abs(ballDX); }
      if (ballX > W - BALL_R) { ballX = W - BALL_R; ballDX = -Math.abs(ballDX); }
      if (ballY < BALL_R) { ballY = BALL_R; ballDY = Math.abs(ballDY); }
      if (ballY > H - 32 - BALL_R && ballY < H - 15 && ballX > paddleX - 2 && ballX < paddleX + PADDLE_W + 2 && ballDY > 0) {
        ballY = H - 32 - BALL_R; ballDY = -Math.abs(ballDY); ballDX = ((ballX - paddleX) / PADDLE_W - .5) * 7; burst(ballX, ballY, '#76c7ff');
      }
      for (const b of bricks) {
        if (!b.alive) continue;
        if (ballX + BALL_R > b.x && ballX - BALL_R < b.x + b.w && ballY + BALL_R > b.y && ballY - BALL_R < b.y + b.h) {
          b.alive = false; ballDY = -ballDY; score += 10; burst(ballX, ballY, b.colors[0]); break;
        }
      }
      if (bricks.every((b) => !b.alive)) { end(true); return; }
      if (ballY > H + BALL_R) { lives--; if (lives <= 0) { end(false); return; } resetBall(); say(`${lives} ${lives === 1 ? 'life' : 'lives'} left`); }
    }

    function roundRect(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fill(); }
    function draw() {
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#07172a'); bg.addColorStop(1, '#02060b'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 38; i++) { const x = (i * 83) % W, y = (i * 47) % H, a = .12 + ((i % 5) / 25); ctx.fillStyle = 'rgba(155,205,255,' + a + ')'; ctx.fillRect(x, y, 1 + (i % 2), 1 + (i % 2)); }
      ctx.fillStyle = 'rgba(48,102,159,.10)'; for (let y = 22; y < H; y += 22) ctx.fillRect(0, y, W, 1);

      for (const b of bricks) {
        if (!b.alive) continue;
        ctx.save(); ctx.shadowColor = b.colors[0]; ctx.shadowBlur = 6;
        const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h); g.addColorStop(0, b.colors[0]); g.addColorStop(1, b.colors[1]);
        ctx.fillStyle = g; roundRect(b.x, b.y, b.w, b.h, 3);
        ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.34)'; ctx.fillRect(b.x + 3, b.y + 2, b.w - 6, 2); ctx.restore();
      }

      trail.forEach((p, i) => { const alpha = (i + 1) / trail.length * .22; ctx.fillStyle = 'rgba(151,218,255,' + alpha + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * (i + 1) / trail.length, 0, Math.PI * 2); ctx.fill(); });
      ctx.save(); ctx.shadowColor = '#82dcff'; ctx.shadowBlur = 15;
      const pg = ctx.createLinearGradient(paddleX, H - 25, paddleX + PADDLE_W, H - 14); pg.addColorStop(0, '#2e72c9'); pg.addColorStop(.5, '#8fd5ff'); pg.addColorStop(1, '#2653a3');
      ctx.fillStyle = pg; roundRect(paddleX, H - 24, PADDLE_W, PADDLE_H, 5); ctx.restore();
      ctx.save(); ctx.shadowColor = '#d9f5ff'; ctx.shadowBlur = 13;
      const ballG = ctx.createRadialGradient(ballX - 2, ballY - 2, 1, ballX, ballY, BALL_R); ballG.addColorStop(0, '#fff'); ballG.addColorStop(.4, '#ccecff'); ballG.addColorStop(1, '#659ad0');
      ctx.fillStyle = ballG; ctx.beginPath(); ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2); ctx.fill(); ctx.restore();

      for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / 36); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 2.5, 2.5); }
      ctx.globalAlpha = 1;
      if (paused && !over) { ctx.fillStyle = 'rgba(2,8,14,.58)'; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.fillStyle = '#eef8ff'; ctx.font = `700 25px ${FONT}`; ctx.fillText('PAUSED', W / 2, H / 2); }
      if (over) {
        ctx.fillStyle = 'rgba(2,8,14,.72)'; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.fillStyle = '#f2f7ff'; ctx.font = `700 27px ${FONT}`;
        ctx.fillText(won ? 'STAGE CLEAR' : 'GAME OVER', W / 2, H / 2 - 8);
        ctx.fillStyle = '#91c8ef'; ctx.font = `13px ${FONT}`; ctx.fillText('Score ' + score + ' · Press Space or New game', W / 2, H / 2 + 20);
      }
      utils.setText(scoreEl, String(score).padStart(4, '0'));
      utils.setText(livesEl, lives);
      const text = paused ? 'Paused. Press P or Resume to continue.' : over ? (won ? `Stage clear. Final score ${score}.` : `Round over. Final score ${score}.`) : 'Bounce the signal off the paddle and clear every block.';
      if (statusEl.dataset.text !== text) { statusEl.dataset.text = text; statusEl.textContent = text; }
    }

    function togglePause() {
      if (over) return;
      paused = !paused;
      utils.setPauseButton(container, paused);
      say(paused ? 'Paused' : 'Resumed');
      if (!paused && rafId === null) startLoop();
      draw();
    }
    function end(didWin) {
      over = true; won = didWin;
      utils.save('brick', score);
      utils.refreshToolbar(container, 'brick');
      if (didWin) burst(W / 2, H / 2, '#ffd36b');
      say(didWin ? `Stage clear. Score ${score}.` : `Game over. Score ${score}.`);
      draw(); stopLoop();
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      say.dispose();
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('pointerdown', onPointerDown);
    }

    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('pointermove', onPointer);
    canvas.addEventListener('pointerdown', onPointerDown);
    init();
    return dispose;
  }

  window.AizanoiArcadeBrick = { mount };
})();
