import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateFx, fxAt } from '../frontend/arcade/trade-arena/engine/fx.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMarket, snapshot, DAY } from '../frontend/arcade/trade-arena/engine/market.js';
import { runRace, benchmarks } from '../frontend/arcade/trade-arena/engine/sim.js';
const day = Date.parse('2025-01-03'); // Friday

test('ECB derivation is reproducible and only admits positive modern TRY fixings the following UTC day', () => {
  const code = `import importlib.util,io,zipfile,json
spec=importlib.util.spec_from_file_location('fx','scripts/trade-arena/update_fx.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
b=io.BytesIO()
with zipfile.ZipFile(b,'w') as z: z.writestr('eurofxref-hist.csv','Date,USD,TRY,\\n2025-01-03,2,40,\\n2025-01-02,2,20,\\n2004-01-01,2,N/A,\\n')
print(json.dumps(m.derive(b.getvalue())))`;
  const out=JSON.parse(execFileSync('python3',['-c',code],{encoding:'utf8'}));
  assert.deepEqual(out.available,[day,day+DAY]);
  assert.deepEqual(out.tryPerUsd,[10,20]);
  assert.equal(out.source.formula,'TRY per EUR / USD per EUR');
  assert.equal(fxAt(validateFx(out),day),10);
});
test('mixed margin liquidation waits for an actual exchange session instead of trading a carried weekend quote', async () => {
  const f={...fx,tryPerUsd:[10,100/15,10]};
  const m=prepareMarket(series,{...cfg,start:day-DAY},{},{},f);
  const h={init:async()=>({ok:true}),onBar:async()=>({ok:true,value:{TR:-1}}),close(){}};
  const a=(await runRace(m,[{id:'r',name:'short TR',host:h}],{cash:1000,allowShort:true,maxGross:1,feeBps:{stocks:0,crypto:0},slippageBps:{stocks:0,crypto:0},borrowBps:{stocks:0},marginBps:0,minTradeValue:0})).accounts[0];
  assert.ok(a.trades.some(t=>t.kind==='liquidated'));
  assert.ok(a.trades.every(t=>m.assets.find(x=>x.id===t.s).idx.has(m.timeline[t.k])), 'even forced liquidations require a genuine session bar');
});

test('committed ECB artifact validates and records the exact independently downloaded source', () => {
  const f=validateFx(JSON.parse(readFileSync(new URL('../frontend/arcade/trade-arena/data/fx-usdtry.json',import.meta.url),'utf8')));
  assert.equal(f.source.archiveSha256,'971a5cbf650f9e96663cf1218801c3054249e2bb57070d427db5a44931393f59');
  assert.equal(f.source.rows,f.available.length);
  assert.equal(f.available.length,5592);
  assert.equal(f.available[0],Date.parse('2005-01-04'));
  assert.equal(f.available.at(-1),Date.parse('2026-11-05'));
  for (const bad of [null,{}, {...fx,tryPerUsd:[0,20,40]}, {...fx,available:[day,day,day+DAY]}]) assert.throws(()=>validateFx(bad),/FX/);
});

test('mixed target weights use the current venue open without introducing gap-driven churn', async () => {
  const ss=structuredClone(series); ss[1].cols=cols(ss[1].cols.t,[50,55,60]);
  const m=prepareMarket(ss,{...cfg,start:day-DAY},{},{},fx);
  const a=(await runRace(m,[{id:'r',name:'US hold',host:{init:async()=>({ok:true}),onBar:async()=>({ok:true,value:{US:1}}),close(){}}}],{cash:1000,feeBps:{stocks:0,crypto:0},slippageBps:{stocks:0,crypto:0},minTradeValue:0})).accounts[0];
  assert.equal(a.trades.length,1, 'holding a 100% target must not sell an opening gap');
  assert.ok(Math.abs(a.cash)<1e-8);
});

const cols = (ts, prices) => ({ t:ts, o:prices, h:prices, l:prices, c:prices, v:prices.map(() => 1000) });
const fx = { version:1, available:[day-DAY,day+DAY,day+3*DAY], tryPerUsd:[10,20,40] };
const cfg = { market:'mixed', tf:'1d', start:day, end:day+3*DAY, seed:7 };
const series = [
  { symbol:'TR', market:'stocks', exchange:'BIST', currency:'TRY', cols:cols([day-DAY,day,day+3*DAY],[100,100,100]) },
  { symbol:'US', market:'stocks', currency:'USD', cols:cols([day-DAY,day,day+3*DAY],[50,50,50]) },
  { symbol:'BTC', market:'crypto', cols:cols([day-DAY,day,day+DAY,day+2*DAY,day+3*DAY],[10,10,10,10,10]) },
];
test('mixed prices use causal historical FX and revalue closed BIST sessions without enabling fills', () => {
  const m = prepareMarket(series, cfg, {}, {}, fx);
  assert.equal(m.assets.find(a => a.symbol==='TR').currency, 'USD');
  assert.equal(snapshot(m,0).assets.TR.bar.c, 10);
  assert.equal(snapshot(m,1).assets.TR.bar.c, 5);
  assert.equal(snapshot(m,1).assets.TR.tradable, false);
  assert.equal(snapshot(m,2).assets.TR.bar.c, 5);
  assert.equal(snapshot(m,3).assets.TR.bar.c, 2.5);
  assert.equal(snapshot(m,3).assets.US.bar.c, 50);
  const changed = {...fx,tryPerUsd:[10,20,400]};
  assert.deepEqual(snapshot(prepareMarket(series,cfg,{}, {},changed),1),snapshot(m,1),'future FX cannot change earlier observations');
  assert.throws(() => prepareMarket(series,cfg), /FX/);
  assert.throws(() => prepareMarket(series,cfg,{}, {},{...fx,available:[day-9*DAY],tryPerUsd:[10]}), /FX.*stale/);
  const pure = prepareMarket([series[0]],{...cfg,market:'bist'});
  assert.equal(pure.assets[0].currency,'TRY');
  assert.equal(snapshot(pure,0).assets.TR.bar.c,100);
});

test('mixed ledger and hold benchmarks revalue FX on weekends and wait for real sessions', async () => {
  const m=prepareMarket(series,{...cfg,start:day-DAY},{},{},fx);
  const rules={cash:1000,feeBps:{stocks:0,crypto:0},slippageBps:{stocks:0,crypto:0},minTradeValue:0};
  const result=await runRace(m,[{id:'tr',name:'TR holder',host:{init:async()=>({ok:true}),onBar:async()=>({ok:true,value:{TR:1}}),close(){}}}],rules);
  assert.deepEqual(result.accounts[0].curve,[1000,1000,500,500,250]);
  assert.equal(result.accounts[0].trades[0].price,10);
  assert.ok(result.accounts[0].trades.every(t=>[1,4].includes(t.k)), 'no weekend fills');
  const benchmark=benchmarks({...m,assets:m.assets.filter(a=>a.symbol==='TR')},rules);
  assert.deepEqual(benchmark['Equal weight'],[1000,1000,500,500,250]);
});

test('mixed races publish both exchange benchmarks and select beta benchmark per asset', () => {
  const context={SPY:series[1].cols,XU100:series[0].cols};
  const m=prepareMarket(series,{...cfg,start:day-DAY},context,{},fx);
  const b=benchmarks(m,{cash:1000,feeBps:{stocks:0,crypto:0},slippageBps:{stocks:0,crypto:0}});
  assert.deepEqual(b['BIST 100 hold'],[1000,1000,500,500,250]);
  assert.deepEqual(b['S&P 500 hold'],[1000,1000,1000,1000,1000]);
  assert.equal(m.assets.find(a=>a.symbol==='TR').benchmark,'XU100');
  assert.equal(m.assets.find(a=>a.symbol==='US').benchmark,'SPY');
});

test('BIST orders cannot size against a later US open or spend its future sale proceeds', async () => {
  const run=async usOpen=>{
    const ss=structuredClone(series);
    ss[1].cols.o[2]=usOpen;
    // Start Thursday; buy the US stock on Friday, rotate into BIST on Monday.
    const m=prepareMarket(ss,{...cfg,start:day-DAY},{},{},fx);
    const h={init:async()=>({ok:true}),onBar:async s=>({ok:true,value:s.step===0?{US:1}:{TR:1}}),close(){}};
    return (await runRace(m,[{id:'r',name:'r',host:h}],{cash:1000,feeBps:{stocks:0,crypto:0},slippageBps:{stocks:0,crypto:0},minTradeValue:0})).accounts[0];
  };
  for (const open of [50,5000]) {
    const a=await run(open);
    assert.ok(!a.trades.some(t=>t.k===4 && t.s==='TR'), 'Monday BIST open precedes US sale; cash not available yet');
    assert.ok(a.trades.some(t=>t.k===4 && t.s==='US' && t.side==='sell'));
  }
});
