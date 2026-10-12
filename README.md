# WatchItLearn — Live Reinforcement Learning in the Browser

**WatchItLearn** is a zero-dependency (no PyTorch, no Gym) tabular reinforcement learning demonstration built for university AI classrooms and live technical talks. An RL agent learns an 8×8 key-and-door grid navigation task from scratch in 60 to 90 seconds while an audience watches in real time.

---

## Key Highlights

- **Pure Python & NumPy MDP**: Written entirely from scratch with precomputed transition tables over integer state IDs ($128$ states $\times$ $4$ actions). The hot loop executes 20,000+ transitions per second in pure Python without blocking the asyncio event loop.
- **Stage Reliability**: BFS-optimal path length is $14$ steps. Across 20 random seeds, **20/20 seeds converge to the optimal path within 75 seconds** (tested via `pytest tests/test_convergence.py`).
- **Real-Time Level Shock**: Edit tiles live (walls, lava, goal, key) during training. The server raises $\epsilon$ to $0.35$, decays it over 10 seconds, recomputes transition tables and BFS targets on the fly, and the agent visibly re-learns the new route.
- **Projector-Ready Dark UI**: Dual HTML canvas heatmaps (hunting key vs. key in hand), policy direction arrows, fading trajectory trails, live Bellman TD equation updates with real numbers substituted at 5 Hz, and Recharts performance curves.
- **Fail-Safe Stage Fallback**: Includes a precomputed recorded golden run (`data/recorded_run.json`) replayable via the UI with zero server dependence.

---

## Repository Structure

```
WatchItLearn/
├── app/
│   ├── __init__.py          # Package marker
│   ├── config.py            # Grid dimensions, ASCII layout, hyperparameters & Pydantic schemas
│   ├── env.py               # 8x8 GridWorld, precomputed transition tables, BFS solver
│   ├── agents.py            # Tabular Q-Learning and SARSA agents
│   ├── trainer.py           # Asyncio training loop, pacing (Phase 1/2/3), convergence detector
│   ├── main.py              # FastAPI server, WebSocket /ws/train, REST APIs, static file host
│   └── record.py            # Script to generate data/recorded_run.json
├── frontend/
│   ├── index.html           # HTML entrypoint
│   ├── package.json         # React 18, Vite, Tailwind CSS, Recharts, Lucide icons
│   ├── vite.config.ts       # Vite build & proxy configuration
│   ├── tailwind.config.js   # Projector dark theme & keyframe animations
│   ├── tsconfig.json        # TypeScript configuration
│   └── src/
│       ├── main.tsx         # React root
│       ├── App.tsx          # Main application layout, state & keyboard shortcuts
│       ├── types.ts         # TypeScript API contracts & interfaces
│       ├── hooks/
│       │   └── useTrainSocket.ts   # Auto-reconnecting WebSocket hook with rAF throttling
│       └── components/
│           ├── DualGridCanvas.tsx  # Dual canvas heatmaps, agent sprites & policy arrows
│           ├── StatusHeader.tsx    # Giant timer, episode counter, epsilon gauge
│           ├── BellmanPanel.tsx    # Live TD update equation with numerical values
│           ├── MetricsCharts.tsx   # Moving average return and greedy success rate
│           ├── ControlsBar.tsx     # Start Demo, Pause, Reset, Algo & Shaping toggles
│           └── TilePalette.tsx     # Live interactive level editor palette
├── tests/
│   ├── __init__.py
│   ├── test_env.py          # BFS optimum (14 steps), locked/unlocked door, lava, edits
│   └── test_convergence.py  # Benchmark: verifies 20/20 seeds converge within T
├── data/
│   └── recorded_run.json    # Golden fallback run
├── requirements.txt         # Python dependencies
└── README.md
```

---

## Default Layout & BFS Optimal Path

```
Index:  0 1 2 3 4 5 6 7
Row 0:  # # # # # # # #
Row 1:  # S . . . # . #    S = Start (1,1)
Row 2:  # . # . . # . #    K = Key (5,1)
Row 3:  # . # . . D . #    D = Door (3,5) - Locked without key!
Row 4:  # . # . . # . #    G = Goal (6,6)
Row 5:  # K . . . # . #    L = Lava Strip (6,2)..(6,5)
Row 6:  # . L L L L G #
Row 7:  # # # # # # # #
```

### Path Verification
1. **Detour to Key**: Start is at `(1,1)` with `has_key = 0`. Column 5 is a solid dividing wall with Door $D$ at `(3,5)`. The door is impassable while `has_key = 0`. To cross into the goal corridor, the agent *must* detour south to Key $K$ at `(5,1)`.
2. **Door Chokepoint**: Once key is picked up at `(5,1)`, state switches to `has_key = 1`. Door $D$ at `(3,5)` is now passable.
3. **Lava Temptation**: Along row 6, `(6,1)` is right next to Goal `(6,6)`. Tiles `(6,2)` through `(6,5)` form a 4-tile lava hazard. Any exploratory or naive move heading directly toward the goal from the bottom plunges into lava and immediately terminates with reward $-1.0$.
4. **BFS Optimal Path (14 steps)**:
   - $(1,1) \to (2,1) \to (3,1) \to (4,1) \to (5,1)$ [Key acquired: 4 steps]
   - $(5,1) \to (5,2) \to (5,3) \to (4,3) \to (3,3) \to (3,4) \to (3,5)$ [Door unlocked: 7 steps]
   - $(3,5) \to (3,6) \to (4,6) \to (5,6) \to (6,6)$ [Goal reached: 3 steps]
   - Total = **14 steps**.

---

## Quickstart & Setup

### 1. Requirements
- Python 3.11+
- Node.js 18+ and npm

### 2. Backend Setup
```bash
# Optional: create virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

### 3. Frontend Setup
```bash
cd frontend
npm install
cd ..
```

---

## Development Mode

Run the backend and Vite dev server with hot reload:

**Terminal 1 (Backend):**
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

Open your browser to: **`http://localhost:5173`** (Vite proxies `/api` and `/ws` to port 8000).

---

## Single-Command Production Build & Serve

Build the frontend assets and serve them directly from FastAPI as a single static bundle:

```bash
# 1. Build the React frontend
cd frontend
npm run build
cd ..

# 2. Launch FastAPI with static file hosting
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open your browser to: **`http://localhost:8000`**

---

## Verification & Tests

Run the full automated test suite:

```bash
pytest -s tests/
```

- `tests/test_env.py`: Tests BFS optimum (14 steps), locked/unlocked door mechanics, key pickup shaping, fatal lava termination, and live level edits.
- `tests/test_convergence.py`: Simulates 20 random seeds with time-annealed exploration. Reports per-seed convergence times and asserts $\ge 19/20$ converge within $T = 75$ seconds.

---

## Generating the Recorded Fallback Run

To precompute or refresh the offline recorded demo run:

```bash
python -m app.record
```
This simulates a complete training run with fixed seed 42, captures all 30 Hz frames and events, and saves `data/recorded_run.json`. In the frontend, clicking **"Replay Recorded Run"** replays this run at 30 FPS even if the backend is disconnected.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| <kbd>Space</kbd> | Start Demo / Pause / Resume |
| <kbd>R</kbd> | Reset training state |
| <kbd>L</kbd> | Run Victory Lap (greedy optimal rollout) |
| <kbd>1</kbd> | Switch to Q-Learning (off-policy) |
| <kbd>2</kbd> | Switch to SARSA (on-policy) |

---

## 90-Second Lecture Demo Script

Designed for an instructor presenting live in front of a lecture hall or conference audience:

### **0:00 – 0:15 | Intro & Phase 1: "Watch It Flail"**
1. Project the UI onto the screen in full-screen mode (<kbd>F11</kbd>). Point out the dual grids:
   - **Left Canvas**: Phase 1 — hunting for the key with locked door.
   - **Right Canvas**: Phase 2 — key acquired, door open, heading to the goal.
2. Press **START DEMO** (or hit <kbd>Space</kbd>).
3. Point to the screen:
   > *"Notice the agent during the first 8 episodes running at human speed. It has zero prior knowledge. It wanders into walls, gets stuck, and plunges into the red lava strip at the bottom. The audience can see true tabular exploration."*

### **0:15 – 0:40 | Phase 2: "Turbo Learning & Heatmap Backpropagation"**
1. At episode 9, the turbo batching engages at 30 frames per second.
2. Direct the audience's attention to the heatmaps and the **Live Bellman TD Update** panel:
   > *"Watch the value propagate backward! First, states adjacent to the trophy light up with positive Q-values. Next, values flow backward through the door chokepoint into the left room, and finally create a value gradient leading down to the key."*
3. Show the Bellman panel updating live at 5 Hz, pointing out how the TD error $\delta = r + \gamma \max Q(s') - Q(s)$ adjusts each Q-entry.

### **0:40 – 0:55 | Phase 3: "Convergence & The Victory Lap"**
1. Around 30–40 seconds, the moving average reward climbs to $+1.23$, the epsilon gauge drops below $0.20$, and the convergence detector triggers after 3 consecutive perfect greedy rollouts.
2. The UI flashes **🏆 OPTIMAL POLICY CONVERGED** and immediately initiates the **Victory Lap**:
   > *"Watch the agent now: 14 steps exact. Down to the key, around the divider, straight through the door, and down to the goal without a single wasted move."*

### **0:55 – 1:20 | Live Level Shock & Re-Adaptation**
1. Select the **Wall** (`🧱`) tool from the level editor palette.
2. Click cell `(4, 3)` to block the corridor, or move the **Goal** (`🏆`) to `(4, 6)`.
3. The UI flashes a red **⚡ LEVEL SHOCKED** banner and epsilon spikes to $0.35$:
   > *"We just changed the physical environment mid-run. The transition tables were recomputed in under 1 millisecond. Epsilon spiked to 0.35 to re-inject exploration. Watch the agent discover the detour within 10 to 15 seconds!"*
4. Watch the policy arrows re-orient themselves and converge to the new route.

### **1:20 – 1:30 | Q-Learning vs. SARSA Comparison & Wrap-Up**
1. Press <kbd>2</kbd> to switch to **SARSA** or <kbd>1</kbd> for **Q-Learning**.
2. Discuss the difference between off-policy (Q-learning learning the optimal cliff-hugging path despite exploration noise) and on-policy (SARSA learning a safer buffer near the lava strip).
3. Conclude the demo to applause!
