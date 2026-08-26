/* ZENITH RUN · UI/HUD/screens · ox-alpha piagent run-01 */
(function(){
'use strict';
const ZR = window.ZR = window.ZR || {};
const $ = function(id){ return document.getElementById(id); };

const MEDALS = { gold: 75, silver: 115, bronze: 170 }; // seconds (tuned after calibration)

function fmt(t){
  if (t==null) return '—';
  const m=Math.floor(t/60), s=t-m*60;
  return m+':'+(s<10?'0':'')+s.toFixed(2);
}
ZR.fmtTime = fmt;

const ui = {
  els:{},
  init(handlers){
    const e=this.els;
    ['hud','timer','pbRow','pbTime','cpCount','cpTotal','deathCount','dashPip','dashFill',
     'speedFill','centerPop','splitPop','helpPanel','startScreen','btnStart','menuBest',
     'pauseScreen','btnResume','btnPRestart','chkMusic','chkGhostShow','pauseStats',
     'finishScreen','medalBadge','finalTime','newRecord','resultRows','btnAgain',
     'btnFreeRoam','medalHint','ghostTag'].forEach(id=>e[id]=$(id));
    e.cpTotal.textContent='/'+ (handlers.totalCp||6);
    e.btnStart.addEventListener('click', handlers.onStart);
    e.btnResume.addEventListener('click', handlers.onResume);
    e.btnPRestart.addEventListener('click', handlers.onRestart);
    e.btnAgain.addEventListener('click', handlers.onRestart);
    e.btnFreeRoam.addEventListener('click', handlers.onFreeRoam);
    e.chkMusic.checked = ZR.audio.musicOn();
    e.chkMusic.addEventListener('change', ()=>{ ZR.audio.setMusic(e.chkMusic.checked); });
    e.chkGhostShow.addEventListener('change', ()=>{ handlers.onGhostToggle(e.chkGhostShow.checked); });
    this.best(null);
  },
  best(b){ this.els.menuBest.textContent = b ? fmt(b.time) : '—';
           if(b){ this.els.pbRow.classList.remove('hidden'); this.els.pbTime.textContent=fmt(b.time);} },
  showStart(v){ this.els.startScreen.classList.toggle('hidden',!v); },
  showHud(v){ this.els.hud.classList.toggle('hidden',!v); },
  showPause(v){ this.els.pauseScreen.classList.toggle('hidden',!v); },
  showFinish(v){ this.els.finishScreen.classList.toggle('hidden',!v); },
  hud(state){
    const e=this.els;
    e.timer.textContent = fmt(state.time);
    e.cpCount.innerHTML = 'CP '+state.cp+'<span id="cpTotal">/'+state.totalCp+'</span>';
    e.deathCount.textContent = '☠ '+state.deaths;
    const f = Math.max(0,Math.min(1,state.dashCdFrac));
    e.dashPip.style.background = 'conic-gradient(var(--cyan) '+f+'turn, rgba(64,232,255,.15) '+f+'turn)';
    e.speedFill.style.width = Math.round(state.speedFrac*100)+'%';
  },
  centerPop(text,color,dur){
    const e=this.els.centerPop;
    e.textContent=text; e.style.color=color||'#a8ff5e';
    e.classList.add('show');
    clearTimeout(this._cpT);
    this._cpT=setTimeout(()=>e.classList.remove('show'),dur||1100);
  },
  split(delta){ // seconds delta or null
    const e=this.els.splitPop;
    if(delta==null){ e.classList.add('hidden'); return; }
    e.classList.remove('hidden','neg','pos');
    const neg = delta<=0;
    e.classList.add(neg?'neg':'pos');
    e.textContent = (neg?'▼ −':'▲ +')+Math.abs(delta).toFixed(2)+'s';
    clearTimeout(this._spT);
    this._spT=setTimeout(()=>e.classList.add('hidden'),2200);
  },
  help(v){ this.els.helpPanel.classList.toggle('hidden',!v); },
  pauseStats(s){ this.els.pauseStats.textContent=s; },
  ghostTag(v){ this.els.ghostTag.classList.toggle('hidden',!v); },
  medalFor(t){
    if(t<MEDALS.gold) return ['gold','GOLD'];
    if(t<MEDALS.silver) return ['silver','SILVER'];
    if(t<MEDALS.bronze) return ['bronze','BRONZE'];
    return ['none','FINISHER'];
  },
  finish(r){ // r:{time,pb,isNew,splitsDelta:[..],deaths}
    const e=this.els;
    const [cls,label]=this.medalFor(r.time);
    e.medalBadge.className='medal '+cls;
    e.medalBadge.firstElementChild.textContent=label;
    e.finalTime.textContent=fmt(r.time);
    e.newRecord.classList.toggle('hidden',!r.isNew);
    let rows='';
    rows+='<div>personal best&nbsp;&nbsp;<b>'+fmt(r.pb)+'</b></div>';
    rows+='<div>deaths&nbsp;&nbsp;<b>'+r.deaths+'</b></div>';
    if(r.splitsDelta&&r.splitsDelta.length){
      rows+='<div style="margin-top:6px;color:#8fa2cc">checkpoint deltas</div>';
      r.splitsDelta.forEach((d,i)=>{
        if(d==null){ rows+='<div>CP'+(i+1)+'&nbsp;&nbsp;—</div>'; return; }
        const neg=d<=0;
        rows+='<div>CP'+(i+1)+'&nbsp;&nbsp;<b class="'+(neg?'neg':'pos')+'">'+(neg?'−':'+')+Math.abs(d).toFixed(2)+'s</b></div>';
      });
    }
    e.resultRows.innerHTML=rows;
    const next = cls==='gold'?'silver' : cls==='silver'?'bronze' : null;
    e.medalHint.textContent = next ? ('next rank: beat '+fmt(MEDALS[next])+' ('+next.toUpperCase()+')')
      : (cls==='gold' ? 'perfect — now shave every hundredth!' : 'keep chasing that first medal!');
    this.showFinish(true);
  },
  toast(msg){ this.centerPop(msg,'#ffffff',1400); }
};
ui.MEDALS = MEDALS;
ZR.ui = ui;
})();
