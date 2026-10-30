"""Generate 10-12s demo.gif from recorded_run.json frames."""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image, ImageDraw, ImageFont
import numpy as np
from app.env import MazeWorld

def main():
    rec_path = Path("data/recorded_run.json")
    if not rec_path.exists():
        print("recorded_run.json not found")
        return

    with open(rec_path, "r", encoding="utf-8") as f:
        frames = json.load(f)

    # Canvas size: 360 x 360, 11x11 grid -> tile size ~32px
    size = 352
    tile = 32
    rows, cols = 11, 11

    pil_images = []

    # Get BFS path for solved state
    mw = MazeWorld(layout=frames[0]["grid"])
    bfs_path = mw.optimal_path

    for f_idx, fr in enumerate(frames):
        im = Image.new("RGB", (size, size + 28), color="#F5F2EA")
        draw = ImageDraw.Draw(im)

        grid = fr.get("grid") or frames[0]["grid"]
        vals = np.array(fr.get("value", np.zeros((11, 11))))
        trail = fr.get("trail", [])
        agent = fr.get("agent", [1, 1])
        stage = fr.get("stage", "idle")
        attempt = fr.get("attempt", 0)
        eps = fr.get("random_pct", 100)

        # Draw grid
        for r in range(rows):
            for c in range(cols):
                x = c * tile
                y = r * tile
                char = grid[r][c]
                if char == "#":
                    draw.rectangle([x, y, x + tile, y + tile], fill="#111111")
                else:
                    draw.rectangle([x, y, x + tile, y + tile], fill="#F5F2EA", outline="#D9D4C7")
                    v = vals[r, c] if r < vals.shape[0] and c < vals.shape[1] else 0
                    if v > 0.005:
                        # blend orange
                        alpha = min(0.9, v * 0.9)
                        # #F5F2EA (245, 242, 234) -> #FF4F00 (255, 79, 0)
                        red = int(245 + (255 - 245) * alpha)
                        green = int(242 + (79 - 242) * alpha)
                        blue = int(234 + (0 - 234) * alpha)
                        draw.rectangle([x, y, x + tile, y + tile], fill=(red, green, blue), outline="#D9D4C7")

                if char == "S":
                    draw.text((x + 10, y + 8), "S", fill="#111111")
                elif char == "G":
                    draw.rectangle([x + 6, y + 6, x + tile - 6, y + tile - 6], outline="#111111", width=2)
                    draw.rectangle([x + 11, y + 11, x + tile - 11, y + tile - 11], fill="#111111")

        # Trail
        if trail and len(trail) > 1:
            t_len = len(trail)
            for i, (tr, tc) in enumerate(trail):
                alpha = ((i + 1) / t_len) * 0.4
                inset = 8
                tx = tc * tile + inset
                ty = tr * tile + inset
                red = int(245 + (255 - 245) * alpha)
                green = int(242 + (79 - 242) * alpha)
                blue = int(234 + (0 - 234) * alpha)
                draw.rectangle([tx, ty, tx + tile - inset*2, ty + tile - inset*2], fill=(red, green, blue))

        # Agent
        ar, ac = agent
        ainset = 5
        ax = ac * tile + ainset
        ay = ar * tile + ainset
        draw.rectangle([ax, ay, ax + tile - ainset*2, ay + tile - ainset*2], fill="#FF4F00")

        # Optimal path if solved
        if stage == "solved":
            for i in range(len(bfs_path) - 1):
                p1 = bfs_path[i]
                p2 = bfs_path[i+1]
                draw.line([p1[1]*tile + 16, p1[0]*tile + 16, p2[1]*tile + 16, p2[0]*tile + 16], fill="#111111", width=3)

        # Bottom status bar
        status_text = f"Stage: {stage.upper()} | Attempt {attempt} | Random: {eps}%"
        draw.rectangle([0, size, size, size + 28], fill="#111111")
        draw.text((10, size + 7), status_text, fill="#FFFFFF")

        pil_images.append(im)

    out_gif = Path("docs/assets/demo.gif")
    out_gif.parent.mkdir(parents=True, exist_ok=True)
    # Save GIF: duration 100ms per frame = 10 fps -> 11.5 seconds total!
    pil_images[0].save(
        out_gif,
        save_all=True,
        append_images=pil_images[1:],
        duration=100,
        loop=0,
        optimize=True
    )
    print(f"Demo GIF saved to {out_gif} ({len(pil_images)} frames, {out_gif.stat().st_size / 1024:.1f} KB)")

if __name__ == "__main__":
    main()
