// Post-processing: bright-pass -> separable blur -> composite with ACES-ish tonemap,
// vignette, color grade. Custom minimal chain (no external deps).
'use strict';
(function () {
const FSQUAD_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uThreshold;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float f = max(0.0, l - uThreshold) / max(l, 0.0001);
  gl_FragColor = vec4(c * f, 1.0);
}`;

const BLUR_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uDir; // texel-scaled direction
void main() {
  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
  sum += texture2D(tDiffuse, vUv + uDir * 1.3846).rgb * 0.316216;
  sum += texture2D(tDiffuse, vUv - uDir * 1.3846).rgb * 0.316216;
  sum += texture2D(tDiffuse, vUv + uDir * 3.2308).rgb * 0.070270;
  sum += texture2D(tDiffuse, vUv - uDir * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}`;

const COMPOSITE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uVignette;
uniform vec3 uTintShadows;
uniform vec3 uTintHighs;
uniform float uSaturation;
uniform float uWaterFx;   // underwater wobble amount
uniform float uTime;

vec3 aces(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}
void main() {
  vec2 uv = vUv;
  if (uWaterFx > 0.001) {
    uv += vec2(sin(uv.y*24.0 + uTime*2.1), cos(uv.x*22.0 - uTime*1.7)) * 0.0045 * uWaterFx;
  }
  vec3 c = texture2D(tDiffuse, uv).rgb;
  vec3 b = texture2D(tBloom, uv).rgb;
  c += b * uBloomStrength;
  c *= uExposure;
  c = aces(c);
  // split-tone grade
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(uTintShadows, uTintHighs, smoothstep(0.0, 0.9, l)) * mix(vec3(1.0), c, 1.25);
  c = mix(vec3(l), c, uSaturation);
  // vignette
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * dot(q, q) * 1.4;
  gl_FragColor = vec4(c, 1.0);
}`;

class PostChain {
  constructor(renderer, opts) {
    opts = opts || {};
    this.renderer = renderer;
    this.enabled = opts.enabled !== false && !opts.lowMode;
    this.rtScene = new THREE.WebGLRenderTarget(opts.width || 1280, opts.height || 720, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });
    const half = opts.lowMode ? [opts.width >> 1, opts.height >> 1] : [opts.width >> 2, opts.height >> 2];
    this.rtBright = new THREE.WebGLRenderTarget(half[0], half[1], { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtBlurA = new THREE.WebGLRenderTarget(half[0], half[1], { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtBlurB = new THREE.WebGLRenderTarget(half[0], half[1], { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quadScene.add(this.quad);

    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: FSQUAD_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.brightMat = mk(BRIGHT_FRAG, { tDiffuse: { value: null }, uThreshold: { value: 0.72 } });
    this.blurMatH = mk(BLUR_FRAG, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1 / half[0], 0) } });
    this.blurMatV = mk(BLUR_FRAG, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(0, 1 / half[1]) } });
    this.compositeMat = mk(COMPOSITE_FRAG, {
      tDiffuse: { value: null },
      tBloom: { value: null },
      uBloomStrength: { value: 0.55 },
      uExposure: { value: 1.12 },
      uVignette: { value: 0.42 },
      uTintShadows: { value: new THREE.Color(0.92, 0.96, 1.08) },
      uTintHighs: { value: new THREE.Color(1.06, 1.02, 0.94) },
      uSaturation: { value: 1.12 },
      uWaterFx: { value: 0 },
      uTime: { value: 0 },
    });
    this.bloomThreshold = 0.72;
  }

  setSize(w, h) {
    this.rtScene.setSize(w, h);
    void w; void h;
  }

  /** render(scene, camera): scene renders into rt, post applied to screen. */
  render(scene, camera, env) {
    if (!this.enabled) { this.renderer.render(scene, camera); return; }
    const cm = this.compositeMat.uniforms;
    if (env) {
      cm.uExposure.value = env.exposure !== undefined ? env.exposure : 1.12;
      cm.uWaterFx.value = env.waterFx || 0;
      cm.uTime.value = env.time || 0;
      if (env.tintShadows) cm.uTintShadows.value.copy(env.tintShadows);
      if (env.tintHighs) cm.uTintHighs.value.copy(env.tintHighs);
      cm.uBloomStrength.value = (env.bloom !== undefined ? env.bloom : 0.55);
    }
    this.renderer.setRenderTarget(this.rtScene);
    this.renderer.render(scene, camera);
    // stash scene stats before the quad passes overwrite them
    this.sceneStats = {
      calls: this.renderer.info.render.calls,
      tris: this.renderer.info.render.triangles,
    };

    // bright pass
    this.quad.material = this.brightMat;
    this.brightMat.uniforms.tDiffuse.value = this.rtScene.texture;
    this.brightMat.uniforms.uThreshold.value = this.bloomThreshold;
    this.renderer.setRenderTarget(this.rtBlurA);
    this.renderer.render(this.quadScene, this.quadCam);
    // blur H/V x2
    for (let i = 0; i < 2; i++) {
      this.quad.material = this.blurMatH;
      this.blurMatH.uniforms.tDiffuse.value = this.rtBlurA.texture;
      this.renderer.setRenderTarget(this.rtBlurB);
      this.renderer.render(this.quadScene, this.quadCam);
      this.quad.material = this.blurMatV;
      this.blurMatV.uniforms.tDiffuse.value = this.rtBlurB.texture;
      this.renderer.setRenderTarget(this.rtBlurA);
      this.renderer.render(this.quadScene, this.quadCam);
    }
    // composite to screen
    this.quad.material = this.compositeMat;
    this.compositeMat.uniforms.tDiffuse.value = this.rtScene.texture;
    this.compositeMat.uniforms.tBloom.value = this.rtBlurA.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PostChain };
if (typeof self !== 'undefined') self.POST_MOD = { PostChain };
})();
