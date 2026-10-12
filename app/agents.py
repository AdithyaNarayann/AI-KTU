"""Tabular reinforcement learning agents: Q-Learning and SARSA."""

from typing import Tuple, Dict, Any, List, Optional
import numpy as np

from app.config import (
    GRID_ROWS,
    GRID_COLS,
    NUM_KEY_STATES,
    NUM_STATES,
    NUM_ACTIONS,
    DEFAULT_ALPHA,
    DEFAULT_GAMMA,
)
from app.env import decode_state


class TabularRLAgent:
    """Tabular RL agent supporting live switching between Q-learning and SARSA."""

    def __init__(
        self,
        algo: str = "q_learning",
        alpha: float = DEFAULT_ALPHA,
        gamma: float = DEFAULT_GAMMA,
        seed: Optional[int] = None,
    ):
        self.algo = algo  # "q_learning" or "sarsa"
        self.alpha = float(alpha)
        self.gamma = float(gamma)
        self.rng = np.random.RandomState(seed)

        # Q-table indexed by integer state ID: shape (128, 4)
        self.q_table = np.zeros((NUM_STATES, NUM_ACTIONS), dtype=np.float32)

    def set_seed(self, seed: Optional[int]) -> None:
        """Set random seed for reproducibility."""
        self.rng = np.random.RandomState(seed)

    def set_algo(self, algo: str) -> None:
        """Switch algorithm between q_learning and sarsa without losing learned weights."""
        if algo in ("q_learning", "sarsa"):
            self.algo = algo

    def reset_table(self) -> None:
        """Reset Q-values to zero."""
        self.q_table.fill(0.0)

    def select_action(self, s: int, epsilon: float) -> int:
        """Select action using epsilon-greedy policy with random tie-breaking."""
        if self.rng.rand() < epsilon:
            return int(self.rng.randint(NUM_ACTIONS))
        return self.greedy_action(s)

    def greedy_action(self, s: int) -> int:
        """Select greedy action with random tie-breaking among best actions."""
        q_s = self.q_table[s]
        max_val = np.max(q_s)
        best_indices = np.where(q_s == max_val)[0]
        if len(best_indices) == 1:
            return int(best_indices[0])
        return int(self.rng.choice(best_indices))

    def update_q_learning(
        self, s: int, a: int, r: float, s_next: int, done: bool
    ) -> Dict[str, Any]:
        """Q-learning (off-policy) Bellman update."""
        old_q = float(self.q_table[s, a])
        best_next_q = float(np.max(self.q_table[s_next])) if not done else 0.0
        target = r + (self.gamma * best_next_q if not done else 0.0)
        new_q = old_q + self.alpha * (target - old_q)
        self.q_table[s, a] = new_q

        r_c_k = decode_state(s)
        nr_nc_nk = decode_state(s_next)

        return {
            "s": r_c_k,
            "a": a,
            "r": r,
            "s2": nr_nc_nk,
            "old_q": old_q,
            "target": target,
            "new_q": new_q,
            "algo": "q_learning",
        }

    def update_sarsa(
        self, s: int, a: int, r: float, s_next: int, a_next: int, done: bool
    ) -> Dict[str, Any]:
        """SARSA (on-policy) Bellman update."""
        old_q = float(self.q_table[s, a])
        next_q = float(self.q_table[s_next, a_next]) if not done else 0.0
        target = r + (self.gamma * next_q if not done else 0.0)
        new_q = old_q + self.alpha * (target - old_q)
        self.q_table[s, a] = new_q

        r_c_k = decode_state(s)
        nr_nc_nk = decode_state(s_next)

        return {
            "s": r_c_k,
            "a": a,
            "r": r,
            "s2": nr_nc_nk,
            "old_q": old_q,
            "target": target,
            "new_q": new_q,
            "algo": "sarsa",
        }

    def get_q_max(self) -> List[List[List[float]]]:
        """Return max Q-value per grid cell for key=0 and key=1: shape [2, 8, 8]."""
        # q_table is (128, 4) -> reshape to (2, 8, 8, 4)
        reshaped = self.q_table.reshape((NUM_KEY_STATES, GRID_ROWS, GRID_COLS, NUM_ACTIONS))
        max_q = np.max(reshaped, axis=3)
        return max_q.tolist()

    def get_policy(self) -> List[List[List[int]]]:
        """Return argmax action per grid cell for key=0 and key=1: shape [2, 8, 8]."""
        reshaped = self.q_table.reshape((NUM_KEY_STATES, GRID_ROWS, GRID_COLS, NUM_ACTIONS))
        policy = np.argmax(reshaped, axis=3)
        return policy.tolist()

    def get_cell_q_values(self, r: int, c: int, k: int) -> List[float]:
        """Return the 4 Q-values for a given cell (r, c, k)."""
        s = (k * 64) + (r * 8) + c
        return [float(x) for x in self.q_table[s]]
