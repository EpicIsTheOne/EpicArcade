#!/usr/bin/env python3
"""Headless Chrome test harness for LIMINAL DYNAMICS.
Isolated profile, no visible window, no user input interference."""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8613"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "screenshots")
os.makedirs(SHOTS, exist_ok=True)


def make_browser(pw, headless=True):
    return pw.chromium.launch(
        executable_path=CHROME,
        headless=headless,
        args=[
            "--use-gl=angle",
            "--use-angle=d3d11",
            "--enable-webgl",
            "--ignore-gpu-blocklist",
            "--enable-unsafe-swiftshader",
            "--autoplay-policy=no-user-gesture-required",
            "--mute-audio",
            "--window-size=1600,900",
        ],
    )


class Probe:
    """Console/pageerror collector attached to a page."""

    def __init__(self, page):
        self.errors = []
        self.logs = []
        page.on("console", lambda m: self._console(m))
        page.on("pageerror", lambda e: self.errors.append(str(e)))

    def _console(self, m):
        if m.type in ("error", "warning"):
            self.logs.append(f"[{m.type}] {m.text[:400]}")

    def summary(self):
        return {"pageerrors": self.errors, "console": self.logs}


def new_page(browser, probe_errors=True):
    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    page = ctx.new_page()
    pr = Probe(page)
    return ctx, page, pr


def start_game(page):
    """Click through the main menu into pointer-locked play mode."""
    page.goto(BASE, wait_until="load")
    page.wait_for_function("() => window.game && window.game.state === 'menu'", timeout=20000)
    # headless: requestPointerLock may fail; game tolerates it (state still 'playing')
    page.evaluate("() => { document.getElementById('btn-start').click(); }")
    page.wait_for_timeout(300)
    page.wait_for_function("() => ['playing','paused'].includes(window.game.state)", timeout=5000)
    if page.evaluate("() => window.game.state") == "paused":
        # pointer lock denied -> resume() path re-locks; force playing directly
        page.evaluate("() => { window.game.state = 'playing'; }")


def js(page, expr):
    return page.evaluate(f"() => ({expr})")


def shot(page, name):
    path = os.path.abspath(os.path.join(SHOTS, name))
    page.screenshot(path=path)
    return path


def set_qa(page):
    """Reduced graphics for software-rendered headless runs."""
    page.evaluate("""() => {
      const g = window.game;
      g.settings.quality = 'qa';
      g.applySettings();
    }""")
