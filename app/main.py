"""FastAPI application for WatchItLearn: WebSocket streaming, REST API, and static file hosting."""

import json
from pathlib import Path
from typing import Set, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

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
    return {
        "grid": env.grid,
        "rows": env.rows,
        "cols": env.cols,
        "start": env.start_pos,
        "goal": env.goal_pos,
        "optimal_len": env.optimal_len,
        "optimal_path": env.optimal_path,
    }


@app.get("/api/recorded-run")
async def get_recorded_run():
    rec_path = Path(__file__).resolve().parent.parent / "data" / "recorded_run.json"
    if rec_path.exists():
        from fastapi.responses import FileResponse
        return FileResponse(str(rec_path), media_type="application/json")
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=404, content={"error": "recorded run not found"})


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
                await trainer.run(seed=42)
            elif cmd_type == "reset":
                await trainer.reset()

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
            <body style="background:#F5F2EA; color:#111111; font-family:sans-serif; text-align:center; padding:60px;">
                <h1>WatchItLearn Backend Running</h1>
                <p>Build the frontend with <code>cd frontend && npm run build</code> to serve from port 8000.</p>
            </body>
            </html>
            """
        )
