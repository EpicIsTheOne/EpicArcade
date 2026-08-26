import { settings, saveSettings } from './config.js';

const $=id=>document.getElementById(id);

export class UI {
  constructor(){
    this.screens={main:$('menuMain'),pause:$('menuPause'),settings:$('menuSettings'),
      controls:$('menuControls'),chapters:$('menuChapters')};
    this.hud=$('hud');
    this.subEl=$('subtitle');
    this.promptEl=$('prompt');
    this.cc=$('chamberCard');this.ccT=$('ccTitle');this.ccS=$('ccSub');
    this.perfEl=$('perfHud');
    this.fadeEl=$('fadeout');
    this.dotB=$('dotB');this.dotO=$('dotO');
    this._subTimer=null;this._ccTimer=null;
    this.settingsBack='main';
  }
  show(name){ for(const k in this.screens)this.screens[k].classList.toggle('hidden',k!==name); if(name)this.hud.classList.remove('on'); }
  hideAll(){ for(const k in this.screens)this.screens[k].classList.add('hidden'); }
  hudOn(v){ this.hud.classList.toggle('on',v); }

  subtitle(html,dur=4200){
    this.subEl.innerHTML=html;this.subEl.style.display='block';
    clearTimeout(this._subTimer);
    this._subTimer=setTimeout(()=>{this.subEl.style.display='none';},dur);
  }
  chamberCard(title,sub){
    this.ccT.textContent=title;this.ccS.textContent=sub||'';
    this.cc.classList.add('show');
    clearTimeout(this._ccTimer);
    this._ccTimer=setTimeout(()=>this.cc.classList.remove('show'),5200);
  }
  prompt(text){
    if(text){this.promptEl.innerHTML=text;this.promptEl.style.display='block';}
    else this.promptEl.style.display='none';
  }
  portalDots(blue,orange){
    this.dotB.setAttribute('opacity',blue?'.95':'.28');
    this.dotO.setAttribute('opacity',orange?'.95':'.28');
  }
  fade(on,dur=600){
    this.fadeEl.style.transition=`opacity ${dur}ms`;
    this.fadeEl.classList.toggle('on',on);
  }
  perf(text){ if(text===null){this.perfEl.style.display='none';return;} this.perfEl.style.display='block';this.perfEl.innerHTML=text; }

  bindSettings(get,set,onQuality){
    const invX=$('setInvX'),invY=$('setInvY'),sens=$('setSens'),fov=$('setFov'),q=$('setQuality'),vol=$('setVol');
    const sync=()=>{
      invX.checked=settings.invX;invY.checked=settings.invY;
      sens.value=settings.sens;fov.value=settings.fov;q.value=settings.quality;vol.value=settings.vol;
    };
    sync();
    invX.onchange=()=>{settings.invX=invX.checked;saveSettings();};
    invY.onchange=()=>{settings.invY=invY.checked;saveSettings();};
    sens.oninput=()=>{settings.sens=parseFloat(sens.value);saveSettings();};
    fov.oninput=()=>{settings.fov=parseInt(fov.value);set&&set.fov(settings.fov);saveSettings();};
    q.onchange=()=>{settings.quality=q.value;saveSettings();onQuality&&onQuality(settings.quality);};
    vol.oninput=()=>{settings.vol=parseFloat(vol.value);set&&set.vol(settings.vol);saveSettings();};
    return sync;
  }
}
