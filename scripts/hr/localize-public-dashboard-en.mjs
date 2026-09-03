#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const PUBLIC_ROOT = resolve(REPO_ROOT, 'frontend/analytics/dashboards/hr-analytics-full-set');
const RUNTIME_FILE = resolve(PUBLIC_ROOT, 'hr-public-en.js');
const RUNTIME_SRC = '/analytics/dashboards/hr-analytics-full-set/hr-public-en.js';
const MAP_FILE = resolve(HERE, 'hr-public-en-exact-map.json');
const OVERRIDES_FILE = resolve(HERE, 'hr-public-en-overrides.json');
const PRESENTATION_FILE = resolve(HERE, 'hr-public-en-presentation-map.json');
const MARKER = 'data-aizanoi-hr-public-en';

const argv = process.argv.slice(2);
const checkOnly = argv[0] === '--check';
const files = checkOnly ? argv.slice(1) : argv;
if (!files.length) {
  console.error('Usage: node scripts/hr/localize-public-dashboard-en.mjs [--check] <public-dashboard-html...>');
  process.exit(2);
}

const oracle = JSON.parse(readFileSync(MAP_FILE, 'utf8'));
const overrides = JSON.parse(readFileSync(OVERRIDES_FILE, 'utf8'));
const presentation = JSON.parse(readFileSync(PRESENTATION_FILE, 'utf8'));
if (oracle.schemaVersion !== 1 || overrides.schemaVersion !== 1 || presentation.schemaVersion !== 1) {
  throw new Error('Unsupported HR public English map schema');
}

const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/u;
const TR_WORDS = /\b(?:acik|açık|aktif|aksiyon|alt|ana|anket|ara|arasi|arası|ay|aylik|aylık|ayril|ayrıl|baslangic|başlangıç|bazi|bazı|bazli|bazlı|bitis|bitiş|bolge|bölge|bolum|bölüm|brut|brüt|bu|calisan|çalışan|calisma|çalışma|ceza|cikis|çıkış|cinsiyet|dagilim|dağılım|daha|deger|değer|departman|detay|diger|diğer|donem|dönem|dusuk|düşük|egitim|eğitim|eksik|erken|esik|eşik|evden|fazla|fiili|filtre|gelen|genel|gerceklesen|gerçekleşen|giris|giriş|gore|göre|gorev|görev|goster|göster|gun|gün|hedef|hesap|icin|için|izin|kayit|kayıt|kidem|kıdem|kisi|kişi|kirilim|kırılım|kritik|kullan|lokasyon|magaza|mağaza|maas|maaş|merkez|mesai|metrik|mudur|müdür|onceki|önceki|ortalama|ozet|özet|personel|puan|riskli|saat|satis|satış|sayfa|sayisi|sayısı|sebep|secili|seçili|seciniz|seçiniz|sicil|son|sozlesme|sözleşme|sure|süre|surekli|sürekli|tahmin|tamam|toplam|tum|tüm|tur|tür|unvan|ust|üst|uyari|uyarı|uygun|uzman|ucret|ücret|veri|ve|veya|yil|yıl|yonet|yönet|yuksek|yüksek|zorunlu)\b/iu;
const suspiciousTurkish = (value) => {
  const normalized = String(value ?? '').replace(/\\[nrt]/g, ' ').replace(/\s+/g, ' ').trim();
  return Boolean(normalized && (TR_CHARS.test(normalized) || TR_WORDS.test(normalized)));
};

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_m, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

const normalize = (value) => decodeHtmlEntities(value).replace(/\s+/g, ' ').trim();
const exact = new Map();
const conflicts = [];
function addExact(source, target, provenance, { override = false } = {}) {
  const from = normalize(source);
  const to = normalize(target);
  if (!from || !to || from === to || !suspiciousTurkish(from) || suspiciousTurkish(to)) return;
  const previous = exact.get(from);
  if (previous && previous !== to && !override) conflicts.push({ source: from, previous, target: to, provenance });
  else exact.set(from, to);
}

for (const bucket of ['text', 'script', 'attributes']) {
  for (const [source, target] of Object.entries(oracle[bucket] || {})) addExact(source, target, `oracle:${bucket}`);
}
for (const [source, target] of Object.entries(overrides.values || {})) addExact(source, target, 'override:value', { override: true });
for (const [source, target] of Object.entries(overrides.exact || {})) addExact(source, target, 'override:exact', { override: true });
for (const [source, target] of Object.entries(presentation.values || {})) addExact(source, target, 'presentation:value', { override: true });
for (const [source, target] of Object.entries(presentation.exact || {})) addExact(source, target, 'presentation:exact', { override: true });
if (conflicts.length) {
  console.error(JSON.stringify(conflicts.slice(0, 20), null, 2));
  throw new Error(`${conflicts.length} conflicting HR public English exact translations`);
}

function publicEnglishRuntime(exactInput) {
  'use strict';
  const EXACT = Object.freeze(exactInput);
  const MONTHS = Object.freeze({
    Ocak: 'January', Şubat: 'February', Mart: 'March', Nisan: 'April', Mayıs: 'May', Haziran: 'June',
    Temmuz: 'July', Ağustos: 'August', Eylül: 'September', Ekim: 'October', Kasım: 'November', Aralık: 'December',
  });
  const MONTH_ABBR = Object.freeze({ Oca: 'Jan', Şub: 'Feb', Mar: 'Mar', Nis: 'Apr', May: 'May', Haz: 'Jun', Tem: 'Jul', Ağu: 'Aug', Eyl: 'Sep', Eki: 'Oct', Kas: 'Nov', Ara: 'Dec' });
  const EN_MONTHS = new Set(Object.values(MONTHS));
  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt', 'data-label', 'data-title'];
  const SKIP = 'script,style,noscript,template,textarea,pre,code';
  const normalizeValue = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const number = (value) => String(value).replace(/(?<=\d),(?=\d)/g, '.');

  function monthYear(value) {
    let match = value.match(/^(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})$/u);
    if (match) return `${MONTHS[match[1]]} ${match[2]}`;
    match = value.match(/^(Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)\s+(\d{4})$/u);
    if (match) return `${MONTH_ABBR[match[1]]} ${match[2]}`;
    match = value.match(/^(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)(?:\s+(\d{4}))?$/u);
    if (match) return `${MONTHS[match[2]]} ${match[1]}${match[3] ? `, ${match[3]}` : ''}`;
    return null;
  }

  function pattern(value) {
    if (MONTHS[value]) return MONTHS[value];
    const dated = monthYear(value);
    if (dated) return dated;

    let match = value.match(/^(\d+)\s+satır gösteriliyor$/u); if (match) return `${match[1]} rows shown`;
    match = value.match(/^(\d+)\s+kayıt$/u); if (match) return `${match[1]} records`;
    match = value.match(/^(\d+)\s+sonuç$/u); if (match) return `${match[1]} results`;
    match = value.match(/^(\d+)\s+mağaza$/u); if (match) return `${match[1]} stores`;
    match = value.match(/^(\d+)\s+aktif çalışan$/u); if (match) return `${match[1]} active employees`;
    match = value.match(/^(\d+)\s+uygun çalışan$/u); if (match) return `${match[1]} eligible employees`;
    match = value.match(/^(\d+)\s+hesaplanabilir mağaza$/u); if (match) return `${match[1]} calculable stores`;
    match = value.match(/^(\d+)\s+dönem$/u); if (match) return `${match[1]} periods`;
    match = value.match(/^(\d+)\s+çıkış$/u); if (match) return `${match[1]} exits`;
    match = value.match(/^(\d+)\s+çalışan$/u); if (match) return `${match[1]} employees`;
    match = value.match(/^(\d+)\s+kişi$/u); if (match) return `${match[1]} people`;
    match = value.match(/^(\d+)\s*\/\s*(\d+)\s+kayıt$/u); if (match) return `${match[1]} / ${match[2]} records`;
    match = value.match(/^(\d+)\s*\/\s*(\d+)\s+kayıt gösteriliyor\.$/u); if (match) return `${match[1]} / ${match[2]} records shown.`;
    match = value.match(/^(\d+)\s*\/\s*(\d+)\s+mağaza gösteriliyor$/u); if (match) return `${match[1]} / ${match[2]} stores shown`;
    match = value.match(/^(\d+(?:[.,]\d+)?)\s+yıl$/u); if (match) return `${number(match[1])} years`;
    match = value.match(/^(\d+)-(\d+)\s+yıl$/u); if (match) return `${match[1]}-${match[2]} years`;
    match = value.match(/^(\d+)\+\s*yıl$/u); if (match) return `${match[1]}+ years`;
    match = value.match(/^(\d+(?:[.,]\d+)?)\s+gün$/u); if (match) return `${number(match[1])} days`;
    match = value.match(/^(\d+)-(\d+)\s+Gün$/u); if (match) return `${match[1]}-${match[2]} Days`;
    match = value.match(/^(\d+)\+\s*Gün$/u); if (match) return `${match[1]}+ Days`;
    match = value.match(/^(\d+)\s+GÜN ÜSTÜ$/u); if (match) return `OVER ${match[1]} DAYS`;
    match = value.match(/^(\d+(?:[.,]\d+)?)\s+saat$/u); if (match) return `${number(match[1])} hours`;
    match = value.match(/^(\d+)\s+değerlendirildi$/u); if (match) return `${match[1]} evaluated`;
    match = value.match(/^(\d+)\s+değerlendirilen KPI$/u); if (match) return `${match[1]} evaluated KPIs`;
    match = value.match(/^(\d+)\s+ağırlıklı KPI$/u); if (match) return `${match[1]} weighted KPIs`;
    match = value.match(/^(\d+)\s+çeyrek$/u); if (match) return `${match[1]} quarter`;
    match = value.match(/^(\d+)\s+evden \+ (\d+)\s+harici$/u); if (match) return `${match[1]} remote + ${match[2]} external`;
    match = value.match(/^(\d+)\s+yıl\s+(\d+)\s+ay$/u); if (match) return `${match[1]} years ${match[2]} months`;
    match = value.match(/^(\d+)\s+satır · (\d+)\s+çalışan$/u); if (match) return `${match[1]} rows · ${match[2]} employees`;
    match = value.match(/^(\d+)\s+fiili listede · (\d+)\s+fiili dışı$/u); if (match) return `${match[1]} in active roster · ${match[2]} outside roster`;
    match = value.match(/^(\d+)\s+çıkış \/ (\d+(?:[.,]\d+)?)\s+ort\.$/u); if (match) return `${match[1]} exits / ${number(match[2])} avg.`;
    match = value.match(/^(\d+)\s+eksik \/ (\d+)\s+fiili$/u); if (match) return `${match[1]} missing / ${match[2]} active`;
    match = value.match(/^(\d+)\s+tamamladı \/ (\d+)\s+fiili$/u); if (match) return `${match[1]} completed / ${match[2]} active`;
    match = value.match(/^(\d+)\/(\d+)\s+metrik$/u); if (match) return `${match[1]}/${match[2]} metrics`;
    match = value.match(/^(\d+)\s+bileşen\s+(\d+)\s+altı$/u); if (match) return `${match[1]} components below ${match[2]}`;

    match = value.match(/^Seçili Ay \((.+)\)$/u); if (match) { const date = monthYear(match[1]); if (date) return `Selected Month (${date})`; }
    match = value.match(/^Bir Önceki Ay \((.+)\)$/u); if (match) { const date = monthYear(match[1]); if (date) return `Previous Month (${date})`; }
    match = value.match(/^Bir Önceki Yıl Aynı Ay \((.+)\)$/u); if (match) { const date = monthYear(match[1]); if (date) return `Same Month Previous Year (${date})`; }
    match = value.match(/^Turnover:\s*(.+)$/u); if (match) { const date = monthYear(match[1]); if (date) return `Turnover: ${date}`; }
    match = value.match(/^İşe Alım:\s*(.+)$/u); if (match) { const date = monthYear(match[1]); if (date) return `Hiring: ${date}`; }
    match = value.match(/^Üretim:\s*(.+)$/u); if (match) return `Generated: ${match[1]}`;
    match = value.match(/^(\d+)\s+maksimum · (\d+)\s+hedef$/u); if (match) return `${match[1]} maximum · ${match[2]} target`;
    match = value.match(/^100 puan dönem hedefi:\s*(.+)$/u); if (match) return `100-point period target: ${match[1]}`;
    match = value.match(/^Hedef ve Üzeri:\s*(.+)$/u); if (match) return `At or Above Target: ${match[1]}`;
    match = value.match(/^Eşik-Hedef Arası:\s*(.+)$/u); if (match) return `Between Threshold and Target: ${match[1]}`;
    match = value.match(/^Eşik Altı:\s*(.+)$/u); if (match) return `Below Threshold: ${match[1]}`;
    match = value.match(/^Daha fazla göster \((\d+)\)$/u); if (match) return `Show more (${match[1]})`;
    match = value.match(/^Geçen aya göre:\s*(.+)$/u); if (match) return `vs previous month: ${match[1]}`;
    match = value.match(/^Gereken süre:\s*(.+?)\s+saat$/u); if (match) return `Required duration: ${number(match[1])} hours`;
    match = value.match(/^Oluşturulma:\s*(.+)$/u); if (match) return `Created: ${match[1]}`;
    match = value.match(/^Son dönem\s+(.+)$/u); if (match) return `Latest period ${match[1]}`;
    match = value.match(/^Toplam:\s*(.+)$/u); if (match) return `Total: ${match[1]}`;
    match = value.match(/^Son 12 ay turnover\s*(.+)$/u); if (match) return `Last 12 months turnover ${match[1]}`;
    match = value.match(/^Eksik:\s*(.+)$/u); if (match) return `Missing: ${EXACT[match[1]] || match[1]}`;
    match = value.match(/^Toplam puan\s*(.+)$/u); if (match) return `Total score ${match[1]}`;
    match = value.match(/^Çok zayıf odak bileşen:\s*(.+)$/u); if (match) return `Very weak focus component: ${match[1]}`;
    match = value.match(/^Turnover üst %10:\s*(.+)$/u); if (match) return `Turnover top 10%: ${match[1]}`;
    match = value.match(/^%([\d.]+)\s+neden eşleşmesi$/u); if (match) return `%${match[1]} reason match`;
    match = value.match(/^Örn\.\s*(.+)$/u); if (match) return `e.g. ${match[1]}`;
    match = value.match(/^Fiili liste:\s*(.+?) · (\d+) eşleşen \/ (\d+) eşleşmeyen sicil$/u); if (match) return `Actual roster: ${match[1]} · ${match[2]} matched / ${match[3]} unmatched employee IDs`;
    match = value.match(/^Kapsam:\s*([\d,.]+) PDKS satırı$/u); if (match) return `Scope: ${match[1]} PDKS rows`;
    match = value.match(/^(\d+) benzersiz sicil$/u); if (match) return `${match[1]} unique employee IDs`;
    match = value.match(/^Ü:\s*(.+?) · P:\s*(.+?) · D:\s*(.+)$/u); if (match) return `Salary: ${match[1]} · Bonus: ${match[2]} · Other: ${match[3]}`;

    match = value.match(/^(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4}):\s*(.+?)\s+saat \/ (.+?)\s+saat$/u);
    if (match) return `${MONTHS[match[1]]} ${match[2]}: ${match[3]} hours / ${match[4]} hours`;
    match = value.match(/^(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})\s*[–-]\s*(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})$/u);
    if (match) return `${MONTHS[match[1]]} ${match[2]} – ${MONTHS[match[3]]} ${match[4]}`;
    match = value.match(/^(\d{8}) · (Merkez|Mağaza) · (.+)$/u);
    if (match) return `${match[1]} · ${match[2] === 'Merkez' ? 'Head Office' : 'Store'} · ${match[3]}`;
    match = value.match(/^(.+?) · İSG ([-\d.]+) · Zorunlu Eğitim ([-\d.]+)$/u);
    if (match) return `${match[1]} · OHS ${match[2]} · Mandatory Training ${match[3]}`;
    match = value.match(/^(Mağaza|Merkez)\s+(\d{4})$/u);
    if (match) return `${match[1] === 'Mağaza' ? 'Store' : 'Head Office'} ${match[2]}`;
    match = value.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s+(\d+)\s+yıl\s+(\d+)\s+ay$/u);
    if (match) return `${match[1]} ${number(match[2])} ${match[3]} years ${match[4]} months`;

    match = value.match(/^(.+?)\s+(\d{4})\s+· Seçili metrik:\s*(.+)$/u);
    if (match && (MONTHS[match[1]] || EN_MONTHS.has(match[1]))) return `${MONTHS[match[1]] || match[1]} ${match[2]} · Selected metric: ${EXACT[match[3]] || match[3]}`;

    const commaMonths = value.split(/,\s*/u);
    if (commaMonths.length > 1) {
      const translated = commaMonths.map((part) => monthYear(part) || part);
      if (translated.some((part, index) => part !== commaMonths[index])) return translated.join(', ');
    }

    const middleDot = value.split(' · ');
    if (middleDot.length > 1) {
      let changed = false;
      const translated = middleDot.map((part) => {
        const next = EXACT[part] || pattern(part);
        if (next && next !== part) { changed = true; return next; }
        return part;
      });
      if (changed) return translated.join(' · ');
    }
    return null;
  }

  function translate(value) {
    const source = normalizeValue(value);
    if (!source) return value;
    const target = EXACT[source] || pattern(source);
    if (!target || target === source) return value;
    const leading = String(value).match(/^\s*/)?.[0] || '';
    const trailing = String(value).match(/\s*$/)?.[0] || '';
    return leading + target + trailing;
  }

  function translateAttrs(element) {
    if (!(element instanceof Element)) return;
    for (const name of ATTRS) {
      if (!element.hasAttribute(name)) continue;
      const value = element.getAttribute(name);
      const next = translate(value);
      if (next !== value) element.setAttribute(name, next);
    }
  }

  function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP)) return;
      const next = translate(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }
    if (!(node instanceof Element) || node.closest(SKIP)) return;
    translateAttrs(node);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let current;
    while ((current = walker.nextNode())) {
      if (current.nodeType === Node.TEXT_NODE) {
        const parent = current.parentElement;
        if (!parent || parent.closest(SKIP)) continue;
        const next = translate(current.nodeValue);
        if (next !== current.nodeValue) current.nodeValue = next;
      } else {
        translateAttrs(current);
      }
    }
  }

  function boot() {
    translateNode(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) translateNode(node);
        if (record.type === 'attributes') translateAttrs(record.target);
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS });
  }

  function patchCanvas(name) {
    const proto = globalThis.CanvasRenderingContext2D?.prototype;
    if (!proto || typeof proto[name] !== 'function') return;
    const original = proto[name];
    Object.defineProperty(proto, name, {
      configurable: true,
      writable: true,
      value(text, ...args) { return original.call(this, translate(text), ...args); },
    });
  }

  patchCanvas('fillText');
  patchCanvas('strokeText');
  patchCanvas('measureText');
  globalThis.AizanoiHrEnglish = Object.freeze({ translate });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else queueMicrotask(boot);
}

const exactObject = Object.fromEntries([...exact].sort(([a], [b]) => a.localeCompare(b, 'en')));
const runtime = `(${publicEnglishRuntime.toString()})(${JSON.stringify(exactObject)});\n`;
new Script(runtime, { filename: 'hr-public-en.js' });

const managedTag = `<script ${MARKER} src="${RUNTIME_SRC}"></script>`;
const managedTagRe = new RegExp(`<script\\s+${MARKER}(?:=["'][^"']*["'])?\\s+src=["'][^"']+["']\\s*><\\/script>\\s*`, 'gi');
function applyPresentationLocale(html) {
  return html
    .replace(/\.toLocaleString\((['"])tr-TR\1/g, '.toLocaleString("en-US"')
    .replace(/\.toLocaleDateString\((['"])tr-TR\1/g, '.toLocaleDateString("en-US"')
    .replace(/new Intl\.NumberFormat\((['"])tr-TR\1/g, 'new Intl.NumberFormat("en-US"')
    .replace(/new Intl\.DateTimeFormat\((['"])tr-TR\1/g, 'new Intl.DateTimeFormat("en-US"');
}
function localizeHtml(html) {
  let next = html.replace(managedTagRe, '');
  next = applyPresentationLocale(next);
  if (!/<\/head>/i.test(next)) throw new Error('Public HR dashboard is missing </head>');
  return next.replace(/<\/head>/i, `${managedTag}\n</head>`);
}

let failed = false;
if (checkOnly) {
  let currentRuntime = '';
  try { currentRuntime = readFileSync(RUNTIME_FILE, 'utf8'); } catch {}
  if (currentRuntime !== runtime) {
    console.error(`English runtime drift: ${RUNTIME_FILE}`);
    failed = true;
  }
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    if (!html.includes(managedTag)) { console.error(`Missing English presentation runtime: ${file}`); failed = true; }
    if (/\.toLocale(?:String|DateString)\((['"])tr-TR\1/.test(html) || /new Intl\.(?:NumberFormat|DateTimeFormat)\((['"])tr-TR\1/.test(html)) {
      console.error(`Turkish visitor-facing locale formatter remains: ${file}`);
      failed = true;
    }
  }
} else {
  writeFileSync(RUNTIME_FILE, runtime, 'utf8');
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const localized = localizeHtml(html);
    if (localized !== html) writeFileSync(file, localized, 'utf8');
    console.log(`Localized public presentation layer: ${file}`);
  }
  console.log(`Generated HR English presentation runtime with ${exact.size} exact display translations`);
}
if (failed) process.exit(1);
