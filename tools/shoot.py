#!/usr/bin/env python3
"""Take NEON HARBOR's four screenshots and verify the game runs clean.

Serves game/ on localhost:8080, opens each ?shot= mode in headless
Chromium at 1280x480, and records console errors, page errors and any
request that leaves localhost. Also plays the game once from the title
screen (click Start, walk forward) to prove start -> main works.

Writes screenshots/<n>-<name>.jpg (JPEG quality ~85, each <= 256 KiB)
and prints a JSON summary on stdout. Exit code 1 on any failure.
"""

import glob
import json
import os
import subprocess
import sys
import time

PLAYWRIGHT_PATH = os.path.expanduser(
    "~/workspace/tools/local/lib/python3.12/dist-packages"
)
sys.path.insert(0, PLAYWRIGHT_PATH)

REPO = os.path.expanduser("~/workspace/makefun/gta6-01")
SHOTS = [
    ("1-title", "title", 2500),
    ("2-drive", "drive", 2600),
    ("3-wanted", "wanted", 2600),
    ("4-done", "done", 1800),
]
MAX_BYTES = 262144
WIDTH, HEIGHT = 1280, 480


def find_chrome():
    hits = glob.glob(
        os.path.expanduser(
            "~/workspace/tools/ms-playwright/chromium-*/chrome-linux64/chrome"
        )
    )
    if not hits:
        raise SystemExit("no chromium found under ~/workspace/tools/ms-playwright")
    return sorted(hits)[-1]


def main():
    from playwright.sync_api import sync_playwright

    chrome = find_chrome()
    server = subprocess.Popen(
        ["node", "serve.ts", "8080"],
        cwd=REPO,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)
    summary = {"shots": {}, "playtest": {}, "errors": []}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path=chrome,
                args=["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
            )
            for name, kind, settle_ms in SHOTS:
                page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT})
                problems = {"console": [], "pageerror": [], "external": []}
                page.on(
                    "console",
                    lambda m: problems["console"].append(m.text)
                    if m.type == "error"
                    else None,
                )
                page.on("pageerror", lambda e: problems["pageerror"].append(str(e)))
                page.on(
                    "request",
                    lambda r: problems["external"].append(r.url)
                    if not r.url.startswith("http://localhost:8080")
                    else None,
                )
                page.goto(f"http://localhost:8080/?shot={kind}", wait_until="load")
                page.wait_for_function("window.__ready === true", timeout=20000)
                page.wait_for_timeout(settle_ms)
                out = os.path.join(REPO, "screenshots", f"{name}.jpg")
                for quality in (85, 75, 65):
                    page.screenshot(path=out, type="jpeg", quality=quality)
                    size = os.path.getsize(out)
                    if size <= MAX_BYTES:
                        break
                summary["shots"][name] = {
                    "file": out,
                    "bytes": size,
                    "quality": quality,
                    "console_errors": problems["console"],
                    "page_errors": problems["pageerror"],
                    "external_requests": problems["external"],
                    "ok": not problems["console"]
                    and not problems["pageerror"]
                    and not problems["external"]
                    and size <= MAX_BYTES,
                }
                page.close()

            # Playtest: title -> Start -> walk forward -> check state.
            page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT})
            problems = {"console": [], "pageerror": [], "external": []}
            page.on(
                "console",
                lambda m: problems["console"].append(m.text)
                if m.type == "error"
                else None,
            )
            page.on("pageerror", lambda e: problems["pageerror"].append(str(e)))
            page.on(
                "request",
                lambda r: problems["external"].append(r.url)
                if not r.url.startswith("http://localhost:8080")
                else None,
            )
            page.goto("http://localhost:8080/", wait_until="load")
            page.wait_for_function("window.__ready === true", timeout=20000)
            page.wait_for_timeout(800)
            page.click("#btn-start")
            page.wait_for_timeout(500)
            mode = page.evaluate("window.__nh.mode")
            page.keyboard.down("w")
            page.wait_for_timeout(2000)
            page.keyboard.up("w")
            moved = page.evaluate(
                "Math.hypot(window.__nh.player.x - 138, window.__nh.player.z + 150)"
            )
            page.mouse.move(640, 240)
            page.mouse.down()
            page.mouse.move(760, 220, steps=10)
            page.mouse.up()
            shot_ok = page.evaluate(
                "window.__nh.combat.ammo === 12 && window.__nh.mode === 'playing'"
            )
            page.keyboard.press("f")
            page.wait_for_timeout(300)
            ammo = page.evaluate("window.__nh.combat.ammo")
            errors = page.evaluate("window.__errors")
            summary["playtest"] = {
                "mode_after_start": mode,
                "walked_meters": round(moved, 2),
                "ammo_after_shot": ammo,
                "shot_fired": ammo == 11,
                "window_errors": errors,
                "console_errors": problems["console"],
                "page_errors": problems["pageerror"],
                "external_requests": problems["external"],
                "ok": mode == "playing"
                and moved > 0.5  # headless swiftshader runs ~6 fps, dt clamped
                and ammo == 11
                and not errors
                and not problems["console"]
                and not problems["pageerror"]
                and not problems["external"],
            }
            browser.close()
    finally:
        server.terminate()

    print(json.dumps(summary, indent=2))
    all_ok = all(s["ok"] for s in summary["shots"].values()) and summary["playtest"]["ok"]
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
