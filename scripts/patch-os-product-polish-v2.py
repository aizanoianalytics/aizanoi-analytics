from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'frontend/index.html'
MINES = ROOT / 'frontend/games/mines.js'
SNAKE = ROOT / 'frontend/games/snake.js'
BRICK = ROOT / 'frontend/games/brick.js'
CI = ROOT / '.github/workflows/ci.yml'


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)

# ---- index.html: load modular V2 layers + improve chat rendering/state ----
text = INDEX.read_text()
text = replace_once(
    text,
    '<link rel="stylesheet" href="/css/aizanoi-polish.css">',
    '<link rel="stylesheet" href="/css/aizanoi-polish.css">\n<link rel="stylesheet" href="/css/os-v2.css">',
    'index css hook',
)

old_add = """  function addMessage(role, text) {
    const row = document.createElement('div');
    row.className = 'chat-msg ' + (role === 'user' ? 'user' : 'bot');
    const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = text;
    row.appendChild(bubble); log.appendChild(row); log.scrollTop = log.scrollHeight;
  }
"""
new_add = """  function addMessage(role, text) {
    const row = document.createElement('div');
    row.className = 'chat-msg ' + (role === 'user' ? 'user' : 'bot');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (role === 'user') {
      bubble.textContent = text;
    } else {
      bubble.innerHTML = renderMarkdownSafe(text);
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'chat-copy';
      copy.textContent = 'Copy';
      copy.setAttribute('aria-label', 'Copy assistant answer');
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(text);
          copy.textContent = 'Copied'; copy.classList.add('copied');
          setTimeout(() => { copy.textContent = 'Copy'; copy.classList.remove('copied'); }, 1300);
        } catch (_) { copy.textContent = 'Unavailable'; }
      });
      bubble.appendChild(copy);
    }
    row.appendChild(bubble); log.appendChild(row); log.scrollTop = log.scrollHeight;
  }
"""
text = replace_once(text, old_add, new_add, 'chat addMessage')

old_send_start = """    input.value = ''; input.disabled = true; sendBtn.disabled = true;
    addMessage('user', text); chatHistory.push({ role:'user', content:text });
"""
new_send_start = """    input.value = ''; input.disabled = true; sendBtn.disabled = true; log.setAttribute('aria-busy','true');
    addMessage('user', text); chatHistory.push({ role:'user', content:text });
"""
text = replace_once(text, old_send_start, new_send_start, 'chat busy start')

old_send_end = """    input.disabled = false; sendBtn.disabled = false; input.focus();
  }
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
  input.focus();
}
"""
new_send_end = """    log.setAttribute('aria-busy','false');
    input.disabled = false; sendBtn.disabled = false; input.focus();
  }
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
  window.__AIZANOI_CHAT__ = {
    clear() {
      chatHistory = [];
      log.replaceChildren();
      const starters = document.getElementById('chat-starters');
      if (starters) starters.style.display = 'grid';
      input.value = ''; input.disabled = false; sendBtn.disabled = false; input.focus();
    }
  };
  input.focus();
}
"""
text = replace_once(text, old_send_end, new_send_end, 'chat clear contract')

text = replace_once(
    text,
    '</body>\n</html>',
    '<script src="/games/game-utils.js"></script>\n<script src="/js/os-v2.js"></script>\n</body>\n</html>',
    'index script hooks',
)
INDEX.write_text(text)

# ---- Mines ----
text = MINES.read_text()
text = replace_once(
    text,
    '  let board, revealed, flagged, first, over, won, startedAt, timer, longPressTimer, suppressNextClick = false;',
    '  let board, revealed, flagged, first, over, won, startedAt, timer, longPressTimer, suppressNextClick = false, paused = false, pauseStarted = 0;',
    'mines state',
)
text = replace_once(
    text,
    '    board = []; revealed = []; flagged = []; first = true; over = false; won = false; startedAt = 0;',
    '    board = []; revealed = []; flagged = []; first = true; over = false; won = false; startedAt = 0; paused = false; pauseStarted = 0;',
    'mines init state',
)
old_mines_status = """    container.appendChild(status);

    const hint = document.createElement('div');
"""
new_mines_status = """    container.appendChild(status);

    if (window.AizanoiGames) {
      container.appendChild(window.AizanoiGames.toolbar({
        game: 'mines', lowerBetter: true, onPause: togglePause, onRestart: init,
        formatBest: (value) => value + 's'
      }));
    }

    const hint = document.createElement('div');
"""
text = replace_once(text, old_mines_status, new_mines_status, 'mines toolbar')
text = replace_once(text, '      if (!container.isConnected || over) { clearInterval(timer); timer = null; return; }\n      updateCounters();', '      if (!container.isConnected || over) { clearInterval(timer); timer = null; return; }\n      if (!paused) updateCounters();', 'mines timer pause')
text = replace_once(text, '    if (over) return;\n    if (suppressNextClick)', '    if (over || paused) return;\n    if (suppressNextClick)', 'mines click pause')
text = replace_once(text, '    if (over || revealed[y][x]) return;', '    if (over || paused || revealed[y][x]) return;', 'mines flag pause')
old_mines_end = """    if (won) saveScore('mines', Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
  }
"""
new_mines_end = """    if (won) {
      const result = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      saveScore('mines', result);
      window.AizanoiGames?.refreshToolbar(container, 'mines', { lowerBetter: true, formatBest: (value) => value + 's' });
    }
  }

  function togglePause() {
    if (over) return;
    paused = !paused;
    if (paused) pauseStarted = Date.now();
    else if (startedAt && pauseStarted) startedAt += Date.now() - pauseStarted;
    const button = container.querySelector('[data-game-action="pause"]');
    if (button) { button.textContent = paused ? 'Resume' : 'Pause'; button.setAttribute('aria-pressed', paused ? 'true' : 'false'); }
    updateStatus();
  }
"""
text = replace_once(text, old_mines_end, new_mines_end, 'mines pause function')
text = replace_once(text, "    if (over) s.innerHTML = won ? '<b style=\"color:#166e27\">FIELD CLEARED</b> · Nice work.' : '<b style=\"color:#a51d1d\">BOOM</b> · Click the face to retry.';\n    else s.textContent = first ? 'Choose a cell. Your first click is always safe.' : 'Clear every safe cell without hitting a mine.';", "    if (paused) s.innerHTML = '<b>PAUSED</b> · Resume when ready.';\n    else if (over) s.innerHTML = won ? '<b style=\"color:#166e27\">FIELD CLEARED</b> · Nice work.' : '<b style=\"color:#a51d1d\">BOOM</b> · Click the face to retry.';\n    else s.textContent = first ? 'Choose a cell. Your first click is always safe.' : 'Clear every safe cell without hitting a mine.';", 'mines pause status')
text = replace_once(text, "      const key = 'aizanoi-games', scores = JSON.parse(localStorage.getItem(key) || '{}');", "      if (window.AizanoiGames) { window.AizanoiGames.save(game, score); return; }\n      const key = 'aizanoi-games', scores = JSON.parse(localStorage.getItem(key) || '{}');", 'mines shared save')
MINES.write_text(text)

# ---- Snake ----
text = SNAKE.read_text()
text = replace_once(text, '  let snake, dir, pendingDir, food, score, over, interval, pulse = 0;', '  let snake, dir, pendingDir, food, score, over, interval, pulse = 0, paused = false;', 'snake state')
text = replace_once(text, '    score = 0; over = false; pulse = 0;', '    score = 0; over = false; pulse = 0; paused = false;', 'snake init')
old_snake_status = """    container.appendChild(status);

    const controls = document.createElement('div');
"""
new_snake_status = """    container.appendChild(status);
    if (window.AizanoiGames) container.appendChild(window.AizanoiGames.toolbar({ game:'snake', onPause:togglePause, onRestart:init }));

    const controls = document.createElement('div');
"""
text = replace_once(text, old_snake_status, new_snake_status, 'snake toolbar')
text = replace_once(text, "    else if ((e.key === ' ' || e.key === 'Enter') && over) { e.preventDefault(); init(); }", "    else if ((e.key === ' ' || e.key === 'Enter') && over) { e.preventDefault(); init(); }\n    else if (e.key.toLowerCase() === 'p' && !over) { e.preventDefault(); togglePause(); }", 'snake pause key')
text = replace_once(text, '    if (over) return;\n    dir = pendingDir;', '    if (over || paused) return;\n    dir = pendingDir;', 'snake tick pause')
text = replace_once(text, "    if (over) {\n      ctx.fillStyle='rgba(2,8,14,.68)'", "    if (paused && !over) {\n      ctx.fillStyle='rgba(2,8,14,.58)';ctx.fillRect(0,0,c.width,c.height);\n      ctx.textAlign='center';ctx.fillStyle='#eef8ff';ctx.font='700 25px Segoe UI,Tahoma';ctx.fillText('PAUSED',c.width/2,c.height/2);\n    }\n    if (over) {\n      ctx.fillStyle='rgba(2,8,14,.68)'", 'snake pause overlay')
text = replace_once(text, "    if(status) status.textContent=over ? 'Run ended · Score: '+score : 'Score: '+score+' · Arrow keys or D-pad · Eat the glowing signal';", "    if(status) status.textContent=paused ? 'Paused · Press P or Resume' : (over ? 'Run ended · Score: '+score : 'Score: '+score+' · Arrow keys or D-pad · Eat the glowing signal');", 'snake pause status')
old_snake_end = """  function end() {
    over = true;
    if (interval) clearInterval(interval);
    interval = null;
    saveScore('snake', score); draw();
  }
"""
new_snake_end = """  function togglePause() {
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
"""
text = replace_once(text, old_snake_end, new_snake_end, 'snake toggle pause')
text = replace_once(text, "      const key='aizanoi-games',scores=JSON.parse(localStorage.getItem(key)||'{}');", "      if(window.AizanoiGames){window.AizanoiGames.save(game,score);return;}\n      const key='aizanoi-games',scores=JSON.parse(localStorage.getItem(key)||'{}');", 'snake shared save')
SNAKE.write_text(text)

# ---- Brick ----
text = BRICK.read_text()
text = replace_once(text, '  let paddleX,ballX,ballY,ballDX,ballDY,bricks,score,lives,over,interval,particles=[],trail=[];', '  let paddleX,ballX,ballY,ballDX,ballDY,bricks,score,lives,over,interval,particles=[],trail=[],paused=false;', 'brick state')
text = replace_once(text, '    paddleX=(W-PADDLE_W)/2;ballX=W/2;ballY=H-38;ballDX=3;ballDY=-3;score=0;lives=3;over=false;particles=[];trail=[];', '    paddleX=(W-PADDLE_W)/2;ballX=W/2;ballY=H-38;ballDX=3;ballDY=-3;score=0;lives=3;over=false;paused=false;particles=[];trail=[];', 'brick init')
text = replace_once(text, "    const status=document.createElement('div');status.id='brick-status';status.style.cssText='width:min(100%,420px);padding:7px 9px;background:#eef4fb;border:1px solid #9daabd;color:#27384f;font:11px/1.35 Tahoma,sans-serif;';container.appendChild(status);\n    const btn=document.createElement('button');", "    const status=document.createElement('div');status.id='brick-status';status.style.cssText='width:min(100%,420px);padding:7px 9px;background:#eef4fb;border:1px solid #9daabd;color:#27384f;font:11px/1.35 Tahoma,sans-serif;';container.appendChild(status);\n    if(window.AizanoiGames)container.appendChild(window.AizanoiGames.toolbar({game:'brick',onPause:togglePause,onRestart:init}));\n    const btn=document.createElement('button');", 'brick toolbar')
text = replace_once(text, "  function onKey(e){if(e.key==='ArrowLeft'){e.preventDefault();paddleX=Math.max(0,paddleX-22);}if(e.key==='ArrowRight'){e.preventDefault();paddleX=Math.min(W-PADDLE_W,paddleX+22);}if((e.key===' '||e.key==='Enter')&&over){e.preventDefault();init();}}", "  function onKey(e){if(e.key==='ArrowLeft'){e.preventDefault();paddleX=Math.max(0,paddleX-22);}if(e.key==='ArrowRight'){e.preventDefault();paddleX=Math.min(W-PADDLE_W,paddleX+22);}if((e.key===' '||e.key==='Enter')&&over){e.preventDefault();init();}if(e.key.toLowerCase()==='p'&&!over){e.preventDefault();togglePause();}}", 'brick pause key')
text = replace_once(text, '    if(over){draw();return;}\n    trail.push', '    if(over||paused){draw();return;}\n    trail.push', 'brick tick pause')
text = replace_once(text, "    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/36);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,2.5,2.5);}ctx.globalAlpha=1;\n    if(over){", "    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/36);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,2.5,2.5);}ctx.globalAlpha=1;\n    if(paused&&!over){ctx.fillStyle='rgba(2,8,14,.58)';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.fillStyle='#eef8ff';ctx.font='700 25px Segoe UI,Tahoma';ctx.fillText('PAUSED',W/2,H/2);}\n    if(over){", 'brick pause overlay')
text = replace_once(text, "if(st)st.textContent=over?'Round complete · Score: '+score:'Mouse, touch or arrows move the paddle · Clear every signal block';", "if(st)st.textContent=paused?'Paused · Press P or Resume':(over?'Round complete · Score: '+score:'Mouse, touch or arrows move the paddle · Clear every signal block');", 'brick pause status')
text = replace_once(text, "  function end(won){over=true;if(interval)clearInterval(interval);interval=null;saveScore('brick',score);if(won)burst(W/2,H/2,'#ffd36b');draw();}\n", "  function togglePause(){if(over)return;paused=!paused;const button=container.querySelector('[data-game-action=\"pause\"]');if(button){button.textContent=paused?'Resume':'Pause';button.setAttribute('aria-pressed',paused?'true':'false');}draw();}\n  function end(won){over=true;if(interval)clearInterval(interval);interval=null;saveScore('brick',score);window.AizanoiGames?.refreshToolbar(container,'brick');if(won)burst(W/2,H/2,'#ffd36b');draw();}\n", 'brick toggle pause')
text = replace_once(text, "  function saveScore(game,score){try{const key='aizanoi-games'", "  function saveScore(game,score){try{if(window.AizanoiGames){window.AizanoiGames.save(game,score);return;}const key='aizanoi-games'", 'brick shared save')
BRICK.write_text(text)

# ---- Add regression tests ----
TEST = ROOT / 'tests/os-product-polish.test.mjs'
TEST.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const index = readFileSync('frontend/index.html','utf8');
const osJs = readFileSync('frontend/js/os-v2.js','utf8');
const osCss = readFileSync('frontend/css/os-v2.css','utf8');
const games = readFileSync('frontend/games/game-utils.js','utf8');
const mines = readFileSync('frontend/games/mines.js','utf8');
const snake = readFileSync('frontend/games/snake.js','utf8');
const brick = readFileSync('frontend/games/brick.js','utf8');

test('Aizanoi OS V2 stays modular and framework-free', () => {
  assert.match(index, /\/css\/os-v2\.css/);
  assert.match(index, /\/js\/os-v2\.js/);
  assert.match(index, /\/games\/game-utils\.js/);
  assert.doesNotMatch(osJs, /react|vue|tailwind/i);
});

test('AI responses use safe markdown plus local clear/copy UX', () => {
  assert.match(index, /bubble\.innerHTML = renderMarkdownSafe\(text\)/);
  assert.match(index, /__AIZANOI_CHAT__/);
  assert.match(index, /Copy assistant answer/);
  assert.match(osJs, /Copy last answer/);
  assert.match(osJs, /aria-live/);
});

test('all games use local-only best score and pause controls', () => {
  assert.match(games, /aizanoi-games/);
  assert.match(games, /localStorage/);
  for (const source of [mines,snake,brick]) {
    assert.match(source, /AizanoiGames/);
    assert.match(source, /data-game-action/);
    assert.match(source, /paused/);
  }
});

test('single-publisher scope does not add social/account infrastructure', () => {
  const added = [osJs,osCss,games].join('\n');
  assert.doesNotMatch(added, /multiplayer|leaderboard|sign[ -]?in|user account|comment system|websocket/i);
});

test('frontend polish respects lightweight performance budgets', () => {
  assert.ok(statSync('frontend/index.html').size < 175_000, 'index.html exceeded transitional budget');
  assert.ok(statSync('frontend/js/os-v2.js').size < 18_000, 'os-v2.js too large');
  assert.ok(statSync('frontend/css/os-v2.css').size < 18_000, 'os-v2.css too large');
  assert.ok(statSync('frontend/games/game-utils.js').size < 7_000, 'game-utils.js too large');
});
""")

BROWSER = ROOT / 'tests/os-browser-smoke.mjs'
BROWSER.write_text("""import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless:true });

async function open(context){
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!document.getElementById('boot') || document.getElementById('boot').classList.contains('hide'),null,{timeout:5000});
  return {page,errors};
}

{
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const {page,errors}=await open(context);
  await page.evaluate(()=>openApp('chatbot'));
  await page.waitForSelector('.win.active[role="dialog"]');
  assert.equal(await page.locator('.os-v2-chat-toolbar').count(),1,'chat toolbar missing');
  assert.ok(await page.locator('.os-v2-show-desktop').count(),'show desktop missing');
  await page.locator('.os-v2-show-desktop').click();
  assert.equal(await page.locator('.win.active:visible').count(),0,'show desktop did not hide windows');
  await page.locator('.os-v2-show-desktop').click();
  assert.ok(await page.locator('.win:visible').count(),'show desktop did not restore windows');
  await page.evaluate(()=>window.__AIZANOI_CHAT__?.clear());
  assert.deepEqual(errors,[],'desktop browser errors: '+errors.join(' | '));
  await context.close();
}

{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const {page,errors}=await open(context);
  await page.evaluate(()=>openApp('games'));
  const win=page.locator('.win.active');
  await win.waitFor();
  const box=await win.boundingBox();
  assert.ok(box && box.width<=390 && box.height<=844,'mobile window exceeds viewport');
  assert.ok(await page.locator('.win-titlebar').first().evaluate(el=>el.getBoundingClientRect().height>=30),'mobile titlebar too small');
  assert.deepEqual(errors,[],'mobile browser errors: '+errors.join(' | '));
  await context.close();
}
await browser.close();
console.log('Aizanoi OS desktop/mobile smoke passed');
""")

# CI: syntax new modules + run OS browser smoke in existing Chromium job.
ci = CI.read_text()
ci = replace_once(ci, '          node --check frontend/games/brick.js\n', '          node --check frontend/games/brick.js\n          node --check frontend/games/game-utils.js\n          node --check frontend/js/os-v2.js\n', 'ci module syntax')
ci = replace_once(ci, '        run: node tests/ancient-city-browser-smoke.mjs\n', '        run: |\n          node tests/ancient-city-browser-smoke.mjs\n          node tests/os-browser-smoke.mjs\n', 'ci os browser smoke')
CI.write_text(ci)

print('Aizanoi OS product polish V2 patch applied')
