// Trade Arena Bot - Adaptive Multi-Factor Strategy
let info = null;
let lastRebalance = -10000;
let lastTargets = {};

function isFiniteNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

module.exports = {
  name: "Apex",
  init(i) { info = i; },
  onBar(state) {
    try {
      const assets = state.assets || {};
      const syms = Object.keys(assets);
      if (syms.length === 0) return null;

      const rules = (info && info.rules) ? info.rules : {};
      const allowShort = !!rules.allowShort;
      const maxGross = (typeof rules.maxGross === "number") ? rules.maxGross : 1;

      // Trade more frequently
      if (state.step - lastRebalance < 3 && state.step > 8) return null;
      lastRebalance = state.step;

      // Long/short
      if (allowShort && maxGross >= 1.0) {
        const longCand = [], shortCand = [];
        for (let i = 0; i < syms.length; i++) {
          const sym = syms[i];
          const a = assets[sym];
          if (!a || !a.tradable) continue;
          const f = a.f || {};
          const bar = a.bar || {};
          if (!isFiniteNum(bar.c)) continue;
          const ret10 = isFiniteNum(f.ret10)?f.ret10:0, ret20 = isFiniteNum(f.ret20)?f.ret20:0;
          const distSma50 = isFiniteNum(f.distSma50)?f.distSma50:0, distSma200 = isFiniteNum(f.distSma200)?f.distSma200:0;
          const rsi14 = isFiniteNum(f.rsi14)?f.rsi14:50;
          const rankRet10 = isFiniteNum(f.rank_ret10)?f.rank_ret10:0.5, rankRet20 = isFiniteNum(f.rank_ret20)?f.rank_ret20:0.5;
          let ls = 0, ss = 0;
          if (distSma50 > -0.01 && distSma200 > -0.05) ls += 0.5;
          if (ret10 > 0) ls += 0.3;
          if (ret20 > 0) ls += 0.3;
          if (rankRet10 > 0.6) ls += 0.4;
          if (rankRet20 > 0.6) ls += 0.4;
          if (rsi14 > 40 && rsi14 < 70) ls += 0.2;
          if (distSma200 < 0 && rankRet20 < 0.3 && ret20 < 0) ss += 0.8;
          if (rsi14 > 60 && distSma50 > 0.02) ss += 0.4;
          if (ls > 0.4) longCand.push({sym, score:ls});
          if (ss > 0.5 && maxGross >= 1.3) shortCand.push({sym, score:ss});
        }
        longCand.sort(function(a,b){return b.score-a.score;});
        shortCand.sort(function(a,b){return b.score-a.score;});
        const targets = {};
        const lp = Math.min(6, longCand.length);
        for (let i=0;i<lp;i++) targets[longCand[i].sym] = 0.8/lp;
        if (shortCand.length > 0 && maxGross >= 1.5) {
          targets[shortCand[0].sym] = -0.2;
        }
        let gross = 0;
        for (const s in targets) gross += Math.abs(targets[s]);
        if (gross > maxGross + 1e-9) { const sc=maxGross/gross; for (const s in targets) targets[s]*=sc; }
        if (Object.keys(targets).length===0) {
          let d=0; for (const s in lastTargets) if(Math.abs(lastTargets[s])>0.01)d++;
          if (d===0) return null; lastTargets={}; return {targets:{},note:"Flat"};
        }
        let diff=0; const all={}; for (const s in targets) all[s]=1; for (const s in lastTargets) all[s]=1;
        for (const s in all) diff += Math.abs((targets[s]||0)-(lastTargets[s]||0));
        if (diff<0.05) return null;
        lastTargets = {}; for (const s in targets) lastTargets[s]=targets[s];
        return { targets: targets, note: "LS" };
      }

      // Long only
      const candidates = [];
      for (let i = 0; i < syms.length; i++) {
        const sym = syms[i];
        const a = assets[sym];
        if (!a || !a.tradable) continue;
        const f = a.f || {};
        const bar = a.bar || {};
        if (!isFiniteNum(bar.c)) continue;
        let score = 0;
        const ret5=isFiniteNum(f.ret5)?f.ret5:0, ret10=isFiniteNum(f.ret10)?f.ret10:0, ret20=isFiniteNum(f.ret20)?f.ret20:0, ret60=isFiniteNum(f.ret60)?f.ret60:0;
        const distSma50=isFiniteNum(f.distSma50)?f.distSma50:0, distSma200=isFiniteNum(f.distSma200)?f.distSma200:0;
        const rsi14=isFiniteNum(f.rsi14)?f.rsi14:50, adx14=isFiniteNum(f.adx14)?f.adx14:10;
        const rankRet10=isFiniteNum(f.rank_ret10)?f.rank_ret10:0.5, rankRet20=isFiniteNum(f.rank_ret20)?f.rank_ret20:0.5, rankRet60=isFiniteNum(f.rank_ret60)?f.rank_ret60:0.5;
        const sharpe60=isFiniteNum(f.sharpe60)?f.sharpe60:0, vol20=isFiniteNum(f.vol20)?f.vol20:0.3;
        score += ret5*0.4; score += ret10*0.6; score += ret20*0.8; score += ret60*0.3;
        if (distSma50 > -0.02) score += 0.3;
        if (distSma200 > -0.1) score += 0.2;
        if (rankRet10 > 0.6) score += 0.4;
        if (rankRet20 > 0.65) score += 0.5;
        if (rankRet60 > 0.6) score += 0.4;
        if (rsi14 > 40 && rsi14 < 72) score += 0.2;
        if (adx14 > 15) score += 0.1;
        if (sharpe60 > 0) score += 0.1;
        score -= vol20*0.04;
        if (score > 0.25) candidates.push({sym:sym, score:score});
      }
      if (candidates.length === 0) return null;
      candidates.sort(function(a,b){return b.score-a.score;});
      const targets = {};
      const pickCount = Math.min(5, candidates.length);
      const alloc = Math.min(0.95, maxGross);
      for (let i=0;i<pickCount;i++) { if(candidates[i].score<=0) continue; targets[candidates[i].sym] = alloc/pickCount; }
      let gross = 0; for (const s in targets) gross+=Math.abs(targets[s]);
      if (gross>maxGross+1e-9){const sc=maxGross/gross;for (const s in targets) targets[s]*=sc;}
      if (Object.keys(targets).length===0) return null;
      let diff=0; const all={}; for (const s in targets) all[s]=1; for (const s in lastTargets) all[s]=1;
      for (const s in all) diff += Math.abs((targets[s]||0)-(lastTargets[s]||0));
      if (diff<0.05) return null;
      lastTargets = {}; for (const s in targets) lastTargets[s]=targets[s];
      return { targets: targets, note: "Mom" + pickCount };
    } catch(e) {
      return null;
    }
  }
};
