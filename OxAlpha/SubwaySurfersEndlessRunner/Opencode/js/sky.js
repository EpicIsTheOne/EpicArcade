// sunset sky dome, sun, drifting clouds
import * as THREE from 'three';
import { randRange } from './utils.js';

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    const uniforms = {
      topColor: { value: new THREE.Color(0x2b1b5e) },
      midColor: { value: new THREE.Color(0xb0486e) },
      botColor: { value: new THREE.Color(0xff9d5c) },
      sunDir: { value: new THREE.Vector3(0.45, 0.18, -0.88).normalize() },
      sunColor: { value: new THREE.Color(0xffd9a0) },
    };
    this.uniforms = uniforms;
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms,
      vertexShader: `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          gl_Position = p;
        }`,
      fragmentShader: `
        uniform vec3 topColor, midColor, botColor, sunDir, sunColor;
        varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y*1.35+0.08, -1.0, 1.0);
          vec3 col = h > 0.12 ? mix(midColor, topColor, smoothstep(0.12, 0.75, h))
                              : mix(botColor, midColor, smoothstep(-0.05, 0.13, h));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 350.0)*1.2 + pow(s, 22.0)*0.42 + pow(s,4.0)*0.16);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 28, 14), mat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // clouds
    this.clouds = [];
    if (quality.clouds) {
      const cgeo = new THREE.PlaneGeometry(60, 14);
      for (let i = 0; i < 14; i++) {
        const matc = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.06 + Math.random() * 0.06, 0.6, 0.72),
          transparent: true, opacity: randRange(0.25, 0.5), fog: false, depthWrite: false,
        });
        const m = new THREE.Mesh(cgeo, matc);
        m.position.set(randRange(-400, 400), randRange(55, 130), -randRange(80, 700));
        scene.add(m);
        this.clouds.push(m);
      }
    }
    // birds flock (simple)
    this.birds = null;
  }

  update(dt, camPos) {
    this.dome.position.set(camPos.x, 0, camPos.z);
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > camPos.x + 420) c.position.x = camPos.x - 420;
    }
  }

  setBiomeTint(fogColorHex) {
    // gently shift horizon toward biome mood
    const f = new THREE.Color(fogColorHex);
    this.uniforms.botColor.value.lerp(f, 0.25);
  }
}
