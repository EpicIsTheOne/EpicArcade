"""Find exact source of 'dt is not defined' by loading each chamber and printing full stacks."""
import sys
from playwright.sync_api import sync_playwright

sys.path.insert(0, ".")
from tools.harness import make_browser, new_page, start_game, set_qa


def main():
    with sync_playwright() as pw:
        b = make_browser(pw)
        ctx, page, pr = new_page(b)
        page.goto("http://127.0.0.1:8613", wait_until="load")
        page.wait_for_function("() => window.game && window.game.state === 'menu'")
        set_qa(page)
        start_game(page)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e.stack or e)))
        for i in range(5):
            page.evaluate(f"window.game.loadChamber({i}, true)")
            page.wait_for_timeout(1200)
            # poke entities directly: run their update with dt and catch stack traces
            probe = page.evaluate("""
              (() => {
                const g = window.game;
                if (!g?.chamber) return 'no chamber';
                const errs = [];
                for (const e of g.chamber.entities) {
                  try { e.update?.(0.016, g); } catch (err) { errs.push((err.stack || String(err)).split('\\n').slice(0,4).join(' | ')); }
                }
                return errs.length ? errs : 'none';
              })()
            """)
            print(f"--- chamber {i}: direct-poke:", str(probe)[:500])
        print("=== pageerrors during loads:", len(errors))
        for s in errors[:8]:
            print(s[:600])
        b.close()


main()
