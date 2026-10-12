# WatchItLearn

A single-page, live reinforcement learning demonstration where an agent explores a maze from scratch and discovers the optimal 28-step shortest path to the goal in under 40 seconds.

---

### What Evaluators See (In 6 Lines)

1. **Starts Knowing Nothing**: The agent begins with zero knowledge of the maze layout or the goal location.
2. **Phase 1 (Watch It Flail)**: The audience watches the first few attempts step-by-step as the agent stumbles randomly and bumps into walls.
3. **Phase 2 (Turbo Learning)**: Training shifts into high gear, simulating hundreds of attempts per second as value ripples outward from the goal.
4. **Heatmap Glow**: Maze squares transition from neutral paper to an orange glow; brighter squares indicate paths leading closer to the goal.
5. **Phase 3 (Optimal Path)**: Once convergence is mathematically confirmed across repeated rollouts, the agent smoothly walks the exact 28-step shortest path.
6. **No Black Boxes**: Built completely from scratch with pure Python and NumPy—no Gym, no PyTorch, no hidden tricks.

---

### The Q-Learning Update Formula

At each step, when the agent takes action $a$ in square $s$, transitions to square $s'$, and receives reward $r$, it updates its score $Q(s, a)$:

$$Q(s, a) \leftarrow Q(s, a) + \alpha \Big[ r + \gamma \max_{a'} Q(s', a') - Q(s, a) \Big]$$

- **$Q(s, a)$**: The expected future reward for choosing action $a$ in square $s$.
- **$\alpha$ (Learning Rate = $0.5$)**: How heavily the agent incorporates newly experienced rewards versus its prior memory.
- **$r$ (Immediate Reward)**: $-0.01$ for each step (penalizing delay/wall bumps) and $+1.0$ upon reaching the goal.
- **$\gamma$ (Discount Factor = $0.97$)**: How much the agent values future rewards compared to immediate outcomes.
- **$\max_{a'} Q(s', a')$**: The highest estimated score achievable from the next square $s'$.
- **$\epsilon$ (Exploration Rate)**: Time-annealed from $1.0$ down to $0.02$ across the 40-second training window.

---

### Hand-Verified 11×11 Maze Layout

- **Start**: `(1, 1)` (top-left, marked `S`)
- **Goal**: `(9, 9)` (bottom-right, marked `G`)
- **Shortest BFS Path**: Exactly **28 steps**
- **Tempting Wrong Turn**: Heading east at `(1, 1)` into a 4-tile dead end `(1, 2)..(1, 5)`
- **Dead Ends**: 3 dead-end branches designed to challenge purely random exploration

```
Row 0:  ###########
Row 1:  #S....#...#   <- (1,1) to (1,5) is a tempting dead-end trap
Row 2:  #.#####.#.#   <- (2,1) downwards begins the true route
Row 3:  #.#.#...#.#
Row 4:  #.#.#.#.#.#
Row 5:  #.#...#.#.#
Row 6:  #.#####.#.#
Row 7:  #.......#.#
Row 8:  #########.#
Row 9:  #........G#   <- Goal G at (9,9)
Row 10: ###########
```

Optimal 28-step trajectory:
$$(1,1) \xrightarrow{6\downarrow} (7,1) \xrightarrow{6\rightarrow} (7,7) \xrightarrow{6\uparrow} (1,7) \xrightarrow{2\rightarrow} (1,9) \xrightarrow{8\downarrow} (9,9) = 28\text{ steps}$$

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
CONVERGENCE BENCHMARK: 20 SEEDS (Target T = 40.0s, BFS = 28)
Seed   | Status       | Attempts   | Time to Converge
0..19  | CONVERGED    | 100 - 125  | 5.3s - 5.4s
Summary: 20 / 20 seeds converged within 40.0s.
Loop Throughput: 4,000 attempts completed in 1.75s (2,291.9 attempts/sec).
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
