import * as THREE from 'three';
import { Collider } from './physics.js';
import { getMaterials, chamberSignTexture, posterTexture, terminalTexture } from './utils.js';

const NORMS = {
  px:new THREE.Vector3(1,0,0), nx:new THREE.Vector3(-1,0,0),
  py:new THREE.Vector3(0,1,0), ny:new THREE.Vector3(0,-1,0),
  pz:new THREE.Vector3(0,0,1), nz:new THREE.Vector3(0,0,-1),
};
const UP=new THREE.Vector3(0,1,0);

// Level construction DSL. Everything static goes through here so meshes,
// colliders and portal-occluder lists stay in sync.
export class WorldBuilder {
  constructor(scene,portalSystem){
    this.scene=scene;
    this.ps=portalSystem;
    this.mats=getMaterials();
    scene.userData.mats=this.mats;
    this.colliders=[];
    this.terminals=[];
    this.group=new THREE.Group();
    scene.add(this.group);
  }

  _registerMesh(mesh,collide=true,tag='world'){
    this.group.add(mesh);
    let col=null;
    if(collide){
      mesh.updateWorldMatrix(true,false);
      const bb=new THREE.Box3().setFromObject(mesh);
      col=new Collider(bb.min,bb.max,tag);
      col.mesh=mesh;
      this.colliders.push(col);
      this.ps.occluders.push(mesh);
    }
    return col;
  }

  slab(cx,cy,cz,sx,sy,sz,mat='concrete',opts={}){
    const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),this.mats[mat]||this.mats.concrete);
    m.position.set(cx,cy,cz);
    m.castShadow=opts.shadow??true;
    m.receiveShadow=true;
    if(mat==='panel'){m.castShadow=false;}
    return this._registerMesh(m,opts.collide??true);
  }

  // Wall perpendicular to X axis at x, spanning z0..z1, y0..y1.
  wallX(x,z0,z1,y0,y1,mat='concrete',thick=0.5){
    return this.slab(x,(y0+y1)/2,(z0+z1)/2,thick,y1-y0,z1-z0,mat);
  }
  wallZ(z,x0,x1,y0,y1,mat='concrete',thick=0.5){
    return this.slab((x0+x1)/2,(y0+y1)/2,z,x1-x0,y1-y0,thick,mat);
  }

  // Wall along X (perp to Z) with rectangular holes. holes:[{a,b,y0,y1}] in span coords
  wallZHoled(z,span0,span1,y0,y1,holes=[],mat='concrete',thick=0.5){
    holes=[...holes].sort((h1,h2)=>h1.a-h2.a);
    let cur=span0;
    for(const h of holes){
      if(h.a>cur)this.wallZ(z,cur,h.a,y0,y1,mat,thick);
      if(h.y0>y0)this.wallZ(z,h.a,h.b,y0,h.y0,mat,thick);          // sill
      if(h.y1<y1)this.wallZ(z,h.a,h.b,h.y1,y1,mat,thick);          // header
      cur=h.b;
    }
    if(cur<span1)this.wallZ(z,cur,span1,y0,y1,mat,thick);
  }
  wallXHoled(x,span0,span1,y0,y1,holes=[],mat='concrete',thick=0.5){
    holes=[...holes].sort((h1,h2)=>h1.a-h2.a);
    let cur=span0;
    for(const h of holes){
      if(h.a>cur)this.wallX(x,cur,h.a,y0,y1,mat,thick);
      if(h.y0>y0)this.wallX(x,h.a,h.b,y0,h.y0,mat,thick);
      if(h.y1<y1)this.wallX(x,h.a,h.b,h.y1,y1,mat,thick);
      cur=h.b;
    }
    if(cur<span1)this.wallX(x,cur,span1,y0,y1,mat,thick);
  }

  floorSlab(x0,x1,z0,z1,y,mat='floor'){
    return this.slab((x0+x1)/2,y-0.3,(z0+z1)/2,x1-x0,0.6,z1-z0,mat);
  }
  ceilSlab(x0,x1,z0,z1,y,mat='ceil'){
    return this.slab((x0+x1)/2,y+0.3,(z0+z1)/2,x1-x0,0.6,z1-z0,mat);
  }

  // White portalable panel on a surface. dir: 'px','nx','py'(floor),'nz','pz'
  panel(cx,cy,cz,w,h,dir,upOverride=null){
    const n=NORMS[dir].clone();
    let up=upOverride?upOverride.clone():UP.clone();
    if(Math.abs(n.dot(up))>0.99){ up.set(0,0,dir==='py'?-1:1); }  // floors/ceilings
    up.normalize();
    const right=new THREE.Vector3().crossVectors(up,n).normalize();
    const thick=0.07;
    const m=new THREE.Mesh(new THREE.BoxGeometry(
      Math.abs(right.x)*w+Math.abs(up.x)*h+Math.abs(n.x)*thick,
      Math.abs(right.y)*w+Math.abs(up.y)*h+Math.abs(n.y)*thick,
      Math.abs(right.z)*w+Math.abs(up.z)*h+Math.abs(n.z)*thick
    ),this.mats.panel);
    m.position.copy(new THREE.Vector3(cx,cy,cz)).addScaledVector(n,thick/2);
    m.receiveShadow=true;
    this.group.add(m);

    // collider (thin box aligned via bounding box of oriented geometry is wrong for rotated,
    // but panels are axis-aligned here since dirs are cardinal)
    m.updateWorldMatrix(true,false);
    const bb=new THREE.Box3().setFromObject(m);
    const col=new Collider(bb.min,bb.max,'panel');
    col.mesh=m;
    this.colliders.push(col);
    this.ps.occluders.push(m);

    // host = collider just behind the panel
    const probe=bb.getCenter(new THREE.Vector3()).addScaledVector(n,-thick);
    let hostId=null;
    for(const c of this.colliders){
      if(c===col||c.tag==='panel')continue;
      if(probe.x>c.min.x&&probe.x<c.max.x&&probe.y>c.min.y&&probe.y<c.max.y&&probe.z>c.min.z&&probe.z<c.max.z){
        hostId=c.id;break;
      }
    }
    const rec={
      mesh:m,
      rect:{center:new THREE.Vector3(cx,cy,cz),n,up,right,w,h},
      suppressIds:hostId?[col.id,hostId]:[col.id],
    };
    this.ps.panels.push(rec);
    return rec;
  }

  lightStrip(cx,cy,cz,len,axis='x',color=0xdfe8ee,intensity=2.6,withGlow=true){
    const geo=axis==='x'?new THREE.BoxGeometry(len,0.09,0.32):
              axis==='z'?new THREE.BoxGeometry(0.32,0.09,len):
              new THREE.BoxGeometry(0.32,len,0.32);
    const mat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:color,emissiveIntensity:intensity});
    const m=new THREE.Mesh(geo,mat);
    m.position.set(cx,cy,cz);
    this.group.add(m);
    if(withGlow){
      const l=new THREE.PointLight(color,len*2.2+8,Math.max(len*1.6,9),1.9);
      l.position.set(cx,cy-(axis==='y'?0.4:0.55),cz);
      this.group.add(l);
    }
    return m;
  }

  accentLight(x,y,z,color,intensity,dist){ 
    const l=new THREE.PointLight(color,intensity,dist,1.8);
    l.position.set(x,y,z);
    this.group.add(l);
    return l;
  }

  signPlane(tex,w,h,pos,dir='pz'){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshBasicMaterial({map:tex,toneMapped:true}));
    const n=NORMS[dir];
    m.position.copy(pos);
    m.lookAt(pos.clone().add(n));
    this.group.add(m);
    this.ps.occluders.push(m); // cheap occluder for shots (non-portalable anyway)
    return m;
  }

  chamberSign(num,name,pos,dir,icon=null){
    return this.signPlane(chamberSignTexture(num,name,icon),1.15,1.44,pos,dir);
  }
  poster(title,lines,pos,dir,accent='#57e6c8'){
    return this.signPlane(posterTexture(title,lines,accent),1.25,1.75,pos,dir);
  }
  terminal(pos,dir,messages,accent='#57e6c8'){
    const t=terminalTexture(messages[0],accent);
    const m=this.signPlane(t,1.05,0.79,pos,dir);
    const term={mesh:m,tex:t,messages,idx:0,timer:0};
    this.terminals.push(term);
    // housing
    this.slab(pos.x,pos.y,pos.z+(dir==='pz'?-0.12:dir==='nz'?0.12:0),
      dir==='px'||dir==='nx'?0.14:1.15, 0.88, dir==='pz'||dir==='nz'?0.14:1.15,'metal',{collide:false});
    return term;
  }

  colliderOnly(min,max,tag='door'){
    const col=new Collider(min,max,tag);
    this.colliders.push(col);
    return col;
  }

  finish(){
    // dispose-safe removal entry
    return {
      group:this.group,
      colliders:this.colliders,
      terminals:this.terminals,
    };
  }
}

export function updateTerminals(terminals,dt){
  for(const t of terminals){
    t.timer+=dt;
    if(t.timer>7){
      t.timer=0;
      t.idx=(t.idx+1)%t.messages.length;
      const nt=terminalTexture(t.messages[t.idx]);
      t.mesh.material.map.dispose();
      t.mesh.material.map=nt;t.tex=nt;
    }
  }
}
