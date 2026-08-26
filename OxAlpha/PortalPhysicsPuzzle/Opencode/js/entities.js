import * as THREE from 'three';
import { CFG } from './config.js';
import { Body, moveAndCollide } from './physics.js';
import { clamp, damp, rand } from './utils.js';
import { audio } from './audio.js';

// ---------------------------------------------------------------- Cube visual
let _cubeMat=null;
function cubeMaterial(){
  if(_cubeMat)return _cubeMat;
  const c=document.createElement('canvas');c.width=c.height=128;
  const x=c.getContext('2d');
  x.fillStyle='#111';x.fillRect(0,0,128,128);
  x.strokeStyle='#3b444d';x.lineWidth=10;x.strokeRect(8,8,112,112);
  const e=document.createElement('canvas');e.width=e.height=128;
  const xe=e.getContext('2d');
  xe.fillStyle='#000';xe.fillRect(0,0,128,128);
  xe.fillStyle='#57e6c8';
  xe.beginPath();xe.arc(64,64,17,0,Math.PI*2);xe.fill();
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  const em=new THREE.CanvasTexture(e);em.colorSpace=THREE.SRGBColorSpace;
  _cubeMat=new THREE.MeshStandardMaterial({
    map,color:0xcfd6dd,roughness:.5,metalness:.65,
    emissiveMap:em,emissive:0xffffff,emissiveIntensity:.9,
  });
  return _cubeMat;
}

export class Cube {
  constructor(scene,pos){
    this.scene=scene;
    this.mesh=new THREE.Mesh(new THREE.BoxGeometry(CFG.CUBE_SIZE,CFG.CUBE_SIZE,CFG.CUBE_SIZE),cubeMaterial());
    this.mesh.castShadow=true;this.mesh.receiveShadow=true;
    scene.add(this.mesh);
    this.body=new Body(new THREE.Vector3().setScalar(CFG.CUBE_SIZE/2));
    this.body.entity=this;
    this.spawnPos=pos.clone();
    this.spin=new THREE.Vector3();
    this.carried=false;
    this.dead=false;
    this.deadT=0;
    this.inGrill=false;
    this.reset();
  }
  reset(){
    this.dead=false;this.carried=false;this.mesh.visible=true;
    this.mesh.scale.set(1,1,1);
    this.body.pos.copy(this.spawnPos);
    this.body.vel.set(0,0,0);
    this.mesh.quaternion.identity();
    this.spin.set(0,0,0);
  }
  fizzle(fx){
    if(this.dead)return;
    this.dead=true;this.carried=false;this.deadT=0;
    audio.fizzleItem();
    fx.burst(this.body.pos,18,null,3,.6);
  }
  update(dt,world,portals,player,acidZones,grills){
    const b=this.body;
    b.prevPos=b.prevPos||new THREE.Vector3();

    if(this.dead){
      this.deadT+=dt;
      const k=Math.min(1,this.deadT/.7);
      this.mesh.scale.setScalar(Math.max(.001,1-k));
      this.mesh.position.copy(b.pos);
      if(this.deadT>1.1)this.reset();
      return;
    }
    b.prevPos.copy(b.pos);

    if(this.carried&&player){
      // spring toward hold point
      const eye=player.eyePos(_v1);
      const target=_v2.copy(eye).addScaledVector(player.forward(_v3),CFG.HOLD_DIST);
      target.y-=0.22;
      _v1.copy(target).sub(b.pos);
      const d=_v1.length();
      if(d>2.4){player.dropHeld(true);}
      else{
        b.vel.copy(_v1).multiplyScalar(Math.min(14,d*11));
        b.vel.y-=CFG.GRAVITY*dt*0.25;
        this.spin.multiplyScalar(Math.exp(-6*dt));
      }
    }else{
      b.vel.y-=CFG.GRAVITY*dt;
      if(b.vel.y<CFG.MAX_FALL)b.vel.y=CFG.MAX_FALL;
    }
    moveAndCollide(world,b,dt,false);

    // friction / spin life
    if(b.onGround&&!this.carried){
      const fr=Math.exp(-9*dt);
      b.vel.x*=fr;b.vel.z*=fr;
      // settle flat
      _q1.setFromEuler(_eul.set(0,0,0));
      this.mesh.quaternion.slerp(_q1,Math.min(1,dt*7));
    }else{
      if(this.spin.lengthSq()>1e-5){
        _q1.setFromEuler(_eul.set(this.spin.x*dt,this.spin.y*dt,this.spin.z*dt));
        this.mesh.quaternion.multiply(_q1);
        this.spin.multiplyScalar(Math.exp(-1.2*dt));
      }
    }

    portals.updateSuppression(b);
    portals.onBodyMoved(b,this,null);

    // acid
    for(const z of acidZones){
      if(b.pos.y-b.half.y<z.surface+0.04&&
         b.pos.x>z.min.x&&b.pos.x<z.max.x&&b.pos.z>z.min.z&&b.pos.z<z.max.z){
        this.fizzle(z.fx);break;
      }
    }
    // emancipation grills
    for(const g of grills){
      const inside=b.pos.x>g.min.x&&b.pos.x<g.max.x&&b.pos.y>g.min.y&&b.pos.y<g.max.y&&b.pos.z>g.min.z&&b.pos.z<g.max.z;
      if(inside&&!this.inGrill){ this.fizzle(g.fx); }
      this.inGrill=inside;
    }
    if(this.dead&&player&&player.held===this)player.held=null;

    this.mesh.position.copy(b.pos);
  }
}
const _v1=new THREE.Vector3(),_v2=new THREE.Vector3(),_v3=new THREE.Vector3();
const _q1=new THREE.Quaternion(),_eul=new THREE.Euler();

export function separateBodies(a,b,pushA=false,pushB=true){
  _v1.copy(b.pos).sub(a.pos);
  const ox=a.half.x+b.half.x-Math.abs(_v1.x);
  const oy=a.half.y+b.half.y-Math.abs(_v1.y);
  const oz=a.half.z+b.half.z-Math.abs(_v1.z);
  if(ox<=0||oy<=0||oz<=0)return false;
  // smallest penetration axis
  let ax='x',pen=ox;
  if(oy<pen){ax='y';pen=oy;}
  if(oz<pen){ax='z';pen=oz;}
  const s=Math.sign(_v1[axis])||1;
  if(pushB)b.pos[axis]+=s*pen*0.5+(pushA?0:pen*0.5);
  if(pushA)a.pos[axis]-=s*pen*(pushB?0.5:1);
  if(ax!=='y'){
    if(pushB&&Math.sign(b.vel[axis])===-s)b.vel[axis]*=-0.1;
    if(pushA&&Math.sign(a.vel[axis])===s)a.vel[axis]*=-0.1;
  }else{
    if(pushB&&s>0)b.onGround=true;
    if(pushA&&s<0)a.onGround=true;
  }
  return true;
}

// ------------------------------------------------------------- Floor button
export class FloorButton {
  constructor(scene,pos,channel,radius=0.62){
    this.channel=channel;this.pressed=false;this.pos=pos.clone();
    const g=new THREE.Group();g.position.copy(pos);
    const M=scene.userData.mats;
    this.base=new THREE.Mesh(new THREE.CylinderGeometry(radius+0.16,radius+0.24,0.09,28),M.metal);
    this.base.position.y=0.045;this.base.castShadow=true;this.base.receiveShadow=true;
    this.cap=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*0.92,0.12,28),
      new THREE.MeshStandardMaterial({color:0xff5f4f,emissive:0xff2a1a,emissiveIntensity:.55,roughness:.4}));
    this.cap.position.y=0.13;this.cap.castShadow=true;
    g.add(this.base,this.cap);
    scene.add(g);
    // solid collar so cubes sit on the plate
    this.collider=null; // registered by builder via addStatic
    this.cylR=radius;
  }
  setCollider(c){this.collider=c;}
  evaluate(cubes,player,signals){
    let on=false;
    const r=this.cylR+0.32;
    for(const cu of cubes){
      if(cu.dead||cu.carried)continue;
      const p=cu.body.pos;
      if(Math.abs(p.x-this.pos.x)<r&&Math.abs(p.z-this.pos.z)<r&&
         p.y-cu.body.half.y<this.pos.y+0.34&&p.y>this.pos.y-0.1){on=true;break;}
    }
    if(!on&&player&&!player.dead){
      const p=player.body.pos;
      if(Math.abs(p.x-this.pos.x)<r+0.15&&Math.abs(p.z-this.pos.z)<r+0.15&&
         Math.abs((p.y-player.body.half.y)-this.pos.y)<0.35)on=true;
    }
    if(on!==this.pressed){
      this.pressed=on;
      audio.buttonDown(on);
      signals[this.channel]=on;
    }
    const ty=on?0.075:0.13;
    this.cap.position.y=damp(this.cap.position.y,ty,14,1/60);
    this.cap.material.emissiveIntensity=damp(this.cap.material.emissiveIntensity,on?.05:.55,10,1/60);
    this.cap.material.color.setHex(on?0x59ffa8:0xff5f4f);
    this.cap.material.emissive.setHex(on?0x1aff7a:0xff2a1a);
  }
}

// ------------------------------------------------------- Pedestal timed button
export class PedestalButton {
  constructor(scene,pos,yawDeg,channel,duration){
    this.pos=pos.clone();this.channel=channel;this.duration=duration;
    this.active=false;this.tLeft=0;this.available=true;this.cooldown=0;
    this.range=2.3;
    const g=new THREE.Group();g.position.copy(pos);g.rotation.y=yawDeg*Math.PI/180;
    const M=scene.userData.mats;
    const post=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.13,1.05,14),M.metal);
    post.position.y=0.52;post.castShadow=true;
    this.dome=new THREE.Mesh(new THREE.SphereGeometry(0.13,20,14),
      new THREE.MeshStandardMaterial({color:0xff5f4f,emissive:0xff2a1a,emissiveIntensity:.8,roughness:.3}));
    this.dome.position.y=1.12;
    this.bar=new THREE.Mesh(new THREE.TorusGeometry(0.2,0.028,8,32),
      new THREE.MeshBasicMaterial({color:0x57e6c8,transparent:true,opacity:.9}));
    this.bar.position.y=1.12;this.bar.rotation.x=Math.PI/2;
    g.add(post,this.dome,this.bar);
    scene.add(g);
  }
  press(){
    if(!this.available||this.active)return;
    this.active=true;this.tLeft=this.duration;this.cooldown=this.duration+0.6;
    audio.buttonDown(true);audio.chime(520);
  }
  update(dt,signals){
    this.cooldown=Math.max(0,this.cooldown-dt);
    this.available=!this.active&&this.cooldown<=0;
    if(this.active){
      this.tLeft-=dt;
      signals[this.channel]=true;
      const f=clamp(this.tLeft/this.duration,0,1);
      this.bar.scale.setScalar(0.2+f*0.85);
      this.bar.material.opacity=.35+f*.65;
      this.dome.material.color.setHex(0x59ffa8);
      this.dome.material.emissive.setHex(0x1aff7a);
      if(this.tLeft<=0){
        this.active=false;
        signals[this.channel]=false;
        audio.buttonDown(false);
      }
    }else{
      this.bar.scale.setScalar(.2);
      this.dome.material.color.setHex(0xff5f4f);
      this.dome.material.emissive.setHex(0xff2a1a);
    }
    this.dome.material.emissiveIntensity=.8+(Math.sin(performance.now()*.006)*.5+.5)*(this.available?.9:.1);
  }
}

// --------------------------------------------------------------------- Door
export class Door {
  constructor(scene,pos,yawDeg,width,height,channels,mode='any'){
    this.pos=pos.clone();this.width=width;this.height=height;
    this.channels=channels;this.mode=mode;
    this.open=0;this.target=0;this.wasOpen=false;
    const g=new THREE.Group();g.position.copy(pos);g.rotation.y=yawDeg*Math.PI/180;
    const M=scene.userData.mats;
    // frame
    const fm=M.metal;
    const l=new THREE.Mesh(new THREE.BoxGeometry(0.28,height+0.28,0.5),fm);
    l.position.set(-width/2-0.14,height/2,0);
    const r=l.clone();r.position.x=width/2+0.14;
    const t=new THREE.Mesh(new THREE.BoxGeometry(width+0.56,0.28,0.5),fm);
    t.position.set(0,height+0.14,0);
    g.add(l,r,t);
    // panels
    this.panelMat=new THREE.MeshStandardMaterial({color:0x9fb3bf,roughness:.35,metalness:.75});
    const pg=new THREE.BoxGeometry(width/2,height,0.16);
    this.pl=new THREE.Mesh(pg,this.panelMat);this.pl.position.set(-width/4,height/2,0);
    this.pr=new THREE.Mesh(pg,this.panelMat);this.pr.position.set(width/4,height/2,0);
    this.pl.castShadow=this.pr.castShadow=true;
    // window strips
    const wg=new THREE.PlaneGeometry(width/2*0.55,height*0.32);
    const wm=new THREE.MeshBasicMaterial({color:0x57e6c8,transparent:true,opacity:.14});
    const wl=new THREE.Mesh(wg,wm);wl.position.set(0,height*0.6,0.085);
    const wr=wl.clone();wr.position.x=0;
    this.pl.add(wl);this.pr.add(wr.clone());
    g.add(this.pl,this.pr);
    scene.add(g);
    this.group=g;
  }
  setCollider(c){this.col=c;}
  evaluate(signals){
    let open;
    if(!this.channels.length)open=true;
    else if(this.mode==='all')open=this.channels.every(ch=>signals[ch]);
    else open=this.channels.some(ch=>signals[ch]);
    this.target=open?1:0;
    if(open!==this.wasOpen){this.wasOpen=open;audio.doorSlide(open);}
  }
  update(dt){
    this.open=damp(this.open,this.target,6,dt);
    const slide=this.width/2*this.open;
    this.pl.position.x=-this.width/4-slide;
    this.pr.position.x=this.width/4+slide;
    if(this.col)this.col.enabled=this.open<0.6;
  }
}

// ---------------------------------------------------------- Moving platform
export class MovingPlatform {
  constructor(scene,points,speed,size=[2.6,0.4,2.6]){
    this.points=points.map(p=>p.clone());
    this.speed=speed;this.size=size;
    this.t=0;this.dir=1;this.seg=0;
    this.delta=new THREE.Vector3();
    const M=scene.userData.mats;
    const geo=new THREE.BoxGeometry(size[0],size[1],size[2]);
    this.mesh=new THREE.Mesh(geo,M.metal);
    this.mesh.castShadow=true;this.mesh.receiveShadow=true;
    // hazard edging
    const edge=new THREE.Mesh(new THREE.BoxGeometry(size[0]+0.06,size[1]*0.3,size[2]+0.06),M.hazardStripe);
    edge.position.y=size[1]*0.36;
    this.mesh.add(edge);
    scene.add(this.mesh);
    this.col=null;
    this._pos=this.points[0].clone();
  }
  setCollider(c){this.col=c;}
  get pos(){return this._pos;}
  update(dt){
    const px=this._pos.x,py=this._pos.y,pz=this._pos.z;
    if(this.points.length===2){
      const A=this.points[0],B=this.points[1];
      const len=A.distanceTo(B)||0.001;
      this.t+=this.dir*this.speed*dt/len;
      if(this.t>=1){this.t=1;this.dir=-1;}
      else if(this.t<=0){this.t=0;this.dir=1;}
      this._pos.lerpVectors(A,B,this.t);
    }else{
      this.t+=this.speed*dt/(this.points[this.seg].distanceTo(this.points[(this.seg+1)%this.points.length])||0.001);
      while(this.t>=1){this.t-=1;this.seg=(this.seg+1)%this.points.length;}
      this._pos.lerpVectors(this.points[this.seg],this.points[(this.seg+1)%this.points.length],this.t);
    }
    this.delta.set(this._pos.x-px,this._pos.y-py,this._pos.z-pz);
    this.mesh.position.copy(this._pos);
    if(this.col){
      const h=this.size[1]/2;
      this.col.min.set(this._pos.x-this.size[0]/2,this._pos.y-h,this._pos.z-this.size[2]/2);
      this.col.max.set(this._pos.x+this.size[0]/2,this._pos.y+h,this._pos.z+this.size[2]/2);
    }
  }
  carry(bodies,dt){
    if(this.delta.lengthSq()<1e-10)return;
    for(const b of bodies){
      if(b.groundCol===this.col){
        b.pos.add(this.delta);
        if(this.delta.y>0&&b.isPlayer)b.vel.y=Math.max(b.vel.y,0);
      }
    }
  }
}

// -------------------------------------------------------------------- Acid
export class AcidPool {
  constructor(scene,min,max,surface,fx){
    this.min=min.clone();this.max=max.clone();this.surface=surface;this.fx=fx;
    const w=max.x-min.x,d=max.z-min.z;
    const cx=(min.x+max.x)/2,cz=(min.z+max.z)/2;
    this.mat=new THREE.ShaderMaterial({
      transparent:true,
      uniforms:{uT:{value:0}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`
        uniform float uT;varying vec2 vUv;
        void main(){
          vec2 p=vUv*vec2(${w.toFixed(1)},${d.toFixed(1)});
          float n=sin(p.x*2.1+uT*1.4)*sin(p.y*2.7-uT*1.1)*.5+.5;
          n+=sin(p.x*5.3-uT*2.2)*sin(p.y*4.1+uT*1.7)*.25+.25;
          vec3 col=mix(vec3(.02,.30,.12),vec3(.16,.95,.45),n*.7);
          col+=vec3(.4,1.,.6)*smoothstep(.75,1.,n)*.8;
          gl_FragColor=vec4(col,0.94);
        }`,
    });
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),this.mat);
    m.rotation.x=-Math.PI/2;m.position.set(cx,surface,cz);
    scene.add(m);
    this.light=new THREE.PointLight(0x39ff88,14,Math.max(w,d)*1.4,1.8);
    this.light.position.set(cx,surface+0.7,cz);
    scene.add(this.light);
    // warning lip
    const M=scene.userData.mats;
    const lip=new THREE.Mesh(new THREE.BoxGeometry(w+0.5,0.1,d+0.5),M.metal);
    lip.position.set(cx,surface-0.12,cz);
    lip.receiveShadow=true;
    scene.add(lip);
    this.stripes=[];
    const mkS=(sx,sz,sw,sd)=>{const s=new THREE.Mesh(new THREE.BoxGeometry(sw,0.06,sd),M.hazardStripe);
      s.position.set(sx,surface+0.02,sz);scene.add(s);};
    mkS(cx,min.z-0.2,w+0.9,0.22);mkS(cx,max.z+0.2,w+0.9,0.22);
    mkS(min.x-0.2,cz,0.22,d+0.9);mkS(max.x+0.2,cz,0.22,d+0.9);
  }
  update(dt){this.mat.uniforms.uT.value+=dt;}
  kills(p,feetY){
    return feetY<this.surface+0.06&&p.x>this.min.x&&p.x<this.max.x&&p.z>this.min.z&&p.z<this.max.z;
  }
}

// --------------------------------------------------------- Emancipation grill
export class Grill {
  constructor(scene,min,max,facingYawDeg,fx){
    this.min=min.clone();this.max=max.clone();this.fx=fx;
    this.inside=false;
    const w=max.x-min.x,h=max.y-min.y,d=max.z-min.z;
    const cx=(min.x+max.x)/2,cy=(min.y+max.y)/2,cz=(min.z+max.z)/2;
    this.mat=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
      uniforms:{uT:{value:0}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`
        uniform float uT;varying vec2 vUv;
        void main(){
          float s=sin(vUv.y*60.+uT*3.)*.5+.5;
          float a=(0.10+s*0.12)*(1.0-abs(vUv.x-0.5)*0.4);
          gl_FragColor=vec4(0.35,0.95,0.8,a);
        }`,
    });
    let span=w,axisRot=0;
    if(d>w){span=d;axisRot=Math.PI/2;}
    const m=new THREE.Mesh(new THREE.PlaneGeometry(span,h),this.mat);
    m.position.set(cx,cy,cz);
    if(axisRot)m.rotation.y=axisRot;
    scene.add(m);
    this.mesh=m;
  }
  update(dt,player,portals,cubes){
    this.mat.uniforms.uT.value+=dt;
    const inside=(p)=>p.x>this.min.x&&p.x<this.max.x&&p.y>this.min.y&&p.y<this.max.y&&p.z>this.min.z&&p.z<this.max.z;
    const pin=inside(player.body.pos);
    if(pin&&!this.inside){
      if(portals.blue.placed||portals.orange.placed){
        portals.blue.clear(true);portals.orange.clear(true);
        portals.updateLink();
        audio.chime(300);
      }
      if(player.held){const h=player.held;player.held=null;h.fizzle(this.fx);}
    }
    this.inside=pin;
  }
}

// ---------------------------------------------------------------- Elevator
export class Elevator {
  constructor(scene,pos,yawDeg,onEnter,mats){
    this.triggered=false;this.onEnter=onEnter;
    this.pos=pos.clone();
    const g=new THREE.Group();g.position.copy(pos);g.rotation.y=yawDeg*Math.PI/180;
    const R=1.35,H=3.2;
    const back=new THREE.Mesh(new THREE.CylinderGeometry(R,R,H,24,1,true,Math.PI*0.25,Math.PI*0.5),
      new THREE.MeshStandardMaterial({color:0x39424b,roughness:.5,metalness:.7,side:THREE.DoubleSide}));
    back.position.y=H/2;
    const floorRing=new THREE.Mesh(new THREE.RingGeometry(0.7,R*0.96,32),
      new THREE.MeshBasicMaterial({color:0x57e6c8,transparent:true,opacity:.5,side:THREE.DoubleSide}));
    floorRing.rotation.x=-Math.PI/2;floorRing.position.y=0.03;
    this.ring=floorRing;
    const lamp=new THREE.PointLight(0x57e6c8,10,6,1.6);lamp.position.y=2.6;
    g.add(back,floorRing,lamp);
    scene.add(g);
    this.group=g;
  }
  setTriggerBox(min,max){this.tbMin=min.clone();this.tbMax=max.clone();}
  update(dt,player){
    this.ring.material.opacity=.35+.25*Math.sin(performance.now()*.004);
    if(this.triggered||!this.tbMin)return false;
    const p=player.body.pos;
    if(p.x>this.tbMin.x&&p.x<this.tbMax.x&&p.y>this.tbMin.y&&p.y<this.tbMax.y&&p.z>this.tbMin.z&&p.z<this.tbMax.z){
      this.triggered=true;audio.ding();
      return true;
    }
    return false;
  }
}
