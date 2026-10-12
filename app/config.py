"""Configuration, layout, constants, and Pydantic schemas for WatchItLearn."""

from typing import List, Optional, Tuple, Literal, Dict, Any
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Grid & Game Constants
# ---------------------------------------------------------------------------
GRID_ROWS = 8
GRID_COLS = 8
NUM_KEY_STATES = 2  # 0: no key, 1: has key
NUM_STATES = GRID_ROWS * GRID_COLS * NUM_KEY_STATES  # 128
NUM_ACTIONS = 4

# Action indices & coordinate deltas: UP=0, DOWN=1, LEFT=2, RIGHT=3
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
ACTION_ARROWS = ["↑", "↓", "←", "→"]

# Default ASCII Layout (8x8)
# Start S at (1,1), Key K at (5,1), Door D at (3,5), Goal G at (6,6)
# Lava strip LLLL at row 6 cols 2..5
DEFAULT_ASCII_LAYOUT: List[str] = [
    "########",
    "#S...#.#",
    "#.#..#.#",
    "#.#..D.#",
    "#.#..#.#",
    "#K...#.#",
    "#.LLLLG#",
    "########",
]

# Rewards
REWARD_STEP = -0.01
REWARD_LAVA = -1.0
REWARD_GOAL = 1.0
REWARD_KEY_SHAPING = 0.25

MAX_EPISODE_STEPS = 120

# ---------------------------------------------------------------------------
# Learning & Timing Hyperparameters
# ---------------------------------------------------------------------------
DEFAULT_ALPHA = 0.5
DEFAULT_GAMMA = 0.97
DEFAULT_TARGET_SECONDS = 75.0
EXPLORE_RATIO = 0.70  # reaches epsilon floor at 70% of T
EPSILON_START = 1.0
EPSILON_FLOOR = 0.02
EDIT_SHOCK_EPSILON = 0.35
EDIT_SHOCK_DECAY_SEC = 10.0

CONVERGENCE_CHECK_INTERVAL = 25  # episodes
CONVERGENCE_ROLLOUTS = 10
CONVERGENCE_STREAK_REQUIRED = 3

PHASE1_MAX_EPISODES = 8
PHASE1_STEPS_PER_SEC = 12.0
TURBO_FPS = 30.0
BELLMAN_SAMPLE_RATE_HZ = 5.0


# ---------------------------------------------------------------------------
# Pydantic Models for WebSocket and REST APIs
# ---------------------------------------------------------------------------
class AgentState(BaseModel):
    r: int
    c: int
    has_key: bool


class Metrics(BaseModel):
    ret_ma: float
    success_ma: float
    steps_ma: float
    greedy_success: float
    optimal_len: int
    greedy_len: int


class BellmanUpdate(BaseModel):
    s: Tuple[int, int, int]  # (r, c, k)
    a: int
    r: float
    s2: Tuple[int, int, int]  # (nr, nc, nk)
    old_q: float
    target: float
    new_q: float
    algo: str


class FrameMessage(BaseModel):
    type: Literal["frame"] = "frame"
    t_elapsed: float
    t_target: float
    episode: int
    epsilon: float
    algo: str
    agent: AgentState
    trail: List[Tuple[int, int]]
    q_max: List[List[List[float]]]  # shape [2, 8, 8]
    policy: List[List[List[int]]]   # shape [2, 8, 8]
    grid: List[str]
    metrics: Metrics
    update: Optional[BellmanUpdate] = None


class EventMessage(BaseModel):
    type: Literal["event"] = "event"
    event: Literal["converged", "shock", "lap_done", "error"]
    episode: Optional[int] = None
    t_elapsed: Optional[float] = None
    row: Optional[int] = None
    col: Optional[int] = None
    tile: Optional[str] = None
    message: Optional[str] = None


# Client to Server Commands
class StartCommand(BaseModel):
    type: Literal["start"]
    mode: Literal["demo", "free"] = "demo"
    algo: Literal["q_learning", "sarsa"] = "q_learning"
    seed: Optional[int] = 42
    target_seconds: float = DEFAULT_TARGET_SECONDS
    shaping: bool = True


class EditCommand(BaseModel):
    type: Literal["edit"]
    row: int
    col: int
    tile: str


class SetAlgoCommand(BaseModel):
    type: Literal["set_algo"]
    algo: Literal["q_learning", "sarsa"]


class SetSpeedCommand(BaseModel):
    type: Literal["set_speed"]
    speed: float = 1.0


class SimpleCommand(BaseModel):
    type: Literal["pause", "resume", "reset", "victory_lap"]
