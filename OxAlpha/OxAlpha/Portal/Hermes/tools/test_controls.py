#!/usr/bin/env python3
"""Controls verification: mouse directions, WASD mapping, camera-relative movement,
portal velocity transforms. THE test that guarantees 'A means LEFT'."""
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, ".")
from tools.harness import make_browser, new_page, start_game, js, shot, set_qa

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(f"{name} {detail}")
    print(("  OK  " if cond else "  FAIL") + f" {name} {detail}")


def main():
    with sync_playwright() as pw:
        browser = make_browser(pw)
        ctx, page, pr = new_page(browser)
        page.goto("http://127.0.0.1:8613", wait_until="load")
        page.wait_for_function("() => window.game && window.game.state === 'menu'")
        set_qa(page)
        start_game(page)
        page.wait_for_timeout(400)

        # ---------------- mouse look ----------------
        page.evaluate("() => { game.player.yaw = 0; game.player.pitch = 0; }")
        page.mouse.move(640, 360)
        page.mouse.move(740, 360)  # +100 px right
        page.wait_for_timeout(80)
        yaw_after_right = js(page, "game.player.yaw")
        check("mouse RIGHT turns right (yaw<0)", yaw_after_right < -0.1, f"yaw={yaw_after_right:.3f}")

        page.mouse.move(640, 360)
        page.mouse.move(540, 360)  # -100 px left
        page.wait_for_timeout(80)
        yaw_after_left = js(page, "game.player.yaw")
        check("mouse LEFT turns left (back toward 0/+)", yaw_after_left > yaw_after_right + 0.1,
              f"yaw={yaw_after_left:.3f}")

        page.evaluate("() => { game.player.yaw = 0; game.player.pitch = 0; }")
        page.mouse.move(640, 360)
        page.mouse.move(640, 460)  # +100 px down
        page.wait_for_timeout(80)
        pitch_after_down = js(page, "game.player.pitch")
        check("mouse DOWN looks down (pitch<0)", pitch_after_down < -0.1, f"pitch={pitch_after_down:.3f}")

        page.mouse.move(640, 360)
        page.mouse.move(640, 260)  # -100 px up
        page.wait_for_timeout(80)
        pitch_after_up = js(page, "game.player.pitch")
        check("mouse UP looks up (pitch>0)", pitch_after_up > pitch_after_down + 0.1,
              f"pitch={pitch_after_up:.3f}")

        # ---------------- movement ----------------
        def hold_key(key, ms):
            page.keyboard.down(key)
            page.wait_for_timeout(ms)
            page.keyboard.up(key)

        page.evaluate("() => { game.player.yaw = 0; game.player.pitch = 0; game.player.pos.set(0, 0.9, 3.8); game.player.vel.set(0,0,0); }")
        z0 = js(page, "game.player.pos.z")
        hold_key("w", 500)
        z1 = js(page, "game.player.pos.z")
        check("W moves forward (-Z at yaw 0)", z1 < z0 - 0.5, f"dz={z1-z0:.2f}")

        page.evaluate("() => { game.player.pos.set(0, 0.9, 3.8); game.player.vel.set(0,0,0); }")
        x0 = js(page, "game.player.pos.x")
        hold_key("a", 500)
        x1 = js(page, "game.player.pos.x")
        check("A strafes LEFT (-X at yaw 0)", x1 < x0 - 0.3, f"dx={x1-x0:.2f}")

        page.evaluate("() => { game.player.pos.set(0, 0.9, 3.8); game.player.vel.set(0,0,0); }")
        x0 = js(page, "game.player.pos.x")
        hold_key("d", 500)
        x1 = js(page, "game.player.pos.x")
        check("D strafes RIGHT (+X at yaw 0)", x1 > x0 + 0.3, f"dx={x1-x0:.2f}")

        page.evaluate("() => { game.player.pos.set(0, 0.9, 3.8); game.player.vel.set(0,0,0); }")
        z0 = js(page, "game.player.pos.z")
        hold_key("s", 500)
        z1 = js(page, "game.player.pos.z")
        check("S moves backward (+Z at yaw 0)", z1 > z0 + 0.5, f"dz={z1-z0:.2f}")

        # camera-relative: face +X (yaw = -90deg), W should move +X
        page.evaluate("() => { game.player.yaw = -Math.PI/2; game.player.pos.set(0, 0.9, 3.8); game.player.vel.set(0,0,0); }")
        x0 = js(page, "game.player.pos.x")
        hold_key("w", 500)
        x1 = js(page, "game.player.pos.x")
        check("W follows camera after 90° turn", x1 > x0 + 0.5, f"dx={x1-x0:.2f}")

        # A while facing +X should strafe toward -Z (left of facing)
        page.evaluate("() => { game.player.yaw = -Math.PI/2; game.player.pos.set(0, 0.9, 3.8); game.player.vel.set(0,0,0); }")
        z0 = js(page, "game.player.pos.z")
        hold_key("a", 500)
        z1 = js(page, "game.player.pos.z")
        check("A remains LEFT after rotation", z1 < z0 - 0.3, f"dz={z1-z0:.2f}")

        # jump
        page.evaluate("() => { game.player.yaw = 0; game.player.pos.set(0, 0.9, 3.8); game.player.vel.set(0,0,0); }")
        page.keyboard.press("Space")
        page.wait_for_timeout(120)
        rising = js(page, "game.player.vel.y")
        check("SPACE jumps", rising > 2.0, f"vy={rising:.1f}")
        page.wait_for_timeout(900)

        # ---------------- portal velocity transform ----------------
        # blue on floor (normal +Y), amber on west wall (normal +X)
        ok = page.evaluate("""() => {
          const w = game.world;
          const floorSolid = w.solids.find(s => s.tag === 'floor');
          const wallSolid = w.solids.find(s => s.tag === 'wall-w');
          if (!floorSolid || !wallSolid) return {err: 'solids missing'};
          const blue = w.portals.blue, amber = w.portals.amber;
          blue.place(new THREE.Vector3(0, 0.045, 0), new THREE.Vector3(0,1,0), floorSolid, new THREE.Vector3(0,0,-1));
          amber.place(new THREE.Vector3(-8.0, 1.2, 0), new THREE.Vector3(1,0,0), wallSolid, new THREE.Vector3(0,1,0));
          game.syncPortalSolids();
          // fake entity falling into blue
          const ent = { pos: new THREE.Vector3(0, -0.5, 0), vel: new THREE.Vector3(0,-12,0), half: new THREE.Vector3(.3,.3,.3), lastSide: {blue: 0.6, amber: 99} };
          const linked = w.linked();
          w.checkTraversal(ent, null);
          return {
            linked,
            exit: ent.pos.toArray().map(v=>+v.toFixed(2)),
            vel: ent.vel.toArray().map(v=>+v.toFixed(2)),
            speedIn: 12, speedOut: ent.vel.length(),
          };
        }""")
        if "err" in ok:
            check("portal setup", False, ok["err"])
        else:
            check("portals linked", ok["linked"] is True)
            check("exit position in front of amber wall", ok["exit"][0] > -7.9 and ok["exit"][0] < -6.5, f"pos={ok['exit']}")
            check("fall speed preserved (12 m/s)", abs(ok["speedOut"] - 12) < 0.5, f"out={ok['speedOut']:.2f}")
            check("fall converted to horizontal launch (+X)", ok["vel"][0] > 11.0 and abs(ok["vel"][1]) < 0.6,
                  f"vel={ok['vel']}")

        # controls unchanged after traversal (yaw/pitch untouched by teleport)
        y0 = js(page, "game.player.yaw")
        page.evaluate("""() => {
          const p = game.player;
          p.pos.set(0, -0.5, 0); p.vel.set(0,-10,0); p.lastSide = {blue: 0.6, amber: 99};
          game.world.checkTraversal(p, null);
        }""")
        y1 = js(page, "game.player.yaw")
        inv_x = js(page, "game.player.invertX")
        inv_y = js(page, "game.player.invertY")
        check("traversal does not touch yaw", abs(y1 - y0) < 1e-9)
        check("invertX default OFF", inv_x is False)
        check("invertY default OFF", inv_y is False)

        shot(page, "controls-final.png")
        browser.close()

    print(f"\nPASS={len(PASS)} FAIL={len(FAIL)}")
    if FAIL:
        print("FAILURES:")
        for f in FAIL:
            print("  -", f)
        sys.exit(1)


if __name__ == "__main__":
    main()
