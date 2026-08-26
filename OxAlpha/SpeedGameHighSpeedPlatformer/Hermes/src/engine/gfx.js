import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as THREE_MBVH from 'three-mesh-bvh';

// Accelerate raycasting on all meshes (used by level colliders).
THREE.BufferGeometry.prototype.computeBoundsTree = THREE_MBVH.computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = THREE_MBVH.disposeBoundsTree;
THREE.Mesh.prototype.raycast = THREE_MBVH.acceleratedRaycast;

export const GFX_QUALITIES = ['ultra', 'high', 'medium', 'low'];

// Radial speed-lines + chromatic aberration + vignette pass. Intensity driven by game speed.
const SpeedFXShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0 },
    uAspect: { value: 1 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uAspect;
    uniform float uTime;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }

    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c);
      // streaks: angular noise stretched radially
      float ang = atan(c.y, c.x);
      float n = hash(vec2(floor(ang*40.0), floor(uTime*30.0)));
      float streak = smoothstep(0.55, 1.0, r) * step(0.72, n) * smoothstep(0.35, 0.9, uIntensity);
      vec2 dir = normalize(c + 1e-6);
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      col += vec3(0.75, 0.92, 1.0) * streak * (0.25 + 0.75*uIntensity);
      // subtle radial blur at boost
      if(uIntensity > 0.55){
        vec2 off = dir * (uIntensity-0.55) * 0.012;
        col = mix(col,
          ( texture2D(tDiffuse, vUv - off).rgb
          + texture2D(tDiffuse, vUv - off*2.0).rgb
          + texture2D(tDiffuse, vUv - off*3.0).rgb ) / 3.0, 0.5);
      }
      // chromatic aberration at edges scaled with intensity
      float ca = (0.0012 + uIntensity*0.0042) * smoothstep(0.2, 0.75, r);
      col.r = texture2D(tDiffuse, vUv + dir*ca).r;
      col.b = texture2D(tDiffuse, vUv - dir*ca).b;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Gfx {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2600);
    this.sun = new THREE.DirectionalLight(0xffffff, 3.0);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(2048, 2048);
    s.camera.near = 10; s.camera.far = 420;
    s.camera.left = -58; s.camera.right = 58; s.camera.top = 58; s.camera.bottom = -58;
    s.bias = -0.0006; s.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x30404a, 0.85);
    this.scene.add(this.hemi);

    this.speedFx = new ShaderPass(SpeedFXShader);
    this.bloom = null;
    this.composer = null;
    this.quality = 'high';
    this._texel = 116 / 2048;
    this.resize();
  }

  setQuality(q) {
    this.quality = q;
    const r = this.renderer;
    const W = window.innerWidth, H = window.innerHeight;
    if (q === 'ultra') {
      r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true; this.sun.shadow.mapSize.set(2048, 2048);
      this._setupComposer(true, W, H);
    } else if (q === 'high') {
      r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      r.shadowMap.enabled = true; this.sun.shadow.mapSize.set(1024, 1024);
      this._setupComposer(true, Math.floor(W / 2), Math.floor(H / 2));
    } else if (q === 'medium') {
      r.setPixelRatio(1);
      r.shadowMap.enabled = true; this.sun.shadow.mapSize.set(512, 512);
      this._setupComposer(false, W, H);
    } else {
      r.setPixelRatio(1);
      r.shadowMap.enabled = false;
      this._setupComposer(false, W, H);
    }
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.resize();
  }

  _setupComposer(bloom, bw, bh) {
    if (this.composer) { this.composer.dispose?.(); }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(bw, 64), Math.max(bh, 64)), 0.5, 0.65, 0.82);
      this.composer.addPass(this.bloom);
    }
    if (this.quality !== 'low') this.composer.addPass(this.speedFx);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, true);
    this.composer && this.composer.setSize(w, h);
    this.speedFx.uniforms.uAspect.value = w / h;
  }

  // Keep the shadow frustum centered on the player, snapped to texel grid to avoid shimmer.
  updateSun(playerPos, sunDir) {
    const cam = this.sun.shadow.camera;
    const texel = ((cam.right - cam.left) / this.sun.shadow.mapSize.x);
    const tx = Math.round(playerPos.x / texel) * texel;
    const tz = Math.round(playerPos.z / texel) * texel;
    this.sun.target.position.set(tx, playerPos.y, tz);
    this.sun.position.copy(this.sun.target.position).addScaledVector(sunDir, 160);
  }

  render(dt, elapsed, speedNorm01) {
    this.speedFx.uniforms.uTime.value = elapsed;
    this.speedFx.uniforms.uIntensity.value = speedNorm01;
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  get info() { return this.renderer.info; }
}
