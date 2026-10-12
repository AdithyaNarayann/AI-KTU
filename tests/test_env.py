"""Unit tests for MazeWorld environment and hand-verified BFS optimum."""

import pytest
from app.env import MazeWorld, encode, decode
from app.config import (
    ACTION_UP,
    ACTION_DOWN,
    ACTION_LEFT,
    ACTION_RIGHT,
    REWARD_STEP,
    REWARD_GOAL,
)

# Hand-verified BFS optimal path coordinates (28 steps from (1, 1) to (9, 9)):
HAND_VERIFIED_PATH = [
    (1, 1),
    (2, 1), (3, 1), (4, 1), (5, 1), (6, 1), (7, 1),
    (7, 2), (7, 3), (7, 4), (7, 5), (7, 6), (7, 7),
    (6, 7), (5, 7), (4, 7), (3, 7), (2, 7), (1, 7),
    (1, 8), (1, 9),
    (2, 9), (3, 9), (4, 9), (5, 9), (6, 9), (7, 9), (8, 9), (9, 9)
]


def test_bfs_optimum_equals_hand_verified_path():
    """Verify that BFS length equals exactly 28 steps and matches the hand-verified path."""
    env = MazeWorld()
    assert env.optimal_len == 28, f"Expected BFS optimal length 28, got {env.optimal_len}"
    assert len(HAND_VERIFIED_PATH) - 1 == 28
    assert env.optimal_path == HAND_VERIFIED_PATH, "BFS path must match hand-verified coordinates"
    assert env.start_pos == (1, 1)
    assert env.goal_pos == (9, 9)


def test_wall_collision_wastes_step():
    """Walking into an outer or inner wall stays in place and costs -0.01."""
    env = MazeWorld()
    start_s = env.reset()

    # Try moving UP into outer wall at (0, 1)
    next_s, reward, done = env.step(start_s, ACTION_UP)
    assert next_s == start_s
    assert reward == pytest.approx(REWARD_STEP)
    assert done is False

    # Try moving LEFT into outer wall at (1, 0)
    next_s, reward, done = env.step(start_s, ACTION_LEFT)
    assert next_s == start_s
    assert reward == pytest.approx(REWARD_STEP)
    assert done is False


def test_goal_terminal_reward():
    """Stepping onto the goal tile yields +1.0 and marks episode as done."""
    env = MazeWorld()
    # Cell immediately north of goal is (8, 9)
    s_before_goal = encode(8, 9)
    next_s, reward, done = env.step(s_before_goal, ACTION_DOWN)

    assert next_s == env.goal_state
    assert reward == pytest.approx(REWARD_GOAL)
    assert done is True
