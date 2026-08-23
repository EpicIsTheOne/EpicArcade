// LIMINAL DYNAMICS — lightweight HDR post pipeline: bloom + grade + vignette + grain
import * as THREE from 'three';

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BRIGHT_FRAG = /* glsl */`
  uniform sampler2D tSrc;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float k = max(0.0, l - uThreshold) / max(l, 1e-4);
    gl_FragColor = vec4(c * k, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */`
  uniform sampler2D tSrc;
  uniform vec2 uDir;      // texel-sized direction
  varying vec2 vUv;
  void main() {
    // 9-tap gaussian
    vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
    c += texture2D(tSrc, vUv + uDir * 1.3846).rgb * 0.316216;
    c += texture2D(tSrc, vUv - uDir * 1.3846).rgb * 0.316216;
    c += texture2D(tSrc, vUv + uDir * 3.2308).rgb * 0.070270;
    c += texture2D(tSrc, vUv - uDir * 3.2308).rgb * 0.070270;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */`
  uniform sampler2D tScene;
  uniform sampler2D tBloomA;
  uniform sampler2D tBloomB;
  uniform float uBloom;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uTime;
  uniform float uSat;
  uniform vec3 uLift;     // shadows tint
  uniform vec3 uGain;     // highlights tint
  uniform float uFade;    // 0 = black
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    vec3 b = texture2D(tBloomA, vUv).rgb * 0.65 + texture2D(tBloomB, vUv).rgb * 0.9;
    c += b * uBloom;

    // ACES-ish tonemap
    c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);

    // color grade: lift/gain + saturation
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
    c = c * uGain + uLift * (1.0 - l);

    // vignette
    vec2 q = vUv - 0.5;
    c *= mix(1.0, smoothstep(0.85, 0.25, length(q)), uVignette);

    // film grain
    c += (hash(vUv * vec2(1920.0, 1080.0) + fract(uTime)) - 0.5) * uGrain;

    c *= uFade;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export class Composer {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.geo = new THREE.PlaneGeometry(2, 2);

    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: BRIGHT_FRAG,
      uniforms: { tSrc: { value: null }, uThreshold: { value: 1.05 } },
      depthTest: false, depthWrite: false,
    });
    this.blurMatH = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      depthTest: false, depthWrite: false,
    });
    this.blurMatV = this.blurMatH.clone();

    this.compMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
        uBloom: { value: 0.55 }, uVignette: { value: 0.55 }, uGrain: { value: 0.028 },
        uTime: { value: 0 }, uSat: { value: 1.06 },
        uLift: { value: new THREE.Vector3(0.012, 0.02, 0.038) },
        uGain: { value: new THREE.Vector3(1.0, 0.995, 0.985) },
        uFade: { value: 1.0 },
      },
      depthTest: false, depthWrite: false,
    });

    this.sceneRT = null;
    this.bloomA = null;
    this.bloomB = null;
    this.resize();
  }

  setQuality(q) {
    // q: 'ultra'|'high'|'medium'|'qa'
    this.compMat.uniforms.uBloom.value = q === 'ultra' ? 0.62 : q === 'high' ? 0.5 : q === 'medium' ? 0.35 : 0.0;
    this.compMat.uniforms.uGrain.value = q === 'qa' ? 0.0 : 0.028;
    this.enabled = q !== 'qa';
  }

  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(4, size.x), h = Math.max(4, size.y);
    for (const [name, rt] of [['scene', this.sceneRT], ['a', this.bloomA], ['b', this.bloomB]]) {
      if (rt) rt.dispose();
    }
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, samples: 4, depthBuffer: true,
    });
    this.bloomA = new THREE.WebGLRenderTarget(w >> 2 || 1, h >> 2 || 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.bloomB = new THREE.WebGLRenderTarget(w >> 2 || 1, h >> 2 || 1, { type: THREE.HalfFloatType, depthBuffer: false });
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    this.compMat.uniforms.uTime.value = performance.now() / 1000;

    // 1. scene -> HDR
    r.setRenderTarget(this.sceneRT);
    r.clear(true, true, true);
    r.render(scene, camera);

    // 2. brightpass
    this.brightMat.uniforms.tSrc.value = this.sceneRT.texture;
    this._blit(this.brightMat, this.bloomA);

    // 3. blur H then V (wide-ish)
    const texelA = new THREE.Vector2(1 / this.bloomA.width, 0);
    const texelB = new THREE.Vector2(0, 1 / this.bloomA.height);
    this.blurMatH.uniforms.tSrc.value = this.bloomA.texture;
    this.blurMatH.uniforms.uDir.value.copy(texelA).multiplyScalar(1.4);
    this._blit(this.blurMatH, this.bloomB);
    this.blurMatV.uniforms.tSrc.value = this.bloomB.texture;
    this.blurMatV.uniforms.uDir.value.copy(texelB).multiplyScalar(1.4);
    this._blit(this.blurMatV, this.bloomA);
    // second wider pass for soft halo
    this.blurMatH.uniforms.tSrc.value = this.bloomA.texture;
    this.blurMatH.uniforms.uDir.value.copy(texelA).multiplyScalar(3.0);
    this._blit(this.blurMatH, this.bloomB);
    this.blurMatV.uniforms.tSrc.value = this.bloomB.texture;
    this.blurMatV.uniforms.uDir.value.copy(texelB).multiplyScalar(3.0);
    this._blit(this.blurMatV, this.bloomA);

    // 4. composite to screen
    this.compMat.uniforms.tScene.value = this.sceneRT.texture;
    this.compMat.uniforms.tBloomA.value = this.bloomA.texture;
    this.compMat.uniforms.tBloomB.value = this.bloomB.texture;
    r.setRenderTarget(null);
    this._renderQuad(this.compMat);
  }

  _blit(mat, target) {
    this.renderer.setRenderTarget(target);
    this.renderer.clear(true, false, false);
    this._renderQuad(mat);
  }

  _renderQuad(mat) {
    if (!this._mesh) {
      this._mesh = new THREE.Mesh(this.geo, mat);
      this.quadScene.add(this._mesh);
      this._mesh.frustumCulled = false;
    }
    this._mesh.material = mat;
    this.renderer.render(this.quadScene, this.quadCam);
  }
}
