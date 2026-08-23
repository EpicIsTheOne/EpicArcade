"""Diagnose what the DOM/canvas state actually is during QA-mode play."""
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
        page.wait_for_timeout(1500)
        state = page.evaluate("""
          (() => {
            const ids = ['loading','loading-bar','menu-screen','hud','crosshair'];
            const out = {};
            for (const id of ids) {
              const el = document.getElementById(id);
              if (!el) { out[id] = 'MISSING'; continue; }
              const cs = getComputedStyle(el);
              out[id] = { cls: el.className, display: cs.display, opacity: cs.opacity, z: cs.zIndex, vis: cs.visibility };
            }
            const c = document.querySelector('canvas');
            out.canvas = c ? { w: c.width, h: c.height, display: getComputedStyle(c).display } : 'NO CANVAS';
            out.gameState = window.game.state;
            return out;
          })()
        """)
        import json
        print(json.dumps(state, indent=1))
        page.screenshot(path="screenshots/diag-play.png")
        print("errors:", errs[:5])
        b.close()


main()
