"""Convergence test over 20 random seeds: verifies stage reliability under target time T."""

import time
from typing import Tuple, List, Optional
import numpy as np
import pytest

from app.env import GridWorld, decode_state, encode_state
from app.agents import TabularRLAgent
from app.config import (
    DEFAULT_TARGET_SECONDS,
    EXPLORE_RATIO,
    EPSILON_START,
    EPSILON_FLOOR,
    CONVERGENCE_CHECK_INTERVAL,
    CONVERGENCE_ROLLOUTS,
    CONVERGENCE_STREAK_REQUIRED,
    MAX_EPISODE_STEPS,
)


def evaluate_greedy_policy(env: GridWorld, agent: TabularRLAgent) -> Tuple[bool, int]:
    """Run 10 greedy rollouts. Return True if 10/10 succeed with length == BFS optimum."""
    start_s = env.reset()
    lengths = []
    successes = 0

    for _ in range(CONVERGENCE_ROLLOUTS):
        s = start_s
        step_count = 0
        succeeded = False

        for _ in range(MAX_EPISODE_STEPS):
            a = agent.greedy_action(s)
            next_s, _, done = env.step(s, a)
            step_count += 1
            r, c, _ = decode_state(next_s)

            if (r, c) == env.goal_pos:
                succeeded = True
                break
            if done:
                break
            s = next_s

        if succeeded:
            successes += 1
            lengths.append(step_count)

    is_optimal = (
        successes == CONVERGENCE_ROLLOUTS
        and len(lengths) == CONVERGENCE_ROLLOUTS
        and all(l == env.optimal_len for l in lengths)
    )
    min_len = min(lengths) if lengths else 0
    return is_optimal, min_len


def run_training_simulation(seed: int, target_seconds: float = DEFAULT_TARGET_SECONDS):
    """Simulate training for one seed using the exact demo pacing and time-annealed epsilon."""
    env = GridWorld(shaping=True)
    agent = TabularRLAgent(algo="q_learning", seed=seed)
    t_explore = target_seconds * EXPLORE_RATIO

    t_elapsed = 0.0
    episodes = 0
    consecutive_checks = 0
    converged_ep = None
    converged_time = None

    # Run simulated episodes
    while t_elapsed < target_seconds + 10.0:
        episodes += 1

        # Phase 1: First 8 episodes run step-by-step at 12 steps/sec
        if episodes <= 8:
            dt_step = 1.0 / 12.0
            s = env.reset()
            for _ in range(MAX_EPISODE_STEPS):
                eps = max(
                    EPSILON_FLOOR,
                    EPSILON_START - (t_elapsed / t_explore) * (EPSILON_START - EPSILON_FLOOR),
                )
                a = agent.select_action(s, eps)
                next_s, r, done = env.step(s, a)
                agent.update_q_learning(s, a, r, next_s, done)
                s = next_s
                t_elapsed += dt_step
                if done:
                    break
        else:
            # Phase 2: Turbo batching at 30 FPS
            # Epsilon driven by elapsed time
            eps = max(
                EPSILON_FLOOR,
                EPSILON_START - (t_elapsed / t_explore) * (EPSILON_START - EPSILON_FLOOR),
            )
            # Turbo batch size ramps based on elapsed time
            batch_size = int(2 + 40 * (t_elapsed / target_seconds))
            batch_size = max(1, min(100, batch_size))

            for _ in range(batch_size):
                s = env.reset()
                for _ in range(MAX_EPISODE_STEPS):
                    a = agent.select_action(s, eps)
                    next_s, r, done = env.step(s, a)
                    agent.update_q_learning(s, a, r, next_s, done)
                    s = next_s
                    if done:
                        break

            # Advance time by one 30 Hz frame (0.0333 s)
            t_elapsed += 0.0333

        # Convergence check every 25 episodes
        if episodes % CONVERGENCE_CHECK_INTERVAL == 0:
            is_conv, _ = evaluate_greedy_policy(env, agent)
            if is_conv:
                consecutive_checks += 1
                if consecutive_checks >= CONVERGENCE_STREAK_REQUIRED:
                    converged_ep = episodes
                    converged_time = t_elapsed
                    break
            else:
                consecutive_checks = 0

    return converged_ep, converged_time


def test_20_seeds_convergence():
    """Verify that at least 19 out of 20 seeds reliably converge within T=75s."""
    num_seeds = 20
    results = []
    converged_count = 0

    print("\n" + "=" * 65)
    print("CONVERGENCE BENCHMARK: 20 SEEDS (Target T = 75.0s)")
    print("=" * 65)
    print(f"{'Seed':<6} | {'Status':<12} | {'Episodes':<10} | {'Time to Converge':<16}")
    print("-" * 65)

    for seed in range(num_seeds):
        ep, t_conv = run_training_simulation(seed, DEFAULT_TARGET_SECONDS)
        if ep is not None and t_conv <= DEFAULT_TARGET_SECONDS:
            converged_count += 1
            status = "CONVERGED"
            results.append((seed, status, ep, t_conv))
            print(f"{seed:<6} | {status:<12} | {ep:<10} | {t_conv:.2f} s")
        else:
            status = "TIMEOUT"
            ep_str = str(ep) if ep else "N/A"
            t_str = f"{t_conv:.2f} s" if t_conv else "N/A"
            results.append((seed, status, ep_str, t_str))
            print(f"{seed:<6} | {status:<12} | {ep_str:<10} | {t_str}")

    print("=" * 65)
    print(f"Summary: {converged_count} / {num_seeds} seeds converged within {DEFAULT_TARGET_SECONDS}s.")
    print("=" * 65 + "\n")

    assert converged_count >= 19, (
        f"Stage reliability failed: expected at least 19/20 seeds to converge within {DEFAULT_TARGET_SECONDS}s, "
        f"but only {converged_count}/20 converged."
    )
