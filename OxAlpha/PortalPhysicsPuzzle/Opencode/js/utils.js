import * as THREE from 'three';

export const V = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp = (a,b,t)=>a+(b-a)*t;
export const damp = (a,b,l,dt)=>lerp(a,b,1-Math.exp(-l*dt));
export const rand = (a,b)=>a+Math.random()*(b-a);
export const TAU = Math.PI*2;
export const DEG = Math.PI/180;

const _m1 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
export function yawPitchFromDir(dir){
  return { yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(clamp(dir.y,-1,1)) };
}
export function dirFromYawPitch(yaw,pitch,out=new THREE.Vector3()){
  const cp=Math.cos(pitch);
  return out.set(-Math.sin(yaw)*cp, Math.sin(pitch), -Math.cos(yaw)*cp);
}

// Canvas texture helpers -----------------------------------------------------
function makeCanvas(w,h){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  return [c,c.getContext('2d')];
}
function noiseOverlay(ctx,w,h,alpha,dark){
  const img=ctx.getImageData(0,0,w,h); const d=img.data;
  for(let i=0;i<d.length;i+=4){
    const n=(Math.random()*2-1)*255*alpha;
    d[i]=clamp(d[i]+n*(dark?0.6:1),0,255);
    d[i+1]=clamp(d[i+1]+n*(dark?0.6:1),0,255);
    d[i+2]=clamp(d[i+2]+n*(dark?0.6:1),0,255);
  }
  ctx.putImageData(img,0,0);
}
function tex(canvas, rx=1, ry=1){
  const t=new THREE.CanvasTexture(canvas);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
  t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8;
  return t;
}

let _matCache={};
export function resetMaterialCache(){ _matCache={}; }

export function getMaterials(){
  if(_matCache.concrete) return _matCache;

  // ---- concrete wall (non-portalable structural) ----
  {
    const [c,x]=makeCanvas(256,256);
    x.fillStyle='#767d84'; x.fillRect(0,0,256,256);
    noiseOverlay(x,256,256,0.10,false);
    x.strokeStyle='rgba(30,36,42,.55)'; x.lineWidth=3;
    x.strokeRect(4,4,248,248);
    x.fillStyle='rgba(20,26,32,.25)';
    for(let i=0;i<40;i++){x.fillRect(Math.random()*256,Math.random()*256,rand(2,18),rand(1,3));}
    const map=tex(c);
    _matCache.concrete=new THREE.MeshStandardMaterial({map,color:0xbfc5cb,roughness:.88,metalness:.04});
  }
  // ---- dark metal (frames / machinery / non-portalable) ----
  {
    const [c,x]=makeCanvas(128,128);
    x.fillStyle='#3c434b'; x.fillRect(0,0,128,128);
    for(let i=0;i<128;i+=2){ x.fillStyle=`rgba(255,255,255,${rand(0.01,0.05)})`; x.fillRect(0,i,128,1); }
    noiseOverlay(x,128,128,0.06,true);
    _matCache.metal=new THREE.MeshStandardMaterial({map:tex(c),roughness:.45,metalness:.72});
  }
  // ---- white portal panel ----
  {
    const [c,x]=makeCanvas(256,256);
    x.fillStyle='#e9ecee'; x.fillRect(0,0,256,256);
    noiseOverlay(x,256,256,0.03,false);
    x.strokeStyle='rgba(140,150,160,.35)'; x.lineWidth=2; x.strokeRect(6,6,244,244);
    x.strokeStyle='rgba(140,150,160,.16)';
    x.beginPath(); x.moveTo(128,6); x.lineTo(128,250); x.moveTo(6,128); x.lineTo(250,128); x.stroke();
    _matCache.panel=new THREE.MeshStandardMaterial({map:tex(c),roughness:.5,metalness:.05});
  }
  // ---- floor tile ----
  {
    const [c,x]=makeCanvas(256,256);
    x.fillStyle='#585f66'; x.fillRect(0,0,256,256);
    noiseOverlay(x,256,256,0.08,false);
    x.strokeStyle='rgba(22,28,34,.7)'; x.lineWidth=3;
    for(let i=0;i<=256;i+=64){ x.beginPath();x.moveTo(i,0);x.lineTo(i,256);x.moveTo(0,i);x.lineTo(256,i);x.stroke(); }
    x.fillStyle='rgba(87,230,200,.05)';
    x.fillRect(60,60,8,8); x.fillRect(188,188,8,8);
    _matCache.floor=new THREE.MeshStandardMaterial({map:tex(c),roughness:.62,metalness:.14});
  }
  // ---- ceiling ----
  {
    const [c,x]=makeCanvas(128,128);
    x.fillStyle='#2b3036'; x.fillRect(0,0,128,128);
    noiseOverlay(x,128,128,0.07,true);
    _matCache.ceil=new THREE.MeshStandardMaterial({map:tex(c),roughness:.9,metalness:.05});
  }
  // ---- warning stripes ----
  {
    const [c,x]=makeCanvas(128,128);
    x.fillStyle='#c9a13b'; x.fillRect(0,0,128,128);
    x.fillStyle='#1c1f23';
    for(let i=-128;i<256;i+=32){ x.save(); x.translate(i,0); x.rotate(0); x.fillRect(0,0,14,300); x.restore();
      x.translate(16,0);}
    // redo diagonal
    x.clearRect(0,0,128,128);
    x.fillStyle='#caa23c'; x.fillRect(0,0,128,128);
    x.fillStyle='#23262b';
    x.save(); x.translate(64,64); x.rotate(Math.PI/4);
    for(let i=-192;i<192;i+=36) x.fillRect(i,-192,17,384);
    x.restore();
    noiseOverlay(x,128,128,0.05,true);
    _matCache.hazardStripe=new THREE.MeshStandardMaterial({map:tex(c,2,2),roughness:.7});
  }
  // ---- glass ----
  _matCache.glass=new THREE.MeshPhysicalMaterial({
    color:0xafd8e8, transparent:true, opacity:.16, roughness:.08, metalness:0,
    side:THREE.DoubleSide, depthWrite:false,
  });
  // ---- acid handled by shader in entities ----
  return _matCache;
}

// Signage canvas -------------------------------------------------------------
export function makeSignTexture(draw, w=512, h=512){
  const [c,x]=makeCanvas(w,h);
  draw(x,w,h);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8;
  return t;
}

export function chamberSignTexture(num, name, icon){
  return makeSignTexture((x,w,h)=>{
    x.fillStyle='#10151a'; x.fillRect(0,0,w,h);
    x.strokeStyle='#57e6c8'; x.lineWidth=6; x.strokeRect(14,14,w-28,h-28);
    x.fillStyle='#57e6c8';
    x.font='700 150px "Segoe UI",sans-serif'; x.textAlign='center';
    x.fillText(String(num).padStart(2,'0'), w/2, h*0.44);
    x.font='500 40px "Segoe UI",sans-serif'; x.fillStyle='#9fb2bd';
    x.fillText(name.toUpperCase(), w/2, h*0.60);
    if(icon) icon(x,w,h,h*0.78);
  },512,640);
}

export function posterTexture(title, lines, accent='#57e6c8'){
  return makeSignTexture((x,w,h)=>{
    x.fillStyle='#151b21'; x.fillRect(0,0,w,h);
    x.fillStyle=accent; x.fillRect(0,0,w,14);
    x.textAlign='center';
    x.font='600 46px "Segoe UI",sans-serif'; x.fillStyle='#dfe7ec';
    wrapText(x,title,w/2,110,w-70,54);
    x.font='400 30px "Segoe UI",sans-serif'; x.fillStyle='#93a4af';
    let y=210;
    for(const ln of lines){ wrapText(x,ln,w/2,y,w-80,40); y+=lines.length>4?96:120; }
    x.font='500 24px "Segoe UI",sans-serif'; x.fillStyle='#4d5a63';
    x.fillText('KESTREL DEEP RESEARCH — INTERNAL', w/2, h-50);
  },512,720);
}

export function terminalTexture(lines, accent='#57e6c8'){
  return makeSignTexture((x,w,h)=>{
    x.fillStyle='#04100c'; x.fillRect(0,0,w,h);
    x.font='500 26px Consolas,monospace'; x.textAlign='left';
    x.fillStyle=accent;
    let y=54;
    for(const ln of lines){ x.fillText(ln,36,y); y+=44; }
    if(Math.floor(performance.now()/600)%2===0){ x.fillRect(36,y-24,14,26); }
  },512,384);
}

function wrapText(x,text,cx,cy,maxW,lh){
  const words=text.split(' '); let line='';
  for(const wd of words){
    const t=line?line+' '+wd:wd;
    if(x.measureText(t).width>maxW && line){ x.fillText(line,cx,cy); line=wd; cy+=lh; }
    else line=t;
  }
  x.fillText(line,cx,cy);
}

// Pictogram icons for signs
export const ICONS = {
  cube:(x,w,h,y)=>{ x.strokeStyle='#57e6c8'; x.lineWidth=8; x.strokeRect(w/2-46,y-46,92,92);
    x.beginPath(); x.moveTo(w/2-46,y-46); x.lineTo(w/2-16,y-70); x.lineTo(w/2+70,y-70); x.lineTo(w/2+40,y-46);
    x.moveTo(w/2+70,y-70); x.lineTo(w/2+70,y+22); x.lineTo(w/2+40,y+46); x.stroke(); },
  fling:(x,w,h,y)=>{ x.strokeStyle='#57e6c8'; x.lineWidth=9; x.beginPath();
    x.arc(w/2-60,y,40,Math.PI*.5,Math.PI*1.5); x.stroke();
    x.beginPath(); x.moveTo(w/2-60,y-40); x.quadraticCurveTo(w/2+70,y-90,w/2+90,y+30); x.stroke();
    x.fillStyle='#57e6c8'; x.beginPath(); x.moveTo(w/2+98,y+48); x.lineTo(w/2+66,y+30); x.lineTo(w/2+86,y+8); x.fill(); },
  water:(x,w,h,y)=>{ x.strokeStyle='#ff5f4f'; x.lineWidth=8; x.beginPath(); x.moveTo(w/2-70,y+34);
    for(let i=0;i<=140;i+=10){ x.lineTo(w/2-70+i, y+34-Math.abs(((i/20)%2)-1)*16); } x.stroke();
    x.fillStyle='#ff5f4f'; x.beginPath(); x.moveTo(w/2,y-84); x.lineTo(w/2+34,y-24); x.lineTo(w/2-34,y-24); x.fill();
    x.fillRect(w/2-6,y-24,12,30); x.fillRect(w/2-6,y+12,12,6); },
};
