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
  | { type: 'set_speed'; speed: number | string };

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
