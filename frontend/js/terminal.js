/* === TERMINAL (GERCEK KOMUT) === */
const TERM_API_URL = '/api/terminal/exec';
const TERM_HISTORY = [];
let TERM_HIST_IDX = -1;
let termWired = false;

function termOut(html, cls) {
  const out = document.getElementById('term-out');
  if (!out) return;
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.innerHTML = html;
  out.appendChild(d);
  out.scrollTop = out.scrollHeight;
}
function termClear() {
  const o = document.getElementById('term-out');
  if (o) o.innerHTML = '';
}
function termPrompt() {
  return `<span class="prompt">C:\\Aizanoi&gt;</span> `;
}

async function wireTerminalIfNeeded() {
  const input = document.getElementById('term-input');
  const out = document.getElementById('term-out');
  if (!input || !out || termWired) return;
  termWired = true;
  // Logo
  termOut('<span style="color:#aaa;">Microsoft Windows XP [Version 5.1.2600]</span>');
  termOut('<span style="color:#aaa;">(C) Copyright 1985-2001 Microsoft Corp.</span>');
  termOut('<span style="color:#aaa;">Aizanoi Terminal — sandboxed shell. Available: pwd, whoami, date, echo, ls, cat, help, clear. Type <b>help</b>.</span>');
  termOut(termPrompt());

  async function run(cmd) {
    if (!cmd) {
      termOut(termPrompt());
      return;
    }
    cmd = cmd.trim();
    // Yeniden prompt satirini kaldir (onu zaten yazdik), yeni satira gec
    const last = out.lastElementChild;
    if (last && last.innerHTML.indexOf('C:\\Aizanoi&gt;') !== -1) last.remove();
    termOut(`<span style="color:#4ec04c;">C:\\Aizanoi&gt;</span> <span style="color:#fff;">${escape(cmd)}</span>`);

    if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') { termClear(); termOut(termPrompt()); return; }

    try {
      const res = await fetch(TERM_API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      const data = await res.json();
      if (!res.ok) {
        termOut(`<span class="err">${escape(data.error || 'Command failed.')}</span>`);
        termOut(termPrompt());
        return;
      }
      renderResult(cmd, data.result);
      termOut(termPrompt());
    } catch (err) {
      termOut(`<span class="err">Connection error: ${escape(err.message)}</span>`);
      termOut(termPrompt());
    }
  }

  function renderResult(cmd, result) {
    if (result === null) return;
    const tokens = cmd.trim().split(/\s+/);
    const c = tokens[0].toLowerCase();

    if (typeof result === 'string') {
      termOut(`<span style="color:#fff;">${escape(result)}</span>`);
    } else if (c === 'ls') {
      // result: { cwd, files }
      termOut(`<span style="color:#aaa;">Directory: ${escape(result.cwd)}</span>`);
      result.files.forEach(f => {
        const cls = f.type === 'dir' ? 'dir' : 'file';
        const name = f.type === 'dir' ? `&lt;DIR&gt;  ${escape(f.name)}` : `       ${escape(f.name)}`;
        termOut(`<span class="${cls}">${name}</span>`);
      });
    } else if (c === 'cat') {
      // result: { content }
      const lines = escape(result.content).split('\n');
      lines.forEach(l => termOut(`<span style="color:#ccc;">${l}</span>`));
    } else if (c === 'help') {
      termOut(`<span style="color:#aaa;">Available commands:</span>`);
      result.commands.forEach(name => termOut(`<span style="color:#4ec04c;">  ${escape(name)}</span>`));
    } else if (c === 'echo') {
      termOut(`<span style="color:#fff;">${escape(String(result))}</span>`);
    } else {
      // Object/JSON dump
      termOut(`<span style="color:#fff;">${escape(JSON.stringify(result, null, 2))}</span>`);
    }
  }

  function escape(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = input.value;
      input.value = '';
      TERM_HISTORY.push(cmd);
      TERM_HIST_IDX = TERM_HISTORY.length;
      await run(cmd);
      input.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Tab completion: ls/cat icin dosya/dizin adlari
      const before = input.value;
      const tokens = before.split(/\s+/);
      const cmd = (tokens[0] || '').toLowerCase();
      if (cmd === 'ls' || cmd === 'cat') {
        const partial = tokens.slice(1).join(' ');
        try {
          const parentDir = partial.includes('/') ? partial.substring(0, partial.lastIndexOf('/') + 1) : '';
          const namePart = partial.includes('/') ? partial.substring(partial.lastIndexOf('/') + 1) : partial;
          const res = await fetch('/api/terminal/exec', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ command: 'ls ' + parentDir }) });
          const data = await res.json();
          if (data && data.result && data.result.files) {
            const matches = data.result.files.filter(f => f.name.startsWith(namePart));
            if (matches.length === 1) {
              input.value = cmd + ' ' + parentDir + matches[0].name;
            } else if (matches.length > 1) {
              const pref = matches[0].name;
              let p = pref;
              for (const m of matches) {
                let i = 0; while (i < p.length && i < m.name.length && p[i] === m.name[i]) i++;
                p = p.substring(0, i);
                if (!p) break;
              }
              if (p.length > namePart.length) {
                input.value = cmd + ' ' + parentDir + p;
              } else {
                termOut('<span style="color:#aaa;">' + matches.map(m => m.type === 'dir' ? '&lt;DIR&gt; ' : '      ' + escape(m.name)).join('  ') + '</span>');
                termOut(termPrompt());
              }
            }
          }
        } catch (err) {}
      } else if (cmd === 'help' || cmd === '') {
        // help veya bos komut → komut adlarini tamamla
        const trycmd = cmd === 'help' ? 'help' : 'ls';
        const res = await fetch('/api/terminal/exec', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ command: trycmd }) });
        const data = await res.json();
        if (data && data.result && data.result.commands) {
          const matches = data.result.commands.filter(c => c.startsWith(tokens[0]));
          if (matches.length === 1) input.value = matches[0];
          else if (matches.length > 1) {
            termOut('<span style="color:#aaa;">' + matches.join('  ') + '</span>');
            termOut(termPrompt());
          }
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (TERM_HIST_IDX > 0) {
        TERM_HIST_IDX--;
        input.value = TERM_HISTORY[TERM_HIST_IDX] || '';
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (TERM_HIST_IDX < TERM_HISTORY.length - 1) {
        TERM_HIST_IDX++;
        input.value = TERM_HISTORY[TERM_HIST_IDX] || '';
      } else {
        TERM_HIST_IDX = TERM_HISTORY.length;
        input.value = '';
      }
    }
  });
  // Auto-focus when window opened
  setTimeout(() => input.focus(), 50);
}
