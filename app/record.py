"""Record a golden training run to data/recorded_run.json for offline fallback playback."""

import asyncio
import json
from pathlib import Path
from typing import List, Dict, Any

from app.env import GridWorld
from app.agents import TabularRLAgent
from app.trainer import Trainer
from app.config import DEFAULT_TARGET_SECONDS


async def record_run(output_path: Path) -> None:
    """Execute a simulated run and collect all broadcast frames and events."""
    recorded_frames: List[Dict[str, Any]] = []

    def capture_callback(payload: Dict[str, Any]) -> None:
        recorded_frames.append(payload)

    env = GridWorld()
    agent = TabularRLAgent()
    trainer = Trainer(env=env, agent=agent, broadcast_callback=capture_callback)

    # Use higher speed multiplier to record quickly in ~5-10 real seconds
    trainer.speed_multiplier = 4.0

    print("Starting recorded run generation with seed 42...")
    await trainer.start(
        mode="demo",
        algo="q_learning",
        seed=42,
        target_seconds=DEFAULT_TARGET_SECONDS,
        shaping=True,
    )

    # Wait until trainer finishes (converges + victory lap) or hits timeout
    while trainer.state != "IDLE":
        await asyncio.sleep(0.1)

    print(f"Recording complete! Captured {len(recorded_frames)} frames and events.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(recorded_frames, f, separators=(",", ":"))

    print(f"Saved recorded run to {output_path.resolve()} ({output_path.stat().st_size / 1024:.1f} KB)")


def main():
    dest = Path(__file__).resolve().parent.parent / "data" / "recorded_run.json"
    asyncio.run(record_run(dest))


if __name__ == "__main__":
    main()
