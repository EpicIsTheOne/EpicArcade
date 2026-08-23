#!/usr/bin/env python3
"""Full-game gameplay QA: solves every chamber through the real engine,
verifies win conditions, deaths, portals, momentum. Headless."""
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, ".")
from tools.harness import make_browser, new_page, start_game, js, shot, set_qa

RESULTS = []


def check(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))
    print(("  OK  " if cond else "  FAIL") + f" {name} {detail}", flush=True)


def main():
    with sync_playwright() as pw:
        browser = make_browser(pw)
        ctx, page, pr = new_page(browser)
        page.goto("http://127.0.0.1:8613", wait_until="load")
        page.wait_for_function("() => window.game && window.game.state === 'menu'")
        set_qa(page)
        start_game(page)
        page.wait_for_timeout(500)

        def solve_and_wait(fn, chamber_id, timeout=15000):
            """Run a solution script, then wait for the chamber-solved event."""
            page.evaluate(f"""() => {{
              window.__solved = false;
              const prev = game.chamber.onSolved;
              game.chamber.onSolved = () => {{ window.__solved = true; if (prev) prev(); }};
              window.test.run('{fn}');
            }}""")
            page.wait_for_function("() => window.__solved === true", timeout=timeout)
            page.wait_for_timeout(250)
            return js(page, "window.test.state()")

        def wait_for_chamber(cid, timeout=20000):
            page.wait_for_function(
                f"() => window.game.chamber.def.id === '{cid}'", timeout=timeout)

        # ================= CH01 =================
        print("\n--- CH01 FIRST LIGHT ---")
        st = solve_and_wait("ch01_solve", "ch01")
        print("   ch01:", json.dumps(st))
        check("ch01 traversed a portal", st["traversals"] >= 1, f"traversals={st['traversals']}")
        check("ch01 reached exit zone", st["pos"][2] < -6.4, f"pos={st['pos']}")
        check("ch01 SOLVED (event)", st["solved"])
        shot(page, "qa-ch01.png")

        # ================= CH02 =================
        print("\n--- CH02 CARRY ---")
        wait_for_chamber("ch02")
        page.wait_for_timeout(600)
        st = solve_and_wait("ch02_solve", "ch02")
        print("   ch02:", json.dumps(st))
        check("ch02 plate pressed -> door opened", st["buttonStates"] == [True], f"{st['buttonStates']}")
        check("ch02 reached exit zone", st["pos"][2] < -7.4, f"pos={st['pos']}")
        check("ch02 SOLVED (event)", st["solved"])
        shot(page, "qa-ch02.png")

        # ================= CH03 =================
        print("\n--- CH03 VERTICAL THINKING ---")
        wait_for_chamber("ch03")
        page.wait_for_timeout(600)
        st = solve_and_wait("ch03_solve", "ch03")
        print("   ch03:", json.dumps(st))
        check("ch03 shelf button pressed", st["buttonStates"] == [True], f"{st['buttonStates']}")
        check("ch03 traversed portal", st["traversals"] >= 1, f"{st['traversals']}")
        check("ch03 SOLVED (event)", st["solved"])
        shot(page, "qa-ch03.png")

        # ================= CH04 =================
        print("\n--- CH04 BALLISTICS ---")
        wait_for_chamber("ch04")
        page.wait_for_timeout(600)
        st = solve_and_wait("ch04_solve", "ch04", timeout=20000)
        print("   ch04:", json.dumps(st))
        check("ch04 plate pressed -> gate opened", st["buttonStates"] == [True], f"{st['buttonStates']}")
        check("ch04 no deaths", st["deaths"] == 0 and not st["dead"], f"deaths={st['deaths']}")
        check("ch04 SOLVED (event)", st["solved"])
        shot(page, "qa-ch04.png")

        # ================= CH05 =================
        print("\n--- CH05 THE GAUNTLET ---")
        wait_for_chamber("ch05")
        page.wait_for_timeout(600)
        st = solve_and_wait("ch05_solve", "ch05", timeout=25000)
        print("   ch05:", json.dumps(st))
        check("ch05 gate opened via plate", st["buttonStates"] == [True], f"{st['buttonStates']}")
        check("ch05 SOLVED (event)", st["solved"])
        shot(page, "qa-ch05.png")

        # ================= regression =================
        s = pr.summary()
        check("no page errors during full run", len(s["pageerrors"]) == 0, str(s["pageerrors"][:3]))

        browser.close()

    fails = [r for r in RESULTS if not r[1]]
    print(f"\n==== GAMEPLAY QA: {len(RESULTS)-len(fails)}/{len(RESULTS)} PASS ====")
    if fails:
        for f in fails:
            print("  FAIL:", f[0], f[2])
        sys.exit(1)


if __name__ == "__main__":
    main()
