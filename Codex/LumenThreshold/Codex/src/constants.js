export const BPM = 126;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const TOTAL_BARS = 80;
export const TOTAL_BEATS = TOTAL_BARS * 4;
export const TOTAL_DURATION = TOTAL_BEATS * BEAT;
export const WORLD_SPEED = 500;
export const FINISH_BEAT = 316;
export const FINISH_X = FINISH_BEAT * BEAT * WORLD_SPEED;
export const PLAYER_SCREEN_X = 292;
export const PLAYER_RADIUS = 17;
export const FLOOR_Y = 590;
export const CEILING_Y = 150;
export const UPPER_LANE_Y = 282;
export const LOWER_LANE_Y = 548;
export const FIXED_STEP = 1 / 60;
export const STORAGE_KEY = "lumen-threshold-progress-v1";
export const SETTINGS_KEY = "lumen-threshold-settings-v1";

export const PALETTE = {
  ink: "#15172b",
  deepInk: "#090b18",
  night: "#171a35",
  paper: "#f7edcf",
  cream: "#fff4d6",
  coral: "#f06f68",
  rose: "#d95073",
  teal: "#62d7c3",
  jade: "#2b9f91",
  saffron: "#f4bd55",
  amber: "#ef8f4f",
  violet: "#8d78d8",
  sky: "#6ca8d8",
  white: "#fffdf5"
};
