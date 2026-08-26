export class UI{
  constructor(cb){
    this.cb=cb;
    const $=id=>document.getElementById(id);
    this.el={
      hud:$('hud'),mon:$('mon'),flip:$('flip'),panels:$('panels'),
      powerPct:$('power-pct'),usage:[...document.querySelectorAll('#usage i')],
      powerWarn:$('power-warn'),snareState:$('snare-state'),clock:$('clock'),nightLabel:$('night-label'),
      subtitle:$('subtitle'),toast:$('toast'),
      camName:$('cam-name'),camTs:$('cam-ts'),camAudioTag:$('cam-audio-tag'),map:$('map'),
      lureBtn:$('lure-btn'),snareBtn:$('snare-btn'),monClose:$('mon-close'),
      screens:{
        menu:$('menu'),intro:$('intro'),pause:$('pause'),helpscr:$('helpscr'),
        archive:$('archive'),settings:$('settings'),gameover:$('gameover'),win:$('win')
      },
      introHead:$('intro-head'),introText:$('intro-text'),intro:$('intro'),
      archiveList:$('archive-list'),
      goBy:$('go-by'),goTip:$('go-tip'),
      winTime:$('win-time'),winSub:$('win-sub'),
      nightRow:$('night-row'),btnContinue:$('btn-continue'),btnNew:$('btn-new'),
      setVol:$('set-vol'),setSens:$('set-sens'),setInvX:$('set-inv-x'),setInvY:$('set-inv-y'),
      setGfx:$('set-gfx'),setSubs:$('set-subs'),setVolV:$('set-vol-v'),setSensV:$('set-sens-v')
    };
    this.panelRefs={};
    this.mapBtns={};
    this._subPri=0;
    this._subT=null;
    this._toastT=null;
  }
  mount(){
    const c=this.cb;
    const fz=document.createElement('div');
    fz.id='flip-zone';
    fz.innerHTML='<span>▲ MONITOR ▲</span>';
    this.el.flip.appendChild(fz);
    this.flipZone=fz;
    fz.addEventListener('mouseenter',()=>c.onFlipHover&&c.onFlipHover(true));
    fz.addEventListener('click',()=>c.onFlipToggle());
    this.el.monClose.addEventListener('click',()=>c.onMonClose());
    this.el.lureBtn.addEventListener('click',()=>c.onLureBtn());
    this.el.snareBtn.addEventListener('click',()=>c.onSnareBtn());

    document.getElementById('btn-resume').onclick=()=>c.onResume();
    document.getElementById('btn-restart').onclick=()=>c.onRestart();
    document.getElementById('btn-quit').onclick=()=>c.onQuit();
    document.getElementById('btn-help-close').onclick=()=>c.onHelpClose();
    document.getElementById('btn-archive-back').onclick=()=>c.onArchiveBack();
    document.getElementById('btn-settings-back').onclick=()=>c.onSettingsBack();
    document.getElementById('btn-retry').onclick=()=>c.onRetry();
    document.getElementById('btn-go-menu').onclick=()=>c.onGoMenu();
    document.getElementById('btn-win-next').onclick=()=>c.onWinNext();

    this.el.setVol.addEventListener('input',e=>{this.el.setVolV.textContent=e.target.value;c.onSetting('vol',+e.target.value/100);});
    this.el.setSens.addEventListener('input',e=>{this.el.setSensV.textContent=(e.target.value/100).toFixed(1);c.onSetting('sens',+e.target.value/100);});
    this.el.setInvX.addEventListener('change',e=>c.onSetting('invX',e.target.checked));
    this.el.setInvY.addEventListener('change',e=>c.onSetting('invY',e.target.checked));
    this.el.setGfx.addEventListener('change',e=>c.onSetting('gfx',e.target.value));
    this.el.setSubs.addEventListener('change',e=>c.onSetting('subs',e.target.checked));

    this.buildPanels();
  }

  screen(name){
    for(const s in this.el.screens)this.el.screens[s].classList.toggle('hide',s!==name);
    if(name){this.hudShow(false);}
  }
  hudShow(b){this.el.hud.classList.toggle('hide',!b);}
  monShow(b){
    this.el.mon.classList.toggle('hide',!b);
    this.el.flip.classList.toggle('up',b);
    this.flipZone.querySelector('span').textContent=b?'▼ LOWER MONITOR [SPACE]':'▲ MONITOR ▲';
  }
  panelsShow(b){this.el.panels.style.display=b?'block':'none';}
  flipZoneShow(b){this.el.flip.style.display=b?'block':'none';}

  setPower(pct,bars,warn){
    this.el.powerPct.textContent=Math.ceil(pct)+'%';
    this.el.usage.forEach((u,i)=>u.classList.toggle('on',i<bars));
    this.el.powerWarn.classList.toggle('hide',!warn);
  }
  setClock(t){this.el.clock.textContent=t;}
  setNight(n){this.el.nightLabel.textContent=n===6?'OVERTIME':'NIGHT '+n;}
  sub(t,pri=0){
    if(!this.cb.canSub())return;
    if(pri<this._subPri&&this.el.subtitle.textContent)return;
    this._subPri=pri;
    this.el.subtitle.textContent=t;
    clearTimeout(this._subT);
    this._subT=setTimeout(()=>{this.el.subtitle.textContent='';this._subPri=0;},2200);
  }
  toast(t,ms=2800){
    this.el.toast.textContent=t;
    this.el.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT=setTimeout(()=>this.el.toast.classList.remove('show'),ms);
  }
  pause(){this.screen('pause');}
  help(){this.screen('helpscr');}

  buildPanels(){
    const defs=[
      {key:'L',label:'WEST',x:-2.55,y:1.5,z:12.3,btns:[
        {id:'doorL',label:'DOOR · Q',act:'doorL'},{id:'lightL',label:'LIGHT · Z',act:'lightL'}]},
      {key:'R',label:'EAST',x:2.55,y:1.5,z:12.3,btns:[
        {id:'doorR',label:'DOOR · E',act:'doorR'},{id:'lightR',label:'LIGHT · C',act:'lightR'}]},
      {key:'VL',label:'W VENT',x:-3.15,y:1.05,z:13.8,btns:[{id:'hatchL',label:'HATCH · F',act:'hatchL'}]},
      {key:'VR',label:'E VENT',x:3.15,y:1.05,z:13.8,btns:[{id:'hatchR',label:'HATCH · G',act:'hatchR'}]}
    ];
    for(const d of defs){
      const p=document.createElement('div');
      p.className='panel3d';p.dataset.key=d.key;
      p.innerHTML=`<div class="plabel">${d.label}</div>`+d.btns.map(b=>
        `<button class="pbtn" data-act="${b.act}">${b.label}</button>`).join('');
      p.querySelectorAll('.pbtn').forEach(btn=>{
        btn.addEventListener('mousedown',e=>{e.preventDefault();this.cb.onPanelDown(d.key,btn.dataset.act);});
        btn.addEventListener('mouseup',e=>{e.preventDefault();this.cb.onPanelUp(d.key,btn.dataset.act);});
        btn.addEventListener('mouseleave',()=>this.cb.onPanelUp(d.key,btn.dataset.act));
      });
      this.el.panels.appendChild(p);
      this.panelRefs[d.key]={el:p,pos:{x:d.x,y:d.y,z:d.z}};
    }
  }
  layoutPanels(project){
    for(const k in this.panelRefs){
      const pr=this.panelRefs[k];
      const s=project(pr.pos);
      if(!s){pr.el.style.display='none';continue;}
      pr.el.style.display='flex';
      pr.el.style.left=s.x+'px';
      pr.el.style.top=s.y+'px';
      const sc=s.scale||1;
      pr.el.style.transform=`translate(-50%,-50%) scale(${sc})`;
    }
  }
  panelBtn(act,on,cls){
    const btn=document.querySelector(`.pbtn[data-act="${act}"]`);
    if(!btn)return;
    const clsName=cls==='door'?'on-door':cls==='hatch'?'on-hatch':'on-light';
    btn.classList.toggle(clsName,!!on);
  }

  buildMap(entries){
    this.el.map.innerHTML='';
    this.mapBtns={};
    for(const e of entries){
      if(e.office){
        const o=document.createElement('div');
        o.id='office-box';
        o.style.left=e.mx+'%';o.style.top=e.my+'%';
        o.textContent='YOU';
        this.el.map.appendChild(o);
        continue;
      }
      const b=document.createElement('button');
      b.className='cam-b'+(e.hidden?' hidden-cam':'');
      b.style.left=e.mx+'%';b.style.top=e.my+'%';
      b.innerHTML=(e.num?e.num+'<br>':'')+e.label;
      b.dataset.id=e.id;
      b.addEventListener('click',()=>this.cb.onMapPick(e.id,this.lureModeOn));
      this.el.map.appendChild(b);
      this.mapBtns[e.id]=b;
    }
  }
  mapActive(id){
    Object.values(this.mapBtns).forEach(b=>b.classList.remove('active'));
    if(this.mapBtns[id])this.mapBtns[id].classList.add('active');
  }
  mapVoid(on){if(this.mapBtns['VOID'])this.mapBtns['VOID'].style.display=on?'block':'none';}
  mapLureMode(on){
    this.lureModeOn=on;
    Object.values(this.mapBtns).forEach(b=>b.classList.toggle('lure-mode',on));
    this.el.lureBtn.classList.toggle('lure-on',on);
  }
  mapLureTarget(id){
    Object.values(this.mapBtns).forEach(b=>b.classList.remove('lure-target'));
    if(id&&this.mapBtns[id])this.mapBtns[id].classList.add('lure-target');
  }
  setCamInfo(num,name,ts,audioOnly){
    this.el.camName.textContent=`${num} · ${name}`;
    this.el.camTs.textContent=ts;
    this.el.camAudioTag.classList.toggle('hide',!audioOnly);
  }
  snareUI(mode,frac){
    const b=this.el.snareBtn;
    b.classList.toggle('armed',mode==='armed');
    b.classList.toggle('cooldown',mode==='cd');
    b.textContent=mode==='armed'?`⚡ SNARE ACTIVE ${Math.ceil(frac*20)}s`:
      mode==='cd'?`⚡ RECHARGING ${Math.ceil(frac*30)}s`:'⚡ VENT SNARE [B]';
    this.el.snareState.textContent='';
  }

  bindMenu(onStart){
    this.onStartNight=onStart;
    this.el.btnNew.onclick=()=>onStart(this.selNight||1);
    this.el.btnContinue.onclick=()=>onStart(this.contNight||1);
    document.getElementById('btn-archive').onclick=()=>this.cb.onArchive();
    document.getElementById('btn-settings').onclick=()=>this.cb.onSettingsOpen();
    document.getElementById('btn-help').onclick=()=>this.cb.onHelp();
  }
  menuShow({maxNight,beaten,hasSave},sel){
    this.screen('menu');
    this.hudShow(false);
    this.monShow(false);
    this.panelsShow(false);
    this.flipZoneShow(false);
    this.contNight=Math.min(maxNight,6);
    this.selNight=sel;
    this.el.btnContinue.disabled=!hasSave;
    this.el.btnContinue.textContent=hasSave?`CONTINUE — NIGHT ${Math.min(maxNight+1,6)}`:'CONTINUE';
    this.el.btnNew.textContent=`CLOCK IN — NIGHT ${sel}`;
    this.el.nightRow.innerHTML='';
    for(let n=1;n<=6;n++){
      const b=document.createElement('button');
      b.className='night-b'+(n===sel?' sel':'')+(beaten[n]?' beaten':'');
      b.textContent=n===6?'OT':n;
      b.disabled=n>maxNight;
      b.title=n===6?'Overtime (after Night 5)':`Night ${n}`;
      b.onclick=()=>{
        this.selNight=n;
        this.el.btnNew.textContent=`CLOCK IN — NIGHT ${n}`;
        [...this.el.nightRow.children].forEach(x=>x.classList.toggle('sel',x===b));
      };
      this.el.nightRow.appendChild(b);
    }
  }
  intro(head,lines,onDone){
    this.screen('intro');
    this.el.introHead.textContent=head;
    this.el.introText.innerHTML='<span class="cur"></span>';
    let li=0,ci=0,buf='';
    clearInterval(this.typeTimer);
    const cur='<span class="cur"></span>';
    this.typeTimer=setInterval(()=>{
      if(li>=lines.length){
        clearInterval(this.typeTimer);
        setTimeout(()=>{if(onDone)onDone();},1600);
        return;
      }
      const line=lines[li];
      if(ci<line.length){
        buf+=line[ci++];
        if(buf.length%3===0)this.cb.onTypeTick();
      }else{
        buf+='\n';li++;ci=0;
      }
      this.el.introText.innerHTML=buf.replace(/\n/g,'<br>')+cur;
    },26);
    this.el.intro.onclick=()=>{
      clearInterval(this.typeTimer);
      this.el.introText.innerHTML=lines.join('<br>');
      if(onDone)onDone();
    };
  }
  gameover(name,title,tip){
    this.screen('gameover');
    this.el.goBy.textContent=`${name} — ${title}`;
    this.el.goTip.textContent=tip;
  }
  win(subtext){
    this.screen('win');
    this.el.winTime.textContent='6:00 AM';
    this.el.winSub.innerHTML=subtext;
  }
  archive(memos,unlockedIds){
    this.screen('archive');
    this.el.archiveList.innerHTML='';
    for(const m of memos){
      const un=unlockedIds.includes(m.id);
      const d=document.createElement('div');
      d.className='memo'+(un?'':' locked');
      d.innerHTML=`<h4>${m.title}<span class="tag">${m.unlock}</span></h4><p>${un?m.body.replace(/\n/g,'<br>'):'— locked —'}</p>`;
      this.el.archiveList.appendChild(d);
    }
  }
  settings(s){
    this.el.setVol.value=s.vol*100;this.el.setVolV.textContent=Math.round(s.vol*100);
    this.el.setSens.value=s.sens*100;this.el.setSensV.textContent=s.sens.toFixed(1);
    this.el.setInvX.checked=s.invX;this.el.setInvY.checked=s.invY;
    this.el.setGfx.value=s.gfx;this.el.setSubs.checked=s.subs;
    this.screen('settings');
  }
}
