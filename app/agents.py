"""Tabular Q-Learning agent with normalized value extraction."""

from typing import List, Optional
import numpy as np

from app.config import (
    MAZE_ROWS,
    MAZE_COLS,
    NUM_STATES,
    NUM_ACTIONS,
    ALPHA,
    GAMMA,
)


class QLearningAgent:
    """Tabular Q-Learning agent."""

    def __init__(
        self,
        alpha: float = ALPHA,
        gamma: float = GAMMA,
        seed: Optional[int] = None,
    ):
        self.alpha = float(alpha)
        self.gamma = float(gamma)
        self.rng = np.random.RandomState(seed)

        # Q-table: (121, 4)
        self.q_table = np.zeros((NUM_STATES, NUM_ACTIONS), dtype=np.float32)

    def set_seed(self, seed: Optional[int]) -> None:
        """Reset RNG with fixed seed for reproducible demo."""
        self.rng = np.random.RandomState(seed)

    def reset_table(self) -> None:
        """Clear Q-table to zeros."""
        self.q_table.fill(0.0)

    def select_action(self, s: int, epsilon: float) -> int:
        """Select action via epsilon-greedy policy with tie-breaking."""
        if self.rng.rand() < epsilon:
            return int(self.rng.randint(NUM_ACTIONS))
        return self.greedy_action(s)

    def greedy_action(self, s: int) -> int:
        """Return greedy argmax action with random tie-breaking."""
        q_s = self.q_table[s]
        max_v = np.max(q_s)
        best = np.where(q_s == max_v)[0]
        if len(best) == 1:
            return int(best[0])
        return int(self.rng.choice(best))

    def update(self, s: int, a: int, r: float, s_next: int, done: bool) -> None:
        """Q-Learning Bellman update."""
        old_q = float(self.q_table[s, a])
        best_next = float(np.max(self.q_table[s_next])) if not done else 0.0
        target = r + self.gamma * best_next
        self.q_table[s, a] = old_q + self.alpha * (target - old_q)

    def get_normalized_values(self) -> List[List[float]]:
        """Return 11x11 grid of max Q values normalized to [0, 1] so tiles near goal glow brightest."""
        max_q = np.max(self.q_table, axis=1).reshape((MAZE_ROWS, MAZE_COLS))
        # Zero out unvisited / non-positive values for clean contrast
        clamped = np.maximum(0.0, max_q)
        max_val = np.max(clamped)
        if max_val > 1e-4:
            norm = clamped / max_val
        else:
            norm = np.zeros_like(clamped)
        return [[round(float(v), 3) for v in row] for row in norm]

    def get_best_actions(self) -> List[List[int]]:
        """Return 11x11 grid of argmax actions in 0..3."""
        best_a = np.argmax(self.q_table, axis=1).reshape((MAZE_ROWS, MAZE_COLS))
        return best_a.tolist()
