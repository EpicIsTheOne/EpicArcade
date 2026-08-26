import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp } from './utils.js';
import { audio } from './audio.js';

const _v1=new THREE.Vector3(),_v2=new THREE.Vector3(),_v3=new THREE.Vector3();
const _m1=new THREE.Matrix4(),_m2=new THREE.Matrix4();
const _q1=new THREE.Quaternion();
const ROT_Y_PI=new THREE.Matrix4().makeRotationY(Math.PI);
const _plane=new THREE.Plane();
const _frustum=new THREE.Frustum();

function quadShader(colorHex){
  return new THREE.ShaderMaterial({
    uniforms:{
      uMap:{value:null},
      uRes:{value:new THREE.Vector2(1920,1080)},
      uLinked:{value:0},
      uOpen:{value:1},
      uTime:{value:0},
      uColor:{value:new THREE.Color(colorHex)},
    },
    vertexShader:`
      varying vec2 vUv;
      void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`
      uniform sampler2D uMap; uniform vec2 uRes;
      uniform float uLinked,uOpen,uTime; uniform vec3 uColor;
      varying vec2 vUv;
      void main(){
        vec2 c=vUv-0.5; float r=length(c)*2.0/max(uOpen,0.0001);
        if(r>1.0) discard;
        vec2 suv=gl_FragCoord.xy/uRes;
        vec3 col;
        if(uLinked>0.5){
          vec3 tc=texture2D(uMap,suv).rgb;
          col=mix(tc,uColor,smoothstep(0.84,1.0,r)*0.8);
          col+=uColor*0.16*smoothstep(0.66,1.0,r)*(0.5+0.5*sin(uTime*3.0+r*22.0));
          col*=mix(0.35,1.0,smoothstep(1.0,0.72,r)); // dark vignette as opening grows
          col=mix(uColor*0.25,col,smoothstep(1.0,0.92,r));
        }else{
          float ang=atan(c.y,c.x);
          float sw=ang*2.0+uTime*2.2-r*8.0;
          float n=sin(sw)*0.5+0.5;
          n*=sin(r*10.0-uTime*4.6)*0.5+0.5;
          col=mix(uColor*0.04,uColor*(0.42+0.5*n),smoothstep(0.12,1.0,r));
          col+=uColor*pow(max(1.0-r,0.0),2.2)*0.75;
        }
        gl_FragColor=vec4(col,1.0);
      }`,
  });
}

export class Portal {
  constructor(system,colorHex,name){
    this.sys=system;
    this.name=name;                 // 'blue'|'orange'
    this.colorHex=colorHex;
    this.group=new THREE.Group();
    this.group.visible=false;

    const geo=new THREE.CircleGeometry(1,44);
    this.mat=quadShader(colorHex);
    this.quad=new THREE.Mesh(geo,this.mat);
    this.quad.scale.set(CFG.PORTAL_W/2,CFG.PORTAL_H/2,1);
    this.quad.renderOrder=5;
    this.group.add(this.quad);

    const ringGeo=new THREE.RingGeometry(0.99,1.07,52);
    this.ringMat=new THREE.MeshBasicMaterial({
      color:colorHex,transparent:true,opacity:.9,
      blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false,
    });
    this.ring=new THREE.Mesh(ringGeo,this.ringMat);
    this.ring.scale.set(CFG.PORTAL_W/2,CFG.PORTAL_H/2,1);
    this.ring.renderOrder=6;
    this.group.add(this.ring);

    this.placed=false;
    this.openT=1;
    this.n=new THREE.Vector3(); this.up=new THREE.Vector3(); this.right=new THREE.Vector3();
    this.center=new THREE.Vector3();
    this.basis=new THREE.Matrix4();
    this.surface=null;
    this.suppressIds=[];
    this.other=null;
    this.rt=null;
    this.rtSize=new THREE.Vector2(2,2);
    this._visible=true;
    this.spawnFx=0;
  }

  ensureRT(w,h){
    w=Math.max(2,Math.floor(w)); h=Math.max(2,Math.floor(h));
    if(!this.rt||this.rt.width!==w||this.rt.height!==h){
      if(this.rt)this.rt.dispose();
      this.rt=new THREE.WebGLRenderTarget(w,h,{
        minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
        type:THREE.UnsignedByteType,
      });
      this.mat.uniforms.uMap.value=this.rt.texture;
      this.rtSize.set(w,h);
    }
  }

  place(center,n,up,surface,suppressIds){
    this.center.copy(center);
    this.n.copy(n); this.up.copy(up);
    this.right.crossVectors(up,n).normalize();
    this.basis.makeBasis(this.right,this.up,this.n);
    this.group.position.copy(center).addScaledVector(n,0.025);
    _q1.setFromRotationMatrix(this.basis);
    this.group.quaternion.copy(_q1);
    this.group.visible=true;
    this.placed=true;
    this.surface=surface;
    this.suppressIds=suppressIds||[];
    this.openT=0;
    audio.shoot(this.name==='blue');
    this.sys.fx.burst(_v1.copy(center).addScaledVector(n,.15),14,null,2.6,.5);
  }

  clear(fizzle){
    if(!this.placed)return;
    this.placed=false;
    this.group.visible=false;
    if(fizzle){
      audio.fizzleItem();
      this.sys.fx.burst(_v1.copy(this.center).addScaledVector(this.n,.2),16,null,3,.6);
    }
  }

  dispose(){
    this.quad.geometry.dispose(); this.mat.dispose();
    this.ring.geometry.dispose(); this.ringMat.dispose();
    if(this.rt)this.rt.dispose();
  }
}

export class PortalSystem {
  constructor(scene,camera,renderer,fx){
    this.scene=scene;this.camera=camera;this.renderer=renderer;this.fx=fx;
    this.blue=new Portal(this,0x3fc1ff,'blue');
    this.orange=new Portal(this,0xff9a3c,'orange');
    this.blue.other=this.orange; this.orange.other=this.blue;
    this.scene.add(this.blue.group,this.orange.group);
    this.occluders=[];       // meshes for shot raycast
    this.panels=[];          // {mesh, rect:{center,right,up,w,h}, suppressIds}
    this.linked=false;
    this.time=0;
    this.virtCam=new THREE.PerspectiveCamera();
    this.enabled=true;
    this.lastShotMiss=0;
    this._raycaster=new THREE.Raycaster();
  }

  reset(){
    this.blue.clear(false); this.orange.clear(false);
    this.updateLink();
  }

  updateLink(){ this.linked=this.blue.placed&&this.orange.placed; }

  setPanels(p){ this.panels=p; }

  shoot(which,origin,dir){
    if(!this.enabled)return;
    const rc=this._raycaster;
    rc.set(origin,dir); rc.far=CFG.PORTAL_REACH;
    const targets=this.occluders;
    const hits=rc.intersectObjects(targets,false);
    if(!hits.length){ audio.deny(); return; }
    const hit=hits[0];
    const pd=this.panels.find(p=>p.mesh===hit.object);
    if(!pd){ // non-portalable surface
      audio.deny();
      this.fx.burst(hit.point,8,null,1.8,.4);
      return;
    }
    const P=which==='blue'?this.blue:this.orange;
    const other=P.other;
    const {rect}=pd;
    const n=_v1.copy(rect.n);
    // local coords of hit point
    _v2.copy(hit.point).sub(rect.center);
    const lx=_v2.dot(rect.right), ly=_v2.dot(rect.up);
    const hw=CFG.PORTAL_W/2+0.10, hh=CFG.PORTAL_H/2+0.10;
    const cx=clamp(lx,-(rect.w/2-hw),rect.w/2-hw);
    const cy=clamp(ly,-(rect.h/2-hh),rect.h/2-hh);
    if(cx!==cx||cy!==cy||(rect.w<hw*2)||(rect.h<hh*2)){ audio.deny(); return; }
    const center=new THREE.Vector3().copy(rect.center)
      .addScaledVector(rect.right,cx).addScaledVector(rect.up,cy);

    // separation from other portal
    if(other.placed){
      const d=center.distanceTo(other.center);
      const samePlane=Math.abs(n.dot(other.n))>0.9&&Math.abs(_v3.copy(center).sub(other.center).dot(n))<0.4;
      const minSep=samePlane?(CFG.PORTAL_W/2+CFG.PORTAL_W/2+0.22):1.35;
      if(d<minSep){ audio.deny(); this.fx.burst(hit.point,8,null,1.6,.4); return; }
    }
    // don't allow placing where player stands (floor portals under feet are OK actually — skip check)

    P.place(center,n,rect.up,pd,pd.suppressIds);
    this.updateLink();
    if(this.linked){ /* both live */ }
  }

  // ---- traversal -----------------------------------------------------------
  static transformPoint(A,B,p,out){
    _m1.copy(A.basis).invert();
    out.copy(p).applyMatrix4(_m1);
    out.applyMatrix4(ROT_Y_PI);
    out.applyMatrix4(B.basis);
    return out;
  }
  static rotationQuat(A,B,out){
    _m1.copy(A.basis).invert();
    _m2.copy(B.basis).multiply(ROT_Y_PI).multiply(_m1);
    return out.setFromRotationMatrix(_m2);
  }

  _tryTraverse(portal,body,prevPos,player){
    _v1.copy(prevPos).sub(portal.center);
    const sdPrev=_v1.dot(portal.n);
    _v2.copy(body.pos).sub(portal.center);
    const sdNow=_v2.dot(portal.n);
    if(sdPrev<=0||sdNow>0)return false;
    if(body.vel.dot(portal.n)>-0.001)return false;
    // lateral bounds
    const lx=_v2.dot(portal.right), ly=_v2.dot(portal.up);
    const a=CFG.PORTAL_W/2,b=CFG.PORTAL_H/2;
    if((lx*lx)/(a*a)+(ly*ly)/(b*b)>1.25)return false;

    const O=portal.other;
    const newPos=PortalSystem.transformPoint(portal,O,body.pos,new THREE.Vector3());
    const qRot=PortalSystem.rotationQuat(portal,O,_q1.clone());
    // push out along exit normal so we start on the positive side
    newPos.addScaledVector(O.n,0.06);
    // keep some clearance laterally (avoid popping into wall edges)
    body.pos.copy(newPos);
    body.vel.applyQuaternion(qRot);
    if(player&&body===player.body){
      // recompute yaw/pitch from transformed forward
      const f=player.forward(_v3).applyQuaternion(qRot);
      if(Math.abs(f.y)>0.999){
        // came out of/into a vertical-looking direction: derive yaw from old horizontal facing
        _v3.set(-Math.sin(player.yaw),0,-Math.cos(player.yaw)).applyQuaternion(qRot);
        f.copy(_v3);
      }
      player.pitch=Math.asin(clamp(f.y,-1,1));
      player.yaw=Math.atan2(-f.x,-f.z);
      // carry held cube through with us
      if(player.held){
        const hb=player.held.body;
        PortalSystem.transformPoint(portal,O,hb.pos,hb.pos);
        hb.pos.addScaledVector(O.n,0.06);
        hb.vel.applyQuaternion(qRot);
        player.held.mesh.quaternion.premultiply(qRot);
      }
    }else{
      if(body.entity)body.entity.mesh.quaternion.premultiply(qRot);
    }
    audio.whoosh(1);
    this.fx.burst(newPos,10,null,2,.45);
    return true;
  }

  onBodyMoved(body,entity,player){
    if(!this.linked)return;
    for(const P of [this.blue,this.orange]){
      if(this._tryTraverse(P,body,body.prevPos,player))break;
    }
  }

  updateSuppression(body){
    body.suppress.clear();
    if(!this.blue.placed&&!this.orange.placed)return;
    for(const P of [this.blue,this.orange]){
      if(!P.placed)continue;
      _v1.copy(body.pos).sub(P.center);
      const dn=_v1.dot(P.n);
      if(dn<-0.5||dn>1.1)continue;
      const lx=_v1.dot(P.right),ly=_v1.dot(P.up);
      if(Math.abs(lx)<CFG.PORTAL_W/2+0.5&&Math.abs(ly)<CFG.PORTAL_H/2+0.5){
        for(const id of P.suppressIds)body.suppress.add(id);
      }
    }
  }

  // ---- rendering -----------------------------------------------------------
  _applyOblique(cam,normal,point){
    _plane.setFromNormalAndCoplanarPoint(normal,point);
    _plane.applyMatrix4(cam.matrixWorldInverse);
    const clip=_plane.normal, cw=-_plane.constant;
    const pm=cam.projectionMatrix, e=pm.elements;
    const qx=(Math.sign(clip.x)+e[8])/e[0];
    const qy=(Math.sign(clip.y)+e[9])/e[5];
    const qz=-1;
    const qw=(1+e[10])/e[14];
    const d=2/(clip.x*qx+clip.y*qy+clip.z*qz+cw*qw);
    e[2]=clip.x*d; e[6]=clip.y*d; e[10]=clip.z*d+1; e[14]=cw*d;
  }

  renderPortals(hideList){
    if(!this.enabled)return;
    const renderer=this.renderer,cam=this.camera;
    const size=renderer.getDrawingBufferSize(_v2s());
    const q=settings_rtScale();
    const rw=size.x*q, rh=size.y*q;
    this.blue.ensureRT(rw,rh);
    this.orange.ensureRT(rw,rh);

    for(const P of [this.blue,this.orange]){
      P.mat.uniforms.uTime.value=this.time;
      P.ringMat.opacity=P.placed?(0.65+0.3*Math.sin(this.time*3.2))*P.openT:0;
    }
    if(!this.linked)return;

    _frustum.setFromProjectionMatrix(_m1.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse));

    const wasVisible=[this.blue._visible,this.orange._visible];
    for(const P of [this.blue,this.orange]){
      const sph=_sph();
      sph.set(P.center.x,P.center.y,P.center.z);
      sph.radius=Math.max(CFG.PORTAL_W,CFG.PORTAL_H);
      P._visible=_frustum.intersectsSphere(sph)&&cam.position.distanceToSquared(P.center)<80*80;
      if(!P._visible)continue;

      const O=P.other;
      // virtual camera = O.basis * Rot * inv(P.basis) * cam.matrixWorld
      _m1.copy(P.basis).invert();
      _m2.copy(O.basis).multiply(ROT_Y_PI).multiply(_m1);
      const vc=this.virtCam;
      vc.fov=cam.fov;vc.aspect=cam.aspect;vc.near=cam.near;vc.far=cam.far;
      vc.matrixWorld.multiplyMatrices(_m2,cam.matrixWorld);
      vc.matrixWorld.decompose(vc.position,vc.quaternion,_v3s());
      vc.projectionMatrix.copy(cam.projectionMatrix);
      vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
      this._applyOblique(vc,O.n,_v1.copy(O.center).addScaledVector(O.n,0.012));

      // feed back previous textures for bounded recursion look
      P.mat.uniforms.uRes.value.set(P.rt.width,P.rt.height);
      O.mat.uniforms.uRes.value.set(O.rt.width,O.rt.height);
      const hidden=hideList?hideList.map(h=>{const v=h.visible;h.visible=false;return [h,v];}):null;
      const prevTarget=renderer.getRenderTarget();
      renderer.setRenderTarget(P.rt);
      renderer.clear();
      renderer.render(this.scene,vc);
      renderer.setRenderTarget(prevTarget);
      if(hidden)for(const [h,v] of hidden)h.visible=v;
    }
    // restore screen-space resolution uniforms
    for(const P of [this.blue,this.orange]){
      P.mat.uniforms.uRes.value.set(size.x,size.y);
    }
  }

  update(dt){
    this.time+=dt;
    for(const P of [this.blue,this.orange]){
      if(P.placed&&P.openT<1){ P.openT=Math.min(1,P.openT+dt*4); }
      const s=P.openT<1?easeOutBack(P.openT):1;
      P.quad.scale.set(CFG.PORTAL_W/2*s,CFG.PORTAL_H/2*s,1);
      P.ring.scale.copy(P.quad.scale).multiplyScalar(1.02);
      P.mat.uniforms.uLinked.value=this.linked?1:0;
    }
  }

  dispose(){
    this.blue.dispose();this.orange.dispose();
    this.scene.remove(this.blue.group,this.orange.group);
  }
}

// tiny scratch helpers
const _tmpV2=new THREE.Vector2(),_tmpV3=new THREE.Vector3(),_tmpSph=new THREE.Sphere();
function _v2s(){return _tmpV2;}
function _v3s(){return _tmpV3;}
function _sph(){return _tmpSph;}
function settings_rtScale(){
  return window.__QUALITY__?.portalRTScale ?? CFG.RT_SCALE.ultra;
}
function easeOutBack(t){
  const s=1.70158;t=t-1;
  return t*t*((s+1)*t+s)+1;
}
