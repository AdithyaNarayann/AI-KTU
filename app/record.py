"""Record a complete golden run to data/recorded_run.json and data/recorded_report.json for offline fallback."""

import asyncio
import json
from pathlib import Path
from typing import List, Dict, Any

from app.env import MazeWorld
from app.agents import QLearningAgent
from app.trainer import Trainer


async def record_golden_run(output_dir: Path) -> None:
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

    output_dir.mkdir(parents=True, exist_ok=True)

    # Write recorded frames
    frames_path = output_dir / "recorded_run.json"
    with open(frames_path, "w", encoding="utf-8") as f:
        json.dump(recorded_frames, f, separators=(",", ":"))
    print(f"Recorded {len(recorded_frames)} frames to {frames_path.resolve()} ({frames_path.stat().st_size / 1024:.1f} KB)")

    # Write performance report if snapshot is available
    if trainer.frozen_snapshot is not None:
        from app.evaluation import build_report
        report = build_report(trainer.frozen_snapshot)
        report_path = output_dir / "recorded_report.json"
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"Recorded report to {report_path.resolve()} ({report_path.stat().st_size / 1024:.1f} KB)")
    else:
        print("Warning: No frozen snapshot available; skipping report recording.")


def main():
    dest = Path(__file__).resolve().parent.parent / "data"
    asyncio.run(record_golden_run(dest))


if __name__ == "__main__":
    main()
