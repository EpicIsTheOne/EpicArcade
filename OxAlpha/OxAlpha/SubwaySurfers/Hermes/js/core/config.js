// SKYLINE RUSH - core config & tuning
window.CFG = {
  LANES: [-3.2, 0, 3.2],          // lane X positions
  CHUNK_LEN: 60,                   // world units per chunk
  AHEAD_CHUNKS: 7,                 // chunks generated ahead of player
  BEHIND_CHUNKS: 2,                // chunks kept behind
  BASE_SPEED: 15.5,                // starting forward speed (u/s)
  MAX_SPEED: 46,                   // absolute speed cap
  SPEED_RAMP: 0.011,               // speed gained per meter (max ~2.8km)
  GRAVITY: -58,                    // jump gravity
  JUMP_V: 19.5,                    // jump velocity
  ROLL_TIME: 0.62,                 // seconds of roll
  LANE_SPEED: 13.5,                // lateral lane-change speed (units/s)
  PLAYER_H: 1.75,                  // standing height
  PLAYER_ROLL_H: 0.85,             // rolling height
  PLAYER_HALF_W: 0.36,
  STUMBLE_GRACE: 1.1,              // seconds of invulnerability after stumble
  CHASER_CATCH_DIST: 3.0,          // chaser distance that ends the run
  CHASER_START: 26,                // chaser gap at run start
  CHASER_MAX: 34,
  MAGNET_R: 7.5,
  NEAR_MISS_DIST: 1.35,            // lateral distance for near-miss credit
  SAVE_KEY: 'skylinerush.save.v1',
  PORT: 8642,
  VERSION: '1.0.0'
};
