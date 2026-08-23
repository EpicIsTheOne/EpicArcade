// Volumetric-look clouds: layered noise in a raymarched dome fragment shader.
'use strict';
(function () {
const CLOUD_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const CLOUD_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uCoverage;
uniform float uDensity;
uniform vec3 uSunDir;
uniform vec3 uCloudColor;
uniform vec3 uCloudDark;
uniform float uWindX;
uniform float uWindZ;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.13 + 17.7; a *= 0.5; }
  return v;
}
// 2D intersection of ray with cloud plane at height h (camera at origin dir d)
vec2 planeHit(vec3 d, float h){
  float t = (h - 0.0) / max(d.y, 0.03);
  return d.xz * t;
}
void main() {
  vec3 d = normalize(vDir);
  if (d.y < 0.02) { gl_FragColor = vec4(0.0); discard; }
  float acc = 0.0;
  float light = 0.0;
  // 4 sample shells for pseudo-volume
  for (int i = 0; i < 4; i++) {
    float h = 0.22 + float(i) * 0.09;
    vec2 p = planeHit(d, h) * 0.012 + vec2(uWindX, uWindZ) * uTime * 0.008;
    float n = fbm(p);
    float cov = uCoverage;
    float shell = smoothstep(1.0 - cov, 1.0 - cov + 0.24 + float(i)*0.03, n);
    acc += shell * uDensity * (1.0 - float(i) * 0.16);
    // cheap sun-side lighting: sample offset toward sun
    vec2 sp = p + normalize(uSunDir.xz + vec2(0.001)) * 0.35;
    float sn = fbm(sp);
    light += shell * clamp(n - sn, -0.2, 0.35) * 2.4;
  }
  acc = clamp(acc, 0.0, 1.0);
  vec3 col = mix(uCloudDark, uCloudColor, clamp(0.45 + light, 0.0, 1.0));
  float alpha = acc * 0.92;
  gl_FragColor = vec4(col, alpha);
}`;

class CloudDome {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(880, 24, 16);
    const mat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
      side: THREE.BackSide, transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCoverage: { value: 0.42 },
        uDensity: { value: 1.0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uCloudColor: { value: new THREE.Color(1, 1, 1) },
        uCloudDark: { value: new THREE.Color(0.62, 0.66, 0.74) },
        uWindX: { value: 1 },
        uWindZ: { value: 0.3 },
      },
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -90;
    scene.add(this.mesh);
    this.mat = mat;
    this.baseCoverage = 0.42;
  }

  update(dayT, camPos, elapsed, weather) {
    this.mat.uniforms.uTime.value = elapsed;
    this.mat.uniforms.uSunDir.value.set(Math.cos((dayT - 0.25) * Math.PI * 2), Math.sin((dayT - 0.25) * Math.PI * 2), 0.18);
    const dayF = Math.max(0, Math.sin((dayT - 0.25) * Math.PI * 2));
    const bright = 0.25 + 0.75 * dayF;
    const cc = this.mat.uniforms.uCloudColor.value;
    const night = 1 - Math.min(1, dayF * 1.6 + 0.12);
    cc.setRGB(bright * (1 - night * 0.72), bright * (1 - night * 0.7), bright * (1 - night * 0.55));
    const cd = this.mat.uniforms.uCloudDark.value;
    cd.setRGB(0.62 * bright * (1 - night * 0.6), 0.66 * bright * (1 - night * 0.58), 0.74 * bright * (1 - night * 0.45));
    if (weather) {
      this.mat.uniforms.uCoverage.value = this.baseCoverage + weather.cloudBoost;
      this.mat.uniforms.uDensity.value = 1 + weather.cloudBoost * 1.4;
    }
    this.mesh.position.set(camPos.x, 0, camPos.z);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { CloudDome };
if (typeof self !== 'undefined') self.CLOUDS_MOD = { CloudDome };
})();
