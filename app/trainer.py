"""Pacing manager, convergence detector, and WebSocket frame generator for WatchItLearn."""

import asyncio
import time
from typing import Callable, Optional, Dict, Any, List, Tuple
from collections import deque
import numpy as np

from app.config import (
    TARGET_SECONDS,
    EXPLORE_RATIO,
    EPSILON_START,
    EPSILON_FLOOR,
    MAX_ATTEMPT_STEPS,
    PHASE1_MAX_ATTEMPTS,
    PHASE1_STEPS_PER_SEC,
    TURBO_FPS,
    FINAL_WALK_STEPS_PER_SEC,
    CONVERGENCE_CHECK_INTERVAL,
    CONVERGENCE_ROLLOUTS,
    CONVERGENCE_STREAK_REQUIRED,
    MAX_TIMEOUT_SECONDS,
    StageType,
)
from app.env import MazeWorld, decode


class Trainer:
    """Manages the Q-learning lifecycle, pacing, convergence, and 25 Hz frame streaming."""

    def __init__(
        self,
        env: MazeWorld,
        agent: Any,
        broadcast_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ):
        self.env = env
        self.agent = agent
        self.broadcast_callback = broadcast_callback

        self.stage: StageType = "idle"
        self.t: float = 0.0
        self.T: float = TARGET_SECONDS
        self.attempt: int = 0
        self.steps_history: List[int] = []

        self.consecutive_converged: int = 0
        self.is_solved: bool = False
        self.final_result: Optional[Dict[str, int]] = None

        self._loop_task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    async def broadcast(self, payload: Dict[str, Any]) -> None:
        """Send message through WebSocket callback."""
        if self.broadcast_callback:
            try:
                res = self.broadcast_callback(payload)
                if asyncio.iscoroutine(res):
                    await res
            except Exception:
                pass

    def compute_epsilon(self) -> float:
        """Linear time-annealed epsilon schedule."""
        t_explore = self.T * EXPLORE_RATIO
        if t_explore <= 0 or self.t >= t_explore:
            return EPSILON_FLOOR
        prog = self.t / t_explore
        eps = EPSILON_START - prog * (EPSILON_START - EPSILON_FLOOR)
        return float(max(EPSILON_FLOOR, min(EPSILON_START, eps)))

    def _determine_stage(self, eps: float) -> StageType:
        """Derive plain-English stage from current epsilon and convergence state."""
        if self.stage == "idle":
            return "idle"
        if self.is_solved:
            return "solved"
        if eps > 0.60:
            return "exploring"
        if eps > 0.15:
            return "learning"
        return "converging"

    def _get_downsampled_history(self) -> List[int]:
        """Downsample steps_history to at most 120 points for clean, fast frontend rendering."""
        if len(self.steps_history) <= 120:
            return self.steps_history
        # Uniform subsample
        indices = np.linspace(0, len(self.steps_history) - 1, 120, dtype=int)
        return [self.steps_history[i] for i in indices]

    def build_frame(
        self,
        agent_r: int,
        agent_c: int,
        trail: List[Tuple[int, int]],
    ) -> Dict[str, Any]:
        """Construct server frame at ~25 Hz."""
        eps = self.compute_epsilon()
        random_pct = int(round(eps * 100))
        stage = self._determine_stage(eps)

        frame: Dict[str, Any] = {
            "stage": stage,
            "t": round(self.t, 2),
            "T": self.T,
            "attempt": self.attempt,
            "random_pct": random_pct,
            "agent": [agent_r, agent_c],
            "trail": trail,
            "value": self.agent.get_normalized_values(),
            "best": self.agent.get_best_actions(),
            "steps_history": self._get_downsampled_history(),
        }
        if self.is_solved and self.final_result:
            frame["result"] = self.final_result
        return frame

    def run_convergence_check(self) -> bool:
        """Run 10 greedy rollouts to check for 100% optimal BFS path."""
        successes = 0
        lengths = []
        start_s = self.env.reset()

        for _ in range(CONVERGENCE_ROLLOUTS):
            s = start_s
            ep_len = 0
            reached_goal = False

            for _ in range(MAX_ATTEMPT_STEPS):
                a = self.agent.greedy_action(s)
                next_s, _, done = self.env.step(s, a)
                ep_len += 1
                if next_s == self.env.goal_state:
                    reached_goal = True
                    break
                if done:
                    break
                s = next_s

            if reached_goal:
                successes += 1
                lengths.append(ep_len)

        is_optimal = (
            successes == CONVERGENCE_ROLLOUTS
            and len(lengths) == CONVERGENCE_ROLLOUTS
            and all(l == self.env.optimal_len for l in lengths)
        )

        if is_optimal:
            self.consecutive_converged += 1
            if self.consecutive_converged >= CONVERGENCE_STREAK_REQUIRED:
                self.is_solved = True
                self.final_result = {
                    "steps": self.env.optimal_len,
                    "optimal": self.env.optimal_len,
                }
                return True
        else:
            self.consecutive_converged = 0

        return False

    async def run(self, seed: Optional[int] = 42) -> None:
        """Start a new learning run."""
        await self.reset()

        self.stage = "exploring"
        self.t = 0.0
        self.attempt = 0
        self.steps_history = []
        self.consecutive_converged = 0
        self.is_solved = False
        self.final_result = None

        self.agent.set_seed(seed)
        self.agent.reset_table()

        self._stop_event.clear()
        self._loop_task = asyncio.create_task(self._train_loop())

    async def reset(self) -> None:
        """Reset trainer back to idle state."""
        self._stop_event.set()
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        self._loop_task = None

        self.stage = "idle"
        self.t = 0.0
        self.attempt = 0
        self.steps_history = []
        self.consecutive_converged = 0
        self.is_solved = False
        self.final_result = None
        self.agent.reset_table()

        # Emit idle frame
        sr, sc = self.env.start_pos
        frame = self.build_frame(sr, sc, [(sr, sc)])
        frame["stage"] = "idle"
        await self.broadcast(frame)

    async def _train_loop(self) -> None:
        """Master training loop with Phase 1 flailing, Phase 2 turbo, and Phase 3 final walk."""
        try:
            start_wall = time.monotonic()

            # ---------------------------------------------------------------
            # Phase 1: Visible Flailing (Attempts 1 to 5)
            # ---------------------------------------------------------------
            for att_idx in range(1, PHASE1_MAX_ATTEMPTS + 1):
                if self._stop_event.is_set():
                    return

                self.attempt += 1
                s = self.env.reset()
                r, c = decode(s)
                trail = [(r, c)]
                steps = 0
                step_dt = 1.0 / PHASE1_STEPS_PER_SEC

                # Limit visible flailing per early attempt to ~15-20 steps so it takes ~5-7s total
                max_visible_steps = 20

                while steps < max_visible_steps and not self._stop_event.is_set():
                    self.t = time.monotonic() - start_wall
                    eps = self.compute_epsilon()
                    a = self.agent.select_action(s, eps)
                    next_s, reward, done = self.env.step(s, a)
                    steps += 1

                    self.agent.update(s, a, reward, next_s, done)
                    nr, nc = decode(next_s)
                    trail.append((nr, nc))

                    frame = self.build_frame(nr, nc, trail)
                    await self.broadcast(frame)

                    s = next_s
                    if done:
                        break

                    await asyncio.sleep(step_dt)

                self.steps_history.append(steps)

            # ---------------------------------------------------------------
            # Phase 2: Turbo Learning (25 Hz Frames)
            # ---------------------------------------------------------------
            target_frame_dt = 1.0 / TURBO_FPS  # 0.04s

            while not self._stop_event.is_set() and not self.is_solved:
                frame_start = time.monotonic()
                self.t = frame_start - start_wall

                # Timeout guard (1.5 * T = 60s)
                if self.t >= MAX_TIMEOUT_SECONDS:
                    await self.broadcast({"type": "error", "message": "Failed to converge within timeout."})
                    self.stage = "idle"
                    return

                # Ramp batch size from 2 up to 200 based on progress
                prog = min(1.0, max(0.0, self.t / self.T))
                batch_size = int(2 + 150 * prog)

                latest_trail: List[Tuple[int, int]] = []
                last_r, last_c = self.env.start_pos
                eps = self.compute_epsilon()

                for _ in range(batch_size):
                    self.attempt += 1
                    s = self.env.reset()
                    trail_attempt = [decode(s)]
                    steps = 0

                    for _ in range(MAX_ATTEMPT_STEPS):
                        a = self.agent.select_action(s, eps)
                        next_s, reward, done = self.env.step(s, a)
                        steps += 1
                        self.agent.update(s, a, reward, next_s, done)
                        trail_attempt.append(decode(next_s))
                        s = next_s
                        if done:
                            break

                    self.steps_history.append(steps)
                    latest_trail = trail_attempt
                    last_r, last_c = trail_attempt[-1]

                    # Convergence check every 25 attempts
                    if self.attempt % CONVERGENCE_CHECK_INTERVAL == 0:
                        if self.run_convergence_check():
                            break

                # Broadcast 25 Hz frame
                frame = self.build_frame(last_r, last_c, latest_trail)
                await self.broadcast(frame)

                if self.is_solved:
                    break

                duration = time.monotonic() - frame_start
                sleep_time = max(0.001, target_frame_dt - duration)
                await asyncio.sleep(sleep_time)

            # ---------------------------------------------------------------
            # Phase 3: Final Solved Walk (~12 steps per second)
            # ---------------------------------------------------------------
            if self.is_solved:
                await asyncio.sleep(0.3)
                await self._run_final_walk()

        except asyncio.CancelledError:
            pass
        except Exception as e:
            await self.broadcast({"type": "error", "message": str(e)})

    async def _run_final_walk(self) -> None:
        """Stream a visible victory walk following the optimal path."""
        self.stage = "solved"
        start_s = self.env.reset()
        r, c = decode(start_s)
        trail: List[Tuple[int, int]] = [(r, c)]
        s = start_s
        step_dt = 1.0 / FINAL_WALK_STEPS_PER_SEC

        while not self._stop_event.is_set():
            a = self.agent.greedy_action(s)
            next_s, _, done = self.env.step(s, a)
            nr, nc = decode(next_s)
            trail.append((nr, nc))

            frame = self.build_frame(nr, nc, trail)
            frame["stage"] = "solved"
            await self.broadcast(frame)

            s = next_s
            if s == self.env.goal_state or done:
                break

            await asyncio.sleep(step_dt)

        # Final persistent frame
        await asyncio.sleep(0.2)
        final_frame = self.build_frame(self.env.goal_pos[0], self.env.goal_pos[1], trail)
        final_frame["stage"] = "solved"
        await self.broadcast(final_frame)
