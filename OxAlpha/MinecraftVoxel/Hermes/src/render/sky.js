// Sky dome with day/night gradient, sun, moon, stars — all shader-driven.
'use strict';
(function () {
const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p;
}`;

const SKY_FRAG = `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uStars;      // 0..1
uniform float uTime;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.05, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.62));
  // sun disc + glow
  float sd = dot(d, normalize(uSunDir));
  float disc = smoothstep(0.9993, 0.9997, sd);
  float glow = pow(max(sd, 0.0), 180.0) * 0.55 + pow(max(sd, 0.0), 8.0) * 0.12;
  col += uSunColor * (disc * 2.2 + glow);
  // moon
  float md = dot(d, normalize(uMoonDir));
  float mdisc = smoothstep(0.9995, 0.9998, md);
  float mglow = pow(max(md, 0.0), 220.0) * 0.4;
  col += vec3(0.9, 0.93, 1.0) * (mdisc * 1.4 + mglow);
  // stars (stable, only above horizon, fade by uStars)
  if (uStars > 0.01 && d.y > 0.02) {
    vec3 sp = floor(d * 220.0);
    float s = hash(sp);
    float star = step(0.9975, s) * uStars;
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
    col += vec3(star * tw);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// Keyframed sky palettes over the day cycle t in [0,1): 0=midnight
const KEYS = [
  { t: 0.00, zenith: [0.004, 0.006, 0.018], horizon: [0.012, 0.018, 0.045], sun: [0, 0, 0], fog: [0.015, 0.02, 0.05], dl: 0.16, nb: 1.0, stars: 1 },
  { t: 0.23, zenith: [0.02, 0.03, 0.08], horizon: [0.10, 0.07, 0.10], sun: [0.4, 0.2, 0.1], fog: [0.08, 0.07, 0.10], dl: 0.24, nb: 0.9, stars: 0.7 },
  { t: 0.27, zenith: [0.18, 0.22, 0.42], horizon: [0.95, 0.52, 0.28], sun: [1.0, 0.55, 0.25], fog: [0.55, 0.38, 0.32], dl: 0.62, nb: 0.35, stars: 0.08 }, // sunrise
  { t: 0.33, zenith: [0.30, 0.52, 0.85], horizon: [0.72, 0.82, 0.92], sun: [1.0, 0.97, 0.9], fog: [0.64, 0.76, 0.92], dl: 1.0, nb: 0, stars: 0 },
  { t: 0.50, zenith: [0.33, 0.56, 0.90], horizon: [0.74, 0.84, 0.95], sun: [1.0, 0.99, 0.94], fog: [0.66, 0.78, 0.94], dl: 1.05, nb: 0, stars: 0 },  // noon
  { t: 0.68, zenith: [0.30, 0.50, 0.84], horizon: [0.74, 0.80, 0.90], sun: [1.0, 0.95, 0.85], fog: [0.64, 0.74, 0.90], dl: 1.0, nb: 0, stars: 0 },
  { t: 0.73, zenith: [0.16, 0.18, 0.38], horizon: [0.98, 0.48, 0.22], sun: [1.0, 0.5, 0.2], fog: [0.55, 0.34, 0.28], dl: 0.6, nb: 0.3, stars: 0.1 },  // sunset
  { t: 0.79, zenith: [0.02, 0.03, 0.08], horizon: [0.10, 0.07, 0.12], sun: [0.3, 0.15, 0.1], fog: [0.07, 0.07, 0.11], dl: 0.22, nb: 0.9, stars: 0.8 },
  { t: 1.00, zenith: [0.004, 0.006, 0.018], horizon: [0.012, 0.018, 0.045], sun: [0, 0, 0], fog: [0.015, 0.02, 0.05], dl: 0.16, nb: 1.0, stars: 1 },
];

function sampleKeys(t, prop) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (t >= KEYS[i].t && t <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const span = b.t - a.t || 1;
  const f = (t - a.t) / span;
  const av = a[prop], bv = b[prop];
  if (typeof av === 'number') return av + (bv - av) * f;
  const out = [];
  for (let i = 0; i < av.length; i++) out.push(av[i] + (bv[i] - av[i]) * f);
  return out;
}

class SkyDome {
  constructor(scene, opts) {
    opts = opts || {};
    const geo = new THREE.SphereGeometry(900, 24, 16);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0.3, 0.5, 0.9) },
        uHorizon: { value: new THREE.Color(0.7, 0.8, 0.95) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uSunColor: { value: new THREE.Color(1, 1, 1) },
        uStars: { value: 0 },
        uTime: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    scene.add(this.mesh);
    this.scene = scene;
    this.mat = mat;
  }

  /** dayT: 0..1 (0=midnight, .25=sunrise, .5=noon, .75=sunset). Returns env state. */
  update(dayT, camPos, elapsed) {
    const ang = (dayT - 0.25) * Math.PI * 2; // sunrise at horizon east
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.18).normalize();
    this.mat.uniforms.uSunDir.value.copy(sunDir);
    this.mat.uniforms.uMoonDir.value.copy(sunDir).multiplyScalar(-1);
    const z = sampleKeys(dayT, 'zenith'), hz = sampleKeys(dayT, 'horizon');
    this.mat.uniforms.uZenith.value.setRGB(z[0], z[1], z[2]);
    this.mat.uniforms.uHorizon.value.setRGB(hz[0], hz[1], hz[2]);
    const sc = sampleKeys(dayT, 'sun');
    this.mat.uniforms.uSunColor.value.setRGB(sc[0], sc[1], sc[2]);
    this.mat.uniforms.uStars.value = sampleKeys(dayT, 'stars');
    this.mat.uniforms.uTime.value = elapsed;
    this.mesh.position.copy(camPos);
    const fog = sampleKeys(dayT, 'fog');
    const dl = sampleKeys(dayT, 'dl');
    const nb = sampleKeys(dayT, 'nb');
    return {
      sunDir, fogColor: fog, dayLight: dl, nightBlue: nb,
      sunTint: [1, 0.98 + 0.02 * Math.max(0, sunDir.y), 0.96],
    };
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { SkyDome, sampleKeys };
if (typeof self !== 'undefined') self.SKY_MOD = { SkyDome };
})();
