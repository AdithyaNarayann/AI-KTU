import { useState, useEffect, useRef, useCallback } from 'react';
import { ServerFrame, ClientCommand, PerformanceReport, BenchmarkResult } from '../types';
import recordedReportFallback from '../../../data/recorded_report.json';

const INITIAL_FRAME: ServerFrame = {
  stage: 'idle',
  t: 0,
  T: 40,
  attempt: 0,
  random_pct: 100,
  agent: [1, 1],
  trail: [[1, 1]],
  value: Array(11).fill(0).map(() => Array(11).fill(0)),
  best: Array(11).fill(0).map(() => Array(11).fill(0)),
  steps_history: [],
  result: null,
  best_steps: null,
  total_transitions: 0,
  optimal_steps: 32,
  maze_index: 0,
  grid: [
    "###########",
    "#S....#...#",
    "#.#####.#.#",
    "#.#...#.#.#",
    "#.#.#.#.#.#",
    "#.#.#...#.#",
    "#.#.#.#.#.#",
    "#...#.###.#",
    "#########.#",
    "#........G#",
    "###########",
  ],
  speed_mode: 'normal',
};

export interface BenchmarkSeedDot {
  seed: number;
  converged: boolean;
  converged_episode: number;
}

export function useRun() {
  const [frame, setFrame] = useState<ServerFrame>(INITIAL_FRAME);
  const [connected, setConnected] = useState<boolean>(false);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [benchmarkDots, setBenchmarkDots] = useState<BenchmarkSeedDot[]>([]);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);

  // Per-maze benchmark cache
  const benchmarkCache = useRef<Record<number, { result: BenchmarkResult; dots: BenchmarkSeedDot[] }>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const replayTimerRef = useRef<number | null>(null);
  const lastSolvedMazeRef = useRef<number | null>(null);

  const isReplayMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('replay') === '1';

  // Playback recorded run
  const startReplay = useCallback(async () => {
    try {
      let frames: ServerFrame[] = [];
      try {
        const res = await fetch('/api/recorded-run');
        if (res.ok) {
          frames = await res.json();
        }
      } catch {
        // Fallback
      }

      if (!frames.length) return;

      let idx = 0;
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
      replayTimerRef.current = window.setInterval(() => {
        if (idx < frames.length) {
          setFrame(frames[idx]);
          idx++;
        } else {
          if (replayTimerRef.current) clearInterval(replayTimerRef.current);
        }
      }, 40); // 25 Hz playback
    } catch (e) {
      console.warn('Replay failed:', e);
    }
  }, []);

  // Fetch report for latest run
  const fetchReport = useCallback(async () => {
    if (isReplayMode) {
      setReport(recordedReportFallback as unknown as PerformanceReport);
      return;
    }

    try {
      const res = await fetch('/api/report');
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (e) {
      console.warn('Could not fetch report:', e);
    }
  }, [isReplayMode]);

  useEffect(() => {
    if (isReplayMode) {
      setConnected(true);
      setReport(recordedReportFallback as unknown as PerformanceReport);
      return () => {
        if (replayTimerRef.current) clearInterval(replayTimerRef.current);
      };
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.port === '5173' ? '127.0.0.1:8000' : window.location.host;
    const wsUrl = `${protocol}//${host}/ws/train`;

    let socket: WebSocket;
    let reconnectTimeout: number;

    const connect = () => {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'benchmark_progress') {
            if (data.seed_result) {
              setBenchmarkDots((prev) => [
                ...prev,
                {
                  seed: data.seed_result.seed,
                  converged: data.seed_result.converged,
                  converged_episode: data.seed_result.converged_episode,
                },
              ]);
            }
          } else if (data.type === 'benchmark_result') {
            setBenchmarkResult(data);
            setIsBenchmarking(false);
            const mazeIdx = data.mazes?.[0]?.maze_index ?? 0;
            setBenchmarkDots((currentDots) => {
              benchmarkCache.current[mazeIdx] = {
                result: data,
                dots: currentDots,
              };
              return currentDots;
            });
          } else if (data.stage) {
            setFrame(data);
            if (data.stage === 'solved') {
              if (lastSolvedMazeRef.current !== data.maze_index) {
                lastSolvedMazeRef.current = data.maze_index ?? 0;
                fetchReport();
              }
            } else {
              lastSolvedMazeRef.current = null;
            }
          }
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };

      socket.onclose = () => {
        setConnected(false);
        reconnectTimeout = window.setTimeout(connect, 1500);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (socket) socket.close();
    };
  }, [isReplayMode, fetchReport]);

  const send = useCallback((cmd: ClientCommand) => {
    if (isReplayMode) {
      if (cmd.type === 'run') {
        startReplay();
      } else if (cmd.type === 'reset') {
        if (replayTimerRef.current) clearInterval(replayTimerRef.current);
        setFrame(INITIAL_FRAME);
      }
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    }
  }, [isReplayMode, startReplay]);

  const run = useCallback((speed?: number | string) => {
    setReport(null);
    lastSolvedMazeRef.current = null;
    send(speed !== undefined ? { type: 'run', speed } : { type: 'run' });
  }, [send]);

  const reset = useCallback(() => {
    setReport(null);
    lastSolvedMazeRef.current = null;
    send({ type: 'reset' });
  }, [send]);

  const setMaze = useCallback((index: number) => {
    setReport(null);
    lastSolvedMazeRef.current = null;
    send({ type: 'set_maze', index });
  }, [send]);

  const setSpeed = useCallback((speed: number | string) => {
    send({ type: 'set_speed', speed });
  }, [send]);

  const runBenchmarkForMaze = useCallback(async (mazeIndex: number) => {
    // Check in-memory cache
    if (benchmarkCache.current[mazeIndex]) {
      setBenchmarkResult(benchmarkCache.current[mazeIndex].result);
      setBenchmarkDots(benchmarkCache.current[mazeIndex].dots);
      setIsBenchmarking(false);
      return;
    }

    // Try instant fetch from REST endpoint /api/benchmark
    if (!isReplayMode) {
      try {
        const res = await fetch(`/api/benchmark?maze_index=${mazeIndex}`);
        if (res.ok) {
          const data = await res.json();
          const mazeData = data.mazes?.[0];
          if (mazeData && mazeData.seeds) {
            const dots = mazeData.seeds.map((s: any) => ({
              seed: s.seed,
              converged: s.converged,
              converged_episode: s.converged_episode,
            }));
            setBenchmarkDots(dots);
            setBenchmarkResult(data);
            benchmarkCache.current[mazeIndex] = {
              result: data,
              dots,
            };
            setIsBenchmarking(false);
            return;
          }
        }
      } catch {
        // Fallback to WebSocket
      }
    }

    // Fallback: trigger via WebSocket
    setBenchmarkDots([]);
    setBenchmarkResult(null);
    setIsBenchmarking(true);

    if (isReplayMode) {
      const staticDots: BenchmarkSeedDot[] = Array.from({ length: 20 }, (_, i) => ({
        seed: i,
        converged: true,
        converged_episode: 125,
      }));
      setBenchmarkDots(staticDots);
      setIsBenchmarking(false);
      return;
    }

    send({ type: 'benchmark', seeds: 20, maze_index: mazeIndex });
  }, [isReplayMode, send]);

  return {
    frame,
    connected,
    run,
    reset,
    setMaze,
    setSpeed,
    isReplayMode,
    report,
    fetchReport,
    benchmarkResult,
    benchmarkDots,
    isBenchmarking,
    runBenchmarkForMaze,
  };
}
