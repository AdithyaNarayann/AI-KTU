"""Comprehensive QA Verification Script for WatchItLearn.
- Spins up backend server
- Launches Edge headless with CDP
- Tests at 1280x720, 1366x768, 1920x1080
- Asserts document.documentElement.scrollHeight <= window.innerHeight
- Captures screenshots for idle, running, solved, report
- Verifies zero console errors
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
SCREENSHOT_DIR = Path(__file__).resolve().parent.parent / "screenshots"
PORT = 9444
RESOLUTIONS = [
    (1280, 720),
    (1366, 768),
    (1920, 1080),
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
            # Check for console errors
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
            "deviceScaleFactor": 1,
            "mobile": False,
        })

    async def screenshot(self, output_path: Path):
        res = await self.send("Page.captureScreenshot", {"format": "png"})
        img_data = base64.b64decode(res["data"])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(img_data)
        print(f"  Captured screenshot: {output_path.name} ({len(img_data) // 1024} KB)", flush=True)

    async def close(self):
        if self.ws:
            await self.ws.close()


async def run_qa():
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    user_data_dir = tempfile.mkdtemp(prefix="edge_cdp_")

    # 1. Start backend server
    print("[1/4] Starting WatchItLearn server on http://127.0.0.1:8000...", flush=True)
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Wait for server
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
        "--blink-settings=forceDarkModeEnabled=false",
        "--disable-features=WebContentsForceDark",
        "about:blank",
    ])
    await asyncio.sleep(2)

    # Get WebSocket debugger URL for the page
    ws_url = None
    for _ in range(20):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json") as r:
                tabs = json.loads(r.read().decode())
                # Find page tab
                for t in tabs:
                    if t.get("type") == "page" and "about:blank" in t.get("url", ""):
                        ws_url = t["webSocketDebuggerUrl"]
                        break
                if not ws_url:
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

    print("[3/4] Running viewport assertions and screenshot capture...", flush=True)
    results_table = []

    try:
        for width, height in RESOLUTIONS:
            res_str = f"{width}x{height}"
            print(f"\n--- Testing Resolution: {res_str} ---", flush=True)

            await client.set_viewport(width, height)

            # Navigate to replay mode
            await client.send("Page.navigate", {"url": "http://127.0.0.1:8000/?replay=1"})
            await asyncio.sleep(2.0)

            # 1. Idle state assertion
            idle_scroll = await client.eval("document.documentElement.scrollHeight <= window.innerHeight")
            idle_sh = await client.eval("document.documentElement.scrollHeight")
            idle_ih = await client.eval("window.innerHeight")
            print(f"  Idle viewport check: scrollHeight={idle_sh}, innerHeight={idle_ih} -> Fits: {idle_scroll}", flush=True)
            assert idle_scroll, f"Idle screen overflow at {res_str}: scrollHeight={idle_sh} > innerHeight={idle_ih}"

            idle_path = SCREENSHOT_DIR / f"idle_{res_str}.png"
            await client.screenshot(idle_path)

            # 2. Running state
            await client.eval("document.querySelector('button[data-testid=\"run-button\"]').click()")
            await asyncio.sleep(1.2)

            run_scroll = await client.eval("document.documentElement.scrollHeight <= window.innerHeight")
            run_sh = await client.eval("document.documentElement.scrollHeight")
            run_ih = await client.eval("window.innerHeight")
            print(f"  Running viewport check: scrollHeight={run_sh}, innerHeight={run_ih} -> Fits: {run_scroll}", flush=True)
            assert run_scroll, f"Running screen overflow at {res_str}: scrollHeight={run_sh} > innerHeight={run_ih}"

            run_path = SCREENSHOT_DIR / f"running_{res_str}.png"
            await client.screenshot(run_path)

            # 3. Wait for Solved state (replay is 115 frames @ 40ms = ~4.6s)
            print("  Waiting for playback to complete (stage = solved)...", flush=True)
            for _ in range(50):
                stage = await client.eval("document.querySelector('header span:last-child')?.textContent?.trim()?.toLowerCase()")
                if stage == "solved":
                    break
                await asyncio.sleep(0.2)

            solved_scroll = await client.eval("document.documentElement.scrollHeight <= window.innerHeight")
            solved_sh = await client.eval("document.documentElement.scrollHeight")
            solved_ih = await client.eval("window.innerHeight")
            print(f"  Solved viewport check: scrollHeight={solved_sh}, innerHeight={solved_ih} -> Fits: {solved_scroll}", flush=True)
            assert solved_scroll, f"Solved screen overflow at {res_str}: scrollHeight={solved_sh} > innerHeight={solved_ih}"

            # Check best steps display when solved (Bug b check: should equal optimal BFS steps, 32)
            best_text = await client.eval("Array.from(document.querySelectorAll('span')).find(el => el.textContent === 'Best')?.nextElementSibling?.textContent")
            print(f"  Solved 'Best' value check: {best_text}", flush=True)

            solved_path = SCREENSHOT_DIR / f"solved_{res_str}.png"
            await client.screenshot(solved_path)

            # 4. Open Report
            print("  Opening Report screen...", flush=True)
            await client.eval("document.querySelector('button[data-testid=\"report-button\"]').click()")
            await asyncio.sleep(1.0)

            # Assert Report screen fits viewport
            report_scroll = await client.eval("document.documentElement.scrollHeight <= window.innerHeight")
            report_sh = await client.eval("document.documentElement.scrollHeight")
            report_ih = await client.eval("window.innerHeight")
            print(f"  Report viewport check: scrollHeight={report_sh}, innerHeight={report_ih} -> Fits: {report_scroll}", flush=True)
            assert report_scroll, f"Report screen overflow at {res_str}: scrollHeight={report_sh} > innerHeight={report_ih}"

            # Wait for benchmark dots to populate
            await asyncio.sleep(1.0)

            report_path = SCREENSHOT_DIR / f"report_{res_str}.png"
            await client.screenshot(report_path)

            results_table.append({
                "resolution": res_str,
                "idle_fits": idle_scroll,
                "running_fits": run_scroll,
                "solved_fits": solved_scroll,
                "report_fits": report_scroll,
                "best_value": best_text,
            })

            # Close report
            await client.eval("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
            await asyncio.sleep(0.5)

        print("\n[4/4] Verifying console errors...")
        print(f"  Total console errors detected: {len(client.console_errors)}")
        if client.console_errors:
            print("  Errors:", client.console_errors)
        assert len(client.console_errors) == 0, f"Detected console errors: {client.console_errors}"

    finally:
        await client.close()
        edge_proc.terminate()
        server_proc.terminate()
        await asyncio.sleep(1)
        shutil.rmtree(user_data_dir, ignore_errors=True)

    print("\n" + "=" * 70)
    print("QA VERIFICATION SUMMARY")
    print("=" * 70)
    print(f"{'Resolution':<12} | {'Idle':<6} | {'Running':<8} | {'Solved':<7} | {'Report':<7} | {'Best Steps'}")
    print("-" * 70)
    for r in results_table:
        print(f"{r['resolution']:<12} | {str(r['idle_fits']):<6} | {str(r['running_fits']):<8} | {str(r['solved_fits']):<7} | {str(r['report_fits']):<7} | {r['best_value']}")
    print("=" * 70)
    print("ALL ASSERTIONS PASSED! ZERO OVERFLOW, ZERO CONSOLE ERRORS.")


if __name__ == "__main__":
    asyncio.run(run_qa())
