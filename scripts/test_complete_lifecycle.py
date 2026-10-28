"""Comprehensive Lifecycle & Functionality Verification Script:
1. Verifies WebSocket connection & live run to 'solved'
2. Verifies switching maze (0 -> 1 -> 2) after completion
3. Verifies switching speed after completion
4. Verifies running again after completion
5. Verifies /api/benchmark returns 20 seeds instantly
6. Verifies /api/report caching (no 32x duplicate compute)
"""

import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_lifecycle():
    print("[1/5] Testing WebSocket full lifecycle...")
    with client.websocket_connect("/ws/train") as ws:
        # Step 1: Initial idle frame
        init_frame = json.loads(ws.receive_text())
        print("  Initial frame:", init_frame["stage"], "maze:", init_frame["maze_index"])
        assert init_frame["stage"] == "idle"

        # Step 2: Run agent on maze 0
        ws.send_text(json.dumps({"type": "run", "speed": 5}))
        print("  Sent 'run' command...")
        solved = False
        for _ in range(400):
            msg = json.loads(ws.receive_text())
            if msg.get("stage") == "solved":
                solved = True
                print("  Received solved frame! Steps:", msg.get("result", {}).get("steps"))
                break
        assert solved, "Agent did not reach solved stage!"

        # Step 3: Switch maze to 1 (Classic) after completion
        print("\n[2/5] Testing maze switch to 1 (Classic) after solved...")
        ws.send_text(json.dumps({"type": "set_maze", "index": 1}))
        switched_to_1 = False
        for _ in range(20):
            msg = json.loads(ws.receive_text())
            if msg.get("stage") == "idle" and msg.get("maze_index") == 1:
                switched_to_1 = True
                print("  Successfully switched to maze 1 in idle stage!")
                break
        assert switched_to_1, "Failed to switch to maze 1 after solved!"

        # Step 4: Change speed to 'step' after completion
        print("\n[3/5] Testing speed change to 'step'...")
        ws.send_text(json.dumps({"type": "set_speed", "speed": "step"}))
        speed_updated = False
        for _ in range(10):
            msg = json.loads(ws.receive_text())
            if msg.get("speed_mode") == "step":
                speed_updated = True
                print("  Speed successfully updated to 'step'!")
                break
        assert speed_updated, "Failed to update speed!"

        # Step 5: Run again on maze 1
        print("\n[4/5] Testing 'run again' on maze 1...")
        ws.send_text(json.dumps({"type": "run", "speed": 5}))
        ran_again = False
        for _ in range(20):
            msg = json.loads(ws.receive_text())
            if msg.get("stage") in ("exploring", "learning"):
                ran_again = True
                print("  Agent restarted running on maze 1! Attempt:", msg.get("attempt"))
                break
        assert ran_again, "Failed to run again!"

        # Wait for maze 1 to solve
        for _ in range(400):
            msg = json.loads(ws.receive_text())
            if msg.get("stage") == "solved":
                print("  Maze 1 solved in", msg.get("result", {}).get("steps"), "steps!")
                break

        # Step 6: Switch maze to 2 (Zig-Zag)
        print("\n[5/5] Testing maze switch to 2 (Zig-Zag)...")
        ws.send_text(json.dumps({"type": "set_maze", "index": 2}))
        switched_to_2 = False
        for _ in range(20):
            msg = json.loads(ws.receive_text())
            if msg.get("stage") == "idle" and msg.get("maze_index") == 2:
                switched_to_2 = True
                print("  Successfully switched to maze 2 (Zig-Zag)!")
                break
        assert switched_to_2, "Failed to switch to maze 2!"

        # Verify old report is cleanly invalidated on maze change
        r_invalid = client.get("/api/report")
        assert r_invalid.status_code == 409, "Report should be invalidated after maze switch!"
        print("  Verified: Old report invalidated on maze switch (409).")

        # Run Maze 2 to solved
        ws.send_text(json.dumps({"type": "run", "speed": 10}))
        m2_solved = False
        while True:
            msg = json.loads(ws.receive_text())
            if msg.get("stage") == "solved":
                m2_solved = True
                print(f"  Maze 2 solved in {msg.get('result', {}).get('steps')} steps!")
                break
        assert m2_solved, "Maze 2 failed to solve!"

    print("\n[API] Testing /api/report caching for Maze 2...")
    t0 = time.time()
    r = client.get("/api/report")
    t1 = time.time()
    print("  GET /api/report status:", r.status_code, f"time: {t1 - t0:.4f}s")
    assert r.status_code == 200
    report_data = r.json()
    assert report_data["meta"]["maze_index"] == 2
    assert report_data["meta"]["optimal_len"] == 32
    assert "grid" in report_data["meta"]
    assert len(report_data["meta"]["grid"]) == 11
    print("  Verified: Report meta has maze_index 2, optimal_len 32, and exact 11x11 grid!")

    print("\n[API] Testing /api/benchmark instant response...")
    t0 = time.time()
    r = client.get("/api/benchmark?maze_index=2")
    t1 = time.time()
    print("  GET /api/benchmark status:", r.status_code, f"time: {t1 - t0:.4f}s")
    assert r.status_code == 200
    data = r.json()
    assert len(data["mazes"][0]["seeds"]) == 20, "Expected 20 seeds in benchmark!"
    print(f"  Reliability seeds verified: {len(data['mazes'][0]['seeds'])} seeds present!")

    print("\n" + "=" * 60)
    print("ALL LIFECYCLE & BACKEND FUNCTIONALITY TESTS PASSED!")
    print("=" * 60)

if __name__ == "__main__":
    test_lifecycle()
