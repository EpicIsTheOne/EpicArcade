/* ============================================================
   Character Customizer — app shell
   ============================================================ */
'use strict';
(function(){
const CC = window.CC;
const $  = (s,r)=> (r||document).querySelector(s);
const $$ = (s,r)=> Array.from((r||document).querySelectorAll(s));

const LS_CUR='cc.state.v1', LS_SLOTS='cc.slots.v1', LS_HELP='cc.helpSeen.v1';

let state = CC.normalizeState(safeParse(localStorage.getItem(LS_CUR)) || CC.DEFAULT_STATE);
let activeTab='body';
let photoMode=false;
let saveTimer=null;

function safeParse(s){ try{ return JSON.parse(s); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch(e){ return false; } }
function lsGet(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }

/* ---------- state application ---------- */
function setState(next, opts){
  opts=opts||{};
  state=CC.normalizeState(Object.assign({},state,next));
  renderMain(opts.pop!==false);
  schedulePersist();
  refreshSelections();
}
function schedulePersist(){ clearTimeout(saveTimer); saveTimer=setTimeout(()=>lsSet(LS_CUR,state),150); }

/* ---------- main stage render ---------- */
const stageHost=$('#char-host');
function renderMain(pop){
  stageHost.innerHTML=CC.renderCharacterSVG(state,{});
  const svg=stageHost.firstChild;
  if(svg&&pop){
    svg.classList.add('pop-in');
    setTimeout(()=>svg&&svg.classList.remove('pop-in'),320);
  }
}

/* ---------- mini previews ---------- */
const MANNEQUIN={ skin:2, hairStyle:1, hairColor:3, expression:0, eyeColor:3,
  outfit:0, cPrimary:5, cAccent:6, pose:0, build:1, headwear:0, eyewear:0, neckwear:0, extra:0 };
const CROPS={
  head:'112 62 136 160', torso:'96 200 168 190', full:'66 52 228 420',
};
function previewSVG(over,crop){
  const st=Object.assign({},MANNEQUIN,over);
  const vb=CROPS[crop]||CROPS.full;
  return CC.renderCharacterSVG(st,{viewBox:vb});
}
function cardHTML(kind,idx,name,inner){
  return '<button type="button" class="card" data-kind="'+kind+'" data-idx="'+idx+'" title="'+name+'">'+
    '<span class="card-art">'+inner+'</span><span class="card-name">'+name+'</span></button>';
}
function swatchHTML(kind,idx,color,name){
  return '<button type="button" class="swatch" data-kind="'+kind+'" data-idx="'+idx+'" title="'+name+'" '+
    'style="background:'+color+'" aria-label="'+name+'"></button>';
}

/* ---------- tab content builders ---------- */
function optionCards(kind,list,crop,overrideFor){
  return list.map((o,i)=>{
    const over=overrideFor? overrideFor(i):{};
    return cardHTML(kind,i,o.name,previewSVG(over,crop));
  }).join('');
}
const TABS={
  body:{ label:'Body', icon:'🧍', build(){
    let h='<h3 class="sec">Pose</h3><div class="grid cards">';
    h+=optionCards('pose',CC.BUILDS.map((_,i)=>({name:CC.POSES[i].name})),'full',(i)=>({pose:i}));
    h+='</div><h3 class="sec">Build</h3><div class="grid cards">';
    h+=optionCards('build',CC.BUILDS,'full',(i)=>({build:i}));
    h+='</div><h3 class="sec">Skin tone</h3><div class="grid swatches">';
    h+=CC.SKINS.map((c,i)=>swatchHTML('skin',i,c,'Skin '+(i+1))).join('');
    h+='</div>';
    return h; }},
  hair:{ label:'Hair', icon:'💇', build(){
    let h='<h3 class="sec">Style</h3><div class="grid cards">';
    h+=optionCards('hairStyle',CC.HAIRSTYLES,'head',(i)=>({hairStyle:i}));
    h+='</div><h3 class="sec">Hair color</h3><div class="grid swatches">';
    h+=CC.HAIR_COLORS.map((c,i)=>swatchHTML('hairColor',i,c,'Hair '+(i+1))).join('');
    h+='</div>';
    return h; }},
  face:{ label:'Face', icon:'😊', build(){
    let h='<h3 class="sec">Expression</h3><div class="grid cards">';
    h+=optionCards('expression',CC.EXPRESSIONS,'head',(i)=>({expression:i}));
    h+='</div><h3 class="sec">Eye color</h3><div class="grid swatches">';
    h+=CC.EYE_COLORS.map((c,i)=>swatchHTML('eyeColor',i,c,'Eyes '+(i+1))).join('');
    h+='</div>';
    return h; }},
  outfit:{ label:'Outfit', icon:'👕', build(){
    let h='<h3 class="sec">Outfit</h3><div class="grid cards wide">';
    h+=optionCards('outfit',CC.OUTFITS,'torso',(i)=>({outfit:i}));
    h+='</div><h3 class="sec">Main color</h3><div class="grid swatches">';
    h+=CC.OUTFIT_COLORS.map((c,i)=>swatchHTML('cPrimary',i,c,'Main '+(i+1))).join('');
    h+='</div><h3 class="sec">Accent color <small>(pants, trim &amp; gear)</small></h3><div class="grid swatches">';
    h+=CC.OUTFIT_COLORS.map((c,i)=>swatchHTML('cAccent',i,c,'Accent '+(i+1))).join('');
    h+='</div>';
    return h; }},
  extras:{ label:'Extras', icon:'✨', build(){
    let h='';
    [['headwear',CC.HEADWEAR],['eyewear',CC.EYEWEAR],['neckwear',CC.NECKWEAR],['extra',CC.EXTRAS]].forEach(([kind,list])=>{
      h+='<h3 class="sec">'+sectionName(kind)+'</h3><div class="grid cards">';
      h+=list.map((o,i)=>{
        const over={}; over[kind]=i;
        return cardHTML(kind,i,o.name, i===0? '<span class="none-slash">∅</span>' : previewSVG(over,'head'));
      }).join('');
      h+='</div>';
    });
    return h; }},
};
function sectionName(kind){
  return {headwear:'Headwear',eyewear:'Eyewear',neckwear:'Neck & back',extra:'Finishing touches'}[kind];
}

function renderTab(){
  const host=$('#options');
  host.innerHTML=TABS[activeTab].build();
  refreshSelections();
}
function refreshSelections(){
  $$('#options [data-kind]').forEach(el=>{
    el.classList.toggle('selected', state[el.dataset.kind]===+el.dataset.idx);
  });
  $$('[data-preset]').forEach(b=>b.classList.toggle('active', b.dataset.preset===currentPresetId));
}

$('#options').addEventListener('click',(e)=>{
  const btn=e.target.closest('[data-kind]');
  if(!btn) return;
  const kind=btn.dataset.kind, idx=+btn.dataset.idx;
  if(state[kind]===idx) return;
  const patch={}; patch[kind]=idx;
  currentPresetId=null;
  setState(patch);
});

/* ---------- tab bar ---------- */
$('#tabs').innerHTML=Object.entries(TABS).map(([id,t])=>
  '<button type="button" class="tab'+(id===activeTab?' active':'')+'" data-tab="'+id+'">'+
  '<span class="tab-icon">'+t.icon+'</span>'+t.label+'</button>').join('');
$('#tabs').addEventListener('click',(e)=>{
  const t=e.target.closest('[data-tab]'); if(!t) return;
  activeTab=t.dataset.tab;
  $$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===activeTab));
  renderTab();
});

/* ---------- presets ---------- */
let currentPresetId=null;
$('#presets').innerHTML=CC.PRESETS.map(p=>{
  const st=Object.assign({},CC.DEFAULT_STATE,p.st);
  return '<button type="button" class="preset" data-preset="'+p.id+'" title="Load preset: '+p.name+'">'+
    '<span class="preset-art">'+CC.renderCharacterSVG(st,{viewBox:CROPS.full})+'</span>'+
    '<span class="preset-name">'+p.emoji+' '+p.name+'</span></button>';
}).join('');
function applyPreset(id,pop){
  const p=CC.PRESETS.find(x=>x.id===id); if(!p) return false;
  currentPresetId=id;
  setState(Object.assign({},CC.DEFAULT_STATE,p.st),{pop:pop!==false});
  return true;
}
$('#presets').addEventListener('click',(e)=>{
  const b=e.target.closest('[data-preset]'); if(!b) return;
  applyPreset(b.dataset.preset);
  toast('Preset loaded: '+CC.PRESETS.find(p=>p.id===b.dataset.preset).name);
});

/* ---------- randomize / reset ---------- */
function randomize(seed){
  const rng=(typeof seed==='number')? CC.mulberry32(seed): Math.random;
  currentPresetId=null;
  setState(CC.randomState(rng));
  spawnSparkles();
}
$('#btn-random').addEventListener('click',()=>randomize());
$('#btn-reset').addEventListener('click',()=>{
  currentPresetId=null;
  setState(Object.assign({},CC.DEFAULT_STATE));
  toast('Reset to default look');
});

/* ---------- save / load slots ---------- */
function getSlots(){ const s=lsGet(LS_SLOTS); return Array.isArray(s)&&s.length===3? s:[null,null,null]; }
function setSlots(s){ lsSet(LS_SLOTS,s); }
function renderSlots(){
  const slots=getSlots(), host=$('#slots');
  host.innerHTML=slots.map((s,i)=>{
    if(!CC.isValidState(s)){
      return '<div class="slot empty"><span class="slot-preview ph">'+(i+1)+'</span>'+
        '<span class="slot-info"><strong>Slot '+(i+1)+'</strong><em>empty</em></span>'+
        '<button type="button" class="mini" data-save="'+i+'">Save</button></div>';
    }
    const d=new Date(s.ts||Date.now());
    return '<div class="slot"><span class="slot-preview">'+CC.renderCharacterSVG(s.state,{viewBox:CROPS.full})+'</span>'+
      '<span class="slot-info"><strong>Slot '+(i+1)+'</strong><em>'+d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'</em></span>'+
      '<button type="button" class="mini" data-load="'+i+'">Load</button>'+
      '<button type="button" class="mini ghost" data-save="'+i+'" title="Overwrite slot">Save</button>'+
      '<button type="button" class="mini ghost danger" data-clear="'+i+'" title="Clear slot">✕</button></div>';
  }).join('');
}
$('#slots').addEventListener('click',(e)=>{
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.load!==undefined){
    const s=getSlots()[+b.dataset.load];
    if(CC.isValidState(s)){ currentPresetId=null; setState(s.state); toast('Loaded from slot '+(+b.dataset.load+1)); }
  }else if(b.dataset.save!==undefined){
    const i=+b.dataset.save, slots=getSlots();
    slots[i]={state:Object.assign({},state), ts:Date.now()};
    setSlots(slots); renderSlots(); toast('Saved to slot '+(i+1));
  }else if(b.dataset.clear!==undefined){
    const i=+b.dataset.clear, slots=getSlots();
    slots[i]=null; setSlots(slots); renderSlots(); toast('Slot '+(i+1)+' cleared');
  }
});

/* ---------- photo mode ---------- */
function enterPhoto(){ if(photoMode) return; photoMode=true; document.body.classList.add('photo'); $('#exit-photo').focus(); }
function exitPhoto(){ if(!photoMode) return; photoMode=false; document.body.classList.remove('photo'); tiltReset(); }
$('#btn-photo').addEventListener('click',enterPhoto);
$('#exit-photo').addEventListener('click',exitPhoto);

/* subtle parallax in photo mode */
const tiltWrap=$('#tilt');
let tiltFrame=0;
window.addEventListener('mousemove',(e)=>{
  if(!photoMode||tiltFrame) return;
  tiltFrame=requestAnimationFrame(()=>{
    tiltFrame=0;
    const rx=((e.clientY/window.innerHeight)-0.5)*-4;
    const ry=((e.clientX/window.innerWidth)-0.5)*5;
    tiltWrap.style.transform='perspective(900px) rotateX('+rx.toFixed(2)+'deg) rotateY('+ry.toFixed(2)+'deg)';
  });
},{passive:true});
function tiltReset(){ tiltWrap.style.transform=''; }

/* ---------- PNG export ---------- */
function downloadPNG(){
  const svgStr=CC.renderCharacterSVG(state,{standalone:true});
  const blob=new Blob([svgStr],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const img=new Image();
  img.onload=()=>{
    const c=document.createElement('canvas'); c.width=720; c.height=1000;
    const ctx=c.getContext('2d');
    ctx.drawImage(img,0,0,720,1000);
    URL.revokeObjectURL(url);
    c.toBlob((pngBlob)=>{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(pngBlob);
      a.download='my-character.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),4000);
      toast('Character downloaded as PNG');
    },'image/png');
  };
  img.onerror=()=>{ URL.revokeObjectURL(url); toast('Export failed in this browser'); };
  img.src=url;
}
$('#btn-download').addEventListener('click',downloadPNG);
$('#btn-download-photo').addEventListener('click',downloadPNG);

/* ---------- help overlay ---------- */
function openHelp(){ $('#help').classList.add('open'); }
function closeHelp(){ $('#help').classList.remove('open'); }
$('#btn-help').addEventListener('click',openHelp);
$('#help-close').addEventListener('click',closeHelp);
$('#help').addEventListener('click',(e)=>{ if(e.target.id==='help') closeHelp(); });

/* ---------- toast ---------- */
let toastTimer=null;
function toast(msg){
  const t=$('#toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),2200);
}

/* ---------- sparkles on randomize ---------- */
function spawnSparkles(){
  const host=$('#sparkles');
  for(let i=0;i<12;i++){
    const s=document.createElement('span');
    s.className='spark'; s.textContent=Math.random()<0.5?'✦':'＊';
    s.style.left=(30+Math.random()*40)+'%';
    s.style.top=(25+Math.random()*45)+'%';
    s.style.setProperty('--dx',((Math.random()-0.5)*160)+'px');
    s.style.setProperty('--dy',(-60-Math.random()*120)+'px');
    s.style.setProperty('--rot',((Math.random()-0.5)*180)+'deg');
    s.style.animationDelay=(Math.random()*0.12)+'s';
    host.appendChild(s);
    setTimeout(()=>s.remove(),1100);
  }
}

/* ---------- keyboard ---------- */
window.addEventListener('keydown',(e)=>{
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  const k=e.key.toLowerCase();
  if(k==='escape'){ if($('#help').classList.contains('open')) closeHelp(); else if(photoMode) exitPhoto(); return; }
  if(photoMode) { if(k==='p'||k==='r'){ exitPhoto(); } else return; }
  if(k==='r'){ randomize(); }
  else if(k==='p'){ enterPhoto(); }
  else if(k==='?'||k==='h'){ openHelp(); }
  else if(k>='1'&&k<='6'){ const p=CC.PRESETS[+k-1]; if(applyPreset(p.id)) toast('Preset loaded: '+p.name); }
});

/* ---------- boot ---------- */
renderMain(false);
renderTab();
renderSlots();

/* URL params (used by automated verification too) */
const q=new URLSearchParams(location.search);
if(q.get('preset')) applyPreset(q.get('preset'),false);
if(q.get('random')==='1') randomize(q.has('seed')? parseInt(q.get('seed'),10)&0x7fffffff : undefined);
if(q.get('tab')) { const t=q.get('tab'); if(TABS[t]){ activeTab=t; $$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===t)); renderTab(); } }
if(q.get('photo')==='1') enterPhoto();
if(q.get('help')==='1') openHelp();
if(q.get('selftest')!=='1' && !lsGet(LS_HELP)){ lsSet(LS_HELP,true); setTimeout(openHelp,600); }

/* ---------- self test (?selftest=1) ---------- */
if(q.get('selftest')==='1'){
  setTimeout(()=>{
    const out=[]; let pass=0,fail=0;
    const T=(name,fn)=>{ try{ fn(); pass++; out.push('PASS '+name); }
      catch(err){ fail++; out.push('FAIL '+name+': '+(err&&err.message||err)); } };
    function assert(c,m){ if(!c) throw new Error(m||'assertion failed'); }

    T('palettes non-empty & hex valid',()=>{
      [CC.SKINS,CC.HAIR_COLORS,CC.OUTFIT_COLORS,CC.EYE_COLORS].forEach(pal=>
        pal.forEach(c=>assert(/^#[0-9a-f]{6}$/i.test(c),'bad color '+c)));
    });
    T('default state valid',()=>assert(CC.isValidState(CC.DEFAULT_STATE)));
    T('render default contains layers',()=>{
      const s=CC.renderCharacterSVG(CC.DEFAULT_STATE);
      ['layer-back','layer-body','layer-head','layer-hair','layer-acc','blink-wrap'].forEach(id=>
        assert(s.includes(id),'missing '+id));
    });
    T('no NaN/undefined across hair×outfit sweep',()=>{
      for(let h=0;h<CC.HAIRSTYLES.length;h++)for(let o=0;o<CC.OUTFITS.length;o++){
        const s=CC.renderCharacterSVG(Object.assign({},CC.DEFAULT_STATE,{hairStyle:h,outfit:o}));
        assert(!/NaN|undefined/.test(s),'bad svg h='+h+' o='+o);
      }});
    T('sweep each dimension fully',()=>{
      const dims={expression:CC.EXPRESSIONS.length,pose:CC.POSES.length,build:CC.BUILDS.length,
        headwear:CC.HEADWEAR.length,eyewear:CC.EYEWEAR.length,neckwear:CC.NECKWEAR.length,extra:CC.EXTRAS.length,
        skin:CC.SKINS.length,hairColor:CC.HAIR_COLORS.length,eyeColor:CC.EYE_COLORS.length,
        cPrimary:CC.OUTFIT_COLORS.length,cAccent:CC.OUTFIT_COLORS.length};
      Object.entries(dims).forEach(([k,n])=>{ for(let i=0;i<n;i++){
        const st=Object.assign({},CC.DEFAULT_STATE); st[k]=i;
        const s=CC.renderCharacterSVG(st);
        assert(!/NaN|undefined/.test(s),'bad '+k+'='+i);
      }})});
    T('300 seeded random states valid + render clean',()=>{
      const rng=CC.mulberry32(1234);
      for(let i=0;i<300;i++){
        const st=CC.randomState(rng);
        assert(CC.isValidState(st),'invalid state #'+i);
        const s=CC.renderCharacterSVG(st);
        assert(!/NaN|undefined/.test(s),'bad render #'+i);
      }});
    T('normalize clamps out-of-range',()=>{
      const n=CC.normalizeState({skin:999,pose:-4});
      assert(n.skin===CC.SKINS.length-1&&n.pose===0);
    });
    T('presets all valid + renderable',()=>{
      CC.PRESETS.forEach(p=>{ assert(CC.isValidState(p.st),'invalid preset '+p.id);
        assert(!/NaN|undefined/.test(CC.renderCharacterSVG(p.st)),'render preset '+p.id); });
    });
    T('standalone export has xmlns + size',()=>{
      const s=CC.renderCharacterSVG(CC.DEFAULT_STATE,{standalone:true});
      assert(s.includes('xmlns')&&s.includes('width="720"'));
    });
    T('save/load roundtrip via localStorage slots',()=>{
      const st=CC.randomState(CC.mulberry32(77));
      lsSet(LS_SLOTS,[{state:st,ts:1},null,null]);
      const back=getSlots();
      assert(JSON.stringify(back[0].state)===JSON.stringify(CC.normalizeState(st)),'roundtrip mismatch');
      setSlots([null,null,null]);
    });

    const el=document.createElement('div'); el.id='selftest-out';
    el.setAttribute('data-pass',pass); el.setAttribute('data-fail',fail);
    el.textContent='SELFTEST pass='+pass+' fail='+fail+' :: '+out.join(' | ');
    document.title='SELFTEST:'+pass+'/'+(pass+fail)+(fail?' FAIL':' PASS');
    document.body.appendChild(el);
    // report via image GET so headless CLI runs land the result in the server log
    try{ new Image().src='/selftest-result?p='+pass+'&f='+fail+'&d='+encodeURIComponent(out.join('~')); }catch(e){}
  },100);
}
})();
