from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label):
    out, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected one regex match, found {count}')
    return out

# ---------------------------------------------------------------------------
# AIZANOI OS / AI CHAT
# ---------------------------------------------------------------------------
index_path = ROOT / 'frontend/index.html'
index = index_path.read_text()

index = replace_once(
    index,
    '<input id="chat-input" type="text" placeholder="Type a message..." style="flex:1; padding:5px 8px; border:1px solid #7f9ac2; font-size:12px; font-family:inherit;" />',
    '<textarea id="chat-input" rows="1" aria-label="Message Aizanoi AI" placeholder="Type a message…  Enter to send · Shift+Enter for newline" style="flex:1; padding:6px 8px; border:1px solid #7f9ac2; font-size:12px; font-family:inherit; resize:none; min-height:32px; max-height:120px; line-height:1.4;"></textarea>',
    'chat textarea',
)

index = replace_once(
    index,
    "let chatHistory = [];\nlet chatWired = false;",
    "let chatHistory = [];\nlet chatWired = false;\nlet chatRequestController = null;\nlet lastFailedMessage = null;",
    'chat state',
)

old_send = r"""  async function sendMessage\(\) \{.*?\n  \}\n  sendBtn\.addEventListener\('click', sendMessage\);\n  input\.addEventListener\('keydown', \(e\) => \{ if \(e\.key === 'Enter'\) sendMessage\(\); \}\);"""
new_send = """  function resizeComposer() {
    input.style.height = 'auto';
    input.style.height = Math.min(120, Math.max(32, input.scrollHeight)) + 'px';
  }
  function rollbackUnansweredUser(text) {
    const last = chatHistory[chatHistory.length - 1];
    if (last?.role === 'user' && last.content === text) chatHistory.pop();
  }
  function addRetry(text, reason) {
    const row = document.createElement('div');
    row.className = 'chat-msg bot chat-error';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const message = document.createElement('span');
    message.textContent = reason || 'Aizanoi AI could not reply.';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'chat-retry'; retry.textContent = 'Retry';
    retry.addEventListener('click', () => {
      row.remove();
      input.value = text; resizeComposer();
      sendMessage();
    });
    bubble.append(message, retry); row.appendChild(bubble); log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }
  async function sendMessage() {
    const text = input.value.trim(); if (!text || input.disabled) return;
    const starters = document.getElementById('chat-starters');
    if (starters) starters.style.display = 'none';
    input.value = ''; resizeComposer(); input.disabled = true; sendBtn.disabled = true; log.setAttribute('aria-busy','true');
    addMessage('user', text); chatHistory.push({ role:'user', content:text });
    const typing = document.createElement('div');
    typing.className = 'chat-msg bot typing';
    typing.innerHTML = '<div class="bubble"><span class="typing-dots" aria-label="Aizanoi AI is thinking"><i></i><i></i><i></i></span></div>';
    log.appendChild(typing); log.scrollTop = log.scrollHeight;
    chatRequestController?.abort();
    const controller = new AbortController();
    chatRequestController = controller;
    const timeout = setTimeout(() => controller.abort('timeout'), 22000);
    try {
      const res = await fetch(CHAT_API_URL, { method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal, body: JSON.stringify({ history: chatHistory }) });
      const data = await res.json(); typing.remove();
      if (!res.ok || !data.reply) {
        rollbackUnansweredUser(text); lastFailedMessage = text;
        addRetry(text, data.error || 'Unable to reply right now.'); flashTaskItem('chatbot');
      } else {
        addMessage('bot', data.reply); chatHistory.push({ role:'assistant', content:data.reply }); lastFailedMessage = null;
      }
    } catch (err) {
      typing.remove(); rollbackUnansweredUser(text); lastFailedMessage = text;
      const reason = err?.name === 'AbortError' || controller.signal.aborted ? 'The request took too long. You can retry.' : 'Connection error. You can retry.';
      addRetry(text, reason); flashTaskItem('chatbot');
    } finally {
      clearTimeout(timeout);
      if (chatRequestController === controller) chatRequestController = null;
      log.setAttribute('aria-busy','false');
      if (document.getElementById('chat-input') === input) { input.disabled = false; sendBtn.disabled = false; input.focus(); }
    }
  }
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('input', resizeComposer);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });"""
index = regex_once(index, old_send, new_send, 'chat send flow')

index = replace_once(
    index,
    "    clear() {\n      chatHistory = [];",
    "    clear() {\n      chatRequestController?.abort(); chatRequestController = null; lastFailedMessage = null;\n      chatHistory = [];",
    'chat clear abort',
)

index = replace_once(
    index,
    "  w.el.remove();\n  openWindows.delete(appId);",
    "  if (typeof w.cleanup === 'function') { try { w.cleanup(); } catch (_) {} }\n  if (appId === 'chatbot') { chatRequestController?.abort(); chatRequestController = null; }\n  w.el.remove();\n  openWindows.delete(appId);",
    'window cleanup on close',
)

old_doc_drag = """  document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
  document.addEventListener('touchmove', (e) => {
    if (dragging) {
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
      e.preventDefault();
    }
  }, { passive: false });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
"""
new_doc_drag = """  const onMouseMove = (e) => moveDrag(e.clientX, e.clientY);
  const onTouchMove = (e) => {
    if (dragging) {
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
      e.preventDefault();
    }
  };
  const onMouseUp = () => { endDrag(); window.__AIZANOI_OS_V2__?.clampWindows?.(); };
  const onTouchEnd = () => { endDrag(); window.__AIZANOI_OS_V2__?.clampWindows?.(); };
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('touchend', onTouchEnd);
  w.cleanup = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('touchend', onTouchEnd);
  };
"""
index = replace_once(index, old_doc_drag, new_doc_drag, 'window document listener cleanup')

# Add keyboard spatial navigation without changing the current click/double-click model.
old_icon_key = """  if (focusedIcon && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    openApp(focusedIcon.dataset.app);
    return;
  }
"""
new_icon_key = """  if (focusedIcon && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    openApp(focusedIcon.dataset.app);
    return;
  }
  if (focusedIcon && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    const icons = [...document.querySelectorAll('.desktop-icon')];
    const current = icons.indexOf(focusedIcon);
    if (current >= 0) {
      const verticalSlots = Math.max(1, Math.floor(document.getElementById('icon-layer').clientHeight / 90));
      const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' ? -verticalSlots : verticalSlots;
      const next = Math.max(0, Math.min(icons.length - 1, current + delta));
      if (next !== current) {
        e.preventDefault();
        icons.forEach((icon) => icon.classList.remove('selected'));
        icons[next].classList.add('selected'); icons[next].focus();
      }
    }
    return;
  }
"""
index = replace_once(index, old_icon_key, new_icon_key, 'desktop keyboard navigation')

# Reading/AI sessions should not trigger a screensaver after ninety seconds.
index = index.replace('const idleMs = 90000;', 'const idleMs = 300000;')
index_path.write_text(index)

# ---------------------------------------------------------------------------
# OS V2: smarter clamping + incremental observer + exported runtime hooks
# ---------------------------------------------------------------------------
os_path = ROOT / 'frontend/js/os-v2.js'
os = os_path.read_text()
os = regex_once(os, r"  function clampWindows\(\) \{.*?\n  \}\n\n  function installShowDesktop", """  function clampWindows() {
    if (matchMedia('(max-width:700px)').matches) return;
    const taskbar = document.getElementById('taskbar');
    const taskbarHeight = taskbar?.getBoundingClientRect().height || 38;
    const rootStyle = getComputedStyle(document.documentElement);
    const safeTop = parseFloat(rootStyle.getPropertyValue('--os-safe-top')) || 0;
    const safeBottom = parseFloat(rootStyle.getPropertyValue('--os-safe-bottom')) || 0;
    const minVisibleX = 96;
    const maxY = Math.max(safeTop, innerHeight - taskbarHeight - safeBottom - 32);
    document.querySelectorAll('.win:not(.maximized)').forEach((win) => {
      const rect = win.getBoundingClientRect();
      const minX = -rect.width + minVisibleX;
      const maxX = innerWidth - minVisibleX;
      let left = Math.min(maxX, Math.max(minX, rect.left));
      let top = Math.min(maxY, Math.max(safeTop, rect.top));
      if (Math.abs(left - rect.left) > .5) win.style.left = `${left}px`;
      if (Math.abs(top - rect.top) > .5) win.style.top = `${top}px`;
      const width = Math.min(rect.width, innerWidth - 12);
      const height = Math.min(rect.height, Math.max(160, innerHeight - taskbarHeight - safeTop - safeBottom - 8));
      if (width < rect.width - .5) win.style.width = `${Math.max(280,width)}px`;
      if (height < rect.height - .5) win.style.height = `${height}px`;
    });
  }

  function installShowDesktop""", 'os clamp')

os = replace_once(
    os,
    "  const observer = new MutationObserver(() => markInteractive());",
    """  let observerFrame = 0;
  let observedMutations = 0;
  const observer = new MutationObserver((mutations) => {
    observedMutations += mutations.length;
    const relevant = mutations.some((mutation) => [...mutation.addedNodes].some((node) =>
      node?.nodeType === 1 && (node.matches?.('.win,.task-item,.ctx-menu,#chat-log') || node.querySelector?.('.win,.task-item,.ctx-menu,#chat-log'))
    ));
    if (!relevant || observerFrame) return;
    observerFrame = requestAnimationFrame(() => { observerFrame = 0; markInteractive(); });
  });""",
    'incremental mutation observer',
)
os = replace_once(
    os,
    "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });\n  else boot();",
    """  window.__AIZANOI_OS_V2__ = Object.freeze({
    clampWindows,
    announce,
    debug: () => ({ observedMutations, decoratedWindows: document.querySelectorAll('.win[data-os-v2-decorated]').length }),
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();""",
    'os debug hooks',
)
os_path.write_text(os)

# ---------------------------------------------------------------------------
# CSS: OS cinematic polish, reduced motion, mobile/tablet resilience
# ---------------------------------------------------------------------------
css_path = ROOT / 'frontend/css/os-v2.css'
css = css_path.read_text()
append_css = r'''

/* Final product polish — stronger depth without abandoning the XP/Luna identity. */
#desktop{height:100dvh;isolation:isolate}
#icon-layer{max-width:calc(100vw - 28px);overflow:hidden}
.icon-label{filter:drop-shadow(0 1px 2px rgba(0,0,0,.38))}
.desktop-icon.selected::after{opacity:1;background:linear-gradient(180deg,rgba(82,143,239,.32),rgba(24,74,164,.24));box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.win.active{box-shadow:0 16px 42px rgba(7,26,70,.26),1px 1px 0 #000,2px 2px 0 #fff,3px 3px 0 #0831d9}
.win.inactive{box-shadow:0 9px 26px rgba(7,26,70,.17),1px 1px 0 rgba(0,0,0,.65)}
.task-item.active{position:relative;background:linear-gradient(180deg,#4f8df0,#245ac4)!important;box-shadow:inset 0 1px rgba(255,255,255,.34)}
.task-item.active::after{content:"";position:absolute;left:6px;right:6px;bottom:1px;height:2px;background:#ffd36b;border-radius:2px}
.chat-error .bubble{border-color:#cf8f82!important;background:#fff1ed!important;color:#6e2d23!important;padding-bottom:8px!important}
.chat-retry{margin-left:8px;border:1px solid #9d5144;border-radius:4px;background:linear-gradient(#fff,#f4d7d0);color:#6d281e;font:700 10px Tahoma;padding:4px 8px;cursor:pointer}
.typing-dots{display:inline-flex;gap:4px;align-items:center;height:18px}
.typing-dots i{display:block;width:5px;height:5px;border-radius:50%;background:#5076aa;animation:osTyping 1s ease-in-out infinite}
.typing-dots i:nth-child(2){animation-delay:.14s}.typing-dots i:nth-child(3){animation-delay:.28s}
#chat-input{overflow-y:auto}
@keyframes osTyping{0%,70%,100%{transform:translateY(0);opacity:.45}35%{transform:translateY(-3px);opacity:1}}
@media (min-width:700px) and (max-height:640px){#icon-layer{overflow-y:auto;scrollbar-width:thin}}
@media (max-width:700px){#icon-layer{height:calc(100dvh - 92px - var(--os-safe-top) - var(--os-safe-bottom));overflow-y:auto;overscroll-behavior:contain}.win-btn{min-width:40px;min-height:32px}.os-v2-show-desktop{width:18px;min-width:18px}}
@media (prefers-reduced-motion:reduce){#boot,.cloud,.win,.balloon,.typing-dots i,.desktop-icon,.desktop-icon::after{animation:none!important;transition:none!important}.typing-dots i{opacity:.75!important;transform:none!important}}
'''
if '/* Final product polish — stronger depth' not in css:
    css += append_css
css_path.write_text(css)

# ---------------------------------------------------------------------------
# BRICK BREAKER: compositor-synchronised RAF with fixed-step simulation
# ---------------------------------------------------------------------------
brick_path = ROOT / 'frontend/games/brick.js'
brick = brick_path.read_text()
brick = brick.replace('let paddleX,ballX,ballY,ballDX,ballDY,bricks,score,lives,over,interval,particles=[],trail=[],paused=false;',
                      'let paddleX,ballX,ballY,ballDX,ballDY,bricks,score,lives,over,rafId=0,lastFrame=0,accumulator=0,particles=[],trail=[],paused=false;')
brick = brick.replace('if(interval)clearInterval(interval);', 'if(rafId)cancelAnimationFrame(rafId);rafId=0;lastFrame=0;accumulator=0;')
brick = replace_once(brick, 'canvas.focus();draw();interval=setInterval(tick,16);', 'canvas.focus();draw();rafId=requestAnimationFrame(loop);', 'brick start loop')
brick = replace_once(brick, "    if(!container.isConnected){if(interval)clearInterval(interval);interval=null;return;}", "    if(!container.isConnected){if(rafId)cancelAnimationFrame(rafId);rafId=0;return;}", 'brick disconnect cleanup')
brick = replace_once(brick, "  function roundRect(ctx,x,y,w,h,r){", """  function loop(now){
    if(!container.isConnected){rafId=0;return;}
    if(!lastFrame)lastFrame=now;
    const dt=Math.min(80,now-lastFrame);lastFrame=now;accumulator+=dt;
    while(accumulator>=16.6667){tick();accumulator-=16.6667;if(over)break;}
    draw();
    if(!over)rafId=requestAnimationFrame(loop);else rafId=0;
  }

  function roundRect(ctx,x,y,w,h,r){""", 'brick loop function')
brick = brick.replace("    if(over||paused){draw();return;}", "    if(over||paused)return;")
brick = brick.replace("    draw();\n  }\n\n  function roundRect", "  }\n\n  function roundRect", 1)
brick = replace_once(brick, "  function end(won){over=true;if(interval)clearInterval(interval);interval=null;saveScore('brick',score);", "  function end(won){over=true;if(rafId)cancelAnimationFrame(rafId);rafId=0;saveScore('brick',score);", 'brick end cleanup')
brick_path.write_text(brick)

# ---------------------------------------------------------------------------
# ROME: stronger hero monument + district-scaled street detail
# ---------------------------------------------------------------------------
rome_path = ROOT / 'frontend/ancient-cities/rome-410-476/js/app.js'
rome = rome_path.read_text()
old_colosseum = r"""function colosseum\(building, color\) \{.*?\n\}\n\nfunction amphitheatre"""
new_colosseum = """function ellipseSurface(cx, y, cz, rx, rz, color, segments = 48) {
  const count = TOUCH ? Math.min(segments, 30) : segments;
  const center = [cx, y, cz];
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2;
    const b = (i + 1) / count * Math.PI * 2;
    tri(center, [cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz], [cx + Math.cos(b) * rx, y, cz + Math.sin(b) * rz], color);
  }
}

function colosseum(building, color) {
  const ground = baseY(building);
  const rx = building.w / 2;
  const rz = building.d / 2;
  const arenaRx = rx * 0.48;
  const arenaRz = rz * 0.47;
  const tiers = TOUCH ? 3 : 4;
  const tierH = building.h / 4;
  // Arena floor + podium wall create a readable interior when approached from the Forum side.
  ellipseSurface(building.x, ground + 0.18, building.z, arenaRx, arenaRz, C.earth, 44);
  ellipticalCylinder(building.x, ground + 0.16, building.z, arenaRx + 1.2, arenaRz + 1.2, 3.0, C.limestone2, 44);
  // Stepped cavea rings. These are intentionally schematic, but their rake makes
  // the monument read as an amphitheatre rather than four stacked cylinders.
  const seatingRings = TOUCH ? 4 : 7;
  for (let ring = 0; ring < seatingRings; ring++) {
    const t = ring / Math.max(1, seatingRings - 1);
    ellipticalCylinder(building.x, ground + 2.7 + ring * 1.18, building.z,
      arenaRx + 5 + t * (rx - arenaRx - 9), arenaRz + 4 + t * (rz - arenaRz - 8), 0.62,
      ring % 2 ? C.limestone : C.marble, TOUCH ? 30 : 46);
  }
  for (let tier = 0; tier < tiers; tier++) {
    const y = ground + tier * tierH;
    const shrink = tier * 1.65;
    const tierColor = tier === tiers - 1 ? C.limestone : (tier % 2 ? C.limestone2 : color);
    ellipticalCylinder(building.x, y, building.z, rx - shrink, rz - shrink, tierH - 0.48, tierColor, TOUCH ? 34 : 56);
    const arcadeCount = TOUCH ? 30 : 56;
    for (let i = 0; i < arcadeCount; i++) {
      // Sparse late-antique damage interrupts the perfect rhythm without turning
      // the 5th-c. monument into a total ruin.
      if (!TOUCH && tier > 1 && (i + tier * 7) % 19 === 0) continue;
      const a = i / arcadeCount * Math.PI * 2;
      const rrX = rx - shrink + 0.22;
      const rrZ = rz - shrink + 0.22;
      const x = building.x + Math.cos(a) * rrX;
      const z = building.z + Math.sin(a) * rrZ;
      const openingH = tierH * 0.48;
      box(x, y + tierH * 0.20, z, tier === tiers - 1 ? 0.72 : 1.05, openingH, 0.48, C.brickDark, -a);
      if (!TOUCH && tier < tiers - 1 && i % 4 === 0) {
        cylinder(x, y + tierH * 0.70, z, 0.22, tierH * 0.18, C.marbleLight, 7);
      }
    }
  }
  if (!TOUCH) {
    const mastCount = 24;
    for (let i = 0; i < mastCount; i++) {
      const a = i / mastCount * Math.PI * 2;
      cylinder(building.x + Math.cos(a) * (rx - 2), ground + building.h - 1.5, building.z + Math.sin(a) * (rz - 2), 0.18, 3.4, C.timber, 6);
    }
  }
}

function amphitheatre"""
rome = regex_once(rome, old_colosseum, new_colosseum, 'Rome Colosseum hero')

old_atmos = r"""function buildAtmosphericDetails\(\) \{.*?\n\}\n\n// Terrain is the physical"""
new_atmos = """function buildAtmosphericDetails() {
  REGIONS.forEach((region, index) => {
    const count = TOUCH ? 1 : 3;
    for (let i = 0; i < count; i++) {
      const angle = index * 2.17 + i * 2.8;
      const x = region.x + Math.cos(angle) * Math.min(58, region.w * 0.31);
      const z = region.z + Math.sin(angle) * Math.min(54, region.d * 0.31);
      if (Math.abs(x - TIBER.x) < TIBER.halfWidth + 18) continue;
      const occupied = BUILDINGS.some((building) => Math.abs(building.x - x) < building.w * 0.62 && Math.abs(building.z - z) < building.d * 0.62);
      if (occupied) continue;
      decorativeCypress(x, z, 0.82 + ((index + i) % 3) * 0.12);
      if (!TOUCH && i === 1) {
        const y = terrainHeightAt(x + 3.1, z - 2.4);
        box(x + 3.1, y + 0.02, z - 2.4, 1.25, 0.72, 0.86, C.timber, angle * 0.2);
        cylinder(x + 4.0, y + 0.02, z - 1.9, 0.24, 0.72, C.roof2, 8);
        cylinder(x + 4.55, y + 0.02, z - 2.15, 0.19, 0.58, C.roof, 8);
      }
    }
  });
  // Forum / market corridors get a restrained layer of columns, crates and
  // amphora-like vessels. They are atmospheric, not claimed as fixed finds.
  if (!TOUCH) {
    for (const building of BUILDINGS.filter((b) => ['forum','market','warehouse'].includes(b.type)).slice(0, 12)) {
      const y = terrainHeightAt(building.x + building.w * .28, building.z + building.d * .40);
      box(building.x + building.w * .28, y + .02, building.z + building.d * .40, 1.5, .75, 1.0, C.timber, building.rot || 0);
      cylinder(building.x + building.w * .22, y + .02, building.z + building.d * .43, .22, .72, C.roof2, 8);
    }
  }
}

// Terrain is the physical"""
rome = regex_once(rome, old_atmos, new_atmos, 'Rome atmosphere')
rome_path.write_text(rome)

# ---------------------------------------------------------------------------
# ATHENS: remove Rome dead code; Hephaisteion + Dionysus theatre + richer Agora
# ---------------------------------------------------------------------------
athens_path = ROOT / 'frontend/ancient-cities/athens-450-430/js/app.js'
athens = athens_path.read_text()
athens = athens.replace("  else if (building.id === 'pantheon') pantheon(building, color);\n", '')

insert_after = """function propylaeaHero(building, color) {
"""
idx = athens.find(insert_after)
if idx < 0: raise SystemExit('Athens propylaea function missing')
# Insert new helpers immediately before ellipticalCylinder, after propylaea function via regex.
athens = regex_once(athens, r"(function propylaeaHero\(building, color\) \{.*?\n\}\n)\nfunction ellipticalCylinder", r"\1\n" + """function hephaisteionHero(building, color) {
  const ground = baseY(building);
  const podium = Math.max(.9, building.h * .12);
  for (let step = 0; step < 3; step++) box(building.x, ground + step * .23, building.z, building.w + 2.2 - step * .55, .26, building.d + 2.0 - step * .50, C.limestone);
  const y = ground + podium;
  const colH = building.h * .56;
  const x0 = building.x - building.w * .43, x1 = building.x + building.w * .43;
  const z0 = building.z - building.d * .43, z1 = building.z + building.d * .43;
  for (let i = 0; i < 6; i++) {
    const x = x0 + (x1 - x0) * i / 5;
    cylinder(x, y, z0, .42, colH, C.marbleLight, TOUCH ? 8 : 11);
    cylinder(x, y, z1, .42, colH, C.marbleLight, TOUCH ? 8 : 11);
  }
  for (let i = 1; i < 12; i++) {
    const z = z0 + (z1 - z0) * i / 12;
    cylinder(x0, y, z, .42, colH, C.marbleLight, TOUCH ? 8 : 11);
    cylinder(x1, y, z, .42, colH, C.marbleLight, TOUCH ? 8 : 11);
  }
  box(building.x, y + .02, building.z, building.w * .54, colH * .88, building.d * .52, color);
  box(building.x, y + colH, building.z, building.w * .94, .72, building.d * .92, C.marble);
  pitchedBuilding(building.x, y + colH + .68, building.z, building.w * .88, Math.max(2.1, building.h * .22), building.d * .84, C.marbleLight);
}

function dionysusTheatreHero(building, color) {
  theatre(building, color);
  const ground = baseY(building);
  // Packed-earth orchestra and a light timber skene better match the Classical
  // period than a later monumental Roman-style stage building.
  cylinder(building.x, ground + .08, building.z + building.d * .12, Math.min(building.w, building.d) * .18, .12, C.roadLight, TOUCH ? 20 : 32);
  box(building.x, ground + .12, building.z - building.d * .26, building.w * .58, 3.1, 4.4, C.timber, building.rot || 0);
}

function stoaHero(building, color) {
  const ground = baseY(building);
  const rot = building.rot || 0;
  box(building.x, ground, building.z, building.w, .52, building.d, C.limestone, rot);
  const colCount = TOUCH ? Math.max(5, Math.round(building.w / 9)) : Math.max(7, Math.round(building.w / 6));
  for (let i = 0; i < colCount; i++) {
    const side = -building.w * .43 + i * (building.w * .86 / Math.max(1, colCount - 1));
    const p = facadePoint({ ...building, rot }, side, building.d * .42);
    cylinder(p[0], ground + .52, p[1], .34, building.h * .60, C.marbleLight, 8);
  }
  pitchedBuilding(building.x, ground + .52, building.z, building.w * .94, building.h - .52, building.d * .76, color, rot);
}

function ellipticalCylinder""", 'Athens hero insert')

athens = replace_once(
    athens,
    "  if (building.id === 'parthenon') parthenonHero(building, color);\n  else if (building.id === 'propylaea' || building.id === 'propylaea-east') propylaeaHero(building, color);\n  else if (building.type === 'temple') temple(building, color);",
    "  if (building.id === 'parthenon') parthenonHero(building, color);\n  else if (building.id === 'propylaea' || building.id === 'propylaea-east') propylaeaHero(building, color);\n  else if (building.id === 'hephaisteion') hephaisteionHero(building, color);\n  else if (building.id === 'theatre-dionysus') dionysusTheatreHero(building, color);\n  else if (String(building.type).toLowerCase() === 'stoa') stoaHero(building, color);\n  else if (building.type === 'temple') temple(building, color);",
    'Athens hero routing',
)

old_ath_atmos = r"""function buildAtmosphericDetails\(\) \{.*?\n\}\n\n// Terrain is the physical"""
new_ath_atmos = """function buildAtmosphericDetails() {
  REGIONS.forEach((region, index) => {
    const count = TOUCH ? 1 : (['agora','lower-city','piraeus'].includes(region.id) ? 4 : 2);
    for (let i = 0; i < count; i++) {
      const angle = index * 2.03 + i * 2.41;
      const x = region.x + Math.cos(angle) * Math.min(52, region.w * .30);
      const z = region.z + Math.sin(angle) * Math.min(48, region.d * .30);
      const occupied = BUILDINGS.some((building) => Math.abs(building.x - x) < building.w * .62 && Math.abs(building.z - z) < building.d * .62);
      if (occupied) continue;
      decorativeOlive(x, z, .80 + ((index + i) % 3) * .13);
      if (!TOUCH && (region.id === 'agora' || region.id === 'piraeus') && i % 2 === 1) {
        const y = terrainHeightAt(x + 2.2, z + 1.6);
        cylinder(x + 2.2, y + .02, z + 1.6, .20, .62, C.roof2, 8);
        cylinder(x + 2.75, y + .02, z + 1.85, .16, .50, C.roof, 8);
        box(x + 3.45, y + .02, z + 1.5, 1.15, .60, .82, C.timber, angle * .18);
      }
    }
  });
}

// Terrain is the physical"""
athens = regex_once(athens, old_ath_atmos, new_ath_atmos, 'Athens atmosphere')
athens_path.write_text(athens)

# ---------------------------------------------------------------------------
# URBAN FABRIC: city-specific district vocabulary instead of one generic palette
# ---------------------------------------------------------------------------
rome_urban_path = ROOT / 'frontend/ancient-cities/rome-410-476/data/urban-fabric.js'
ru = rome_urban_path.read_text()
ru = replace_once(ru, "const REGION_DENSITY = Object.freeze({\n  I: 0.54, II: 0.62, III: 0.72, IV: 0.82, V: 0.70, VI: 0.62, VII: 0.72,\n  VIII: 0.74, IX: 0.74, X: 0.52, XI: 0.58, XII: 0.50, XIII: 0.58, XIV: 0.64,\n});", """const REGION_DENSITY = Object.freeze({
  I: 0.54, II: 0.62, III: 0.72, IV: 0.86, V: 0.72, VI: 0.62, VII: 0.70,
  VIII: 0.78, IX: 0.72, X: 0.52, XI: 0.60, XII: 0.50, XIII: 0.62, XIV: 0.70,
});
const REGION_STYLE = Object.freeze({
  III: { kind:'entertainment', height:[7,14], shop:0.58, courtyard:0.18, materials:['brick','plaster','brickDark'] },
  IV: { kind:'subura', height:[10,18], shop:0.68, courtyard:0.12, materials:['brick','brickDark','plaster2'] },
  VIII:{ kind:'forum-edge', height:[6,12], shop:0.44, courtyard:0.30, materials:['plaster','brick','limestone2'] },
  IX: { kind:'campus', height:[6,13], shop:0.48, courtyard:0.26, materials:['plaster','brick','plaster2'] },
  XIII:{ kind:'aventine', height:[6,13], shop:0.38, courtyard:0.34, materials:['plaster','brick','plaster3'] },
  XIV:{ kind:'river', height:[7,15], shop:0.58, courtyard:0.20, materials:['brick','brickDark','plaster2'] },
});""", 'Rome district profiles')
ru = replace_once(ru, "        const heightBase = 6.5 + hash(`${seed}:h`) * 8.5;\n        const lateUse = hash(`${seed}:use`);\n        const condition = lateUse < 0.09 ? 'damaged' : lateUse < 0.18 ? 'adapted' : 'working';\n        const material = hash(`${seed}:mat`) < 0.48 ? 'brick' : hash(`${seed}:mat2`) < 0.66 ? 'plaster' : 'brickDark';",
"""        const style = REGION_STYLE[region.id] || { kind:'mixed', height:[6.5,15], shop:0.48, courtyard:0.23, materials:['brick','plaster','brickDark'] };
        const heightBase = style.height[0] + hash(`${seed}:h`) * (style.height[1] - style.height[0]);
        const lateUse = hash(`${seed}:use`);
        const condition = lateUse < 0.09 ? 'damaged' : lateUse < 0.18 ? 'adapted' : 'working';
        const material = style.materials[Math.min(style.materials.length - 1, Math.floor(hash(`${seed}:mat`) * style.materials.length))];""", 'Rome style calculation')
ru = replace_once(ru, "          courtyard: hash(`${seed}:court`) > 0.77,\n          shopfront: street && street.distance < 52 && hash(`${seed}:shop`) > 0.48,",
"          courtyard: hash(`${seed}:court`) > (1 - style.courtyard),\n          shopfront: street && street.distance < 52 && hash(`${seed}:shop`) > (1 - style.shop),\n          districtStyle: style.kind,", 'Rome style fields')
rome_urban_path.write_text(ru)

ath_urban_path = ROOT / 'frontend/ancient-cities/athens-450-430/data/urban-fabric.js'
au = ath_urban_path.read_text()
au = replace_once(au, "const DISTRICT_DENSITY = Object.freeze({\n  acropolis: 0.18,\n  'south-slope': 0.32,\n  agora: 0.40,\n  'lower-city': 0.66,\n  kerameikos: 0.58,\n  northgate: 0.42,\n  pnyx: 0.16,\n  olympieion: 0.18,\n  'long-walls': 0.22,\n  piraeus: 0.78,\n});", """const DISTRICT_DENSITY = Object.freeze({
  acropolis: 0.18, 'south-slope': 0.34, agora: 0.46, 'lower-city': 0.70,
  kerameikos: 0.60, northgate: 0.44, pnyx: 0.16, olympieion: 0.18,
  'long-walls': 0.22, piraeus: 0.80,
});
const DISTRICT_STYLE = Object.freeze({
  agora: { kind:'civic-market', height:[4,8], shop:0.62, courtyard:0.30, materials:['plaster','plaster3','limestone2'] },
  'lower-city': { kind:'courtyard-houses', height:[5,10], shop:0.48, courtyard:0.46, materials:['plaster','plaster2','plaster3'] },
  kerameikos: { kind:'workshops', height:[5,10], shop:0.58, courtyard:0.34, materials:['plaster2','plaster3','brick'] },
  piraeus: { kind:'harbour-grid', height:[6,13], shop:0.64, courtyard:0.26, materials:['plaster','plaster2','limestone2'] },
  'south-slope': { kind:'slope-houses', height:[4,8], shop:0.30, courtyard:0.38, materials:['plaster','limestone2','plaster3'] },
});""", 'Athens district profiles')
au = regex_once(au, r"        const heightBase = region\.id === 'agora'.*?\n        const condition = hash\(`\$\{seed\}:use`\) < 0\.10 \? 'damaged' : 'working';\n        const material = hash\(`\$\{seed\}:mat`\) < 0\.5 \? 'brick' : hash\(`\$\{seed\}:mat2`\) < 0\.7 \? 'plaster' : 'brickDark';", """        const style = DISTRICT_STYLE[region.id] || { kind:'mixed-houses', height:[5,10], shop:0.42, courtyard:0.38, materials:['plaster','plaster2','limestone2'] };
        const heightBase = style.height[0] + hash(`${seed}:h`) * (style.height[1] - style.height[0]);
        const condition = hash(`${seed}:use`) < 0.10 ? 'damaged' : 'working';
        const material = style.materials[Math.min(style.materials.length - 1, Math.floor(hash(`${seed}:mat`) * style.materials.length))];""", 'Athens style calculation')
au = replace_once(au, "          courtyard: hash(`${seed}:court`) > 0.78,\n          shopfront: street && street.distance < 48 && hash(`${seed}:shop`) > 0.5,",
"          courtyard: hash(`${seed}:court`) > (1 - style.courtyard),\n          shopfront: street && street.distance < 48 && hash(`${seed}:shop`) > (1 - style.shop),\n          districtStyle: style.kind,", 'Athens style fields')
ath_urban_path.write_text(au)

# ---------------------------------------------------------------------------
# Shared Ancient World HUD polish
# ---------------------------------------------------------------------------
city_css_path = ROOT / 'frontend/ancient-world/engine/city-polish.css'
city_css = city_css_path.read_text()
city_append = r'''

/* Final cinematic pass: increase readability/depth while staying GPU-cheap. */
body[data-city] #glCanvas{transform:translateZ(0)}
body[data-city] .brand{backdrop-filter:blur(14px) saturate(1.08)}
body[data-city] .place{max-width:min(540px,calc(100vw - 18px));border-left:2px solid rgba(231,188,108,.55)}
body[data-city] .place b{letter-spacing:.025em}
body[data-city] .miniWrap{backdrop-filter:blur(14px) saturate(1.08)}
body[data-city] .controls button:focus-visible,body[data-city] .controls select:focus-visible{outline:2px solid #f0c879;outline-offset:2px}
body[data-city] .region{transition:background .14s ease,border-color .14s ease,transform .14s ease}
body[data-city] .region:hover{background:rgba(255,255,255,.055);border-color:rgba(231,188,108,.35);transform:translateY(-1px)}
body[data-city="rome"]::before{background:radial-gradient(ellipse at 50% 55%,transparent 30%,rgba(51,25,14,.09) 70%,rgba(12,6,5,.52) 118%),linear-gradient(180deg,rgba(225,161,100,.08),transparent 34%,transparent 68%,rgba(30,14,8,.16))}
body[data-city="athens"]::before{background:radial-gradient(ellipse at 50% 55%,transparent 34%,rgba(80,56,22,.055) 72%,rgba(16,12,7,.37) 118%),linear-gradient(180deg,rgba(255,229,174,.10),transparent 36%,transparent 72%,rgba(43,29,11,.10))}
@media(pointer:coarse),(max-width:820px){body[data-city] .place{max-width:calc(100vw - 92px);font-size:11px}body[data-city] .miniWrap{max-width:42vw}}
@media(prefers-reduced-motion:reduce){body[data-city] .region{transition:none!important;transform:none!important}}
'''
if '/* Final cinematic pass' not in city_css: city_css += city_append
city_css_path.write_text(city_css)

# ---------------------------------------------------------------------------
# REGRESSION TESTS
# ---------------------------------------------------------------------------
test_path = ROOT / 'tests/final-polish.test.mjs'
test_path.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(p)=>readFileSync(p,'utf8');
const index=read('frontend/index.html');
const os=read('frontend/js/os-v2.js');
const brick=read('frontend/games/brick.js');
const rome=read('frontend/ancient-cities/rome-410-476/js/app.js');
const athens=read('frontend/ancient-cities/athens-450-430/js/app.js');
const ru=read('frontend/ancient-cities/rome-410-476/data/urban-fabric.js');
const au=read('frontend/ancient-cities/athens-450-430/data/urban-fabric.js');

test('window lifecycle removes document-level drag listeners and clamps after drag',()=>{
  assert.match(index,/w\.cleanup = \(\) =>/); assert.match(index,/typeof w\.cleanup === 'function'/); assert.match(index,/__AIZANOI_OS_V2__\?\.clampWindows/);
});
test('OS observer is incremental rather than rescanning on every DOM mutation',()=>{
  assert.match(os,/relevant = mutations\.some/); assert.match(os,/observerFrame = requestAnimationFrame/); assert.match(os,/__AIZANOI_OS_V2__/);
});
test('AI composer supports multiline, timeout, retry and abort on close',()=>{
  assert.match(index,/<textarea id="chat-input"/); assert.match(index,/!e\.shiftKey/); assert.match(index,/new AbortController/); assert.match(index,/22000/); assert.match(index,/chat-retry/);
});
test('Brick Breaker uses requestAnimationFrame instead of a 16ms interval',()=>{
  assert.match(brick,/requestAnimationFrame\(loop\)/); assert.match(brick,/accumulator/); assert.doesNotMatch(brick,/setInterval\(tick,16\)/);
});
test('Rome and Athens have city-specific final hero/detail vocabulary',()=>{
  assert.match(rome,/ellipseSurface/); assert.match(rome,/seatingRings/); assert.match(rome,/mastCount/); assert.match(rome,/Forum \/ market corridors/);
  assert.match(athens,/hephaisteionHero/); assert.match(athens,/dionysusTheatreHero/); assert.match(athens,/stoaHero/); assert.doesNotMatch(athens,/building\.id === 'pantheon'/);
});
test('urban fabric uses district-specific style profiles without upgrading evidence',()=>{
  assert.match(ru,/REGION_STYLE/); assert.match(ru,/districtStyle/); assert.match(au,/DISTRICT_STYLE/); assert.match(au,/districtStyle/);
  assert.match(ru,/level: 'plausible'/); assert.match(au,/level: 'plausible'/);
});
""")

print('Final polish patch applied')
