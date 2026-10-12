# WatchItLearn

A single-page, live reinforcement learning demonstration where an agent explores a maze from scratch and discovers the optimal shortest path to the goal in the browser. Fits completely on a single unscrollable screen.

---

### Features

1. **Single Unscrollable Page**: Fits seamlessly on any screen with the Maze on the left and controls, live metrics, and progress on the right.
2. **Switchable / Random Mazes**: Select between curated presets on command (`1: Labyrinth`, `2: Classic`, `3: Zig-Zag`, or `🎲 Shuffle`).
3. **Customizable Learning Speed**: Toggle between `Step-by-Step` (100 steps/sec, watch every single move live), `Normal (40s)`, and `Fast (15s)`.
4. **Live Data Metrics**: Shows Optimal Path length, Shortest Run achieved, Cumulative Experience (transitions evaluated), and Exploration ($\epsilon$).
5. **No Black Boxes**: Built completely from scratch with pure Python and NumPy—no Gym, no PyTorch, precomputed integer transition tables executing > 2,000 attempts/second.

---

### The Q-Learning Update Formula

At each step, when the agent takes action $a$ in square $s$, transitions to square $s'$, and receives reward $r$, it updates its score $Q(s, a)$:

$$Q(s, a) \leftarrow Q(s, a) + \alpha \Big[ r + \gamma \max_{a'} Q(s', a') - Q(s, a) \Big]$$

- **$Q(s, a)$**: The expected future reward for choosing action $a$ in square $s$.
- **$\alpha$ (Learning Rate = $0.5$)**: How heavily the agent incorporates newly experienced rewards versus its prior memory.
- **$r$ (Immediate Reward)**: $-0.01$ for each step (penalizing delay/wall bumps) and $+1.0$ upon reaching the goal.
- **$\gamma$ (Discount Factor = $0.97$)**: How much the agent values future rewards compared to immediate outcomes.
- **$\max_{a'} Q(s', a')$**: The highest estimated score achievable from the next square $s'$.
- **$\epsilon$ (Exploration Rate)**: Time-annealed from $1.0$ down to $0.02$ across the training window.

---

### Maze Presets

- **1: Labyrinth (32 steps)**: Serpentine interior staircase with 8 corners and 4 dead-end traps.
- **2: Classic (28 steps)**: Perimeter route with a 4-tile dead-end trap immediately right of the start.
- **3: Zig-Zag (32 steps)**: Left-side double S-chicane with 4 dead ends.

```
Row 0:  ###########
Row 1:  #S....#...#   <- (1,1) to (1,5) is a tempting dead-end trap
Row 2:  #.#####.#.#   <- (2,1) downwards begins the true route
Row 3:  #.#...#.#.#   <- (3,3) to (3,5) interior chicane
Row 4:  #.#.#.#.#.#
Row 5:  #.#.#...#.#   <- (5,5) to (5,7) chicane
Row 6:  #.#.#.#.#.#
Row 7:  #...#.###.#   <- (7,1) to (7,3) lower turn, wall blocks straight route
Row 8:  #########.#
Row 9:  #........G#   <- Goal G at (9,9)
Row 10: ###########
```

Optimal 32-step trajectory:
$$(1,1) \xrightarrow{6\downarrow} (7,1) \xrightarrow{2\rightarrow} (7,3) \xrightarrow{4\uparrow} (3,3) \xrightarrow{2\rightarrow} (3,5) \xrightarrow{2\downarrow} (5,5) \xrightarrow{2\rightarrow} (5,7) \xrightarrow{4\uparrow} (1,7) \xrightarrow{2\rightarrow} (1,9) \xrightarrow{8\downarrow} (9,9) = 32\text{ steps}$$

---

### Setup & Requirements

- Python 3.11+
- Node.js 18+ (for frontend build)

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Build the frontend static bundle
cd frontend
npm install
npm run build
cd ..
```

---

### Run (Single-Command Demo)

Run the backend server; it serves both the WebSocket training stream and the built frontend application on port 8000:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open your browser to:
```
http://localhost:8000
```
Press **RUN** (or hit the **Spacebar**) to watch the agent learn live.

---

### Benchmark & Automated Tests

Run the full automated test suite verifying environment mechanics, optimal path calculation, loop throughput (> 2,000 attempts/sec), and 20-seed convergence:

```bash
pytest -s tests/
```

**Verified Test Output**:
```
CONVERGENCE BENCHMARK: 20 SEEDS (Target T = 40.0s, BFS = 32)
Seed   | Status       | Attempts   | Time to Converge
0..19  | CONVERGED    | 125 - 175  | 5.4s - 5.6s
Summary: 20 / 20 seeds converged within 40.0s.
Loop Throughput: 4,000 attempts completed in 1.83s (2,185.0 attempts/sec).
```

---

### Offline Fallback Mode

To re-record the golden run fixture:
```bash
python -m app.record
```

To load and playback the recorded run without running the backend training loop, visit:
```
http://localhost:8000/?replay=1
```
