// Chunk meshing: face culling + per-vertex AO/smooth-light baking + special shapes.
import { CHUNK, HEIGHT } from './config.js';
import { B, BLOCKS } from './blocks.js';
import { TILE_INDEX } from './atlas.js';
import { cidx } from './world.js';

const FACES = [
  { n:[ 1,0,0], sh:0.80, v:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
  { n:[-1,0,0], sh:0.80, v:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { n:[ 0,1,0], sh:1.00, v:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { n:[0,-1,0], sh:0.52, v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { n:[ 0,0,1], sh:0.66, v:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { n:[0,0,-1], sh:0.66, v:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]] }
];
const AO_F=[0.42,0.62,0.82,1.0];

class Buf{
  constructor(){this.v=[];this.i=[];this.n=0;}
  vert(px,py,pz,u,vv,tile,r,g,b,s,bk,fl){
    this.v.push(px,py,pz,u,vv,tile,r,g,b,s,bk,fl);
    return this.n++;
  }
  quad(a,b,c,d,flip){
    const i=a;
    if(flip)this.i.push(i,i+1,i+3,i+1,i+2,i+3);
    else this.i.push(i,i+1,i+2,i,i+2,i+3);
  }
}

function tintFor(world,wx,wz,kind){
  if(!kind)return null;
  const t=world.gen.temp(wx,wz),m=world.gen.moist(wx,wz);
  if(kind==='grass')return[0.40+t*0.30+m*0.10,0.74-t*0.16+m*0.06,0.26+t*0.10];
  if(kind==='pine')return[0.34+t*0.12,0.60-t*0.04,0.36];
  return[0.35+t*0.22,0.62-t*0.08+m*0.08,0.24+t*0.06];
}

export function buildChunkMesh(world,chunk){
  const bx=chunk.cx<<4,bz=chunk.cz<<4;
  const solid=new Buf(),trans=new Buf();

  const gb=(wx,y,wz)=>{
    if(y<0||y>=HEIGHT)return B.AIR;
    const cx=wx>>4,cz=wz>>4;
    const ch=(cx===chunk.cx&&cz===chunk.cz)?chunk:world.chunks.get(cx+','+cz);
    if(!ch)return B.AIR;
    return ch.blocks[cidx(wx&15,y,wz&15)];
  };
  const glS=(wx,y,wz)=>{
    if(y>=HEIGHT)return 15;
    if(y<0)return 0;
    const cx=wx>>4,cz=wz>>4;
    const ch=(cx===chunk.cx&&cz===chunk.cz)?chunk:world.chunks.get(cx+','+cz);
    if(!ch)return 15;
    return ch.light[cidx(wx&15,y,wz&15)]>>4;
  };
  const glB=(wx,y,wz)=>{
    if(y<0||y>=HEIGHT)return 0;
    const cx=wx>>4,cz=wz>>4;
    const ch=(cx===chunk.cx&&cz===chunk.cz)?chunk:world.chunks.get(cx+','+cz);
    if(!ch)return 0;
    return ch.light[cidx(wx&15,y,wz&15)]&15;
  };

  function faceVerts(x,y,z,f,lower){
    const out=[];
    for(let vi=0;vi<4;vi++){
      const c=f.v[vi];
      out.push([
        x+c[0],
        y+(c[1]===1&&lower?0.875:c[1]),
        z+c[2]
      ]);
    }
    return out;
  }

  function emitFace(buf,x,y,z,f,tile,tint,opt){
    const wx=bx+x,wz=bz+z;
    const fx=wx+f.n[0],fy=y+f.n[1],fz=wz+f.n[2];
    let ta,tb;
    if(f.n[1]!==0){ta=[1,0,0];tb=[0,0,1];}
    else if(f.n[0]!==0){ta=[0,1,0];tb=[0,0,1];}
    else{ta=[1,0,0];tb=[0,1,0];}
    const tr=tint?tint[0]:1,tg=tint?tint[1]:1,tbb=tint?tint[2]:1;
    const verts=[];
    for(let vi=0;vi<4;vi++){
      const vv=f.v[vi];
      const stA=(ta[0]?vv[0]:ta[1]?vv[1]:vv[2])?1:-1;
      const stB=(tb[0]?vv[0]:tb[1]?vv[1]:vv[2])?1:-1;
      const s1=[fx+ta[0]*stA,fy+ta[1]*stA,fz+ta[2]*stA];
      const s2=[fx+tb[0]*stB,fy+tb[1]*stB,fz+tb[2]*stB];
      const cc=[fx+ta[0]*stA+tb[0]*stB,fy+ta[1]*stA+tb[1]*stB,fz+ta[2]*stA+tb[2]*stB];
      const o1=BLOCKS[gb(s1[0],s1[1],s1[2])]&&BLOCKS[gb(s1[0],s1[1],s1[2])].opaque?1:0;
      const o2=BLOCKS[gb(s2[0],s2[1],s2[2])]&&BLOCKS[gb(s2[0],s2[1],s2[2])].opaque?1:0;
      const oc=BLOCKS[gb(cc[0],cc[1],cc[2])]&&BLOCKS[gb(cc[0],cc[1],cc[2])].opaque?1:0;
      const ao=(o1&&o2)?0:3-(o1+o2+oc);
      const aoF=AO_F[ao];
      let sS=glS(fx,fy,fz),bS=glB(fx,fy,fz),cnt=1;
      if(!o1){sS+=glS(s1[0],s1[1],s1[2]);bS+=glB(s1[0],s1[1],s1[2]);cnt++;}
      if(!o2){sS+=glS(s2[0],s2[1],s2[2]);bS+=glB(s2[0],s2[1],s2[2]);cnt++;}
      if(!(o1&&o2)&&!oc){sS+=glS(cc[0],cc[1],cc[2]);bS+=glB(cc[0],cc[1],cc[2]);cnt++;}
      const sk=Math.pow(Math.min(1,(sS/cnt)/15),1.25)*aoF*(opt.shade||f.sh);
      let bk=Math.pow(Math.min(1,(bS/cnt)/15),1.4)*aoF;
      if(opt.emis)bk=1.5;
      verts.push([x+vv[0],y+(vv[1]===1&&opt.lower?0.875:vv[1]),z+vv[2],UV[vi][0],UV[vi][1],tile,tr*f.sh,tg*f.sh,tbb*f.sh,sk,bk,(opt.emis?1:0)]);
    }
    const flip=(verts[0][9]+verts[2][9])<(verts[1][9]+verts[3][9]);
    const ids=[];
    for(const p of verts)ids.push(buf.vert(p[0],p[1],p[2],p[3],p[4],p[5],p[6],p[7],p[8],p[9],p[10],p[11]));
    buf.quad(ids[0],ids[1],ids[2],ids[3],flip);
  }

  const UV=[[0,1],[1,1],[1,0],[0,0]];

  for(let y=0;y<HEIGHT;y++)for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++){
    const id=chunk.blocks[cidx(x,y,z)];
    if(id===B.AIR)continue;
    const def=BLOCKS[id];
    const wx=bx+x,wz=bz+z;

    if(def.shape==='cross'){
      emitCross(x,y,z,TILE_INDEX[def.tex.all],tintFor(world,wx,wz,def.tint),true);
      continue;
    }
    if(id===B.TORCH){emitTorch(x,y,z);continue;}
    if(id===B.WIRE_OFF||id===B.WIRE_ON){
      const m=world.meta.get(wx+','+y+','+wz);
      if(m&&m.wire)emitQuadFlat(x,y,z,'lamp_on',true);
      else emitQuadFlat(x,y,z,'wire',false);
      continue;
    }
    if(id===B.LEVER_OFF||id===B.LEVER_ON){
      emitLever(x,y,z,id===B.LEVER_ON);
      continue;
    }
    if(id===B.LADDER){emitLadder(x,y,z);continue;}

    if(id===B.WATER||id===B.ICE){
      for(let fi=0;fi<6;fi++){
        const f=FACES[fi];
        const nid=gb(wx+f.n[0],y+f.n[1],wz+f.n[2]);
        if(fi===2){if(nid===id)continue;}
        else{if(nid===id||(BLOCKS[nid]&&BLOCKS[nid].opaque))continue;}
        emitFace(trans,x,y,z,f,TILE_INDEX['water'],id===B.WATER?[0.6,0.8,1.05]:null,{shade:f.sh,lower:true});
      }
      continue;
    }

    for(let fi=0;fi<6;fi++){
      const f=FACES[fi];
      const nid=gb(wx+f.n[0],y+f.n[1],wz+f.n[2]);
      if(BLOCKS[nid]&&BLOCKS[nid].opaque)continue;
      if(nid===id&&(def.cullSame||!def.cutout))continue;
      const tileName=fi===2?(def.tex.top||def.tex.all):(fi===3?(def.tex.bottom||def.tex.top||def.tex.all):(def.tex.side||def.tex.front||def.tex.all));
      emitFace(solid,x,y,z,f,TILE_INDEX[tileName],tintFor(world,wx,wz,def.tint),{shade:f.sh,emis:def.emit>0});
    }
  }

  function emitCross(x,y,z,tile,tint,sway){
    const a=0.146,b=0.854,tr=tint?tint[0]:1,tg=tint?tint[1]:1,tb=tint?tint[2]:1;
    const quads=[
      [[a,0,a],[b,0,b],[b,1,b],[a,1,a]],
      [[b,0,b],[a,0,a],[a,1,a],[b,1,b]],
      [[a,0,b],[b,0,a],[b,1,a],[a,1,b]],
      [[b,0,a],[a,0,b],[a,1,b],[b,1,a]]
    ];
    const sky=Math.pow(Math.min(1,glS(wx2(),y,wz2())/15),1.25);
    const blk=Math.pow(Math.min(1,glB(wx2(),y,wz2())/15),1.4);
    function wx2(){return bx+x;}function wz2(){return bz+z;}
    for(const q of quads){
      const ids=[];
      for(let vi=0;vi<4;vi++){
        const p=q[vi];
        ids.push(solid.vert(p[0]+x,p[1]+y,p[2]+z,vi===1||vi===2?1:0,p[1],tile,tr,tg,tb,sky,blk,(2<<3)|(((sway&&p[1]>0.5)?2:0))));
      }
      solid.quad(...ids,false);
    }
  }

  function emitQuadFlat(x,y,z,tileName,lit){
    const tile=TILE_INDEX[tileName];
    const sky=Math.pow(Math.min(1,glS(bx+x,y,bz+z)/15),1.25);
    const pts=[[0.02,0,0.02],[0.98,0,0.02],[0.98,0,0.98],[0.02,0,0.98]];
    const ids=[];
    for(let vi=0;vi<4;vi++){
      const p=pts[vi];
      ids.push(solid.vert(p[0]+x,y+p[1],p[2]+z,vi===1||vi===2?1:0,vi>=2?1:0,tile,lit?1.2:0.5,lit?0.3:0.07,lit?0.2:0.05,Math.max(sky,lit?1.2:0),lit?1.2:0.1,0));
    }
    solid.quad(...ids,false);
    solid.quad(ids[3],ids[2],ids[1],ids[0],false);
  }

  function emitTorch(x,y,z){
    const tile=TILE_INDEX['torch'];
    const sky=Math.pow(Math.min(1,glS(bx+x,y+1,bz+z)/15),1.25);
    const a=7/16,b=9/16,h=10/16;
    const corners=[[a,0,a],[b,0,a],[b,0,b],[a,0,b]];
    for(let fi=0;fi<4;fi++){
      const ids=[];
      const c0=corners[fi],c1=corners[(fi+1)%4];
      const pts=[
        [c0[0],0,c0[2]],[c1[0],0,c1[2]],[c1[0],h,c1[2]],[c0[0],h,c0[2]]
      ];
      for(let vi=0;vi<4;vi++){
        const p=pts[vi];
        ids.push(solid.vert(p[0]+x,p[1]+y,p[2]+z,vi===1||vi===2?1:0,vi>=2?1:0,tile,1.1,1.1,1.1,sky,1.5,1));
      }
      solid.quad(...ids,false);
    }
    {
      const ids=[];
      for(let vi=0;vi<4;vi++){
        const c=corners[vi];
        ids.push(solid.vert(c[0]+x,y+h,c[2]+z,(vi===1||vi===2)?1:0,(vi>=2)?1:0,tile,1.3,1.3,1.3,sky,1.5,1));
      }
      solid.quad(...ids,false);
      solid.quad(ids[3],ids[2],ids[1],ids[0],false);
    }
  }

  function emitLever(x,y,z,on){
    const base=TILE_INDEX['cobble'];
    const stick=TILE_INDEX[on?'lamp_on':'lever_off'];
    const sky=Math.pow(Math.min(1,glS(bx+x,y+1,bz+z)/15),1.25);
    const box=(x0,y0,z0,x1,y1,z1,tile,emis)=>{
      for(let fi=0;fi<6;fi++){
        const f=FACES[fi];
        const ids=[];
        for(let vi=0;vi<4;vi++){
          const vv=f.v[vi];
          ids.push(solid.vert(x+(vv[0]?x1:x0),y+(vv[1]?y1:y0),z+(vv[2]?z1:z0),(fi<2)?vv[2]:vv[0],(fi<2)?vv[1]:vv[2]===undefined?vv[1]:vv[2],tile,f.sh*(emis?1.2:1),f.sh*(emis?1.1:1),f.sh*(emis?1.0:1),sky,emis?1.5:0.1,emis?1:0));
        }
        solid.quad(...ids,false);
      }
    };
    box(5/16,0,5/16,11/16,2/16,11/16,base,false);
    box(7/16,2/16,7/16,9/16,on?7/16:9/16,9/16,stick,on);
  }

  function emitLadder(x,y,z){
    const m=world.meta.get((bx+x)+','+y+','+(bz+z));
    const fd=m?(m.f||0):0;
    const tile=TILE_INDEX['ladder'];
    const sky=Math.pow(Math.min(1,glS(bx+x,y,bz+z)/15),1.25);
    const bk=Math.pow(Math.min(1,glB(bx+x,y,bz+z)/15),1.4)*0.9+0.1;
    const off=0.94,e=0.06;
    let pts;
    if(fd===0)pts=[[e,0,off],[1-e,0,off],[1-e,1,off],[e,1,off]];
    else if(fd===1)pts=[[1-e,0,e],[e,0,e],[e,1,e],[1-e,1,e]];
    else if(fd===2)pts=[[off,0,e],[off,0,1-e],[off,1,1-e],[off,1,e]];
    else pts=[[e,0,1-off],[e,0,off],[e,1,off],[e,1,1-off]];
    const ids=[];
    for(let vi=0;vi<4;vi++){
      const p=pts[vi];
      ids.push(solid.vert(p[0]+x,p[1]+y,p[2]+z,(vi===1||vi===2)?1:0,(vi>=2)?1:0,tile,0.85,0.85,0.85,Math.max(sky,0.15),bk,0));
    }
    solid.quad(...ids,false);
    solid.quad(ids[3],ids[2],ids[1],ids[0],false);
  }

  return {
    solid:new Float32Array(solid.v),
    solidIdx:new Uint32Array(solid.i),
    trans:new Float32Array(trans.v),
    transIdx:new Uint32Array(trans.i)
  };
}
