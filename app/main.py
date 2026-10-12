"""FastAPI application providing WebSocket streaming and REST endpoints for WatchItLearn."""

import json
import os
import asyncio
from typing import Set, Dict, Any, Optional
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse

from app.config import (
    DEFAULT_ASCII_LAYOUT,
    DEFAULT_TARGET_SECONDS,
)
from app.env import GridWorld
from app.agents import TabularRLAgent
from app.trainer import Trainer

app = FastAPI(title="WatchItLearn", version="1.0.0")

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
env = GridWorld()
agent = TabularRLAgent()
active_connections: Set[WebSocket] = set()


async def broadcast_to_clients(payload: Dict[str, Any]) -> None:
    """Send JSON payload to all connected WebSocket clients."""
    if not active_connections:
        return
    text_data = json.dumps(payload)
    disconnected = set()
    for ws in active_connections:
        try:
            await ws.send_text(text_data)
        except Exception:
            disconnected.add(ws)
    for ws in disconnected:
        active_connections.discard(ws)


trainer = Trainer(env=env, agent=agent, broadcast_callback=broadcast_to_clients)


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "app": "WatchItLearn",
        "trainer_state": trainer.state,
        "clients_connected": len(active_connections),
    }


@app.get("/api/layout")
async def get_layout():
    """Return default layout information, dimensions, and BFS optimal path."""
    return {
        "grid": env.get_ascii_grid(),
        "rows": env.rows,
        "cols": env.cols,
        "start": env.start_pos,
        "goal": env.goal_pos,
        "key": env.key_pos,
        "door": env.door_pos,
        "optimal_len": env.optimal_len,
        "optimal_path": env.optimal_path,
    }


@app.get("/api/recorded-run")
async def get_recorded_run():
    """Serve precomputed fallback run recorded by python -m app.record."""
    data_path = Path(__file__).resolve().parent.parent / "data" / "recorded_run.json"
    if not data_path.exists():
        # Fallback to empty list or 404
        raise HTTPException(
            status_code=404,
            detail="Recorded run not found. Run 'python -m app.record' to generate it.",
        )
    return FileResponse(str(data_path), media_type="application/json")


# ---------------------------------------------------------------------------
# WebSocket Endpoint
# ---------------------------------------------------------------------------
@app.websocket("/ws/train")
async def websocket_train_endpoint(websocket: WebSocket):
    """Bidirectional WebSocket for training control and streaming frames."""
    await websocket.accept()
    active_connections.add(websocket)

    # Immediately send the initial idle frame to initialize the UI
    try:
        sr, sc = env.start_pos
        init_frame = trainer._build_frame_dict(sr, sc, False, [(sr, sc)])
        await websocket.send_text(json.dumps(init_frame))
    except Exception:
        pass

    try:
        while True:
            text_data = await websocket.receive_text()
            cmd = json.loads(text_data)
            cmd_type = cmd.get("type", "")

            if cmd_type == "start":
                mode = cmd.get("mode", "demo")
                algo = cmd.get("algo", "q_learning")
                seed = cmd.get("seed", 42)
                target_seconds = float(cmd.get("target_seconds", DEFAULT_TARGET_SECONDS))
                shaping = bool(cmd.get("shaping", True))
                await trainer.start(
                    mode=mode,
                    algo=algo,
                    seed=seed,
                    target_seconds=target_seconds,
                    shaping=shaping,
                )

            elif cmd_type == "pause":
                await trainer.pause()

            elif cmd_type == "resume":
                await trainer.resume()

            elif cmd_type == "reset":
                await trainer.reset()

            elif cmd_type == "victory_lap":
                asyncio.create_task(trainer.run_victory_lap())

            elif cmd_type == "edit":
                r = int(cmd.get("row", 0))
                c = int(cmd.get("col", 0))
                tile = str(cmd.get("tile", "."))
                trainer.handle_edit(r, c, tile)
                # Emit shock event
                shock_event = {
                    "type": "event",
                    "event": "shock",
                    "row": r,
                    "col": c,
                    "tile": tile,
                }
                await broadcast_to_clients(shock_event)

            elif cmd_type == "set_algo":
                algo = str(cmd.get("algo", "q_learning"))
                trainer.handle_set_algo(algo)

            elif cmd_type == "set_speed":
                speed = float(cmd.get("speed", 1.0))
                trainer.handle_set_speed(speed)

    except WebSocketDisconnect:
        active_connections.discard(websocket)
        if not active_connections and trainer.state == "RUNNING":
            # If all clients disconnected, pause trainer
            await trainer.pause()
    except Exception as e:
        active_connections.discard(websocket)


# ---------------------------------------------------------------------------
# Static File Serving (Built Frontend)
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
            <head><title>WatchItLearn - AI Demo</title></head>
            <body style="background:#090d16; color:#f1f5f9; font-family:sans-serif; text-align:center; padding:50px;">
                <h1 style="color:#10b981; font-size:32px;">WatchItLearn Server Running</h1>
                <p>The backend is active. The frontend is not built yet in <code>frontend/dist</code>.</p>
                <p>To run in development mode with live reload, run:</p>
                <pre style="background:#1e293b; display:inline-block; padding:15px; border-radius:8px; text-align:left;">
cd frontend
npm install
npm run dev
                </pre>
                <p>Or build the frontend to serve as a single command:</p>
                <pre style="background:#1e293b; display:inline-block; padding:15px; border-radius:8px; text-align:left;">
cd frontend
npm run build
                </pre>
            </body>
            </html>
            """
        )
