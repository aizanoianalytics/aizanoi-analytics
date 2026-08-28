"""2026 CEO ve şirket hedefleri dashboard HTML şablonu."""

HTML_TEMPLATE = r"""<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>2026 CEO & Şirket Hedefleri</title>
  <style>
    :root{
      --navy:#0c2e5e;--navy-2:#164b83;--blue:#2563a7;--paper:#eef2f7;--card:#fff;
      --ink:#11243c;--muted:#66758a;--line:#d7e0eb;--max:#047857;--good:#4ade80;
      --watch:#f59e0b;--bad:#dc2626;--none:#94a3b8;--shadow:0 14px 42px rgba(20,46,78,.10);
      --radius:17px;
    }
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;background:
      radial-gradient(circle at 88% 2%,rgba(37,99,167,.12),transparent 26%),
      linear-gradient(180deg,#f6f8fb 0,#edf2f7 100%);
      color:var(--ink);font-family:"Aptos","Segoe UI",sans-serif}
    button,input,select{font:inherit}
    .shell{width:min(1720px,calc(100% - 28px));margin:auto;padding:14px 0 42px}
    .hero{position:relative;overflow:hidden;display:grid;grid-template-columns:1fr auto;gap:24px;
      padding:28px 30px;border-radius:25px;background:linear-gradient(118deg,#092750,#12487c);
      color:#fff;box-shadow:0 20px 55px rgba(5,33,66,.22)}
    .hero:before,.hero:after{content:"";position:absolute;border-radius:50%;pointer-events:none}
    .hero:before{width:380px;height:380px;right:-110px;top:-260px;border:75px solid rgba(255,255,255,.055)}
    .hero:after{width:180px;height:180px;right:240px;bottom:-130px;background:rgba(245,158,11,.13)}
    .eyebrow{font:800 11px/1 "Bahnschrift","Segoe UI",sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#a9d0ff}
    h1{font:800 clamp(30px,4vw,56px)/1 "Bahnschrift","Segoe UI",sans-serif;letter-spacing:-.035em;margin:9px 0 8px}
    .hero p{margin:0;color:#d7e7f8;font-size:14px}
    .hero-meta{position:relative;z-index:1;display:grid;grid-template-columns:repeat(2,minmax(130px,1fr));gap:8px;align-self:end}
    .hero-meta span{padding:10px 12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);
      border-radius:12px;font-size:11px;font-weight:750}
    .toolbar{position:sticky;top:0;z-index:40;margin:12px 0 14px;padding:9px;display:flex;align-items:center;
      justify-content:space-between;gap:10px;flex-wrap:wrap;border:1px solid var(--line);
      border-radius:15px;background:rgba(246,248,251,.93);backdrop-filter:blur(14px);box-shadow:0 9px 28px rgba(17,36,60,.08)}
    .segments,.periods,.actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
    .segment,.period,.btn{border:0;border-radius:10px;padding:9px 13px;font-weight:800;cursor:pointer}
    .segment,.period{background:#e8eef6;color:#39536f}
    .segment.active,.period.active{background:var(--navy);color:white;box-shadow:0 7px 18px rgba(12,46,94,.18)}
    .period:disabled{opacity:.38;cursor:not-allowed}
    .btn{background:var(--navy);color:#fff}.btn.secondary{background:#e5edf7;color:#174879}
    .filters{display:grid;grid-template-columns:minmax(220px,1.25fr) minmax(180px,.55fr) auto;gap:8px;margin-bottom:14px}
    .control{width:100%;border:1px solid var(--line);border-radius:12px;background:#fff;padding:10px 12px;color:var(--ink);outline:none}
    .control:focus{border-color:#5b91c8;box-shadow:0 0 0 3px rgba(37,99,167,.12)}
    .kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px}
    .kpi,.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
    .kpi{padding:16px;min-height:115px;position:relative;overflow:hidden}
    .kpi:after{content:"";position:absolute;width:76px;height:76px;right:-28px;bottom:-34px;border-radius:50%;background:var(--tone,#2563a7);opacity:.10}
    .kpi .label{font-size:10px;text-transform:uppercase;letter-spacing:.075em;color:var(--muted);font-weight:900}
    .kpi .value{font:800 29px/1 "Bahnschrift","Segoe UI",sans-serif;margin-top:11px;color:var(--tone,var(--navy))}
    .kpi .sub{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.35}
    .grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(320px,.7fr);gap:14px;margin-bottom:14px}
    .card{padding:18px;min-width:0}.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}
    .card h2{font:800 18px/1.15 "Bahnschrift","Segoe UI",sans-serif;margin:0}.hint{font-size:11px;color:var(--muted);line-height:1.45;margin-top:5px}
    .status-strip{display:flex;height:15px;border-radius:999px;overflow:hidden;background:#edf1f6;margin:14px 0 13px}
    .status-strip span{min-width:0;transition:width .35s ease}.status-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
    .status-item{padding:10px;border:1px solid var(--line);border-radius:12px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px}
    .dot{width:9px;height:9px;border-radius:50%}.status-item span{font-size:10px;color:var(--muted);font-weight:750}.status-item b{font-size:17px}
    .color-scale{grid-column:1/-1}.color-scale-bar{height:14px;border-radius:999px;display:grid;grid-template-columns:repeat(4,1fr);overflow:hidden}
    .color-scale-labels{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:5px;color:var(--muted);font-size:9px;font-weight:850;text-align:center}
    .category{margin-bottom:14px;border:1px solid var(--line);border-radius:16px;background:#fff;box-shadow:var(--shadow);overflow:hidden}
    .category-title{padding:10px 14px;color:#fff;background:linear-gradient(90deg,var(--navy),var(--navy-2));font:800 15px/1.2 "Bahnschrift","Segoe UI",sans-serif;display:flex;justify-content:space-between}
    .category-title small{font:700 10px/1.4 "Aptos","Segoe UI",sans-serif;color:#cfe2f5}
    .table-wrap{overflow:auto;max-width:100%}
    table{border-collapse:separate;border-spacing:0;width:100%;min-width:1370px;font-size:11px}
    th{position:sticky;top:0;z-index:2;background:#1a568e;color:#fff;padding:9px 8px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:.025em;border-right:1px solid rgba(255,255,255,.2)}
    td{padding:8px;border-right:1px solid #e0e6ee;border-bottom:1px solid #e6ebf1;text-align:center;white-space:nowrap}
    tbody tr:nth-child(even){background:#f7f9fc}tbody tr:hover{background:#edf5ff}
    td.metric{text-align:left;white-space:normal;min-width:280px;font-weight:750}
    td.num{font-variant-numeric:tabular-nums}
    .score-cell{min-width:175px}.score{display:grid;grid-template-columns:1fr 42px;gap:7px;align-items:center}
    .track{height:9px;border-radius:999px;background:#e3e9f0;overflow:hidden}.fill{height:100%;border-radius:inherit}
    .badge{display:inline-flex;justify-content:center;min-width:100px;padding:5px 8px;border-radius:8px;color:#fff;font-weight:850;font-size:9px}
    .empty{padding:30px;text-align:center;color:var(--muted)}
    details.method{background:#fff;border:1px solid var(--line);border-radius:15px;padding:13px 16px}
    details.method summary{cursor:pointer;font-weight:850}.method-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px}
    .method-grid div{padding:11px;border-radius:11px;background:#f3f6fa;font-size:11px;line-height:1.45}
    [hidden]{display:none!important}
    .settings-backdrop{position:fixed;inset:0;z-index:100;background:rgba(5,20,40,.66);display:grid;place-items:center;padding:18px}
    .settings-panel{width:min(980px,100%);max-height:min(820px,94vh);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;
      overflow:hidden;background:#fff;border:1px solid #c8d5e5;border-radius:22px;box-shadow:0 30px 90px rgba(3,22,44,.38)}
    .settings-head,.settings-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:17px 19px}
    .settings-head{border-bottom:1px solid var(--line)}.settings-foot{border-top:1px solid var(--line);justify-content:flex-end}
    .settings-head h2{margin:0;font:800 21px/1.15 "Bahnschrift","Segoe UI",sans-serif}
    .settings-tools{display:grid;grid-template-columns:minmax(220px,1fr) auto auto auto;gap:8px;padding:12px 19px;background:#f5f8fc}
    .settings-list{overflow:auto;padding:10px 19px 18px;display:grid;gap:8px}
    .setting-row{display:grid;grid-template-columns:auto minmax(230px,1fr) minmax(220px,.7fr);align-items:center;gap:12px;
      padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:#fff}
    .setting-row:hover{background:#f5f9ff}.setting-row input{width:18px;height:18px;accent-color:var(--navy)}
    .setting-row b{display:block;font-size:12px}.setting-row small{display:block;color:var(--muted);font-size:10px;margin-top:3px}
    .setting-rule{font-size:10px;font-weight:850;color:#31526f;text-align:right}
    .projection{display:grid;gap:4px;min-width:175px}.projection>b{font-size:11px}.projection small{font-size:8px;font-weight:800;color:var(--muted);text-align:left}
    .score-note{display:block;margin-top:3px;font-size:8px;color:var(--muted);line-height:1.25}
    .footer{text-align:center;color:var(--muted);font-size:10px;padding:18px}
    @media(max-width:1180px){.kpis{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr}.method-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:720px){
      .shell{width:min(100% - 14px,1720px);padding-top:7px}.hero{grid-template-columns:1fr;padding:21px}.hero-meta{grid-template-columns:1fr 1fr}
      .toolbar{position:relative}.filters{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,1fr)}.status-grid{grid-template-columns:1fr 1fr}
      .method-grid{grid-template-columns:1fr}.card{padding:14px}.category-title{align-items:flex-start;gap:8px}.category-title small{text-align:right}
      .settings-tools{grid-template-columns:1fr 1fr}.settings-tools .control{grid-column:1/-1}.setting-row{grid-template-columns:auto 1fr}.setting-rule{grid-column:2;text-align:left}
    }
    @media print{
      body{background:#fff}.shell{width:100%;padding:0}.toolbar,.filters,.actions{display:none!important}.hero{box-shadow:none;border-radius:0}
      .kpi,.card,.category{box-shadow:none;break-inside:avoid}.category{page-break-inside:avoid}table{min-width:0;font-size:8px}th,td{padding:5px}
    }
  </style>
</head>
<body>
<main class="shell">
  <header class="hero">
    <div>
      <div class="eyebrow">Aizanoi Full Pack · Stratejik Performans</div>
      <h1>2026 CEO & Şirket Hedefleri</h1>
      <p id="heroPeriod">Bağımsız çeyrek verileri KPI kuralına göre kümülatif veya son dönem olarak değerlendirilir.</p>
    </div>
    <div class="hero-meta">
      <span id="sourceLabel">Kaynak: 2026_hedefler.xlsx</span>
      <span id="generatedLabel">Üretim: —</span>
      <span>Skor ölçeği: 0–120</span>
      <span id="scopeLabel">Kapsam: CEO Hedefleri</span>
    </div>
  </header>

  <nav class="toolbar" aria-label="Dashboard kontrolleri">
    <div class="segments" id="scopeTabs"></div>
    <div class="periods" id="periodTabs"></div>
    <div class="actions">
      <button class="btn secondary" type="button" id="settingsBtn">KPI Ayarları</button>
      <button class="btn secondary" type="button" id="csvBtn">CSV İndir</button>
      <button class="btn" type="button" id="printBtn">Yazdır / PDF</button>
    </div>
  </nav>

  <section class="filters" aria-label="KPI filtreleri">
    <input class="control" type="search" id="searchInput" placeholder="Gösterge ara..." autocomplete="off">
    <select class="control" id="statusFilter">
      <option value="">Tüm durumlar</option>
      <option>Maksimum</option>
      <option>Hedef ve Üzeri</option>
      <option>Eşik-Hedef Arası</option>
      <option>Eşik Altı</option>
      <option>Veri Yok</option>
    </select>
    <button class="btn secondary" type="button" id="clearBtn">Filtreleri Temizle</button>
  </section>

  <section class="kpis" id="kpiGrid"></section>

  <section class="grid">
    <article class="card">
      <div class="card-head">
        <div><h2>KPI Durum Dağılımı</h2><div class="hint" id="distributionHint"></div></div>
      </div>
      <div id="statusDistribution"></div>
    </article>
    <article class="card">
      <div class="card-head">
        <div><h2>Skor Okuma Rehberi</h2><div class="hint">Renk tek başına karar değildir; skor, durum, gerçekleşen ve projeksiyon birlikte okunur.</div></div>
      </div>
      <div class="status-grid" id="readingGuide"></div>
    </article>
  </section>

  <section id="categoryTables"></section>

  <details class="method">
    <summary>Hesaplama yöntemi ve veri sözleşmesi</summary>
    <div class="method-grid">
      <div><b>80 puan</b><br>Eşik hedefe karşılık gelir. Bu seviyenin altı “Eşik Altı” kabul edilir.</div>
      <div><b>100 puan</b><br>Yıllık hedefe karşılık gelir. Hedef ile maksimum arasında puan doğrusal artar.</div>
      <div><b>120 puan</b><br>Maksimum hedefe karşılık gelir. Daha iyi sonuçlar da 120 puanda sınırlandırılır.</div>
      <div><b>Ölçüm yönü</b><br>Pozitif KPI'da yüksek, negatif KPI'da düşük gerçekleşme daha iyidir. Ara değerlerde parçalı doğrusal interpolasyon uygulanır.</div>
      <div><b>Kaynak çeyrekler</b><br>Q1, Q2, Q3 ve Q4 artık bağımsız çeyrek değerleridir; kaynak değerler değiştirilmeden saklanır.</div>
      <div><b>Eski dosya uyumluluğu</b><br>“1 Ocak–...” biçimindeki eski kümülatif sütunlar algılanırsa toplanacak KPI'lar önce bağımsız çeyreklere ayrılır; böylece geçmiş dosyalar iki kez toplanmaz.</div>
      <div><b>Topla ve orantıla</b><br>İşaretli KPI'larda dolu çeyrekler toplanır. 80/100/120 dönem hedefleri yıllık hedef ÷ 4 × dolu çeyrek sayısı olarak hesaplanır.</div>
      <div><b>Son dolu çeyrek</b><br>İşaretli olmayan oran, skor ve anlık durum KPI'larında değerler toplanmaz; seçili dönemdeki son dolu çeyrek kullanılır.</div>
      <div><b>Yıl sonu projeksiyonu</b><br>Toplanan KPI'da kümülatif gerçekleşen ÷ dolu çeyrek × 4; diğer KPI'da son dolu çeyrek değeridir.</div>
      <div><b>Varsayılan istisnalar</b><br>Pazar payı, marka performansı, brüt marj, genel gider oranı, NPS, yeni müşteri, Arvato OTIF, stok devir hızı ve ÇBA skorları son dönem kuralıyla başlar.</div>
      <div><b>Kullanıcı ayarı</b><br>KPI Ayarları ekranındaki seçimler bu tarayıcıda saklanır ve tüm özetler, puanlar, projeksiyonlar ile CSV çıktısına anında uygulanır.</div>
      <div><b>Durum renkleri</b><br>80 altı kırmızı; 80 ve üzeri, 100 altı turuncu; 100 ve üzeri, 120 altı açık yeşil; 120 ve üzeri koyu yeşildir.</div>
    </div>
  </details>
  <footer class="footer">Aizanoi Full Pack · Kaynak dosya değiştirilmeden hesaplanan çevrimdışı stratejik hedef görünümü</footer>
</main>

<div class="settings-backdrop" id="settingsModal" hidden>
  <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
    <header class="settings-head">
      <div><h2 id="settingsTitle">KPI Toplama ve Orantılama Ayarları</h2><div class="hint">İşaretli KPI'lar toplanır, dönem hedefleri orantılanır ve yıl sonuna projekte edilir.</div></div>
      <button class="btn secondary" type="button" id="settingsClose">Kapat</button>
    </header>
    <div class="settings-tools">
      <input class="control" type="search" id="settingsSearch" placeholder="KPI veya kapsam ara..." autocomplete="off">
      <button class="btn secondary" type="button" id="settingsAll">Tümünü İşaretle</button>
      <button class="btn secondary" type="button" id="settingsNone">Tümünü Kaldır</button>
      <button class="btn secondary" type="button" id="settingsDefault">Varsayılan</button>
    </div>
    <div class="settings-list" id="settingsList"></div>
    <footer class="settings-foot">
      <button class="btn secondary" type="button" id="settingsCancel">Vazgeç</button>
      <button class="btn" type="button" id="settingsSave">Kaydet ve Uygula</button>
    </footer>
  </section>
</div>

<script id="dashboard-data" type="application/json">__DATA__</script>
<script>
const DATA=JSON.parse(document.getElementById('dashboard-data').textContent);
const $=id=>document.getElementById(id);
const TARGET_QUARTERS=['q1','q2','q3','q4'];
const DEFAULT_COLUMNS={
  threshold:'%80 Eşik Hedef Değer',target:'Hedef Değer',maximum:'%120 Maksimum Hedef Değer',
  quarters:{q1:'Q1 Gerçekleşen Değer (1 Ocak-31 Mart)',q2:'Q2 Gerçekleşen Değer (1 Nisan-30 Haziran)',q3:'Q3 Gerçekleşen Değer (1 Temmuz-30 Eylül)',q4:'Q4 Gerçekleşen Değer (1 Ekim-31 Aralık)'},
  actual:'Kümüle Hedef Gerçekleşen Değer',score:'Hedef Gerçekleşme',projection:'Tahmini Yıl Sonu Hedef Gerçekleşen Değer'
};
const DEFAULT_SCORE_BANDS=[
  {status:'Eşik Altı',short_label:'Eşik altı',range_label:'<80',color_name:'Kırmızı',color:'#dc2626',minimum:null,maximum_exclusive:80},
  {status:'Eşik-Hedef Arası',short_label:'Eşik-hedef arası',range_label:'80–<100',color_name:'Turuncu',color:'#f59e0b',minimum:80,maximum_exclusive:100},
  {status:'Hedef ve Üzeri',short_label:'Hedef ve üzeri',range_label:'100–<120',color_name:'Açık yeşil',color:'#4ade80',minimum:100,maximum_exclusive:120},
  {status:'Maksimum',short_label:'Maksimum',range_label:'120 ve üzeri',color_name:'Koyu yeşil',color:'#047857',minimum:120,maximum_exclusive:null}
];
const TARGET_DISPLAY=DATA.meta?.display||{};
const COLUMN_LABELS={...DEFAULT_COLUMNS,...(TARGET_DISPLAY.columns||{}),quarters:{...DEFAULT_COLUMNS.quarters,...(TARGET_DISPLAY.columns?.quarters||{})}};
const SCORE_BANDS=(TARGET_DISPLAY.score_bands||DEFAULT_SCORE_BANDS).map(item=>({...item}));
const STATUS=Object.fromEntries(SCORE_BANDS.map(item=>[item.status,{color:item.color,short:item.short_label||item.status}]));
STATUS['Veri Yok']={color:'#94a3b8',short:'Veri yok'};
const SETTINGS_KEY=DATA.meta.settings_storage_key||'aizanoi_hedef_proration_v2';
const state={scope:DATA.scopes?.[0]?.key||'ceo',period:DATA.meta.selected_period,query:'',status:''};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
const num=(v,d=1)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d});
const period=()=>DATA.periods.find(p=>p.key===state.period)||DATA.periods[0];
const scope=()=>DATA.scopes.find(s=>s.key===state.scope)||DATA.scopes[0];
const finite=v=>v!=null&&Number.isFinite(Number(v))?Number(v):null;
function scoreBand(value){
  const v=finite(value);
  if(v==null)return null;
  return SCORE_BANDS.find(item=>(item.minimum==null||v>=Number(item.minimum))&&(item.maximum_exclusive==null||v<Number(item.maximum_exclusive)))||SCORE_BANDS.at(-1);
}
function colorRgb(color){
  const value=String(color||'#94a3b8').replace('#','');
  return value.length===6?[parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)]:[148,163,184];
}
const scoreColor=v=>scoreBand(v)?.color||'#94a3b8';
const scoreTextColor=v=>{const [r,g,b]=colorRgb(scoreColor(v)),l=(.2126*r+.7152*g+.0722*b)/255;return l>.58?'#13243a':'#fff'};
function scoreStatus(value){
  return scoreBand(value)?.status||'Veri Yok';
}
function targetScore(actual,threshold,target,maximum,direction){
  const a=finite(actual),e=finite(threshold),h=finite(target),m=finite(maximum),dir=norm(direction);
  if([a,e,h,m].some(v=>v==null)||(!dir.includes('pozitif')&&!dir.includes('negatif')))return null;
  if(dir.includes('pozitif')){
    if(!(e<=h&&h<=m))return null;
    if(a<e)return e<=0?0:Math.max(0,Math.min(80,a/e*80));
    if(a===e)return 80;
    if(a<h)return h===e?100:80+(a-e)/(h-e)*20;
    if(a===h)return 100;
    if(a<m)return m===h?120:100+(a-h)/(m-h)*20;
    return 120;
  }
  if(!(e>=h&&h>=m))return null;
  if(a>e)return e===h?0:Math.max(0,80-(a-e)/(e-h)*20);
  if(a===e)return 80;
  if(a>h)return e===h?100:80+(e-a)/(e-h)*20;
  if(a===h)return 100;
  if(a>m)return h===m?120:100+(h-a)/(h-m)*20;
  return 120;
}
function loadSettings(){
  try{const value=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');return value&&typeof value==='object'?value:{}}catch{return{}}
}
let settingOverrides=loadSettings(),settingsDraft={};
const settingRows=()=>DATA.scopes.flatMap(s=>(s.rows||[]).map(row=>({scope:s,row})));
const hasOwn=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const rowProrated=(row,source=settingOverrides)=>hasOwn(source,row.setting_key)?Boolean(source[row.setting_key]):Boolean(row.prorate_default);
function rawQuarter(row,key,prorated=rowProrated(row)){
  const sourceValue=finite(row.source_quarters?.[key]);
  if(row.source_quarter_contract==='legacy_cumulative'&&!prorated)return sourceValue;
  return finite(row.raw_quarters?.[key]??sourceValue??row.periods?.[key]?.raw_actual??row.periods?.[key]?.actual);
}
function pointFor(row,periodKey=state.period){
  const prorated=rowProrated(row),raw=TARGET_QUARTERS.map(key=>rawQuarter(row,key,prorated));
  let endIndex,sourcePeriod;
  if(periodKey==='all'){
    endIndex=-1;
    for(let i=raw.length-1;i>=0;i--){if(raw[i]!=null){endIndex=i;break}}
    if(endIndex<0)return{actual:null,projection:null,score:null,projection_score:null,status:'Veri Yok',projection_status:'Veri Yok',filled_quarters:0,source_period:null,rule:rowProrated(row)?'Topla ve orantıla':'Son dolu çeyrek'};
    sourcePeriod=TARGET_QUARTERS[endIndex];
  }else{
    endIndex=TARGET_QUARTERS.indexOf(periodKey);
    if(endIndex<0||raw[endIndex]==null)return{actual:null,projection:null,score:null,projection_score:null,status:'Veri Yok',projection_status:'Veri Yok',filled_quarters:0,source_period:periodKey,rule:rowProrated(row)?'Topla ve orantıla':'Son dolu çeyrek'};
    sourcePeriod=periodKey;
  }
  const values=raw.slice(0,endIndex+1).filter(v=>v!=null),filled=values.length;
  if(!filled)return{actual:null,projection:null,score:null,projection_score:null,status:'Veri Yok',projection_status:'Veri Yok',filled_quarters:0,source_period:sourcePeriod,rule:prorated?'Topla ve orantıla':'Son dolu çeyrek'};
  const actual=prorated?values.reduce((sum,v)=>sum+v,0):values.at(-1),factor=prorated?filled/4:1;
  const effective_threshold=finite(row.threshold)==null?null:Number(row.threshold)*factor;
  const effective_target=finite(row.target)==null?null:Number(row.target)*factor;
  const effective_maximum=finite(row.maximum)==null?null:Number(row.maximum)*factor;
  const projection=prorated?actual/filled*4:actual;
  const score=targetScore(actual,effective_threshold,effective_target,effective_maximum,row.direction);
  const projection_score=targetScore(projection,row.threshold,row.target,row.maximum,row.direction);
  return{actual,projection,score,projection_score,status:scoreStatus(score),projection_status:scoreStatus(projection_score),filled_quarters:filled,source_period:sourcePeriod,effective_threshold,effective_target,effective_maximum,rule:prorated?'Topla ve orantıla':'Son dolu çeyrek'};
}
function dynamicSummary(periodKey=state.period){
  const rows=scope().rows||[],evaluated=rows.map(row=>({row,point:pointFor(row,periodKey)})).filter(item=>finite(item.point.score)!=null);
  const scores=evaluated.map(item=>Number(item.point.score));
  const weighted=evaluated.filter(item=>finite(item.row.weight)!=null&&Number(item.row.weight)>0);
  const counts={'Maksimum':0,'Hedef ve Üzeri':0,'Eşik-Hedef Arası':0,'Eşik Altı':0};
  evaluated.forEach(item=>{if(counts[item.point.status]!=null)counts[item.point.status]++});
  const weightTotal=weighted.reduce((sum,item)=>sum+Number(item.row.weight),0);
  return{total:rows.length,evaluated:evaluated.length,missing:rows.length-evaluated.length,average:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null,weighted_average:weightTotal?weighted.reduce((sum,item)=>sum+Number(item.point.score)*Number(item.row.weight),0)/weightTotal:null,weighted_count:weighted.length,weight_total:weightTotal,counts};
}
function formatValue(value,row){
  if(value==null||!Number.isFinite(Number(value)))return '—';
  const v=Number(value),unit=norm(row.unit);
  if(unit.includes('m tl'))return `${num(v/1e6,1)} Mn TL`;
  if(unit.includes('gun'))return `${num(v,1)} gün`;
  if(unit.includes('oran')){
    const reference=Math.max(...[row.threshold,row.target,row.maximum,value].filter(x=>x!=null).map(x=>Math.abs(Number(x))));
    return reference<=1.5?`%${num(v*100,2)}`:num(v,2);
  }
  return num(v,2);
}
function filteredRows(){
  const q=norm(state.query);
  return (scope().rows||[]).map(row=>({row,point:pointFor(row)})).filter(item=>
    (!q||norm(`${item.row.metric} ${item.row.category} ${item.row.unit}`).includes(q))&&(!state.status||item.point.status===state.status)
  );
}
function renderControls(){
  $('scopeTabs').innerHTML=DATA.scopes.map(s=>`<button class="segment ${s.key===state.scope?'active':''}" data-scope="${esc(s.key)}">${esc(s.label)}</button>`).join('');
  $('periodTabs').innerHTML=DATA.periods.map(p=>{const enabled=scope().available_periods.includes(p.key);return`<button class="period ${p.key===state.period?'active':''}" data-period="${p.key}" ${enabled?'':'disabled'} title="${esc(p.range)}">${esc(p.short_label)}</button>`}).join('');
  document.querySelectorAll('[data-scope]').forEach(btn=>btn.onclick=()=>{state.scope=btn.dataset.scope;if(!scope().available_periods.includes(state.period))state.period=scope().available_periods.at(-1)||DATA.meta.selected_period;render()});
  document.querySelectorAll('[data-period]').forEach(btn=>btn.onclick=()=>{state.period=btn.dataset.period;render()});
}
function renderKpis(){
  const s=dynamicSummary(),counts=s.counts||{},target=(counts['Maksimum']||0)+(counts['Hedef ve Üzeri']||0);
  const cards=[
    ['Toplam KPI',num(s.total,0),`${num(s.evaluated,0)} değerlendirildi`,'#0c2e5e'],
    ['Ortalama Gerçekleşme',`${num(s.average,1)} puan`,'KPI ağırlıkları hariç','#2563a7'],
    ['Ağırlıklı Gerçekleşme',`${num(s.weighted_average,1)} puan`,`${num(s.weighted_count,0)} ağırlıklı KPI`,'#164b83'],
    ['Hedef / Maksimum',`${num(target,0)} KPI`,`${num(counts['Maksimum']||0,0)} maksimum · ${num(counts['Hedef ve Üzeri']||0,0)} hedef`,'#07883f'],
    ['Eşik-Hedef Arası',`${num(counts['Eşik-Hedef Arası']||0,0)} KPI`,'İzleme bandı','#f59e0b'],
    ['Eşik Altı',`${num(counts['Eşik Altı']||0,0)} KPI`,'Öncelikli aksiyon','#e53935']
  ];
  $('kpiGrid').innerHTML=cards.map(c=>`<article class="kpi" style="--tone:${c[3]}"><div class="label">${esc(c[0])}</div><div class="value">${esc(c[1])}</div><div class="sub">${esc(c[2])}</div></article>`).join('');
}
function renderDistribution(){
  const s=dynamicSummary(),counts=s.counts||{},den=Math.max(1,s.evaluated||0);
  const order=['Maksimum','Hedef ve Üzeri','Eşik-Hedef Arası','Eşik Altı'];
  $('distributionHint').textContent=`${scope().label} · ${period().label} · ${num(s.evaluated,0)} değerlendirilen KPI`;
  $('statusDistribution').innerHTML=`<div class="status-strip">${order.map(k=>`<span style="width:${(counts[k]||0)/den*100}%;background:${STATUS[k].color}" title="${esc(k)}: ${counts[k]||0}"></span>`).join('')}</div><div class="status-grid">${order.map(k=>`<div class="status-item"><i class="dot" style="background:${STATUS[k].color}"></i><span>${esc(STATUS[k].short)}</span><b>${num(counts[k]||0,0)}</b></div>`).join('')}</div>`;
}
function renderGuide(){
  const guide=['Maksimum','Hedef ve Üzeri','Eşik-Hedef Arası','Eşik Altı'].map(status=>SCORE_BANDS.find(item=>item.status===status)).filter(Boolean);
  $('readingGuide').innerHTML=`<div class="color-scale"><div class="color-scale-bar">${SCORE_BANDS.map(item=>`<span style="background:${esc(item.color)}"></span>`).join('')}</div><div class="color-scale-labels">${SCORE_BANDS.map(item=>`<span>${esc(item.range_label)} · ${esc(item.color_name)}</span>`).join('')}</div></div>`+guide.map(item=>`<div class="status-item"><i class="dot" style="background:${esc(item.color)}"></i><span>${esc(item.status)}</span><b style="font-size:11px">${esc(item.range_label)}</b></div>`).join('');
}
function renderTables(){
  const rows=filteredRows(),byCategory=new Map();
  rows.forEach(item=>{if(!byCategory.has(item.row.category))byCategory.set(item.row.category,[]);byCategory.get(item.row.category).push(item)});
  $('categoryTables').innerHTML=scope().categories.map(category=>{
    const list=byCategory.get(category)||[];
    if(!list.length)return '';
    const annual=state.period==='all';
    const quarterHeads=annual?TARGET_QUARTERS.map(q=>`<th>${esc(COLUMN_LABELS.quarters[q])}</th>`).join(''):'';
    const actualHead=esc(COLUMN_LABELS.actual);
    const periodNote=annual?'Tüm Yıl · dolu çeyreklerin hesaplanan sonucu':`${period().label} · ${period().range}`;
    return`<article class="category"><div class="category-title"><span>${esc(category)}</span><small>${num(list.length,0)} KPI · ${esc(periodNote)}</small></div><div class="table-wrap"><table><thead><tr><th style="text-align:left">Gösterge Adı</th><th>Yön</th><th>Ağırlık</th><th>${esc(COLUMN_LABELS.threshold)}</th><th>${esc(COLUMN_LABELS.target)}</th><th>${esc(COLUMN_LABELS.maximum)}</th>${quarterHeads}<th>${actualHead}</th><th>${esc(COLUMN_LABELS.score)}</th><th>${esc(COLUMN_LABELS.projection)}</th><th>Durum</th></tr></thead><tbody>${list.map(item=>{const r=item.row,p=item.point,color=scoreColor(p.score),textColor=scoreTextColor(p.score),width=Math.max(0,Math.min(100,Number(p.score||0)/120*100)),projectionColor=scoreColor(p.projection_score),quarters=annual?TARGET_QUARTERS.map(q=>`<td class="num">${esc(formatValue(rawQuarter(r,q),r))}</td>`).join(''):'',source=p.source_period?String(p.source_period).toUpperCase():'—';return`<tr><td class="metric">${esc(r.metric)}</td><td>${esc(r.direction||'—')}</td><td class="num">${r.weight==null?'—':num(r.weight,1)}</td><td class="num">${esc(formatValue(r.threshold,r))}</td><td class="num">${esc(formatValue(r.target,r))}</td><td class="num">${esc(formatValue(r.maximum,r))}</td>${quarters}<td class="num"><b>${esc(formatValue(p.actual,r))}</b><span class="score-note">${esc(p.rule)} · ${num(p.filled_quarters,0)} çeyrek · ${esc(source)}</span></td><td class="score-cell"><div class="score"><div class="track"><div class="fill" style="width:${width}%;background:${color}"></div></div><b>${num(p.score,1)}</b></div><span class="score-note">100 puan dönem hedefi: ${esc(formatValue(p.effective_target,r))}</span></td><td class="num"><div class="projection"><b>${esc(formatValue(p.projection,r))}</b><div class="score"><div class="track"><div class="fill" style="width:${Math.max(0,Math.min(100,Number(p.projection_score||0)/120*100))}%;background:${projectionColor}"></div></div><b>${num(p.projection_score,1)}</b></div><small>Projeksiyon skoru · yıllık hedef ölçeği</small></div></td><td><span class="badge" style="background:${color};color:${textColor}">${esc(p.status||'Veri Yok')}</span></td></tr>`}).join('')}</tbody></table></div></article>`;
  }).join('')||'<div class="empty card">Filtreyle eşleşen KPI bulunamadı.</div>';
}
function csvCell(v){const s=String(v??'').replace(/"/g,'""');return`"${s}"`}
function exportCsv(){
  const rows=filteredRows(),annual=state.period==='all';
  const headers=['Kapsam','Dönem','Kategori','Gösterge','Yön','Ağırlık','Birim',COLUMN_LABELS.threshold,COLUMN_LABELS.target,COLUMN_LABELS.maximum,...(annual?TARGET_QUARTERS.map(q=>COLUMN_LABELS.quarters[q]):[]),'Hesap Kuralı','Dolu Çeyrek','Kaynak Dönem','Dönem Eşiği','Dönem Hedefi','Dönem Maksimumu',COLUMN_LABELS.actual,`${COLUMN_LABELS.score} Skoru`,COLUMN_LABELS.projection,'Projeksiyon Skoru','Durum'];
  const lines=[headers.map(csvCell).join(';'),...rows.map(item=>{const r=item.row,p=item.point,quarters=annual?TARGET_QUARTERS.map(q=>rawQuarter(r,q)):[];return[scope().label,period().label,r.category,r.metric,r.direction,r.weight,r.unit,r.threshold,r.target,r.maximum,...quarters,p.rule,p.filled_quarters,p.source_period,p.effective_threshold,p.effective_target,p.effective_maximum,p.actual,p.score,p.projection,p.projection_score,p.status].map(csvCell).join(';')})];
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`2026_hedefler_${state.scope}_${state.period}.csv`;a.click();URL.revokeObjectURL(a.href);
}
function renderSettingsList(){
  const q=norm($('settingsSearch').value),rows=settingRows().filter(item=>!q||norm(`${item.scope.label} ${item.row.metric} ${item.row.category}`).includes(q));
  $('settingsList').innerHTML=rows.map(({scope:s,row})=>{const checked=rowProrated(row,settingsDraft);return`<label class="setting-row"><input type="checkbox" data-setting-key="${esc(row.setting_key)}" ${checked?'checked':''}><span><b>${esc(row.metric)}</b><small>${esc(s.label)} · ${esc(row.category)}</small></span><span class="setting-rule">${checked?'Topla + hedefi orantıla + projekte et':'Son dolu çeyreği kullan'}</span></label>`}).join('')||'<div class="empty">Aramayla eşleşen KPI bulunamadı.</div>';
  $('settingsList').querySelectorAll('[data-setting-key]').forEach(input=>input.onchange=()=>{settingsDraft[input.dataset.settingKey]=input.checked;renderSettingsList()});
}
function openSettings(){settingsDraft={...settingOverrides};$('settingsSearch').value='';renderSettingsList();$('settingsModal').hidden=false;document.body.style.overflow='hidden'}
function closeSettings(){$('settingsModal').hidden=true;document.body.style.overflow=''}
function setAllDraft(value){settingRows().forEach(({row})=>settingsDraft[row.setting_key]=value);renderSettingsList()}
function saveSettings(){
  const compact={};
  settingRows().forEach(({row})=>{const value=rowProrated(row,settingsDraft);if(value!==Boolean(row.prorate_default))compact[row.setting_key]=value});
  settingOverrides=compact;localStorage.setItem(SETTINGS_KEY,JSON.stringify(compact));closeSettings();render();
}
function render(){
  renderControls();renderKpis();renderDistribution();renderGuide();renderTables();
  $('heroPeriod').textContent=`${period().label} görünümü · ${period().range}`;
  $('scopeLabel').textContent=`Kapsam: ${scope().label}`;
  $('sourceLabel').textContent=`Kaynak: ${DATA.meta.source_file}`;
  $('generatedLabel').textContent=`Üretim: ${new Date(DATA.meta.generated_at).toLocaleString('tr-TR')}`;
}
$('searchInput').oninput=e=>{state.query=e.target.value;renderTables()};
$('statusFilter').onchange=e=>{state.status=e.target.value;renderTables()};
$('clearBtn').onclick=()=>{state.query='';state.status='';$('searchInput').value='';$('statusFilter').value='';renderTables()};
$('csvBtn').onclick=exportCsv;$('printBtn').onclick=()=>window.print();$('settingsBtn').onclick=openSettings;
$('settingsClose').onclick=closeSettings;$('settingsCancel').onclick=closeSettings;$('settingsSave').onclick=saveSettings;
$('settingsSearch').oninput=renderSettingsList;$('settingsAll').onclick=()=>setAllDraft(true);$('settingsNone').onclick=()=>setAllDraft(false);
$('settingsDefault').onclick=()=>{settingsDraft={};renderSettingsList()};
$('settingsModal').onclick=e=>{if(e.target===$('settingsModal'))closeSettings()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('settingsModal').hidden)closeSettings()});
render();
</script>
</body>
</html>
"""
