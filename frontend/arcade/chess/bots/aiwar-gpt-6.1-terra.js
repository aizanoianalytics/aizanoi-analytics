'use strict';
// Aizanoi Arena: iterative alpha-beta, tactical quiescence and positional scoring.
const V=[0,100,320,335,510,975,20000], MATE=30000, INF=32000;
const STOP={};
function evaluate(g) {
  const b=g._board; let score=0, phase=0, wb=0,bb=0;
  const pawns=[[],[]];
  for(let s=0;s<128;s++){if(s&136){s+=7;continue;} const p=b[s]; if(!p)continue; const t=Math.abs(p); if(t===1)pawns[p>0?0:1].push(s); else if(t<6)phase+=t===5?4:t===4?2:1; if(t===3){if(p>0)wb++;else bb++;}}
  phase=Math.min(24,phase);
  for(let s=0;s<128;s++){
    if(s&136){s+=7;continue;} const p=b[s]; if(!p)continue;
    const side=p>0?1:-1,t=Math.abs(p),f=s&7,r=side===1?s>>4:7-(s>>4);
    const center=7-Math.abs(2*f-7)-Math.abs(2*(s>>4)-7);
    let x=V[t];
    if(t===1){
      x+=r*7+center*2;
      let isolated=true,passed=true,doubled=false;
      for(const q of pawns[side===1?0:1])if(q!==s){if(Math.abs((q&7)-f)===1)isolated=false;if((q&7)===f)doubled=true;}
      for(const q of pawns[side===1?1:0])if(Math.abs((q&7)-f)<=1 && (side===1?q>s:q<s))passed=false;
      if(isolated)x-=11;if(doubled)x-=12;if(passed)x+=r*r*3+8;
    }else if(t===2)x+=center*7-(r===0?12:0);
    else if(t===3)x+=center*4+(r===0?-8:0);
    else if(t===4){x+=r*2;let own=false,enemy=false;for(const q of pawns[side===1?0:1])if((q&7)===f)own=true;for(const q of pawns[side===1?1:0])if((q&7)===f)enemy=true;if(!own)x+=enemy?10:20;}
    else if(t===5)x+=center*2;
    else {const mid=(r<=1?12:0)-center*4-(r>1?r*8:0);const end=center*7; x+=(mid*phase+end*(24-phase))/24;
      if(phase>8){let shield=0;for(const q of pawns[side===1?0:1])if(Math.abs((q&7)-f)<=1 && (side===1?(q>>4)>(s>>4):(q>>4)<(s>>4)) && Math.abs((q>>4)-(s>>4))<=2)shield++;x+=(shield-2)*9*phase/24;}
    }
    score+=side*x;
  }
  if(wb>=2)score+=30;if(bb>=2)score-=30;
  return Math.round(score*g._side);
}
module.exports={name:'Aizanoi',move:function(state){
  const legal=state.legalMoves;if(!legal.length)return undefined;if(legal.length===1)return legal[0];
  const deadline=Date.now()+Math.min(550,Math.max(20,(state.timeLimitMs||1000)-300));
  let best=legal[0], nodes=0;
  try{
    const g=globalThis.ChessEngine.create({fen:state.fen,variant:state.variant,maxPlies:state.maxPlies});
    const tt=new Map(), killers=[], hist=new Int32Array(128*128), path=new Map();
    // Replay history cheaply to preserve actual repetition counts without full move()/SAN overhead.
    if(state.history.length){
      const replay=globalThis.ChessEngine.create({fen:state.initialFen,variant:state.variant,maxPlies:state.maxPlies});
      path.set(replay._key(),1);
      for(const uci of state.history){
        if(Date.now()>deadline-100){path.clear();break;}
        const m=replay._legal().find(x=>replay._uci(x)===uci);if(!m){path.clear();break;}
        replay._make(m);const k=replay._key();path.set(k,(path.get(k)||0)+1);
      }
    }else path.set(g._key(),1);
    function time(){if((++nodes&255)===0 && Date.now()>=deadline)throw STOP;}
    function order(moves,hash,ply){
      const b=g._board, k=killers[ply]||[];
      for(const m of moves){const a=Math.abs(b[m.f]), victim=m.castle?0:Math.abs(b[m.t])||(m.ep?1:0);
        m._score=(hash&&g._uci(m)===hash?10000000:0)+(m.p?800000+V[m.p]*10:0)+(victim?1000000+V[victim]*16-V[a]:0)+(k[0]===g._uci(m)?90000:k[1]===g._uci(m)?80000:0)+hist[m.f*128+m.t]+(m.castle?60:0);
      }
      moves.sort((a,b)=>b._score-a._score);return moves;
    }
    function key(){return g._key();}
    function withMove(m,fn){const u=g._make(m);let k;try{k=key();path.set(k,(path.get(k)||0)+1);return fn(k);}finally{if(k){const n=path.get(k)-1;if(n)path.set(k,n);else path.delete(k);}g._unmake(u);}}
    function qsearch(alpha,beta,ply,qdepth,k){
      time(); const check=g.inCheck();
      if(ply>=30)return evaluate(g);
      let moves=g._legal();
      if(!moves.length)return check?-MATE+ply:0;
      if(g._halfmove>=100||(path.get(k)||0)>=3 || state.ply+ply>=state.maxPlies || g._insufficient())return 0;
      if(!check){let stand=evaluate(g);if(stand>=beta)return stand;if(stand>alpha)alpha=stand;if(qdepth<=0)return alpha;
        moves=moves.filter(m=>m.p || m.ep || (!m.castle&&g._board[m.t]));
      }
      order(moves,null,ply);
      for(const m of moves){const sc=withMove(m,k2=>-qsearch(-beta,-alpha,ply+1,qdepth-1,k2));if(sc>=beta)return sc;if(sc>alpha)alpha=sc;}
      return alpha;
    }
    function search(depth,alpha,beta,ply,k){
      time();if(depth<=0)return qsearch(alpha,beta,ply,8,k);
      const check=g.inCheck(), moves=g._legal();
      if(!moves.length)return check?-MATE+ply:0;
      if(g._halfmove>=100||(path.get(k)||0)>=3||state.ply+ply>=state.maxPlies||g._insufficient())return 0;
      const original=alpha, entry=tt.get(k+' '+g._halfmove);
      if(entry && entry.depth>=depth && (path.get(k)||0)<=1 && Math.abs(entry.val)<MATE-100){if(entry.flag===0)return entry.val;if(entry.flag===1&&entry.val>=beta)return entry.val;if(entry.flag===-1&&entry.val<=alpha)return entry.val;}
      order(moves,entry&&entry.move,ply);let val=-INF,bm=null;
      for(const m of moves){const quiet=!m.p&&!m.ep&&(m.castle||!g._board[m.t]);const sc=withMove(m,k2=>-search(depth-1,-beta,-alpha,ply+1,k2));
        if(sc>val){val=sc;bm=g._uci(m);}if(sc>alpha)alpha=sc;
        if(alpha>=beta){if(quiet){const u=g._uci(m);if(!killers[ply])killers[ply]=[];if(killers[ply][0]!==u)killers[ply]=[u,killers[ply][0]];hist[m.f*128+m.t]+=depth*depth;}break;}
      }
      if(tt.size>100000)tt.clear();tt.set(k+' '+g._halfmove,{depth,val,move:bm,flag:val<=original?-1:val>=beta?1:0});return val;
    }
    let root=g._legal().filter(m=>legal.includes(g._uci(m))); if(!root.length)return best;
    for(let depth=1;depth<=64;depth++){
      if(Date.now()>=deadline)break;order(root,best,0);let alpha=-INF,iteration=best;
      for(const m of root){if(Date.now()>=deadline)throw STOP;const sc=withMove(m,k=>-search(depth-1,-INF,-alpha,1,k));if(sc>alpha){alpha=sc;iteration=g._uci(m);}}
      best=iteration;if(alpha>=MATE-100)break;
    }
  }catch(e){if(e!==STOP){/* Keep the contract-safe legal fallback. */}}
  return best;
}};
