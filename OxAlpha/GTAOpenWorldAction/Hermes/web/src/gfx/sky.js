// CHROME HARBOR — sky dome, sun/moon, day-night cycle, city-light activation, cloud deck.
import * as THREE from 'three';
import { clamp, lerp, smooth, RNG } from '../core/util.js';

const SKY_VERT = /* glsl */`
varying vec3 vWorld;
void main() {
  vWorld = normalize((modelMatrix * vec4(position, 1.0)).xyz);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */`
varying vec3 vWorld;
uniform vec3 uZenith, uHorizon, uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uNight;      // 0 day .. 1 night
uniform float uHaze;

float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

void main() {
  vec3 d = normalize(vWorld);
  float h = d.y;
  float horizonBand = exp(-max(h, 0.0) * (4.5 + uHaze * 6.0));
  vec3 col = mix(uZenith, uHorizon, horizonBand);
  if (h < 0.0) col = mix(uHorizon, uGround, clamp(-h * 5.0, 0.0, 1.0));

  // stars
  float night = uNight;
  if (night > 0.01 && h > -0.05) {
    vec3 sp = floor(d * 220.0);
    float st = hash(sp);
    float star = smoothstep(0.9985, 1.0, st) * night * smoothstep(0.02, 0.2, h);
    col += vec3(star) * (0.75 + 0.35 * sin(hash(sp.zyx) * 40.0));
  }

  // sun disc + glow
  float sd = dot(d, normalize(uSunDir));
  float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, sd);
  float glow = pow(clamp(sd, 0.0, 1.0), 24.0) * 0.55 + pow(clamp(sd, 0.0, 1.0), 350.0) * 1.2;
  col += uSunColor * (disc * 2.2 + glow);

  gl_FragColor = vec4(col, 1.0);
}`;

// palette keyframes by sun elevation (deg)
const KEYS = [
  { e: -90, zen: '#04060e', hor: '#0a1120', grd: '#05070c', sun: '#000000', hemiSky: '#141d31', hemiGnd: '#0a0d14', hemiInt: 0.16, sunInt: 0.0, moon: 0.30 },
  { e: -12, zen: '#0a1226', hor: '#27243c', grd: '#0a0c12', sun: '#ff7a3c', hemiSky: '#232a44', hemiGnd: '#12131c', hemiInt: 0.2, sunInt: 0.0, moon: 0.26 },
  { e: -3,  zen: '#1c2a52', hor: '#c96a3e', grd: '#171420', sun: '#ff8b46', hemiSky: '#3d4468', hemiGnd: '#1c1a22', hemiInt: 0.3, sunInt: 0.35, moon: 0.05 },
  { e: 4,   zen: '#2c4a86', hor: '#f0a45c', grd: '#232028', sun: '#ffc078', hemiSky: '#5d6f96', hemiGnd: '#2c2a30', hemiInt: 0.42, sunInt: 1.5, moon: 0.0 },
  { e: 15,  zen: '#3065b4', hor: '#a8d2ec', grd: '#2e3138', sun: '#fff0d0', hemiSky: '#7f97ba', hemiGnd: '#393c42', hemiInt: 0.52, sunInt: 2.4, moon: 0.0 },
  { e: 45,  zen: '#2e63c4', hor: '#b8e0f5', grd: '#34363c', sun: '#fff8ea', hemiSky: '#8fa9cc', hemiGnd: '#40434a', hemiInt: 0.6, sunInt: 2.9, moon: 0.0 },
  { e: 90,  zen: '#2a5fc0', hor: '#c4e6f8', grd: '#37393f', sun: '#ffffff', hemiSky: '#93aed2', hemiGnd: '#44464c', hemiInt: 0.62, sunInt: 3.1, moon: 0.0 },
];

const C_KEY = new THREE.Color(), C_NEXT = new THREE.Color();

export class SkySystem {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.scene;
    this.hours = 8.0;             // 24h clock
    this.dayLengthMin = 10;       // real minutes per day
    this.elev = 45; this.night = 0; this.nightRaw = 0;

    // ---- dome ----
    this.uniforms = {
      uZenith: { value: new THREE.Color('#2e63c4') },
      uHorizon: { value: new THREE.Color('#b8e0f5') },
      uGround: { value: new THREE.Color('#34363c') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#fff8ea') },
      uSunSize: { value: 0.99985 },
      uNight: { value: 0 },
      uHaze: { value: 0 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1600, 40, 20),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      }),
    );
    this.dome.layers.set(2);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // ---- lights ----
    this.sun = new THREE.DirectionalLight('#fff4dc', 2.8);
    this.sun.castShadow = true;
    const S = ctx.settings ? 1 : 1;
    const shadowCam = this.sun.shadow.camera;
    shadowCam.left = -110; shadowCam.right = 110; shadowCam.top = 110; shadowCam.bottom = -110;
    shadowCam.near = 10; shadowCam.far = 520;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.9;
    scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight('#8fa8ff', 0.0);
    scene.add(this.moon, this.moon.target);
    this.hemi = new THREE.HemisphereLight('#8fa9cc', '#40434a', 0.6);
    scene.add(this.hemi);
    this.amb = new THREE.AmbientLight('#30363f', 0.14);
    scene.add(this.amb);

    // ---- clouds ----
    this.clouds = new THREE.Group();
    const rng = new RNG('clouds');
    const cloudMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.5, depthWrite: false, color: '#ffffff', fog: false,
    });
    this.cloudMat = cloudMat;
    for (let i = 0; i < 16; i++) {
      const w = rng.range(220, 520), h = w * rng.range(0.32, 0.5);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), cloudMat);
      p.position.set(rng.range(-1300, 1300), rng.range(210, 380), rng.range(-1300, 1300));
      p.rotation.x = -Math.PI / 2; // flat overhead sheets read as cloud layers from below
      p.userData.drift = rng.range(2.5, 6);
      this.clouds.add(p);
    }
    this.clouds.traverse(o => o.layers && o.layers.set(2));
    scene.add(this.clouds);

    // ---- env cubemap for water ----
    this.cubeRT = new THREE.WebGLCubeRenderTarget(128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cubeCam = new THREE.CubeCamera(1, 2400, this.cubeRT);
    this.cubeCam.layers.set(2);
    scene.add(this.cubeCam);
    this._cubeTimer = 0;

    this.fogBase = 1000;
    this.fogMult = 1;
    if (ctx.scene.fog === null || ctx.scene.fog === undefined) ctx.scene.fog = new THREE.Fog('#b8e0f5', 60, this.fogBase);
    this.fog = ctx.scene.fog;

    this.onEnvReady = []; // callbacks once
  }

  setTimeOfDay(h) { this.hours = ((h % 24) + 24) % 24; }
  get time01() { return this.hours / 24; }

  update(dt, focus) {
    const st = this.ctx.settings;
    if (st.timeMode === 'dynamic') {
      this.hours = (this.hours + (dt / 60) * (24 / Math.max(this.dayLengthMin, 0.5))) % 24;
    } else {
      this.hours = { noon: 12.5, night: 2.0, sunset: 18.6, morning: 8.5 }[st.timeMode] ?? 12.5;
    }
    this.dayLengthMin = st.dayLengthMin;

    // sun elevation/azimuth
    const dayT = (this.hours - 6) / 12;                    // 0 at 6:00, 1 at 18:00
    const elevRad = Math.sin(clamp(dayT, -0.4, 1.4) * Math.PI) * (68 * Math.PI / 180);
    const azim = dayT * Math.PI - Math.PI / 2;             // east -> west
    const se = Math.sin(elevRad), ce = Math.cos(elevRad);
    const sunDir = this.uniforms.uSunDir.value.set(Math.sin(azim) * ce, se, Math.cos(azim) * ce).normalize();
    this.elev = elevRad * 180 / Math.PI;

    // palette interpolation
    const k = interpKeys(this.elev);
    this.uniforms.uZenith.value.copy(k.zen);
    this.uniforms.uHorizon.value.copy(k.hor);
    this.uniforms.uGround.value.copy(k.grd);
    this.uniforms.uSunColor.value.copy(k.sun);
    this.nightRaw = clamp((-this.elev + 2) / 8, 0, 1);
    this.night = smooth(this.nightRaw);
    this.uniforms.uNight.value = this.night;

    // lights follow
    const px = focus?.x ?? 0, pz = focus?.z ?? 0;
    const sunUp = this.elev > 1;
    this.sun.position.set(px + sunDir.x * 260, sunDir.y * 260 + 40, pz + sunDir.z * 260);
    this.sun.target.position.set(px, 0, pz);
    this.sun.intensity = k.sunInt * this.ctx.weather.sunMult();
    this.sun.color.copy(k.sun);
    this.sun.castShadow = this.ctx.preset.shadows && sunUp;
    this.moon.position.set(px - sunDir.x * 260, Math.max(80, -sunDir.y * 260), pz - sunDir.z * 260);
    this.moon.target.position.set(px, 0, pz);
    this.moon.intensity = k.moon * (1 - this.ctx.weather.overcast * 0.6);
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGnd);
    this.hemi.intensity = k.hemiInt * (1 + this.ctx.weather.overcast * 0.35);
    this.amb.intensity = 0.1 + this.night * 0.1;

    // fog matches horizon
    C_KEY.copy(k.hor).lerp(C_NEXT.copy(k.zen), 0.35);
    if (this.ctx.weather.overcast > 0) C_KEY.lerp(new THREE.Color('#8b929c'), this.ctx.weather.overcast * 0.6);
    this.fog.color.copy(C_KEY);
    const farTarget = this.fogBase * this.fogMult * (1 - this.ctx.weather.overcast * 0.35);
    this.fog.far += (farTarget - this.fog.far) * Math.min(1, dt * 0.8);
    this.fog.near = this.fog.far * 0.08;
    this.uniforms.uHaze.value = this.ctx.weather.overcast;

    // clouds drift
    this.cloudMat.opacity = 0.22 + this.ctx.weather.overcast * 0.55;
    const tint = 0.25 + (1 - this.night) * 0.75;
    this.cloudMat.color.setRGB(tint, tint, tint * (1 - this.nightRaw * 0.1));
    for (const c of this.clouds.children) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 1350) c.position.x -= 2700;
    }

    // city light activation
    const n = this.night;
    for (const m of this.ctx.city.facadeMats) m.emissiveIntensity = n * 1.5;
    this.ctx.city.lampHeadMat.emissiveIntensity = n * 2.6;
    this.ctx.city.lampGlowMat.opacity = n * 0.55;
    for (const m of this.ctx.city.signMats) m.color.setScalar(0.25 + n * 0.75 + Math.sin(performance.now() * 0.003) * 0.04);
    if (this.ctx.city.stadiumLamps) for (const m of this.ctx.city.stadiumLamps) m.emissiveIntensity = n * 1.6;

    // beacons blink
    const blink = (Math.sin(performance.now() * 0.004) > 0.4) ? 1 : 0;
    if (this.ctx.city.spireBeacon) this.ctx.city.spireBeacon.intensity = blink * 60;
    if (this.ctx.city.radioBeacon) this.ctx.city.radioBeacon.intensity = blink * 26;

    // water anim + env refresh
    const W = this.ctx.city.water;
    if (W) {
      W.offset += dt * 0.021;
      W.normals.offset.x = W.offset; W.normals.offset.y = W.offset * 0.6;
      W.mat.roughness = 0.1 + this.night * 0.05 + this.ctx.weather.wetness * 0;
      this._cubeTimer -= dt;
      if (this._cubeTimer <= 0) {
        this._cubeTimer = 3.0;
        this.dome.visible = true; this.clouds.visible = true;
        this.cubeCam.position.set(focus?.x ?? 0, 120, focus?.z ?? 0);
        this.cubeCam.update(this.ctx.renderer, this.ctx.scene);
        W.mat.envMap = this.cubeRT.texture;
        W.mat.needsUpdate = false;
      }
    }
    this.dome.visible = true;
  }
}

function interpKeys(elev) {
  let i = 0;
  while (i < KEYS.length - 1 && KEYS[i + 1].e < elev) i++;
  const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const span = Math.max(b.e - a.e, 0.001);
  const t = smooth(clamp((elev - a.e) / span, 0, 1));
  const col = (ka, kb, field) => {
    C_KEY.set(ka); C_NEXT.set(kb);
    return C_KEY.lerp(C_NEXT, t).clone();
  };
  return {
    zen: col(a.zen, b.zen), hor: col(a.hor, b.hor), grd: col(a.grd, b.grd),
    sun: col(a.sun, b.sun), hemiSky: col(a.hemiSky, b.hemiSky), hemiGnd: col(a.hemiGnd, b.hemiGnd),
    hemiInt: lerp(a.hemiInt, b.hemiInt, t),
    sunInt: lerp(a.sunInt, b.sunInt, t),
    moon: lerp(a.moon, b.moon, t),
  };
}

export function makeRain(ctx) {
  // rain streaks around camera — LineSegments repositioned modulo volume
  const N = 700;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 6);
  const rng = new RNG('rain');
  const drops = [];
  for (let i = 0; i < N; i++) drops.push({ x: rng.range(-40, 40), y: rng.range(0, 46), z: rng.range(-40, 40), s: rng.range(28, 42) });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: '#9fb6cc', transparent: true, opacity: 0.32 });
  const mesh = new THREE.LineSegments(geo, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  ctx.scene.add(mesh);
  return {
    mesh, drops,
    update(dt, camPos, intensity) {
      mesh.visible = intensity > 0.02;
      if (!mesh.visible) return;
      mat.opacity = 0.14 + intensity * 0.3;
      const arr = geo.attributes.position.array;
      const R = 40;
      for (let i = 0; i < N; i++) {
        const d = drops[i];
        d.y -= d.s * dt * (0.7 + intensity);
        if (d.y < 0) { d.y = 40 + Math.random() * 6; d.x = (Math.random() * 2 - 1) * R; d.z = (Math.random() * 2 - 1) * R; }
        const wx = camPos.x + ((d.x % R) + R) % R - R / 2;
        const wz = camPos.z + ((d.z % R) + R) % R - R / 2;
        const j = i * 6;
        arr[j] = wx; arr[j + 1] = camPos.y + d.y - 14; arr[j + 2] = wz;
        arr[j + 3] = wx; arr[j + 4] = arr[j + 1] - 0.9 - intensity * 0.7; arr[j + 5] = wz;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

export class WeatherSystem {
  constructor(ctx, rain) {
    this.ctx = ctx; this.rain = rain;
    this.state = 'clear';
    this.timer = 60;
    this.overcast = 0;     // 0..1
    this.wetness = 0;      // 0..1 road wetness
    this.rainI = 0;        // rendered intensity
    this.target = { overcast: 0, rain: 0 };
    this._boltT = 8;
    this._flash = 0;
  }
  sunMult() { return 1 - this.overcast * 0.55 + this._flash * 2.5; }
  force(state) {
    this.state = state;
    this.timer = 99999;
    this.applyTargets();
  }
  applyTargets() {
    if (this.state === 'clear') this.target = { overcast: 0.06, rain: 0 };
    else if (this.state === 'cloudy') this.target = { overcast: 0.55, rain: 0 };
    else if (this.state === 'rain') this.target = { overcast: 0.8, rain: 0.7 };
    else this.target = { overcast: 0.95, rain: 1 }; // storm
  }
  update(dt, camPos, playerPos) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 90 + Math.random() * 160;
      const roll = Math.random();
      this.state = roll < 0.42 ? 'clear' : roll < 0.68 ? 'cloudy' : roll < 0.88 ? 'rain' : 'storm';
      this.applyTargets();
      this.ctx.events.emit('weather', this.state);
    }
    const spd = 0.08;
    this.overcast += (this.target.overcast - this.overcast) * Math.min(1, dt * spd);
    this.rainI += (this.target.rain - this.rainI) * Math.min(1, dt * spd);
    this.wetness = clamp(this.wetness + (this.target.rain > 0.3 ? dt * 0.05 : -dt * 0.02), 0, 1);

    const pr = this.ctx.preset.rain ?? 1;
    this.rain.update(dt, camPos, this.rainI * pr);

    // lightning
    if (this.state === 'storm') {
      this._boltT -= dt;
      if (this._boltT <= 0) {
        this._boltT = 4 + Math.random() * 9;
        this._flash = 1;
        this.ctx.audio?.thunder(0.4 + Math.random() * 1.6);
      }
    }
    if (this._flash > 0) this._flash = Math.max(0, this._flash - dt * 2.2);

    // wet roads
    const gm = this.ctx.city.groundMat;
    gm.roughness = 0.94 - this.wetness * 0.5;
    gm.metalness = 0.02 + this.wetness * 0.25;
    gm.color.setScalar(1 - this.wetness * 0.16);
  }
}
