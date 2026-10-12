"""Configuration, constants, 11x11 maze layout, and schemas for WatchItLearn."""

from typing import List, Tuple, Optional, Literal
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Maze Geometry & Constants
# ---------------------------------------------------------------------------
MAZE_ROWS = 11
MAZE_COLS = 11
NUM_STATES = MAZE_ROWS * MAZE_COLS  # 121
NUM_ACTIONS = 4

# Action deltas: 0: UP, 1: DOWN, 2: LEFT, 3: RIGHT
ACTION_UP = 0
ACTION_DOWN = 1
ACTION_LEFT = 2
ACTION_RIGHT = 3

ACTIONS: List[Tuple[int, int]] = [
    (-1, 0),  # 0: UP
    (1, 0),   # 1: DOWN
    (0, -1),  # 2: LEFT
    (0, 1),   # 3: RIGHT
]

ACTION_NAMES = ["UP", "DOWN", "LEFT", "RIGHT"]

# 11x11 Tile Maze: Start at (1,1), Goal at (9,9)
# Shortest BFS optimal path: 28 steps
# Tempting wrong turn: heading east at (1,1) into a 4-tile dead end (1,2..5)
# 3 dead-end branches: (1,2..5), interior cul-de-sac from (7,3), and row 9 left branch
MAZE_ASCII: List[str] = [
    "###########",
    "#S....#...#",
    "#.#####.#.#",
    "#.#.#...#.#",
    "#.#.#.#.#.#",
    "#.#...#.#.#",
    "#.#####.#.#",
    "#.......#.#",
    "#########.#",
    "#........G#",
    "###########",
]

# Rewards & Truncation
REWARD_STEP = -0.01
REWARD_GOAL = 1.0
MAX_ATTEMPT_STEPS = 200

# Learning Hyperparameters
ALPHA = 0.5
GAMMA = 0.97
TARGET_SECONDS = 40.0
EXPLORE_RATIO = 0.70  # reaches floor at 70% of T (28s)
EPSILON_START = 1.0
EPSILON_FLOOR = 0.02

# Pacing & Convergence
PHASE1_MAX_ATTEMPTS = 5
PHASE1_STEPS_PER_SEC = 10.0
TURBO_FPS = 25.0
FINAL_WALK_STEPS_PER_SEC = 12.0

CONVERGENCE_CHECK_INTERVAL = 25
CONVERGENCE_ROLLOUTS = 10
CONVERGENCE_STREAK_REQUIRED = 3
MAX_TIMEOUT_SECONDS = TARGET_SECONDS * 1.5  # 60s


# ---------------------------------------------------------------------------
# WebSocket Frame Schemas
# ---------------------------------------------------------------------------
StageType = Literal["idle", "exploring", "learning", "converging", "solved"]


class ResultData(BaseModel):
    steps: int
    optimal: int


class ServerFrame(BaseModel):
    stage: StageType
    t: float
    T: float
    attempt: int
    random_pct: int
    agent: Tuple[int, int]
    trail: List[Tuple[int, int]]
    value: List[List[float]]  # max Q per tile, normalized 0..1
    best: List[List[int]]     # best action 0..3 per tile
    steps_history: List[int]
    result: Optional[ResultData] = None
