import * as THREE from 'three';
import {M,rand,pick,clamp,lerp,easeOut} from './utils.js';

export const META = {
  strix:{name:'PROFESSOR STRIX',title:'THE CONDUCTOR',kind:'strix',
    tip:'Freezes while his camera watches him — until his patience snaps.'},
  selene:{name:'LADY SELENE',title:'THE MOON DOLL',kind:'selene',
    tip:'Only moves while you watch the monitors. Her lullaby gets louder as she nears.'},
  rusty:{name:'RUSTY',title:'GOOD BOY GONE BAD',kind:'rusty',
    tip:'Neglect the Doghouse cam and he sprints the west hall. Slam the door fast.'},
  scamper:{name:'SCAMPER',title:'THE VENT GREMLIN',kind:'scamper',
    tip:'Crawls the vents. Flash the grilles to spot his eyes. Snare or seal him out.'},
  eclipse:{name:'ECLIPSE',title:'DO NOT LOOK',kind:'eclipse',
    tip:'It lives in the feeds now. If you see golden static — switch away.'}
};

function eyeMat(color,intensity=2.2){
  return new THREE.MeshStandardMaterial({color:0x111111,emissive:color,emissiveIntensity:intensity,roughness:.3});
}
function glowDot(r,color,parent,x,y,z,intensity=3){
  const m=new THREE.Mesh(new THREE.SphereGeometry(r,10,10),eyeMat(color,intensity));
  m.position.set(x,y,z); parent.add(m); return m;
}

function buildStrix(){
  const g=new THREE.Group(); const rig={};
  const bodyMat=M(0x6b4a2f,{m:.15,r:.75});
  const bellyMat=M(0xcfc4ae,{m:.05,r:.85});
  const brass=M(0x8a6d3b,{m:.9,r:.42});
  const faceMat=M(0xd8cfc0,{m:.05,r:.8});

  const body=new THREE.Mesh(new THREE.SphereGeometry(.46,20,16));
  body.scale.set(1,1.28,.92); body.position.y=.98; body.castShadow=true;
  body.material=bodyMat; g.add(body); rig.body=body;

  const belly=new THREE.Mesh(new THREE.SphereGeometry(.34,18,14),bellyMat);
  belly.scale.set(.9,1.15,.62); belly.position.set(0,.94,.24); g.add(belly);

  for(let i=0;i<5;i++){
    const fp=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),bodyMat);
    fp.scale.set(1.25,.7,.55);
    const a=-Math.PI*.22+i*Math.PI*.11;
    fp.position.set(Math.sin(a)*.36,1.32-Math.abs(i-2)*.06,.3+Math.cos(a)*.12);
    fp.rotation.z=-a*.6; g.add(fp);
  }

  const head=new THREE.Group(); head.position.y=1.78; g.add(head); rig.head=head;
  const skull=new THREE.Mesh(new THREE.SphereGeometry(.30,18,14),bodyMat);
  skull.scale.set(1,1.02,.88); head.add(skull);

  const disc=new THREE.Mesh(new THREE.CircleGeometry(.27,20),faceMat);
  disc.position.z=.255; head.add(disc);
  const disc2=new THREE.Mesh(new THREE.CircleGeometry(.21,20),M(0xb8ab97,{r:.85}));
  disc2.position.z=.262; disc2.position.y=-.03; head.add(disc2);

  rig.eyes=[];
  for(const sx of [-1,1]){
    const socket=new THREE.Mesh(new THREE.CircleGeometry(.085,14),new THREE.MeshBasicMaterial({color:0x090605}));
    socket.position.set(sx*.105,.05,.268); head.add(socket);
    const eyeb=new THREE.Mesh(new THREE.SphereGeometry(.062,12,12),eyeMat(0xffb347,2.4));
    eyeb.position.set(sx*.105,.05,.262); head.add(eyeb);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(.02,8,8),new THREE.MeshBasicMaterial({color:0x000}));
    pupil.position.set(sx*.105,.05,.318); head.add(pupil);
    const lid=new THREE.Mesh(new THREE.CircleGeometry(.075,14),bodyMat);
    lid.position.set(sx*.105,.05,.272); lid.rotation.x=.35;
    lid.geometry.translate(0,.075,0);
    lid.rotation.x=1.35;
    head.add(lid);
    rig.eyes.push({eyeb,lid});
    const brow=new THREE.Mesh(new THREE.BoxGeometry(.16,.035,.05),M(0x3d2b1a,{r:.8}));
    brow.position.set(sx*.11,.135,.26); brow.rotation.z=sx*-.45; head.add(brow);
  }

  const beakTop=new THREE.Mesh(new THREE.ConeGeometry(.055,.17,10),M(0xc9a24a,{m:.7,r:.45}));
  beakTop.position.set(0,-.005,.31); beakTop.rotation.x=Math.PI/2+.35; head.add(beakTop);
  const beakBot=new THREE.Mesh(new THREE.ConeGeometry(.045,.12,10),M(0xa9853c,{m:.7,r:.5}));
  beakBot.position.set(0,-.05,.295); beakBot.rotation.x=Math.PI/2+.15; head.add(beakBot);
  rig.beak=beakBot;

  for(const sx of [-1,1]){
    const tuft=new THREE.Mesh(new THREE.ConeGeometry(.06,.2,8),bodyMat);
    tuft.position.set(sx*.17,.3,-.02); tuft.rotation.z=sx*-.4; tuft.rotation.x=-.15; head.add(tuft);
  }
  const bowTie=new THREE.Mesh(new THREE.BoxGeometry(.2,.09,.06),M(0x7a1622,{r:.6}));
  bowTie.position.set(0,1.52,.3); g.add(bowTie);
  const bowKnot=new THREE.Mesh(new THREE.SphereGeometry(.035,8,8),M(0x8f1a26,{r:.6}));
  bowKnot.position.set(0,1.52,.33); g.add(bowKnot);

  rig.wings=[];
  for(const sx of [-1,1]){
    const wing=new THREE.Group(); wing.position.set(sx*.42,1.28,0); g.add(wing);
    for(let i=0;i<4;i++){
      const f=new THREE.Mesh(new THREE.BoxGeometry(.1,.5-i*.06,.04),bodyMat);
      f.position.set(sx*(.05+i*.09),-.18-i*.02,0);
      f.rotation.z=sx*(.15+i*.12);
      wing.add(f);
    }
    const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),brass);
    wing.add(shoulder);
    rig.wings.push(wing);
  }

  rig.legs=[];
  for(const sx of [-1,1]){
    const leg=new THREE.Group(); leg.position.set(sx*.16,.5,0); g.add(leg);
    const shin=new THREE.Mesh(new THREE.CylinderGeometry(.035,.03,.3,8),brass);
    shin.position.y=-.15; leg.add(shin);
    for(let i=0;i<3;i++){
      const toe=new THREE.Mesh(new THREE.BoxGeometry(.05,.03,.12),brass);
      toe.position.set((i-1)*.055,-.31,.06); leg.add(toe);
    }
    rig.legs.push(leg);
  }
  const tail=new THREE.Mesh(new THREE.BoxGeometry(.3,.34,.05),bodyMat);
  tail.position.set(0,.86,-.42); tail.rotation.x=.5; g.add(tail);

  rig.idle=(t,mood)=>{
    body.position.y=.98+Math.sin(t*1.4)*.02;
    head.rotation.y=Math.sin(t*.5)*.3*mood;
    head.rotation.z=Math.sin(t*.83)*.06*mood;
    head.rotation.x=Math.sin(t*.61)*.05+.06;
    rig.eyes.forEach(e=>{e.lid.rotation.x=1.35-(chanceBlink(t)?1.1:0);});
    rig.wings.forEach((w,i)=>{w.rotation.z=(i?1:-1)*(.12+Math.sin(t*1.1+i)*.04);});
    rig.beak.rotation.x=Math.PI/2+.15+Math.max(0,Math.sin(t*.37))*.1;
  };
  function chanceBlink(t){return (Math.sin(t*2.3)>.997);}
  rig.scare=(k)=>{
    body.position.y=.98;
    head.rotation.set(Math.sin(k*40)*.06,-Math.sin(k*23)*.1,.1*Math.sin(k*31));
    head.position.y=1.78+k*.25;
    rig.wings.forEach((w,i)=>{w.rotation.z=(i?1:-1)*(2.1-k*.3);w.rotation.x=-.4;});
    rig.beak.rotation.x=Math.PI/2+.9;
    rig.eyes.forEach(e=>{e.eyeb.material.emissiveIntensity=2.4+k*6;e.lid.rotation.x=1.45;});
  };
  return {group:g,rig};
}

function buildSelene(){
  const g=new THREE.Group(); const rig={};
  const porcelain=new THREE.MeshPhysicalMaterial({color:0xefe6ea,roughness:.25,clearcoat:.8,clearcoatRoughness:.25});
  const gownMat=new THREE.MeshPhysicalMaterial({color:0x8f9fd4,roughness:.4,clearcoat:.3,side:THREE.DoubleSide});

  const profile=[];
  for(let i=0;i<=10;i++){
    const t=i/10;
    profile.push(new THREE.Vector2(.12+t*t*.5,t*1.05));
  }
  const gown=new THREE.Mesh(new THREE.LatheGeometry(profile,22),gownMat);
  gown.castShadow=true; g.add(gown); rig.gown=gown;

  const torso=new THREE.Mesh(new THREE.CylinderGeometry(.14,.19,.42,14),porcelain);
  torso.position.y=1.18; torso.castShadow=true; g.add(torso);

  const headG=new THREE.Group(); headG.position.y=1.56; g.add(headG); rig.head=headG;
  const head=new THREE.Mesh(new THREE.SphereGeometry(.185,20,16),porcelain);
  head.scale.set(1,1.12,.95); head.castShadow=true; headG.add(head);

  const smile=new THREE.Mesh(new THREE.TorusGeometry(.075,.008,6,16,Math.PI),M(0x8a4a5a,{r:.6}));
  smile.position.set(0,-.055,.168); smile.rotation.z=Math.PI; smile.rotation.x=-.25; headG.add(smile);
  for(const sx of [-1,1]){
    const cheek=new THREE.Mesh(new THREE.CircleGeometry(.035,10),M(0xe8b4bc,{r:.7}));
    cheek.position.set(sx*.095,-.03,.165); cheek.rotation.y=sx*.5; headG.add(cheek);
    const crack=new THREE.Mesh(new THREE.BoxGeometry(.008,.16,.004),M(0x4a3038,{r:.5}));
    crack.position.set(sx*.06,.09,.178); crack.rotation.z=sx*.5; headG.add(crack);
    const crack2=new THREE.Mesh(new THREE.BoxGeometry(.007,.09,.004),M(0x4a3038,{r:.5}));
    crack2.position.set(sx*.115,.02,.172); crack2.rotation.z=-sx*.7; headG.add(crack2);
  }
  rig.eyeDots=[];
  for(const sx of [-1,1]){
    const socket=new THREE.Mesh(new THREE.CircleGeometry(.05,12),new THREE.MeshBasicMaterial({color:0x070408}));
    socket.position.set(sx*.075,.045,.175); headG.add(socket);
    const pin=glowDot(.012,0xbfd4ff,headG,sx*.075,.045,.182,1.6);
    rig.eyeDots.push(pin);
  }
  const mouthHole=new THREE.Mesh(new THREE.CircleGeometry(.022,10),new THREE.MeshBasicMaterial({color:0x000}));
  mouthHole.position.set(0,-.075,.176); headG.add(mouthHole);
  rig.mouth=mouthHole;

  const tiara=new THREE.Mesh(new THREE.TorusGeometry(.13,.018,8,20,Math.PI),M(0xd8dce8,{m:.95,r:.2}));
  tiara.position.y=.13; tiara.rotation.z=Math.PI; headG.add(tiara);
  const gem=glowDot(.025,0xffd97a,headG,0,.155,.1,2);

  rig.arms=[];
  for(const sx of [-1,1]){
    const arm=new THREE.Group(); arm.position.set(sx*.17,1.34,0); g.add(arm);
    const upper=new THREE.Mesh(new THREE.CylinderGeometry(.035,.03,.3,10),porcelain);
    upper.position.y=-.15; upper.rotation.z=sx*.25; arm.add(upper);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.045,10,8),porcelain);
    hand.position.set(sx*.075,-.32,0); arm.add(hand);
    rig.arms.push(arm);
  }

  const keyG=new THREE.Group(); keyG.position.set(0,1.2,-.2); g.add(keyG); rig.key=keyG;
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.1,8),M(0xb8a44a,{m:.95,r:.3}));
  shaft.rotation.x=Math.PI/2; keyG.add(shaft);
  const crank=new THREE.Mesh(new THREE.TorusGeometry(.045,.01,6,14),M(0xb8a44a,{m:.95,r:.3}));
  crank.position.z=-.06; keyG.add(crank);

  rig.idle=(t,mood)=>{
    gown.rotation.y=Math.sin(t*.4)*.08*mood;
    headG.rotation.z=Math.sin(t*.27)*.12*mood+(mood>.7?.35:0);
    headG.rotation.y=Math.sin(t*.19)*.25*mood;
    headG.position.y=1.56+Math.sin(t*.9)*.012;
    keyG.rotation.z=t*.8;
    rig.eyeDots.forEach(p=>p.material.emissiveIntensity=1.2+Math.sin(t*2.1)*.6);
  };
  rig.scare=(k)=>{
    headG.rotation.z=lerp(headG.rotation.z,1.35,k*4>1?1:k*4);
    headG.position.y=1.56+k*.3;
    rig.mouth.scale.setScalar(1+k*14);
    rig.eyeDots.forEach(p=>p.material.emissiveIntensity=1.6+k*8);
    rig.arms.forEach((a,i)=>{a.rotation.z=(i?1:-1)*(k*1.8);});
    keyG.rotation.z=k*30;
  };
  return {group:g,rig};
}

function buildRusty(){
  const g=new THREE.Group(); const rig={};
  const fur=M(0x8a6a3a,{m:.1,r:.8});
  const furDark=M(0x6e5430,{m:.1,r:.85});
  const rust=M(0x7a3b1e,{m:.2,r:.95});
  const endo=M(0x666e78,{m:.9,r:.35});

  const body=new THREE.Mesh(new THREE.SphereGeometry(.38,18,14),fur);
  body.scale.set(1,1.1,.85); body.position.set(0,1.0,.06); body.rotation.x=.35;
  body.castShadow=true; g.add(body); rig.body=body;

  for(let i=0;i<4;i++){
    const patch=new THREE.Mesh(new THREE.SphereGeometry(rand(.07,.11),8,8),rust);
    patch.scale.set(1,.4,.6);
    const a=rand(Math.PI*2);
    patch.position.set(Math.cos(a)*.3,rand(.8,1.25),.06+Math.sin(a)*.28);
    g.add(patch);
  }
  const hipEndo=new THREE.Mesh(new THREE.SphereGeometry(.12,10,8),endo);
  hipEndo.position.set(-.22,.82,.18); hipEndo.scale.set(1,.7,.8); g.add(hipEndo);
  const rod=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.2,6),endo);
  rod.position.set(-.22,.72,.26); rod.rotation.x=1.2; g.add(rod);

  const head=new THREE.Group(); head.position.set(0,1.42,.3); g.add(head); rig.head=head;
  const skull=new THREE.Mesh(new THREE.SphereGeometry(.24,16,12),fur);
  skull.scale.set(1,.92,.95); head.add(skull);
  const snoutUp=new THREE.Mesh(new THREE.BoxGeometry(.2,.1,.24),furDark);
  snoutUp.position.set(0,-.02,.24); head.add(snoutUp);
  const snoutLo=new THREE.Mesh(new THREE.BoxGeometry(.18,.07,.2),furDark);
  snoutLo.position.set(0,-.1,.21); head.add(snoutLo);
  rig.jaw=snoutLo;
  const nose=new THREE.Mesh(new THREE.SphereGeometry(.045,10,8),M(0x1d1512,{r:.5}));
  nose.position.set(0,.03,.37); head.add(nose);
  for(let i=0;i<4;i++){
    const tooth=new THREE.Mesh(new THREE.BoxGeometry(.022,.05,.015),M(0xe8e2d0,{r:.4}));
    tooth.position.set(i<2?-.05:.05,-.055,i%2?.3:.24); head.add(tooth);
  }
  rig.eyes=[];
  {
    const eL=glowDot(.05,0xffb347,head,-.1,.05,.2,2.4); rig.eyes.push(eL);
    const socketR=new THREE.Mesh(new THREE.CircleGeometry(.055,12),new THREE.MeshBasicMaterial({color:0x050505}));
    socketR.position.set(.1,.05,.215); head.add(socketR);
    const dotR=glowDot(.012,0xff2222,head,.1,.05,.222,1.4);
  }
  rig.ears=[];
  for(const[sx,torn]of[[-1,false],[1,true]]){
    const ear=new THREE.Group(); ear.position.set(sx*.17,.2,-.02); head.add(ear);
    if(!torn){
      const flap=new THREE.Mesh(new THREE.SphereGeometry(.11,10,8),furDark);
      flap.scale.set(.5,1.3,.35); flap.position.y=-.1; ear.add(flap);
    }else{
      const flap=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),furDark);
      flap.scale.set(.5,.7,.3); flap.position.y=-.04; ear.add(flap);
      const wire=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.12,5),endo);
      wire.position.set(0,-.12,.02); wire.rotation.z=sx*.3; ear.add(wire);
    }
    ear.rotation.z=sx*-.35;
    rig.ears.push(ear);
  }
  const collar=new THREE.Mesh(new THREE.TorusGeometry(.17,.03,8,16),M(0xaa2222,{r:.5}));
  collar.position.set(0,1.28,.28); collar.rotation.x=Math.PI/2-.3; g.add(collar);
  const tag=new THREE.Mesh(new THREE.OctahedronGeometry(.05),M(0xffd97a,{m:.9,r:.25}));
  tag.position.set(0,1.16,.42); tag.scale.y=1.3; g.add(tag);

  rig.legs=[];
  for(const[sx,sz]of[[-1,1],[1,1],[-1,-1],[1,-1]]){
    const leg=new THREE.Group(); leg.position.set(sx*.2,.62,sz*.22); g.add(leg);
    const up=new THREE.Mesh(new THREE.CylinderGeometry(.055,.045,.28,8),fur);
    up.position.y=-.12; leg.add(up);
    const lo=new THREE.Mesh(new THREE.CylinderGeometry(.035,.03,.24,8),furDark);
    lo.position.set(0,-.32,sz*.04); leg.add(lo);
    const paw=new THREE.Mesh(new THREE.SphereGeometry(.07,8,8),furDark);
    paw.scale.set(1,.6,1.3); paw.position.set(0,-.45,sz*.08); leg.add(paw);
    rig.legs.push(leg);
  }
  rig.tailSegs=[];
  let prev=null;
  for(let i=0;i<4;i++){
    const seg=new THREE.Mesh(new THREE.SphereGeometry(.05-i*.009,8,8),i%2?fur:furDark);
    seg.position.set(0,1.05+i*.09,-.36-i*.1);
    g.add(seg); rig.tailSegs.push(seg);
  }
  rig.idle=(t,mood)=>{
    body.position.y=1.0+Math.sin(t*1.8)*.02;
    body.rotation.x=.35+Math.sin(t*1.8)*.02;
    head.rotation.y=Math.sin(t*.7)*.35*mood;
    head.rotation.z=Math.sin(t*1.3)*.05*mood;
    head.rotation.x=-.05+Math.max(0,Math.sin(t*.9))*.08;
    const wag=2.2+mood*3;
    rig.tailSegs.forEach((s,i)=>{s.position.x=Math.sin(t*wag-i*.7)*.08;s.position.y=1.05+i*.09;});
    rig.ears.forEach((e,i)=>{e.rotation.x=Math.sin(t*2.1+i)*.1;});
    rig.jaw.position.y=-.1+Math.max(0,Math.sin(t*1.7))*.03;
  };
  rig.scare=(k)=>{
    body.rotation.x=.35-k*.5;
    body.position.y=1.0+k*.35;
    head.rotation.set(.3+k*.2,Math.sin(k*30)*.12,Math.sin(k*25)*.08);
    rig.jaw.position.y=-.1-k*.16; rig.jaw.rotation.x=-k*1.1;
    rig.eyes.forEach(e=>{if(e.material.emissive)e.material.emissiveIntensity=2.4+k*7;});
    rig.legs.forEach((l,i)=>{l.rotation.x=(i%2?1:-1)*k*1.2;l.position.z+= (i%2?1:-1)*0;});
    rig.tailSegs.forEach((s,i)=>{s.position.x=Math.sin(k*50-i)*.12;});
  };
  return {group:g,rig};
}

function buildScamper(){
  const g=new THREE.Group(); const rig={};
  const grey=M(0x9aa0a8,{m:.2,r:.7});
  const pink=M(0xd89aa8,{r:.6});
  const body=new THREE.Mesh(new THREE.SphereGeometry(.22,14,12),grey);
  body.scale.set(1,1.05,1.25); body.position.y=.3; body.castShadow=true;
  g.add(body); rig.body=body;
  const belly=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),M(0xc8ccd2,{r:.7}));
  belly.scale.set(.8,.9,1); belly.position.set(0,.27,.08); g.add(belly);
  const head=new THREE.Group(); head.position.set(0,.52,.22); g.add(head); rig.head=head;
  const skull=new THREE.Mesh(new THREE.SphereGeometry(.16,14,12),grey);
  skull.scale.set(1,.95,1.05); head.add(skull);
  const snout=new THREE.Mesh(new THREE.SphereGeometry(.08,10,8),grey);
  snout.scale.set(.8,.7,1.1); snout.position.set(0,-.04,.13); head.add(snout);
  const nose=glowDotNose();
  function glowDotNose(){const n=new THREE.Mesh(new THREE.SphereGeometry(.025,8,8),new THREE.MeshBasicMaterial({color:0x2a1a20}));n.position.set(0,-.01,.22);head.add(n);return n;}
  rig.eyes=[];
  for(const sx of [-1,1]){
    const e=glowDot(.035,0x51ff6a,head,sx*.07,.03,.12,2.6);
    rig.eyes.push(e);
    for(let wi=0;wi<3;wi++){
      const wh=new THREE.Mesh(new THREE.CylinderGeometry(.002,.002,.14,4),M(0xd8dde2,{r:.5}));
      wh.rotation.z=Math.PI/2+sx*.2; wh.rotation.y=wi*.4-.4;
      wh.position.set(sx*.06,-.03,.16+wi*.02); head.add(wh);
    }
  }
  rig.ears=[];
  for(const sx of [-1,1]){
    const ear=new THREE.Group(); ear.position.set(sx*.11,.14,-.03); head.add(ear);
    const outer=new THREE.Mesh(new THREE.CircleGeometry(.09,14),grey);
    outer.material=new THREE.MeshStandardMaterial({color:0x9aa0a8,roughness:.7,side:THREE.DoubleSide});
    ear.add(outer);
    const inner=new THREE.Mesh(new THREE.CircleGeometry(.06,12),pink);
    inner.position.z=.004; inner.material=new THREE.MeshStandardMaterial({color:0xd89aa8,roughness:.7,side:THREE.DoubleSide});
    ear.add(inner);
    ear.rotation.y=sx*-.4; rig.ears.push(ear);
  }
  const tailCurve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,.28,-.26),new THREE.Vector3(0,.18,-.5),
    new THREE.Vector3(.05,.1,-.68),new THREE.Vector3(0,.06,-.82)]);
  const tail=new THREE.Mesh(new THREE.TubeGeometry(tailCurve,12,.014,6),pink);
  g.add(tail);
  rig.feet=[];
  for(const[sx,sz]of[[-1,1],[1,1],[-1,-1],[1,-1]]){
    const foot=new THREE.Mesh(new THREE.SphereGeometry(.05,8,6),grey);
    foot.scale.set(1,.6,1.5); foot.position.set(sx*.12,.04,sz*.14);
    g.add(foot); rig.feet.push(foot);
  }
  rig.idle=(t,mood)=>{
    body.position.y=.3+Math.sin(t*6)*.012;
    head.rotation.y=Math.sin(t*3.1)*.5*mood;
    head.rotation.x=Math.sin(t*5.3)*.08;
    rig.ears.forEach((e,i)=>{e.rotation.z=Math.sin(t*4+i)*.15;e.rotation.x=Math.sin(t*3+i*2)*.1;});
    rig.feet.forEach((f,i)=>{f.position.y=.04+Math.max(0,Math.sin(t*8+i*Math.PI/2))*.03;});
  };
  rig.scare=(k)=>{
    body.position.y=.3+k*.55;
    head.rotation.set(-.2-k*.3,Math.sin(k*40)*.15,0);
    rig.ears.forEach((e,i)=>{e.rotation.x=-k*1.2;});
    rig.eyes.forEach(e=>{e.material.emissiveIntensity=2.6+k*8;});
    rig.feet.forEach(f=>{f.position.z+= .0;});
  };
  return {group:g,rig};
}

function buildEclipse(){
  const g=new THREE.Group(); const rig={};
  const voidMat=new THREE.MeshPhysicalMaterial({color:0x08080c,roughness:.18,metalness:.65,clearcoat:1});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry?new THREE.CapsuleGeometry(.22,.9,6,14):new THREE.CylinderGeometry(.22,.26,1.3,14),voidMat);
  body.position.y=1.15; g.add(body); rig.body=body;
  const headG=new THREE.Group(); headG.position.y=1.95; g.add(headG); rig.head=headG;
  const mask=new THREE.Mesh(new THREE.SphereGeometry(.2,16,12),new THREE.MeshStandardMaterial({color:0xf2eee6,roughness:.35}));
  mask.scale.set(1,1.25,.7); headG.add(mask);
  const sunSide=new THREE.Group(); headG.add(sunSide);
  for(let i=0;i<7;i++){
    const ray=new THREE.Mesh(new THREE.ConeGeometry(.015,.09,5),M(0xd8a63a,{m:.8,r:.35,e:0x8a6a1a,ei:.6}));
    const a=i/7*Math.PI-Math.PI/2;
    ray.position.set(Math.cos(a)*.19,Math.sin(a)*.24,.1);
    ray.rotation.z=a-Math.PI/2; sunSide.add(ray);
  }
  const moonMask=new THREE.Mesh(new THREE.CircleGeometry(.16,20),new THREE.MeshBasicMaterial({color:0x050507}));
  moonMask.position.set(.06,.02,.145); moonMask.scale.x=.55; headG.add(moonMask);
  for(const sx of [-1,1]){
    const eye=new THREE.Mesh(new THREE.CircleGeometry(.035,10),new THREE.MeshBasicMaterial({color:0x000}));
    eye.position.set(sx*.07,.04,.142); headG.add(eye);
  }
  rig.armL=new THREE.Group(); rig.armL.position.set(-.26,1.6,0); g.add(rig.armL);
  rig.armR=new THREE.Group(); rig.armR.position.set(.26,1.6,0); g.add(rig.armR);
  for(const a of [rig.armL,rig.armR]){
    const limb=new THREE.Mesh(new THREE.CylinderGeometry(.03,.02,.95,8),voidMat);
    limb.position.y=-.48; a.add(limb);
    const claw=new THREE.Mesh(new THREE.ConeGeometry(.03,.1,6),M(0xd8d2c4,{r:.4}));
    claw.position.y=-1.0; claw.rotation.x=Math.PI; a.add(claw);
  }
  rig.idle=(t,mood)=>{
    body.position.y=1.15+Math.sin(t*.7)*.05;
    headG.rotation.y=Math.sin(t*.23)*.4;
    headG.rotation.z=Math.sin(t*.31)*.15;
    rig.armL.rotation.z=.15+Math.sin(t*.5)*.08;
    rig.armR.rotation.z=-.15-Math.sin(t*.5)*.08;
  };
  rig.scare=(k)=>{
    headG.position.y=1.95+k*.2;
    headG.rotation.set(Math.sin(k*36)*.1,Math.sin(k*20)*.2,.2);
    rig.armL.rotation.z=.15+k*1.9; rig.armR.rotation.z=-.15-k*1.9;
  };
  return {group:g,rig};
}

const BUILDERS={strix:buildStrix,selene:buildSelene,rusty:buildRusty,scamper:buildScamper,eclipse:buildEclipse};

export class Actor{
  constructor(kind){
    this.kind=kind;
    this.meta=META[kind];
    const b=BUILDERS[kind]();
    this.group=b.group;
    this.rig=b.rig;
    this.group.visible=false;
    this.mode='hidden';
    this.mood=1;
    this.t=rand(100);
    this.scareT=-1;
    this.baseY=this.kind==='scamper'?0:.001;
    this._yaw=0;
  }
  place(pos,yaw=0){
    this.group.position.set(pos[0],this.baseY,pos[2]);
    this._yaw=yaw;
    this.group.rotation.y=yaw;
  }
  show(){this.group.visible=true;this.mode='idle';}
  hide(){this.group.visible=false;this.mode='hidden';this.scareT=-1;}
  setMode(m){this.mode=m;}
  faceTowards(target){
    const dx=target.x-this.group.position.x,dz=target.z-this.group.position.z;
    this.group.rotation.y=Math.atan2(dx,dz);
  }
  startScare(){
    this.scareT=0;
    this.mode='scare';
    return 1.15;
  }
  update(dt,camera){
    if(this.mode==='hidden')return false;
    this.t+=dt;
    if(this.mode==='scare'){
      if(this.scareT>=0){
        this.scareT+=dt;
        const k=clamp(this.scareT/.55,0,1.6);
        this.rig.scare&&this.rig.scare(k);
        if(camera){
          const dir=new THREE.Vector3().subVectors(camera.position,this.group.position);
          const dist=Math.max(dir.length()-1.15,0.05);
          this.group.position.addScaledVector(dir.normalize(),Math.min(dist,dt*9/(k+.4)));
          this.group.lookAt(camera.position.x,this.group.position.y+.9,camera.position.z);
        }
        return true;
      }
      return true;
    }
    this.rig.idle&&this.rig.idle(this.t,this.mood);
    return false;
  }
  resetScarePose(){
    if(this.rig.idle)this.rig.idle(this.t,0);
    if(this.kind==='selene'&&this.rig.mouth)this.rig.mouth.scale.setScalar(1);
    if(this.kind==='strix')this.rig.eyes.forEach(e=>e.eyeb.material.emissiveIntensity=2.4);
  }
}
