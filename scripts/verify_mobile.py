"""Mobile Verification Script for WatchItLearn.
Tests mobile viewports:
- 375x667 (iPhone SE)
- 390x844 (iPhone 13/14)
- 412x915 (Samsung / Pixel)
Captures screenshots and validates no horizontal overflow and full interactivity.
"""

import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
import websockets

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
SCREENSHOT_DIR = Path(__file__).resolve().parent.parent / "screenshots" / "mobile"
PORT = 9445
MOBILE_RESOLUTIONS = [
    ("iPhone_SE_375x667", 375, 667),
    ("iPhone_14_390x844", 390, 844),
    ("Pixel_412x915", 412, 915),
]


class CDPClient:
    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 0
        self.console_errors = []

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=50 * 1024 * 1024)
        await self.send("Runtime.enable")
        await self.send("Page.enable")

    async def send(self, method: str, params: dict = None) -> dict:
        self.msg_id += 1
        req_id = self.msg_id
        payload = {"id": req_id, "method": method}
        if params:
            payload["params"] = params
        await self.ws.send(json.dumps(payload))

        while True:
            resp_raw = await self.ws.recv()
            resp = json.loads(resp_raw)
            if resp.get("method") == "Runtime.consoleAPICalled":
                msg_type = resp.get("params", {}).get("type")
                if msg_type == "error":
                    args = resp.get("params", {}).get("args", [])
                    err_text = " ".join(str(a.get("value", "")) for a in args)
                    self.console_errors.append(err_text)
            elif resp.get("method") == "Runtime.exceptionThrown":
                self.console_errors.append(str(resp.get("params", {}).get("exceptionDetails", {})))

            if resp.get("id") == req_id:
                return resp.get("result", {})

    async def eval(self, expression: str):
        res = await self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
        })
        return res.get("result", {}).get("value")

    async def set_viewport(self, width: int, height: int):
        await self.send("Emulation.setDeviceMetricsOverride", {
            "width": width,
            "height": height,
            "deviceScaleFactor": 2,
            "mobile": True,
        })

    async def screenshot(self, output_path: Path):
        res = await self.send("Page.captureScreenshot", {"format": "png"})
        img_data = base64.b64decode(res["data"])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(img_data)
        print(f"  Captured mobile screenshot: {output_path.name} ({len(img_data) // 1024} KB)", flush=True)

    async def close(self):
        if self.ws:
            await self.ws.close()


async def run_mobile_qa():
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    user_data_dir = tempfile.mkdtemp(prefix="edge_cdp_mobile_")

    print("[1/4] Starting server on http://127.0.0.1:8000...", flush=True)
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    for _ in range(30):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8000/api/health") as r:
                if r.status == 200:
                    break
        except Exception:
            await asyncio.sleep(0.5)

    print(f"[2/4] Server ready. Launching Edge headless with CDP on port {PORT}...", flush=True)
    edge_proc = subprocess.Popen([
        EDGE_PATH,
        "--headless=new",
        "--disable-gpu",
        f"--remote-debugging-port={PORT}",
        f"--user-data-dir={user_data_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--force-color-profile=srgb",
        "about:blank",
    ])
    await asyncio.sleep(2)

    ws_url = None
    for _ in range(20):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json") as r:
                tabs = json.loads(r.read().decode())
                for t in tabs:
                    if t.get("type") == "page":
                        ws_url = t["webSocketDebuggerUrl"]
                        break
            if ws_url:
                break
        except Exception:
            pass
        await asyncio.sleep(0.5)

    assert ws_url, "Failed to get Edge WebSocket debugger URL"
    client = CDPClient(ws_url)
    await client.connect()

    print("[3/4] Running Mobile Viewport QA...", flush=True)
    results = []

    try:
        for name, width, height in MOBILE_RESOLUTIONS:
            print(f"\n--- Testing Mobile Device: {name} ({width}x{height}) ---", flush=True)
            await client.set_viewport(width, height)
            await client.send("Page.navigate", {"url": "http://127.0.0.1:8000/?replay=1"})
            await asyncio.sleep(1.5)

            # 1. Check no horizontal scrollbar (width check)
            scroll_w = await client.eval("document.documentElement.scrollWidth")
            inner_w = await client.eval("window.innerWidth")
            no_h_scroll = scroll_w <= inner_w
            print(f"  Horizontal fit: scrollWidth={scroll_w}, innerWidth={inner_w} -> OK: {no_h_scroll}", flush=True)
            assert no_h_scroll, f"Horizontal overflow on {name}: scrollWidth={scroll_w} > innerWidth={inner_w}"

            await client.screenshot(SCREENSHOT_DIR / f"{name}_idle.png")

            # 2. Click Run
            await client.eval("document.querySelector('button[data-testid=\"run-button\"]').click()")
            await asyncio.sleep(1.0)
            await client.screenshot(SCREENSHOT_DIR / f"{name}_running.png")

            # 3. Wait for Solved state
            solved_stage = None
            for _ in range(60):
                solved_stage = await client.eval("document.querySelector('header span:last-child')?.textContent?.trim()?.toLowerCase()")
                if solved_stage == "solved":
                    break
                await asyncio.sleep(0.2)
            print(f"  Reached stage: {solved_stage}", flush=True)

            await client.screenshot(SCREENSHOT_DIR / f"{name}_solved.png")

            # 4. Open Report Modal
            print("  Opening Report screen...", flush=True)
            report_btn_exists = await client.eval("Boolean(document.querySelector('button[data-testid=\"report-button\"]'))")
            print(f"  Report button exists: {report_btn_exists}", flush=True)
            await client.eval("document.querySelector('button[data-testid=\"report-button\"]').click()")
            await asyncio.sleep(1.5)

            # Report horizontal fit check
            rep_scroll_w = await client.eval("document.documentElement.scrollWidth")
            rep_no_h = rep_scroll_w <= inner_w
            print(f"  Report horizontal fit: scrollWidth={rep_scroll_w}, innerWidth={inner_w} -> OK: {rep_no_h}", flush=True)
            assert rep_no_h, f"Report horizontal overflow on {name}: scrollWidth={rep_scroll_w} > innerWidth={inner_w}"

            # Check that Report modal is open and has scrollable content
            modal_exists = await client.eval("Boolean(document.querySelector('.fixed.inset-0'))")
            print(f"  Report modal visible: {modal_exists}", flush=True)
            assert modal_exists, "Report modal did not open!"

            await client.screenshot(SCREENSHOT_DIR / f"{name}_report_top.png")

            # Scroll down inside modal
            modal_sh = await client.eval("document.querySelector('.fixed.inset-0')?.scrollHeight || 0")
            print(f"  Report modal scrollHeight: {modal_sh}px", flush=True)
            await client.eval("document.querySelector('.fixed.inset-0')?.scrollTo({ top: 400, behavior: 'instant' })")
            await asyncio.sleep(0.5)
            await client.screenshot(SCREENSHOT_DIR / f"{name}_report_scrolled.png")

            # Close modal via close button click
            await client.eval("document.querySelector('button[aria-label=\"Close\"]').click()")
            await asyncio.sleep(0.5)

            results.append({
                "device": name,
                "res": f"{width}x{height}",
                "no_horizontal_overflow": no_h_scroll and rep_no_h,
                "report_accessible": modal_exists,
            })

        print("\n[4/4] Verifying console errors...")
        print(f"  Total console errors detected: {len(client.console_errors)}")
        assert len(client.console_errors) == 0, f"Detected console errors: {client.console_errors}"

    finally:
        await client.close()
        edge_proc.terminate()
        server_proc.terminate()
        await asyncio.sleep(1)
        shutil.rmtree(user_data_dir, ignore_errors=True)

    print("\n" + "=" * 70)
    print("MOBILE QA VERIFICATION SUMMARY")
    print("=" * 70)
    for r in results:
        print(f"{r['device']:<20} | {r['res']:<10} | H-Fit: {r['no_horizontal_overflow']} | Report: {r['report_accessible']}")
    print("=" * 70)
    print("ALL MOBILE TESTS PASSED CLEANLY!")


if __name__ == "__main__":
    asyncio.run(run_mobile_qa())
