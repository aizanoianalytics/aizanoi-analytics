from pathlib import Path

index = Path('frontend/index.html')
text = index.read_text()
old = '<link rel="icon" type="image/png" href="/icons/MyComputer.png">\n<style>'
new = '<link rel="icon" type="image/svg+xml" href="/assets/branding/aizanoi-logo-mark.svg">\n<link rel="stylesheet" href="/css/aizanoi-polish.css">\n<style>'
if old in text:
    text = text.replace(old, new, 1)
elif '/css/aizanoi-polish.css' not in text:
    raise SystemExit('index polish anchor not found')
index.write_text(text)

app = Path('frontend/ancient-cities/rome-410-476/js/app.js')
text = app.read_text()
old = "canvas.addEventListener('click',()=>canvas.requestPointerLock());document.addEventListener('pointerlockchange',()=>locked=document.pointerLockElement===canvas);document.addEventListener('mousemove',e=>{if(locked){player.yaw-=e.movementX*.0024;player.pitch=Math.max(-.7,Math.min(.55,player.pitch-e.movementY*.002));}});addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyE')nearestInfo();});addEventListener('keyup',e=>keys[e.code]=false);addEventListener('blur',()=>keys={});"
new = """canvas.addEventListener('click',()=>{ if (matchMedia('(pointer:fine)').matches) canvas.requestPointerLock(); });
document.addEventListener('pointerlockchange',()=>locked=document.pointerLockElement===canvas);
document.addEventListener('mousemove',e=>{if(locked){player.yaw-=e.movementX*.0024;player.pitch=Math.max(-.7,Math.min(.55,player.pitch-e.movementY*.002));}});
addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyE')nearestInfo();});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('blur',()=>keys={});
document.querySelectorAll('[data-move]').forEach(btn=>{const code=btn.dataset.move;const down=e=>{e.preventDefault();keys[code]=true;};const up=e=>{e.preventDefault();keys[code]=false;};btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('pointerleave',up);});
const lookPad=$('#lookPad');
if(lookPad){let lookPointer=null,lastX=0,lastY=0;lookPad.addEventListener('pointerdown',e=>{e.preventDefault();lookPointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;lookPad.setPointerCapture?.(e.pointerId);});lookPad.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer)return;e.preventDefault();const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;player.yaw-=dx*.006;player.pitch=Math.max(-.7,Math.min(.55,player.pitch-dy*.0045));});const stopLook=e=>{if(e.pointerId===lookPointer)lookPointer=null;};lookPad.addEventListener('pointerup',stopLook);lookPad.addEventListener('pointercancel',stopLook);}
"""
if old in text:
    text = text.replace(old, new, 1)
elif "document.querySelectorAll('[data-move]')" not in text:
    raise SystemExit('Rome input anchor not found')
app.write_text(text)

mines = Path('frontend/games/mines.js')
text = mines.read_text()
old_decl = 'let board, revealed, flagged, first, over, won, startedAt, timer, longPressTimer;'
new_decl = 'let board, revealed, flagged, first, over, won, startedAt, timer, longPressTimer, suppressNextClick = false;'
if old_decl in text:
    text = text.replace(old_decl, new_decl, 1)
elif 'suppressNextClick' not in text:
    raise SystemExit('Mines state anchor not found')
old_press = "if (e.pointerType === 'touch') longPressTimer = setTimeout(() => { longPressTimer = null; onRClick(x, y); }, 480);"
new_press = "if (e.pointerType === 'touch') longPressTimer = setTimeout(() => { longPressTimer = null; suppressNextClick = true; onRClick(x, y); }, 480);"
if old_press in text:
    text = text.replace(old_press, new_press, 1)
old_click = "if (over) return;\n    if (longPressTimer === null && e.detail === 0) return;"
new_click = "if (over) return;\n    if (suppressNextClick) { suppressNextClick = false; return; }"
if old_click in text:
    text = text.replace(old_click, new_click, 1)
elif 'if (suppressNextClick)' not in text:
    raise SystemExit('Mines click anchor not found')
mines.write_text(text)
