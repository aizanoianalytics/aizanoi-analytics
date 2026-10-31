'use strict';

module.exports = function decide(state) {
  if (state.phase === 'goal') return { x: 0, y: 0, kick: false };

  var you = state.you;
  var ball = state.ball;
  var field = state.field;
  var mates = state.teammates || [];
  var enemies = state.opponents || [];
  var allMates = [you].concat(mates);

  function dist(a,b){ var dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
  function nrm(x,y){ var l=Math.hypot(x,y); if(l<1e-18)return {x:1,y:0}; return {x:x/l,y:y/l}; }

  var enemyGoalX = field.enemyGoalX;
  var kr = field.kickRange;

  // Find closest to ball
  var carrier = you, cd = dist(you,ball);
  for (var i=0;i<allMates.length;i++) {
    var d2 = dist(allMates[i],ball);
    if (d2 < cd - 1e-12 || (Math.abs(d2-cd)<1e-12 && String(allMates[i].id) < String(carrier.id))) {
      carrier = allMates[i]; cd = d2;
    }
  }
  var amCarrier = String(carrier.id) === String(you.id);

  // Defense
  if (ball.x < -290) {
    var bd = dist(you,ball);
    if (amCarrier || bd < 120) {
      var v = nrm(ball.x-you.x, ball.y-you.y);
      return {x:v.x, y:v.y, kick: bd <= kr + 6};
    }
    var vt = nrm(-385-you.x, ball.y*0.2-you.y);
    return {x:vt.x, y:vt.y, kick: bd <= kr + 4};
  }

  if (!amCarrier && allMates.length > 0) {
    var bd2 = dist(you,ball);
    if (ball.x > -80) {
      // go forward and open up
      var vx = nrm((ball.x-50)-you.x, (ball.y + (you.y>ball.y?-35:35))-you.y);
      var md = Math.hypot((ball.x-50)-you.x,(ball.y + (you.y>ball.y?-35:35))-you.y);
      if (md > 3) return {x:vx.x, y:vx.y, kick:false};
    }
    var vx2 = nrm(Math.max(-150, ball.x-30)-you.x, ball.y-you.y);
    return {x:vx2.x, y:vx2.y, kick: bd2 <= kr + 3};
  }

  // Carrier
  var yb = dist(you,ball);
  var bxv = ball.x-you.x, byv = ball.y-you.y;
  var gvx = enemyGoalX - ball.x, gvy = -ball.y;
  var glv = Math.hypot(gvx,gvy); if (glv<1e-18) glv=1;
  var gnx = gvx/glv, gny = gvy/glv;
  var behind = bxv*gnx + byv*gny;
  var crossv = bxv*gny - byv*gnx;

  // If very close and pointing at goal, shoot
  if (yb <= kr + 6) {
    if (behind > -5 && Math.abs(crossv) < 50) {
      return {x:gnx, y:gny, kick:true};
    }
    if (behind >= -10) {
      // try to push shot
      return {x:gnx, y:gny, kick: yb <= kr + 2 || behind > -3};
    }
  }

  // Get behind
  if (behind > -25) {
    var tx = ball.x - gnx*20;
    var ty = ball.y - gny*20;
    var dtx = tx-you.x, dty = ty-you.y;
    var ltx = Math.hypot(dtx,dty);
    if (ltx > 1.5) {
      var mv = nrm(dtx,dty);
      return {x:mv.x, y:mv.y, kick:false};
    }
    var bv = nrm(bxv,byv);
    return {x:bv.x, y:bv.y, kick: yb <= kr + 4};
  } else {
    var side = you.y >= ball.y ? 1 : -1;
    var tx2 = ball.x - gnx*30;
    var ty2 = ball.y - gny*30 + side*45;
    var dtx2 = tx2-you.x, dty2 = ty2-you.y;
    var ltx2 = Math.hypot(dtx2,dty2);
    if (ltx2 > 1) {
      var mv2 = nrm(dtx2,dty2);
      return {x:mv2.x, y:mv2.y, kick:false};
    }
    var bv2 = nrm(bxv,byv);
    return {x:bv2.x, y:bv2.y, kick: yb <= kr + 4};
  }
};
