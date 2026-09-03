(() => {
  'use strict';

  const SKIP = 'script,style,noscript,template,textarea';
  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt', 'data-label', 'data-title'];
  const FALLBACK = Object.freeze({
    'Çalışan Sayısı (Yıllara Göre + 12 Ay Detay)': 'Employee Count (Yearly + 12-Month Detail)',
    '2026 Aylık Detay': '2026 Monthly Detail',
    'Yaş Ort.': 'Avg. Age',
    'Kıdem Ort.': 'Avg. Tenure',
    'Mağaza Kırılım': 'Store Breakdown',
    'Seçili Ay': 'Selected Month',
    'Ücret Hakedişi Ort.': 'Avg. Salary Accrual',
    'Diğer Ort.': 'Avg. Other',
    'Net Ortalama': 'Net Average',
    'Ücret %': 'Salary %',
    'Diğer %': 'Other %',
    'İşgücü Kaybı': 'Workforce Loss',
    'Önceki Ay': 'Previous Month',
    'Önceki Yıl': 'Previous Year',
    'Toplam İzin': 'Total Leave',
    'Kişi Başına Gün 2026': 'Days per Person 2026',
    'Kişi Başına Gün 2025': 'Days per Person 2025',
    'Toplam Brüt TL': 'Total Gross TRY',
    'Seçili Ay - Ayrılma Nedeni 1 (Top 3)': 'Selected Month - Departure Reason 1 (Top 3)',
    'Genel - Ayrılma Nedeni 1 (Top 3)': 'Overall - Departure Reason 1 (Top 3)',
    'Seçili Ay - Neden Kırılımı (Top 3x3)': 'Selected Month - Reason Breakdown (Top 3x3)',
    'Genel - Neden Kırılımı (Top 3x3)': 'Overall - Reason Breakdown (Top 3x3)',
    'Seçili Ay - Hangi Sektöre Geçmeyi Planlıyorsunuz?': 'Selected Month - Which sector do you plan to move to?',
    'Genel - Hangi Sektöre Geçmeyi Planlıyorsunuz?': 'Overall - Which sector do you plan to move to?',
    'Seçili Ay - Yeni pozisyon seviyesi': 'Selected Month - New Position Level',
    'Genel - Yeni pozisyon seviyesi': 'Overall - New Position Level',
    "Seçili Ay - Aurelia'u tavsiye eder misiniz?": 'Selected Month - Would you recommend Aurelia?',
    "Genel - Aurelia'u tavsiye eder misiniz?": 'Overall - Would you recommend Aurelia?',
    'Seçili Ay - Tekrar çalışmayı tercih eder misiniz?': 'Selected Month - Would you choose to work here again?',
    'Genel - Tekrar çalışmayı tercih eder misiniz?': 'Overall - Would you choose to work here again?',
    'Seçili Ay - Çıkış Mülakatı Kapsamı': 'Selected Month - Exit Interview Coverage',
    'Seçili Yıl Toplamı - Çıkış Mülakatı Kapsamı': 'Selected Year Total - Exit Interview Coverage',
    'İSG & Checklist': 'OHS & Checklist',
    'Kritik Aksiyon': 'Critical Action',
    'seçici aksiyon merkezi': 'selective action center',
    'Düşük Örneklem': 'Low Sample',
    '70 altı': 'below 70',
    'Bileşen': 'Component',
    'Satış Akademisi Kanıt': 'Sales Academy Evidence',
    'Enocta Kanıt': 'Enocta Evidence',
    'Zorunlu Kanıt': 'Mandatory Evidence',
    'Checklist Kanıt': 'Checklist Evidence',
    'Toplam Puan': 'Total Score',
    '12 Ay Turnover': '12-Month Turnover',
    'Çıkış nedenleri, norm/fiili yük ve yönetici değişimi birlikte incelenmeli.': 'Exit reasons, planned/actual staffing load, and manager changes should be reviewed together.',
    'Ana Title': 'Primary Title',
    'Satış Akademisi Durumu': 'Sales Academy Status',
    'Son Satış Akademisi': 'Latest Sales Academy',
    'İSG Durumu': 'OHS Status',
    '30 Gün Üstü Oran': 'Over 30 Days Rate',
    '45 Gün Üstü Oran': 'Over 45 Days Rate',
    '▾ Filtre': '▾ Filter',
    'Açık Gün': 'Open Days',
    'Seçili kapsamda veri bulunamadı.': 'No data found in the selected scope.',
    "İşaretli KPI'lar toplanır, dönem hedefleri orantılanır ve yıl sonuna projekte edilir. Ayarlar tarayıcıda saklanır.": 'Selected KPIs are summed, period targets are prorated, and results are projected to year-end. Settings are stored in the browser.',
    '2026 Hedef Gerçekleşmeleri': '2026 Target Achievements',
    'Hedef puanı nasıl hesaplanır?': 'How is the target score calculated?',
    "Q1-Q4 kaynak değerleri bağımsız çeyreklerdir. Eski “1 Ocak–...” kümülatif sütunları algılanırsa toplanacak KPI'lar önce bağımsız çeyreklere ayrılır ve iki kez toplama önlenir. Ayarlarda işaretli KPI'larda dolu çeyrekler toplanır ve dönem hedefleri yıllık hedef ÷ 4 × dolu çeyrek sayısı ile orantılanır. İşaretli olmayan KPI'larda son dolu çeyrek kullanılır. Yıl sonu projeksiyonu işaretli KPI'da kümülatif gerçekleşen ÷ dolu çeyrek × 4, diğerinde son dolu çeyrek değeridir. Eşik hedef 80, yıllık hedef 100, maksimum hedef 120 puana karşılık gelir. Durum renkleri: 80 altı kırmızı; 80 ve üzeri, 100 altı turuncu; 100 ve üzeri, 120 altı açık yeşil; 120 ve üzeri koyu yeşildir.": 'Q1-Q4 source values are independent quarters. If legacy cumulative columns in the “1 January–...” format are detected, summable KPIs are first separated into independent quarters to prevent double counting. For KPIs selected in Settings, populated quarters are summed and period targets are prorated as annual target ÷ 4 × populated-quarter count. For unselected KPIs, the latest populated quarter is used. Year-end projection is cumulative actual ÷ populated-quarter count × 4 for selected KPIs, and the latest populated-quarter value for others. The threshold target corresponds to 80 points, annual target to 100, and maximum target to 120. Status colors: below 80 red; 80 to below 100 orange; 100 to below 120 light green; 120 and above dark green.',
    'tekil aktif sicil': 'unique active employee IDs',
    'Akademi Açığı': 'Academy Gap',
    'katılmayan tekil çalışan': 'unique non-attending employees',
    'Checklist Açığı': 'Checklist Gap',
    '0/10/20% eşikleri': '0/10/20% thresholds',
    'norm kaynağındaki mağaza': 'store in staffing-plan source',
    'Eksik Pozisyon': 'Missing Positions',
    'pozisyon kırılımı': 'position breakdown',
    'Fazla Pozisyon': 'Excess Positions',
    'seçili + önceki ay': 'selected + previous month',
    '.gs. kapsamı': '.gs. scope',
    'mağaza grubu': 'store group',
    'Norm / Fiili Kadro Takibi': 'Planned / Actual Staffing Tracking',
    'Kaynak / üretim': 'Source / Generated',
    'Sicil veya ad soyad ara': 'Search employee ID or full name',
    'Gereken Saat': 'Required Hours',
    'All Departments · All Years · ay grupları soldan sağa en güncel dönemden geçmişe sıralıdır.': 'All Departments · All Years · month groups are ordered from the latest period to the oldest, left to right.',
    'e.g. 08:00-17:45 = 9,75 saat. Resmi tatil, yarım gün ve erken çıkış kuralları bu genel ayarın üstüne özel istisna olarak çalışır.': 'e.g. 08:00-17:45 = 9.75 hours. Public-holiday, half-day, and early-departure rules operate as exceptions on top of this general setting.',
    'Önceki Aya Göre': 'Vs Previous Month',
    'cikis': 'exit',
    'Kritik Takip': 'Critical Follow-up',
    'Gelişim Fırsatı': 'Development Opportunity',
    'Veri Eksik': 'Data Missing',
    'Performans': 'Performance',
    'Satış Akademisi': 'Sales Academy',
    'Zorunlu': 'Mandatory',
    'İSG': 'OHS',
    'Veri Analisti': 'Data Analyst',
    'Satış Danışmanı': 'Sales Associate',
    'Mağaza Müdür Yardımcısı': 'Assistant Store Manager',
    'Mağaza Müdürü': 'Store Manager',
    'Dış Aday': 'External Candidate'
  });

  const fold = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
  const FALLBACK_FOLDED = Object.freeze(Object.fromEntries(Object.entries(FALLBACK).map(([key, value]) => [fold(key), value])));

  function baseTranslate(value) {
    const translate = globalThis.AizanoiHrEnglish?.translate;
    return typeof translate === 'function' ? translate(value) : value;
  }

  function exactTranslate(value) {
    const source = String(value ?? '').replace(/\s+/g, ' ').trim();
    return FALLBACK[source] || FALLBACK_FOLDED[fold(source)] || null;
  }

  function preserveSpace(original, translated) {
    const leading = String(original).match(/^\s*/)?.[0] || '';
    const trailing = String(original).match(/\s*$/)?.[0] || '';
    return leading + translated + trailing;
  }

  function translateMixed(value) {
    const raw = String(value ?? '');
    const source = raw.replace(/\s+/g, ' ').trim();
    if (!source) return raw;

    const base = baseTranslate(source);
    if (base !== source) return preserveSpace(raw, base);
    const exact = exactTranslate(source);
    if (exact) return preserveSpace(raw, exact);

    let match = source.match(/^(Synthetic Employee \d+) \? (Kritik Takip|Gelişim Fırsatı|Veri Eksik) \? Risk ([\d.]+) \? Performans ([\d.]+)$/u);
    if (match) return preserveSpace(raw, `${match[1]} ? ${exactTranslate(match[2])} ? Risk ${match[3]} ? Performance ${match[4]}`);

    match = source.match(/^(\d{8}) · (Head Office|Store) · (.+?) · (Veri Analisti|Satış Danışmanı|Mağaza Müdür Yardımcısı|Mağaza Müdürü)$/u);
    if (match) return preserveSpace(raw, `${match[1]} · ${match[2]} · ${match[3]} · ${exactTranslate(match[4])}`);

    match = source.match(/^(.+?) · (Satış Akademisi|Zorunlu|İSG): (.+)$/u);
    if (match) return preserveSpace(raw, `${match[1]} · ${exactTranslate(match[2])}: ${match[3]}`);

    match = source.match(/^Total score (.+?) · Çok zayıf odak bileşen: (.+?) · Turnover üst %10: (.+?) · (\d+) bileşen (\d+) altı$/u);
    if (match) return preserveSpace(raw, `Total score ${match[1]} · Very weak focus component: ${match[2]} · Turnover top 10%: ${match[3]} · ${match[4]} components below ${match[5]}`);

    match = source.match(/^(\d+) Çıkış \/ (.+?) ort\. Çalışan$/u);
    if (match) return preserveSpace(raw, `${match[1]} Exits / ${match[2]} Avg. Employees`);
    match = source.match(/^Dış Aday → (Mağaza Müdür Yardımcısı|Mağaza Müdürü): (\d+)$/u);
    if (match) return preserveSpace(raw, `External Candidate → ${exactTranslate(match[1])}: ${match[2]}`);
    match = source.match(/^(\d+) tekil kişi$/u);
    if (match) return preserveSpace(raw, `${match[1]} unique people`);
    match = source.match(/^Zorunlu Eğitim: (.+)$/u);
    if (match) return preserveSpace(raw, `Mandatory Training: ${baseTranslate(match[1])}`);
    match = source.match(/^İlk (\d+) \/ (\d+) filtreli kayıt gösteriliyor\. CSV filtreli tam listeyi indirir\.$/u);
    if (match) return preserveSpace(raw, `First ${match[1]} / ${match[2]} filtered records shown. CSV downloads the full filtered list.`);

    match = source.match(/^synthetic-workforce-roster · (\d+) eşleşen \/ (\d+) eşleşmeyen sicil$/u);
    if (match) return preserveSpace(raw, `synthetic-workforce-roster · ${match[1]} matched / ${match[2]} unmatched employee IDs`);
    match = source.match(/^([\d, ]+) PDKS satırı · (\d+) (?:benzersiz sicil|unique employee IDs) · (.+)$/u);
    if (match) {
      const months = match[3].split(/,\s*/u).map((part) => baseTranslate(part)).join(', ');
      return preserveSpace(raw, `${match[1].replace(/,\s+/g, ',')} PDKS rows · ${match[2]} unique employee IDs · ${months}`);
    }
    match = source.match(/^([\d.]+) saat \/ ([\d:–-]+) standart iş günü$/u);
    if (match) return preserveSpace(raw, `${match[1]} hours / standard workday ${match[2]}`);
    match = source.match(/^e\.g\. (.+?) veya (.+)$/u);
    if (match) return preserveSpace(raw, `e.g. ${match[1]} or ${match[2]}`);
    match = source.match(/^((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}): (.+?) saat \/ (.+?) saat$/u);
    if (match) return preserveSpace(raw, `${match[1]}: ${match[2]} hours / ${match[3]} hours`);

    if (source.includes(' · ')) {
      const parts = source.split(' · ');
      const translated = parts.map((part) => {
        const fromBase = baseTranslate(part);
        if (fromBase !== part) return fromBase;
        return exactTranslate(part) || part;
      });
      if (translated.some((part, index) => part !== parts[index])) return preserveSpace(raw, translated.join(' · '));
    }
    return raw;
  }

  function translateTextNode(node) {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP)) return;
    const next = translateMixed(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function translateAttrs(element) {
    if (!(element instanceof Element) || element.closest(SKIP)) return;
    for (const name of ATTRS) {
      if (!element.hasAttribute(name)) continue;
      const value = element.getAttribute(name);
      const next = translateMixed(value);
      if (next !== value) element.setAttribute(name, next);
    }
  }

  function translateSurface(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (!(root instanceof Element) || root.closest(SKIP)) return;
    translateAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let current;
    while ((current = walker.nextNode())) {
      if (current.nodeType === Node.TEXT_NODE) translateTextNode(current);
      else translateAttrs(current);
    }
  }

  function patchCanvas(name) {
    const proto = globalThis.CanvasRenderingContext2D?.prototype;
    if (!proto || typeof proto[name] !== 'function') return;
    const original = proto[name];
    Object.defineProperty(proto, name, {
      configurable: true,
      writable: true,
      value(text, ...args) { return original.call(this, translateMixed(text), ...args); },
    });
  }

  patchCanvas('fillText');
  patchCanvas('strokeText');
  patchCanvas('measureText');

  function boot() {
    translateSurface(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') {
          translateTextNode(record.target);
          continue;
        }
        for (const node of record.addedNodes) translateSurface(node);
        if (record.type === 'attributes') translateAttrs(record.target);
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });

    // Some dashboards finish their first render around DOMContentLoaded. Keep the
    // observer for all later mutations, and sweep the initial post-render frames
    // so mixed visitor-facing attributes cannot escape the presentation layer.
    const postRenderSweep = () => translateSurface(document.body);
    queueMicrotask(postRenderSweep);
    requestAnimationFrame(() => {
      postRenderSweep();
      requestAnimationFrame(postRenderSweep);
    });
    window.addEventListener('load', postRenderSweep, { once: true });
  }

  globalThis.AizanoiHrEnglishVisible = Object.freeze({ translate: translateMixed });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else queueMicrotask(boot);
})();
