'use strict';
// Citadel: iterative alpha-beta with tactical quiescence and positional evaluation.
const V = [0, 100, 325, 340, 510, 990, 0];
const INF = 1000000, MATE = 100000;
module.exports = function Citadel(state) {
  const fallback = state.legalMoves[0];
  if (state.legalMoves.length === 1) return fallback;
  const start = Date.now();
  const limit = Math.min(650, Math.max(80, (state.timeLimitMs || 1000) - 320));
  let game;
  try { game = globalThis.ChessEngine.create({fen:state.fen, variant:state.variant, maxPlies:state.maxPlies}); }
  catch (_) { return fallback; }
  const b = game._board;
  const dirs = [-17,-15,15,17,-16,-1,1,16];
  const pv = new Map(), killers = Array.from({length:100},()=>[null,null]);
  const hist = new Int32Array(128*128);
  const rootMoves = game._legal();
  const enc = m => String.fromCharCode(97+(m.f&7)) + (1+(m.f>>4)) + String.fromCharCode(97+(m.t&7)) + (1+(m.t>>4)) + (m.p ? ' PNBRQK'[m.p].toLowerCase() : '');
  const order = (ms, hint, ply) => ms.sort((a,c)=>rank(c,hint,ply)-rank(a,hint,ply));
  function rank(m,hint,ply) {
    const u=enc(m), p=b[m.f], target=b[m.t];
    if(u===hint) return 10000000;
    if(m.p) return 900000+V[m.p]*10;
    if(target || m.ep) return 100000+V[Math.abs(target)||1]*16-V[Math.abs(p)];
    if(m.castle) return 5000;
    if(killers[ply] && u===killers[ply][0]) return 8000;
    if(killers[ply] && u===killers[ply][1]) return 7000;
    return hist[m.f*128+m.t];
  }
  function evaluate() {
    let w=0, phase=0, wp=0, bp=0, wm=0, bm=0;
    const pawnW=new Int8Array(8), pawnB=new Int8Array(8), pawnsW=[], pawnsB=[];
    for(let s=0;s<128;s++) {if(s&0x88){s+=7;continue;} const p=b[s],t=Math.abs(p); if(!p)continue;
      if(t!==1&&t!==6) phase+=t===5?4:t===4?2:1;
      if(t===1){(p>0?pawnW:pawnB)[s&7]++; (p>0?pawnsW:pawnsB).push(s);}
      else if(t!==6){if(p>0)wm+=V[t]; else bm+=V[t];}
    }
    const end=Math.max(0,1-Math.min(24,phase)/24);
    for(let s=0;s<128;s++){if(s&0x88){s+=7;continue;}const p=b[s];if(!p)continue;
      const t=Math.abs(p), sign=p>0?1:-1, f=s&7,r=p>0?s>>4:7-(s>>4);
      const center=7-Math.abs(2*f-7)-Math.abs(2*r-7);
      let score=V[t];
      if(t===1){
        score+=r*r*1.8 + center*2;
        const own=p>0?pawnW:pawnB, enemy=p>0?pawnsB:pawnsW;
        if(own[f]>1)score-=15*(own[f]-1);
        if(!own[f-1]&&!own[f+1])score-=14;
        let passed=true;
        for(const ps of enemy)if(Math.abs((ps&7)-f)<=1 && (p>0?(ps>>4)>(s>>4):(ps>>4)<(s>>4))){passed=false;break;}
        if(passed)score+= [0,5,10,18,32,55,95,0][r];
      } else if(t===2)score+=center*11+Math.min(r,4)*3;
      else if(t===3)score+=center*5+Math.min(r,4)*2;
      else if(t===4)score+=r*2 + ((p>0?pawnW:pawnB)[f]===0?12:0)+((p>0?pawnB:pawnW)[f]===0?10:0);
      else if(t===5)score+=center*2;
      else if(t===6){
        const shield=(f>0?b[s+sign*16-1]===sign: false)+(b[s+sign*16]===sign)+(f<7?b[s+sign*16+1]===sign:false);
        score+= (1-end)*(-center*7 + (r<2?shield*11:0) - r*8) + end*(center*10 + r*3);
      }
      w+=sign*score;
    }
    // Bishop pair and a small tempo bonus.
    let wb=0,bb=0; for(let s=0;s<128;s++){if(s&0x88){s+=7;continue;}if(b[s]===3)wb++;else if(b[s]===-3)bb++;}
    w+=(wb>=2?32:0)-(bb>=2?32:0);
    return game._side*w+9;
  }
  let nodes=0;
  function tick(){if((++nodes&1023)===0 && Date.now()-start>=limit)throw 1;}
  function qsearch(alpha,beta,ply,depth){
    tick();
    const check=game._attacked(game._kings[game._side],-game._side);
    const stand=evaluate();
    if(!check){if(stand>=beta)return stand;if(stand>alpha)alpha=stand;if(depth<=0 || ply>35)return stand;}
    else if(ply>35)return stand;
    let moves=game._legal();
    if(!moves.length)return check?-MATE+ply:0;
    if(!check)moves=moves.filter(m=>b[m.t]||m.ep||m.p);
    order(moves,null,ply);
    for(const m of moves){
      if(!check && !m.p && stand+V[Math.abs(b[m.t])||1]+180<alpha)continue;
      const u=game._make(m);const score=-qsearch(-beta,-alpha,ply+1,depth-1);game._unmake(u);
      if(score>=beta)return score;if(score>alpha)alpha=score;
    }
    return alpha;
  }
  function search(depth,alpha,beta,ply){
    tick();
    if(ply>70)return evaluate();
    if(game._halfmove>=100 || state.ply+ply>=state.maxPlies)return 0;
    if(depth<=0)return qsearch(alpha,beta,ply,5);
    const check=game._attacked(game._kings[game._side],-game._side);
    const key=game.fen().split(' ').slice(0,4).join(' ');
    let moves=game._legal();if(!moves.length)return check?-MATE+ply:0;
    const hint=pv.get(key);
    order(moves,hint,ply);
    let best=-INF,bestU=null,idx=0;
    for(const m of moves){
      const uci=enc(m), capture=!!b[m.t]||m.ep, undo=game._make(m);
      let value;
      if(idx>=4 && depth>=3 && !check && !capture && !m.p && !m.castle) {
        value=-search(depth-2,-alpha-1,-alpha,ply+1);
        if(value>alpha)value=-search(depth-1,-beta,-alpha,ply+1);
      }else value=-search(depth-1,-beta,-alpha,ply+1);
      game._unmake(undo);idx++;
      if(value>best){best=value;bestU=uci;}
      if(value>alpha)alpha=value;
      if(alpha>=beta){if(!capture&&!m.p){const k=killers[ply];if(k[0]!==uci){k[1]=k[0];k[0]=uci;}hist[m.f*128+m.t]+=depth*depth;}break;}
    }
    if(bestU)pv.set(key,bestU);
    return best;
  }
  let best=fallback, bestScore=-INF;
  try {
    for(let depth=1;depth<=12;depth++){
      let local=best, localScore=-INF;
      order(rootMoves,best,0);
      for(const m of rootMoves){
        tick();const uci=enc(m),undo=game._make(m);
        let score;
        // Enforce checkmate/stalemate before automatic draw counters.
        const replies=game._legal();
        if(!replies.length)score=game.inCheck()?MATE-1:0;
        else if(game._halfmove>=100||state.ply+1>=state.maxPlies)score=0;
        else score=-search(depth-1,-INF,INF,1);
        game._unmake(undo);
        if(score>localScore){localScore=score;local=uci;}
      }
      best=local;bestScore=localScore;
      if(bestScore>=MATE-100)break;
    }
  }catch(_){ /* Preserve the last fully searched iteration. */ }
  return state.legalMoves.includes(best)?best:fallback;
};
