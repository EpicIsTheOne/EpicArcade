// ============================================================
// NEON MERIDIAN — ui/hud.js
// DOM HUD: money/wanted/clock, minimap with prerendered city,
// health/armor, weapon+ammo, prompts/toasts/banners, vignette.
// ============================================================
'use strict';

const HUD = (() => {

  class Hud {
    constructor() {
      this.el = {};
      for (const id of ['money', 'stars', 'clock', 'healthBar', 'armorBar', 'weapon',
        'prompt', 'objective', 'toast', 'banner', 'bannerSub', 'speedo', 'fps',
        'vignette', 'minimap', 'crosshair', 'interactKey']) {
        this.el[id] = document.getElementById('hud-' + id);
      }
      this.mm = this.el.minimap;
      this.mmCtx = this.mm.getContext('2d');
      this.cityCanvas = null;    // prerendered
      this.toastT = 0;
      this.hintT = 0;
      this.dmgT = 0;
      this.lastStars = -1;
    }

    prerenderCity(layout) {
      // 1 px = 4 m => city ~896m -> 224 px
      const scale = 1 / 4;
      const c = document.createElement('canvas');
      const size = Math.ceil((layout.size + CONFIG.BLOCK * 2) * scale);
      c.width = c.height = size;
      const x = c.getContext('2d');
      const off = CONFIG.BLOCK * scale;
      x.fillStyle = '#10141a'; x.fillRect(0, 0, size, size);
      // water south
      x.fillStyle = '#123a52';
      x.fillRect(0, (layout.shorelineZ + 30) * scale + off, size, size);
      x.fillStyle = '#3d3a30';
      x.fillRect(0, layout.shorelineZ * scale + off, size, ((layout.size - layout.shorelineZ) + 40) * scale);
      // districts tint blocks
      for (const blk of layout.blocks.flat()) {
        const d = blk.district;
        x.fillStyle =
          d === 'park' ? '#1e3a22' :
          d === 'beach' ? '#3d3a30' :
          d === 'industrial' ? '#262a30' :
          d === 'downtown' ? '#252c38' :
          d === 'oldtown' ? '#2e2a26' : '#232b24';
        x.fillRect(blk.x0 * scale + off, blk.z0 * scale + off, CONFIG.BLOCK * scale, CONFIG.BLOCK * scale);
        if (d !== 'park') {
          x.fillStyle = 'rgba(255,255,255,0.05)';
          for (const b of layout.buildings) {
            if (b.x0 >= blk.x0 && b.x1 <= blk.x1 && b.z0 >= blk.z0 && b.z1 <= blk.z1) {
              x.fillRect(b.x0 * scale + off, b.z0 * scale + off, Math.max(1, (b.x1 - b.x0) * scale), Math.max(1, (b.z1 - b.z0) * scale));
            }
          }
        }
      }
      // roads
      x.strokeStyle = '#5a616e'; x.lineWidth = Math.max(1.4, CONFIG.ROAD_W * scale);
      for (let j = 0; j <= CONFIG.GRID; j++) {
        x.beginPath(); x.moveTo(-off, j * CONFIG.BLOCK * scale + off); x.lineTo(size, j * CONFIG.BLOCK * scale + off); x.stroke();
      }
      for (let i = 0; i <= CONFIG.GRID; i++) {
        x.beginPath(); x.moveTo(i * CONFIG.BLOCK * scale + off, -off); x.lineTo(i * CONFIG.BLOCK * scale + off, size); x.stroke();
      }
      this.cityCanvas = c;
      this.cityScale = scale;
      this.cityOff = off;
    }

    worldToMap(px, pz) {
      return [px * this.cityScale + this.cityOff, pz * this.cityScale + this.cityOff];
    }

    drawMinimap(game) {
      if (!this.cityCanvas) return;
      const ctx = this.mmCtx;
      const S = this.mm.width;                 // css px == canvas px (retina ok)
      const viewM = 190 / GameState.settings.minimapZoom;   // meters across
      const pp = game.player.pos;
      const mPerPx = viewM / S;
      ctx.clearRect(0, 0, S, S);

      // draw city canvas scaled & centered on player
      const cw = viewM * this.cityScale;       // source px window
      const sx = pp.x * this.cityScale + this.cityOff - cw / 2;
      const sy = pp.z * this.cityScale + this.cityOff - cw / 2;
      ctx.save();
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, 7); ctx.clip();
      ctx.fillStyle = '#0b0e13'; ctx.fillRect(0, 0, S, S);
      ctx.drawImage(this.cityCanvas, sx, sy, cw, cw, 0, 0, S, S);

      const toScreen = (wx, wz) => [
        (wx - pp.x) / mPerPx + S / 2,
        (wz - pp.z) / mPerPx + S / 2];

      // blips
      const drawBlip = (wx, wz, color, r) => {
        const [bx, by] = toScreen(wx, wz);
        if (Math.hypot(bx - S / 2, by - S / 2) > S / 2 - 6) return false;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(bx, by, r || 3.4, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
        ctx.stroke();
        return true;
      };

      for (const mk of game.missions.markers) {
        const col = mk.kind === 'race' ? '#ffd24a'
          : mk.kind === 'giver' ? '#35d5ff'
          : mk.kind === 'paynpray' ? '#7dff9e'
          : mk.kind === 'gunshop' ? '#ff9d5c' : '#7dff9e';
        drawBlip(mk.marker.pos.x, mk.marker.pos.z, col, 3);
      }
      // police blips while wanted
      if (game.wanted.stars > 0) {
        for (const u of game.npc.police) drawBlip(u.v.pos.x, u.v.pos.z, '#ff4055', 3);
        for (const f of game.npc.footCops) { if (!f.dead) drawBlip(f.pos.x, f.pos.z, '#ff4055', 2.4); }
      }
      // traffic light dots skipped (noise)

      // objective target: clamp to rim
      let obj = null;
      if (game.missions.active && game.missions.active.stageMarker) obj = game.missions.active.stageMarker.pos;
      else if (game.missions.race && game.missions.race.running) {
        const cp = game.missions.race.cps[game.missions.race.idx];
        obj = cp;
      }
      if (obj) {
        let [ox, oy] = toScreen(obj.x, obj.z);
        const dx = ox - S / 2, dy = oy - S / 2;
        const d = Math.hypot(dx, dy);
        const rim = S / 2 - 9;
        if (d > rim) { ox = S / 2 + dx / d * rim; oy = S / 2 + dy / d * rim; }
        ctx.fillStyle = '#ffe27a';
        ctx.beginPath();
        ctx.moveTo(ox, oy - 5); ctx.lineTo(ox + 4.4, oy + 3.6); ctx.lineTo(ox - 4.4, oy + 3.6);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.stroke();
      }

      // player arrow
      const ang = -game.player.heading;         // map is north-up (-z up): heading+ = cw on screen
      ctx.save();
      ctx.translate(S / 2, S / 2);
      ctx.rotate(Math.PI + ang);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.restore();

      // ring border
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1.5, 0, 7); ctx.stroke();
    }

    update(game, dt) {
      const st = GameState.state;
      this.el.money.textContent = '$' + st.money.toLocaleString('en-US');

      // stars
      const stars = game.wanted.stars;
      if (stars !== this.lastStars) {
        this.lastStars = stars;
        let s = '';
        for (let i = 0; i < 5; i++) s += i < stars ? '★' : '☆';
        this.el.stars.textContent = s;
        this.el.stars.classList.toggle('hot', stars > 0);
        this.el.stars.classList.toggle('blink', stars >= 3);
      }

      const h = Math.floor(game.sky.timeHours), m = Math.floor((game.sky.timeHours % 1) * 60);
      this.el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · Day ${st.day}`;

      this.el.healthBar.style.width = clamp(st.hp, 0, 100) + '%';
      this.el.armorBar.style.width = clamp(st.armor, 0, 100) + '%';

      const w = CONFIG.WEAPONS.find(x => x.id === st.curWeapon);
      const ammo = w.ammoUse ? ` · ${st.ammo[w.id] || 0}` : '';
      this.el.weapon.textContent = w.name + ammo;

      // speedo
      if (game.player.inVehicle) {
        const v = game.player.inVehicle;
        this.el.speedo.style.display = 'block';
        this.el.speedo.textContent = `${Math.abs(Math.round(v.speed * 3.6))} km/h`;
      } else this.el.speedo.style.display = 'none';

      // timers
      if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.style.opacity = 0; }
      if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.el.prompt.style.opacity = 0; }
      if (this.dmgT > 0) {
        this.dmgT -= dt;
        this.el.vignette.style.opacity = Math.max(0, this.dmgT / 0.6) * 0.75;
      }

      if (GameState.settings.showFps) {
        this.el.fps.style.display = 'block';
        this.el.fps.textContent = `${game.fps | 0} fps · ${game.renderer.info.render.calls} draws`;
      } else this.el.fps.style.display = 'none';

      this.drawMinimap(game);
    }

    toast(text, t) {
      this.el.toast.textContent = text;
      this.el.toast.style.opacity = 1;
      this.toastT = t || 3.2;
    }
    hint(text) {
      this.el.prompt.innerHTML = `<span class="key">E</span> ${text}`;
      this.el.prompt.style.opacity = 1;
      this.hintT = 0.4;   // refreshed every frame while near
    }
    objective(text) {
      this.el.objective.textContent = text;
      this.el.objective.style.opacity = text ? 1 : 0;
    }
    missionBanner(title, sub) {
      this.el.banner.firstElementChild.textContent = title;
      this.el.bannerSub.textContent = sub || '';
      this.el.banner.classList.add('show');
      clearTimeout(this._bt);
      this._bt = setTimeout(() => this.el.banner.classList.remove('show'), 4200);
    }
    flashDamage() { this.dmgT = 0.6; }
    setCrosshair(on) { this.el.crosshair.style.display = on ? 'block' : 'none'; }
  }

  return { Hud };
})();

if (typeof module !== 'undefined') module.exports = { HUD: null };
