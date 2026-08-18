// Shared Ancient World surface shader.
// Derived from the mature Aizanoi renderer: procedural ground breakup,
// masonry coursing, roof-tile rhythm and warm/cool light separation without
// texture downloads or claiming archaeological certainty.
export const ANCIENT_CITY_FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vN;
varying vec3 vC;
varying float vDepth;
varying vec3 vW;
uniform vec3 uFog;
uniform vec3 uSun;
uniform float uAmbient;
uniform float uFogDensity;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gridLine(float v,float scale,float width){
  float f=abs(fract(v*scale)-.5);
  return 1.0-smoothstep(.5-width,.5,f);
}

void main(){
  vec3 n=normalize(vN);
  vec3 sun=normalize(uSun);
  float direct=max(dot(n,sun),0.0);
  float bounce=max(dot(n,-sun),0.0);
  float hemi=.5+.5*n.y;
  float light=uAmbient+direct*.67+bounce*.055+hemi*.10;
  vec3 color=vC*(.66+light*.56);

  float lum=dot(vC,vec3(.299,.587,.114));
  float grain=(hash(floor(vW.xz*1.65))-.5)*.052;

  // Broad terrain / paving breakup. Upward-facing surfaces receive a second
  // lower-frequency variation so large plazas and hills do not read as flat paint.
  if(n.y>.78){
    float g1=hash(floor(vW.xz*.24));
    float g2=hash(floor(vW.xz*.95));
    color*=.92+g1*.14+g2*.035;
  }

  // Pale vertical masonry receives subtle courses and irregular joints. The
  // effect is intentionally low contrast: it suggests construction scale rather
  // than pretending to reproduce a measured block pattern.
  if(abs(n.y)<.60&&lum>.34){
    float course=smoothstep(.91,.99,fract(vW.y*.78));
    float vertical=smoothstep(.945,.995,fract((vW.x+vW.z)*.31+floor(vW.y*.78)*.37));
    color*=1.0-course*.085-vertical*.035;
  }

  // Warm, darker upward surfaces are treated as roof fields and get a thin
  // crossed tile rhythm similar to the mature Aizanoi renderer.
  float roofMask=smoothstep(.10,.22,vC.r-vC.g)*(1.0-smoothstep(.64,.82,lum))*smoothstep(.16,.98,n.y);
  float tiles=(gridLine(vW.x+vW.z,.72,.055)+gridLine(vW.x-vW.z,.46,.045))*.5;
  color*=1.0-roofMask*tiles*.055;

  color*=1.0+grain;
  color=mix(color,color*vec3(1.10,1.025,.90),direct*.22);
  color=mix(color,color*vec3(.88,.94,1.03),(1.0-direct)*.055);

  float fog=clamp(1.0-exp(-uFogDensity*uFogDensity*vDepth*vDepth),0.0,.91);
  gl_FragColor=vec4(mix(color,uFog,fog),1.0);
}`;
