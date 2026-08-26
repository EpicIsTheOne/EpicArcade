/* HOLLOW SIGNAL — procedural canvas textures */
(function(){
"use strict";
const HG = window.HG;

function cv(w=256,h=256){ const c=document.createElement('canvas'); c.width=w; c.height=h; return [c,c.getContext('2d')]; }
function noiseOver(x,alpha,dark=true,n=1400){
  for(let i=0;i<n;i++){
    const v=Math.random();
    x.fillStyle = dark? `rgba(0,0,0,${alpha*v})` : `rgba(255,255,255,${alpha*v})`;
    x.fillRect(Math.random()*x.canvas.width, Math.random()*x.canvas.height, 1+Math.random()*2, 1+Math.random()*2);
  }
}
function blotches(x,n,rMin,rMax,color){
  for(let i=0;i<n;i++){
    const r=rMin+Math.random()*(rMax-rMin);
    const gx=Math.random()*x.canvas.width, gy=Math.random()*x.canvas.height;
    const g=x.createRadialGradient(gx,gy,0,gx,gy,r);
    g.addColorStop(0,color); g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g; x.fillRect(gx-r,gy-r,r*2,r*2);
  }
}
function tex(canvas,{rep=[1,1],aniso=4}={}){
  const t=new THREE.CanvasTexture(canvas);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(rep[0],rep[1]);
  t.anisotropy=aniso;
  return t;
}

const T = HG.Textures = {
  _cache:{},
  get(name,opt){ // cached single instances for shared materials
    if(!this._cache[name]) this._cache[name]=this[name]();
    return this._cache[name];
  },
  material(name, params={}){ // convenience: MeshStandardMaterial with our texture
    const t=this.get(name);
    return new THREE.MeshStandardMaterial(Object.assign({map:t, roughness:.92, metalness:.05},params));
  },

  /* ------------- architecture ------------- */
  wallConcrete(){
    const [c,x]=cv(256,256);
    x.fillStyle='#6b6a64'; x.fillRect(0,0,256,256);
    noiseOver(x,.16,true,2600); noiseOver(x,.05,false,900);
    blotches(x,10,14,60,'rgba(30,28,24,0.18)');
    // horizontal form seams
    x.strokeStyle='rgba(20,20,18,.5)'; x.lineWidth=2;
    x.beginPath(); x.moveTo(0,86); x.lineTo(256,86); x.moveTo(0,180); x.lineTo(256,180); x.stroke();
    x.strokeStyle='rgba(255,255,255,.06)';
    x.beginPath(); x.moveTo(0,90); x.lineTo(256,90); x.stroke();
    // drip stains from seams
    x.globalAlpha=.12;
    for(let i=0;i<7;i++){
      const sx=Math.random()*256, sy=(Math.random()<.5?86:180), len=20+Math.random()*70;
      x.fillStyle='#3a382f'; x.fillRect(sx,sy,2+Math.random()*2,len);
    }
    x.globalAlpha=1;
    return tex(c);
  },
  wallPanel(){ // lower level: dark painted metal panels
    const [c,x]=cv(256,256);
    x.fillStyle='#4c5254'; x.fillRect(0,0,256,256);
    noiseOver(x,.1,true,2000);
    // panel divisions
    x.strokeStyle='rgba(15,17,18,.85)'; x.lineWidth=3;
    x.strokeRect(4,4,120,120); x.strokeRect(132,4,120,120);
    x.strokeRect(4,132,120,120); x.strokeRect(132,132,120,120);
    x.strokeStyle='rgba(190,200,205,.07)'; x.lineWidth=1;
    x.strokeRect(8,8,112,112);
    // rivets
    x.fillStyle='rgba(210,215,218,.16)';
    for(const px of [12,124,140,252]) for(const py of [12,124,140,252]) { x.beginPath(); x.arc(px%256,py%256,2.2,0,7); x.fill(); }
    // grime bottom
    const gr=x.createLinearGradient(0,170,0,256);
    gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(1,'rgba(20,22,16,.55)');
    x.fillStyle=gr; x.fillRect(0,170,256,86);
    blotches(x,6,10,40,'rgba(40,44,36,0.25)');
    return tex(c);
  },
  floorTile(){ // old linoleum checker
    const [c,x]=cv(256,256);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++){
      x.fillStyle=((i+j)%2)?'#585a52':'#6e6f66';
      x.fillRect(i*64,j*64,64,64);
      x.strokeStyle='rgba(25,26,22,.6)'; x.strokeRect(i*64+.5,j*64+.5,63,63);
    }
    noiseOver(x,.13,true,2200); noiseOver(x,.04,false,700);
    blotches(x,9,12,50,'rgba(28,26,20,.3)');
    return tex(c,{rep:[1,1]});
  },
  floorConc(){
    const [c,x]=cv(256,256);
    x.fillStyle='#54534d'; x.fillRect(0,0,256,256);
    noiseOver(x,.15,true,2600); noiseOver(x,.04,false,800);
    blotches(x,12,16,70,'rgba(24,23,18,.28)');
    // expansion joints
    x.strokeStyle='rgba(18,18,15,.55)'; x.lineWidth=2;
    x.beginPath(); x.moveTo(128,0); x.lineTo(128,256); x.moveTo(0,128); x.lineTo(256,128); x.stroke();
    return tex(c);
  },
  floorMetal(){
    const [c,x]=cv(256,256);
    x.fillStyle='#3f4447'; x.fillRect(0,0,256,256);
    // tread plate diamonds
    x.fillStyle='rgba(160,168,172,.13)';
    for(let i=0;i<8;i++)for(let j=0;j<8;j++){
      x.save(); x.translate(i*32+((j%2)*16),j*32); x.rotate(.78);
      x.fillRect(-7,-3.5,14,7); x.restore();
    }
    noiseOver(x,.12,true,1800);
    blotches(x,7,10,42,'rgba(35,28,18,.3)');
    return tex(c);
  },
  ceil(){
    const [c,x]=cv(256,256);
    x.fillStyle='#3b3d3c'; x.fillRect(0,0,256,256);
    x.strokeStyle='rgba(12,13,13,.8)'; x.lineWidth=3;
    for(let i=0;i<=2;i++){ x.beginPath(); x.moveTo(i*128,0); x.lineTo(i*128,256); x.stroke();
      x.beginPath(); x.moveTo(0,i*128); x.lineTo(256,i*128); x.stroke(); }
    noiseOver(x,.1,true,1500);
    // vent slots in one quadrant
    x.fillStyle='rgba(10,10,10,.75)';
    for(let i=0;i<5;i++) x.fillRect(20,20+i*10,88,4);
    return tex(c);
  },
  doorMetal(){
    const [c,x]=cv(256,384);
    x.fillStyle='#4a4f52'; x.fillRect(0,0,256,384);
    noiseOver(x,.09,true,1800);
    x.strokeStyle='rgba(12,14,14,.9)'; x.lineWidth=4; x.strokeRect(6,6,244,372);
    x.strokeStyle='rgba(200,206,210,.08)'; x.lineWidth=2; x.strokeRect(14,14,228,356);
    // push plate
    x.fillStyle='rgba(140,146,150,.25)'; x.fillRect(96,170,64,110);
    x.strokeStyle='rgba(10,10,10,.5)'; x.strokeRect(96,170,64,110);
    // hazard stripes bottom
    x.save(); x.beginPath(); x.rect(10,330,236,44); x.clip();
    for(let i=-4;i<10;i++){ x.fillStyle=i%2?'#8a6d12':'#191711'; x.save(); x.translate(i*32,352); x.rotate(-.78); x.fillRect(-16,-46,32,92); x.restore(); }
    x.restore();
    blotches(x,6,10,36,'rgba(48,38,22,.3)');
    return tex(c);
  },
  hazard(){
    const [c,x]=cv(128,128);
    x.fillStyle='#171512'; x.fillRect(0,0,128,128);
    x.fillStyle='#8a6d12';
    for(let i=-2;i<8;i++){ x.save(); x.translate(i*24,64); x.rotate(-.78); x.fillRect(-12,-80,24,160); x.restore(); }
    noiseOver(x,.2,true,700);
    return tex(c);
  },

  /* ------------- props / story ------------- */
  poster(title,body,bg='#b9ad92',fg='#332e26',accent='#7c2a24'){
    const [c,x]=cv(256,340);
    x.fillStyle=bg; x.fillRect(0,0,256,340);
    x.strokeStyle=accent; x.lineWidth=6; x.strokeRect(10,10,236,320);
    noiseOver(x,.08,true,600);
    x.fillStyle=fg; x.textAlign='center';
    x.font='bold 26px Georgia';
    const words=title.split(' '); let line='',yy=64;
    for(const w of words){ if((line+w).length>14){ x.fillText(line,128,yy); yy+=30; line=w+' '; } else line+=w+' '; }
    x.fillText(line.trim(),128,yy);
    x.font='15px Georgia'; x.textAlign='left';
    const lines=body.split('\n'); yy+=34;
    for(const ln of lines){ x.fillText(ln,26,yy); yy+=22; }
    blotches(x,4,8,30,'rgba(60,48,30,.25)');
    return tex(c);
  },
  calendar(){
    const [c,x]=cv(300,380);
    x.fillStyle='#cfc4a8'; x.fillRect(0,0,300,380);
    x.fillStyle='#8a2320'; x.fillRect(0,0,300,64);
    x.fillStyle='#efe6cf'; x.font='bold 34px Georgia'; x.textAlign='center';
    x.fillText('APRIL · 1983',150,44);
    // grid
    x.fillStyle='#3a352a'; x.font='13px Georgia';
    const days=['S','M','T','W','T','F','W'];
    for(let i=0;i<7;i++) x.fillText(days[i], 30+i*40, 92);
    let day=1, row=0;
    x.font='20px Georgia';
    const startDow=5; // Apr 1 1983 was a Friday
    for(let cell=0; day<=30; cell++){
      const col=cell%7, rw=Math.floor(cell/7);
      if(cell<startDow) continue;
      const px=30+col*40, py=126+rw*44;
      x.fillStyle='#3a352a'; x.fillText(String(day).padStart(2,'0'),px,py);
      day++;
    }
    // circle the 17th (row2: cells 16.. => dow 0 => col 0? Apr17 1983 Sunday -> col0 row3)
    const cxx=30+0*40, cyy=126+3*44-7;
    x.strokeStyle='#8a2320'; x.lineWidth=3.5;
    x.beginPath(); x.arc(cxx,cyy,17,0,7); x.stroke();
    x.font='bold 15px Georgia'; x.fillStyle='#8a2320'; x.textAlign='center';
    x.fillText('IT BEGAN',150,360);
    noiseOver(x,.07,true,500);
    blotches(x,3,10,26,'rgba(90,70,40,.2)');
    return tex(c);
  },
  whiteboard(){
    const [c,x]=cv(420,280);
    x.fillStyle='#aeb2ae'; x.fillRect(0,0,420,280);
    x.strokeStyle='#5c615e'; x.lineWidth=10; x.strokeRect(5,5,410,270);
    x.fillStyle='#33372f'; x.font='bold 30px Consolas,monospace'; x.textAlign='left';
    x.fillText('FIRST CONTACT — APR 17',26,54);
    x.strokeStyle='#7c2a24'; x.lineWidth=4;
    x.beginPath(); x.moveTo(22,66); x.lineTo(330,66); x.stroke();
    x.font='24px Consolas,monospace'; x.fillStyle='#3c4138';
    x.fillText('- signal not from strata',26,116);
    x.fillText('- comes THROUGH array',26,152);
    x.fillText('- Marsh sealed containment',26,188);
    x.fillText('- DO NOT restore mains',26,224);
    x.fillStyle='#7c2a24'; x.font='bold 24px Consolas,monospace';
    x.fillText('the date is everywhere.',26,258);
    return tex(c);
  },
  stencil(lines, w=256,h=128, color='#b8b09c'){
    const [c,x]=cv(w,h);
    x.clearRect(0,0,w,h);
    x.fillStyle=color; x.textAlign='center'; x.font='bold 30px Arial';
    lines.forEach((ln,i)=> x.fillText(ln, w/2, h/2 - (lines.length-1)*17 + i*34));
    return tex(c);
  },
  signPlate(text,{w=256,h=64,bg='#20262a',fg='#cfd6c9',border='#5b665f'}={}){
    const [c,x]=cv(w,h);
    x.fillStyle=bg; x.fillRect(0,0,w,h);
    x.strokeStyle=border; x.lineWidth=4; x.strokeRect(3,3,w-6,h-6);
    x.fillStyle=fg; x.textAlign='center'; x.font=`bold ${Math.min(30, Math.floor(h*0.42))}px Arial`;
    x.fillText(text, w/2, h/2+h*0.14);
    return tex(c);
  },
  paperSmall(){
    const [c,x]=cv(128,160);
    x.fillStyle='#cdc4ac'; x.fillRect(0,0,128,160);
    x.strokeStyle='rgba(90,84,66,.8)';
    for(let i=1;i<9;i++){ x.beginPath(); x.moveTo(12,20+i*15); x.lineTo(116,20+i*15); x.lineWidth=1; x.stroke(); }
    noiseOver(x,.06,true,240);
    return tex(c);
  },
  stain(){
    const [c,x]=cv(256,256);
    x.clearRect(0,0,256,256);
    blotches(x,14,20,70,'rgba(28,16,10,0.5)');
    blotches(x,6,8,26,'rgba(60,20,12,0.4)');
    return tex(c);
  },
  scrawl(text){
    const [c,x]=cv(256,128);
    x.clearRect(0,0,256,128);
    x.fillStyle='rgba(96,20,18,.85)'; x.textAlign='center';
    x.font='bold 40px Georgia';
    x.save(); x.translate(128,74); x.rotate(-0.06);
    x.fillText(text,0,0); x.restore();
    return tex(c);
  },
  flashCookie(){
    const [c,x]=cv(128,128);
    const g=x.createRadialGradient(64,64,6,64,64,62);
    g.addColorStop(0,'rgba(255,255,255,1)');
    g.addColorStop(.55,'rgba(255,255,255,.65)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g; x.fillRect(0,0,128,128);
    // subtle irregularities so beam isn't perfect
    x.globalCompositeOperation='destination-out';
    for(let i=0;i<26;i++){
      x.fillStyle=`rgba(0,0,0,${.05+Math.random()*.12})`;
      x.beginPath(); x.arc(Math.random()*128,Math.random()*128,3+Math.random()*14,0,7); x.fill();
    }
    return tex(c);
  },
};

})();
