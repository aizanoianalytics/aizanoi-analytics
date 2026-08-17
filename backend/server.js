// Aizanoi AI - Chat Proxy Backend
// Kullanicidan gelen mesaji alir, sirayla Groq -> Google AI Studio modellerini dener,
// biri basarili olana kadar (rate limit / hata yerse bir sonrakine gecer).
// API key'ler bu dosyada DEGIL, .env dosyasinda tutulur.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;
app.disable('x-powered-by');

// Nginx bu servise tek proxy hop ile baglanir. Gercek istemci IP'sinin
// rate limiter tarafindan dogru okunmasi icin yalnizca bu hop'a guven.
app.set('trust proxy', 1);

app.use(cors({
  origin: ['https://aizanoianalytics.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
// ---- Basit güvenlik header'lari (helmet alternatifi) ----
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use(express.json({ limit: '128kb' }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, 'body')) {
    return res.status(400).json({ error: 'Gecersiz JSON.' });
  }
  next(err);
});

// ---- Basit kotuye kullanim korumasi (IP basina) ----
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 15,             // IP basina dakikada max 15 istek
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Cok fazla istek gonderildi. Lutfen biraz bekleyin.' }
});
app.use('/api/chat', chatLimiter);
app.use('/api/terminal/exec', chatLimiter);

// ---- Sistem prompt: kullanici hangi modelin calistigini asla bilmemeli ----
const SYSTEM_PROMPT = `You are Aizanoi AI, an HR & People Analytics assistant.

Help with practical HR, people management and HR analytics topics such as KPIs, performance, difficult employee situations, recruitment, engagement, workforce planning, compensation, learning, organizational design, HR metrics and dashboards.

You can also help with Excel, SQL, Power BI/DAX, Power Query and Python for HR work.

Give practical and context-aware answers. Do not invent missing facts. For legal, medical or other high-stakes matters, avoid presenting professional advice as definitive.

Reply in the user's language.

You are Aizanoi AI.`;

// ---- Model zinciri: sirayla denenecek. Once Groq modelleri, sonra Google. ----
const CHAIN = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'groq', model: 'openai/gpt-oss-120b' },
  { provider: 'groq', model: 'llama-3.1-8b-instant' },
  { provider: 'google', model: 'gemini-2.5-flash' },
  { provider: 'google', model: 'gemini-2.5-flash-lite' },
];

async function callGroq(model, messages) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1024
    })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq ${model} failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim();
}

async function callGoogle(model, messages) {
  // Google AI Studio (Gemini) API - basit sohbet gecmisini tek prompt'a cevirir
  const systemMsg = messages.find(m => m.role === 'system');
  const convo = messages.filter(m => m.role !== 'system');

  const contents = convo.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      contents,
      systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
    })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google ${model} failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

async function getChatReply(messages) {
  let lastError = null;
  for (const step of CHAIN) {
    try {
      let reply;
      if (step.provider === 'groq') {
        reply = await callGroq(step.model, messages);
      } else {
        reply = await callGoogle(step.model, messages);
      }
      if (reply && reply.length > 0) {
        return reply;
      }
    } catch (err) {
      lastError = err;
      console.warn(`[fallback] ${step.provider}/${step.model} basarisiz, siradaki deneniyor. Sebep: ${err.message}`);
      continue;
    }
  }
  throw lastError || new Error('Tum modeller basarisiz oldu.');
}

// ---- Ana chat endpoint ----
app.post('/api/chat', async (req, res) => {
  try {
    const { history } = req.body;

    if (!Array.isArray(history) || history.length === 0 ||
        !history.every(m => m && typeof m === 'object' &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' && m.content.trim().length > 0 &&
          m.content.length <= 4000)) {
      return res.status(400).json({ error: 'Gecersiz istek.' });
    }

    // guvenlik: son 20 mesajla sinirla, asiri uzun input engelle
    const trimmedHistory = history.slice(-20).map(m => ({
      role: m.role,
      content: m.content
    }));

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...trimmedHistory
    ];

    const reply = await getChatReply(messages);
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(503).json({ error: 'Aizanoi AI su anda yanit veremiyor, lutfen birazdan tekrar deneyin.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// =================================================================
// TERMINAL SANDBOX - guvenli komut calistirma (whitelist)
// Kullanici sunucudaki gercek dosyalara erisemez, sadece izole
// sandbox (/opt/aizanoi-sandbox) icinde islem yapabilir.
// Shell komutlari degil, child_process.exec ile whitelist fonksiyonlar.
// =================================================================
const fs = require('fs');
const path = require('path');
const SANDBOX_DIR = '/opt/aizanoi-sandbox';
const SANDBOX_TRIGGER = path.join(SANDBOX_DIR, '.trigger'); // dosya yoksa sandbox'i olustur

// Ilk acilista sandbox dizinini olustur ve ornek dosyalar koy
function ensureSandbox() {
  if (!fs.existsSync(SANDBOX_DIR)) {
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
    fs.writeFileSync(path.join(SANDBOX_DIR, 'README.txt'),
      'Welcome to Aizanoi Terminal.\nThis is a sandboxed environment. Whitelisted commands only.\n',
      'utf8');
    fs.mkdirSync(path.join(SANDBOX_DIR, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(SANDBOX_DIR, 'docs', 'info.txt'),
      'Aizanoi Analytics - placeholder documentation.\n',
      'utf8');
  }
}
ensureSandbox();

// Whitelist komutlar - guvenli, sadece okuma/listeleme disinda komut yok.
// NOT: whoami/hostname/uname/uptime/date sunucunun gercek IP/hostname'ini
// sizdirabildigi icin KALDIRILDI. Sadece Aizanoi-spesifik, statik cevaplar.
const SAFE_COMMANDS = {
  'pwd':       () => ({ cwd: '/aizanoi' }),
  'whoami':    () => ({ user: 'aizanoi-guest' }),
  'date':      () => ({ date: new Date().toISOString() }),
  'echo':      (args) => args.join(' '),
  'ls':        (args) => listFiles(args),
  'cat':       (args) => readFile(args),
  'help':      () => ({ commands: Object.keys(SAFE_COMMANDS) }),
  'clear':     () => null  // frontend halleder
};

function safePath(p) {
  // Sadece bos veya path-string kabul et
  if (p !== undefined && p !== null && typeof p !== 'string') return null;
  if (p === '' || p === undefined || p === null) return path.resolve(SANDBOX_DIR);
  // 128 karakter limit
  if (p.length > 128) return null;
  // Whitelist karakterler (alfanumerik, nokta, tire, altcizgi, bolu)
  if (!/^[a-zA-Z0-9._\-/ ]+$/.test(p)) return null;
  // Tehlikeli pattern reddi
  if (p.includes('..') || p.startsWith('/') || p.includes('~') ||
      p.includes('*') || p.includes('?') ||
      p.includes('[') || p.includes(']') ||
      p.includes('\\x00')) return null;
  // join'le normalle
  const sandboxReal = path.resolve(SANDBOX_DIR);
  const full = path.resolve(sandboxReal, p);
  // Final check: sandbox icinde mi
  if (full !== sandboxReal && !full.startsWith(sandboxReal + path.sep)) return null;

  // Her path bilesenini lstat ile denetle. Yalniz son dosyayi kontrol etmek
  // yeterli degildir; ara dizin symlink'i sandbox disina kacabilir.
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
  } catch (err) {
    // Yalniz var olmayan path, endpoint katmaninda "No such file" alabilir.
    // Diger lstat/realpath hatalari fail-closed olarak reddedilir.
    if (err && err.code === 'ENOENT') return full;
    return null;
  }
  return full;
}

function listFiles(args) {
  const target = safePath(args[0] || '');
  if (!target) return { error: 'Access denied.' };
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) return { error: 'Access denied.' };
  if (!stat.isDirectory()) return { error: 'Not a directory: ' + args[0] };
  const items = fs.readdirSync(target, { withFileTypes: true });
  return {
    cwd: target.replace(SANDBOX_DIR, '/aizanoi').replace(/^\/aizanoi$/, '/'),
    files: items.filter(i => !i.isSymbolicLink()).map(i => ({
      name: i.name,
      type: i.isDirectory() ? 'dir' : 'file',
      size: i.isFile() ? fs.statSync(path.join(target, i.name)).size : 0
    }))
  };
}

function readFile(args) {
  if (!args[0]) return { error: 'Usage: cat <file>' };
  const target = safePath(args[0]);
  if (!target) return { error: 'Access denied.' };
  let stat;
  try { stat = fs.lstatSync(target); }
  catch (_) { return { error: 'No such file: ' + args[0] }; }
  if (stat.isSymbolicLink()) return { error: 'Access denied.' };
  if (stat.isDirectory()) return { error: 'Is a directory: ' + args[0] };
  if (stat.size > 50 * 1024) return { error: 'File too large (>50 KB)' };
  return { content: fs.readFileSync(target, 'utf8') };
}

// Ana terminal endpoint
app.post('/api/terminal/exec', async (req, res) => {
  try {
    const { command } = req.body;
    if (typeof command !== 'string' || command.length === 0 || command.length > 500) {
      return res.status(400).json({ error: 'Invalid command.' });
    }
    // Satir sonu ve tehlikeli karakter filtrele
    if (/[;&|`$()<>]/.test(command)) {
      return res.status(400).json({ error: 'Special characters are not allowed.' });
    }

    const tokens = command.trim().split(/\s+/);
    const cmd = tokens[0].toLowerCase();
    const args = tokens.slice(1);

    if (!(cmd in SAFE_COMMANDS)) {
      return res.status(400).json({
        error: `'${cmd}' is not recognized as a command.\nAvailable: ${Object.keys(SAFE_COMMANDS).join(', ')}`
      });
    }

    const result = SAFE_COMMANDS[cmd](args);
    if (result && typeof result === 'object' && result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true, result, command: cmd });
  } catch (err) {
    // Log mesajinda gercek dosya yolu/hatasi ifsa etme
    console.error(`[${new Date().toISOString()}] Terminal error: <sanitized>`);
    res.status(500).json({ error: 'Command failed.' });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Aizanoi AI backend calisiyor: http://127.0.0.1:${PORT}`);
});
