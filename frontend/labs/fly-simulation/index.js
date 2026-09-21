/* Browser-safe deterministic Stage B core. No backend, shell, secrets or remote execution. */

export const PROVENANCE_LABELS = Object.freeze(['CONNECTOME-DERIVED', 'BIOLOGICALLY CONSTRAINED', 'MODELLED', 'HEURISTIC']);
const REQUIRED_PROVENANCE = ['units', 'calibrated', 'assumptions', 'limitations', 'version', 'sourceReferences'];
export function validateProvenance(value) {
  if (!value || !PROVENANCE_LABELS.includes(value.label)) throw new TypeError('invalid provenance label');
  if (typeof value.source !== 'string' || !value.source) throw new TypeError('provenance source required');
  for (const key of REQUIRED_PROVENANCE) if (value[key] === undefined) throw new TypeError(`provenance ${key} required`);
  if (typeof value.calibrated !== 'boolean' || !Array.isArray(value.assumptions) || !Array.isArray(value.limitations) || !Array.isArray(value.sourceReferences) || !value.version) throw new TypeError('invalid provenance metadata');
  return Object.freeze({ label: value.label, source: value.source, sourceReferences: Object.freeze([...value.sourceReferences]), units: String(value.units), calibrated: value.calibrated, assumptions: Object.freeze([...value.assumptions]), limitations: Object.freeze([...value.limitations]), version: String(value.version) });
}
const MODELLED = Object.freeze({ label: 'MODELLED', source: 'fly-simulation-stage-b', units: 'SI', calibrated: false, assumptions: ['deterministic reduced-order model'], limitations: ['not a biological or calibrated physiology model'], version: 'stage-b-1', sourceReferences: [] });
export const DROSOPHILA_MELANOGASTER_V1 = Object.freeze({
  id: 'drosophila-melanogaster-v1',
  bodyLengthMeters: 0.0028,
  massKg: 0.000001,
  collisionRadiusMeters: 0.0006,
  provenance: Object.freeze({
    label: 'BIOLOGICALLY CONSTRAINED',
    source: 'NeuroMechFly adult Drosophila model',
    units: 'm, kg',
    calibrated: false,
    assumptions: ['adult female Drosophila reference values are used for scale and mass only', 'collision radius is a reduced-order approximation, not a measured body width'],
    limitations: ['does not reproduce articulated exoskeleton, wing aerodynamics, or mass distribution'],
    version: 'v1',
    sourceReferences: ['https://doi.org/10.1038/s41592-022-01466-7']
  })
});
const n = (v) => Number.isFinite(v) ? v : 0;
export class Vec3 {
  constructor(x=0, y=0, z=0) { this.x=n(x); this.y=n(y); this.z=n(z); }
  clone(){return new Vec3(this.x,this.y,this.z)} add(v){return new Vec3(this.x+v.x,this.y+v.y,this.z+v.z)} sub(v){return new Vec3(this.x-v.x,this.y-v.y,this.z-v.z)} mul(s){return new Vec3(this.x*s,this.y*s,this.z*s)} dot(v){return this.x*v.x+this.y*v.y+this.z*v.z} cross(v){return new Vec3(this.y*v.z-this.z*v.y,this.z*v.x-this.x*v.z,this.x*v.y-this.y*v.x)} length(){return Math.hypot(this.x,this.y,this.z)} normalize(){const l=this.length();return l?this.mul(1/l):new Vec3()}
  toJSON(){return [this.x,this.y,this.z]}
}
export class Quat {
  constructor(x=0,y=0,z=0,w=1){const q={x:n(x),y:n(y),z:n(z),w:n(w)};const l=Math.hypot(q.x,q.y,q.z,q.w)||1;this.x=q.x/l;this.y=q.y/l;this.z=q.z/l;this.w=q.w/l}
  clone(){return new Quat(this.x,this.y,this.z,this.w)} toJSON(){return [this.x,this.y,this.z,this.w]}
}
const rotateByQuat = (vector, quaternion) => {
  const q = quaternion instanceof Quat ? quaternion : new Quat(quaternion?.x, quaternion?.y, quaternion?.z, quaternion?.w);
  const u = new Vec3(q.x, q.y, q.z);
  const t = u.cross(vector).mul(2);
  return vector.add(t.mul(q.w)).add(u.cross(t));
};
export class BodyState {
  constructor({ position=new Vec3(), velocity=new Vec3(), orientation=new Quat(), angularVelocity=new Vec3(), mass=1, radius=.25, damping=.02, drag=.02 }={}) { this.position=position instanceof Vec3?position:asVec(position);this.velocity=velocity instanceof Vec3?velocity:asVec(velocity);this.orientation=orientation instanceof Quat?orientation:new Quat(orientation?.x??orientation?.[0]??0,orientation?.y??orientation?.[1]??0,orientation?.z??orientation?.[2]??0,orientation?.w??orientation?.[3]??1);this.angularVelocity=angularVelocity instanceof Vec3?angularVelocity:asVec(angularVelocity);this.mass=mass;this.radius=radius;this.damping=damping;this.drag=drag;this.force=new Vec3();this.torque=new Vec3();this.thrust=new Vec3(); }
  applyForce(force){if(!(force instanceof Vec3))throw new TypeError('force must be Vec3');this.force=this.force.add(force)} applyTorque(torque){if(!(torque instanceof Vec3))throw new TypeError('torque must be Vec3');this.torque=this.torque.add(torque)} applyThrust(thrust){if(!(thrust instanceof Vec3))throw new TypeError('thrust must be Vec3');this.thrust=this.thrust.add(thrust)}
  integrate(dt,gravity){const acceleration=gravity.add(this.force.add(this.thrust).mul(1/this.mass));this.velocity=this.velocity.add(acceleration.mul(dt));this.velocity=this.velocity.mul(Math.max(0,1-this.drag*dt));this.velocity=this.velocity.mul(Math.max(0,1-this.damping*dt));this.position=this.position.add(this.velocity.mul(dt));this.angularVelocity=this.angularVelocity.add(this.torque.mul(dt/this.mass)).mul(Math.max(0,1-this.damping*dt));if(this.angularVelocity.length()>0){const w=this.angularVelocity;const q=this.orientation;const h=dt/2;this.orientation=new Quat((w.x*q.w+w.y*q.z-w.z*q.y)*h+q.x,(w.y*q.w+w.z*q.x-w.x*q.z)*h+q.y,(w.z*q.w+w.x*q.y-w.y*q.x)*h+q.z,(-w.x*q.x-w.y*q.y-w.z*q.z)*h+q.w)}this.force=new Vec3();this.torque=new Vec3();this.thrust=new Vec3()}
  toJSON(){return {position:this.position.toJSON(),velocity:this.velocity.toJSON(),orientation:this.orientation.toJSON(),angularVelocity:this.angularVelocity.toJSON(),mass:this.mass,radius:this.radius,damping:this.damping,drag:this.drag}}
}
function asVec(v){return v instanceof Vec3?v:new Vec3(v?.x??v?.[0]??0,v?.y??v?.[1]??0,v?.z??v?.[2]??0)}
const authoredPlanePoint=(surface)=>surface.point??(surface.axis==='x'?{x:surface.value,y:0,z:0}:surface.axis==='y'?{x:0,y:surface.value,z:0}:{x:0,y:0,z:surface.value});
export class AuthoredSurfaceAdapter {
  constructor(surfaces=[],delegate=null){this.surfaces=surfaces.map(s=>({...s,point:asVec(authoredPlanePoint(s)),normal:asVec(s.normal).normalize()}));this.delegate=delegate}
  raycast(origin,direction,maxDistance=100){const o=asVec(origin),d=asVec(direction).normalize();if(this.delegate){const hit=this.delegate(origin,direction,maxDistance);if(hit==null)return null;if(!Number.isFinite(hit.distance)||!hit.point||!hit.normal)throw new TypeError('authored raycast hit requires distance, point, normal');return {...hit,distance:Number(hit.distance),point:asVec(hit.point),normal:asVec(hit.normal).normalize()}}let best=null;for(const s of this.surfaces){const denom=d.dot(s.normal);if(Math.abs(denom)<1e-9)continue;const t=s.point.sub(o).dot(s.normal)/denom;if(t>=0&&t<=maxDistance&&(!best||t<best.distance))best={surfaceId:s.id,distance:t,point:o.add(d.mul(t)),normal:s.normal.clone(),room:s.room??null,zones:s.zones??[]}}return best}
}
function cloneBody(b){return new BodyState({position:b.position.clone(),velocity:b.velocity.clone(),orientation:b.orientation.clone(),angularVelocity:b.angularVelocity.clone(),mass:b.mass,radius:b.radius,damping:b.damping,drag:b.drag})}
export class SensorFrame {
  constructor({body,contact,room,zones=[],down}){this.version='sensor-1';this.proprioception={position:body.position.toJSON(),velocity:body.velocity.toJSON(),speed:body.velocity.length(),provenance:MODELLED};this.contact={grounded:Boolean(contact?.grounded),phase:contact?.phase??'AIRBORNE',normal:contact?.normal??null,provenance:MODELLED};this.rays={down:{distance:down?.distance??null,hit:down?.surfaceId??null,normal:down?.normal?.toJSON?.()??null,provenance:MODELLED}};this.environment={room:room??null,coarseZones:zones,provenance:Object.freeze({...MODELLED,units:'room/zone ids'})};this.channels={vision:{status:'UNAVAILABLE',value:null,provenance:Object.freeze({...MODELLED,units:'ray samples',samplingFrequencyHz:0,limitations:['coarse authored visual-ray adapter not configured'],confidence:0,sourceReferences:[]})},olfaction:{status:'UNAVAILABLE',value:null,provenance:Object.freeze({...MODELLED,units:'n/a',samplingFrequencyHz:0,limitations:['no olfactory adapter'],confidence:0,sourceReferences:[]})},taste:{status:'UNAVAILABLE',value:null,provenance:Object.freeze({...MODELLED,units:'n/a',samplingFrequencyHz:0,limitations:['no taste adapter'],confidence:0,sourceReferences:[]})},airflow:{status:'UNAVAILABLE',value:null,provenance:Object.freeze({...MODELLED,units:'m/s',samplingFrequencyHz:0,limitations:['no airflow adapter'],confidence:0,sourceReferences:[]})},temperature:{status:'UNAVAILABLE',value:null,provenance:Object.freeze({...MODELLED,units:'K',samplingFrequencyHz:0,limitations:['no temperature adapter'],confidence:0,sourceReferences:[]})},humidity:{status:'UNAVAILABLE',value:null,provenance:Object.freeze({...MODELLED,units:'1',samplingFrequencyHz:0,limitations:['no humidity adapter'],confidence:0,sourceReferences:[]})}};this.provenance=Object.freeze({proprioception:MODELLED,contact:MODELLED,rays:MODELLED,environment:Object.freeze({...MODELLED,units:'room/zone ids'}),channels:MODELLED})
  }
}
const clampMotor = (value, limit) => Math.max(-limit, Math.min(limit, n(value)));
const normalizeMotors = (motors = {}, limits = { thrust: 20, pitch: .02, yaw: .02, roll: .02 }) => ({
  thrust: clampMotor(motors.thrust, limits.thrust),
  pitch: clampMotor(motors.pitch, limits.pitch),
  yaw: clampMotor(motors.yaw, limits.yaw),
  roll: clampMotor(motors.roll, limits.roll),
});

const VISION_DIRECTIONS=Object.freeze([new Vec3(1,0,0),new Vec3(.707,.707,0),new Vec3(0,1,0),new Vec3(-.707,.707,0),new Vec3(-1,0,0),new Vec3(-.707,-.707,0),new Vec3(0,-1,0),new Vec3(.707,-.707,0)]);
const visionSample=(environment,position,orientation)=>{const maxRange=.5;const distances=VISION_DIRECTIONS.map(direction=>{const worldDirection=rotateByQuat(direction,orientation).normalize();const hit=environment.raycast?.(position,worldDirection,maxRange);return hit?Math.max(0,Math.min(1,hit.distance/maxRange)):1});const minDistance=Math.min(...distances)*maxRange;return {status:'MODELLED',value:distances,looming:Math.max(0,Math.min(1,1-minDistance/.5)),units:'normalized distance',provenance:Object.freeze({label:'MODELLED',constraint:'BIOLOGICALLY CONSTRAINED',source:'authoritative directional ray sampling',units:'normalized distance',calibrated:false,assumptions:['eight horizontal directions','ray occupancy stands in for visual contrast and looming'],limitations:['not ommatidial retina','no image formation or optic-flow field'],version:'vision-v1',sourceReferences:['Drosophila visual field literature; authored Fly House collision artifact']})};};
 export class FlySimulation {
  constructor(environment,{fixedDt=.02,gravity=null,rngState=0,downDirection=environment?.downDirection??new Vec3(0,-1,0),controller=null,controllerFactory=null,motorLimits={}}={}){const authored=environment?.meta?.artifactHashes;if(!environment?.hash||!environment?.glbHash||!environment?.schemaVersion||authored?.environmentSource!==environment.hash||authored?.flyHouseGlb!==environment.glbHash)throw new TypeError('environment authored artifact hashes and schema required');if(!Number.isFinite(fixedDt)||fixedDt<=0)throw new RangeError('fixedDt must be finite and positive');this.environment=environment;this.fixedDt=fixedDt;this.downDirection=asVec(downDirection).normalize();this.upDirection=this.downDirection.mul(-1);this.gravity=gravity==null?this.downDirection.mul(9.81):asVec(gravity);this.motorLimits={thrust:20,pitch:.02,yaw:.02,roll:.02,...motorLimits};this.physicsCollisionAdapter=new AuthoredSurfaceAdapter(environment.surfaces??[],environment.raycast);this.controller=controller;this.controllerFactory=controllerFactory;this.registry=new Map();this.time=0;this.tick=0;this.paused=false;this.rngState={seed:rngState};this.environmentState=environment.snapshotDynamicState?.()??environment.dynamicState??{};this.provenance=Object.freeze({physics:MODELLED,collision:Object.freeze({...MODELLED,units:'authored surface/raycast'}),sensors:MODELLED})}
  addFly({flyId,body=new BodyState(),provenance=MODELLED,controller=this.controller}={}){if(!flyId||this.registry.has(flyId))throw new Error('flyId must be unique');const activeController=this.controllerFactory?.(flyId)??controller;const fly={flyId,body:cloneBody(body),motors:{thrust:0,pitch:0,yaw:0,roll:0},controller:activeController,controllerState:{},room:null,zones:[],contact:{phase:'AIRBORNE',grounded:false,surfaceId:null,normal:null},sensors:null,sensorHistory:[],provenance:validateProvenance(provenance)};fly.room=this.environment.roomAt?.(fly.body.position)??null;fly.zones=this.environment.zonesAt?.(fly.body.position)??[];this.registry.set(flyId,fly);this.#sense(fly)}
  getFly(id){const f=this.registry.get(id);if(!f)throw new Error('unknown flyId');return f} listFlyIds(){return [...this.registry.keys()]}
  setMotors(id,motors){const f=this.getFly(id);f.motors=normalizeMotors(motors,this.motorLimits)}
  pause(){this.paused=true;return this} resume(){this.paused=false;return this}
  step(dt=this.fixedDt){if(this.paused)return this;return this.stepOne(dt)}
  stepOne(dt=this.fixedDt,{skipControllers=false}={}){
    if(!Number.isFinite(dt)||dt<0)throw new RangeError('finite dt required');
    for(const f of this.registry.values()){
      this.#sense(f);
      if(!skipControllers&&f.controller&&typeof f.controller.step==='function'){
        const result=f.controller.step(f.sensors,f.controllerState,{dt,tick:this.tick,flyId:f.flyId});
        const motors=result?.motors??result;
        if(result&&result.state!==undefined)f.controllerState=cloneJson(result.state);
        f.motors=normalizeMotors(motors,this.motorLimits);
      }
      const start=f.body.position.clone();
      f.body.applyThrust(rotateByQuat(this.upDirection,f.body.orientation).normalize().mul(f.motors.thrust));
      f.body.applyForce(new Vec3(f.motors.pitch,f.motors.yaw,0));
      f.body.applyTorque(new Vec3(f.motors.roll,f.motors.yaw,f.motors.pitch));
      f.body.integrate(dt,this.gravity);
      let contact=null;
      const displacement=f.body.position.sub(start);
      const travel=displacement.length();
      if(travel>1e-12){
        const direction=displacement.mul(1/travel);
        const swept=this.physicsCollisionAdapter.raycast(start,direction,travel+f.body.radius);
        if(swept&&swept.distance<=travel+f.body.radius){
          let normal=swept.normal;
          if(normal.dot(direction)>0)normal=normal.mul(-1);
          f.body.position=swept.point.add(normal.mul(f.body.radius));
          const inward=f.body.velocity.dot(normal);
          if(inward<0)f.body.velocity=f.body.velocity.sub(normal.mul(inward));
          const grounded=normal.dot(this.upDirection)>.5;
          contact={phase:grounded&&Math.abs(f.body.velocity.dot(normal))<.02?'STABLE_REST':'LANDED',grounded,surfaceId:swept.surfaceId,normal:normal.toJSON()};
        }
      }
      for(const s of this.physicsCollisionAdapter.surfaces){
        const normal=s.normal, before=start.sub(s.point).dot(normal), after=f.body.position.sub(s.point).dot(normal), limit=f.body.radius;
        if(after<limit&&(before>=limit||f.body.velocity.dot(normal)<0)){
          f.body.position=f.body.position.add(normal.mul(limit-after));
          const inward=f.body.velocity.dot(normal);
          if(inward<0)f.body.velocity=f.body.velocity.sub(normal.mul(inward));
          const grounded=normal.dot(this.upDirection)>.5;
          contact={phase:grounded&&Math.abs(f.body.velocity.dot(normal))<.02?'STABLE_REST':'LANDED',grounded,surfaceId:s.id,normal:normal.toJSON()};
        }
      }
      const hit=this.physicsCollisionAdapter.raycast(f.body.position,this.downDirection,Math.max(1,f.body.radius*4));
      if(!contact&&hit){
        const height=f.body.position.sub(hit.point).dot(this.upDirection);
        if(height<=f.body.radius){
          f.body.position=hit.point.add(this.upDirection.mul(f.body.radius));
          const normalVelocity=f.body.velocity.dot(this.upDirection);
          if(normalVelocity<0)f.body.velocity=f.body.velocity.sub(this.upDirection.mul(normalVelocity));
          contact={phase:Math.abs(f.body.velocity.dot(this.upDirection))<.02?'STABLE_REST':'LANDED',grounded:true,surfaceId:hit.surfaceId,normal:hit.normal?.toJSON?.()??null};
        }
      }
      if(this.environment.resolveCollision){
        const resolved=this.environment.resolveCollision(f.body.position,f.body.radius);
        if(resolved?.position){
          f.body.position=asVec(resolved.position);
          const normal=asVec(resolved.normal).normalize();
          const inward=f.body.velocity.dot(normal);
          if(inward<0)f.body.velocity=f.body.velocity.sub(normal.mul(inward));
          const grounded=normal.dot(this.upDirection)>.5;
          contact={phase:grounded&&Math.abs(f.body.velocity.dot(normal))<.02?'STABLE_REST':'LANDED',grounded,surfaceId:resolved.surfaceId??null,normal:normal.toJSON()};
        }
      }
      f.contact=contact??{phase:'AIRBORNE',grounded:false,surfaceId:null,normal:null};
      f.room=this.environment.roomAt?.(f.body.position)??hit?.room??null;
      f.zones=this.environment.zonesAt?.(f.body.position)??hit?.zones??[];
      this.#sense(f);
    }
    this.time+=dt;this.tick+=1;return this;
  }
  stepN(count){const steps=Math.max(0,Math.floor(count));for(let i=0;i<steps;i++)this.stepOne();return this}
  telemetrySnapshot(flyId,{lagSeconds=0,controller='HEURISTIC TEST CONTROLLER',checkpointStatus}={}){const f=this.getFly(flyId),b=f.body;return {tick:this.tick,time:this.time,timeSeconds:this.time,flyId:f.flyId,fly:{id:f.flyId},transform:{position:b.position.toJSON(),orientation:b.orientation.toJSON()},velocity:{linear:b.velocity.toJSON(),angular:b.angularVelocity.toJSON(),speed:b.velocity.length()},contact:{...f.contact},room:f.room,zones:[...f.zones],sensorSummary:{version:f.sensors?.version??null,proprioception:f.sensors?.proprioception??null,channels:Object.fromEntries(Object.entries(f.sensors?.channels??{}).map(([k,v])=>[k,{status:v.status,value:v.value??null,looming:Number.isFinite(v.looming)?v.looming:null,units:v.provenance?.units??v.units??'n/a',provenance:v.provenance}]))},controller:{name:f.controller?.name??controller,version:f.controller?.version??'unversioned',provenance:f.controller?.provenance??f.provenance?.label??null,state:f.controllerState},provenance:{fly:f.provenance,physics:this.provenance.physics,sensors:this.provenance.sensors},motor:{...f.motors},checkpointStatus:checkpointStatus??{version:'checkpoint-2',environmentHash:this.environment.hash,environmentSchema:this.environment.schemaVersion,glbHash:this.environment.glbHash??null,lagSeconds}}}
  #sense(f){const down=this.physicsCollisionAdapter.raycast(f.body.position,this.downDirection,100);const frame=new SensorFrame({body:f.body,contact:f.contact,room:f.room,zones:f.zones,down});if(typeof this.environment.sampleSensor==='function'){for(const channel of ['light','temperature','olfaction','taste','airflow']){const sampled=this.environment.sampleSensor(channel,f.body.position);if(sampled)frame.channels[channel]=Object.freeze({...frame.channels[channel],...sampled,provenance:Object.freeze({...MODELLED,units:sampled.units??frame.channels[channel].provenance.units,limitations:['authored deterministic field; not calibrated physiology'],sourceReferences:['fly-physics.json']})})}}frame.channels.vision=Object.freeze({...visionSample(this.environment,f.body.position,f.body.orientation)});f.sensors=frame;f.sensorHistory.push(f.sensors);if(f.sensorHistory.length>32)f.sensorHistory.shift()}
  checkpoint(){return checkpoint(this)}
}
export class FixedStepScheduler {constructor(sim,{onStep=()=>{},maxCatchUpSteps=8}={}){if(!Number.isInteger(maxCatchUpSteps)||maxCatchUpSteps<1)throw new RangeError('maxCatchUpSteps');this.sim=sim;this.onStep=onStep;this.maxCatchUpSteps=maxCatchUpSteps;this.lag=0;this.droppedSeconds=0;this.discontinuityCount=0;this.lastDiscontinuity=null;this.running=false;this.frame=null;this.lastWallTime=null;this.requestFrame=null;this.cancelFrame=null;this.processingTimeSeconds=0;this.cannotKeepPace=false}recordProcessing(seconds){this.processingTimeSeconds=seconds;this.cannotKeepPace=seconds>this.sim.fixedDt}manualStep(count=1){for(let i=0;i<count;i++){this.sim.stepOne(this.sim.fixedDt);this.onStep(this.sim)}return count}advanceWallClock(seconds){if(!Number.isFinite(seconds)||seconds<0)throw new RangeError('wall clock seconds');this.lag+=seconds;const available=Math.floor((this.lag+1e-12)/this.sim.fixedDt);const count=Math.min(available,this.maxCatchUpSteps);for(let i=0;i<count;i++){this.sim.stepOne(this.sim.fixedDt);this.onStep(this.sim)}this.lag=Math.max(0,this.lag-count*this.sim.fixedDt);if(available>count){const dropped=this.lag;this.droppedSeconds+=dropped;this.discontinuityCount+=1;this.lastDiscontinuity={wallSeconds:seconds,droppedSeconds:dropped,availableSteps:available,processedSteps:count,tick:this.sim.tick};this.lag=0;this.cannotKeepPace=true}else if(this.processingTimeSeconds<=this.sim.fixedDt)this.cannotKeepPace=false;return count}start({now=()=>performance.now()/1000,requestFrame=globalThis.requestAnimationFrame,cancelFrame=globalThis.cancelAnimationFrame}={}){if(this.running)return this;this.running=true;this.requestFrame=requestFrame;this.cancelFrame=cancelFrame;this.lastWallTime=null;const frame=(timestamp)=>{if(!this.running)return;const current=Number.isFinite(timestamp)?timestamp/1000:now();if(this.lastWallTime!==null)this.advanceWallClock(current-this.lastWallTime);this.lastWallTime=current;this.frame=typeof this.requestFrame==='function'?this.requestFrame(frame):null};this.frame=typeof requestFrame==='function'?requestFrame(frame):null;return this}stop(){this.running=false;if(this.frame!=null&&typeof this.cancelFrame==='function')this.cancelFrame(this.frame);this.frame=null;return this}status(){return {running:this.running,fixedDt:this.sim.fixedDt,lagSeconds:this.lag,owedLagSeconds:this.lag,stepsBehind:Math.floor(this.lag/this.sim.fixedDt),cannotKeepPace:this.cannotKeepPace,processingTimeSeconds:this.processingTimeSeconds,maxCatchUpSteps:this.maxCatchUpSteps,droppedSeconds:this.droppedSeconds,droppedSteps:Math.floor(this.droppedSeconds/this.sim.fixedDt),discontinuityCount:this.discontinuityCount,lastDiscontinuity:this.lastDiscontinuity,silentDrops:0}}}
export class HeuristicTestController {constructor(){this.name='HEURISTIC TEST CONTROLLER'}motorFromSensor(sensor){return {thrust:sensor.contact.grounded?12:0,pitch:0,yaw:0,roll:0}}}
export class HeuristicBaselineController {constructor(){this.name='HEURISTIC BASELINE CONTROLLER';this.version='heuristic-food-v1';this.provenance='HEURISTIC'}step(sensor){const grounded=sensor.contact?.grounded;const odor=Number(sensor.channels?.olfaction?.value??0);return {thrust:grounded?0.000018:0.000012+odor*0.000002,pitch:odor>0?Math.min(0.02,odor*0.006):0,yaw:0,roll:0}}}
export class FlyWireLC4EscapeController {
  constructor(graph){if(!graph?.provenance||graph.provenance.label!=='CONNECTOME-DERIVED'||!Array.isArray(graph.edges))throw new TypeError('FlyWire graph provenance required');this.graph=graph;this.name='FLYWIRE LC4 ESCAPE EXPERIMENTAL CONTROLLER';this.version='connectome-rate-v1';this.provenance='CONNECTOME-DERIVED';this.lc4ToDn=graph.edges.filter((edge)=>edge.pre_type==='LC4'&&['DNp02','DNp11'].includes(edge.post_type));this.totalSynapses=this.lc4ToDn.reduce((sum,edge)=>sum+edge.syn_count,0)}
  step(sensor,previousState={}){const looming=Number(sensor.channels?.vision?.looming??0);const inputDrive=Math.max(0,Math.min(1,looming));const lc4Activity=.8*Number(previousState.lc4Activity??0)+.2*inputDrive;const connectionInfluence=Math.min(1,this.totalSynapses/2000);const dnActivity=.85*Number(previousState.dnActivity??0)+.15*lc4Activity*connectionInfluence;return {motors:{thrust:sensor.contact?.grounded?0.000018:0.000012+dnActivity*0.00001,pitch:dnActivity*0.02,yaw:0,roll:0},state:{inputDrive,lc4Activity,connectionInfluence,dnActivity,edgeCount:this.lc4ToDn.length,totalSynapses:this.totalSynapses,transduction:'MODELLED',dynamics:'MODELLED'}}}
}
const telemetrySensorSummary=(value)=>{if(value==null)return null;if(typeof value!=='object'||typeof value.version!=='string'||typeof value.channels!=='object')throw new TypeError('telemetry sensors allowlist');const channels={};for(const [name,sensor] of Object.entries(value.channels)){if(!/^[a-z]+$/.test(name)||!sensor||typeof sensor.status!=='string')throw new TypeError('telemetry sensor channel');const raw=sensor.value;const safe=Array.isArray(raw)?finiteArray(raw,name==='vision'?8:3,`sensor ${name}`):Number.isFinite(raw)?raw:raw==null?null:undefined;if(safe===undefined)throw new TypeError('telemetry sensor value');const provenance=sensor.provenance;if(!provenance||typeof provenance.label!=='string'||typeof provenance.source!=='string'||typeof provenance.units!=='string'||typeof provenance.calibrated!=='boolean'||typeof provenance.version!=='string'||!Array.isArray(provenance.assumptions)||!Array.isArray(provenance.limitations)||!Array.isArray(provenance.sourceReferences))throw new TypeError('telemetry sensor provenance');channels[name]={status:sensor.status,value:safe,looming:Number.isFinite(sensor.looming)?sensor.looming:null,units:String(sensor.units??provenance.units??'n/a'),provenance:{label:provenance.label,source:provenance.source,units:provenance.units,calibrated:provenance.calibrated,assumptions:[...provenance.assumptions],limitations:[...provenance.limitations],version:provenance.version,sourceReferences:[...provenance.sourceReferences],...(provenance.constraint?{constraint:String(provenance.constraint)}:{})}}}return {version:value.version,channels}}
const telemetryKeys=new Set(['flyId','sequence','identity','state','metadata','lag']);
const finiteArray=(value,length,name)=>{if(!Array.isArray(value)||value.length!==length||value.some((entry)=>!Number.isFinite(entry)))throw new TypeError(`telemetry ${name}`);return [...value]};
const telemetryContact=(value)=>{if(value==null)return null;if(typeof value!=='object'||Object.keys(value).some((key)=>!['grounded','phase','surfaceId','normal'].includes(key)))throw new TypeError('telemetry contact allowlist');return {grounded:Boolean(value.grounded),phase:value.phase??null,surfaceId:value.surfaceId??null,normal:value.normal==null?null:finiteArray(value.normal,3,'contact normal')}};
export class TelemetryLagError extends Error {constructor(){super('telemetry lag exceeds configured limit');this.name='TelemetryLagError'}}
export class TelemetryProtocol {encode(frame){if(!frame||Object.keys(frame).some(k=>!telemetryKeys.has(k)))throw new TypeError('telemetry allowlist');if(typeof frame.flyId!=='string'||!frame.flyId)throw new TypeError('telemetry flyId required');if(!Number.isInteger(frame.sequence)||frame.sequence<0)throw new TypeError('telemetry sequence required');const identity=frame.identity;if(!identity||typeof identity.environmentHash!=='string'||!identity.environmentHash||typeof identity.glbHash!=='string'||!identity.glbHash||Object.keys(identity).some(k=>!['environmentHash','glbHash'].includes(k)))throw new TypeError('telemetry identity required');const state=frame.state??{};if(Object.keys(state).some(k=>!['room','position','orientation','contact','sensors','motor','controllerState','checkpointStatus'].includes(k)))throw new TypeError('telemetry state allowlist');const position=state.position==null?null:finiteArray(state.position,3,'position');const orientation=state.orientation==null?[0,0,0,1]:finiteArray(state.orientation,4,'orientation');const motor=state.motor==null?null:finiteArray([state.motor.thrust,state.motor.pitch,state.motor.yaw,state.motor.roll],4,'motor');return JSON.stringify({version:'telemetry-1',flyId:frame.flyId,sequence:frame.sequence,identity:{environmentHash:identity.environmentHash,glbHash:identity.glbHash},state:{room:state.room??null,position,orientation,contact:telemetryContact(state.contact),sensors:telemetrySensorSummary(state.sensors),motor,controllerState:state.controllerState??{},checkpointStatus:state.checkpointStatus??null},metadata:{controller:frame.metadata?.controller??'HEURISTIC TEST CONTROLLER',provenance:frame.metadata?.provenance??'MODELLED',units:frame.metadata?.units??'SI'},lag:frame.lag??0})}}
export class WebSocketTelemetryAdapter {constructor(socket,protocol=new TelemetryProtocol(),{maxLag=Infinity}={}){this.socket=socket;this.protocol=protocol;this.maxLag=maxLag}send(frame){const lag=frame.lag===undefined&&this.maxLag===0?1:frame.lag??0;if(lag>this.maxLag)throw new TelemetryLagError();this.socket.send(this.protocol.encode({...frame,lag}));return true}}
const canonical=(x)=>JSON.stringify(x,(k,v)=>v instanceof Vec3||v instanceof Quat?v.toJSON():v);const digest=(x)=>{let h=2166136261;for(const c of canonical(x)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')};
const cloneJson=(x)=>JSON.parse(JSON.stringify(x));
export function checkpoint(sim){return cloneJson({version:'checkpoint-2',environmentHash:sim.environment.hash,glbHash:sim.environment.glbHash??null,environmentSchema:sim.environment.schemaVersion,artifactIdentity:sim.environment.meta?.artifactHashes??{},physicsArtifactSchema:sim.environment.meta?.artifactHashes?.physicsSchema??null,time:sim.time,tick:sim.tick,rngState:sim.rngState,sensorHistory:[...sim.registry.values()].map(f=>({flyId:f.flyId,history:f.sensorHistory})),environmentState:sim.environment.snapshotDynamicState?.()??sim.environmentState,flies:[...sim.registry.values()].map(f=>({flyId:f.flyId,body:f.body.toJSON(),motors:f.motors,controller:f.controller?.name??null,controllerVersion:f.controller?.version??'unversioned',controllerProvenance:f.controller?.provenance??f.provenance?.label??null,controllerState:f.controllerState,room:f.room,zones:f.zones,contact:f.contact,provenance:f.provenance}))})}
export function restore(sim,cp){if(cp.version!=='checkpoint-2')throw new Error('checkpoint version');if(cp.environmentHash!==sim.environment.hash)throw new Error('environment hash mismatch');if((cp.glbHash??null)!==(sim.environment.glbHash??null))throw new Error('GLB hash mismatch');if(cp.environmentSchema!==sim.environment.schemaVersion)throw new Error('environment schema mismatch');const expected=sim.environment.meta?.artifactHashes??{};for(const key of ['physicsArtifact','physicsSchema','connectomeGraph','connectomeDataset','connectomeVersion'])if((cp.artifactIdentity?.[key]??null)!==(expected[key]??null))throw new Error(`artifact identity mismatch: ${key}`);sim.registry.clear();for(const f of cp.flies)sim.addFly({flyId:f.flyId,body:new BodyState(f.body),provenance:f.provenance});for(const f of cp.flies){const live=sim.getFly(f.flyId);if(f.controller!==null&&(live.controller?.name!==f.controller||((live.controller?.version??'unversioned')!==f.controllerVersion)||((live.controller?.provenance??live.provenance?.label??null)!==f.controllerProvenance)))throw new Error(`controller identity mismatch: ${f.flyId}`);live.motors=f.motors;live.controllerState=f.controllerState??{};live.room=f.room;live.zones=f.zones;live.contact=f.contact;live.sensorHistory=cp.sensorHistory?.find(x=>x.flyId===f.flyId)?.history??[];live.sensors=live.sensorHistory.at(-1)??live.sensors}sim.time=cp.time;sim.tick=cp.tick??Math.round(sim.time/sim.fixedDt);sim.rngState=cp.rngState;if(sim.environment.restoreDynamicState)sim.environment.restoreDynamicState(cp.environmentState??{});sim.environmentState=sim.environment.snapshotDynamicState?.()??cp.environmentState;return sim}
export function replay(sim,events=[]){for(const event of events){if(event.dt!==undefined&&Math.abs(event.dt-sim.fixedDt)>1e-12)throw new RangeError('replay requires fixed dt');for(const [id,motors] of Object.entries(event.inputs??{}))sim.setMotors(id,motors);sim.stepOne(sim.fixedDt,{skipControllers:true});for(const [id,state] of Object.entries(event.controllerState??{})){sim.getFly(id).controllerState=cloneJson(state)}}return sim}
export function stateHash(sim){return digest(checkpoint(sim))} export function replayHash(simOrEvents,maybeEvents){return digest({version:'replay-1',initial:simOrEvents instanceof FlySimulation?stateHash(simOrEvents):null,events:maybeEvents??simOrEvents})}
export function createFlyWorldEnvironmentAdapter(environment,identity={}){
  if(!environment)throw new TypeError('authored environment required');
  const integration=environment.integration??environment;
  const raycast=integration.raycast??environment.raycast;
  if(typeof raycast!=='function')throw new TypeError('authored environment raycast required');
  const authoredHashes=environment.meta?.artifactHashes??environment.artifactHashes??{};
  const authoredEnvironmentHash=authoredHashes.environmentSource??null;
  const authoredGlbHash=authoredHashes.flyHouseGlb??null;
  if(!authoredEnvironmentHash||!authoredGlbHash)throw new TypeError('exact authored environment and GLB hashes required');
  const hash=identity.environmentHash??identity.hash??authoredEnvironmentHash;
  const glbHash=identity.glbHash??authoredGlbHash;
  if(!hash||!glbHash)throw new TypeError('exact authored environment and GLB hashes required');
  if(authoredEnvironmentHash&&String(hash)!==String(authoredEnvironmentHash))throw new Error('authored environment hash mismatch');
  if(authoredGlbHash&&String(glbHash)!==String(authoredGlbHash))throw new Error('authored GLB hash mismatch');
  const authoredAxis=environment.axis??integration.coordinateSystem?.axis??null;
  if(identity.axis&&authoredAxis&&identity.axis!==authoredAxis)throw new Error('authored coordinate axis mismatch');
  const axis=authoredAxis??identity.axis??'Y-up';
  const authoredDown=environment.downDirection??(axis==='Z-up'?[0,0,-1]:[0,-1,0]);
  if(identity.downDirection){
    const expected=asVec(authoredDown).normalize(), supplied=asVec(identity.downDirection).normalize();
    if(expected.sub(supplied).length()>1e-12)throw new Error('authored down direction mismatch');
  }
  const downDirection=authoredDown;
  const authoredSchemaVersion=environment.schemaVersion??environment.meta?.schemaVersion??environment.version??null;
  if(identity.schemaVersion!=null&&authoredSchemaVersion!=null&&String(identity.schemaVersion)!==String(authoredSchemaVersion))throw new Error('authored environment schema mismatch');
  const schemaVersion=authoredSchemaVersion??identity.schemaVersion;
  if(schemaVersion==null)throw new TypeError('authored environment schema required');
  return Object.freeze({
    hash:String(hash),
    glbHash:String(glbHash),
    schemaVersion:String(schemaVersion),
    meta:Object.freeze({artifactHashes:Object.freeze({...authoredHashes,environmentSource:String(hash),flyHouseGlb:String(glbHash)})}),
    downDirection:asVec(downDirection),
    surfaces:Object.freeze((identity.surfaces??environment.physicsSurfaces??[]).filter((surface)=>surface?.point&&surface?.normal)),
    raycast:(origin,direction,maxDistance)=>{
      const hit=raycast(origin,direction,maxDistance);
      if(hit==null)return null;
      if(!Number.isFinite(hit.distance)||!hit.point||!hit.normal)throw new TypeError('authored raycast hit requires distance, point, normal');
      return {...hit,point:asVec(hit.point),normal:asVec(hit.normal).normalize()};
    },
    resolveCollision:integration.resolveCollision??environment.resolveCollision,
    roomAt:integration.roomAt??environment.roomAt,
    zonesAt:integration.zonesAt??environment.zonesAt,
    sampleSensor:integration.sampleSensor??environment.sampleSensor,
    fields:integration.fields??environment.fields,
    rooms:integration.rooms??environment.rooms,
    provenance:integration.provenance??environment.provenance,
    dynamicState:identity.dynamicState??environment.dynamicState??null,
    snapshotDynamicState:integration.snapshotDynamicState??environment.snapshotDynamicState,
    restoreDynamicState:integration.restoreDynamicState??environment.restoreDynamicState
  });
}
export class SpectatorBridge {
  constructor({ now = () => Date.now(), environmentHash, glbHash, environmentIdentity } = {}) {
    this.now = now; this.identity = Object.freeze({ environmentHash: environmentIdentity?.environmentHash ?? environmentHash, glbHash: environmentIdentity?.glbHash ?? glbHash });
    if (typeof this.identity.environmentHash !== 'string' || !this.identity.environmentHash || typeof this.identity.glbHash !== 'string' || !this.identity.glbHash) throw new TypeError('spectator environment identity required');
    this.authority = 'spectator-read-only'; this.sentCommands = 0; this.flyStates = new Map(); this.activeFlyId = null; this.raf = null; this.droppedFrames = 0; this.lagStatus = { lagSeconds: 0, silentDrops: 0 };
  }
  get frames() { return this.flyStates.get(this.activeFlyId)?.frames ?? []; }
  get lastSequence() { return this.flyStates.get(this.activeFlyId)?.lastSequence ?? -1; }
  ingest(frame) {
    const state = this.flyStates.get(frame?.flyId) ?? { lastSequence: -1, frames: [] };
    if (frame?.version !== 'telemetry-1' || typeof frame.flyId !== 'string' || !frame.flyId || !Number.isInteger(frame.sequence) || frame.sequence < 0 || frame.sequence <= state.lastSequence || !frame.identity || frame.identity.environmentHash !== this.identity.environmentHash || frame.identity.glbHash !== this.identity.glbHash || !frame.state?.position) return false;
    try { finiteArray(frame.state.position, 3, 'position'); finiteArray(frame.state.orientation ?? [0, 0, 0, 1], 4, 'orientation'); } catch { return false; }
    state.lastSequence = frame.sequence; state.frames.push(frame); state.frames = state.frames.slice(-2); this.flyStates.set(frame.flyId, state); this.activeFlyId = frame.flyId; this.lagStatus = { lagSeconds: frame.lag ?? 0, silentDrops: this.droppedFrames }; return true;
  }
  render(target, alpha = .5, flyId = this.activeFlyId) {
    const frames = this.flyStates.get(flyId)?.frames ?? []; const [a, b] = frames; if (!b) return false;
    const t = Math.max(0, Math.min(1, alpha)), p = a.state.position.map((v, i) => v + (b.state.position[i] - v) * t), qa = a.state.orientation ?? [0, 0, 0, 1], qb = b.state.orientation ?? [0, 0, 0, 1], q = qa.map((v, i) => v + (qb[i] - v) * t), ql = Math.hypot(...q) || 1;
    target.position?.set(...p); target.quaternion?.set?.(...q.map((v) => v / ql)); return true;
  }
  start(target, { requestFrame = globalThis.requestAnimationFrame } = {}) { if (typeof requestFrame !== 'function') return; const tick = () => { this.render(target, .5); this.raf = requestFrame(tick); }; this.raf = requestFrame(tick); }
  stop(cancel = globalThis.cancelAnimationFrame) { if (this.raf && typeof cancel === 'function') cancel(this.raf); this.raf = null; }
}export function createBrowserSimulation(environment,options={}){const simulation=new FlySimulation(environment,options);return {simulation,bridge:new SpectatorBridge({...options,environmentHash:environment.hash,glbHash:environment.glbHash})}}
