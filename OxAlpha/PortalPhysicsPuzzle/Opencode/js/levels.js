import * as THREE from 'three';
import { ICONS } from './utils.js';
import { ANNOUNCE } from './story.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);

// Local authoring helpers -----------------------------------------------------
function stairs(b,x,z,yBase,steps,rise,run,dir='-z',width=2.2){
  // ascending staircase; dir '-z' means treads advance toward -z as they rise
  for(let i=0;i<steps;i++){
    const h=rise*(i+1);
    if(dir==='-z'||dir==='+z'){
      const zc=dir==='-z'? z-run*i-run/2 : z+run*i+run/2;
      b.slab(x,yBase+h/2,zc,width,h,run,'concrete');
    }else{
      const xc=dir==='-x'? x-run*i-run/2 : x+run*i+run/2;
      b.slab(xc,yBase+h/2,z,run,h,width,'concrete');
    }
  }
}
function railing(b,x0,z0,x1,z1,baseY=0){
  const cx=(x0+x1)/2,cz=(z0+z1)/2;
  const horiz=Math.abs(x1-x0)>Math.abs(z1-z0);
  const len=horiz?Math.abs(x1-x0):Math.abs(z1-z0);
  b.slab(cx,baseY+0.55,cz,horiz?len:0.08,1.1,horiz?0.08:len,'metal');
}

export const LEVELS=[
// ============================================================ 01 ORIENTATION
{
  id:'orientation',num:1,name:'Orientation',
  spawn:V(0,0.02,20),yawDeg:180,
  announce:ANNOUNCE.intro,
  build(c){
    const {b}=c;
    b.floorSlab(-5.5,5.5,-5.25,23,0);
    b.ceilSlab(-5.5,5.5,-7.8,23,5);
    b.wallZHoled(23,-5.5,5.5,0,5);
    b.wallZHoled(-5,-5.5,5.5,0,5,[{a:-1.1,b:1.1,y0:0,y1:3.3}]);
    b.wallX(-5.5,-7.8,23,0,5);
    b.wallX(5.5,-7.8,23,0,5);
    b.floorSlab(-1.35,1.35,-7.8,-5.25,0);           // vestibule floor
    b.ceilSlab(-1.35,1.35,-7.8,-5.25,3.3);
    b.wallX(-1.35,-7.8,-5.25,0,3.3,'metal',0.25);
    b.wallX(1.35,-7.8,-5.25,0,3.3,'metal',0.25);
    b.wallZ(-7.8,-1.35,1.35,0,3.3,'metal',0.3);
    c.grill(V(-1.2,0,-5.45),V(1.2,3.1,-5.21));
    // wake alcove
    b.wallZHoled(19,-5.5,5.5,0,5,[{a:-0.95,b:0.95,y0:0,y1:2.6}]);
    b.wallZ(19,-0.95,0.95,2.6,5,'metal',0.14);
    b.slab(0,3.85,19,6.6,2.2,0.06,'glass',{collide:false});
    b.slab(3.9,0.25,21.2,1.7,0.5,1.6,'metal');
    b.slab(-3.9,0.45,21.2,1.2,0.9,1.2,'metal');
    b.slab(0,0.3,14.5,2.8,0.6,1.3,'concrete');       // jump-teaching step
    c.buttonFloor(V(-3.2,0,7),'exit');
    c.door(0,0,-5.02,0,2.2,3.3,['exit']);
    c.elevator(V(0,0,-6.9),180);
    b.lightStrip(0,4.86,9,18,'z',0xcfe3ee,2.3);
    b.lightStrip(0,4.86,21,7,'x',0x57e6c8,1.9);
    b.chamberSign(1,'Orientation',V(-5.18,3.1,16),'px');
    b.poster('WELCOME, CANDIDATE',['Your evaluation measures spatial reasoning under momentum.','Follow the lit path. Touch nothing glowing unless instructed.'],V(5.18,3.0,17),'nx');
    b.terminal(V(4.93,1.55,9),'nx',[
      '> WREN v9.4.1 — facility nominal',
      '> candidate 4493 thaw ........ OK',
      '> break room coffee ... STILL OFF',
      '> priority: EVALUATION CONTINUES',
    ]);
  }
},
// ============================================================ 02 CALIBRATION
{
  id:'calibration',num:2,name:'Calibration',
  spawn:V(0,0.02,21),yawDeg:180,
  announce:ANNOUNCE.ch01,
  build(c){
    const {b}=c;
    b.floorSlab(-8,8,16,26,0);
    b.floorSlab(-8,8,0,10,0);
    b.ceilSlab(-8,10.4,0,26,7);
    b.wallZHoled(26,-8,8,0,7);
    b.wallZHoled(0,-8,8,0,7);
    b.wallX(-8,0,26,0,7);
    b.wallXHoled(8,0,26,0,7,[{a:19,b:22,y0:0,y1:3.3}]);
    // east exit vestibule
    b.floorSlab(8.25,11.6,18.9,22.1,0);
    b.ceilSlab(8.25,11.6,18.9,22.1,3.3);
    b.wallZ(18.9,8.25,11.6,0,3.3,'metal',0.25);
    b.wallZ(22.1,8.25,11.6,0,3.3,'metal',0.25);
    b.wallX(11.6,18.9,22.1,0,3.3,'metal',0.3);
    c.grill(V(8.45,0,19.1),V(8.69,3.1,21.9));
    c.door(8.02,0,20.5,90,2.2,3.3,['exit']);
    c.elevator(V(10.4,0,20.5),90);
    // chasm shaft z[10..16]
    b.wallZ(10,-8,8,-7,0,'metal');
    b.wallZ(16,-8,8,-7,0,'metal');
    b.wallX(-8,10,16,-7,0,'metal');
    b.wallX(8,10,16,-7,0,'metal');
    b.floorSlab(-8,8,10,16,-7,'ceil');
    c.acid(V(-8,-7.1,10),V(8,-6.9,16), -6.6);
    b.panel(0,2.7,0.29,3.4,4.4,'pz');
    b.panel(0,2.7,25.71,3.4,4.4,'nz');
    b.slab(0,0.07,10.12,16,0.08,0.36,'hazardStripe',{collide:false});
    b.slab(0,0.07,15.88,16,0.08,0.36,'hazardStripe',{collide:false});
    c.buttonFloor(V(4.6,0,20),'exit');
    b.lightStrip(0,6.86,5,8,'z',0xcfe3ee,2.1);
    b.lightStrip(0,6.86,21,8,'z',0xcfe3ee,2.1);
    b.chamberSign(2,'Calibration',V(-7.68,3.5,4),'px');
    b.poster('APERTURE DEVICE',['Left mouse — BLUE threshold. Right mouse — ORANGE threshold.','Qualified surfaces are white. Everything else is an opinion.'],V(-7.68,2.5,13),'px','#ff9a3c');
    b.accentLight(0,4.8,13,0x39ff88,10,12);
  }
},
// ============================================================ 03 MASS TRANSIT
{
  id:'masstransit',num:3,name:'Mass Transit',
  spawn:V(0,0.02,17),yawDeg:180,
  announce:ANNOUNCE.ch02,
  build(c){
    const {b}=c;
    b.floorSlab(-7.5,7.5,-0.5,20.5,0);
    b.ceilSlab(-7.5,10.4,-0.5,20.5,6.5);
    b.wallZHoled(20.5,-7.5,7.5,0,6.5);
    b.wallZHoled(-0.5,-7.5,7.5,0,6.5);
    b.wallXHoled(7.5,-0.5,20.5,0,6.5,[{a:-1.1,b:1.1,y0:0,y1:3.3}]);
    // east vestibule
    b.floorSlab(7.75,11.1,0.4,3.6,0);
    b.ceilSlab(7.75,11.1,0.4,3.6,3.3);
    b.wallZ(0.4,7.75,11.1,0,3.3,'metal',0.25);
    b.wallZ(3.6,7.75,11.1,0,3.3,'metal',0.25);
    b.wallX(11.1,0.4,3.6,0,3.3,'metal',0.3);
    c.grill(V(7.95,0,0.6),V(8.19,3.1,3.4));
    c.door(7.52,0,2,90,2.2,3.3,['exit']);
    c.elevator(V(9.9,0,2),90);
    // west wall with viewing window into shelf nook
    b.wallXHoled(-7.5,-0.5,20.5,0,6.5,[{a:12,b:19,y0:2.3,y1:5.2}]);
    b.slab(-6.0,1.35,15.5,3.0,2.7,7,'concrete');       // shelf top y2.7
    b.panel(-7.44,4.35,15.5,2.4,3.2,'px');             // panel above shelf, faces +x
    b.slab(-4.45,1.2,15.5,0.12,2.4,7,'metal');         // barrier wall below window
    c.cube(V(-5.5,3.05,15.5));
    c.buttonFloor(V(0,0,6),'exit');
    b.lightStrip(0,6.36,10,16,'z',0xcfe3ee,2.2);
    b.chamberSign(3,'Mass Transit',V(6.82,3.3,5),'nx');
    b.poster('STORAGE CUBES',['Cubes activate pressure plates.','Cubes do not activate sympathy. Please stop naming them.'],V(0,3.3,19.7),'nz','#ff9a3c',ICONS.cube);
    b.accentLight(-4.8,4.8,15.5,0x57e6c8,8,8);
  }
},
// ============================================================ 04 MOMENTUM
{
  id:'momentum',num:4,name:'Momentum',
  spawn:V(0,0.02,27),yawDeg:180,
  announce:ANNOUNCE.ch03,
  build(c){
    const {b}=c;
    b.floorSlab(-5.5,5.5,14,31,0);
    b.floorSlab(-5.5,5.5,-8,6,0);
    b.ceilSlab(-5.5,5.5,-10.4,31,12);
    b.wallZHoled(31,-5.5,5.5,0,12);
    b.wallZHoled(-8,-5.5,5.5,0,12,[{a:-1.1,b:1.1,y0:0,y1:3.3}]);
    b.wallX(-5.5,-10.4,31,0,12);
    b.wallX(5.5,-10.4,31,0,12);
    // west landing vestibule
    b.floorSlab(-10.4,-8.25,-4.1,-1.9,0);
    b.ceilSlab(-10.4,-8.25,-4.1,-1.9,3.3);
    b.wallZ(-4.1,-10.4,-8.25,0,3.3,'metal',0.25);
    b.wallZ(-1.9,-10.4,-8.25,0,3.3,'metal',0.25);
    b.wallX(-10.4,-4.1,-1.9,0,3.3,'metal',0.3);
    c.grill(V(-8.45,0,-3.9),V(-8.21,3.1,-2.1));
    c.door(-8.02,0,-3,90,2.2,3.3,[],'any');
    c.elevator(V(-9.5,0,-3),-90);
    // acid basin z[6..14]
    b.wallZ(14,-5.5,5.5,-2.5,0,'metal');
    b.wallZ(6,-5.5,5.5,-2.5,0,'metal');
    b.wallX(-5.5,6,14,-2.5,0,'metal');
    b.wallX(5.5,6,14,-2.5,0,'metal');
    b.floorSlab(-5.5,5.5,6,14,-2.5,'ceil');
    c.acid(V(-5.5,-2.6,6),V(5.5,-2.4,14), -2.1);
    // dive tower + stairs on start shore
    b.slab(3.4,2.5,26.4,4.2,5,4.6,'concrete');     // x[1.3..5.5] z[24.1..28.7] top y5
    stairs(b,3.4,19.6,0,5,1.0,0.9,'+z',2.0);        // treads rise toward tower south face
    b.panel(3.4,5.03,26.4,2.6,2.6,'py',V(0,0,-1));
    // guidance fin on landing side hosting exit panel
    b.slab(0,7.5,5.75,4.4,11,0.5,'concrete');
    b.panel(0,7.2,5.96,3.0,3.6,'nz');
    b.slab(3.4,5.07,24.3,2.8,0.06,0.34,'hazardStripe',{collide:false});
    b.slab(3.4,5.07,28.5,2.8,0.06,0.34,'hazardStripe',{collide:false});
    b.lightStrip(0,11.86,18,22,'z',0xcfe3ee,2.1);
    b.lightStrip(0,11.86,-4,8,'z',0x57e6c8,1.9);
    b.chamberSign(4,'Momentum',V(-5.18,3.5,22),'px',ICONS.fling);
    b.poster('MOMENTUM ADVISORY',['Velocity entering an aperture equals velocity exiting, redirected.','Falling into a floor aperture converts you into a projectile. Plan your landing.'],V(5.18,3.4,12),'nx','#ffb46a');
    b.accentLight(0,9,5.6,0xff9a3c,10,11);
  }
},
// ============================================================ 05 VERTICAL TRANSFER
{
  id:'vertical',num:5,name:'Vertical Transfer',
  spawn:V(-5,0.02,-6),yawDeg:-45,
  announce:ANNOUNCE.ch04,
  build(c){
    const {b}=c;
    const H=15;
    b.floorSlab(-8.5,8.5,-8.5,-1.6,0);
    b.floorSlab(-8.5,8.5,1.6,8.5,0);
    b.floorSlab(-8.5,-1.6,-1.6,1.6,0);
    b.floorSlab(1.6,8.5,-1.6,1.6,0);
    // shaft
    b.wallX(-1.6,-1.6,1.6,-10,0,'metal',0.4);
    b.wallX(1.6,-1.6,1.6,-10,0,'metal',0.4);
    b.wallZ(-1.6,-1.6,1.6,-10,0,'metal',0.4);
    b.wallZ(1.6,-1.6,1.6,-10,0,'metal',0.4);
    b.slab(0,-10.3,0,3.2,0.6,3.2,'ceil');
    b.panel(0,-9.97,0,2.4,2.4,'py',V(0,0,-1));
    // shell
    b.ceilSlab(-8.5,8.5,-8.5,11,H);
    b.wallZHoled(8.5,-8.5,8.5,0,H,[{a:-5.55,b:-3.45,y0:9,y1:12.3}]);
    b.wallZHoled(-8.5,-8.5,8.5,0,H);
    b.wallXHoled(-8.5,-8.5,8.5,0,H,[{a:-1.1,b:1.1,y0:0,y1:2.8}]);
    b.wallXHoled(8.5,-8.5,8.5,0,H);
    // north ledge vestibule at y9
    b.floorSlab(-5.75,-3.25,8.75,11.4,9);
    b.ceilSlab(-5.75,-3.25,8.75,11.4,12.3);
    b.wallX(-5.75,8.75,11.4,9,12.3,'metal',0.25);
    b.wallX(-3.25,8.75,11.4,9,12.3,'metal',0.25);
    b.wallZ(11.4,-5.75,-3.25,9,12.3,'metal',0.3);
    c.grill(V(-5.55,9,8.95),V(-3.45,12.1,9.19));
    c.door(-4.5,9,8.47,0,2.2,3.3,['exit']);
    c.elevator(V(-4.5,9,10.4),180);
    // high exit panel on SOUTH wall inner face (+z)
    b.panel(0,12.2,-8.21,3.0,3.4,'pz');
    // top ledge NW
    b.slab(-4.5,8.7,4.5,8.0,0.6,8.0,'concrete');   // x[-8.5..-0.5] z[0.5..8.5]
    railing(b,-8.4,0.6,-0.65,0.6,9);
    railing(b,-0.65,0.7,-0.65,8.4,9);
    b.panel(-4.5,11.4,8.21,2.6,2.6,'nz');          // return-trip panel above ledge
    b.slab(6.5,0.55,5.5,1.4,1.1,1.4,'metal');
    c.cube(V(6.5,1.67,5.5));
    c.buttonFloor(V(-5.5,0,-5),'exit');
    b.lightStrip(0,H-0.15,0,14,'x',0xcfe3ee,2.2);
    b.chamberSign(5,'Vertical Transfer',V(-8.18,3.4,-2),'px',ICONS.fling);
    b.poster('VERTICALITY NOTICE',['The shaft is nine meters deep. The solution is not patience.','Check your reticle placement before committing.'],V(8.18,4.2,0),'nx','#ffb46a');
    b.accentLight(0,-6,0,0x57e6c8,9,8);
    b.accentLight(0,12.5,-6,0xff9a3c,8,9);
  }
},
// ============================================================ 06 CROSSING
{
  id:'crossing',num:6,name:'Crossing',
  spawn:V(0,0.02,25),yawDeg:180,
  announce:ANNOUNCE.ch05,
  build(c){
    const {b}=c;
    b.floorSlab(-8,8,16,28,0);        // start shore
    b.floorSlab(-8,8,-2,3,0);         // far shore (split by gate at z=1)
    b.ceilSlab(-8,8,-4.8,28,8);
    b.wallZHoled(28,-8,8,0,8);
    b.wallZHoled(-2,-8,8,0,8,[{a:-1.1,b:1.1,y0:0,y1:3.3}]);
    b.wallX(-8,-4.8,28,0,8);
    b.wallX(8,-4.8,28,0,8);
    // far-shore exit vestibule
    b.floorSlab(-1.35,1.35,-4.8,-2.25,0);
    b.ceilSlab(-1.35,1.35,-4.8,-2.25,3.3);
    b.wallX(-1.35,-4.8,-2.25,0,3.3,'metal',0.25);
    b.wallX(1.35,-4.8,-2.25,0,3.3,'metal',0.25);
    b.wallZ(-4.8,-1.35,1.35,0,3.3,'metal',0.3);
    c.grill(V(-1.2,0,-2.45),V(1.2,3.1,-2.21));
    // gate corridor divider with timed door
    b.wallZHoled(1.0,-8,8,0,8,[{a:-1.15,b:1.15,y0:0,y1:3.4}]);
    c.door(0,0,1.0,0,2.3,3.4,['gate']);
    c.elevator(V(0,0,-3.6),180);
    // acid basin z[3..16]
    b.wallZ(16,-8,8,-2.2,0,'metal');
    b.wallZ(3,-8,8,-2.2,0,'metal');
    b.wallX(-8,3,16,-2.2,0,'metal');
    b.wallX(8,3,16,-2.2,0,'metal');
    b.floorSlab(-8,8,3,16,-2.2,'ceil');
    c.acid(V(-8,-2.3,3),V(8,-2.1,16), -1.8);
    // island pylon top y0
    b.slab(0,-1.4,9.5,4.0,2.8,3.0,'concrete');
    // two platform legs
    c.platform([V(0,0.32,18.4),V(0,0.32,11.8)],3.4,[3.0,0.36,2.6]);
    c.platform([V(0,0.32,7.2),V(0,0.32,1.6)],3.4,[3.0,0.36,2.6]);
    // island pedestal opens gate
    c.pedestal(V(0,0,9.5),180,'gate',26);
    // shortcut panels: start shore west wall + island fin
    b.panel(-7.94,3.2,20,2.6,3.4,'px');
    b.slab(3.4,2.6,9.5,0.5,5.2,2.8,'concrete');
    b.panel(3.62,3.6,9.5,2.2,3.0,'px');
    b.lightStrip(0,7.86,13,20,'z',0xcfe3ee,2.0);
    b.lightStrip(0,7.86,22,8,'z',0xcfe3ee,2.0);
    b.chamberSign(6,'Crossing',V(-7.68,3.4,24),'px',ICONS.water);
    b.poster('TRANSIT SCHEDULE',['Platforms run continuously. The schedule is "always".','Complaints about scheduling may be submitted to the acid.'],V(7.68,3.4,22),'nx','#ff5f4f');
    b.accentLight(0,5,9.5,0x39ff88,9,10);
  }
},
// ============================================================ 07 TIME PRESSURE
{
  id:'timepressure',num:7,name:'Time Pressure',
  spawn:V(0,0.02,22),yawDeg:180,
  announce:ANNOUNCE.ch06,
  build(c){
    const {b}=c;
    b.floorSlab(-5.5,5.5,14,26,0);
    b.floorSlab(-5.5,5.5,-10,0,0);
    b.ceilSlab(-5.5,5.5,-12.4,26,11);
    b.wallZHoled(26,-5.5,5.5,0,11);
    b.wallZHoled(-10,-5.5,5.5,0,11,[{a:-1.1,b:1.1,y0:0,y1:3.3}]);
    b.wallX(-5.5,-12.4,26,0,11);
    b.wallX(5.5,-12.4,26,0,11);
    // exit vestibule
    b.floorSlab(-1.35,1.35,-12.4,-10.25,0);
    b.ceilSlab(-1.35,1.35,-12.4,-10.25,3.3);
    b.wallX(-1.35,-12.4,-10.25,0,3.3,'metal',0.25);
    b.wallX(1.35,-12.4,-10.25,0,3.3,'metal',0.25);
    b.wallZ(-12.4,-1.35,1.35,0,3.3,'metal',0.3);
    c.grill(V(-1.2,0,-10.45),V(1.2,3.1,-10.21));
    // acid span z[0..14]
    b.wallZ(14,-5.5,5.5,-2.5,0,'metal');
    b.wallZ(0,-5.5,5.5,-2.5,0,'metal');
    b.wallX(-5.5,0,14,-2.5,0,'metal');
    b.wallX(5.5,0,14,-2.5,0,'metal');
    b.floorSlab(-5.5,5.5,0,14,-2.5,'ceil');
    c.acid(V(-5.5,-2.6,0),V(5.5,-2.4,14), -2.1);
    // dive pit in start shore x[-1.4..1.4] z[18..21] depth -7
    b.floorSlab(-5.5,-1.4,14,26,0);
    b.floorSlab(1.4,5.5,14,26,0);
    b.floorSlab(-1.4,1.4,14,18,0);
    b.floorSlab(-1.4,1.4,21,26,0);
    b.wallX(-1.4,18,21,-7,0,'metal',0.4);
    b.wallX(1.4,18,21,-7,0,'metal',0.4);
    b.wallZ(18,-1.4,1.4,-7,0,'metal',0.4);
    b.wallZ(21,-1.4,1.4,-7,0,'metal',0.4);
    b.slab(0,-7.3,19.5,2.8,0.6,3.0,'ceil');
    b.panel(0,-6.97,19.5,2.2,2.4,'py',V(0,0,-1));
    // exit fin at z=0 with high panel facing landing ledge
    b.slab(0,6.0,0.25,4.2,8.4,0.5,'concrete');
    b.panel(0,4.6,-0.04,3.0,3.4,'nz');
    b.slab(0,0.07,17.83,2.9,0.08,0.34,'hazardStripe',{collide:false});
    b.slab(0,0.07,21.17,2.9,0.08,0.34,'hazardStripe',{collide:false});
    c.pedestal(V(-4.2,0,20.5),90,'timed',7);
    c.door(0,0,-9.98,0,2.2,3.3,['timed']);
    b.lightStrip(0,10.86,20,16,'z',0xcfe3ee,2.0);
    b.lightStrip(0,10.86,-5,8,'z',0x57e6c8,1.8);
    b.chamberSign(7,'Time Pressure',V(-5.18,3.5,24),'px',ICONS.water);
    b.poster('TIMED ENTRY',['Pedestal interfaces hold their circuit briefly.','Decisiveness is rewarded. Hesitation is also processed. By the acid.'],V(5.18,3.5,22),'nx','#ff9a3c');
    b.accentLight(0,8,0,0xff9a3c,9,9);
  }
},
// ============================================================ 08 QUARANTINE
{
  id:'quarantine',num:8,name:'Quarantine',
  spawn:V(-10,0.02,10.5),yawDeg:-90,
  announce:ANNOUNCE.ch07,
  build(c){
    const {b}=c;
    for(const [x0,x1] of [[-14.5,-6],[-6,2],[2,10.5]]){
      b.ceilSlab(x0,x1,-0.5,12.5,7);
      b.wallZHoled(12.5,x0,x1,0,7);
      b.wallZHoled(-0.5,x0,x1,0,7);
    }
    b.wallXHoled(-14.5,-0.5,12.5,0,7);
    b.wallXHoled(10.5,-0.5,12.5,0,7,[{a:-1.1,b:1.1,y0:2.7,y1:5.5}]);
    b.wallXHoled(-6,-0.5,12.5,0,7,[{a:7.6,b:9.6,y0:0,y1:2.8}]);     // A|B doorway
    b.wallXHoled(2,-0.5,12.5,0,7,[{a:1.6,b:3.6,y0:3.4,y1:6.2}]);    // B|C high window
    // Bay C deck top y2.7
    b.slab(6.25,1.35,6,8.5,2.7,11,'concrete');
    // east vestibule at deck height
    b.floorSlab(10.75,14.1,-0.2,3.4,2.7);
    b.ceilSlab(10.75,14.1,-0.2,3.4,5.6);
    b.wallZ(-0.2,10.75,14.1,2.7,5.6,'metal',0.25);
    b.wallZ(3.4,10.75,14.1,2.7,5.6,'metal',0.25);
    b.wallX(14.1,-0.2,3.4,2.7,5.6,'metal',0.3);
    c.grill(V(10.95,2.7,-0.0),V(11.19,5.5,3.2));
    c.door(10.48,2.7,1.6,90,2.2,2.8,['exit']);
    c.elevator(V(12.9,2.7,1.6),90);
    // sparse white panels define the route
    b.panel(-13.94,3.0,6,2.6,3.4,'px');            // bay A west wall -> drop into B via B ceiling
    b.panel(-2,6.42,6,2.6,2.6,'ny');               // bay B ceiling (faces down)
    b.panel(-2,0.03,6,2.6,2.6,'py',V(0,0,1));      // bay B floor
    b.panel(10.06,5.0,2.6,2.4,2.4,'nx');           // bay C east wall high (visible through window)
    c.cube(V(-12,0.3,4));
    c.buttonFloor(V(8,2.71,8),'exit');
    railing(b,2.2,0.7,10.3,0.7,2.7);
    b.lightStrip(-10,6.86,6,0.1,'y',0xffb46a,1.6,false);
    b.lightStrip(-2,6.86,6,0.1,'y',0x9fb3bf,1.4,false);
    b.lightStrip(6.25,6.86,6,0.1,'y',0xff5f4f,1.5,false);
    b.accentLight(-10,4,6,0xffb46a,7,8);
    b.accentLight(-2,4.5,6,0x8fa3ad,6,8);
    b.accentLight(6.25,5.5,6,0xff5f4f,7,9);
    b.chamberSign(8,'Quarantine',V(-13.68,3.3,10),'px');
    b.poster('QUARANTINE ADVISORY',['This wing exceeded "acceptable spatial creativity" thresholds.','Only certified white panels are sanctioned. Improvise within the margins.'],V(-13.68,2.4,3),'px','#ff5f4f');
    b.terminal(V(-5.68,1.6,2),'px',[
      '> QUARANTINE LOG 44-C',
      '> subject: "excessive flinging"',
      '> status: contained (barely)',
      '> do not feed the cubes',
    ]);
  }
},
// ============================================================ 09 KINETIC CASCADE
{
  id:'cascade',num:9,name:'Kinetic Cascade',
  spawn:V(0,0.02,27),yawDeg:180,
  announce:ANNOUNCE.ch08,
  build(c){
    const {b}=c;
    b.floorSlab(-6,6,22,30,0);       // A
    b.floorSlab(-6,6,2,14,0);        // island
    b.floorSlab(-6,6,-18,-6,2);      // final ledge y2
    b.ceilSlab(-6,6,-20.8,30,13);
    b.wallZHoled(30,-6,6,0,13);
    b.wallZHoled(-18,-6,6,2,13,[{a:-1.1,b:1.1,y0:2,y1:5.3}]);
    b.wallX(-6,-20.8,30,0,13);
    b.wallX(6,-20.8,30,0,13);
    // final vestibule at y2
    b.floorSlab(-1.35,1.35,-20.8,-18.25,2);
    b.ceilSlab(-1.35,1.35,-20.8,-18.25,5.3);
    b.wallX(-1.35,-20.8,-18.25,2,5.3,'metal',0.25);
    b.wallX(1.35,-20.8,-18.25,2,5.3,'metal',0.25);
    b.wallZ(-20.8,-1.35,1.35,2,5.3,'metal',0.3);
    c.grill(V(-1.2,2,-18.45),V(1.2,5.1,-18.21));
    // basins z[14..22] & z[-6..2]
    for(const [z0,z1,top] of [[14,22,0],[-6,2,2]]){
      b.wallZ(z0,-6,6,-2.5,top,'metal');
      b.wallZ(z1,-6,6,-2.5,top,'metal');
      b.floorSlab(-6,6,z0,z1,-2.5,'ceil');
    }
    c.acid(V(-6,-2.6,14),V(6,-2.4,22), -2.1);
    c.acid(V(-6,-2.6,-6),V(6,-2.4,2),-2.1);
    // dive tower on A rear-left + gentle first fling
    b.slab(-4,2.5,27.4,4.0,5,4.6,'concrete');
    stairs(b,-4,20.8,0,5,1.0,0.9,'+z',2.0);
    b.panel(-4,5.03,27.4,2.4,2.4,'py',V(0,0,-1));
    // Fin1 island rear
    b.slab(0,4.5,13.75,4.4,9,0.5,'concrete');
    b.panel(0,6.2,13.46,3.0,3.4,'nz');
    // island pit x[-1.2..1.2] z[7..10] depth -5
    b.floorSlab(-6,-1.2,2,14,0);
    b.floorSlab(1.2,6,2,14,0);
    b.floorSlab(-1.2,1.2,2,7,0);
    b.floorSlab(-1.2,1.2,10,14,0);
    b.wallX(-1.2,7,10,-5,0,'metal',0.4);
    b.wallX(1.2,7,10,-5,0,'metal',0.4);
    b.wallZ(7,-1.2,1.2,-5,0,'metal',0.4);
    b.wallZ(10,-1.2,1.2,-5,0,'metal',0.4);
    b.slab(0,-5.3,8.5,2.4,0.6,3.0,'ceil');
    b.panel(0,-4.97,8.5,2.0,2.2,'py',V(0,0,-1));
    // Fin2 at final ledge front
    b.slab(0,7.5,-5.75,4.4,11,0.5,'concrete');
    b.panel(0,9.0,-6.04,3.0,3.4,'nz');
    b.slab(-4,5.07,25.25,2.6,0.06,0.32,'hazardStripe',{collide:false});
    b.slab(-4,5.07,29.55,2.6,0.06,0.32,'hazardStripe',{collide:false});
    c.cube(V(3.4,0.3,26));
    c.buttonFloor(V(0,2.01,-10),'exit');
    c.door(0,2,-17.98,0,2.2,3.3,['exit']);
    b.lightStrip(0,12.86,26,12,'z',0xcfe3ee,2.0);
    b.lightStrip(0,12.86,8,10,'z',0x57e6c8,1.8);
    b.lightStrip(0,12.86,-12,10,'z',0xff9a3c,1.9);
    b.chamberSign(9,'Kinetic Cascade',V(-5.68,4.0,28),'px',ICONS.fling);
    b.poster('FINAL EVALUATION',['Mass, momentum, nerve. In that order.','The facility believes in you, statistically speaking.'],V(5.68,4.0,26),'nx','#57e6c8');
    b.accentLight(0,8,13.6,0x57e6c8,9,9);
    b.accentLight(0,11,-5.6,0xff9a3c,10,10);
  }
},
// ============================================================ 10 DEPARTURE
{
  id:'departure',num:10,name:'Departure',
  spawn:V(0,0.02,30),yawDeg:180,
  announce:ANNOUNCE.ch09,
  alert:true,
  build(c){
    const {b}=c;
    // spine corridor z[-6..30], width 4.4 (x[-2.2..2.2])
    b.floorSlab(-2.2,2.2,-6,30,0);
    b.ceilSlab(-2.2,2.2,-6,30,3.6);
    b.wallX(-2.2,-6,30,0,3.6,'metal',0.4);
    b.wallX(2.2,-6,30,0,3.6,'metal',0.4);
    b.wallZHoled(30,-2.2,2.2,0,3.6);
    // junction room z[-16.5..-6], x[-7.5..7.5]
    b.floorSlab(-7.5,7.5,-16.5,-11,0);   // junction floor north of trench
    b.floorSlab(-7.5,7.5,-9,-6,0);       // strip between spine mouth and trench
    b.ceilSlab(-7.5,7.5,-16.5,-6,5);
    b.wallZHoled(-16.5,-7.5,7.5,0,5,[{a:-1.1,b:1.1,y0:0,y1:3.3}]);
    b.wallX(-7.5,-16.5,-6,0,5,'metal',0.4);
    b.wallX(7.5,-16.5,-6,0,5,'metal',0.4);
    b.wallZ(-6,-7.5,-2.2,0,5,'metal',0.4);
    b.wallZ(-6,2.2,7.5,0,5,'metal',0.4);
    b.ceilSlab(-2.2,2.2,-6.5,-6,3.6); // lintel over spine mouth
    // coolant trench z[-11..-9]
    b.wallZ(-9,-7.5,7.5,-2.6,0,'metal',0.4);
    b.wallZ(-11,-7.5,7.5,-2.6,0,'metal',0.4);
    b.wallX(-7.5,-11,-9,-2.6,0,'metal',0.4);
    b.wallX(7.5,-11,-9,-2.6,0,'metal',0.4);
    b.floorSlab(-7.5,7.5,-11,-9,-2.6,'ceil');
    c.acid(V(-7.4,-2.7,-11),V(7.4,-2.5,-9), -2.15);
    // exit vestibule
    b.floorSlab(-1.35,1.35,-19.3,-16.75,0);
    b.ceilSlab(-1.35,1.35,-19.3,-16.75,3.3);
    b.wallX(-1.35,-19.3,-16.75,0,3.3,'metal',0.25);
    b.wallX(1.35,-19.3,-16.75,0,3.3,'metal',0.25);
    b.wallZ(-19.3,-1.35,1.35,0,3.3,'metal',0.3);
    c.grill(V(-1.2,0,-16.95),V(1.2,3.1,-16.71));
    // power pedestals on opposite trench edges + linking panels
    c.pedestal(V(-6,0,-7.4),135,'pw1',40);
    c.pedestal(V(6,0,-12.6),315,'pw2',40);
    b.panel(-7.44,2.4,-7.4,2.4,3.0,'px');
    b.panel(7.44,2.4,-12.6,2.4,3.0,'nx');
    c.door(0,0,-16.48,0,2.2,3.3,['pw1','pw2'],'all');
    // dressing
    b.slab(1.7,2.9,20,0.5,0.5,10,'metal',{collide:false});
    b.slab(-1.7,3.05,12,0.4,0.4,8,'metal',{collide:false});
    b.slab(1.9,0.55,4,1.2,1.1,1.2,'metal');
    b.slab(-1.8,0.5,-2,1.4,1.0,1.1,'metal');
    b.lightStrip(0,3.54,18,24,'z',0xff5f4f,1.5,false);
    b.lightStrip(0,4.94,-13,0.1,'y',0xff5f4f,1.6,false);
    b.accentLight(-4,3.5,-8,0xff5f4f,8,10);
    b.accentLight(4,3.5,-12,0x57e6c8,6,10);
    b.poster('MAINTENANCE ACCESS',['Authorized personnel only.','Candidates count as personnel when convenient.'],V(2.14,1.8,24),'nx','#ff9a3c');
    b.terminal(V(-7.18,1.7,-14),'px',[
      '> KINETIC OUTPUT: 412% nominal',
      '> evaluation: COMPLETE',
      '> candidate status: RELEASED(?!)',
      '> WREN note: "noted."',
    ]);
    b.terminal(V(7.18,1.7,-15),'nx',[
      '> MAINTENANCE TICKET #8044',
      '"blast door stuck closed"',
      '> resolved: opened permanently',
      '> reopened: also permanent',
    ]);
  }
},
];
