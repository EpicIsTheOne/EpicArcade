// ============================================================
// NEON MERIDIAN — core/grade.js
// Color grading shader (day/dusk/night lift-gamma-gain-ish)
// applied as final composer pass.
// ============================================================
'use strict';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    nightAmt: { value: 0 },
    duskAmt: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float nightAmt;
    uniform float duskAmt;
    varying vec2 vUv;

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);

      // dusk warm push
      c.rgb *= mix(vec3(1.0), vec3(1.12, 0.94, 0.82), duskAmt * 0.7);

      // night: cool shadows, slight desaturation
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec3 nightTint = mix(vec3(0.72, 0.82, 1.12), vec3(1.0), lum);
      c.rgb = mix(c.rgb, c.rgb * nightTint, nightAmt * 0.85);
      c.rgb *= mix(1.0, 0.9, nightAmt);           // gentle darkening

      // filmic-ish contrast S-curve
      c.rgb = clamp(c.rgb, 0.0, 1.6);
      c.rgb = c.rgb * c.rgb * (3.0 - 2.0 * clamp(c.rgb, 0.0, 1.0)) * 0.35 + c.rgb * 0.65;

      // subtle vignette
      vec2 d = vUv - 0.5;
      float vig = 1.0 - dot(d, d) * (0.55 + nightAmt * 0.25);
      c.rgb *= vig;

      gl_FragColor = c;
    }`,
};

if (typeof module !== 'undefined') module.exports = { GradeShader };
