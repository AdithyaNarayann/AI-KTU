"""Record a complete golden run to data/recorded_run.json for offline fallback playback."""

import asyncio
import json
from pathlib import Path
from typing import List, Dict, Any

from app.env import MazeWorld
from app.agents import QLearningAgent
from app.trainer import Trainer


async def record_golden_run(output_path: Path) -> None:
    recorded_frames: List[Dict[str, Any]] = []

    def capture(payload: Dict[str, Any]) -> None:
        recorded_frames.append(payload)

    env = MazeWorld()
    agent = QLearningAgent()
    trainer = Trainer(env=env, agent=agent, broadcast_callback=capture)

    print("Generating recorded golden run with seed 42...")
    await trainer.run(seed=42)

    # Wait for trainer to finish (solved state)
    while trainer.stage != "solved":
        await asyncio.sleep(0.1)

    # Allow final walk frames to settle
    await asyncio.sleep(1.0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(recorded_frames, f, separators=(",", ":"))

    print(f"Recorded {len(recorded_frames)} frames to {output_path.resolve()} ({output_path.stat().st_size / 1024:.1f} KB)")


def main():
    dest = Path(__file__).resolve().parent.parent / "data" / "recorded_run.json"
    asyncio.run(record_golden_run(dest))


if __name__ == "__main__":
    main()
