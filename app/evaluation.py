"""Pure evaluation module for WatchItLearn: value iteration, policy analysis, and report generation.

No asyncio. Fully deterministic given inputs. All grids are 11x11 with walls marked as None.
"""

from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from collections import deque

from pydantic import BaseModel

from app.config import (
    MAZE_ROWS,
    MAZE_COLS,
    NUM_STATES,
    NUM_ACTIONS,
    ACTIONS,
    REWARD_STEP,
    REWARD_GOAL,
    MAX_ATTEMPT_STEPS,
    ALPHA,
    GAMMA,
    EPSILON_START,
    EPSILON_FLOOR,
    MAZE_PRESET_NAMES,
)
from app.env import MazeWorld, encode, decode


# ---------------------------------------------------------------------------
# Pydantic Report Schema
# ---------------------------------------------------------------------------

class ReportMeta(BaseModel):
    maze_index: int
    maze_name: str
    seed: int
    alpha: float
    gamma: float
    eps_start: float
    eps_floor: float
    speed_mode: str
    optimal_len: int
    grid: List[str]


class ReportVerdict(BaseModel):
    status: str  # "optimal" | "near_optimal" | "suboptimal" | "failed"
    greedy_len: float
    gap_pct: float
    rollouts_success: int
    rollouts_optimal: int
    sentence: str


class ReportEfficiency(BaseModel):
    episodes_total: int
    first_goal_episode: Optional[int]
    within10pct_episode: Optional[int]
    converged_episode: Optional[int]
    transitions_total: int
    transitions_at_convergence: Optional[int]
    regret_total: float
    wasted_step_pct: float
    wall_bumps_total: int


class ReportCurves(BaseModel):
    episode_index: List[int]
    steps: List[int]
    success_rolling10: List[float]
    epsilon: List[float]
    cum_regret: List[float]


class ReportKnowledge(BaseModel):
    v_learned: List[List[Optional[float]]]
    v_star: List[List[Optional[float]]]
    v_error_abs: List[List[Optional[float]]]
    policy_learned: List[List[Optional[int]]]
    policy_optimal_sets: List[List[Optional[List[int]]]]
    visit_counts: List[List[Optional[int]]]


class ReportPolicyAccuracy(BaseModel):
    on_path: float
    visited: float
    reachable: float
    coverage: float
    n_on_path: int = 0
    n_on_path_correct: int = 0
    n_reachable: int = 0
    n_reachable_correct: int = 0
    n_visited: int = 0
    n_visited_correct: int = 0


class ReportValueError(BaseModel):
    rmse_on_path: float
    max_on_path: float
    rmse_visited: float
    bellman_residual_visited: float


class NoisePoint(BaseModel):
    eps: float
    success_rate: float
    mean_steps: float
    p90_steps: float


class ReportBaseline(BaseModel):
    random_success_rate: float
    random_mean_steps: float
    learned_steps: float
    optimal_steps: int


class ReportRobustness(BaseModel):
    noise: List[NoisePoint]
    baseline: ReportBaseline


class PerformanceReport(BaseModel):
    meta: ReportMeta
    verdict: ReportVerdict
    efficiency: ReportEfficiency
    curves: ReportCurves
    knowledge: ReportKnowledge
    policy_accuracy: ReportPolicyAccuracy
    value_error: ReportValueError
    robustness: ReportRobustness


# ---------------------------------------------------------------------------
# Training Snapshot (frozen data from Trainer)
# ---------------------------------------------------------------------------

class TrainingSnapshot:
    """Frozen copy of all data needed to build a report."""

    def __init__(
        self,
        env: MazeWorld,
        q_table: np.ndarray,
        episode_log: List[Dict[str, Any]],
        visit_counts: np.ndarray,
        maze_index: int,
        seed: int,
        speed_mode: str,
    ):
        self.env = env
        self.q_table = q_table.copy()
        self.episode_log = list(episode_log)
        self.visit_counts = visit_counts.copy()
        self.maze_index = maze_index
        self.seed = seed
        self.speed_mode = speed_mode


# ---------------------------------------------------------------------------
# Value Iteration: Solve Q* and V*
# ---------------------------------------------------------------------------

def solve_optimal(env: MazeWorld, gamma: float) -> Tuple[np.ndarray, np.ndarray]:
    """Value iteration on env.next_state/reward/done to get exact Q* and V*.

    Returns (q_star, v_star) both shape (NUM_STATES,) and (NUM_STATES, NUM_ACTIONS).
    Tolerance 1e-10.
    """
    q = np.zeros((NUM_STATES, NUM_ACTIONS), dtype=np.float64)
    for _ in range(50000):
        v = np.max(q, axis=1)
        q_new = np.zeros_like(q)
        for s in range(NUM_STATES):
            for a in range(NUM_ACTIONS):
                ns = int(env.next_state[s, a])
                r = float(env.reward[s, a])
                d = bool(env.done[s, a])
                if d:
                    q_new[s, a] = r
                else:
                    q_new[s, a] = r + gamma * v[ns]
        if np.max(np.abs(q_new - q)) < 1e-10:
            q = q_new
            break
        q = q_new
    v_star = np.max(q, axis=1)
    return q, v_star


# ---------------------------------------------------------------------------
# BFS Distances
# ---------------------------------------------------------------------------

def bfs_distances(env: MazeWorld) -> Tuple[np.ndarray, np.ndarray]:
    """Compute dist_to_goal and dist_from_start for every reachable state.

    Returns two arrays of shape (NUM_STATES,) with -1 for walls/unreachable.
    """
    grid = env.grid

    def bfs_from(start_rc: Tuple[int, int]) -> np.ndarray:
        dist = np.full(NUM_STATES, -1, dtype=np.int32)
        sr, sc = start_rc
        ss = encode(sr, sc)
        dist[ss] = 0
        queue = deque([ss])
        while queue:
            s = queue.popleft()
            r, c = decode(s)
            for dr, dc in ACTIONS:
                nr, nc = r + dr, c + dc
                if 0 <= nr < MAZE_ROWS and 0 <= nc < MAZE_COLS and grid[nr][nc] != '#':
                    ns = encode(nr, nc)
                    if dist[ns] == -1:
                        dist[ns] = dist[s] + 1
                        queue.append(ns)
        return dist

    dist_from_start = bfs_from(env.start_pos)
    dist_to_goal = bfs_from(env.goal_pos)
    return dist_to_goal, dist_from_start


def optimal_action_sets(env: MazeWorld, dist_to_goal: np.ndarray) -> List[List[Optional[List[int]]]]:
    """For each state, the set of actions that move one step closer to goal in BFS distance."""
    grid = env.grid
    result: List[List[Optional[List[int]]]] = []
    for r in range(MAZE_ROWS):
        row: List[Optional[List[int]]] = []
        for c in range(MAZE_COLS):
            if grid[r][c] == '#':
                row.append(None)
            else:
                s = encode(r, c)
                d_s = dist_to_goal[s]
                if d_s <= 0:
                    # goal itself
                    row.append([])
                else:
                    good: List[int] = []
                    for a in range(NUM_ACTIONS):
                        ns = int(env.next_state[s, a])
                        if dist_to_goal[ns] == d_s - 1:
                            good.append(a)
                    row.append(good)
        result.append(row)
    return result


def on_path_states(dist_to_goal: np.ndarray, dist_from_start: np.ndarray, optimal_len: int) -> set:
    """States where dist_from_start + dist_to_goal == optimal_len."""
    on_path = set()
    for s in range(NUM_STATES):
        ds = int(dist_from_start[s])
        dg = int(dist_to_goal[s])
        if ds >= 0 and dg >= 0 and ds + dg == optimal_len:
            on_path.add(s)
    return on_path


# ---------------------------------------------------------------------------
# Greedy Rollouts
# ---------------------------------------------------------------------------

def greedy_rollouts(
    env: MazeWorld,
    q_table: np.ndarray,
    n: int = 100,
    eps: float = 0.0,
    rng: Optional[np.random.RandomState] = None,
    cap: int = MAX_ATTEMPT_STEPS,
) -> Tuple[List[int], List[bool]]:
    """Run n rollouts with epsilon-greedy on q_table. Returns (lengths, successes)."""
    if rng is None:
        rng = np.random.RandomState(0)
    lengths = []
    successes = []
    for _ in range(n):
        s = env.reset()
        steps = 0
        reached = False
        for _ in range(cap):
            if eps > 0 and rng.rand() < eps:
                a = int(rng.randint(NUM_ACTIONS))
            else:
                q_s = q_table[s]
                max_v = np.max(q_s)
                best = np.where(q_s == max_v)[0]
                a = int(rng.choice(best)) if len(best) > 1 else int(best[0])
            ns, _, done = env.step(s, a)
            steps += 1
            if ns == env.goal_state:
                reached = True
                break
            if done:
                break
            s = ns
        lengths.append(steps)
        successes.append(reached)
    return lengths, successes


# ---------------------------------------------------------------------------
# Policy Accuracy
# ---------------------------------------------------------------------------

def compute_policy_accuracy(
    env: MazeWorld,
    q_table: np.ndarray,
    opt_action_sets: List[List[Optional[List[int]]]],
    on_path_set: set,
    visit_counts: np.ndarray,
) -> Dict[str, float]:
    """Share of states whose greedy action is in the optimal set."""
    grid = env.grid
    counts = {
        'on_path_correct': 0, 'on_path_total': 0,
        'visited_correct': 0, 'visited_total': 0,
        'reachable_correct': 0, 'reachable_total': 0,
        'visited_states': 0, 'reachable_states': 0,
    }
    for r in range(MAZE_ROWS):
        for c in range(MAZE_COLS):
            if grid[r][c] == '#':
                continue
            s = encode(r, c)
            if s == env.goal_state:
                continue  # goal has no meaningful action
            opt_set = opt_action_sets[r][c]
            if opt_set is None or len(opt_set) == 0:
                continue

            greedy_a = int(np.argmax(q_table[s]))
            is_correct = greedy_a in opt_set
            counts['reachable_total'] += 1
            counts['reachable_states'] += 1
            if is_correct:
                counts['reachable_correct'] += 1

            if s in on_path_set:
                counts['on_path_total'] += 1
                if is_correct:
                    counts['on_path_correct'] += 1

            if visit_counts[s] >= 3:
                counts['visited_total'] += 1
                counts['visited_states'] += 1
                if is_correct:
                    counts['visited_correct'] += 1

    on_path_acc = counts['on_path_correct'] / max(1, counts['on_path_total'])
    visited_acc = counts['visited_correct'] / max(1, counts['visited_total'])
    reachable_acc = counts['reachable_correct'] / max(1, counts['reachable_total'])
    coverage = counts['visited_states'] / max(1, counts['reachable_states'])

    return {
        'on_path': round(on_path_acc, 4),
        'visited': round(visited_acc, 4),
        'reachable': round(reachable_acc, 4),
        'coverage': round(coverage, 4),
        'n_on_path': counts['on_path_total'],
        'n_on_path_correct': counts['on_path_correct'],
        'n_reachable': counts['reachable_total'],
        'n_reachable_correct': counts['reachable_correct'],
        'n_visited': counts['visited_total'],
        'n_visited_correct': counts['visited_correct'],
    }


# ---------------------------------------------------------------------------
# Value Error
# ---------------------------------------------------------------------------

def compute_value_error(
    env: MazeWorld,
    q_table: np.ndarray,
    v_star: np.ndarray,
    q_star: np.ndarray,
    on_path_set: set,
    visit_counts: np.ndarray,
    gamma: float,
) -> Dict[str, float]:
    """RMSE and max abs error of learned V vs V* on subsets; Bellman residual."""
    grid = env.grid
    v_learned = np.max(q_table, axis=1).astype(np.float64)

    errors_on_path = []
    errors_visited = []
    bellman_residuals = []

    for r in range(MAZE_ROWS):
        for c in range(MAZE_COLS):
            if grid[r][c] == '#':
                continue
            s = encode(r, c)
            if s == env.goal_state:
                continue

            err = abs(float(v_learned[s]) - float(v_star[s]))

            if s in on_path_set:
                errors_on_path.append(err)

            if visit_counts[s] >= 3:
                errors_visited.append(err)

                # Bellman residual for each action taken
                for a in range(NUM_ACTIONS):
                    ns = int(env.next_state[s, a])
                    r_sa = float(env.reward[s, a])
                    d = bool(env.done[s, a])
                    if d:
                        target = r_sa
                    else:
                        target = r_sa + gamma * float(v_learned[ns])
                    bellman_residuals.append(abs(float(q_table[s, a]) - target))

    rmse_on_path = float(np.sqrt(np.mean(np.array(errors_on_path) ** 2))) if errors_on_path else 0.0
    max_on_path = float(np.max(errors_on_path)) if errors_on_path else 0.0
    rmse_visited = float(np.sqrt(np.mean(np.array(errors_visited) ** 2))) if errors_visited else 0.0
    bellman_res = float(np.mean(bellman_residuals)) if bellman_residuals else 0.0

    return {
        'rmse_on_path': round(rmse_on_path, 6),
        'max_on_path': round(max_on_path, 6),
        'rmse_visited': round(rmse_visited, 6),
        'bellman_residual_visited': round(bellman_res, 6),
    }


# ---------------------------------------------------------------------------
# Regret
# ---------------------------------------------------------------------------

def compute_regret(episode_log: List[Dict[str, Any]], optimal_len: int) -> Tuple[float, float, List[float]]:
    """Per-episode regret = steps - optimal (truncated count as cap).
    Returns (total_regret, wasted_step_pct, cumulative_regret_list).
    """
    cum_regret: List[float] = []
    total_regret = 0.0
    total_steps = 0
    for ep in episode_log:
        steps = ep['steps']
        regret = steps - optimal_len
        total_regret += regret
        total_steps += steps
        cum_regret.append(total_regret)

    wasted_pct = (total_regret / max(1, total_steps)) * 100.0
    return total_regret, wasted_pct, cum_regret


# ---------------------------------------------------------------------------
# Milestones
# ---------------------------------------------------------------------------

def compute_milestones(episode_log: List[Dict[str, Any]], optimal_len: int) -> Dict[str, Optional[int]]:
    """Find milestone episodes."""
    first_goal = None
    within10 = None
    converged = None
    transitions_at_conv = None
    threshold = optimal_len * 1.1

    for ep in episode_log:
        idx = ep['index']
        if first_goal is None and ep['reached_goal']:
            first_goal = idx
        if within10 is None and ep['reached_goal'] and ep['steps'] <= threshold:
            within10 = idx
        if ep.get('converged', False):
            converged = idx
            transitions_at_conv = ep.get('cumulative_transitions', None)

    return {
        'first_goal_episode': first_goal,
        'within10pct_episode': within10,
        'converged_episode': converged,
        'transitions_at_convergence': transitions_at_conv,
    }


# ---------------------------------------------------------------------------
# Noise Sweep
# ---------------------------------------------------------------------------

def noise_sweep(
    env: MazeWorld,
    q_table: np.ndarray,
    epsilons: Optional[List[float]] = None,
    n_rollouts: int = 200,
) -> List[Dict[str, float]]:
    """Success rate, mean and p90 steps for the final greedy policy at various noise levels."""
    if epsilons is None:
        epsilons = [0.0, 0.02, 0.05, 0.1, 0.2, 0.3]
    results = []
    for eps in epsilons:
        rng = np.random.RandomState(42)
        lengths, successes = greedy_rollouts(env, q_table, n=n_rollouts, eps=eps, rng=rng)
        success_rate = sum(successes) / n_rollouts
        successful_lengths = [l for l, s in zip(lengths, successes) if s]
        mean_steps = float(np.mean(successful_lengths)) if successful_lengths else float(MAX_ATTEMPT_STEPS)
        p90_steps = float(np.percentile(successful_lengths, 90)) if successful_lengths else float(MAX_ATTEMPT_STEPS)
        results.append({
            'eps': eps,
            'success_rate': round(success_rate, 4),
            'mean_steps': round(mean_steps, 2),
            'p90_steps': round(p90_steps, 2),
        })
    return results


# ---------------------------------------------------------------------------
# Baseline Random Agent
# ---------------------------------------------------------------------------

def baseline_random(env: MazeWorld, n_episodes: int = 500) -> Dict[str, float]:
    """Success rate and mean steps (capped) of a uniformly random agent."""
    rng = np.random.RandomState(0)
    successes = 0
    total_steps = 0
    for _ in range(n_episodes):
        s = env.reset()
        steps = 0
        for _ in range(MAX_ATTEMPT_STEPS):
            a = int(rng.randint(NUM_ACTIONS))
            ns, _, done = env.step(s, a)
            steps += 1
            if ns == env.goal_state:
                successes += 1
                break
            if done:
                break
            s = ns
        total_steps += steps
    return {
        'random_success_rate': round(successes / n_episodes, 4),
        'random_mean_steps': round(total_steps / n_episodes, 2),
    }


# ---------------------------------------------------------------------------
# Bucket Downsample
# ---------------------------------------------------------------------------

def bucket_downsample(values: List, max_points: int = 400) -> Tuple[List[int], List]:
    """Downsample a list to at most max_points, preserving min and max per bucket."""
    n = len(values)
    if n <= max_points:
        return list(range(n)), list(values)

    bucket_size = n / max_points
    indices = []
    sampled = []
    for i in range(max_points):
        start = int(i * bucket_size)
        end = int((i + 1) * bucket_size)
        bucket = values[start:end]
        if not bucket:
            continue
        # Keep the point that has the min or max (alternate to preserve shape)
        if i % 2 == 0:
            idx = start + int(np.argmin(bucket))
        else:
            idx = start + int(np.argmax(bucket))
        indices.append(idx)
        sampled.append(values[idx])
    return indices, sampled


# ---------------------------------------------------------------------------
# Knowledge Grids
# ---------------------------------------------------------------------------

def build_knowledge_grids(
    env: MazeWorld,
    q_table: np.ndarray,
    v_star: np.ndarray,
    q_star: np.ndarray,
    opt_action_sets_grid: List[List[Optional[List[int]]]],
    visit_counts: np.ndarray,
) -> Dict[str, Any]:
    """Build 11x11 grids for the report knowledge section."""
    grid = env.grid
    v_learned_grid: List[List[Optional[float]]] = []
    v_star_grid: List[List[Optional[float]]] = []
    v_error_grid: List[List[Optional[float]]] = []
    policy_learned_grid: List[List[Optional[int]]] = []
    visit_grid: List[List[Optional[int]]] = []

    v_learned = np.max(q_table, axis=1).astype(np.float64)

    for r in range(MAZE_ROWS):
        vl_row: List[Optional[float]] = []
        vs_row: List[Optional[float]] = []
        ve_row: List[Optional[float]] = []
        pl_row: List[Optional[int]] = []
        vc_row: List[Optional[int]] = []
        for c in range(MAZE_COLS):
            if grid[r][c] == '#':
                vl_row.append(None)
                vs_row.append(None)
                ve_row.append(None)
                pl_row.append(None)
                vc_row.append(None)
            else:
                s = encode(r, c)
                vl_row.append(round(float(v_learned[s]), 6))
                vs_row.append(round(float(v_star[s]), 6))
                ve_row.append(round(abs(float(v_learned[s]) - float(v_star[s])), 6))
                pl_row.append(int(np.argmax(q_table[s])))
                vc_row.append(int(visit_counts[s]))
        v_learned_grid.append(vl_row)
        v_star_grid.append(vs_row)
        v_error_grid.append(ve_row)
        policy_learned_grid.append(pl_row)
        visit_grid.append(vc_row)

    return {
        'v_learned': v_learned_grid,
        'v_star': v_star_grid,
        'v_error_abs': v_error_grid,
        'policy_learned': policy_learned_grid,
        'policy_optimal_sets': opt_action_sets_grid,
        'visit_counts': visit_grid,
    }


# ---------------------------------------------------------------------------
# Build Report
# ---------------------------------------------------------------------------

def build_report(snapshot: TrainingSnapshot) -> Dict[str, Any]:
    """Build the full performance report from a frozen training snapshot.

    Returns JSON-serializable dict validated by the Pydantic PerformanceReport model.
    """
    env = snapshot.env
    q_table = snapshot.q_table
    episode_log = snapshot.episode_log
    visit_counts = snapshot.visit_counts
    gamma = GAMMA
    optimal_len = env.optimal_len

    # Solve optimal
    q_star, v_star = solve_optimal(env, gamma)

    # BFS distances
    dist_to_goal, dist_from_start = bfs_distances(env)

    # Optimal action sets and on-path states
    opt_sets = optimal_action_sets(env, dist_to_goal)
    on_path_set = on_path_states(dist_to_goal, dist_from_start, optimal_len)

    # Greedy rollouts
    rng = np.random.RandomState(42)
    lengths, successes = greedy_rollouts(env, q_table, n=100, eps=0.0, rng=rng)
    n_success = sum(successes)
    successful_lengths = [l for l, s in zip(lengths, successes) if s]
    n_optimal = sum(1 for l in successful_lengths if l == optimal_len)
    mean_greedy = float(np.mean(successful_lengths)) if successful_lengths else float(MAX_ATTEMPT_STEPS)

    # Verdict
    if n_success == 100 and n_optimal == 100:
        status = "optimal"
        gap_pct = 0.0
        sentence = f"The agent found the shortest path: {optimal_len} steps, matching the best possible {optimal_len} (gap 0%)."
    elif n_success == 100:
        gap_pct = round(((mean_greedy - optimal_len) / optimal_len) * 100, 1)
        if gap_pct <= 10:
            status = "near_optimal"
            sentence = f"The agent reaches the goal every time in {mean_greedy:.0f} steps on average. The shortest possible is {optimal_len} (gap {gap_pct}%)."
        else:
            status = "suboptimal"
            sentence = f"The agent reaches the goal but takes {mean_greedy:.0f} steps on average. The shortest possible is {optimal_len} (gap {gap_pct}%)."
    else:
        gap_pct = round(((mean_greedy - optimal_len) / optimal_len) * 100, 1) if successful_lengths else 100.0
        status = "failed"
        sentence = f"The agent fails to reach the goal in {100 - n_success} of 100 attempts."

    # Efficiency
    regret_total, wasted_pct, cum_regret = compute_regret(episode_log, optimal_len)
    milestones = compute_milestones(episode_log, optimal_len)
    wall_bumps_total = sum(ep.get('wall_bumps', 0) for ep in episode_log)

    # Curves (downsampled)
    all_steps = [ep['steps'] for ep in episode_log]
    all_eps_vals = [ep.get('epsilon_at_start', 0.0) for ep in episode_log]

    # Rolling 10 success rate
    rolling_success: List[float] = []
    window: List[bool] = []
    for ep in episode_log:
        window.append(ep['reached_goal'])
        if len(window) > 10:
            window.pop(0)
        rolling_success.append(sum(window) / len(window))

    ep_indices_raw = [ep['index'] for ep in episode_log]

    # Downsample curves
    ds_idx, ds_steps = bucket_downsample(all_steps, 400)
    _, ds_success = bucket_downsample(rolling_success, 400)
    _, ds_epsilon = bucket_downsample(all_eps_vals, 400)
    _, ds_cum_regret = bucket_downsample(cum_regret, 400)
    ds_ep_indices = [ep_indices_raw[i] for i in ds_idx]

    # Knowledge
    knowledge = build_knowledge_grids(env, q_table, v_star, q_star, opt_sets, visit_counts)

    # Policy accuracy
    pol_acc = compute_policy_accuracy(env, q_table, opt_sets, on_path_set, visit_counts)

    # Value error
    val_err = compute_value_error(env, q_table, v_star, q_star, on_path_set, visit_counts, gamma)

    # Robustness
    noise = noise_sweep(env, q_table)
    baseline = baseline_random(env)

    # Learned steps (greedy, no noise)
    learned_steps = mean_greedy

    maze_name = MAZE_PRESET_NAMES[snapshot.maze_index] if snapshot.maze_index < len(MAZE_PRESET_NAMES) else f"Maze {snapshot.maze_index}"

    report_dict = {
        'meta': {
            'maze_index': snapshot.maze_index,
            'maze_name': maze_name,
            'seed': snapshot.seed,
            'alpha': ALPHA,
            'gamma': GAMMA,
            'eps_start': EPSILON_START,
            'eps_floor': EPSILON_FLOOR,
            'speed_mode': snapshot.speed_mode,
            'optimal_len': optimal_len,
            'grid': list(env.grid),
        },
        'verdict': {
            'status': status,
            'greedy_len': round(mean_greedy, 2),
            'gap_pct': gap_pct,
            'rollouts_success': n_success,
            'rollouts_optimal': n_optimal,
            'sentence': sentence,
        },
        'efficiency': {
            'episodes_total': len(episode_log),
            'first_goal_episode': milestones['first_goal_episode'],
            'within10pct_episode': milestones['within10pct_episode'],
            'converged_episode': milestones['converged_episode'],
            'transitions_total': episode_log[-1]['cumulative_transitions'] if episode_log else 0,
            'transitions_at_convergence': milestones['transitions_at_convergence'],
            'regret_total': round(regret_total, 2),
            'wasted_step_pct': round(wasted_pct, 2),
            'wall_bumps_total': wall_bumps_total,
        },
        'curves': {
            'episode_index': ds_ep_indices,
            'steps': ds_steps,
            'success_rolling10': [round(v, 4) for v in ds_success],
            'epsilon': [round(v, 4) for v in ds_epsilon],
            'cum_regret': [round(v, 2) for v in ds_cum_regret],
        },
        'knowledge': knowledge,
        'policy_accuracy': pol_acc,
        'value_error': val_err,
        'robustness': {
            'noise': noise,
            'baseline': {
                'random_success_rate': baseline['random_success_rate'],
                'random_mean_steps': baseline['random_mean_steps'],
                'learned_steps': round(learned_steps, 2),
                'optimal_steps': optimal_len,
            },
        },
    }

    # Validate
    PerformanceReport(**report_dict)

    return report_dict
