/* HOLLOW SIGNAL — world builder: shell geometry, doors, lights, props */
(function(){
"use strict";
const HG = window.HG;
const M = HG.M, Maps = HG.Maps, T = HG.Textures;
const CS = Maps.CS, GW = Maps.GW, GH = Maps.GH;
const WH = 3.4;          // wall height
const LOWER_Y = -6.0;    // lower floor elevation

/* ---------- geometry merge helper ---------- */
class GB {
  constructor(){ this.p=[]; this.n=[]; this.u=[]; this.i=[]; this.v=0; }
  quad(a,b,c,d, nx,ny,nz, uvs){ // corners CCW viewed from front
    const P=this.p,N=this.n,U=this.u,I=this.i,V=this.v;
    const pts=[a,b,c,d];
    for(const q of pts){ P.push(q[0],q[1],q[2]); N.push(nx,ny,nz); }
    for(let k=0;k<4;k++){ const uv=uvs[k]; U.push(uv[0],uv[1]); }
    I.push(V,V+1,V+2, V,V+2,V+3);
    this.v+=4;
  }
  build(mat){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('normal',   new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('uv',       new THREE.Float32BufferAttribute(this.u,2));
    g.setIndex(this.i);
    return new THREE.Mesh(g, mat);
  }
}

/* ---------- prop helpers ---------- */
function mkBox(w,h,d,mat){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  return m;
}

const World = HG.WorldBuilder = {
  build(scene){
    const W = HG.world = {
      scene,
      root:new THREE.Group(),
      doors:{},
      colliders:[[],[]],        // per floor AABBs {x0,z0,x1,z1}
      colHash:[new Map(),new Map()], // spatial hash for prop colliders
      lights:[],                // managed lights {pl, mesh?, base, phase, mode}
      fixtures:[],              // emissive fixture meshes w/ material ref
      flickers:[],
      phases:{pre:true,aux:false,gen:false},
      elev:null,
      containmentCenter:Maps.P.containCenter ? {x:Maps.P.containCenter.x,z:Maps.P.containCenter.z} : null,
      generatorCenter:{x:Maps.P.genCenterW.x,z:Maps.P.genCenterW.z},
      time:0,
    };
    this.mats(W);
    this.shell(W);
    this.doorsAll(W);
    this.lightsAll(W);
    this.propsUpper(W);
    this.propsLower(W);
    this.stairsShaft(W);
    this.elevatorBuild(W);

    scene.add(W.root);
    this.api(W);
    this.applyPhase(W,'pre');
    return W;
  },
  applyPhase(W,name){
    if(name==='pre'){ for(const L of W.lights){ if(L.phase==='pre'){ L.target=L.base; L.on=true; } } return; }
    W.phases[name]=true;
    for(const L of W.lights){
      if(L.phase===name){ L.target=L.base; L.on=true; if(L.lensMat)L.lensMat.color.set(L.color); }
    }
    if(name==='aux'){ W.doors.d_stairs.locked=false;
      W.doors.d_stairs.lampMat.color.setHex(0x2ea043); W.doors.d_stairs.lampMat.emissive.setHex(0x2ea043); }
  },

  /* ================= materials ================= */
  mats(W){
    const std=(o)=>new THREE.MeshStandardMaterial(Object.assign({roughness:.93,metalness:.04},o));
    W.mat={
      wallU: std({map:T.get('wallConcrete')}),
      wallL: std({map:T.get('wallPanel')}),
      floorU:std({map:T.get('floorTile')}),
      floorL:std({map:T.get('floorMetal'), roughness:.7, metalness:.25}),
      ceil:  std({map:T.get('ceil')}),
      ceilL: std({map:T.get('ceil'), color:0x8a9092}),
      door:  std({map:T.get('doorMetal'), roughness:.6, metalness:.45}),
      hazard:std({map:T.get('hazard'), roughness:.8}),
      metal: std({color:0x585e62, roughness:.55, metalness:.55}),
      metalDk:std({color:0x33383c, roughness:.6, metalness:.5}),
      rust:  std({color:0x5c4433, roughness:.95}),
      wood:  std({color:0x6a5638, roughness:.9}),
      woodDk:std({color:0x4a3c28, roughness:.95}),
      fabric:std({color:0x5a4a3c, roughness:1}),
      fabricDk:std({color:0x37413a, roughness:1}),
      glass: new THREE.MeshStandardMaterial({color:0x88919a, roughness:.15, metalness:.6, transparent:true, opacity:.32}),
      tankGlass:new THREE.MeshStandardMaterial({color:0x5a7a5e, roughness:.2, metalness:.3, transparent:true, opacity:.5}),
      fluid: new THREE.MeshStandardMaterial({color:0x2c4030, roughness:.3, emissive:0x1a3320, emissiveIntensity:.35}),
      paper: std({map:T.get('paperSmall'), roughness:1, side:THREE.DoubleSide}),
      screenDead: std({color:0x14181a, roughness:.3, metalness:.4}),
      redLamp: new THREE.MeshStandardMaterial({color:0x35080a, emissive:0xa4242b, emissiveIntensity:1.4}),
      grnLamp: new THREE.MeshStandardMaterial({color:0x0a2a12, emissive:0x2ea043, emissiveIntensity:1.2}),
      offLamp: std({color:0x22262a, roughness:.4}),
      pipe:   std({color:0x6b6f70, roughness:.5, metalness:.5}),
      pipeRust:std({color:0x6b503a, roughness:.85, metalness:.2}),
    };
    // decals: papers & stains merged per floor
    W.decalMatPaper=new THREE.MeshStandardMaterial({map:T.get('paperSmall'),roughness:1,transparent:true,alphaTest:.35,side:THREE.DoubleSide});
  },

  /* ================= shell ================= */
  shell(W){
    for(let f=0; f<2; f++){
      const yOff = f===0?0:LOWER_Y;
      const gb={wallU:new GB(), wallL:f===0?null:new GB(), floor:new GB(), ceil:new GB()};
      for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
        if(!Maps.isFloorCell(f,x,y)) continue;
        const x0=x*CS,x1=x0+CS,z0=y*CS,z1=z0+CS;
        const yt=yOff, yb=yOff-WH;
        // skip floor/ceiling under stair shafts (holes)
        const hole=this.isStairHole(f,x,y);
        if(!hole){
          // floor: +y facing
          gb.floor.quad([x0,yt,z0],[x0,yt,z1],[x1,yt,z1],[x1,yt,z0], 0,1,0,
            [[x0/CS,z0/CS],[x0/CS,z1/CS],[x1/CS,z1/CS],[x1/CS,z0/CS]]);
          // ceiling: -y facing
          gb.ceil.quad([x0,yt,z0],[x1,yt,z0],[x1,yt,z1],[x0,yt,z1], 0,-1,0,
            [[x0/CS,-z0/CS],[x1/CS,-z0/CS],[x1/CS,-z1/CS],[x0/CS,-z1/CS]]);
        }
        // walls where neighbor is solid
        const wallMat=f===0?gb.wallU:gb.wallL;
        const uvW=(u0,v0,u1,v1)=>[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
        if(Maps.solidCell(f,x,y-1)){ // north face (looks south, +z normal)
          wallMat.quad([x0,yb,z0],[x1,yb,z0],[x1,yt,z0],[x0,yt,z0], 0,0,1, uvW(0,0,1,WH/CS));
        }
        if(Maps.solidCell(f,x,y+1)){
          wallMat.quad([x1,yb,z1],[x0,yb,z1],[x0,yt,z1],[x1,yt,z1], 0,0,-1, uvW(0,0,1,WH/CS));
        }
        if(Maps.solidCell(f,x-1,y)){
          wallMat.quad([x0,yb,z1],[x0,yb,z0],[x0,yt,z0],[x0,yt,z1], 1,0,0, uvW(0,0,1,WH/CS));
        }
        if(Maps.solidCell(f,x+1,y)){
          wallMat.quad([x1,yb,z0],[x1,yb,z1],[x1,yt,z1],[x1,yt,z0], -1,0,0, uvW(0,0,1,WH/CS));
        }
      }
      const grp=new THREE.Group();
      if(gb.wallU&&gb.wallU.v){ const msh=gb.wallU.build(W.mat.wallU); grp.add(msh); }
      if(gb.wallL&&gb.wallL.v){ const msh=gb.wallL.build(W.mat.wallL); grp.add(msh); }
      grp.add(gb.floor.build(f===0?W.mat.floorU:W.mat.floorL));
      grp.add(gb.ceil.build(f===0?W.mat.ceil:W.mat.ceilL));
      grp.position.y=yOff-yOff; // geometry already absolute
      W.root.add(grp);
    }
  },
  isStairHole(f,x,y){
    // stair shaft hole: row 0 at cols 15..16 on both floors
    return (x>=15&&x<=16&&y===0);
  },

  /* ================= doors ================= */
  doorsAll(W){
    const defs=[
      {id:'d_break',   f:0, cells:[[7,6]]},
      {id:'d_security',f:0, cells:[[36,6]]},
      {id:'d_stairs',  f:0, cells:[[15,6],[16,6]], lockedUntilPower:true, wide:true},
      {id:'d_contain', f:1, cells:[[36,9],[37,9]], sealed:true, wide:true},
    ];
    for(const d of defs){
      const [c0,r0]=d.cells[0], [c1,r1]=d.cells[d.cells.length-1];
      const wx=(c0+c1+1)/2*CS, wz=(r0+r1+1)/2*CS;
      const yOff=d.f===0?0:LOWER_Y;
      // orientation: floor north&south => slab spans X
      const ns = Maps.isFloorCell(d.f,c0,r0-1)&&Maps.isFloorCell(d.f,c0,r0+1);
      const spanX = ns;
      const wCells=d.cells.length;
      const width=wCells*CS-.06, thick=.18, h=WH-.25;
      const grp=new THREE.Group();
      const slab=mkBox(width,h,thick,W.mat.door);
      slab.position.y=h/2+yOff;
      // hazard strip on slab bottom
      const hz=mkBox(width,.42,thick+.02,W.mat.hazard); hz.position.y=.21; slab.add(hz);
      grp.add(slab);
      // frame posts
      const postMat=W.mat.metalDk;
      for(const s of [-1,1]){
        const px=spanX?(wx+s*(wCells*CS/2+.08)):wx;
        const pz=spanX?wz:(wz+s*(wCells*CS/2+.08));
        const post=mkBox(spanX?.22:.5,WH,.22,postMat);
        if(!spanX){ post.rotation.y=Math.PI/2; }
        post.position.set(px,WH/2+yOff,pz);
        grp.add(post);
      }
      // indicator lamp
      const lampM=d.sealed? W.mat.redLamp.clone() : W.mat.offLamp.clone();
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.3,.12,.06),lampM);
      lamp.position.set(spanX?wx:wx, 2.72+yOff+(spanX?0:0), spanX?wz:wz);
      if(spanX){ lamp.position.x=wx; lamp.position.z=wz-(thick/2+.05); } else { lamp.position.z=wz; lamp.position.x=wx-(thick/2+.05); lamp.rotation.y=Math.PI/2; }
      grp.add(lamp);
      W.root.add(grp);

      const door={
        id:d.id,f:d.f,cells:d.cells,spanX,grp,slab,lamp,lampMat:lampM,
        openT:0, opening:false, open:false,
        locked:!!d.lockedUntilPower, sealed:!!d.sealed,
        baseX:wx, baseZ:wz, width, lastNoise:0,
        setOpen(o,silent){
          if(this.sealed||this.open===o) return;
          if(o&&this.locked) return;
          this.opening=o; if(!silent) HG.Audio.play(o?'doorSlide':'doorSlide',{vol:.9});
        },
        forceOpen(){ // threat slams it
          if(this.open||this.sealed) return;
          this.opening=true; this.open=true;
          HG.Audio.playAt&&HG.Audio.playAt('doorSlam',{pos:{x:this.baseX,z:this.baseZ},floor:this.f,vol:1});
        },
        blocks(){ return !this.open || Math.abs(this.openT)<.85; },
        update(dt){
          if(this.opening||this.open){
            this.openT=Math.min(1,this.openT+dt*(this.sealed?0:1.15));
            this.open=this.openT>=1;
          } else {
            this.openT=Math.max(0,this.openT-dt*1.4);
          }
          const slide=this.openT*width*.96;
          if(this.spanX) this.slab.position.x=slide; else this.slab.position.z=slide;
        },
      };
      // auto-close timer
      door.autoCloseT=0;
      Object.defineProperty(door,'updateFull',{value:function(dt){
        this.update(dt);
        if(this.open&&!this.opening){ this.autoCloseT+=dt; if(this.autoCloseT>4.5){ this.autoCloseT=0; this.open=false; this.opening=false; HG.Audio.playAt&&HG.Audio.playAt('doorSlide',{pos:{x:this.baseX,z:this.baseZ},floor:this.f,vol:.5}); } }
        else this.autoCloseT=0;
      }});
      W.doors[d.id]=door;
      W.root.add(grp);
    }
    // containment lamp pulses
    W.containLampMat=W.doors.d_contain.lampMat;
  },

  /* ================= lights ================= */
  addFixture(W,{x,z,f,y=WH-.06,color=0xdfe8dc,intensity=1,phase='aux',mode='steady',dist=13,emissive=true,size=[1.6,.5]}){
    const yOff=f===0?0:LOWER_Y;
    const grp=new THREE.Group();
    const housing=mkBox(size[0]+.14,.09,size[1]+.14,W.mat.metalDk); housing.position.y=-.03; grp.add(housing);
    let lensMat=null;
    if(emissive){
      lensMat=new THREE.MeshBasicMaterial({color:0x111111});
      const lens=new THREE.Mesh(new THREE.BoxGeometry(size[0],.05,size[1]),lensMat);
      lens.position.y=-.075; grp.add(lens);
      W.fixtures.push(lensMat);
    }
    grp.position.set(x,y+yOff,z);
    W.root.add(grp);

    let pl=null;
    if(intensity>0){
      pl=new THREE.PointLight(color,0,dist,2);
      pl.position.set(x,y-.35+yOff,z);
      W.root.add(pl);
    }
    const L={pl,mesh:grp,lensMat,color,base:intensity,target:0,phase,mode,x,z,f,
      seed:M.rand(0,100),on:false};
    W.lights.push(L);
    if(mode==='flicker') W.flickers.push(L);
    return L;
  },
  redLampSmall(W,{x,z,f,y=2.5}){
    const yOff=f===0?0:LOWER_Y;
    const m=new THREE.Mesh(new THREE.BoxGeometry(.22,.12,.1),W.mat.redLamp.clone());
    m.position.set(x,y+yOff,z);
    W.root.add(m);
    const pl=new THREE.PointLight(0xa4202b,.85,7,2);
    pl.position.set(x,y-.2+yOff,z);
    W.root.add(pl);
    W.lights.push({pl,mesh:m,lensMat:m.material,color:0xa4202b,base:.85,target:.85,phase:'pre',mode:'pulse',x,z,f,seed:M.rand(0,100),on:true});
    return m;
  },
  lightsAll(W){
    const P=Maps.P, cxm=Maps.cx, czm=Maps.cz;
    /* ---- upper ---- */
    // dead fixtures sprinkled on corridors (become alive with aux)
    for(let i=0;i<7;i++){
      const x=cxm(6+i*5);
      this.addFixture(W,{x, z:czm(7.5), f:0, intensity:i%2?0:.85, phase:'aux', mode:i===3?'flicker':'steady'});
      this.addFixture(W,{x, z:czm(8.5), f:0, intensity:0, phase:'aux', mode:'steady', emissive:true});
    }
    this.addFixture(W,{x:cxm(21.5), z:czm(12), f:0, intensity:.9, phase:'aux', mode:'flicker'});
    this.addFixture(W,{x:cxm(21.5), z:czm(16), f:0, intensity:0, phase:'aux'});
    // lobby (dark until aux; two fixtures)
    this.addFixture(W,{x:cxm(18), z:czm(20), f:0, intensity:.75, phase:'aux', size:[2.2,.7]});
    this.addFixture(W,{x:cxm(26), z:czm(23), f:0, intensity:0, phase:'aux', size:[2.2,.7]});
    // entry hall + airlock: weak pre-power emergency
    this.addFixture(W,{x:cxm(21.5), z:czm(27), f:0, intensity:.4, phase:'pre', mode:'flicker', color:0xffd9a0, dist:8});
    this.addFixture(W,{x:cxm(21.5), z:czm(31), f:0, intensity:0, phase:'pre'});
    // break room — alive pre-power (sickly bulb)
    this.addFixture(W,{x:cxm(7.5), z:czm(3), f:0, intensity:.65, phase:'pre', mode:'flicker', color:0xffe2b0});
    // security office
    this.addFixture(W,{x:cxm(36), z:czm(3), f:0, intensity:.8, phase:'aux', mode:'steady'});
    // stairwell
    this.addFixture(W,{x:cxm(15.5), z:czm(3), f:0, intensity:.5, phase:'aux', mode:'flicker'});
    // storage nook + closet dead
    this.addFixture(W,{x:cxm(4.5), z:czm(12), f:0, intensity:0, phase:'aux', dist:8});
    this.addFixture(W,{x:cxm(31.5), z:czm(11.5), f:0, intensity:.5, phase:'pre', color:0xcfe0ff, dist:7});

    /* ---- lower ---- */
    this.addFixture(W,{x:cxm(15.5), z:czm(3), f:1, intensity:.55, phase:'pre', color:0xffd9a0, mode:'flicker'});
    for(let i=0;i<7;i++){
      this.addFixture(W,{x:cxm(6+i*5), z:czm(7.5), f:1, intensity:i%2?0:.8, phase:'gen', mode:i===5?'flicker':'steady'});
    }
    // labs
    this.addFixture(W,{x:cxm(8), z:czm(14), f:1, intensity:.85, phase:'gen', mode:'flicker'});
    this.addFixture(W,{x:cxm(8), z:czm(18), f:1, intensity:.7, phase:'gen'});
    // annex — sickly green
    this.addFixture(W,{x:cxm(19), z:czm(12.5), f:1, intensity:.7, phase:'gen', color:0xcfe8cf, mode:'flicker'});
    // rec room
    this.addFixture(W,{x:cxm(27.5), z:czm(12.5), f:1, intensity:.8, phase:'gen'});
    // containment approach — red
    this.redLampSmall(W,{x:cxm(34.5), z:czm(9)+1.2, f:1, y:2.6});
    this.addFixture(W,{x:cxm(39), z:czm(12), f:1, intensity:0, phase:'gen', color:0xff9a92, dist:9});
    // gen corridor
    this.addFixture(W,{x:cxm(21.5), z:czm(20), f:1, intensity:.6, phase:'gen', mode:'flicker'});
    // generator room — warm industrial
    this.addFixture(W,{x:cxm(20), z:czm(28), f:1, intensity:.9, phase:'gen', color:0xffe6c0, size:[2.4,.8]});
    this.addFixture(W,{x:cxm(26), z:czm(29.5), f:1, intensity:.7, phase:'gen', color:0xffe6c0, size:[2.4,.8]});
    // elevator hall
    this.addFixture(W,{x:cxm(38), z:czm(26.5), f:1, intensity:.85, phase:'gen', color:0xfff0cc});
    this.addFixture(W,{x:cxm(34), z:czm(29.5), f:1, intensity:.6, phase:'gen', color:0xfff0cc});
    // deep storage — one swinging bare bulb
    const swing=this.addFixture(W,{x:cxm(6), z:czm(27), f:1, intensity:.7, phase:'gen', color:0xffdba8, dist:9, size:[.3,.3]});
    swing.swing=true;

    // red lamps at powered stairwell door + lift hall
    this.redLampSmall(W,{x:Maps.cx(17)+.3, z:Maps.cz(6)+.6, f:0, y:2.7});
    this.redLampSmall(W,{x:Maps.cx(41)-.6, z:Maps.cz(26), f:1, y:2.7});
  },

  /* ================= stairs shaft ================= */
  stairsShaft(W){
    // steps descending north from the landing edge (z = row1 north face = CS),
    // through the floor hole at row 0, into darkness. Both floors mirrored.
    for(const f of [0,1]){
      const yOff=f===0?0:LOWER_Y;
      const g=new THREE.Group();
      const steps=10;
      for(let i=0;i<steps;i++){
        const st=mkBox(CS*2-.1,.16,.34,W.mat.floorL);
        st.position.set(Maps.cx(15.5), -.17-i*.36+yOff, CS-.19-i*.31);
        g.add(st);
      }
      // shaft cap wall behind last step + side walls of the hole
      const cap=mkBox(CS*2+.5,WH+1,.35,new THREE.MeshStandardMaterial({color:0x050607}));
      cap.position.set(Maps.cx(15.5), -1.2+yOff, -.25);
      g.add(cap);
      for(const s of [-1,1]){
        const side=mkBox(.18,WH+1.4,CS+.4,new THREE.MeshStandardMaterial({color:0x0a0c0d}));
        side.position.set(Maps.cx(15.5)+s*(CS+.05)-s*.09, -.7+yOff, CS/2);
        g.add(side);
        const rail=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,3.4,6),W.mat.pipe);
        rail.rotation.x=Math.PI/2-.42;
        rail.position.set(Maps.cx(15.5)+s*(CS-.12), .62+yOff-.55, CS-1.6);
        g.add(rail);
      }
      // overhead header so shaft reads as a opening in the ceiling
      const hdr=mkBox(CS*2+.5,.5,CS+.5,W.mat.ceilL);
      hdr.position.set(Maps.cx(15.5), WH+.24+yOff, .9);
      g.add(hdr);
      W.root.add(g);
    }
  },

  /* ================= elevator ================= */
  elevatorBuild(W){
    const P=Maps.P;
    const yOff=LOWER_Y;
    const g=new THREE.Group();
    const gx=P.elevGate.wx, gz=P.elevGate.wz; // gate plane at south face of cage
    const cageW=3*CS-.5, cageH=3.6, cageD=2.4;
    // side walls + top + back
    const back=mkBox(cageW,cageH,.25,W.mat.door); back.position.set(gx,cageH/2+yOff,gz-cageD);
    const left =mkBox(.25,cageH,cageD,W.mat.door); left.position.set(gx-cageW/2,cageH/2+yOff,gz-cageD/2);
    const right=mkBox(.25,cageH,cageD,W.mat.door); right.position.set(gx+cageW/2,cageH/2+yOff,gz-cageD/2);
    const top  =mkBox(cageW,.3,cageD,W.mat.metalDk); top.position.set(gx,cageH+yOff,gz-cageD/2);
    g.add(back,left,right,top);
    // frame columns
    for(const s of [-1,1]){
      const col=mkBox(.3,cageH+.4,.3,W.mat.hazard);
      col.position.set(gx+s*(cageW/2), (cageH+.4)/2+yOff, gz);
      g.add(col);
    }
    // header + sign
    const header=mkBox(cageW+.6,.7,.35,W.mat.metalDk); header.position.set(gx,cageH+.35+yOff,gz);
    g.add(header);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.6,.55),
      new THREE.MeshBasicMaterial({map:T.signPlate('FREIGHT LIFT · SHAFT 2',{bg:'#151a1d'}),transparent:true}));
    sign.position.set(gx,cageH+.35+yOff,gz+.19); g.add(sign);

    // gate: vertical bar grid sliding sideways
    const gateG=new THREE.Group();
    const bars=[];
    for(let i=0;i<9;i++){
      const b=new THREE.Mesh(new THREE.BoxGeometry(.06,cageH-1.1,.06),W.mat.pipe);
      b.position.set(-cageW/2+.35+i*(cageW-.7)/8,(cageH-1.1)/2+.55+yOff,0);
      gateG.add(b); bars.push(b);
    }
    for(let j=0;j<3;j++){
      const hbar=new THREE.Mesh(new THREE.BoxGeometry(cageW-.6,.07,.06),W.mat.pipe);
      hbar.position.set(0,1+j*((cageH-1.1)/2.4)+yOff,0);
      gateG.add(hbar);
    }
    gateG.position.set(gx,0,gz);
    g.add(gateG);

    // interior pad marker
    const pad=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.9),
      new THREE.MeshBasicMaterial({map:T.signPlate('CAR 2 — STAND CLEAR',{bg:'#101416',fg:'#c9d2c6'}),transparent:true}));
    pad.rotation.x=-Math.PI/2; pad.position.set(gx,yOff+.02,gz-1.2);
    g.add(pad);

    W.root.add(g);
    W.elev={gate:gateG, gateOpenT:0, gateOpening:false, gx, gz, cageW,
      setOpen(o){ if(this.gateOpening===o)return; this.gateOpening=o; HG.Audio.playAt&&HG.Audio.playAt('doorSlide',{pos:{x:gx,z:gz},floor:1,vol:1}); },
      update(dt){
        this.gateOpenT=M.clamp(this.gateOpenT+(this.gateOpening?dt:-dt)*.8,0,1);
        gateG.position.x=gx-this.gateOpenT*(cageW*.92);
      }};
  },

  /* ================= UPPER PROPS ================= */
  addCol(W,f,x,z,w,d){ // register prop collider (center x,z; sizes w,d)
    const c={x0:x-w/2,z0:z-d/2,x1:x+w/2,z1:z+d/2};
    W.colliders[f].push(c);
    // hash insert covering cells
    const c0=Maps.toC(c.x0),c1=Maps.toC(c.x1),r0=Maps.toR(c.z0),r1=Maps.toR(c.z1);
    for(let r=r0;r<=r1;r++)for(let cc=c0;cc<=c1;cc++){
      const k=r*GW+cc;
      if(!W.colHash[f].has(k)) W.colHash[f].set(k,[]);
      W.colHash[f].get(k).push(c);
    }
    return c;
  },
  place(W,mesh,f,x,z,ry=0,colW=0,colD=0){
    const yOff=f===0?0:LOWER_Y;
    mesh.position.x=x; mesh.position.z=z; mesh.position.y=yOff; mesh.rotation.y=ry;
    W.root.add(mesh);
    if(colW) this.addCol(W,f,x,z,colW,colD);
    return mesh;
  },
  signAbove(W,f,cell,text,ry=0){
    const yOff=f===0?0:LOWER_Y;
    const s=new THREE.Mesh(new THREE.PlaneGeometry(1.9,.48),
      new THREE.MeshBasicMaterial({map:T.signPlate(text),transparent:true}));
    const [c,r]=cell;
    s.position.set(Maps.cx(c), 2.62+yOff, Maps.cz(r)+(ry===0?.06:-.06));
    s.rotation.y=ry;
    W.root.add(s);
    return s;
  },

  propsUpper(W){
    const P=Maps.P, cxm=Maps.cx, czm=Maps.cz, y0=0;
    /* ---- airlock ---- */
    {
      const bench=(w,d)=>{const b=new THREE.Group();
        const seat=mkBox(w,.09,d,W.mat.wood); seat.position.y=.52; b.add(seat);
        for(const sx of [-1,1])for(const sz of [-1,1]){const leg=mkBox(.07,.5,.07,W.mat.metalDk);leg.position.set(sx*(w/2-.08),.26,sz*(d/2-.08));b.add(leg);}
        return b;};
      this.place(W,bench(2.2,.5),0,cxm(19),czm(31.6),0,2.2,.5);
      this.place(W,bench(2.2,.5),0,cxm(24.5),czm(31.6),Math.PI,2.2,.5);
      const poster=new THREE.Mesh(new THREE.PlaneGeometry(1.3,1.7),new THREE.MeshStandardMaterial({map:T.poster('KDF·S STATION RULES','\nreport anomalies\n\nto site supervisor\n\nkeep headphones ON\nbelow deck B2\n\n— management'),roughness:1}));
      poster.position.set(cxm(18)-CS/2+.03,1.9,czm(30)); poster.rotation.y=Math.PI/2;
      W.root.add(poster);
      this.redLampSmall(W,{x:cxm(21.5),z:czm(32)+.4,f:0,y:2.8});
    }
    /* ---- lobby ---- */
    {
      // structural columns
      for(const [px,pz] of [[17,20],[17,23.5],[26.5,20],[26.5,23.5]]){
        const col=mkBox(.7,WH,.7,W.mat.wallU);
        this.place(W,col,0,cxm(px),czm(pz),0,.7,.7);
      }
      // reception desk
      const desk=new THREE.Group();
      const top=mkBox(3.4,.1,1.1,W.mat.woodDk); top.position.y=1.02; desk.add(top);
      const front=mkBox(3.4,.98,.5,W.mat.wood); front.position.set(0,.49,-.28); desk.add(front);
      this.place(W,desk,0,cxm(20.5),czm(22.5),0,3.4,1.1);
      // papers on desk
      for(let i=0;i<4;i++){
        const pp=new THREE.Mesh(new THREE.PlaneGeometry(.28,.38),W.mat.paper);
        pp.rotation.x=-Math.PI/2; pp.rotation.z=M.rand(0,3);
        pp.position.set(cxm(19.6)+i*.3+M.rand(-.1,.1),1.08,czm(22.4)+M.rand(-.2,.2));
        W.root.add(pp);
      }
      // note on desk (work order — interactable registered by game.js)
      // benches + plant + cooler
      this.place(W,(()=>{const b=new THREE.Group();const s=mkBox(2.6,.12,.62,W.mat.fabricDk);s.position.y=.45;b.add(s);
        const bb=mkBox(2.6,.5,.55,W.mat.fabricDk);bb.position.set(0,.28,-.22);b.add(bb);return b;})(),0,cxm(16.5),czm(24),0,2.6,.7);
      this.place(W,(()=>{const b=new THREE.Group();const s=mkBox(2.6,.12,.62,W.mat.fabricDk);s.position.y=.45;b.add(s);
        const bb=mkBox(2.6,.5,.55,W.mat.fabricDk);bb.position.set(0,.28,-.22);b.add(bb);return b;})(),0,cxm(27),czm(19.4),Math.PI/2,0.7,2.6);
      const plant=new THREE.Group();
      const pot=mkBox(.4,.45,.4,W.mat.rust); pot.position.y=.22; plant.add(pot);
      for(let i=0;i<5;i++){const lf=mkBox(.06,.5,.06,new THREE.MeshStandardMaterial({color:0x2e3a26,roughness:1}));
        lf.position.set(M.rand(-.12,.12),.65,M.rand(-.12,.12)); lf.rotation.z=M.rand(-.4,.4); plant.add(lf);}
      this.place(W,plant,0,cxm(28.4),czm(24.3),0,.4,.4);
      const cooler=new THREE.Group();
      const cb=mkBox(.5,1.1,.5,W.mat.metalDk); cb.position.y=.55; cooler.add(cb);
      const cj=mkBox(.36,.4,.36,new THREE.MeshStandardMaterial({color:0x7a97a3,transparent:true,opacity:.55,roughness:.2}));
      cj.position.y=1.3; cooler.add(cj);
      this.place(W,cooler,0,cxm(14.5),czm(19),0,.5,.5);
      // fuse box (east wall) — visual; interaction handled by game.js
      const fb=new THREE.Group();
      const box=mkBox(1.1,1.4,.24,new THREE.MeshStandardMaterial({color:0x495054,roughness:.5,metalness:.6}));
      box.position.y=1.5; fb.add(box);
      const doorLine=mkBox(.02,1.3,.01,W.mat.metalDk); doorLine.position.set(0,1.5,.125); fb.add(doorLine);
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.14,.14,.05),W.mat.offLamp.clone()); lamp.material.name='fuseLamp';
      lamp.position.set(.4,2.05,.14); fb.add(lamp);
      this.place(W,fb,0,P.fuseBox.wx+.14,P.fuseBox.wz,Math.PI/2);
      W.fuseBoxLamp=lamp;
      // scrawl on lobby west wall
      const scr=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.1),new THREE.MeshBasicMaterial({map:T.scrawl('IT COUNTS YOUR STEPS'),transparent:true}));
      scr.position.set(cxm(14)-CS/2+.04,2.1,czm(21.5)); scr.rotation.y=Math.PI/2;
      W.root.add(scr);
      this.signAbove(W,0,[21.5,25],'KESTREL DEEP · ATRIUM');
    }
    /* ---- front corridor ---- */
    {
      // overhead pipes
      for(let i=0;i<8;i++){
        const p=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,4.6,7),i%2?W.mat.pipeRust:W.mat.pipe);
        p.rotation.z=Math.PI/2; p.position.set(cxm(21.5),2.9,czm(9)+i*1.15);
        W.root.add(p);
      }
      const arrow=new THREE.Mesh(new THREE.PlaneGeometry(1.5,.5),
        new THREE.MeshBasicMaterial({map:T.signPlate('◄ BREAK RM · SECURITY ►',{w:512,h:170,bg:'#1c2124',fg:'#cdd4c8'}),transparent:true}));
      arrow.position.set(cxm(21.5),2.35,czm(17)+.05); W.root.add(arrow);
    }
    /* ---- break room ---- */
    {
      const tbl=new THREE.Group();
      const top=new THREE.Mesh(new THREE.CylinderGeometry(.75,.75,.07,18),W.mat.wood); top.position.y=.78; tbl.add(top);
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,.76,10),W.mat.metalDk); leg.position.y=.39; tbl.add(leg);
      this.place(W,tbl,0,cxm(8.5),czm(3.5),0,1.5,1.5);
      for(const [ox,oz] of [[-1,0],[1,.2],[0,-1],[.2,1]]){
        const ch=new THREE.Group();
        const seat=mkBox(.42,.06,.42,W.mat.fabric); seat.position.y=.46; ch.add(seat);
        const bk=mkBox(.42,.5,.06,W.mat.fabric); bk.position.set(0,.72,-.19); ch.add(bk);
        this.place(W,ch,0,cxm(8.5)+ox*1.05,czm(3.5)+oz*1.05,M.rand(0,6.3));
      }
      // counter + fridge against north wall
      const counter=new THREE.Group();
      const ctop=mkBox(3,.1,.7,W.mat.woodDk); ctop.position.y=.95; counter.add(ctop);
      const cfront=mkBox(3,.9,.55,W.mat.wood); cfront.position.set(0,.47,.05); counter.add(cfront);
      this.place(W,counter,0,cxm(6),CS+.45,0,3,.8);
      const fridge=mkBox(.85,1.9,.75,new THREE.MeshStandardMaterial({color:0x9aa3a6,roughness:.4,metalness:.3}));
      fridge.position.y=.95;
      this.place(W,fridge,0,cxm(10.4),CS+.48,0,.9,.8);
      // vending machine (dimly lit face — pre-power ambience)
      const vend=new THREE.Group();
      const vb=mkBox(1.1,2,.8,new THREE.MeshStandardMaterial({color:0x37424a,roughness:.5,metalness:.4})); vb.position.y=1; vend.add(vb);
      const vg=new THREE.Mesh(new THREE.PlaneGeometry(.7,1.4),new THREE.MeshBasicMaterial({color:0x1d2b30}));
      vg.position.set(-.1,1.25,.41); vend.add(vg);
      const vglow=new THREE.PointLight(0x3a5a66,.5,4,2); vglow.position.set(0,1.3,.8); vend.add(vglow);
      W.lights.push({pl:vglow,lensMat:null,color:0x3a5a66,base:.5,target:.5,phase:'pre',mode:'flicker',x:cxm(9.5),z:czm(5.2),f:0,seed:M.rand(0,9),on:true,onMesh:vend});
      this.place(W,vend,0,cxm(9.5),czm(5.4),0,1.1,.85);
      // lockers (3-unit) — one holds Fuse A
      const lockers=new THREE.Group();
      const body=mkBox(2.2,2.1,.55,new THREE.MeshStandardMaterial({color:0x4e5a60,roughness:.6,metalness:.4})); body.position.y=1.05; lockers.add(body);
      for(let i=0;i<3;i++){
        const dl=mkBox(.66,1.7,.03,new THREE.MeshStandardMaterial({color:0x434e54,roughness:.55,metalness:.4}));
        dl.position.set(-.72+i*.72,1.1,.29); lockers.add(dl);
        const vent=mkBox(.5,.16,.01,W.mat.metalDk); vent.position.set(-.72+i*.72,1.7,.31); lockers.add(vent);
      }
      this.place(W,lockers,0,cxm(4)-CS/2+.33,czm(3.2),Math.PI/2,.6,2.2);
      this.signAbove(W,0,[7.5,6],'BREAK ROOM');
    }
    /* ---- security office ---- */
    {
      const desk=new THREE.Group();
      const top=mkBox(2.6,.09,1.2,W.mat.woodDk); top.position.y=.95; desk.add(top);
      for(const sx of [-1,1]){const side=mkBox(.09,.92,1.2,W.mat.wood);side.position.set(sx*1.25,.46,0);desk.add(side);}
      this.place(W,desk,0,cxm(37.5),czm(2.8),0,2.6,1.2);
      // CRT monitor (dead)
      const mon=new THREE.Group();
      const mb=mkBox(.55,.45,.45,new THREE.MeshStandardMaterial({color:0xb9b2a4,roughness:.7})); mb.position.y=1.22; mon.add(mb);
      const ms=mkBox(.44,.34,.03,W.mat.screenDead); ms.position.set(0,1.24,.23); mon.add(ms);
      this.place(W,mon,0,cxm(38),czm(2.6),-.4);
      // chair
      const ch=new THREE.Group();
      const seat=mkBox(.45,.07,.45,W.mat.fabricDk); seat.position.y=.5; ch.add(seat);
      const bk=mkBox(.45,.55,.07,W.mat.fabricDk); bk.position.set(0,.82,-.2); ch.add(bk);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.5,8),W.mat.metalDk); pole.position.y=.25; ch.add(pole);
      this.place(W,ch,0,cxm(37),czm(3.8),M.rand(0,6));
      // filing cabinets
      for(let i=0;i<3;i++){
        const fc=mkBox(.55,1.5,.6,W.mat.metalDk); fc.position.y=.75;
        this.place(W,fc,0,cxm(33)+i*.65,czm(.8),0,.55,.6);
      }
      // wall monitor bank
      const bank=new THREE.Group();
      for(let i=0;i<4;i++){
        const scrn=mkBox(.72,.54,.06,i===1?new THREE.MeshBasicMaterial({color:0x0e1416}):W.mat.screenDead);
        scrn.position.set(i*.8,0,0); bank.add(scrn);
      }
      this.place(W,bank,0,P.whiteboardSec.wx-.12,czm(4.2),-Math.PI/2);
      // whiteboard
      const wb=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.75),new THREE.MeshStandardMaterial({map:T.get('whiteboard'),roughness:.6}));
      wb.position.set(P.whiteboardSec.wx-.02,1.8,P.whiteboardSec.wz);
      wb.rotation.y=-Math.PI/2;
      W.root.add(wb);
      this.signAbove(W,0,[36.5,6],'SECURITY');
    }
    /* ---- server closet ---- */
    {
      for(let i=0;i<3;i++){
        const rack=new THREE.Group();
        const rb=mkBox(.8,2.2,.9,W.mat.metalDk); rb.position.y=1.1; rack.add(rb);
        for(let j=0;j<8;j++){
          const led=new THREE.Mesh(new THREE.BoxGeometry(.05,.05,.02),
            new THREE.MeshBasicMaterial({color:j%3?0x14351c:0x0c2a33}));
          led.position.set(-.25+(j%2)*.5,1.9-j*.2,.46); rack.add(led);
        }
        this.place(W,rack,0,cxm(30.8)+i*1.05,czm(10.8),0,.8,.9);
      }
      // faint UPS hum handled via audio proximity (containment-style loop omitted)
    }
    /* ---- storage nook ---- */
    {
      for(let i=0;i<2;i++){
        const shelf=new THREE.Group();
        for(let j=0;j<3;j++){
          const sh=mkBox(2,.06,.55,W.mat.wood); sh.position.y=.5+j*.6; shelf.add(sh);
          for(let k=0;k<3;k++){
            const bx=mkBox(M.rand(.3,.5),M.rand(.25,.4),.4,k?W.mat.woodDk:W.mat.rust);
            bx.position.set(-.6+k*.6,.5+j*.6+.2,0); shelf.add(bx);
          }
        }
        this.place(W,shelf,0,cxm(4)+i*2.4,czm(12.5),0,2,.6);
      }
    }
    this.signAbove(W,0,[15.5,6],'STAIRWELL · B2');
  },

  /* ================= LOWER PROPS ================= */
  propsLower(W){
    const P=Maps.P, cxm=Maps.cx, czm=Maps.cz, y1=LOWER_Y;
    /* ---- labs ---- */
    {
      for(let i=0;i<3;i++){
        const bench=new THREE.Group();
        const top=mkBox(3.2,.1,1.1,new THREE.MeshStandardMaterial({color:0x5a5f5c,roughness:.5,metalness:.2})); top.position.y=.95; bench.add(top);
        const cab=mkBox(3.1,.9,.95,new THREE.MeshStandardMaterial({color:0x46525a,roughness:.6})); cab.position.set(0,.45,0); bench.add(cab);
        this.place(W,bench,0,cxm(5.5),czm(12)+i*3.4,0,3.2,1.1);
        // clutter: beakers
        for(let k=0;k<5;k++){
          const bj=new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,M.rand(.12,.26),8),W.mat.glass);
          bj.position.set(cxm(4.4)+M.rand(0,2.2),1.06,czm(12)+i*3.4+M.rand(-.35,.35));
          W.root.add(bj);
        }
      }
      // fume hood
      const hood=new THREE.Group();
      const hb=mkBox(1.6,2.4,.9,new THREE.MeshStandardMaterial({color:0x50606a,roughness:.5,metalness:.4})); hb.position.y=1.2; hood.add(hb);
      const hg=new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.4),W.mat.tankGlass); hg.position.set(0,1.35,.46); hood.add(hg);
      this.place(W,hood,0,cxm(13.4),czm(11),0,1.6,.9);
      // log desk + microscope
      const ldesk=new THREE.Group();
      const lt=mkBox(1.8,.08,.9,W.mat.woodDk); lt.position.y=.92; ldesk.add(lt);
      for(const sx of [-1,1]){const s=mkBox(.08,.9,.9,W.mat.wood);s.position.set(sx*.85,.45,0);ldesk.add(s);}
      this.place(W,ldesk,0,cxm(12.5),czm(18.5),.4,1.8,.9);
      const scope=new THREE.Group();
      const base=mkBox(.22,.06,.3,W.mat.metalDk); scope.add(base);
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.3,8),W.mat.metalDk); arm.position.y=.18; arm.rotation.z=.3; scope.add(arm);
      scope.position.set(cxm(12.9),.96,czm(18.3));
      W.root.add(scope);
      // fridge with biohazard sticker
      const fr=mkBox(1,1.9,.8,new THREE.MeshStandardMaterial({color:0x8d979a,roughness:.4,metalness:.3})); fr.position.y=.95;
      this.place(W,fr,0,cxm(3.6),czm(19.5),0,1,.8);
      const stick=new THREE.Mesh(new THREE.PlaneGeometry(.5,.5),new THREE.MeshBasicMaterial({map:T.poster('BIOHAZARD','\nliving cultures\ninside\n', '#c8b428','#2a2416','#2a2416'),transparent:true}));
      stick.position.set(cxm(3.6),1.3,czm(19.5)+.42); W.root.add(stick);
      this.signAbove(W,1,[6.5,9],'LABORATORIES');
    }
    /* ---- annex (specimens) ---- */
    {
      for(let i=0;i<3;i++){
        const tank=new THREE.Group();
        const cyl=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,2.1,16,1,true),W.mat.tankGlass);
        cyl.position.y=1.15; tank.add(cyl);
        const fluid=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,1.8,16),W.mat.fluid);
        fluid.position.y=1.1; tank.add(fluid);
        const capT=mkBox(1.2,.18,1.2,W.mat.metalDk); capT.position.y=2.25; tank.add(capT);
        const base=mkBox(1.2,.16,1.2,W.mat.metalDk); base.position.y=.08; tank.add(base);
        const tube=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,1.4,6),W.mat.pipeRust);
        tube.position.set(.55,1.6,0); tank.add(tube);
        this.place(W,tank,0,cxm(17.5)+i*1.9,czm(11.5),0,1.2,1.2);
      }
      // fourth tank: SHATTERED, empty, lid open
      const broken=new THREE.Group();
      const shards=new THREE.Mesh(new THREE.CylinderGeometry(.5,.55,.7,12,1,true),W.mat.tankGlass);
      shards.position.y=.4; broken.add(shards);
      const capT=mkBox(1.2,.18,1.2,W.mat.metalDk); capT.position.set(.5,1.5,0); capT.rotation.z=1.2; broken.add(capT);
      this.place(W,broken,0,cxm(21),czm(14),0,1.2,1.2);
      const stain=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:T.get('stain'),transparent:true,opacity:.8,depthWrite:false}));
      stain.rotation.x=-Math.PI/2; stain.position.set(cxm(21),y1+.02,czm(14.6)); W.root.add(stain);
      // gurney
      const gurn=new THREE.Group();
      const gt=mkBox(.8,.08,2,W.mat.metal); gt.position.y=.85; gurn.add(gt);
      for(const sx of [-1,1])for(const sz of [-1,1]){const leg=mkBox(.05,.85,.05,W.mat.metalDk);leg.position.set(sx*.35,.42,sz*.9);gurn.add(leg);}
      this.place(W,gurn,0,cxm(19.5),czm(14),.3,.8,2);
      this.signAbove(W,1,[18.5,9],'SPECIMENS');
    }
    /* ---- rec room ---- */
    {
      const couch=new THREE.Group();
      const seat=mkBox(2.2,.45,.9,W.mat.fabric); seat.position.y=.35; couch.add(seat);
      const back=mkBox(2.2,.6,.25,W.mat.fabric); back.position.set(0,.75,-.4); couch.add(back);
      for(const sx of [-1,1]){const arm=mkBox(.25,.3,.9,W.mat.fabric);arm.position.set(sx*1.2,.6,0);couch.add(arm);}
      this.place(W,couch,0,cxm(29.5),czm(12),-Math.PI/2,0.9,2.2);
      const tv=new THREE.Group();
      const tvb=mkBox(1.1,.8,.5,new THREE.MeshStandardMaterial({color:0x2c2f31,roughness:.5})); tvb.position.y=1; tv.add(tvb);
      const tvs=mkBox(.9,.6,.03,W.mat.screenDead); tvs.position.set(0,1.05,.26); tv.add(tvs);
      this.place(W,tv,0,cxm(30.6),czm(10.6),0,1.1,.6);
      const tbl=new THREE.Group();
      const tt=mkBox(1.4,.07,.8,W.mat.wood); tt.position.y=.5; tbl.add(tt);
      for(const sx of [-1,1])for(const sz of [-1,1]){const leg=mkBox(.06,.5,.06,W.mat.metalDk);leg.position.set(sx*.6,.25,sz*.32);tbl.add(leg);}
      this.place(W,tbl,0,cxm(27),czm(13.5),0,1.4,.8);
      // magazines
      for(let i=0;i<3;i++){
        const mg=new THREE.Mesh(new THREE.PlaneGeometry(.3,.4),new THREE.MeshStandardMaterial({map:T.poster(['FIELD SERVICE','RADIO MONTHLY','TRUE STRANGE'][i],'\n\n\n\n\n','#9aa08e','#33302a','#33302a'),roughness:1}));
        mg.rotation.x=-Math.PI/2; mg.rotation.z=M.rand(0,3);
        mg.position.set(cxm(26.7)+i*.22,.545,czm(13.4)+i*.1); W.root.add(mg);
      }
      // CALENDAR (puzzle prop) on west wall
      const cal=new THREE.Mesh(new THREE.PlaneGeometry(1.15,1.45),new THREE.MeshStandardMaterial({map:T.get('calendar'),roughness:.9}));
      cal.position.set(P.calendarRec.wx+.03,1.75,P.calendarRec.wz); cal.rotation.y=Math.PI/2;
      W.root.add(cal);
      // safety award poster (ironic)
      const aw=new THREE.Mesh(new THREE.PlaneGeometry(1,1.35),new THREE.MeshStandardMaterial({map:T.poster('SAFETY FIRST','\n31 days without\nan incident\n\n(posthumous)', '#7c8272','#22261f','#5c1f1c'),roughness:1}));
      aw.position.set(cxm(31)-.05,1.8,czm(14.4)); aw.rotation.y=-Math.PI/2;
      W.root.add(aw);
      this.signAbove(W,1,[27.5,9],'RECREATION');
    }
    /* ---- containment exterior ---- */
    {
      // warning chevrons on floor before door
      for(let i=0;i<3;i++){
        const hz=new THREE.Mesh(new THREE.PlaneGeometry(3.4,.5),W.mat.hazard);
        hz.rotation.x=-Math.PI/2; hz.position.set(cxm(36.5),y1+.021,czm(10.5)-i*1.1);
        W.root.add(hz);
      }
      // observation window next to door (dark glass) — mounted on corridor-side face z=28
      const win=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.3),new THREE.MeshStandardMaterial({color:0x05070a,roughness:.1,metalness:.8}));
      win.position.set(cxm(33.5),1.7+y1,(10)*CS+.05); W.root.add(win);
      const wf=mkBox(2.6,1.5,.08,W.mat.metalDk); wf.position.set(cxm(33.5),1.7+y1,(10)*CS+.01); W.root.add(wf);
      // posters
      const warn=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1.6),new THREE.MeshStandardMaterial({map:T.poster('AUTHORIZED ONLY','\nspecimen QS-1\n“the choir”\n\nDO NOT APPROACH\nDO NOT SPEAK TO IT','#8f8468','#2c2118','#7c1f1c'),roughness:1}));
      warn.position.set(cxm(39),1.9,(10)*CS+.06); W.root.add(warn);
      // barrier tape
      const tape=new THREE.Mesh(new THREE.PlaneGeometry(4.5,.18),W.mat.hazard);
      tape.position.set(cxm(36.5),1.1+y1,czm(10.8)); tape.rotation.z=.06; W.root.add(tape);
    }
    /* ---- gen corridor ---- */
    {
      for(let i=0;i<9;i++){
        const p=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,4.8,7),i%2?W.mat.pipeRust:W.mat.pipe);
        p.rotation.x=Math.PI/2; p.position.set(cxm(21.5)+(i%2?.5:-.5),2.75,czm(18)+i*0.78);
        W.root.add(p);
      }
      // drip stain
      const st=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.6),new THREE.MeshBasicMaterial({map:T.get('stain'),transparent:true,opacity:.7,depthWrite:false}));
      st.rotation.x=-Math.PI/2; st.position.set(cxm(21.8),y1+.02,czm(22)); W.root.add(st);
    }
    /* ---- generator room ---- */
    {
      const G=new THREE.Group();
      const body=mkBox(3.4,2.2,1.8,new THREE.MeshStandardMaterial({color:0x3d4448,roughness:.55,metalness:.5})); body.position.y=1.1; G.add(body);
      for(let i=0;i<4;i++){
        const head=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.7,10),W.mat.rust);
        head.position.set(-1.2+i*.8,2.4,0); G.add(head);
      }
      const exh=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,2.6,8),W.mat.pipeRust);
      exh.position.set(1.4,3.4,-.4); G.add(exh);
      const fly=new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,.3,14),W.mat.metal);
      fly.rotation.z=Math.PI/2; fly.position.set(-2,1,1.1); G.add(fly);
      this.place(W,G,0,cxm(22.5),czm(29.5),0,3.4,1.9);
      // fuel line pipes from wall valves to machine
      for(let i=0;i<3;i++){
        const p=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,4,6),i===1?W.mat.pipeRust:W.mat.pipe);
        p.rotation.z=Math.PI/2;
        p.position.set(cxm(19.5+i*1.5),1.4,czm(26.5));
        W.root.add(p);
      }
      // three wall valves (puzzle)
      W.valveWheels=[];
      for(let i=0;i<3;i++){
        const v=new THREE.Group();
        const stem=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.3,8),W.mat.metal); stem.rotation.x=Math.PI/2; v.add(stem);
        const wheel=new THREE.Mesh(new THREE.TorusGeometry(.24,.04,8,16),W.mat.rust);
        wheel.position.z=.18; v.add(wheel);
        const spoke=new THREE.Mesh(new THREE.BoxGeometry(.42,.05,.03),W.mat.rust); spoke.position.z=.18; v.add(spoke);
        v.position.set(cxm(19.5+i*1.5),1.4,czm(25)+.12);
        W.root.add(v);
        W.valveWheels.push({grp:v,wheel,state:null}); // state set by game.js
      }
      // breaker panel (west wall)
      const brk=new THREE.Group();
      const bb=mkBox(1,1.3,.22,new THREE.MeshStandardMaterial({color:0x495054,roughness:.5,metalness:.6})); bb.position.y=1.5; brk.add(bb);
      const lever=mkBox(.1,.4,.1,new THREE.MeshStandardMaterial({color:0x8a2020,roughness:.4})); lever.position.set(0,1.4,.14); brk.add(lever);
      this.place(W,brk,0,P.genBreaker.wx+.14,P.genBreaker.wz,Math.PI/2);
      W.breakerLever=lever;
      // control desk + gauges
      const cd=new THREE.Group();
      const ct=mkBox(1.9,.08,.8,W.mat.metalDk); ct.position.y=.95; cd.add(ct);
      const cf=mkBox(1.9,.9,.5,new THREE.MeshStandardMaterial({color:0x39424a,roughness:.6})); cf.position.set(0,.47,.12); cd.add(cf);
      for(let i=0;i<3;i++){
        const ga=new THREE.Mesh(new THREE.CircleGeometry(.11,14),new THREE.MeshBasicMaterial({color:0x11150f}));
        ga.position.set(-.6+i*.6,1.25,.28); ga.rotation.x=-.4; cd.add(ga);
      }
      this.place(W,cd,0,cxm(26.5),czm(26.5),-Math.PI/2,1.9,.9);
      // crates + barrel + toolbox + oil stains
      const crate=(s,m)=>{const c=mkBox(s,s,s,m);c.position.y=s/2;return c;};
      this.place(W,crate(.7,W.mat.woodDk),0,cxm(18.2),czm(30.5),0,.7,.7);
      this.place(W,crate(.5,W.mat.rust),0,cxm(18.9),czm(30.3),.5,.5,.5);
      const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.95,12),W.mat.rust);
      barrel.position.y=.48; this.place(W,barrel,0,cxm(27.6),czm(30.6),0,.72,.72);
      const tools=mkBox(.5,.2,.3,new THREE.MeshStandardMaterial({color:0x8a2c22,roughness:.6}));
      this.place(W,tools,0,cxm(25.6),czm(26.6),0,.5,.3);
      for(let i=0;i<3;i++){
        const st2=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.6),new THREE.MeshBasicMaterial({map:T.get('stain'),transparent:true,opacity:.65,depthWrite:false}));
        st2.rotation.x=-Math.PI/2; st2.rotation.z=M.rand(0,3);
        st2.position.set(cxm(20+i*2),y1+.02,czm(27.5)+i*.8); W.root.add(st2);
      }
      this.signAbove(W,1,[22.5,25],'POWER PLANT');
    }
    /* ---- deep storage ---- */
    {
      for(let row=0;row<3;row++){
        for(let i=0;i<2;i++){
          const shelf=new THREE.Group();
          for(let j=0;j<4;j++){
            const sh=mkBox(2.6,.06,.6,W.mat.wood); sh.position.y=.4+j*.55; shelf.add(sh);
            for(let k=0;k<3;k++){
              if(Math.random()<.3)continue;
              const bx=mkBox(M.rand(.35,.55),M.rand(.3,.45),.45,Math.random()<.5?W.mat.woodDk:W.mat.rust);
              bx.position.set(-.8+k*.8,.4+j*.55+.22,0); shelf.add(bx);
            }
          }
          this.place(W,shelf,0,cxm(4)+row*2.4,czm(25)+i*4.5,0,2.6,.6);
        }
      }
      // workbench with THE VALVE HANDLE
      const wb=new THREE.Group();
      const wt=mkBox(2,.09,.9,W.mat.woodDk); wt.position.y=.92; wb.add(wt);
      for(const sx of [-1,1]){const s=mkBox(.09,.9,.9,W.mat.wood);s.position.set(sx*.95,.45,0);wb.add(s);}
      this.place(W,wb,0,cxm(7.5),czm(30),0,2,.9);
      const vh=new THREE.Group();
      const wheel=new THREE.Mesh(new THREE.TorusGeometry(.2,.035,8,14),W.mat.rust); vh.add(wheel);
      const sp=new THREE.Mesh(new THREE.BoxGeometry(.36,.045,.03),W.mat.rust); vh.add(sp);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.16,8),W.mat.metal); hub.rotation.x=Math.PI/2; hub.position.z=.06; vh.add(hub);
      vh.rotation.x=1.2; vh.position.set(cxm(7.2),1.02,czm(30));
      W.root.add(vh);
      W.valveHandleMesh=vh;
      this.signAbove(W,1,[5,21.5],'DEEP STORAGE');
    }
    /* ---- elevator hall ---- */
    {
      // chain hoist rail
      const rail=mkBox(6,.14,.14,W.mat.metalDk); rail.position.set(cxm(37),2.9,czm(27.5)); W.root.add(rail);
      const chain=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,1.1,6),W.mat.rust);
      chain.position.set(cxm(35.5),2.3,czm(27.5)); W.root.add(chain);
      const hook=mkBox(.14,.2,.14,W.mat.metalDk); hook.position.set(cxm(35.5),1.7,czm(27.5)); W.root.add(hook);
      // pallet + drums
      const pal=mkBox(1.6,.14,1.6,W.mat.wood); this.place(W,pal,0,cxm(33.5),czm(30.3),0,1.6,1.6);
      for(let i=0;i<2;i++){
        const dr=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.85,10),W.mat.rust);
        dr.position.set(cxm(33.2)+i*.5,.57,czm(30.2)); W.root.add(dr);
      }
      const crate2=mkBox(1,1,1,W.mat.woodDk); crate2.position.y=.5;
      this.place(W,crate2,0,cxm(39.5),czm(30),.3,1,1);
      // call panel + keypad plate beside gate
      const panel=new THREE.Group();
      const pb=mkBox(.5,.7,.12,new THREE.MeshStandardMaterial({color:0x495054,roughness:.5,metalness:.6})); pb.position.y=1.5; panel.add(pb);
      const btn=new THREE.Mesh(new THREE.CircleGeometry(.07,10),W.mat.offLamp.clone());
      btn.position.set(0,1.62,.07); panel.add(btn);
      const kp=mkBox(.34,.44,.02,new THREE.MeshStandardMaterial({color:0x1a2019,roughness:.4}));
      kp.position.set(0,1.28,.075); panel.add(kp);
      for(let i=0;i<3;i++)for(let j=0;j<4;j++){
        const key=new THREE.Mesh(new THREE.BoxGeometry(.07,.05,.01),new THREE.MeshBasicMaterial({color:0x2c3a2e}));
        key.position.set(-.1+i*.1,1.4-j*.09,.085); panel.add(key);
      }
      this.place(W,panel,0,P.keypadElev.wx-.12,P.keypadElev.wz,-Math.PI/2);
      W.elevPanelBtn=btn;
      this.signAbove(W,1,[38.5,25],'FREIGHT LIFT');
    }
  },

  /* ================= runtime API ================= */
  api(W){
    /* --- collision query --- */
    W.querySolids=function(f,x,z,r){
      // returns candidate static AABBs near (x,z): grid-hash props only (walls handled by caller via grid)
      const out=[];
      const c0=Maps.toC(x-r-1),c1=Maps.toC(x+r+1),r0=Maps.toR(z-r-1),r1=Maps.toR(z+r+1);
      for(let rr=r0;rr<=r1;rr++)for(let cc=c0;cc<=c1;cc++){
        const arr=W.colHash[f].get(rr*GW+cc);
        if(arr) for(const a of arr) if(out.indexOf(a)<0) out.push(a);
      }
      // closed doors as dynamic AABBs
      for(const id in W.doors){
        const d=W.doors[id];
        if(d.f!==f) continue;
        if(d.blocks()){
          for(const [c,r] of d.cells){
            const x0=c*CS,z0=r*CS;
            out.push({x0,z0,x1:x0+CS,z1:z0+CS,door:d});
          }
        }
      }
      return out;
    };
    W.navBlocked=function(f,x,y){
      if(!Maps.isFloorCell(f,x,y)) return true;
      const d=W.doors;
      if(f===1&&(x===36||x===37)&&y===9) return true;             // containment sealed forever (nav)
      if(f===0&&y===6&&(x===15||x===16)&&d.d_stairs.locked) return true; // stairwell mag-lock
      return false;
    };
    W.playerBlockedAt=function(f,x,y){ return Maps.solidCell(f,x,y); };

    /* --- per-frame --- */
    W.update=function(dt,playerPos,f){
      W.time+=dt;
      for(const id in W.doors) W.doors[id].updateFull(dt);
      if(W.elev) W.elev.update(dt);
      // lights: phase targets, flicker modes, distance culling
      const camX=playerPos.x, camZ=playerPos.z;
      for(const L of W.lights){
        if(L.pl){
          const df=f!==L.f?999:Math.hypot(L.x-camX,L.z-camZ);
          const vis=df<34;
          L.pl.visible=vis;
          let want=L.target>0?1:0;
          let inten=L.target;
          if(L.on&&inten>0){
            if(L.mode==='flicker'){
              const n=Math.sin(W.time*13+L.seed)*Math.sin(W.time*7.3+L.seed*2);
              inten*= n>.55? 1 : (n>.2?.55:.12);
              if(Math.random()<.003) inten*=.1;
            } else if(L.mode==='pulse'){
              inten*= .55+.45*Math.sin(W.time*2.2+L.seed);
            }
          }
          if(vis) L.pl.intensity=inten;
        }
        if(L.swing&&L.mesh){ L.mesh.rotation.z=Math.sin(W.time*1.7)*0.12; L.mesh.rotation.x=Math.cos(W.time*1.3)*.08; }
      }
    };
    W.setValveState=function(i,open){
      const v=W.valveWheels[i]; if(!v) return;
      v.state=open;
      v.wheel.rotation.z=open?Math.PI*.5:0;
    };
  },
};

})();
