from pathlib import Path

INDEX = Path('frontend/index.html')
text = INDEX.read_text(encoding='utf-8')
original = text


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)


# 1) Remove an orphaned CSS declaration block left after .win-menu-dropdown.
replace_once(
"""  }
    background: #fff; border: 2px solid #6f9bdc;
    box-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    z-index: 5000; min-width: 180px; padding: 2px;
    font-size: 11px; color: #000; display: none;
  }
  .win-menu-dropdown.open { display: block; }""",
"""  }
  .win-menu-dropdown.open { display: block; }""",
'CSS orphan block',
)

# 2) Remove dead Market icon-map references. /market/ stays intentionally removed.
replace_once(
"games:'/assets/icons/games.svg', ancient:'/assets/icons/ancient-world.svg', market:'/icons/Run.png',",
"games:'/assets/icons/games.svg', ancient:'/assets/icons/ancient-world.svg', videos:'/assets/icons/aizanoi-tv.svg',",
'ICON_PNG market cleanup',
)
replace_once(
"    'games':'games','ancient':'ancient','market':'market'\n",
"    'games':'games','ancient':'ancient','videos':'videos'\n",
'iconKeyMap market cleanup',
)

# 3) Use the custom Aizanoi icon family in the Start menu for branded apps.
icon_replacements = {
    '/icons/AizanoiAI.png': '/assets/icons/aizanoi-ai.svg',
    '/icons/Notepad.png': '/assets/icons/notepad.svg',
    '/icons/CommandPrompt.png': '/assets/icons/terminal.svg',
    '/icons/FolderClosed.png': '/assets/icons/projects.svg',
    '/icons/Information.png': '/assets/icons/about.svg',
    '/icons/GameController.png': '/assets/icons/games.svg',
    '/icons/FolderOpened.png': '/assets/icons/ancient-world.svg',
    '/icons/RecycleBin(empty).png': '/assets/icons/recycle-bin.svg',
    '/icons/ControlPanel.png': '/assets/icons/control-panel.svg',
}
for old, new in icon_replacements.items():
    # Some legacy icon paths also appear elsewhere, so only replace the first Start-menu use.
    if old not in text:
        raise SystemExit(f'icon replacement missing: {old}')
    text = text.replace(old, new, 1)

# 4) Surface Aizanoi TV in the launcher/desktop without inventing content.
replace_once(
"""      <div class=\"sm-item\" data-app=\"projects\"><span class=\"em\"><img src=\"/assets/icons/projects.svg\" alt=\"\"></span> Projects</div>
      <div class=\"sm-divider\"></div>""",
"""      <div class=\"sm-item\" data-app=\"projects\"><span class=\"em\"><img src=\"/assets/icons/projects.svg\" alt=\"\"></span> Projects</div>
      <div class=\"sm-item\" data-app=\"videos\"><span class=\"em\"><img src=\"/assets/icons/aizanoi-tv.svg\" alt=\"\"></span> Aizanoi TV</div>
      <div class=\"sm-divider\"></div>""",
'Start menu Aizanoi TV',
)
replace_once(
"""  { id: 'projects',   label: 'Projects', icon: 'projects' },
  { id: 'about',      label: 'About Aizanoi', icon: 'about' }""",
"""  { id: 'projects',   label: 'Projects', icon: 'projects' },
  { id: 'videos',     label: 'Aizanoi TV', icon: 'videos' },
  { id: 'about',      label: 'About Aizanoi', icon: 'about' }""",
'Desktop Aizanoi TV',
)

# 5) Correct the Control Panel launcher bug.
replace_once(
"else if (a === 'control') openApp('mycomputer');",
"else if (a === 'control') openApp('control');",
'Control Panel launcher',
)

# 6) Correct historical status: UNESCO currently lists Aizanoi on Türkiye's Tentative List (since 2012).
replace_once(
"Aizanoi was inscribed on the UNESCO World Heritage List in 2025.",
"Aizanoi has been on Türkiye's UNESCO World Heritage Tentative List since 2012.",
'Ancient World UNESCO summary',
)
replace_once(
"<p><b>Heritage status.</b> Inscribed on the UNESCO World Heritage List in 2025.</p>",
"<p><b>Heritage status.</b> On Türkiye's UNESCO World Heritage Tentative List since 2012.</p>",
'Ancient World UNESCO detail',
)

# 7) Avoid an unverified privacy promise about third-party provider training/retention.
replace_once(
"Messages you send to Aizanoi AI are forwarded to third-party AI providers (Groq and Google) to generate a reply. They are not used to train those providers' models.",
"Messages you send to Aizanoi AI are forwarded to third-party AI providers (currently Groq and Google) to generate a reply. Their handling is subject to the providers' applicable terms and privacy policies.",
'Privacy provider wording',
)

# 8) Standardize the user-facing interface name. This token is only visible copy in this file.
text = text.replace('AizanoiOS', 'Aizanoi OS')

# 9) Add a boot fail-safe in its own early script. It still works even if a later large
# inline script fails to parse/execute, preventing an infinite boot overlay.
replace_once(
"""<div id=\"click-catcher\"></div>

<!-- === START MENU === -->""",
"""<div id=\"click-catcher\"></div>
<script>
// Independent boot escape hatch: keep the desktop reachable even if a later
// application script fails before its normal boot handler is registered.
window.__aizanoiBootEscape = setTimeout(function () {
  var boot = document.getElementById('boot');
  var desktop = document.getElementById('desktop');
  if (boot && getComputedStyle(boot).display !== 'none') {
    boot.style.opacity = '0';
    boot.style.pointerEvents = 'none';
    setTimeout(function () {
      if (boot) boot.style.display = 'none';
      if (desktop) {
        desktop.style.display = '';
        desktop.style.visibility = 'visible';
        desktop.style.opacity = '1';
      }
    }, 250);
  }
}, 4000);
</script>

<!-- === START MENU === -->""",
'Early boot escape hatch',
)

# 10) Basic keyboard semantics for generated window controls and Start-menu controls.
replace_once(
"""        <div class=\"win-btn min\" data-act=\"min\" title=\"Minimize\">_</div>
        <div class=\"win-btn max\" data-act=\"max\" title=\"Maximize\">□</div>
        <div class=\"win-btn close\" data-act=\"close\" title=\"Close\">✕</div>""",
"""        <div class=\"win-btn min\" data-act=\"min\" title=\"Minimize\" role=\"button\" tabindex=\"0\" aria-label=\"Minimize window\">_</div>
        <div class=\"win-btn max\" data-act=\"max\" title=\"Maximize\" role=\"button\" tabindex=\"0\" aria-label=\"Maximize or restore window\">□</div>
        <div class=\"win-btn close\" data-act=\"close\" title=\"Close\" role=\"button\" tabindex=\"0\" aria-label=\"Close window\">✕</div>""",
'Window control semantics',
)
replace_once(
"""const startBtn = document.getElementById('start-btn');
const startMenu = document.getElementById('start-menu');
const catcher = document.getElementById('click-catcher');""",
"""const startBtn = document.getElementById('start-btn');
const startMenu = document.getElementById('start-menu');
const catcher = document.getElementById('click-catcher');
startBtn.setAttribute('role', 'button');
startBtn.setAttribute('tabindex', '0');
startBtn.setAttribute('aria-label', 'Open Start menu');
document.querySelectorAll('#start-menu .sm-item, #start-menu .sm-foot-btn').forEach(function (item) {
  item.setAttribute('role', 'button');
  item.setAttribute('tabindex', '0');
});""",
'Start menu semantics',
)
replace_once(
"""startBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleStartMenu(); });
catcher.addEventListener('click', () => { closeStartMenu(); closeAllCtxMenus(); });""",
"""startBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleStartMenu(); });
startBtn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStartMenu(); }
});
catcher.addEventListener('click', () => { closeStartMenu(); closeAllCtxMenus(); });
document.addEventListener('keydown', (e) => {
  if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.closest) return;
  var target = e.target.closest('.win-btn, #start-menu .sm-item, #start-menu .sm-foot-btn, .task-item');
  if (target) { e.preventDefault(); target.click(); }
});""",
'Keyboard activation',
)

# 11) Taskbar entries are dynamically generated; expose them to the keyboard too.
replace_once(
"""  taskItem.className = 'task-item active';
  taskItem.id = 'task-' + appId;""",
"""  taskItem.className = 'task-item active';
  taskItem.id = 'task-' + appId;
  taskItem.setAttribute('role', 'button');
  taskItem.setAttribute('tabindex', '0');
  taskItem.setAttribute('aria-label', title);""",
'Taskbar semantics',
)

if text == original:
    raise SystemExit('No changes produced')

INDEX.write_text(text, encoding='utf-8')
print(f'Patched {INDEX}: {len(original)} -> {len(text)} bytes')
