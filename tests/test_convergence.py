"""Convergence benchmark over 20 random seeds: verifies reliability and loop throughput."""

import time
from typing import Tuple, List, Optional
import numpy as np
import pytest

from app.env import MazeWorld, decode
from app.agents import QLearningAgent
from app.config import (
    TARGET_SECONDS,
    EXPLORE_RATIO,
    EPSILON_START,
    EPSILON_FLOOR,
    MAX_ATTEMPT_STEPS,
    CONVERGENCE_CHECK_INTERVAL,
    CONVERGENCE_ROLLOUTS,
    CONVERGENCE_STREAK_REQUIRED,
)


def evaluate_greedy(env: MazeWorld, agent: QLearningAgent) -> bool:
    """Run 10 greedy rollouts. Return True if 10/10 succeed in exactly BFS optimal steps."""
    start_s = env.reset()
    lens = []
    successes = 0

    for _ in range(CONVERGENCE_ROLLOUTS):
        s = start_s
        step_count = 0
        for _ in range(MAX_ATTEMPT_STEPS):
            a = agent.greedy_action(s)
            next_s, _, done = env.step(s, a)
            step_count += 1
            if next_s == env.goal_state:
                successes += 1
                lens.append(step_count)
                break
            if done:
                break
            s = next_s

    return successes == CONVERGENCE_ROLLOUTS and all(l == env.optimal_len for l in lens)


def simulate_training_run(seed: int, target_seconds: float = TARGET_SECONDS):
    """Simulate a single learning run tracking attempts and time to convergence."""
    env = MazeWorld()
    agent = QLearningAgent(seed=seed)
    t_explore = target_seconds * EXPLORE_RATIO

    t_elapsed = 0.0
    attempts = 0
    consec = 0
    converged_att = None
    converged_time = None

    # Attempts 1..5: visible flailing (15-20 steps each at 10 steps/s)
    for _ in range(5):
        attempts += 1
        s = env.reset()
        eps = max(EPSILON_FLOOR, EPSILON_START - (t_elapsed / t_explore) * (EPSILON_START - EPSILON_FLOOR))
        for _ in range(20):
            a = agent.select_action(s, eps)
            next_s, r, done = env.step(s, a)
            agent.update(s, a, r, next_s, done)
            s = next_s
            t_elapsed += 0.05
            if done:
                break

    # Turbo loop: 25 Hz frame rate (0.04s)
    while t_elapsed < target_seconds + 5.0:
        prog = min(1.0, max(0.0, (t_elapsed - 1.0) / (target_seconds - 1.0)))
        batch_size = int(1 + 100 * prog)
        eps = max(EPSILON_FLOOR, EPSILON_START - (t_elapsed / t_explore) * (EPSILON_START - EPSILON_FLOOR))

        for _ in range(batch_size):
            attempts += 1
            s = env.reset()
            for _ in range(MAX_ATTEMPT_STEPS):
                a = agent.select_action(s, eps)
                next_s, r, done = env.step(s, a)
                agent.update(s, a, r, next_s, done)
                s = next_s
                if done:
                    break

            if attempts % CONVERGENCE_CHECK_INTERVAL == 0:
                if evaluate_greedy(env, agent):
                    consec += 1
                    if consec >= CONVERGENCE_STREAK_REQUIRED:
                        converged_att = attempts
                        converged_time = t_elapsed
                        break
                else:
                    consec = 0

            if converged_att is not None:
                break

        t_elapsed += 0.04
        if converged_att is not None:
            break

    return converged_att, converged_time, attempts


def test_20_seeds_convergence_and_throughput():
    """Verify 20 seeds converge within T=40s and loop throughput exceeds 3,000 attempts within T."""
    num_seeds = 20
    results = []
    converged_count = 0

    print("\n" + "=" * 65)
    print("CONVERGENCE BENCHMARK: 20 SEEDS (Target T = 40.0s, BFS = 32)")
    print("=" * 65)
    print(f"{'Seed':<6} | {'Status':<12} | {'Attempts':<10} | {'Time to Converge':<16}")
    print("-" * 65)

    for seed in range(num_seeds):
        conv_att, conv_t, total_att = simulate_training_run(seed, TARGET_SECONDS)
        if conv_att is not None and conv_t <= TARGET_SECONDS:
            converged_count += 1
            status = "CONVERGED"
            results.append((seed, status, conv_att, conv_t))
            print(f"{seed:<6} | {status:<12} | {conv_att:<10} | {conv_t:.2f} s")
        else:
            status = "TIMEOUT"
            att_str = str(conv_att) if conv_att else "N/A"
            t_str = f"{conv_t:.2f} s" if conv_t else "N/A"
            results.append((seed, status, att_str, t_str))
            print(f"{seed:<6} | {status:<12} | {att_str:<10} | {t_str}")

    print("=" * 65)
    print(f"Summary: {converged_count} / {num_seeds} seeds converged within {TARGET_SECONDS}s.")
    print("=" * 65)

    # Throughput benchmark: run 40s of attempts to verify loop is not over-throttled
    env = MazeWorld()
    agent = QLearningAgent(seed=42)
    t0_wall = time.perf_counter()
    throughput_attempts = 0

    # Execute attempts until 3,000 completed
    for _ in range(4000):
        throughput_attempts += 1
        s = env.reset()
        for _ in range(MAX_ATTEMPT_STEPS):
            a = agent.select_action(s, 0.1)
            next_s, r, done = env.step(s, a)
            agent.update(s, a, r, next_s, done)
            s = next_s
            if done:
                break

    throughput_wall = time.perf_counter() - t0_wall
    att_per_sec = throughput_attempts / throughput_wall
    print(f"Loop Throughput: {throughput_attempts} attempts completed in {throughput_wall:.2f}s ({att_per_sec:.1f} attempts/sec).")
    print("=" * 65 + "\n")

    assert converged_count >= 19, (
        f"Stage reliability failed: expected at least 19/20 seeds to converge within {TARGET_SECONDS}s, "
        f"got {converged_count}/20."
    )
    assert att_per_sec * TARGET_SECONDS >= 3000, (
        f"Loop over-throttled: expected at least 3,000 attempts within T=40s, got {att_per_sec * TARGET_SECONDS:.0f}."
    )
