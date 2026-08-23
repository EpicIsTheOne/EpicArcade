import { Generator } from '../worldgen.js';

let gen = null;

self.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'init') {
    gen = new Generator(d.seed);
    self.postMessage({ type: 'ready', id: d.id });
  } else if (d.type === 'gen') {
    const r = gen.genChunk(d.cx, d.cz);
    self.postMessage({ type: 'chunk', cx: d.cx, cz: d.cz, job: d.job,
      blocks: r.blocks.buffer, heights: r.heights.buffer, biomes: r.biomes.buffer },
      [r.blocks.buffer, r.heights.buffer, r.biomes.buffer]);
  }
};
