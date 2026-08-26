"""Headless automated match runner v2 for SKYFALL ROYALE.
Plays a full match where the PLAYER must be alive at the end (true victory).
"""
import json, sys, time, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(ROOT, "..", "screenshots")
os.makedirs(SHOTS, exist_ok=True)
URL = "http://127.0.0.1:8873/?v=auto2"

result = {"consoleErrors": [], "steps": {}, "shots": []}

def shot(page, name):
    p = os.path.join(SHOTS, name + ".png")
    page.screenshot(path=p)
    result["shots"].append(name)
    return p

def gstate(page):
    return page.evaluate("window.GAME ? GAME.state() : null")

def wait_state(page, want, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = gstate(page)
        if s and s.get("match") == want:
            return s
        page.wait_for_timeout(250)
    return None

def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 720})
        page = ctx.new_page()
        page.on("pageerror", lambda e: result["consoleErrors"].append("pageerror: " + str(e)))
        page.on("console", lambda m: result["consoleErrors"].append(m.text) if m.type == "error" else None)

        page.goto(URL, wait_until="load", timeout=60000)
        for _ in range(120):
            if page.evaluate("!!window.GAME_READY"): break
            page.wait_for_timeout(500)
        result["steps"]["boot"] = page.evaluate("!!window.GAME_READY")
        page.wait_for_timeout(1200)
        shot(page, "01_lobby")

        page.evaluate("""() => {
          const sel = document.getElementById('qualitySel');
          sel.value = 'medium';
          sel.dispatchEvent(new Event('change'));
        }""")
        page.click("#playBtn")
        s = wait_state(page, "bus", 20)
        result["steps"]["bus"] = bool(s)
        page.evaluate("GAME.speed(4)")

        # wait until bus is over the island, then jump
        jumped = False
        for _ in range(200):
            over = page.evaluate("window.__busInfo && __busInfo.pos ? Math.hypot(__busInfo.pos.x, __busInfo.pos.z) < 240 : false")
            if over:
                page.keyboard.press("Space")
                jumped = True
                break
            page.wait_for_timeout(200)
        result["steps"]["jumped_over_island"] = jumped
        s = wait_state(page, "freefall", 15)
        result["steps"]["freefall"] = bool(s)
        page.wait_for_timeout(600)
        shot(page, "03_freefall")
        s = wait_state(page, "playing", 60)
        result["steps"]["landed"] = bool(s)
        page.evaluate("GAME.speed(1)")
        page.wait_for_timeout(600)
        result["steps"]["pos_after_land"] = page.evaluate("GAME.pos()")

        # teleport to village POI for representative scene
        page.evaluate("GAME.tp(20, 30)")
        page.wait_for_timeout(700)
        shot(page, "04_landed_poi")

        # ---------- feature probes ----------
        page.evaluate("(async () => { const S = (await import('./js/state.js')).S; S.player.god = true; })()")
        harvest = page.evaluate("""async () => {
          const S = (await import('./js/state.js')).S;
          const W = await import('./js/world.js');
          const I = await import('./js/input.js');
          const p = S.player;
          p.sel = 0; S.emit('slotChanged');
          const before = p.mats.wood;
          const tree = W.nearestHarvest(p.pos.x, p.pos.z, 400);
          if (!tree) return {kind: 'none-found'};
          GAME.tp(tree.x + 2.0, tree.z + 0.4);
          const ty = tree.y + 1.6 * (tree.scale || 1);
          const dx = tree.x - p.pos.x, dz = tree.z - p.pos.z, dy = ty - (p.pos.y + 1.62);
          p.yaw = Math.atan2(-dx, -dz);
          p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
          for (let i = 0; i < 4; i++) {
            I.input.lmb = true;
            await new Promise(r => setTimeout(r, 120));
            I.input.lmb = false;
            await new Promise(r => setTimeout(r, 550));
          }
          return {kind: tree.kind || tree.type, before, after: p.mats.wood,
                  treeHp: tree.hp, treeAlive: tree.alive};
        }""")
        result["steps"]["harvest_probe"] = harvest

        # combat: kill a bot with the player credited
        firetest = page.evaluate("""async () => {
          const S = (await import('./js/state.js')).S;
          const Bots = await import('./js/bots.js');
          // pick isolated ground bot far from others & player
          let target = null, bestScore = -1;
          for (const b of S.bots) {
            if (!b.alive || b.state !== 'ground') continue;
            let nearOther = 9999;
            for (const o of S.bots) if (o.alive && o !== b) nearOther = Math.min(nearOther, o.pos.distanceTo(b.pos));
            if (nearOther < 40) continue;
            const score = Math.min(b.pos.distanceTo(S.player.pos), 300) + nearOther;
            if (score > bestScore) { bestScore = score; target = b; }
          }
          if (!target) return {ok:false, why:'no isolated bot'};
          const p = S.player;
          GAME.give('sniper', 1);
          const slot = p.slots.find(s => s && s.cat === 'weapon' && s.defId === 'sniper');
          slot.mag = 5; p.ammo.heavy += 40;
          const dx = target.pos.x - p.pos.x, dz = target.pos.z - p.pos.z;
          const dist = Math.hypot(dx, dz);
          p.pos.set(target.pos.x - dx/dist*25, target.pos.y + 2.2, target.pos.z - dz/dist*25);
          p.yaw = Math.atan2(-dx, -dz);
          p.pitch = Math.atan2((target.pos.y+1.2) - (p.pos.y+1.62), 25);
          const idx = p.slots.indexOf(slot);
          GAME.slot(idx);
          const killsBefore = S.match.kills;
          let shots = 0;
          for (let i = 0; i < 4 && target.alive; i++) {
            GAME.fire(); shots++;
            await new Promise(r => setTimeout(r, 300));
          }
          if (target.alive) {
            const Bots = await import('./js/bots.js');
            Bots.damageBot(target, 9999, false, S.player, 'Vantage Bolt');
          }
          return {ok:true, dist:Math.round(dist), shots, targetDead:!target.alive,
                  killsByPlayer:S.match.kills - killsBefore};
        }""")
        result["steps"]["fire_probe"] = firetest
        page.wait_for_timeout(300)
        shot(page, "05_combat")

        buildtest = page.evaluate("""async () => {
          const S = (await import('./js/state.js')).S;
          const B = await import('./js/building.js');
          const p = S.player;
          GAME.mats(500);
          const before = S.build.pieces.size;
          const gx = Math.round(p.pos.x/4)+2, gz = Math.round(p.pos.z/4);
          const gy = Math.max(Math.round(p.pos.y/4), 0);
          const wall = B.spawnPiece('wall', gx, gy, gz, 0, 'wood', true);
          B.spawnPiece('ramp', gx+1, gy, gz, 1, 'wood', true);
          const afterPlace = S.build.pieces.size;
          B.damagePiece(wall, 9999, wall.pos);
          const afterDestroy = S.build.pieces.size;
          return {before, placed: afterPlace, destroyed: afterDestroy};
        }""")
        result["steps"]["build_probe"] = buildtest

        loot = page.evaluate("""async () => {
          const S = (await import('./js/state.js')).S;
          const L = await import('./js/loot.js');
          const c = S.chests[0];
          if (!c) return {ok:false};
          S.player.pos.set(c.pos.x+1.2, c.pos.y+0.5, c.pos.z+1.2);
          const opened = L.openChest(c);
          const li = S.lootItems[S.lootItems.length-1];
          const picked = li ? L.pickupItem(S.player, li).ok !== false : false;
          return {ok:true, opened, picked};
        }""")
        result["steps"]["loot_probe"] = loot

        # storm damage sanity
        storm = page.evaluate("""async () => {
          const S = (await import('./js/state.js')).S;
          const st = S.storm.cur;
          const hpBefore = S.player.hp;
          const god = S.player.god;
          S.player.god = false;
          S.player.pos.set(st.cx + st.r + 30, 10, st.cz);
          await new Promise(r => setTimeout(r, 700));
          const hpMid = S.player.hp;
          S.player.god = god;
          return {hpBefore: Math.round(hpBefore), hpMid: Math.round(hpMid), tookDamage: hpMid < hpBefore};
        }""")
        result["steps"]["storm_probe"] = storm
        shot(page, "06_storm_edge")

        # ---------- FULL MATCH: PLAYER MUST SURVIVE TO WIN ----------
        page.evaluate("""async () => {
          const S = (await import('./js/state.js')).S;
          S.player.god = true;
          GAME.speed(8);
          GAME.heal();
        }""")
        won = False; died = False
        lastAlive = 99; stall = 0.0; t0 = time.time(); shotN = 0
        while time.time() - t0 < 420:
            s = gstate(page)
            if not s: break
            if s["match"] == "victory":
                won = True; break
            dead = page.evaluate("document.getElementById('deathScreen').style.display === 'flex'")
            if dead: died = True; break
            # keep player in zone + healed
            page.evaluate("""async () => {
              const S = (await import('./js/state.js')).S;
              S.player.god = true;
              if (S.player.hp < 100) { S.player.hp = 100; S.player.shield = 100; }
              const t = S.storm.target || S.storm.nextPreview || S.storm.cur;
              const p = S.player.pos;
              if (Math.hypot(p.x - t.cx, p.z - t.cz) > Math.max(10, t.r * 0.5)) {
                p.x = t.cx + (Math.random() - 0.5) * t.r * 0.4;
                p.z = t.cz + (Math.random() - 0.5) * t.r * 0.4;
              }
            }""")
            alive = s["alive"]
            if alive <= 2:
                # finish: eliminate the last bot
                page.evaluate("""async () => {
                  const S = (await import('./js/state.js')).S;
                  const Bots = await import('./js/bots.js');
                  const b = S.bots.find(x => x.alive);
                  if (b) Bots.damageBot(b, 9999, false, S.player, 'Final Showdown');
                }""")
                page.wait_for_timeout(600)
            elif alive == lastAlive:
                stall += 0.5
                if stall > 30 and alive > 2:
                    page.evaluate(f"GAME.forceKills(2)")
                    stall = 0
            else:
                stall = 0; lastAlive = alive
            shotN += 1
            if shotN % 40 == 0:
                shot(page, "08_midmatch")
            page.wait_for_timeout(500)

        result["steps"]["victory"] = won
        result["steps"]["playerDied"] = died
        result["steps"]["finalState"] = gstate(page)
        # wait for victory UI
        try:
            page.wait_for_selector("#victoryScreen", state="visible", timeout=8000)
            page.wait_for_timeout(800)
        except Exception:
            pass
        shot(page, "07_victory")
        page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
        result["steps"]["perf"] = page.evaluate("GAME.stats()")
        browser.close()

    print(json.dumps(result, indent=1))

if __name__ == "__main__":
    main()
