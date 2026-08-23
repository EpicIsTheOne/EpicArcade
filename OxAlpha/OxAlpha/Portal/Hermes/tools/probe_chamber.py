#!/usr/bin/env python3
"""Quick single-chamber solution probe (ch05 by default)."""
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, ".")
from tools.harness import make_browser, new_page, start_game, js, set_qa

chamber = int(sys.argv[1]) if len(sys.argv) > 1 else 4
fn = sys.argv[2] if len(sys.argv) > 2 else "ch05_solve"

with sync_playwright() as pw:
    b = make_browser(pw)
    ctx, page, pr = new_page(b)
    page.goto("http://127.0.0.1:8613", wait_until="load")
    page.wait_for_function("() => window.game && window.game.state === 'menu'", timeout=25000)
    set_qa(page)
    start_game(page)
    page.wait_for_timeout(400)
    page.evaluate(f"() => game.loadChamber({chamber}, true)")
    page.wait_for_timeout(600)
    r = page.evaluate(
        f"() => window.test.run('{fn}').then(x => JSON.stringify(x)).catch(e => String(e))")
    print("RESULT:", r[:1200])
    errs = pr.summary()["pageerrors"]
    if errs:
        print("PAGEERRORS:", errs[:4])
    b.close()
