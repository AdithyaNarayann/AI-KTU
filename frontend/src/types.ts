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
}

export type ClientCommand = { type: 'run' } | { type: 'reset' };

export interface MazeInfo {
  grid: string[];
  rows: number;
  cols: number;
  start: [number, number];
  goal: [number, number];
  optimal_len: number;
  optimal_path: [number, number][];
}
