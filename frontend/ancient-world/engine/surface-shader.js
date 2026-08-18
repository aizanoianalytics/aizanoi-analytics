// Shared Ancient World surface shader.
// GPU-cheap multi-scale procedural breakup derived from the mature Aizanoi
// renderer. It deliberately avoids pretending that a generic shader is an
// archaeological material scan: city-specific geometry/palettes remain in data.
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
float valueNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
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
  float light=uAmbient+direct*.60+bounce*.045+hemi*.085;
  vec3 color=vC*(.61+light*.50);

  float lum=dot(vC,vec3(.299,.587,.114));
  float macro=valueNoise(vW.xz*.018);
  float meso=valueNoise(vW.xz*.105+vec2(17.0,3.0));
  float micro=hash(floor(vW.xz*1.85));

  // Multi-band variation prevents huge plazas, hills and walls from reading as
  // one flat RGB fill. Amplitudes stay restrained so evidence-neutral colors do
  // not become fake material scans.
  color*=.94+macro*.10+meso*.035+(micro-.5)*.018;

  if(n.y>.78){
    float soil=valueNoise(vW.xz*.34+vec2(4.0,11.0));
    float grit=hash(floor(vW.xz*1.15));
    color*=.93+soil*.105+grit*.025;
  }

  // Pale masonry: soft course rhythm + broad vertical staining. The macro stain
  // breaks up monumental walls without claiming measured block joints.
  if(abs(n.y)<.62&&lum>.32){
    float course=smoothstep(.91,.99,fract(vW.y*.78));
    float vertical=smoothstep(.945,.995,fract((vW.x+vW.z)*.31+floor(vW.y*.78)*.37));
    float stain=valueNoise(vec2((vW.x+vW.z)*.035,vW.y*.055));
    float baseDirt=1.0-smoothstep(.25,4.5,max(0.0,vW.y));
    color*=1.0-course*.078-vertical*.030-(.5-stain)*.050-baseDirt*.045;
  }

  // Warm darker upward surfaces read as roof fields. Two crossing bands remove
  // the perfectly smooth wedge look while keeping one shared shader/draw call.
  float roofMask=smoothstep(.10,.22,vC.r-vC.g)*(1.0-smoothstep(.64,.82,lum))*smoothstep(.16,.98,n.y);
  float tiles=(gridLine(vW.x+vW.z,.72,.055)+gridLine(vW.x-vW.z,.46,.045))*.5;
  color*=1.0-roofMask*tiles*.060;

  // Softer warm/cool separation preserves highlights that previously clipped to
  // near-white on pale monuments, especially the Aizanoi/Attic stone palette.
  color=mix(color,color*vec3(1.075,1.018,.92),direct*.18);
  color=mix(color,color*vec3(.91,.96,1.025),(1.0-direct)*.045);

  float fog=clamp(1.0-exp(-uFogDensity*uFogDensity*vDepth*vDepth),0.0,.91);
  gl_FragColor=vec4(mix(color,uFog,fog),1.0);
}`;
