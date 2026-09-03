#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const PUBLIC_ROOT = resolve(REPO_ROOT, 'frontend/analytics/dashboards/hr-analytics-full-set');
const RUNTIME_FILE = resolve(PUBLIC_ROOT, 'hr-public-en.js');
const RUNTIME_SRC = '/analytics/dashboards/hr-analytics-full-set/hr-public-en.js';
const MAP_FILE = resolve(HERE, 'hr-public-en-exact-map.json');
const OVERRIDES_FILE = resolve(HERE, 'hr-public-en-overrides.json');
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
if (oracle.schemaVersion !== 1 || overrides.schemaVersion !== 1) {
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
if (conflicts.length) {
  console.error(JSON.stringify(conflicts.slice(0, 20), null, 2));
  throw new Error(`${conflicts.length} conflicting HR public English exact translations`);
}

const runtime = `(() => {
  'use strict';
  const EXACT = Object.freeze(${JSON.stringify(Object.fromEntries([...exact].sort(([a], [b]) => a.localeCompare(b, 'en'))))});
  const MONTHS = Object.freeze({Ocak:'January',Şubat:'February',Mart:'March',Nisan:'April',Mayıs:'May',Haziran:'June',Temmuz:'July',Ağustos:'August',Eylül:'September',Ekim:'October',Kasım:'November',Aralık:'December'});
  const MONTH_ABBR = Object.freeze({Oca:'Jan',Şub:'Feb',Mar:'Mar',Nis:'Apr',May:'May',Haz:'Jun',Tem:'Jul',Ağu:'Aug',Eyl:'Sep',Eki:'Oct',Kas:'Nov',Ara:'Dec'});
  const ATTRS = ['aria-label','title','placeholder','alt','data-label','data-title'];
  const SKIP = 'script,style,noscript,template,textarea,pre,code';
  const normalize = value => String(value ?? '').replace(/\\s+/g,' ').trim();
  const number = value => String(value).replace(/(?<=\\d),(?=\\d)/g,'.');
  const monthYear = value => {
    let m=value.match(/^(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\\s+(\\d{4})$/u);
    if(m) return MONTHS[m[1]]+' '+m[2];
    m=value.match(/^(Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)\\s+(\\d{4})$/u);
    if(m) return MONTH_ABBR[m[1]]+' '+m[2];
    m=value.match(/^(\\d{1,2})\\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)(?:\\s+(\\d{4}))?$/u);
    if(m) return MONTHS[m[2]]+' '+m[1]+(m[3]?', '+m[3]:'');
    return null;
  };
  function pattern(value){
    if(MONTHS[value]) return MONTHS[value];
    const dated=monthYear(value); if(dated) return dated;
    let m=value.match(/^(\\d+)\\s+satır gösteriliyor$/u); if(m) return m[1]+' rows shown';
    m=value.match(/^(\\d+)\\s+kayıt$/u); if(m) return m[1]+' records';
    m=value.match(/^(\\d+)\\s+sonuç$/u); if(m) return m[1]+' results';
    m=value.match(/^(\\d+)\\s+mağaza$/u); if(m) return m[1]+' stores';
    m=value.match(/^(\\d+)\\s+aktif çalışan$/u); if(m) return m[1]+' active employees';
    m=value.match(/^(\\d+)\\s+uygun çalışan$/u); if(m) return m[1]+' eligible employees';
    m=value.match(/^(\\d+)\\s+hesaplanabilir mağaza$/u); if(m) return m[1]+' calculable stores';
    m=value.match(/^(\\d+)\\s+dönem$/u); if(m) return m[1]+' periods';
    m=value.match(/^(\\d+)\\s+çıkış$/u); if(m) return m[1]+' exits';
    m=value.match(/^(\\d+)\\s+çalışan$/u); if(m) return m[1]+' employees';
    m=value.match(/^(\\d+)\\s+kişi$/u); if(m) return m[1]+' people';
    m=value.match(/^(\\d+)\\s*\\/\\s*(\\d+)\\s+kayıt$/u); if(m) return m[1]+' / '+m[2]+' records';
    m=value.match(/^(\\d+)\\s*\\/\\s*(\\d+)\\s+mağaza gösteriliyor$/u); if(m) return m[1]+' / '+m[2]+' stores shown';
    m=value.match(/^(\\d+(?:[.,]\\d+)?)\\s+yıl$/u); if(m) return number(m[1])+' years';
    m=value.match(/^(\\d+)-(\\d+)\\s+yıl$/u); if(m) return m[1]+'-'+m[2]+' years';
    m=value.match(/^(\\d+)\\+\\s*yıl$/u); if(m) return m[1]+'+ years';
    m=value.match(/^(\\d+(?:[.,]\\d+)?)\\s+gün$/u); if(m) return number(m[1])+' days';
    m=value.match(/^(\\d+)-(\\d+)\\s+Gün$/u); if(m) return m[1]+'-'+m[2]+' Days';
    m=value.match(/^(\\d+)\\+\\s*Gün$/u); if(m) return m[1]+'+ Days';
    m=value.match(/^(\\d+)\\s+GÜN ÜSTÜ$/u); if(m) return 'OVER '+m[1]+' DAYS';
    m=value.match(/^(\\d+(?:[.,]\\d+)?)\\s+saat$/u); if(m) return number(m[1])+' hours';
    m=value.match(/^Seçili Ay \\((.+)\\)$/u); if(m){const d=monthYear(m[1]);if(d)return 'Selected Month ('+d+')';}
    m=value.match(/^Bir Önceki Ay \\((.+)\\)$/u); if(m){const d=monthYear(m[1]);if(d)return 'Previous Month ('+d+')';}
    m=value.match(/^Bir Önceki Yıl Aynı Ay \\((.+)\\)$/u); if(m){const d=monthYear(m[1]);if(d)return 'Same Month Previous Year ('+d+')';}
    m=value.match(/^Turnover:\\s*(.+)$/u); if(m){const d=monthYear(m[1]);if(d)return 'Turnover: '+d;}
    m=value.match(/^İşe Alım:\\s*(.+)$/u); if(m){const d=monthYear(m[1]);if(d)return 'Hiring: '+d;}
    m=value.match(/^Üretim:\s*(.+)$/u); if(m) return 'Generated: '+m[1];
    m=value.match(/^(\d+)\s+değerlendirildi$/u); if(m) return m[1]+' evaluated';
    m=value.match(/^(\d+)\s+ağırlıklı KPI$/u); if(m) return m[1]+' weighted KPIs';
    m=value.match(/^(\d+)\s+maksimum · (\d+)\s+hedef$/u); if(m) return m[1]+' maximum · '+m[2]+' target';
    m=value.match(/^100 puan dönem hedefi:\s*(.+)$/u); if(m) return '100-point period target: '+m[1];
    m=value.match(/^Hedef ve Üzeri:\s*(.+)$/u); if(m) return 'At or Above Target: '+m[1];
    m=value.match(/^Eşik-Hedef Arası:\s*(.+)$/u); if(m) return 'Between Threshold and Target: '+m[1];
    m=value.match(/^Eşik Altı:\s*(.+)$/u); if(m) return 'Below Threshold: '+m[1];
    m=value.match(/^Daha fazla göster \((\d+)\)$/u); if(m) return 'Show more ('+m[1]+')';
    m=value.match(/^Geçen aya göre:\s*(.+)$/u); if(m) return 'vs previous month: '+m[1];
    m=value.match(/^(\d+)\s+yıl\s+(\d+)\s+ay$/u); if(m) return m[1]+' years '+m[2]+' months';
    m=value.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s+(\d+)\s+yıl\s+(\d+)\s+ay$/u); if(m) return m[1]+' '+number(m[2])+' '+m[3]+' years '+m[4]+' months';
    m=value.match(/^(\d+)\s+satır · (\d+)\s+çalışan$/u); if(m) return m[1]+' rows · '+m[2]+' employees';
    m=value.match(/^(\d+)\s+fiili listede · (\d+)\s+fiili dışı$/u); if(m) return m[1]+' in active roster · '+m[2]+' outside roster';
    m=value.match(/^(\d+)\s+çıkış \/ (\d+(?:[.,]\d+)?)\s+ort\.$/u); if(m) return m[1]+' exits / '+number(m[2])+' avg.';
    m=value.match(/^(\d+)\s+eksik \/ (\d+)\s+fiili$/u); if(m) return m[1]+' missing / '+m[2]+' active';
    m=value.match(/^(\d+)\s+tamamladı \/ (\d+)\s+fiili$/u); if(m) return m[1]+' completed / '+m[2]+' active';
    m=value.match(/^(\d+)\/(\d+)\s+metrik$/u); if(m) return m[1]+'/'+m[2]+' metrics';
    m=value.match(/^Gereken süre:\s*(.+?)\s+saat$/u); if(m) return 'Required duration: '+number(m[1])+' hours';
    m=value.match(/^(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4}):\s*(.+?)\s+saat \/ (.+?)\s+saat$/u); if(m) return MONTHS[m[1]]+' '+m[2]+': '+m[3]+' hours / '+m[4]+' hours';
    m=value.match(/^(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})\s*[–-]\s*(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})$/u); if(m) return MONTHS[m[1]]+' '+m[2]+' – '+MONTHS[m[3]]+' '+m[4];
    m=value.match(/^(\d{8}) · (Merkez|Mağaza) · (.+)$/u); if(m) return m[1]+' · '+(m[2]==='Merkez'?'Head Office':'Store')+' · '+m[3];
    m=value.match(/^(.+?) · İSG ([-\d.]+) · Zorunlu Eğitim ([-\d.]+)$/u); if(m) return m[1]+' · OHS '+m[2]+' · Mandatory Training '+m[3];
    m=value.match(/^Oluşturulma:\s*(.+)$/u); if(m) return 'Created: '+m[1];
    m=value.match(/^Son dönem\s+(.+)$/u); if(m) return 'Latest period '+m[1];
    const middleDot=value.split(' · ');
    if(middleDot.length>1){
      let changed=false;
      const translated=middleDot.map(part=>{const next=EXACT[part]||pattern(part);if(next&&next!==part){changed=true;return next;}return part;});
      if(changed) return translated.join(' · ');
    }
    return null;
  }
  function translate(value){
    const source=normalize(value); if(!source) return value;
    const target=EXACT[source] || pattern(source); if(!target || target===source) return value;
    const leading=String(value).match(/^\\s*/)?.[0]||'';
    const trailing=String(value).match(/\\s*$/)?.[0]||'';
    return leading+target+trailing;
  }
  function translateAttrs(el){
    if(!(el instanceof Element)) return;
    for(const name of ATTRS){if(el.hasAttribute(name)){const value=el.getAttribute(name);const next=translate(value);if(next!==value)el.setAttribute(name,next);}}
  }
  function translateNode(node){
    if(node.nodeType===Node.TEXT_NODE){
      const parent=node.parentElement; if(!parent || parent.closest(SKIP)) return;
      const next=translate(node.nodeValue); if(next!==node.nodeValue) node.nodeValue=next; return;
    }
    if(!(node instanceof Element) || node.closest(SKIP)) return;
    translateAttrs(node);
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
    let current; while((current=walker.nextNode())){
      if(current.nodeType===Node.TEXT_NODE){const parent=current.parentElement;if(!parent||parent.closest(SKIP))continue;const next=translate(current.nodeValue);if(next!==current.nodeValue)current.nodeValue=next;}
      else translateAttrs(current);
    }
  }
  function boot(){
    translateNode(document.body);
    const observer=new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes)translateNode(node);if(record.type==='attributes')translateAttrs(record.target);}});
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:ATTRS});
  }
  const patchCanvas=(name)=>{const proto=globalThis.CanvasRenderingContext2D?.prototype;if(!proto||typeof proto[name]!=='function')return;const original=proto[name];Object.defineProperty(proto,name,{configurable:true,writable:true,value:function(text,...args){return original.call(this,translate(text),...args);}});};
  patchCanvas('fillText'); patchCanvas('strokeText'); patchCanvas('measureText');
  globalThis.AizanoiHrEnglish=Object.freeze({translate});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else queueMicrotask(boot);
})();
`;

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
      console.error(`Turkish visitor-facing locale formatter remains: ${file}`); failed = true;
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
