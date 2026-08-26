// Item & block icon generation for UI (hotbar/inventory). Returns dataURLs.
import { BLOCKS, B } from './blocks.js';
import { ITEMS } from './items.js';
import { paintAll, TILE_INDEX } from './atlas.js';

let painted = null;

function tileCanvas(name){
  const cv = document.createElement('canvas'); cv.width=16; cv.height=16;
  const ctx = cv.getContext('2d');
  const img = new ImageData(new Uint8ClampedArray(painted[name].d), 16,16);
  ctx.putImageData(img,0,0);
  return cv;
}

function isoBlockIcon(topName, sideName){
  const cv = document.createElement('canvas'); cv.width=48; cv.height=48;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const top = tileCanvas(topName), side = tileCanvas(sideName);
  ctx.save();
  ctx.translate(24,13);
  ctx.transform(1,0.5,-1,0.5,0,0);
  ctx.drawImage(top,-8,-8,16,16);
  ctx.restore();
  ctx.save();
  ctx.translate(10,21);
  ctx.transform(1,0.5,0,1.2,0,0);
  ctx.filter='brightness(0.78)';
  ctx.drawImage(side,0,-4,16,16);
  ctx.restore();
  ctx.save();
  ctx.translate(24,29);
  ctx.transform(1,-0.5,0,1.2,0,0);
  ctx.filter='brightness(0.6)';
  ctx.drawImage(side,0,-4,16,16);
  ctx.restore();
  return cv;
}

const spritePainters = {
  stick(p){ for(let i=0;i<9;i++){ p.px(4+i,12-i,[130,98,58]); p.px(5+i,12-i,[110,82,46]); } },
  coal(p){ blob(p,[42,42,44],[70,70,72]); },
  charcoal(p){ blob(p,[55,45,40],[85,72,60]); },
  raw_iron(p){ blob(p,[200,160,128],[230,190,158]); },
  raw_gold(p){ blob(p,[235,195,70],[255,225,110]); },
  iron_ingot(p){ ingot(p,[216,216,220],[170,170,175]); },
  gold_ingot(p){ ingot(p,[245,208,66],[200,160,30]); },
  diamond(p){ gem(p,[80,235,220],[30,180,170]); },
  redstone(p){ dust(p,[210,40,28]); },
  glowstone_dust(p){ dust(p,[250,220,120]); },
  gunpowder(p){ dust(p,[90,90,95]); },
  seeds(p){ for(const[x,y]of[[6,7],[9,6],[11,9],[7,10],[10,11]]){ p.px(x,y,[80,150,50]); p.px(x+1,y,[100,170,60]); } },
  wheat_item(p){ for(let b=0;b<3;b++){ let x=6+b*2; for(let y=4;y<13;y++)p.px(x,y,p.vary([190,170,80],14)); }
    for(const[x,y]of[[5,4],[7,3],[9,3],[11,4],[8,5]])p.px(x,y,[225,205,100]); },
  bread(p){ for(let y=5;y<11;y++)for(let x=3;x<13;x++){ const c=(y===5||y===10||x===3||x===12)?[140,95,45]:[196,146,76]; p.px(x,y,p.vary(c,10)); } },
  apple(p){ for(let y=5;y<13;y++)for(let x=5;x<12;x++){ if((x===5||x===11)&&(y===5||y===12))continue; p.px(x,y,p.vary([210,40,35],12)); }
    p.px(8,4,[100,70,40]); p.px(9,3,[80,160,50]); p.px(10,3,[80,160,50]); },
  porkchop(p){ meat(p,[240,150,150],[255,190,190]); },
  cooked_porkchop(p){ meat(p,[190,110,60],[220,150,90]); },
  beef(p){ meat(p,[200,60,55],[230,100,90]); },
  cooked_beef(p){ meat(p,[130,75,40],[165,105,60]); },
  mutton(p){ meat(p,[220,80,70],[245,120,105]); },
  cooked_mutton(p){ meat(p,[150,90,50],[185,125,75]); },
  chicken_raw(p){ meat(p,[240,215,195],[252,235,220]); },
  cooked_chicken(p){ meat(p,[205,140,65],[235,180,105]); },
  rotten_flesh(p){ meat(p,[130,90,50],[100,110,45]); },
  feather(p){ for(let i=0;i<10;i++){ p.px(5+(i>>1),12-i,[245,245,245]); p.px(6+(i>>1),12-i,[220,222,228]); }
    p.px(5,13,[180,180,185]); p.px(6,13,[180,180,185]); },
  leather(p){ for(let y=4;y<12;y++)for(let x=4;x<12;x++)p.px(x,y,p.vary([150,105,62],12));
    p.px(5,5,[120,82,46]); p.px(10,9,[120,82,46]); },
};

function blob(p,c1,c2){ const pts=[[7,5],[8,5],[6,6],[7,6],[8,6],[9,6],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[6,8],[7,8],[8,8],[9,8],[7,9],[8,9],[9,9],[8,10]];
  for(const[x,y]of pts)p.px(x,y,(x+y)%3?p.vary(c1,10):p.vary(c2,10)); }
function ingot(p,c1,c2){ for(let y=6;y<11;y++)for(let x=2+(y-6),w=12-(y-6)*2;x<2+w-(y-6)+ (y-6);x++){}
  for(let y=6;y<11;y++){ const inset=(10-y); for(let x=3-inset+2;x<13+inset-2;x++)p.px(Math.max(1,Math.min(14,x)),y,y>9?p.vary(c2,8):p.vary(c1,8)); }
  for(let x=4;x<12;x++)p.px(x,5,p.vary([255,255,255],20)); }
function gem(p,c1,c2){ const pts=[[8,3],[7,4],[8,4],[9,4],[6,5],[7,5],[8,5],[9,5],[10,5],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],
  [6,7],[7,7],[8,7],[9,7],[10,7],[7,8],[8,8],[9,8],[8,9],[7,9]];
  for(const[x,y]of pts)p.px(x,y,(x+y)%4?p.vary(c1,12):p.vary(c2,10));
  p.px(7,5,[220,255,250]); p.px(8,4,[240,255,252]); }
function dust(p,c){ for(let i=0;i<26;i++){ const a=p.rng()*Math.PI*2,r=p.rng()*4;
  const x=8+Math.cos(a)*r|0,y=8+Math.sin(a)*r|0; p.px(x,y,p.vary(c,18)); }
  p.px(8,8,p.vary(c,10)); p.px(9,8,p.vary(c,10)); p.px(8,9,p.vary(c,10)); }
function meat(p,c1,c2){ for(let y=5;y<12;y++)for(let x=4;x<12;x++){
    const edge=(x===4||x===11||y===5||y===11);
    if(edge&&(x+y)%2)continue;
    p.px(x,y,edge?p.vary(c2,10):p.vary(c1,10)); }
  p.px(4,11,[240,238,230]); p.px(3,12,[240,238,230]); }

const TIER_COL = { wooden:[130,98,58], stone:[138,138,140], iron:[218,218,222], golden:[248,214,64], diamond:[70,235,220] };

function toolIcon(type,tier){
  const cv = document.createElement('canvas'); cv.width=16; cv.height=16;
  const p = new (class{ constructor(){ this.d=new Uint8ClampedArray(1024); this.rng={ }; } px(x,y,c){ if(x<0||y<0||x>15||y>15)return; const i=(y*16+x)*4; this.d[i]=c[0];this.d[i+1]=c[1];this.d[i+2]=c[2];this.d[i+3]=c[3]===undefined?255:c[3]; } })( );
  const col = TIER_COL[tier] || [200,200,200];
  for(let i=0;i<9;i++){ p.px(3+i,13-i,[120,90,52]); p.px(4+i,13-i,[104,78,44]); }
  if(type==='pickaxe'){ for(let k=0;k<9;k++){ p.px(4+k,2+k,col); p.px(5+k,2+k,k<4?col:[col[0]*0.8|0,col[1]*0.8|0,col[2]*0.8|0]); }
    for(const[x,y]of[[3,3],[3,4],[4,2],[11,10],[12,11],[12,12],[13,13]])p.px(x,y,col); }
  else if(type==='axe'){ for(let y=2;y<8;y++)for(let x=7;x<12;x++){ if((x===7&&y>4)||(x===11&&y<4))continue; p.px(x,y,(x+y)%3?col:[col[0]*0.85|0,col[1]*0.85|0,col[2]*0.85|0]); }
    p.px(6,3,col); p.px(6,4,col); }
  else if(type==='shovel'){ for(let y=1;y<6;y++)for(let x=10;x<15;x++){ if((x===10&&y===1)||(x===14&&y===1))continue; p.px(x,y,col); }
    p.px(11,2,[255,255,255]); }
  else if(type==='sword'){ for(let i=0;i<9;i++){ p.px(5+i,10-i,col); p.px(6+i,10-i,[Math.min(255,col[0]+40),Math.min(255,col[1]+40),Math.min(255,col[2]+40)]); }
    p.px(3,13,[90,68,40]); p.px(4,12,[90,68,40]); p.px(4,13,[120,92,54]); p.px(3,12,[120,92,54]);
    p.px(5,11,[110,84,50]); p.px(4,10,[110,84,50]); }
  else if(type==='hoe'){ for(let x=8;x<14;x++)p.px(x,3,col); p.px(8,4,col); p.px(9,4,col); }
  const cv2 = document.createElement('canvas'); cv2.width=16; cv2.height=16;
  const ctx = cv2.getContext('2d');
  ctx.putImageData(new ImageData(p.d,16,16),0,0);
  return cv2;
}

export function buildIcons(){
  painted = paintAll();
  const icons = {};
  for(const def of BLOCKS){
    if(!def || def.id===B.AIR) continue;
    const top = def.tex.top || def.tex.all || 'stone';
    const side = def.tex.side || def.tex.front || def.tex.all || 'stone';
    let cv;
    if(def.shape==='cross'||def.shape==='torch'||def.shape==='wire'||def.cross) cv = tileCanvas(side);
    else cv = isoBlockIcon(top, side);
    icons['block:'+def.id] = scaleUp(cv);
  }
  for(const name in ITEMS){
    const it = ITEMS[name];
    let cv;
    if(it.toolType) cv = toolIcon(it.toolType, ['wooden','stone','iron','golden','diamond'].find(t=>name.startsWith(t)) || 'wooden');
    else if(spritePainters[name]) { cv = document.createElement('canvas'); cv.width=16;cv.height=16;
      const ctx=cv.getContext('2d');
      const P2 = class { constructor(){ this.d=new Uint8ClampedArray(1024); this.rng=Math.random; }
        px(x,y,c){ if(x<0||y<0||x>15||y>15)return; const i=(y*16+x)*4; this.d[i]=Array.isArray(c)?c[0]:c; this.d[i+1]=Array.isArray(c)?c[1]:c; this.d[i+2]=Array.isArray(c)?c[2]:c; this.d[i+3]=Array.isArray(c)?(c[3]===undefined?255:c[3]):255; }
        vary(c,a){ const v=((this.rng()*2-1)*a)|0; return [c[0]+v,c[1]+v,c[2]+v]; } };
      const pp = new P2(); spritePainters[name](pp);
      ctx.putImageData(new ImageData(pp.d,16,16),0,0);
    }
    if(cv) icons[name] = scaleUp(cv);
  }
  return icons;
}

function scaleUp(cv){
  const out = document.createElement('canvas'); out.width=48; out.height=48;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(cv,0,0,48,48);
  return out.toDataURL();
}
