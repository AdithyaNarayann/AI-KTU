"""Training loop and pacing manager for WatchItLearn."""

import asyncio
import time
from typing import Callable, Optional, Dict, Any, List, Tuple
from collections import deque
import numpy as np

from app.config import (
    DEFAULT_TARGET_SECONDS,
    EXPLORE_RATIO,
    EPSILON_START,
    EPSILON_FLOOR,
    EDIT_SHOCK_EPSILON,
    EDIT_SHOCK_DECAY_SEC,
    CONVERGENCE_CHECK_INTERVAL,
    CONVERGENCE_ROLLOUTS,
    CONVERGENCE_STREAK_REQUIRED,
    PHASE1_MAX_EPISODES,
    PHASE1_STEPS_PER_SEC,
    TURBO_FPS,
    BELLMAN_SAMPLE_RATE_HZ,
    MAX_EPISODE_STEPS,
    AgentState,
    Metrics,
    BellmanUpdate,
    FrameMessage,
    EventMessage,
)
from app.env import GridWorld, decode_state, encode_state
from app.agents import TabularRLAgent


class Trainer:
    """Manages the RL training lifecycle, pacing, convergence detection, and frame dispatch."""

    def __init__(
        self,
        env: GridWorld,
        agent: TabularRLAgent,
        broadcast_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ):
        self.env = env
        self.agent = agent
        self.broadcast_callback = broadcast_callback

        # Lifecycle State: IDLE, RUNNING, PAUSED, CONVERGED, VICTORY_LAP
        self.state: str = "IDLE"
        self.mode: str = "demo"  # "demo" or "free"
        self.speed_multiplier: float = 1.0

        # Timing
        self.t_target: float = DEFAULT_TARGET_SECONDS
        self.t_elapsed: float = 0.0
        self.last_clock_time: float = 0.0

        # Level edit shock tracking
        self.last_edit_time: Optional[float] = None

        # Episode & Step counters
        self.episode_count: int = 0
        self.total_steps: int = 0

        # Moving Averages (window 20)
        self.recent_returns: deque = deque(maxlen=20)
        self.recent_successes: deque = deque(maxlen=20)
        self.recent_steps: deque = deque(maxlen=20)

        # Convergence state
        self.greedy_success_rate: float = 0.0
        self.greedy_path_len: int = 0
        self.consecutive_converged_checks: int = 0
        self.is_converged: bool = False

        # Sampling Bellman updates at ~5 Hz
        self.last_bellman_sample_time: float = 0.0
        self.latest_bellman_update: Optional[Dict[str, Any]] = None

        # Async task handles
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
        """Compute time-annealed epsilon with edit shock overlay."""
        t_explore = self.t_target * EXPLORE_RATIO
        if t_explore <= 0:
            base_eps = EPSILON_FLOOR
        else:
            progress = min(1.0, max(0.0, self.t_elapsed / t_explore))
            base_eps = EPSILON_START - progress * (EPSILON_START - EPSILON_FLOOR)
            base_eps = max(EPSILON_FLOOR, base_eps)

        # Level edit shock
        if self.last_edit_time is not None:
            time_since_shock = self.t_elapsed - self.last_edit_time
            if 0 <= time_since_shock < EDIT_SHOCK_DECAY_SEC:
                shock_decay = 1.0 - (time_since_shock / EDIT_SHOCK_DECAY_SEC)
                shock_eps = EDIT_SHOCK_EPSILON * shock_decay
                return float(max(base_eps, shock_eps))
            else:
                self.last_edit_time = None

        return float(base_eps)

    def _sample_bellman_if_due(self, update_dict: Dict[str, Any]) -> None:
        """Sample Bellman update if at least ~200ms has elapsed since last sample."""
        now = time.monotonic()
        if now - self.last_bellman_sample_time >= (1.0 / BELLMAN_SAMPLE_RATE_HZ):
            self.latest_bellman_update = update_dict
            self.last_bellman_sample_time = now

    def _get_current_metrics(self) -> Dict[str, Any]:
        """Compute metrics dictionary."""
        ret_ma = float(np.mean(self.recent_returns)) if self.recent_returns else 0.0
        succ_ma = float(np.mean(self.recent_successes)) if self.recent_successes else 0.0
        steps_ma = float(np.mean(self.recent_steps)) if self.recent_steps else 0.0

        return {
            "ret_ma": round(ret_ma, 3),
            "success_ma": round(succ_ma, 3),
            "steps_ma": round(steps_ma, 1),
            "greedy_success": round(self.greedy_success_rate, 2),
            "optimal_len": self.env.optimal_len,
            "greedy_len": self.greedy_path_len,
        }

    def _build_frame_dict(
        self,
        agent_r: int,
        agent_c: int,
        agent_k: bool,
        trail: List[Tuple[int, int]],
    ) -> Dict[str, Any]:
        """Construct full JSON frame for client."""
        return {
            "type": "frame",
            "t_elapsed": round(self.t_elapsed, 2),
            "t_target": round(self.t_target, 2),
            "episode": self.episode_count,
            "epsilon": round(self.compute_epsilon(), 3),
            "algo": self.agent.algo,
            "agent": {"r": agent_r, "c": agent_c, "has_key": agent_k},
            "trail": trail,
            "q_max": self.agent.get_q_max(),
            "policy": self.agent.get_policy(),
            "grid": self.env.get_ascii_grid(),
            "metrics": self._get_current_metrics(),
            "update": self.latest_bellman_update,
        }

    # -----------------------------------------------------------------------
    # Convergence Detector
    # -----------------------------------------------------------------------
    def run_convergence_check(self) -> bool:
        """Run 10 greedy rollouts to evaluate current policy."""
        successes = 0
        lengths = []
        start_s = self.env.reset()

        for _ in range(CONVERGENCE_ROLLOUTS):
            s = start_s
            ep_len = 0
            ep_success = False

            for _ in range(MAX_EPISODE_STEPS):
                a = self.agent.greedy_action(s)
                next_s, _, done = self.env.step(s, a)
                ep_len += 1
                r, c, _ = decode_state(next_s)

                if (r, c) == self.env.goal_pos:
                    ep_success = True
                    break
                if done:
                    break
                s = next_s

            if ep_success:
                successes += 1
                lengths.append(ep_len)

        self.greedy_success_rate = successes / CONVERGENCE_ROLLOUTS
        self.greedy_path_len = int(np.min(lengths)) if lengths else 0

        # Criteria: 100% success and path length equals BFS optimum
        is_optimal = (
            self.greedy_success_rate >= 0.99
            and self.env.optimal_len > 0
            and all(l == self.env.optimal_len for l in lengths)
        )

        if is_optimal:
            self.consecutive_converged_checks += 1
            if self.consecutive_converged_checks >= CONVERGENCE_STREAK_REQUIRED:
                self.is_converged = True
                return True
        else:
            self.consecutive_converged_checks = 0

        return False

    # -----------------------------------------------------------------------
    # Main Async Training Loop
    # -----------------------------------------------------------------------
    async def start(
        self,
        mode: str = "demo",
        algo: str = "q_learning",
        seed: Optional[int] = 42,
        target_seconds: float = DEFAULT_TARGET_SECONDS,
        shaping: bool = True,
    ) -> None:
        """Start or restart training run."""
        await self.stop()

        self.mode = mode
        self.t_target = target_seconds
        self.t_elapsed = 0.0
        self.episode_count = 0
        self.total_steps = 0
        self.consecutive_converged_checks = 0
        self.is_converged = False
        self.last_edit_time = None
        self.speed_multiplier = 1.0

        self.recent_returns.clear()
        self.recent_successes.clear()
        self.recent_steps.clear()

        self.env.set_shaping(shaping)
        self.agent.set_algo(algo)
        self.agent.set_seed(seed if mode == "demo" else None)
        self.agent.reset_table()

        self.state = "RUNNING"
        self._stop_event.clear()
        self.last_clock_time = time.monotonic()

        self._loop_task = asyncio.create_task(self._training_loop())

    async def pause(self) -> None:
        """Pause training."""
        if self.state == "RUNNING":
            self.state = "PAUSED"

    async def resume(self) -> None:
        """Resume training."""
        if self.state == "PAUSED":
            self.last_clock_time = time.monotonic()
            self.state = "RUNNING"

    async def reset(self) -> None:
        """Reset training state."""
        await self.stop()
        self.t_elapsed = 0.0
        self.episode_count = 0
        self.total_steps = 0
        self.consecutive_converged_checks = 0
        self.is_converged = False
        self.last_edit_time = None
        self.agent.reset_table()
        self.state = "IDLE"

        # Emit initial reset frame
        sr, sc = self.env.start_pos
        frame = self._build_frame_dict(sr, sc, False, [(sr, sc)])
        await self.broadcast(frame)

    async def stop(self) -> None:
        """Cancel the background training task."""
        self._stop_event.set()
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        self._loop_task = None
        self.state = "IDLE"

    def handle_edit(self, r: int, c: int, tile: str) -> None:
        """Handle level edit from client."""
        self.env.edit_tile(r, c, tile)
        # Level edit shock: raise epsilon and reset convergence streak
        self.last_edit_time = self.t_elapsed
        self.consecutive_converged_checks = 0
        self.is_converged = False

    def handle_set_algo(self, algo: str) -> None:
        """Change RL algorithm live."""
        self.agent.set_algo(algo)

    def handle_set_speed(self, speed: float) -> None:
        """Set speed multiplier (for free mode)."""
        self.speed_multiplier = max(0.1, min(10.0, speed))

    async def _training_loop(self) -> None:
        """Master training loop running as an asyncio task."""
        try:
            while not self._stop_event.is_set():
                if self.state == "PAUSED":
                    await asyncio.sleep(0.05)
                    self.last_clock_time = time.monotonic()
                    continue

                if self.state != "RUNNING":
                    await asyncio.sleep(0.05)
                    continue

                # Clock update
                now = time.monotonic()
                dt = (now - self.last_clock_time) * self.speed_multiplier
                self.last_clock_time = now
                self.t_elapsed += dt

                # Phase 1: Watch it flail (first ~8 episodes)
                if self.episode_count < PHASE1_MAX_EPISODES:
                    await self._run_phase1_step()
                else:
                    # Phase 2: Turbo batching
                    await self._run_phase2_turbo_frame(dt)

                # Check if target time reached without convergence
                if self.t_elapsed >= self.t_target and not self.is_converged:
                    # Still run convergence check to see if we reached optimal
                    if self.run_convergence_check():
                        await self._trigger_convergence()

                # Yield to event loop
                await asyncio.sleep(0)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            await self.broadcast({"type": "event", "event": "error", "message": str(e)})

    # -----------------------------------------------------------------------
    # Phase 1: Step-by-Step "Watch It Flail"
    # -----------------------------------------------------------------------
    async def _run_phase1_step(self) -> None:
        """Run single step at human-visible pace (~12 steps/s)."""
        s = self.env.reset()
        r, c, k = decode_state(s)
        trail: List[Tuple[int, int]] = [(r, c)]
        ep_return = 0.0
        steps = 0
        success = False

        self.episode_count += 1
        eps = self.compute_epsilon()

        # Step-by-step loop
        step_dt = (1.0 / PHASE1_STEPS_PER_SEC) / self.speed_multiplier
        curr_s = s

        # For SARSA, we need next action
        curr_a = self.agent.select_action(curr_s, eps)

        while steps < MAX_EPISODE_STEPS and not self._stop_event.is_set():
            if self.state == "PAUSED":
                await asyncio.sleep(0.05)
                continue

            a = curr_a if self.agent.algo == "sarsa" else self.agent.select_action(curr_s, eps)
            next_s, reward, done = self.env.step(curr_s, a)
            ep_return += reward
            steps += 1
            self.total_steps += 1

            nr, nc, nk = decode_state(next_s)
            trail.append((nr, nc))

            if self.agent.algo == "q_learning":
                upd = self.agent.update_q_learning(curr_s, a, reward, next_s, done)
            else:
                next_a = self.agent.select_action(next_s, eps)
                upd = self.agent.update_sarsa(curr_s, a, reward, next_s, next_a, done)
                curr_a = next_a

            self._sample_bellman_if_due(upd)

            # Check goal reach
            if (nr, nc) == self.env.goal_pos:
                success = True

            # Emit frame for this step
            frame = self._build_frame_dict(nr, nc, bool(nk), trail)
            await self.broadcast(frame)

            curr_s = next_s

            if done:
                break

            await asyncio.sleep(step_dt)
            # Update elapsed time during step sleep
            self.t_elapsed += step_dt * self.speed_multiplier
            self.last_clock_time = time.monotonic()

        self.recent_returns.append(ep_return)
        self.recent_successes.append(1.0 if success else 0.0)
        self.recent_steps.append(steps)

    # -----------------------------------------------------------------------
    # Phase 2: Turbo Batching
    # -----------------------------------------------------------------------
    async def _run_phase2_turbo_frame(self, dt: float) -> None:
        """Run a batch of episodes and emit one frame at ~30 FPS."""
        frame_start = time.monotonic()

        # Ramp batch size from 2 up to ~100-200 based on progress
        t_progress = min(1.0, max(0.0, self.t_elapsed / self.t_target))
        batch_size = int(2 + 80 * t_progress * self.speed_multiplier)
        batch_size = max(1, min(200, batch_size))

        latest_trail: List[Tuple[int, int]] = []
        last_agent_r, last_agent_c, last_agent_k = 1, 1, 0

        for _ in range(batch_size):
            self.episode_count += 1
            eps = self.compute_epsilon()
            s = self.env.reset()
            r, c, k = decode_state(s)
            trail = [(r, c)]
            ep_return = 0.0
            steps = 0
            success = False

            curr_s = s
            curr_a = self.agent.select_action(curr_s, eps)

            for step_i in range(MAX_EPISODE_STEPS):
                a = curr_a if self.agent.algo == "sarsa" else self.agent.select_action(curr_s, eps)
                next_s, reward, done = self.env.step(curr_s, a)
                ep_return += reward
                steps += 1
                self.total_steps += 1

                nr, nc, nk = decode_state(next_s)
                trail.append((nr, nc))

                if self.agent.algo == "q_learning":
                    upd = self.agent.update_q_learning(curr_s, a, reward, next_s, done)
                else:
                    next_a = self.agent.select_action(next_s, eps)
                    upd = self.agent.update_sarsa(curr_s, a, reward, next_s, next_a, done)
                    curr_a = next_a

                self._sample_bellman_if_due(upd)

                if (nr, nc) == self.env.goal_pos:
                    success = True

                curr_s = next_s
                if done:
                    break

            self.recent_returns.append(ep_return)
            self.recent_successes.append(1.0 if success else 0.0)
            self.recent_steps.append(steps)

            latest_trail = trail
            last_agent_r, last_agent_c, last_agent_k = decode_state(curr_s)

            # Periodic convergence check every 25 episodes
            if self.episode_count % CONVERGENCE_CHECK_INTERVAL == 0:
                if self.run_convergence_check():
                    await self._trigger_convergence()
                    return

        # Broadcast turbo frame
        frame = self._build_frame_dict(
            last_agent_r, last_agent_c, bool(last_agent_k), latest_trail
        )
        await self.broadcast(frame)

        # Regulate 30 Hz frame rate
        frame_duration = time.monotonic() - frame_start
        target_frame_dt = (1.0 / TURBO_FPS) / self.speed_multiplier
        sleep_time = max(0.001, target_frame_dt - frame_duration)
        await asyncio.sleep(sleep_time)

    # -----------------------------------------------------------------------
    # Convergence Trigger & Phase 3: Victory Lap
    # -----------------------------------------------------------------------
    async def _trigger_convergence(self) -> None:
        """Emit converged event and immediately run visible victory lap."""
        self.state = "CONVERGED"
        event = {
            "type": "event",
            "event": "converged",
            "episode": self.episode_count,
            "t_elapsed": round(self.t_elapsed, 2),
        }
        await self.broadcast(event)
        await asyncio.sleep(0.5)
        await self.run_victory_lap()

    async def run_victory_lap(self) -> None:
        """Run a visible, glowing greedy rollout step-by-step."""
        self.state = "VICTORY_LAP"
        start_s = self.env.reset()
        r, c, k = decode_state(start_s)
        trail: List[Tuple[int, int]] = [(r, c)]

        s = start_s
        lap_step_dt = 0.09 / self.speed_multiplier  # human-watchable pace (~11 steps/s)

        for _ in range(MAX_EPISODE_STEPS):
            a = self.agent.greedy_action(s)
            next_s, _, done = self.env.step(s, a)
            nr, nc, nk = decode_state(next_s)
            trail.append((nr, nc))

            # Broadcast glowing victory lap frame
            frame = self._build_frame_dict(nr, nc, bool(nk), trail)
            await self.broadcast(frame)

            s = next_s
            if (nr, nc) == self.env.goal_pos or done:
                break

            await asyncio.sleep(lap_step_dt)

        await asyncio.sleep(0.5)
        self.state = "IDLE"
        await self.broadcast({"type": "event", "event": "lap_done"})
