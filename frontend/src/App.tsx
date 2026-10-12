import React, { useState, useEffect, useCallback } from 'react';
import { useTrainSocket } from './hooks/useTrainSocket';
import { DualGridCanvas } from './components/DualGridCanvas';
import { TilePalette } from './components/TilePalette';
import { StatusHeader } from './components/StatusHeader';
import { BellmanPanel } from './components/BellmanPanel';
import { MetricsCharts } from './components/MetricsCharts';
import { ControlsBar } from './components/ControlsBar';
import { TileType, AlgoType } from './types';
import { Brain } from 'lucide-react';

export const App: React.FC = () => {
  const {
    connected,
    latestFrame,
    history,
    isShocked,
    isConverged,
    isReplaying,
    sendCommand,
    startRecordedReplay,
    stopRecordedReplay,
  } = useTrainSocket();

  // Local state
  const [selectedTile, setSelectedTile] = useState<TileType>('#');
  const [algo, setAlgo] = useState<AlgoType>('q_learning');
  const [shaping, setShaping] = useState<boolean>(true);
  const [mode, setMode] = useState<'demo' | 'free'>('demo');
  const [speed, setSpeed] = useState<number>(1.0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Sync algo from frame if changed on server
  useEffect(() => {
    if (latestFrame?.algo && (latestFrame.algo === 'q_learning' || latestFrame.algo === 'sarsa')) {
      setAlgo(latestFrame.algo as AlgoType);
    }
  }, [latestFrame?.algo]);

  // Actions
  const handleStartDemo = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    sendCommand({
      type: 'start',
      mode,
      algo,
      seed: mode === 'demo' ? 42 : null,
      target_seconds: 75.0,
      shaping,
    });
  }, [mode, algo, shaping, sendCommand]);

  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      sendCommand({ type: 'resume' });
    } else {
      setIsPaused(true);
      sendCommand({ type: 'pause' });
    }
  }, [isPaused, sendCommand]);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    sendCommand({ type: 'reset' });
  }, [sendCommand]);

  const handleVictoryLap = useCallback(() => {
    sendCommand({ type: 'victory_lap' });
  }, [sendCommand]);

  const handleSetAlgo = useCallback(
    (newAlgo: AlgoType) => {
      setAlgo(newAlgo);
      sendCommand({ type: 'set_algo', algo: newAlgo });
    },
    [sendCommand]
  );

  const handleToggleShaping = useCallback(() => {
    setShaping((prev) => !prev);
  }, []);

  const handleToggleMode = useCallback((newMode: 'demo' | 'free') => {
    setMode(newMode);
  }, []);

  const handleChangeSpeed = useCallback(
    (newSpeed: number) => {
      setSpeed(newSpeed);
      sendCommand({ type: 'set_speed', speed: newSpeed });
    },
    [sendCommand]
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      sendCommand({
        type: 'edit',
        row,
        col,
        tile: selectedTile,
      });
    },
    [selectedTile, sendCommand]
  );

  // Keyboard Shortcuts: Space, R, L, 1, 2
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is focusing an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (!isRunning) handleStartDemo();
        else handlePauseResume();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleReset();
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        handleVictoryLap();
      } else if (e.key === '1') {
        e.preventDefault();
        handleSetAlgo('q_learning');
      } else if (e.key === '2') {
        e.preventDefault();
        handleSetAlgo('sarsa');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, handleStartDemo, handlePauseResume, handleReset, handleVictoryLap, handleSetAlgo]);

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-border bg-[#0b1220]/80 backdrop-blur-md px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-slate-950 shadow-md shadow-cyan-950">
            <Brain className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight font-mono text-white">
                WatchIt<span className="text-cyan-400">Learn</span>
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase font-bold">
                Live RL GridWorld Demo
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              University AI Course • Tabular Q-Learning & SARSA in 75s
            </p>
          </div>
        </div>

        {/* Keyboard shortcut hints */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200">Space</kbd> Start/Pause
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200">R</kbd> Reset
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200">L</kbd> Lap
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200">1</kbd>/<kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200">2</kbd> Algo
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto space-y-5">
        {/* Controls Bar */}
        <ControlsBar
          isRunning={isRunning}
          isPaused={isPaused}
          isReplaying={isReplaying}
          algo={algo}
          shaping={shaping}
          mode={mode}
          speed={speed}
          onStartDemo={handleStartDemo}
          onPauseResume={handlePauseResume}
          onReset={handleReset}
          onVictoryLap={handleVictoryLap}
          onSetAlgo={handleSetAlgo}
          onToggleShaping={handleToggleShaping}
          onToggleMode={handleToggleMode}
          onChangeSpeed={handleChangeSpeed}
          onReplayRecordedRun={startRecordedReplay}
          onStopReplay={stopRecordedReplay}
        />

        {/* Level Editor Palette */}
        <TilePalette selectedTile={selectedTile} onSelectTile={setSelectedTile} />

        {/* Core Layout: Left Grids, Right Analytics */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left: Dual Grid Canvas (7 cols on large screens) */}
          <div className="xl:col-span-7 flex flex-col gap-4">
            <DualGridCanvas
              frame={latestFrame}
              selectedTile={selectedTile}
              onCellClick={handleCellClick}
              isShocked={isShocked}
            />
          </div>

          {/* Right: Analytics, Bellman Updates, Metrics (5 cols on large screens) */}
          <div className="xl:col-span-5 flex flex-col gap-4">
            {/* Giant Timer & Status Header */}
            <StatusHeader
              frame={latestFrame}
              connected={connected}
              isReplaying={isReplaying}
              isConverged={isConverged}
            />

            {/* Live Bellman TD Substitution */}
            <BellmanPanel update={latestFrame?.update ?? null} />

            {/* Performance Charts */}
            <MetricsCharts history={history} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-[#0b1220] px-6 py-3 text-center text-xs font-mono text-slate-500">
        <span>WatchItLearn — Built from scratch with pure Python, NumPy, FastAPI & React. Zero Gym. Zero PyTorch.</span>
      </footer>
    </div>
  );
};

export default App;
