/* HOLLOW SIGNAL — UI layer */
(function(){
"use strict";
const HG = window.HG;
const $=id=>document.getElementById(id);

const UI = HG.UI = {
  els:{}, subT:null, toastT:null,

  init(){
    const ids=['hud','objective','objLabel','objText','crosshair','prompt','invBar','subtitle','toast','hintLine',
      'title','intro','introText','noteWrap','noteTitle','noteBody','keypadWrap','kpDisplay','kpGrid',
      'pauseWrap','settingsWrap','controlsWrap','death','end','endText','statTime','statDeaths','statNotes',
      'objOverlay','objList','credits','loading','fearVeil','flashWhite','flashRed','flashBlack','damageVeil'];
    for(const id of ids) this.els[id]=$(id);

    // settings wiring
    const S=HG.settings;
    const bind=(id,out,key,fmt)=>{
      const el=$(id),o=$(out);
      el.value=Math.round(S[key]*(id==='setVol'?100:id==='setBright'?100:100));
      o.textContent=el.value;
      el.addEventListener('input',()=>{
        let v=+el.value;
        if(id==='setVol'){ S.volume=v/100; HG.Audio.applyVolume(); }
        else if(id==='setBright'){ S.brightness=v/100; }
        else if(id==='setSens'){ S.sens=v/100; }
        o.textContent=v;
        S.save();
      });
    };
    bind('setVol','outVol','volume');
    bind('setBright','outBright','brightness');
    bind('setSens','outSens','sens');
    const subs=$('setSubs'); subs.checked=S.subtitles;
    subs.addEventListener('change',()=>{S.subtitles=subs.checked;S.save();});
    const hb=$('setHead'); hb.checked=S.headbob;
    hb.addEventListener('change',()=>{S.headbob=hb.checked;S.save();});

    // keypad grid
    const grid=this.els.kpGrid;
    for(const k of ['1','2','3','4','5','6','7','8','9','C','0','⏎']){
      const b=document.createElement('button');
      b.textContent=k; b.dataset.k=k;
      grid.appendChild(b);
    }
  },

  /* ---------- visibility helpers ---------- */
  show(id){ this.els[id].classList.remove('hidden'); },
  hide(id){ this.els[id].classList.add('hidden'); },

  setHUD(on){ on?this.show('hud'):this.hide('hud'); },

  objective(text){
    this.els.objText.textContent=text;
    this.els.objective.classList.remove('pulse');
    void this.els.objective.offsetWidth;
    this.els.objective.classList.add('pulse');
  },

  prompt(text){
    const p=this.els.prompt;
    if(!text){ p.classList.add('hidden'); return; }
    p.textContent=text; p.classList.remove('hidden');
  },

  inventory(items){ // items: [{icon,label}] or []
    const bar=this.els.invBar;
    bar.innerHTML='';
    for(const it of items){
      const d=document.createElement('div');
      d.className='invItem';
      d.innerHTML=`<svg width="14" height="14" viewBox="0 0 16 16"><rect x="6" y="2" width="4" height="9" fill="#b8a86e"/><rect x="4" y="11" width="8" height="3" fill="#8a8578"/></svg><span>${it.label}</span>`;
      bar.appendChild(d);
    }
  },

  subtitle(text,dur=2.8){
    const s=this.els.subtitle;
    s.textContent=text; s.classList.remove('hidden');
    clearTimeout(this.subT);
    this.subT=setTimeout(()=>s.classList.add('hidden'),dur*1000);
  },
  toast(text,dur=2200){
    const t=this.els.toast;
    t.textContent=text; t.style.opacity=1;
    clearTimeout(this.toastT);
    this.toastT=setTimeout(()=>t.style.opacity=0,dur);
  },
  hint(text,dur=5000){
    const h=this.els.hintLine;
    h.textContent=text; h.style.opacity=1;
    clearTimeout(this.hintT);
    this.hintT=setTimeout(()=>h.style.opacity=0,dur);
  },

  /* ---------- fear / damage fx ---------- */
  fear(v){ this.els.fearVeil.style.opacity=v; },
  damage(v){ this.els.damageVeil.style.opacity=v; },
  flash(which,peak=.9,fadeMs=420){
    const el=this.els[which];
    el.style.transition='none'; el.style.opacity=peak;
    requestAnimationFrame(()=>{ el.style.transition=`opacity ${fadeMs}ms ease-out`; el.style.opacity=0; });
  },

  objectivesOverlay(list){
    const box=this.els.objList;
    box.innerHTML='';
    for(const o of list){
      const d=document.createElement('div');
      d.className='objRow'+(o.done?' done':(o.cur?' cur':''));
      d.textContent=o.text;
      box.appendChild(d);
    }
  },

  /* ---------- note panel ---------- */
  showNote(title,body,onClose){
    this._noteClose=onClose;
    this.els.noteTitle.textContent=title;
    this.els.noteBody.textContent=body;
    this.show('noteWrap');
  },
  hideNote(){ this.hide('noteWrap'); const f=this._noteClose; this._noteClose=null; f&&f(); },

  /* ---------- keypad ---------- */
  openKeypad(onSubmit,onCancel){
    this._kp={value:'',onSubmit,onCancel};
    this.kpRender();
    this.show('keypadWrap');
  },
  closeKeypad(){ this.hide('keypadWrap'); this._kp=null; },
  kpKey(k){
    if(!this._kp) return;
    const kp=this._kp;
    if(k==='C'){ kp.value=''; HG.Audio.play('clunk',{vol:.5}); }
    else if(k==='⏎'){
      if(kp.value.length===4){ kp.onSubmit(kp.value); }
      else { this.kpError(); }
      return;
    }
    else if(kp.value.length<4){ kp.value+=k; HG.Audio.play('beep',{fq:660+kp.value.length*80}); }
    this.kpRender();
  },
  kpError(){
    HG.Audio.play('buzz');
    const d=this.els.kpDisplay;
    d.classList.remove('err'); void d.offsetWidth; d.classList.add('err');
    d.textContent='——';
    setTimeout(()=>this.kpRender(),450);
  },
  kpRender(){
    if(!this._kp) return;
    const v=this._kp.value;
    this.els.kpDisplay.textContent = v? v.padEnd(4,'·') : '····';
  },

  /* ---------- screens ---------- */
  deathScreen(showIt){ showIt?this.show('death'):this.hide('death'); },
  endScreen(stats,onCredits){
    this.els.statTime.textContent=stats.time;
    this.els.statDeaths.textContent=stats.deaths;
    this.els.statNotes.textContent=stats.notes;
    $('btnEndCredits').onclick=()=>{ this.hide('end'); this.show('credits'); };
    this.show('end');
  },
};
document.addEventListener('click',e=>{
  // keypad buttons
  const b=e.target.closest('#kpGrid button');
  if(b&&HG.UI._kp){ HG.UI.kpKey(b.dataset.k); return; }
  if(e.target.closest('#kpCancel')&&HG.UI._kp){ const c=HG.UI._kp.onCancel; HG.UI.closeKeypad(); c&&c(); return; }
  // note close
  if(HG.UI._noteClose && !e.target.closest('#notePaper')){ HG.UI.hideNote(); return; }
});
})();
