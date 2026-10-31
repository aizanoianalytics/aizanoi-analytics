'use strict';

// A compact iterative-deepening alpha-beta player.  The engine is deliberately
// used as the source of truth for legality, including Chess960 castling.
const V = { P: 100, N: 320, B: 335, R: 510, Q: 900, K: 0 };
const INF = 100000000;
const MATE = 1000000;
const DEAD = { valueOf() { return 0; } };

const PST = {
  P: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0 ],
  N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,5,5,0,-20,-40, -30,5,10,15,15,10,5,-30, -30,0,15,20,20,15,0,-30, -30,5,15,20,20,15,5,-30, -30,0,10,15,15,10,0,-30, -40,-20,0,0,0,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,5,0,0,0,0,5,-10, -10,10,10,10,10,10,10,-10, -10,0,10,10,10,10,0,-10, -10,5,5,10,10,5,5,-10, -10,0,5,10,10,5,0,-10, -10,0,0,0,0,0,0,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  R: [0,0,0,5,5,0,0,0, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 5,10,10,10,10,10,10,5, 0,0,0,0,0,0,0,0],
  Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20]
};

function pieceValue(piece) { return V[piece[1]]; }
function evaluate(game, me) {
  const b = game.board(); let s = 0;
  for (let row=0; row<8; row++) for (let f=0; f<8; f++) {
    const p=b[row][f]; if (!p) continue;
    const sign=p[0]===me ? 1 : -1, type=p[1];
    // PST is indexed from that side's home rank.
    const rr=p[0]==='w' ? 7-row : row;
    const ps = PST[type] ? PST[type][rr*8+f] : 0;
    s += sign*(pieceValue(p)+ps);
  }
  // Slightly value king safety and activity without making legality calls here.
  if (game.inCheck()) s += game.turn===me ? -35 : 35;
  return s;
}
function square(board, u) { return board[8-Number(u[1])][u.charCodeAt(0)-97]; }
function order(game, moves, preferred) {
  const b=game.board();
  return moves.map(u=>{
    const a=square(b,u.slice(0,2)), t=square(b,u.slice(2,4));
    let x=(u===preferred?10000000:0);
    if (u[4]) x+=8000+pieceValue({1:'x',2:'N',3:'B',4:'R',5:'Q'}[u[4].toUpperCase()]||'Q');
    if (t && a && t[0]!==a[0]) x+=pieceValue(t)*10-pieceValue(a);
    else if (a && a[1]==='P' && u[0]!==u[2]) x+=1000;
    return [u,x];
  }).sort((x,y)=>y[1]-x[1]).map(x=>x[0]);
}

module.exports = function move(state) {
  const moves=state.legalMoves;
  if (!moves || !moves.length) return undefined;
  let best=moves[0];
  const root=globalThis.ChessEngine.fromBotState(state);
  const me=state.you;
  const deadline=Date.now()+Math.min(720,Math.max(40,(state.timeLimitMs||1000)-180));
  function stop(){ if(Date.now()>=deadline) throw DEAD; }
  function terminal(game, ply) {
    const st=game.status();
    if (!st.over) return null;
    if (st.reason==='checkmate') return game.turn===me ? -MATE+ply : MATE-ply;
    return 0;
  }
  function search(game, depth, alpha, beta, ply, q) {
    stop();
    const term=terminal(game,ply); if(term!==null) return term;
    if (depth<=0) {
      const base=evaluate(game,me);
      if (!q || Math.abs(base)>15000) return base;
      // One-ply capture/check extension prevents obvious hanging pieces.
      let val=base;
      for(const u of order(game,game.legalMoves())) {
        stop(); const b=game.board(), a=square(b,u.slice(0,2)), t=square(b,u.slice(2,4));
        if (!u[4] && !(t && a && t[0]!==a[0]) && !(a&&a[1]==='P'&&u[0]!==u[2])) continue;
        const c=game.clone(); const r=c.move(u); if(!r.ok) continue;
        const z=evaluate(c,me); val=game.turn===me?Math.max(val,z):Math.min(val,z);
      }
      return val;
    }
    const maximizing=game.turn===me; let val=maximizing?-INF:INF;
    const us=order(game,game.legalMoves());
    for(const u of us){
      stop(); const c=game.clone(); if(!c.move(u).ok) continue;
      const z=search(c,depth-1,alpha,beta,ply+1,true);
      if(maximizing){ if(z>val)val=z; if(val>alpha)alpha=val; }
      else { if(z<val)val=z; if(val<beta)beta=val; }
      if(beta<=alpha) break;
    }
    return val;
  }
  try {
    for(let depth=1; depth<=32; depth++) {
      stop(); let iter=best, val=-INF;
      for(const u of order(root,moves,best)) {
        stop(); const c=root.clone(); const r=c.move(u); if(!r.ok) continue;
        const z=search(c,depth-1,-INF,INF,1,true);
        if(z>val){val=z;iter=u;}
        if(z>=MATE-10){best=u;return best;}
      }
      best=iter;
    }
  } catch(e) { if(e!==DEAD) throw e; }
  return moves.includes(best)?best:moves[0];
};
