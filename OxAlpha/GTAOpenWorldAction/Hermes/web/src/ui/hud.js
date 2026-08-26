// CHROME HARBOR — HUD: rotating minimap, vitals, wanted stars, banners, prompts, big map.
import { el, clamp } from '../core/util.js';

const DAYPARTS = [[5, 'DAWN'], [11, 'MORNING'], [14, 'AFTERNOON'], [18, 'EVENING'], [22, 'NIGHT'], [24, 'LATE NIGHT']];

export class HUD {
  constructor(ctx) {
    this.ctx = ctx;
    this.hud = el('hud');
    this.mm = el('minimap');
    this.mmc = this.mm.getContext('2d');
    this.bakeMap();
    this.moneyShown = 0;
    this.bannerQueue = [];
    this._bannerT = 0;
    this._promptLast = null;
    this.districtEl = el('district-toast');
    this._lastDistrict = '';
    this._fpsFrames = 0; this._fpsTime = 0;
  }

  show() { this.hud.classList.remove('hidden'); }
  hide() { this.hud.classList.add('hidden'); }

  // ---------- map baking ----------
  bakeMap() {
    const plan = this.ctx.plan;
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x2 = c.getContext('2d');
    const w2s = S / 1800; // world(±900) -> px
    const px = (v) => (v + 900) * w2s;

    x2.fillStyle = '#14171e'; x2.fillRect(0, 0, S, S);
    // water
    x2.fillStyle = '#123a52';
    x2.fillRect(0, px(this.ctx.plan.bounds.z1 - 40), S, S);
    // sand
    x2.fillStyle = '#8c7f56';
    x2.fillRect(0, px(606), S, px(650) - px(606));
    // blocks tinted by zone
    const zoneCol = {
      downtown: '#3d4553', midtown: '#3b3f47', oldtown: '#4a4038', residential: '#33402c',
      industrial: '#383c42', marina: '#37444a', beach: '#6e6547', park: '#2c4a28',
      plaza: '#40444c', stadium: '#3c4046', hospital: '#3e424a', police: '#36405a',
      safehouse: '#4a4038', spray: '#383c42', stores: '#3b3f47',
    };
    for (const b of plan.blocks) {
      x2.fillStyle = zoneCol[b.zone] || '#3b3f47';
      x2.fillRect(px(b.x0), px(b.z0), (b.x1 - b.x0) * w2s, (b.z1 - b.z0) * w2s);
    }
    // roads
    x2.lineCap = 'butt';
    for (const r of [...plan.roadsV, ...plan.roadsH]) {
      x2.strokeStyle = r.ave ? '#9aa1ad' : '#767d89';
      x2.lineWidth = Math.max(1.5, r.w * w2s);
      x2.beginPath();
      if (r.axis === 'v') { x2.moveTo(px(r.c), px(r.a)); x2.lineTo(px(r.c), px(r.b)); }
      else { x2.moveTo(px(r.a), px(r.c)); x2.lineTo(px(r.b), px(r.c)); }
      x2.stroke();
    }
    // landmark icons
    const icon = (x, z, ch, color) => {
      x2.fillStyle = color;
      x2.font = '700 26px Arial';
      x2.textAlign = 'center'; x2.textBaseline = 'middle';
      x2.fillText(ch, px(x), px(z));
    };
    icon(plan.landmarks.spire.x, plan.landmarks.spire.z, '▲', '#ffd24a');
    if (plan.landmarks.stadium) icon(plan.landmarks.stadium.x, plan.landmarks.stadium.z, '◉', '#9aa1ad');
    icon(plan.landmarks.ferrisPier.x, plan.landmarks.ferrisPier.z - 80, '◎', '#ff5f8f');
    icon(plan.landmarks.hospital.spawn.x, plan.landmarks.hospital.spawn.z, '+', '#ff6a6a');
    icon(plan.landmarks.policeHQ.spawn.x, plan.landmarks.policeHQ.spawn.z, '★', '#6ea8ff');
    this.baked = c;
  }

  // ---------- per frame ----------
  update(dt) {
    const p = this.ctx.player;
    const t = performance.now();

    // minimap
    this.drawMinimap(p);

    // money roll-up
    if (this.moneyShown !== p.money) {
      const diff = p.money - this.moneyShown;
      this.moneyShown += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.12));
      if ((diff > 0 && this.moneyShown > p.money) || (diff < 0 && this.moneyShown < p.money)) this.moneyShown = p.money;
      el('money').textContent = '$' + Math.round(this.moneyShown).toLocaleString('en-US');
    }

    // vitals
    el('hp-fill').style.width = p.health + '%';
    el('ar-fill').style.width = p.armor + '%';

    // damage vignette
    const lowHp = p.health < 30 ? (Math.sin(t * 0.008) * 0.5 + 0.5) * 0.35 : 0;
    el('damage-vignette').style.opacity = clamp(p.damageFx * 0.9 + lowHp, 0, 0.95);

    // evade bar
    const pol = this.ctx.police;
    const evading = pol.stars > 0 && pol.evadeT > 0.5;
    el('evade-bar').classList.toggle('hidden', !evading);
    if (evading) el('evade-fill').style.width = clamp(pol.evadeT / (9 + pol.stars * 3.5) * 100, 0, 100) + '%';

    // speedo
    const spd = el('speedo');
    if (p.vehicle) {
      spd.classList.remove('hidden');
      const mph = Math.abs(p.vehicle.forwardSpeed) * 2.237;
      el('speed-val').textContent = Math.round(mph);
      el('veh-name').textContent = p.vehicle.spec.name;
    } else spd.classList.add('hidden');

    // clock
    const h24 = Math.floor(this.ctx.sky.hours);
    const m = Math.floor((this.ctx.sky.hours % 1) * 60);
    el('clock').textContent = String(h24).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    let dp = 'NIGHT';
    for (const [hh, name] of DAYPARTS) if (h24 < hh) { dp = name; break; }
    el('daypart').textContent = dp;

    // district toast
    const dName = this.ctx.plan.districtName(p.pos.x, p.pos.z);
    if (dName !== this._lastDistrict) {
      this._lastDistrict = dName;
      this.districtEl.textContent = dName;
      this.districtEl.classList.add('show');
      clearTimeout(this._distT);
      this._distT = setTimeout(() => this.districtEl.classList.remove('show'), 2600);
    }

    // banners
    this.updateBanner(dt);

    // fps
    this._fpsFrames++; this._fpsTime += dt;
    if (this._fpsTime >= 0.5) {
      if (this.ctx.settings.showFps) el('fps-counter').textContent =
        `${Math.round(this._fpsFrames / this._fpsTime)} FPS · ${this.ctx.renderer.info.render.calls} calls`;
      this._fpsFrames = 0; this._fpsTime = 0;
    }
  }

  updateBanner(dt) {
    const box = el('banner');
    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) box.classList.add('hidden');
    } else if (this.bannerQueue.length) {
      const [title, sub] = this.bannerQueue.shift();
      el('banner-title').textContent = title;
      el('banner-sub').textContent = sub || '';
      box.classList.remove('hidden');
      this._bannerT = 3.4;
      // restart css animation
      box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
    }
  }

  drawMinimap(p) {
    const g = this.mmc;
    const size = 360;

    // rotate so player facing is up
    const rot = -(p.vehicle ? p.vehicle.heading : (p.camYaw + Math.PI));

    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); g.clip();
    g.translate(size / 2, size / 2);
    g.rotate(rot);
    const mpp = (p.vehicle ? 0.72 : 1.05);        // meters per screen px
    const s = 1 / (mpp * (1024 / 1800));          // baked px per screen px
    g.scale(s, s);
    g.drawImage(this.baked,
      -(p.pos.x + 900) * (1024 / 1800),
      -(p.pos.z + 900) * (1024 / 1800));
    g.restore();

    // blips (rotated space)
    g.save();
    g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2); g.clip();
    g.translate(size / 2, size / 2);
    g.rotate(rot);
    const put = (wx, wz, color, ch, edgeClamp = true) => {
      let dx = wx - p.pos.x, dz = wz - p.pos.z;
      let sx = dx / mpp, sz = dz / mpp;
      const rr = size / 2 - 12;
      if (edgeClamp) {
        const dd = Math.hypot(sx, sz);
        if (dd > rr) { sx *= rr / dd; sz *= rr / dd; }
      }
      g.fillStyle = color;
      g.beginPath();
      g.arc(sx, sz, ch ? 9 : 5.5, 0, Math.PI * 2);
      g.fill();
      if (ch) {
        g.fillStyle = '#0b0e16';
        g.font = '800 12px Arial';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(ch, sx, sz + 0.5);
      }
    };
    for (const b of this.ctx.missions.blips) put(b.x, b.z, b.color, b.char);
    if (this.ctx.police.stars > 0) {
      for (const c of this.ctx.police.cars) put(c.pos.x, c.pos.z, '#4f8dff', '');
      for (const c of this.ctx.police.cops) if (!c.dead) put(c.pos.x, c.pos.z, '#4f8dff', '');
    }
    if (p.lastVehicle && !p.lastVehicle.destroyed && !p.vehicle)
      put(p.lastVehicle.pos.x, p.lastVehicle.pos.z, '#aab2bd', '');
    g.restore();

    // player arrow (always up)
    g.save();
    g.translate(size / 2, size / 2);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#0b0e16';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8);
    g.closePath();
    g.stroke(); g.fill();
    g.restore();
  }

  // ---------- imperative UI ----------
  banner(title, sub) { this.bannerQueue.push([title, sub]); }
  toastPrompt(text) {
    const pr = el('prompt');
    pr.innerHTML = text;
    pr.classList.remove('hidden');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { if (this._promptLast === null) pr.classList.add('hidden'); }, 2200);
  }
  showPrompt(html) {
    const pr = el('prompt');
    this._promptLast = html;
    if (html) { pr.innerHTML = html; pr.classList.remove('hidden'); }
    else pr.classList.add('hidden');
  }
  moneyDelta(n) {
    const d = el('money-delta');
    d.textContent = (n > 0 ? '+' : '') + '$' + Math.abs(n).toLocaleString('en-US');
    d.className = n > 0 ? 'plus' : 'minus';
    clearTimeout(this._mdT);
    this._mdT = setTimeout(() => { d.className = ''; }, 1600);
  }
  updateStars(n) {
    const s = el('wanted-stars');
    s.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const star = document.createElement('span');
      star.textContent = '★';
      star.className = i < n ? 'on' : 'off';
      star.style.color = i < n ? '' : 'rgba(255,255,255,.16)';
      s.appendChild(star);
    }
  }
  updateWeapon(p) {
    const def = p.armedDef;
    el('weapon-name').textContent = def ? def.name : 'FISTS';
    if (!def || def.melee) el('weapon-ammo').textContent = '';
    else {
      const inv = p.weapons[p.currentWeapon];
      const reserve = p.ammoPool?.[p.currentWeapon] || 0;
      el('weapon-ammo').textContent = p.reloadT > 0 ? 'RELOADING' : `${inv.ammo} / ${reserve}`;
    }
  }
  setObjective(title, text) {
    el('objective-box').classList.remove('hidden');
    el('objective-title').textContent = title;
    el('objective-text').textContent = text;
  }
  setObjectiveTimer(sec) {
    el('objective-timer').textContent = sec < 1000 ? Math.ceil(sec) + 's' : '';
  }
  clearObjective() {
    el('objective-box').classList.add('hidden');
  }
  setCrosshair(visible) {
    el('crosshair').classList.toggle('hidden', !visible);
  }
  hitmark() {
    const hm = el('hitmark');
    hm.classList.remove('pop');
    void hm.offsetWidth;
    hm.classList.add('pop');
  }
  pulseDamage() {}

  dialog(name, text, dur = 4) {
    let db = document.querySelector('.dialog-box');
    if (!db) {
      db = document.createElement('div');
      db.className = 'dialog-box';
      document.body.appendChild(db);
    }
    db.innerHTML = `<b>${name}:</b> ${text}`;
    db.style.display = 'block';
    clearTimeout(this._dlgT);
    this._dlgT = setTimeout(() => { db.style.display = 'none'; }, dur * 1000);
  }

  toggleHelp(force) {
    const o = el('help-overlay');
    if (force === undefined) force = o.classList.contains('hidden');
    if (force && !o.dataset.built) {
      o.dataset.built = '1';
      o.innerHTML = `<div class="help-card"><h2>CONTROLS</h2><div class="help-cols">
        <div><span>Move</span><b>W A S D</b></div><div><span>Camera</span><b>Mouse</b></div>
        <div><span>Sprint</span><b>Shift</b></div><div><span>Jump</span><b>Space</b></div>
        <div><span>Attack / Fire</span><b>LMB</b></div><div><span>Aim</span><b>RMB</b></div>
        <div><span>Interact / Enter car</span><b>E or F</b></div><div><span>Handbrake (car)</span><b>Space</b></div>
        <div><span>Horn (car)</span><b>Q</b></div><div><span>Reload</span><b>R</b></div>
        <div><span>Weapons</span><b>1–5 / Wheel</b></div><div><span>This panel</span><b>H</b></div>
        <div><span>Big map</span><b>M</b></div><div><span>Pause</span><b>Esc</b></div>
      </div><div class="help-close">H / ESC to close</div></div>`;
    }
    o.classList.toggle('hidden', !force);
  }

  toggleBigMap(force) {
    const o = el('bigmap-overlay');
    if (force === undefined) force = o.classList.contains('hidden');
    if (force) this.renderBigMap();
    o.classList.toggle('hidden', !force);
  }

  renderBigMap() {
    const c = el('bigmap');
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(this.baked, 0, 0, c.width, c.height);
    const p = this.ctx.player;
    const w2s = c.width / 1800;
    const px = (v) => (v + 900) * w2s;
    for (const b of this.ctx.missions.blips) {
      g.fillStyle = b.color;
      g.beginPath(); g.arc(px(b.x), px(b.z), 10, 0, Math.PI * 2); g.fill();
      if (b.char) {
        g.fillStyle = '#0b0e16'; g.font = '800 12px Arial';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(b.char, px(b.x), px(b.z));
      }
    }
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(px(p.pos.x), px(p.pos.z), 8, 0, Math.PI * 2); g.fill();
  }
}
