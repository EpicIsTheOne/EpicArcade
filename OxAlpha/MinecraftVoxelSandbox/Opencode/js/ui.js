// HUD + menus + inventory/crafting/furnace/chest screens. DOM based.
import { B, BLOCKS } from './blocks.js';
import { ITEMS } from './items.js';
import { RECIPES, matchRecipe } from './craft.js';

export function labelOf(id){
  if(typeof id==='number')return BLOCKS[id]?BLOCKS[id].name:'?';
  return ITEMS[id]?(ITEMS[id].label||id):String(id);
}
export function stackMax(id){return typeof id==='number'?64:((ITEMS[id]&&ITEMS[id].stack)||64);}
export function sameItem(a,b){
  if(!a||!b)return false;
  if(typeof a.id!==typeof b.id)return false;
  return String(a.id)===String(b.id);
}

export class UI{
  constructor(game){
    this.game=game;
    this.cursor=null;
    this.open=null;
    this.grid=null;
    this.container=null;
    this.dirtyHotbar=true;
    this.debugOn=false;
    this._refreshFns=[];
    this.root=document.getElementById('ui');
    this.hud=document.getElementById('hud');
    this.screens=document.getElementById('screens');
    this.build();
  }

  el(tag,cls,parent,text){
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(text!==undefined)e.textContent=text;
    (parent||document.body).appendChild(e);
    return e;
  }

  build(){
    const hud=document.getElementById('hud');
    this.el('div','crosshair',hud);
    this.statL=this.el('div','stats left',hud);
    this.hearts=this.el('div','hearts',this.statL);
    const rightWrap=this.el('div','stats right',hud);
    this.hunger=this.el('div','hunger',rightWrap);
    this.airRow=this.el('div','airrow',rightWrap);
    this.hotbarEl=this.el('div','hotbar',hud);
    this.hotSlots=[];
    for(let i=0;i<9;i++){
      const s=this.el('div','slot hotslot',this.hotbarEl);
      s.dataset.i=i;
      s.addEventListener('mousedown',ev=>{
        ev.preventDefault();
        this.game.player.sel=i;
        this.dirtyHotbar=true;
        this.game.ui.showHeldName();
      });
      this.hotSlots.push(s);
    }
    this.heldLabel=this.el('div','held-label',hud);
    this.toastsEl=this.el('div','toasts',hud);
    this.debugEl=this.el('div','debug',hud);
    this.hintEl=this.el('div','hint',hud);
    this.overlay=document.getElementById('overlay');

    document.addEventListener('mousemove',e=>{
      if(this.cursorEl&&this.cursor){
        this.cursorEl.style.left=(e.clientX-22)+'px';
        this.cursorEl.style.top=(e.clientY-22)+'px';
      }
      if(this.tipEl&&this.tipEl.style.display==='block'){
        this.tipEl.style.left=(e.clientX+14)+'px';
        this.tipEl.style.top=(e.clientY+10)+'px';
      }
    });
    this.tipEl=this.el('div','tooltip');
    this.tipEl.style.display='none';
    this.cursorEl=this.el('div','slot cursor-slot');
    this.cursorEl.style.display='none';
    this.cursorEl.style.position='fixed';
    window.addEventListener('contextmenu',e=>{if(this.game.locked||this.open)e.preventDefault();});
    this.renderHearts();
  }

  iconURL(ref){
    return this.game.iconURL(ref);
  }

  slotFill(el,s){
    el.innerHTML='';
    el.classList.remove('filled');
    if(!s)return;
    el.classList.add('filled');
    const url=this.iconURL(s.id);
    if(url){
      const img=new Image();
      img.src=url;img.draggable=false;
      el.appendChild(img);
    } else {
      el.textContent='?';
    }
    if((s.count|0)>1)this.el('span','cnt',el,String(s.count));
    if(typeof s.id==='string'&&s.dur!==undefined&&ITEMS[s.id]){
      const max=ITEMS[s.id].durability;
      if(max){
        const frac=Math.max(0,s.dur/max);
        const bar=this.el('div','dur',el);
        bar.style.width=(frac*100)+'%';
        bar.style.background=`hsl(${frac*110},80%,55%)`;
      }
    }
  }

  renderHotbar(){
    const p=this.game.player;
    for(let i=0;i<9;i++){
      this.slotFill(this.hotSlots[i],p.inv[i]);
      this.hotSlots[i].classList.toggle('sel',i===p.sel);
    }
    this.dirtyHotbar=false;
  }
  showHeldName(){
    const s=this.game.player.inv[this.game.player.sel];
    this.heldLabel.textContent=s?labelOf(s.id):'';
    this.heldLabel.classList.add('show');
    clearTimeout(this._hl);
    this._hl=setTimeout(()=>this.heldLabel.classList.remove('show'),1400);
  }
  swing(){ this.game.swingArm(); }

  renderHearts(){
    let h='';
    for(let i=0;i<10;i++)h+='<span class="hp"></span>';
    let f='';
    for(let i=0;i<10;i++)f+='<span class="fd"></span>';
    this.hearts.innerHTML=h;
    this.hunger.innerHTML=f;
    let a='';
    for(let i=0;i<10;i++)a+='<span class="ab"></span>';
    this.airRow.innerHTML=a;
  }
  updateStats(){
    const p=this.game.player;
    const hpSpans=this.hearts.children;
    for(let i=0;i<10;i++){
      const v=p.hp-i*2;
      hpSpans[i].className=v>=1.6?'hp full':(v>=0.4?'hp half':'hp');
    }
    const fdSpans=this.hunger.children;
    for(let i=0;i<10;i++){
      const v=p.hunger-i*2;
      fdSpans[i].className=v>=1.6?'fd full':(v>=0.4?'fd half':'fd');
    }
    if(p.headInWater||p.air<p.maxAir-0.5){
      this.airRow.style.display='flex';
      const n=Math.ceil(p.air);
      const abs=this.airRow.children;
      for(let i=0;i<10;i++)abs[i].className=i<n?'ab full':'ab';
    } else this.airRow.style.display='none';
    void this.game.renderer;
  }

  toast(msg,color){
    const t=this.el('div','toastmsg',this.toastsEl,msg);
    if(color)t.style.borderColor=color;
    setTimeout(()=>t.classList.add('out'),2400);
    setTimeout(()=>t.remove(),2900);
  }

  closeScreen(){
    if(!this.open)return;
    if((this.open==='inv'||this.open==='table')&&this.grid){
      for(const s of this.grid)if(s)this.game.player.addItem(s);
      this.grid=null;
    }
    if(this.cursor){
      this.game.player.addItem(this.cursor);
      this.cursor=null;
      this.cursorEl.style.display='none';
    }
    this.open=null;this.container=null;this._refreshFns=[];
    this.overlay.style.display='none';this.overlay.innerHTML='';
    this.tipEl.style.display='none';
    this.game.onScreenClose();
  }

  panel(title,bodyHTML,cls){
    this.overlay.innerHTML='';
    this.overlay.style.display='flex';
    const wrap=this.el('div','panelwrap'+(cls?' '+cls:''),this.overlay);
    if(title)this.el('div','ptitle',wrap,title);
    const box=this.el('div','pbox',wrap);
    if(bodyHTML)box.innerHTML=bodyHTML;
    return {wrap,box};
  }

  mkSlot(parent,get,set,opts={}){
    opts=opts||{};
    const el=this.el('div','slot invslot',parent);
    const refresh=()=>{
      const s=get();
      this.slotFill(el,s);
      el.onmouseenter=()=>{if(s){this.tipEl.textContent=labelOf(s.id);this.tipEl.style.display='block';}};
      el.onmouseleave=()=>{this.tipEl.style.display='none';};
    };
    refresh();
    this._refreshFns.push(refresh);
    el.addEventListener('mousedown',ev=>{
      ev.preventDefault();ev.stopPropagation();
      const s=get();
      if(ev.button===2){
        if(this.cursor){
          if(opts.canSet&&!opts.canSet(this.cursor))return;
          if(!s){
            set({id:this.cursor.id,count:1,...(this.cursor.dur!==undefined?{dur:this.cursor.dur}:{})});
            this.cursor.count--;
            if(this.cursor.count<=0){this.cursor=null;}
          } else if(String(s.id)===String(this.cursor.id)&&s.count<stackMax(s.id)&&s.dur===undefined&&this.cursor.dur===undefined){
            s.count++;this.cursor.count--;
            if(this.cursor.count<=0)this.cursor=null;
          }
        } else if(s&&s.count>1&&s.dur===undefined){
          const half=Math.ceil(s.count/2);
          this.cursor={id:s.id,count:half};
          s.count-=half;
        } else if(s){
          this.cursor=s;set(null);
        }
      } else {
        if(ev.shiftKey&&s&&opts.shiftTo){
          const left=opts.shiftTo(s);
          if(left)set(left.count>0?left:null);
        } else if(this.cursor){
          if(opts.canSet&&!opts.canSet(this.cursor))return;
          if(!s){set(this.cursor);this.cursor=null;}
          else if(String(s.id)===String(this.cursor.id)&&s.dur===undefined&&this.cursor.dur===undefined&&s.count<stackMax(s.id)){
            const take=Math.min(stackMax(s.id)-s.count,this.cursor.count);
            s.count+=take;this.cursor.count-=take;
            if(this.cursor.count<=0)this.cursor=null;
          } else {const t=s;set(this.cursor);this.cursor=t;}
        } else if(s){this.cursor=s;set(null);}
      }
      if(this.game.audio)this.game.audio.play('click');
      this.refreshAll();
    });
    return el;
  }

  refreshAll(){
    for(const f of this._refreshFns)f();
    if(this.cursor){
      this.slotFill(this.cursorEl,this.cursor);
      this.cursorEl.style.display='block';
    } else this.cursorEl.style.display='none';
    this.renderHotbar();
    this.updateCraftOut();
  }

  invGrids(box){
    const p=this.game.player;
    this.el('div','grouplabel',box,'Inventory');
    const main=this.el('div','invgrid main',box);
    for(let i=9;i<36;i++){
      const idx=i;
      this.mkSlot(main,()=>p.inv[idx],v=>{p.inv[idx]=v;},{shiftTo:s=>{
        return this.quickShift(s,[0,1,2,3,4,5,6,7,8]);
      }});
    }
    const hot=this.el('div','invgrid hotrow',box);
    for(let i=0;i<9;i++){
      const idx=i;
      this.mkSlot(hot,()=>p.inv[idx],v=>{p.inv[idx]=v;},{shiftTo:s=>this.quickShift(s,[9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35])});
    }
  }
  quickShift(s,range){
    const p=this.game.player;
    if(s.dur===undefined){
      for(const i of range){
        const t=p.inv[i];
        if(t&&String(t.id)===String(s.id)&&t.dur===undefined&&t.count<stackMax(t.id)){
          const take=Math.min(stackMax(t.id)-t.count,s.count);
          t.count+=take;s.count-=take;
          if(s.count<=0)return null;
        }
      }
    }
    for(const i of range){
      if(!p.inv[i]){p.inv[i]=s;return null;}
    }
    return s;
  }

  openCraftGrid(size){
    this.grid=new Array(size*size).fill(null);
    const gridEl=this.el('div','craftgrid g'+size);
    for(let i=0;i<size*size;i++){
      const idx=i;
      this.mkSlot(gridEl,()=>this.grid[idx],v=>{this.grid[idx]=v;});
    }
    const arrow=this.el('div','arrow','→');
    const out=this.el('div','slot outslot');
    out.addEventListener('mousedown',ev=>{
      ev.preventDefault();ev.stopPropagation();
      this.takeCraftOutput(ev.shiftKey);
    });
    return {gridEl,arrow,out};
  }

  updateCraftOut(){
    if(!this.grid)return;
    const w=this.grid.length===4?2:3;
    const r=matchRecipe(this.grid,w);
    const out=this.overlay.querySelector('.outslot');
    if(out)this.slotFill(out,r?{id:r.o[0],count:r.o[1]}:null);
    if(r&&!this._lastCraft)if(this.game.audio)this.game.audio.play('clickUI');
    this._lastCraft=r;
  }

  takeCraftOutput(all){
    if(!this.grid)return;
    const times=all?64:1;
    let made=0;
    for(let k=0;k<times;k++){
      const w=this.grid.length===4?2:3;
      const r=matchRecipe(this.grid,w);
      if(!r)break;
      const st={id:r.o[0],count:r.o[1]};
      if(typeof r.o[0]==='string'&&ITEMS[r.o[0]]&&ITEMS[r.o[0]].durability)
        st.dur=ITEMS[r.o[0]].durability,st.count=1,void st;
      if(this.cursor){
        if(!sameItem(this.cursor,st)||this.cursor.count+st.count>stackMax(st.id))break;
        this.cursor.count+=typeof st.id==='string'&&ITEMS[st.id]&&ITEMS[st.id].durability?0:st.count;
        if(ITEMS[typeof st.id==='string'?st.id:null])void 0;
      } else {
        this.cursor={...st};
      }
      made++;
      for(let i=0;i<this.grid.length;i++){
        if(this.grid[i]){
          this.grid[i].count--;
          if(this.grid[i].count<=0)this.grid[i]=null;
        }
      }
      if(!all)break;
    }
    if(made&&this.game.audio)this.game.audio.play('levelup');
    this.refreshAll();
  }

  open(kind,container){
    if(kind==='inventory')this.openInventory(false);
    else if(kind==='table')this.openInventory(true);
    else if(kind==='chest')this.openChest(container);
    else if(kind==='furnace')this.openFurnace(container);
  }

  openInventory(hasTable){
    this.closeScreen();
    this.open='inv';
    this.inputLock=true;
    if(this.game.input)this.game.input.enabled=false;
    const {box}=this.panel('Crafting'+(hasTable?' — 3×3 table grid':''),'','inv-panel');
    const row=this.el('div','craftrow',box);
    const cg=this.openCraftGrid(hasTable?3:2);
    row.appendChild(cg.gridEl);
    row.appendChild(cg.arrow);
    row.appendChild(cg.out);
    const invBox=this.el('div','',wrap.querySelector('.pbox'));
    this.invGrids(invBox);
    this.updateCraftOut();
  }

  openFurnace(cont){
    this.open='furnace';
    this.container=cont;
    const f=cont.slots;
    const {box}=this.panel('Furnace',null,'furn-panel');
    const row=this.el('div','furnrow',box);
    const colIn=this.el('div','fcol',row);
    const inSlot=this.mkSlot(colIn,()=>f.input,v=>{f.input=v;cont.dirty=true;});
    inSlot.classList.add('inslot');
    this.flame=this.el('div','flame',colIn);
    this.flameFill=this.el('div','flamefill',this.flame);
    const fuelSlot=this.mkSlot(colIn,()=>f.fuel,v=>{f.fuel=v;cont.dirty=true;});
    fuelSlot.classList.add('fuelslot');
    const mid=this.el('div','fmid',row);
    this.prog=this.el('div','progbar',mid);
    this.progFill=this.el('div','progfill',this.prog);
    this.el('div','arrow',mid,'→');
    const out=this.mkSlot(row,()=>f.out,v=>{f.out=v;cont.dirty=true;});
    out.classList.add('outslot');
    out.addEventListener('mousedown',ev=>{
      ev.preventDefault();ev.stopPropagation();
      if(f.out){
        if(this.cursor&&sameItem(this.cursor,f.out)&&this.cursor.dur===undefined){
          this.cursor.count+=f.out.count;f.out=null;
        } else if(!this.cursor){this.cursor=f.out;f.out=null;}
      }
      this.refreshAll();
    },true);
    const invBox=this.el('div','',box);
    this.invGrids(invBox);
  }

  furnaceTick(){
    if(this.open!=='furnace'||!this.container)return;
    const f=this.container.slots;
    this.progFill.style.width=((f.prog||0)*10)+'%';
    const fl=f.burnMax>0?Math.max(0,f.burn/f.burnMax):0;
    this.flameFill.style.height=(fl*100)+'%';
  }

  openChest(cont){
    this.open='chest';
    this.container=cont;
    const {box}=this.panel('Chest',null,'chest-panel');
    const grid=this.el('div','invgrid chestgrid',box);
    for(let i=0;i<27;i++){
      const idx=i;
      this.mkSlot(grid,()=>cont.slots[idx],v=>{cont.slots[idx]=v;cont.dirty=true;},
        {shiftTo:s=>this.quickShift(s,[0,1,2,3,4,5,6,7,8])});
    }
    const invBox=this.el('div','',box);
    this.invGrids(invBox);
    this.game.audio.play('chestOpen');
  }

  openPause(){
    this.open='pause';
    const {box}=this.panel('Game Paused');
    const mkBtn=(txt,fn)=>{
      const b=this.el('button','mbtn',box,txt);
      b.onclick=()=>{this.game.audio&&this.game.audio.play('click');fn();};
      return b;
    };
    mkBtn('Back to Game',()=>this.closeScreen());
    mkBtn('Options…',()=>{this.open='settings';this.openSettings(()=>{this.openPause();});});
    mkBtn('How to Play',()=>{this.open='help';this.openHelp(()=>{this.openPause();});});
    mkBtn('Save & Quit to Title',()=>{
      this.closeScreen();
      this.game.saveNow();
      this.game.showTitle();
    });
  }

  openSettings(done){
    this.open='settings';
    const S=this.game.settings;
    const {box}=this.panel('Options');
    const rows=this.el('div','setrows',box);
    const slider=(name,min,max,val,fmt,cb)=>{
      const row=this.el('div','setrow',rows);
      const lbl=this.el('label','',row,name+' ');
      const valSpan=this.el('span','val',lbl,fmt(val));
      const inp=this.el('input','',row);
      inp.type='range';inp.min=min;inp.max=max;inp.value=val;
      inp.oninput=()=>{const v=+inp.value;valSpan.textContent=fmt(v);cb(v);};
      return inp;
    };
    const selRow=this.el('div','setrow',rows);
    this.el('label','',selRow,'Graphics ');
    const sel=this.el('select','',selRow);
    for(const q of ['low','medium','high','ultra']){
      const o=this.el('option','',sel,q);
      o.value=q;
      if(q===S.quality)o.selected=true;
    }
    sel.onchange=()=>{S.quality=sel.value;this.game.applyQuality();saveS();};
    slider('Render Distance',3,12,S.renderDist,v=>v,v=>{S.renderDist=v;this.game.applyQuality(true);saveS();});
    slider('Field of View',60,105,S.fov,v=>v+'°',v=>{S.fov=v;this.game.applyQuality(true);saveS();});
    slider('Mouse Sensitivity',20,300,S.sens*100,v=>v+'%',v=>{S.sens=v/100;saveS();});
    slider('Volume',0,100,(S.master??0.7)*100,v=>v+'%',v=>{S.master=v/100;if(this.game.audio)this.game.audio.setVolume(S.master);saveS();});
    const chkRow=this.el('div','setrow chk',rows);
    const cb=this.el('input','',chkRow);
    cb.type='checkbox';cb.checked=S.invertY;
    this.el('span','',chkRow,' Invert Mouse Y');
    cb.onchange=()=>{S.invertY=cb.checked;saveS();};
    function saveS(){try{localStorage.setItem('vx.settings.v1',JSON.stringify(S));}catch(e){}}
    saveS();
    const doneB=this.el('button','mbtn',box,'Done');
    doneB.onclick=()=>{saveS();done?done():this.closeScreen();};
  }

  openHelp(done){
    this.open='help';
    const {box}=this.panel('Controls & Tips');
    box.innerHTML=`
      <div class="helpcols">
        <div>
          <b>Move</b><br>W A S D — walk<br>Space — jump / swim up<br>Shift — sprint<br><br>
          <b>Interact</b><br>Left click — mine / attack<br>Right click — place / use / eat<br>
          E — inventory · Q — drop item<br>1–9 / scroll — hotbar<br>F — fly (creative)<br>Esc — pause
        </div>
        <div>
          <b>Getting started</b><br>
          1. Punch trees for wood → craft planks + sticks.<br>
          2. Crafting table → wooden pickaxe → mine stone.<br>
          3. Furnace (8 cobble) smelts ores & cooks food.<br>
          4. Torches light caves & stop mob spawns.<br>
          5. Bed (3 wool + 3 planks) sets spawn & skips night.<br><br>
          <b>Beware</b> zombies and creepers at night. Creepers boom.
        </div>
      </div>`;
    const b=this.el('button','mbtn',box,'Done');
    b.onclick=()=>done?done():this.closeScreen();
  }

  openDeath(cause){
    this.open='death';
    const {wrap}=this.panel('You Died!','<div class="deathcause">'+(cause||'')+'</div>','death-panel');
    const box=wrap.querySelector('.pbox');
    void box;
    const btns=this.el('div','deathbtns',wrap);
    const r=this.el('button','mbtn',btns,'Respawn');
    r.onclick=()=>{this.closeScreen();this.game.respawnPlayer();};
    const t=this.el('button','mbtn',btns,'Title Screen');
    t.onclick=()=>{this.closeScreen();this.game.saveNow();this.game.showTitle();};
  }

  showSleep(cb){
    this.open='sleep';
    const f=this.el('div','sleepfade',document.body);
    requestAnimationFrame(()=>f.classList.add('on'));
    setTimeout(()=>{
      cb();
      f.classList.remove('on');
      setTimeout(()=>f.remove(),900);
      this.open=null;
    },1600);
  }

  showLoading(txt){
    this.open='loading';
    this.overlay.innerHTML='';
    this.overlay.style.display='flex';
    const wrap=this.el('div','loadwrap',this.overlay);
    this.el('div','loadtitle',wrap,'VOXELFORGE');
    this.loadLbl=this.el('div','loadtext',wrap,txt||'Generating world…');
    const barW=this.el('div','loadbar',wrap);
    this.loadFill=this.el('div','loadfill',barW);
  }
  setLoading(frac,txt){
    if(this.loadFill)this.loadFill.style.width=Math.round(frac*100)+'%';
    if(txt&&this.loadLbl)this.loadLbl.textContent=txt;
  }
  hideLoading(){if(this.open==='loading'){this.open=null;}this.overlay.style.display='none';this.overlay.innerHTML='';}

  title(hasSave,onContinue,onNew){
    this.open='title';
    this.overlay.innerHTML='';
    this.overlay.style.display='flex';
    const wrap=this.el('div','titlewrap',this.overlay);
    const logo=this.el('div','logo',wrap);
    logo.innerHTML='<em>Voxel</em>Forge';
    this.el('div','tagline',wrap,'a procedural voxel sandbox — survival, crafting, mobs & more');
    const menu=this.el('div','menu',wrap);
    const seedRow=this.el('div','seedrow',menu);
    this.el('span','',seedRow,'Seed');
    const seedInput=this.el('input','',seedRow);
    seedInput.type='text';
    seedInput.placeholder='random';
    const newBtn=this.el('button','mbtn big',menu,'▶ New World');
    newBtn.onclick=()=>{this.game.audio&&this.game.audio.resume();this.game.startWorld(seedInput.value.trim(),false);};
    const cBtn=this.el('button','mbtn big alt',menu,'★ New Creative World');
    cBtn.onclick=()=>{this.game.audio&&this.game.audio.resume();this.game.startWorld(seedInput.value.trim(),true);};
    if(hasSave){
      const cont=this.el('button','mbtn big gold',menu,'⏵ Continue Saved World');
      cont.onclick=()=>{this.game.audio&&this.game.audio.resume();this.game.continueWorld();};
    }
    const help=this.el('button','mbtn small',menu,'Controls & Help');
    help.onclick=()=>this.openHelp(()=>{this.open='title';this.title(hasSave,onContinue,onNew);});
    this.el('div','foot',wrap,'WebGL2 voxel engine built from scratch • all textures & sounds generated procedurally • F3 debug overlay');
  }

  updateDebug(info){
    if(!this.debugOn)return;
    this.debugEl.textContent=info;
  }
}
