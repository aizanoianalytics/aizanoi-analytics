/* === AIZANOI FIELD TERMINAL — BROWSER-ONLY VIRTUAL SHELL === */
const TERM_HISTORY = [];
let TERM_HIST_IDX = -1;
let termWired = false;

const TERM_COMMANDS = ['pwd', 'whoami', 'date', 'echo', 'ls', 'cat', 'help', 'clear'];
const TERM_VFS = Object.freeze({
  'README.txt': Object.freeze({
    type: 'file',
    content: 'Welcome to Aizanoi Field Terminal.\nThis terminal is a browser-only simulation. No command is sent to the server.\nType help to see the available commands.\n'
  }),
  'docs': Object.freeze({ type: 'dir' }),
  'docs/info.txt': Object.freeze({
    type: 'file',
    content: 'Aizanoi Analytics — open-source digital archaeology, analytics and interactive historical worlds.\n'
  }),
  'docs/security.txt': Object.freeze({
    type: 'file',
    content: 'Security model: this virtual terminal has no shell, no backend endpoint and no access to the visitor or server filesystem.\n'
  })
});

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
  const out = document.getElementById('term-out');
  if (out) out.innerHTML = '';
}

function termPrompt() {
  return '<span class="prompt">aizanoi@field:~$</span> ';
}

function termEscape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function normalizeVirtualPath(value = '') {
  if (typeof value !== 'string' || value.length > 128) return null;
  let path = value.trim().replace(/\\/g, '/');
  if (!path || path === '.' || path === '/aizanoi' || path === '/aizanoi/') return '';
  path = path.replace(/^\/?aizanoi\/?/i, '');
  if (path.startsWith('/') || path.includes('\0')) return null;
  const parts = path.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part === '~')) return null;
  return parts.filter((part) => part !== '.').join('/');
}

function listVirtualFiles(rawPath = '') {
  const target = normalizeVirtualPath(rawPath);
  if (target === null) return { error: 'Access denied.' };
  if (target && (!TERM_VFS[target] || TERM_VFS[target].type !== 'dir')) {
    return { error: TERM_VFS[target]?.type === 'file' ? 'Not a directory.' : 'No such directory.' };
  }

  const prefix = target ? `${target}/` : '';
  const children = new Map();
  Object.entries(TERM_VFS).forEach(([path, entry]) => {
    if (!path.startsWith(prefix) || path === target) return;
    const rest = path.slice(prefix.length);
    if (!rest) return;
    const [name, ...tail] = rest.split('/');
    if (children.has(name)) return;
    const direct = tail.length === 0 ? entry : { type: 'dir' };
    children.set(name, {
      name,
      type: direct.type,
      size: direct.type === 'file' ? String(direct.content || '').length : 0
    });
  });

  return {
    cwd: target ? `/aizanoi/${target}` : '/aizanoi',
    files: [...children.values()].sort((a, b) => a.name.localeCompare(b.name))
  };
}

function readVirtualFile(rawPath) {
  const target = normalizeVirtualPath(rawPath);
  if (target === null) return { error: 'Access denied.' };
  if (!target) return { error: 'Usage: cat <file>' };
  const entry = TERM_VFS[target];
  if (!entry) return { error: 'No such file.' };
  if (entry.type === 'dir') return { error: 'Is a directory.' };
  return { content: entry.content };
}

function executeVirtualCommand(command) {
  if (typeof command !== 'string' || !command.trim() || command.length > 500) {
    return { error: 'Invalid command.' };
  }
  const tokens = command.trim().split(/\s+/);
  const cmd = tokens[0].toLowerCase();
  const args = tokens.slice(1);

  switch (cmd) {
    case 'pwd': return { result: { cwd: '/aizanoi' } };
    case 'whoami': return { result: { user: 'aizanoi-guest' } };
    case 'date': return { result: { date: new Date().toISOString() } };
    case 'echo': return { result: args.join(' ') };
    case 'ls': {
      const result = listVirtualFiles(args.join(' '));
      return result.error ? { error: result.error } : { result };
    }
    case 'cat': {
      const result = readVirtualFile(args.join(' '));
      return result.error ? { error: result.error } : { result };
    }
    case 'help': return { result: { commands: TERM_COMMANDS } };
    case 'clear': return { result: null };
    default: return { error: 'Command is not available in the Aizanoi virtual terminal.' };
  }
}

async function wireTerminalIfNeeded() {
  const input = document.getElementById('term-input');
  const out = document.getElementById('term-out');
  if (!input || !out || termWired) return;
  termWired = true;

  const terminalWindow = input.closest('.win');
  const statusbar = terminalWindow?.querySelector('.win-statusbar');
  const statusRight = statusbar?.lastElementChild;
  if (statusRight) statusRight.textContent = 'LOCAL VIRTUAL SHELL · /aizanoi';

  termOut('<span style="color:#d8c79f;">AIZANOI FIELD TERMINAL / LOCAL VIRTUAL SHELL</span>');
  termOut('<span style="color:#8f9991;">Runtime: browser-only · static · no server command execution</span>');
  termOut('<span style="color:#8f9991;">Workspace: /aizanoi · identity: aizanoi-guest</span>');
  termOut('<span style="color:#aaa;">Available: pwd, whoami, date, echo, ls, cat, help, clear. Type <b>help</b>.</span>');
  termOut(termPrompt());

  function renderResult(cmd, result) {
    if (result === null) return;
    const tokens = cmd.trim().split(/\s+/);
    const command = tokens[0].toLowerCase();

    if (typeof result === 'string') {
      termOut(`<span style="color:#fff;">${termEscape(result)}</span>`);
    } else if (command === 'ls') {
      termOut(`<span style="color:#aaa;">Directory: ${termEscape(result.cwd)}</span>`);
      result.files.forEach((file) => {
        const cls = file.type === 'dir' ? 'dir' : 'file';
        const name = file.type === 'dir' ? `&lt;DIR&gt;  ${termEscape(file.name)}` : `       ${termEscape(file.name)}`;
        termOut(`<span class="${cls}">${name}</span>`);
      });
    } else if (command === 'cat') {
      termEscape(result.content).split('\n').forEach((line) => termOut(`<span style="color:#ccc;">${line}</span>`));
    } else if (command === 'help') {
      termOut('<span style="color:#aaa;">Available commands:</span>');
      result.commands.forEach((name) => termOut(`<span style="color:#4ec04c;">  ${termEscape(name)}</span>`));
    } else if (command === 'echo') {
      termOut(`<span style="color:#fff;">${termEscape(String(result))}</span>`);
    } else {
      termOut(`<span style="color:#fff;">${termEscape(JSON.stringify(result, null, 2))}</span>`);
    }
  }

  function run(command) {
    if (!command) {
      termOut(termPrompt());
      return;
    }
    const cmd = command.trim();
    const last = out.lastElementChild;
    if (last?.querySelector('.prompt')) last.remove();
    termOut(`<span class="prompt">aizanoi@field:~$</span> <span style="color:#fff;">${termEscape(cmd)}</span>`);

    if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') {
      termClear();
      termOut(termPrompt());
      return;
    }

    const execution = executeVirtualCommand(cmd);
    if (execution.error) {
      termOut(`<span class="err">${termEscape(execution.error)}</span>`);
    } else {
      renderResult(cmd, execution.result);
    }
    termOut(termPrompt());
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const command = input.value;
      input.value = '';
      TERM_HISTORY.push(command);
      TERM_HIST_IDX = TERM_HISTORY.length;
      run(command);
      input.focus();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const before = input.value;
      const tokens = before.split(/\s+/);
      const command = (tokens[0] || '').toLowerCase();

      if (command === 'ls' || command === 'cat') {
        const partial = tokens.slice(1).join(' ');
        const slash = partial.lastIndexOf('/');
        const parentDir = slash >= 0 ? partial.slice(0, slash + 1) : '';
        const namePart = slash >= 0 ? partial.slice(slash + 1) : partial;
        const listing = listVirtualFiles(parentDir);
        if (!listing.error) {
          const matches = listing.files.filter((file) => file.name.startsWith(namePart));
          if (matches.length === 1) {
            input.value = `${command} ${parentDir}${matches[0].name}`;
          } else if (matches.length > 1) {
            termOut(`<span style="color:#aaa;">${matches.map((file) => `${file.type === 'dir' ? '&lt;DIR&gt; ' : '      '}${termEscape(file.name)}`).join('  ')}</span>`);
            termOut(termPrompt());
          }
        }
      } else {
        const matches = TERM_COMMANDS.filter((name) => name.startsWith(command));
        if (matches.length === 1) input.value = matches[0];
        else if (matches.length > 1) {
          termOut(`<span style="color:#aaa;">${matches.map(termEscape).join('  ')}</span>`);
          termOut(termPrompt());
        }
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (TERM_HIST_IDX > 0) {
        TERM_HIST_IDX -= 1;
        input.value = TERM_HISTORY[TERM_HIST_IDX] || '';
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (TERM_HIST_IDX < TERM_HISTORY.length - 1) {
        TERM_HIST_IDX += 1;
        input.value = TERM_HISTORY[TERM_HIST_IDX] || '';
      } else {
        TERM_HIST_IDX = TERM_HISTORY.length;
        input.value = '';
      }
    }
  });

  setTimeout(() => input.focus(), 50);
}
