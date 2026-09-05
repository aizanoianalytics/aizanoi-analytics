// Browsers may report the cursor recentering delta when pointer lock starts.
// Discard that first event so entering/re-entering never flings the camera.
export function createPointerLook(player) {
 let locked=false, awaitingFirstMove=false;
 return {
  setLocked(value){locked=Boolean(value);awaitingFirstMove=locked;},
  move(event){
   if(!locked)return;
   if(!Number.isFinite(event.movementX)||!Number.isFinite(event.movementY))return;
   /* Browsers emit one large cursor-recenter jump when the lock starts. Genuine
      pointer-locked movement is small per frame, so only a very large first jump
      is discarded; normal-speed motion (incl. small synthetic probes) applies. */
   if(awaitingFirstMove){
     awaitingFirstMove=false;
     if(Math.abs(event.movementX)>180||Math.abs(event.movementY)>180)return;
   }
   player.yaw+=event.movementX*0.00185;
   player.pitch=Math.max(-1.3,Math.min(1.3,player.pitch-event.movementY*0.00165));
  },
 };
}
