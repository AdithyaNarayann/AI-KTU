"""Headless benchmark for WatchItLearn: runs N seeds on all 3 maze presets.

Hardware-independent, seeded, uses episode-indexed epsilon (same as Step mode).
No wall-clock dependency. Convergence check: 10 greedy rollouts, streak of 3.
Cap 3000 episodes; not converged by then counts as failure.

Usage:
    python -m app.evaluate          # 20 seeds, all 3 mazes
    python -m app.evaluate --seeds 5 --maze 0
    python -m app.evaluate --sensitivity  # alpha x gamma grid (stretch)

Cite: Agarwal et al., "Deep Reinforcement Learning at the Edge of the Statistical Precipice", NeurIPS 2021.
"""

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from concurrent.futures import ProcessPoolExecutor, as_completed
import numpy as np

from app.config import (
    MAZE_PRESETS,
    MAZE_PRESET_NAMES,
    ALPHA,
    GAMMA,
    EPSILON_START,
    EPSILON_FLOOR,
    MAX_ATTEMPT_STEPS,
    CONVERGENCE_ROLLOUTS,
    CONVERGENCE_STREAK_REQUIRED,
    NUM_ACTIONS,
)
from app.env import MazeWorld
from app.agents import QLearningAgent


MAX_EPISODES = 3000
CONVERGENCE_CHECK_EVERY = 25


# ---------------------------------------------------------------------------
# Single Headless Run
# ---------------------------------------------------------------------------

def _compute_epsilon_by_episode(episode: int) -> float:
    """Episode-indexed epsilon, same schedule as Step mode: linear decay over 60 episodes."""
    eps = 1.0 - (episode / 60.0) * (EPSILON_START - EPSILON_FLOOR)
    return float(max(EPSILON_FLOOR, min(EPSILON_START, eps)))


def _greedy_check(env: MazeWorld, agent: QLearningAgent) -> bool:
    """10 greedy rollouts, all must match BFS optimal."""
    start_s = env.reset()
    for _ in range(CONVERGENCE_ROLLOUTS):
        s = start_s
        steps = 0
        reached = False
        for _ in range(MAX_ATTEMPT_STEPS):
            a = agent.greedy_action(s)
            ns, _, done = env.step(s, a)
            steps += 1
            if ns == env.goal_state:
                reached = True
                break
            if done:
                break
            s = ns
        if not reached or steps != env.optimal_len:
            return False
    return True


def run_single_seed(
    seed: int,
    maze_index: int,
    alpha: float = ALPHA,
    gamma: float = GAMMA,
) -> Dict[str, Any]:
    """Run a single training run. Returns dict with convergence info and episode-level data."""
    env = MazeWorld(layout=MAZE_PRESETS[maze_index])
    agent = QLearningAgent(alpha=alpha, gamma=gamma, seed=seed)

    consecutive = 0
    converged_episode = None
    transitions_total = 0
    steps_per_episode: List[int] = []
    reached_per_episode: List[bool] = []

    for ep in range(1, MAX_EPISODES + 1):
        eps = _compute_epsilon_by_episode(ep)
        s = env.reset()
        steps = 0
        reached = False

        for _ in range(MAX_ATTEMPT_STEPS):
            a = agent.select_action(s, eps)
            ns, r, done = env.step(s, a)
            steps += 1
            transitions_total += 1
            agent.update(s, a, r, ns, done)
            s = ns
            if done:
                if ns == env.goal_state:
                    reached = True
                break

        steps_per_episode.append(steps)
        reached_per_episode.append(reached)

        if ep % CONVERGENCE_CHECK_EVERY == 0:
            if _greedy_check(env, agent):
                consecutive += 1
                if consecutive >= CONVERGENCE_STREAK_REQUIRED:
                    converged_episode = ep
                    break
            else:
                consecutive = 0

    return {
        'seed': seed,
        'maze_index': maze_index,
        'converged': converged_episode is not None,
        'converged_episode': converged_episode,
        'transitions': transitions_total,
        'episodes_run': len(steps_per_episode),
        'steps_per_episode': steps_per_episode,
    }


# ---------------------------------------------------------------------------
# Bootstrap CI (NumPy only)
# ---------------------------------------------------------------------------

def _interquartile_mean(data: np.ndarray) -> float:
    """IQM: mean of values between 25th and 75th percentiles."""
    if len(data) == 0:
        return float('nan')
    q25 = np.percentile(data, 25)
    q75 = np.percentile(data, 75)
    mask = (data >= q25) & (data <= q75)
    trimmed = data[mask]
    return float(np.mean(trimmed)) if len(trimmed) > 0 else float(np.mean(data))


def bootstrap_ci(
    data: np.ndarray,
    stat_fn,
    n_resamples: int = 10000,
    confidence: float = 0.95,
    rng_seed: int = 0,
) -> Tuple[float, float, float]:
    """Percentile-bootstrap CI. Returns (point_estimate, ci_low, ci_high)."""
    rng = np.random.RandomState(rng_seed)
    n = len(data)
    point = stat_fn(data)

    if n == 0:
        return float('nan'), float('nan'), float('nan')

    boot_stats = np.empty(n_resamples)
    for i in range(n_resamples):
        sample = data[rng.randint(0, n, size=n)]
        boot_stats[i] = stat_fn(sample)

    alpha = (1 - confidence) / 2
    ci_low = float(np.percentile(boot_stats, alpha * 100))
    ci_high = float(np.percentile(boot_stats, (1 - alpha) * 100))
    return float(point), ci_low, ci_high


# ---------------------------------------------------------------------------
# Aggregate Stats
# ---------------------------------------------------------------------------

def compute_maze_stats(results: List[Dict[str, Any]], maze_index: int) -> Dict[str, Any]:
    """Compute per-maze aggregate statistics."""
    maze_results = [r for r in results if r['maze_index'] == maze_index]
    n_total = len(maze_results)
    converged = [r for r in maze_results if r['converged']]
    n_converged = len(converged)
    success_rate = n_converged / n_total if n_total > 0 else 0.0

    if n_converged == 0:
        return {
            'maze_index': maze_index,
            'maze_name': MAZE_PRESET_NAMES[maze_index],
            'n_seeds': n_total,
            'success_rate': 0.0,
            'episodes': None,
            'transitions': None,
        }

    ep_data = np.array([r['converged_episode'] for r in converged], dtype=np.float64)
    tr_data = np.array([r['transitions'] for r in converged], dtype=np.float64)

    def _stats(data: np.ndarray) -> Dict[str, Any]:
        iqm_val, iqm_lo, iqm_hi = bootstrap_ci(data, _interquartile_mean)
        mean_val, mean_lo, mean_hi = bootstrap_ci(data, np.mean)
        return {
            'median': float(np.median(data)),
            'mean': round(mean_val, 2),
            'mean_ci': [round(mean_lo, 2), round(mean_hi, 2)],
            'iqm': round(iqm_val, 2),
            'iqm_ci': [round(iqm_lo, 2), round(iqm_hi, 2)],
            'std': round(float(np.std(data, ddof=1)), 2) if len(data) > 1 else 0.0,
            'min': float(np.min(data)),
            'max': float(np.max(data)),
        }

    # Median learning curve with 25-75 band
    max_ep = max(r['episodes_run'] for r in maze_results)
    all_curves = np.full((n_total, max_ep), np.nan)
    for i, r in enumerate(maze_results):
        steps = r['steps_per_episode']
        all_curves[i, :len(steps)] = steps
        # Pad finished runs with their final value
        if len(steps) < max_ep:
            all_curves[i, len(steps):] = steps[-1]

    median_curve = np.nanmedian(all_curves, axis=0).tolist()
    p25_curve = np.nanpercentile(all_curves, 25, axis=0).tolist()
    p75_curve = np.nanpercentile(all_curves, 75, axis=0).tolist()

    # Reliability curve: fraction of seeds converged by episode k
    reliability = []
    conv_episodes = [r['converged_episode'] if r['converged'] else MAX_EPISODES + 1 for r in maze_results]
    for k in range(1, max_ep + 1):
        frac = sum(1 for ce in conv_episodes if ce <= k) / n_total
        reliability.append(frac)

    # Downsample curves for JSON size
    step_size = max(1, max_ep // 400)
    indices = list(range(0, max_ep, step_size))

    return {
        'maze_index': maze_index,
        'maze_name': MAZE_PRESET_NAMES[maze_index],
        'optimal_len': MazeWorld(layout=MAZE_PRESETS[maze_index]).optimal_len,
        'n_seeds': n_total,
        'success_rate': round(success_rate, 4),
        'episodes': _stats(ep_data),
        'transitions': _stats(tr_data),
        'learning_curve': {
            'episode_indices': indices,
            'median': [round(median_curve[i], 1) for i in indices],
            'p25': [round(p25_curve[i], 1) for i in indices],
            'p75': [round(p75_curve[i], 1) for i in indices],
        },
        'reliability_curve': {
            'episode_indices': indices,
            'fraction_converged': [round(reliability[i], 4) for i in indices],
        },
    }


# ---------------------------------------------------------------------------
# Sensitivity Grid (Stretch)
# ---------------------------------------------------------------------------

def run_sensitivity_grid(
    maze_index: int = 0,
    seeds_per_cell: int = 5,
    alphas: Optional[List[float]] = None,
    gammas: Optional[List[float]] = None,
) -> Dict[str, Any]:
    """Alpha x gamma sensitivity grid. Returns dict with grid data."""
    if alphas is None:
        alphas = [0.1, 0.3, 0.5, 0.7, 0.9]
    if gammas is None:
        gammas = [0.80, 0.90, 0.95, 0.97, 0.99]

    grid: List[List[Any]] = []
    for alpha in alphas:
        row = []
        for gamma in gammas:
            episodes = []
            any_failed = False
            for seed in range(seeds_per_cell):
                result = run_single_seed(seed, maze_index, alpha=alpha, gamma=gamma)
                if result['converged']:
                    episodes.append(result['converged_episode'])
                else:
                    any_failed = True
            if any_failed:
                row.append('x')
            else:
                row.append(int(np.median(episodes)))
        grid.append(row)

    return {
        'maze_index': maze_index,
        'maze_name': MAZE_PRESET_NAMES[maze_index],
        'alphas': alphas,
        'gammas': gammas,
        'seeds_per_cell': seeds_per_cell,
        'grid': grid,
    }


# ---------------------------------------------------------------------------
# Full Benchmark
# ---------------------------------------------------------------------------

def run_benchmark(
    n_seeds: int = 20,
    maze_indices: Optional[List[int]] = None,
    progress_callback=None,
) -> Dict[str, Any]:
    """Run the full benchmark across all maze presets."""
    if maze_indices is None:
        maze_indices = list(range(len(MAZE_PRESETS)))

    all_results: List[Dict[str, Any]] = []
    total = n_seeds * len(maze_indices)
    done_count = 0

    for mi in maze_indices:
        for seed in range(n_seeds):
            result = run_single_seed(seed, mi)
            all_results.append(result)
            done_count += 1
            if progress_callback:
                progress_callback(done_count, total)

    maze_stats = []
    for mi in maze_indices:
        maze_stats.append(compute_maze_stats(all_results, mi))

    return {
        'n_seeds': n_seeds,
        'mazes': maze_stats,
        'method_note': (
            'Episodes to converge: counted until 3 consecutive checks of 10 greedy rollouts '
            'all match BFS optimal length. Epsilon schedule: episode-indexed, linear decay over '
            '60 episodes from 1.0 to 0.02. IQM (interquartile mean) with 95% percentile-bootstrap '
            'CI (10,000 resamples, NumPy only). Cite: Agarwal et al., "Deep Reinforcement Learning '
            'at the Edge of the Statistical Precipice", NeurIPS 2021.'
        ),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='WatchItLearn Headless Benchmark')
    parser.add_argument('--seeds', type=int, default=20, help='Number of seeds per maze')
    parser.add_argument('--maze', type=int, default=None, help='Run only this maze index (0-2)')
    parser.add_argument('--sensitivity', action='store_true', help='Run alpha x gamma sensitivity grid')
    parser.add_argument('--output', type=str, default=None, help='Write JSON results to file')
    args = parser.parse_args()

    print("=" * 70)
    print("WATCHITLEARN HEADLESS BENCHMARK")
    print(f"Seeds: {args.seeds} | Mazes: {'all' if args.maze is None else args.maze}")
    print("=" * 70)

    t0 = time.perf_counter()

    maze_indices = [args.maze] if args.maze is not None else None

    def progress(done, total):
        pct = done / total * 100
        print(f"\r  Progress: {done}/{total} ({pct:.0f}%)", end="", flush=True)

    results = run_benchmark(n_seeds=args.seeds, maze_indices=maze_indices, progress_callback=progress)
    print()

    elapsed = time.perf_counter() - t0

    # Print results table
    for ms in results['mazes']:
        print(f"\n{'=' * 70}")
        print(f"Maze: {ms['maze_name']} (BFS optimal: {ms.get('optimal_len', '?')})")
        print(f"{'=' * 70}")
        print(f"Success rate: {ms['success_rate'] * 100:.0f}% ({int(ms['success_rate'] * ms['n_seeds'])}/{ms['n_seeds']})")
        if ms['episodes']:
            ep = ms['episodes']
            tr = ms['transitions']
            print(f"Episodes to converge:")
            print(f"  Median: {ep['median']:.0f}  Mean: {ep['mean']:.1f} [{ep['mean_ci'][0]:.1f}, {ep['mean_ci'][1]:.1f}]")
            print(f"  IQM: {ep['iqm']:.1f} [{ep['iqm_ci'][0]:.1f}, {ep['iqm_ci'][1]:.1f}]")
            print(f"  Std: {ep['std']:.1f}  Min: {ep['min']:.0f}  Max: {ep['max']:.0f}")
            print(f"Transitions to converge:")
            print(f"  Median: {tr['median']:.0f}  Mean: {tr['mean']:.0f}  IQM: {tr['iqm']:.0f}")

    print(f"\nTotal wall-clock time: {elapsed:.2f}s")

    # Sensitivity grid (stretch)
    if args.sensitivity:
        print(f"\n{'=' * 70}")
        print("SENSITIVITY GRID: alpha x gamma")
        print(f"{'=' * 70}")
        sg = run_sensitivity_grid(maze_index=args.maze or 0)
        results['sensitivity'] = sg

        # Print grid
        header = "alpha\\gamma | " + " | ".join(f"{g:.2f}" for g in sg['gammas'])
        print(header)
        print("-" * len(header))
        for i, alpha in enumerate(sg['alphas']):
            cells = []
            for val in sg['grid'][i]:
                if val == 'x':
                    cells.append("  x  ")
                else:
                    cells.append(f"{val:5d}")
            print(f"  {alpha:.1f}      | " + " | ".join(cells))

    # Save results
    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\nResults saved to {out_path}")

    return results


if __name__ == '__main__':
    main()
