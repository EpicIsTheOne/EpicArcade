// ============================================================
// NEON MERIDIAN — systems/sky.js
// Sky dome shader, day/night cycle, sun/moon lights, fog,
// rain particle system, lamp/traffic-light switching.
// ============================================================
'use strict';

const Sky = (() => {

  function create(scene, quality) {
    const size = CONFIG.GRID * CONFIG.BLOCK;
    const C = CONFIG.COLORS;

    // ---- sky dome (BackSide sphere, custom gradient shader) ----
    const skyUniforms = {
      topColor: { value: new THREE.Color(C.skyDayTop) },
      horizonColor: { value: new THREE.Color(C.skyDayHorizon) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(C.sunDay) },
      sunIntensity: { value: 1 },
      starAmt: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position,1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        uniform float sunIntensity;
        uniform float starAmt;
        varying vec3 vWorld;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vWorld);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizonColor, topColor, pow(h, 0.62));
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          float disc = smoothstep(0.9992, 0.9997, sd);
          float glow = pow(sd, 90.0) * 0.55 + pow(sd, 8.0) * 0.12;
          col += sunColor * (disc * 2.2 + glow) * sunIntensity;
          if (starAmt > 0.001) {
            vec3 sp = floor(d * 180.0);
            float st = step(0.9975, hash(sp)) * starAmt * step(0.05, d.y);
            col += vec3(st);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(size * 2.2, 32, 16), skyMat);
    sky.frustumCulled = false;
    scene.add(sky);

    // ---- lights ----
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.castShadow = quality.shadows;
    const shadowCam = sun.shadow.camera;
    shadowCam.left = -90; shadowCam.right = 90; shadowCam.top = 90; shadowCam.bottom = -90;
    shadowCam.near = 10; shadowCam.far = 500;
    sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    sun.shadow.bias = -0.0006;
    scene.add(sun); scene.add(sun.target);

    const hemi = new THREE.HemisphereLight(0xbcd8ee, 0x54524a, 0.55);
    scene.add(hemi);

    const moonLight = new THREE.DirectionalLight(0x8fa8ff, 0.0);
    scene.add(moonLight);

    const fog = new THREE.Fog(C.fogDay, 120, quality.drawDist);
    scene.fog = fog;

    const st = {
      timeHours: 9.0,
      timeScale: 1 / 60,           // 1 real minute = 1 game hour
      nightAmt: 0, duskAmt: 0, isNight: false,
      lampMats: [], trafficLights: [],
      _tmp: new THREE.Vector3(),
      _c1: null, _c2: null,
    };

    // ---- rain ----
    let rainPts = null, rainGeo = null, rainVel = null;
    const RAIN_WIND_X = 6.5;

    function setWeather(mode) {
      // mode: 'clear' | 'rain'
      const want = mode === 'rain' ? quality.rain : 0;
      if (want > 0 && !rainPts || (want > 0 && rainVel && rainVel.length !== want)) buildRain(want);
      if (want === 0 && rainPts) { scene.remove(rainPts); rainGeo.dispose(); rainPts = null; }
      st.raining = mode === 'rain';
    }

    function buildRain(n) {
      if (rainPts) { scene.remove(rainPts); rainGeo.dispose(); }
      const pos = new Float32Array(n * 6);
      rainVel = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 160;
        const y = Math.random() * 55;
        const z = (Math.random() - 0.5) * 160;
        const len = 0.9 + Math.random() * 0.8;
        pos[i * 6]     = x; pos[i * 6 + 1] = y;         pos[i * 6 + 2] = z;
        pos[i * 6 + 3] = x; pos[i * 6 + 4] = y - len;   pos[i * 6 + 5] = z;
        rainVel[i] = 24 + Math.random() * 10;
      }
      rainGeo = new THREE.BufferGeometry();
      rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const rmat = new THREE.LineBasicMaterial({
        color: 0xaac4e8, transparent: true, opacity: 0.42, depthWrite: false,
      });
      rainPts = new THREE.LineSegments(rainGeo, rmat);
      rainPts.frustumCulled = false;
      scene.add(rainPts);
    }

    function updateRain(dt, camPos) {
      if (!rainPts) return;
      const p = rainGeo.attributes.position.array;
      for (let i = 0; i < rainVel.length; i++) {
        const fall = rainVel[i] * dt;
        p[i * 6 + 1] -= fall; p[i * 6 + 4] -= fall;
        p[i * 6] += RAIN_WIND_X * dt; p[i * 6 + 3] += RAIN_WIND_X * dt;
        // respawn above camera when fallen out or blown away
        if (p[i * 6 + 1] < camPos.y - 12 || Math.abs(p[i * 6] - camPos.x) > 95) {
          const nx = camPos.x + (Math.random() - 0.5) * 160;
          const nz = camPos.z + (Math.random() - 0.5) * 160;
          const ny = camPos.y + 30 + Math.random() * 25;
          const len = 0.9 + Math.random() * 0.8;
          p[i * 6] = nx; p[i * 6 + 1] = ny; p[i * 6 + 2] = nz;
          p[i * 6 + 3] = nx; p[i * 6 + 4] = ny - len; p[i * 6 + 5] = nz;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    // scratch colors (avoid per-frame allocation)
    const dayTop = new THREE.Color(C.skyDayTop), duskTop = new THREE.Color(C.skyDuskTop), nightTop = new THREE.Color(C.skyNightTop);
    const dayHor = new THREE.Color(C.skyDayHorizon), duskHor = new THREE.Color(C.skyDuskHorizon), nightHor = new THREE.Color(C.skyNightHorizon);
    const daySun = new THREE.Color(C.sunDay), duskSun = new THREE.Color(C.sunDusk), nightSun = new THREE.Color(C.sunNight);
    const fogNightTint = new THREE.Color(0x0a1220);
    const top = new THREE.Color(), hor = new THREE.Color(), sunCol = new THREE.Color();

    const api = {
      state: st,
      setWeather,
      /** Advance cycle. dt seconds; camPos follows sun shadow + rain box. */
      update(dt, camPos) {
        st.timeHours = (st.timeHours + dt * st.timeScale) % 24;
        const h = st.timeHours;
        const dayT = clamp((h - 6) / 12, 0, 1);       // daylight progress
        const elev = Math.sin(dayT * Math.PI);         // 0..1..0 over the day
        const az = (h / 24) * Math.PI * 2 - Math.PI * 0.5;
        const dir = st._tmp.set(
          Math.cos(az) * (1 - elev * 0.55),
          Math.max(elev, -0.25),
          Math.sin(az) * (1 - elev * 0.55),
        ).normalize();
        sun.position.copy(dir).multiplyScalar(220).add(camPos);
        sun.target.position.copy(camPos);
        sun.target.updateMatrixWorld();

        const night = 1 - smoothstep(-0.08, 0.14, elev);
        st.nightAmt = night;
        st.duskAmt = (elev > -0.08 && elev < 0.30)
          ? Math.max(0, 1 - Math.abs(elev - 0.11) / 0.19) : 0;
        st.isNight = night > 0.5;

        top.copy(dayTop).lerp(duskTop, st.duskAmt).lerp(nightTop, night);
        hor.copy(dayHor).lerp(duskHor, st.duskAmt).lerp(nightHor, night);
        sunCol.copy(daySun).lerp(duskSun, st.duskAmt).lerp(nightSun, night);

        skyUniforms.topColor.value.copy(top);
        skyUniforms.horizonColor.value.copy(hor);
        skyUniforms.sunDir.value.copy(dir);
        skyUniforms.sunColor.value.copy(sunCol);
        skyUniforms.sunIntensity.value = (1 - night) * (0.55 + 0.45 * smoothstep(0, 0.25, elev));
        skyUniforms.starAmt.value = night;

        sun.intensity = (1 - night) * 1.35;
        sun.color.copy(sunCol);
        moonLight.position.set(-dir.x * 220 + camPos.x, 200, -dir.z * 220 + camPos.z);
        moonLight.intensity = night * 0.22;
        hemi.intensity = 0.16 + (1 - night) * 0.42;
        hemi.color.copy(hor);
        hemi.groundColor.setHex(night > 0.5 ? 0x14161a : 0x54524a);

        fog.color.copy(hor).lerp(fogNightTint, night * 0.85);
        fog.near = 120 - night * 40;
        fog.far = quality.drawDist * (1 - night * 0.35);

        // emissive city furniture follows darkness
        for (const m of st.lampMats) m.emissiveIntensity = night * 1.5;
        for (const m of st.facadeMats) m.emissiveIntensity = night * 0.9 + st.duskAmt * 0.15;
        for (const tl of st.trafficLights) {
          const phase = (st.timeHours * 3600 + tl.node.phase) % 28;
          tl.mesh.material = phase < 14 ? tl.greenMat : tl.redMat;
        }

        updateRain(dt, camPos);
        sky.position.set(camPos.x, 0, camPos.z);
      },
      setTime(h) { st.timeHours = clamp(h, 0, 23.99); },
      get timeHours() { return st.timeHours; },
      get isNight() { return st.isNight; },
      get nightAmt() { return st.nightAmt; },
      get raining() { return !!st.raining; },
      registerWorldDynamics(dyn) { st.lampMats = dyn.lampMats; st.trafficLights = dyn.trafficLights; st.facadeMats = dyn.facadeMats || []; }
    };
    return api;
  }

  return { create };
})();

if (typeof module !== 'undefined') module.exports = { Sky: null };
