// LIMINAL DYNAMICS — bootstrap
import * as THREE from 'three';
import { Game } from './game/game.js';
import { attachLoop } from './game/game-loop.js';

window.THREE = THREE; // debug/test hook
const game = new Game();
attachLoop(Game);
window.game = game;
game.init();
