// ISLEBREAK UI: HUD (health/shield/mats/ammo/minimap/killfeed/storm info),
// lobby menu, pause, settings (invertX/Y default OFF), victory/defeat screens.
// All DOM-based, no framework.
import { WEAPONS } from './weapons.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.buildDom();
    this.killfeed = [];
  }

  buildDom() {
    const R = this.root;
    R.innerHTML = `
      <div id="crosshair"><div class="ch-dot"></div></div>
      <div id="scopeOverlay"></div>
      <div id="hitmarker"></div>
      <div id="dmgVignette"></div>
      <div id="stormVignette"></div>
      <div id="bottomLeft">
        <div id="matsBox">
          <span class="mat" data-m="wood"><i style="background:#a87848"></i><b>0</b></span>
          <span class="mat" data-m="brick"><i style="background:#b4b0a6"></i><b>0</b></span>
          <span class="mat" data-m="metal"><i style="background:#b8c2cc"></i><b>0</b></span>
        </div>
        <div id="hpRow">
          <div id="hpBar"><div id="hpFill"></div></div>
          <div id="shBar"><div id="shFill"></div></div>
          <div id="hpNum">100</div>
        </div>
      </div>
      <div id="bottomRight">
        <div id="ammoBox">
          <div id="ammoBig">–</div>
          <div id="ammoReserve"></div>
          <div id="weaponName">Pickaxe</div>
        </div>
        <div id="slots"></div>
      </div>
      <div id="topRight">
        <div id="playersAlive">48 ALIVE</div>
        <div id="elims">0 ELIMS</div>
      </div>
      <div id="topCenter">
        <div id="stormInfo"></div>
        <div id="zoneHint"></div>
      </div>
      <div id="killfeed"></div>
      <div id="interactPrompt"></div>
      <div id="buildHint"></div>
      <canvas id="minimap" width="220" height="220"></canvas>
      <div id="compass"><div id="compassStrip"></div></div>
    `;
    this.el = {};
    for (const id of ['crosshair','scopeOverlay','hitmarker','dmgVignette','stormVignette',
      'hpFill','shFill','hpNum','ammoBig','ammoReserve','weaponName','playersAlive','elims',
      'stormInfo','zoneHint','killfeed','interactPrompt','buildHint','minimap','compassStrip','slots']) {
      this.el[id] = document.getElementById(id);
    }
    this.matEls = {};
    for (const b of R.querySelectorAll('.mat')) {
      this.matEls[b.dataset.m] = b.querySelector('b');
    }
    // slot chips
    this.slotEls = [];
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = `<span class="key">${i + 1}</span><span class="label">—</span>`;
      this.el.slots.appendChild(s);
      this.slotEls.push(s);
    }
    this.hitmarkT = 0;
  }

  setHealth(hp, shield) {
    this.el.hpFill.style.width = `${Math.max(0, hp)}%`;
    this.el.shFill.style.width = `${Math.min(100, shield)}%`;
    this.el.hpNum.textContent = `${Math.ceil(hp)}`;
    this.el.hpNum.style.color = hp < 30 ? '#ff6a5e' : '';
  }
  setAmmo(def, magCount, reserve) {
    if (!def) {
      this.el.ammoBig.textContent = '⛏';
      this.el.ammoReserve.textContent = '';
      this.el.weaponName.textContent = 'Pickaxe';
    } else {
      this.el.ammoBig.textContent = magCount;
      this.el.ammoReserve.textContent = `/ ${reserve}`;
      this.el.weaponName.textContent = def.name;
    }
  }
  setSlots(slots, sel, mats) {
    for (let i = 0; i < 5; i++) {
      const s = slots[i];
      const el = this.slotEls[i];
      el.classList.toggle('active', i === sel);
      const label = el.querySelector('.label');
      if (!s) { label.textContent = '—'; label.style.color = ''; }
      else if (s.kind === 'weapon') {
        label.textContent = shortName(s.id);
        label.style.color = rarityCss(s.rarity);
      } else {
        label.textContent = `${shortHeal(s.id)} ×${s.count}`;
        label.style.color = s.id.startsWith('shield') ? '#7fd4ff' : '#8ef29e';
      }
    }
    for (const m of ['wood', 'brick', 'metal']) this.matEls[m].textContent = mats[m];
  }
  setPlayers(n, elims) {
    this.el.playersAlive.textContent = `${n} ALIVE`;
    this.el.elims.textContent = `${elims} ELIMS`;
  }
  setStorm(text, outside) {
    this.el.stormInfo.textContent = text;
    this.el.zoneHint.textContent = outside ? '⚠ OUTSIDE THE ZONE — MOVE!' : '';
    this.el.stormVignette.classList.toggle('on', !!outside);
  }
  kill(msg, isPlayerKill) {
    const div = document.createElement('div');
    div.className = 'kf' + (isPlayerKill ? ' me' : '');
    div.textContent = msg;
    this.el.killfeed.prepend(div);
    setTimeout(() => div.remove(), 6000);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.lastChild.remove();
  }
  hitmarker(headshot) {
    this.el.hitmarker.classList.toggle('head', !!headshot);
    this.el.hitmarker.classList.add('on');
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => this.el.hitmarker.classList.remove('on'), 90);
    this.game.audio.play(headshot ? 'hitHead' : 'hit');
  }
  damageFlash(source) {
    this.el.dmgVignette.classList.add('on');
    clearTimeout(this._dfT);
    this._dfT = setTimeout(() => this.el.dmgVignette.classList.remove('on'), 240);
  }
  showPickup(item) {
    const p = this.el.interactPrompt;
    const names = { weapon: item.id, heal: item.id + ' ×' + (item.count || 1), ammo: item.type + ' ×' + item.n, mat: item.type + ' +' + item.n };
    p.textContent = `+ ${names[item.kind] || item.kind}`;
    p.classList.add('pickup');
    clearTimeout(this._pkT);
    this._pkT = setTimeout(() => { p.textContent = ''; p.classList.remove('pickup'); }, 1200);
  }
  prompt(text) {
    if (this._promptText !== text) {
      this.el.interactPrompt.textContent = text;
      this._promptText = text;
    }
  }
  buildHint(text) { this.el.buildHint.textContent = text || ''; }
  scope(on) { this.el.scopeOverlay.classList.toggle('on', on); }
  crosshair(on) { this.el.crosshair.style.display = on ? '' : 'none'; }

  drawMinimap(game) {
    const cv = this.el.minimap;
    const ctx = cv.getContext('2d');
    const S = cv.width;
    ctx.clearRect(0, 0, S, S);
    // map background
    ctx.fillStyle = 'rgba(14,20,28,0.72)';
    ctx.fillRect(0, 0, S, S);
    const w2s = (x, z) => [(x / 2000 + 0.5) * S, (z / 2000 + 0.5) * S];
    // island silhouette (cheap: sample island heights coarse)
    if (!this._iso) {
      this._iso = [];
      const N = 40;
      for (let iz = 0; iz < N; iz++) {
        for (let ix = 0; ix < N; ix++) {
          const x = -1000 + (ix + 0.5) * (2000 / N), z = -1000 + (iz + 0.5) * (2000 / N);
          if (game.island.height(x, z) > 1) this._iso.push([ix / N, iz / N]);
        }
      }
    }
    ctx.fillStyle = 'rgba(110,150,95,0.55)';
    for (const [u, v] of this._iso) ctx.fillRect(u * S, v * S, S / 40 + 1, S / 40 + 1);
    // POI names
    ctx.font = '9px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const p of game.pois) {
      const [sx, sy] = w2s(p.x, p.z);
      ctx.fillText(p.short || p.name.split(' ')[0], sx - 12, sy + 3);
    }
    // storm circle
    const [cx, cy] = w2s(game.storm.center.x, game.storm.center.y);
    ctx.strokeStyle = 'rgba(190,120,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, game.storm.radius / 2000 * S, 0, 7); ctx.stroke();
    // next zone
    if (game.storm.state === 'waiting') {
      const nr = game.storm.targetRadius;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, nr / 2000 * S), 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }
    void cx; void cy;
    // player arrow
    const [px, py] = w2s(game.player.pos.x, game.player.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-game.camRig ? 0 : -(game.player.camRig.yaw));
    ctx.fillStyle = '#59c8ff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(-4.4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  compassUpdate(yawDeg) {
    // simple strip
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = ((Math.round(yawDeg / 45) % 8) + 8) % 8;
    this.el.compassStrip.textContent = dirs[idx];
  }
}

function shortName(id) {
  const map = {
    'raptor-ar': 'Raptor AR', 'stinger-smg': 'Stinger', 'breaker-pump': 'Breaker',
    'longshot-dmr': 'Longshot', 'skycracker': 'Skycracker', 'boomer-bomb': 'Boomer',
  };
  return map[id] || id;
}
function shortHeal(id) {
  const map = { bandage: 'Bandage', medkit: 'Medkit', shieldcell: 'Cell', shieldpack: 'Big Pot' };
  return map[id] || id;
}
function rarityCss(r) { return ['#bbb', '#b8c4cc', '#59d86a', '#4aa3ff', '#c06bff', '#ffb23a'][r]; }
