export type StageType = 'idle' | 'exploring' | 'learning' | 'converging' | 'solved';

export interface ResultData {
  steps: number;
  optimal: number;
}

export interface ServerFrame {
  stage: StageType;
  t: number;
  T: number;
  attempt: number;
  random_pct: number;
  agent: [number, number];
  trail: [number, number][];
  value: number[][];
  best: number[][];
  steps_history: number[];
  result?: ResultData | null;
  best_steps?: number | null;
  total_transitions?: number;
  optimal_steps?: number;
  maze_index?: number;
  grid?: string[];
  speed_mode?: string;
}

export type ClientCommand =
  | { type: 'run'; speed?: number | string }
  | { type: 'reset' }
  | { type: 'set_maze'; index: number }
  | { type: 'set_speed'; speed: number | string }
  | { type: 'benchmark'; seeds?: number };

export interface MazePreset {
  index: number;
  name: string;
  grid: string[];
}

export interface MazeInfo {
  grid: string[];
  rows: number;
  cols: number;
  start: [number, number];
  goal: [number, number];
  optimal_len: number;
  optimal_path: [number, number][];
  presets?: MazePreset[];
  active_index?: number;
}

// Performance Report Types
export interface ReportVerdict {
  status: 'optimal' | 'near_optimal' | 'suboptimal' | 'failed';
  greedy_len: number;
  gap_pct: number;
  rollouts_success: number;
  rollouts_optimal: number;
  sentence: string;
}

export interface ReportEfficiency {
  episodes_total: number;
  first_goal_episode: number | null;
  within10pct_episode: number | null;
  converged_episode: number | null;
  transitions_total: number;
  transitions_at_convergence: number | null;
  regret_total: number;
  wasted_step_pct: number;
  wall_bumps_total: number;
}

export interface ReportCurves {
  episode_index: number[];
  steps: number[];
  success_rolling10: number[];
  epsilon: number[];
  cum_regret: number[];
}

export interface ReportKnowledge {
  v_learned: (number | null)[][];
  v_star: (number | null)[][];
  v_error_abs: (number | null)[][];
  policy_learned: (number | null)[][];
  policy_optimal_sets: (number[] | null)[][];
  visit_counts: (number | null)[][];
}

export interface ReportPolicyAccuracy {
  on_path: number;
  visited: number;
  reachable: number;
  coverage: number;
}

export interface ReportValueError {
  rmse_on_path: number;
  max_on_path: number;
  rmse_visited: number;
  bellman_residual_visited: number;
}

export interface NoisePoint {
  eps: number;
  success_rate: number;
  mean_steps: number;
  p90_steps: number;
}

export interface ReportBaseline {
  random_success_rate: number;
  random_mean_steps: number;
  learned_steps: number;
  optimal_steps: number;
}

export interface ReportRobustness {
  noise: NoisePoint[];
  baseline: ReportBaseline;
}

export interface PerformanceReport {
  meta: {
    maze_index: number;
    maze_name: string;
    seed: number;
    alpha: number;
    gamma: number;
    eps_start: number;
    eps_floor: number;
    speed_mode: string;
    optimal_len: number;
  };
  verdict: ReportVerdict;
  efficiency: ReportEfficiency;
  curves: ReportCurves;
  knowledge: ReportKnowledge;
  policy_accuracy: ReportPolicyAccuracy;
  value_error: ReportValueError;
  robustness: ReportRobustness;
}

export interface BenchmarkMazeStats {
  maze_index: number;
  maze_name: string;
  optimal_len: number;
  n_seeds: number;
  success_rate: number;
  episodes: {
    median: number;
    mean: number;
    mean_ci: [number, number];
    iqm: number;
    iqm_ci: [number, number];
    std: number;
    min: number;
    max: number;
  } | null;
  transitions: {
    median: number;
    mean: number;
    iqm: number;
  } | null;
  learning_curve: {
    episode_indices: number[];
    median: number[];
    p25: number[];
    p75: number[];
  };
  reliability_curve: {
    episode_indices: number[];
    fraction_converged: number[];
  };
}

export interface BenchmarkResult {
  n_seeds: number;
  mazes: BenchmarkMazeStats[];
  method_note: string;
  sensitivity?: {
    alphas: number[];
    gammas: number[];
    grid: (number | string)[][];
  };
}
