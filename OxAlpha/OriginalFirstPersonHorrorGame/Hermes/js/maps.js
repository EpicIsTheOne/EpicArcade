/* HOLLOW SIGNAL — map data: two floors, rect-carved architecture */
(function(){
"use strict";
const HG = window.HG;

const CS = 2.8;            // cell size (m)
const GW = 44, GH = 34;    // grid dims

function buildFloor(def){
  const floor = new Uint8Array(GW*GH); // 1 = walkable floor
  const carve=(x0,y0,x1,y1)=>{ for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) floor[y*GW+x]=1; };
  for(const r of def.rects) carve(...r);
  for(const o of def.openings) floor[o[1]*GW+o[0]]=1;
  return { floor, def };
}

/* ---------------- UPPER FLOOR ---------------- */
const upperDef = {
  name:'upper',
  fogDensity:.052,
  rects:[
    [18,29,25,32],   // entry airlock (south)
    [20,26,23,28],   // entry hall
    [14,18,29,25],   // lobby
    [21,8,22,17],    // front corridor (vertical)
    [3,7,40,8],      // main corridor (horizontal)
    [4,1,11,5],      // break room
    [32,0,40,5],     // security office
    [14,1,17,5],     // stairwell landing
    [30,10,33,13],   // server closet
    [3,10,6,14],     // storage nook
  ],
  openings:[
    [7,6],           // break room door
    [36,6],          // security door
    [15,6],[16,6],   // stairwell door (powered)
    [31,9],[32,9],   // server closet arch
    [4,9],[5,9],     // storage nook arch
  ],
};

/* ---------------- LOWER FLOOR ---------------- */
const lowerDef = {
  name:'lower',
  fogDensity:.07,
  rects:[
    [14,1,17,5],     // stair arrival
    [3,7,40,8],      // main corridor (lower)
    [3,10,14,20],    // west laboratories
    [16,10,22,15],   // lab annex (specimens)
    [24,10,31,15],   // recreation room
    [33,10,40,20],   // CONTAINMENT (sealed)
    [21,17,22,24],   // generator corridor (vertical)
    [17,25,28,31],   // generator room
    [32,25,40,31],   // freight elevator hall
    [3,23,9,31],     // deep storage
    [10,26,16,27],   // south loop corridor
  ],
  openings:[
    [15,6],[16,6],       // stair arrival arch
    [6,9],[7,9],         // labs arch
    [18,9],[19,9],       // annex arch
    [27,9],[28,9],       // rec room arch
    [36,9],[37,9],       // CONTAINMENT BLAST DOOR
    [21,16],[22,16],     // annex -> gen corridor
    [29,27],[30,27],[31,27],[29,28],[30,28],[31,28], // gen room -> elevator hall
    [5,21],[6,21],[5,22],[6,22],                     // labs -> deep storage
  ],
};

const floors = [buildFloor(upperDef), buildFloor(lowerDef)];

function isFloorCell(f,x,y){ return x>=0&&y>=0&&x<GW&&y<GH ? !!floors[f].floor[y*GW+x] : false; }
function solidCell(f,x,y){ return !isFloorCell(f,x,y); }

/* world helpers */
const cx = c=>(c+.5)*CS;         // cell-center world X
const cz = r=>(r+.5)*CS;         // cell-center world Z
const toC = wx=>Math.floor(wx/CS);
const toR = wz=>Math.floor(wz/CS);

const Maps = HG.Maps = {
  CS, GW, GH, floors,
  isFloorCell, solidCell,
  cx, cz, toC, toR,
  /* deterministic rng for decoration */
  rng(seed){ let s=seed>>>0; return ()=>{ s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; },

  /* ---- named anchors ---- */
  P:{
    // upper
    spawnU:      {c:21, r:30, yaw:0,        f:0},   // facing north into entry hall
    fuseBox:     {wx:cx(29)+CS/2-.14, wz:cz(21), f:0},  // lobby east wall face x=84
    lobbyDesk:   {wx:cx(20.5), wz:cz(22.5), f:0},
    breakLocker: {wx:cx(4)-CS/2+.62, wz:cz(3.2), f:0},
    secDesk:     {wx:cx(37.5), wz:cz(2.8), f:0},
    whiteboardSec:{wx:cx(40)+CS/2-.04, wz:cz(2), f:0},
    stairsPadU:  {c:15, r:2,  f:0},
    stairsDoor:  [{c:15,r:6},{c:16,r:6}],
    // lower
    arriveL:     {c:15, r:3,  yaw:Math.PI,  f:1},   // facing south into facility
    labBench:    {c:6,  r:14, f:1},
    labLogDesk:  {wx:cx(12.5), wz:cz(18.5), f:1},
    annexTank:   {wx:cx(18.5), wz:cz(11.5), f:1},
    calendarRec: {wx:cx(24)-CS/2+.04, wz:cz(13), f:1},  // rec room west wall face x=67.2
    containDoorW:{wx:cx(36.5), wz:cz(10.6), f:1},
    containCenter:{x:cx(36.5), z:cz(15), f:1},
    storageShelf:{c:4,  r:27, f:1},
    valveHandle: {wx:cx(7.2), wz:cz(30), f:1},
    genValves:   {wx:cx(21), wz:cz(25)-CS/2+.12, f:1},  // gen room north wall face z=70
    genStencil:  {wx:cx(25.5), wz:cz(25)-CS/2+.06, f:1},
    genBreaker:  {wx:cx(17)-CS/2+.14, wz:cz(28), f:1},  // gen room west wall face x=47.6
    genCore:     {c:22, r:29, f:1},
    keypadElev:  {wx:cx(40)+CS/2-.16, wz:cz(26), f:1},  // elevator hall east wall face x=114.8
    elevGate:    {wx:cx(38), wz:cz(31)-.02, f:1},
    elevPad:     {wx:cx(38), wz:cz(31)-1.3, f:1},
    genCenterW:  {x:cx(22.5), z:cz(28), f:1},
  },
};

})();
