// Procedural texture atlas: every block tile painted in code into 16x16 layers.
import { mulberry32 } from './noise.js';

export const TILES = [
 'stone','dirt','cobble','planks','sand','gravel','log','log_top','leaves','glass','water','bedrock',
 'coal_ore','iron_ore','gold_ore','diamond_ore','redstone_ore',
 'crafting_top','crafting_side','furnace_side','furnace_front','furnace_front_lit','furnace_top',
 'chest_side','chest_front','chest_top','torch','tallgrass','flower_r','flower_y',
 'snow','snow_side','cactus_top','cactus_side','sandstone','sandstone_top',
 'spruce_log','spruce_log_top','spruce_leaves','birch_log','birch_log_top','birch_leaves',
 'farmland','wheat0','wheat1','wheat2','lamp_off','lamp_on','lever_off','lever_on',
 'mossy','wool','ice','tnt_side','tnt_top','ladder','sapling','glowstone','bed_top','bed_side','wire','spawner','grass_top','grass_side'
];
export const TILE_INDEX = {}; TILES.forEach((t,i)=>TILE_INDEX[t]=i);

function C(r,g,b,a=255){ return [r,g,b,a]; }

class P {
  constructor(seed){ this.d = new Uint8ClampedArray(16*16*4); this.rng = mulberry32(seed); }
  px(x,y,c){ if(x<0||y<0||x>15||y>15) return; const i=(y*16+x)*4; this.d[i]=c[0]; this.d[i+1]=c[1]; this.d[i+2]=c[2]; this.d[i+3]=c[3]===undefined?255:c[3]; }
  get(x,y){ const i=(y*16+x)*4; return [this.d[i],this.d[i+1],this.d[i+2],this.d[i+3]]; }
  fill(c){ for(let y=0;y<16;y++)for(let x=0;x<16;x++)this.px(x,y,c); }
  vary(c,amt){ const v=((this.rng()*2-1)*amt)|0; return [Math.max(0,Math.min(255,c[0]+v)),Math.max(0,Math.min(255,c[1]+v)),Math.max(0,Math.min(255,c[2]+v))]; }
  noiseFill(base,amt){ for(let y=0;y<16;y++)for(let x=0;x<16;x++)this.px(x,y,this.vary(base,amt)); }
  speck(n,c){ for(let i=0;i<n;i++) this.px((this.rng()*16)|0,(this.rng()*16)|0,this.vary(c,12)); }
  shadeEdge(a){ for(let i=0;i<16;i++){ this.dark(i,0,a); this.dark(i,15,a); this.dark(0,i,a); this.dark(15,i,a);} }
  dark(x,y,f){ const c=this.get(x,y); this.px(x,y,[c[0]*f|0,c[1]*f|0,c[2]*f|0]); }
}

function oreNuggets(p, col){
  const spots = 5 + (p.rng()*3|0);
  for(let s=0;s<spots;s++){
    let x=1+(p.rng()*13|0), y=1+(p.rng()*13|0);
    const n = 2+(p.rng()*4|0);
    for(let k=0;k<n;k++){ p.px(x,y,p.vary(col,18)); if(p.rng()<.6)p.px(x+1,y,p.vary(col,14)); if(p.rng()<.5)p.px(x,y+1,p.vary(col,14)); x+= p.rng()<.5?1:-1; y+= p.rng()<.5?1:0; x=Math.max(1,Math.min(14,x)); y=Math.max(1,Math.min(14,y)); }
  }
}

const painters = {
  grass_top(p){ p.noiseFill([106,170,64],18); p.speck(20,[88,148,52]); p.speck(12,[126,190,80]); p.shadeEdge(0.94); },
  grass_side(p){ p.noiseFill([121,85,58],16); p.speck(10,[98,66,42]);
    for(let x=0;x<16;x++){ const h=2+((p.rng()*3)|0); for(let y=0;y<h;y++)p.px(x,y,p.vary([106,170,64],16)); } },
  stone(p){ p.noiseFill([128,128,130],14); p.speck(10,[110,110,112]); p.shadeEdge(0.92);
    for(let i=0;i<3;i++){ const x=p.rng()*13|0,y=p.rng()*13|0,w=2+p.rng()*3|0; for(let k=0;k<w;k++)p.px(x+k,y,[112,112,116]); } },
  dirt(p){ p.noiseFill([121,85,58],16); p.speck(14,[98,66,42]); p.speck(6,[140,102,70]); },
  grass_top(p){ p.noiseFill([106,170,64],18); p.speck(20,[88,148,52]); p.speck(12,[126,190,80]); },
  grass_side(p){ p.noiseFill([121,85,58],16); p.speck(10,[98,66,42]);
    for(let x=0;x<16;x++){ const h=2+((p.rng()*3)|0); for(let y=0;y<h;y++)p.px(x,y,p.vary([106,170,64],16)); } },
  cobble(p){ p.fill([100,100,102]); const cells=[[0,0,6,6],[7,0,9,5],[0,7,5,9],[6,6,10,10],[11,6,16,9],[0,11,7,16],[8,11,16,16]];
    for(const[cx,cy,cw,ch]of cells){ const base=105+(p.rng()*40|0);
      for(let y=cy;y<Math.min(cy+ch-1,16);y++)for(let x=cx;x<Math.min(cx+cw-1,16);x++)p.px(x,y,p.vary([base,base,base+3],10));
      for(let x=cx;x<Math.min(cx+cw,16);x++)p.px(x,Math.min(cy+ch-1,15),[70,70,72]); }
    p.shadeEdge(0.9); },
  mossy(p){ painters.cobble(p); for(let i=0;i<26;i++){ const x=p.rng()*16|0,y=p.rng()*16|0; p.px(x,y,p.vary([90,130,60],20)); if(p.rng()<.5)p.px(Math.min(15,x+1),y,p.vary([80,120,55],20)); } },
  planks(p){ for(let y=0;y<16;y++)for(let x=0;x<16;x++){ const board=(y>>2), off=[0,3,1,4][board&3];
      let c=[162,130,78]; const g=((x*7+board*31)%5)-2; c=[c[0]+g*6,c[1]+g*5,c[2]+g*3];
      if(y%4===3)c=[c[0]-45,c[1]-38,c[2]-25]; if((x+off)%8===0)c=[c[0]-30,c[1]-24,c[2]-16]; p.px(x,y,c); } },
  sand(p){ p.noiseFill([219,207,163],10); p.speck(12,[200,186,140]); p.speck(6,[232,222,182]); },
  sandstone(p){ p.noiseFill([216,203,155],7); for(let y=0;y<16;y+=4)for(let x=0;x<16;x++)p.px(x,y,[196,180,130]);
    for(let i=0;i<8;i++){ const x=p.rng()*16|0,y=p.rng()*16|0; p.px(x,y,[205,190,142]); } },
  sandstone_top(p){ p.noiseFill([220,208,160],8); p.shadeEdge(0.94); },
  gravel(p){ p.noiseFill([136,126,120],12);
    for(let i=0;i<14;i++){ const x=p.rng()*15|0,y=p.rng()*15|0,v=100+(p.rng()*70|0); p.px(x,y,[v,v-6,v-10]); p.px(x+1,y,[v-12,v-16,v-20]); } },
  log(p){ for(let x=0;x<16;x++){ const stripe=Math.sin(x*1.7)*10;
    for(let y=0;y<16;y++){ const g=p.vary([109,84,50],8); const s=stripe+((y*13)%7-3); p.px(x,y,[g[0]+s,g[1]+s*0.8,g[2]+s*0.5]); } }
    for(let i=0;i<4;i++){ const x=p.rng()*16|0; for(let y=0;y<16;y+=2)p.px(x,y,[86,64,38]); } },
  log_top(p){ p.fill([176,142,91]); for(let r=1;r<8;r+=2){ for(let a=0;a<40;a++){ const th=a/40*Math.PI*2;
      const x=8+Math.cos(th)*r|0, y=8+Math.sin(th)*r|0; const c=r%4===1?[150,118,74]:[168,134,84]; p.px(x,y,p.vary(c,8)); } }
    p.px(8,8,[120,92,56]); p.shadeEdge(0.9); },
  spruce_log(p){ painters.log(p); for(let x=0;x<16;x++)for(let y=0;y<16;y++){ const c=p.get(x,y); p.px(x,y,[c[0]*0.82|0,c[1]*0.8|0,c[2]*0.85|0]); } },
  spruce_log_top(p){ painters.log_top(p); for(let i=0;i<256;i++){ const c=p.get(i%16,(i/16)|0); p.px(i%16,(i/16)|0,[c[0]*0.85|0,c[1]*0.83|0,c[2]*0.85|0]); } },
  birch_log(p){ p.fill([215,213,206]); for(let i=0;i<7;i++){ const y=p.rng()*16|0,x=p.rng()*10|0,w=2+p.rng()*4|0;
      for(let k=0;k<w;k++)p.px(Math.min(15,x+k),y,[70,68,62]); }
    for(let i=0;i<10;i++)p.px(p.rng()*16|0,p.rng()*16|0,[190,188,180]); },
  birch_log_top(p){ painters.log_top(p); for(let i=0;i<256;i++){ const c=p.get(i%16,(i/16)|0); p.px(i%16,(i/16)|0,[c[0]*0.95+30>255?255:c[0]*0.95+30|0,c[1]*0.93+28|0,c[2]*0.9+25|0]); } },
  leaves(p){ for(let y=0;y<16;y++)for(let x=0;x<16;x++){ const r=p.rng();
      if(r<0.12){ p.px(x,y,C(0,0,0,0)); continue; }
      const v=r<0.5?[52,120,36]:r<0.85?[64,140,44]:[76,158,54]; p.px(x,y,p.vary(v,14)); } },
  spruce_leaves(p){ for(let y=0;y<16;y++)for(let x=0;x<16;x++){ const r=p.rng();
      if(r<0.14){ p.px(x,y,C(0,0,0,0)); continue; }
      const v=r<0.5?[38,84,48]:r<0.85?[46,98,56]:[56,114,64]; p.px(x,y,p.vary(v,12)); } },
  birch_leaves(p){ for(let y=0;y<16;y++)for(let x=0;x<16;x++){ const r=p.rng();
      if(r<0.16){ p.px(x,y,C(0,0,0,0)); continue; }
      const v=r<0.5?[96,150,60]:r<0.85?[110,164,72]:[124,178,84]; p.px(x,y,p.vary(v,14)); } },
  glass(p){ for(let i=0;i<256;i++)p.px(i%16,(i/16)|0,C(210,235,245,30));
    for(let i=0;i<16;i++){ p.px(i,0,C(225,240,250,180)); p.px(i,15,C(225,240,250,180)); p.px(0,i,C(225,240,250,180)); p.px(15,i,C(225,240,250,180)); }
    p.px(3,3,C(255,255,255,120)); p.px(4,4,C(255,255,255,90)); p.px(12,10,C(255,255,255,80)); },
  water(p){ for(let y=0;y<16;y++)for(let x=0;x<16;x++){ const w=Math.sin((x+y*0.5)*0.9)*4;
      p.px(x,y,p.vary([52+w,116+w,205+w],5)); } },
  lava(p){ for(let y=0;y<16;y++)for(let x=0;x<16;x++){ const w=Math.sin(x*1.3)+Math.cos(y*1.1)+Math.sin((x+y)*0.7);
      const hot=w>0.8; p.px(x,y,hot?p.vary([255,200,60],15):p.vary([207+w*14,74+w*10,16],12)); } },
  bedrock(p){ p.noiseFill([70,70,74],22); p.speck(20,[35,35,38]); p.speck(14,[110,110,115]); p.shadeEdge(0.85); },
  coal_ore(p){ painters.stone(p); oreNuggets(p,[38,38,40]); },
  iron_ore(p){ painters.stone(p); oreNuggets(p,[216,173,140]); },
  gold_ore(p){ painters.stone(p); oreNuggets(p,[250,214,80]); },
  diamond_ore(p){ painters.stone(p); oreNuggets(p,[92,236,222]); },
  redstone_ore(p){ painters.stone(p); oreNuggets(p,[230,40,30]); },
  crafting_top(p){ painters.planks(p); for(let i=0;i<16;i++){ p.px(i,7,[92,66,38]); p.px(7,i,[92,66,38]); }
    p.shadeEdge(0.9); },
  crafting_side(p){ painters.planks(p); for(let x=2;x<7;x++)for(let y=3;y<9;y++)p.px(x,y,p.vary([120,90,55],8));
    for(let x=9;x<14;x++)for(let y=3;y<9;y++)p.px(x,y,p.vary([150,150,155],8)); },
  furnace_side(p){ p.noiseFill([110,110,112],10);
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){ if(y===0||y===15||x===0||x===15)p.px(x,y,[88,88,90]);
      if(y===5&&x>2&&x<13)p.px(x,y,[95,95,97]); if(y===10&&x>2&&x<13)p.px(x,y,[95,95,97]); } },
  furnace_top(p){ painters.stone(p); p.shadeEdge(0.85); },
  furnace_front(p){ painters.furnace_side(p); for(let x=4;x<12;x++)for(let y=8;y<14;y++)p.px(x,y,[30,30,32]);
    for(let x=5;x<11;x++)p.px(x,7,[60,60,62]); },
  furnace_front_lit(p){ painters.furnace_side(p); for(let x=4;x<12;x++)for(let y=8;y<14;y++)p.px(x,y,[30,30,32]);
    for(let x=5;x<11;x++){ p.px(x,12,p.vary([255,160,40],25)); p.px(x,11,p.vary([255,200,80],25)); p.px(x,10,p.vary([250,140,30],30)); } },
  chest_side(p){ painters.planks(p); for(let i=0;i<16;i++){ p.px(i,6,[70,50,26]); }
    for(let x=0;x<16;x++){ p.px(x,0,[140,110,64]); p.px(x,15,[110,86,50]); }
    for(let i=0;i<16;i++){ p.px(0,i,[120,94,54]); p.px(15,i,[120,94,54]); } },
  chest_front(p){ painters.chest_side(p); for(let x=6;x<10;x++)for(let y=5;y<9;y++)p.px(x,y,[190,190,195]);
    p.px(7,6,[120,120,125]); p.px(8,7,[120,120,125]); },
  chest_top(p){ painters.chest_side(p); },
  torch(p){ for(let y=0;y<256;y++)p.px(y%16,(y/16)|0,C(0,0,0,0));
    for(let y=6;y<16;y++)for(let x=7;x<9;x++)p.px(x,y,p.vary([120,90,50],10));
    p.px(7,5,[255,220,90]); p.px(8,5,[255,220,90]); p.px(7,4,[255,180,40]); p.px(8,4,[255,180,40]);
    p.px(7,3,[255,120,20]); p.px(8,3,[255,150,30]); },
  tallgrass(p){ for(let y=0;y<256;y++)p.px(y%16,(y/16)|0,C(0,0,0,0));
    for(let b=0;b<7;b++){ let x=2+(p.rng()*12|0); const h=6+(p.rng()*8|0);
      for(let y=15;y>15-h;y--){ p.px(x,y,p.vary([96,160,58],20)); if(p.rng()<0.3)x+=p.rng()<0.5?-1:1; x=Math.max(0,Math.min(15,x)); } } },
  flower_r(p){ painters.tallgrass(p); for(let y=4;y<12;y++)p.px(8,y,[70,130,50]);
    const petals=[[7,3],[9,3],[6,4],[10,4],[7,5],[9,5],[8,2],[8,4]];
    for(const[x,y]of petals)p.px(x,y,[220,50,40]); p.px(8,4,[255,220,80]); },
  flower_y(p){ painters.tallgrass(p); for(let y=4;y<12;y++)p.px(8,y,[70,130,50]);
    const petals=[[8,3],[6,4],[10,4],[8,5],[8,4],[7,3],[9,3],[7,5],[9,5]];
    for(const[x,y]of petals)p.px(x,y,[250,220,60]); p.px(8,4,[200,160,20]); },
  snow(p){ p.noiseFill([240,244,250],7); p.speck(6,[225,230,240]); },
  snow_side(p){ painters.dirt(p); for(let x=0;x<16;x++){ const h=3+((p.rng()*2)|0); for(let y=0;y<h;y++)p.px(x,y,p.vary([240,244,250],6)); } },
  cactus_top(p){ p.noiseFill([88,140,58],10); for(let i=0;i<16;i++){ p.px(i,0,[70,116,46]); p.px(i,15,[70,116,46]); p.px(0,i,[70,116,46]); p.px(15,i,[70,116,46]); }
    p.px(8,8,[110,166,76]); },
  cactus_side(p){ for(let y=0;y<16;y++)for(let x=0;x<16;x++){ const rib=(x%4===1)?-18:(x%4===3)?8:0;
      p.px(x,y,p.vary([70+rib,120+rib,48],7)); }
    for(let i=0;i<5;i++){ const x=1+(p.rng()*14|0),y=p.rng()*16|0; p.px(x,y,[220,235,200]); } },
  farmland(p){ painters.dirt(p); for(let x=0;x<16;x+=2)for(let y=0;y<16;y++){ const c=p.get(x,y); p.px(x,y,[c[0]-30,c[1]-25,c[2]-18]); } },
  wheat0(p){ for(let y=0;y<256;y++)p.px(y%16,(y/16)|0,C(0,0,0,0));
    for(let b=0;b<5;b++){ const x=2+b*3; for(let y=15;y>10;p.px(x,y--,p.vary([90,170,70],14))); } },
  wheat1(p){ for(let y=0;y<256;y++)p.px(y%16,(y/16)|0,C(0,0,0,0));
    for(let b=0;b<6;b++){ const x=1+b*3; for(let y=15;y>7;y--)p.px(x,y,p.vary([130,180,70],16));
      p.px(x,7,[190,190,90]); p.px(x+ (b%2?-1:1),8,[190,190,90]); } },
  wheat2(p){ for(let y=0;y<256;y++)p.px(y%16,(y/16)|0,C(0,0,0,0));
    for(let b=0;b<6;b++){ const x=1+b*3; for(let y=15;y>5;y--)p.px(x,y,p.vary([170,170,80],18));
      for(let yy=4;yy<7;yy++){ p.px(x,yy,[225,200,90]); p.px(x+(b%2?-1:1),yy+1,[215,190,80]); } } },
  lamp_off(p){ p.fill([90,60,30]); for(let y=1;y<15;y+=4)for(let x=1;x<15;x+=4)
      for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++)p.px(x+dx,y+dy,p.vary([140,105,55],12));
    p.shadeEdge(0.88); },
  lamp_on(p){ p.fill([120,85,40]); for(let y=1;y<15;y+=4)for(let x=1;x<15;x+=4)
      for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++)p.px(x+dx,y+dy,p.vary([255,225,140],18));
    p.shadeEdge(0.95); },
  lever_off(p){ painters.cobble(p); for(let y=0;y<256;y++)p.px(y%16,(y/16)|0,C(0,0,0,0));
    for(let x=5;x<11;x++)for(let y=11;y<15;y++)p.px(x,y,p.vary([100,100,104],10));
    for(let y=5;y<12;y++)p.px(8,y,[130,95,55]); p.px(8,5,[160,125,75]); },
  lever_on(p){ painters.lever_off(p); for(let y=5;y<12;y++)p.px(8,y,[130,95,55]); p.px(8,5,[255,120,40]); },
  wool(p){ p.noiseFill([235,235,235],9); for(let i=0;i<20;i++){ const x=p.rng()*15|0,y=p.rng()*15|0; p.px(x,y,[218,218,222]); p.px(x+1,y,[228,228,232]); } },
  ice(p){ for(let y=0;y<16;y++)for(let x=0;x<16;x++)p.px(x,y,p.vary([150,190,235],10));
    for(let i=0;i<4;i++){ let x=p.rng()*16|0,y=p.rng()*16|0; for(let k=0;k<5;k++){ p.px(x,y,[190,220,250]); x+=(p.rng()<.5?1:-1); y++; if(x>15||y>15)break; } }
    p.shadeEdge(0.93); },
  tnt_side(p){ p.fill([180,50,40]); for(let y=5;y<11;y++)for(let x=0;x<16;x++)p.px(x,y,p.vary([228,228,228],8));
    const msg='TNT'; p.fontPx=null;
    const glyph={T:[[0,0],[1,0],[2,0],[1,1],[1,2]],N:[[0,0],[0,1],[0,2],[1,1],[2,0],[2,1],[2,2]],'T2':[[0,0],[1,0],[2,0],[1,1],[1,2]]};
    let gx=2; for(const ch of ['T','N','T2']){ for(const[dx,dy]of glyph[ch])p.px(gx+dx,7+dy,[30,30,30]); gx+=4; }
    for(let i=0;i<16;i++){ p.px(i,4,[120,32,26]); p.px(i,11,[120,32,26]); } },
  tnt_top(p){ p.fill([180,50,40]); for(let y=4;y<12;y++)for(let x=4;x<12;x++)p.px(x,y,p.vary([228,228,228],8));
    for(let y=6;y<10;y++)for(let x=6;x<10;x++)p.px(x,y,[60,60,60]); p.shadeEdge(0.9); },
  ladder(p){ for(let y=0;y<256;y++)p.px(y%16,(y/16)|0,C(0,0,0,0));
    for(let y=0;y<16;y++)for(const x of[2,3,12,13])p.px(x,y,p.vary([150,118,70],10));
    for(const y of[2,3,8,9,13,14])for(let x=2;x<14;x++)p.px(x,y,p.vary([165,132,80],10)); },
  sapling(p){ for(let y=0;y<256;y++)p.px(y%16,(y/16)|0,C(0,0,0,0));
    for(let y=8;y<15;y++)p.px(8,y,[110,84,50]);
    const blob=[[8,5],[7,6],[9,6],[6,7],[8,7],[10,7],[7,8],[9,8],[8,4],[8,6],[7,4],[9,4],[6,6],[10,6]];
    for(const[x,y]of blob)p.px(x,y,p.vary([70,150,45],20)); },
  glowstone(p){ p.fill([144,110,60]); for(let i=0;i<24;i++){ const x=p.rng()*15|0,y=p.rng()*15|0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(p.rng()<.7)p.px(x+dx,y+dy,p.vary([255,220,120],25)); } },
  bed_top(p){ p.fill([160,32,38]); for(let y=0;y<10;y++)for(let x=0;x<16;x++)p.px(x,y,p.vary([165,36,42],8));
    for(let y=10;y<16;y++)for(let x=0;x<16;x++)p.px(x,y,p.vary([235,235,240],6));
    for(let i=0;i<16;i++)p.px(i,9,[120,20,26]); },
  bed_side(p){ p.fill([140,28,34]); for(let y=11;y<16;y++)for(let x=0;x<16;x++)p.px(x,y,p.vary([130,100,60],8));
    for(let y=0;y<3;y++)for(let x=0;x<16;x++)p.px(x,y,p.vary([235,235,240],6)); },
  wire(p){ for(let y=0;y<256;y++)p.px(y%16,(y/16)|0,C(0,0,0,0));
    for(let i=0;i<16;i++){ p.px(i,7,[160,30,20,255]); p.px(i,8,[120,20,14,255]); p.px(7,i,[160,30,20,255]); p.px(8,i,[120,20,14,255]); } },
  spawner(p){ for(let y=0;y<16;y++)for(let x=0;x<16;x++){ const bar=(x%4<1)||(y%4<1);
      p.px(x,y,bar?p.vary([30,34,40],6):C(0,0,0,60)); } }
};

export function paintAll(){
  const out = {};
  TILES.forEach((name,i)=>{ const p = new P(0xBEEF+i*7919); painters[name](p); out[name]=p; });
  return out;
}

export function buildAtlasData(){
  const painted = paintAll();
  const n = TILES.length;
  const data = new Uint8Array(n*16*16*4);
  TILES.forEach((name,i)=>{
    data.set(painted[name].d, i*16*16*4);
  });
  return { data, count:n };
}

export function makeCrackStrip(){
  const stages = 5;
  const cv = document.createElement('canvas'); cv.width=16; cv.height=16*stages;
  const ctx = cv.getContext('2d');
  for(let s=0;s<stages;s++){
    const rng = mulberry32(999+s);
    ctx.fillStyle='rgba(0,0,0,0)';
    const cracks = 2+s*3;
    for(let c=0;c<cracks;c++){
      let x=8+((rng()*8-4)|0), y=8+((rng()*8-4)|0);
      const len = 3+s*2.5;
      for(let k=0;k<len;k++){
        ctx.fillStyle=`rgba(10,8,6,${0.55+s*0.08})`;
        ctx.fillRect(((x%16)+16)%16, s*16+((y%16)+16)%16, 1,1);
        x += rng()<0.5?1:-1; y += rng()<0.6?1:-1;
        if(rng()<0.25)x += rng()<0.5?1:-1;
      }
    }
  }
  return cv;
}
