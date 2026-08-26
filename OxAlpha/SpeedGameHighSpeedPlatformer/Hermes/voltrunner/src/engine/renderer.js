// Renderer + sky + lighting + post-processing. Quality presets: ultra/high/medium/low.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const QUALITY = {
  ultra: { pixelRatio: Math.min(devicePixelRatio, 2), shadows: true, shadowSize: 2048, bloom: true, aa: true },
  high: { pixelRatio: Math.min(devicePixelRatio, 1.5), shadows: true, shadowSize: 1536, bloom: true, aa: true },
  medium: { pixelRatio: 1, shadows: true, shadowSize: 1024, bloom: false, aa: false },
  low: { pixelRatio: 0.72, shadows: false, shadowSize: 512, bloom: false, aa: false },
};

export class Renderer3D {
  constructor(canvas, qualityName = 'ultra') {
    this.canvas = canvas;
    this.setQuality(qualityName, true);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 1600);
    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    this.sun.position.set(60, 90, 40);
    this.scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.hemi = new THREE.HemisphereLight(0x8899ff, 0x223344, .7);
    this.scene.add(this.hemi);
  }
  setQuality(name, first = false) {
    const q = QUALITY[name] ?? QUALITY.ultra;
    this.qualityName = name;
    this.renderer?.dispose?.();
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: q.aa, powerPreference: 'high-performance'
    });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.q = q;
    if (q.shadows && this.sun) {
      this.sun.castShadow = true;
      const s = this.sun.shadow;
      s.mapSize.set(q.shadowSize, q.shadowSize);
      const cam = s.camera;
      cam.left = -48; cam.right = 48; cam.top = 48; cam.bottom = -48;
      cam.near = 10; cam.far = 260;
      s.bias = -0.0004; s.normalBias = 0.02;
    }
    if (!first) this.buildComposer();
  }
  buildComposer() {
    const q = this.q;
    if (!q.bloom) { this.composer = null; return; }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(innerWidth, innerHeight);
  }
  applyTheme(theme) {
    // fog
    this.scene.fog = new THREE.FogExp2(theme.fog.color, theme.fog.density);
    this.scene.background = new THREE.Color(theme.sky.bottom).multiplyScalar(.5);
    // sun
    this.sun.color.set(theme.sun.color);
    this.sun.intensity = theme.sun.intensity;
    this.hemi.color.set(theme.hemi.sky);
    this.hemi.groundColor.set(theme.hemi.ground);
    this.hemi.intensity = theme.hemi.intensity;
    // sky dome
    if (this.sky) { this.scene.remove(this.sky); this.sky.geometry.dispose(); }
    this.sky = makeSkyDome(theme);
    this.scene.add(this.sky);
    this.buildComposer();
  }
  updateSunFollow(playerPos) {
    const t = this.sunTarget.position;
    t.lerp(playerPos, 1);
    this.sun.position.copy(playerPos).add(this._sunDir ??= new THREE.Vector3(45, 75, 30));
  }
  render() {
    this.sky?.position.copy(this.camera.position);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

function makeSkyDome(theme) {
  const geo = new THREE.SphereGeometry(900, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(theme.sky.top) },
      mid: { value: new THREE.Color(theme.sky.mid ?? theme.sky.top) },
      bottom: { value: new THREE.Color(theme.sky.bottom) },
      sunDir: { value: theme.sun.dir.clone().normalize() },
      sunColor: { value: new THREE.Color(theme.sun.color) },
      stars: { value: theme.sky.stars ?? 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      uniform vec3 sunDir; uniform vec3 sunColor; uniform float stars;
      varying vec3 vDir;
      float hash(vec3 p){ p=fract(p*.3183+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        float h = vDir.y;
        vec3 col = h>0.0 ? mix(mid, top, pow(h,.65)) : mix(mid, bottom, pow(-h,.5));
        float sd = max(dot(vDir, sunDir), 0.0);
        col += sunColor * (pow(sd, 600.0)*3.0 + pow(sd, 24.0)*.35);
        if (stars > 0.01 && h > 0.02){
          vec3 sp = floor(vDir*220.0);
          float s = step(0.9985, hash(sp)) * stars;
          col += vec3(s)*(0.6+0.4*sin(hash(sp)*40.0));
        }
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  return new THREE.Mesh(geo, mat);
}
