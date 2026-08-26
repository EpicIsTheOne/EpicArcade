/* ZENITH RUN · input · ox-alpha piagent run-01 */
(function(){
'use strict';
const ZR = window.ZR = window.ZR || {};

const down = new Set();        // currently held (KeyboardEvent.code)
let pressedQueue = [];         // codes pressed since last endFrame
let anyMoveThisFrame = false;  // true if a movement-ish key went down this frame
let camDragX = 0, camDragY = 0;// accumulated mouse-drag deltas for the frame
let wheelDelta = 0;

const MOVE_CODES = ['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','KeyC','KeyX'];
const PREVENT = new Set(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab']);

function isMoveCode(c){ return MOVE_CODES.indexOf(c) !== -1; }

window.addEventListener('keydown', function(e){
  const c = e.code;
  if (PREVENT.has(c)) e.preventDefault();
  if (!e.repeat){
    if (!down.has(c)) { pressedQueue.push(c); if (isMoveCode(c)) anyMoveThisFrame = true; }
    down.add(c);
  }
  ZR.input.onKey && ZR.input.onKey(c);
}, {passive:false});

window.addEventListener('keyup', function(e){ down.delete(e.code); });
window.addEventListener('blur', function(){ down.clear(); });

// mouse drag on canvas rotates camera; RMB = dash too
const app = document.getElementById('app');
let dragging = false;
app.addEventListener('mousedown', function(e){
  dragging = true;
  if (e.button === 2){ pressedQueue.push('MouseDash'); }
});
window.addEventListener('mouseup', function(){ dragging = false; });
window.addEventListener('mousemove', function(e){
  if (dragging && document.pointerLockElement === null){
    camDragX += e.movementX || 0; camDragY += e.movementY || 0;
  }
});
app.addEventListener('contextmenu', function(e){ e.preventDefault(); });
app.addEventListener('wheel', function(e){ wheelDelta += Math.sign(e.deltaY); e.preventDefault(); }, {passive:false});

ZR.input = {
  // held?
  held(c){ return down.has(c); },
  wasPressed(c){ return pressedQueue.indexOf(c) !== -1; },
  axis(){ // camera-relative intent in raw form: x=strafe(-1..1 left..right), z=fwd(1 fwd)
    let x = 0, z = 0;
    if (down.has('KeyW')) z += 1;
    if (down.has('KeyS')) z -= 1;
    if (down.has('KeyD')) x += 1;
    if (down.has('KeyA')) x -= 1;
    const l = Math.hypot(x,z);
    return l > 0 ? {x:x/l, z:z/l, mag:1} : {x:0, z:0, mag:0};
  },
  jumpHeld(){ return down.has('Space'); },
  jumpPressed(){ return pressedQueue.indexOf('Space') !== -1; },
  dashPressed(){ return pressedQueue.indexOf('ShiftLeft')!==-1 || pressedQueue.indexOf('ShiftRight')!==-1 || pressedQueue.indexOf('MouseDash')!==-1; },
  slideHeld(){ return down.has('KeyC') || down.has('KeyX'); },
  camTurn(){ let t = 0; if (down.has('ArrowLeft')) t -= 1; if (down.has('ArrowRight')) t += 1; return t*2.4 + camDragX*0.0052; },
  camPitch(){ let p = 0; if (down.has('ArrowUp')) p -= 1; if (down.has('ArrowDown')) p += 1; return p*1.6 + camDragY*0.0038; },
  zoom(){ const w = wheelDelta; wheelDelta = 0; return w; },
  consumedAnyMove(){ return anyMoveThisFrame; },
  endFrame(){ pressedQueue.length = 0; anyMoveThisFrame = false; camDragX = 0; camDragY = 0; }
};
})();
