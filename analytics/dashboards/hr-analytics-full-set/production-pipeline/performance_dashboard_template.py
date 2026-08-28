"""Performans dashboard HTML şablonu."""

HTML_TEMPLATE = r"""<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Performans Dashboard</title>
  <style>
    :root {
      --ink:#102033; --muted:#667185; --paper:#f4f5f0; --card:#fff; --line:#d9ddd5;
      --blue:#175fb8; --teal:#0d837a; --orange:#df6f32; --green:#18845f; --red:#c84545;
      --shadow:0 17px 50px rgba(20,36,50,.10); --radius:21px;
    }
    *{box-sizing:border-box} body{margin:0;background:linear-gradient(115deg,rgba(23,95,184,.06),transparent 34%),radial-gradient(circle at 92% 2%,rgba(13,131,122,.12),transparent 28%),var(--paper);color:var(--ink);font-family:"Aptos","Segoe UI",sans-serif}
    button,input,select{font:inherit}.shell{width:min(1680px,calc(100% - 30px));margin:auto;padding:18px 0 48px}
    .hero{display:grid;grid-template-columns:1fr auto;gap:18px;padding:27px;border-radius:30px;background:#102033;color:white;box-shadow:var(--shadow);overflow:hidden;position:relative}
    .hero:after{content:"";position:absolute;width:420px;height:420px;right:-130px;top:-220px;border:70px solid rgba(155,197,61,.16);border-radius:50%}
    .eyebrow{color:#b9dc69;text-transform:uppercase;letter-spacing:.18em;font:800 11px/1 "Bahnschrift",sans-serif}
    .hero h1{font:800 clamp(35px,5vw,70px)/.95 "Bahnschrift",sans-serif;margin:10px 0;letter-spacing:-.05em}
    .hero p{margin:0;color:#cbd5df;max-width:830px;line-height:1.5}
    .hero-meta{position:relative;z-index:2;display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:8px;align-self:end}
    .hero-meta span{padding:11px;border:1px solid rgba(255,255,255,.18);border-radius:14px;background:rgba(255,255,255,.07);font-size:12px;font-weight:800}
    .tabs{position:sticky;top:0;z-index:30;display:flex;gap:7px;overflow:auto;margin:14px 0;padding:8px;border:1px solid var(--line);border-radius:17px;background:rgba(244,245,240,.94);backdrop-filter:blur(12px)}
    .tab{border:0;background:transparent;color:var(--muted);padding:10px 14px;border-radius:11px;font-weight:850;white-space:nowrap;cursor:pointer}.tab.active{background:var(--ink);color:white}
    .view{display:none}.view.active{display:block}.card,.kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
    .card{padding:18px;margin-bottom:14px;min-width:0}.card h2{font:800 20px/1.15 "Bahnschrift",sans-serif;margin:0}.card-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:13px}
    .hint{font-size:12px;color:var(--muted);line-height:1.45}.source-badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;background:#eef4ff;color:#1e40af;font-size:11px;font-weight:850}
    .kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px}.kpi{padding:15px}.kpi .label{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:900}.kpi .value{font:800 28px/1 "Bahnschrift",sans-serif;margin-top:9px}.kpi .sub{font-size:11px;color:var(--muted);margin-top:7px}
    .filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:13px;padding:11px;background:#fff;border:1px solid var(--line);border-radius:17px}.sticky-filters{position:sticky;top:62px;z-index:25;box-shadow:0 12px 28px rgba(16,32,51,.10)}.btn,.control{border-radius:11px;padding:9px 12px}.control{border:1px solid var(--line);background:white;color:var(--ink);min-width:175px}.btn{border:0;background:var(--ink);color:white;font-weight:850;cursor:pointer}.btn.secondary{background:#e8efe9;color:#166f58;border:1px solid #c2d8cb}.btn.danger{background:#9f1239}
    .multi{position:relative}.multi>summary{list-style:none;cursor:pointer;border:1px solid var(--line);border-radius:11px;padding:9px 12px;background:white;min-width:205px;font-size:12px;font-weight:800}.multi>summary::-webkit-details-marker{display:none}.multi-box{position:absolute;z-index:60;top:calc(100% + 6px);left:0;width:min(380px,calc(100vw - 28px));max-height:390px;overflow:auto;padding:9px;border:1px solid var(--line);border-radius:14px;background:#fff;box-shadow:var(--shadow)}.multi-search{width:100%;border:1px solid var(--line);border-radius:10px;padding:8px;margin-bottom:7px}.multi-actions{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px}.multi-count{font-size:11px;color:var(--muted);font-weight:850;margin-bottom:5px}.multi-box label{display:flex;gap:8px;padding:6px;border-radius:8px;font-size:12px}.multi-box label:hover{background:#eff5f1}
    .grid{display:grid;gap:14px}.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
    .chart{height:330px;min-width:0}.chart svg{width:100%;height:100%;overflow:visible}.bars{display:grid;gap:8px}.bar{display:grid;grid-template-columns:minmax(130px,210px) 1fr minmax(90px,auto);gap:9px;align-items:center;font-size:12px}.track{height:13px;background:#e8ebe5;border-radius:99px;overflow:hidden}.fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--blue),var(--teal))}.sample{font-size:10px;color:var(--muted);margin-left:5px}.sample.low{color:#9f1239;font-weight:900}
    .table-tools{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:0 0 9px}.table-shell{min-width:0}.table-scroll-top{overflow-x:auto;overflow-y:hidden;height:16px;margin-bottom:4px;border:1px solid var(--line);border-radius:10px;background:#fbfcf8}.table-scroll-spacer{height:1px}.table-wrap{overflow:auto;max-height:670px;border:1px solid var(--line);border-radius:15px;background:white}.table-wrap table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0}.table-wrap th,.table-wrap td{padding:8px 9px;border-bottom:1px solid #e8ebe5;white-space:nowrap;font-size:11px}.table-wrap th{position:sticky;top:0;z-index:5;background:#e8ece5;text-align:left;font-size:10px;letter-spacing:.03em}.table-wrap thead tr.filter-row th{top:31px;background:#f5f7f1;z-index:4;padding:5px 7px}.table-wrap th:first-child,.table-wrap td:first-child{position:sticky;left:0;z-index:2;background:#fff}.table-wrap th:first-child{z-index:7;background:#e8ece5}.table-wrap thead tr.filter-row th:first-child{z-index:6;background:#f5f7f1}.table-wrap tbody tr:nth-child(even) td{background:#f8f9f5}.table-wrap tbody tr:nth-child(even) td:first-child{background:#f8f9f5}.table-wrap tbody tr:hover td{background:#edf5ee}.table-wrap tbody tr:hover td:first-child{background:#edf5ee}.table-filter-btn{border:1px solid #d7dccf;background:white;border-radius:8px;padding:5px 8px;cursor:pointer;font-size:10px;font-weight:900;min-width:88px;text-align:left;color:var(--ink)}.table-filter-btn.active{background:#102033;color:white;border-color:#102033}.excel-filter-panel{position:fixed;z-index:5000;width:min(360px,calc(100vw - 18px));max-height:min(560px,calc(100vh - 24px));display:grid;grid-template-rows:auto auto auto 1fr auto;gap:8px;padding:11px;border:1px solid var(--line);border-radius:16px;background:#fff;box-shadow:0 24px 70px rgba(16,32,51,.22)}.excel-filter-panel h4{margin:0;font:900 13px/1.2 "Bahnschrift",sans-serif}.excel-filter-panel input[type="search"]{width:100%;border:1px solid var(--line);border-radius:11px;padding:9px}.excel-filter-actions,.excel-filter-footer{display:flex;gap:7px;flex-wrap:wrap}.excel-filter-list{overflow:auto;border:1px solid #e1e5dc;border-radius:12px;padding:6px;background:#fbfcf8;min-height:130px}.excel-filter-list label{display:flex;gap:8px;align-items:center;padding:6px;border-radius:9px;font-size:12px}.excel-filter-list label:hover{background:#eef5ee}.excel-filter-count{font-size:11px;color:var(--muted);font-weight:800}.num{text-align:right!important;font-variant-numeric:tabular-nums}
    .pool-layout{display:grid;grid-template-columns:minmax(320px,.75fr) minmax(0,1.25fr);gap:14px}.pool-results{max-height:470px;overflow:auto}.person-row{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px;border-bottom:1px solid var(--line)}.person-row small{display:block;color:var(--muted);margin-top:3px}.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:99px;background:#e5f0ed;color:#11685f;font-size:11px;font-weight:850}.chip button{border:0;background:none;color:#b23a3a;cursor:pointer}.empty{padding:27px;text-align:center;color:var(--muted)}.pill{padding:4px 7px;border-radius:99px;font-weight:900;font-size:10px}.good{background:#ddf2e7;color:#186344}.watch{background:#fff0c7;color:#845a00}.risk{background:#fae0dc;color:#9e3333}
    .subtabs{display:flex;gap:8px;margin-bottom:14px}.subtab{border:1px solid var(--line);background:#fff;color:var(--muted);border-radius:999px;padding:8px 13px;font-weight:850;cursor:pointer}.subtab.active{background:var(--ink);color:white}.bonus-layout{display:grid;grid-template-columns:minmax(340px,.75fr) minmax(0,1.25fr);gap:14px}.bonus-panel{background:linear-gradient(145deg,#ffffff,#f1f6f2);border:1px solid #d7e4d8}.bonus-panel label{display:grid;gap:6px;font-size:12px;font-weight:900;color:var(--muted)}.bonus-panel .control{width:100%;min-width:0}.percent-field{display:grid;gap:7px;padding:11px;border:1px solid #dbe5d9;border-radius:16px;background:#fff}.percent-input{display:grid;grid-template-columns:1fr auto;align-items:center;border:1px solid #cfd8cc;border-radius:14px;background:#fff;overflow:hidden}.percent-input input{border:0!important;box-shadow:none!important;font:900 34px/1 "Bahnschrift",sans-serif;padding:11px 12px;color:var(--ink);background:transparent}.percent-input span{padding:0 13px;font:900 26px/1 "Bahnschrift",sans-serif;color:#0b5d50}.field-help{font-size:11px;line-height:1.35;color:var(--muted)}.bonus-presets{display:flex;gap:7px;flex-wrap:wrap}.bonus-presets button{border:1px solid #cbd9cc;background:#eef6ee;color:#0b5d50;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:900;cursor:pointer}.bonus-presets button:hover{background:#dceee1}.bonus-effective{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:9px;padding:9px 11px;border-radius:14px;background:#102033;color:#fff;font-size:12px}.bonus-effective b{font-size:18px}.formula-help{margin-top:12px;border:1px solid #cfd8cc;border-radius:15px;padding:10px;background:#fbfcf8}.formula-help summary{display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-weight:900;color:#0b5d50}.formula-help summary::marker{content:''}.bonus-result{display:grid;place-items:center;min-height:190px;border-radius:24px;background:radial-gradient(circle at 24% 18%,rgba(255,255,255,.26),transparent 28%),linear-gradient(135deg,#0b2a62,#147a4b);color:white;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}.bonus-result strong{font:900 clamp(48px,8vw,86px)/.9 "Bahnschrift",sans-serif}.scenario-form{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;padding:11px;border:1px dashed #c9d7cb;border-radius:15px;background:#f9fbf7}.scenario-form input,.scenario-form select{min-width:145px}.editable-table input{width:92px;border:1px solid var(--line);border-radius:8px;padding:6px 7px;text-align:right}.editable-table th,.editable-table td{font-size:11px}
    .target-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.target-choice{border:1px solid var(--line);background:#fff;color:var(--muted);border-radius:999px;padding:9px 14px;font-weight:900;cursor:pointer}.target-choice.active{background:#0b2a62;color:#fff;border-color:#0b2a62}.target-choice:disabled{opacity:.38;cursor:not-allowed}.target-status-strip{height:14px;display:flex;overflow:hidden;border-radius:999px;background:#e7ebf0;margin:14px 0}.target-status-strip span{min-width:0}.target-status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.target-status-item{border:1px solid var(--line);border-radius:12px;padding:11px;display:flex;align-items:center;justify-content:space-between;gap:8px}.target-status-item i{width:10px;height:10px;border-radius:50%}.target-focus{display:grid;gap:8px}.target-focus-row{border:1px solid var(--line);border-left:5px solid var(--red);border-radius:12px;padding:11px;background:#fbfcfd}.target-focus-row div{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:900}.target-focus-row small{display:block;color:var(--muted);margin-top:5px}.target-score{display:grid;grid-template-columns:1fr 40px;align-items:center;gap:7px;min-width:140px}.target-score-track{height:9px;border-radius:999px;background:#e5eaf0;overflow:hidden}.target-score-fill{height:100%;border-radius:inherit}.target-method{padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:#f8fafc}.target-method summary{font-weight:900;cursor:pointer}.target-method p{font-size:11px;line-height:1.55;color:var(--muted);margin:9px 0 0}
    .target-settings{margin-bottom:14px}.target-settings-tools{display:grid;grid-template-columns:minmax(220px,1fr) auto auto auto;gap:8px;margin-bottom:10px}.target-settings-list{display:grid;gap:7px;max-height:440px;overflow:auto}.target-setting-row{display:grid;grid-template-columns:auto minmax(200px,1fr) minmax(190px,.65fr);align-items:center;gap:10px;padding:10px 11px;border:1px solid var(--line);border-radius:11px;background:#fff}.target-setting-row input{width:18px;height:18px;accent-color:#0b2a62}.target-setting-row b{display:block;font-size:12px}.target-setting-row small{display:block;color:var(--muted);font-size:10px;margin-top:3px}.target-setting-rule{text-align:right;color:#31526f;font-size:10px;font-weight:900}.target-projection{display:grid;gap:4px;min-width:150px}.target-projection>b{font-size:11px}.target-projection small,.target-score-note{font-size:9px;font-weight:800}.target-projection small{color:var(--muted)}.target-score-note{display:block;color:var(--muted);margin-top:3px}
    @media(max-width:1100px){.grid.two,.grid.three,.pool-layout,.bonus-layout,.hero{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media(max-width:650px){.shell{width:min(100% - 12px,1680px);padding-top:6px}.hero{padding:19px;border-radius:22px}.kpis{grid-template-columns:1fr 1fr}.card{padding:13px}.control,.multi>summary{width:100%;min-width:0}.filters>*{flex:1 1 44%}.hero-meta{grid-template-columns:1fr}.bar{grid-template-columns:100px 1fr 70px}}
  </style>
</head>
<body>
<main class="shell">
  <header class="hero">
    <div>
      <div class="eyebrow">İnsan · Süreç · Sonuç</div>
      <h1>Performans Dashboard</h1>
      <p>İşe alım süresi, kanonik turnover, erken çıkış, iç terfi, zorunlu eğitim, kişi havuzu ve örnek prim simülasyonunu aynı kontrol düzleminde birleştirir.</p>
    </div>
    <div class="hero-meta" id="heroMeta"></div>
  </header>

  <nav class="tabs" aria-label="Performans bölümleri">
    <button class="tab active" data-view="hiring">İşe Alma Süresi</button>
    <button class="tab" data-view="turnover">Turnover</button>
    <button class="tab" data-view="promotion">Terfi Akışları</button>
    <button class="tab" data-view="mandatory">Zorunlu Eğitim</button>
    <button class="tab" data-view="pool">Kişi Havuzu</button>
    <button class="tab" data-view="bonus">Örnek Prim Hesaplama</button>
    <button class="tab" data-view="targets">Şirket Hedefleri</button>
  </nav>

  <section class="view active" id="view-hiring">
    <div class="filters sticky-filters">
      <details class="multi" id="hireScope"></details>
      <details class="multi" id="hireDept"></details>
      <details class="multi" id="hireTitle"></details>
      <select class="control" id="hireYear"></select>
      <select class="control" id="hireMonth"></select>
      <button class="btn secondary" id="hireReset">Filtreleri Temizle</button>
    </div>
    <div class="kpis" id="hireKpis"></div>
    <div class="grid two">
      <article class="card"><div class="card-head"><div><h2>Aylık Pozisyon Kapatma Süresi</h2><span class="source-badge" id="hireMeta"></span></div></div><div class="chart" id="hireChart"></div></article>
      <article class="card"><h2>Departman Karşılaştırması</h2><div class="bars" id="hireDeptBars" style="margin-top:14px"></div></article>
    </div>
    <article class="card"><div class="card-head"><h2>İşe Alım Kalitesi</h2></div><div id="hiringQualityTable"></div></article>
    <article class="card"><div class="card-head"><h2>İşe Alım Kayıtları</h2></div><div id="hireTable"></div></article>
  </section>

  <section class="view" id="view-turnover">
    <div class="filters">
      <details class="multi" id="turnScope"></details>
      <details class="multi" id="turnDept"></details>
      <details class="multi" id="turnTitle"></details>
      <details class="multi" id="turnYears"></details>
      <details class="multi" id="turnMonths"></details>
      <button class="btn secondary" id="turnReset">Filtreleri Temizle</button>
    </div>
    <div class="kpis" id="turnKpis"></div>
    <article class="card"><div class="card-head"><div><h2>Aylık Turnover</h2><div class="hint">Formül: Çıkış / ((Dönem Başı + Dönem Sonu) / 2)</div><span class="source-badge" id="turnMeta"></span></div></div><div class="chart" id="turnChart"></div></article>
    <div class="grid two">
      <article class="card"><h2>Erken Dönem Turnover</h2><div class="bars" id="earlyBars" style="margin-top:14px"></div></article>
      <article class="card"><h2>Erken Çıkış Detayı</h2><div id="earlyTable"></div></article>
    </div>
    <div class="grid two">
      <article class="card"><h2>Aylık Detay</h2><div id="turnTable"></div></article>
      <article class="card"><h2>Kümüle Özet</h2><div id="turnSummaryTable"></div></article>
    </div>
  </section>

  <section class="view" id="view-promotion">
    <div class="filters">
      <select class="control" id="promotionScope"><option>Mağaza</option><option>Merkez</option></select>
      <select class="control" id="promotionYear"></select>
      <button class="btn" id="applyPromotion">Uygula</button>
    </div>
    <div class="kpis" id="promotionKpis"></div>
    <article class="card"><h2>İç Terfi / Dış Aday Akışı</h2><div class="chart" id="promotionSankey"></div></article>
    <article class="card"><h2>Terfi Akış Tablosu</h2><div id="promotionFlowTable"></div></article>
    <article class="card"><h2>Terfi Kişi Detayı</h2><div class="hint" style="margin-bottom:10px">Seçili yıl ve kapsam içindeki terfi/dış aday hareketlerinin kişi ve özlük detayları.</div><div id="promotionPersonTable"></div></article>
  </section>

  <section class="view" id="view-mandatory">
    <div class="filters">
      <details class="multi" id="mandScope"></details><details class="multi" id="mandDept"></details><details class="multi" id="mandStore"></details><details class="multi" id="mandTitle"></details><details class="multi" id="mandEvent"></details><details class="multi" id="mandStatus"></details>
      <input class="control" id="mandStart" type="date" title="Atanma başlangıç">
      <input class="control" id="mandEnd" type="date" title="Atanma bitiş">
      <input class="control" id="mandSearch" placeholder="Sicil / ad soyad ara (Enter veya Filtrele)">
      <button class="btn" id="applyMandatory">Filtrele</button>
    </div>
    <div class="kpis" id="mandKpis"></div>
    <div class="grid two">
      <article class="card"><h2>Etkinlik Tamamlama</h2><span class="source-badge" id="mandMeta"></span><div class="bars" id="mandEventBars" style="margin-top:14px"></div></article>
      <article class="card"><h2>Departman Tamamlama</h2><div class="bars" id="mandDeptBars" style="margin-top:14px"></div></article>
    </div>
    <article class="card"><h2>Zorunlu Eğitim Detayı</h2><div id="mandatoryTable"></div></article>
  </section>

  <section class="view" id="view-pool">
    <div class="pool-layout">
      <article class="card">
        <h2>Çalışan Havuzu Oluştur</h2>
        <div class="filters" style="padding:0;border:0"><input class="control" id="poolSearch" placeholder="TC, sicil, ad soyad, görev ara"><details class="multi" id="poolScope"></details><details class="multi" id="poolDept"></details></div>
        <div class="pool-results" id="poolResults"></div>
      </article>
      <article class="card">
        <div class="card-head"><h2>Seçilen Çalışanlar</h2><button class="btn secondary" id="clearPool">Havuzu Temizle</button></div>
        <div class="chips" id="poolChips"></div>
        <div id="poolPeopleTable" style="margin-top:12px"></div>
        <div class="filters" style="margin-top:14px"><select class="control" id="poolStart"></select><select class="control" id="poolEnd"></select><button class="btn" id="runPool">Turnover Hesapla</button><button class="btn secondary" id="exportPool">Sonucu CSV</button></div>
        <div class="kpis" id="poolKpis"></div><div class="chart" id="poolChart"></div><div id="poolTable"></div>
      </article>
    </div>
  </section>

  <section class="view" id="view-bonus">
    <div class="subtabs"><button class="subtab active" data-bonus-tab="calc">Hesaplama Paneli</button><button class="subtab" data-bonus-tab="settings">Ayarlar Paneli</button></div>
    <div id="bonusCalc">
      <div class="bonus-layout">
        <article class="card bonus-panel">
          <h2>Yeni Prim Modeli Hesaplama Dinamiği</h2>
          <div class="filters" style="display:grid">
            <div class="percent-field">
              <label for="bonusTarget">Şirket Hedef Gerçekleştirme Oranı</label>
              <div class="percent-input"><input id="bonusTarget" type="text" inputmode="decimal" value="100" aria-describedby="bonusTargetHelp"><span>%</span></div>
              <div id="bonusTargetHelp" class="field-help">Yüzde puanı yazın: 80 = %80, 100 = %100. 0,8 yazarsanız %0,8 kabul edilir.</div>
              <div class="bonus-presets"><button type="button" data-bonus-target="80">%80</button><button type="button" data-bonus-target="90">%90</button><button type="button" data-bonus-target="100">%100</button><button type="button" data-bonus-target="110">%110</button><button type="button" data-bonus-target="120">%120</button></div>
              <div class="bonus-effective"><span>Hesapta kullanılan oran</span><b id="bonusEffectiveTarget">%100</b></div>
            </div>
            <label>Unvan<select class="control" id="bonusTitle"></select></label>
            <label>Bireysel Harf Sonuç<select class="control" id="bonusGrade"></select></label>
          </div>
          <div class="hint" id="bonusTargetNote" style="margin-top:10px"></div>
          <details class="formula-help">
            <summary>&#9432; Form&uuml;l Bilgisi</summary>
            <div class="hint">80% altındaki şirket gerçekleşmelerinde katsayı 0 kabul edilir. 120% üzerindeki değerler 120% gibi işlenir. 80-100-120 noktaları arasında doğrusal interpolasyon yapılır; sonuç daha sonra harf notu çarpanı ve unvan bazlı maaş katsayısı ile çarpılır. Özel senaryo yalnızca aynı unvan, harf ve hedef oranında standart sonucun yerine geçer. Nihai katsayı Direktör için 6, Müdür için 3, Uzman ve altı için 2 üst sınırını aşamaz.</div>
          </details>
        </article>
        <article class="card">
          <h2>Prim Ödeme Kat Sayısı</h2>
          <div class="bonus-result"><strong id="bonusResult">—</strong></div>
          <div id="bonusWhatIf" style="margin-top:14px"></div>
        </article>
      </div>
    </div>
    <div id="bonusSettings" style="display:none">
      <article class="card"><div class="card-head"><div><h2>Prim Ayarları</h2><div class="hint">Ara değerler 80 / 100 / 120 hedef noktaları arasında doğrusal interpolasyonla hesaplanır. Ayarlar bu tarayıcıda saklanır.</div></div><div><button class="btn secondary" id="bonusSave">Kaydet</button> <button class="btn danger" id="bonusReset">Varsayılan</button></div></div><div id="bonusSettingsTable"></div></article>
    </div>
  </section>

  <section class="view" id="view-targets">
    <div class="target-toolbar" id="targetScopeTabs"></div>
    <div class="filters">
      <div class="target-toolbar" id="targetPeriodTabs" style="margin:0"></div>
      <input class="control" id="targetSearch" type="search" placeholder="Gösterge ara..." autocomplete="off">
      <select class="control" id="targetStatus">
        <option value="">Tüm durumlar</option>
        <option>Maksimum</option>
        <option>Hedef ve Üzeri</option>
        <option>Eşik-Hedef Arası</option>
        <option>Eşik Altı</option>
        <option>Veri Yok</option>
      </select>
      <button class="btn secondary" id="targetReset" type="button">Filtreleri Temizle</button>
      <button class="btn secondary" id="targetSettingsToggle" type="button">KPI Ayarları</button>
    </div>
    <article class="card target-settings" id="targetSettingsPanel" hidden>
      <div class="card-head"><div><h2>KPI Toplama ve Orantılama Ayarları</h2><div class="hint">İşaretli KPI'lar toplanır, dönem hedefleri orantılanır ve yıl sonuna projekte edilir. Ayarlar tarayıcıda saklanır.</div></div><button class="btn" id="targetSettingsSave" type="button">Kaydet ve Uygula</button></div>
      <div class="target-settings-tools">
        <input class="control" id="targetSettingsSearch" type="search" placeholder="KPI veya kapsam ara..." autocomplete="off">
        <button class="btn secondary" id="targetSettingsAll" type="button">Tümünü İşaretle</button>
        <button class="btn secondary" id="targetSettingsNone" type="button">Tümünü Kaldır</button>
        <button class="btn secondary" id="targetSettingsDefault" type="button">Varsayılan</button>
      </div>
      <div class="target-settings-list" id="targetSettingsList"></div>
    </article>
    <div class="kpis" id="targetKpis"></div>
    <article class="card">
      <div class="card-head"><div><h2>KPI Durum Dağılımı</h2><div class="hint" id="targetDistributionHint"></div></div></div>
      <div id="targetDistribution"></div>
    </article>
    <article class="card">
      <div class="card-head"><div><h2>2026 Hedef Gerçekleşmeleri</h2><div class="hint" id="targetMeta"></div></div></div>
      <div id="targetTable"></div>
    </article>
    <details class="target-method">
      <summary>Hedef puanı nasıl hesaplanır?</summary>
      <p>Q1-Q4 kaynak değerleri bağımsız çeyreklerdir. Eski “1 Ocak–...” kümülatif sütunları algılanırsa toplanacak KPI'lar önce bağımsız çeyreklere ayrılır ve iki kez toplama önlenir. Ayarlarda işaretli KPI'larda dolu çeyrekler toplanır ve dönem hedefleri yıllık hedef ÷ 4 × dolu çeyrek sayısı ile orantılanır. İşaretli olmayan KPI'larda son dolu çeyrek kullanılır. Yıl sonu projeksiyonu işaretli KPI'da kümülatif gerçekleşen ÷ dolu çeyrek × 4, diğerinde son dolu çeyrek değeridir. Eşik hedef 80, yıllık hedef 100, maksimum hedef 120 puana karşılık gelir. Durum renkleri: 80 altı kırmızı; 80 ve üzeri, 100 altı turuncu; 100 ve üzeri, 120 altı açık yeşil; 120 ve üzeri koyu yeşildir.</p>
    </details>
  </section>
</main>

<script id="performance-data" type="application/json">__DATA__</script>
<script>
const DATA=JSON.parse(document.getElementById('performance-data').textContent);
const $=id=>document.getElementById(id);
const PALETTE=['#175fb8','#0d837a','#df6f32','#7c3aed','#c84545','#18845f'];
const state={view:'hiring',hireScope:new Set(),hireDept:new Set(),hireTitle:new Set(),hireYear:'',hireMonth:'',turnScope:new Set(),turnDept:new Set(),turnTitle:new Set(),turnYears:new Set(),turnMonths:new Set(),mandScope:new Set(),mandDept:new Set(),mandStore:new Set(),mandTitle:new Set(),mandEvent:new Set(),mandStatus:new Set(),mandStart:'',mandEnd:'',poolScope:new Set(),poolDept:new Set(),pool:new Set(),poolRows:[],mandatoryRows:[],targetScope:DATA.hedefler?.scopes?.[0]?.key||'ceo',targetPeriod:DATA.hedefler?.meta?.selected_period||'q1',targetQuery:'',targetStatus:''};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').trim();
const num=(v,d=1)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=(v,d=1)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('tr-TR',{style:'percent',minimumFractionDigits:d,maximumFractionDigits:d});
const date=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('tr-TR')};
const monthLabel=m=>{const names=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];const [y,n]=String(m||'').split('-');return n?`${names[Number(n)-1]} ${y}`:String(m||'')};
function sourceBadge(label, period){return `${label}: ${period?monthLabel(period):'Kaynak yok'}`}
function debounce(fn,ms=200){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
function selected(set,v){return!set.size||set.has(v)}
function unique(rows,key){return [...new Set((rows||[]).map(r=>r[key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'tr'))}
function years(months){return [...new Set((months||[]).map(m=>String(m).slice(0,4)).filter(Boolean))].sort().reverse()}
function monthsForYear(months,year){return (months||[]).filter(m=>!year||String(m).startsWith(`${year}-`)).sort()}
function kpis(id,cards){$(id).innerHTML=cards.map(c=>`<article class="kpi"><div class="label">${esc(c.label)}</div><div class="value">${esc(c.value)}</div><div class="sub">${c.sub||''}</div></article>`).join('')}
function downloadCsv(name,rows,cols){if(!rows?.length)return;const head=cols.map(c=>c.label),body=rows.map(r=>cols.map(c=>String(c.plain?c.plain(r[c.key],r):(r[c.key]??'')).replace(/"/g,'""')));const csv='\ufeff'+[head,...body].map(row=>row.map(v=>`"${v}"`).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
const TABLE_FILTERS=new Map();
const TABLE_REGISTRY=new Map();
let ACTIVE_FILTER_PANEL=null;
function tablePlain(c,r){const v=c.plain?c.plain(r[c.key],r):(r[c.key]??'');return String(v==null?'':v)}
function tableCell(c,r){const v=r[c.key];return c.fmt?c.fmt(v,r):esc(v??'\u2014')}
function tableFilterRows(id,rows,cols){const filters=TABLE_FILTERS.get(id)||{};return (rows||[]).filter(r=>cols.every(c=>{const set=filters[c.key];return !set||set.has(tablePlain(c,r))}))}
function closeTableFilter(){if(ACTIVE_FILTER_PANEL){ACTIVE_FILTER_PANEL.remove();ACTIVE_FILTER_PANEL=null}}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTableFilter()});document.addEventListener('click',e=>{if(ACTIVE_FILTER_PANEL&&!ACTIVE_FILTER_PANEL.contains(e.target)&&!e.target.closest('[data-table-filter]'))closeTableFilter()});
function tableOptions(source,c){return [...new Set((source||[]).map(r=>tablePlain(c,r)).filter(v=>v!==''))].sort((a,b)=>a.localeCompare(b,'tr',{numeric:true,sensitivity:'base'}))}
function openTableFilter(id,ci,button){const reg=TABLE_REGISTRY.get(id);if(!reg)return;const col=reg.cols[ci],allOptions=tableOptions(reg.source,col),filters=TABLE_FILTERS.get(id)||{},existing=filters[col.key];let selected=existing?new Set([...existing]):new Set(allOptions);closeTableFilter();const rect=button.getBoundingClientRect(),panel=document.createElement('div');panel.className='excel-filter-panel';panel.innerHTML=`<h4>${esc(col.label)}</h4><input type="search" placeholder="Ara" autocomplete="off"><div class="excel-filter-actions"><button class="btn secondary" type="button" data-all>T\u00fcm\u00fcn\u00fc Se\u00e7</button><button class="btn secondary" type="button" data-visible>G\u00f6r\u00fcneni Se\u00e7</button><button class="btn secondary" type="button" data-visible-clear>G\u00f6r\u00fcneni Bo\u015falt</button><button class="btn danger" type="button" data-clear>Filtreyi Temizle</button></div><div class="excel-filter-count"></div><div class="excel-filter-list"></div><div class="excel-filter-footer"><button class="btn" type="button" data-apply>Uygula</button><button class="btn secondary" type="button" data-cancel>Vazge\u00e7</button></div>`;document.body.appendChild(panel);const left=Math.min(rect.left,window.innerWidth-panel.offsetWidth-9),top=Math.min(rect.bottom+6,window.innerHeight-panel.offsetHeight-9);panel.style.left=Math.max(9,left)+'px';panel.style.top=Math.max(9,top)+'px';ACTIVE_FILTER_PANEL=panel;const search=panel.querySelector('input[type="search"]'),list=panel.querySelector('.excel-filter-list'),count=panel.querySelector('.excel-filter-count');function visibleOptions(){const q=norm(search.value);return allOptions.filter(v=>!q||norm(v).includes(q))}function setCount(opts){count.textContent=`${selected.size}/${allOptions.length} se\u00e7ili \u00b7 ${opts.length} e\u015fle\u015fme${opts.length>900?' \u00b7 ilk 900 g\u00f6steriliyor':''}`}function renderList(){const opts=visibleOptions(),shown=opts.slice(0,900);setCount(opts);list.innerHTML=shown.map(v=>`<label><input type="checkbox" data-opt="${esc(v)}" ${selected.has(v)?'checked':''}>${esc(v||'\u2014')}</label>`).join('')||'<div class="empty" style="padding:12px">Se\u00e7enek bulunamad\u0131.</div>';list.querySelectorAll('input[data-opt]').forEach(chk=>chk.onchange=()=>{chk.checked?selected.add(chk.dataset.opt):selected.delete(chk.dataset.opt);setCount(visibleOptions())})}search.oninput=renderList;panel.querySelector('[data-all]').onclick=()=>{selected=new Set(allOptions);renderList()};panel.querySelector('[data-visible]').onclick=()=>{visibleOptions().forEach(v=>selected.add(v));renderList()};panel.querySelector('[data-visible-clear]').onclick=()=>{visibleOptions().forEach(v=>selected.delete(v));renderList()};panel.querySelector('[data-clear]').onclick=()=>{const next={...(TABLE_FILTERS.get(id)||{})};delete next[col.key];TABLE_FILTERS.set(id,next);closeTableFilter();table(id,reg.source,reg.cols,reg.opt)};panel.querySelector('[data-cancel]').onclick=closeTableFilter;panel.querySelector('[data-apply]').onclick=()=>{const next={...(TABLE_FILTERS.get(id)||{})};if(selected.size===allOptions.length)delete next[col.key];else next[col.key]=new Set(selected);TABLE_FILTERS.set(id,next);closeTableFilter();table(id,reg.source,reg.cols,reg.opt)};renderList();search.focus()}
function table(id,rows,cols,opt={}){closeTableFilter();const limit=opt.limit??220,normalized=cols.map(c=>Array.isArray(c)?{key:c[0],label:c[1],fmt:c[2],cls:c[3],plain:c[4]}:c),source=rows||[],filtered=tableFilterRows(id,source,normalized),data=filtered.slice(0,limit),filters=TABLE_FILTERS.get(id)||{};TABLE_REGISTRY.set(id,{source,cols:normalized,opt,limit});const activeCount=Object.values(filters).reduce((s,set)=>s+(set?1:0),0);const header=`<thead><tr>${normalized.map(c=>`<th class="${c.cls||''}">${esc(c.label)}</th>`).join('')}</tr><tr class="filter-row">${normalized.map((c,ci)=>{const set=filters[c.key],label=set?`Filtre \u00b7 ${set.size}`:'Filtre';return`<th class="${c.cls||''}"><button class="table-filter-btn ${set?'active':''}" type="button" data-table-filter="${id}" data-col="${ci}">\u25be ${esc(label)}</button></th>`}).join('')}</tr></thead>`;$(id).innerHTML=`<div class="table-tools"><span class="hint">${num(filtered.length,0)} / ${num(source.length,0)} kay\u0131t${activeCount?` \u00b7 ${activeCount} kolon filtresi`:''}</span><button class="btn secondary" type="button">CSV \u0130ndir</button></div>`+(data.length?`<div class="table-shell"><div class="table-scroll-top"><div class="table-scroll-spacer"></div></div><div class="table-wrap"><table>${header}<tbody>${data.map(r=>`<tr>${normalized.map(c=>`<td class="${c.cls||''}">${tableCell(c,r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>${filtered.length>limit?`<div class="hint" style="margin-top:8px">\u0130lk ${num(limit,0)} / ${num(filtered.length,0)} filtreli kay\u0131t g\u00f6steriliyor. CSV filtreli tam listeyi indirir.</div>`:''}`:'<div class="empty">Se\u00e7ili kapsamda veri bulunamad\u0131.</div>');const host=$(id),wrap=host.querySelector('.table-wrap'),top=host.querySelector('.table-scroll-top'),tableEl=host.querySelector('table');if(top&&wrap&&tableEl){top.querySelector('.table-scroll-spacer').style.width=tableEl.scrollWidth+'px';top.onscroll=()=>{wrap.scrollLeft=top.scrollLeft};wrap.onscroll=()=>{top.scrollLeft=wrap.scrollLeft}}const csvBtn=host.querySelector('.table-tools button');if(csvBtn)csvBtn.onclick=()=>downloadCsv(opt.filename||`${id}.csv`,filtered,normalized);host.querySelectorAll('[data-table-filter]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();openTableFilter(id,Number(btn.dataset.col),btn)})}
function makeMulti(id,label,options,set,onchange){const el=$(id),all=[...new Set(options||[])].filter(Boolean).sort((a,b)=>String(a).localeCompare(String(b),'tr',{numeric:true,sensitivity:'base'}));function summaryText(){return `${esc(label)}${set.size?` \u00b7 ${set.size}`:''}`}function countText(visible,shown){return `${set.size?`${set.size}/${all.length} se\u00e7ili`:'T\u00fcm\u00fc'} \u00b7 ${visible.length} e\u015fle\u015fme${visible.length>shown.length?' \u00b7 ilk 650 g\u00f6steriliyor':''}`}function draw(q=''){const wasOpen=el.open,query=norm(q),visible=all.filter(v=>!query||norm(v).includes(query)),shown=visible.slice(0,650);el.innerHTML=`<summary>${summaryText()}</summary><div class="multi-box"><input class="multi-search" type="search" placeholder="Ara" value="${esc(q)}" autocomplete="off"><div class="multi-actions"><button class="btn secondary" type="button" data-visible>G\u00f6r\u00fcneni Se\u00e7</button><button class="btn secondary" type="button" data-clear-visible>G\u00f6r\u00fcneni Bo\u015falt</button><button class="btn danger" type="button" data-clear>T\u00fcm\u00fc</button></div><div class="multi-count">${countText(visible,shown)}</div>${shown.map(v=>`<label><input type="checkbox" value="${esc(v)}" ${set.has(v)?'checked':''}>${esc(v)}</label>`).join('')||'<div class="empty" style="padding:10px">Se\u00e7enek bulunamad\u0131.</div>'}</div>`;el.open=wasOpen;const search=el.querySelector('.multi-search');search.oninput=()=>draw(search.value);el.querySelector('[data-visible]').onclick=()=>{visible.forEach(v=>set.add(v));draw(search.value);onchange()};el.querySelector('[data-clear-visible]').onclick=()=>{visible.forEach(v=>set.delete(v));draw(search.value);onchange()};el.querySelector('[data-clear]').onclick=()=>{set.clear();draw(search.value);onchange()};el.querySelectorAll('input[type="checkbox"]').forEach(x=>x.onchange=()=>{x.checked?set.add(x.value):set.delete(x.value);el.querySelector('summary').innerHTML=summaryText();const count=el.querySelector('.multi-count');if(count)count.textContent=countText(visible,shown);onchange()})}draw()}
function lineChart(id,labels,series,opt={}){const host=$(id),values=series.flatMap(s=>s.values).filter(v=>v!=null&&Number.isFinite(Number(v)));if(!values.length){host.innerHTML='<div class="empty">Grafik verisi yok.</div>';return}const W=920,H=310,p={l:58,r:22,t:22,b:54},min=0,max=Math.max(...values)*1.15||1,x=i=>p.l+(W-p.l-p.r)*(labels.length<=1?.5:i/(labels.length-1)),y=v=>H-p.b-(Number(v)-min)/(max-min||1)*(H-p.t-p.b);let svg=`<svg viewBox="0 0 ${W} ${H}" role="img">`;for(let i=0;i<5;i++){const val=max*(4-i)/4,yy=y(val);svg+=`<line x1="${p.l}" x2="${W-p.r}" y1="${yy}" y2="${yy}" stroke="#dfe3dc"/><text x="${p.l-8}" y="${yy+4}" text-anchor="end" font-size="10" fill="#667185">${opt.percent?pct(val):num(val,1)}</text>`}labels.forEach((l,i)=>{if(labels.length<=14||i%Math.ceil(labels.length/12)===0)svg+=`<text x="${x(i)}" y="${H-18}" text-anchor="middle" font-size="10" fill="#667185">${esc(l)}</text>`});series.forEach((s,si)=>{let d='',open=false;s.values.forEach((v,i)=>{if(v==null){open=false;return}d+=`${open?'L':'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;open=true});svg+=`<path d="${d}" fill="none" stroke="${PALETTE[si%PALETTE.length]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;s.values.forEach((v,i)=>{if(v!=null)svg+=`<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${PALETTE[si%PALETTE.length]}"><title>${esc(s.label||'Seri')} · ${esc(labels[i])}: ${opt.percent?pct(v):num(v,1)}</title></circle>`})});svg+='</svg>';host.innerHTML=svg}
function ratioBars(id,rows,opt={}){const data=(rows||[]).slice(0,opt.limit||18);$(id).innerHTML=data.map((r,i)=>`<div class="bar"><span title="${esc(r.label)}">${esc(r.label)}</span><div class="track"><div class="fill" style="width:${Math.max(0,Math.min(100,Number(r.rate||0)*100))}%;background:${PALETTE[i%PALETTE.length]}"></div></div><b>${pct(r.rate)}<span class="sample ${Number(r.assigned||0)<5?'low':''}"> · ${num(r.completed,0)}/${num(r.assigned,0)}${Number(r.assigned||0)<5?' · Düşük örneklem':''}</span></b></div>`).join('')||'<div class="empty">Veri yok.</div>'}
function aggregateRatio(rows,key){return unique(rows,key).map(label=>{const g=rows.filter(r=>r[key]===label),assigned=g.length,completed=g.reduce((s,r)=>s+Number(r.completed||0),0);return{label,assigned,completed,rate:assigned?completed/assigned:null}}).sort((a,b)=>(b.rate??-1)-(a.rate??-1))}
function cumulative(rows){const valid=rows.filter(r=>Number(r.avg_headcount||0)>0),exits=rows.reduce((s,r)=>s+Number(r.exits||0),0),average=valid.reduce((s,r)=>s+Number(r.avg_headcount||0),0)/(valid.length||1);return{exits,average,turnover:average?exits/average:null,months:valid.length}}

function hiringRows(){return (DATA.hiring.rows||[]).filter(r=>selected(state.hireScope,r.scope)&&selected(state.hireDept,r.departman)&&selected(state.hireTitle,r.title_group)&&(!state.hireYear||String(r.month).startsWith(`${state.hireYear}-`))&&(!state.hireMonth||r.month===state.hireMonth))}
function hiringQualityFromRows(rows){const buckets=[{label:'0-15 Gün',min:0,max:15},{label:'16-30 Gün',min:16,max:30},{label:'31-45 Gün',min:31,max:45},{label:'46+ Gün',min:46,max:Infinity}];return buckets.map(b=>{const g=rows.filter(r=>{const v=Number(r.fill_days);return Number.isFinite(v)&&v>=b.min&&v<=b.max});const vals=g.map(r=>Number(r.fill_days)).filter(Number.isFinite);return{fill_bucket:b.label,hires:g.length,avg_fill_days:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,over_30:vals.filter(v=>v>30).length,over_45:vals.filter(v=>v>45).length,rate_30:vals.length?vals.filter(v=>v>30).length/vals.length:null,rate_45:vals.length?vals.filter(v=>v>45).length/vals.length:null}}).filter(r=>r.hires)}
function renderHiring(){const rows=hiringRows(),values=rows.map(r=>Number(r.fill_days)).filter(Number.isFinite).sort((a,b)=>a-b),avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:null,median=values.length?values[Math.floor((values.length-1)/2)]:null,p90=values.length?values[Math.floor((values.length-1)*.9)]:null;kpis('hireKpis',[{label:'İşe Alım',value:num(rows.length,0),sub:'filtreli kayıt'},{label:'Ortalama',value:num(avg,1),sub:'gün'},{label:'Medyan',value:num(median,1),sub:'gün'},{label:'P90',value:num(p90,1),sub:'gün'},{label:'30 Gün Üstü',value:pct(values.length?values.filter(x=>x>30).length/values.length:null),sub:`${values.filter(x=>x>30).length}/${values.length}`},{label:'45 Gün Üstü',value:pct(values.length?values.filter(x=>x>45).length/values.length:null),sub:`${values.filter(x=>x>45).length}/${values.length}`}]);$('hireMeta').textContent=sourceBadge('İşe Alım',DATA.meta.source_periods?.hiring);const months=[...new Set(rows.map(r=>r.month))].sort(),series=months.map(m=>{const x=rows.filter(r=>r.month===m).map(r=>Number(r.fill_days)).filter(Number.isFinite);return x.length?x.reduce((a,b)=>a+b,0)/x.length:null});lineChart('hireChart',months.map(monthLabel),[{label:'Ortalama Gün',values:series}]);const deps=unique(rows,'departman').map(label=>{const x=rows.filter(r=>r.departman===label).map(r=>Number(r.fill_days)).filter(Number.isFinite);return{label,assigned:x.length,completed:x.length,rate:x.length?Math.min(1,(x.reduce((a,b)=>a+b,0)/x.length)/60):null,days:x.length?x.reduce((a,b)=>a+b,0)/x.length:null}}).sort((a,b)=>b.days-a.days);$('hireDeptBars').innerHTML=deps.slice(0,16).map((r,i)=>`<div class="bar"><span>${esc(r.label)}</span><div class="track"><div class="fill" style="width:${Math.min(100,r.days/60*100)}%;background:${PALETTE[i%PALETTE.length]}"></div></div><b>${num(r.days,1)} gün<span class="sample ${r.assigned<5?'low':''}">${num(r.assigned,0)} kayıt${r.assigned<5?' · Düşük örneklem':''}</span></b></div>`).join('')||'<div class="empty">Veri yok.</div>';const q=hiringQualityFromRows(rows);table('hiringQualityTable',q,[['fill_bucket','Doldurma Grubu'],['hires','İşe Alım',v=>num(v,0),'num'],['avg_fill_days','Ort. Gün',v=>num(v,1),'num'],['over_30','30 Gün Üstü',v=>num(v,0),'num'],['rate_30','30 Gün Üstü Oran',v=>pct(v),'num'],['over_45','45 Gün Üstü',v=>num(v,0),'num'],['rate_45','45 Gün Üstü Oran',v=>pct(v),'num']],{limit:100,filename:'ise_alim_kalitesi.csv'});table('hireTable',rows,[['month','Dönem'],['sicil','Sicil'],['ad_soyad','Ad Soyad'],['scope','Üst Bölüm'],['departman','Departman'],['magaza','Mağaza/Birim'],['title_group','Unvan Grubu'],['title','Görev'],['unvan','Ünvan'],['open_date','Pozisyon Açılış',v=>date(v)],['offer_date','Teklif',v=>date(v)],['fill_days','Doldurma Süresi',v=>num(v,1),'num'],['open_days','Açık Gün',v=>num(v,1),'num']],{limit:260,filename:'ise_alim_kayitlari.csv'})}

function turnSelectedMonths(){const allMonths=DATA.turnover.months||[];let months=allMonths.filter(m=>(!state.turnYears.size||state.turnYears.has(String(m).slice(0,4)))&&(!state.turnMonths.size||state.turnMonths.has(m)));return months.sort()}
function filteredTurnRows(source){return (source||[]).filter(r=>selected(state.turnScope,r.scope)&&selected(state.turnDept,r.departman)&&selected(state.turnTitle,r.title_group)&&(!state.turnYears.size||state.turnYears.has(String(r.month).slice(0,4)))&&(!state.turnMonths.size||state.turnMonths.has(r.month)))}
function aggregateMonths(rows,months){return months.map(month=>{const g=rows.filter(r=>r.month===month),exits=g.reduce((s,r)=>s+Number(r.exits||0),0),start=g.reduce((s,r)=>s+Number(r.start||0),0),end=g.reduce((s,r)=>s+Number(r.end||0),0),avg_headcount=(start+end)/2;return{month,exits,start,end,avg_headcount,turnover:avg_headcount?exits/avg_headcount:null}})}
function renderTurnover(){const rows=filteredTurnRows(DATA.turnover.rows),early=filteredTurnRows(DATA.turnover.early_rows),allMonths=DATA.turnover.months||[],months=turnSelectedMonths(),last12=aggregateMonths((DATA.turnover.rows||[]).filter(r=>allMonths.slice(-12).includes(r.month)&&selected(state.turnScope,r.scope)&&selected(state.turnDept,r.departman)&&selected(state.turnTitle,r.title_group)),allMonths.slice(-12)),yearRows=aggregateMonths(rows,months),metric=cumulative(yearRows),lastMetric=cumulative(last12),latest=yearRows.filter(r=>r.avg_headcount>0||r.exits>0).at(-1)||{};const filterText=state.turnMonths.size?`${state.turnMonths.size} ay`:state.turnYears.size?[...state.turnYears].sort().join(', '):'Tüm dönemler';kpis('turnKpis',[{label:'Son Dönem',value:monthLabel(DATA.meta.latest_month),sub:'kanonik veri'},{label:'Seçili Son Ay',value:pct(latest.turnover),sub:`${num(latest.exits,0)} Çıkış`},{label:'Kümüle Özet',value:pct(metric.turnover),sub:`${num(metric.exits,0)} Çıkış / ${num(metric.average,1)} ort. Çalışan`},{label:'Son 12 Ay',value:pct(lastMetric.turnover),sub:`${num(lastMetric.exits,0)} Çıkış / ${num(lastMetric.average,1)} ort. Çalışan`},{label:'Ay Sayısı',value:num(metric.months,0),sub:'verili ay'},{label:'Filtre',value:filterText,sub:'çoklu dönem'}]);$('turnMeta').textContent=sourceBadge('Turnover',DATA.meta.source_periods?.turnover);lineChart('turnChart',yearRows.map(r=>monthLabel(r.month)),[{label:'Turnover',values:yearRows.map(r=>r.turnover)}],{percent:true});table('turnTable',yearRows,[['month','Dönem'],['start','Dönem Başı',v=>num(v,0),'num'],['end','Dönem Sonu',v=>num(v,0),'num'],['exits','Çıkış',v=>num(v,0),'num'],['avg_headcount','Ortalama Çalışan',v=>num(v,1),'num'],['turnover','Turnover',v=>pct(v),'num']],{limit:160,filename:'turnover_aylik_detay.csv'});table('turnSummaryTable',[{period:filterText,start:yearRows.reduce((s,r)=>s+Number(r.start||0),0),end:yearRows.reduce((s,r)=>s+Number(r.end||0),0),exits:metric.exits,avg_headcount:metric.average,turnover:metric.turnover,months:metric.months}], [['period','Dönem Seçimi'],['months','Ay',v=>num(v,0),'num'],['start','Dönem Başı Toplam',v=>num(v,0),'num'],['end','Dönem Sonu Toplam',v=>num(v,0),'num'],['exits','Çıkış',v=>num(v,0),'num'],['avg_headcount','Ortalama Çalışan',v=>num(v,1),'num'],['turnover','Turnover',v=>pct(v),'num']],{limit:10,filename:'turnover_kumule_ozet.csv'});const sum={total:0,m1:0,m2:0,m6:0};early.forEach(r=>{sum.total+=Number(r.total_exits||0);sum.m1+=Number(r.first_1||0);sum.m2+=Number(r.first_2||0);sum.m6+=Number(r.first_6||0)});ratioBars('earlyBars',[{label:'İlk Ay',assigned:sum.total,completed:sum.m1,rate:sum.total?sum.m1/sum.total:null},{label:'İlk 2 Ay',assigned:sum.total,completed:sum.m2,rate:sum.total?sum.m2/sum.total:null},{label:'İlk 6 Ay',assigned:sum.total,completed:sum.m6,rate:sum.total?sum.m6/sum.total:null}],{limit:6});table('earlyTable',months.map(month=>{const g=early.filter(r=>r.month===month);return{month,total:g.reduce((s,r)=>s+Number(r.total_exits||0),0),m1:g.reduce((s,r)=>s+Number(r.first_1||0),0),m2:g.reduce((s,r)=>s+Number(r.first_2||0),0),m6:g.reduce((s,r)=>s+Number(r.first_6||0),0)}}),[['month','Dönem'],['total','Toplam Çıkış',v=>num(v,0),'num'],['m1','İlk Ay',v=>num(v,0),'num'],['m2','İlk 2 Ay',v=>num(v,0),'num'],['m6','İlk 6 Ay',v=>num(v,0),'num']],{limit:160,filename:'erken_cikis.csv'})}

const STORE_PROMOTION_ALLOWED=new Set(['Mağaza Müdürü','Mağaza Müdür Yardımcısı']);
function renderPromotions(){const scope=$('promotionScope').value,year=Number($('promotionYear').value),rows=(DATA.promotions.rows||[]).filter(r=>r.scope===scope&&(!year||r.year===year)).filter(r=>scope!=='Mağaza'||STORE_PROMOTION_ALLOWED.has(r.target_role));const linksMap=new Map();rows.forEach(r=>{const source=r.movement==='Dış Aday'?'Dış Aday':r.source_role,key=`${source}|${r.target_role}`,x=linksMap.get(key)||{source,target:r.target_role,count:0,movement:r.movement};x.count++;linksMap.set(key,x)});const links=[...linksMap.values()],internal=rows.filter(r=>r.movement==='İç Terfi').length,external=rows.filter(r=>r.movement==='Dış Aday').length,total=rows.length;kpis('promotionKpis',[{label:'Kapsam',value:scope,sub:String(year||'Tüm yıllar')},{label:'İç Terfi',value:num(internal,0),sub:pct(total?internal/total:null)},{label:'Dış Aday',value:num(external,0),sub:pct(total?external/total:null)},{label:'Toplam Hareket',value:num(total,0),sub:'akış kaydı'},{label:'Hedef Rol',value:num(new Set(rows.map(r=>r.target_role)).size,0),sub:'benzersiz'},{label:'Kaynak Rol',value:num(new Set(rows.map(r=>r.source_role)).size,0),sub:'benzersiz'}]);sankeyChart('promotionSankey',links);table('promotionFlowTable',links,[['movement','Tür'],['source','Kaynak'],['target','Hedef'],['count','Kişi',v=>num(v,0),'num']],{limit:100,filename:`terfi_akisi_${scope}_${year||'tum'}.csv`});table('promotionPersonTable',rows,[['month','Dönem'],['sicil','Sicil'],['ad_soyad','Ad Soyad'],['scope','Üst Bölüm'],['departman','Departman'],['magaza','Mağaza/Birim'],['movement','Tür'],['source_role','Önceki Rol'],['target_role','Yeni Rol'],['gorev','Görev'],['unvan','Ünvan'],['kadro','Kadro'],['magaza_title','Mağaza Kırılım'],['entry_date','İşe Giriş',v=>date(v)],['tenure_year','Terfi Kıdemi Yıl',v=>num(v,2),'num'],['months_since_previous_role','Önceki Role Göre Ay',v=>v==null?'İlk Hareket':num(v,0),'num']],{limit:320,filename:`terfi_kisi_detay_${scope}_${year||'tum'}.csv`})}
function sankeyChart(id,links){const host=$(id);if(!links.length){host.innerHTML='<div class="empty">Akış verisi yok.</div>';return}const W=920,H=310,left=120,right=720,nodes=[...new Set(links.flatMap(l=>[l.source,l.target]))],sources=[...new Set(links.map(l=>l.source))],targets=[...new Set(links.map(l=>l.target))],sy=new Map(sources.map((n,i)=>[n,45+i*((H-90)/Math.max(1,sources.length-1))])),ty=new Map(targets.map((n,i)=>[n,45+i*((H-90)/Math.max(1,targets.length-1))])),max=Math.max(...links.map(l=>l.count),1);let svg=`<svg viewBox="0 0 ${W} ${H}">`;links.forEach((l,i)=>{const y1=sy.get(l.source),y2=ty.get(l.target),w=4+18*l.count/max;svg+=`<path d="M${left} ${y1} C${left+250} ${y1}, ${right-250} ${y2}, ${right} ${y2}" fill="none" stroke="${PALETTE[i%PALETTE.length]}" stroke-width="${w}" stroke-opacity=".55"><title>${esc(l.source)} → ${esc(l.target)}: ${num(l.count,0)}</title></path>`});sources.forEach(n=>svg+=`<text x="${left-10}" y="${sy.get(n)+4}" text-anchor="end" font-size="12" font-weight="800">${esc(n)}</text>`);targets.forEach(n=>svg+=`<text x="${right+10}" y="${ty.get(n)+4}" font-size="12" font-weight="800">${esc(n)}</text>`);svg+='</svg>';host.innerHTML=svg}

const mandCols=DATA.mandatory.columns||[];const mandatoryObjects=(DATA.mandatory.rows||[]).map(a=>Object.fromEntries(mandCols.map((c,i)=>[c,a[i]])));
function applyMandatory(){const q=norm($('mandSearch').value),start=$('mandStart').value,end=$('mandEnd').value;state.mandStart=start;state.mandEnd=end;state.mandatoryRows=mandatoryObjects.filter(r=>selected(state.mandScope,r.scope)&&selected(state.mandDept,r.departman)&&selected(state.mandStore,r.magaza)&&selected(state.mandTitle,r.gorev)&&selected(state.mandEvent,r.event)&&selected(state.mandStatus,r.status)&&(!start||String(r.assigned_at||'').slice(0,10)>=start)&&(!end||String(r.assigned_at||'').slice(0,10)<=end)&&(!q||norm(`${r.sicil} ${r.ad_soyad}`).includes(q)));renderMandatory()}
function renderMandatory(){const rows=state.mandatoryRows,assigned=rows.length,completed=rows.reduce((s,r)=>s+Number(r.completed||0),0),exempt=rows.reduce((s,r)=>s+Number(r.exempt||0),0),started=rows.reduce((s,r)=>s+Number(r.started||0),0),durationMin=rows.reduce((s,r)=>s+Number(r.duration_min||0),0),people=new Set(rows.map(r=>r.sicil).filter(Boolean)).size,completion=(assigned-exempt)>0?completed/(assigned-exempt):null,compliance=assigned?(completed+exempt)/assigned:null,perPersonMin=people?durationMin/people:null;kpis('mandKpis',[{label:'Tarihsel Atama',value:num(assigned,0),sub:'filtreli tüm atamalar'},{label:'Tamamlama Oranı',value:pct(completion),sub:'Tamamladı / (Atandı - Muaf)'},{label:'Uyum Oranı',value:pct(compliance),sub:'(Tamamladı + Muaf) / Atandı'},{label:'Toplam Dakika',value:num(durationMin,0),sub:'deneyim süresi'},{label:'Toplam Saat',value:num(durationMin/60,1),sub:'deneyim süresi'},{label:'Kişi Başı Saat',value:num(perPersonMin==null?null:perPersonMin/60,2),sub:`${num(people,0)} tekil kişi`},{label:'Başladı',value:num(started,0),sub:pct(assigned?started/assigned:null)},{label:'Muaf',value:num(exempt,0),sub:'tamamlama paydasından çıkar'}]);$('mandMeta').textContent=sourceBadge('Zorunlu Eğitim',DATA.meta.source_periods?.mandatory);ratioBars('mandEventBars',aggregateRatio(rows,'event'),{limit:18});ratioBars('mandDeptBars',aggregateRatio(rows,'departman'),{limit:18});table('mandatoryTable',rows,[['sicil','Sicil'],['ad_soyad','Ad Soyad'],['scope','Üst Bölüm'],['departman','Departman'],['magaza','Mağaza/Birim'],['gorev','Görev'],['event','Eğitim'],['status','Durum'],['score','Puan',v=>num(v,1),'num'],['duration_min','Toplam Dakika',v=>num(v,0),'num'],['duration_hour','Toplam Saat',v=>num(v,2),'num'],['assignment_month','Atama Dönemi'],['assigned_at','Atanma',v=>date(v)],['completed_at','Tamamlanma',v=>date(v)]],{limit:260,filename:'zorunlu_egitim_tarihsel.csv'})}

const poolPeople=DATA.person_pool.people||[],poolMonths=DATA.person_pool.months||[],poolHistory=new Map();(DATA.person_pool.records||[]).forEach(r=>{if(!poolHistory.has(r[0]))poolHistory.set(r[0],[]);poolHistory.get(r[0]).push(r)});
function renderPoolSearch(){const q=norm($('poolSearch').value),rows=poolPeople.map((p,i)=>({...p,i})).filter(p=>selected(state.poolScope,p.scope)&&selected(state.poolDept,p.departman)&&(!q||norm(`${p.tc_kimlik} ${p.sicil} ${p.ad_soyad} ${p.gorev} ${p.unvan}`).includes(q))).slice(0,100);$('poolResults').innerHTML=rows.map(p=>`<div class="person-row"><div><b>${esc(p.ad_soyad||p.sicil)}</b><small>${esc(p.sicil)} · ${esc(p.scope)} · ${esc(p.departman)} · ${esc(p.gorev)}</small></div><button class="btn secondary" data-add="${p.i}">${state.pool.has(p.i)?'Seçildi':'Ekle'}</button></div>`).join('')||'<div class="empty">Eşleşen kişi yok.</div>';$('poolResults').querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{state.pool.add(Number(b.dataset.add));renderPoolSearch();renderPoolChips()})}
function selectedPoolPeople(){return [...state.pool].map(i=>poolPeople[i]).filter(Boolean)}
function renderPoolPeopleTable(){const rows=selectedPoolPeople();if(!rows.length){$('poolPeopleTable').innerHTML='<div class="empty">Havuzdaki kişilerin özlük detayı burada görünecek.</div>';return}table('poolPeopleTable',rows,[['sicil','Sicil'],['tc_kimlik','TC'],['ad_soyad','Ad Soyad'],['scope','Üst Bölüm'],['departman','Departman'],['magaza','Mağaza/Birim'],['gorev','Görev'],['unvan','Unvan'],['kadro','Kadro'],['title_group','Unvan Grubu'],['entry_date','İşe Giriş',v=>date(v)],['exit_date','Çıkış',v=>date(v)],['tenure_year','Kıdem Yıl',v=>num(v,1),'num'],['tenure_days','Kıdem Gün',v=>num(v,0),'num'],['birth_date','Doğum',v=>date(v)],['gender','Cinsiyet']],{limit:260,filename:'kisi_havuzu_kisi_detay.csv'})}
function renderPoolChips(){$('poolChips').innerHTML=[...state.pool].map(i=>`<span class="chip">${esc(poolPeople[i]?.ad_soyad||poolPeople[i]?.sicil)}<button data-remove="${i}" type="button" aria-label="Havuzdan kaldır" title="Havuzdan kaldır">×</button></span>`).join('')||'<span class="hint">Henüz çalışan seçilmedi.</span>';$('poolChips').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{state.pool.delete(Number(b.dataset.remove));renderPoolSearch();renderPoolChips()});renderPoolPeopleTable()}
function runPool(){const start=poolMonths.indexOf($('poolStart').value),end=poolMonths.indexOf($('poolEnd').value);if(!state.pool.size||start<0||end<start){alert('Çalışan havuzu ve geçerli tarih aralığı seçilmelidir.');return}const monthly=[];for(let mi=start;mi<=end;mi++){let st=0,en=0,ex=0,m1=0,m2=0,m6=0;state.pool.forEach(pi=>(poolHistory.get(pi)||[]).forEach(r=>{if(r[1]!==mi)return;st+=Number(r[2]||0);en+=Number(r[3]||0);ex+=Number(r[4]||0);if(Number(r[4]||0)>0&&r[5]!=null){if(r[5]<=31)m1+=r[4];if(r[5]<=62)m2+=r[4];if(r[5]<=183)m6+=r[4]}}));const avg_headcount=(st+en)/2;monthly.push({month:poolMonths[mi],start:st,end:en,exits:ex,avg_headcount,turnover:avg_headcount?ex/avg_headcount:null,first_1:m1,first_2:m2,first_6:m6})}state.poolRows=monthly;const metric=cumulative(monthly),m2=monthly.reduce((s,r)=>s+r.first_2,0),m6=monthly.reduce((s,r)=>s+r.first_6,0);kpis('poolKpis',[{label:'Havuz',value:num(state.pool.size,0),sub:'seçilen kişi'},{label:'Ay',value:num(monthly.length,0),sub:'dönem'},{label:'Çıkış',value:num(metric.exits,0),sub:'toplam'},{label:'Turnover',value:pct(metric.turnover),sub:'çıkış / ort. çalışan'},{label:'İlk 2 Ay',value:num(m2,0),sub:pct(metric.exits?m2/metric.exits:null)},{label:'İlk 6 Ay',value:num(m6,0),sub:pct(metric.exits?m6/metric.exits:null)}]);lineChart('poolChart',monthly.map(r=>monthLabel(r.month)),[{label:'Havuz Turnover',values:monthly.map(r=>r.turnover)}],{percent:true});table('poolTable',monthly,[['month','Dönem'],['start','Dönem Başı',v=>num(v,0),'num'],['end','Dönem Sonu',v=>num(v,0),'num'],['exits','Çıkış',v=>num(v,0),'num'],['avg_headcount','Ort. Çalışan',v=>num(v,1),'num'],['turnover','Turnover',v=>pct(v),'num'],['first_1','İlk Ay',v=>num(v,0),'num'],['first_2','İlk 2 Ay',v=>num(v,0),'num'],['first_6','İlk 6 Ay',v=>num(v,0),'num']],{limit:120,filename:'kisi_havuzu_turnover.csv'})}

const BONUS_KEY='aizanoi_bonus_settings_v2';
const DEFAULT_BONUS={titles:{'Direktör':{p80:.50,p100:1,p120:2,salary:2.5,specialA120:6},'Müdür':{p80:.70,p100:1,p120:1.67,salary:1.5,specialA120:3},'Yönetici':{p80:.70,p100:1,p120:1.60,salary:1.25,specialA120:null},'Uzman ve altı':{p80:.80,p100:1,p120:1.50,salary:1,specialA120:2}},grades:{'A(Mükemmel)':1.25,'B(Çok Başarılı)':1.10,'C(Başarılı)':1,'D(Gelişime Açık)':.80,'E(Desteklenmeli)':0},specialScenarios:[]};
const BONUS_HARD_CAPS=Object.freeze({'Direktör':6,'Müdür':3,'Uzman ve altı':2});
function cloneBonus(x){return JSON.parse(JSON.stringify(x))}
function loadBonus(){try{const saved=JSON.parse(localStorage.getItem(BONUS_KEY)||localStorage.getItem('aizanoi_bonus_settings_v1')||'null');const base=cloneBonus(DEFAULT_BONUS);if(saved?.titles)Object.assign(base.titles,saved.titles);if(saved?.grades)Object.assign(base.grades,saved.grades);base.specialScenarios=Array.isArray(saved?.specialScenarios)?saved.specialScenarios:[];return base}catch{return cloneBonus(DEFAULT_BONUS)}}let bonus=loadBonus();
function saveBonus(){localStorage.setItem(BONUS_KEY,JSON.stringify(bonus));renderBonusSettings();calcBonus()}
function parsePercentValue(value,fallback=100){const cleaned=String(value??'').replace(',', '.').replace(/[^0-9.\-]/g,'');const raw=Number(cleaned);return Number.isFinite(raw)?raw:fallback}function percentToRate(value,fallback=100){return Math.max(0,Math.min(1.2,parsePercentValue(value,fallback)/100))}function readBonusTarget(){return percentToRate($('bonusTarget').value,100)}
function targetFactor(title,target){const row=bonus.titles[title];if(!row||target<.8)return 0;if(target>=1.2)return Number(row.p120)||0;const lo=target<1?{x:.8,y:Number(row.p80)||0}:{x:1,y:Number(row.p100)||0},hi=target<1?{x:1,y:Number(row.p100)||0}:{x:1.2,y:Number(row.p120)||0};return lo.y+(hi.y-lo.y)*((target-lo.x)/(hi.x-lo.x))}
function scenarioMatch(title,grade,target){return (bonus.specialScenarios||[]).find(s=>s.title===title&&s.grade===grade&&Math.abs(Number(s.target)-target)<.00001)}
function bonusHardCap(title){const cap=Number(BONUS_HARD_CAPS[title]);return Number.isFinite(cap)?cap:Infinity}
function applyBonusHardCap(title,value){const numeric=Math.max(0,Number(value)||0);return Math.min(numeric,bonusHardCap(title))}
function bonusCoeff(title,grade,target){
  const row=bonus.titles[title],gradeMul=Number(bonus.grades[grade]??0);
  if(!row||target<.8)return 0;
  const salary=Number(row.salary)||0,standard=targetFactor(title,target)*gradeMul*salary;
  const exactScenario=scenarioMatch(title,grade,target);
  if(exactScenario)return applyBonusHardCap(title,exactScenario.coeff);
  if(target>=1.2&&grade.startsWith('A')&&row.specialA120!=null){
    return applyBonusHardCap(title,row.specialA120);
  }
  return applyBonusHardCap(title,standard);
}
function calcBonus(){const rawPercent=parsePercentValue($('bonusTarget').value,100),target=readBonusTarget(),title=$('bonusTitle').value,grade=$('bonusGrade').value,value=bonusCoeff(title,grade,target);$('bonusResult').textContent=num(value,2);const effective=$('bonusEffectiveTarget');if(effective)effective.textContent=pct(target,1);$('bonusTargetNote').innerHTML=target<.8?'<span class="pill risk">80% altı: katsayı tüm unvanlarda 0</span>':rawPercent>120?'<span class="pill watch">120% üstü 120% gibi işlendi</span>':'<span class="pill good">Standart interpolasyon aralığı</span>';table('bonusWhatIf',[.8,.9,1,1.1,1.2].map(x=>({target:x,value:bonusCoeff(title,grade,x),rule:x<.8?'80 altı 0':(scenarioMatch(title,grade,x)?'Özel senaryo':(x>=1.2&&grade.startsWith('A')&&bonus.titles[title]?.specialA120!=null?'A/120 Özel':'Standart'))})),[['target','Şirket Hedefi',v=>pct(v,0)],['value','Kat Sayı',v=>num(v,2),'num'],['rule','Kural']],{limit:10,filename:'prim_what_if.csv'})}
function renderBonusSettings(){const titleRows=Object.entries(bonus.titles).map(([title,row])=>({title,...row})),gradeRows=Object.entries(bonus.grades).map(([grade,value])=>({grade,value})),titleOptions=Object.keys(bonus.titles).map(v=>`<option>${esc(v)}</option>`).join(''),gradeOptions=Object.keys(bonus.grades).map(v=>`<option>${esc(v)}</option>`).join('');$('bonusSettingsTable').innerHTML=`<div class="grid two"><div><h3>Unvan Bazlı Katsayılar</h3><div class="hint">80 / 100 / 120 hedef noktaları ve maaş katsayısı buradan yönetilir. Ara değerler bu üç nokta arasında doğrusal hesaplanır. Sabit tavanlar: Direktör 6, Müdür 3, Uzman ve altı 2.</div><div class="table-wrap editable-table"><table><thead><tr><th>Unvan</th><th>80%</th><th>100%</th><th>120%</th><th>Maaş Katsayısı</th><th>A/120 Özel</th></tr></thead><tbody>${titleRows.map(r=>`<tr><td><b>${esc(r.title)}</b></td>${['p80','p100','p120','salary','specialA120'].map(k=>`<td><input data-bonus-title="${esc(r.title)}" data-key="${k}" value="${r[k]??''}"></td>`).join('')}</tr>`).join('')}</tbody></table></div></div><div><h3>Harf Notu Çarpanları</h3><div class="hint">Bireysel performans harf sonucu çarpanlarıdır.</div><div class="table-wrap editable-table"><table><thead><tr><th>Harf</th><th>Çarpan</th></tr></thead><tbody>${gradeRows.map(r=>`<tr><td><b>${esc(r.grade)}</b></td><td><input data-bonus-grade="${esc(r.grade)}" value="${r.value}"></td></tr>`).join('')}</tbody></table></div></div></div><h3>Özel Senaryolar</h3><div class="hint">Birebir eşleşen unvan + harf + şirket hedef oranında özel katsayı standart sonucun yerine geçer. Hedef alanında yüzde puanı yazılır; 100 = %100, 0,8 = %0,8. Özel katsayı da unvanın sabit tavanını aşamaz.</div><div class="scenario-form"><select class="control" id="scenarioTitle">${titleOptions}</select><select class="control" id="scenarioGrade">${gradeOptions}</select><input class="control" id="scenarioTarget" type="text" inputmode="decimal" value="100" placeholder="Hedef %"><input class="control" id="scenarioCoeff" type="number" value="0" step="0.01" placeholder="Özel katsayı"><button class="btn" id="bonusAddScenario" type="button">Senaryo Ekle</button></div><div id="scenarioTable"></div>`;$('bonusSettingsTable').querySelectorAll('input[data-bonus-title]').forEach(input=>input.onchange=()=>{const title=input.dataset.bonusTitle,key=input.dataset.key,val=input.value.trim();bonus.titles[title][key]=val===''?null:Number(String(val).replace(',','.'));calcBonus()});$('bonusSettingsTable').querySelectorAll('input[data-bonus-grade]').forEach(input=>input.onchange=()=>{bonus.grades[input.dataset.bonusGrade]=Number(String(input.value).replace(',','.'))||0;calcBonus()});$('bonusAddScenario').onclick=()=>{const target=percentToRate($('scenarioTarget').value,100),title=$('scenarioTitle').value,item={title,grade:$('scenarioGrade').value,target,coeff:applyBonusHardCap(title,Number(String($('scenarioCoeff').value).replace(',','.'))||0)};bonus.specialScenarios=(bonus.specialScenarios||[]).filter(s=>!(s.title===item.title&&s.grade===item.grade&&Math.abs(Number(s.target)-target)<.00001));bonus.specialScenarios.push(item);saveBonus()};table('scenarioTable',(bonus.specialScenarios||[]).map((s,i)=>({...s,i,target_label:pct(Number(s.target),0)})),[['title','Unvan'],['grade','Harf'],['target_label','Hedef'],['coeff','Özel Katsayı',v=>num(v,2),'num'],['i','İşlem',(v)=>`<button class="btn danger" type="button" data-del-scenario="${v}">Sil</button>`]],{limit:80,filename:'prim_ozel_senaryolar.csv'});$('scenarioTable').querySelectorAll('[data-del-scenario]').forEach(btn=>btn.onclick=()=>{bonus.specialScenarios.splice(Number(btn.dataset.delScenario),1);saveBonus()})}
function initBonus(){ $('bonusTitle').innerHTML=Object.keys(bonus.titles).map(v=>`<option>${esc(v)}</option>`).join('');$('bonusGrade').innerHTML=Object.keys(bonus.grades).map(v=>`<option>${esc(v)}</option>`).join('');['bonusTarget','bonusTitle','bonusGrade'].forEach(id=>{const el=$(id);el.onchange=calcBonus;el.oninput=calcBonus});document.querySelectorAll('[data-bonus-target]').forEach(btn=>btn.onclick=()=>{$('bonusTarget').value=btn.dataset.bonusTarget;calcBonus()});document.querySelectorAll('[data-bonus-tab]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('[data-bonus-tab]').forEach(x=>x.classList.toggle('active',x===btn));$('bonusCalc').style.display=btn.dataset.bonusTab==='calc'?'block':'none';$('bonusSettings').style.display=btn.dataset.bonusTab==='settings'?'block':'none'});$('bonusSave').onclick=saveBonus;$('bonusReset').onclick=()=>{bonus=cloneBonus(DEFAULT_BONUS);saveBonus()};renderBonusSettings();calcBonus()}

const TARGET_QUARTERS=['q1','q2','q3','q4'];
const TARGET_DEFAULT_COLUMNS={
  threshold:'%80 Eşik Hedef Değer',target:'Hedef Değer',maximum:'%120 Maksimum Hedef Değer',
  quarters:{q1:'Q1 Gerçekleşen Değer (1 Ocak-31 Mart)',q2:'Q2 Gerçekleşen Değer (1 Nisan-30 Haziran)',q3:'Q3 Gerçekleşen Değer (1 Temmuz-30 Eylül)',q4:'Q4 Gerçekleşen Değer (1 Ekim-31 Aralık)'},
  actual:'Kümüle Hedef Gerçekleşen Değer',score:'Hedef Gerçekleşme',projection:'Tahmini Yıl Sonu Hedef Gerçekleşen Değer'
};
const TARGET_DEFAULT_SCORE_BANDS=[
  {status:'Eşik Altı',short_label:'Eşik altı',range_label:'<80',color_name:'Kırmızı',color:'#dc2626',minimum:null,maximum_exclusive:80},
  {status:'Eşik-Hedef Arası',short_label:'Eşik-hedef arası',range_label:'80–<100',color_name:'Turuncu',color:'#f59e0b',minimum:80,maximum_exclusive:100},
  {status:'Hedef ve Üzeri',short_label:'Hedef ve üzeri',range_label:'100–<120',color_name:'Açık yeşil',color:'#4ade80',minimum:100,maximum_exclusive:120},
  {status:'Maksimum',short_label:'Maksimum',range_label:'120 ve üzeri',color_name:'Koyu yeşil',color:'#047857',minimum:120,maximum_exclusive:null}
];
const TARGET_DISPLAY=DATA.hedefler?.meta?.display||{};
const TARGET_COLUMNS={...TARGET_DEFAULT_COLUMNS,...(TARGET_DISPLAY.columns||{}),quarters:{...TARGET_DEFAULT_COLUMNS.quarters,...(TARGET_DISPLAY.columns?.quarters||{})}};
const TARGET_SCORE_BANDS=(TARGET_DISPLAY.score_bands||TARGET_DEFAULT_SCORE_BANDS).map(item=>({...item}));
const TARGET_STATUS=Object.fromEntries(TARGET_SCORE_BANDS.map(item=>[item.status,{color:item.color,short:item.short_label||item.status}]));
TARGET_STATUS['Veri Yok']={color:'#94a3b8',short:'Veri yok'};
const TARGET_SETTINGS_KEY=DATA.hedefler?.meta?.settings_storage_key||'aizanoi_hedef_proration_v2';
const targetFinite=v=>v!=null&&Number.isFinite(Number(v))?Number(v):null;
const targetHasOwn=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
function loadTargetSettings(){try{const value=JSON.parse(localStorage.getItem(TARGET_SETTINGS_KEY)||'{}');return value&&typeof value==='object'?value:{}}catch{return{}}}
let targetSettings=loadTargetSettings(),targetSettingsDraft={};
function targetScopeData(){return DATA.hedefler?.scopes?.find(s=>s.key===state.targetScope)||DATA.hedefler?.scopes?.[0]||null}
function targetPeriodData(){return DATA.hedefler?.periods?.find(p=>p.key===state.targetPeriod)||DATA.hedefler?.periods?.[0]||null}
function targetScoreBand(value){
  const v=targetFinite(value);
  if(v==null)return null;
  return TARGET_SCORE_BANDS.find(item=>(item.minimum==null||v>=Number(item.minimum))&&(item.maximum_exclusive==null||v<Number(item.maximum_exclusive)))||TARGET_SCORE_BANDS.at(-1);
}
function targetColorRgb(color){const value=String(color||'#94a3b8').replace('#','');return value.length===6?[parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)]:[148,163,184]}
function targetScoreColor(v){return targetScoreBand(v)?.color||'#94a3b8'}
function targetScoreText(v){const [r,g,b]=targetColorRgb(targetScoreColor(v)),l=(.2126*r+.7152*g+.0722*b)/255;return l>.58?'#13243a':'#fff'}
function targetStatusOf(value){return targetScoreBand(value)?.status||'Veri Yok'}
function targetScoreCalc(actual,threshold,target,maximum,direction){
  const a=targetFinite(actual),e=targetFinite(threshold),h=targetFinite(target),m=targetFinite(maximum),dir=norm(direction);
  if([a,e,h,m].some(v=>v==null)||(!dir.includes('pozitif')&&!dir.includes('negatif')))return null;
  if(dir.includes('pozitif')){
    if(!(e<=h&&h<=m))return null;
    if(a<e)return e<=0?0:Math.max(0,Math.min(80,a/e*80));
    if(a===e)return 80;if(a<h)return h===e?100:80+(a-e)/(h-e)*20;if(a===h)return 100;
    if(a<m)return m===h?120:100+(a-h)/(m-h)*20;return 120;
  }
  if(!(e>=h&&h>=m))return null;
  if(a>e)return e===h?0:Math.max(0,80-(a-e)/(e-h)*20);
  if(a===e)return 80;if(a>h)return e===h?100:80+(e-a)/(e-h)*20;if(a===h)return 100;
  if(a>m)return h===m?120:100+(h-a)/(h-m)*20;return 120;
}
const targetSettingRows=()=>DATA.hedefler?.scopes?.flatMap(s=>(s.rows||[]).map(row=>({scope:s,row})))||[];
const targetIsProrated=(row,source=targetSettings)=>targetHasOwn(source,row.setting_key)?Boolean(source[row.setting_key]):Boolean(row.prorate_default);
const targetRawQuarter=(row,key,prorated=targetIsProrated(row))=>{
  const sourceValue=targetFinite(row.source_quarters?.[key]);
  if(row.source_quarter_contract==='legacy_cumulative'&&!prorated)return sourceValue;
  return targetFinite(row.raw_quarters?.[key]??sourceValue??row.periods?.[key]?.raw_actual??row.periods?.[key]?.actual);
};
function targetPoint(row,periodKey=state.targetPeriod){
  const prorated=targetIsProrated(row),raw=TARGET_QUARTERS.map(key=>targetRawQuarter(row,key,prorated));let endIndex,sourcePeriod;
  if(periodKey==='all'){endIndex=-1;for(let i=raw.length-1;i>=0;i--){if(raw[i]!=null){endIndex=i;break}}if(endIndex<0)return{actual:null,projection:null,score:null,projection_score:null,status:'Veri Yok',filled_quarters:0,source_period:null,rule:targetIsProrated(row)?'Topla ve orantıla':'Son dolu çeyrek'};sourcePeriod=TARGET_QUARTERS[endIndex]}
  else{endIndex=TARGET_QUARTERS.indexOf(periodKey);if(endIndex<0||raw[endIndex]==null)return{actual:null,projection:null,score:null,projection_score:null,status:'Veri Yok',filled_quarters:0,source_period:periodKey,rule:targetIsProrated(row)?'Topla ve orantıla':'Son dolu çeyrek'};sourcePeriod=periodKey}
  const values=raw.slice(0,endIndex+1).filter(v=>v!=null),filled=values.length;
  if(!filled)return{actual:null,projection:null,score:null,projection_score:null,status:'Veri Yok',filled_quarters:0,source_period:sourcePeriod,rule:prorated?'Topla ve orantıla':'Son dolu çeyrek'};
  const actual=prorated?values.reduce((sum,v)=>sum+v,0):values.at(-1),factor=prorated?filled/4:1;
  const effective_threshold=targetFinite(row.threshold)==null?null:Number(row.threshold)*factor,effective_target=targetFinite(row.target)==null?null:Number(row.target)*factor,effective_maximum=targetFinite(row.maximum)==null?null:Number(row.maximum)*factor;
  const projection=prorated?actual/filled*4:actual,score=targetScoreCalc(actual,effective_threshold,effective_target,effective_maximum,row.direction),projection_score=targetScoreCalc(projection,row.threshold,row.target,row.maximum,row.direction);
  return{actual,projection,score,projection_score,status:targetStatusOf(score),projection_status:targetStatusOf(projection_score),filled_quarters:filled,source_period:sourcePeriod,effective_threshold,effective_target,effective_maximum,rule:prorated?'Topla ve orantıla':'Son dolu çeyrek'};
}
function targetSummary(){
  const rows=targetScopeData()?.rows||[],evaluated=rows.map(row=>({row,point:targetPoint(row)})).filter(item=>targetFinite(item.point.score)!=null),scores=evaluated.map(item=>Number(item.point.score)),weighted=evaluated.filter(item=>targetFinite(item.row.weight)!=null&&Number(item.row.weight)>0),counts={'Maksimum':0,'Hedef ve Üzeri':0,'Eşik-Hedef Arası':0,'Eşik Altı':0};
  evaluated.forEach(item=>{if(counts[item.point.status]!=null)counts[item.point.status]++});const weightTotal=weighted.reduce((sum,item)=>sum+Number(item.row.weight),0);
  return{total:rows.length,evaluated:evaluated.length,average:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null,weighted_average:weightTotal?weighted.reduce((sum,item)=>sum+Number(item.point.score)*Number(item.row.weight),0)/weightTotal:null,weighted_count:weighted.length,counts};
}
function targetFormatValue(value,row){
  if(value==null||!Number.isFinite(Number(value)))return'—';
  const v=Number(value),unit=norm(row.unit);
  if(unit.includes('m tl'))return`${num(v/1e6,1)} Mn TL`;
  if(unit.includes('gun'))return`${num(v,1)} gün`;
  if(unit.includes('oran')){
    const ref=Math.max(...[row.threshold,row.target,row.maximum,value].filter(x=>x!=null).map(x=>Math.abs(Number(x))));
    return ref<=1.5?`%${num(v*100,2)}`:num(v,2);
  }
  return num(v,2);
}
function targetFlatRows(){
  const current=targetScopeData(),q=norm(state.targetQuery);
  return(current?.rows||[]).map(r=>{const p=targetPoint(r);return{category:r.category,metric:r.metric,direction:r.direction,weight:r.weight,unit:r.unit,threshold:r.threshold,target:r.target,maximum:r.maximum,q1:targetRawQuarter(r,'q1'),q2:targetRawQuarter(r,'q2'),q3:targetRawQuarter(r,'q3'),q4:targetRawQuarter(r,'q4'),annual_source:p.source_period?String(p.source_period).toUpperCase():'',rule:p.rule,filled_quarters:p.filled_quarters,effective_target:p.effective_target,actual:p.actual,score:p.score,projection:p.projection,projection_score:p.projection_score,status:p.status||'Veri Yok',source:r,point:p}}).filter(r=>(!q||norm(`${r.metric} ${r.category} ${r.unit}`).includes(q))&&(!state.targetStatus||r.status===state.targetStatus));
}
function renderTargetControls(){
  const current=targetScopeData();
  $('targetScopeTabs').innerHTML=(DATA.hedefler?.scopes||[]).map(s=>`<button class="target-choice ${s.key===state.targetScope?'active':''}" type="button" data-target-scope="${esc(s.key)}">${esc(s.label)}</button>`).join('');
  $('targetPeriodTabs').innerHTML=(DATA.hedefler?.periods||[]).map(p=>{const enabled=current?.available_periods?.includes(p.key);return`<button class="target-choice ${p.key===state.targetPeriod?'active':''}" type="button" data-target-period="${esc(p.key)}" ${enabled?'':'disabled'}>${esc(p.short_label)}</button>`}).join('');
  document.querySelectorAll('[data-target-scope]').forEach(btn=>btn.onclick=()=>{state.targetScope=btn.dataset.targetScope;const next=targetScopeData();if(!next.available_periods.includes(state.targetPeriod))state.targetPeriod=next.available_periods.at(-1)||DATA.hedefler.meta.selected_period;renderTargets()});
  document.querySelectorAll('[data-target-period]').forEach(btn=>btn.onclick=()=>{state.targetPeriod=btn.dataset.targetPeriod;renderTargets()});
}
function renderTargetSummary(){
  const current=targetScopeData(),summary=targetSummary(),counts=summary.counts||{},onTarget=(counts['Maksimum']||0)+(counts['Hedef ve Üzeri']||0);
  kpis('targetKpis',[
    {label:'Toplam KPI',value:num(summary.total,0),sub:`${num(summary.evaluated,0)} değerlendirildi`},
    {label:'Ortalama Gerçekleşme',value:`${num(summary.average,1)} puan`,sub:'ağırlıksız ortalama'},
    {label:'Ağırlıklı Gerçekleşme',value:`${num(summary.weighted_average,1)} puan`,sub:`${num(summary.weighted_count,0)} ağırlıklı KPI`},
    {label:'Hedef / Maksimum',value:`${num(onTarget,0)} KPI`,sub:`${num(counts['Maksimum']||0,0)} maksimum`},
    {label:'İzleme Bandı',value:`${num(counts['Eşik-Hedef Arası']||0,0)} KPI`,sub:'eşik-hedef arası'},
    {label:'Aksiyon',value:`${num(counts['Eşik Altı']||0,0)} KPI`,sub:'eşik altı'}
  ]);
  const order=['Maksimum','Hedef ve Üzeri','Eşik-Hedef Arası','Eşik Altı'],den=Math.max(1,summary.evaluated||0);
  $('targetDistributionHint').textContent=`${current?.label||''} · ${targetPeriodData()?.label||''} · ${num(summary.evaluated,0)} KPI`;
  $('targetDistribution').innerHTML=`<div class="target-status-strip">${order.map(k=>`<span style="width:${(counts[k]||0)/den*100}%;background:${TARGET_STATUS[k].color}" title="${esc(k)}: ${counts[k]||0}"></span>`).join('')}</div><div class="target-status-grid">${order.map(k=>`<div class="target-status-item"><i style="background:${TARGET_STATUS[k].color}"></i><span>${esc(TARGET_STATUS[k].short)}</span><b>${num(counts[k]||0,0)}</b></div>`).join('')}</div>`;
}
function renderTargetTable(){
  const rows=targetFlatRows(),periodInfo=targetPeriodData(),annual=state.targetPeriod==='all';
  $('targetMeta').textContent=`${targetScopeData()?.label||''} · ${periodInfo?.label||''} · ${periodInfo?.range||''} · Kaynak ${DATA.hedefler?.meta?.source_file||'—'}`;
  const columns=[
    {key:'category',label:'Kategori'},{key:'metric',label:'Gösterge Adı'},{key:'direction',label:'Yön'},
    {key:'weight',label:'Ağırlık',fmt:v=>num(v,1),cls:'num',plain:v=>v??''},
    {key:'threshold',label:TARGET_COLUMNS.threshold,fmt:(v,r)=>esc(targetFormatValue(v,r.source)),plain:(v,r)=>targetFormatValue(v,r.source)},
    {key:'target',label:TARGET_COLUMNS.target,fmt:(v,r)=>esc(targetFormatValue(v,r.source)),plain:(v,r)=>targetFormatValue(v,r.source)},
    {key:'maximum',label:TARGET_COLUMNS.maximum,fmt:(v,r)=>esc(targetFormatValue(v,r.source)),plain:(v,r)=>targetFormatValue(v,r.source)},
    ...(annual?TARGET_QUARTERS.map(key=>({key,label:TARGET_COLUMNS.quarters[key],fmt:(v,r)=>esc(targetFormatValue(v,r.source)),plain:(v,r)=>targetFormatValue(v,r.source)})):[]),
    {key:'actual',label:TARGET_COLUMNS.actual,fmt:(v,r)=>`<b>${esc(targetFormatValue(v,r.source))}</b><span class="target-score-note">${esc(r.rule)} · ${num(r.filled_quarters,0)} çeyrek · ${esc(r.annual_source||'—')}</span>`,plain:(v,r)=>targetFormatValue(v,r.source)},
    {key:'score',label:TARGET_COLUMNS.score,fmt:(v,r)=>{const color=targetScoreColor(v),width=Math.max(0,Math.min(100,Number(v||0)/120*100));return`<div class="target-score"><div class="target-score-track"><div class="target-score-fill" style="width:${width}%;background:${color}"></div></div><b>${num(v,1)}</b></div><span class="target-score-note">Dönem hedefi: ${esc(targetFormatValue(r.effective_target,r.source))}</span>`},plain:v=>v??''},
    {key:'projection',label:TARGET_COLUMNS.projection,fmt:(v,r)=>{const color=targetScoreColor(r.projection_score),width=Math.max(0,Math.min(100,Number(r.projection_score||0)/120*100));return`<div class="target-projection"><b>${esc(targetFormatValue(v,r.source))}</b><div class="target-score"><div class="target-score-track"><div class="target-score-fill" style="width:${width}%;background:${color}"></div></div><b>${num(r.projection_score,1)}</b></div><small>Projeksiyon skoru · yıllık hedef ölçeği</small></div>`},plain:(v,r)=>targetFormatValue(v,r.source)},
    {key:'status',label:'Durum',fmt:(v,r)=>`<span class="pill" style="background:${targetScoreColor(r.score)};color:${targetScoreText(r.score)}">${esc(v)}</span>`}
  ];
  table('targetTable',rows,columns,{limit:100,filename:`2026_hedefler_${state.targetScope}_${state.targetPeriod}.csv`});
}
function renderTargetSettings(){
  const q=norm($('targetSettingsSearch').value),rows=targetSettingRows().filter(item=>!q||norm(`${item.scope.label} ${item.row.metric} ${item.row.category}`).includes(q));
  $('targetSettingsList').innerHTML=rows.map(({scope:s,row})=>{const checked=targetIsProrated(row,targetSettingsDraft);return`<label class="target-setting-row"><input type="checkbox" data-target-setting="${esc(row.setting_key)}" ${checked?'checked':''}><span><b>${esc(row.metric)}</b><small>${esc(s.label)} · ${esc(row.category)}</small></span><span class="target-setting-rule">${checked?'Topla + hedefi orantıla + projekte et':'Son dolu çeyreği kullan'}</span></label>`}).join('')||'<div class="empty">KPI bulunamadı.</div>';
  $('targetSettingsList').querySelectorAll('[data-target-setting]').forEach(input=>input.onchange=()=>{targetSettingsDraft[input.dataset.targetSetting]=input.checked;renderTargetSettings()});
}
function setAllTargetSettings(value){targetSettingRows().forEach(({row})=>targetSettingsDraft[row.setting_key]=value);renderTargetSettings()}
function saveTargetSettings(){const compact={};targetSettingRows().forEach(({row})=>{const value=targetIsProrated(row,targetSettingsDraft);if(value!==Boolean(row.prorate_default))compact[row.setting_key]=value});targetSettings=compact;localStorage.setItem(TARGET_SETTINGS_KEY,JSON.stringify(compact));$('targetSettingsPanel').hidden=true;renderTargets()}
function renderTargets(){
  if(!DATA.hedefler){$('view-targets').innerHTML='<article class="card empty">2026 hedef verisi bulunamadı.</article>';return}
  renderTargetControls();renderTargetSummary();renderTargetTable();
  $('targetSearch').value=state.targetQuery;$('targetStatus').value=state.targetStatus;
  $('targetSearch').oninput=debounce(e=>{state.targetQuery=e.target.value;renderTargetTable()},180);
  $('targetStatus').onchange=e=>{state.targetStatus=e.target.value;renderTargetTable()};
  $('targetReset').onclick=()=>{state.targetQuery='';state.targetStatus='';renderTargets()};
  $('targetSettingsToggle').onclick=()=>{const panel=$('targetSettingsPanel');panel.hidden=!panel.hidden;if(!panel.hidden){targetSettingsDraft={...targetSettings};$('targetSettingsSearch').value='';renderTargetSettings()}};
  $('targetSettingsSearch').oninput=renderTargetSettings;$('targetSettingsAll').onclick=()=>setAllTargetSettings(true);$('targetSettingsNone').onclick=()=>setAllTargetSettings(false);$('targetSettingsDefault').onclick=()=>{targetSettingsDraft={};renderTargetSettings()};$('targetSettingsSave').onclick=saveTargetSettings;
}

function drawHireFilters(){makeMulti('hireScope','Üst Bölüm',DATA.hiring.scopes||[],state.hireScope,renderHiring);makeMulti('hireDept','Departman',DATA.hiring.departments||[],state.hireDept,renderHiring);makeMulti('hireTitle','Unvan Grubu',DATA.hiring.title_groups||[],state.hireTitle,renderHiring)}
function drawTurnFilters(){const allMonths=DATA.turnover.months||[],ys=years(allMonths),monthOptions=allMonths.filter(m=>!state.turnYears.size||state.turnYears.has(String(m).slice(0,4)));makeMulti('turnScope','Üst Bölüm',DATA.turnover.scopes||[],state.turnScope,renderTurnover);makeMulti('turnDept','Departman',DATA.turnover.departments||[],state.turnDept,renderTurnover);makeMulti('turnTitle','Unvan Grubu',DATA.turnover.title_groups||[],state.turnTitle,renderTurnover);makeMulti('turnYears','Yıl',ys,state.turnYears,()=>{[...state.turnMonths].forEach(m=>{if(state.turnYears.size&&!state.turnYears.has(String(m).slice(0,4)))state.turnMonths.delete(m)});drawTurnFilters();renderTurnover()});makeMulti('turnMonths','Ay',monthOptions,state.turnMonths,renderTurnover)}
function fillPeriodSelects(){const hireMonths=[...new Set((DATA.hiring.rows||[]).map(r=>r.month).filter(Boolean))].sort(),turnMonths=DATA.turnover.months||[];function fill(yearEl,monthEl,months,stateYear,stateMonth,onchange){const ys=years(months);yearEl.innerHTML='<option value="">Tüm yıllar</option>'+ys.map(y=>`<option>${y}</option>`).join('');yearEl.value=stateYear||ys[0]||'';monthEl.innerHTML='<option value="">Tüm aylar</option>'+monthsForYear(months,yearEl.value).map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');monthEl.value=stateMonth||'';yearEl.onchange=()=>{monthEl.innerHTML='<option value="">Tüm aylar</option>'+monthsForYear(months,yearEl.value).map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');onchange()};monthEl.onchange=onchange}fill($('hireYear'),$('hireMonth'),hireMonths,state.hireYear,state.hireMonth,()=>{state.hireYear=$('hireYear').value;state.hireMonth=$('hireMonth').value;renderHiring()});if(!state.turnYears.size&&!state.turnMonths.size){const latestYear=years(turnMonths)[0];if(latestYear)state.turnYears.add(latestYear)}}
const RENDERERS={hiring:renderHiring,turnover:renderTurnover,promotion:renderPromotions,mandatory:renderMandatory,pool:()=>{},bonus:calcBonus,targets:renderTargets};
function init(){ $('heroMeta').innerHTML=`<span>${num(DATA.meta.person_count,0)} kişi</span><span>${num(DATA.meta.mandatory_count,0)} tarihsel atama</span><span>Son dönem ${esc(DATA.meta.latest_month)}</span><span>${esc(new Date(DATA.meta.generated_at).toLocaleString('tr-TR'))}</span>`;document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{state.view=btn.dataset.view;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===`view-${state.view}`));RENDERERS[state.view]?.()});fillPeriodSelects();drawHireFilters();drawTurnFilters();$('promotionYear').innerHTML='<option value="">Tüm Yıllar</option>'+(DATA.promotions.years||[]).slice().reverse().map(y=>`<option>${y}</option>`).join('');$('promotionYear').value=DATA.meta.latest_month?.slice(0,4)||'';$('applyPromotion').onclick=renderPromotions;$('promotionScope').onchange=renderPromotions;$('hireReset').onclick=()=>{state.hireScope.clear();state.hireDept.clear();state.hireTitle.clear();state.hireYear='';state.hireMonth='';fillPeriodSelects();drawHireFilters();renderHiring()};$('turnReset').onclick=()=>{state.turnScope.clear();state.turnDept.clear();state.turnTitle.clear();state.turnYears.clear();state.turnMonths.clear();fillPeriodSelects();drawTurnFilters();renderTurnover()};const uniq=k=>unique(mandatoryObjects,k);makeMulti('mandScope','Üst Bölüm',uniq('scope'),state.mandScope,()=>{});makeMulti('mandDept','Departman',uniq('departman'),state.mandDept,()=>{});makeMulti('mandStore','Mağaza/Birim',uniq('magaza'),state.mandStore,()=>{});makeMulti('mandTitle','Görev',uniq('gorev'),state.mandTitle,()=>{});makeMulti('mandEvent','Eğitim',uniq('event'),state.mandEvent,()=>{});makeMulti('mandStatus','Durum',uniq('status'),state.mandStatus,()=>{});$('applyMandatory').onclick=applyMandatory;$('mandSearch').onkeydown=e=>{if(e.key==='Enter')applyMandatory()};makeMulti('poolScope','Üst Bölüm',unique(poolPeople,'scope'),state.poolScope,renderPoolSearch);makeMulti('poolDept','Departman',unique(poolPeople,'departman'),state.poolDept,renderPoolSearch);$('poolSearch').addEventListener('input',debounce(renderPoolSearch,225));$('clearPool').onclick=()=>{state.pool.clear();renderPoolSearch();renderPoolChips();$('poolKpis').innerHTML=$('poolChart').innerHTML=$('poolTable').innerHTML=''};$('runPool').onclick=runPool;$('exportPool').onclick=()=>downloadCsv('kisi_havuzu_turnover.csv',state.poolRows,[{key:'month',label:'Dönem'},{key:'start',label:'Dönem Başı'},{key:'end',label:'Dönem Sonu'},{key:'exits',label:'Çıkış'},{key:'avg_headcount',label:'Ort. Çalışan'},{key:'turnover',label:'Turnover'}]);$('poolStart').innerHTML=poolMonths.map(m=>`<option>${m}</option>`).join('');$('poolEnd').innerHTML=poolMonths.map(m=>`<option>${m}</option>`).join('');$('poolStart').value=poolMonths[Math.max(0,poolMonths.length-12)]||'';$('poolEnd').value=poolMonths.at(-1)||'';initBonus();applyMandatory();renderHiring();renderTurnover();renderPromotions();renderPoolSearch();renderPoolChips()}
init();
</script>
</body>
</html>"""
