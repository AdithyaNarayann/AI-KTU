import { useState, useEffect, useRef, useCallback } from 'react';
import { FrameMessage, EventMessage, ServerMessage, ClientCommand, HistoryPoint } from '../types';

export interface UseTrainSocketReturn {
  connected: boolean;
  latestFrame: FrameMessage | null;
  history: HistoryPoint[];
  lastEvent: EventMessage | null;
  isShocked: boolean;
  isConverged: boolean;
  isReplaying: boolean;
  sendCommand: (cmd: ClientCommand) => void;
  startRecordedReplay: () => Promise<void>;
  stopRecordedReplay: () => void;
}

export function useTrainSocket(): UseTrainSocketReturn {
  const [connected, setConnected] = useState(false);
  const [latestFrame, setLatestFrame] = useState<FrameMessage | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [lastEvent, setLastEvent] = useState<EventMessage | null>(null);
  const [isShocked, setIsShocked] = useState(false);
  const [isConverged, setIsConverged] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pendingFrameRef = useRef<FrameMessage | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const replayIntervalRef = useRef<number | null>(null);

  // Shock timeout
  const shockTimerRef = useRef<number | null>(null);

  // Push history point periodically (every ~10-15 episodes or ~0.5s)
  const lastHistoryTimeRef = useRef<number>(0);

  // RAF loop for buttery-smooth rendering without dropping frames or blocking UI
  const processFrameRaf = useCallback(() => {
    if (pendingFrameRef.current) {
      const frame = pendingFrameRef.current;
      setLatestFrame(frame);

      // Record history sample at ~2 Hz
      const now = performance.now();
      if (now - lastHistoryTimeRef.current >= 400 && frame.metrics) {
        lastHistoryTimeRef.current = now;
        setHistory((prev) => {
          const nextPt: HistoryPoint = {
            episode: frame.episode,
            t_elapsed: frame.t_elapsed,
            ret_ma: frame.metrics.ret_ma,
            success_ma: frame.metrics.success_ma,
            greedy_success: frame.metrics.greedy_success,
            steps_ma: frame.metrics.steps_ma,
            epsilon: frame.epsilon,
          };
          // Keep up to 100 historical points for clean charts
          if (prev.length > 100) {
            return [...prev.slice(prev.length - 99), nextPt];
          }
          return [...prev, nextPt];
        });
      }
      pendingFrameRef.current = null;
    }
    rafIdRef.current = requestAnimationFrame(processFrameRaf);
  }, []);

  useEffect(() => {
    rafIdRef.current = requestAnimationFrame(processFrameRaf);
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [processFrameRaf]);

  // Connect WebSocket
  const connectWs = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const backendPort = window.location.port === '8000' || !window.location.port ? window.location.port : '8000';
    const host = `${window.location.hostname}${backendPort ? `:${backendPort}` : ''}`;
    const wsUrl = `${protocol}//${host}/ws/train`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === 'frame') {
          pendingFrameRef.current = msg;
        } else if (msg.type === 'event') {
          setLastEvent(msg);
          if (msg.event === 'shock') {
            setIsShocked(true);
            if (shockTimerRef.current) clearTimeout(shockTimerRef.current);
            shockTimerRef.current = window.setTimeout(() => setIsShocked(false), 900);
          } else if (msg.event === 'converged') {
            setIsConverged(true);
          } else if (msg.event === 'lap_done') {
            // Victory lap ended
          }
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      socketRef.current = null;
      // Auto-reconnect with 1.5s delay
      if (!isReplaying) {
        reconnectTimeoutRef.current = window.setTimeout(connectWs, 1500);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    socketRef.current = ws;
  }, [isReplaying]);

  useEffect(() => {
    connectWs();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connectWs]);

  // Send command
  const sendCommand = useCallback(
    (cmd: ClientCommand) => {
      if (cmd.type === 'start' || cmd.type === 'reset') {
        setHistory([]);
        setIsConverged(false);
      }
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify(cmd));
      } else {
        console.warn('Socket not open. Command ignored:', cmd);
      }
    },
    []
  );

  // Fallback: Recorded run playback
  const startRecordedReplay = useCallback(async () => {
    try {
      setIsReplaying(true);
      setHistory([]);
      setIsConverged(false);

      const backendPort = window.location.port === '8000' || !window.location.port ? '' : `:${window.location.port === '8000' ? '' : '8000'}`;
      const apiUrl = `${window.location.protocol}//${window.location.hostname}${backendPort}/api/recorded-run`;
      const resp = await fetch(apiUrl);
      if (!resp.ok) {
        throw new Error('Recorded run not available on server.');
      }
      const frames: ServerMessage[] = await resp.json();

      let idx = 0;
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);

      replayIntervalRef.current = window.setInterval(() => {
        if (idx >= frames.length) {
          if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
          setIsReplaying(false);
          return;
        }

        const item = frames[idx++];
        if (item.type === 'frame') {
          pendingFrameRef.current = item;
        } else if (item.type === 'event') {
          setLastEvent(item);
          if (item.event === 'converged') setIsConverged(true);
          if (item.event === 'shock') {
            setIsShocked(true);
            setTimeout(() => setIsShocked(false), 800);
          }
        }
      }, 33); // ~30 fps replay
    } catch (err) {
      console.error('Replay failed:', err);
      setIsReplaying(false);
    }
  }, []);

  const stopRecordedReplay = useCallback(() => {
    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = null;
    }
    setIsReplaying(false);
  }, []);

  return {
    connected,
    latestFrame,
    history,
    lastEvent,
    isShocked,
    isConverged,
    isReplaying,
    sendCommand,
    startRecordedReplay,
    stopRecordedReplay,
  };
}
