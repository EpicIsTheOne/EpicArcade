// Post-processing: HDR target -> bright pass -> separable blur pyramid -> composite
// (ACES tonemap, split-tone grade, vignette, underwater/damage/flash overlays).
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;

// fullscreen triangle
function makeFSQuad() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return g;
}

const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tex;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - uThreshold, 0.0) / max(l, 0.0001);
  gl_FragColor = vec4(c * k * k, 1.0);
}
`;

const BLUR_FRAG = /* glsl */`
uniform sampler2D tex;
uniform vec2 uDir;   // texel-scaled direction
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tex, vUv).rgb * 0.227027;
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  s += texture2D(tex, vUv + o1).rgb * 0.3162162162;
  s += texture2D(tex, vUv - o1).rgb * 0.3162162162;
  s += texture2D(tex, vUv + o2).rgb * 0.0702702703;
  s += texture2D(tex, vUv - o2).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tScene;
uniform sampler2D tBloomA;
uniform sampler2D tBloomB;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uVignette;
uniform float uDamage;
uniform float uUnderwater;
uniform float uSleepFade;
uniform float uFlash;
uniform float uTime;
uniform float uSaturation;
uniform vec2 uResolution;

varying vec2 vUv;

vec3 aces(vec3 x) {
  x *= 0.86;
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;

  // underwater refraction wobble
  if (uUnderwater > 0.01) {
    float w = sin(uv.y * 42.0 + uTime * 2.2) * cos(uv.x * 34.0 - uTime * 1.7);
    uv += w * 0.0022 * uUnderwater;
  }

  vec3 col = texture2D(tScene, uv).rgb;
  vec3 bloom = texture2D(tBloomA, uv).rgb * 1.0 + texture2D(tBloomB, uv).rgb * 1.35;
  col += bloom * uBloomStrength;

  col *= uExposure;

  // lightning / damage flashes before tonemap
  col += vec3(uFlash);

  // underwater tint
  col = mix(col, col * vec3(0.30, 0.55, 0.95) + vec3(0.0, 0.02, 0.06), uUnderwater * 0.85);

  col = aces(col);

  // split-tone grade: cool shadows, warm highlights
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSaturation);
  col += (1.0 - smoothstep(0.0, 0.45, lum)) * vec3(-0.008, 0.002, 0.018);
  col += smoothstep(0.55, 1.0, lum) * vec3(0.020, 0.010, -0.006);

  // gentle filmic contrast S-curve
  col = col * col * (3.0 - 2.0 * col) * 0.35 + col * 0.65;

  // vignette
  vec2 d = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  col *= 1.0 - dot(d, d) * uVignette;

  // damage red pulse
  float vig = dot((vUv - 0.5) * 1.6, (vUv - 0.5) * 1.6);
  col = mix(col, vec3(0.62, 0.05, 0.04), clamp(vig * uDamage, 0.0, 0.75));

  // sleep fade to black
  col *= (1.0 - uSleepFade);

  // gamma encode
  col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.quadGeo = makeFSQuad();
    this.cam = new THREE.Camera();

    const data = new Uint8Array([0, 0, 0, 255]);
    const tex = new THREE.DataTexture(data, 1, 1);
    tex.needsUpdate = true;
    this.blackTexture = tex;

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, uThreshold: { value: 0.92 } },
      vertexShader: VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false,
    });
    this.blurMatH = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, uDir: { value: [1, 0] } },
      vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.blurMatV = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, uDir: { value: [0, 1] } },
      vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloomA: { value: null },
        tBloomB: { value: null },
        uBloomStrength: { value: 0.55 },
        uExposure: { value: 1.15 },
        uVignette: { value: 0.55 },
        uDamage: { value: 0 },
        uUnderwater: { value: 0 },
        uSleepFade: { value: 0 },
        uFlash: { value: 0 },
        uTime: { value: 0 },
        uSaturation: { value: 1.12 },
        uResolution: { value: [1, 1] },
      },
      vertexShader: VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false, depthWrite: false,
    });
  }

  makeTarget(w, h, opts = {}) {
    return new THREE.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      ...opts,
    });
  }

  setSize(w, h) {
    this.disposeTargets();
    const bw = w >> 1, bh = h >> 1, qw = w >> 2, qh = h >> 2;
    this.brightA = this.makeTarget(bw, bh);
    this.blurA1 = this.makeTarget(qw, qh);
    this.blurA2 = this.makeTarget(qw, qh);
    this.blurB1 = this.makeTarget(bw >> 1 || 2, bh >> 1 || 2);
    this.blurB2 = this.makeTarget(bw >> 1 || 2, bh >> 1 || 2);
    this.compositeMat.uniforms.uResolution.value = [w, h];
  }

  disposeTargets() {
    for (const k of ['brightA', 'blurA1', 'blurA2', 'blurB1', 'blurB2']) {
      if (this[k]) { this[k].dispose(); this[k] = null; }
    }
  }

  _blit(mat, target) {
    const r = this.renderer;
    if (!this._mesh) {
      this._mesh = new THREE.Mesh(this.quadGeo, mat);
      this._scene = new THREE.Scene();
      this._scene.add(this._mesh);
    }
    this._mesh.material = mat;
    r.setRenderTarget(target);
    r.render(this._scene, this.cam);
  }

  render(sceneRT, enabled) {
    if (!enabled) {
      this.compositeMat.uniforms.tBloomA.value = this.blackTexture;
      this.compositeMat.uniforms.tBloomB.value = this.blackTexture;
    } else {
      // bright pass (half res)
      this.brightMat.uniforms.tex.value = sceneRT.texture;
      this._blit(this.brightMat, this.brightA);
      // level A: quarter res tight blur
      this.blurMatH.uniforms.tex.value = this.brightA.texture;
      this.blurMatH.uniforms.uDir.value = [(1 / this.blurA1.width) * 1.2, 0];
      this._blit(this.blurMatH, this.blurA1);
      this.blurMatV.uniforms.tex.value = this.blurA1.texture;
      this.blurMatV.uniforms.uDir.value = [0, (1 / this.blurA1.height) * 1.2];
      this._blit(this.blurMatV, this.blurA2);
      // level B: eighth res wide blur fed from bright
      this.blurMatH.uniforms.tex.value = this.brightA.texture;
      this.blurMatH.uniforms.uDir.value = [(1 / this.blurB1.width) * 1.7, 0];
      this._blit(this.blurMatH, this.blurB1);
      this.blurMatV.uniforms.tex.value = this.blurB1.texture;
      this.blurMatV.uniforms.uDir.value = [0, (1 / this.blurB1.height) * 1.7];
      this._blit(this.blurMatV, this.blurB2);
      this.compositeMat.uniforms.tBloomA.value = this.blurA2.texture;
      this.compositeMat.uniforms.tBloomB.value = this.blurB2.texture;
    }
    this._blit(this.compositeMat, null);
  }
}
