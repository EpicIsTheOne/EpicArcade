/* SPECTRA-SPRUN02 — gl.js : WebGL1 single-pass FX renderer */
(function () {
  'use strict';

  const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const FRAG = `
precision highp float;
varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
uniform sampler2D uTex;
uniform float uHasTex;
uniform float uTexAspect;
uniform float uSrcMode;   /* 0 img · 1 plasma · 2 nebula · 3 tunnel · 4 metaballs */

uniform float uWaveAmt, uWaveFreq, uWaveSpeed, uTwirl, uFisheye, uPixelate, uKaleido;
uniform float uChroma, uRgbSplit, uHue, uSat, uBright, uContrast, uPosterize, uInvert;
uniform float uGlow, uGlowThr, uNoise, uScanline, uVignette;

float hash21(vec2 p){
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec3 hueShift(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float cs = cos(a), sn = sin(a);
  return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/* ---------- procedural sources ---------- */
vec3 srcPlasma(vec2 uv){
  vec2 p = uv * 5.0;
  float t = uTime * 0.55;
  float v = sin(p.x + t)
          + sin(p.y + t * 1.31)
          + sin((p.x + p.y) * 1.1 + t * 0.73)
          + sin(length(p - vec2(sin(t * 0.42) * 3.0, cos(t * 0.33) * 2.6)) * 1.35 - t * 0.5);
  v = v * 0.20 + 0.5;
  vec3 c1 = vec3(0.10, 0.03, 0.30);
  vec3 c2 = vec3(1.00, 0.33, 0.62);
  vec3 c3 = vec3(0.20, 0.92, 1.00);
  vec3 col = mix(c1, c2, smoothstep(-0.05, 0.50, v));
  return mix(col, c3, smoothstep(0.50, 0.90, v));
}
vec3 srcNebula(vec2 uv){
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.2;
  float t = uTime * 0.09;
  vec2 q = p;
  float f = 0.0, amp = 0.58;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for(int i = 0; i < 4; i++){
    f += amp * vnoise(q + vec2(t, -t * 0.6));
    q = m * q;
    amp *= 0.52;
  }
  vec3 col = mix(vec3(0.015, 0.010, 0.070), vec3(0.36, 0.10, 0.62), smoothstep(0.15, 0.80, f));
  col = mix(col, vec3(0.95, 0.56, 0.86), smoothstep(0.72, 1.10, f));
  vec2 cell = floor(p * 46.0);
  vec2 sc = (cell + vec2(hash21(cell + 3.1), hash21(cell + 7.7)) + 0.5) / 46.0;
  float sd = length((p - sc) * 46.0);
  float sb = step(0.982, hash21(cell + 13.37));
  col += sb * smoothstep(0.95, 0.10, sd) * (0.55 + 0.45 * sin(uTime * 2.6 + hash21(cell) * 91.0)) * vec3(0.98, 0.99, 1.0) * 1.35;
  return col;
}
vec3 srcTunnel(vec2 uv){
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float r = length(p) + 1e-4;
  float a = atan(p.y, p.x);
  float depth = 0.30 / r + uTime * 0.9;
  float rings = fract(depth * 2.1);
  float ringLine = smoothstep(0.13, 0.0, min(rings, 1.0 - rings));
  float spokes = fract(a / 6.2831853 * 14.0 - uTime * 0.15);
  float spokeLine = smoothstep(0.055, 0.0, min(spokes, 1.0 - spokes));
  float glowAmt = ringLine * 0.95 + spokeLine * 0.55;
  vec3 deep = mix(vec3(0.030, 0.010, 0.100), vec3(0.340, 0.080, 0.450), fract(depth * 0.5));
  vec3 lineCol = mix(vec3(0.10, 0.95, 1.00), vec3(1.00, 0.25, 0.65), 0.5 + 0.5 * sin(depth * 0.8));
  return deep + lineCol * glowAmt * smoothstep(0.0, 0.28, r);
}
vec3 srcMeta(vec2 uv){
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float msum = 0.0;
  for(int i = 0; i < 5; i++){
    float fi = float(i);
    vec2 c = vec2(
      sin(uTime * (0.50 + fi * 0.13) + fi * 2.1) * 0.60,
      cos(uTime * (0.43 + fi * 0.11) + fi * 1.7) * 0.45
    );
    vec2 d = p - c;
    msum += 0.085 / (dot(d, d) + 0.0085);
  }
  float v = smoothstep(1.7, 2.7, msum);
  vec3 col = mix(vec3(0.015, 0.025, 0.070), vec3(0.10, 0.85, 0.72), v);
  col += smoothstep(2.4, 3.4, msum) * vec3(0.85, 1.00, 0.40) * 0.55;
  return col;
}

/* ---------- sampling helpers ---------- */
vec2 coverUv(vec2 uv){
  float ca = uRes.x / max(uRes.y, 1.0);
  vec2 scale = (ca > uTexAspect) ? vec2(1.0, uTexAspect / ca) : vec2(ca / uTexAspect, 1.0);
  return 0.5 + (uv - 0.5) * scale;
}
vec3 baseSample(vec2 uv){
  if(uSrcMode < 0.5)      return texture2D(uTex, clamp(coverUv(uv), 0.001, 0.999)).rgb;
  else if(uSrcMode < 1.5) return srcPlasma(uv);
  else if(uSrcMode < 2.5) return srcNebula(uv);
  else if(uSrcMode < 3.5) return srcTunnel(uv);
  return srcMeta(uv);
}

void main(){
  float aspect = uRes.x / max(uRes.y, 1.0);

  /* --- geometry warp --- */
  vec2 p = vUv - 0.5;
  p.x *= aspect;
  float r = length(p);
  p *= 1.0 + uFisheye * r * r * 1.6;
  r = length(p);
  float ang = uTwirl * exp(-r * 2.0);
  float cs = cos(ang), sn = sin(ang);
  p = mat2(cs, -sn, sn, cs) * p;
  float wt = uTime * uWaveSpeed;
  p.x += uWaveAmt * 0.12 * sin(p.y * uWaveFreq + wt * 2.0);
  p.y += uWaveAmt * 0.10 * sin(p.x * uWaveFreq * 0.9 + wt * 1.7 + 1.3);
  if(uKaleido > 1.5){
    float seg = 6.2831853 / floor(uKaleido);
    float ka = abs(mod(atan(p.y, p.x), seg) - seg * 0.5);
    p = vec2(cos(ka), sin(ka)) * length(p);
  }
  vec2 wuv = p;
  wuv.x /= aspect;
  wuv += 0.5;
  if(uPixelate > 0.5){
    vec2 blocks = max(uRes / uPixelate, vec2(2.0));
    wuv = (floor(wuv * blocks) + 0.5) / blocks;
  }

  /* --- chromatic aberration + rgb split --- */
  vec2 ctr = wuv - 0.5;
  float rr = length(ctr);
  vec2 dir = rr > 0.0001 ? ctr / rr : vec2(0.0);
  vec2 caOff = dir * uChroma * (0.020 + 0.062 * rr);
  vec2 rsOff = vec2(uRgbSplit * 0.030, uRgbSplit * 0.012);
  vec3 col;
  col.r = baseSample(wuv + caOff + rsOff).r;
  col.g = baseSample(wuv).g;
  col.b = baseSample(wuv - caOff - rsOff).b;

  /* --- color grading --- */
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSat);
  col = hueShift(col, uHue);
  col *= uBright;
  col = (col - 0.5) * uContrast + 0.5;
  if(uPosterize > 1.5){
    float n = floor(uPosterize);
    col = floor(clamp(col, 0.0, 1.0) * n) / n;
  }

  /* --- cheap bloom --- */
  if(uGlow > 0.003){
    vec3 acc = vec3(0.0);
    vec2 pxA = vec2(4.0) / uRes;
    vec2 pxB = vec2(11.0) / uRes;
    for(int i = 0; i < 8; i++){
      float fi = float(i) * 0.7853982;
      vec2 o = vec2(cos(fi), sin(fi));
      acc += max(baseSample(wuv + o * pxA) - uGlowThr, 0.0);
      acc += max(baseSample(wuv + o * pxB) - uGlowThr, 0.0);
    }
    col += acc * (uGlow * 0.105);
  }

  col = clamp(col, 0.0, 1.0);
  if(uInvert > 0.5) col = 1.0 - col;

  /* --- CRT & film --- */
  float sl = sin(vUv.y * uRes.y * 3.14159);
  col *= 1.0 - uScanline * 0.55 * (0.5 + 0.5 * sl);
  float g = hash21(vUv * uRes + vec2(fract(uTime * 13.71) * 89.0, fract(uTime * 7.33) * 57.0));
  col += (g - 0.5) * uNoise * 0.38;
  float vd = length(vUv - 0.5) * 1.4142;
  col *= mix(1.0, smoothstep(1.05, 0.35, vd), uVignette);

  gl_FragColor = vec4(col, 1.0);
}`;

  const UNIFORM_OF_PARAM = {
    waveAmt: 'uWaveAmt', waveFreq: 'uWaveFreq', waveSpeed: 'uWaveSpeed',
    twirl: 'uTwirl', fisheye: 'uFisheye', pixelate: 'uPixelate', kaleido: 'uKaleido',
    chroma: 'uChroma', rgbSplit: 'uRgbSplit', hue: 'uHue', sat: 'uSat',
    bright: 'uBright', contrast: 'uContrast', posterize: 'uPosterize', invert: 'uInvert',
    glow: 'uGlow', glowThr: 'uGlowThr', noise: 'uNoise', scanline: 'uScanline', vignette: 'uVignette',
  };
  const SRC_INDEX = { image: 0, plasma: 1, nebula: 2, tunnel: 3, metaballs: 4 };

  window.createRenderer = function (canvas) {
    let gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
        || canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) return { ok: false };

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error('Shader compile failed: ' + log);
      }
      return sh;
    }

    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('Program link failed: ' + gl.getProgramInfoLog(prog));
      }
    } catch (err) {
      console.error('[SPRUN02]', err.message);
      return { ok: false, error: err.message };
    }
    gl.useProgram(prog);

    // fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // 1x1 white dummy texture
    const dummy = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, dummy);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

    let curTex = dummy;
    let hasTex = false;
    let texAspect = 1;

    const locCache = {};
    function U(name) {
      if (!(name in locCache)) locCache[name] = gl.getUniformLocation(prog, name);
      return locCache[name];
    }

    function setTexture(source, aspect) {
      if (!curTex || curTex === dummy) curTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, curTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      texAspect = aspect || 1;
      hasTex = true;
    }
    function clearTexture() {
      curTex = dummy;
      hasTex = false;
    }

    function resize(cssW, cssH, quality) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.floor(cssW * dpr * quality));
      const h = Math.max(2, Math.floor(cssH * dpr * quality));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
    }

    /** params: plain object keyed by SPStore param ids */
    function render(params, srcId, timeSec) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, curTex);
      gl.uniform1i(U('uTex'), 0);
      gl.uniform1f(U('uHasTex'), hasTex ? 1 : 0);
      gl.uniform1f(U('uTexAspect'), texAspect);
      gl.uniform2f(U('uRes'), canvas.width, canvas.height);
      gl.uniform1f(U('uTime'), timeSec);
      gl.uniform1f(U('uSrcMode'), SRC_INDEX[srcId] != null ? SRC_INDEX[srcId] : 1);

      for (const id in UNIFORM_OF_PARAM) {
        const v = params[id];
        if (typeof v === 'boolean') gl.uniform1f(U(UNIFORM_OF_PARAM[id]), v ? 1 : 0);
        else gl.uniform1f(U(UNIFORM_OF_PARAM[id]), typeof v === 'number' ? v : 0);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    return {
      ok: true, gl, canvas,
      setTexture, clearTexture, resize, render,
      info: (gl.getParameter(gl.RENDERER) || 'WebGL'),
    };
  };
})();
