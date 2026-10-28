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

export function useRun() {
  const [frame, setFrame] = useState<ServerFrame>(INITIAL_FRAME);
  const [connected, setConnected] = useState<boolean>(false);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [benchmarkProgress, setBenchmarkProgress] = useState<{ done: number; total: number } | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const replayTimerRef = useRef<number | null>(null);

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

  // Fetch performance report
  const fetchReport = useCallback(async () => {
    setIsLoadingReport(true);
    if (isReplayMode) {
      // In offline replay mode, show recorded report directly
      setReport(recordedReportFallback as unknown as PerformanceReport);
      setIsLoadingReport(false);
      return;
    }

    try {
      const res = await fetch('/api/report');
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      } else if (res.status === 409) {
        // Fallback to recorded report if available
        setReport(recordedReportFallback as unknown as PerformanceReport);
      }
    } catch {
      // Offline fallback
      setReport(recordedReportFallback as unknown as PerformanceReport);
    } finally {
      setIsLoadingReport(false);
    }
  }, [isReplayMode]);

  useEffect(() => {
    if (isReplayMode) {
      setConnected(true);
      // Auto-set the fallback report for instant inspection
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
            setBenchmarkProgress({ done: data.done, total: data.total });
          } else if (data.type === 'benchmark_result') {
            setBenchmarkResult(data);
            setIsBenchmarking(false);
            setBenchmarkProgress(null);
          } else if (data.stage) {
            setFrame(data);
            if (data.stage === 'solved') {
              // Automatically fetch fresh report when solved
              fetchReport();
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
    send(speed !== undefined ? { type: 'run', speed } : { type: 'run' });
  }, [send]);

  const reset = useCallback(() => send({ type: 'reset' }), [send]);

  const setMaze = useCallback((index: number) => {
    send({ type: 'set_maze', index });
  }, [send]);

  const setSpeed = useCallback((speed: number | string) => {
    send({ type: 'set_speed', speed });
  }, [send]);

  const runBenchmark = useCallback((seeds: number = 20) => {
    setIsBenchmarking(true);
    setBenchmarkProgress({ done: 0, total: seeds * 3 });
    send({ type: 'benchmark', seeds });
  }, [send]);

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
    isLoadingReport,
    benchmarkResult,
    benchmarkProgress,
    isBenchmarking,
    runBenchmark,
  };
}
