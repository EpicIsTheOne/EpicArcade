// Chunk mesher: blocks+light -> typed-array geometries.
// Groups: solid (front-side), cutout (double-sided leaves/plants), trans (water/glass/ice).
// Vertex attrs: pos f32x3, uv f32x2, light ubx3 (sky, block, ao), norm idx bx1
'use strict';
(function () {
if (typeof importScripts === 'function') importScripts('http://127.0.0.1:8477/src/shared/blocks.js', 'http://127.0.0.1:8477/src/shared/atlas_meta.js');
const REQ = (p) => {
  const G = (typeof self !== 'undefined') ? self : globalThis;
  if (typeof require !== 'undefined') { try { return require(p); } catch (e) { void e; } }
  if (p.endsWith('blocks.js')) return G.BLOCKS_MOD;
  if (p.endsWith('atlas_meta.js')) return G.TILE_META;
  throw new Error('module not available: ' + p);
};
const { BLOCKS, B } = REQ('../shared/blocks.js');
const { TILE_INDEX } = REQ('../shared/atlas_meta.js');

const CS = 16, WH = 128;
const idxOf = (x, y, z) => x + z * CS + y * CS * CS;
const ATLAS_COLS = 8;
const ATLAS_ROWS = Math.ceil(Object.keys(TILE_INDEX).length / ATLAS_COLS);

const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// CCW corners seen from outside
const FACES_CORNERS = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],   // +x
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],   // -x
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],   // +y
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],   // -y
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],   // +z
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],   // -z
];
const FACE_SHADE = [0.84, 0.84, 1.0, 0.58, 0.92, 0.72];
// tangent axes (u,v) per face for AO/light sampling
const FACE_TAN = [
  [[0, 0, 1], [0, 1, 0]], // +x
  [[0, 0, 1], [0, 1, 0]], // -x
  [[1, 0, 0], [0, 0, 1]], // +y
  [[1, 0, 0], [0, 0, 1]], // -y
  [[1, 0, 0], [0, 1, 0]], // +z
  [[1, 0, 0], [0, 1, 0]], // -z
];

function tileUV(tileName) {
  const ti = TILE_INDEX[tileName] || 0;
  return [(ti % ATLAS_COLS) / ATLAS_COLS, Math.floor(ti / ATLAS_COLS) / ATLAS_ROWS];
}

function uvFor(face, c) {
  switch (face) {
    case 0: return [c[2], c[1]];
    case 1: return [1 - c[2], c[1]];
    case 2: return [c[0], c[2]];
    case 3: return [c[0], c[2]];
    case 4: return [c[0], c[1]];
    case 5: return [1 - c[0], c[1]];
  }
  return [0, 0];
}

/**
 * meshChunk(...)
 * getBlock(wx,wy,wz)->id ; getLight(wx,wy,wz)->[sky,blk]
 * Coordinates: x,z chunk-local for arrays; wx/wz world for providers.
 */
function meshChunk(cx, cz, blocks, getBlock, getLight, opts) {
  opts = opts || {};
  const aoOn = opts.ao !== false;
  const smoothOn = opts.smoothLight !== false;
  const baseX = cx * CS, baseZ = cz * CS;
  const G = () => ({ pos: [], uv: [], light: [], norm: [], idx: [] });
  const SOLID = G(), CUTOUT = G(), TRANS = G();

  const isOpaqueAt = (wx, wy, wz) => {
    if (wy < 0) return true;
    if (wy >= WH) return false;
    const lx = wx - baseX, lz = wz - baseZ;
    let id;
    if (lx >= 0 && lx < CS && lz >= 0 && lz < CS) id = blocks[idxOf(lx, wy, lz)];
    else id = getBlock(wx, wy, wz);
    const d = BLOCKS[id];
    return d ? d.opaque : false;
  };

  function lightAt(wx, wy, wz) {
    if (wy >= WH) return [15, 0];
    if (wy < 0) return [0, 0];
    const pr = getLight(wx, wy, wz);
    return [pr[0], pr[1]];
  }
  function vertexFaceData(face, wx, y, wz, ci) {
    const n = FACE_NORMALS[face];
    const [u, v] = FACE_TAN[face];
    const c = FACES_CORNERS[face][ci];
    let su, sv;
    if (face <= 1) { su = c[2] === 1 ? 1 : -1; sv = c[1] === 1 ? 1 : -1; }
    else if (face <= 3) { su = c[0] === 1 ? 1 : -1; sv = c[2] === 1 ? 1 : -1; }
    else { su = c[0] === 1 ? 1 : -1; sv = c[1] === 1 ? 1 : -1; }
    const px2 = wx + n[0], py = y + n[1], pz = wz + n[2];
    const o1 = [su * u[0], su * u[1], su * u[2]];
    const o2 = [sv * v[0], sv * v[1], sv * v[2]];

    // --- AO ---
    let ao = 255;
    if (aoOn) {
      const s1 = isOpaqueAt(px2 + o1[0], py + o1[1], pz + o1[2]) ? 1 : 0;
      const s2 = isOpaqueAt(px2 + o2[0], py + o2[1], pz + o2[2]) ? 1 : 0;
      const co = isOpaqueAt(px2 + o1[0] + o2[0], py + o1[1] + o2[1], pz + o1[2] + o2[2]) ? 1 : 0;
      const occ = (s1 && s2) ? 3 : (s1 + s2 + co);
      ao = 255 - occ * 55;
    }

    // --- smooth light: average 4 reachable cells around the vertex ---
    let sky, blk;
    if (smoothOn) {
      const cells = [
        [px2, py, pz],
        [px2 + o1[0], py + o1[1], pz + o1[2]],
        [px2 + o2[0], py + o2[1], pz + o2[2]],
        [px2 + o1[0] + o2[0], py + o1[1] + o2[1], pz + o1[2] + o2[2]],
      ];
      let sumS = 0, sumB = 0, cnt = 0;
      const s1o = isOpaqueAt(cells[1][0], cells[1][1], cells[1][2]);
      const s2o = isOpaqueAt(cells[2][0], cells[2][1], cells[2][2]);
      for (let k = 0; k < 4; k++) {
        if (k === 3 && s1o && s2o) continue; // corner unreachable
        if (k === 1 && s1o) continue;
        if (k === 2 && s2o) continue;
        const L = lightAt(cells[k][0], cells[k][1], cells[k][2]);
        sumS += L[0]; sumB += L[1]; cnt++;
      }
      if (cnt === 0) cnt = 1;
      sky = Math.round(sumS / cnt); blk = Math.round(sumB / cnt);
    } else {
      const L = lightAt(px2, py, pz);
      sky = L[0]; blk = L[1];
    }
    return { sky: sky * 17, blk: blk * 17, ao };
  }

  function pushQuad(arrs, verts, uvs, lights, norms, flip) {
    const start = arrs.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      arrs.pos.push(verts[i][0], verts[i][1], verts[i][2]);
      arrs.uv.push(uvs[i][0], uvs[i][1]);
      arrs.light.push(lights[i].sky, lights[i].blk, lights[i].ao);
      arrs.norm.push(norms);
    }
    if (flip) arrs.idx.push(start + 1, start + 2, start + 3, start + 1, start + 3, start);
    else arrs.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  for (let y = 0; y < WH; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const id = blocks[idxOf(x, y, z)];
        if (!id) continue;
        const def = BLOCKS[id];
        const wx = baseX + x, wz = baseZ + z;
        const i = idxOf(x, y, z);

        if (def.cross) {
          const L0 = lightAt(wx, y, wz);
          const ls = L0[0] * 17, lb = L0[1] * 17;
          const lv = [{ sky: ls, blk: lb, ao: 255 }, { sky: ls, blk: lb, ao: 255 }, { sky: ls, blk: lb, ao: 255 }, { sky: ls, blk: lb, ao: 255 }];
          const tuv = tileUV(def.tex.all || def.tex.side || 'stone');
          const tw = 1 / ATLAS_COLS, th = 1 / ATLAS_ROWS;
          const e = 0.02;
          const quads = [
            [[0.1, 0, 0.1], [0.9, 0, 0.9], [0.9, 1, 0.9], [0.1, 1, 0.1]],
            [[0.9, 0, 0.1], [0.1, 0, 0.9], [0.1, 1, 0.9], [0.9, 1, 0.1]],
          ];
          for (const q of quads) {
            const uvs = [
              [tuv[0] + e * tw, tuv[1] + th - e * th],
              [tuv[0] + tw - e * tw, tuv[1] + th - e * th],
              [tuv[0] + tw - e * tw, tuv[1] + e * th],
              [tuv[0] + e * tw, tuv[1] + e * th],
            ];
            const verts = q.map(c => [x + c[0], y + c[1], z + c[2]]);
            pushQuad(CUTOUT, verts, uvs, lv, 4, false);
          }
          continue;
        }

        const isTrans = id === B.WATER || id === B.ICE || id === B.GLASS;
        const isCutout = !isTrans && (!def.opaque);
        const arrs = isTrans ? TRANS : (isCutout ? CUTOUT : SOLID);

        for (let face = 0; face < 6; face++) {
          const n = FACE_NORMALS[face];
          const nx = wx + n[0], ny = y + n[1], nz = wz + n[2];
          // neighbor id (cross-chunk aware)
          let nId;
          const nlx = nx - baseX, nlz = nz - baseZ;
          if (ny < 0) nId = B.BEDROCK;
          else if (ny >= WH) nId = 0;
          else if (nlx >= 0 && nlx < CS && nlz >= 0 && nlz < CS) nId = blocks[idxOf(nlx, ny, nlz)];
          else nId = getBlock(nx, ny, nz);
          const nDef = BLOCKS[nId];
          if (nDef && nDef.opaque) continue;
          if (isTrans && nId === id) continue; // no faces between same translucent
          if (!def.opaque && !isTrans && nId === id) continue; // leaves-leaves interior skip

          const tileName = def.tex.all || (face === 2 ? (def.tex.top || def.tex.side) : face === 3 ? (def.tex.bottom || def.tex.side) : (def.tex.side || def.tex.top));
          const tuv = tileUV(tileName || 'stone');
          const tw = 1 / ATLAS_COLS, th = 1 / ATLAS_ROWS;
          const e = 0.02;
          const corners = FACES_CORNERS[face];
          const verts = [], uvs = [], lights = [];
          let lowerTop = false;
          if (id === B.WATER && face === 2) lowerTop = true;
          for (let ci = 0; ci < 4; ci++) {
            const c = corners[ci];
            let vy = y + c[1];
            if (lowerTop && c[1] === 1) vy -= 0.125;
            verts.push([x + c[0], vy, z + c[2]]);
            const [uu, vv] = uvFor(face, c);
            uvs.push([tuv[0] + e * tw + uu * (tw - 2 * e * tw), tuv[1] + e * th + vv * (th - 2 * e * th)]);
            lights.push(vertexFaceData(face, wx, y, wz, ci));
          }
          // AO diagonal flip
          const flip = aoOn && (lights[0].ao + lights[2].ao > lights[1].ao + lights[3].ao);
          void flip;
          const shadeIdx = face; // shader applies FACE_SHADE via norm index
          pushQuad(arrs, verts, uvs, lights, shadeIdx, flip);
        }
      }
    }
  }

  function pack(a) {
    if (!a.idx.length) return null;
    return {
      pos: new Float32Array(a.pos),
      uv: new Float32Array(a.uv),
      light: new Uint8Array(a.light),
      norm: new Int8Array(a.norm),
      idx: (a.pos.length / 3) > 65535 ? new Uint32Array(a.idx) : new Uint16Array(a.idx),
      count: a.idx.length,
    };
  }
  return { solid: pack(SOLID), cutout: pack(CUTOUT), trans: pack(TRANS) };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { meshChunk, FACE_NORMALS, FACE_SHADE, CS, WH };
if (typeof self !== 'undefined') self.MESHER_MOD = { meshChunk };
})();
