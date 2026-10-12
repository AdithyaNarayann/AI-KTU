import { useState, useEffect, useRef, useCallback } from 'react';
import { ServerFrame, ClientCommand } from '../types';

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
};

export function useRun() {
  const [frame, setFrame] = useState<ServerFrame>(INITIAL_FRAME);
  const [connected, setConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const replayTimerRef = useRef<number | null>(null);

  const isReplayMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('replay') === '1';

  // Playback recorded run
  const startReplay = useCallback(async () => {
    try {
      const res = await fetch('/api/recorded-run');
      if (!res.ok) throw new Error('Recorded run not found');
      const frames: ServerFrame[] = await res.json();
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
      console.warn('Replay fetch failed:', e);
    }
  }, []);

  useEffect(() => {
    if (isReplayMode) {
      setConnected(true);
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
          const data: ServerFrame = JSON.parse(event.data);
          setFrame(data);
        } catch (e) {
          console.error('Failed to parse frame JSON:', e);
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
  }, [isReplayMode]);

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

  return { frame, connected, run, reset, setMaze, setSpeed, isReplayMode };
}
