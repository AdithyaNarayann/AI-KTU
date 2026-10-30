"""Render 3-panel strip from recorded_run.json: Episode 1, Episode 48 (mid), Episode 125 (converged)."""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import matplotlib.pyplot as plt
import numpy as np

def render_tile_maze(ax, frame, title):
    grid = frame["grid"]
    val = np.array(frame["value"])
    trail = frame["trail"]
    agent = frame["agent"]
    stage = frame.get("stage", "")

    rows, cols = 11, 11
    ax.set_facecolor("#F5F2EA")

    for r in range(rows):
        for c in range(cols):
            char = grid[r][c]
            if char == "#":
                ax.fill([c, c+1, c+1, c], [rows-r-1, rows-r-1, rows-r, rows-r], color="#111111")
            else:
                ax.fill([c, c+1, c+1, c], [rows-r-1, rows-r-1, rows-r, rows-r], color="#F5F2EA")
                v = val[r, c]
                if v > 0.005:
                    alpha = min(v * 0.9, 0.9)
                    ax.fill([c, c+1, c+1, c], [rows-r-1, rows-r-1, rows-r, rows-r], color="#FF4F00", alpha=alpha)

            # Hairline grid
            ax.plot([c, c+1, c+1, c, c], [rows-r-1, rows-r-1, rows-r, rows-r, rows-r-1], color="#D9D4C7", linewidth=0.5)

            if char == "S":
                ax.text(c + 0.5, rows - r - 0.5, "S", ha="center", va="center", color="#111111", fontsize=11, fontweight="bold")
            elif char == "G":
                # Goal square glyph
                ax.plot([c+0.2, c+0.8, c+0.8, c+0.2, c+0.2], [rows-r-0.8, rows-r-0.8, rows-r-0.2, rows-r-0.2, rows-r-0.8], color="#111111", linewidth=1.5)
                ax.fill([c+0.35, c+0.65, c+0.65, c+0.35], [rows-r-0.65, rows-r-0.65, rows-r-0.35, rows-r-0.35], color="#111111")

    # Trail
    if trail and len(trail) > 1:
        t_len = len(trail)
        for i, (tr, tc) in enumerate(trail):
            alpha = ((i + 1) / t_len) * 0.4
            inset = 0.28
            ax.fill([tc+inset, tc+1-inset, tc+1-inset, tc+inset],
                    [rows-tr-1+inset, rows-tr-1+inset, rows-tr-inset, rows-tr-inset],
                    color="#FF4F00", alpha=alpha)

    # Agent
    ar, ac = agent
    inset = 0.16
    ax.fill([ac+inset, ac+1-inset, ac+1-inset, ac+inset],
            [rows-ar-1+inset, rows-ar-1+inset, rows-ar-inset, rows-ar-inset],
            color="#FF4F00")

    # If solved, draw path line
    if stage == "solved":
        from app.env import MazeWorld
        mw = MazeWorld(layout=grid)
        path = mw.optimal_path
        px = [p[1] + 0.5 for p in path]
        py = [rows - p[0] - 0.5 for p in path]
        ax.plot(px, py, color="#111111", linewidth=2.5, solid_capstyle="butt")

    ax.set_xlim(0, cols)
    ax.set_ylim(0, rows)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title(title, fontsize=11, fontweight="bold", color="#111111", pad=10, family="sans-serif")

def main():
    with open("data/recorded_run.json", "r", encoding="utf-8") as f:
        frames = json.load(f)

    # Frame for episode 1 (index 5)
    f_ep1 = frames[5]
    # Frame for mid-training (attempt 48, index 86)
    f_mid = [f for f in frames if f["attempt"] == 48][-1]
    # Frame for converged (attempt 125, index 114)
    f_sol = frames[114]

    fig, axes = plt.subplots(1, 3, figsize=(12, 4.4), dpi=200)
    fig.patch.set_facecolor("#F5F2EA")

    render_tile_maze(axes[0], f_ep1, "Episode 1: Random Exploration (ε = 0.98)")
    render_tile_maze(axes[1], f_mid, "Episode 48: Value Gradient (ε = 0.42)")
    render_tile_maze(axes[2], f_sol, "Episode 125: Optimal Policy (32 steps)")

    plt.tight_layout()
    out_path = Path("docs/assets/panel_strip.png")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_path, bbox_inches="tight", facecolor="#F5F2EA")
    print(f"3-panel strip saved to {out_path}")

if __name__ == "__main__":
    main()
