// World generation: biomes, terrain, caves, ores, trees, structures. Pure functions of seed.
import { Noise, hash2 } from './noise.js';
import { B } from './blocks.js';
import { CHUNK, HEIGHT, SEA } from './config.js';

export class WorldGen {
  constructor(seed){
    this.seed=seed|0;
    this.nContinent=new Noise(seed*3+11);
    this.nHills=new Noise(seed*7+23);
    this.nMount=new Noise(seed*13+41);
    this.nTemp=new Noise(seed*17+59);
    this.nMoist=new Noise(seed*19+73);
    this.nCaveA=new Noise(seed*29+97);
    this.nCaveB=new Noise(seed*31+113);
    this.nCaveC=new Noise(seed*37+131);
    this.nOre=new Noise(seed*43+149);
    this.nRiver=new Noise(seed*47+167);
  }
  continent(x,z){ return this.nContinent.fbm2(x*0.0016,z*0.0016,4); }
  riverV(x,z){
    const r=Math.abs(this.nRiver.fbm2(x*0.0021+77,z*0.0021,2));
    return r<0.035?(1-r/0.035):0;
  }
  temp(x,z){ return this.nTemp.fbm2((x+3000)*0.0011,(z-2000)*0.0011,3)*0.5+0.5; }
  moist(x,z){ return this.nMoist.fbm2((x-4000)*0.0011-555,(z+1500)*0.0011,3)*0.5+0.5; }
  heightAt(x,z){
    const c=this.continent(x,z);
    const mMask=s01((c-0.18)/0.5);
    const ridge=this.nMount.ridge2(x*0.004+99,z*0.004,4);
    let h=SEA+c*26+this.nHills.fbm2(x*0.012,z*0.012,4)*9;
    h+=mMask*Math.pow(Math.max(0,ridge),1.6)*52;
    const rv=this.riverV(x,z);
    if(rv>0&&h>SEA-4)h=h+(SEA-3.2-h)*Math.min(1,rv*1.6);
    if(c<-0.22)h-=(-0.22-c)*70;
    return h;
  }
  biomeAt(x,z,h){
    if(h===undefined)h=this.heightAt(x,z);
    const t=this.temp(x,z),m=this.moist(x,z);
    if(h<SEA-6)return 'ocean';
    if(h<=SEA+1)return t<-0.42?'snowy_beach':'beach';
    if(h>SEA+38||(h>SEA+26&&m<0))return 'mountains';
    if(t<-0.42)return 'snowy';
    if(t<-0.15)return 'taiga';
    if(t>0.34&&m<0.02)return 'desert';
    if(m>0.16)return 'forest';
    if(m>0.04&&t>-0.05)return 'birch_forest';
    return 'plains';
  }
  caveAt(x,y,z){
    if(y<3||y>SEA+30)return false;
    const a=this.nCaveA.perlin3(x*0.028,y*0.038,z*0.028);
    const b=this.nCaveB.perlin3(x*0.028+50,y*0.038,z*0.028+50);
    if(a*a+b*b<0.012)return true;
    if(y<36){
      const ch=this.nCaveC.fbm3(x*0.02,y*0.03,z*0.02,3);
      if(ch>0.44)return true;
    }
    return false;
  }
  oreAt(x,y,z){
    const n=this.nOre.perlin3(x*0.11,y*0.11,z*0.11);
    if(y<16&&n>0.62)return B.DIAMOND_ORE;
    if(y<30&&n>0.60)return B.GOLD_ORE;
    if(y<58&&n>0.545)return B.IRON_ORE;
    if(n>0.50)return B.COAL_ORE;
    if(this.nOre.perlin3(x*0.07+400,y*0.07,z*0.07)>0.56)return B.GRAVEL;
    return B.STONE;
  }
  treeRoll(x,z){ return hash2(this.seed^0x51ab,x,z); }
  generateChunkBlocks(cx,cz,out){
    out.fill(0);
    const bx=cx*CHUNK,bz=cz*CHUNK;
    const heights=new Int16Array(CHUNK*CHUNK);
    for(let z=0;z<CHUNK;z++)for(let x=0;x<CHUNK;x++){
      const wx=bx+x,wz=bz+z;
      const hF=this.heightAt(wx,wz),h=Math.floor(hF);
      heights[z*CHUNK+x]=h;
      const biome=this.biomeAt(wx,wz,hF);
      for(let y=0;y<=Math.max(h,SEA);y++){
        let id=B.AIR;
        if(y===0||(y<3&&hash2(this.seed^777,wx*31+y,wz*17)<0.55-y*0.15))id=B.BEDROCK;
        else if(y<=h){
          if(biome==='desert'||biome==='beach'){
            id=y>h-4?B.SAND:(y>h-7?B.SANDSTONE:this.stoneOrOre(wx,y,wz));
          } else if(biome==='ocean'){
            id=y>h-3?B.SAND:(y>h-5?B.GRAVEL:this.stoneOrOre(wx,y,wz));
          } else if(biome==='mountains'){
            id=y===h?(h>86?(h>94?B.SNOW:B.STONE):B.STONE):(h-y<4?B.STONE:this.stoneOrOre(wx,y,wz));
          } else {
            if(y===h)id=(biome==='snowy'||biome==='snowy_beach')?B.SNOW_GRASS:B.GRASS;
            else if(y>h-4)id=B.DIRT;
            else id=this.stoneOrOre(wx,y,wz);
          }
        } else if(y<=SEA)id=B.WATER;
        if(id!==B.AIR&&id!==B.WATER&&id!==B.BEDROCK&&y>2&&this.caveAt(wx,y,wz)){
          id=(y<11&&y<h-6)?B.LAVA:B.AIR;
        }
        out[(y<<8)|(z<<4)|x]=id;
      }
      if((biome==='snowy'||biome==='snowy_beach')&&h<SEA)out[(SEA<<8)|(z<<4)|x]=B.ICE;
    }
    for(let z=2;z<14;z++)for(let x=2;x<14;x++){
      const wx=bx+x,wz=bz+z;
      const h=heights[z*CHUNK+x];
      if(h<=SEA||this.caveAt(wx,h,wz))continue;
      const top=out[(h<<8)|(z<<4)|x];
      const r=this.treeRoll(wx,wz);
      const biome=this.biomeAt(wx,wz,h);
      const dens={forest:0.055,birch_forest:0.05,taiga:0.05,snowy:0.02,plains:0.006,mountains:0.004,desert:0.008}[biome]||0;
      if(r<dens){
        if(biome==='desert')this.placeCactus(out,x,h+1,z,r);
        else this.placeTree(out,x,h+1,z,biome,r);
        continue;
      }
      const r2=hash2(this.seed^0xabc1,wx,wz);
      if(top===B.GRASS){
        if(r2<0.10)out[((h+1)<<8)|(z<<4)|x]=B.TALLGRASS;
        else if(r2<0.115)out[((h+1)<<8)|(z<<4)|x]=B.FLOWER_R;
        else if(r2<0.128)out[((h+1)<<8)|(z<<4)|x]=B.FLOWER_Y;
      }
    }
    this.structure(cx,cz,out,heights);
    return heights;
  }
  stoneOrOre(x,y,z){ return this.oreAt(x,y,z); }
  placeTree(out,x,y,z,biome,r){
    let logId=B.LOG,leafId=B.LEAVES,hgt=4+(r*7919|0)%3,shape='round';
    if(biome==='taiga'||biome==='snowy'||biome==='mountains'){
      logId=B.SPRUCE_LOG;leafId=B.SPRUCE_LEAVES;shape='conifer';hgt=6+(r*104729|0)%3;
    } else if(biome==='birch_forest'){logId=B.BIRCH_LOG;leafId=B.BIRCH_LEAVES;}
    const set=(xx,yy,zz,id,keep)=>{
      const i=(yy<<8)|(zz<<4)|xx;
      if(xx<0||xx>15||zz<0||zz>15||yy<0||yy>=HEIGHT)return;
      if(keep&&out[i]!==B.AIR)return;
      out[i]=id;
    };
    if(shape==='conifer'){
      for(let i=0;i<hgt;i++)set(x,y+i,z,logId);
      set(x,y+hgt,z,leafId,true);
      for(let layer=hgt-1;layer>=2;layer--){
        const radius=((hgt-layer)%2===0)?Math.min(2,(hgt-layer)/2|0)+1:1;
        const ly=y+layer;
        for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){
          if(Math.abs(dx)+Math.abs(dz)>radius+(radius>1?1:0))continue;
          if(dx===0&&dz===0&&layer<hgt-1)continue;
          set(x+dx,ly,z+dz,leafId,true);
        }
      }
    } else {
      for(let i=0;i<hgt;i++)set(x,y+i,z,logId);
      const cy=y+hgt-1;
      for(let dy=-2;dy<=1;dy++){
        const rad=dy>=1?1:2;
        for(let dx=-rad;dx<=rad;dx++)for(let dz=-rad;dz<=rad;dz++){
          if(dy>=1&&Math.abs(dx)+Math.abs(dz)>1)continue;
          if(Math.abs(dx)===2&&Math.abs(dz)===2&&hash2(this.seed^dy,x*3+dx,z*5+dz)<0.55)continue;
          if(dx===0&&dz===0&&dy<1)continue;
          set(x+dx,cy+dy,z+dz,leafId,true);
        }
      }
    }
  }
  placeCactus(out,x,y,z,r){
    const n=1+(r*15485863|0)%3;
    for(let i=0;i<n&&i<3;i++){
      const li=((y+i)<<8)|(z<<4)|x;
      if(out[li]===B.AIR)out[li]=B.CACTUS;
    }
  }
  structure(cx,cz,out,heights){
    const s=hash2(this.seed^0xC0FFEE,cx,cz);
    if(s<0.006){
      const x=4+(s*10000%8|0),z=4+(s*100000%8|0);
      const h=heights[z*CHUNK+x];
      if(h>SEA+1&&h<HEIGHT-10){
        for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
          const edge=Math.abs(dx)===2||Math.abs(dz)===2;
          for(let dy=1;dy<=3;dy++){
            const li=((h+dy)<<8)|((z+dz)<<4)|(x+dx);
            if(edge&&(dy===3||((dx+dz+4)%3!==0)))out[li]=B.MOSSY;
            else if(!edge&&dy<3)out[li]=B.AIR;
          }
          const gidx=(h<<8)|((z+dz)<<4)|(x+dx);
          if(!edge&&out[gidx]===B.WATER)out[gidx]=B.COBBLE;
        }
        out[((h+1)<<8)|(z<<4)|x]=B.CHEST;
      }
    }
    if(s>0.995){
      const y=8+(s*7919%20|0),x=3,z=3;
      for(let dy=0;dy<5;dy++)for(let dz=0;dz<7;dz++)for(let dx=0;dx<7;dx++){
        const shell=dy===0||dy===4||dz===0||dz===6||dx===0||dx===6;
        const li=((y+dy)<<8)|((z+dz)<<4)|(x+dx);
        if(shell)out[li]=(hash2(1234,dx+cx,dz+cz)<0.35)?B.MOSSY:B.COBBLE;
        else out[li]=B.AIR;
      }
      out[((y+1)<<8)|((z+5)<<4)|(x+5)]=B.CHEST;
      out[((y+1)<<8)|((z+1)<<4)|(x+1)]=B.TORCH;
    }
  }
}

const s01=t=>{t=Math.min(1,Math.max(0,t));return t*t*(3-2*t);};
