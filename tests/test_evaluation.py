"""Tests for evaluation module: value iteration, policy accuracy, report schema, and benchmark."""

import numpy as np
import pytest

from app.config import (
    ALPHA,
    GAMMA,
    MAZE_PRESETS,
    NUM_STATES,
    NUM_ACTIONS,
    REWARD_STEP,
    REWARD_GOAL,
    MAX_ATTEMPT_STEPS,
)
from app.env import MazeWorld, encode
from app.evaluation import (
    solve_optimal,
    bfs_distances,
    optimal_action_sets,
    on_path_states,
    greedy_rollouts,
    compute_policy_accuracy,
    build_report,
    TrainingSnapshot,
    PerformanceReport,
)
from app.evaluate import (
    run_single_seed,
    bootstrap_ci,
    _interquartile_mean,
)


class TestBellmanEquation:
    """Test 1: Q* satisfies the Bellman equation within 1e-6."""

    def test_bellman_equation_labyrinth(self):
        env = MazeWorld(layout=MAZE_PRESETS[0])
        q_star, v_star = solve_optimal(env, GAMMA)

        max_residual = 0.0
        for s in range(NUM_STATES):
            r, c = s // 11, s % 11
            if env.grid[r][c] == '#':
                continue
            for a in range(NUM_ACTIONS):
                ns = int(env.next_state[s, a])
                reward = float(env.reward[s, a])
                done = bool(env.done[s, a])
                if done:
                    expected = reward
                else:
                    expected = reward + GAMMA * v_star[ns]
                residual = abs(q_star[s, a] - expected)
                max_residual = max(max_residual, residual)

        assert max_residual < 1e-6, f"Max Bellman residual {max_residual:.2e} exceeds 1e-6"

    def test_bellman_equation_all_mazes(self):
        for i, layout in enumerate(MAZE_PRESETS):
            env = MazeWorld(layout=layout)
            q_star, v_star = solve_optimal(env, GAMMA)
            for s in range(NUM_STATES):
                r, c = s // 11, s % 11
                if env.grid[r][c] == '#':
                    continue
                for a in range(NUM_ACTIONS):
                    ns = int(env.next_state[s, a])
                    reward = float(env.reward[s, a])
                    done = bool(env.done[s, a])
                    expected = reward if done else reward + GAMMA * v_star[ns]
                    assert abs(q_star[s, a] - expected) < 1e-6, \
                        f"Maze {i}, state {s}, action {a}: residual {abs(q_star[s, a] - expected):.2e}"


class TestVStarClosedForm:
    """Test 2: V*(start) equals the closed-form expression for the optimal path."""

    def test_v_star_closed_form_labyrinth(self):
        env = MazeWorld(layout=MAZE_PRESETS[0])
        _, v_star = solve_optimal(env, GAMMA)
        d = env.optimal_len  # BFS length = number of steps

        # Confirm reward structure from env tables:
        # d-1 steps of REWARD_STEP, then 1 step of REWARD_GOAL
        # V*(start) = sum_{k=0}^{d-2} gamma^k * REWARD_STEP + gamma^{d-1} * REWARD_GOAL
        v_closed = REWARD_STEP * (1 - GAMMA ** (d - 1)) / (1 - GAMMA) + GAMMA ** (d - 1) * REWARD_GOAL

        assert abs(v_star[env.start_state] - v_closed) < 1e-6, \
            f"V*(start)={v_star[env.start_state]:.10f}, closed form={v_closed:.10f}"

    def test_v_star_closed_form_all_mazes(self):
        for i, layout in enumerate(MAZE_PRESETS):
            env = MazeWorld(layout=layout)
            _, v_star = solve_optimal(env, GAMMA)
            d = env.optimal_len
            v_closed = REWARD_STEP * (1 - GAMMA ** (d - 1)) / (1 - GAMMA) + GAMMA ** (d - 1) * REWARD_GOAL
            assert abs(v_star[env.start_state] - v_closed) < 1e-6, \
                f"Maze {i}: V*(start)={v_star[env.start_state]:.10f}, closed={v_closed:.10f}"


class TestQStarPolicyAccuracy:
    """Test 3: A Q-table built from Q* gives 100% on-path policy accuracy."""

    def test_perfect_policy_on_path(self):
        env = MazeWorld(layout=MAZE_PRESETS[0])
        q_star, v_star = solve_optimal(env, GAMMA)
        dist_to_goal, dist_from_start = bfs_distances(env)
        opt_sets = optimal_action_sets(env, dist_to_goal)
        on_path_set = on_path_states(dist_to_goal, dist_from_start, env.optimal_len)

        # Use Q* as the learned Q-table. Every state visited by Q* should have perfect accuracy.
        visit_counts = np.ones(NUM_STATES, dtype=np.int32) * 10  # pretend all visited
        acc = compute_policy_accuracy(env, q_star.astype(np.float32), opt_sets, on_path_set, visit_counts)

        assert acc['on_path'] == 1.0, f"On-path accuracy with Q* should be 1.0, got {acc['on_path']}"
        # Reachable accuracy should also be 1.0 since Q* is optimal everywhere
        assert acc['reachable'] == 1.0, f"Reachable accuracy with Q* should be 1.0, got {acc['reachable']}"


class TestHeadlessDeterminism:
    """Test 4: The headless runner is deterministic per seed."""

    def test_deterministic_same_seed(self):
        r1 = run_single_seed(seed=42, maze_index=0)
        r2 = run_single_seed(seed=42, maze_index=0)

        assert r1['converged'] == r2['converged']
        assert r1['converged_episode'] == r2['converged_episode']
        assert r1['transitions'] == r2['transitions']
        assert r1['steps_per_episode'] == r2['steps_per_episode']

    def test_different_seeds_differ(self):
        r1 = run_single_seed(seed=0, maze_index=0)
        r2 = run_single_seed(seed=1, maze_index=0)
        # Different seeds should (almost certainly) produce different step histories
        assert r1['steps_per_episode'] != r2['steps_per_episode']


class TestReportSchema:
    """Test 5: Report JSON passes the Pydantic schema."""

    def test_report_validates(self):
        """Build a report from a quick training run and validate the schema."""
        from app.agents import QLearningAgent

        env = MazeWorld(layout=MAZE_PRESETS[0])
        agent = QLearningAgent(seed=42)

        # Quick training: 200 episodes
        episode_log = []
        visit_counts = np.zeros(NUM_STATES, dtype=np.int32)
        transitions = 0

        for ep in range(200):
            eps = max(0.02, 1.0 - ep / 60.0)
            s = env.reset()
            steps = 0
            ep_return = 0.0
            wall_bumps = 0
            reached = False

            for _ in range(MAX_ATTEMPT_STEPS):
                a = agent.select_action(s, eps)
                ns, r, done = env.step(s, a)
                steps += 1
                transitions += 1
                ep_return += r
                if ns == s and not done:
                    wall_bumps += 1
                visit_counts[s] += 1
                agent.update(s, a, r, ns, done)
                s = ns
                if done:
                    if ns == env.goal_state:
                        reached = True
                    break

            episode_log.append({
                'index': ep,
                'steps': steps,
                'reached_goal': reached,
                'return': round(ep_return, 6),
                'wall_bumps': wall_bumps,
                'epsilon_at_start': round(eps, 6),
                'cumulative_transitions': transitions,
            })

        # Mark last as converged for testing
        episode_log[-1]['converged'] = True

        snapshot = TrainingSnapshot(
            env=env,
            q_table=agent.q_table,
            episode_log=episode_log,
            visit_counts=visit_counts,
            maze_index=0,
            seed=42,
            speed_mode='step',
        )

        report = build_report(snapshot)

        # Validate with Pydantic
        validated = PerformanceReport(**report)
        assert validated.meta.maze_index == 0
        assert validated.meta.optimal_len == 32
        assert validated.verdict.status in ('optimal', 'near_optimal', 'suboptimal', 'failed')
        assert len(validated.curves.episode_index) > 0
        assert len(validated.knowledge.v_learned) == 11
        assert len(validated.knowledge.v_learned[0]) == 11


class TestBootstrapCI:
    """Test 6: Bootstrap CI collapses on constant data."""

    def test_constant_data_collapses(self):
        data = np.full(20, 42.0)
        point, ci_low, ci_high = bootstrap_ci(data, np.mean)
        assert point == 42.0
        assert ci_low == 42.0
        assert ci_high == 42.0

    def test_constant_iqm_collapses(self):
        data = np.full(20, 100.0)
        point, ci_low, ci_high = bootstrap_ci(data, _interquartile_mean)
        assert point == 100.0
        assert ci_low == 100.0
        assert ci_high == 100.0

    def test_nontrivial_ci_is_ordered(self):
        rng = np.random.RandomState(0)
        data = rng.normal(50, 10, size=100)
        point, ci_low, ci_high = bootstrap_ci(data, np.mean)
        assert ci_low <= point <= ci_high
        assert ci_low < ci_high  # non-degenerate
