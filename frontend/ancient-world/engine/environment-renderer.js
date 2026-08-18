// Shared atmosphere passes for Ancient World cities.
// The sky and water shaders are adapted from the mature self-contained Aizanoi
// renderer, but accept city-specific palettes and geometry.

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function makeProgram(gl, vs, fs) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return program;
}

const SKY_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0.9999,1.0);}`;

const SKY_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform float uSunRel;
uniform float uPitch;
uniform float uTime;
uniform float uYaw;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.;v+=.56*n2(p);p=p*2.03+2.7;v+=.28*n2(p);p=p*2.01+4.2;v+=.14*n2(p);return v;}
void main(){
  float y=clamp(vUv.y,0.0,1.0),h=smoothstep(0.0,.72,y);
  vec3 c=mix(uHorizon,uTop,h);
  vec2 cuv=vec2(vUv.x+uYaw*.085+uTime*.0012,vUv.y+uPitch*.07);
  float cloud=fbm(cuv*vec2(5.2,3.0)+vec2(0.0,1.4));
  cloud=smoothstep(.57,.78,cloud)*smoothstep(.18,.50,y)*(1.0-smoothstep(.88,1.0,y));
  c=mix(c,vec3(.94,.90,.82),cloud*.17);
  float front=smoothstep(1.72,1.20,abs(uSunRel));
  float sunx=.5+sin(uSunRel)*.57;
  float suny=.70-uPitch*.24;
  float d=distance(vUv,vec2(sunx,suny));
  c+=vec3(1.0,.72,.34)*smoothstep(.13,0.0,d)*.38*front;
  c+=vec3(1.0,.86,.58)*smoothstep(.035,0.0,d)*.72*front;
  c+=vec3(.72,.61,.47)*(1.0-smoothstep(.0,.22,y))*.14;
  gl_FragColor=vec4(c,1.0);
}`;

const WATER_VS = `
attribute vec3 aP;
attribute vec3 aN;
attribute vec3 aC;
uniform mat4 uP;
uniform mat4 uV;
uniform float uTime;
varying vec3 vC;
varying vec3 vW;
void main(){
  vec3 p=aP;
  p.y+=sin(p.x*.09+p.z*.045+uTime)*.12+sin(p.z*.08-uTime*.7)*.05;
  vC=aC;vW=p;gl_Position=uP*uV*vec4(p,1.0);
}`;

const WATER_FS = `
precision mediump float;
varying vec3 vC;
varying vec3 vW;
uniform vec3 uFog;
uniform float uFogDensity;
void main(){
  float w1=sin(vW.x*.13+vW.z*.07),w2=sin(vW.z*.19-vW.x*.04);
  float shimmer=.88+.10*w1+.04*w2;
  vec3 c=mix(vC,vec3(.22,.42,.43),.32)*shimmer;
  c+=vec3(.18,.20,.17)*max(0.0,w1)*.12;
  float z=gl_FragCoord.z/gl_FragCoord.w;
  float fog=clamp(1.0-exp(-uFogDensity*uFogDensity*z*z),0.0,.84);
  gl_FragColor=vec4(mix(c,uFog,fog),.83);
}`;

function normalizeAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function createAncientSkyRenderer(gl) {
  const program = makeProgram(gl, SKY_VS, SKY_FS);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const locations = Object.freeze({
    aPos: gl.getAttribLocation(program, 'aPos'),
    uTop: gl.getUniformLocation(program, 'uTop'),
    uHorizon: gl.getUniformLocation(program, 'uHorizon'),
    uSunRel: gl.getUniformLocation(program, 'uSunRel'),
    uPitch: gl.getUniformLocation(program, 'uPitch'),
    uTime: gl.getUniformLocation(program, 'uTime'),
    uYaw: gl.getUniformLocation(program, 'uYaw'),
  });

  return {
    draw({ top, horizon, yaw = 0, pitch = 0, sunYaw = 1.15, time = performance.now() * 0.001 }) {
      const rel = normalizeAngle(sunYaw - yaw);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(locations.aPos);
      gl.vertexAttribPointer(locations.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(locations.uTop, new Float32Array(top));
      gl.uniform3fv(locations.uHorizon, new Float32Array(horizon));
      gl.uniform1f(locations.uSunRel, rel);
      gl.uniform1f(locations.uPitch, pitch);
      gl.uniform1f(locations.uTime, time);
      gl.uniform1f(locations.uYaw, yaw);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
    },
    destroy() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}

function appendWaterQuad(output, points, color) {
  const normal = [0, 1, 0];
  const push = (point) => output.push(...point, ...normal, ...color);
  push(points[0]); push(points[1]); push(points[2]);
  push(points[0]); push(points[2]); push(points[3]);
}

export function waterRect({ x0, x1, z0, z1, y, color }) {
  return { points: [[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]], color };
}

export function waterRibbon({ x0, z0, x1, z1, halfWidth, y, color }) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz) || 1;
  const nx = -dz / length * halfWidth;
  const nz = dx / length * halfWidth;
  return {
    points: [
      [x0 + nx, y, z0 + nz],
      [x1 + nx, y, z1 + nz],
      [x1 - nx, y, z1 - nz],
      [x0 - nx, y, z0 - nz],
    ],
    color,
  };
}

export function createAncientWaterRenderer(gl, surfaces = []) {
  const vertices = [];
  for (const surface of surfaces) appendWaterQuad(vertices, surface.points, surface.color);
  if (!vertices.length) return { draw() {}, destroy() {} };

  const program = makeProgram(gl, WATER_VS, WATER_FS);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  const count = vertices.length / 9;
  const locations = Object.freeze({
    aP: gl.getAttribLocation(program, 'aP'),
    aN: gl.getAttribLocation(program, 'aN'),
    aC: gl.getAttribLocation(program, 'aC'),
    uP: gl.getUniformLocation(program, 'uP'),
    uV: gl.getUniformLocation(program, 'uV'),
    uTime: gl.getUniformLocation(program, 'uTime'),
    uFog: gl.getUniformLocation(program, 'uFog'),
    uFogDensity: gl.getUniformLocation(program, 'uFogDensity'),
  });

  return {
    draw({ projection, view, fog, fogDensity, time = performance.now() * 0.001 }) {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const stride = 9 * 4;
      gl.enableVertexAttribArray(locations.aP);
      gl.vertexAttribPointer(locations.aP, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(locations.aN);
      gl.vertexAttribPointer(locations.aN, 3, gl.FLOAT, false, stride, 3 * 4);
      gl.enableVertexAttribArray(locations.aC);
      gl.vertexAttribPointer(locations.aC, 3, gl.FLOAT, false, stride, 6 * 4);
      gl.uniformMatrix4fv(locations.uP, false, projection);
      gl.uniformMatrix4fv(locations.uV, false, view);
      gl.uniform1f(locations.uTime, time);
      gl.uniform3fv(locations.uFog, new Float32Array(fog));
      gl.uniform1f(locations.uFogDensity, fogDensity);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, count);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    },
    destroy() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}
