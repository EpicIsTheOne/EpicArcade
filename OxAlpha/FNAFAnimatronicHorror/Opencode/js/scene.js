import * as THREE from 'three';
import {M,checkerTex,starWallTex,carpetTex,posterTex,signTex,hazardTex,glowTex,curtainTex,rand,pick,chance,clamp} from './utils.js';

export const ROOMS = {
  STAGE:   {name:'SHOW STAGE',    num:'01', mx:50,my:9,  cam:[0,3.15,-4.2],   look:[0,0.9,-9],      anchor:[0,0,-8.4]},
  DINING:  {name:'DINING HALL',   num:'02', mx:50,my:30, cam:[4.9,3.15,0.4],  look:[-1.5,0.7,-4.5], anchor:[-1.6,0,-3.6]},
  PARTY_W: {name:'PARTY ROOM W',  num:'03', mx:17,my:33, cam:[-6.7,3.0,0.6],  look:[-8.6,0.9,-2.4], anchor:[-8.2,0,-1.8]},
  PARTY_E: {name:'PARTY ROOM E',  num:'04', mx:83,my:33, cam:[6.7,3.0,0.6],   look:[8.6,0.9,-2.4],  anchor:[8.2,0,-1.8]},
  BACKSTAGE:{name:'BACKSTAGE',    num:'05', mx:15,my:9,  cam:[-6.9,2.9,-6.4], look:[-9.4,0.9,-8.8], anchor:[-8.4,0,-8.2]},
  KITCHEN: {name:'KITCHEN',       num:'06', mx:15,my:60, cam:null,            audioOnly:true,       anchor:[-8.2,0,5.6]},
  KENNEL:  {name:'THE DOGHOUSE',  num:'07', mx:85,my:9,  cam:[6.9,2.9,-6.4],  look:[9.4,0.9,-8.8],  anchor:[8.4,0,-8.2]},
  ARCADE:  {name:'ARCADE ALCOVE', num:'08', mx:85,my:60, cam:[6.8,3.0,8.2],   look:[9.2,1.1,4.4],   anchor:[8.4,0,5.4]},
  WHALL:   {name:'WEST HALL',     num:'09', mx:37,my:70, cam:[-1.65,3.0,6.3], look:[-2.3,0.9,11.5], anchor:[-2.1,0,8.2]},
  EHALL:   {name:'EAST HALL',     num:'10', mx:63,my:70, cam:[1.65,3.0,6.3],  look:[2.3,0.9,11.5],  anchor:[2.1,0,8.2]},
  WCORNER: {name:'W. HALL CORNER',num:'11', mx:37,my:88, cam:[-3.05,2.95,11.6],look:[-1.9,1.0,8.6],anchor:[-2.1,0,10.7]},
  ECORNER: {name:'E. HALL CORNER',num:'12', mx:63,my:88, cam:[3.05,2.95,11.6], look:[1.9,1.0,8.6], anchor:[2.1,0,10.7]},
  LOBBY:   {name:'MAIN LOBBY',    num:'13', mx:50,my:52, cam:[2.5,3.05,1.5],  look:[-0.5,0.9,4.8],  anchor:[0,0,3.6]},
  MAINT:   {name:'MAINTENANCE',   num:'14', mx:6,my:78,  cam:[-13.0,2.9,4.4], look:[-10.8,0.9,7.6], anchor:[-11.6,0,6.6]},
  WDOOR:   {name:'WEST DOOR',     num:'',   mx:-99,my:-99, cam:null, anchor:[-2.1,0,11.5]},
  EDOOR:   {name:'EAST DOOR',     num:'',   mx:-99,my:-99, cam:null, anchor:[2.1,0,11.5]},
  WVENT:   {name:'WEST VENT',     num:'',   mx:-99,my:-99, cam:null, anchor:[-3.0,0.4,13.8]},
  EVENT:   {name:'EAST VENT',     num:'',   mx:-99,my:-99, cam:null, anchor:[3.0,0.4,13.8]},
  VOID:    {name:'???',           num:'??', mx:93,my:4,   cam:[0,2.6,-12.2],   look:[0,0.8,-14.6],   anchor:[0,0,-14.2], hidden:true}
};

export const CAM_ORDER = ['STAGE','DINING','PARTY_W','PARTY_E','BACKSTAGE','KENNEL','KITCHEN','ARCADE','LOBBY','WHALL','EHALL','WCORNER','ECORNER','MAINT'];

export function buildWorld(scene,quality){
  const g = new THREE.Group();
  scene.add(g);
  const ultra = quality==='ultra';

  const B=(w,h,d,mat,x,y,z,ry=0)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    m.position.set(x,y,z); m.rotation.y=ry;
    m.castShadow=m.receiveShadow=true;
    g.add(m); return m;
  };
  const P=(w,h,mat,x,y,z,rx=0,ry=0,rz=0)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
    m.position.set(x,y,z); m.rotation.set(rx,ry,rz);
    m.receiveShadow=true; g.add(m); return m;
  };

  const floor=P(46,44,M(0xffffff,{m:0,r:.4}),0,0,-1);
  floor.material.map=checkerTex(); floor.material.needsUpdate=true;

  const rug=P(14,9,new THREE.MeshStandardMaterial({map:carpetTex(),roughness:.95}),0,0.005,-3.6);

  const wallMat=new THREE.MeshStandardMaterial({map:starWallTex(),roughness:.92});
  const darkMat=M(0x0b0e13,{m:.1,r:.95});
  const trimMat=M(0x1c2430,{m:.4,r:.6});

  function seg(x1,z1,x2,z2,h=3.6,y=0,mat=wallMat){
    const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz);
    if(len<.05)return;
    const m=B(len,h,.18,mat,(x1+x2)/2,y+h/2,(z1+z2)/2,Math.atan2(dz,dx)*-1);
    return m;
  }

  seg(-13.5,-12,10.5,-12);
  seg(-13.5,12,-2.7,12); seg(-1.5,12,1.5,12); seg(2.7,12,10.5,12);
  seg(10.5,-12,10.5,12); seg(-13.5,-12,-13.5,12);

  seg(-6,-6,-6,-4.2); seg(-6,-1.2,-6,1);
  seg(6,-6,6,-4.2);  seg(6,-1.2,6,1);
  seg(-10,1,-8.2,1); seg(-7.2,1,-1.2,1); seg(1.2,1,7.2,1); seg(8.2,1,10.5,1);
  seg(-3,1,-3,6); seg(3,1,3,6);
  seg(-3,6,-2.7,6); seg(-1.5,6,1.5,6); seg(2.7,6,3,6);
  seg(-1.5,6,-1.5,12); seg(-2.7,6,-2.7,12);
  seg(1.5,6,1.5,12);  seg(2.7,6,2.7,12);
  seg(-10,4,-10,5); seg(-10,6,-10,9);
  seg(-6.5,-10.5,-6.5,-8.9); seg(6.5,-10.5,6.5,-8.9);
  seg(-10,-10.5,-10,-6); seg(10,-10.5,10,-6);

  seg(-3.4,12,-3.4,16.5); seg(3.4,12,3.4,16.5); seg(-3.4,16.5,3.4,16.5);
  seg(-1.5,12,1.5,12);

  const ceilMat=M(0x11141b,{m:0,r:.95});
  const ceil=(w,d,x,z,y=3.3)=>P(w,d,ceilMat,x,y,z,Math.PI/2);
  ceil(7,5,0,14.2,3.2);
  ceil(1.4,6,-2.1,9,3.0); ceil(1.4,6,2.1,9,3.0);
  ceil(6,5,0,3.5,3.25);
  ceil(13,8,0,-3.5,3.45);
  ceil(4,5,-8,3,3.2); ceil(3.5,5,8.2,3,3.2);
  ceil(3.5,4.5,-8.2,-8.2,3.1); ceil(3.5,4.5,8.2,-8.2,3.1);
  ceil(3.5,5,-11.7,6.5,3.1);

  const office=new THREE.Group(); g.add(office);

  const doorMat=new THREE.MeshStandardMaterial({map:hazardTex(),metalness:.55,roughness:.5});
  const doors={};
  for(const side of ['L','R']){
    const sx=side==='L'?-1:1;
    const slab=B(1.24,2.6,.14,doorMat,sx*2.1,3.95,12);
    doors[side]=slab;
    const soffit=B(1.34,.68,.2,wallMat,sx*2.1,2.94,12);
    soffit.castShadow=false;
    const frame=B(.16,2.9,.3,trimMat,sx*2.76,1.45,12);
    frame.castShadow=false;
    const led=B(.05,.05,.05,M(0xff2222,{e:0xff2222,ei:2}),sx*1.48,2.62,11.9);
    doors[side+'_led']=led;
    const btnBase=B(.5,1.0,.12,M(0x14181f,{m:.3,r:.6}),sx*1.28,1.45,12.12);
    const bDoor=B(.34,.3,.1,M(0x661111,{e:0x330000}),sx*1.28,1.68,12.19);
    const bLight=B(.34,.3,.1,M(0x555544),sx*1.28,1.28,12.19);
    doors[side+'_btnD']=bDoor; doors[side+'_btnL']=bLight;
    const vent=B(.9,.62,.1,M(0x39424e,{m:.8,r:.4}),sx*3.32,.72,13.9,Math.PI/2);
    const hatch=B(1.0,.72,.08,doorMat,sx*3.36,.72,13.9,Math.PI/2);
    doors[side+'_hatch']=hatch;
    const ventLED=B(.03,.03,.03,M(0x2288aa,{e:0x22ccff,ei:1.6}),sx*3.28,1.1,13.9);
    doors[side+'_ventLED']=ventLED;
  }
  doors.L.position.y=3.95; doors.R.position.y=3.95;

  B(6.9,.1,1.7,M(0x2b2320,{m:.1,r:.8}),0,.86,14.7);
  B(6.6,.06,1.5,M(0x3a312c,{m:.05,r:.7}),0,.92,14.7);
  B(.14,.86,.14,trimMat,-3.2,.43,14.7); B(.14,.86,.14,trimMat,3.2,.43,14.7);

  const monTexCanvas=document.createElement('canvas');monTexCanvas.width=128;monTexCanvas.height=96;
  const monTex=new THREE.CanvasTexture(monTexCanvas);monTex.colorSpace=THREE.SRGBColorSpace;
  const monScreenMat=new THREE.MeshBasicMaterial({map:monTex});
  const monitors=[];
  [[-1.78,.33,-.30,-.42],[-1.02,.37,-.40,-.10],[-.26,.33,-.28,.24]].forEach(([mx,my,mz,ry],i)=>{
    const grp=new THREE.Group(); grp.position.set(mx,1.18+ i*.03,14.42+mz); grp.rotation.y=ry;
    const shell=B(.66,.52,.46,M(0x242a33,{m:.4,r:.55}),0,0,0); grp.add(shell); g.remove(shell);
    const scr=new THREE.Mesh(new THREE.PlaneGeometry(.56,.4),monScreenMat);
    scr.position.set(0,.02,.24); scr.rotation.x=-.06; grp.add(scr);
    monitors.push(scr);
    office.add(grp);
  });

  const fanGrp=new THREE.Group(); fanGrp.position.set(-2.35,1.0,14.6);
  const pole=B(.06,.5,.06,trimMat,0,.25,0); fanGrp.add(pole); g.remove(pole);
  const hub=B(.09,.09,.09,M(0x888,{m:.9,r:.3}),0,.54,0); fanGrp.add(hub); g.remove(hub);
  const blades=new THREE.Group(); blades.position.set(0,.56,.05);
  for(let i=0;i<3;i++){
    const bl=B(.5,.14,.02,M(0xcfd6de,{m:.6,r:.35}),0,0,0);
    bl.rotation.z=i*Math.PI*2/3; bl.position.set(Math.cos(i*2.094)*.26,Math.sin(i*2.094)*.26,0);
    blades.add(bl);
  }
  blades.rotation.y=Math.PI/2; fanGrp.add(blades);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.3,.015,8,24),M(0x666e78,{m:.8,r:.4}));
  ring.position.set(0,.56,.06); fanGrp.add(ring);
  office.add(fanGrp);

  const mug=B(.09,.11,.09,M(0xb3402f,{r:.6}),.7,1.0,14.35);
  const papers=P(.5,.7,M(0xd8d2c0,{r:.9}),-.3,.955,14.6,-Math.PI/2,0,.3);
  const kb=B(.62,.03,.22,M(0x1a1e24,{m:.3,r:.6}),.1,.955,14.15);

  const lampHead=B(.22,.14,.22,M(0x274a2e,{m:.5,r:.4}),2.5,1.62,14.9);
  lampHead.castShadow=false;
  const lampArm=B(.04,.5,.04,trimMat,2.5,1.3,14.98);
  lampArm.castShadow=false;
  const lampBulb=B(.1,.06,.1,M(0xfff2cc,{e:0xffdca0,ei:2.4}),2.5,1.55,14.82);
  lampBulb.castShadow=false;

  const posterBand=P(.85,1.15,new THREE.MeshStandardMaterial({map:posterTex('band'),roughness:.9}),0,1.95,12.1);
  const posterRules=P(.7,.95,new THREE.MeshStandardMaterial({map:posterTex('rules'),roughness:.9}),2.95,1.9,12.09);
  const posterMiss=P(.6,.8,new THREE.MeshStandardMaterial({map:posterTex('missing'),roughness:.9}),-2.95,1.9,12.09);
  const incidentSign=B(1.1,.28,.03,M(0xe8e2cf,{r:.8}),-3.28,2.3,14.0,Math.PI/2);

  B(.7,1.5,.55,M(0x333a44,{m:.5,r:.55}),-3.0,.75,15.9);

  const ceilFluor=P(1.5,.32,M(0xdfe8ee,{e:0xbfd4e2,ei:1.1}),0,3.17,13.4,Math.PI/2);
  const fluorFrame=B(1.6,.06,.4,trimMat,0,3.2,13.4);

  const hemi=new THREE.HemisphereLight(0x27354d,0x0a0c10,.35); scene.add(hemi);
  const amb=new THREE.AmbientLight(0x161d2b,.6); scene.add(amb);
  const deskLamp=new THREE.SpotLight(0xffd9a3,42,8.5,.82,.5,1.7);
  deskLamp.position.set(2.5,1.6,14.85);
  deskLamp.target.position.set(-.4,.95,13.6);
  deskLamp.castShadow=true; deskLamp.shadow.mapSize.set(ultra?1024:512,ultra?1024:512);
  deskLamp.shadow.bias=-.0004;
  office.add(deskLamp,deskLamp.target);
  const monGlow=new THREE.PointLight(0x7fb8ff,3.2,4.5,1.6); monGlow.position.set(0,1.5,14.0); office.add(monGlow);
  const fluorLight=new THREE.PointLight(0xcfe4ff,4.5,7,1.7); fluorLight.position.set(0,3.0,13.4); office.add(fluorLight);
  const redGlow=new THREE.PointLight(0xff3030,.5,2.6,1.8); redGlow.position.set(0,2.4,12.5); office.add(redGlow);
  const deskFill=new THREE.PointLight(0xffe2b8,2.2,4.2,1.8); deskFill.position.set(0,2.15,14.3); office.add(deskFill);

  const hallLights={},hallFixtures={};
  for(const side of ['L','R']){
    const sx=side==='L'?-1:1;
    const pl=new THREE.PointLight(0xffe6bd,0,6.5,1.7);
    pl.position.set(sx*2.1,2.75,10.4);
    if(ultra){pl.castShadow=true;pl.shadow.mapSize.set(512,512);}
    scene.add(pl);
    hallLights[side]=pl;
    const fix=P(.7,.18,M(0xdfe8ee,{e:0xffe2b0,ei:0}),sx*2.1,2.95,10.4,Math.PI/2);
    hallFixtures[side]=fix;
  }

  const stagePlat=B(7.2,.55,3.6,M(0x241a20,{r:.8}),0,.275,-8.6);
  const stageEdge=B(7.3,.08,.12,M(0x8a6d3b,{m:.7,r:.4}),0,.56,-6.85);

  const curtMat=new THREE.MeshStandardMaterial({map:curtainTex(),roughness:.95,side:THREE.DoubleSide});
  const curtGeo=new THREE.PlaneGeometry(10.5,4.4,32,1);
  {
    const pos=curtGeo.attributes.position;
    for(let i=0;i<pos.count;i++){const x=pos.getX(i);pos.setZ(i,Math.sin(x*.9)*.5);}
    curtGeo.computeVertexNormals();
  }
  const curtBack=new THREE.Mesh(curtGeo,curtMat); curtBack.position.set(0,2.25,-10.95); curtBack.castShadow=true; g.add(curtBack);
  const curtL=P(2.2,4.4,curtMat,-4.4,2.25,-9.4,0,Math.PI/4.5);
  const curtR=P(2.2,4.4,curtMat,4.4,2.25,-9.4,0,-Math.PI/4.5);

  const signMat=new THREE.MeshBasicMaterial({transparent:true});
  signMat.map=signTex('STARLIGHT','PLAYHOUSE · FAMILY FUN CENTER · EST 1986','#ffd97a');
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(7.4,1.85),signMat);
  sign.position.set(0,4.35,-11.0); g.add(sign);
  const signGlow=new THREE.PointLight(0xffd97a,4,10,1.6); signGlow.position.set(0,3.9,-10.2); g.add(signGlow);

  const starSpins=[];
  for(let i=0;i<3;i++){
    const star=new THREE.Mesh(new THREE.OctahedronGeometry(.16),M(0xffd97a,{e:0xaa7722,ei:.7,m:.8,r:.3}));
    star.scale.y=.35; star.position.set(rand(-4,4),rand(3.4,4.1),rand(-9,-7));
    const line=B(.01,rand(.5,1),.01,darkMat,star.position.x,star.position.y+.6,star.position.z);
    g.add(star,line);
    star.userData.spin=rand(.3,.8);
    starSpins.push(star);
  }

  const micStand=new THREE.Group();
  const micPole=B(.03,1.3,.03,M(0x777f88,{m:.9,r:.3}),0,.65,0);
  micStand.add(micPole);
  const micBall=new THREE.Mesh(new THREE.SphereGeometry(.07,10,10),M(0x222,{m:.6,r:.5}));
  micBall.position.set(0,1.35,0); micStand.add(micBall);
  micStand.position.set(0,.55,-8.2); g.add(micStand);

  const drum=new THREE.Group();
  const drumBody=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.5,20),M(0x7a1622,{r:.5}));
  drumBody.position.y=.75;
  const drumTop=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.03,20),M(0xe8e4da,{r:.4}));
  drumTop.position.y=1.01;
  drum.add(drumBody,drumTop); drum.position.set(-1.9,.55,-9.1); drum.castShadow=true; g.add(drum);

  const keytar=B(.9,.1,.24,M(0x1a1e26,{m:.5,r:.5}),2.0,1.05,-8.9,.4);
  const keytarKeys=P(.7,.16,M(0xdfdfdf,{r:.4}),2.0,1.11,-8.87,-Math.PI/2,.4);

  const spots=[];
  for(const sx of [-1,1]){
    const sp=new THREE.SpotLight(0xffd2a0,14,12,.55,.6,1.5);
    sp.position.set(sx*2.2,4.3,-6.2);
    sp.target.position.set(sx*1.2,.6,-8.8);
    g.add(sp,sp.target); spots.push(sp);
    const housing=B(.2,.3,.2,M(0x22262e,{m:.6,r:.5}),sx*2.2,4.35,-6.2);
    sp.housing=housing;
  }

  const tables=[];
  const hatCols=[0xff5db1,0x59f7e8,0xffd97a,0x8f7bff,0x7bff8f];
  for(const tz of [-5.6,-3.4,-1.2])for(const tx of [-2.7,2.7]){
    const tt=B(2.5,.07,1.05,M(0xd6dade,{r:.55}),tx,.78,tz);
    for(const lx of [-1.05,1.05])for(const lz of [-.4,.4]) B(.07,.78,.07,trimMat,tx+lx,.39,tz+lz);
    tables.push(tt);
    for(let h=0;h<3;h++){
      const hat=new THREE.Mesh(new THREE.ConeGeometry(.07,.16,10),M(pick(hatCols),{r:.6}));
      hat.position.set(tx+rand(-1,1),.9,tz+rand(-.35,.35)); hat.castShadow=true; g.add(hat);
    }
    const plate=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.015,14),M(0xefeee9,{r:.5}));
    plate.position.set(tx+rand(-.9,.9),.83,tz+rand(-.3,.3)); g.add(plate);
  }

  const strandPts=[];
  function strand(a,b,n,colA,colB){
    const curve=new THREE.QuadraticBezierCurve3(a,new THREE.Vector3((a.x+b.x)/2,(a.y+b.y)/2-.7,(a.z+b.z)/2),b);
    const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,20,.012,5),darkMat); g.add(tube);
    for(let i=1;i<n;i++){
      const p=curve.getPoint(i/n);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.045,8,8),
        new THREE.MeshStandardMaterial({color:0x222,emissive:i%2?colA:colB,emissiveIntensity:1.4}));
      bulb.position.copy(p); g.add(bulb);
      strandPts.push(bulb);
    }
  }
  strand(new THREE.Vector3(-6,3.3,-5.8),new THREE.Vector3(6,3.3,-5.8),14,0xff5db1,0x59f7e8);
  strand(new THREE.Vector3(-6,3.3,-1.6),new THREE.Vector3(6,3.3,-1.6),14,0xffd97a,0x8f7bff);

  const balloonMats=[0xff5db1,0x59f7e8,0xffd97a].map(c=>M(c,{r:.35,m:.1}));
  function balloons(x,z){
    for(let i=0;i<3;i++){
      const bm=pick(balloonMats);
      const bal=new THREE.Mesh(new THREE.SphereGeometry(.14,10,10),bm);
      bal.scale.y=1.2; bal.position.set(x+rand(-.3,.3),rand(1.6,2.2),z+rand(-.3,.3));
      const str=B(.005,1.6,.005,darkMat,bal.position.x,.8,bal.position.z);
      g.add(bal,str);
    }
  }
  balloons(-5.4,.4);balloons(5.4,.4);balloons(-5.4,-5);balloons(5.4,-5);

  const cabScreens=[];
  const cabCols=[0x59f7e8,0xff5db1,0xffd97a,0x8fff7b,0xff8f5d];
  for(let i=0;i<5;i++){
    const cx=9.55,cz=2.6+i*1.15;
    const body=B(.85,1.85,.8,M(0x1c2230,{m:.3,r:.7}),cx,.92,cz,0);
    const scr=new THREE.Mesh(new THREE.PlaneGeometry(.6,.5),
      new THREE.MeshStandardMaterial({color:0x0a0c12,emissive:cabCols[i],emissiveIntensity:.7}));
    scr.position.set(cx-.44,1.35,cz); scr.rotation.y=-Math.PI/2; g.add(scr);
    cabScreens.push({scr,base:cabCols[i],phase:rand(9)});
    const marq=new THREE.Mesh(new THREE.PlaneGeometry(.66,.16),
      new THREE.MeshStandardMaterial({color:0x111,emissive:cabCols[i],emissiveIntensity:1.2}));
    marq.position.set(cx-.45,1.78,cz); marq.rotation.y=-Math.PI/2; g.add(marq);
  }

  const steel=M(0x9aa4ae,{m:.9,r:.35});
  B(3.2,.9,.7,steel,-8.4,.45,7.4);
  B(.7,.9,3.4,steel,-6.95,.45,5.4);
  for(let i=0;i<4;i++){
    const pot=new THREE.Mesh(new THREE.CylinderGeometry(.14,.12,.16,12),steel);
    pot.position.set(-8.2+rand(-1,1),.98,7.2+rand(-.4,.4)); g.add(pot);
  }
  const freezer=B(1.1,2.2,.9,M(0xb9c2cb,{m:.7,r:.4}),-9.7,1.1,3.7);
  const kitSign=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.4),
    new THREE.MeshBasicMaterial({map:signTex('KITCHEN','','#9fb2c5'),transparent:true}));
  kitSign.position.set(-8.2,2.6,3.15); g.add(kitSign);
  const rackBar=B(2.2,.05,.05,steel,-8.2,2.3,6.4);
  for(let i=0;i<5;i++){
    const pan=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.03,12),steel);
    pan.position.set(-9.1+i*.45,2.14,6.4); g.add(pan);
    B(.01,.14,.01,steel,-9.1+i*.45,2.22,6.4);
  }
  const kitLight=new THREE.PointLight(0xbfe8ff,2.2,6,1.8); kitLight.position.set(-8.2,2.7,5.5); g.add(kitLight);

  const shelfMat=M(0x3a4148,{m:.6,r:.5});
  function shelfUnit(x,z,ry){
    const sh=new THREE.Group(); sh.position.set(x,0,z); sh.rotation.y=ry;
    for(const sy of [.4,.9,1.4]) sh.add(B(2.2,.05,.5,shelfMat,0,sy,0));
    for(const sx of [-1.05,1.05]) sh.add(B(.06,1.5,.5,shelfMat,sx,.75,0));
    return sh;
  }
  const shelf1=shelfUnit(-9.3,-9.6,0); g.add(shelf1);
  const headMats=[[0x6b4a2f,'owl'],[0xefe6ea,'doll'],[0x9aa0a8,'mouse'],[0x8a6a3a,'dog']];
  headMats.forEach(([c],i)=>{
    const hd=new THREE.Mesh(new THREE.SphereGeometry(.19,14,12),M(c,{r:.6}));
    hd.position.set(-9.9+i*.42,1.0,-9.6);
    g.add(hd);
    for(const ex of [-.07,.07]){
      const eye=new THREE.Mesh(new THREE.CircleGeometry(.035,8),new THREE.MeshBasicMaterial({color:0x000}));
      eye.position.set(0,0,.185); eye.position.x=ex;
      hd.add(eye);
    }
  });
  const endo=new THREE.Group();
  for(let i=0;i<4;i++)endo.add(B(.4,.05,.22,M(0x666e78,{m:.9,r:.3}),0,.6+i*.14,0));
  endo.add(B(.08,.5,.08,M(0x444a52,{m:.9,r:.3}),0,.85,0));
  endo.position.set(-8.2,0,-9.7); g.add(endo);
  for(let i=0;i<3;i++)B(.6,.6,.6,M(0x4a3826,{r:.9}),-6.9+i*.02,0.3,-6.6-i*.7,.3*i);
  const bsBulb=new THREE.PointLight(0xffe6c0,1.6,5,1.8); bsBulb.position.set(-8.2,2.6,-8.2); g.add(bsBulb);
  const bsBulbMesh=B(.08,.12,.08,M(0xffe6c0,{e:0xffdca0,ei:2}),-8.2,2.55,-8.2);
  const bsWire=B(.01,.5,.01,darkMat,-8.2,2.85,-8.2);

  const fenceMat=new THREE.MeshStandardMaterial({color:0x5a6470,metalness:.8,roughness:.4,transparent:true,opacity:.5,side:THREE.DoubleSide});
  const fenceTexC=document.createElement('canvas');fenceTexC.width=64;fenceTexC.height=64;
  {const fx=fenceTexC.getContext('2d');fx.strokeStyle='#8a94a2';fx.lineWidth=2;
   for(let i=-64;i<128;i+=12){fx.beginPath();fx.moveTo(i,0);fx.lineTo(i+64,64);fx.stroke();
   fx.beginPath();fx.moveTo(i+64,0);fx.lineTo(i,64);fx.stroke();}}
  const ftex=new THREE.CanvasTexture(fenceTexC);ftex.wrapS=ftex.wrapT=THREE.RepeatWrapping;ftex.repeat.set(6,2);
  fenceMat.map=ftex;fenceMat.alphaMap=ftex;
  function fenceRun(x1,z1,x2,z2){
    const len=Math.hypot(x2-x1,z2-z1);
    const f=P(len,1.7,fenceMat,(x1+x2)/2,.85,(z1+z2)/2,0,Math.atan2(z2-z1,x2-x1)*-1+Math.PI/2*0);
    f.rotation.z=Math.PI/2; f.rotation.order='ZYX';
    f.setRotationFromEuler(new THREE.Euler(0,Math.atan2(-(z2-z1),x2-x1)+Math.PI/2,Math.PI/2,'YZX'));
    for(let i=0;i<=len;i+=2.2){
      const t=i/len;
      B(.07,1.8,.07,steel,x1+(x2-x1)*t,.9,z1+(z2-z1)*t);
    }
  }
  fenceRun(6.6,-6.2,10,-6.2); fenceRun(10,-6.2,10,-10.4); fenceRun(6.6,-10.4,10,-10.4);
  const doghouse=new THREE.Group(); doghouse.position.set(9.2,0,-8.9);
  doghouse.add(B(1.3,1.0,1.4,M(0x7a3b1e,{r:.9}),0,.5,0));
  const roof=B(1.5,.12,1.7,M(0x4a2010,{r:.9}),0,1.08,0); roof.rotation.z=.28; roof.castShadow=true; doghouse.add(roof);
  const roof2=B(1.5,.12,1.7,M(0x4a2010,{r:.9}),0,1.08,0); roof2.rotation.z=-.28; roof2.position.x=.12; doghouse.add(roof2);
  const dArch=new THREE.Mesh(new THREE.CircleGeometry(.32,16,Math.PI,Math.PI),new THREE.MeshBasicMaterial({color:0x050505}));
  dArch.position.set(0,.62,.71); doghouse.add(dArch);
  const dRect=P(.64,.62,new THREE.MeshBasicMaterial({color:0x050505}),0,.31,.711);
  doghouse.add(dRect);
  g.add(doghouse);
  const nameplate=new THREE.Mesh(new THREE.PlaneGeometry(1.0,.25),
    new THREE.MeshBasicMaterial({map:signTex('RUSTY','','#ffb347'),transparent:true}));
  nameplate.position.set(9.2,1.5,-6.3); g.add(nameplate);
  const bowl=new THREE.Mesh(new THREE.TorusGeometry(.16,.05,8,16),M(0xcc3344,{m:.6,r:.3}));
  bowl.rotation.x=Math.PI/2; bowl.position.set(7.6,.05,-8.6); g.add(bowl);
  for(let i=0;i<3;i++)B(.02,.8,.02,steel,6.9+i*.3,1.9,-7.0);
  const kenLight=new THREE.PointLight(0xff9a5d,1.8,6,1.8); kenLight.position.set(8.2,2.6,-8); g.add(kenLight);

  const boiler=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,2.6,16),M(0x5a3a30,{m:.6,r:.6}));
  boiler.position.set(-12.4,1.3,8.2); boiler.castShadow=true; g.add(boiler);
  for(let i=0;i<3;i++){
    const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,7,10),steel);
    pipe.rotation.x=Math.PI/2; pipe.position.set(-12.9,1.2+i*.5,5.5); g.add(pipe);
  }
  const breaker=B(.5,.7,.15,M(0x444a52,{m:.7,r:.4}),-13.38,1.5,7.6,Math.PI/2);
  const breakerFace=P(.4,.6,new THREE.MeshStandardMaterial({map:hazardTex(),roughness:.7}),-13.29,1.5,7.6,0,Math.PI/2);
  const pud=new THREE.Mesh(new THREE.CircleGeometry(.8,20),M(0x0e1319,{m:.9,r:.12}));
  pud.rotation.x=-Math.PI/2; pud.position.set(-11.6,.01,6.4); g.add(pud);
  const maintLight=new THREE.PointLight(0x8fc8ff,1.6,7,1.9); maintLight.position.set(-11.6,2.7,6.5); g.add(maintLight);
  B(.25,.6,.25,M(0x8a2f2f,{r:.7}),-10.5,.3,8.6);

  const lobbyBanner=new THREE.Mesh(new THREE.PlaneGeometry(3.4,.8),
    new THREE.MeshBasicMaterial({map:signTex('WELCOME','★ THANK YOU FOR VISITING ★','#ff5db1'),transparent:true}));
  lobbyBanner.position.set(0,2.7,1.2); g.add(lobbyBanner);
  const doorGlassMat=new THREE.MeshStandardMaterial({color:0x0a1420,metalness:.6,roughness:.15,transparent:true,opacity:.85});
  for(const sx of [-1,1]){
    const dg=P(1.1,2.4,doorGlassMat,sx*.6,1.2,5.9);
    B(1.2,.08,.1,steel,sx*.6,2.45,5.92);
    B(.08,.5,.06,M(0xcfd6de,{m:.8,r:.3}),sx*.6,1.1,5.95);
  }
  const mat_=P(1.8,.9,M(0x27313d,{r:.95}),0,.01,5.4,-Math.PI/2);

  for(const px of [-8,8]){
    const pt=P(2.4,.9,M(0xd6dade,{r:.55}),px,.76,0.2);
    for(const lx of [-1,1])B(.06,.76,.06,trimMat,px+lx,.38,.2);
    for(let h=0;h<2;h++){
      const hat=new THREE.Mesh(new THREE.ConeGeometry(.07,.16,10),M(pick(hatCols),{r:.6}));
      hat.position.set(px+rand(-.8,.8),.88,.2+rand(-.3,.3)); g.add(hat);
    }
  }

  const voidGrp=new THREE.Group(); voidGrp.visible=false; g.add(voidGrp);
  {
    const vm=new THREE.MeshBasicMaterial({color:0x020204,side:THREE.DoubleSide});
    const mk=(w,h,x,y,z,ry)=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),vm);p.position.set(x,y,z);p.rotation.y=ry;voidGrp.add(p);};
    mk(7,4,0,2,-11.6,0); mk(7,4,0,2,-16.4,Math.PI);
    mk(4.6,4,-3.4,2,-14,Math.PI/2); mk(4.6,4,3.4,2,-14,-Math.PI/2);
    mk(4.6,4.6,0,4.05,-14,0,Math.PI/2);
    const chair=new THREE.Group();
    chair.add(B(.45,.06,.45,M(0x1a1a1e,{r:.8}),0,.45,0));
    chair.add(B(.45,.5,.06,M(0x1a1a1e,{r:.8}),0,.72,-.21));
    for(const[lx,lz]of[[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]])chair.add(B(.05,.45,.05,M(0x111114),lx,.22,lz));
    chair.position.set(0,0,-14.2); voidGrp.add(chair);
    const vspot=new THREE.SpotLight(0xbfd4ff,10,8,.4,.5,1.6);
    vspot.position.set(0,3.8,-12.6); vspot.target=chair; vspot.castShadow=false;
    voidGrp.add(vspot);
    voidGrp.userData.spot=vspot;
  }

  let dust=null;
  if(!('forceNoDust' in window)){
    const n=quality==='lite'?80:240;
    const dgeo=new THREE.BufferGeometry();
    const dpos=new Float32Array(n*3);
    for(let i=0;i<n;i++){
      dpos[i*3]=rand(-11,10);dpos[i*3+1]=rand(.2,3.4);dpos[i*3+2]=rand(-11,11.5);
    }
    dgeo.setAttribute('position',new THREE.BufferAttribute(dpos,3));
    const dmat=new THREE.PointsMaterial({size:.035,map:glowTex('190,210,255'),transparent:true,opacity:.5,
      blending:THREE.AdditiveBlending,depthWrite:false});
    dust=new THREE.Points(dgeo,dmat); g.add(dust);
  }

  const api={
    group:g,
    doors,
    hallLights,hallFixtures,
    monitors,monTexCanvas,
    fanBlades:blades,
    curtBack,
    voidGrp,
    dust,
    spots,
    signGlow,
    strandPts,
    cabScreens,
    bsBulb,
    fluorLight,fluorMesh:ceilFluor,monGlow,redGlow,deskLamp,lampBulb,deskFill,
    doorState:{L:0,R:0},doorTarget:{L:0,R:0},
    hatchState:{L:0,R:0},hatchTarget:{L:0,R:0},
    hallOn:{L:false,R:false},
    fluorT:0,fluorOn:true,
    voidVisible:false,
    setDoor(side,closed){api.doorTarget[side]=closed?1:0;},
    setHatch(side,closed){api.hatchTarget[side]=closed?1:0;},
    setHallLight(side,on){
      api.hallOn[side]=on;
      const pl=hallLights[side];
      pl.intensity=on?7:0;
      hallFixtures[side].material.emissiveIntensity=on?2:0;
      if(on)sfxHall(side);
    },
    setVoidVisible(v){voidGrp.visible=v;api.voidVisible=v;},
    update(dt,t){
      blades.rotation.z+=dt*24;
      for(const s of starSpins){s.rotation.y+=dt*s.userData.spin;}
      for(const side of ['L','R']){
        api.doorState[side]+=clamp(api.doorTarget[side]-api.doorState[side],-dt*5,dt*5);
        doors[side].position.y=3.95-api.doorState[side]*2.6;
        api.hatchState[side]+=clamp(api.hatchTarget[side]-api.hatchState[side],-dt*6,dt*6);
        doors[side+'_hatch'].position.y=.72+(1-api.hatchState[side])*.0+api.hatchState[side]*0;
        doors[side+'_hatch'].position.z=13.9+api.hatchState[side]*(side==='L'?-1.1:1.1)*0;
        doors[side+'_hatch'].scale.y=1-api.hatchState[side]*.92;
        doors[side+'_led'].material=M(0xff2222,{e:0xff2222,ei:doors[side].position.y<3?2.2:.6});
        doors[side+'_btnD'].material=M(api.doorState[side]>.5?0xdd2222:0x661111,{e:api.doorState[side]>.5?0xff3333:0x330000,ei:api.doorState[side]>.5?1.6:.4});
        doors[side+'_btnL'].material=M(api.hallOn[side]?0xd8c26a:0x555544,{e:api.hallOn[side]?0xffe9a0:0x000000,ei:api.hallOn[side]?1.4:0});
        doors[side+'_ventLED'].material=M(0x2288aa,{e:0x22ccff,ei:api.hatchState[side]>.5?.2:(1.2+Math.sin(t*3+ (side==='L'?0:2))*.5)});
      }
      api.fluorT-=dt;
      if(api.fluorOn && api.fluorT<=0){
        if(chance(.25)){api.fluorOn=false;api.fluorT=rand(.05,.3);}
        else api.fluorT=rand(.8,3.5);
      }else if(!api.fluorOn && api.fluorT<=0){api.fluorOn=true;api.fluorT=rand(.4,2);}
      const fl=api.fluorOn?(.85+Math.sin(t*47)*.08+ (chance(dt*3)?-.3:0)):0.05;
      ceilFluor.material.emissiveIntensity=fl*1.1;
      fluorLight.intensity=4.5*fl;
      monGlow.intensity=2.6+Math.sin(t*13.7)*.5+(chance(dt*2)?.8:0);
      const mc=monTexCanvas.getContext('2d');
      mc.fillStyle='#0a1420';mc.fillRect(0,0,128,96);
      mc.fillStyle='#7fd4ff33';
      for(let i=0;i<40;i++)mc.fillRect(Math.random()*128,Math.random()*96,rand(4,20),1);
      mc.fillStyle='#dff3ff';mc.font='9px monospace';
      mc.fillText('CAM SYS v2.3',8,16);mc.fillText('FEEDS: OK',8,30);
      monTex.needsUpdate=true;
      cabScreens.forEach(({scr,base,phase})=>{
        scr.material.emissiveIntensity=.5+.35*Math.sin(t*2.2+phase)+(chance(dt*1.2)?rand(.5):0);
      });
      signGlow.intensity=3.4+Math.sin(t*9.3)*.5+(chance(dt*4)?rand(1.5):0);
      spots.forEach((sp,i)=>{sp.intensity=12+Math.sin(t*.8+i*2)*3+(chance(dt*.4)?-6:0);});
      if(chance(dt*.12))strandPts.forEach(b=>b.material.emissiveIntensity=rand(.6,1.8));
      if(bsBulb){bsBulb.intensity=1.4+Math.sin(t*1.1)*.4*(chance(dt*.3)?3:1);}
      if(voidGrp.visible&&voidGrp.userData.spot){
        voidGrp.userData.spot.intensity=9+Math.sin(t*2.4)*2.5;
      }
      if(dust){
        const pa=dust.geometry.attributes.position;
        for(let i=0;i<pa.count;i++){
          let y=pa.getY(i)+dt*.045;
          if(y>3.4)y=.2;
          pa.setY(i,y);
          pa.setX(i,pa.getX(i)+Math.sin(t*.5+i)*dt*.01);
        }
        pa.needsUpdate=true;
      }
    }
  };
  const world_anims=api;
  function sfxHall(){/* hooked by game via callback */}
  api.onHallLight=null;
  const origSetHall=api.setHallLight.bind(api);
  api.setHallLight=(side,on)=>{origSetHall(side,on);if(on&&api.onHallLight)api.onHallLight(side);};

  return api;
}
