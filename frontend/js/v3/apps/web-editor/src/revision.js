/** Revision-bound dirty tracking: a save only clears edits that existed when it started. */
export function createRevisionTracker(){
  let rev=0,savedRev=0,gen=0;
  return{
    touch(){rev+=1;},
    /** Start a new document baseline (load/new): invalidates in-flight saves of the previous document. */
    baseline(){rev+=1;savedRev=rev;gen+=1;},
    /** Mark the current document as changed without a user edit (e.g. legacy conversion). */
    markDirty(){rev+=1;},
    snapshot(){return{rev,gen};},
    /** @returns true when the snapshot still belongs to the current document. */
    markSaved(snap){if(snap.gen!==gen)return false;if(snap.rev>savedRev)savedRev=snap.rev;return true;},
    get dirty(){return rev!==savedRev;},
    get generation(){return gen;},
  };
}
