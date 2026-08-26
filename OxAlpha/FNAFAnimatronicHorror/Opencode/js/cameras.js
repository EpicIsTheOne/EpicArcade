import * as THREE from 'three';
import {ROOMS,CAM_ORDER} from './scene.js';

const FEED_VERT=`
varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}
`;
const FEED_FRAG=`
precision highp float;
uniform sampler2D tDiffuse;
uniform float uTime,uMode,uNoise,uAber,uGlitch,uVig;
uniform vec2 uRes;
uniform vec3 uTint;
varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 uv=vUv;
  vec2 c=uv-.5;
  float r2=dot(c,c);
  uv=.5+c*(1.0+(uMode>.5?0.07:0.02)*r2*2.0);
  float band=step(0.996,hash(vec2(floor(uv.y*140.0),floor(uTime*31.0))));
  uv.x+=band*uGlitch*(hash(vec2(floor(uTime*47.0),floor(uv.y*40.0)))-0.5)*0.25;
  vec2 off=c*uAber*r2*2.0;
  vec3 col;
  col.r=texture2D(tDiffuse,uv+off).r;
  col.g=texture2D(tDiffuse,uv).g;
  col.b=texture2D(tDiffuse,uv-off).b;
  if(uMode>.5){
    float sl=sin(uv.y*uRes.y*3.14159)*.5+.5;
    col*=.84+.16*sl;
    float ry=fract(uv.y*1.0-uTime*.07);
    float rollB=smoothstep(.0,.04,ry)*smoothstep(.12,.04,ry);
    col*=1.-rollB*.18;
  }
  float n=hash(uv*uRes+vec2(fract(uTime*61.7)*917.3,fract(uTime*41.3)*523.1));
  col=mix(col,vec3(n)*(uMode>.5?.85:.4),clamp(uNoise,0.,1.));
  float v=1.-uVig*pow(r2*2.6,1.2);
  col*=max(v,0.);
  col*=uTint;
  gl_FragColor=vec4(col,1.);
}`;

export class CamSystem{
  constructor(renderer){
    this.renderer=renderer;
    this.active=null;
    this.burstAmt=0;
    this.corrupt=0;
    this.corruptGold=false;
    this.t=0;
    this.audioOnlyActive=false;

    this.rt=new THREE.WebGLRenderTarget(2,2,{depthBuffer:true});
    this.postScene=new THREE.Scene();
    this.postCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
      vertexShader:FEED_VERT,
      fragmentShader:FEED_FRAG,
      uniforms:{
        tDiffuse:{value:this.rt.texture},
        uTime:{value:0},
        uMode:{value:0},
        uNoise:{value:.03},
        uAber:{value:.2},
        uGlitch:{value:0},
        uVig:{value:.28},
        uRes:{value:new THREE.Vector2(1920,1080)},
        uTint:{value:new THREE.Vector3(1,1,1)}
      },
      depthTest:false,depthWrite:false
    }));
    this.quad=quad;
    this.u=quad.material.uniforms;
    this.postScene.add(quad);

    this.feeds=[];
    for(const id of CAM_ORDER){
      const def=ROOMS[id];
      if(!def.cam)continue;
      const cam=new THREE.PerspectiveCamera(64,1.6,.1,60);
      cam.position.set(...def.cam);
      cam.lookAt(new THREE.Vector3(...def.look));
      this.feeds.push({id,def,cam});
    }
    const voidDef=ROOMS.VOID;
    this.voidCam=new THREE.PerspectiveCamera(70,1.6,.1,60);
    this.voidCam.position.set(...voidDef.cam);
    this.voidCam.lookAt(new THREE.Vector3(...voidDef.look));
  }
  resize(w,h,pr){
    const rw=Math.max(2,Math.floor(w*pr*.72));
    const rh=Math.max(2,Math.floor(h*pr*.72));
    this.rt.setSize(rw,rh);
    this.u.uRes.value.set(w*pr,h*pr);
    const aspect=w/h;
    this.feeds.forEach(f=>{f.cam.aspect=aspect;f.cam.updateProjectionMatrix();});
    this.voidCam.aspect=aspect;this.voidCam.updateProjectionMatrix();
  }
  set(id){
    if(this.active===id)return false;
    this.active=id;
    this.burst(Math.max(this.burstAmt,.85));
    return true;
  }
  cycle(dir,list){
    if(!this.feeds.length)return;
    let idx=this.feeds.findIndex(f=>f.id===this.active);
    idx=(idx+dir+this.feeds.length)%this.feeds.length;
    this.set(this.feeds[idx].id);
  }
  burst(a=1){this.burstAmt=Math.min(1,this.burstAmt+a);}
  setCorrupt(level,gold=false){this.corrupt=level;this.corruptGold=gold;}
  update(dt){
    this.t+=dt;
    this.burstAmt=Math.max(0,this.burstAmt-dt*2.2);
  }
  _compose(renderer,scene,viewCam,mode){
    const target=viewCam?this.rt:null;
    if(target){
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene,viewCam);
      renderer.setRenderTarget(null);
    }else{
      renderer.setRenderTarget(null);
    }
    const u=this.u;
    u.tDiffuse.value=target?target.texture:this._blackTex();
    u.uTime.value=this.t;
    u.uMode.value=mode;
    if(mode>.5){
      const noiseBase=.06+this.burstAmt*.94+this.corrupt*.35+(this.corrupt>0?(Math.sin(this.t*17)>0?.12:0):0);
      u.uNoise.value=noiseBase;
      u.uAber.value=.6+this.corrupt*2.2;
      u.uGlitch.value=this.burstAmt*.8+this.corrupt*.9;
      u.uVig.value=.5;
      if(this.corruptGold&&this.corrupt>0){
        u.uTint.value.set(1.05,.92,.62);
      }else{
        u.uTint.value.set(.78,.92,.83);
      }
    }else{
      u.uNoise.value=.028+this.burstAmt*.2;
      u.uAber.value=.15;
      u.uGlitch.value=this.burstAmt*.3;
      u.uVig.value=.32;
      u.uTint.value.set(1,.985,.97);
    }
    renderer.render(this.postScene,this.postCam);
  }
  _blackTex(){
    if(!this.__blk){
      const c=document.createElement('canvas');c.width=c.height=4;
      const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,4,4);
      this.__blk=new THREE.CanvasTexture(c);
    }
    return this.__blk;
  }
  currentFeed(){
    if(!this.active)return null;
    return this.feeds.find(f=>f.id===this.active)||null;
  }
  renderCurrent(renderer,scene,voidVisible){
    this.audioOnlyActive=false;
    if(!this.active){
      this._compose(renderer,scene,null,1);
      return;
    }
    if(this.active==='VOID'){
      if(!voidVisible){
        this.audioOnlyActive=true;
        this._compose(renderer,scene,null,1);
        return;
      }
      this._compose(renderer,scene,this.voidCam,1);
      return;
    }
    const f=this.currentFeed();
    if(!f){
      this.audioOnlyActive=true;
      this._compose(renderer,scene,null,1);
      return;
    }
    if(f.def.audioOnly){
      this.audioOnlyActive=true;
      this._compose(renderer,scene,null,1);
      return;
    }
    this._compose(renderer,scene,f.cam,1);
  }
  renderOffice(renderer,scene,officeCam){
    this.audioOnlyActive=false;
    this._compose(renderer,scene,officeCam,0);
  }
}
