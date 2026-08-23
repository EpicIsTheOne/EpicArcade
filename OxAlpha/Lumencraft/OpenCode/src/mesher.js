// Chunk mesher: face culling, smooth per-vertex lighting, AO, special shapes.
import * as THREE from 'three';
import { CHUNK, HEIGHT } from './config.js';
import { B, BLOCKS, isOpaque, isLiquid } from './blocks.js';
import { uvRect } from './atlas.js';
import { GRASS_TINT, FOLIAGE_TINT } from './worldgen.js';

const AO_FACTORS = [0.42, 0.62, 0.82, 1.0];

const FACES = [
  { dir: [-1, 0, 0], corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]], uvs: [[0, 1], [0, 0], [1, 1], [1, 0]] },
  { dir: [1, 0, 0], corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]], uvs: [[0, 1], [0, 0], [1, 1], [1, 0]] },
  { dir: [0, -1, 0], corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]], uvs: [[1, 0], [0, 0], [1, 1], [0, 1]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]], uvs: [[1, 1], [0, 1], [1, 0], [0, 0]] },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]], uvs: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], uvs: [[0, 0], [1, 0], [0, 1], [1, 1]] },
];

class Buf {
  constructor() { this.v = []; this.i = []; this.n = 0; }
}

export function buildChunkGeometry(world, chunk) {
  const ox = chunk.cx * CHUNK, oz = chunk.cz * CHUNK;
  const opaque = new Buf(), water = new Buf();

  const gb = (x, y, z) => world.getBlockRaw(x, y, z);
  const solidAt = (x, y, z) => isOpaque(gb(x, y, z));
  const skyAt = (x, y, z) => world.getSky(x, y, z) / 15;
  const blkAt = (x, y, z) => world.getBlk(x, y, z) / 15;

  function vertexLightAO(x, y, z, dir, corner) {
    // base cell in front of the face
    const bx = x + dir[0], by = y + dir[1], bz = z + dir[2];
    // tangential axes
    let ta, tb;
    if (dir[0] !== 0) { ta = [0, 1, 0]; tb = [0, 0, 1]; }
    else if (dir[1] !== 0) { ta = [1, 0, 0]; tb = [0, 0, 1]; }
    else { ta = [1, 0, 0]; tb = [0, 1, 0]; }
    const sa = (ta[0] ? corner[0] : ta[1] ? corner[1] : corner[2]) === 0 ? -1 : 1;
    const sbv = (tb[0] ? corner[0] : tb[1] ? corner[1] : corner[2]) === 0 ? -1 : 1;

    const s1x = bx + ta[0] * sa, s1y = by + ta[1] * sa, s1z = bz + ta[2] * sa;
    const s2x = bx + tb[0] * sbv, s2y = by + tb[1] * sbv, s2z = bz + tb[2] * sbv;
    const ccx = bx + ta[0] * sa + tb[0] * sbv, ccy = by + ta[1] * sa + tb[1] * sbv, ccz = bz + ta[2] * sa + tb[2] * sbv;

    const a = solidAt(s1x, s1y, s1z), b = solidAt(s2x, s2y, s2z), c = solidAt(ccx, ccy, ccz);
    const aoIdx = (a && b) ? 0 : 3 - ((a ? 1 : 0) + (b ? 1 : 0) + (c ? 1 : 0));

    let sk = 0, bl = 0, n = 0;
    const cells = [[bx, by, bz], [s1x, s1y, s1z], [s2x, s2y, s2z], [ccx, ccy, ccz]];
    for (const [px, py, pz] of cells) {
      if (!solidAt(px, py, pz)) {
        sk += skyAt(px, py, pz); bl += blkAt(px, py, pz); n++;
      }
    }
    if (!n) n = 1;
    return { sky: Math.min(1, sk / n), blk: Math.min(1, bl / n), ao: AO_FACTORS[aoIdx] };
  }

  // Simpler unified emitter: each vertex tuple = [x,y,z,u,v,sky,blk,ao,tintR,tintG,tintB]
  class VBuf {
    constructor() { this.arr = []; this.idxArr = []; this.count = 0; }
    addVert(x, y, z, u, v, sky, blk, ao, tr, tg, tb) {
      this.arr.push(x, y, z, u, v, sky, blk, ao, tr, tg, tb);
      return this.count++;
    }
    addQuad(a, b, c, d) {
      this.idxArr.push(a, b, c, c, b, d);
    }
  }

  const opq = new VBuf(), wat = new VBuf();

  function tintFor(id, wx, wz) {
    const bd = BLOCKS[id];
    if (!bd.tint) return [1, 1, 1];
    const biome = world.biomeAt(wx, wz);
    return bd.tint === 'foliage_dark' ? FOLIAGE_TINT[biome].map(v => v * 0.8)
      : bd.tint === 'foliage' ? FOLIAGE_TINT[biome]
      : GRASS_TINT[biome];
  }

  function faceTile(bd, id, x, y, z, faceIdx, wx, wz) {
    if (bd.tileFront !== undefined && bd.tileSide !== undefined) {
      const facing = world.getMeta ? (world.getMeta(wx, y, wz) ?? 2) : 2;
      // facing: 0=+x 1=-x 2=+z 3=-z
      const frontFace = facing === 0 ? 1 : facing === 1 ? 0 : facing === 2 ? 5 : 4;
      if (faceIdx === frontFace && bd.tileFront) return bd.tileFront;
      if (faceIdx === 3 || faceIdx === 2) return bd.tileTop ?? bd.tile ?? bd.tileSide;
      return bd.tileSide ?? bd.tile;
    }
    if (faceIdx === 3) return bd.tileTop ?? bd.tile;
    if (faceIdx === 2) return bd.tileBottom ?? bd.tile;
    return bd.tileSide ?? bd.tile;
  }

  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const id = chunk.blocks[(y << 8) | (z << 4) | x];
        if (id === B.AIR) continue;
        const bd = BLOCKS[id];
        const wx = ox + x, wz = oz + z;

        if (bd.render === 'liquid') {
          emitLiquid(wat, x, y, z, id, wx, wz, gb, skyAt, blkAt, ox, oz);
          continue;
        }
        if (bd.render === 'cross') {
          emitCross(world, opq, x, y, z, bd, wx, wz, skyAt, blkAt, ox, oz, id);
          continue;
        }
        if (bd.render === 'torch' || bd.render === 'lever') {
          emitTorch(opq, x, y, z, bd.tile, wx, wz, skyAt, blkAt, ox, oz, bd.glow);
          continue;
        }
        if (bd.render === 'ladder') {
          emitLadder(opq, x, y, z, bd.tile, wx, wz, gb, skyAt, blkAt, ox, oz);
          continue;
        }
        if (bd.render === 'carpet') {
          emitCarpet(opq, x, y, z, bd.tile, wx, wz, skyAt, blkAt, ox, oz, id);
          continue;
        }
        if (bd.render === 'slab') {
          emitSlab(opq, x, y, z, bd, wx, wz, gb, skyAt, blkAt, ox, oz);
          continue;
        }

        // regular cube
        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          const nb = ny < 0 || ny >= HEIGHT ? B.AIR : gb(nx, ny, nz);
          const nbd = BLOCKS[nb];
          if (nbd && nbd.opaque) continue;
          if (nb === id && (bd.cutout && !isLeafLike(id))) continue; // glass-glass
          if (bd.cutout && isLeafLike(nb) && nb !== id) { /* draw leaf against other leaves */ }
          const tile = faceTile(bd, id, x, y, z, f, wx, wz);
          const tint = tintFor(id, wx, wz);
          const glow = bd.glow ? 1 : 0;
          const uvr = uvRect(tile);
          const verts = [];
          const aos = [];
          for (let ci = 0; ci < 4; ci++) {
            const corner = face.corners[ci];
            const uv = face.uvs[ci];
            const L = vertexLightAO(x, y, z, face.dir, corner);
            aos.push(L.ao);
            verts.push(opq.addVert(
              wx + corner[0], y + corner[1], oz + z + corner[2],
              uvr[0] + (uvr[2] - uvr[0]) * uv[0], uvr[1] + (uvr[3] - uvr[1]) * uv[1],
              L.sky, L.blk, L.ao, tint[0], tint[1], tint[2]));
          }
          const flip = aos[0] + aos[3] > aos[1] + aos[2];
          if (flip) opq.addQuad(verts[1], verts[3], verts[0], verts[2]);
          else opq.addQuad(verts[0], verts[1], verts[2], verts[3]);
        }
      }
    }
  }

  function toGeom(vb) {
    if (!vb.count) return null;
    const g = new THREE.BufferGeometry();
    const f32 = new Float32Array(vb.arr);
    const idxArr = vb.idxArr.length > 65535 ? new Uint32Array(vb.idxArr) : new Uint16Array(vb.idxArr);
    g.setIndex(new THREE.BufferAttribute(idxArr, 1));
    // stride = 11 floats
    const strideF = 11 * 4;
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(f32, 11), 3, 0));
    g.setAttribute('uv', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(f32, 11), 2, 3));
    g.setAttribute('alight', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(f32, 11), 3, 5)); // sky,blk,ao packed vec3
    g.setAttribute('tint', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(f32, 11), 3, 8));
    g.computeBoundingSphere();
    return g;
  }

  return { opaque: toGeom(opq), water: toGeom(wat), opaqueCount: opq.count, waterCount: wat.count };
}

function isLeafLike(id) { return id === B.LEAVES_OAK || id === B.LEAVES_BIRCH || id === B.PINE_LEAVES; }

function emitLiquid(buf, x, y, z, id, wx, wz, gb, skyAt, blkAt, ox, oz) {
  const lava = BLOCKS[id].lava;
  const above = gb(x, y + 1, z);
  const topOpen = !(above === id);
  const hgt = topOpen ? 0.86 : 1;
  const sky = skyAt(x, y, z) / 15, blk = blkAt(x, y, z) / 15;

  const vert = (px, py, pz, u, v) => buf.addVert(px, py, pz, u, v,
    Math.min(1, sky + (lava ? 1 : 0)), lava ? 1 : blk, 1, lava ? 1 : 0, lava ? 1 : 0, lava ? 1 : 0);

  const [u0, v0, u1, v1] = uvRect('water');
  if (topOpen) {
    const a = vert(ox + x, y + hgt, oz + z, u0, v1);
    const b2 = vert(ox + x + 1, y + hgt, oz + z, u1, v1);
    const c = vert(ox + x, y + hgt, oz + z + 1, u0, v0);
    const d = vert(ox + x + 1, y + hgt, oz + z + 1, u1, v0);
    buf.addQuad(a, b2, c, d);
  }
  // sides where neighbor is air/non-liquid
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const sideCorners = [
    [[1, 0, 0], [1, 0, 1], [1, hgt, 0], [1, hgt, 1]],
    [[0, 0, 1], [0, 0, 0], [0, hgt, 1], [0, hgt, 0]],
    [[0, 0, 1], [1, 0, 1], [0, hgt, 1], [1, hgt, 1]],
    [[1, 0, 0], [0, 0, 0], [1, hgt, 0], [0, hgt, 0]],
  ];
  for (let i = 0; i < 4; i++) {
    const nb = gb(x + dirs[i][0], y, z + dirs[i][1]);
    if (nb === B.AIR || (!isLiquid(nb) && !BLOCKS[nb]?.opaque)) {
      const cs = sideCorners[i];
      const a = vert(ox + x + cs[0][0], y + cs[0][1], oz + z + cs[0][2], u0, v1);
      const b2 = vert(ox + x + cs[1][0], y + cs[1][1], oz + z + cs[1][2], u1, v1);
      const c = vert(ox + x + cs[2][0], y + cs[2][1], oz + z + cs[2][2], u0, v0);
      const d = vert(ox + x + cs[3][0], y + cs[3][1], oz + z + cs[3][2], u1, v0);
      buf.addQuad(a, b2, c, d);
    }
  }
}

function emitCross(world, buf, x, y, z, bd, wx, wz, skyAt, blkAt, ox, oz, id) {
  const [u0, v0, u1, v1] = uvRect(bd.tile);
  const sky = skyAt(x, y, z) / 15, blk = blkAt(x, y, z) / 15;
  const biome = world.biomeAt(wx, wz);
  const tint = !bd.tint ? [1, 1, 1]
    : bd.tint === 'foliage_dark' ? FOLIAGE_TINT[biome].map(v => v * 0.8)
    : bd.tint === 'foliage' ? FOLIAGE_TINT[biome]
    : GRASS_TINT[biome];
  const glow = bd.glow ? 1 : 0;
  const quads = [
    [[0.08, 0, 0.08], [0.92, 0, 0.92]],
    [[0.92, 0, 0.08], [0.08, 0, 0.92]],
  ];
  for (const [[ax, , az], [bx, , bz]] of quads) {
    const a = buf.addVert(ox + x + ax, y, oz + z + az, u0, v1, sky, blk, 1, tint[0], tint[1], tint[2]);
    const b2 = buf.addVert(ox + x + bx, y, oz + z + bz, u1, v1, sky, blk, 1, tint[0], tint[1], tint[2]);
    const c = buf.addVert(ox + x + ax, y + 1, oz + z + az, u0, v0, sky, blk, 1, tint[0], tint[1], tint[2]);
    const d = buf.addVert(ox + x + bx, y + 1, oz + z + bz, u1, v0, sky, blk, 1, tint[0], tint[1], tint[2]);
    buf.addQuad(a, b2, c, d);
  }
}

function emitTorch(buf, x, y, z, tile, wx, wz, skyAt, blkAt, ox, oz, glow) {
  const [u0, v0, u1, v1] = uvRect(tile);
  const sky = skyAt(x, y, z) / 15, blk = Math.max(blkAt(x, y, z) / 15, 0.9);
  const w0 = 6.5 / 16, w1 = 9.5 / 16, h = 10 / 16;
  const P = (px, py, pz, u, v) => buf.addVert(ox + x + px, y + py, oz + z + pz, u, v, sky, blk, 1, glow, glow, glow);
  // 4 sides
  const a = P(w0, 0, w0, u0, v0); const b = P(w0, 0, w1, u1, v0); const c = P(w0, h, w0, u0, v1); const d = P(w0, h, w1, u1, v1);
  buf.addQuad(a, b, c, d);
  const e = P(w1, 0, w1, u0, v0); const f = P(w1, 0, w0, u1, v0); const g = P(w1, h, w1, u0, v1); const hh = P(w1, h, w0, u1, v1);
  buf.addQuad(e, f, g, hh);
  const i = P(w0, 0, w1, u0, v0); const j = P(w1, 0, w1, u1, v0); const k = P(w0, h, w1, u0, v1); const l = P(w1, h, w1, u1, v1);
  buf.addQuad(i, j, k, l);
  const m = P(w1, 0, w0, u0, v0); const n = P(w0, 0, w0, u1, v0); const o = P(w1, h, w0, u0, v1); const p = P(w0, h, w0, u1, v1);
  buf.addQuad(m, n, o, p);
}

function emitLadder(buf, x, y, z, tile, wx, wz, gb, skyAt, blkAt, ox, oz) {
  const [u0, v0, u1, v1] = uvRect(tile);
  const sky = skyAt(x, y, z) / 15, blk = blkAt(x, y, z) / 15;
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  let attach = null;
  for (const [dx, , dz] of dirs) if (BLOCKS[gb(x + dx, y, z + dz)]?.opaque) attach = [dx, dz];
  if (!attach) attach = [0, 1];
  const eps = 0.03;
  const cxp = 0.5 + attach[0] * (0.5 - eps), czp = 0.5 + attach[1] * (0.5 - eps);
  const horiz = attach[0] !== 0;
  const off = horiz ? (attach[0] > 0 ? 1 - eps : eps) : 0;
  const offZ = horiz ? 0 : (attach[1] > 0 ? 1 - eps : eps);
  const P = (a, b, c, u, v) => buf.addVert(ox + x + a, y + b, oz + z + c, u, v, sky, blk, 1, 1, 1, 1);
  let q;
  if (horiz) {
    q = [P(off, 0, czp - 0.45, u0, v0), P(off, 0, czp + 0.45, u1, v0), P(off, 1, czp - 0.45, u0, v1), P(off, 1, czp + 0.45, u1, v1)];
  } else {
    q = [P(cxp - 0.45, 0, offZ, u0, v0), P(cxp + 0.45, 0, offZ, u1, v0), P(cxp - 0.45, 1, offZ, u0, v1), P(cxp + 0.45, 1, offZ, u1, v1)];
  }
  buf.addQuad(q[0], q[1], q[2], q[3]);
}

function emitCarpet(buf, x, y, z, tile, wx, wz, skyAt, blkAt, ox, oz, id) {
  const [u0, v0, u1, v1] = uvRect(tile);
  const sky = skyAt(x, y, z) / 15, blk = blkAt(x, y, z) / 15;
  const yy = y + 0.07;
  const P = (a, b, c, u, v) => buf.addVert(ox + x + a, b, oz + z + c, u, v, sky, blk, 1, 1, 1, 1);
  const a = P(0, yy, 0, u0, v1), b = P(1, yy, 0, u1, v1), c = P(0, yy, 1, u0, v0), d = P(1, yy, 1, u1, v0);
  buf.addQuad(a, b, c, d);
}

function emitSlab(buf, x, y, z, bd, wx, wz, gb, skyAt, blkAt, ox, oz) {
  const h = 9 / 16;
  const tiles = { top: bd.tileTop, side: bd.tileSide, bottom: bd.tileBottom };
  const sky = () => skyAt(x, y, z) / 15, blk = () => blkAt(x, y, z) / 15;
  const P = (a, b, c, u, v) => buf.addVert(ox + x + a, y + b, oz + z + c, u, v, sky(), blk(), 1, 1, 1, 1);
  const topUV = uvRect(tiles.top), botUV = uvRect(tiles.bottom), sideUV = uvRect(tiles.side);
  // top
  let a = P(0, h, 1, topUV[0], topUV[1]), b = P(1, h, 1, topUV[2], topUV[1]), c = P(0, h, 0, topUV[0], topUV[3]), d = P(1, h, 0, topUV[2], topUV[3]);
  buf.addQuad(a, b, c, d);
  // bottom
  a = P(0, 0, 0, botUV[0], botUV[3]); b = P(1, 0, 0, botUV[2], botUV[3]); c = P(0, 0, 1, botUV[0], botUV[1]); d = P(1, 0, 1, botUV[2], botUV[1]);
  buf.addQuad(a, b, c, d);
  // 4 sides
  const S = [
    [[1, 0, 0], [1, 0, 1], [1, h, 0], [1, h, 1]],
    [[0, 0, 1], [0, 0, 0], [0, h, 1], [0, h, 0]],
    [[0, 0, 1], [1, 0, 1], [0, h, 1], [1, h, 1]],
    [[1, 0, 0], [0, 0, 0], [1, h, 0], [0, h, 0]],
  ];
  for (const cs of S) {
    a = P(cs[0][0], cs[0][1], cs[0][2], sideUV[0], sideUV[3]);
    b = P(cs[1][0], cs[1][1], cs[1][2], sideUV[2], sideUV[3]);
    c = P(cs[2][0], cs[2][1], cs[2][2], sideUV[0], sideUV[1]);
    d = P(cs[3][0], cs[3][1], cs[3][2], sideUV[2], sideUV[1]);
    buf.addQuad(a, b, c, d);
  }
}
