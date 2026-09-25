import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS = ROOT / "screenshots"
SCREENSHOTS.mkdir(exist_ok=True)
URL = "http://127.0.0.1:4191/index.html"


def main():
    report = {"url": URL, "consoleErrors": [], "pageErrors": [], "checks": {}, "frames": []}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--autoplay-policy=no-user-gesture-required"])
        page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page.on("console", lambda message: report["consoleErrors"].append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: report["pageErrors"].append(str(error)))
        page.goto(URL, wait_until="networkidle")
        page.screenshot(path=str(SCREENSHOTS / "01-intro.png"), full_page=True)
        report["checks"]["introTitle"] = page.locator("h1").inner_text()
        report["checks"]["audioSource"] = page.locator("audio").get_attribute("src")
        page.locator("#begin").click()
        page.wait_for_function("window.__glasslight.sourceLoaded === true", timeout=15000)
        page.wait_for_timeout(1200)
        report["checks"]["started"] = page.evaluate("window.__glasslight.started")
        report["checks"]["timeAfterStart"] = page.evaluate("window.__glasslight.time")
        report["checks"]["sectionAfterStart"] = page.evaluate("window.__glasslight.section")
        report["checks"]["hudVisible"] = page.locator("#hud").is_visible()
        report["checks"]["canvasSize"] = page.locator("#stage").evaluate("node => [node.width, node.height]")
        for label, target in [("02-ember", 20.0), ("03-choir", 36.0), ("04-fracture", 55.0), ("05-afterglow", 66.0), ("06-ember-return", 80.0)]:
            page.evaluate("time => window.__glasslight.seek(time)", target)
            page.wait_for_timeout(900)
            report["frames"].append({"label": label, "time": page.evaluate("window.__glasslight.time"), "section": page.evaluate("window.__glasslight.section"), "fps": page.evaluate("window.__glasslight.fps")})
            page.screenshot(path=str(SCREENSHOTS / f"{label}.png"), full_page=True)
        page.evaluate("window.__glasslight.seek(96.75)")
        page.wait_for_function("window.__glasslight.ended === true", timeout=5000)
        page.wait_for_timeout(250)
        report["checks"]["ended"] = page.evaluate("window.__glasslight.ended")
        report["checks"]["endCardVisible"] = page.locator("#endCard").is_visible()
        page.screenshot(path=str(SCREENSHOTS / "07-ending.png"), full_page=True)
        page.locator("#replay").click()
        page.wait_for_timeout(700)
        report["checks"]["replayTime"] = page.evaluate("window.__glasslight.time")
        report["checks"]["replayHudVisible"] = page.locator("#hud").is_visible()
        page.locator("#pause").click()
        page.wait_for_timeout(250)
        report["checks"]["pauseLabel"] = page.locator("#pause").inner_text()
        mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        mobile.goto(URL, wait_until="networkidle")
        mobile.wait_for_function("window.__glasslight !== undefined")
        report["checks"]["mobileCanvas"] = mobile.locator("#stage").evaluate("node => [node.width, node.height]")
        report["checks"]["mobileIntroVisible"] = mobile.locator("#intro").is_visible()
        mobile.screenshot(path=str(SCREENSHOTS / "08-mobile-intro.png"), full_page=True)
        mobile.close()
        browser.close()
    (ROOT / "qa" / "browser_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
