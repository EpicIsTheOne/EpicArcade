/* SPX-RUN02-9F2 :: gl.js — WebGL renderer: one quad, one pass, whole FX chain in GLSL.
 * Sources: uploaded/demo texture (cover-fit) or 4 animated procedural scenes. */
(function () {
  'use strict';

  var VERT = [
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main(){',
    '  v_uv = a_pos * 0.5 + 0.5;',
    '  gl_Position = vec4(a_pos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform vec2  u_res;',
    'uniform float u_time;',
    'uniform float u_srcProc;',   // 0 = image texture, 1..4 = procedural scene
    'uniform float u_imgAspect;',

    'uniform float u_pixel;',
    'uniform float u_waveAmt, u_waveFreq, u_waveSpeed;',
    'uniform float u_swirl;',
    'uniform float u_split, u_splitAng;',
    'uniform float u_hue, u_sat, u_bright, u_contrast;',
    'uniform float u_noise, u_noiseSize;',
    'uniform float u_scanInt, u_scanCnt, u_scanSpd;',
    'uniform float u_vigAmt, u_vigRad;',
    'uniform float u_bloomAmt, u_bloomRad, u_bloomThr;',
    'uniform float u_mirror, u_invert;',

    'const float PI = 3.14159265;',

    'float hash21(vec2 p){',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = hash21(i);',
    '  float b = hash21(i + vec2(1.0, 0.0));',
    '  float c = hash21(i + vec2(0.0, 1.0));',
    '  float d = hash21(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
    '}',
    'float fbm(vec2 p){',
    '  float v = 0.0, a = 0.5;',
    '  for(int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.03 + vec2(11.3, 7.9); a *= 0.5; }',
    '  return v;',
    '}',
    'vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b * cos(6.28318 * (c * t + d)); }',
    'vec3 hueShift(vec3 col, float ang){',
    '  const vec3 k = vec3(0.57735);',
    '  float ca = cos(ang), sa = sin(ang);',
    '  return col * ca + cross(k, col) * sa + k * dot(k, col) * (1.0 - ca);',
    '}',

    // ---------- procedural scenes ----------
    'vec3 procPlasma(vec2 uv, float t){',
    '  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0) * 2.0;',
    '  float v = sin(p.x * 2.2 + t * 0.9)',
    '          + sin(p.y * 3.1 - t * 0.7)',
    '          + sin((p.x + p.y) * 2.0 + t * 0.5)',
    '          + sin(length(p) * 3.5 - t * 1.1);',
    '  v *= 0.25;',
    '  float w = fbm(p * 1.5 + vec2(t * 0.08, -t * 0.05)) * 0.35;',
    '  return pal(v + w, vec3(0.55, 0.45, 0.60), vec3(0.45, 0.40, 0.45), vec3(1.0, 1.0, 1.0), vec3(0.00, 0.25, 0.55));',
    '}',
    'vec3 procNebula(vec2 uv, float t){',
    '  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0) * 2.4;',
    '  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.06)), fbm(p + vec2(5.2, 1.3) - t * 0.05));',
    '  float n = fbm(p * 1.8 + q * 2.2 + vec2(t * 0.03, 0.0));',
    '  vec3 col = pal(n * 1.4 + q.x * 0.5, vec3(0.32, 0.24, 0.42), vec3(0.38, 0.30, 0.42), vec3(1.0, 0.9, 0.8), vec3(0.05, 0.18, 0.38));',
    '  col += vec3(0.9, 0.85, 1.0) * pow(clamp(n - 0.55, 0.0, 1.0) * 2.2, 2.0) * 0.8;',
    '  vec2 g = uv * u_res / 2.0;',
    '  float s = hash21(floor(g));',
    '  float tw = 0.6 + 0.4 * sin(t * 2.5 + s * 40.0);',
    '  col += vec3(step(0.9965, s) * tw);',
    '  return col;',
    '}',
    'vec3 procTunnel(vec2 uv, float t){',
    '  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0) * 2.0;',
    '  float r = length(p) + 1e-4;',
    '  float a = atan(p.y, p.x);',
    '  float depth = 0.35 / r + t * 0.7;',
    '  float rings = fract(depth);',
    '  float spokes = abs(sin(a * 6.0 + t * 0.4));',
    '  float shade = smoothstep(0.0, 0.25, rings) * smoothstep(1.0, 0.6, rings);',
    '  float glow = exp(-r * 0.9);',
    '  vec3 col = pal(fract(depth) * 0.35, vec3(0.45, 0.35, 0.55), vec3(0.45, 0.35, 0.40), vec3(1.0, 0.8, 0.6), vec3(0.0, 0.15, 0.30));',
    '  col *= shade * (0.4 + 0.6 * spokes);',
    '  col += vec3(1.0, 0.95, 0.85) * min(pow(glow, 3.0), 1.0) * 0.9;',
    '  return col;',
    '}',
    'vec3 procMetal(vec2 uv, float t){',
    '  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0) * 2.6;',
    '  float n1 = fbm(p * 1.6 + vec2(t * 0.15, 0.0));',
    '  float n2 = fbm(p * 2.4 + n1 * 2.6 - vec2(0.0, t * 0.12));',
    '  float ridge = abs(fract(n2 * 3.0) - 0.5) * 2.0;',
    '  float v = pow(1.0 - ridge, 3.0);',
    '  vec3 col = mix(vec3(0.05, 0.06, 0.09), vec3(0.85, 0.88, 0.95), v);',
    '  col += vec3(1.0) * pow(clamp(n2 - 0.62, 0.0, 1.0) * 2.6, 2.0);',
    '  col *= 0.8 + 0.4 * n1;',
    '  return col;',
    '}',

    'vec3 sampleSrc(vec2 uv){',
    '  if(u_srcProc < 0.5){',
    // cover-fit mapping (like background-size: cover)
    '    float ca = u_res.x / u_res.y;',
    '    vec2 f = vec2(1.0);',
    '    if(ca > u_imgAspect) f.y = u_imgAspect / ca; else f.x = ca / u_imgAspect;',
    '    vec2 tuv = (uv - 0.5) * f + 0.5;',
    '    return texture2D(u_tex, tuv).rgb;',
    '  } else if(u_srcProc < 1.5){ return procPlasma(uv, u_time);',
    '  } else if(u_srcProc < 2.5){ return procNebula(uv, u_time);',
    '  } else if(u_srcProc < 3.5){ return procTunnel(uv, u_time);',
    '  } else { return procMetal(uv, u_time); }',
    '}',

    '#define BTAP(dx, dy, w) bl += max(sampleSrc(uv + vec2(dx, dy) * ro) - u_bloomThr, 0.0) * w;',

    'void main(){',
    '  vec2 uv = v_uv;',
    '  float t = u_time;',

    '  if(u_mirror > 0.5 && uv.x > 0.5) uv.x = 1.0 - uv.x;',

    '  if(u_pixel > 1.5){',
    '    vec2 c = u_res / max(u_pixel, 1.0);',
    '    uv = (floor(uv * c) + 0.5) / c;',
    '  }',

    '  if(abs(u_waveAmt) > 0.0005){',
    '    uv.x += sin(uv.y * u_waveFreq * 6.28318 + t * u_waveSpeed) * u_waveAmt;',
    '    uv.y += cos(uv.x * u_waveFreq * 4.71239 + t * u_waveSpeed * 0.83) * u_waveAmt * 0.65;',
    '  }',

    '  if(abs(u_swirl) > 0.001){',
    '    float asp = u_res.x / u_res.y;',
    '    vec2 pc = (uv - 0.5) * vec2(asp, 1.0);',
    '    float r = length(pc);',
    '    float ang = radians(u_swirl) * pow(1.0 - clamp(r * 0.72, 0.0, 1.0), 1.6);',
    '    float cs = cos(ang), sn = sin(ang);',
    '    pc = mat2(cs, -sn, sn, cs) * pc;',
    '    uv = pc / vec2(asp, 1.0) + 0.5;',
    '  }',

    '  vec3 col;',
    '  float sp = u_split / max(u_res.y, 1.0);',
    '  if(sp > 0.0005){',
    '    vec2 dir = vec2(cos(u_splitAng), sin(u_splitAng)) * sp;',
    '    col.r = sampleSrc(uv + dir).r;',
    '    col.g = sampleSrc(uv).g;',
    '    col.b = sampleSrc(uv - dir).b;',
    '  } else {',
    '    col = sampleSrc(uv);',
    '  }',

    '  if(u_bloomAmt > 0.001){',
    '    vec3 bl = vec3(0.0);',
    '    vec2 ro = u_bloomRad * 0.05 * vec2(u_res.y / u_res.x, 1.0);',
    '    BTAP( 1.0,  0.0, 1.0) BTAP(-1.0,  0.0, 1.0) BTAP( 0.0,  1.0, 1.0) BTAP( 0.0, -1.0, 1.0)',
    '    BTAP( 0.707, 0.707, 0.6) BTAP(-0.707, 0.707, 0.6) BTAP(0.707, -0.707, 0.6) BTAP(-0.707, -0.707, 0.6)',
    '    col += bl * (u_bloomAmt / 7.6);',
    '  }',

    '  col = hueShift(col, radians(u_hue));',
    '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',
    '  col = mix(vec3(lum), col, u_sat);',
    '  col *= u_bright;',
    '  col = (col - 0.5) * u_contrast + 0.5;',

    '  if(u_invert > 0.5) col = 1.0 - col;',

    '  if(u_scanInt > 0.001){',
    '    float s = 0.5 + 0.5 * sin(uv.y * u_scanCnt * 6.28318 + t * u_scanSpd);',
    '    col *= 1.0 - u_scanInt * s;',
    '  }',

    '  if(u_noise > 0.001){',
    '    float n = hash21(uv * u_res / max(u_noiseSize, 0.5) + vec2(fract(t * 0.731) * 91.0, fract(t * 0.377) * 57.0));',
    '    col += (n - 0.5) * u_noise;',
    '  }',

    '  if(u_vigAmt > 0.001){',
    '    float d = distance(uv, vec2(0.5)) * 1.4142;',
    '    col *= 1.0 - u_vigAmt * smoothstep(u_vigRad * 0.7, u_vigRad * 0.7 + 0.45, d);',
    '  }',

    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('shader compile failed: ' + log);
    }
    return sh;
  }

  function create(canvas) {
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false })
        || canvas.getContext('experimental-webgl', { antialias: false, alpha: false });
    } catch (e) { gl = null; }
    if (!gl) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('program link failed: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    // fullscreen quad
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // auto-map every active uniform
    var U = {};
    var n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(prog, i);
      U[info.name] = gl.getUniformLocation(prog, info.name);
    }

    // Source texture. WebGL1 NPOT textures only support CLAMP_TO_EDGE, so wrap mode
    // is chosen per-upload: mirrored repeat (hides wave/swirl edge smear) for POT,
    // clamp for everything else.
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([16, 18, 24, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    function isPOT(n) { return (n & (n - 1)) === 0; }
    function applyWrap(pot) {
      var m = pot ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, m);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, m);
    }
    applyWrap(true);

    var imgAspect = 16 / 9;
    var srcProc = 2;

    function uploadImage(source) {
      applyWrap(isPOT(source.width) && isPOT(source.height));
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      imgAspect = source.width / source.height;
    }

    function setSource(procIdx, aspectOverride) {
      srcProc = procIdx | 0;
      if (typeof aspectOverride === 'number') imgAspect = aspectOverride;
    }

    function setParams(p) {
      for (var k in p) {
        var name = 'u_' + k;
        if (U[name]) gl.uniform1f(U[name], typeof p[k] === 'number' ? p[k] : 0);
      }
    }

    function render(time) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.uniform1i(U.u_tex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform2f(U.u_res, canvas.width, canvas.height);
      gl.uniform1f(U.u_time, time);
      gl.uniform1f(U.u_srcProc, srcProc);
      gl.uniform1f(U.u_imgAspect, imgAspect);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Render current frame and read back a wide center block (for tests/stats).
    // Deliberately spans ~55% of the canvas so scene centers that are intentionally
    // hot (e.g. the tunnel's glowing core) don't saturate every sample.
    function frameInfo() {
      render(lastTime);
      var w = Math.min(240, Math.max(48, (canvas.width * 0.55) | 0));
      var h = Math.min(135, Math.max(27, (canvas.height * 0.55) | 0));
      var px = new Uint8Array(w * h * 4);
      var x0 = Math.max(0, ((canvas.width - w) / 2) | 0);
      var y0 = Math.max(0, ((canvas.height - h) / 2) | 0);
      gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var sum = 0, sum2 = 0, hash = 0, cnt = w * h;
      for (var i = 0; i < cnt; i++) {
        var r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
        var l = 0.299 * r + 0.587 * g + 0.114 * b;
        sum += l; sum2 += l * l;
        hash = (hash * 31 + r + g * 3 + b * 7) | 0;
      }
      var mean = sum / cnt;
      return {
        mean: mean,
        std: Math.sqrt(Math.max(0, sum2 / cnt - mean * mean)),
        hash: 'h' + (hash >>> 0).toString(16)
      };
    }

    var lastTime = 0;
    var origRender = render;
    render = function (time) { lastTime = time; origRender(time); };

    function resize(cssW, cssH, dpr) {
      var w = Math.max(2, Math.round(cssW * dpr));
      var h = Math.max(2, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
    }

    return {
      gl: gl, canvas: canvas,
      resize: resize, render: render,
      setParams: setParams, setSource: setSource, uploadImage: uploadImage,
      frameInfo: frameInfo,
      get srcProc() { return srcProc; }
    };
  }

  window.SPGL = { create: create };
})();
