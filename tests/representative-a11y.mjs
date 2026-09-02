import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import axeCore from 'axe-core';

const base=process.env.AIZANOI_PRODUCTION_BASE_URL||'http://127.0.0.1:4176';
const reportPath=process.env.AIZANOI_A11Y_REPORT||'artifacts/diagnostics/representative-a11y.json';
const routes=[
  {id:'root',route:'/',settle:500},
  {id:'news',route:'/news/',settle:250},
  {id:'article',route:'/news/2026-09-02/aisi-cyber-eval-incident/',settle:250},
  {id:'analytics',route:'/analytics/',settle:250},
  {id:'dashboard',route:'/analytics/dashboards/hr-analytics-full-set/workforce-turnover/',settle:600},
  {id:'worlds',route:'/worlds/',settle:250},
  {id:'historic',route:'/historic-world/',settle:1200},
];

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({
  viewport:{width:1280,height:900},
  serviceWorkers:'block',
  bypassCSP:true,
});
const report=[];
const blocking=[];

try{
  for(const spec of routes){
    const page=await context.newPage();
    try{
      const response=await page.goto(`${base}${spec.route}`,{waitUntil:'domcontentloaded',timeout:30000});
      if(!response?.ok())throw new Error(`${spec.id} returned HTTP ${response?.status()}`);
      await page.locator('body').waitFor({state:'visible',timeout:15000});
      await page.waitForTimeout(spec.settle);
      await page.addScriptTag({content:axeCore.source});
      const result=await page.evaluate(async()=>await axe.run(document,{
        runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']},
      }));
      const violations=result.violations.map(({id,impact,description,help,helpUrl,nodes})=>({
        id,impact,description,help,helpUrl,
        nodes:nodes.map(({target,html,failureSummary})=>({target,html,failureSummary})),
      }));
      const counts={
        critical:violations.filter((item)=>item.impact==='critical').length,
        serious:violations.filter((item)=>item.impact==='serious').length,
        moderate:violations.filter((item)=>item.impact==='moderate').length,
        minor:violations.filter((item)=>item.impact==='minor').length,
      };
      report.push({...spec,counts,violations});
      for(const violation of violations){
        if(violation.impact==='critical'||violation.impact==='serious')blocking.push({route:spec.route,...violation});
      }
      console.log(`[a11y] ${spec.id}: critical=${counts.critical} serious=${counts.serious} moderate=${counts.moderate} minor=${counts.minor}`);
    }finally{
      await page.close();
    }
  }
}finally{
  await context.close();
  await browser.close();
}

mkdirSync(dirname(reportPath),{recursive:true});
writeFileSync(reportPath,`${JSON.stringify({routes:report,blocking},null,2)}\n`);

if(blocking.length){
  const summary=blocking.map((item)=>`${item.route}: ${item.id} (${item.impact})`).join('; ');
  throw new Error(`Representative accessibility gate found ${blocking.length} blocking violation(s): ${summary}`);
}
console.log(`Representative accessibility gate passed across ${routes.length} routes.`);
