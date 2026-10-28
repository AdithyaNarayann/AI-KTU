"""Update Section 9 in README.md to describe the restored Bauhaus UI."""

from pathlib import Path

readme_path = Path("README.md")
content = readme_path.read_text(encoding="utf-8")

start_marker = "## 9. Frontend Architecture & UI/UX Design"
end_marker = "## 10. REST & WebSocket API Specifications"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

assert start_idx != -1 and end_idx != -1, "Markers not found"

new_sec9 = """## 9. Frontend Architecture & UI/UX Design

The frontend is a tactile, single-page web dashboard developed with **React 18**, **TypeScript**, **Vite**, and **Tailwind CSS**. It is designed around a disciplined Bauhaus / Swiss aesthetic: warm cream paper surfaces, sharp ink hairlines, hard offset shadows, International Orange accents, and strict typographic hierarchy.

### 9.1 Single Unscrollable Viewport & Responsive Layout
Both the main dashboard and the performance analysis report overlay are engineered to fit within a single, strictly unscrollable viewport (`h-screen overflow-hidden`) across common desktop resolutions (1280x720, 1366x768, and 1920x1080):
- **Header**: Wordmark on the left, status badge on the right (idle outlined, running orange fill, solved ink fill with white text).
- **Left Column**: $11 \\times 11$ Canvas maze viewport with hard offset ink shadow (`4px 4px 0px #111111`). Under the board, a single non-truncated status line displays attempt index and stage:
  - *Idle*: `"Press Run"`
  - *Exploring*: `"Attempt 19 : Exploring"`
  - *Learning*: `"Attempt 64 : Learning"`
  - *Converging*: `"Attempt 118 : Almost there"`
  - *Solved*: `"Solved in 32 steps, the shortest possible"` (or `"Solved in 35 steps, shortest is 32"`)
- **Right Column**:
  - Maze layout selector (`1`, `2`, `3`, `Shuffle`).
  - Speed selector (`Step by step`, `Normal`, `Fast`) with clean, concise labels.
  - Four data tiles with one-word labels: `Shortest`, `Best`, `Moves`, `Random`. When solved, `Best` displays the greedy solution length (e.g., 32), matching the true BFS path.
  - Primary **RUN** action button with hard offset shadow (`4px 4px 0px #111111`). When running, an orange progress bar fills the button with high-contrast ink text. When solved, transitions to `"Run again"` with an adjacent square `"Report"` button.
  - Real-time steps-per-attempt sparkline with dashed optimum baseline and tabular values.
- **Keyboard Shortcuts**: **Spacebar** runs or restarts learning; **R** opens the report when solved; **Esc** closes the report overlay; **1**, **2**, **3** switch maze presets.

### 9.2 Bauhaus Design Tokens & Typography
- **Paper Surface**: `#F5F2EA` (warm cream paper base)
- **Ink Primary**: `#111111` (solid high-contrast ink for text, borders, and maze walls)
- **Accent Orange**: `#FF4F00` (International Orange, reserved strictly for fills, lines, and active indicators; never used for small text)
- **Hairline Border**: `#D9D4C7` (1px subtle grid separators)
- **Geometry**: Square corners everywhere (`rounded-none`), 1px ink hairlines, hard offset shadow (`4px 4px 0px #111111`) only on the maze canvas and primary RUN button. No blur shadows, no gradients, no glows, no rounded pills.
- **Offline Typography**: Space Grotesk / Manrope bold for display titles; JetBrains Mono for metrics, state badges, and tabular figures. Minimum font size 12px.
- **Strict Text Diet**: Titles $\\le 3$ words, captions $\\le 8$ words. Zero methods paragraphs or jargon on screen (no Bellman, RMSE, BFS, epsilon, regret, residual on screen; details confined to hover tooltips). No em dashes or en dashes.

### 9.3 High-Performance Canvas Rendering
The maze is rendered on an HTML5 2D canvas in `frontend/src/components/Maze.tsx`:
1. **Solid Ink Walls**: Walls are rendered as crisp, solid `#111111` ink blocks on `#F5F2EA` paper floor tiles for maximum contrast and legibility.
2. **Value Tint Heatmap**: Discovered state values render as clean International Orange tints on paper floor tiles: $\\text{rgba}(255, 79, 0, \\text{value} \\times 0.65)$.
3. **Agent Glyph**: A solid orange square agent with sharp corners, accompanied by an `S` marker at the start position and a nested-square goal glyph at `G`.
4. **Fading Trail**: Trajectory history renders as fading orange squares tracing recent movements.
5. **Path Sweep Animation**: Upon convergence, an animated solid ink path line sweeps from start to goal in 1.2 seconds to clearly illustrate the final discovered policy.
6. **Multi-layer Reusability**: The canvas component is reused in the performance report modal with a `layer` prop (`beliefs`, `ground_truth`, `error`) and optional policy direction arrows.

### 9.4 Visual-First Performance Report Screen
When solved, clicking **Report** (or pressing hotkey **R**) opens an unscrollable full-screen overlay with a 200 ms fade transition:
1. **Header Strip**: Solid ink verdict badge (`[ OPTIMAL ]`, `[ NEAR OPTIMAL ]`, `[ NOT OPTIMAL ]`, `[ FAILED ]`), four metric tiles (`Gap 0%`, `Success 100/100`, `Attempts 125`, `Moves 9,820`), a Print button calling `window.print()` with an `@media print` A4 landscape stylesheet, and a Close button (`X`).
2. **Learning Curve Tile**: Orange line plotting steps per attempt on a logarithmic y axis, accompanied by a dashed BFS optimal baseline.
3. **What It Learned (Hero Tile)**: Three interactive mini-maze boards showing `Learned` ($V$), `Truth` ($V^*$), and `Gap` ($|V - V^*|$), with a toggle for policy arrows.
4. **Reliability Tile**: 20 individual seed dots plotted along the attempts axis, streaming live via WebSocket from the headless benchmark runner, with median and 95% bootstrap confidence interval markers.
5. **Under Noise Tile**: SVG line chart comparing greedy policy success under exploratory noise ($\\epsilon \\in [0, 0.3]$) against a uniform random agent baseline.
6. **Knows the Way Tile**: Three horizontal progress bars showing policy accuracy on the optimal path, on visited states ($\\ge 3$ visits), and across all reachable states.

---

"""

new_content = content[:start_idx] + new_sec9 + content[end_idx:]
readme_path.write_text(new_content, encoding="utf-8")
print("README.md Section 9 updated successfully!")
