/* SKYLINE DASH — FX: pooled GPU point particles (dust/sparks) + speed streaks */
window.PKFX = (function () {
  const softTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  function makePool(count, blending, baseSize) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const attr = new Float32Array(count * 2); // size, alpha
    for (let i = 0; i < count; i++) pos[i * 3 + 1] = -9999;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('pcol', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(attr, 2));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending,
      uniforms: { map: { value: softTex } },
      vertexShader: `
        attribute vec3 pcol; attribute vec2 psize; varying vec3 vC; varying float vA;
        void main(){
          vC = pcol; vA = psize.y;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = psize.x * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vC, t.a * vA);
          if (gl_FragColor.a < 0.01) discard;
        }`
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    const P = {
      points, count, cursor: 0,
      life: new Float32Array(count), maxLife: new Float32Array(count),
      vel: new Float32Array(count * 3), grav: new Float32Array(count),
      drag: new Float32Array(count),
      emit(x, y, z, vx, vy, vz, r, g, b, size, life, gravity, dragK) {
        const i = P.cursor; P.cursor = (P.cursor + 1) % count;
        pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z;
        P.vel[i*3] = vx; P.vel[i*3+1] = vy; P.vel[i*3+2] = vz;
        col[i*3] = r; col[i*3+1] = g; col[i*3+2] = b;
        attr[i*2] = size; attr[i*2+1] = 1;
        P.life[i] = life; P.maxLife[i] = life; P.grav[i] = gravity || 0; P.drag[i] = dragK || 0;
      },
      update(dt) {
        for (let i = 0; i < count; i++) {
          if (P.life[i] <= 0) continue;
          P.life[i] -= dt;
          if (P.life[i] <= 0) { attr[i*2+1] = 0; pos[i*3+1] = -9999; continue; }
          const dr = Math.max(0, 1 - P.drag[i] * dt);
          P.vel[i*3] *= dr; P.vel[i*3+2] *= dr;
          P.vel[i*3+1] = P.vel[i*3+1] * dr - P.grav[i] * dt;
          pos[i*3] += P.vel[i*3] * dt;
          pos[i*3+1] += P.vel[i*3+1] * dt;
          pos[i*3+2] += P.vel[i*3+2] * dt;
          attr[i*2+1] = Math.min(1, P.life[i] / (P.maxLife[i] * 0.6));
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.psize.needsUpdate = true;
        geo.attributes.pcol.needsUpdate = true;
      }
    };
    return P;
  }

  let dust, spark, streaks, streakGeo;
  const STREAKS = 26;

  function init(scene) {
    dust = makePool(200, THREE.NormalBlending, 0.34);
    spark = makePool(220, THREE.AdditiveBlending, 0.22);
    scene.add(dust.points); scene.add(spark.points);

    // speed streaks — short lines around camera when moving fast
    streakGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(STREAKS * 6);
    streakGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const smat = new THREE.LineBasicMaterial({
      color: 0x9fdcff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
    });
    streaks = new THREE.LineSegments(streakGeo, smat);
    streaks.frustumCulled = false;
    streaks.userData.seeds = [];
    for (let i = 0; i < STREAKS; i++) {
      streaks.userData.seeds.push({
        a: Math.random() * Math.PI * 2, r: 1.2 + Math.random() * 2.6,
        y: -0.8 + Math.random() * 1.9, len: 1.5 + Math.random() * 2.2
      });
    }
    scene.add(streaks);
  }

  const _v = new THREE.Vector3();

  function update(dt, camera, vel, speed) {
    dust.update(dt); spark.update(dt);
    // streaks follow camera, oriented along velocity
    const f = Math.min(Math.max((speed - 12.5) / 12, 0), 1);
    streaks.material.opacity = f * 0.5;
    if (f <= 0) return;
    const camDir = _v.copy(vel).normalize();
    const right = new THREE.Vector3().crossVectors(camDir, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, camDir);
    const arr = streakGeo.attributes.position.array;
    const cp = camera.position;
    for (let i = 0; i < STREAKS; i++) {
      const s = streaks.userData.seeds[i];
      const drift = ((performance.now() * 0.001 * (14 + speed * 1.4)) % (s.len * 4)) - s.len * 2;
      const bx = cp.x + right.x * Math.cos(s.a) * s.r + up.x * s.y;
      const by = cp.y + right.y * Math.cos(s.a) * s.r + up.y * s.y;
      const bz = cp.z + right.z * Math.cos(s.a) * s.r + up.z * s.y;
      const t = drift;
      arr[i*6]   = bx + camDir.x * t;
      arr[i*6+1] = by + camDir.y * t;
      arr[i*6+2] = bz + camDir.z * t;
      arr[i*6+3] = bx + camDir.x * (t + s.len);
      arr[i*6+4] = by + camDir.y * (t + s.len);
      arr[i*6+5] = bz + camDir.z * (t + s.len);
    }
    streakGeo.attributes.position.needsUpdate = true;
  }

  /* ---- event bursts ---- */
  function landBurst(p, impact) {
    const n = Math.min(Math.floor(impact * 2), 26);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random();
      dust.emit(p.x + Math.cos(a) * 0.35, p.y, p.z + Math.sin(a) * 0.35,
        Math.cos(a) * (1.5 + r * 3), 0.7 + Math.random() * 1.6, Math.sin(a) * (1.5 + r * 3),
        0.75, 0.72, 0.66, 0.3 + Math.random() * 0.25, 0.45, 3.5, 2.2);
    }
  }
  function slideDust(p, dirx, dirz) {
    dust.emit(p.x - dirx * 0.4 + (Math.random()-0.5)*0.4, p.y + 0.06, p.z - dirz * 0.4 + (Math.random()-0.5)*0.4,
      -dirx * 2 + (Math.random()-0.5)*1.5, 0.8 + Math.random(), -dirz * 2 + (Math.random()-0.5)*1.5,
      0.78, 0.74, 0.68, 0.28, 0.4, 2.5, 2);
  }
  function dashSparks(p, dx, dz) {
    for (let i = 0; i < 16; i++) {
      spark.emit(p.x, p.y + (Math.random()-0.3)*1.2, p.z,
        -dx * (4+Math.random()*7) + (Math.random()-0.5)*3, (Math.random()-0.2)*3, -dz*(4+Math.random()*7)+(Math.random()-0.5)*3,
        0.35 + Math.random()*0.3, 0.85, 1.0, 0.2, 0.35, 0, 1.6);
    }
  }
  function checkpointBurst(p) {
    const cols = [[0.4,0.95,1],[1,0.82,0.4],[0.94,0.55,0.95],[0.55,1,0.65]];
    for (let i = 0; i < 42; i++) {
      const c = cols[(Math.random()*cols.length)|0];
      const a = Math.random()*Math.PI*2, sp2 = 2+Math.random()*5;
      spark.emit(p.x+(Math.random()-0.5)*1.4, p.y+1+Math.random()*2.4, p.z+(Math.random()-0.5)*1.4,
        Math.cos(a)*sp2, 2.5+Math.random()*4, Math.sin(a)*sp2, c[0],c[1],c[2], 0.24, 0.85, 6, 0.6);
    }
  }
  function finishFireworks(p) {
    for (let k = 0; k < 3; k++) setTimeout(() => {
      const cx = p.x + (Math.random()-0.5)*10, cy = p.y + 5 + Math.random()*4, cz = p.z + (Math.random()-0.5)*8;
      const c = [[1,0.75,0.35],[0.4,0.9,1],[0.95,0.45,0.9]][k%3];
      for (let i = 0; i < 46; i++) {
        const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1), s = 4+Math.random()*5;
        spark.emit(cx, cy, cz, Math.sin(ph)*Math.cos(th)*s, Math.cos(ph)*s, Math.sin(ph)*Math.sin(th)*s,
          c[0],c[1],c[2], 0.22, 1.1, 5, 0.8);
      }
    }, k * 380);
  }
  function deathPoof(p) {
    for (let i = 0; i < 30; i++)
      spark.emit(p.x+(Math.random()-0.5), p.y+(Math.random()-0.5), p.z+(Math.random()-0.5),
        (Math.random()-0.5)*6, Math.random()*4, (Math.random()-0.5)*6, 1,0.25,0.3, 0.26, 0.7, 4, 1);
  }

  return { init, update, landBurst, slideDust, dashSparks, checkpointBurst, finishFireworks, deathPoof, marker: 'SKYDASH-FX-r01' };
})();
