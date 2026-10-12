export type TileType = '.' | '#' | 'L' | 'K' | 'D' | 'S' | 'G';

export type AlgoType = 'q_learning' | 'sarsa';

export interface AgentState {
  r: number;
  c: number;
  has_key: boolean;
}

export interface Metrics {
  ret_ma: number;
  success_ma: number;
  steps_ma: number;
  greedy_success: number;
  optimal_len: number;
  greedy_len: number;
}

export interface BellmanUpdate {
  s: [number, number, number]; // (r, c, k)
  a: number;
  r: number;
  s2: [number, number, number]; // (nr, nc, nk)
  old_q: number;
  target: number;
  new_q: number;
  algo: string;
}

export interface FrameMessage {
  type: 'frame';
  t_elapsed: number;
  t_target: number;
  episode: number;
  epsilon: number;
  algo: string;
  agent: AgentState;
  trail: [number, number][];
  q_max: number[][][]; // [2][8][8]
  policy: number[][][]; // [2][8][8]
  grid: string[]; // 8 strings
  metrics: Metrics;
  update: BellmanUpdate | null;
}

export interface EventMessage {
  type: 'event';
  event: 'converged' | 'shock' | 'lap_done' | 'error';
  episode?: number;
  t_elapsed?: number;
  row?: number;
  col?: number;
  tile?: string;
  message?: string;
}

export type ServerMessage = FrameMessage | EventMessage;

export interface StartCommandPayload {
  type: 'start';
  mode: 'demo' | 'free';
  algo: AlgoType;
  seed: number | null;
  target_seconds: number;
  shaping: boolean;
}

export interface EditCommandPayload {
  type: 'edit';
  row: number;
  col: number;
  tile: string;
}

export interface SetAlgoCommandPayload {
  type: 'set_algo';
  algo: AlgoType;
}

export interface SetSpeedCommandPayload {
  type: 'set_speed';
  speed: number;
}

export interface SimpleCommandPayload {
  type: 'pause' | 'resume' | 'reset' | 'victory_lap';
}

export type ClientCommand =
  | StartCommandPayload
  | EditCommandPayload
  | SetAlgoCommandPayload
  | SetSpeedCommandPayload
  | SimpleCommandPayload;

export interface HistoryPoint {
  episode: number;
  t_elapsed: number;
  ret_ma: number;
  success_ma: number;
  greedy_success: number;
  steps_ma: number;
  epsilon: number;
}
