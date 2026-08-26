// Sky dome (sun/moon/stars/sunset) + cloud layer + day/night cycle driver.
import * as THREE from 'three';
import { globalUniforms } from './materials.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = /* glsl */`
uniform float uSkyLight;
uniform float uTime;
uniform float uRain;
uniform float uSiege;
uniform vec3 uSunDir;
varying vec3 vDir;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec3 dir = normalize(vDir);
  float y = dir.y;

  vec3 zenDay   = vec3(0.16, 0.40, 0.82);
  vec3 horDay   = vec3(0.66, 0.80, 0.93);
  vec3 zenNight = vec3(0.006, 0.009, 0.026);
  vec3 horNight = vec3(0.045, 0.062, 0.13);

  vec3 zen = mix(zenNight, zenDay, uSkyLight);
  vec3 hor = mix(horNight, horDay, uSkyLight);
  vec3 col = mix(hor, zen, pow(clamp(y, 0.0, 1.0), 0.55));
  col = mix(col, hor * 0.72, smoothstep(0.0, -0.22, y));

  // sunset / sunrise glow toward sun azimuth
  vec3 sd = normalize(uSunDir);
  float sf = clamp(1.0 - abs(sd.y) * 4.0, 0.0, 1.0);
  vec2 dxz = normalize(dir.xz + vec2(0.0001));
  vec2 sxz = normalize(sd.xz);
  float az = max(dot(dxz, sxz), 0.0);
  float glow = sf * pow(az, 3.0) * exp(-max(y, 0.0) * 3.5);
  col += vec3(1.0, 0.42, 0.14) * glow * 1.35;
  col += vec3(0.75, 0.30, 0.35) * pow(sf, 2.0) * exp(-abs(y) * 6.0) * 0.25;

  // sun disc + halo
  float d = dot(dir, sd);
  vec3 sunCol = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.96, 0.86), clamp(sd.y * 2.5, 0.0, 1.0));
  col += sunCol * smoothstep(0.99920, 0.99965, d) * 4.0;
  col += sunCol * pow(max(d, 0.0), 350.0) * 0.8;
  col += sunCol * pow(max(d, 0.0), 10.0) * 0.10;

  // moon
  vec3 md = -sd;
  float m = dot(dir, md);
  float nightF = 1.0 - uSkyLight;
  vec3 moonTint = mix(vec3(1.0), vec3(1.7, 0.30, 0.24), uSiege);
  col += vec3(0.85, 0.88, 0.95) * moonTint * smoothstep(0.99945, 0.99978, m) * 1.7 * nightF;
  col += vec3(0.45, 0.52, 0.70) * moonTint * pow(max(m, 0.0), 220.0) * 0.35 * nightF;

  // blood moon wash: pull the whole dome toward crimson
  col = mix(col, vec3(0.20, 0.010, 0.014) + col * vec3(0.38, 0.10, 0.10), uSiege);

  // stars
  if (y > -0.05) {
    vec2 su = vec2(atan(dir.z, dir.x) * 57.29, asin(clamp(y, -1.0, 1.0)) * 114.59);
    vec2 cell = floor(su * 2.2);
    vec2 fpt = fract(su * 2.2);
    float h = hash21(cell);
    float star = step(0.985, h);
    vec2 off = vec2(hash21(cell + 7.1), hash21(cell + 3.7)) * 0.8 + 0.1;
    float dist = length(fpt - off);
    float tw = 0.55 + 0.45 * sin(uTime * 2.4 + h * 90.0);
    float s = star * smoothstep(0.16, 0.0, dist) * tw;
    s *= nightF * (1.0 - uRain * 0.9) * smoothstep(-0.02, 0.18, y);
    col += vec3(0.9, 0.93, 1.0) * s;
    // milky way band
    float band = exp(-pow((dir.y * 2.2 - dot(dir.xz, normalize(vec2(0.7, 0.4))) * 1.1), 2.0) * 3.0);
    col += vec3(0.35, 0.38, 0.5) * band * nightF * (1.0 - uRain) * 0.05;
  }

  col *= mix(1.0, 0.42, uRain);
  gl_FragColor = vec4(col, 1.0);
}
`;

const CLOUD_VERT = /* glsl */`
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CLOUD_FRAG = /* glsl */`
uniform float uTime;
uniform float uCoverage;   // 0 clear .. 1 overcast
uniform float uSkyLight;
uniform float uSunsetF;
uniform float uRain;
uniform vec3 uCloudTint;
uniform vec3 uSunDir;
varying vec3 vWorldPos;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1, 0)), c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec2 p = vWorldPos.xz * 0.004 + uTime * vec2(0.010, 0.004);
  float f = fbm(p + fbm(p * 0.6) * 0.4);
  float cov = mix(0.62, 0.30, uCoverage);
  float density = smoothstep(cov, cov + 0.24, f);

  float distC = length(vWorldPos.xz - cameraPosition.xz);
  float edge = smoothstep(720.0, 420.0, distC);
  float alpha = density * edge * mix(0.75, 0.95, uCoverage);
  if (alpha < 0.01) discard;

  // pseudo-thickness shading: sample offset toward sun
  float lit = fbm((vWorldPos.xz - uSunDir.xz * 60.0) * 0.004 + uTime * vec2(0.010, 0.004) + fbm(p * 0.6) * 0.4);
  float shade = clamp((f - lit) * 2.4 + 0.55, 0.15, 1.15);

  vec3 dayC = mix(vec3(1.02, 1.01, 0.99), vec3(0.62, 0.68, 0.80), uCoverage) * shade;
  vec3 nightC = vec3(0.05, 0.07, 0.12) * shade * 1.6;
  vec3 col = mix(nightC, dayC, uSkyLight);
  col += uCloudTint * uSunsetF * pow(f, 2.0) * 0.9;
  col *= mix(1.0, 0.55, uRain * 0.6);

  gl_FragColor = vec4(col, alpha);
}
`;

export function computeCelestial(time01) {
  const ang = time01 * Math.PI * 2;
  const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.28).normalize();
  const dayF = THREE.MathUtils.smoothstep(sunDir.y, -0.14, 0.16);
  const sunsetF = Math.max(0, 1 - Math.abs(sunDir.y) * 4.0) * (dayF > 0.02 || sunDir.y > -0.2 ? 1 : 0);
  const sunColor = new THREE.Color().lerpColors(
    new THREE.Color(1.0, 0.5, 0.16),
    new THREE.Color(1.0, 0.96, 0.87),
    THREE.MathUtils.clamp(sunDir.y * 3.0, 0, 1));
  const horizon = new THREE.Color().lerpColors(new THREE.Color(0.045, 0.06, 0.125), new THREE.Color(0.66, 0.79, 0.92), dayF);
  const zenith = new THREE.Color().lerpColors(new THREE.Color(0.006, 0.009, 0.026), new THREE.Color(0.16, 0.40, 0.82), dayF);
  horizon.lerp(new THREE.Color(0.98, 0.44, 0.14), sunsetF * 0.45);
  return { sunDir, dayF, sunsetF, sunColor, horizon, zenith };
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        ...globalUniforms,
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), this.domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: globalUniforms.uTime,
        uSkyLight: globalUniforms.uSkyLight,
        uRain: globalUniforms.uRain,
        uSunDir: globalUniforms.uSunDir,
        uCoverage: { value: 0 },
        uSunsetF: { value: 0 },
        uCloudTint: { value: new THREE.Color(1, 0.5, 0.2) },
      },
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 148;
    this.clouds.renderOrder = 1;
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sunLight.position.set(50, 100, 30);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);
    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x54442e, 0.55);
    scene.add(this.hemi);
  }

  update(time01, rainF, camPos, weather) {
    const cel = computeCelestial(time01);
    globalUniforms.uSunDir.value.copy(cel.sunDir);
    globalUniforms.uSkyLight.value = cel.dayF;
    globalUniforms.uAmbient.value = 1 - rainF * 0.25;
    globalUniforms.uRain.value = rainF;
    globalUniforms.uSunColor.value.copy(cel.sunColor);
    globalUniforms.uFogColor.value.copy(cel.horizon).lerp(new THREE.Color(0.35, 0.38, 0.44), rainF * 0.6);
    globalUniforms.uSkyHorizon.value.copy(globalUniforms.uFogColor.value);

    this.dome.position.copy(camPos);
    this.clouds.position.set(camPos.x, 148, camPos.z);

    this.cloudMat.uniforms.uCoverage.value = weather.coverage;
    this.cloudMat.uniforms.uSunsetF.value = cel.sunsetF;
    this.cloudMat.uniforms.uCloudTint.value.copy(cel.sunColor).lerp(new THREE.Color(1, 1, 1), 0.35);

    // entity lighting follows the sun/moon
    const isDay = cel.sunDir.y > -0.06;
    const lightDir = isDay ? cel.sunDir : cel.sunDir.clone().negate();
    this.sunLight.position.copy(lightDir).multiplyScalar(120).add(camPos);
    this.sunLight.target.position.copy(camPos);
    this.sunLight.intensity = isDay ? 0.35 + cel.dayF * 1.05 : 0.14;
    this.sunLight.color.copy(isDay ? cel.sunColor : new THREE.Color(0.55, 0.63, 0.85));
    this.hemi.intensity = 0.18 + cel.dayF * 0.42 - rainF * 0.1;

    return cel;
  }

  setEnabled(shadowsOn, cloudsOn) {
    this.dome.visible = true;
    this.clouds.visible = cloudsOn !== false;
  }
}
