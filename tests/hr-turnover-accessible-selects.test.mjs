import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const template=readFileSync(new URL('../analytics/dashboards/hr-analytics-full-set/production-pipeline/turnover_dashboard_template.py',import.meta.url),'utf8');
const publicHtml=readFileSync(new URL('../frontend/analytics/dashboards/hr-analytics-full-set/workforce-turnover/index.html',import.meta.url),'utf8');

const SELECT_NAMES=Object.freeze({
  'scope-filter':'Kapsam',
  'type-filter':'Turnover Türü',
  'start-filter':'Başlangıç Dönemi',
  'end-filter':'Bitiş Dönemi',
  'region-filter':'Bölge',
  'store-filter':'Mağaza',
  'department-filter':'Departman',
  'city-filter':'Şehir',
  'gender-filter':'Cinsiyet',
  'contract-filter':'Sözleşme Türü',
  'title-filter':'Title',
  'scope-trend-mode':'Trend Hesaplama Modu',
});

function assertAccessibleSelects(source,label){
  for(const [id,name] of Object.entries(SELECT_NAMES)){
    const pattern=new RegExp(`<select\\s+class="select"\\s+id="${id}"\\s+aria-label="${name}"`);
    assert.match(source,pattern,`${label}: #${id} must expose the canonical accessible name “${name}”`);
  }
}

test('Turnover generator and public artifact keep accessible names on every primary select',()=>{
  assertAccessibleSelects(template,'template');
  assertAccessibleSelects(publicHtml,'public dashboard');
});
