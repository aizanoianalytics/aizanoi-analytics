'use strict';

// Aras Sentinel: iterative-deepening PVS with a history-aware search.
module.exports = (function () {
  const V = [0, 100, 325, 340, 510, 1000, 20000];
  const MG = [0, 100, 325, 340, 510, 1000, 0];
  const EG = [0, 120, 310, 345, 540, 980, 0];
  const PH = [0, 0, 1, 1, 2, 4, 0];
  const N = [-33,-31,-18,-14,14,18,31,33];
  const B = [-17,-15,15,17], R = [-16,-1,1,16], K = B.concat(R);
  const SIZE = 1 << 18, MASK = SIZE - 1, MATE = 30000;
  const keys = new Int32Array(SIZE), locks = new Int32Array(SIZE);
  const depths = new Int16Array(SIZE), scores = new Int32Array(SIZE);
  const flags = new Int8Array(SIZE), bests = new Int32Array(SIZE);
  const z1 = new Int32Array(1922), z2 = new Int32Array(z1.length);
  let seed = 0x61307;
  function random() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
  for (let i=0;i<z1.length;i++) {z1[i]=random();z2[i]=random();}
  let g, board, deadline, nodes, h1, h2, path, historical, rootPly, maxPly;
  let killers, history, seldepth;
  const STOP = {};
  function enc(m) { return 1 + m.f + (m.t<<7) + ((m.p||0)<<14) + (m.castle ? 1<<17 : 0); }
  function epSquare() {
    const e=g._ep,c=g._side;
    if(e<0)return 128;
    for(const d of [-1,1]) {
      const f=e-c*16+d;
      if(!(f&0x88)&&board[f]===c) {
        board[f]=0;board[e]=c;board[e-c*16]=0;
        const safe=!g._attacked(g._kings[c],-c);
        board[f]=c;board[e]=0;board[e-c*16]=-c;
        if(safe)return e;
      }
    }
    return 128;
  }
  function extra() {
    let a=g._side===1?0:z1[1664],b=g._side===1?0:z2[1664];
    for(const r of g._rights){a^=z1[1665+r.r];b^=z2[1665+r.r];}
    const e=epSquare();a^=z1[1793+e];b^=z2[1793+e];
    return [a,b];
  }
  function hash() {
    const x=extra();h1=x[0];h2=x[1];
    for(let s=0;s<128;s++){if(s&0x88){s+=7;continue;}const p=board[s];if(p){const i=(p+6)*128+s;h1^=z1[i];h2^=z2[i];}}
  }
  function make(m) {
    const old1=h1,old2=h2,x=extra(),u=g._make(m),y=extra();
    h1^=x[0]^y[0];h2^=x[1]^y[1];
    for(const q of u.squares){const s=q[0],p=q[1],v=board[s];if(p){h1^=z1[(p+6)*128+s];h2^=z2[(p+6)*128+s];}if(v){h1^=z1[(v+6)*128+s];h2^=z2[(v+6)*128+s];}}
    u.h1=old1;u.h2=old2;return u;
  }
  function unmake(u){g._unmake(u);h1=u.h1;h2=u.h2;}
  const pawnAttack=[new Int8Array(128),new Int8Array(128)];
  function evaluate() {
    let mg=0,eg=0,phase=0;
    const pawns=[new Int8Array(10),new Int8Array(10)], bishops=[0,0];
    pawnAttack[0].fill(0);pawnAttack[1].fill(0);
    const minPawn=[new Int8Array(10).fill(8),new Int8Array(10).fill(8)];
    const maxPawn=[new Int8Array(10).fill(-1),new Int8Array(10).fill(-1)];
    let minorCount=0,majorCount=0,knights=0,bishopColors=0,material=0;
    for(let s=0;s<128;s++){
      if(s&0x88){s+=7;continue;}const p=board[s],t=Math.abs(p);phase+=PH[t];material+=(p>0?1:-1)*MG[t];
      if(t===1){const ci=p>0?0:1,c=p>0?1:-1,f=(s&7)+1,r=s>>4;pawns[ci][f]++;
        minPawn[ci][f]=Math.min(minPawn[ci][f],r);maxPawn[ci][f]=Math.max(maxPawn[ci][f],r);
        for(const d of [c*16-1,c*16+1])if(!((s+d)&0x88))pawnAttack[ci][s+d]=1;
        majorCount++;
      }else if(t===2){minorCount++;knights++;}else if(t===3){minorCount++;bishopColors|=1<<(((s&7)+(s>>4))&1);}else if(t===4||t===5)majorCount++;
    }
    if(!majorCount&&(minorCount<2||!knights&&bishopColors!==3))return 0;
    for(let s=0;s<128;s++) {
      if(s&0x88){s+=7;continue;}const p=board[s];if(!p)continue;
      const c=p>0?1:-1,t=Math.abs(p),ci=c===1?0:1,f=s&7,r=c===1?s>>4:7-(s>>4);
      const center=7-(Math.abs(2*f-7)+Math.abs(2*r-7))/2;
      let m=MG[t],e=EG[t];
      if(t===1) {
        m+=r*7+center*5; e+=r*13+center*3;
        if(!pawns[ci][f]&&!pawns[ci][f+2]){m-=15;e-=20;}
        if(pawns[ci][f+1]>1){m-=12;e-=20;}
        let passed=true;
        for(let ff=f;ff<=f+2;ff++)if(c===1?maxPawn[1][ff]>(s>>4):minPawn[0][ff]<(s>>4))passed=false;
        if(passed){m+=[0,0,4,12,25,48,85,0][r];e+=[0,5,12,25,48,95,170,0][r];
          const ek=g._kings[-c],ok=g._kings[c],to=s+c*16;
          const dist=(a,b)=>Math.max(Math.abs((a&7)-(b&7)),Math.abs((a>>4)-(b>>4)));
          e+= (dist(ek,to)-dist(ok,to))*r*2;
        }
        for(const d of [c*16-1,c*16+1])if(!((s-d)&0x88)&&board[s-d]===c){m+=9;e+=10;}
      } else if(t===6) {
        m-=center*9+r*9; e+=center*13;
        let shield=0;for(let ff=Math.max(0,f-1);ff<=Math.min(7,f+1);ff++){
          if(!pawns[ci][ff+1])m-=13;
          const q=s+c*16+(ff-f);if(!(q&0x88)&&board[q]===c)shield+=12;
        }
        m+=shield;
      } else {
        m+=center*(t===2?13:t===3?7:3);e+=center*(t===2?9:5);
        if(t===2){if(r===0)m-=20; if(r>=3&&r<=5){let enemyPawn=false;for(const d of [c*16-1,c*16+1])if(!((s+d)&0x88)&&board[s+d]===-c)enemyPawn=true;if(!enemyPawn)m+=10;}}
        if(t===3){bishops[ci]++;if(r===0)m-=12;}
        if(t===4){if(!pawns[ci][f+1]){m+=pawns[1-ci][f+1]?14:25;e+=12;}if(r===6){m+=20;e+=30;}}
        if(t===5&&r>1&&phase>14)m-=8;
        const dirs=t===2?N:t===3?B:t===4?R:K;
        let mob=0,pressure=0;const king=g._kings[-c];
        for(const d of dirs)for(let to=s+d;!(to&0x88);to+=d){const target=board[to];if(target*c>0)break;
          if(!pawnAttack[1-ci][to])mob++;
          if(Math.max(Math.abs((to&7)-(king&7)),Math.abs((to>>4)-(king>>4)))<=1)pressure++;
          if(target||t===2)break;
        }
        m+=mob*(t===5?2:4)+pressure*(t===5?9:5);e+=mob*(t===4?4:3);
      }
      mg+=c*m;eg+=c*e;
    }
    if(bishops[0]>=2){mg+=30;eg+=45;}if(bishops[1]>=2){mg-=30;eg-=45;}
    if(phase<12&&Math.abs(material)>400){const w=g._kings[1],b=g._kings[-1];
      const distance=Math.max(Math.abs((w&7)-(b&7)),Math.abs((w>>4)-(b>>4)));
      eg+=(material>0?1:-1)*(7-distance)*14;
    }
    phase=Math.min(24,phase);
    return (((mg*phase+eg*(24-phase))/24)*g._side+12)|0;
  }
  function order(m,tt,ply) {
    const code=enc(m);if(code===tt)return 20000000;
    const cap=m.castle?0:Math.abs(board[m.t])||(m.ep?1:0);
    if(cap||m.p)return 1000000+V[cap]*16-V[Math.abs(board[m.f])]+(m.p?V[m.p]:0);
    if(killers[ply]&&killers[ply][0]===code)return 900000;
    if(killers[ply]&&killers[ply][1]===code)return 800000;
    return history[(g._side===1?0:16384)+m.f*128+m.t]||0;
  }
  function tick(ply){nodes++;if(ply>seldepth)seldepth=ply;if((nodes&127)===0&&Date.now()>=deadline)throw STOP;}
  function repetition(ply) {
    const key=h1+':'+h2;let count=historical.get(key)||0;
    for(let i=0;i<ply;i++)if(path[i]===key)count++;
    return count>=2;
  }
  function search(depth,alpha,beta,ply,nullOK,qdepth) {
    tick(ply);
    const check=g.inCheck(), orig=alpha;
    if(ply>=80)return evaluate();
    const draw=g._halfmove>=100||rootPly+ply>=maxPly||repetition(ply);
    if(draw){if(check&&!g._legal().length)return -MATE+ply;return 0;}
    path[ply]=h1+':'+h2;
    if(depth<=0)return quiesce(alpha,beta,ply,check,qdepth||0);
    const idx=h1&MASK,hit=keys[idx]===h1&&locks[idx]===h2&&flags[idx]!==0;
    let tt=hit?bests[idx]:0;
    if(hit&&depths[idx]>=depth&&ply>0&&g._halfmove<85){let v=scores[idx];if(v>29000)v-=ply;else if(v< -29000)v+=ply;if(flags[idx]===1||flags[idx]===2&&v>=beta||flags[idx]===3&&v<=alpha)return v;}
    const pv=beta-alpha>1;
    const staticEval=check? -MATE:evaluate();
    if(!pv&&!check&&depth<=3&&staticEval-95*depth>=beta&&Math.abs(beta)<28000)return staticEval;
    if(nullOK&&!pv&&!check&&depth>=3&&staticEval>=beta&&Math.abs(beta)<28000){
      let nonpawn=0;for(let s=0;s<128;s++){if(s&0x88){s+=7;continue;}if(board[s]*g._side>0&&Math.abs(board[s])>1&&Math.abs(board[s])<6)nonpawn+=V[Math.abs(board[s])];}
      if(nonpawn>600){const side=g._side,ep=g._ep,oh1=h1,oh2=h2;const x=extra();g._side=-side;g._ep=-1;const y=extra();h1^=x[0]^y[0];h2^=x[1]^y[1];
        const v=-search(depth-1- (depth>=6?3:2),-beta,-beta+1,ply+1,false,0);g._side=side;g._ep=ep;h1=oh1;h2=oh2;if(v>=beta)return Math.min(v,28000);
      }
    }
    const moves=g._pseudo();for(const m of moves)m.score=order(m,tt,ply);moves.sort((a,b)=>b.score-a.score);
    let best=-MATE, bm=0,legal=0;
    for(const m of moves){const quiet=!m.p&&!m.ep&&(!board[m.t]||m.castle),u=make(m);if(g._attacked(g._kings[-g._side],g._side)){unmake(u);continue;}legal++;
      const givesCheck=g.inCheck();let nd=depth-1;if(check&&depth<8)nd++;
      let v;
      if(legal===1)v=-search(nd,-beta,-alpha,ply+1,true,0);
      else {
        const reduce=depth>=3&&legal>3&&quiet&&!check&&!givesCheck ? Math.min(nd-1,1+(legal>9?1:0)+(depth>6?1:0)-(pv?1:0)):0;
        v=-search(nd-Math.max(0,reduce),-alpha-1,-alpha,ply+1,true,0);
        if(v>alpha&&reduce>0)v=-search(nd,-alpha-1,-alpha,ply+1,true,0);
        if(v>alpha&&v<beta)v=-search(nd,-beta,-alpha,ply+1,true,0);
      }
      unmake(u);
      if(v>best){best=v;bm=enc(m);}if(v>alpha)alpha=v;
      if(alpha>=beta){if(quiet){const k=killers[ply]||(killers[ply]=[0,0]);if(k[0]!==bm){k[1]=k[0];k[0]=bm;}const hi=(g._side===1?0:16384)+m.f*128+m.t;history[hi]=Math.min(600000,history[hi]+depth*depth*20);}break;}
    }
    if(!legal)return check?-MATE+ply:0;
    keys[idx]=h1;locks[idx]=h2;depths[idx]=depth;bests[idx]=bm;flags[idx]=best<=orig?3:best>=beta?2:1;scores[idx]=best>29000?best+ply:best< -29000?best-ply:best;
    return best;
  }
  function see(m) {
    // Swap-off evaluation with x-rays; restore the board before returning.
    const to=m.t,changes=[],gain=[V[Math.abs(board[to])]],side=g._side;
    let current=Math.abs(board[m.f]),c=-side;
    changes.push([m.f,board[m.f]],[to,board[to]]);board[to]=board[m.f];board[m.f]=0;
    for(let depth=1;depth<24;depth++){
      let from=-1,type=7;
      for(const d of [c*16-1,c*16+1]){const q=to-d;if(!(q&0x88)&&board[q]===c){from=q;type=1;break;}}
      if(type>1)for(const d of N){const q=to+d;if(!(q&0x88)&&board[q]===c*2){from=q;type=2;break;}}
      for(const d of K){let q=to+d,dist=1;while(!(q&0x88)){
        const p=board[q];if(p){const t=Math.abs(p);if(p*c>0&&t<type&&(t===5||(dist===1&&t===6)||(B.includes(d)?t===3:t===4))){from=q;type=t;}break;}q+=d;dist++;
      }}
      if(from<0)break;
      // Ignoring a pinned recapturer would incorrectly discard a sound capture.
      const old=board[to];board[to]=c*type;board[from]=0;
      const safe=!g._attacked(type===6?to:g._kings[c],-c);
      board[to]=old;board[from]=c*type;if(!safe)break;
      gain.push(V[current]-gain[depth-1]);
      changes.push([from,board[from]]);board[from]=0;board[to]=c*type;current=type;c=-c;
      if(type===1&&((to>>4)===0||(to>>4)===7)){gain[depth]+=V[5]-V[1];current=5;board[to]=-c*5;}
    }
    for(let i=gain.length-1;i>0;i--)gain[i-1]=-Math.max(-gain[i-1],gain[i]);
    for(let i=changes.length-1;i>=0;i--)board[changes[i][0]]=changes[i][1];
    return gain[0];
  }
  function quiesce(alpha,beta,ply,check,qd) {
    let best=check?-MATE:evaluate();
    if(!check){if(best>=beta)return best;if(best>alpha)alpha=best;if(qd>=10)return best;}
    const moves=g._pseudo().filter(m=>check||m.p||m.ep||(!m.castle&&board[m.t]));
    for(const m of moves)m.score=order(m,0,ply);moves.sort((a,b)=>b.score-a.score);
    let legal=0;
    for(const m of moves){if(!check&&!m.p&&!m.ep&&best+V[Math.abs(board[m.t])]+180<alpha)continue;
      if(!check&&!m.p&&!m.ep&&V[Math.abs(board[m.f])]>V[Math.abs(board[m.t])]&&see(m)<0)continue;
      const u=make(m);if(g._attacked(g._kings[-g._side],g._side)){unmake(u);continue;}legal++;
      const v=-search(0,-beta,-alpha,ply+1,false,qd+1);unmake(u);
      if(v>best)best=v;if(v>alpha)alpha=v;if(alpha>=beta)break;
    }
    if(check&&!legal)return -MATE+ply;
    // Quiet leaves can otherwise confuse stalemate with a winning material score.
    if(!check&&!legal&&best>0&&!g._legal().length)return 0;
    return best;
  }
  function move(state) {
    const fallback=state.legalMoves[0];if(state.legalMoves.length<2)return fallback;
    const start=Date.now();deadline=start+Math.min(680,Math.max(30,(state.timeLimitMs||1000)*0.68));
    move._answer=fallback;move.lastError=null;move.lastSearch=null;
    nodes=0;seldepth=0;path=[];historical=new Map();killers=[];history=new Int32Array(32768);rootPly=state.ply;maxPly=state.maxPlies;
    // Replay with make/unmake primitives, avoiding the engine's expensive SAN/status path.
    try {
      g=globalThis.ChessEngine.create({fen:state.initialFen,variant:state.variant,maxPlies:state.maxPlies});board=g._board;
      for(const text of state.history){hash();const k=h1+':'+h2;historical.set(k,(historical.get(k)||0)+1);
        const f=(text.charCodeAt(1)-49)*16+text.charCodeAt(0)-97,t=(text.charCodeAt(3)-49)*16+text.charCodeAt(2)-97;
        const m={f,t};if(text.length===5)m.p=' PNBRQK'.indexOf(text[4].toUpperCase());
        if(Math.abs(board[f])===6&&board[t]===g._side*4)m.castle=g._rights.find(r=>r.k===f&&r.r===t);
        if(Math.abs(board[f])===1&&t===g._ep&&!board[t]&&(f&7)!==(t&7))m.ep=true;
        g._make(m);
      }
      hash();path[0]=h1+':'+h2;
      let roots=g._legal().filter(m=>state.legalMoves.includes(g._uci(m)));
      if(!roots.length)return fallback;
      let answer=g._uci(roots[0]);
      for(let depth=1;depth<=30;depth++){
        let a=-MATE,b=MATE,best=-MATE,chosen=roots[0];
        roots.sort((x,y)=>(y.rootScore===undefined?-40000:y.rootScore)-(x.rootScore===undefined?-40000:x.rootScore));
        for(let i=0;i<roots.length;i++){
          if(Date.now()>=deadline)throw STOP;
          const m=roots[i],u=make(m);let v;
          if(i===0)v=-search(depth-1,-b,-a,1,true,0);
          else {v=-search(depth-1,-a-1,-a,1,true,0);if(v>a)v=-search(depth-1,-b,-a,1,true,0);}
          unmake(u);m.rootScore=v;
          if(v>best){best=v;chosen=m;}if(v>a)a=v;
        }
        answer=g._uci(chosen);move.lastSearch={depth,nodes,score:best,ms:Date.now()-start,seldepth};
        move._answer=answer;
        if(best>29000||Date.now()-start>470)break;
      }
      return answer;
    } catch(e) { if(e!==STOP)move.lastError=String(e);return move._answer&&state.legalMoves.includes(move._answer)?move._answer:fallback; }
  }
  move.botName='Aras Sentinel';
  return move;
})();
