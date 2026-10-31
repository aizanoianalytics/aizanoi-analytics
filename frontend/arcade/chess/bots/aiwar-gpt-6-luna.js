'use strict';

const V={P:100,N:325,B:335,R:510,Q:950,K:20000}, M=1000000, STOP={};
function sq(b,s){return b[8-Number(s[1])][s.charCodeAt(0)-97];}
function evalBoard(g){
 const b=g.board(), side=g.turn; let score=0, bishops={w:0,b:0}, pawns={w:Array(8).fill(0),b:Array(8).fill(0)};
 for(let r=0;r<8;r++) for(let f=0;f<8;f++){const p=b[r][f];if(!p)continue;const c=p[0],t=p[1], rr=c==='w'?7-r:r, center=7-Math.abs(f*2-7)-Math.abs(rr*2-7);let x=V[t];
  if(t==='P'){x+=rr*9+center*2;pawns[c][f]++;} else if(t==='N')x+=center*8; else if(t==='B'){x+=center*4;bishops[c]++;} else if(t==='R')x+=rr*2; else if(t==='Q')x+=center*2; else x+=rr<2?-center*3:-rr*8;
  score+=(c===side?x:-x);
 }
 for(const c of ['w','b']){let pen=0;for(let f=0;f<8;f++){if(pawns[c][f]>1)pen+=(pawns[c][f]-1)*12;if(pawns[c][f]&&((f===0||!pawns[c][f-1])&&(f===7||!pawns[c][f+1])))pen+=10;} score+=(c===side?-pen:pen);if(bishops[c]>=2)score+=(c===side?25:-25);}
 return score;
}
function order(g,moves,preferred){const b=g.board();return moves.map(u=>{const a=sq(b,u.slice(0,2)),t=sq(b,u.slice(2,4));let s=u===preferred?10000000:0; if(t&&a&&t[0]!==a[0])s+=10000+V[t[1]]-V[a[1]]/10;else if(a&&a[1]==='P'&&u[0]!==u[2])s+=10000+V.P-V[a[1]]/10;if(u[4])s+=8000+V[u[4].toUpperCase()];return [u,s];}).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);}
module.exports=function move(state){
 if(!state.legalMoves||!state.legalMoves.length)return undefined;
 let best=state.legalMoves[0]; const deadline=Date.now()+Math.min(780,Math.max(20,(state.timeLimitMs||1000)-180));
 const root=globalThis.ChessEngine.fromBotState(state);
 function tick(){if(Date.now()>deadline)throw STOP;}
 function search(g,d,a,b,ply){tick();const st=g.status();if(st.over)return st.reason==='checkmate'?-M+ply:0;if(d<=0)return evalBoard(g);let val=-Infinity;
  for(const u of order(g,g.legalMoves())){tick();const c=g.clone();if(!c.move(u).ok)continue;const x=-search(c,d-1,-b,-a,ply+1);if(x>val)val=x;if(x>a)a=x;if(a>=b)break;}return val===-Infinity?0:val;
 }
 try{for(let depth=1;depth<=8;depth++){let iter=best,alpha=-Infinity;for(const u of order(root,state.legalMoves,best)){tick();const c=root.clone();if(!c.move(u).ok)continue;const score=-search(c,depth-1,-Infinity,-alpha,1);if(score>alpha){alpha=score;iter=u;}if(score>=M-1)return u;}best=iter;}}catch(e){if(e!==STOP)throw e;}
 return best;
};
module.exports.botName='Aegis';
