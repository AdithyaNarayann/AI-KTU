"""Generate Bauhaus-styled convergence chart (episode length vs episode)."""

import json
from pathlib import Path
import matplotlib.pyplot as plt

def generate():
    data_path = Path(__file__).resolve().parent.parent / "data" / "recorded_report.json"
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    episodes = data["curves"]["episode_index"]
    steps = data["curves"]["steps"]
    optimal = data["meta"]["optimal_len"]

    fig, ax = plt.subplots(figsize=(8, 3.2), dpi=200)
    fig.patch.set_facecolor("#F5F2EA")
    ax.set_facecolor("#F5F2EA")

    # Optimal line
    ax.axhline(optimal, color="#111111", linestyle="--", linewidth=1.2, label=f"BFS Optimal ({optimal} steps)")

    # Learning curve
    ax.plot(episodes, steps, color="#FF4F00", linewidth=1.5, label="Steps per episode")

    # Formatting
    ax.set_title("Training Convergence (Labyrinth)", fontsize=13, fontweight="bold", color="#111111", pad=12, family="sans-serif")
    ax.set_xlabel("Episode", fontsize=10, fontweight="bold", color="#111111", family="sans-serif")
    ax.set_ylabel("Steps to Goal", fontsize=10, fontweight="bold", color="#111111", family="sans-serif")

    ax.set_ylim(0, 210)
    ax.set_xlim(0, len(episodes))

    # Grid & Spines
    ax.grid(True, linestyle=":", color="#D9D4C7", linewidth=0.8)
    for spine in ax.spines.values():
        spine.set_color("#111111")
        spine.set_linewidth(1.2)

    ax.tick_params(colors="#111111", labelsize=9)
    ax.legend(facecolor="#F5F2EA", edgecolor="#111111", fontsize=9, loc="upper right")

    plt.tight_layout()

    out_dir = Path(__file__).resolve().parent.parent / "docs" / "assets"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_svg = out_dir / "convergence.svg"
    plt.savefig(out_svg, format="svg", bbox_inches="tight")
    print(f"Chart saved to {out_svg}")

if __name__ == "__main__":
    generate()
