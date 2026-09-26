export const NOISE = /* glsl */ `
float hash21(vec2 p){ p = fract(p*vec2(233.34, 851.73)); p += dot(p, p+23.45); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), u.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; }
  return v;
}
`;

export const fogPlaneVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const fogPlaneFrag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uSeed;
uniform vec3 uColor;
uniform vec3 uCam;
varying vec2 vUv;
varying vec3 vWorld;
${NOISE}
void main(){
  vec2 p = vUv*vec2(3.2, 1.3) + vec2(uSeed + uTime*0.018, uTime*0.004);
  float n = fbm(p + 0.8*fbm(p*0.8 - uTime*0.012));
  float edge = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x)
             * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
  float d = distance(vWorld, uCam);
  float near = smoothstep(0.8, 5.0, d);
  float a = smoothstep(0.32, 0.82, n) * edge * near * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`;

export const glowVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

/** Rectangular bloom around the portal, computed analytically. */
export const glowFrag = /* glsl */ `
uniform vec2 uSize;
uniform vec2 uHalf;
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * uSize;
  vec2 q = abs(p) - uHalf;
  float d = max(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0), 0.0);
  float breathe = 0.92 + 0.08*sin(uTime*0.7);
  float g = exp(-d*0.9)*0.35 + exp(-d*3.2)*0.55 + exp(-d*12.0)*0.5;
  gl_FragColor = vec4(vec3(1.0), g * uIntensity * breathe);
}
`;

/** Light spilling out of a portal across the floor, toward the viewer. */
export const spillFrag = /* glsl */ `
uniform float uIntensity;
varying vec2 vUv;
void main(){
  float x = abs(vUv.x - 0.5) * 2.0;
  float along = vUv.y; // 1 at the portal, 0 far toward camera
  float widen = mix(0.55, 0.2, along);
  float beam = exp(-pow(x / widen, 2.0) * 2.2);
  float fall = pow(along, 1.8);
  gl_FragColor = vec4(vec3(1.0), beam * fall * 0.75 * uIntensity);
}
`;

export const dustVert = /* glsl */ `
uniform float uTime;
uniform float uPx;
attribute float aSeed;
varying float vA;
void main(){
  vec3 p = position;
  p.x += sin(uTime*0.13 + aSeed*31.0)*0.6;
  p.y += mod(uTime*0.05*(0.3+aSeed) + aSeed*9.0, 6.0) - 3.0;
  p.z += cos(uTime*0.09 + aSeed*17.0)*0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  gl_PointSize = uPx * (0.6 + aSeed*1.6) * (6.0 / max(dist, 0.5));
  vA = smoothstep(26.0, 3.0, dist) * smoothstep(0.4, 1.8, dist);
  gl_Position = projectionMatrix * mv;
}
`;

export const dustFrag = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main(){
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, r) * vA * 0.55;
  gl_FragColor = vec4(uColor, a);
}
`;

/**
 * Silhouette material: ink body, but the grazing edges pick up the
 * surrounding haze — the way real fog eats the outline of a backlit body.
 */
export const inkVert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main(){
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 mvPosition = modelViewMatrix * local;
  vN = normalize(normalMatrix * n);
  vV = normalize(-mvPosition.xyz);
  vY = (modelMatrix * local).y;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const inkFrag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uInk;
uniform vec3 uRimColor;
uniform float uRim;
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(f, 4.0) * uRim;
  // Ground haze: feet sink into the floor fog, heads stay crisp.
  float ground = smoothstep(0.9, 0.0, vY) * 0.22;
  vec3 col = mix(uInk, uRimColor, clamp(rim + ground, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

export const postVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Final grade: cursor lens, scroll smear, volumetric light scattering
 * toward the portal, monochrome curve, vignette, film grain.
 */
export const postFrag = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uLight;
uniform float uRays;
uniform vec2 uMouse;
uniform float uLens;
uniform float uVel;
uniform float uFlash;
uniform float uFade;
varying vec2 vUv;

float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }

void main(){
  vec2 uv = vUv;
  vec2 asp = vec2(uRes.x/uRes.y, 1.0);

  // cursor: a soft glass lens that pulls the world toward the pointer
  vec2 d = (uv - uMouse) * asp;
  float r = length(d);
  float lens = smoothstep(0.26, 0.0, r);
  uv -= (d / asp) * lens * lens * 0.11 * uLens;

  // scroll velocity: horizontal heat-shimmer + vertical stretch
  float v = clamp(uVel, -1.0, 1.0);
  uv.x += sin(uv.y*38.0 + uTime*3.0) * 0.0025 * abs(v);
  uv.y = mix(uv.y, 0.5 + (uv.y-0.5)*(1.0 - 0.035*abs(v)), 1.0);

  vec3 col = texture2D(tScene, uv).rgb;

  // volumetric scattering from the brightest source
  if (uRays > 0.001) {
    const int N = 44;
    vec2 delta = (uv - uLight) / float(N) * 0.62;
    vec2 tc = uv;
    float decay = 1.0, acc = 0.0;
    for (int i = 0; i < N; i++) {
      tc -= delta;
      float l = dot(texture2D(tScene, tc).rgb, vec3(0.3333));
      acc += smoothstep(0.72, 1.0, l) * decay;
      decay *= 0.955;
    }
    col += (acc / float(N)) * uRays * 1.55;
  }

  float l = dot(col, vec3(0.299, 0.587, 0.114));
  l = smoothstep(-0.03, 1.02, l);
  l = mix(l, 1.0, uFlash);

  // lens edge: a faint ring so the cursor reads as optical glass
  float ring = smoothstep(0.012, 0.0, abs(r - 0.2)) * 0.05 * uLens;
  l += ring * (l > 0.5 ? -1.0 : 1.0);

  float vig = smoothstep(1.3, 0.32, length((vUv - 0.5) * vec2(1.15, 1.0)));
  l *= mix(0.5, 1.0, vig);

  l += (hash(vUv*uRes + fract(uTime*7.13)*91.7) - 0.5) * 0.075;
  l *= uFade;
  gl_FragColor = vec4(vec3(l), 1.0);
}
`;
