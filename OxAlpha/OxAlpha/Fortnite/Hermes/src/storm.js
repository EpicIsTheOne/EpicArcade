// ISLEBREAK storm: shrinking safe zone with phases, damage, visual wall.
import * as THREE from 'three';

export const STORM_PHASES = [
  { wait: 32,  shrink: 42, radius: 620, dps: 1 },
  { wait: 26,  shrink: 36, radius: 430, dps: 2 },
  { wait: 22,  shrink: 30, radius: 280, dps: 5 },
  { wait: 20,  shrink: 26, radius: 170, dps: 7 },
  { wait: 18,  shrink: 22, radius: 100, dps: 8 },
  { wait: 16,  shrink: 20, radius: 55,  dps: 10 },
  { wait: 14,  shrink: 18, radius: 24,  dps: 12 },
  { wait: 12,  shrink: 30, radius: 8,   dps: 14 },
];

export class Storm {
  constructor(scene, island) {
    this.island = island;
    this.center = new THREE.Vector2(0, 0);
    this.radius = 1050;
    this.targetCenter = this.center.clone();
    this.targetRadius = STORM_PHASES[0].radius;
    this.phaseIdx = -1;
    this.timer = STORM_PHASES[0].wait;
    this.state = 'waiting';   // waiting | shrinking | done
    this.dps = 0;
    this.startRadius = null;
    this.startCenter = null;

    // visual cylinder wall
    const geo = new THREE.CylinderGeometry(1, 1, 460, 96, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        colorA: { value: new THREE.Color(0x7a3bd6) },
        colorB: { value: new THREE.Color(0x3b6bd6) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv=uv;
          gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float time; uniform vec3 colorA; uniform vec3 colorB;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){
          vec2 i=floor(p); vec2 f=fract(p);
          f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                     mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
        }
        void main(){
          float n1 = noise(vUv*vec2(40.0, 8.0) + vec2(time*0.05, -time*0.12));
          float n2 = noise(vUv*vec2(18.0, 4.0) + vec2(-time*0.03, time*0.07));
          float band = smoothstep(0.35, 0.9, n1*0.6 + n2*0.5);
          float edgeFade = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
          vec3 col = mix(colorB, colorA, band);
          float alpha = (0.28 + band*0.4) * edgeFade;
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = 210;
    this.mesh.scale.set(this.radius, 1, this.radius);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // ground ring marker
    const ringGeo = new THREE.RingGeometry(0.985, 1.0, 128);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.y = 0.4;
    scene.add(this.ringMesh);
    this.updateVisuals();
  }

  nextPhase() {
    this.phaseIdx++;
    if (this.phaseIdx >= STORM_PHASES.length) {
      this.state = 'done';
      return;
    }
    const ph = STORM_PHASES[this.phaseIdx];
    this.state = 'shrinking';
    this.timer = ph.shrink;
    this.dps = ph.dps;
    this.targetRadius = ph.radius;
    this.beginShrinkFromCurrent();
    const maxOff = Math.max(0, this.radius - ph.radius);
    const a = Math.random() * Math.PI * 2;
    const off = Math.random() * maxOff * 0.55;
    this.targetCenter.set(this.center.x + Math.cos(a) * off, this.center.y + Math.sin(a) * off);
  }

  beginShrinkFromCurrent() {
    this.startRadius = this.radius;
    this.startCenter = this.center.clone();
  }

  update(dt, playersList) {
    if (this.state === 'waiting') {
      this.timer -= dt;
      if (this.timer <= 0) this.nextPhase();
    } else if (this.state === 'shrinking') {
      this.timer -= dt;
      const dur = STORM_PHASES[Math.min(this.phaseIdx, STORM_PHASES.length - 1)].shrink;
      const t01 = 1 - Math.max(0, this.timer / dur);
      this.radius = THREE.MathUtils.lerp(this.startRadius ?? this.radius, this.targetRadius, t01);
      this.center.lerpVectors(this.startCenter ?? this.center, this.targetCenter, t01);
      if (this.timer <= 0) {
        this.radius = this.targetRadius;
        this.center.copy(this.targetCenter);
        if (this.phaseIdx + 1 >= STORM_PHASES.length) {
          this.state = 'done';
        } else {
          this.state = 'waiting';
          this.timer = STORM_PHASES[this.phaseIdx + 1].wait;
          this.dps = STORM_PHASES[this.phaseIdx + 1].dps;
        }
      }
    }
    this.updateVisuals();
    for (const p of playersList) {
      if (!p.alive) continue;
      const dx = p.pos.x - this.center.x, dz = p.pos.z - this.center.y;
      const dist = Math.hypot(dx, dz);
      p.inStorm = dist > this.radius;
      if (p.inStorm && this.dps > 0) p.applyDamage(this.dps * dt, null, 'storm');
    }
    if (this.mesh.material.uniforms) this.mesh.material.uniforms.time.value += dt;
  }

  updateVisuals() {
    this.mesh.position.x = this.center.x;
    this.mesh.position.z = this.center.y;
    this.mesh.scale.set(this.radius, 1, this.radius);
    this.ringMesh.position.x = this.center.x;
    this.ringMesh.position.z = this.center.y;
    this.ringMesh.scale.setScalar(this.radius);
  }

  isSafe(x, z) {
    return Math.hypot(x - this.center.x, z - this.center.y) <= this.radius;
  }

  // time until storm fully closes at current phase (for UI)
  phaseLabel() {
    if (this.state === 'waiting') {
      const ni = Math.min(this.phaseIdx + 1, STORM_PHASES.length - 1);
      return `Storm shrinks in ${Math.ceil(this.timer)}s`;
    }
    if (this.state === 'shrinking') return `Storm closing — ${Math.ceil(this.timer)}s`;
    return 'Final circle';
  }
}
