const NEW_HR_DASHBOARDS = Object.freeze([
  Object.freeze({ title:'Personnel Attendance Control System (PACS)', summary:'Workforce attendance tracking, shift adherence and compliance intelligence over 22,080 synthetic swipe records with overview matrix, organization/person/calendar detail and Excel loader.', href:'/analytics/dashboards/new-hr-collection/pacs/' }),
  Object.freeze({ title:'Recruitment Analytics Dashboard', summary:'Talent acquisition operations on 4,823 synthetic requisition records: executive dashboard, cumulative pivot, pipeline, placements and data dictionary.', href:'/analytics/dashboards/new-hr-collection/recruitment-analytics/' }),
]);

/**
 * Canonical public Analytics catalog. A new production collection is registered
 * here once, then both /analytics/ and the AizanoiOS Analytics app consume it.
 */
export const ANALYTICS_SETS = Object.freeze([
  Object.freeze({
    id:'aizanoi-markets',
    eyebrow:'MARKET INTELLIGENCE · MULTI-PROVIDER DAILY CLOSE DATA',
    title:'Aizanoi Markets',
    accent:'US + Crypto',
    interfaceLanguage:'English',
    interfaceLanguageCode:'en',
    summary:'A static-first market intelligence surface covering a focused union of major US equity indexes and a selected 35-asset crypto universe, with daily history from 2019 or the provider’s first availability and recent four-hour observations where available.',
    description:'Search, rank and inspect market breadth, momentum, volatility, drawdown and trend signals. Static data shards are refreshed by private automation and loaded on demand.',
    landing:'/analytics/markets/',
    source:'https://github.com/aizanoianalytics/aizanoi-analytics/tree/main/scripts/markets',
    sourceLabel:'Source & methodology',
    metrics:Object.freeze([
      Object.freeze({ value:'US', label:'major listed exchanges, excluding OTC' }),
      Object.freeze({ value:'35', label:'selected crypto assets' }),
      Object.freeze({ value:'2019+', label:'daily market history' }),
      Object.freeze({ value:'4H', label:'recent interval where available' }),
    ]),
    dashboards:Object.freeze([
      Object.freeze({ title:'US Markets', summary:'Active equities across Nasdaq, NYSE, NYSE American, NYSE Arca and Cboe BZX, excluding OTC venues, ETFs and test listings.', href:'/analytics/markets/?market=us' }),
      Object.freeze({ title:'Crypto', summary:'The selected 35-asset crypto universe with corrected upstream instrument identifiers and the same analytical lens.', href:'/analytics/markets/?market=crypto' }),
    ]),
  }),
  Object.freeze({
    id:'new-hr-collection',
    eyebrow:'LIVE ANALYTICS COLLECTION · SYNTHETIC SAMPLE DATA',
    title:'New HR',
    accent:'Collection',
    interfaceLanguage:'English',
    interfaceLanguageCode:'en',
    summary:'Two standalone HR analytics surfaces shipped as full-featured self-contained documents: a Personnel Attendance Control System (PACS) over 22,080 synthetic swipe records and a Recruitment Analytics dashboard over 4,823 synthetic requisition records.',
    description:'Attendance adherence, compliance and talent acquisition analytics on fictional sample data. Each dashboard loads its own data locally and offers Excel import plus portable HTML export without any server.',
    landing:'/analytics/dashboards/new-hr-collection/',
    source:'https://github.com/aizanoianalytics/aizanoi-analytics/tree/main/analytics/dashboards/new-hr-collection',
    sourceLabel:'Source & documentation',
    metrics:Object.freeze([
      Object.freeze({ value:'2', label:'live dashboard surfaces' }),
      Object.freeze({ value:'26,903', label:'synthetic records' }),
      Object.freeze({ value:'0', label:'real employee records' }),
    ]),
    dashboards:NEW_HR_DASHBOARDS,
  }),
]);

export function analyticsSetById(id) {
  return ANALYTICS_SETS.find((set) => set.id === id) || null;
}
