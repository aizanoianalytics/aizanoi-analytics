const HR_DASHBOARDS = Object.freeze([
  Object.freeze({ title:'HR Executive Board — Full History', summary:'Workforce overview, organization, hiring and exits, tenure, promotions, learning and risk across the complete synthetic history.', href:'/analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/' }),
  Object.freeze({ title:'HR Executive Board — 2024 to Present', summary:'A current-period executive lens across workforce movement, organization, tenure, promotions, learning and risk.', href:'/analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/' }),
  Object.freeze({ title:'HR Administration & Deep Dive', summary:'Synthetic person search, employment timelines, performance, learning, discipline and exit analysis.', href:'/analytics/dashboards/hr-analytics-full-set/hr-administration-deep-dive/' }),
  Object.freeze({ title:'Store Operations Tracking', summary:'Regional and store comparison, hiring, promotion, turnover, forecast, learning and workforce operations.', href:'/analytics/dashboards/hr-analytics-full-set/store-operations-tracking/' }),
  Object.freeze({ title:'Workforce Turnover Analytics', summary:'Overview, comparison, forecast, early turnover, exit explorer, survival and risk, settings and exports.', href:'/analytics/dashboards/hr-analytics-full-set/workforce-turnover/' }),
  Object.freeze({ title:'Store Learning & Compliance', summary:'Participation, safety, mandatory learning, checklists, turnover and compliance scoring.', href:'/analytics/dashboards/hr-analytics-full-set/store-learning-compliance/' }),
  Object.freeze({ title:'Learning Academy Analytics', summary:'Training delivery, compliance, planning, exams, development journeys and academy performance.', href:'/analytics/dashboards/hr-analytics-full-set/learning-academy-analytics/' }),
  Object.freeze({ title:'Performance, Hiring & Turnover', summary:'Performance, time to hire, early turnover, target attainment and store scorecards.', href:'/analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/' }),
  Object.freeze({ title:'Corporate Goals Dashboard', summary:'Strategic goals, KPI progress, target status and an executive summary for a fictional organization.', href:'/analytics/dashboards/hr-analytics-full-set/corporate-goals/' }),
  Object.freeze({ title:'Workforce Time & Attendance', summary:'Schedules, worked versus required hours, exceptions, synthetic person detail, monthly balance and spreadsheet export.', href:'/analytics/dashboards/hr-analytics-full-set/workforce-time-attendance/' }),
]);

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
    id:'hr-analytics-full-set',
    eyebrow:'LIVE ANALYTICS COLLECTION · SYNTHETIC DATA',
    title:'HR Analytics',
    accent:'Full Set',
    interfaceLanguage:'English',
    interfaceLanguageCode:'en',
    summary:'One complete HR analytics product built by Aizanoi Analytics: ten connected dashboard surfaces, rebuilt from 27 synthetic source workbooks with the original controls, drill-downs and exports intact.',
    description:'Ten original HR dashboard products from one unchanged analytics production line. Public outputs use fictional organizations and synthetic people only.',
    landing:'/analytics/dashboards/hr-analytics-full-set/',
    source:'https://github.com/aizanoianalytics/aizanoi-analytics/tree/main/analytics/dashboards/hr-analytics-full-set',
    sourceLabel:'Source & documentation',
    download:'/analytics/dashboards/hr-analytics-full-set/downloads/hr-analytics-full-set-synthetic-output.xlsx',
    metrics:Object.freeze([
      Object.freeze({ value:'10', label:'live dashboard surfaces' }),
      Object.freeze({ value:'27', label:'synthetic source workbooks' }),
      Object.freeze({ value:'22', label:'parity-verified Python modules' }),
      Object.freeze({ value:'0', label:'real employee records' }),
    ]),
    dashboards:HR_DASHBOARDS,
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
