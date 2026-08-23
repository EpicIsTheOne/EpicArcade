// textures.js — procedural canvas textures for the Wonderdrome venue.
'use strict';
WD.textures = (() => {
  function cv(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h;
    return [c, c.getContext('2d')]; }
  function grain(x, amt, w, h){
    const img = x.getImageData(0,0,w,h), d=img.data;
    for(let i=0;i<d.length;i+=4){ const n=(Math.random()-0.5)*amt;
      d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
    x.putImageData(img,0,0);
  }
  function tex(c, rx=1, ry=1){
    const t=new THREE.CanvasTexture(c);
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
    t.anisotropy=4; return t;
  }
  // speckled dark carpet — atrium/dining
  function carpet(){
    const [c,x]=cv(256,256); x.fillStyle='#171a22'; x.fillRect(0,0,256,256);
    for(let i=0;i<2600;i++){ x.fillStyle=`hsl(${225+Math.random()*40},${18+Math.random()*30}%,${6+Math.random()*16}%)`;
      x.fillRect(Math.random()*256, Math.random()*256, 2.4, 2.4); }
    // faded star confetti pattern
    for(let i=0;i<26;i++){ x.fillStyle='rgba(190,160,50,0.10)';
      const px=Math.random()*256, py=Math.random()*256, r=Math.random()*7+3;
      x.beginPath();
      for(let k=0;k<10;k++){ const a=k*Math.PI/5, rr=k%2?r*0.45:r;
        x.lineTo(px+Math.sin(a)*rr, py-Math.cos(a)*rr); }
      x.closePath(); x.fill(); }
    grain(x,26,256,256); return c;
  }
  // checker tiles — kitchen/office floor
  function checker(){
    const [c,x]=cv(256,256); const n=8,s=32;
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){
      x.fillStyle=(i+j)%2?'#23262c':'#3a3e47'; x.fillRect(i*s,j*s,s,s); }
    grain(x,20,256,256); return c;
  }
  // scuffed concrete — workshop/halls/backstage
  function concrete(){
    const [c,x]=cv(256,256); x.fillStyle='#2a2c31'; x.fillRect(0,0,256,256);
    for(let i=0;i<900;i++){ x.fillStyle=`rgba(${20+Math.random()*40|0},${20+Math.random()*40|0},${25+Math.random()*40|0},0.35)`;
      x.beginPath(); x.arc(Math.random()*256,Math.random()*256,Math.random()*9+1,0,7); x.fill(); }
    // cracks
    x.strokeStyle='rgba(10,10,12,0.5)';
    for(let i=0;i<7;i++){ x.beginPath(); let px=Math.random()*256, py=Math.random()*256;
      x.moveTo(px,py); for(let k=0;k<6;k++){ px+=(Math.random()-0.5)*70; py+=(Math.random()-0.5)*70; x.lineTo(px,py);} x.stroke(); }
    grain(x,30,256,256); return c;
  }
  // painted wall panels — venue walls with stripe band
  function wall(band='#7c2130'){
    const [c,x]=cv(256,256); x.fillStyle='#33303a'; x.fillRect(0,0,256,256);
    // subtle vertical panel seams
    x.fillStyle='rgba(0,0,0,0.28)';
    for(let i=0;i<=4;i++) x.fillRect(i*64,0,2,256);
    x.fillStyle='rgba(255,255,255,0.05)'; for(let i=0;i<=4;i++) x.fillRect(i*64+2,0,1,256);
    // stripe band
    x.fillStyle=band; x.fillRect(0,96,256,26);
    x.fillStyle='rgba(0,0,0,0.35)'; x.fillRect(0,120,256,3);
    // grime near bottom
    const g=x.createLinearGradient(0,200,0,256); g.addColorStop(0,'rgba(0,0,0,0)');
    g.addColorStop(1,'rgba(5,5,8,0.55)'); x.fillStyle=g; x.fillRect(0,200,256,56);
    grain(x,18,256,256); return c;
  }
  // stage curtain
  function curtain(col='#5c1220'){
    const [c,x]=cv(256,256); x.fillStyle=col; x.fillRect(0,0,256,256);
    for(let i=0;i<64;i++){ const v=(Math.sin(i*0.7)*0.5+0.5);
      x.fillStyle=`rgba(${v>0.5?255:0},${v>0.5?230:0},${v>0.5?235:0},${Math.abs(v-0.5)*0.16})`;
      x.fillRect(i*4,0,3,256); }
    for(let i=0;i<400;i++){ x.fillStyle='rgba(0,0,0,0.08)';
      x.fillRect(Math.random()*256,Math.random()*256,2,Math.random()*20+4); }
    grain(x,12,256,256); return c;
  }
  // brushed metal — doors, vents, machines
  function metal(){
    const [c,x]=cv(128,128); x.fillStyle='#3f444d'; x.fillRect(0,0,128,128);
    for(let i=0;i<300;i++){ x.strokeStyle=`rgba(${140+Math.random()*80|0},${145+Math.random()*80|0},${155+Math.random()*80|0},0.07)`;
      const y=Math.random()*128; x.beginPath(); x.moveTo(0,y); x.lineTo(128,y+(Math.random()-0.5)*4); x.stroke(); }
    grain(x,16,128,128); return c;
  }
  // ceiling panels
  function ceiling(){
    const [c,x]=cv(128,128); x.fillStyle='#20222a'; x.fillRect(0,0,128,128);
    x.strokeStyle='rgba(0,0,0,0.6)'; x.lineWidth=3;
    x.strokeRect(0,0,128,128); x.strokeRect(64,0,64,64); x.strokeRect(0,64,64,64); x.strokeRect(64,64,64,64);
    for(let i=0;i<300;i++){ x.fillStyle='rgba(0,0,0,0.16)';
      x.fillRect(Math.random()*128,Math.random()*128,2,2); }
    return c;
  }
  // warning stripes plate
  function hazard(){
    const [c,x]=cv(128,128); x.fillStyle='#8a6d12'; x.fillRect(0,0,128,128);
    x.fillStyle='#15161a';
    for(let i=-4;i<8;i++){ x.save(); x.translate(i*32,0); x.rotate(-0.785);
      x.fillRect(-8,-90,16,260); x.restore(); }
    grain(x,22,128,128); return c;
  }
  let cache=null;
  function all(){
    if(cache) return cache;
    cache={
      carpetA:tex(carpet(),8,8),  carpetB:tex(carpet(),5,5),
      checker:tex(checker(),4,4), concreteA:tex(concrete(),6,6),
      concreteB:tex(concrete(),3,3),
      wallRed:tex(wall('#7c2130'),3,1), wallBlue:tex(wall('#1e3a5c'),3,1),
      wallGold:tex(wall('#6d5416'),3,1),
      curtain:tex(curtain(),4,2), curtainN:tex(curtain('#101018'),2,2),
      metal:tex(metal(),1,1), metalWide:tex(metal(),3,1),
      ceil:tex(ceiling(),6,6), hazard:tex(hazard(),2,1),
    };
    return cache;
  }
  return { all };
})();
