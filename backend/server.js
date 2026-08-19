// Aizanoi backend - security-first API service
// AI is disabled by default. Provider credentials stay server-side in .env.

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
const AI_ENABLED = /^true$/i.test(String(process.env.AI_ENABLED || 'false'));
const AI_MAX_CONCURRENT = clampInt(process.env.AI_MAX_CONCURRENT, 1, 10, 2);
const AI_DAILY_REQUEST_LIMIT = clampInt(process.env.AI_DAILY_REQUEST_LIMIT, 1, 10000, 60);
const SANDBOX_DIR = process.env.SANDBOX_DIR || '/var/lib/aizanoi/sandbox';

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

app.disable('x-powered-by');
// Production Nginx is the only trusted proxy hop.
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

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Try again later.' }
});

const terminalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many terminal requests. Try again later.' }
});

app.use('/api/chat', requireTrustedOrigin, chatLimiter);
app.use('/api/terminal/exec', requireTrustedOrigin, terminalLimiter);

const SYSTEM_PROMPT = `You are Aizanoi AI, an HR & People Analytics assistant.

Help with practical HR, people management and HR analytics topics such as KPIs, performance, recruitment, engagement, workforce planning, compensation, learning, organizational design, HR metrics and dashboards.

You can also help with Excel, SQL, Power BI/DAX, Power Query and Python for HR work.

Give practical and context-aware answers. Do not invent missing facts. For legal, medical or other high-stakes matters, avoid presenting professional advice as definitive.

Reply in the user's language.

You are Aizanoi AI.`;

const CHAIN = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'groq', model: 'openai/gpt-oss-120b' },
  { provider: 'groq', model: 'llama-3.1-8b-instant' },
  { provider: 'google', model: 'gemini-2.5-flash' },
  { provider: 'google', model: 'gemini-2.5-flash-lite' },
];

function providerConfigured(provider) {
  if (provider === 'groq') return Boolean(process.env.GROQ_API_KEY);
  if (provider === 'google') return Boolean(process.env.GOOGLE_API_KEY);
  return false;
}

async function callGroq(model, messages) {
  if (!process.env.GROQ_API_KEY) throw new Error('Groq is not configured.');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1024 })
  });
  if (!response.ok) throw new Error(`Groq request failed with HTTP ${response.status}.`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim();
}

async function callGoogle(model, messages) {
  if (!process.env.GOOGLE_API_KEY) throw new Error('Google AI is not configured.');
  const systemMsg = messages.find((message) => message.role === 'system');
  const contents = messages.filter((message) => message.role !== 'system').map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GOOGLE_API_KEY)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      contents,
      systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
    })
  });
  if (!response.ok) throw new Error(`Google AI request failed with HTTP ${response.status}.`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

async function getChatReply(messages) {
  let lastError = null;
  for (const step of CHAIN.filter((item) => providerConfigured(item.provider))) {
    try {
      const reply = step.provider === 'groq'
        ? await callGroq(step.model, messages)
        : await callGoogle(step.model, messages);
      if (reply) return reply;
    } catch (error) {
      lastError = error;
      console.warn(`[ai-fallback] ${step.provider}/${step.model} unavailable.`);
    }
  }
  throw lastError || new Error('No AI provider is configured.');
}

let activeChatRequests = 0;
let dailyWindow = new Date().toISOString().slice(0, 10);
let dailyChatRequests = 0;

function consumeDailyAiBudget() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyWindow) {
    dailyWindow = today;
    dailyChatRequests = 0;
  }
  if (dailyChatRequests >= AI_DAILY_REQUEST_LIMIT) return false;
  dailyChatRequests += 1;
  return true;
}

app.post('/api/chat', async (req, res) => {
  if (!AI_ENABLED) {
    return res.status(503).json({ error: 'Aizanoi AI is disabled for security.' });
  }
  if (activeChatRequests >= AI_MAX_CONCURRENT) {
    return res.status(429).json({ error: 'AI capacity limit reached. Try again later.' });
  }
  if (!consumeDailyAiBudget()) {
    return res.status(429).json({ error: 'Daily AI safety limit reached.' });
  }

  const { history } = req.body || {};
  if (!Array.isArray(history) || history.length === 0 || history.length > 20 ||
      !history.every((message) => message && typeof message === 'object' &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' && message.content.trim().length > 0 &&
        message.content.length <= 4000)) {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  activeChatRequests += 1;
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map((message) => ({ role: message.role, content: message.content }))
    ];
    const reply = await getChatReply(messages);
    return res.json({ reply });
  } catch (error) {
    console.error('AI request failed.');
    return res.status(503).json({ error: 'Aizanoi AI is currently unavailable.' });
  } finally {
    activeChatRequests = Math.max(0, activeChatRequests - 1);
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', aiEnabled: AI_ENABLED });
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
  catch (_) { return { error: 'No such file.' }; }
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
  console.log(`Aizanoi backend listening on 127.0.0.1:${PORT}; AI=${AI_ENABLED ? 'enabled' : 'disabled'}`);
});
