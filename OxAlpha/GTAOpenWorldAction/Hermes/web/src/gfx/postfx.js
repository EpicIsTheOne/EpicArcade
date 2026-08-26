// CHROME HARBOR — post processing: bloom + cinematic grade (vignette/saturation/grain/chroma)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.08 },
    uContrast: { value: 1.045 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uChroma: { value: 0.9 },
    uLift: { value: new THREE.Vector3(0.012, 0.008, 0.02) },   // cool shadows
    uGain: { value: new THREE.Vector3(1.03, 1.0, 0.96) },      // warm highlights
    uDamage: { value: 0 },
    uNightPunch: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uSaturation, uContrast, uVignette, uGrain, uChroma, uDamage, uNightPunch, uTime;
    uniform vec3 uLift, uGain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 fromC = uv - 0.5;
      float r2 = dot(fromC, fromC);
      // subtle chromatic aberration toward edges
      float ca = uChroma * r2 * 0.0035;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + fromC * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - fromC * ca).b;

      // lift/gain grade
      col = col * uGain + uLift;

      // contrast + saturation
      col = (col - 0.5) * uContrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      // night: cool the mids slightly, let neon sing
      col.b += uNightPunch * 0.03 * (1.0 - l);

      // damage pulse (red edges)
      col.r += uDamage * r2 * 1.4;
      col.gb *= 1.0 - uDamage * r2 * 0.55;

      // vignette
      col *= 1.0 - uVignette * smoothstep(0.15, 0.62, r2);

      // grain
      float g = (hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 61.7) - 0.5) * uGrain;
      col += g;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export function createPostFX(ctx) {
  const { renderer, scene, camera } = ctx;
  const preset = ctx.preset;
  const size = renderer.getSize(new THREE.Vector2());

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: preset.msaa || 0,
    colorSpace: THREE.LinearSRGBColorSpace,
  }));
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.62, 0.86);
  if (preset.bloom) composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  composer.setSize(size.x, size.y);

  return {
    composer, bloom, grade,
    render(dt, state) {
      const night = ctx.sky ? ctx.sky.night : 0;
      bloom.strength = preset.bloom ? 0.42 + night * 0.5 : 0;
      const u = grade.uniforms;
      u.uTime.value = performance.now() * 0.001;
      u.uNightPunch.value = night;
      u.uDamage.value = state.damageFx || 0;
      u.uVignette.value = 0.26 + night * 0.1;
      u.uGrain.value = 0.022 + night * 0.02;
      composer.render(dt);
    },
    setSize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },
  };
}
