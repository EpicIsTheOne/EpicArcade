// Chunk materials: one ShaderMaterial per render group sharing the atlas texture.
// Lighting is fully baked per-vertex (sky, block, ao*face-shade) => fast + stylized.
'use strict';
// dual-env loader: Node require / browser shim
(function () {
const __RQ = (p) => (typeof require !== 'undefined') ? require(p) : window.__req(p);

const VERT = `
attribute vec3 light; // normalized (sky, block, ao*shade)
varying vec2 vUv;
varying vec3 vLight;
varying vec3 vWorldPos;
uniform float uTime;
uniform float uWave;   // 1 for water group, 0 otherwise
void main() {
  vec3 p = position;
  if (uWave > 0.5) {
    p.y += sin(uTime * 1.7 + p.x * 0.9 + p.z * 0.8) * 0.045
         + sin(uTime * 2.3 + p.x * 0.5 - p.z * 0.6) * 0.03;
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  vUv = uv;
  vLight = light;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = `
precision highp float;
uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uDayLight;     // sky brightness multiplier 0..1
uniform vec3 uSunTint;       // warm at sunrise/set
uniform float uNightBlue;    // pushes shadows blue at night
uniform float uAlpha;
uniform int uCutout;
varying vec2 vUv;
varying vec3 vLight;
varying vec3 vWorldPos;

void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  if (uCutout == 1 && tex.a < 0.5) discard;
  float sky = vLight.r * uDayLight;
  float blk = vLight.g;
  float lum = max(sky, blk * 1.05);
  // torch warmth where block light dominates
  float warm = clamp(blk * 1.2 - sky, 0.0, 1.0);
  vec3 torchTint = mix(vec3(1.0), vec3(1.22, 0.94, 0.68), warm);
  // cool moonlight tint at night for sky-lit areas
  vec3 nightTint = mix(vec3(1.0), vec3(0.72, 0.80, 1.08), uNightBlue * clamp(sky - blk, 0.0, 1.0));
  vec3 col = tex.rgb * lum * torchTint * nightTint * vLight.b * uSunTint;
  float dist = length(vWorldPos - cameraPosition);
  float fogF = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, tex.a * uAlpha);
}`;

/** Build the atlas canvas in browser and return {canvas, avgColors} */
function buildAtlasBrowser() {
  const { buildAtlasCanvas } = __RQ('../shared/atlas.js');
  const { TILE_INDEX } = __RQ('../shared/atlas_meta.js');
  const out = buildAtlasCanvas((w, h) => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
  });
  // average color per tile (for particles/UI fallbacks)
  const avg = {};
  const ctx = out.canvas.getContext('2d');
  for (const name of Object.keys(TILE_INDEX)) {
    const i = TILE_INDEX[name];
    const d = ctx.getImageData((i % 8) * 16, Math.floor(i / 8) * 16, 16, 16).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let p = 0; p < d.length; p += 4) {
      if (d[p + 3] < 40) continue;
      r += d[p]; g += d[p + 1]; b += d[p + 2]; n++;
    }
    n = n || 1;
    avg[name] = [r / n / 255, g / n / 255, b / n / 255];
  }
  return { canvas: out.canvas, avg };
}

function makeChunkMaterials(atlasCanvas, opts) {
  const tex = new THREE.CanvasTexture(atlasCanvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false; // atlas UVs are computed in canvas space (top-left origin)
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  const mkUniforms = () => ({
    uAtlas: { value: tex },
    uFogColor: { value: new THREE.Color(0.62, 0.74, 0.92) },
    uFogNear: { value: opts.fogNear },
    uFogFar: { value: opts.fogFar },
    uDayLight: { value: 1 },
    uSunTint: { value: new THREE.Color(1, 1, 1) },
    uNightBlue: { value: 0 },
    uAlpha: { value: 1 },
    uTime: { value: 0 },
    uWave: { value: 0 },
    uCutout: { value: 0 },
  });

  const solid = new THREE.ShaderMaterial({
    uniforms: mkUniforms(), vertexShader: VERT, fragmentShader: FRAG, side: THREE.FrontSide,
  });
  const cutout = new THREE.ShaderMaterial({
    uniforms: mkUniforms(), vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.DoubleSide,
  });
  cutout.uniforms.uCutout.value = 1;
  const trans = new THREE.ShaderMaterial({
    uniforms: mkUniforms(), vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.DoubleSide, transparent: true, depthWrite: true,
  });
  trans.uniforms.uWave.value = 1;
  trans.uniforms.uAlpha.value = 0.78;
  return { solid, cutout, trans, texture: tex };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { makeChunkMaterials, buildAtlasBrowser };
if (typeof self !== 'undefined') self.MATERIALS_MOD = { makeChunkMaterials, buildAtlasBrowser };
})();
