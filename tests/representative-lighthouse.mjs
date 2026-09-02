import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const base=process.env.AIZANOI_PRODUCTION_BASE_URL||'http://127.0.0.1:4177';
const outputDir=process.env.AIZANOI_LIGHTHOUSE_DIR||'artifacts/diagnostics/representative-lighthouse';
const requiredRuns=Math.max(3,Number(process.env.AIZANOI_LIGHTHOUSE_ATTEMPTS)||3);
const maxLaunches=requiredRuns+2;
const lighthouseBin=process.platform==='win32'?'node_modules/.bin/lighthouse.cmd':'node_modules/.bin/lighthouse';

const routes=[
  {id:'root',route:'/',profile:'shell'},
  {id:'news',route:'/news/',profile:'static'},
  {id:'article',route:'/news/2026-09-02/aisi-cyber-eval-incident/',profile:'static'},
  {id:'analytics',route:'/analytics/',profile:'static'},
  {id:'dashboard',route:'/analytics/dashboards/hr-analytics-full-set/workforce-turnover/',profile:'dashboard'},
  {id:'worlds',route:'/worlds/',profile:'static'},
  {id:'historic',route:'/historic-world/',profile:'webgl'},
];

const budgets={
  shell:{performance:.80,accessibility:.90,'best-practices':.90,seo:.90,tbt:1500,lcp:5000,cls:.10},
  static:{performance:.90,accessibility:.95,'best-practices':.90,seo:.95,tbt:700,lcp:4000,cls:.10},
  dashboard:{performance:.80,accessibility:.90,'best-practices':.90,seo:.95,tbt:1800,lcp:5000,cls:.10},
  webgl:{performance:.40,accessibility:.90,'best-practices':.90,seo:.90,tbt:10000,lcp:7500,cls:.10},
};
const requiredAudits=['document-title','meta-description','viewport','http-status-code','is-crawlable'];

function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}
function category(report,name){
  const value=report.categories?.[name]?.score;
  assert.equal(typeof value,'number',`Lighthouse category ${name} missing`);
  return value;
}
function auditNumber(report,id){
  const value=report.audits?.[id]?.numericValue;
  assert.equal(typeof value,'number',`Lighthouse audit ${id} numericValue missing`);
  return value;
}
function auditScore(report,id){
  const audit=report.audits?.[id];
  if(!audit||audit.score===null)return 1;
  assert.equal(typeof audit.score,'number',`Lighthouse audit ${id} score missing`);
  return audit.score;
}

mkdirSync(outputDir,{recursive:true});
const summaries=[];

for(const spec of routes){
  const reports=[];
  const failedLaunches=[];
  let launch=0;
  while(reports.length<requiredRuns&&launch<maxLaunches){
    launch+=1;
    const reportPath=join(outputDir,`${spec.id}-${launch}.json`);
    const logPath=join(outputDir,`${spec.id}-${launch}.log`);
    const run=spawnSync(lighthouseBin,[
      `${base}${spec.route}`,
      '--quiet',
      '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
      '--only-categories=performance,accessibility,best-practices,seo',
      '--output=json',
      `--output-path=${reportPath}`,
    ],{encoding:'utf8',env:process.env,maxBuffer:16*1024*1024});
    writeFileSync(logPath,`${run.stdout||''}${run.stderr||''}${run.error?`\n${run.error.stack||run.error.message}`:''}`);
    if(run.status!==0){
      failedLaunches.push({launch,status:run.status,logPath});
      console.warn(`[lighthouse] ${spec.id}: transient launch ${launch} failed with status ${run.status}; retrying (${reports.length}/${requiredRuns} successful)`);
      continue;
    }
    reports.push(JSON.parse(readFileSync(reportPath,'utf8')));
  }
  assert.equal(reports.length,requiredRuns,`${spec.id} produced only ${reports.length}/${requiredRuns} successful Lighthouse reports after ${launch} launches; failures=${failedLaunches.map((item)=>item.logPath).join(', ')}`);

  const metrics={
    performance:median(reports.map((report)=>category(report,'performance'))),
    accessibility:median(reports.map((report)=>category(report,'accessibility'))),
    'best-practices':median(reports.map((report)=>category(report,'best-practices'))),
    seo:median(reports.map((report)=>category(report,'seo'))),
    tbt:median(reports.map((report)=>auditNumber(report,'total-blocking-time'))),
    lcp:median(reports.map((report)=>auditNumber(report,'largest-contentful-paint'))),
    cls:median(reports.map((report)=>auditNumber(report,'cumulative-layout-shift'))),
  };
  const budget=budgets[spec.profile];
  assert.ok(budget,`Unknown Lighthouse profile ${spec.profile}`);

  for(const name of ['performance','accessibility','best-practices','seo']){
    assert.ok(metrics[name]>=budget[name],`${spec.id} ${name} median ${metrics[name].toFixed(2)} is below ${spec.profile} budget ${budget[name].toFixed(2)}`);
  }
  assert.ok(metrics.tbt<=budget.tbt,`${spec.id} TBT median ${metrics.tbt.toFixed(0)}ms exceeds ${spec.profile} budget ${budget.tbt}ms`);
  assert.ok(metrics.lcp<=budget.lcp,`${spec.id} LCP median ${metrics.lcp.toFixed(0)}ms exceeds ${spec.profile} budget ${budget.lcp}ms`);
  assert.ok(metrics.cls<=budget.cls,`${spec.id} CLS median ${metrics.cls.toFixed(3)} exceeds ${spec.profile} budget ${budget.cls}`);

  for(const id of requiredAudits){
    const score=median(reports.map((report)=>auditScore(report,id)));
    assert.ok(score>=.90,`${spec.id} ${id} median audit score ${score.toFixed(2)} is below 0.90`);
  }

  const summary={id:spec.id,route:spec.route,profile:spec.profile,successfulRuns:reports.length,launches:launch,failedLaunches,metrics,budget};
  summaries.push(summary);
  console.log(`[lighthouse] ${spec.id}/${spec.profile}: perf=${(metrics.performance*100).toFixed(0)} a11y=${(metrics.accessibility*100).toFixed(0)} bp=${(metrics['best-practices']*100).toFixed(0)} seo=${(metrics.seo*100).toFixed(0)} TBT=${metrics.tbt.toFixed(0)}ms LCP=${metrics.lcp.toFixed(0)}ms CLS=${metrics.cls.toFixed(3)} launches=${launch}`);
}

writeFileSync(join(outputDir,'summary.json'),`${JSON.stringify({routes:summaries},null,2)}\n`);
console.log(`Representative Lighthouse gate passed across ${routes.length} routes using median of ${requiredRuns} successful runs per route.`);
