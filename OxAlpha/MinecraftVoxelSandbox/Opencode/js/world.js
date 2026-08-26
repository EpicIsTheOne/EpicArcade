// Chunk store, flood-fill lighting, ticking, raycasting. The heart of the world.
import { CHUNK, HEIGHT, SEA } from './config.js';
import { B, BLOCKS, isOpaque, opacityOf, emitOf } from './blocks.js';
import { WorldGen } from './worldgen.js';

export const cidx = (x,y,z) => (y<<8)|(z<<4)|x;
const widx = cidx;

const DIRS = [
  [ 1,0,0],[-1,0,0],
  [ 0,1,0],[0,-1,0],
  [ 0,0,1],[0,0,-1]
];

export class Chunk {
  constructor(cx,cz){
    this.cx=cx; this.cz=cz;
    this.blocks=new Uint8Array(CHUNK*CHUNK*HEIGHT);
    this.light=new Uint8Array(CHUNK*CHUNK*HEIGHT);
    this.hmap=new Uint8Array(CHUNK*CHUNK);
    this.state=1;
    this.generated=false;
    this.dirtyMesh=true;
    this.mesh=null;
    this.meshW=null;
  }
}

export class World {
  constructor(seed){
    this.seed=seed|0;
    this.gen=new WorldGen(this.seed);
    this.chunks=new Map();
    this.edits=new Map();          // "cx,cz" -> Map(idx->id), persisted
    this.containers=new Map();     // "x,y,z" -> {type:'chest'|'furnace', ...}
    this.meta=new Map();           // "x,y,z" -> {facing?, wire?}
    this.spawn=null;
    this.time=0.30;                // 0..1 day fraction
    this.weather={rain:0,target:0,timer:120};
    this.genQueue=[];
    this.lightQueue=[];            // chunks needing relight
    this.falling=[];               // scheduled gravity blocks
    this.onBlockChange=null;
    this.onExplosion=null;
    this.randomTickAcc=0;
    this._lset=new Set();
  }

  key(cx,cz){ return cx+','+cz; }
  sunElev(){
    const s=Math.sin((this.time-0.25)*Math.PI*2);
    return s;
  }
  chunkAt(cx,cz){ return this.chunks.get(this.key(cx,cz)); }
  isLoaded(x,z){ return this.chunks.has((Math.floor(x)>>4)+','+(Math.floor(z)>>4)); }
  isLoadedAt(x,z){ return this.chunks.has((x>>4)+','+(z>>4)); }

  ensureChunk(cx,cz){
    const k=this.key(cx,cz);
    let c=this.chunks.get(k);
    if(c) return c;
    c=new Chunk(cx,cz);
    const heights=this.gen.generateChunkBlocks(cx,cz,c.blocks);
    for(let i=0;i<256;i++) c.hmap[i]=Math.max(0,heights[i]);
    const ed=this.edits.get(k);
    if(ed) for(const [i,id] of ed) c.blocks[i]=id;
    this.rebuildHmap(c);
    c.generated=true;
    this.chunks.set(k,c);
    c.generated=true;
    this.relightChunk(c);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const n=this.chunkAt(cx+dx,cz+dz);
      if(n&&n.generated) this.markLightDirty(n);
    }
    return c;
  }

  rebuildHmap(c){
    for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++){
      let top=SEA;
      for(let y=HEIGHT-1;y>=0;y--){
        const id=c.blocks[cidx(x,y,z)];
        if(id!==B.AIR && !BLOCKS[id].cross && id!==B.WATER && id!==B.LAVA){ top=Math.max(y+1,SEA); break; }
        if(y===0) top=SEA;
      }
      c.hmap[z*CHUNK+x]=top;
    }
  }

  getBlock(x,y,z){
    if(y<0) return B.BEDROCK;
    if(y>=HEIGHT) return B.AIR;
    x=Math.floor(x); z=Math.floor(z);
    const cx=x>>4, cz=z>>4;
    const c=this.chunks.get(cx+','+cz);
    if(!c||!c.generated) return B.AIR;
    return c.blocks[cidx(x-(cx<<4),y,z-(cz<<4))];
  }
  getBlockOrGen(x,y,z){
    if(y<0) return B.BEDROCK;
    if(y>=HEIGHT) return B.AIR;
    x=Math.floor(x); z=Math.floor(z);
    const cx=x>>4, cz=z>>4;
    let c=this.chunks.get(cx+','+cz);
    if(!c) c=this.ensureChunk(cx,cz);
    return c.blocks[cidx(x-(cx<<4),y,z-(cz<<4))];
  }
  lightGet(x,y,z){
    if(y<0||y>=HEIGHT) return 0xF0;
    const cx=x>>4, cz=z>>4;
    const c=this.chunks.get(cx+','+cz);
    if(!c||!c.generated) return 0xF0;
    return c.light[widx(x-(cx<<4),y,z-(cz<<4))];
  }
  lightSetRaw(x,y,z,v){
    if(y<0||y>=HEIGHT) return;
    const cx=x>>4, cz=z>>4;
    const c=this.chunks.get(cx+','+cz);
    if(!c||!c.generated) return;
    c.light[widx(x-(cx<<4),y,z-(cz<<4))]=v;
    c.dirtyMesh=true;
  }
  skyAt(x,y,z){ return this.lightGet(Math.floor(x),Math.floor(y),Math.floor(z))>>4; }
  blkAt(x,y,z){ return this.lightGet(Math.floor(x),Math.floor(y),Math.floor(z))&15; }
  lightLevelAt(x,y,z){
    const v=this.lightGet(Math.floor(x),Math.floor(y),Math.floor(z));
    return Math.max((v>>4)/15*this.dayLight(),(v&15)/15);
  }
  dayLight(){
    const s=Math.sin((this.time-0.25)*Math.PI*2);
    return Math.min(1,Math.max(0.12,(s+0.22)*1.6));
  }

  markDirty(cx,cz){ const c=this.chunkAt(cx,cz); if(c) c.dirtyMesh=true; }
  markLightDirty(c){ const k=this.key(c.cx,c.cz); if(!this._lset.has(k)){ this._lset.add(k); this.lightQueue.push(k);} }

  setBlock(x,y,z,id,opts={}){
    if(y<1||y>=HEIGHT) return false;
    x=Math.floor(x); z=Math.floor(z); y=Math.floor(y);
    const cx=x>>4, cz=z>>4;
    const c=this.chunks.get(cx+','+cz);
    if(!c||!c.generated) return false;
    const lx=x-(cx<<4), lz=z-(cz<<4);
    const i=widx(lx,y,lz);
    if(c.blocks[i]===id) return false;
    const old=c.blocks[i];
    c.blocks[i]=id;
    if(opts.record!==false){
      let ed=this.edits.get(this.key(cx,cz));
      if(!ed){ ed=new Map(); this.edits.set(this.key(cx,cz),ed); }
      ed.set(i,id);
    }
    const colKey=lz*CHUNK+lx;
    let top=SEA;
    for(let yy=HEIGHT-1;yy>=0;yy--){
      const b2=c.blocks[cidx(lx,yy,lz)];
      if(b2!==B.AIR && !BLOCKS[b2].cross && b2!==B.WATER && b2!==B.LAVA){ top=yy+1; break; }
    }
    c.hmap[colKey]=Math.max(top,SEA);

    const wasEmit=emitOf(old), nowEmit=emitOf(id);
    const oldOp=opacityOf(old), newOp=opacityOf(id);

    if((old===B.LEVER_OFF||old===B.LEVER_ON||(old===B.WIRE_OFF||old===B.WIRE_ON)||(id===B.WIRE_OFF||id===B.WIRE_ON)||id===B.LAMP_ON||id===B.LAMP_OFF||old===B.LAMP_ON||old===B.LAMP_OFF)&&this.queueCircuit){
      this.queueCircuit(x,y,z);
    }

    if(newOp>oldOp){
      this.removeLightBFS(x,y,z,0);
      if(wasEmit>nowEmit||nowEmit===0) this.removeLightBFS(x,y,z,1);
      this.flushQueue();
    } else if(newOp<oldOp){
      this.revealSkyColumn(x,z);
      for(const[dx,dy,dz]of[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
        const v=this.lightGet(x+dx,y+dy,z+dz);
        if((v>>4)>1)this.qPush(x+dx,y+dy,z+dz,v>>4,0);
        if((v&15)>1)this.qPush(x+dx,y+dy,z+dz,v&15,1);
      }
      if(nowEmit>wasEmit&&nowEmit>0){ c.light[i]=(c.light[i]&0xF0)|nowEmit; this.qPush(x,y,z,nowEmit,1); }
      this.flushQueue();
    }
    if(nowEmit>wasEmit&&newOp>=oldOp&&nowEmit>0){
      c.light[i]=(c.light[i]&0xF0)|nowEmit;
      this.qPush(x,y,z,nowEmit,1);
      this.flushQueue();
    }

    this.markDirty(cx,cz);
    if(lx===0) this.markDirty(cx-1,cz); if(lx===15) this.markDirty(cx+1,cz);
    if(lz===0) this.markDirty(cx,cz-1); if(lz===15) this.markDirty(cx,cz+1);

    if(this.onTickAround) this.onTickAround(x,y,z);
    this.scheduleTick(x,y,z,0.12);
    for(const[dx,dy,dz]of[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) this.scheduleTick(x+dx,y+dy,z+dz,0.12);

    if((old===B.CHEST||old===B.FURNACE||old===B.FURNACE_LIT)&&this.onContainerRemoved)
      this.onContainerRemoved(x,y,z);
    if(this.onBlockChange) this.onBlockChange(x,y,z,id,old);
    return true;
  }

  relightChunk(c){
    c.light.fill(0);
    const bx=c.cx<<4,bz=c.cz<<4;
    const q=[];
    for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++){
      let lv=15;
      for(let y=HEIGHT-1;y>=0;y--){
        const i=(y<<8)|(z<<4)|x;
        const op=c.blocks[i]===B.AIR?0:opacityOf(c.blocks[i]);
        lv=op>=15?0:Math.max(0,lv-op);
        if(lv>0){
          c.light[i]|=lv<<4;
          if(lv>1)q.push(bx+x,y,bz+z,lv,0);
        }
      }
      for(let y=HEIGHT-1;y>=0;y--){
        const i=(y<<8)|(z<<4)|x;
        const em=emitOf(c.blocks[i]);
        if(em>0){
          c.light[i]=(c.light[i]&0xF0)|em;
          q.push(bx+x,y,bz+z,em,1);
        }
      }
    }
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const n=this.chunkAt(c.cx+dx,c.cz+dz);
      if(!n||!n.generated)continue;
      const exX=dx===1?(n.cx<<4):(dx===-1?((n.cx<<4)+15):null);
      const ezZ=dz===1?(n.cz<<4):(dz===-1?((n.cz<<4)+15):null);
      for(let a=0;a<16;a++){
        const wx=exX!==null?exX:((n.cx<<4)+a);
        const wz=ezZ!==null?ezZ:((n.cz<<4)+a);
        for(let y=1;y<HEIGHT-1;y++){
          const v=n.light[(y<<8)|(((wz&15))<<4)|(wx&15)];
          if((v>>4)>1)q.push(wx,y,wz,v>>4,0);
          if((v&15)>1)q.push(wx,y,wz,v&15,1);
        }
      }
    }
    this._q=this._q||[];
    for(const e of q)this._q.push(e);
    this.flushQueue();
  }

  qPush(x,y,z,lv,ch){
    this._q=this._q||[];
    this._q.push(x,y,z,lv,ch);
  }

  flushQueue(){
    const q=this._q;
    if(!q||q.length===0) return;
    let qi=0;
    while(qi<q.length){
      const x=q[qi], y=q[qi+1], z=q[qi+2], lv=q[qi+3], ch=q[qi+4];
      qi+=5;
      if(y<0||y>=HEIGHT) continue;
      const cur=this.lightGet(x,y,z);
      const curC = ch===0?(cur>>4):(cur&15);
      if(curC>=lv) continue;
      this.lightSetRaw(x,y,z, ch===0?((cur&15)|(lv<<4)):((cur&0xF0)|lv));
      for(let d=0;d<6;d++){
        const nx=x+(d===0?1:d===1?-1:0);
        const ny=y+(d===2?1:d===3?-1:0);
        const nz=z+(d===4?1:d===5?-1:0);
        if(ny<0||ny>=HEIGHT) continue;
        const nid=this.getBlock(nx,ny,nz);
        const op=nid===B.AIR?0:opacityOf(nid);
        if(op>=15) continue;
        let nl;
        if(ch===0&&d===3&&lv===15&&op===0) nl=15;
        else nl=lv-Math.max(1,op);
        if(nl<=0) continue;
        const nc=this.lightGet(nx,ny,nz);
        const nv = ch===0?(nc>>4):(nc&15);
        if(nv>=nl) continue;
        q.push(nx,ny,nz,nl,ch);
      }
      if(qi>500000){ q.splice(0,qi); qi=0; }
    }
    q.length=0;
  }

  removeLightBFS(x,y,z,ch){
    const cur=this.lightGet(x,y,z);
    const lv = ch===0?(cur>>4):(cur&15);
    if(lv===0) return;
    const rq=[[x,y,z,lv]];
    if(ch===0) this.lightSetRaw(x,y,z,(cur&15)); else this.lightSetRaw(x,y,z,(cur&0xF0));
    const frontier=[];
    let qi=0;
    while(qi<rq.length){
      const[pX,pY,pZ,pL]=rq[qi++];
      for(let d=0;d<6;d++){
        const nx=pX+(d===0?1:d===1?-1:0);
        const ny=pY+(d===2?1:d===3?-1:0);
        const nz=pZ+(d===4?1:d===5?-1:0);
        if(ny<0||ny>=HEIGHT) continue;
        const tv=this.lightGet(nx,ny,nz);
        const tl = ch===0?(tv>>4):(tv&15);
        if(tl===0) continue;
        if(tl<pL||(ch===0&&d===3&&pL===15&&tl===15)){
          if(ch===0) this.lightSetRaw(nx,ny,nz,(tv&15)); else this.lightSetRaw(nx,ny,nz,(tv&0xF0));
          rq.push([nx,ny,nz,tl]);
        } else {
          frontier.push([nx,ny,nz,tl]);
        }
      }
    }
    for(const[fx,fy,fz,fl]of frontier) this.qPush(fx,fy,fz,fl,ch);
  }

  revealSkyColumn(x,z){
    const cx=x>>4, cz=z>>4;
    const c=this.chunkAt(cx,cz);
    if(!c||!c.generated) return;
    const lx=x-(cx<<4), lz=z-(cz<<4);
    let lv=15;
    for(let y=HEIGHT-1;y>=0;y--){
      const i=widx(lx,y,lz);
      const op=opacityOf(c.blocks[i]);
      lv=op>=15?0:Math.max(0,lv-op);
      const cur=c.light[i]>>4;
      if(lv>cur){
        c.light[i]=(c.light[i]&15)|(lv<<4);
        c.dirtyMesh=true;
        if(lv>1) this.qPush(x,y,z,lv,0);
      }
      if(lv===0&&cur===0&&y<c.hmap[lz*16+lx]-2) break;
    }
  }

  scheduleTick(x,y,z,delay){
    this.pendingTicks=this.pendingTicks||[];
    if(this.pendingTicks.length>4096) this.pendingTicks.splice(0,512);
    this.pendingTicks.push({t:performance.now()/1000+delay,x,y,z});
  }

  processTicks(){
    if(!this.pendingTicks) return;
    const now=performance.now()/1000;
    let n=0;
    for(let i=0;i<this.pendingTicks.length;i++){
      const t=this.pendingTicks[i];
      if(t.t<=now){
        this.pendingTicks.splice(i--,1);
        n++;
        this.tickBlock(t.x,t.y,t.z);
        if(n>=96) break;
      }
    }
  }

  tickBlock(x,y,z){
    const id=this.getBlock(x,y,z);
    if(id===B.SAND||id===B.GRAVEL){
      const below=this.getBlock(x,y-1,z);
      if(below===B.AIR||below===B.WATER||(BLOCKS[below]&&BLOCKS[below].cross)){
        this.setBlock(x,y,z,B.AIR,{record:true});
        this.setBlock(x,y-1,z,id,{record:true});
      }
      return;
    }
    if(BLOCKS[id]&&(BLOCKS[id].cross||id===B.TORCH)){
      if(!isOpaque(this.getBlock(x,y-1,z))){
        this.setBlock(x,y,z,B.AIR,{record:true});
        if(id!==B.TALLGRASS&&this.dropAt) this.dropAt(x+0.5,y+0.3,z+0.5,this.dropIdOf(id),1);
      }
    }
  }

  dropIdOf(id){
    const d=BLOCKS[id];
    if(d&&typeof d.drop==='number') return d.drop;
    return id;
  }

  surfaceY(x,z){
    x=Math.floor(x); z=Math.floor(z);
    const cx=x>>4, cz=z>>4;
    const c=this.chunkAt(cx,cz);
    if(c&&c.generated){
      let y=c.hmap[(z-(cz<<4))*CHUNK+(x-(cx<<4))];
      while(y<HEIGHT&&(this.getBlock(x,y,z)===B.WATER)) y++;
      return Math.min(y,HEIGHT-2);
    }
    return Math.min(HEIGHT-2,Math.max(SEA+1,Math.floor(this.gen.heightAt(x,z))+1));
  }

  raycast(ox,oy,oz,dx,dy,dz,maxDist){
    let x=Math.floor(ox), y=Math.floor(oy), z=Math.floor(oz);
    const stepX=dx>0?1:-1, stepY=dy>0?1:-1, stepZ=dz>0?1:-1;
    const tDX=Math.abs(1/(dx||1e-9)), tDY=Math.abs(1/(dy||1e-9)), tDZ=Math.abs(1/(dz||1e-9));
    let tMX=(stepX>0?(x+1-ox):(ox-x))*tDX;
    let tMY=(stepY>0?(y+1-oy):(oy-y))*tDY;
    let tMZ=(stepZ>0?(z+1-oz):(oz-z))*tDZ;
    let face=[0,0,0];
    let dist=0;
    for(let iter=0;iter<256;iter++){
      const id=this.getBlock(x,y,z);
      if(id!==B.AIR&&id!==B.WATER&&id!==B.LAVA){
        return {x,y,z,id,face,dist};
      }
      if(tMX<tMY){
        if(tMX<tMZ){ x+=stepX; dist=tMX; tMX+=tDX; face=[-stepX,0,0]; }
        else { z+=stepZ; dist=tMZ; tMZ+=tDZ; face=[0,0,-stepZ]; }
      } else {
        if(tMY<tMZ){ y+=stepY; dist=tMY; tMY+=tDY; face=[0,-stepY,0]; }
        else { z+=stepZ; dist=tMZ; tMZ+=tDZ; face=[0,0,-stepZ]; }
      }
      if(dist>maxDist) return null;
    }
    return null;
  }

  randomTicks(n){
    const keys=[...this.chunks.keys()];
    for(let i=0;i<n;i++){
      if(!keys.length) return;
      const k=keys[(Math.random()*keys.length)|0];
      const c=this.chunks.get(k);
      if(!c||!c.generated) continue;
      const x=c.cx*16+(Math.random()*16|0);
      const z=c.cz*16+(Math.random()*16|0);
      const y=Math.random()*HEIGHT|0;
      const id=c.blocks[cidx(x-(c.cx<<4),y,z-(c.cz<<4))];
      if(id===B.GRASS){
        const above=this.getBlock(x,y+1,z);
        if(opacityOf(above)>=15 || this.skyAt(x,y+1,z)<9){
          if(Math.random()<0.35) this.setBlock(x,y,z,B.DIRT,{record:false});
        } else if(Math.random()<0.3){
          const d=[[1,0],[-1,0],[0,1],[0,-1]][(Math.random()*4)|0];
          if(this.getBlock(x+d[0],y,z+d[1])===B.DIRT && this.getBlock(x+d[0],y+1,z+d[1])===B.AIR)
            this.setBlock(x+d[0],y,z+d[1],B.GRASS,{record:false});
        }
      }
      else if(id===B.SAPLING && Math.random()<0.18 && this.skyAt(x,y,z)>7){
        this.growTree(x,y,z);
      }
      else if(id===B.WHEAT0 && Math.random()<0.35){ this.setBlock(x,y,z,B.WHEAT1,{record:true}); }
      else if(id===B.WHEAT1 && Math.random()<0.30){ this.setBlock(x,y,z,B.WHEAT2,{record:true}); }
      else if((id===B.LEAVES||id===B.BIRCH_LEAVES||id===B.SPRUCE_LEAVES)&&Math.random()<0.10){
        let hasLog=false;
        outer:
        for(let r=1;r<=4;r++)
          for(let dy=-r;dy<=r;dy++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
            const b=this.getBlock(x+dx,y+dy,z+dz);
            if(b===B.LOG||b===B.SPRUCE_LOG||b===B.BIRCH_LOG){ hasLog=true; break outer; }
          }
        if(!hasLog){
          this.setBlock(x,y,z,B.AIR,{record:false});
          if(id===B.LEAVES&&Math.random()<0.08&&this.dropAt) this.dropAt(x+0.5,y+0.5,z+0.5,'apple',1);
          else if(Math.random()<0.12&&this.dropAt) this.dropAt(x+0.5,y+0.5,z+0.5,'sapling_item',1);
        }
      }
    }
  }

  growTree(x,y,z){
    const hgt=4+(Math.random()*3|0);
    for(let i=1;i<hgt;i++){
      const b=this.getBlock(x,y+i,z);
      if(b!==B.AIR&&b!==B.LEAVES) return false;
    }
    this.setBlock(x,y,z,B.LOG,{record:true});
    for(let i=1;i<hgt;i++) this.setBlock(x,y+i,z,B.LOG,{record:true});
    const cy=y+hgt-1;
    for(let dy=-2;dy<=1;dy++){
      const rad=dy>=1?1:2;
      for(let dx=-rad;dx<=rad;dx++)for(let dz=-rad;dz<=rad;dz++){
        if(dy>=1&&Math.abs(dx)+Math.abs(dz)>1)continue;
        if(dx===0&&dz===0&&dy<1)continue;
        if(Math.abs(dx)===2&&Math.abs(dz)===2&&Math.random()<0.5)continue;
        const tx=x+dx,ty=cy+dy,tz=z+dz;
        if(this.getBlock(tx,ty,tz)===B.AIR) this.setBlock(tx,ty,tz,B.LEAVES,{record:true});
      }
    }
    return true;
  }

  update(dt,pcx,pcz,renderDist){
    this.processTicks();
    this.updateFalling(dt);
    const R=renderDist+1;
    if(this._wantR!==R||this._wpcx!==pcx||this._wpcz!==pcz){
      this._wantR=R; this._wpcx=pcx; this._wpcz=pcz;
      this.genQueue.length=0;
      for(let dz=-R;dz<=R;dz++)for(let dx=-R;dx<=R;dx++){
        if(dx*dx+dz*dz>R*R+2) continue;
        const cx=pcx+dx, cz=pcz+dz;
        if(!this.chunks.has(this.key(cx,cz))) this.genQueue.push({cx,cz,d:dx*dx+dz*dz});
      }
      this.genQueue.sort((a,b)=>b.d-a.d);
      for(const [k,c] of this.chunks){
        const dx=c.cx-pcx, dz=c.cz-pcz;
        if(dx*dx+dz*dz>(R+3)*(R+3)){
          if(c.meshObj&&this.disposeMesh) this.disposeMesh(c);
          this.chunks.delete(k);
        }
      }
    }
    const budgetEnd=performance.now()+6;
    while(this.genQueue.length && performance.now()<budgetEnd){
      const j=this.genQueue.pop();
      this.ensureChunk(j.cx,j.cz);
    }
    if(this._lset.size){
      const end=performance.now()+4;
      while(this.lightQueue.length && performance.now()<end){
        const k=this.lightQueue.shift();
        this._lset.delete(k);
        const c=this.chunks.get(k);
        if(c&&c.generated) this.relightChunk(c);
      }
    }
    this.randomTickAcc+=dt;
    if(this.randomTickAcc>0.25){
      this.randomTicks(Math.min(48,(this.chunks.size>>2))+6);
      this.randomTickAcc=0;
    }
  }

  updateFalling(dt){
    if(!this.falling.length) return;
    for(let i=this.falling.length-1;i>=0;i--){
      const f=this.falling[i];
      f.t-=dt;
      if(f.t>0) continue;
      f.t=0.07;
      const id=this.getBlock(f.x,f.y,f.z);
      if(!(id===B.SAND||id===B.GRAVEL)){ this.falling.splice(i,1); continue; }
      const below=this.getBlock(f.x,f.y-1,f.z);
      if(below===B.AIR||below===B.WATER){
        this.setBlock(f.x,f.y,f.z,B.AIR,{record:true});
        this.setBlock(f.x,f.y-1,f.z,id,{record:true});
        f.y--;
      } else this.falling.splice(i,1);
    }
  }

  unloadChunk(k,c){
    if(c.meshObj&&this.disposeMesh) this.disposeMesh(c);
    this.chunks.delete(k);
  }

  queueCircuit(x,y,z){
    void x;void y;void z;
  }

  explode(ex,ey,ez,radius,onEntityDamage){
    const destroyed=[];
    const r=Math.ceil(radius);
    const touched=new Set();
    for(let dy=-r;dy<=r;dy++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
      const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(d>radius*(0.85+Math.random()*0.15)) continue;
      const x=ex+dx, y=ey+dy, z=ez+dz;
      const id=this.getBlockOrGen(x,y,z);
      if(id===B.AIR||id===B.BEDROCK||id===B.WATER) continue;
      if(id===B.TNT){ destroyed.push([x,y,z,id,true]); this.setBlock(x,y,z,B.AIR,{record:false}); continue; }
      if(Math.random()<0.28) destroyed.push([x,y,z,this.dropIdOf(id),false]);
      this.setBlock(x,y,z,B.AIR,{record:false});
      let ed=this.edits.get((x>>4)+','+(z>>4));
      if(ed) ed.set(widx(x&15,y,z&15),B.AIR);
      touched.add((x>>4)+','+(z>>4));
    }
    for(const k of touched){
      const parts=k.split(',').map(Number);
      const c=this.chunkAt(parts[0],parts[1]);
      if(c){ this.markLightDirty(c); }
      for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const c2=this.chunkAt(parts[0]+dx,parts[1]+dz);
        if(c2){ c2.dirtyMesh=true; this.markLightDirty(c2); }
      }
    }
    if(onEntityDamage) onEntityDamage(ex,ey,ez,radius*1.7,22);
    if(this.onExplosion) this.onExplosion(ex,ey,ez,radius,destroyed);
    return destroyed;
  }

  collectLights(px,py,pz,maxN=24){
    const out=[];
    const pcx=Math.floor(px)>>4, pcz=Math.floor(pz)>>4;
    const seen=new Set();
    for(let dcx=-2;dcx<=2;dcx++)for(let dcz=-2;dcz<=2;dcz++){
      const c=this.chunkAt(pcx+dcx,pcz+dcz);
      if(!c||!c.generated) continue;
      const bx=c.cx<<4, bz=c.cz<<4;
      for(let y=1;y<HEIGHT-1;y++)for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++){
        const em=emitOf(c.blocks[cidx(x,y,z)]);
        if(em<6) continue;
        const wx=bx+x, wy=y, wz=bz+z;
        const gk=Math.floor(wx/4)+'_'+Math.floor(wy/4)+'_'+Math.floor(wz/4);
        const d2=(wx-px)**2+(wy-py)**2+(wz-pz)**2;
        if(seen.has(gk)){
          for(const o of out){
            if(o.gk===gk&&o.d2>d2){ o.x=wx;o.y=wy;o.z=wz;o.d2=d2;o.em=em; break; }
          }
          continue;
        }
        seen.add(gk);
        out.push({x:wx+0.5,y:wy+0.6,z:wz+0.5,d2,em,gk});
      }
    }
    out.sort((a,b)=>a.d2-b.d2);
    return out.slice(0,maxN);
  }

  serializeEdits(){
    const out={};
    for(const [k,m] of this.edits){
      if(m.size===0) continue;
      const arr=[];
      for(const [i,id] of m){ arr.push(i,id); }
      out[k]=arr;
    }
    return out;
  }
  loadEdits(obj){
    this.edits.clear();
    if(!obj) return;
    for(const k in obj){
      const arr=obj[k];
      const m=new Map();
      for(let i=0;i<arr.length;i+=2) m.set(arr[i],arr[i+1]);
      this.edits.set(k,m);
    }
  }
}

Object.assign(World.prototype,{
  relightChunk(c){
    if(!this._q)this._q=[];
    const q=this._q;
    q.length=0;
    c.light.fill(0);
    const bx=c.cx<<4,bz=c.cz<<4;
    for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++){
      let lv=15;
      for(let y=HEIGHT-1;y>=0;y--){
        const i=widx(x,y,z);
        const id=c.blocks[i];
        const op=id===B.AIR?0:opacityOf(id);
        if(op>=15){lv=0;continue;}
        if(op>0)lv=Math.max(0,lv-op);
        if(lv>0){
          c.light[i]|=(lv<<4);
          q.push(bx+x,y,bz+z,lv,0);
        }
      }
      for(let y=HEIGHT-1;y>=0;y--){
        const i=widx(x,y,z);
        const em=emitOf(c.blocks[i]);
        if(em>0){
          c.light[i]=(c.light[i]&0xF0)|em;
          q.push(bx+x,y,bz+z,em,1);
        }
      }
    }
    const nb=[[-1,0],[1,0],[0,-1],[0,1]];
    for(const[dx,dz]of nb){
      const n=this.chunkAt(c.cx+dx,c.cz+dz);
      if(!n||!n.generated)continue;
      const nx=n.cx<<4,nz=n.cz<<4;
      const edgeX=dx===1?nx:(dx===-1?nx+CHUNK-1:null);
      const edgeZ=dz===1?nz:(dz===-1?nz+CHUNK-1:null);
      for(let a=0;a<CHUNK;a++){
        const wx=edgeX!==null?edgeX:nx+a;
        const wz=edgeZ!==null?edgeZ:nz+a;
        for(let y=1;y<HEIGHT-1;y++){
          const v=n.light[widx(wx-nx,y,wz-nz)];
          if((v>>4)>1)q.push(wx,y,wz,v>>4,0);
          if((v&15)>1)q.push(wx,y,wz,v&15,1);
        }
      }
    }
    this.flushQueue();
  }

  ,relightAround(x,y,z){
    const cx=x>>4,cz=z>>4;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      const c=this.chunkAt(cx+dx,cz+dz);
      if(c&&c.generated)this.relightChunk(c);
    }
  }
});
