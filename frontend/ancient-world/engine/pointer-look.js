// Browsers may report the cursor recentering delta when pointer lock starts.
// Discard that first event so entering/re-entering never flings the camera.
export function createPointerLook(player) {
 let locked=false, awaitingFirstMove=false;
 return {
  setLocked(value){locked=Boolean(value);awaitingFirstMove=locked;},
  move(event){
   if(!locked)return;
   if(awaitingFirstMove){awaitingFirstMove=false;return;}
   if(!Number.isFinite(event.movementX)||!Number.isFinite(event.movementY))return;
   player.yaw+=event.movementX*0.00185;
   player.pitch=Math.max(-1.3,Math.min(1.3,player.pitch-event.movementY*0.00165));
  },
 };
}
