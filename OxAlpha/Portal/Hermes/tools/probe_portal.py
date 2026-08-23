#!/usr/bin/env python3
"""Bisect the portal black-blob artifact: probe uniforms, RT pixels, toggle sub-elements."""
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
            return page.evaluate(f"(() => {{ const g=window.game, t=window.test; {expr} }})()")

        # stage the same S1 scene
        run("""
          g.loadChamber(1, true);
          t.teleport([2.0, 1.2, 3.4], [0,0,0]);
          t.placeOn('blue', 'wall-s', 2.0, 1.6, 6.99);
          t.placeOn('amber', 'wall-w', -7.99, 1.8, -2.0);
          t.lookAt(2.0, 1.6, 7.0); return 'ok';
        """)
        page.wait_for_timeout(2000)

        # step 1: plain uniform state
        u1 = run("const P=g.portalFX.portals.blue; return {hasView: P.innerMat.uniforms.uHasView.value, screen: P.innerMat.uniforms.uScreen.value.toArray(), open: P.innerMat.uniforms.uOpen.value, rtW: P.rt.width, rtH: P.rt.height, meshVisible: P.mesh.visible};")
        print("U1:", json.dumps(u1))

        # step 2: drawing buffer size
        u2 = run("return [g.renderer.domElement.width, g.renderer.domElement.height];")
        print("U2 canvas:", u2)

        # step 3: read mid-row of the blue RT
        u3 = run("""
          const P=g.portalFX.portals.blue;
          const w=P.rt.width, h=P.rt.height;
          const buf=new Uint8Array(w*4);
          let msg='ok';
          try { g.renderer.readRenderTargetPixels(P.rt, 0, Math.floor(h/2), w, 1, buf); }
          catch(e){ msg=e.message; }
          let nb=0; for(let i=0;i<w;i++){ if(buf[i*4]+buf[i*4+1]+buf[i*4+2]>24) nb++; }
          return {msg, nonBlack:nb, of:w, head:Array.from(buf.slice(0,24))};
        """)
        print("U3 rt-read:", json.dumps(u3))

        # Variation A: hide glow
        run("g.portalFX.portals.blue.glow.visible=false; return 'A'")
        page.wait_for_timeout(700)
        page.screenshot(path="screenshots/bisect-A-noglow.png")

        # Variation B: force uHasView=0
        run("g.portalFX.portals.blue.innerMat.uniforms.uHasView.value=0; return 'B'")
        page.wait_for_timeout(500)
        page.screenshot(path="screenshots/bisect-B-noRT.png")

        # Variation C: restore RT view, hide inner mesh
        run("""
          g.portalFX.portals.blue.innerMat.uniforms.uHasView.value=1;
          g.portalFX.portals.blue.inner.visible=false; return 'C'
        """)
        page.wait_for_timeout(500)
        page.screenshot(path="screenshots/bisect-C-noinner.png")

        print("pageerrors:", errs[:4])
        b.close()


main()
