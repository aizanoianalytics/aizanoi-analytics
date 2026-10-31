'use strict';
// Aras — iterative PVS with tapered evaluation and tactical quiescence.
module.exports = (function () {
  const V = [0,100,325,340,510,1000,20000];
  const N = [-33,-31,-18,-14,14,18,31,33], B = [-17,-15,15,17], R = [-16,-1,1,16];
  const Z = new Int32Array(13*128+256); let seed=123456789;
  for(let i=0;i<Z.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;Z[i]=seed;}
  const SIZE=1<<18, mask=SIZE-1;
  const keys=new Int32Array(SIZE), vals=new Int32Array(SIZE), depths=new Int8Array(SIZE), flags=new Uint8Array(SIZE), bests=new Int32Array(SIZE);
  let g, deadline, nodes, abort, killers, hist, reps, rootPly, limit;
  const code=m=>1+m.f+(m.t<<7)+((m.p||0)<<14)+(m.castle?1<<18:0);
  function extra(){let h=g._side===1?Z[1664]:0;for(const r of g._rights)h^=Z[1665+r.r];if(g._ep>=0){const s=g._side,e=g._ep; if((g._board[e-s*16-1]===s||g._board[e-s*16+1]===s)&&g._legal().some(m=>m.ep)) h^=Z[1793+(e&7)];}return h;}
  function hash(){let h=extra();for(let s=0;s<128;s++){if(s&136){s+=7;continue;}const p=g._board[s];if(p)h^=Z[(p+6)*128+s];}return h;}
  function make(m,h){const ex=extra(),u=g._make(m);h^=ex^extra();for(const [s,p] of u.squares){if(p)h^=Z[(p+6)*128+s];const q=g._board[s];if(q)h^=Z[(q+6)*128+s];}return [u,h];}
  function evaluate(){
    const b=g._board;let mg=0,eg=0,phase=0;const pawns=[new Int8Array(8),new Int8Array(8)],bish=[0,0],material=[0,0];
    for(let s=0;s<128;s++){if(s&136){s+=7;continue;}let p=b[s];if(Math.abs(p)===1)pawns[p>0?0:1][s&7]++;}
    for(let s=0;s<128;s++){
      if(s&136){s+=7;continue;}let p=b[s];if(!p)continue;
      const c=p>0?1:-1,ci=c===1?0:1,t=Math.abs(p),f=s&7,r=c===1?s>>4:7-(s>>4),center=7-(Math.abs(f-3.5)+Math.abs(r-3.5));
      let a=V[t],e=V[t];if(t!==6)material[ci]+=V[t];
      phase += [0,0,1,1,2,4,0][t];
      if(t===1){
        a+=r*7+center*4; e+=r*12+center*3;
        if(pawns[ci][f]>1){a-=13;e-=20;}
        if(!(f>0&&pawns[ci][f-1])&&!(f<7&&pawns[ci][f+1])){a-=13;e-=12;}
        let passed=true;for(let rr=(s>>4)+c;rr>=0&&rr<8;rr+=c)for(let ff=Math.max(0,f-1);ff<=Math.min(7,f+1);ff++)if(b[rr*16+ff]===-c)passed=false;
        if(passed){a+=[0,0,5,12,25,45,85,0][r];e+=[0,0,10,25,55,100,180,0][r];const king=g._kings[-c],dist=Math.max(Math.abs((king&7)-f),Math.abs((king>>4)-((s>>4)+c)));e+=r*dist*2;}
        if((f===3||f===4)&&r===1)a-=12;
      }else if(t===2){a+=center*13-35;e+=center*9-25;if(r===0)a-=15;}
      else if(t===3){bish[ci]++;a+=center*5;e+=center*6;if(r===0)a-=10;}
      else if(t===4){if(!pawns[ci][f]){a+=pawns[1-ci][f]?14:25;e+=10;}if(r===6){a+=22;e+=30;}}
      else if(t===5){a+=center*2;e+=center*5;if(r>2&&phase>15)a-=8;}
      else {
        a-=center*12+r*7;e+=center*13;
        if(r===0&&(f<=2||f>=6))a+=25;
        for(let ff=Math.max(0,f-1);ff<=Math.min(7,f+1);ff++){const ss=s+c*16+(ff-f);if(!(ss&136)&&b[ss]===c)a+=15;else a-=9;}
      }
      if(t>=2&&t<=5){let mobility=0,pressure=0;const dirs=t===2?N:t===3?B:t===4?R:B.concat(R),enemyKing=g._kings[-c];
        for(const d of dirs)for(let to=s+d;!(to&136);to+=d){const target=b[to];if(target*c>0)break;mobility++;if(Math.max(Math.abs((to&7)-(enemyKing&7)),Math.abs((to>>4)-(enemyKing>>4)))<=1)pressure++;if(target||t===2)break;}
        a+=mobility*(t===5?1:3)+pressure*(t===5?7:4);e+=mobility*2;
      }
      mg+=c*a;eg+=c*e;
    }
    if(bish[0]>=2){mg+=28;eg+=42;}if(bish[1]>=2){mg-=28;eg-=42;}
    phase=Math.min(24,phase);
    let score=(mg*phase+eg*(24-phase))/24;
    // Convert extra material reliably by driving a bare king to the edge.
    for(let i=0;i<2;i++)if(material[1-i]===0&&material[i]>=510){const c=i===0?1:-1,k=g._kings[-c],own=g._kings[c],edge=Math.max(Math.abs((k&7)-3.5),Math.abs((k>>4)-3.5)),dist=Math.max(Math.abs((k&7)-(own&7)),Math.abs((k>>4)-(own>>4)));score+=c*(edge*25-dist*12);}
    return (score*g._side+10)|0;
  }
  function ordered(moves,tt,ply){const b=g._board,side=g._side===1?0:16384;for(const m of moves){const id=code(m),capture=!m.castle&&(b[m.t]||m.ep);m.order=id===tt?2000000:capture?100000+16*V[Math.abs(b[m.t])||1]-V[Math.abs(b[m.f])]+(m.p?V[m.p]:0):m.p?90000+V[m.p]:killers[ply]&&killers[ply].includes(id)?80000:hist[side+m.f*128+m.t];}moves.sort((a,b)=>b.order-a.order);return moves;}
  function search(depth,alpha,beta,ply,h,allowNull){
    if((++nodes&127)===0&&Date.now()>=deadline){abort=true;return 0;}
    if(abort)return 0;
    const check=g.inCheck();
    if(ply>=72)return evaluate();
    const draw=(reps.get(h)||0)>=3||g._halfmove>=100||rootPly+ply>=limit;
    if(draw){if(check&&!g._legal().length)return -30000+ply;return 0;}
    if(g._insufficient())return 0;
    if(check&&depth>0&&ply<16)depth++;
    const orig=alpha,tk=h^Math.imul(g._halfmove,7919),idx=tk&mask,hit=flags[idx]&&keys[idx]===tk;
    let tt=hit?bests[idx]:0;
    if(depth>0&&hit&&depths[idx]>=depth&&ply>0&&(reps.get(h)||0)<=1){let v=vals[idx];if(v>29000)v-=ply;else if(v< -29000)v+=ply;if(flags[idx]===1||flags[idx]===2&&v>=beta||flags[idx]===3&&v<=alpha)return v;}
    const quiet=depth<=0;let stand=0;
    if(quiet&&!check){stand=evaluate();if(stand>=beta)return stand;if(stand>alpha)alpha=stand;if(depth< -12)return stand;}
    if(!quiet&&!check&&allowNull&&depth>=3&&beta<29000&&evaluate()>=beta){
      let heavy=false;for(let s=0;s<128;s++){if(s&136){s+=7;continue;}if(g._board[s]*g._side>1&&Math.abs(g._board[s])<6){heavy=true;break;}}
      if(heavy){const side=g._side,ep=g._ep;g._side=-side;g._ep=-1;const nh=hash();let v=-search(depth-3-(depth>6?1:0),-beta,-beta+1,ply+1,nh,false);g._side=side;g._ep=ep;if(abort)return 0;if(v>=beta)return v;}
    }
    let moves=g._pseudo();if(quiet&&!check)moves=moves.filter(m=>!m.castle&&(g._board[m.t]||m.ep||m.p));
    ordered(moves,tt,ply);let count=0,best=quiet&&!check?stand:-32000,bm=0;
    for(const m of moves){
      const capture=!m.castle&&(g._board[m.t]||m.ep),promotion=m.p,side=g._side;
      if(quiet&&!check&&!promotion&&stand+V[Math.abs(g._board[m.t])||1]+180<alpha)continue;
      const [u,nh]=make(m,h);
      if(g._attacked(g._kings[side],-side)){g._unmake(u);continue;}
      count++;reps.set(nh,(reps.get(nh)||0)+1);
      let v;const next=depth-1;
      if(count===1||quiet)v=-search(next,-beta,-alpha,ply+1,nh,true);
      else{
        let reduction=depth>=3&&count>=4&&!check&&!capture&&!promotion&&!m.castle&&!g.inCheck()?1+(depth>=6&&count>=10?1:0):0;
        v=-search(next-reduction,-alpha-1,-alpha,ply+1,nh,true);
        if(v>alpha&&reduction)v=-search(next,-alpha-1,-alpha,ply+1,nh,true);
        if(v>alpha&&v<beta)v=-search(next,-beta,-alpha,ply+1,nh,true);
      }
      reps.set(nh,reps.get(nh)-1);g._unmake(u);if(abort)return 0;
      if(v>best){best=v;bm=code(m);}if(v>alpha)alpha=v;
      if(alpha>=beta){if(!capture&&!promotion){const id=code(m);if(!killers[ply])killers[ply]=[0,0];if(killers[ply][0]!==id)killers[ply]=[id,killers[ply][0]];const hi=(side===1?0:16384)+m.f*128+m.t;hist[hi]=Math.min(70000,hist[hi]+depth*depth*20);}break;}
    }
    if(!count){if(check)return -30000+ply;if(!quiet)return 0;if(!g._legal().length)return 0;}
    if(!quiet&&(reps.get(h)||0)<=1){keys[idx]=tk;depths[idx]=depth;vals[idx]=best>29000?best+ply:best< -29000?best-ply:best;flags[idx]=best<=orig?3:best>=beta?2:1;bests[idx]=bm;}
    return best;
  }
  function move(state){
    const start=Date.now();let answer=state.legalMoves[0];if(state.legalMoves.length<2)return answer;
    deadline=start+Math.min(700,Math.max(20,(state.timeLimitMs||1000)*0.70));nodes=0;abort=false;killers=[];hist=new Int32Array(32768);reps=new Map();flags.fill(0);rootPly=state.ply;limit=state.maxPlies;
    try{
      // Replay with reversible engine primitives, avoiding SAN/status overhead.
      g=globalThis.ChessEngine.create({fen:state.initialFen,variant:state.variant,maxPlies:state.maxPlies});let h=hash();reps.set(h,1);
      for(const text of state.history){const m=g._pseudo().find(m=>g._uci(m)===text);if(!m)throw Error('history');const result=make(m,h);h=result[1];reps.set(h,(reps.get(h)||0)+1);}
      if(g.fen()!==state.fen)throw Error('position');
      const root=g._legal().filter(m=>state.legalMoves.includes(g._uci(m)));let previous=0;
      for(let depth=1;depth<=32&&!abort;depth++){
        ordered(root,previous,0);let best=-32000,selected=null,alpha=-32000;
        for(const m of root){if(Date.now()>=deadline){abort=true;break;}const [u,nh]=make(m,h);reps.set(nh,(reps.get(nh)||0)+1);
          let v=-search(depth-1,-32000,-alpha,1,nh,true);
          reps.set(nh,reps.get(nh)-1);g._unmake(u);if(abort)break;
          m.score=v;if(v>best){best=v;selected=m;}if(v>alpha)alpha=v;
        }
        if(!abort&&selected){answer=g._uci(selected);previous=code(selected);if(best>29000)break;}
        if(Date.now()-start>470)break;
      }
    }catch(_){/* Return a canonical legal move even if reconstruction fails. */}
    return state.legalMoves.includes(answer)?answer:state.legalMoves[0];
  }
  move.botName='Aras';return move;
})();
