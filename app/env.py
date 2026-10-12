"""Grid world environment with precomputed transition tables and BFS solver."""

from collections import deque
from typing import List, Tuple, Optional, Dict
import numpy as np

from app.config import (
    GRID_ROWS,
    GRID_COLS,
    NUM_KEY_STATES,
    NUM_STATES,
    NUM_ACTIONS,
    ACTIONS,
    DEFAULT_ASCII_LAYOUT,
    REWARD_STEP,
    REWARD_LAVA,
    REWARD_GOAL,
    REWARD_KEY_SHAPING,
)


def encode_state(r: int, c: int, k: int) -> int:
    """Encode (row, col, has_key) into an integer state ID in [0, 127]."""
    return (k * 64) + (r * 8) + c


def decode_state(s: int) -> Tuple[int, int, int]:
    """Decode integer state ID into (row, col, has_key)."""
    k = s // 64
    rem = s % 64
    r = rem // 8
    c = rem % 8
    return r, c, k


class GridWorld:
    """Deterministic 8x8 GridWorld with key, door, lava, and precomputed transition tables."""

    def __init__(self, layout: Optional[List[str]] = None, shaping: bool = True):
        self.shaping = shaping
        self.grid: List[List[str]] = [
            list(row) for row in (layout or DEFAULT_ASCII_LAYOUT)
        ]
        self.rows = GRID_ROWS
        self.cols = GRID_COLS

        # Precomputed tables: shape (128, 4)
        self.next_state = np.zeros((NUM_STATES, NUM_ACTIONS), dtype=np.int32)
        self.reward = np.zeros((NUM_STATES, NUM_ACTIONS), dtype=np.float32)
        self.done = np.zeros((NUM_STATES, NUM_ACTIONS), dtype=bool)

        # Track special positions
        self.start_pos: Tuple[int, int] = (1, 1)
        self.goal_pos: Tuple[int, int] = (6, 6)
        self.key_pos: Optional[Tuple[int, int]] = (5, 1)
        self.door_pos: Optional[Tuple[int, int]] = (3, 5)

        self.optimal_len: int = 14
        self.optimal_path: List[Tuple[int, int]] = []

        self._rebuild_all()

    def _locate_entities(self) -> None:
        """Scan grid for S, G, K, D."""
        self.key_pos = None
        self.door_pos = None
        for r in range(self.rows):
            for c in range(self.cols):
                tile = self.grid[r][c]
                if tile == "S":
                    self.start_pos = (r, c)
                elif tile == "G":
                    self.goal_pos = (r, c)
                elif tile == "K":
                    self.key_pos = (r, c)
                elif tile == "D":
                    self.door_pos = (r, c)

    def _rebuild_all(self) -> None:
        """Update entity locations, transition tables, and BFS shortest path."""
        self._locate_entities()
        self._compute_transition_tables()
        self._compute_bfs()

    def set_shaping(self, shaping: bool) -> None:
        """Toggle reward shaping and rebuild transition tables."""
        if self.shaping != shaping:
            self.shaping = shaping
            self._compute_transition_tables()

    def _compute_transition_tables(self) -> None:
        """Precompute next_state[s][a], reward[s][a], and done[s][a] for all s and a."""
        for s in range(NUM_STATES):
            r, c, k = decode_state(s)
            current_tile = self.grid[r][c]

            for a, (dr, dc) in enumerate(ACTIONS):
                # If current state is an absorbing terminal state (Lava or Goal)
                if current_tile in ("L", "G"):
                    self.next_state[s, a] = s
                    self.reward[s, a] = 0.0
                    self.done[s, a] = True
                    continue

                nr, nc = r + dr, c + dc

                # Boundary check: walking off grid stays in place
                if not (0 <= nr < self.rows and 0 <= nc < self.cols):
                    nr, nc = r, c

                dest_tile = self.grid[nr][nc]

                if dest_tile == "#":
                    # Wall: bump and stay in place
                    self.next_state[s, a] = s
                    self.reward[s, a] = REWARD_STEP
                    self.done[s, a] = False

                elif dest_tile == "D" and k == 0:
                    # Locked door: bump and stay in place
                    self.next_state[s, a] = s
                    self.reward[s, a] = REWARD_STEP
                    self.done[s, a] = False

                elif dest_tile == "L":
                    # Lava: fatal terminal step
                    self.next_state[s, a] = encode_state(nr, nc, k)
                    self.reward[s, a] = REWARD_LAVA
                    self.done[s, a] = True

                elif dest_tile == "G":
                    # Goal: successful terminal step
                    self.next_state[s, a] = encode_state(nr, nc, k)
                    self.reward[s, a] = REWARD_GOAL
                    self.done[s, a] = True

                elif dest_tile == "K" and k == 0:
                    # Key pickup: state changes to k=1
                    key_bonus = REWARD_KEY_SHAPING if self.shaping else 0.0
                    self.next_state[s, a] = encode_state(nr, nc, 1)
                    self.reward[s, a] = REWARD_STEP + key_bonus
                    self.done[s, a] = False

                else:
                    # Normal step onto empty, door (with key), key (already held), or start
                    self.next_state[s, a] = encode_state(nr, nc, k)
                    self.reward[s, a] = REWARD_STEP
                    self.done[s, a] = False

    def _compute_bfs(self) -> None:
        """Find the BFS shortest path over (r, c, has_key) state space."""
        sr, sc = self.start_pos
        start_state = (sr, sc, 0)

        # queue elements: (r, c, k, length, path)
        queue: deque = deque([(sr, sc, 0, 0, [(sr, sc)])])
        visited = {start_state}

        best_len: Optional[int] = None
        best_path: List[Tuple[int, int]] = []

        while queue:
            r, c, k, dist, path = queue.popleft()

            if (r, c) == self.goal_pos:
                best_len = dist
                best_path = path
                break

            for dr, dc in ACTIONS:
                nr, nc = r + dr, c + dc
                if not (0 <= nr < self.rows and 0 <= nc < self.cols):
                    continue

                tile = self.grid[nr][nc]
                if tile in ("#", "L"):
                    continue
                if tile == "D" and k == 0:
                    continue

                nk = 1 if (k == 1 or tile == "K") else 0
                next_node = (nr, nc, nk)

                if next_node not in visited:
                    visited.add(next_node)
                    queue.append((nr, nc, nk, dist + 1, path + [(nr, nc)]))

        if best_len is not None:
            self.optimal_len = best_len
            self.optimal_path = best_path
        else:
            # If no path exists (e.g. user blocked goal completely with walls)
            self.optimal_len = -1
            self.optimal_path = []

    def edit_tile(self, r: int, c: int, tile: str) -> None:
        """Edit a grid tile and immediately update transition tables and BFS."""
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return
        if tile not in (".", "#", "L", "K", "D", "S", "G"):
            return

        # If changing start or goal, clear old start/goal tile to '.'
        if tile == "S":
            sr, sc = self.start_pos
            self.grid[sr][sc] = "."
        elif tile == "G":
            gr, gc = self.goal_pos
            self.grid[gr][gc] = "."

        self.grid[r][c] = tile
        self._rebuild_all()

    def get_ascii_grid(self) -> List[str]:
        """Return grid rows as list of strings."""
        return ["".join(row) for row in self.grid]

    def reset(self) -> int:
        """Return the start state ID."""
        sr, sc = self.start_pos
        return encode_state(sr, sc, 0)

    def step(self, s: int, a: int) -> Tuple[int, float, bool]:
        """Execute action a in state s using precomputed tables."""
        return int(self.next_state[s, a]), float(self.reward[s, a]), bool(self.done[s, a])
