"""Offline HTML template for the Aizanoi workforce turnover analytics dashboard."""

HTML_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#07111f">
  <meta name="description" content="Explore full-featured workforce turnover analytics using a deterministic, fully synthetic demonstration workbook.">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="https://aizanoianalytics.com/analytics/dashboards/hr-analytics-full-set/workforce-turnover/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Aizanoi Analytics">
  <meta property="og:title" content="Workforce Turnover Analytics">
  <meta property="og:description" content="Eight working analytical views: overview, breakdown, comparison, forecast, early turnover, exit explorer, survival and risk, plus settings and exports. Synthetic public data only.">
  <meta property="og:url" content="https://aizanoianalytics.com/analytics/dashboards/hr-analytics-full-set/workforce-turnover/">
  <meta property="og:image" content="https://aizanoianalytics.com/assets/branding/aizanoi-og.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Workforce Turnover Analytics">
  <meta name="twitter:description" content="Eight working analytical views: overview, breakdown, comparison, forecast, early turnover, exit explorer, survival and risk, plus settings and exports. Synthetic public data only.">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Workforce Turnover Analytics","applicationCategory":"BusinessApplication","url":"https://aizanoianalytics.com/analytics/dashboards/hr-analytics-full-set/workforce-turnover/","isPartOf":{"@type":"WebSite","name":"Aizanoi Analytics","url":"https://aizanoianalytics.com/"}}</script>
  <link rel="icon" href="/assets/branding/aizanoi-logo-mark.svg" type="image/svg+xml">
  <title>Workforce Turnover Analytics — Aizanoi Analytics</title>
  <style>
    :root{
      --ink:#f7f2e8;--muted:#9fb0c7;--faint:#708198;--bg:#07111f;--bg2:#0b1728;
      --panel:#101f32;--panel2:#14263c;--line:#2a3b52;--blue:#4ea5ff;--cyan:#32d6c5;
      --amber:#ffb84d;--orange:#ff7a45;--rose:#ff5d77;--green:#66d19e;--violet:#a98cff;
      --danger:#ff6b6b;--shadow:0 22px 64px rgba(0,0,0,.28);--radius:22px;
      --font:"Aptos","Bahnschrift","Trebuchet MS",sans-serif;
    }
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;min-width:320px;color:var(--ink);font-family:var(--font);background:
      radial-gradient(circle at 9% 4%,rgba(78,165,255,.14),transparent 28rem),
      radial-gradient(circle at 92% 8%,rgba(255,184,77,.10),transparent 26rem),
      linear-gradient(160deg,var(--bg),#081422 48%,#050c16);min-height:100vh}
    body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.18;background-image:
      linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),
      linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
      background-size:38px 38px;mask-image:linear-gradient(to bottom,#000,transparent 78%)}
    button,select,input{font:inherit}
    button{cursor:pointer}
    .shell{width:min(1880px,100%);margin:auto;padding:22px clamp(14px,2.2vw,38px) 54px}
    .hero{position:relative;overflow:hidden;display:flex;align-items:flex-end;justify-content:space-between;
      gap:24px;padding:28px 30px;border:1px solid rgba(255,255,255,.09);border-radius:28px;
      background:linear-gradient(125deg,rgba(16,34,56,.98),rgba(11,26,43,.9));box-shadow:var(--shadow)}
    .hero:after{content:"";position:absolute;width:440px;height:440px;border:78px solid rgba(50,214,197,.07);
      border-radius:50%;right:-180px;top:-250px}
    .eyebrow{display:flex;align-items:center;gap:9px;color:var(--cyan);font-size:12px;font-weight:800;
      letter-spacing:.14em;text-transform:uppercase}
    .eyebrow:before{content:"";width:30px;height:2px;background:var(--cyan)}
    h1{font-size:clamp(30px,4vw,58px);line-height:.98;letter-spacing:-.045em;margin:13px 0 12px;max-width:820px}
    .hero p{max-width:820px;color:var(--muted);font-size:14px;line-height:1.55;margin:0}
    .hero-meta{position:relative;z-index:1;display:grid;gap:9px;min-width:250px}
    .meta-pill{padding:10px 13px;border-radius:12px;background:rgba(255,255,255,.055);
      border:1px solid rgba(255,255,255,.08);font-size:12px;color:var(--muted)}
    .meta-pill strong{display:block;color:var(--ink);font-size:14px;margin-top:2px}
    .tabs{display:flex;gap:8px;overflow:auto;padding:18px 2px 10px;scrollbar-width:thin}
    .tab{white-space:nowrap;border:1px solid var(--line);color:var(--muted);background:rgba(13,28,47,.82);
      border-radius:999px;padding:10px 15px;font-weight:750;font-size:12px;transition:.18s ease}
    .tab:hover{color:var(--ink);border-color:#45617f}
    .tab.active{color:#07111f;border-color:var(--amber);background:var(--amber);box-shadow:0 8px 22px rgba(255,184,77,.2)}
    .filter-shell{position:sticky;top:0;z-index:50;margin:8px 0 18px;border:1px solid rgba(255,255,255,.1);
      border-radius:18px;background:rgba(8,19,33,.94);backdrop-filter:blur(18px);box-shadow:0 14px 40px rgba(0,0,0,.22)}
    .filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:8px;padding:12px}
    .field{min-width:0}
    .field label{display:block;margin:0 0 5px 3px;color:var(--faint);font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
    .select,.input{width:100%;height:40px;border:1px solid var(--line);border-radius:10px;color:var(--ink);
      background:#0d1b2d;padding:0 11px;outline:none}
    .select:focus,.input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(78,165,255,.12)}
    .select:disabled{opacity:.45}
    .filter-actions{display:flex;align-items:end;gap:6px}
    .btn{min-height:40px;border:1px solid var(--line);border-radius:10px;padding:0 13px;color:var(--ink);
      background:#15283f;font-weight:800;font-size:12px}
    .btn:hover{border-color:#58718d;background:#1b314b}
    .btn.primary{background:var(--blue);color:#06111e;border-color:var(--blue)}
    .btn.warn{background:var(--amber);color:#111827;border-color:var(--amber)}
    .btn.danger{background:rgba(255,93,119,.12);border-color:rgba(255,93,119,.45);color:#ff9daf}
    .filter-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 13px 11px}
    .chips{display:flex;flex-wrap:wrap;gap:6px}
    .chip{padding:5px 9px;border:1px solid rgba(78,165,255,.24);background:rgba(78,165,255,.08);
      color:#b9ddff;border-radius:999px;font-size:10px;font-weight:750}
    .period-buttons{display:flex;gap:5px}
    .mini{border:1px solid var(--line);border-radius:8px;background:#102239;color:var(--muted);padding:5px 8px;font-size:10px;font-weight:800}
    .mini:hover{color:var(--ink)}
    .page{display:none;animation:reveal .28s ease}
    .page.active{display:block}
    @keyframes reveal{from{opacity:.25;transform:translateY(6px)}to{opacity:1;transform:none}}
    .section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:27px 2px 12px}
    .section-head h2{font-size:22px;margin:0;letter-spacing:-.025em}
    .section-head p{margin:4px 0 0;color:var(--muted);font-size:12px}
    .badge{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;padding:6px 9px;border-radius:999px;
      border:1px solid var(--line);background:rgba(255,255,255,.035);color:var(--muted);font-size:10px;font-weight:800}
    .dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px rgba(102,209,158,.1)}
    .grid{display:grid;gap:14px}.grid>*{min-width:0}
    .grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
    .grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
    .kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:11px}
    .card,.kpi{border:1px solid rgba(255,255,255,.085);background:linear-gradient(155deg,rgba(18,36,58,.96),rgba(12,27,45,.94));
      border-radius:var(--radius);box-shadow:0 12px 36px rgba(0,0,0,.16)}
    .card{padding:16px;min-width:0}
    .kpi{padding:15px 16px;position:relative;overflow:hidden;min-height:112px}
    .kpi:after{content:"";position:absolute;right:-32px;bottom:-43px;width:90px;height:90px;border-radius:50%;background:var(--tone,rgba(78,165,255,.12))}
    .kpi .label{color:var(--muted);font-size:10px;font-weight:850;letter-spacing:.055em;text-transform:uppercase}
    .kpi .value{font-size:clamp(24px,2.5vw,36px);font-weight:900;letter-spacing:-.035em;margin:9px 0 5px}
    .kpi .sub{color:var(--faint);font-size:10px;line-height:1.35}
    .card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:11px}
    .card-head h3{font-size:15px;margin:0}
    .card-head p{margin:4px 0 0;color:var(--faint);font-size:10px;line-height:1.4}
    .card-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
    .chart{min-height:310px;width:100%;position:relative;overflow:hidden}
    .chart.compact{min-height:245px}
    .chart svg{display:block;width:100%;height:auto;overflow:visible}
    .empty{display:grid;place-items:center;min-height:230px;color:var(--muted);border:1px dashed var(--line);border-radius:14px;text-align:center;padding:24px}
    .notice{padding:12px 14px;border-radius:13px;border:1px solid rgba(255,184,77,.3);
      background:rgba(255,184,77,.075);color:#ffd89a;font-size:11px;line-height:1.55}
    .notice.info{border-color:rgba(78,165,255,.3);background:rgba(78,165,255,.07);color:#b9ddff}
    .legend{display:flex;flex-wrap:wrap;gap:8px 14px;color:var(--muted);font-size:10px;margin-top:8px}
    .legend span{display:inline-flex;align-items:center;gap:6px}
    .swatch{width:18px;height:4px;border-radius:4px;background:var(--c)}
    .table-wrap{width:100%;overflow:auto;border:1px solid var(--line);border-radius:14px;scrollbar-color:#49637f #0b1828}
    table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px}
    th{position:sticky;top:0;z-index:2;color:#caddf3;background:#172b43;font-size:10px;letter-spacing:.035em;text-transform:none;
      text-align:left;padding:10px 9px;border-bottom:1px solid #3a506b;white-space:nowrap}
    td{padding:9px;border-bottom:1px solid rgba(255,255,255,.055);color:#dce7f3;white-space:nowrap}
    tr:hover td{background:rgba(78,165,255,.055)}
    tbody tr:last-child td{border-bottom:0}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    .total-row td{font-weight:900;background:rgba(255,184,77,.075)}
    .table-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 9px}
    .table-tools .left,.table-tools .right{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
    .search{height:36px;min-width:220px;border:1px solid var(--line);border-radius:9px;background:#0c1a2b;color:var(--ink);padding:0 11px}
    .count{color:var(--muted);font-size:10px}
    .sort-btn{all:unset;cursor:pointer;color:inherit;font:inherit}
    .sort-btn:hover{color:white}
    .heat{font-weight:850;text-align:center;border-radius:5px}
    .hbar-list{display:grid;gap:9px}
    .hbar-row{display:grid;grid-template-columns:minmax(130px,1.2fr) minmax(170px,3fr) 74px;align-items:center;gap:10px;font-size:10px}
    .hbar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d9e6f4}
    .track{height:14px;border-radius:99px;background:#0a1524;overflow:hidden;border:1px solid rgba(255,255,255,.055)}
    .fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--blue),var(--cyan));transform-origin:left}
    .hbar-value{text-align:right;font-weight:900;font-variant-numeric:tabular-nums}
    .control-row{display:flex;align-items:end;gap:9px;flex-wrap:wrap;margin-bottom:12px}
    .control-row .field{min-width:155px;flex:1}
    .metric-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .metric-card{border:1px solid var(--line);background:#0d1b2d;border-radius:14px;padding:13px}
    .metric-card .big{font-size:25px;font-weight:900;margin:6px 0}
    .metric-card .small{font-size:10px;color:var(--muted);line-height:1.45}
    .status{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:900}
    .status.good{color:#9ff0c7;background:rgba(102,209,158,.12);border:1px solid rgba(102,209,158,.28)}
    .status.bad{color:#ff9daf;background:rgba(255,93,119,.12);border:1px solid rgba(255,93,119,.28)}
    .status.mid{color:#ffd490;background:rgba(255,184,77,.11);border:1px solid rgba(255,184,77,.28)}
    .settings-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px}
    .reason-row{display:grid;grid-template-columns:minmax(250px,2.3fr) minmax(150px,1fr) 90px 120px;gap:8px;
      align-items:center;padding:9px;border-bottom:1px solid rgba(255,255,255,.055);font-size:11px}
    .reason-row.header{position:sticky;top:0;background:#172b43;z-index:2;font-weight:900;color:#caddf3}
    .reason-list{max-height:650px;overflow:auto;border:1px solid var(--line);border-radius:14px;background:#0b1828}
    .formula{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;padding:13px;border-left:3px solid var(--cyan);
      background:rgba(50,214,197,.055);border-radius:0 12px 12px 0;font-size:11px;color:var(--muted);line-height:1.55}
    .formula strong{color:var(--cyan)}
    .footer{margin-top:36px;padding:18px 2px 0;border-top:1px solid rgba(255,255,255,.08);
      color:#687a91;font-size:9px;letter-spacing:.08em;text-align:center}
    .footer-quote{text-transform:lowercase}.footer-links{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:10px}
    .footer-links a{color:#91a7c1;text-decoration:none;text-transform:uppercase}.footer-links a:hover{color:var(--cyan)}
    .tooltip{position:fixed;z-index:200;pointer-events:none;display:none;max-width:260px;padding:9px 10px;
      border:1px solid #48627f;background:#081523;color:#eef7ff;border-radius:10px;box-shadow:var(--shadow);font-size:10px;line-height:1.45}
    .axis{fill:#8496ad;font-size:9px}
    .axis-title{fill:#aabbd0;font-size:9px;font-weight:800}
    .gridline{stroke:#263a51;stroke-width:1}
    .chart-title{fill:#dce8f4;font-size:10px;font-weight:800}
    .mobile-note{display:none}
    .mt-9{margin-top:9px}.mt-10{margin-top:10px}.mt-12{margin-top:12px}.mt-14{margin-top:14px}
    .min-w-190{min-width:190px}.min-w-230{min-width:230px}
    .synthetic-notice{margin:14px 0}
    .settings-copy{color:var(--muted);font-size:11px;line-height:1.6;margin-top:0}
    .metric-cards.two-cols{grid-template-columns:repeat(2,minmax(0,1fr))}
    .metric-cards.three-cols{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px}
    .heat-value{display:block;padding:5px 7px}
    .metric-inline{font-size:14px;color:var(--muted)}
    @media(max-width:1450px){
      .filter-grid{grid-template-columns:repeat(5,minmax(130px,1fr))}
      .kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
    }
    @media(max-width:980px){
      .hero{align-items:flex-start;flex-direction:column}.hero-meta{width:100%;grid-template-columns:repeat(2,minmax(0,1fr))}
      .filter-shell{position:relative}.filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .grid.two,.grid.three,.settings-grid{grid-template-columns:1fr}
      .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
      .metric-cards{grid-template-columns:1fr}
      .mobile-note{display:block}
    }
    @media(max-width:580px){
      .shell{padding:10px 9px 36px}.hero{padding:22px 18px;border-radius:20px}.hero-meta{grid-template-columns:1fr}
      .filter-grid{grid-template-columns:1fr}.filter-foot{align-items:flex-start;flex-direction:column}
      .kpis{grid-template-columns:1fr}.card{padding:12px}.chart{min-height:270px}
      .hbar-row{grid-template-columns:minmax(100px,1fr) minmax(110px,2fr) 58px}
      .reason-row{grid-template-columns:1fr 110px}.reason-row>*:nth-child(3){display:none}
      .table-tools{align-items:flex-start;flex-direction:column}.search{width:100%;min-width:0}
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="hero">
      <div>
        <div class="eyebrow">Aizanoi Analytics · Synthetic Workforce Lab</div>
        <h1>Workforce Turnover Analytics</h1>
        <p>Explore all exits, voluntary departures, and employer-initiated exits on one canonical denominator across trends, comparisons, forecasts, early tenure, survival, and risk layers.</p>
      </div>
      <div class="hero-meta">
        <div class="meta-pill">Data range<strong id="meta-period">-</strong></div>
        <div class="meta-pill">Generated<strong id="meta-generated">-</strong></div>
      </div>
    </header>

    <div class="notice info synthetic-notice">100% synthetic demonstration data. No employer records, real employees, contact details, or direct identifiers are used.</div>

    <nav class="tabs" id="tabs" aria-label="Turnover sections" tabindex="0">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="breakdown">Breakdown Analysis</button>
      <button class="tab" data-tab="compare">Comparison</button>
      <button class="tab" data-tab="forecast">Forecast &amp; Backtest</button>
      <button class="tab" data-tab="early">Early Tenure &amp; Service</button>
      <button class="tab" data-tab="exits">Exit Detail</button>
      <button class="tab" data-tab="v2">V2 Analytics &amp; Risk</button>
      <button class="tab" data-tab="settings">Settings</button>
    </nav>

    <section class="filter-shell" aria-label="Global filters">
      <div class="filter-grid">
        <div class="field"><label for="scope-filter">Scope</label><select class="select" id="scope-filter" aria-label="Scope"></select></div>
        <div class="field"><label for="type-filter">Turnover Type</label><select class="select" id="type-filter" aria-label="Turnover Type">
          <option value="all">All Exits</option>
          <option value="voluntary">Voluntary Turnover</option>
          <option value="forced">Employer-Initiated Turnover</option>
        </select></div>
        <div class="field"><label for="start-filter">Start</label><select class="select" id="start-filter" aria-label="Start"></select></div>
        <div class="field"><label for="end-filter">End</label><select class="select" id="end-filter" aria-label="End"></select></div>
        <div class="field"><label for="region-filter">Region</label><select class="select" id="region-filter" aria-label="Region"></select></div>
        <div class="field"><label for="store-filter">Store</label><select class="select" id="store-filter" aria-label="Store"></select></div>
        <div class="field"><label for="department-filter">Department</label><select class="select" id="department-filter" aria-label="Department"></select></div>
        <div class="field"><label for="city-filter">City</label><select class="select" id="city-filter" aria-label="City"></select></div>
        <div class="field"><label for="gender-filter">Gender</label><select class="select" id="gender-filter" aria-label="Gender"></select></div>
        <div class="field"><label for="contract-filter">Contract Type</label><select class="select" id="contract-filter" aria-label="Contract Type"></select></div>
        <div class="field"><label for="title-filter">Title</label><select class="select" id="title-filter" aria-label="Title"></select></div>
        <div class="filter-actions"><button class="btn" id="reset-filters">Reset</button></div>
      </div>
      <div class="filter-foot">
        <div class="chips" id="active-chips"></div>
        <div class="period-buttons">
          <button class="mini" data-period="12">Last 12 Months</button>
          <button class="mini" data-period="24">Last 24 Months</button>
          <button class="mini" data-period="all">All</button>
        </div>
      </div>
    </section>

    <main>
      <section class="page active" data-page="overview">
        <div class="section-head"><div><h2>Executive Summary</h2><p id="overview-subtitle">Selected scope and period</p></div><span class="badge"><span class="dot"></span>canonical exit metric</span></div>
        <div class="kpis" id="overview-kpis"></div>
        <div class="grid two mt-14">
          <article class="card">
            <div class="card-head"><div><h3>Monthly Turnover Trend</h3><p>Exits / monthly average workforce</p></div><div class="card-actions"><button class="mini" data-export="trend">CSV</button></div></div>
            <div class="chart" id="trend-chart"></div>
          </article>
          <article class="card">
            <div class="card-head"><div><h3>Exit Type Composition</h3><p>Classified exits within the selected period</p></div><span class="badge" id="match-badge">-</span></div>
            <div class="chart" id="composition-chart"></div>
          </article>
        </div>
        <div class="grid two mt-14">
          <article class="card">
            <div class="card-head"><div><h3>Monthly Hire / Exit Balance</h3><p>Hires and exits shown as comparable series</p></div></div>
            <div class="chart compact" id="flow-chart"></div>
          </article>
          <article class="card">
            <div class="card-head"><div><h3>Scope Comparison</h3><p>Results for the selected end month using the same formula</p></div></div>
            <div id="scope-comparison"></div>
          </article>
        </div>
        <article class="card mt-14">
          <div class="card-head">
            <div><h3>Turnover Across Scopes</h3><p>Six primary scopes compared on the same monthly axis and canonical formula</p></div>
            <div class="card-actions"><select class="select min-w-190" id="scope-trend-mode" aria-label="Trend metric mode"><option value="monthly">Monthly Turnover</option><option value="ytd">Year-to-Date Cumulative Turnover</option></select></div>
          </div>
          <div class="chart" id="scope-trend-chart"></div>
        </article>
        <div class="formula mt-14"><strong>Formula</strong><span><b>Turnover = Exits / ((Opening Workforce + Closing Workforce) / 2)</b>. Voluntary and employer-initiated views change only the exit numerator. Opening, closing, and average workforce remain unchanged.</span></div>
      </section>

      <section class="page" data-page="breakdown">
        <div class="section-head"><div><h2>Breakdown Analysis</h2><p>Audit the same denominator by region, store, department, section, city, gender, contract type, and title</p></div></div>
        <article class="card">
          <div class="control-row">
            <div class="field"><label for="breakdown-dimension">Breakdown</label><select class="select" id="breakdown-dimension" aria-label="Breakdown">
              <option value="bolge">Region</option><option value="magaza">Store</option>
              <option value="departman">Department</option><option value="bolum">Section</option><option value="il">City</option>
              <option value="cinsiyet">Gender</option><option value="sozlesme_turu">Contract Type</option><option value="title">Title</option>
            </select></div>
            <div class="field"><label for="breakdown-metric">Metric</label><select class="select" id="breakdown-metric" aria-label="Metric">
              <option value="latest">Latest Month Turnover</option><option value="period">Selected Period Cumulative Turnover</option>
              <option value="last12">Last 12 Months Turnover</option><option value="exits">Selected Period Exits</option>
            </select></div>
            <button class="btn" data-export="breakdown">Breakdown CSV</button>
          </div>
          <div class="grid two">
            <div><div class="card-head"><div><h3>Ranked Comparison</h3><p id="breakdown-note">-</p></div></div><div class="chart" id="breakdown-bars"></div></div>
            <div><div class="card-head"><div><h3>Monthly Heat Map</h3><p>Cells show the monthly turnover rate</p></div></div><div id="breakdown-heatmap"></div></div>
          </div>
          <div class="mt-14" id="breakdown-table"></div>
        </article>
        <article class="card mt-14">
          <div class="card-head">
            <div><h3>Cumulative Title Turnover Matrix</h3><p>Shows each title's contribution and its own turnover rate by region or department using separate business rules</p></div>
            <div class="card-actions">
              <select class="select min-w-230" id="title-matrix-mode" aria-label="Title matrix display mode">
                <option value="contribution">Share of Turnover</option>
                <option value="title_rate">Title Turnover Rate</option>
              </select>
              <button class="mini" data-export="title-matrix">CSV</button>
            </div>
          </div>
          <div class="notice info" id="title-matrix-note"></div>
          <div class="mt-12" id="title-matrix-table"></div>
        </article>
      </section>

      <section class="page" data-page="compare">
        <div class="section-head"><div><h2>Turnover Comparison</h2><p>Compare regions, stores, and years month-for-month on the same X-axis</p></div></div>
        <article class="card">
          <div class="control-row">
            <div class="field"><label for="compare-kind">Type</label><select class="select" id="compare-kind" aria-label="Type"><option value="bolge">Region</option><option value="magaza">Store</option></select></div>
            <div class="field"><label for="compare-a">First</label><select class="select" id="compare-a" aria-label="First"></select></div>
            <div class="field"><label for="compare-year-a">Year A</label><select class="select" id="compare-year-a" aria-label="Year A"></select></div>
            <div class="field"><label for="compare-b">Second</label><select class="select" id="compare-b" aria-label="Second"></select></div>
            <div class="field"><label for="compare-year-b">Year B</label><select class="select" id="compare-year-b" aria-label="Year B"></select></div>
            <button class="btn" data-export="comparison">Comparison CSV</button>
          </div>
          <div class="chart" id="comparison-chart"></div>
          <div id="comparison-table"></div>
        </article>
      </section>

      <section class="page" data-page="forecast">
        <div class="section-head"><div><h2>Forecast &amp; Backtest</h2><p>Actual series, forward forecast, forecast-only confidence intervals, and rolling-origin tests</p></div><span class="badge">model scope: all exits</span></div>
        <article class="card">
          <div id="forecast-warning"></div>
          <div class="chart" id="forecast-chart"></div>
          <div class="grid two mt-12">
            <div id="backtest-summary"></div>
            <div id="backtest-quality"></div>
          </div>
          <div class="mt-14" id="annual-backtest-table"></div>
        </article>
      </section>

      <section class="page" data-page="early">
        <div class="section-head"><div><h2>Early Tenure &amp; Service</h2><p>Exit-tenure distribution using 31, 62, and 183-day thresholds</p></div></div>
        <div class="metric-cards" id="early-cards"></div>
        <div class="grid two mt-14">
          <article class="card"><div class="card-head"><div><h3>Exit Tenure Distribution</h3><p>Mutually exclusive service-length bands</p></div></div><div class="chart compact" id="tenure-chart"></div></article>
          <article class="card"><div class="card-head"><div><h3>Early Exits by Year</h3><p>Share of total exits within each year</p></div></div><div id="early-year-table"></div></article>
        </div>
        <div class="formula mt-14"><strong>Thresholds</strong><span>First month: tenure ≤ 31 days. First 2 months: tenure ≤ 62 days. First 6 months: tenure ≤ 183 days. These metrics are nested; a first-month exit is also included in the 2- and 6-month counts. The denominator is total exits in the selected scope.</span></div>
      </section>

      <section class="page" data-page="exits">
        <div class="section-head"><div><h2>Exit Detail</h2><p>Latest exit reason, classification source, and workforce dimensions</p></div><button class="btn" data-export="exits">Filtered Full CSV</button></div>
        <div class="grid two">
          <article class="card"><div class="card-head"><div><h3>Exit Reason Distribution</h3><p>Based on the current Settings classification</p></div></div><div class="chart compact" id="reason-bars"></div></article>
          <article class="card"><div class="card-head"><div><h3>Classification Quality</h3><p>Audit matched and default-classified exits</p></div></div><div id="classification-quality"></div></article>
        </div>
        <article class="card mt-14"><div id="exit-table"></div></article>
      </section>

      <section class="page" data-page="v2">
        <div class="section-head"><div><h2>V2 Analytics &amp; Turnover Risk</h2><p>Regrettable turnover, survival analysis, and the current risk model in one audit surface</p></div><span class="badge">model rules fixed</span></div>
        <div class="notice info">V2 models use their own data preparation and performance thresholds. Changing the global exit type does not retrain historical model results.</div>
        <div class="grid two mt-14">
          <article class="card"><div class="card-head"><div><h3>Regrettable Turnover V2</h3><p>High-performing retail workforce exits</p></div></div><div class="chart compact" id="regrettable-chart"></div><div id="regrettable-table"></div></article>
          <article class="card"><div class="card-head"><div><h3>Survival Analysis V2</h3><p>Probability of remaining as tenure increases</p></div></div><div class="chart compact" id="survival-chart"></div><div id="survival-cards"></div></article>
        </div>
        <div class="grid two mt-14">
          <article class="card"><div class="card-head"><div><h3>High-Risk Regions / Stores</h3><p>Average risk in the latest model output</p></div></div><div id="risk-entities"></div></article>
          <article class="card"><div class="card-head"><div><h3>Workforce Risk Detail</h3><p>Records from the latest retail risk model</p></div></div><div id="risk-people"></div></article>
        </div>
      </section>

      <section class="page" data-page="settings">
        <div class="section-head"><div><h2>Exit Reason Settings</h2><p>Classify each unique source-list reason as Voluntary or Employer Initiated</p></div><span class="badge">stored locally in this browser</span></div>
        <div class="settings-grid">
          <article class="card">
            <div class="table-tools">
              <div class="left"><input class="search" id="reason-search" placeholder="Search exit reasons..."><span class="count" id="reason-count"></span></div>
              <div class="right"><button class="btn" id="apply-reasons">Apply and Save</button><button class="btn" id="export-reasons">Download JSON</button><button class="btn" id="import-reasons">Upload JSON</button><input type="file" id="reason-file" accept=".json,application/json" hidden></div>
            </div>
            <div class="reason-list" id="reason-list" tabindex="0" aria-label="Exit reasons list, scrollable"></div>
          </article>
          <aside class="grid">
            <article class="card">
              <div class="card-head"><div><h3>Business Rule</h3><p>Mathematical effect of classification</p></div></div>
              <div class="formula"><strong>Numerator</strong><span>All Exits uses canonical <code>cikis</code>. Voluntary uses voluntary-classified exits. Employer Initiated uses employer-initiated exits.</span></div>
              <div class="formula mt-9"><strong>Denominator</strong><span>All three views use <code>(Opening Workforce + Closing Workforce) / 2</code>. Classification settings never change the denominator.</span></div>
              <div class="formula mt-9"><strong>Matching</strong><span>The latest source-list exit reason is used for each synthetic employee ID. Unmatched reasons default to Voluntary.</span></div>
            </article>
            <article class="card">
              <div class="card-head"><div><h3>Local Settings Management</h3><p>Static HTML behavior</p></div></div>
              <p class="settings-copy">Changes are stored in this browser's localStorage. Settings do not move automatically with the file; export them with Download JSON and import them on another device.</p>
              <button class="btn danger" id="reset-reasons">Restore Base Mapping</button>
            </article>
          </aside>
        </div>
      </section>
    </main>

    <footer class="footer"><div class="footer-quote">“If you torture data long enough, it will confess to anything.”</div><nav class="footer-links" aria-label="Project links"><a href="/analytics/dashboards/hr-analytics-full-set/">HR Analytics Full Set</a><a href="/analytics/">All Analytics</a><a href="https://github.com/aizanoianalytics/aizanoi-analytics/tree/main/analytics/dashboards/hr-analytics-full-set/workforce-turnover" target="_blank" rel="noopener noreferrer">Source</a><a href="https://github.com/aizanoianalytics/aizanoi-analytics/blob/main/analytics/dashboards/hr-analytics-full-set/workforce-turnover/README.md" target="_blank" rel="noopener noreferrer">Methodology</a></nav></footer>
  </div>
  <div class="tooltip" id="tooltip"></div>
  <script id="turnover-data" type="application/json">__TURNOVER_DATA__</script>
  <script>
  (() => {
    "use strict";
    const DATA = JSON.parse(document.getElementById("turnover-data").textContent);
    const $ = id => document.getElementById(id);
    const ALL = "__ALL__";
    const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const COLORS = {blue:"#4ea5ff",cyan:"#32d6c5",amber:"#ffb84d",orange:"#ff7a45",rose:"#ff5d77",green:"#66d19e",violet:"#a98cff",muted:"#708198"};
    const STORAGE_KEY = "aizanoi_turnover_reason_map_v1";
    const TABLE_STATE = new Map();
    const tooltip = $("tooltip");

    function unpack(block){
      if(!block || !Array.isArray(block.rows)) return [];
      const cols = block.columns || [];
      const dicts = block.dictionaries || {};
      return block.rows.map(row => {
        const out = {};
        cols.forEach((col,index) => {
          const raw = row[index];
          out[col] = Object.prototype.hasOwnProperty.call(dicts,col) ? dicts[col][raw] : raw;
        });
        return out;
      });
    }
    const MONTHLY = unpack(DATA.monthly);
    const EXITS = unpack(DATA.exits);
    const REGRETTABLE_DETAIL = unpack(DATA.regrettable_detail);
    const RISK_PEOPLE = unpack(DATA.risk_people);
    const MONTHS = [...new Set(MONTHLY.map(row => row.donem).filter(Boolean))].sort();
    const DEFAULT_START = MONTHS[Math.max(0,MONTHS.length-24)] || "";
    const DEFAULT_END = MONTHS[MONTHS.length-1] || "";
    const BASE_REASON_MAP = Object.fromEntries((DATA.reasons||[]).map(row => [row.reason_key,row.turnover_turu_base || "Voluntary"]));
    let reasonOverrides = loadReasonOverrides();
    let reasonDraft = {...reasonOverrides};
    let breakdownRows = [];
    let comparisonExportRows = [];
    let trendExportRows = [];
    let titleMatrixExportRows = [];

    const STATE = {
      tab:"overview", scope:"Aizanoi Demo Group", type:"all", start:DEFAULT_START, end:DEFAULT_END,
      region:ALL, store:ALL, department:ALL, city:ALL, gender:ALL, contract:ALL, title:ALL,
      breakdownDimension:"bolge", breakdownMetric:"latest", scopeTrendMode:"monthly", titleMatrixMode:"contribution",
      compareKind:"bolge", compareA:"", compareB:"", compareYearA:"", compareYearB:"",
    };

    function esc(value){
      return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    }
    function n(value){ const x=Number(value); return Number.isFinite(x)?x:0; }
    function fmt(value,digits=0){
      const x=Number(value); return Number.isFinite(x)?x.toLocaleString("en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits}):"-";
    }
    function pct(value,digits=1){
      const x=Number(value); return Number.isFinite(x)?`${(x*100).toLocaleString("en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits})}%`:"-";
    }
    function monthLabel(month,short=false){
      if(!month || !/^\d{4}-\d{2}$/.test(month)) return month || "-";
      const [year,number]=month.split("-").map(Number);
      return short ? `${MONTH_NAMES[number-1].slice(0,3)} ${year}` : `${MONTH_NAMES[number-1]} ${year}`;
    }
    function dateLabel(value){
      if(!value) return "-";
      const date=new Date(`${String(value).slice(0,10)}T00:00:00`);
      return Number.isNaN(date.getTime())?String(value):date.toLocaleDateString("en-US");
    }
    function addMonths(month,delta){
      if(!month) return "";
      const [y,m]=month.split("-").map(Number);
      const d=new Date(y,m-1+delta,1);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    }
    function unique(values){ return [...new Set(values.filter(value => value!==null && value!==undefined && String(value).trim()!==""))].sort((a,b)=>String(a).localeCompare(String(b),"en")); }
    function typeLabel(type=STATE.type){ return type==="voluntary"?"Voluntary Turnover":type==="forced"?"Employer-Initiated Turnover":"All Exits"; }
    function classification(row){ return reasonOverrides[row.reason_key] || BASE_REASON_MAP[row.reason_key] || row.turnover_turu_base || "Voluntary"; }
    function scopeMatch(row,scope=STATE.scope){
      if(scope==="Aizanoi Demo Group") return true;
      if(scope==="Retail") return row.scope==="Retail";
      if(scope==="Retail Part-Time") return row.scope==="Retail" && row.calisma_tipi==="Part Time";
      if(scope==="Retail Full-Time") return row.scope==="Retail" && row.calisma_tipi==="Full Time";
      return row.scope===scope;
    }
    function typeMatch(row,type=STATE.type){
      if(type==="all") return true;
      const current=classification(row);
      return type==="voluntary" ? current==="Voluntary" : current==="Employer Initiated";
    }
    function dimensionsMatch(row,ignore=null){
      if(ignore!=="bolge" && STATE.region!==ALL && row.bolge!==STATE.region) return false;
      if(ignore!=="magaza" && STATE.store!==ALL && row.magaza!==STATE.store) return false;
      if(ignore!=="departman" && STATE.department!==ALL && row.departman!==STATE.department) return false;
      if(ignore!=="il" && STATE.city!==ALL && row.il!==STATE.city) return false;
      if(ignore!=="cinsiyet" && STATE.gender!==ALL && row.cinsiyet!==STATE.gender) return false;
      if(ignore!=="sozlesme_turu" && STATE.contract!==ALL && row.sozlesme_turu!==STATE.contract) return false;
      if(ignore!=="title" && STATE.title!==ALL && row.title!==STATE.title) return false;
      return true;
    }
    function periodMatch(row){
      return (!STATE.start || row.donem>=STATE.start) && (!STATE.end || row.donem<=STATE.end);
    }
    function filteredMonthly(options={}){
      return MONTHLY.filter(row =>
        scopeMatch(row,options.scope||STATE.scope) &&
        (options.ignorePeriod || periodMatch(row)) &&
        (options.ignoreDimensions || dimensionsMatch(row,options.ignoreDimension||null))
      );
    }
    function filteredExits(options={}){
      return EXITS.filter(row =>
        scopeMatch(row,options.scope||STATE.scope) &&
        (options.ignorePeriod || periodMatch(row)) &&
        (options.ignoreDimensions || dimensionsMatch(row,options.ignoreDimension||null)) &&
        (options.ignoreType || typeMatch(row,options.type||STATE.type))
      );
    }
    function aggregateMonthly(rows){
      const map=new Map();
      rows.forEach(row=>{
        const item=map.get(row.donem)||{donem:row.donem,giris:0,cikis:0,donem_basi:0,donem_sonu:0};
        item.giris+=n(row.giris);item.cikis+=n(row.cikis);item.donem_basi+=n(row.donem_basi);item.donem_sonu+=n(row.donem_sonu);
        map.set(row.donem,item);
      });
      return [...map.values()].sort((a,b)=>a.donem.localeCompare(b.donem)).map(item=>{
        item.ortalama_calisan=(item.donem_basi+item.donem_sonu)/2;
        item.turnover=item.ortalama_calisan>0?item.cikis/item.ortalama_calisan:null;
        return item;
      });
    }
    function seriesFor(options={}){
      const scope=options.scope||STATE.scope;
      const rows=aggregateMonthly(filteredMonthly({...options,scope}));
      const selectedType=options.type||STATE.type;
      if(selectedType==="all") return rows;
      const exitMap=new Map();
      filteredExits({...options,scope,type:selectedType}).forEach(row=>exitMap.set(row.donem,(exitMap.get(row.donem)||0)+n(row.cikis)));
      rows.forEach(row=>{
        row.cikis=exitMap.get(row.donem)||0;
        row.turnover=row.ortalama_calisan>0?row.cikis/row.ortalama_calisan:null;
      });
      return rows;
    }
    function cumulative(series){
      if(!series.length) return null;
      const valid=series.filter(row=>n(row.ortalama_calisan)>0);
      const denominator=valid.length?valid.reduce((sum,row)=>sum+n(row.ortalama_calisan),0)/valid.length:0;
      return denominator>0?series.reduce((sum,row)=>sum+n(row.cikis),0)/denominator:null;
    }
    function sum(rows,key){ return rows.reduce((total,row)=>total+n(row[key]),0); }
    function currentPeriodText(){ return `${monthLabel(STATE.start)} – ${monthLabel(STATE.end)}`; }
    function showTooltip(event,html){
      tooltip.innerHTML=html;tooltip.style.display="block";
      const rect=tooltip.getBoundingClientRect();
      let left=event.clientX+14,top=event.clientY+14;
      if(left+rect.width>innerWidth-8) left=event.clientX-rect.width-14;
      if(top+rect.height>innerHeight-8) top=event.clientY-rect.height-14;
      tooltip.style.left=`${Math.max(8,left)}px`;tooltip.style.top=`${Math.max(8,top)}px`;
    }
    function hideTooltip(){ tooltip.style.display="none"; }
    function empty(target,message="No data found for these filters."){
      target.innerHTML=`<div class="empty">${esc(message)}</div>`;
    }
    function download(name,content,type="text/plain;charset=utf-8"){
      const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");
      a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    function csvDownload(name,rows,columns=null){
      if(!rows.length) return;
      const cols=columns||Object.keys(rows[0]);
      const cell=value=>`"${String(value??"").replace(/"/g,'""')}"`;
      const content="\ufeff"+[cols.map(cell).join(";"),...rows.map(row=>cols.map(col=>cell(row[col])).join(";"))].join("\r\n");
      download(name,content,"text/csv;charset=utf-8");
    }
    function fillSelect(element,values,current,allLabel="All"){
      const opts=[`<option value="${ALL}">${esc(allLabel)}</option>`,...values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`)];
      element.innerHTML=opts.join("");
      element.value=values.includes(current)?current:ALL;
      return element.value;
    }
    function selectOptions(element,values,current){
      element.innerHTML=values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join("");
      element.value=values.includes(current)?current:(values[0]||"");
      return element.value;
    }
    function applyDataStyles(root){
      root.querySelectorAll("[data-color]").forEach(node=>node.style.setProperty("--c",node.dataset.color));
      root.querySelectorAll("[data-width]").forEach(node=>node.style.width=node.dataset.width);
      root.querySelectorAll("[data-background]").forEach(node=>node.style.background=node.dataset.background);
      root.querySelectorAll("[data-tone]").forEach(node=>node.style.setProperty("--tone",node.dataset.tone));
      root.querySelectorAll("[data-border-color]").forEach(node=>{node.style.borderTopWidth="3px";node.style.borderTopStyle="solid";node.style.borderTopColor=node.dataset.borderColor;});
    }

    function renderLineChart(target,series,options={}){
      if(!series.length || !series.some(item=>(item.values||[]).some(value=>Number.isFinite(Number(value))))){empty(target);return;}
      const width=Math.max(640,target.clientWidth||860),height=options.height||310;
      const margin={left:52,right:18,top:22,bottom:52};const innerW=width-margin.left-margin.right,innerH=height-margin.top-margin.bottom;
      const labels=options.labels||[];const all=series.flatMap(item=>(item.values||[]).filter(value=>Number.isFinite(Number(value))).map(Number));
      const max=Math.max(...all,options.max||0.01)*1.12;const min=options.min??0;
      const x=index=>margin.left+(labels.length<=1?innerW/2:index*innerW/(labels.length-1));
      const y=value=>margin.top+innerH-(Number(value)-min)/(max-min||1)*innerH;
      let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.aria||"Line chart")}">`;
      for(let i=0;i<=4;i++){const value=min+(max-min)*i/4;const yy=y(value);svg+=`<line class="gridline" x1="${margin.left}" y1="${yy}" x2="${width-margin.right}" y2="${yy}"/><text class="axis" x="${margin.left-8}" y="${yy+3}" text-anchor="end">${options.percent===false?fmt(value,options.digits??0):pct(value,1)}</text>`;}
      const stride=Math.max(1,Math.ceil(labels.length/10));
      labels.forEach((label,index)=>{if(index%stride===0||index===labels.length-1)svg+=`<text class="axis" x="${x(index)}" y="${height-20}" text-anchor="middle">${esc(options.labelFormatter?options.labelFormatter(label):monthLabel(label,true))}</text>`;});
      series.forEach((item,sIndex)=>{
        const points=[];(item.values||[]).forEach((value,index)=>{if(Number.isFinite(Number(value)))points.push([x(index),y(value),value,index]);});
        if(points.length){svg+=`<path d="${points.map((point,i)=>`${i?"L":"M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ")}" fill="none" stroke="${item.color||Object.values(COLORS)[sIndex]}" stroke-width="${item.width||3}" ${item.dash?'stroke-dasharray="7 6"':""} stroke-linecap="round" stroke-linejoin="round"/>`;
          points.forEach(point=>{const label=labels[point[3]];svg+=`<circle cx="${point[0]}" cy="${point[1]}" r="4" fill="${item.color||COLORS.blue}" stroke="#07111f" stroke-width="2" data-tip="${esc(`<b>${item.name}</b><br>${options.labelFormatter?options.labelFormatter(label):monthLabel(label)} · ${options.percent===false?fmt(point[2],options.digits??0):pct(point[2],2)}`)}"/>`;});
        }
      });
      svg+="</svg>";target.innerHTML=svg+`<div class="legend">${series.map(item=>`<span><i class="swatch" data-color="${esc(item.color)}"></i>${esc(item.name)}</span>`).join("")}</div>`;applyDataStyles(target);
      target.querySelectorAll("[data-tip]").forEach(node=>{node.addEventListener("mouseenter",event=>showTooltip(event,node.dataset.tip));node.addEventListener("mousemove",event=>showTooltip(event,node.dataset.tip));node.addEventListener("mouseleave",hideTooltip);});
    }

    function renderForecastChart(target,actual,forecast){
      if(!actual.length){empty(target);return;}
      const actualTail=actual.slice(-18);
      const labels=[...new Set([...actualTail.map(row=>row.donem),...forecast.map(row=>row.donem)])].sort();
      const width=Math.max(720,target.clientWidth||980),height=340,margin={left:54,right:20,top:24,bottom:55};
      const values=[...actualTail.map(row=>row.turnover),...forecast.flatMap(row=>[row.tahmini_turnover_orani,row.alt_guven_araligi,row.ust_guven_araligi])].filter(Number.isFinite);
      const max=Math.max(...values,0.01)*1.13,innerW=width-margin.left-margin.right,innerH=height-margin.top-margin.bottom;
      const x=month=>margin.left+labels.indexOf(month)*innerW/Math.max(1,labels.length-1),y=value=>margin.top+innerH-n(value)/max*innerH;
      let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Turnover forecast and confidence interval">`;
      for(let i=0;i<=4;i++){const val=max*i/4,yy=y(val);svg+=`<line class="gridline" x1="${margin.left}" y1="${yy}" x2="${width-margin.right}" y2="${yy}"/><text class="axis" x="${margin.left-8}" y="${yy+3}" text-anchor="end">${pct(val,1)}</text>`;}
      labels.forEach((label,index)=>{svg+=`<text class="axis" x="${x(label)}" y="${height-20}" text-anchor="middle">${esc(monthLabel(label,true))}</text>`;});
      if(forecast.length>=2){
        const upper=forecast.map(row=>`${x(row.donem)},${y(row.ust_guven_araligi)}`);
        const lower=[...forecast].reverse().map(row=>`${x(row.donem)},${y(row.alt_guven_araligi)}`);
        svg+=`<polygon points="${[...upper,...lower].join(" ")}" fill="rgba(50,214,197,.16)" stroke="rgba(50,214,197,.35)" stroke-width="1"/>`;
      }
      const actualPoints=actualTail.map(row=>[x(row.donem),y(row.turnover),row]);
      svg+=`<path d="${actualPoints.map((point,i)=>`${i?"L":"M"}${point[0]},${point[1]}`).join(" ")}" fill="none" stroke="${COLORS.blue}" stroke-width="3" stroke-linejoin="round"/>`;
      const joined=[];const last=actualTail[actualTail.length-1];if(last)joined.push([x(last.donem),y(last.turnover),{...last,tahmini_turnover_orani:last.turnover}]);
      forecast.forEach(row=>joined.push([x(row.donem),y(row.tahmini_turnover_orani),row]));
      if(joined.length>1)svg+=`<path d="${joined.map((point,i)=>`${i?"L":"M"}${point[0]},${point[1]}`).join(" ")}" fill="none" stroke="${COLORS.cyan}" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/>`;
      actualPoints.forEach(point=>svg+=`<circle cx="${point[0]}" cy="${point[1]}" r="4" fill="${COLORS.blue}" data-tip="${esc(`<b>${monthLabel(point[2].donem)}</b><br>Actual · ${pct(point[2].turnover,2)}`)}"/>`);
      forecast.forEach(row=>svg+=`<circle cx="${x(row.donem)}" cy="${y(row.tahmini_turnover_orani)}" r="4" fill="${COLORS.cyan}" data-tip="${esc(`<b>${monthLabel(row.donem)}</b><br>Forecast · ${pct(row.tahmini_turnover_orani,2)}<br>Confidence · ${pct(row.alt_guven_araligi,2)} – ${pct(row.ust_guven_araligi,2)}`)}"/>`);
      svg+="</svg>";target.innerHTML=svg+`<div class="legend"><span><i class="swatch" data-color="${COLORS.blue}"></i>Actual</span><span><i class="swatch" data-color="${COLORS.cyan}"></i>Forecast</span><span><i class="swatch" data-color="rgba(50,214,197,.35)"></i>Confidence Interval (forecast months only)</span></div>`;applyDataStyles(target);
      target.querySelectorAll("[data-tip]").forEach(node=>{node.addEventListener("mouseenter",event=>showTooltip(event,node.dataset.tip));node.addEventListener("mousemove",event=>showTooltip(event,node.dataset.tip));node.addEventListener("mouseleave",hideTooltip);});
    }

    function renderDonut(target,items){
      const data=items.filter(item=>n(item.value)>0),total=data.reduce((s,item)=>s+n(item.value),0);
      if(!total){empty(target);return;}
      const size=250,cx=125,cy=118,R=86,r=52;let angle=-Math.PI/2;let paths="";
      data.forEach(item=>{const share=item.value/total,a1=angle,a2=angle+share*Math.PI*2,large=share>.5?1:0;
        const p=(rad,radAngle)=>[cx+rad*Math.cos(radAngle),cy+rad*Math.sin(radAngle)];
        const [x1,y1]=p(R,a1),[x2,y2]=p(R,a2),[ix1,iy1]=p(r,a1),[ix2,iy2]=p(r,a2);
        paths+=`<path d="M${ix1},${iy1} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${large} 0 ${ix1},${iy1}Z" fill="${item.color}" stroke="#0b1728" stroke-width="2" data-tip="${esc(`<b>${item.label}</b><br>${fmt(item.value)} · ${pct(share,1)}`)}"/>`;angle=a2;});
      target.innerHTML=`<svg viewBox="0 0 ${size} ${size}">${paths}<text x="${cx}" y="${cy-2}" text-anchor="middle" fill="#f7f2e8" font-size="28" font-weight="900">${fmt(total)}</text><text x="${cx}" y="${cy+18}" text-anchor="middle" fill="#8496ad" font-size="10">exits</text></svg><div class="legend">${data.map(item=>`<span><i class="swatch" data-color="${esc(item.color)}"></i>${esc(item.label)} · ${fmt(item.value)}</span>`).join("")}</div>`;applyDataStyles(target);
      target.querySelectorAll("[data-tip]").forEach(node=>{node.addEventListener("mouseenter",event=>showTooltip(event,node.dataset.tip));node.addEventListener("mousemove",event=>showTooltip(event,node.dataset.tip));node.addEventListener("mouseleave",hideTooltip);});
    }

    function renderFlowChart(target,series){
      if(!series.length){empty(target);return;}
      const width=Math.max(640,target.clientWidth||850),height=255,margin={left:44,right:15,top:16,bottom:48},innerW=width-margin.left-margin.right,innerH=height-margin.top-margin.bottom;
      const max=Math.max(...series.flatMap(row=>[n(row.giris),n(row.cikis)]),1),groupW=innerW/series.length,barW=Math.max(3,Math.min(13,groupW*.26));
      let svg=`<svg viewBox="0 0 ${width} ${height}">`;
      for(let i=0;i<=4;i++){const val=max*i/4,yy=margin.top+innerH-innerH*i/4;svg+=`<line class="gridline" x1="${margin.left}" y1="${yy}" x2="${width-margin.right}" y2="${yy}"/><text class="axis" x="${margin.left-7}" y="${yy+3}" text-anchor="end">${fmt(val,0)}</text>`;}
      const stride=Math.max(1,Math.ceil(series.length/9));
      series.forEach((row,index)=>{const center=margin.left+groupW*(index+.5),gh=n(row.giris)/max*innerH,ch=n(row.cikis)/max*innerH;
        svg+=`<rect x="${center-barW-1}" y="${margin.top+innerH-gh}" width="${barW}" height="${gh}" rx="3" fill="${COLORS.green}" data-tip="${esc(`${monthLabel(row.donem)}<br>Hires · ${fmt(row.giris)}`)}"/><rect x="${center+1}" y="${margin.top+innerH-ch}" width="${barW}" height="${ch}" rx="3" fill="${COLORS.rose}" data-tip="${esc(`${monthLabel(row.donem)}<br>Exits · ${fmt(row.cikis)}`)}"/>`;
        if(index%stride===0||index===series.length-1)svg+=`<text class="axis" x="${center}" y="${height-19}" text-anchor="middle">${esc(monthLabel(row.donem,true))}</text>`;
      });svg+="</svg>";target.innerHTML=svg+`<div class="legend"><span><i class="swatch" data-color="${COLORS.green}"></i>Hires</span><span><i class="swatch" data-color="${COLORS.rose}"></i>Exits</span></div>`;applyDataStyles(target);
      target.querySelectorAll("[data-tip]").forEach(node=>{node.addEventListener("mouseenter",event=>showTooltip(event,node.dataset.tip));node.addEventListener("mousemove",event=>showTooltip(event,node.dataset.tip));node.addEventListener("mouseleave",hideTooltip);});
    }

    function renderBars(target,items,options={}){
      if(!items.length){empty(target);return;}
      const shown=items.slice(0,options.limit||20),max=Math.max(...shown.map(item=>Math.abs(n(item.value))),.0001);
      target.innerHTML=`<div class="hbar-list">${shown.map(item=>`<div class="hbar-row"><div class="hbar-label" title="${esc(item.label)}">${esc(item.label)}</div><div class="track"><div class="fill" data-width="${Math.max(1,Math.abs(n(item.value))/max*100)}%" data-background="${esc(item.color||COLORS.blue)}"></div></div><div class="hbar-value">${options.percent===false?fmt(item.value,options.digits??0):pct(item.value,1)}</div></div>`).join("")}</div>`;applyDataStyles(target);
    }
    function heatColor(value,max){
      const ratio=Math.min(1,Math.max(0,n(value)/(max||1)));
      if(ratio<.34)return `rgba(102,209,158,${.12+ratio*.45})`;
      if(ratio<.68)return `rgba(255,184,77,${.16+ratio*.45})`;
      return `rgba(255,93,119,${.16+ratio*.5})`;
    }

    function simpleTable(target,rows,columns,options={}){
      if(!rows.length){empty(target,options.empty||"No data found for this table.");return;}
      target.innerHTML=`<div class="table-wrap" tabindex="0" aria-label="Data table, scrollable"><table><thead><tr>${columns.map(col=>`<th class="${col.numeric?"num":""}">${esc(col.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row,rowIndex)=>`<tr class="${row.total?"total-row":""}">${columns.map(col=>`<td class="${col.numeric?"num":""}">${col.render?col.render(row[col.key],row,rowIndex):esc(row[col.key]??"-")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;applyDataStyles(target);
    }

    function renderSmartTable(target,rows,columns,options={}){
      const id=options.id||target.id||"table";
      const prior=TABLE_STATE.get(id)||{query:"",sort:options.defaultSort||"",direction:options.defaultDirection||"desc",page:0,limit:options.limit||25};
      TABLE_STATE.set(id,prior);
      const query=prior.query.toLocaleLowerCase("en-US").trim();
      let filtered=query?rows.filter(row=>columns.some(col=>String(row[col.key]??"").toLocaleLowerCase("en-US").includes(query))):[...rows];
      if(prior.sort){filtered.sort((a,b)=>{const av=a[prior.sort],bv=b[prior.sort];const an=Number(av),bn=Number(bv);let result=Number.isFinite(an)&&Number.isFinite(bn)?an-bn:String(av??"").localeCompare(String(bv??""),"tr");return prior.direction==="asc"?result:-result;});}
      const pages=Math.max(1,Math.ceil(filtered.length/prior.limit));prior.page=Math.min(prior.page,pages-1);
      const visible=filtered.slice(prior.page*prior.limit,(prior.page+1)*prior.limit);
      target.innerHTML=`<div class="table-tools"><div class="left"><input class="search" value="${esc(prior.query)}" placeholder="${esc(options.placeholder||"Search table...")}"><span class="count">${fmt(filtered.length)} records</span></div><div class="right"><button class="mini prev" ${prior.page===0?"disabled":""}>Previous</button><span class="count">${prior.page+1}/${pages}</span><button class="mini next" ${prior.page>=pages-1?"disabled":""}>Next</button></div></div><div class="table-wrap" tabindex="0" aria-label="Data table, scrollable"><table><thead><tr>${columns.map(col=>`<th class="${col.numeric?"num":""}"><button class="sort-btn" data-sort="${esc(col.key)}">${esc(col.label)} ${prior.sort===col.key?(prior.direction==="asc"?"↑":"↓"):""}</button></th>`).join("")}</tr></thead><tbody>${visible.map((row,rowIndex)=>`<tr>${columns.map(col=>`<td class="${col.numeric?"num":""}">${col.render?col.render(row[col.key],row,rowIndex):esc(row[col.key]??"-")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;applyDataStyles(target);
      const input=target.querySelector(".search");let timer;
      input?.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>{prior.query=input.value;prior.page=0;renderSmartTable(target,rows,columns,options);},180);});
      target.querySelectorAll("[data-sort]").forEach(button=>button.addEventListener("click",()=>{const key=button.dataset.sort;if(prior.sort===key)prior.direction=prior.direction==="asc"?"desc":"asc";else{prior.sort=key;prior.direction="asc";}prior.page=0;renderSmartTable(target,rows,columns,options);}));
      target.querySelector(".prev")?.addEventListener("click",()=>{prior.page--;renderSmartTable(target,rows,columns,options);});
      target.querySelector(".next")?.addEventListener("click",()=>{prior.page++;renderSmartTable(target,rows,columns,options);});
      return filtered;
    }

    function updateDimensionFilters(){
      const base=MONTHLY.filter(row=>scopeMatch(row)&&periodMatch(row));
        const isStore=STATE.scope==="Aizanoi Demo Group"||STATE.scope.startsWith("Retail");
      const definitions=[
        ["region","bolge","region-filter","All Regions"],
        ["store","magaza","store-filter","All Stores"],
        ["department","departman","department-filter","All Departments"],
        ["city","il","city-filter","All Cities"],
        ["gender","cinsiyet","gender-filter","All Genders"],
        ["contract","sozlesme_turu","contract-filter","All Contract Types"],
        ["title","title","title-filter","All Titles"],
      ];
      definitions.forEach(([stateKey,field,id,label])=>{
        let candidates=base.filter(row=>dimensionsMatch(row,field));
        if(field==="bolge"||field==="magaza")candidates=candidates.filter(row=>row.scope==="Retail");
        const values=unique(candidates.map(row=>row[field]).filter(value=>value&&value!=="Belirsiz"));
        STATE[stateKey]=fillSelect($(id),values,STATE[stateKey],label);
      });
      $("region-filter").disabled=!isStore;
      $("store-filter").disabled=!isStore;
      renderChips();
    }
    function renderChips(){
      const pairs=[["Scope",STATE.scope],["Type",typeLabel()],["Period",currentPeriodText()]];
      if(STATE.region!==ALL)pairs.push(["Region",STATE.region]);if(STATE.store!==ALL)pairs.push(["Store",STATE.store]);
      if(STATE.department!==ALL)pairs.push(["Department",STATE.department]);if(STATE.city!==ALL)pairs.push(["City",STATE.city]);
      if(STATE.gender!==ALL)pairs.push(["Gender",STATE.gender]);if(STATE.contract!==ALL)pairs.push(["Contract",STATE.contract]);
      if(STATE.title!==ALL)pairs.push(["Title",STATE.title]);
      $("active-chips").innerHTML=pairs.map(([key,value])=>`<span class="chip">${esc(key)} · ${esc(value)}</span>`).join("");
    }

    function renderOverview(){
      const series=seriesFor(),latest=series[series.length-1],allExits=filteredExits({ignoreType:true}),selectedExits=filteredExits();
      const voluntary=allExits.filter(row=>classification(row)==="Voluntary"),forced=allExits.filter(row=>classification(row)==="Employer Initiated");
      const matched=allExits.filter(row=>String(row.reason_match_status||"").toLocaleLowerCase("en-US").startsWith("source list")).length;
      const last12=series.slice(-12),cum=cumulative(last12);
      const prior=series.length>1?series[series.length-2]:null,delta=latest&&prior&&Number.isFinite(latest.turnover)&&Number.isFinite(prior.turnover)?latest.turnover-prior.turnover:null;
      $("overview-subtitle").textContent=`${STATE.scope} · ${typeLabel()} · ${currentPeriodText()}`;
      const kpis=[
        ["Latest Month Turnover",latest?pct(latest.turnover,1):"-",latest?monthLabel(latest.donem):"-","rgba(78,165,255,.15)"],
        ["Vs Previous Month",delta===null?"-":`${delta>=0?"+":""}${pct(delta,1)}`,prior?monthLabel(prior.donem):"-","rgba(255,184,77,.14)"],
        ["Latest Month Exits",latest?fmt(latest.cikis):"-",typeLabel(),"rgba(255,93,119,.14)"],
        ["Last 12 Months Turnover",pct(cum,1),`${last12.length}-month cumulative rate`,"rgba(169,140,255,.14)"],
        ["Voluntary Share",pct(sum(voluntary,"cikis")/Math.max(1,sum(allExits,"cikis")),1),`${fmt(sum(voluntary,"cikis"))} exits`,"rgba(50,214,197,.13)"],
        ["Employer-Initiated Share",pct(sum(forced,"cikis")/Math.max(1,sum(allExits,"cikis")),1),`${fmt(sum(forced,"cikis"))} exits`,"rgba(255,122,69,.13)"],
      ];
      $("overview-kpis").innerHTML=kpis.map(item=>`<div class="kpi" data-tone="${esc(item[3])}"><div class="label">${esc(item[0])}</div><div class="value">${esc(item[1])}</div><div class="sub">${esc(item[2])}</div></div>`).join("");applyDataStyles($("overview-kpis"));
      trendExportRows=series.map(row=>({Period:monthLabel(row.donem),Hires:row.giris,Exits:row.cikis,"Opening Workforce":row.donem_basi,"Closing Workforce":row.donem_sonu,"Average Workforce":row.ortalama_calisan,Turnover:row.turnover}));
      renderLineChart($("trend-chart"),[{name:typeLabel(),values:series.map(row=>row.turnover),color:COLORS.blue}],{labels:series.map(row=>row.donem),percent:true});
      renderDonut($("composition-chart"),[{label:"Voluntary",value:sum(voluntary,"cikis"),color:COLORS.cyan},{label:"Employer Initiated",value:sum(forced,"cikis"),color:COLORS.rose}]);
      const matchedWeight=allExits.filter(row=>String(row.reason_match_status||"").toLocaleLowerCase("en-US").startsWith("source list")).reduce((total,row)=>total+n(row.cikis),0);
      $("match-badge").textContent=allExits.length?`${pct(matchedWeight/Math.max(1,sum(allExits,"cikis")),1)} reason match`:"No reason records";
      renderFlowChart($("flow-chart"),series.slice(-18));
      const scopes=DATA.meta.scopes||[];const rows=scopes.map(scope=>{const scoped=seriesFor({scope}),row=scoped[scoped.length-1];return {scope,month:row?.donem,turnover:row?.turnover,cikis:row?.cikis,avg:row?.ortalama_calisan};}).filter(row=>row.month);
      simpleTable($("scope-comparison"),rows,[{key:"scope",label:"Scope"},{key:"month",label:"Period",render:value=>esc(monthLabel(value))},{key:"cikis",label:"Exits",numeric:true,render:value=>fmt(value)},{key:"avg",label:"Avg. Workforce",numeric:true,render:value=>fmt(value,1)},{key:"turnover",label:"Turnover",numeric:true,render:value=>pct(value,1)}]);
      renderScopeTrend();
    }

    function yearToDateSeries(rows){
      let activeYear="",window=[];
      return rows.map(row=>{
        const year=String(row.donem||"").slice(0,4);
        if(year!==activeYear){activeYear=year;window=[];}
        window.push(row);
        return {...row,turnover:cumulative(window)};
      });
    }
    function renderScopeTrend(){
      const labels=MONTHS.filter(month=>(!STATE.start||month>=STATE.start)&&(!STATE.end||month<=STATE.end));
      const palette=[COLORS.blue,COLORS.cyan,COLORS.amber,COLORS.rose,COLORS.green,COLORS.violet];
      const series=(DATA.meta.scopes||[]).map((scope,index)=>{
        const raw=seriesFor({scope}),rows=STATE.scopeTrendMode==="ytd"?yearToDateSeries(raw):raw,map=new Map(rows.map(row=>[row.donem,row.turnover]));
        return {name:scope,values:labels.map(month=>map.get(month)),color:palette[index%palette.length],width:scope===STATE.scope?4:2.4};
      });
      renderLineChart($("scope-trend-chart"),series,{labels,percent:true,height:340,aria:"Turnover comparison across primary scopes"});
    }

    function entitySeries(dimension,entity,baseRows){
      return aggregateMonthly(baseRows.filter(row=>row[dimension]===entity));
    }
    function entityMetric(series,metric){
      if(!series.length)return null;
      if(metric==="latest")return series[series.length-1].turnover;
      if(metric==="period")return cumulative(series);
      if(metric==="last12")return cumulative(series.slice(-12));
      if(metric==="exits")return sum(series,"cikis");
      return null;
    }
    function renderBreakdown(){
      const dim=STATE.breakdownDimension,metric=STATE.breakdownMetric,base=filteredMonthly({ignoreDimension:dim});
      const entities=unique(base.map(row=>row[dim]).filter(value=>value&&value!=="Belirsiz"));
      const rows=entities.map(entity=>{let series=entitySeries(dim,entity,base);
        if(STATE.type!=="all"){const exits=filteredExits({ignoreDimension:dim}).filter(row=>row[dim]===entity);const map=new Map();exits.forEach(row=>map.set(row.donem,(map.get(row.donem)||0)+n(row.cikis)));series.forEach(row=>{row.cikis=map.get(row.donem)||0;row.turnover=row.ortalama_calisan>0?row.cikis/row.ortalama_calisan:null;});}
        const latest=series[series.length-1];return {entity,value:entityMetric(series,metric),series,latest_month:latest?.donem,cikis:sum(series,"cikis"),avg:series.length?series.reduce((s,r)=>s+n(r.ortalama_calisan),0)/series.length:0};
      }).filter(row=>Number.isFinite(Number(row.value))).sort((a,b)=>n(b.value)-n(a.value));
      breakdownRows=rows.map(row=>({[dim]:row.entity,Metric:row.value,Exits:row.cikis,"Average Workforce":row.avg}));
      $("breakdown-note").textContent=`${rows.length} ${$("breakdown-dimension").selectedOptions[0]?.textContent||"breakdowns"} · ${typeLabel()}`;
      renderBars($("breakdown-bars"),rows.map(row=>({label:row.entity,value:row.value})),{limit:24,percent:metric!=="exits"});
      const heatRows=rows.slice(0,30),months=MONTHS.filter(month=>month>=STATE.start&&month<=STATE.end).slice(-12);
      const allVals=heatRows.flatMap(row=>row.series.filter(item=>months.includes(item.donem)).map(item=>n(item.turnover))),max=Math.max(...allVals,.01);
      const htmlRows=heatRows.map(row=>{const map=new Map(row.series.map(item=>[item.donem,item.turnover]));return `<tr><td>${esc(row.entity)}</td>${months.map(month=>{const value=map.get(month);return `<td class="num heat" data-background="${heatColor(value,max)}">${Number.isFinite(Number(value))?pct(value,1):"-"}</td>`;}).join("")}</tr>`;}).join("");
      $("breakdown-heatmap").innerHTML=heatRows.length?`<div class="table-wrap" tabindex="0" aria-label="Data table, scrollable"><table><thead><tr><th>${esc($("breakdown-dimension").selectedOptions[0]?.textContent||"Breakdown")}</th>${months.map(month=>`<th class="num">${esc(monthLabel(month,true))}</th>`).join("")}</tr></thead><tbody>${htmlRows}</tbody></table></div>`:`<div class="empty">No data found for the heat map.</div>`;applyDataStyles($("breakdown-heatmap"));
      simpleTable($("breakdown-table"),rows,[{key:"entity",label:"Breakdown"},{key:"latest_month",label:"Latest Period",render:value=>esc(monthLabel(value))},{key:"cikis",label:"Selected Period Exits",numeric:true,render:value=>fmt(value)},{key:"avg",label:"Avg. Workforce",numeric:true,render:value=>fmt(value,1)},{key:"value",label:"Selected Metric",numeric:true,render:value=>metric==="exits"?fmt(value):pct(value,1)}]);
      renderTitleMatrix();
    }

    function renderTitleMatrix(){
      const storeMode=STATE.scope==="Aizanoi Demo Group"||STATE.scope.startsWith("Retail");
      const matrixScope=storeMode?(STATE.scope==="Aizanoi Demo Group"?"Retail":STATE.scope):STATE.scope;
      const groupField=storeMode?"bolge":"departman",groupLabel=storeMode?"Region":"Department";
      const base=filteredMonthly({scope:matrixScope,ignoreDimension:"title"});
      const exitBase=filteredExits({scope:matrixScope,ignoreDimension:"title"});
      const preferred=[
        "Store Manager","Assistant Store Manager","Sales Advisor",
        "Part-Time Sales Advisor","Cashier","Store Support",
      ];
      const order=new Map(preferred.map((value,index)=>[value,index]));
      const titles=unique(base.map(row=>row.title).filter(Boolean)).sort((a,b)=>{
        const ai=order.has(a)?order.get(a):999,bi=order.has(b)?order.get(b):999;
        if(a==="Belirsiz")return 1;if(b==="Belirsiz")return -1;
        return ai-bi||String(a).localeCompare(String(b),"en");
      });
      const groups=unique(base.map(row=>row[groupField]).filter(value=>value&&value!=="Belirsiz"));
      const groupMonth=new Map(),titleMonth=new Map(),groupExits=new Map(),titleExits=new Map(),sep="\u0001";
      base.forEach(row=>{
        const group=row[groupField],title=row.title;if(!group||group==="Belirsiz")return;
        const groupKey=`${group}${sep}${row.donem}`,titleKey=`${group}${sep}${title}${sep}${row.donem}`;
        const g=groupMonth.get(groupKey)||{group,donem:row.donem,donem_basi:0,donem_sonu:0,cikis:0,giris:0};
        g.donem_basi+=n(row.donem_basi);g.donem_sonu+=n(row.donem_sonu);g.cikis+=n(row.cikis);g.giris+=n(row.giris);groupMonth.set(groupKey,g);
        const t=titleMonth.get(titleKey)||{group,title,donem:row.donem,donem_basi:0,donem_sonu:0,cikis:0,giris:0};
        t.donem_basi+=n(row.donem_basi);t.donem_sonu+=n(row.donem_sonu);t.cikis+=n(row.cikis);t.giris+=n(row.giris);titleMonth.set(titleKey,t);
      });
      exitBase.forEach(row=>{
        const group=row[groupField],title=row.title;if(!group||group==="Belirsiz")return;
        groupExits.set(group,(groupExits.get(group)||0)+n(row.cikis));
        const key=`${group}${sep}${title}`;titleExits.set(key,(titleExits.get(key)||0)+n(row.cikis));
      });
      const denominator=items=>{
        const values=items.map(item=>(n(item.donem_basi)+n(item.donem_sonu))/2).filter(value=>value>0);
        return values.length?values.reduce((total,value)=>total+value,0)/values.length:0;
      };
      const groupBuckets=new Map(),titleBuckets=new Map();
      groupMonth.forEach(item=>{const bucket=groupBuckets.get(item.group)||[];bucket.push(item);groupBuckets.set(item.group,bucket);});
      titleMonth.forEach(item=>{const key=`${item.group}${sep}${item.title}`,bucket=titleBuckets.get(key)||[];bucket.push(item);titleBuckets.set(key,bucket);});
      const rows=groups.map(group=>{
        const groupRows=groupBuckets.get(group)||[];
        const commonDenominator=denominator(groupRows),row={group};
        titles.forEach(title=>{
          const titleRows=titleBuckets.get(`${group}${sep}${title}`)||[];
          const ownDenominator=denominator(titleRows),exits=titleExits.get(`${group}${sep}${title}`)||0;
          row[title]=STATE.titleMatrixMode==="title_rate"?(ownDenominator>0?exits/ownDenominator:null):(commonDenominator>0?exits/commonDenominator:null);
        });
        row.total=commonDenominator>0?(groupExits.get(group)||0)/commonDenominator:null;
        return row;
      }).sort((a,b)=>n(b.total)-n(a.total));
      const max=Math.max(...rows.flatMap(row=>titles.concat("total").map(key=>n(row[key]))),.001);
      const heat=value=>Number.isFinite(Number(value))?`<span class="heat heat-value" data-background="${heatColor(value,max)}">${pct(value,1)}</span>`:"-";
      const titleLabel=title=>title==="Unknown"?"Other / Unknown":title;
      const columns=[{key:"group",label:groupLabel},...titles.map(title=>({key:title,label:titleLabel(title),numeric:true,render:heat})),{key:"total",label:"Total Turnover",numeric:true,render:heat}];
      titleMatrixExportRows=rows.map(row=>Object.fromEntries([[groupLabel,row.group],...titles.map(title=>[titleLabel(title),row[title]]),["Total Turnover",row.total]]));
      $("title-matrix-note").textContent=STATE.titleMatrixMode==="title_rate"
        ?"Title Turnover Rate = title exits / the title's average workforce over the selected months. Each title uses its own denominator."
        :"Share of Turnover = title exits / the shared average workforce of the relevant region or department. Title columns show their contribution to total turnover.";
      simpleTable($("title-matrix-table"),rows,columns,{empty:"No data found for the title turnover matrix."});
    }

    function compareEntityRows(kind,entity,year){
      const start=`${year}-01`,end=`${year}-12`;
      const cube=MONTHLY.filter(row=>row.scope==="Retail"&&row[kind]===entity&&row.donem>=start&&row.donem<=end&&scopeMatch(row)&&dimensionsMatch(row,kind));
      const series=aggregateMonthly(cube),type=STATE.type;
      if(type!=="all"){const exits=EXITS.filter(row=>row.scope==="Retail"&&row[kind]===entity&&row.donem>=start&&row.donem<=end&&scopeMatch(row)&&dimensionsMatch(row,kind)&&typeMatch(row));const map=new Map();exits.forEach(row=>map.set(row.donem,(map.get(row.donem)||0)+n(row.cikis)));series.forEach(row=>{row.cikis=map.get(row.donem)||0;row.turnover=row.ortalama_calisan>0?row.cikis/row.ortalama_calisan:null;});}
      return series;
    }
    function renderComparison(){
      const kind=STATE.compareKind,aRows=compareEntityRows(kind,STATE.compareA,STATE.compareYearA),bRows=compareEntityRows(kind,STATE.compareB,STATE.compareYearB);
      const byMonth=(rows,month)=>rows.find(row=>Number(row.donem.slice(5,7))===month);
      const labels=MONTH_NAMES;renderLineChart($("comparison-chart"),[
        {name:`${STATE.compareA} ${STATE.compareYearA}`,values:labels.map((_,i)=>byMonth(aRows,i+1)?.turnover),color:COLORS.blue},
        {name:`${STATE.compareB} ${STATE.compareYearB}`,values:labels.map((_,i)=>byMonth(bRows,i+1)?.turnover),color:COLORS.rose}
      ],{labels,labelFormatter:value=>value,percent:true,height:330});
      const metricRows=[
        {metric:`${STATE.compareA} ${STATE.compareYearA} Turnover`,get:(a,b)=>a?.turnover,format:pct},
        {metric:`${STATE.compareB} ${STATE.compareYearB} Turnover`,get:(a,b)=>b?.turnover,format:pct},
        {metric:"Difference",get:(a,b)=>Number.isFinite(a?.turnover)&&Number.isFinite(b?.turnover)?a.turnover-b.turnover:null,format:pct},
        {metric:`${STATE.compareA} Exits`,get:a=>a?.cikis,format:fmt},
        {metric:`${STATE.compareB} Exits`,get:(a,b)=>b?.cikis,format:fmt},
        {metric:`${STATE.compareA} Opening Workforce`,get:a=>a?.donem_basi,format:fmt},
        {metric:`${STATE.compareA} Closing Workforce`,get:a=>a?.donem_sonu,format:fmt},
        {metric:`${STATE.compareB} Opening Workforce`,get:(a,b)=>b?.donem_basi,format:fmt},
        {metric:`${STATE.compareB} Closing Workforce`,get:(a,b)=>b?.donem_sonu,format:fmt},
      ].map(def=>{const row={Metric:def.metric};labels.forEach((label,i)=>{const a=byMonth(aRows,i+1),b=byMonth(bRows,i+1);row[label]=def.format(def.get(a,b),def.format===pct?1:0);});return row;});
      comparisonExportRows=metricRows;
      simpleTable($("comparison-table"),metricRows,[{key:"Metric",label:"Metric"},...labels.map(label=>({key:label,label,numeric:true}))]);
    }

    function normalizedScope(value){
      const text=String(value||"").toLocaleLowerCase("en-US");
      if(text.includes("group"))return "Aizanoi Demo Group";if(text.includes("part"))return "Retail Part-Time";if(text.includes("full"))return "Retail Full-Time";
      if(text.includes("retail"))return "Retail";if(text.includes("head"))return "Head Office";if(text.includes("operations"))return "Operations";return value;
    }
    function renderForecast(){
      if(STATE.type!=="all"){
        $("forecast-warning").innerHTML=`<div class="notice">Forecast models were trained on all exits. Plotting them under a voluntary or employer-initiated selection would misrepresent model scope. Select “All Exits” to view the forecast.</div>`;
        empty($("forecast-chart"),"No separate forecast model exists for the selected turnover type.");$("backtest-summary").innerHTML="";$("backtest-quality").innerHTML="";$("annual-backtest-table").innerHTML="";return;
      }
      $("forecast-warning").innerHTML="";
      const scope=STATE.scope,actual=seriesFor({scope,type:"all",ignorePeriod:true,ignoreDimensions:true});
      const forecast=(DATA.forecasts||[]).filter(row=>normalizedScope(row.ust_bolum_adi)===scope).sort((a,b)=>String(a.donem).localeCompare(String(b.donem)));
      const hasLocalFilter=[STATE.region,STATE.store,STATE.department,STATE.title].some(value=>value!==ALL);
      if(hasLocalFilter)$("forecast-warning").innerHTML=`<div class="notice info">The forecast was produced only for the <b>${esc(scope)}</b> scope. Region, store, department, and title filters do not apply to the forecast series.</div>`;
      renderForecastChart($("forecast-chart"),actual,forecast);
      const summary=(DATA.backtest_summary||[]).find(row=>normalizedScope(row.scope)===scope);
      if(summary){const cards=[["MAE",pct(summary.mae,2),"Mean absolute error"],["RMSE",pct(summary.rmse,2),"Penalizes larger errors more heavily"],["MAPE",`${fmt(summary.mape,1)}%`,"Percentage error"],["Band Coverage",`${fmt(summary.band_coverage_pct,1)}%`,"Share of actuals within the confidence band"]];
        $("backtest-summary").innerHTML=`<div class="metric-cards two-cols">${cards.map(card=>`<div class="metric-card"><div class="small">${card[0]}</div><div class="big">${card[1]}</div><div class="small">${card[2]}</div></div>`).join("")}</div>`;
        $("backtest-quality").innerHTML=`<div class="notice info"><b>Model:</b> ${esc(summary.model_versiyonu||"-")}<br><b>Training / test:</b> ${fmt(summary.n_train)} / ${fmt(summary.n_test)} months<br><b>Interpretation:</b> Error metrics come from historical rolling-origin tests and do not guarantee future performance.</div>`;
      }else{empty($("backtest-summary"),"No backtest summary is available for this scope.");$("backtest-quality").innerHTML="";}
      const annual=(DATA.annual_backtest||[]).filter(row=>normalizedScope(row.scope)===scope).sort((a,b)=>String(b.hedef_donem).localeCompare(String(a.hedef_donem)));
      renderSmartTable($("annual-backtest-table"),annual,[{key:"hedef_donem",label:"Target Period",render:value=>monthLabel(value)},{key:"durum",label:"Status"},{key:"gerceklesen",label:"Actual",numeric:true,render:value=>pct(value,2)},{key:"tahmin",label:"Forecast",numeric:true,render:value=>pct(value,2)},{key:"abs_hata",label:"Absolute Error",numeric:true,render:value=>pct(value,2)},{key:"ape_pct",label:"APE",numeric:true,render:value=>Number.isFinite(Number(value))?`${fmt(value,1)}%`:"-"},{key:"guven_bandi_icinde",label:"Band",render:value=>value?'<span class="status good">Inside</span>':'<span class="status bad">Outside</span>'}],{id:"annual-backtest",limit:15,defaultSort:"hedef_donem"});
    }

    function tenureDays(row){
      const direct=Number(row.kidem_gun);if(Number.isFinite(direct))return direct;
      const start=new Date(row.ise_giris_tarihi),end=new Date(row.cikis_tarihi);return Number.isNaN(start.getTime())||Number.isNaN(end.getTime())?null:Math.max(0,(end-start)/86400000);
    }
    function earlyMetrics(rows){
      const weightedTotal=sum(rows,"cikis");
      const countAt=maxDay=>rows.filter(row=>Number.isFinite(tenureDays(row))&&tenureDays(row)<=maxDay).reduce((s,row)=>s+n(row.cikis),0);
      return {total:weightedTotal,m1:countAt(31),m2:countAt(62),m6:countAt(183)};
    }
    function renderEarly(){
      const rows=filteredExits(),metrics=earlyMetrics(rows);
      const cards=[["First Month",metrics.m1,31,COLORS.rose],["First 2 Months",metrics.m2,62,COLORS.orange],["First 6 Months",metrics.m6,183,COLORS.amber]];
      $("early-cards").innerHTML=cards.map(([label,value,days,color])=>`<div class="metric-card" data-border-color="${color}"><div class="small">${label} · ≤ ${days} days</div><div class="big">${fmt(value)} <span class="metric-inline">· ${pct(value/Math.max(1,metrics.total),1)}</span></div><div class="small">Share of ${fmt(metrics.total)} total exits in the selected period</div></div>`).join("");applyDataStyles($("early-cards"));
      const buckets=[["Under 10 Days",0,9],["10 Days - 2 Months",10,62],["2-6 Months",63,183],["6 Months - 1 Year",184,365],["1-2 Years",366,730],["2+ Years",731,Infinity]];
      const bucketRows=buckets.map(([label,min,max])=>({label,value:rows.filter(row=>{const day=tenureDays(row);return Number.isFinite(day)&&day>=min&&day<=max;}).reduce((s,row)=>s+n(row.cikis),0)}));
      renderBars($("tenure-chart"),bucketRows,{limit:10,percent:false});
      const years=unique(rows.map(row=>String(row.donem||"").slice(0,4))).sort().reverse();
      const yearRows=years.map(year=>{const m=earlyMetrics(rows.filter(row=>String(row.donem).startsWith(year)));return {year,total:m.total,m1:m.m1,m1r:m.m1/Math.max(1,m.total),m2:m.m2,m2r:m.m2/Math.max(1,m.total),m6:m.m6,m6r:m.m6/Math.max(1,m.total)};});
      simpleTable($("early-year-table"),yearRows,[{key:"year",label:"Year"},{key:"total",label:"Total Exits",numeric:true,render:value=>fmt(value)},{key:"m1",label:"First Month",numeric:true,render:(value,row)=>`${fmt(value)} · ${pct(row.m1r,1)}`},{key:"m2",label:"First 2 Months",numeric:true,render:(value,row)=>`${fmt(value)} · ${pct(row.m2r,1)}`},{key:"m6",label:"First 6 Months",numeric:true,render:(value,row)=>`${fmt(value)} · ${pct(row.m6r,1)}`}]);
    }

    function renderExits(){
      const rows=filteredExits(),reasonMap=new Map();rows.forEach(row=>reasonMap.set(row.ayrilma_sebebi,(reasonMap.get(row.ayrilma_sebebi)||0)+n(row.cikis)));
      const reasons=[...reasonMap].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
      renderBars($("reason-bars"),reasons,{limit:16,percent:false});
      const matched=rows.filter(row=>String(row.reason_match_status||"").toLocaleLowerCase("en-US").startsWith("source list")).reduce((s,row)=>s+n(row.cikis),0),total=sum(rows,"cikis"),defaults=total-matched;
      $("classification-quality").innerHTML=`<div class="metric-cards two-cols"><div class="metric-card"><div class="small">Latest Reason Matched</div><div class="big">${fmt(matched)}</div><div class="small">${pct(matched/Math.max(1,total),1)} · source list</div></div><div class="metric-card"><div class="small">Default Voluntary</div><div class="big">${fmt(defaults)}</div><div class="small">${pct(defaults/Math.max(1,total),1)} · unmatched records</div></div></div><div class="notice info mt-10">Changes in Settings update classification immediately. Default Voluntary usage remains explicitly visible.</div>`;
      const display=rows.map(row=>({...row,turnover_turu:classification(row)}));
      renderSmartTable($("exit-table"),display,[{key:"donem",label:"Period",render:value=>monthLabel(value)},{key:"sicil_no",label:"Synthetic ID"},{key:"adi_soyadi",label:"Synthetic Profile"},{key:"scope",label:"Scope"},{key:"bolge",label:"Region"},{key:"magaza",label:"Store"},{key:"il",label:"City"},{key:"departman",label:"Department"},{key:"cinsiyet",label:"Gender"},{key:"sozlesme_turu",label:"Contract Type"},{key:"title",label:"Title"},{key:"calisma_tipi",label:"Work Type"},{key:"ise_giris_tarihi",label:"Start Date",render:value=>dateLabel(value)},{key:"cikis_tarihi",label:"Exit Date",render:value=>dateLabel(value)},{key:"kidem_yil",label:"Tenure Years",numeric:true,render:value=>fmt(value,2)},{key:"ayrilma_sebebi_grubu",label:"Reason Group"},{key:"ayrilma_sebebi",label:"Exit Reason"},{key:"turnover_turu",label:"Type",render:value=>`<span class="status ${value==="Employer Initiated"?"bad":"good"}">${esc(value)}</span>`},{key:"reason_match_status",label:"Matching"}],{id:"exit-detail",limit:30,placeholder:"Search synthetic ID, profile, store, city, reason, or title...",defaultSort:"donem"});
    }

    function renderV2(){
      const scope=STATE.scope,reg=(DATA.regrettable||[]).filter(row=>normalizedScope(row.scope)==="Retail"&&(!STATE.start||row.donem>=STATE.start)&&(!STATE.end||row.donem<=STATE.end)).sort((a,b)=>String(a.donem).localeCompare(String(b.donem)));
      renderLineChart($("regrettable-chart"),[{name:"Regrettable Turnover",values:reg.map(row=>row.regrettable_turnover_rate),color:COLORS.violet},{name:"High-Performer Attrition",values:reg.map(row=>row.high_perf_attrition_rate),color:COLORS.rose}],{labels:reg.map(row=>row.donem),percent:true,height:245});
      simpleTable($("regrettable-table"),reg.slice(-12).reverse(),[{key:"donem",label:"Period",render:value=>monthLabel(value)},{key:"toplam_cikis",label:"Total Exits",numeric:true,render:value=>fmt(value)},{key:"regrettable_cikis",label:"Regrettable",numeric:true,render:value=>fmt(value)},{key:"regrettable_turnover_rate",label:"Rate",numeric:true,render:value=>pct(value,2)},{key:"regrettable_share_of_exits",label:"Share of Exits",numeric:true,render:value=>pct(value,1)}]);
      const survivalScope=["Aizanoi Demo Group","Retail","Head Office","Operations"].includes(scope)?scope:"Retail";
      const curve=(DATA.survival_curve||[]).filter(row=>normalizedScope(row.scope)===survivalScope).sort((a,b)=>n(a.tenure_month)-n(b.tenure_month)).filter(row=>n(row.tenure_month)<=120);
      renderLineChart($("survival-chart"),[{name:`${survivalScope} Retention Probability`,values:curve.map(row=>row.survival_probability),color:COLORS.cyan}],{labels:curve.map(row=>row.tenure_month),labelFormatter:value=>`${fmt(value)} mo`,percent:true,height:245});
      const summary=(DATA.survival_summary||[]).find(row=>normalizedScope(row.scope)===survivalScope);
      $("survival-cards").innerHTML=summary?`<div class="metric-cards three-cols">${[[6,summary.survival_6m],[12,summary.survival_12m],[24,summary.survival_24m]].map(([month,value])=>`<div class="metric-card"><div class="small">Month ${month}</div><div class="big">${pct(value,1)}</div><div class="small">probability of remaining</div></div>`).join("")}</div>`:"";
      const entities=[...(DATA.risk_regions||[]).map(row=>({type:"Region",name:row.departman_adi,score:row.ortalama_risk_skoru,count:row.personel_sayisi})),...(DATA.risk_stores||[]).map(row=>({type:"Store",name:row.isletme_adi,score:row.ortalama_risk_skoru,count:row.personel_sayisi}))].sort((a,b)=>n(b.score)-n(a.score));
      renderBars($("risk-entities"),entities.map(row=>({label:`${row.type} · ${row.name}`,value:row.score})),{limit:18,percent:false,digits:1});
      renderSmartTable($("risk-people"),RISK_PEOPLE,[{key:"sicil_no",label:"Synthetic ID"},{key:"adi_soyadi",label:"Synthetic Profile"},{key:"departman_adi",label:"Region"},{key:"isletme_adi",label:"Store"},{key:"gorev",label:"Role"},{key:"risk_puani",label:"Risk",numeric:true,render:value=>fmt(value,1)},{key:"risk_seviyesi",label:"Level"},{key:"risk_aciklama",label:"Explanation"}],{id:"risk-people",limit:18,defaultSort:"risk_puani"});
    }

    function loadReasonOverrides(){
      try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");return Object.fromEntries(Object.entries(raw).filter(([,value])=>value==="Voluntary"||value==="Employer Initiated"));}catch{return {};}
    }
    function renderSettings(){
      const query=$("reason-search").value.toLocaleLowerCase("en-US").trim();
      const reasons=(DATA.reasons||[]).filter(row=>!query||String(row.ayrilma_sebebi||"").toLocaleLowerCase("en-US").includes(query));
      $("reason-count").textContent=`${reasons.length} / ${(DATA.reasons||[]).length} reasons`;
      $("reason-list").innerHTML=`<div class="reason-row header"><span>Exit Reason</span><span>Group</span><span>Records</span><span>Class</span></div>${reasons.map(row=>{const current=reasonDraft[row.reason_key]||BASE_REASON_MAP[row.reason_key]||"Voluntary";return `<div class="reason-row"><span>${esc(row.ayrilma_sebebi)}</span><span>${esc(row.ayrilma_sebebi_grubu||"-")}</span><span class="num">${fmt(row.kayit_sayisi)}</span><select class="select reason-select" data-key="${esc(row.reason_key)}"><option value="Voluntary" ${current==="Voluntary"?"selected":""}>Voluntary</option><option value="Employer Initiated" ${current==="Employer Initiated"?"selected":""}>Employer Initiated</option></select></div>`;}).join("")}`;
      $("reason-list").querySelectorAll(".reason-select").forEach(select=>select.addEventListener("change",()=>{reasonDraft[select.dataset.key]=select.value;}));
    }

    function renderActive(){
      updateDimensionFilters();
      if(STATE.tab==="overview")renderOverview();
      else if(STATE.tab==="breakdown")renderBreakdown();
      else if(STATE.tab==="compare")renderComparison();
      else if(STATE.tab==="forecast")renderForecast();
      else if(STATE.tab==="early")renderEarly();
      else if(STATE.tab==="exits")renderExits();
      else if(STATE.tab==="v2")renderV2();
      else if(STATE.tab==="settings")renderSettings();
    }

    function initComparison(){
      const kind=STATE.compareKind,base=MONTHLY.filter(row=>row.scope==="Retail"&&scopeMatch(row));
      const entities=unique(base.map(row=>row[kind]).filter(value=>value&&value!=="Belirsiz"));
      const years=unique(base.map(row=>String(row.donem).slice(0,4))).sort().reverse();
      STATE.compareA=selectOptions($("compare-a"),entities,STATE.compareA);
      STATE.compareB=selectOptions($("compare-b"),entities,STATE.compareB&&STATE.compareB!==STATE.compareA?STATE.compareB:(entities[1]||entities[0]));
      STATE.compareYearA=selectOptions($("compare-year-a"),years,STATE.compareYearA||years[1]||years[0]);
      STATE.compareYearB=selectOptions($("compare-year-b"),years,STATE.compareYearB||years[0]);
    }
    function setPeriod(count){
      STATE.end=DEFAULT_END;
      STATE.start=count==="all"?(MONTHS[0]||""):MONTHS[Math.max(0,MONTHS.length-Number(count))]||"";
      $("start-filter").value=STATE.start;$("end-filter").value=STATE.end;renderActive();
    }
    function bind(){
      $("tabs").addEventListener("click",event=>{const button=event.target.closest("[data-tab]");if(!button)return;STATE.tab=button.dataset.tab;document.querySelectorAll(".tab").forEach(node=>node.classList.toggle("active",node===button));document.querySelectorAll(".page").forEach(node=>node.classList.toggle("active",node.dataset.page===STATE.tab));renderActive();});
      [["scope-filter","scope"],["type-filter","type"],["start-filter","start"],["end-filter","end"],["region-filter","region"],["store-filter","store"],["department-filter","department"],["city-filter","city"],["gender-filter","gender"],["contract-filter","contract"],["title-filter","title"]].forEach(([id,key])=>$(id).addEventListener("change",()=>{STATE[key]=$(id).value;if(key==="scope"){STATE.region=STATE.store=STATE.department=STATE.city=STATE.gender=STATE.contract=STATE.title=ALL;initComparison();}if(key==="region")STATE.store=ALL;if(key==="start"&&STATE.start>STATE.end){STATE.end=STATE.start;$("end-filter").value=STATE.end;}if(key==="end"&&STATE.end<STATE.start){STATE.start=STATE.end;$("start-filter").value=STATE.start;}renderActive();}));
      $("reset-filters").addEventListener("click",()=>{Object.assign(STATE,{scope:"Aizanoi Demo Group",type:"all",start:DEFAULT_START,end:DEFAULT_END,region:ALL,store:ALL,department:ALL,city:ALL,gender:ALL,contract:ALL,title:ALL});initFilterControls();initComparison();renderActive();});
      document.querySelectorAll("[data-period]").forEach(button=>button.addEventListener("click",()=>setPeriod(button.dataset.period)));
      $("scope-trend-mode").addEventListener("change",()=>{STATE.scopeTrendMode=$("scope-trend-mode").value;renderScopeTrend();});
      $("breakdown-dimension").addEventListener("change",()=>{STATE.breakdownDimension=$("breakdown-dimension").value;renderBreakdown();});
      $("breakdown-metric").addEventListener("change",()=>{STATE.breakdownMetric=$("breakdown-metric").value;renderBreakdown();});
      $("title-matrix-mode").addEventListener("change",()=>{STATE.titleMatrixMode=$("title-matrix-mode").value;renderTitleMatrix();});
      $("compare-kind").addEventListener("change",()=>{STATE.compareKind=$("compare-kind").value;STATE.compareA=STATE.compareB="";initComparison();renderComparison();});
      [["compare-a","compareA"],["compare-b","compareB"],["compare-year-a","compareYearA"],["compare-year-b","compareYearB"]].forEach(([id,key])=>$(id).addEventListener("change",()=>{STATE[key]=$(id).value;renderComparison();}));
      document.addEventListener("click",event=>{const button=event.target.closest("[data-export]");if(!button)return;const kind=button.dataset.export;if(kind==="trend")csvDownload("turnover_trendi.csv",trendExportRows);if(kind==="breakdown")csvDownload("turnover_kirilim.csv",breakdownRows);if(kind==="title-matrix")csvDownload("kumule_title_turnover.csv",titleMatrixExportRows);if(kind==="comparison")csvDownload("turnover_kiyaslama.csv",comparisonExportRows);if(kind==="exits")csvDownload("turnover_cikis_detayi.csv",filteredExits().map(row=>({...row,turnover_turu:classification(row)})));});
      $("reason-search").addEventListener("input",renderSettings);
      $("apply-reasons").addEventListener("click",()=>{reasonOverrides={...reasonDraft};localStorage.setItem(STORAGE_KEY,JSON.stringify(reasonOverrides));renderActive();alert("Exit-reason classifications were saved in this browser.");});
      $("reset-reasons").addEventListener("click",()=>{if(!confirm("Delete local classifications and restore the base mapping?"))return;localStorage.removeItem(STORAGE_KEY);reasonOverrides={};reasonDraft={};renderSettings();});
      $("export-reasons").addEventListener("click",()=>download("turnover_reason_settings.json",JSON.stringify({schema:1,exported_at:new Date().toISOString(),mapping:{...BASE_REASON_MAP,...reasonOverrides}},null,2),"application/json;charset=utf-8"));
      $("import-reasons").addEventListener("click",()=>$("reason-file").click());
      $("reason-file").addEventListener("change",async()=>{const file=$("reason-file").files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());const mapping=parsed.mapping||parsed;reasonDraft=Object.fromEntries(Object.entries(mapping).filter(([,value])=>value==="Voluntary"||value==="Employer Initiated"));renderSettings();}catch{alert("Select a valid settings JSON file.");}$("reason-file").value="";});
      let resizeTimer;window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderActive,180);});
    }
    function initFilterControls(){
      selectOptions($("scope-filter"),DATA.meta.scopes||[],STATE.scope);
      $("type-filter").value=STATE.type;
      $("scope-trend-mode").value=STATE.scopeTrendMode;
      $("title-matrix-mode").value=STATE.titleMatrixMode;
      selectOptions($("start-filter"),MONTHS,STATE.start);
      selectOptions($("end-filter"),MONTHS,STATE.end);
      updateDimensionFilters();
    }
    function init(){
      $("meta-period").textContent=DATA.meta.min_month&&DATA.meta.latest_month?`${monthLabel(DATA.meta.min_month)} – ${monthLabel(DATA.meta.latest_month)}`:"-";
      $("meta-generated").textContent=new Date(DATA.meta.generated_at).toLocaleString("en-US");
      initFilterControls();initComparison();bind();renderActive();
      window.__TURNOVER_READY__=true;
      window.__TURNOVER_AUDIT__={monthlyRows:MONTHLY.length,exitRows:EXITS.length,reasonCount:(DATA.reasons||[]).length,formula:DATA.meta.formula};
    }
    init();
  })();
  </script>
</body>
</html>
"""
