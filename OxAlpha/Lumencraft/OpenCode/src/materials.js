// Shared shader materials: terrain (voxel-lit, shadow-mapped), water/lava, crack overlay.
// NOTE: three.js auto-declares position/normal/uv attributes for ShaderMaterial;
// only custom attributes are declared here manually.
import * as THREE from 'three';

export const globalUniforms = {
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.2).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.96, 0.9) },
  uSkyLight: { value: 1 },          // day factor 0..1
  uAmbient: { value: 1 },           // ambient intensity (moonlight floor at night)
  uFogColor: { value: new THREE.Color(0.62, 0.76, 0.95) },
  uFogDensity: { value: 0.0055 },
  uSkyHorizon: { value: new THREE.Color(0.62, 0.76, 0.95) },
  uTime: { value: 0 },
  uRain: { value: 0 },
  uShadowMap: { value: null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowTexel: { value: 1 / 2048 },
  uShadowStrength: { value: 1 },
};

const TERRAIN_VERT = /* glsl */`
attribute vec3 alight;   // sky, block, ao
attribute vec3 tint;
attribute float glow;

uniform mat4 uShadowMatrix;

varying vec2 vUv;
varying vec3 vAlight;
varying vec3 vTint;
varying float vGlow;
varying vec3 vWorldPos;
varying vec4 vShadowCoord;

void main() {
  vUv = uv;
  vAlight = alight;
  vTint = tint;
  vGlow = glow;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vShadowCoord = uShadowMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SHADOW_FN = /* glsl */`
uniform sampler2D uShadowMap;
uniform float uShadowTexel;
uniform float uShadowStrength;
uniform vec3 uSunDir;

float sampleShadow(vec4 shadowCoord, vec3 nrm) {
  if (uShadowStrength <= 0.01) return 1.0;
  vec3 sc = shadowCoord.xyz / shadowCoord.w;
  if (sc.x < 0.002 || sc.x > 0.998 || sc.y < 0.002 || sc.y > 0.998 || sc.z > 1.0) return 1.0;
  float ndl = max(dot(nrm, uSunDir), 0.05);
  float bias = max(0.0018 * (1.0 - ndl), 0.0009);
  float sum = 0.0;
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      float d = texture2D(uShadowMap, sc.xy + vec2(float(dx), float(dy)) * uShadowTexel * 1.15).r;
      sum += step(sc.z - bias, d);
    }
  }
  float s = sum / 9.0;
  s = mix(s, 1.0, 0.10);
  return mix(1.0, s, uShadowStrength);
}
`;

const FOG_FN = /* glsl */`
uniform vec3 uFogColor;
uniform float uFogDensity;

vec3 applyFog(vec3 col) {
  float dist = length(vWorldPos - cameraPosition);
  float f = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}
`;

const TERRAIN_FRAG = /* glsl */`
uniform sampler2D map;
uniform vec3 uSunColor;
uniform float uSkyLight;
uniform float uAmbient;

varying vec2 vUv;
varying vec3 vAlight;
varying vec3 vTint;
varying float vGlow;
varying vec3 vWorldPos;
varying vec4 vShadowCoord;

${SHADOW_FN}
${FOG_FN}

void main() {
  vec4 tex = texture2D(map, vUv);
  if (tex.a < 0.5) discard;

  vec3 nrm = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  if (!gl_FrontFacing) nrm = -nrm;

  float shadow = sampleShadow(vShadowCoord, nrm);

  float sky = vAlight.x;
  float blk = vAlight.y;
  float ao  = vAlight.z;

  vec3 nightCol = vec3(0.11, 0.14, 0.24);
  vec3 dayCol   = mix(vec3(0.98, 0.98, 1.0), uSunColor, 0.45);
  vec3 ambCol   = mix(nightCol, dayCol, uSkyLight) * uAmbient;
  vec3 skyPart  = pow(sky, 1.22) * ambCol * shadow;

  vec3 torchPart = vec3(1.0, 0.56, 0.24) * pow(blk, 1.35) * 1.6;

  float ndl = max(dot(nrm, uSunDir), 0.0);
  float shape = mix(0.82, 1.20, ndl * uSkyLight);

  vec3 lit = (skyPart + torchPart + vec3(0.013, 0.015, 0.019)) * shape;
  lit = min(lit, vec3(1.65));

  vec3 col = tex.rgb * vTint * lit * mix(ao, 1.0, 0.32);
  col += tex.rgb * vGlow * 1.5;

  col = applyFog(col);
  gl_FragColor = vec4(col, 1.0);
}
`;

const WATER_VERT = /* glsl */`
attribute vec3 alight;
attribute vec3 tint;     // r = isLava

uniform mat4 uShadowMatrix;
uniform float uTime;

varying vec2 vUv;
varying vec3 vAlight;
varying float vIsLava;
varying vec3 vWorldPos;
varying vec4 vShadowCoord;

float waveN(vec2 p, float t) {
  return sin(p.x * 1.7 + t * 1.4) * cos(p.y * 2.1 + t * 1.1);
}

void main() {
  vUv = uv;
  vAlight = alight;
  vIsLava = tint.r;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  if (vIsLava < 0.5) {
    wp.y += waveN(wp.xz * 0.85, uTime) * 0.035 * step(0.8, fract(position.y + 0.13));
  }
  vWorldPos = wp.xyz;
  vShadowCoord = uShadowMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSkyLight;
uniform float uAmbient;
uniform vec3 uSkyHorizon;

varying vec2 vUv;
varying vec3 vAlight;
varying float vIsLava;
varying vec3 vWorldPos;
varying vec4 vShadowCoord;

${FOG_FN}

float waveH(vec2 p, float t) {
  return sin(p.x * 2.1 + t * 1.7) * cos(p.y * 1.9 + t * 1.3)
       + sin(p.x * 4.3 - t * 2.2 + p.y * 3.1) * 0.5;
}

void main() {
  if (vIsLava > 0.5) {
    float flow = sin(vWorldPos.x * 1.4 + uTime * 0.7) * sin(vWorldPos.z * 1.6 - uTime * 0.55);
    vec3 base = mix(vec3(0.80, 0.18, 0.01), vec3(1.05, 0.58, 0.08), 0.5 + 0.5 * flow);
    float crust = smoothstep(0.45, 0.75,
      sin(vWorldPos.x * 3.0 + uTime * 0.25) * sin(vWorldPos.z * 2.7 - uTime * 0.2));
    base = mix(base, vec3(0.30, 0.07, 0.01), crust * 0.65);
    base *= 1.25 + 0.15 * sin(uTime * 2.2 + flow * 3.0);
    gl_FragColor = vec4(applyFog(base), 1.0);
    return;
  }

  vec3 nrm = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  if (dot(nrm, viewDir) < 0.0) nrm = -nrm;

  // perturb with animated waves
  float e = 0.09;
  float h  = waveH(vWorldPos.xz * 0.8, uTime);
  float hx = waveH((vWorldPos.xz + vec2(e, 0.0)) * 0.8, uTime);
  float hz = waveH((vWorldPos.xz + vec2(0.0, e)) * 0.8, uTime);
  vec3 wn = normalize(nrm + vec3(-(hx - h) * 2.2, 0.0, -(hz - h) * 2.2));

  float fres = pow(1.0 - abs(dot(wn, viewDir)), 3.0);

  float sky = vAlight.x;
  float blk = vAlight.y;
  float lightMul = pow(max(sky * mix(0.12, 1.0, uSkyLight), blk), 1.2) + 0.06;

  vec3 deep = vec3(0.04, 0.20, 0.36);
  vec3 shallow = vec3(0.10, 0.42, 0.55);
  vec3 waterCol = mix(deep, shallow, 0.4 + 0.3 * sin(h)) * lightMul;

  // sky reflection + sun glint
  vec3 refl = reflect(-viewDir, wn);
  vec3 skyRef = uSkyHorizon * (0.7 + 0.3 * clamp(refl.y, 0.0, 1.0));
  float spec = pow(max(dot(refl, uSunDir), 0.0), 240.0);
  vec3 specC = uSunColor * spec * 2.2 * uSkyLight;

  vec3 col = mix(waterCol, skyRef, fres * 0.85) + specC;

  float alpha = mix(0.68, 0.94, fres);
  gl_FragColor = vec4(applyFog(col), alpha);
}
`;

export function createTerrainMaterial(atlas) {
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: atlas }, ...globalUniforms },
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
    side: THREE.DoubleSide,
    transparent: false,
  });
  m.name = 'terrain';
  return m;
}

export function createWaterMaterial(atlas) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...globalUniforms,
      uWaterAlpha: { value: 0.82 },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  m.name = 'water';
  return m;
}

// Break-progress crack overlay (samples one crack tile of the atlas).
const CRACK_FRAG = /* glsl */`
uniform sampler2D map;
uniform vec4 uRect; // u0,v0,u1,v1
varying vec2 vUv;
void main() {
  vec2 uv = uRect.xy + vUv * (uRect.zw - uRect.xy);
  vec4 tex = texture2D(map, uv);
  if (tex.a < 0.15) discard;
  gl_FragColor = tex;
}
`;
const CRACK_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export function createCrackMaterial(atlas) {
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: atlas }, uRect: { value: [0, 0, 1, 1] } },
    vertexShader: CRACK_VERT,
    fragmentShader: CRACK_FRAG,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return m;
}
