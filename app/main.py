"""FastAPI application for WatchItLearn: WebSocket streaming, REST API, and static file hosting."""

import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Set, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse

from app.env import MazeWorld
from app.agents import QLearningAgent
from app.trainer import Trainer

app = FastAPI(title="WatchItLearn", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

env = MazeWorld()
agent = QLearningAgent()
active_connections: Set[WebSocket] = set()
_benchmark_executor = ThreadPoolExecutor(max_workers=1)


async def broadcast_to_clients(payload: Dict[str, Any]) -> None:
    """Send JSON frame to all active WebSocket clients."""
    if not active_connections:
        return
    text = json.dumps(payload)
    disconnected = set()
    for ws in active_connections:
        try:
            await ws.send_text(text)
        except Exception:
            disconnected.add(ws)
    for ws in disconnected:
        active_connections.discard(ws)


trainer = Trainer(env=env, agent=agent, broadcast_callback=broadcast_to_clients)


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "WatchItLearn", "stage": trainer.stage}


@app.get("/api/maze")
async def get_maze():
    from app.config import MAZE_PRESETS, MAZE_PRESET_NAMES
    return {
        "grid": env.grid,
        "rows": env.rows,
        "cols": env.cols,
        "start": env.start_pos,
        "goal": env.goal_pos,
        "optimal_len": env.optimal_len,
        "optimal_path": env.optimal_path,
        "presets": [
            {"index": i, "name": name, "grid": p}
            for i, (name, p) in enumerate(zip(MAZE_PRESET_NAMES, MAZE_PRESETS))
        ],
        "active_index": trainer.maze_index,
    }


@app.post("/api/maze")
async def post_maze(payload: Dict[str, Any]):
    idx = payload.get("index", 0)
    await trainer.set_maze(idx)
    return {"status": "ok", "active_index": trainer.maze_index}


@app.get("/api/recorded-run")
async def get_recorded_run():
    rec_path = Path(__file__).resolve().parent.parent / "data" / "recorded_run.json"
    if rec_path.exists():
        from fastapi.responses import FileResponse
        return FileResponse(str(rec_path), media_type="application/json")
    return JSONResponse(status_code=404, content={"error": "recorded run not found"})


@app.get("/api/report")
async def get_report():
    """Return the performance report for the latest solved run."""
    if trainer.frozen_snapshot is None:
        return JSONResponse(status_code=409, content={"message": "No solved run available. Run the agent first."})
    from app.evaluation import build_report
    report = build_report(trainer.frozen_snapshot)
    return report


@app.get("/api/recorded-report")
async def get_recorded_report():
    """Return the pre-recorded report for offline replay."""
    rec_path = Path(__file__).resolve().parent.parent / "data" / "recorded_report.json"
    if rec_path.exists():
        from fastapi.responses import FileResponse
        return FileResponse(str(rec_path), media_type="application/json")
    return JSONResponse(status_code=404, content={"error": "recorded report not found"})


# ---------------------------------------------------------------------------
# WebSocket Endpoint
# ---------------------------------------------------------------------------
@app.websocket("/ws/train")
async def ws_train(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)

    # Send initial idle frame immediately
    try:
        sr, sc = env.start_pos
        init_frame = trainer.build_frame(sr, sc, [(sr, sc)])
        init_frame["stage"] = "idle"
        await websocket.send_text(json.dumps(init_frame))
    except Exception:
        pass

    try:
        while True:
            raw = await websocket.receive_text()
            cmd = json.loads(raw)
            cmd_type = cmd.get("type", "")

            if cmd_type == "run":
                speed = cmd.get("speed") or cmd.get("target_seconds")
                await trainer.run(seed=42, target_seconds=speed)
            elif cmd_type == "reset":
                await trainer.reset()
            elif cmd_type == "set_maze":
                idx = cmd.get("index", 0)
                await trainer.set_maze(idx)
            elif cmd_type == "set_speed":
                speed = cmd.get("speed") or cmd.get("target_seconds", 40.0)
                await trainer.set_speed(speed)
            elif cmd_type == "benchmark":
                n_seeds = cmd.get("seeds", 20)
                loop = asyncio.get_event_loop()

                async def _run_benchmark():
                    from app.evaluate import run_benchmark

                    def progress_cb(done, total):
                        # Schedule a progress message on the event loop
                        asyncio.run_coroutine_threadsafe(
                            _send_progress(done, total), loop
                        )

                    result = await loop.run_in_executor(
                        _benchmark_executor,
                        lambda: run_benchmark(n_seeds=n_seeds, progress_callback=progress_cb),
                    )
                    try:
                        await websocket.send_text(json.dumps({
                            "type": "benchmark_result",
                            **result,
                        }))
                    except Exception:
                        pass

                async def _send_progress(done, total):
                    try:
                        await websocket.send_text(json.dumps({
                            "type": "benchmark_progress",
                            "done": done,
                            "total": total,
                        }))
                    except Exception:
                        pass

                asyncio.create_task(_run_benchmark())

    except WebSocketDisconnect:
        active_connections.discard(websocket)
        if not active_connections:
            await trainer.reset()
    except Exception:
        active_connections.discard(websocket)


# ---------------------------------------------------------------------------
# Static File Hosting (Built Frontend)
# ---------------------------------------------------------------------------
frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists() and (frontend_dist / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")
else:

    @app.get("/")
    async def fallback_index():
        return HTMLResponse(
            """
            <!DOCTYPE html>
            <html>
            <head><title>WatchItLearn</title></head>
            <body style="background:#E6EAF0; color:#1F2733; font-family:sans-serif; text-align:center; padding:60px;">
                <h1>WatchItLearn Backend Running</h1>
                <p>Build the frontend with <code>cd frontend && npm run build</code> to serve from port 8000.</p>
            </body>
            </html>
            """
        )
