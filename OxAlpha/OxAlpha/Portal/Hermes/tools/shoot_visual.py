#!/usr/bin/env python3
"""Visual-QA screenshot pass: staged scenes through the real game.
Headless. Produces screenshots/vq-*.png for pixel inspection."""
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, ".")
from tools.harness import make_browser, new_page, start_game, set_qa


def main():
    with sync_playwright() as pw:
        b = make_browser(pw)
        ctx, page, pr = new_page(b)
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto("http://127.0.0.1:8613", wait_until="load")
        page.wait_for_function("() => window.game && window.game.state === 'menu'")
        set_qa(page)
        start_game(page)
        page.wait_for_timeout(600)

        def run(expr):
            return page.evaluate(f"(() => {{ const g=window.game, t=window.test; return ({expr}); }})()")

        # ---- SCENE 1: CH02 - two portals facing each other (recursion test), view into blue
        print("S1:", json.dumps(run("""
          (() => {
            g.loadChamber(1, true);
            t.teleport([2.0, 1.2, 3.4], [0,0,0]);
            const b = t.placeOn('blue', 'wall-s', 2.0, 1.6, 6.99);
            const a = t.placeOn('amber', 'wall-w', -7.99, 1.8, -2.0);
            t.lookAt(2.0, 1.6, 7.0);
            return {b, a};
          })()
        """)))
        page.wait_for_timeout(2500)
        page.screenshot(path="screenshots/vq-ch02-recursion.png")

        # ---- SCENE 2: same room, cube grabbed and held in front of portal view
        print("S2:", json.dumps(run("""
          (() => {
            g.chamber.cubes[0].body.pos.set(2.6, 1.4, 3.2);
            t.lookAt(2.6, 1.4, 3.2);
            return {grabbed: t.grabNearestCube()};
          })()
        """)))
        page.wait_for_timeout(1200)
        run("t.lookAt(2.0, 1.6, 7.0)")
        page.wait_for_timeout(800)
        page.screenshot(path="screenshots/vq-ch02-heldcube.png")
        run("t.drop(false)")

        # ---- SCENE 3: CH03 overview from spawn (shelf, ceiling pad, terminal)
        print("S3:", json.dumps(run("""
          (() => {
            g.loadChamber(2, true);
            t.teleport([3.5, 1.2, 5.0], [0,0,0]);
            t.lookAt(-4.5, 4.5, -2.5);
            return 'ok';
          })()
        """)))
        page.wait_for_timeout(2000)
        page.screenshot(path="screenshots/vq-ch03-overview.png")

        # ---- SCENE 4: CH05 shelf route, portals active, viewed from ground
        print("S4:", json.dumps(run("""
          (() => {
            g.loadChamber(4, true);
            const bl = t.placeOn('blue', 'shelf', -7.5, 4.55, 4.5);
            const am = t.placeOn('amber', 'wall-e', 9.99, 1.3, 3.0);
            t.teleport([2.0, 1.2, 6.5], [0,0,0]);
            t.lookAt(-7.5, 4.6, 4.5);
            return {bl, am};
          })()
        """)))
        page.wait_for_timeout(2500)
        page.screenshot(path="screenshots/vq-ch05-shelf.png")

        # ---- SCENE 5: CH04 ULTRA quality beauty shot with portals on ledge face + plinth
        print("S5:", json.dumps(run("""
          (() => {
            g.settings.quality = 'ultra';
            g.applySettings();
            g.loadChamber(3, true);
            const am = t.placeOn('amber', 'ledgeface', 0, 4.8, -6.67);
            const bl = t.placeOn('blue', 'cubeplinth', 6.0, 1.25, 8.125);
            t.teleport([-3.0, 1.2, 3.0], [0,0,0]);
            t.lookAt(0, 3.5, -6.5);
            return {am, bl};
          })()
        """)))
        page.wait_for_timeout(4000)
        page.screenshot(path="screenshots/vq-ch04-ultra.png")
        # restore qa for any later runs
        run("g.settings.quality='qa'; g.applySettings(); 'ok'")

        print("pageerrors:", errs[:5])
        s = pr.summary()
        print("console errors:", [c for c in s["console"] if "[error]" in c][:5])
        b.close()


main()
