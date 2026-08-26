import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const rand = (a=1,b) => b===undefined ? Math.random()*a : a+Math.random()*(b-a);
export const randi = (a,b) => Math.floor(rand(a,b+1));
export const pick = arr => arr[Math.floor(Math.random()*arr.length)];
export const chance = p => Math.random() < p;
export const clamp = (v,a,b) => v<a?a:v>b?b:v;
export const lerp = (a,b,t) => a+(b-a)*t;
export const damp = (a,b,k,dt) => lerp(a,b,1-Math.exp(-k*dt));
export const easeOut = t => 1-Math.pow(1-t,3);
export const easeIn = t => t*t*t;

export function mulberry32(seed){
  let s = seed>>>0;
  return function(){
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s>>>15), 1|s);
    t = (t + Math.imul(t ^ (t>>>7), 61|t)) ^ t;
    return ((t ^ (t>>>14)) >>> 0) / 4294967296;
  };
}

const matCache = new Map();
export function M(color,{m=0,r=0.85,e=null,ei=1,flat=false,cc=0}={}){
  const key = `${color}|${m}|${r}|${e}|${ei}|${flat}|${cc}`;
  if(matCache.has(key)) return matCache.get(key);
  const mat = flat ? new THREE.MeshBasicMaterial({color})
    : new THREE.MeshStandardMaterial({color, metalness:m, roughness:r,
      emissive: e??0x000000, emissiveIntensity: ei});
  if(cc>0 && !flat){ mat.clearcoat = cc; }
  matCache.set(key,mat);
  return mat;
}

export function cnv(w,h){
  const c = document.createElement('canvas');
  c.width=w; c.height=h;
  return [c, c.getContext('2d')];
}
export function ctex(canvas,{rx=1,ry=1,srgb=true}={}){
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(rx,ry);
  if(srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function checkerTex(){
  const [c,x] = cnv(256,256);
  for(let i=0;i<8;i++)for(let j=0;j<8;j++){
    const v=(i+j)%2===0;
    x.fillStyle=v?'#23272e':'#15181d';
    x.fillRect(i*32,j*32,32,32);
    x.fillStyle='#ffffff06';
    if(v)x.fillRect(i*32,j*32,32,3);
  }
  x.fillStyle='#00000055';
  for(let k=0;k<160;k++){x.fillRect(rand(256),rand(256),rand(1,4),rand(1,4));}
  return ctex(c,{rx:14,ry:14});
}

export function starWallTex(){
  const [c,x] = cnv(256,256);
  x.fillStyle='#101726'; x.fillRect(0,0,256,256);
  x.fillStyle='#0c1220'; x.fillRect(0,196,256,60);
  x.fillStyle='#1b2740'; x.fillRect(0,190,256,8);
  x.fillStyle='#ffd97a';
  for(let i=0;i<40;i++){
    const px=rand(256),py=rand(185),s=rand(2,4.2);
    x.globalAlpha=rand(.35,.9);
    x.beginPath(); x.arc(px,py,s,0,TAU); x.fill();
    if(chance(.3)){x.strokeStyle='#ffd97a88';x.lineWidth=.7;x.beginPath();
      x.moveTo(px-s*3,py);x.lineTo(px+s*3,py);x.moveTo(px,py-s*3);x.lineTo(px,py+s*3);x.stroke();}
  }
  x.globalAlpha=1;
  x.fillStyle='#00000033';
  for(let k=0;k<90;k++)x.fillRect(rand(256),rand(256),rand(1,5),rand(1,5));
  return ctex(c,{rx:6,ry:1.4});
}

export function carpetTex(){
  const [c,x]=cnv(128,128);
  x.fillStyle='#1a1030';x.fillRect(0,0,128,128);
  x.fillStyle='#241646';
  for(let i=0;i<400;i++)x.fillRect(rand(128),rand(128),2,2);
  x.strokeStyle='#3d2a6e';x.lineWidth=2;
  for(let i=-2;i<5;i++){x.beginPath();x.arc(i*40,64,26,0,TAU);x.stroke();}
  return ctex(c,{rx:10,ry:10});
}

export function posterTex(kind){
  const [c,x]=cnv(256,340);
  x.fillStyle='#e8ddc8';x.fillRect(0,0,256,340);
  x.fillStyle='#00000022';for(let i=0;i<300;i++)x.fillRect(rand(256),rand(340),2,2);
  if(kind==='band'){
    x.fillStyle='#141b2e';x.fillRect(12,12,232,120);
    x.fillStyle='#ffd97a';x.font='bold 30px Arial';x.textAlign='center';
    x.fillText('★',128,58);
    x.fillStyle='#fff';x.font='bold 21px Arial';
    x.fillText('THE STARLIGHT',128,92); x.fillText('BAND!',128,118);
    x.fillStyle='#a33327';x.font='bold 17px Arial';
    x.fillText('LIVE EVERY HOUR',128,170);
    x.font='13px Arial';x.fillStyle='#333';
    x.fillText('STRIX · SELENE · RUSTY',128,205);
    x.fillText('& SCAMPER',128,224);
    x.fillStyle='#59f7e8';x.beginPath();x.arc(70,270,20,0,TAU);x.fill();
    x.fillStyle='#ff5db1';x.beginPath();x.arc(128,280,24,0,TAU);x.fill();
    x.fillStyle='#ffd97a';x.beginPath();x.arc(186,270,20,0,TAU);x.fill();
  }else if(kind==='rules'){
    x.fillStyle='#7a1f1f';x.fillRect(0,0,256,44);
    x.fillStyle='#fff';x.font='bold 19px Arial';x.textAlign='center';
    x.fillText('PLAYHOUSE RULES',128,29);
    x.fillStyle='#222';x.font='15px Arial';x.textAlign='left';
    ['1. Stay where grown-ups can see you.',
     '2. Never climb into the vents.',
     '3. The band loves hugs — but ask first.',
     '4. Do not wind the music box after',
     '   the lights go out.',
     '5. If ECLIPSE is out, close your eyes',
     '   and count to ten.'].forEach((l,i)=>x.fillText(l,16,78+i*28));
    x.fillStyle='#00000018';x.fillRect(0,290,256,50);
    x.font='italic 12px Arial';x.fillStyle='#555';
    x.fillText('Halcyon Amusements © 1987',128,315);
  }else{
    x.fillStyle='#101726';x.fillRect(0,0,256,340);
    x.fillStyle='#ff5db1';x.font='bold 24px Arial';x.textAlign='center';
    x.fillText('MISSING',128,48);
    x.fillStyle='#ccc';x.fillRect(88,66,80,80);
    x.fillStyle='#555';x.font='11px Arial';x.fillText('[ photo removed ]',128,110);
    x.fillStyle='#ddd';x.font='14px Arial';
    x.fillText('Last seen at the',128,178);
    x.fillText('Blackout Banquet.',128,198);
    x.fillText('If found, do NOT',128,238);
    x.fillText('follow the music.',128,258);
    x.fillStyle='#39d353';x.font='bold 13px Arial';
    x.fillText('REWARD',128,306);
  }
  return ctex(c);
}

export function signTex(main,sub,color='#59f7e8'){
  const [c,x]=cnv(1024,256);
  x.fillStyle='#070a12';x.fillRect(0,0,1024,256);
  x.shadowColor=color;x.shadowBlur=34;
  x.fillStyle=color;x.font='bold 96px Arial';x.textAlign='center';
  x.fillText(main,512,128);
  x.shadowBlur=14;x.fillStyle='#ffe9f4';x.font='42px Arial';
  x.fillText(sub,512,204);
  return ctex(c);
}

export function hazardTex(){
  const [c,x]=cnv(128,128);
  x.fillStyle='#b98a1e';x.fillRect(0,0,128,128);
  x.fillStyle='#14161a';
  for(let i=-2;i<6;i++){
    x.save();x.translate(i*32,0);x.rotate(-0.6);
    x.fillRect(0,-40,16,220);x.restore();
  }
  x.fillStyle='#00000044';
  for(let k=0;k<80;k++)x.fillRect(rand(128),rand(128),rand(2,6),rand(2,6));
  return ctex(c,{rx:2,ry:1});
}

export function glowTex(color='255,255,255'){
  const [c,x]=cnv(64,64);
  const g=x.createRadialGradient(32,32,2,32,32,30);
  g.addColorStop(0,`rgba(${color},1)`);
  g.addColorStop(0.4,`rgba(${color},.45)`);
  g.addColorStop(1,`rgba(${color},0)`);
  x.fillStyle=g;x.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}

export function curtainTex(){
  const [c,x]=cnv(256,256);
  x.fillStyle='#5c1220';x.fillRect(0,0,256,256);
  for(let i=0;i<256;i+=8){
    x.fillStyle=i%16===0?'#6d1626':'#4a0f1b';
    x.fillRect(i,0,8,256);
    x.fillStyle='#00000030';x.fillRect(i+6,0,2,256);
  }
  return ctex(c,{rx:3,ry:1});
}
