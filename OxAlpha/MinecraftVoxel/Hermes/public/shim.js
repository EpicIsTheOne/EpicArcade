// Browser require shim: maps CommonJS-style require() to preloaded globals.
'use strict';
window.__requireMap = {
  './util.js': () => self.UTIL_MOD, '../shared/util.js': () => self.UTIL_MOD,
  './noise.js': () => self.NOISE_MOD, '../shared/noise.js': () => self.NOISE_MOD,
  './blocks.js': () => self.BLOCKS_MOD, '../shared/blocks.js': () => self.BLOCKS_MOD,
  './atlas_meta.js': () => self.TILE_META, '../shared/atlas_meta.js': () => self.TILE_META,
  './tiles1.js': () => self.TILES1_MOD,
  './tiles2.js': () => self.TILES2_MOD,
  './atlas.js': () => self.ATLAS_MOD, '../shared/atlas.js': () => self.ATLAS_MOD,
  './light.js': () => self.LIGHT_MOD, '../world/light.js': () => self.LIGHT_MOD,
  './mesher.js': () => self.MESHER_MOD, '../mesh/mesher.js': () => self.MESHER_MOD,
  './world.js': () => self.WORLD_MOD,
  './worldgen.js': () => self.WORLDGEN_MOD, '../gen/worldgen.js': () => self.WORLDGEN_MOD,
  './stations.js': () => self.STATIONS_MOD, '../world/stations.js': () => self.STATIONS_MOD,
  './materials.js': () => self.MATERIALS_MOD,
  './sky.js': () => self.SKY_MOD,
  './clouds.js': () => self.CLOUDS_MOD,
  './post.js': () => self.POST_MOD,
  './particles.js': () => self.PARTICLES_MOD,
  './weather.js': () => self.WEATHER_MOD,
  './player.js': () => self.PLAYER_MOD, '../entities/player.js': () => self.PLAYER_MOD,
  './mobs.js': () => self.MOBS_MOD, '../entities/mobs.js': () => self.MOBS_MOD,
  './drops.js': () => self.DROPS_MOD, '../entities/drops.js': () => self.DROPS_MOD,
  './input.js': () => self.INPUT_MOD,
  './inventory.js': () => self.INVENTORY_MOD,
  './icons.js': () => self.ICONS_MOD,
  './ui.js': () => self.UIMOD,
  './persist.js': () => self.PERSIST_MOD,
  './audio.js': () => self.AUDIO_MOD, '../audio/audio.js': () => self.AUDIO_MOD,
};
window.__req = (p) => {
  const f = window.__requireMap[p];
  if (!f) throw new Error('require shim miss: ' + p);
  const m = f();
  if (!m) throw new Error('require shim global missing for ' + p);
  return m;
};
