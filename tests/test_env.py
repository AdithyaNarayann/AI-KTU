"""Unit tests for GridWorld environment: BFS optimum, key, door, lava, and edit logic."""

import pytest
from app.env import GridWorld, encode_state, decode_state
from app.config import (
    DEFAULT_ASCII_LAYOUT,
    ACTION_UP,
    ACTION_DOWN,
    ACTION_LEFT,
    ACTION_RIGHT,
    REWARD_STEP,
    REWARD_LAVA,
    REWARD_GOAL,
    REWARD_KEY_SHAPING,
)


def test_bfs_optimum_default_layout():
    """Verify that the default layout has BFS optimal path length of 14."""
    env = GridWorld()
    assert env.optimal_len == 14, f"Expected BFS optimal length 14, got {env.optimal_len}"

    # Verify start and goal
    assert env.start_pos == (1, 1)
    assert env.goal_pos == (6, 6)
    assert env.key_pos == (5, 1)
    assert env.door_pos == (3, 5)

    # Verify that the path starts at S and ends at G
    assert env.optimal_path[0] == (1, 1)
    assert env.optimal_path[-1] == (6, 6)

    # Verify key is visited before door
    key_idx = env.optimal_path.index((5, 1))
    door_idx = env.optimal_path.index((3, 5))
    assert key_idx < door_idx, "Optimal path must visit Key before Door"


def test_locked_door_blocks_agent_without_key():
    """Agent without key attempting to enter door stays in place."""
    env = GridWorld()
    # Position agent at (3, 4), which is immediately west of door at (3, 5)
    s_no_key = encode_state(3, 4, 0)
    next_s, reward, done = env.step(s_no_key, ACTION_RIGHT)

    assert next_s == s_no_key, "Agent without key must stay in place when bumping locked door"
    assert reward == pytest.approx(REWARD_STEP)
    assert done is False


def test_unlocked_door_allows_passage_with_key():
    """Agent with key entering door successfully transitions into door cell."""
    env = GridWorld()
    # Position agent at (3, 4) with has_key = 1
    s_has_key = encode_state(3, 4, 1)
    next_s, reward, done = env.step(s_has_key, ACTION_RIGHT)

    expected_s = encode_state(3, 5, 1)
    assert next_s == expected_s, "Agent with key must enter door cell (3, 5)"
    assert reward == pytest.approx(REWARD_STEP)
    assert done is False


def test_key_pickup_changes_state_and_gives_shaping_reward():
    """Stepping onto key tile gives key and shaping reward."""
    # Shaping ON
    env = GridWorld(shaping=True)
    # Position agent at (4, 1), step down onto key at (5, 1)
    s_before = encode_state(4, 1, 0)
    next_s, reward, done = env.step(s_before, ACTION_DOWN)

    expected_s = encode_state(5, 1, 1)
    assert next_s == expected_s, "Stepping on key must change state to has_key=1"
    expected_reward = REWARD_STEP + REWARD_KEY_SHAPING
    assert abs(reward - expected_reward) < 1e-5, f"Expected {expected_reward}, got {reward}"
    assert done is False

    # Shaping OFF (purist mode)
    env_purist = GridWorld(shaping=False)
    next_s_p, reward_p, _ = env_purist.step(s_before, ACTION_DOWN)
    assert next_s_p == expected_s
    assert abs(reward_p - REWARD_STEP) < 1e-5, f"Purist reward should be {REWARD_STEP}, got {reward_p}"


def test_lava_is_fatal_and_terminal():
    """Stepping into lava yields -1 reward and terminates."""
    env = GridWorld()
    # Agent at (6, 1) stepping right into lava at (6, 2)
    s = encode_state(6, 1, 0)
    next_s, reward, done = env.step(s, ACTION_RIGHT)

    expected_s = encode_state(6, 2, 0)
    assert next_s == expected_s
    assert reward == REWARD_LAVA
    assert done is True


def test_level_edit_recomputes_tables_and_bfs():
    """Editing level immediately recomputes transition tables and BFS."""
    env = GridWorld()
    initial_len = env.optimal_len
    assert initial_len == 14

    # Add a wall at (4, 3) to lengthen or obstruct the path
    env.edit_tile(4, 3, "#")
    # Path still exists around it
    assert env.optimal_len >= 14

    # Move goal to (4, 6)
    env.edit_tile(4, 6, "G")
    assert env.goal_pos == (4, 6)
    # BFS should reflect the new goal location
    assert env.optimal_len > 0
    assert env.optimal_path[-1] == (4, 6)
