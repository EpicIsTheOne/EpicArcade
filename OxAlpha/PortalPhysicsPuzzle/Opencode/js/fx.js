import * as THREE from 'three';
import { rand } from './utils.js';

// Pooled particle bursts + transient decals. Bounded, no per-frame allocs.
const MAX_P = 512;

export class FX {
  constructor(scene){
    this.scene=scene;
    const g=new THREE.BufferGeometry();
    this.positions=new Float32Array(MAX_P*3);
    this.velocities=new Float32Array(MAX_P*3);
    this.life=new Float32Array(MAX_P);       // remaining
    this.maxLife=new Float32Array(MAX_P);
    g.setAttribute('position',new THREE.BufferAttribute(this.positions,3));
    g.setAttribute('aLife',new THREE.BufferAttribute(new Float32Array(MAX_P),1));
    g.setAttribute('aSeed',new THREE.BufferAttribute(new Float32Array(MAX_P),1));
    for(let i=0;i<MAX_P;i++){this.life[i]=0;g.attributes.aSeed.setX(i,Math.random());}
    this.mat=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{},
      vertexShader:`
        attribute float aLife; attribute float aSeed;
        varying float vL; varying float vS;
        void main(){ vL=aLife; vS=aSeed;
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=(2.0+aSeed*5.0)*max(vL,0.0)*(220.0/-mv.z);
          gl_Position=projectionMatrix*mv; }`,
      fragmentShader:`
        varying float vL; varying float vS;
        void main(){
          if(vL<=0.0)discard;
          vec2 c=gl_PointCoord-0.5;
          float d=length(c); if(d>0.5)discard;
          float a=smoothstep(0.5,0.0,d)*vL;
          vec3 col=mix(vec3(0.35,0.9,1.0),vec3(1.0,0.65,0.3),vS);
          gl_FragColor=vec4(col*a,a); }`
    });
    this.points=new THREE.Points(g,this.mat);
    this.points.frustumCulled=false;
    scene.add(this.points);
    this.cursor=0;
  }

  burst(pos,count,color=null,speed=2.2,life=.6){
    for(let i=0;i<count;i++){
      const idx=this.cursor; this.cursor=(this.cursor+1)%MAX_P;
      this.positions[idx*3]=pos.x; this.positions[idx*3+1]=pos.y; this.positions[idx*3+2]=pos.z;
      const th=rand(0,Math.PI*2), ph=Math.acos(rand(-1,1)), s=speed*rand(.3,1);
      this.velocities[idx*3]=Math.sin(ph)*Math.cos(th)*s;
      this.velocities[idx*3+1]=Math.cos(ph)*s+speed*.4;
      this.velocities[idx*3+2]=Math.sin(ph)*Math.sin(th)*s;
      this.life[idx]=life*rand(.6,1); this.maxLife[idx]=this.life[idx];
    }
  }

  update(dt){
    let any=false;
    for(let i=0;i<MAX_P;i++){
      if(this.life[i]<=0)continue;
      any=true;
      this.life[i]-=dt;
      this.velocities[i*3+1]-=6*dt;
      this.positions[i*3]+=this.velocities[i*3]*dt;
      this.positions[i*3+1]+=this.velocities[i*3+1]*dt;
      this.positions[i*3+2]+=this.velocities[i*3+2]*dt;
    }
    if(any||this._dirty){
      this.points.geometry.attributes.position.needsUpdate=true;
      const la=this.points.geometry.attributes.aLife;
      for(let i=0;i<MAX_P;i++)la.setX(i,Math.max(0,this.life[i]/this.maxLife[i]));
      la.needsUpdate=true;
      this._dirty=any;
    }
  }

  dispose(){
    this.scene.remove(this.points);
    this.points.geometry.dispose(); this.mat.dispose();
  }
}
