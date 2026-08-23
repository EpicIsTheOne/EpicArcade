#!/usr/bin/env python3
"""Boot test: page loads, renderer inits, menu shows, start works, no JS errors."""
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, ".")
from tools.harness import make_browser, new_page, start_game, js, shot, set_qa


def main():
    with sync_playwright() as pw:
        browser = make_browser(pw)
        ctx, page, pr = new_page(browser)
        page.goto("http://127.0.0.1:8613", wait_until="load")
        page.wait_for_function("() => window.game && window.game.state === 'menu'", timeout=25000)
        info = js(page, """({
          state: game.state,
          chambers: game.chamber.def.id,
          portalsLinked: game.portalFX.bothActive(),
          webgl2: !!document.querySelector('canvas'),
          solids: game.world.solids.length,
        })""")
        print("BOOT:", info)
        shot(page, "boot-menu.png")
        start_game(page)
        page.wait_for_timeout(1200)
        info2 = js(page, """({
          state: game.state,
          pos: game.player.pos.toArray(),
          yaw: game.player.yaw, pitch: game.player.pitch,
          onGround: game.player.onGround,
        })""")
        print("PLAY:", info2)
        shot(page, "boot-ch01.png")
        s = pr.summary()
        print("ERRORS:", s["pageerrors"])
        print("CONSOLE:", *s["console"][:12], sep="\n  ")
        browser.close()
        if s["pageerrors"]:
            sys.exit(1)
        print("BOOT TEST PASS")


if __name__ == "__main__":
    main()
