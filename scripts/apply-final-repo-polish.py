#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / 'frontend'


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + '\n', encoding='utf-8')


# ---------------------------------------------------------------------------
# Aizanoi OS: mechanically extract stable inline surfaces and finish metadata.
# ---------------------------------------------------------------------------
index_path = FRONTEND / 'index.html'
index = index_path.read_text(encoding='utf-8')

if 'property="og:image"' not in index:
    needle = '<meta property="og:url" content="https://aizanoianalytics.com/">\n'
    require(needle in index, 'OS metadata anchor changed')
    index = index.replace(needle, needle + (
        '<meta property="og:type" content="website">\n'
        '<meta property="og:site_name" content="Aizanoi Analytics">\n'
        '<meta property="og:image" content="https://aizanoianalytics.com/assets/branding/aizanoi-og.svg">\n'
        '<meta property="og:image:width" content="1200">\n'
        '<meta property="og:image:height" content="630">\n'
        '<meta property="og:image:alt" content="Aizanoi Analytics — HR analytics, AI and interactive ancient history">\n'
        '<meta name="twitter:card" content="summary_large_image">\n'
        '<meta name="twitter:image" content="https://aizanoianalytics.com/assets/branding/aizanoi-og.svg">\n'
    ), 1)

# First head style block is the OS core stylesheet. Externalizing it removes the
# largest presentation island from the HTML without changing selectors/order.
style_match = re.search(r'<style>\n(?P<css>[\s\S]*?)\n</style>', index)
require(style_match is not None, 'OS core style block not found')
os_css = style_match.group('css')
require('Windows XP Luna Blue' in os_css and '#desktop' in os_css and '.win' in os_css,
        'OS core style block identity check failed')
write(FRONTEND / 'css' / 'os-core.css', os_css)
index = index[:style_match.start()] + '<link rel="stylesheet" href="/css/os-core.css">' + index[style_match.end():]

# Chat runtime: preserve implementation but use the fallback-chain-aware timeout.
chat_start = index.find('/* === CHAT === */')
terminal_start = index.find('/* === TERMINAL (GERCEK KOMUT) === */')
require(chat_start >= 0 and terminal_start > chat_start, 'chat/terminal markers changed')
chat_code = index[chat_start:terminal_start].strip()
require('wireChatIfNeeded' in chat_code and 'chatRequestController' in chat_code, 'chat runtime identity failed')
chat_code = chat_code.replace("let lastFailedMessage = null;", "let lastFailedMessage = null;\nlet lastUserMessage = '';", 1)
chat_code = chat_code.replace("const timeout = setTimeout(() => controller.abort('timeout'), 22000);",
                              "const timeout = setTimeout(() => controller.abort('timeout'), 80000);", 1)
chat_code = chat_code.replace("const text = input.value.trim(); if (!text || input.disabled) return;",
                              "const text = input.value.trim(); if (!text || input.disabled) return;\n    lastUserMessage = text;", 1)
chat_code = chat_code.replace("if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }",
                              "if (!e.isComposing && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }", 1)
api_anchor = "  window.__AIZANOI_CHAT__ = {\n    clear() {"
require(api_anchor in chat_code, 'chat API anchor changed')
chat_code = chat_code.replace(api_anchor,
    "  window.__AIZANOI_CHAT__ = {\n"
    "    abort() { chatRequestController?.abort(); chatRequestController = null; },\n"
    "    retryLast() {\n"
    "      const text = lastFailedMessage || lastUserMessage;\n"
    "      if (!text || input.disabled) return false;\n"
    "      input.value = text; resizeComposer(); sendMessage(); return true;\n"
    "    },\n"
    "    clear() {", 1)
chat_code = chat_code.replace("chatRequestController?.abort(); chatRequestController = null; lastFailedMessage = null;",
                              "chatRequestController?.abort(); chatRequestController = null; lastFailedMessage = null; lastUserMessage = '';", 1)
index = index[:chat_start] + '/* Chat runtime moved to /js/chat.js */\n\n' + index[terminal_start:]

# Terminal runtime is self-contained except for global helpers intentionally
# provided by the OS core. Keep the exact code, only change its file boundary.
terminal_start = index.find('/* === TERMINAL (GERCEK KOMUT) === */')
boot_start = index.find('/* === BOOT === */', terminal_start)
require(terminal_start >= 0 and boot_start > terminal_start, 'terminal/boot markers changed')
terminal_code = index[terminal_start:boot_start].strip()
require('wireTerminalIfNeeded' in terminal_code and 'TERM_API_URL' in terminal_code, 'terminal runtime identity failed')
index = index[:terminal_start] + '/* Terminal runtime moved to /js/terminal.js */\n\n' + index[boot_start:]

# Bottom-of-document router and chat-starter helpers are classic scripts and can
# be moved verbatim as long as their relative load order is preserved.
router_open = index.find('<script>\nconst ROUTE_MAP =')
require(router_open >= 0, 'router script anchor not found')
router_close = index.find('</script>', router_open)
require(router_close > router_open, 'router script closing tag not found')
router_code = index[router_open + len('<script>\n'):router_close].strip()
require('initRouter' in router_code and 'APP_TO_ROUTE' in router_code, 'router runtime identity failed')
index = index[:router_open] + index[router_close + len('</script>'):]

starter_open = index.find('<script>\nfunction wireChatStartersIfNeeded()')
require(starter_open >= 0, 'chat starter script anchor not found')
starter_close = index.find('</script>', starter_open)
require(starter_close > starter_open, 'chat starter closing tag not found')
starter_code = index[starter_open + len('<script>\n'):starter_close].strip()
require('wireChatStartersIfNeeded' in starter_code, 'chat starter runtime identity failed')
index = index[:starter_open] + index[starter_close + len('</script>'):]
chat_code += '\n\n' + starter_code

write(FRONTEND / 'js' / 'chat.js', chat_code)
write(FRONTEND / 'js' / 'terminal.js', terminal_code)
write(FRONTEND / 'js' / 'os-router.js', router_code)

script_anchor = '<script src="/games/game-utils.js"></script>'
require(script_anchor in index, 'bottom script anchor changed')
index = index.replace(script_anchor,
    '<script src="/js/chat.js"></script>\n'
    '<script src="/js/terminal.js"></script>\n'
    '<script src="/js/os-router.js"></script>\n'
    + script_anchor, 1)
index_path.write_text(index, encoding='utf-8')

# ---------------------------------------------------------------------------
# OS V2: retire compatibility shims now that core window/chat lifecycles own
# cleanup, textarea and request cancellation directly. Keep UI/a11y enhancement.
# ---------------------------------------------------------------------------
os_path = FRONTEND / 'js' / 'os-v2.js'
os = os_path.read_text(encoding='utf-8')
os = os.replace("  const CHAT_TIMEOUT_MS = 80000;\n", "")
os = os.replace("  const CHAT_TIMEOUT_MS = 45000;\n", "")
os = os.replace("  let chatController = null;\n", "")
os = os.replace("  let lastChatPrompt = '';\n", "")

os, count = re.subn(
    r"\n  function installWindowLifecycleBridge\(\) \{[\s\S]*?\n  \}\n\n  function abortChatRequest\(\)",
    "\n  function abortChatRequest()",
    os,
    count=1,
)
require(count == 1, 'window lifecycle bridge block changed')

# Replace the old controller-backed abort + fetch guard + input conversion with
# the explicit chat module API.
abort_start = os.find('  function abortChatRequest()')
toolbar_start = os.find('  function installChatToolbar()', abort_start)
require(abort_start >= 0 and toolbar_start > abort_start, 'chat shim block changed')
replacement = "  function abortChatRequest() {\n    window.__AIZANOI_CHAT__?.abort?.();\n  }\n\n"
os = os[:abort_start] + replacement + os[toolbar_start:]
os = os.replace("    const input = ensureChatTextarea();", "    const input = document.getElementById('chat-input');", 1)

# Prompt capture belonged to the compatibility implementation. The chat module
# now owns last-message state and exposes retryLast().
os, count = re.subn(
    r"\n    if \(!send\.dataset\.osV2PromptCapture\) \{[\s\S]*?\n    \}\n\n    let bar =",
    "\n\n    let bar =",
    os,
    count=1,
)
require(count == 1, 'prompt capture block changed')

old_retry = """      if (action === 'retry') {
        if (!lastChatPrompt) return announce('No message to retry');
        if (send.disabled) return announce('Aizanoi AI is still replying');
        input.value = lastChatPrompt;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        send.click();
      }
"""
new_retry = """      if (action === 'retry') {
        if (send.disabled) return announce('Aizanoi AI is still replying');
        const retried = window.__AIZANOI_CHAT__?.retryLast?.();
        if (!retried) announce('No message to retry');
      }
"""
require(old_retry in os, 'retry toolbar block changed')
os = os.replace(old_retry, new_retry, 1)
os = os.replace('    installWindowLifecycleBridge();\n', '')
os = os.replace('    installChatFetchGuard();\n', '')

# Desktop marquee selection is a real desktop affordance; install only for
# fine-pointer devices and never intercept windows/taskbar/form controls.
if 'function installDesktopMarquee()' not in os:
    marquee = r'''  function installDesktopMarquee() {
    const desktop = document.getElementById('desktop');
    if (!desktop || desktop.dataset.osV2Marquee || matchMedia('(pointer:coarse)').matches) return;
    desktop.dataset.osV2Marquee = '1';
    let start = null;
    let pointerId = null;
    let marquee = null;
    const blocked = (target) => Boolean(target.closest('.desktop-icon,.win,#taskbar,#start-menu,.ctx-menu,.balloon,button,input,textarea,select,a'));
    const clearSelection = () => document.querySelectorAll('.desktop-icon.selected').forEach((icon) => icon.classList.remove('selected'));
    const finish = (event) => {
      if (pointerId === null || (event && event.pointerId !== pointerId)) return;
      try { desktop.releasePointerCapture?.(pointerId); } catch (_) {}
      marquee?.remove(); marquee = null; start = null; pointerId = null;
    };
    desktop.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.pointerType === 'touch' || blocked(event.target)) return;
      clearSelection();
      start = { x:event.clientX, y:event.clientY }; pointerId = event.pointerId;
      marquee = document.createElement('div'); marquee.className = 'os-v2-marquee'; marquee.hidden = true;
      marquee.style.cssText = 'position:fixed;z-index:4;pointer-events:none;border:1px solid rgba(96,157,255,.95);background:rgba(74,133,226,.20);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);';
      desktop.appendChild(marquee); try { desktop.setPointerCapture?.(pointerId); } catch (_) {}
    });
    desktop.addEventListener('pointermove', (event) => {
      if (!start || event.pointerId !== pointerId || !marquee) return;
      const left=Math.min(start.x,event.clientX), top=Math.min(start.y,event.clientY);
      const width=Math.abs(event.clientX-start.x), height=Math.abs(event.clientY-start.y);
      if (width + height < 8) return;
      marquee.hidden=false; Object.assign(marquee.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});
      const box={left,top,right:left+width,bottom:top+height};
      document.querySelectorAll('.desktop-icon').forEach((icon)=>{
        const rect=icon.getBoundingClientRect();
        icon.classList.toggle('selected',rect.right>=box.left&&rect.left<=box.right&&rect.bottom>=box.top&&rect.top<=box.bottom);
      });
    });
    desktop.addEventListener('pointerup', finish);
    desktop.addEventListener('pointercancel', finish);
  }

'''
    anchor = '  function installShowDesktop() {'
    require(anchor in os, 'show desktop anchor changed')
    os = os.replace(anchor, marquee + anchor, 1)
    os = os.replace('    installShowDesktop();\n', '    installShowDesktop();\n    installDesktopMarquee();\n', 1)

# Expose only stable debug/recovery primitives needed by the core and tests.
if 'window.__AIZANOI_OS_V2__ = Object.freeze' not in os:
    api = """
  window.__AIZANOI_OS_V2__ = Object.freeze({
    clampWindows,
    announce,
    debug: () => ({
      decoratedWindows: document.querySelectorAll('.win[data-os-v2-decorated]').length,
      marqueeEnabled: document.getElementById('desktop')?.dataset.osV2Marquee === '1',
    }),
  });

"""
    ready_anchor = "  if (document.readyState === 'loading')"
    require(ready_anchor in os, 'OS ready-state anchor changed')
    os = os.replace(ready_anchor, api + ready_anchor, 1)
os_path.write_text(os, encoding='utf-8')

# ---------------------------------------------------------------------------
# Historic World: split presentation + largest runtime mechanically. This keeps
# the same DOM/script position and does not alter reconstruction logic.
# ---------------------------------------------------------------------------
historic_path = FRONTEND / 'historic-world' / 'index.html'
historic = historic_path.read_text(encoding='utf-8')
if 'property="og:image"' not in historic:
    desc = '<meta name="description" content="A self-contained archaeological first-person reconstruction of Roman Aizanoi, with touch controls, an annotated Texier survey, historical layers and research notes.">\n'
    require(desc in historic, 'Historic World metadata anchor changed')
    historic = historic.replace(desc, desc + (
        '<link rel="canonical" href="https://aizanoianalytics.com/historic-world/">\n'
        '<meta property="og:title" content="Aizanoi Historic World — Interactive Roman City Reconstruction">\n'
        '<meta property="og:description" content="Explore Roman Aizanoi through an evidence-labelled first-person archaeological reconstruction.">\n'
        '<meta property="og:url" content="https://aizanoianalytics.com/historic-world/">\n'
        '<meta property="og:type" content="website">\n'
        '<meta property="og:image" content="https://aizanoianalytics.com/assets/branding/aizanoi-og.svg">\n'
        '<meta name="twitter:card" content="summary_large_image">\n'
    ), 1)

historic_style = re.search(r'<style>\n?(?P<css>[\s\S]*?)</style>', historic)
require(historic_style is not None, 'Historic World style block not found')
historic_css = historic_style.group('css')
require('#glCanvas' in historic_css and '.hero' in historic_css and '#hud' in historic_css,
        'Historic World style identity failed')
write(FRONTEND / 'historic-world' / 'style.css', historic_css)
historic = historic[:historic_style.start()] + '<link rel="stylesheet" href="./style.css">' + historic[historic_style.end():]

plain_scripts = list(re.finditer(r'<script>(?P<js>[\s\S]*?)</script>', historic))
require(plain_scripts, 'Historic World inline scripts not found')
largest = max(plain_scripts, key=lambda match: len(match.group('js')))
historic_js = largest.group('js').strip()
require(len(historic_js) > 150_000, 'Historic World largest inline script unexpectedly small')
require('document.currentScript' not in historic_js, 'Historic World runtime depends on inline currentScript')
require('moveWithSubsteps' in historic_js and 'absoluteSupportAt' in historic_js and 'requestAnimationFrame' in historic_js,
        'Historic World runtime identity failed')
write(FRONTEND / 'historic-world' / 'app.js', historic_js)
historic = historic[:largest.start()] + '<script src="./app.js"></script>' + historic[largest.end():]
historic_path.write_text(historic, encoding='utf-8')

print('Final repository modularization/polish migration applied successfully.')
