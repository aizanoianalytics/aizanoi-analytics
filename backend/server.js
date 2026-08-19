// Aizanoi backend - security-first local service
// External AI provider integration is intentionally removed.

'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SANDBOX_DIR = process.env.SANDBOX_DIR || '/var/lib/aizanoi/sandbox';

app.disable('x-powered-by');
app.set('trust proxy', 1);

const allowedOrigins = new Set(['https://aizanoianalytics.com']);
if (NODE_ENV !== 'production') {
  allowedOrigins.add('http://127.0.0.1:4173');
  allowedOrigins.add('http://localhost:4173');
  allowedOrigins.add('http://127.0.0.1:3000');
  allowedOrigins.add('http://localhost:3000');
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed.'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  maxAge: 600
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '128kb', strict: true }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, 'body')) {
    return res.status(400).json({ error: 'Invalid JSON.' });
  }
  return next(err);
});

function requireTrustedOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin || !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Request origin rejected.' });
  }
  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'same-site'].includes(fetchSite)) {
    return res.status(403).json({ error: 'Cross-site request rejected.' });
  }
  return next();
}

const terminalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many terminal requests. Try again later.' }
});

app.use('/api/terminal/exec', requireTrustedOrigin, terminalLimiter);

// The historical chat route is deliberately retained only as a fail-closed
// tombstone so stale clients cannot accidentally reach an external provider.
app.all('/api/chat', (req, res) => {
  return res.status(410).json({ error: 'Aizanoi AI has been removed for security.' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', aiEnabled: false });
});

// =================================================================
// TERMINAL SANDBOX - no shell execution; explicit command dispatch only.
// =================================================================

function ensureSandbox() {
  if (!fs.existsSync(SANDBOX_DIR)) {
    fs.mkdirSync(SANDBOX_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(SANDBOX_DIR, 'README.txt'),
      'Welcome to Aizanoi Terminal.\nThis is a sandboxed environment. Whitelisted commands only.\n',
      { encoding: 'utf8', mode: 0o600 });
    fs.mkdirSync(path.join(SANDBOX_DIR, 'docs'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(SANDBOX_DIR, 'docs', 'info.txt'),
      'Aizanoi Analytics - placeholder documentation.\n',
      { encoding: 'utf8', mode: 0o600 });
  }
}
ensureSandbox();

const SAFE_COMMANDS = {
  pwd: () => ({ cwd: '/aizanoi' }),
  whoami: () => ({ user: 'aizanoi-guest' }),
  date: () => ({ date: new Date().toISOString() }),
  echo: (args) => args.join(' '),
  ls: (args) => listFiles(args),
  cat: (args) => readFile(args),
  help: () => ({ commands: Object.keys(SAFE_COMMANDS) }),
  clear: () => null
};

function safePath(value) {
  if (value !== undefined && value !== null && typeof value !== 'string') return null;
  if (value === '' || value === undefined || value === null) return path.resolve(SANDBOX_DIR);
  if (value.length > 128) return null;
  if (!/^[a-zA-Z0-9._\-/ ]+$/.test(value)) return null;
  if (value.includes('..') || value.startsWith('/') || value.includes('~') ||
      value.includes('*') || value.includes('?') || value.includes('[') || value.includes(']') ||
      value.includes('\0')) return null;

  const sandboxReal = path.resolve(SANDBOX_DIR);
  const full = path.resolve(sandboxReal, value);
  if (full !== sandboxReal && !full.startsWith(sandboxReal + path.sep)) return null;

  try {
    const relative = path.relative(sandboxReal, full);
    let current = sandboxReal;
    for (const part of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) return null;
    }
    const realSandbox = fs.realpathSync(sandboxReal);
    const realFull = fs.realpathSync(full);
    if (realFull !== realSandbox && !realFull.startsWith(realSandbox + path.sep)) return null;
  } catch (error) {
    if (error?.code === 'ENOENT') return full;
    return null;
  }
  return full;
}

function listFiles(args) {
  const target = safePath(args[0] || '');
  if (!target) return { error: 'Access denied.' };
  let stat;
  try { stat = fs.lstatSync(target); }
  catch (_) { return { error: 'No such directory.' }; }
  if (stat.isSymbolicLink()) return { error: 'Access denied.' };
  if (!stat.isDirectory()) return { error: 'Not a directory.' };
  const items = fs.readdirSync(target, { withFileTypes: true });
  return {
    cwd: target.replace(SANDBOX_DIR, '/aizanoi').replace(/^\/aizanoi$/, '/'),
    files: items.filter((item) => !item.isSymbolicLink()).map((item) => ({
      name: item.name,
      type: item.isDirectory() ? 'dir' : 'file',
      size: item.isFile() ? fs.statSync(path.join(target, item.name)).size : 0
    }))
  };
}

function readFile(args) {
  if (!args[0]) return { error: 'Usage: cat <file>' };
  const target = safePath(args[0]);
  if (!target) return { error: 'Access denied.' };
  let stat;
  try { stat = fs.lstatSync(target); }
  catch (_) { return { error: 'No such file.' };
  }
  if (stat.isSymbolicLink()) return { error: 'Access denied.' };
  if (stat.isDirectory()) return { error: 'Is a directory.' };
  if (stat.size > 50 * 1024) return { error: 'File too large (>50 KB)' };
  return { content: fs.readFileSync(target, 'utf8') };
}

app.post('/api/terminal/exec', (req, res) => {
  try {
    const { command } = req.body || {};
    if (typeof command !== 'string' || command.length === 0 || command.length > 500) {
      return res.status(400).json({ error: 'Invalid command.' });
    }
    if (/[;&|`$()<>\\\r\n]/.test(command)) {
      return res.status(400).json({ error: 'Special characters are not allowed.' });
    }

    const tokens = command.trim().split(/\s+/);
    const cmd = tokens[0].toLowerCase();
    const args = tokens.slice(1);
    if (!Object.prototype.hasOwnProperty.call(SAFE_COMMANDS, cmd)) {
      return res.status(400).json({ error: 'Command is not allowed.' });
    }

    const result = SAFE_COMMANDS[cmd](args);
    if (result && typeof result === 'object' && result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json({ ok: true, result, command: cmd });
  } catch (_) {
    console.error(`[${new Date().toISOString()}] Terminal request failed.`);
    return res.status(500).json({ error: 'Command failed.' });
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Request rejected.');
  return res.status(500).json({ error: 'Request failed.' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Aizanoi backend listening on 127.0.0.1:${PORT}; external AI disabled`);
});
