import { useState, useEffect, useMemo, FC } from 'react';
import { useRun } from './hooks/useRun';
import { Maze } from './components/Maze';
import { Sparkline } from './components/Sparkline';
import { ReportModal } from './components/ReportModal';
import { ServerFrame } from './types';

const MAZE_OPTIONS = [
  { index: 0, label: 'Labyrinth' },
  { index: 1, label: 'Classic' },
  { index: 2, label: 'Zig-Zag' },
];

const SPEED_PRESETS = [
  { id: 'step', label: 'Step by step', value: 'step' },
  { id: 'normal', label: 'Normal', value: 40 },
  { id: 'fast', label: 'Fast', value: 15 },
];

function getStatusSentence(frame: ServerFrame): string {
  if (frame.stage === 'idle') {
    return 'Press Run. The agent starts knowing nothing about this maze.';
  }
  if (frame.stage === 'exploring') {
    return 'Exploring. Mostly random moves, bumping into walls and dead ends.';
  }
  if (frame.stage === 'learning') {
    return 'Learning. Squares near the goal glow as the agent remembers what worked.';
  }
  if (frame.stage === 'converging') {
    return 'Almost there. The agent now mostly follows the path it trusts.';
  }
  if (frame.stage === 'solved') {
    const steps = frame.result?.steps ?? frame.optimal_steps ?? 32;
    const optimal = frame.result?.optimal ?? frame.optimal_steps ?? 32;
    if (steps === optimal) {
      return `Solved in ${steps} steps. That matches the shortest possible path.`;
    }
    return `Solved in ${steps} steps. The shortest possible is ${optimal}.`;
  }
  return '';
}

export const App: FC = () => {
  const {
    frame,
    run,
    setMaze,
    setSpeed,
    report,
    runBenchmark,
    isBenchmarking,
    benchmarkProgress,
    benchmarkResult,
  } = useRun();

  const [selectedSpeed, setSelectedSpeed] = useState<number | string>(40);
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);

  const isRunning = frame.stage === 'exploring' || frame.stage === 'learning' || frame.stage === 'converging';
  const isSolved = frame.stage === 'solved';
  const isStepMode = frame.speed_mode === 'step' || selectedSpeed === 'step';

  // Spacebar to run, R to open report when solved
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (!isRunning) {
          run(selectedSpeed);
        }
      } else if ((e.key === 'r' || e.key === 'R') && !e.repeat) {
        if (isSolved && !isReportOpen) {
          e.preventDefault();
          setIsReportOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, isSolved, isReportOpen, run, selectedSpeed]);

  const progressPct = useMemo(() => {
    if (isSolved) return 100;
    if (!isRunning) return 0;
    if (isStepMode) {
      return Math.min(100, Math.max(0, (frame.attempt / 60) * 100));
    }
    if (frame.T <= 0) return 0;
    return Math.min(100, Math.max(0, (frame.t / frame.T) * 100));
  }, [isRunning, isSolved, isStepMode, frame.attempt, frame.t, frame.T]);

  const statusSentence = getStatusSentence(frame);
  const currentMazeIdx = frame.maze_index ?? 0;

  const handleRunClick = () => {
    if (isRunning) return;
    run(selectedSpeed);
  };

  const handleSpeedSelect = (s: number | string) => {
    setSelectedSpeed(s);
    setSpeed(s);
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden bg-[#E6EAF0] text-[#1A202C] flex flex-col justify-between p-4 sm:p-6 lg:p-8 select-none">
      {/* 1. Minimal Header */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-xl font-bold tracking-tight text-[#1A202C]">
            WatchItLearn
          </h1>
          <span className="text-xs text-[#5A6A80] font-medium hidden sm:inline">
            tabular Q-learning
          </span>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 px-3 py-1 bg-[#E6EAF0] neu-inset-sm rounded-full">
          <span
            className={`w-2 h-2 rounded-full transition-all ${
              isSolved
                ? 'bg-[#1E6B3E]'
                : isRunning
                ? 'bg-[#FF4F00] dot-pulse'
                : 'bg-[#8C9AA8]'
            }`}
          />
          <span className="text-xs font-semibold text-[#1A202C] capitalize">
            {frame.stage}
          </span>
        </div>
      </header>

      {/* 2. Main Center Content: Clean Two Columns */}
      <main className="w-full max-w-4xl mx-auto flex-1 min-h-0 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 py-2">
        {/* Left Column: Maze Board & Status */}
        <div className="w-full max-w-[340px] sm:max-w-[380px] flex flex-col gap-3 shrink-0">
          <Maze frame={frame} />

          {/* Clean status sentence */}
          <div
            className="h-10 flex items-center px-1 text-center sm:text-left"
            aria-live="polite"
          >
            <p className="text-xs sm:text-sm font-medium text-[#1A202C] leading-snug">
              {statusSentence}
            </p>
          </div>
        </div>

        {/* Right Column: Controls, Key Stats, Actions */}
        <div className="w-full max-w-[340px] sm:max-w-[380px] flex flex-col gap-4 justify-center">
          {/* Maze & Speed Selectors (Clean Segmented Tabs) */}
          <div className="flex flex-col gap-3">
            {/* Maze Tab */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#E6EAF0] neu-inset-sm rounded-[14px]">
              {MAZE_OPTIONS.map((opt) => {
                const isSelected = currentMazeIdx === opt.index;
                return (
                  <button
                    key={opt.index}
                    type="button"
                    disabled={isRunning}
                    onClick={() => setMaze(opt.index)}
                    className={`py-1.5 px-2 rounded-[10px] text-xs font-semibold transition-all neu-focus ${
                      isSelected
                        ? 'bg-[#E6EAF0] neu-raised-sm text-[#B33600]'
                        : 'text-[#5A6A80] hover:text-[#1A202C]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Speed Tab */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#E6EAF0] neu-inset-sm rounded-[14px]">
              {SPEED_PRESETS.map((sp) => {
                const isSelected = selectedSpeed === sp.value;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleSpeedSelect(sp.value)}
                    className={`py-1.5 px-2 rounded-[10px] text-xs font-semibold transition-all neu-focus ${
                      isSelected
                        ? 'bg-[#E6EAF0] neu-raised-sm text-[#B33600]'
                        : 'text-[#5A6A80] hover:text-[#1A202C]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {sp.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Key Stats (Minimal 2x2 Grid) */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Stat 1: Shortest possible */}
            <div className="bg-[#E6EAF0] neu-inset-sm px-3.5 py-2.5 rounded-[12px] flex flex-col">
              <span className="text-[11px] text-[#5A6A80] font-medium">Shortest possible</span>
              <span className="text-base font-bold tabular-nums text-[#1A202C] mt-0.5">
                {frame.optimal_steps ?? 32} steps
              </span>
            </div>

            {/* Stat 2: Best so far */}
            <div className="bg-[#E6EAF0] neu-inset-sm px-3.5 py-2.5 rounded-[12px] flex flex-col">
              <span className="text-[11px] text-[#5A6A80] font-medium">Best so far</span>
              <span className="text-base font-bold tabular-nums text-[#1A202C] mt-0.5">
                {frame.best_steps ? `${frame.best_steps} steps` : '—'}
              </span>
            </div>

            {/* Stat 3: Moves practiced */}
            <div className="bg-[#E6EAF0] neu-inset-sm px-3.5 py-2.5 rounded-[12px] flex flex-col">
              <span className="text-[11px] text-[#5A6A80] font-medium">Moves practiced</span>
              <span className="text-base font-bold tabular-nums text-[#1A202C] mt-0.5">
                {(frame.total_transitions ?? 0).toLocaleString()}
              </span>
            </div>

            {/* Stat 4: Random moves */}
            <div
              className="bg-[#E6EAF0] neu-inset-sm px-3.5 py-2.5 rounded-[12px] flex flex-col cursor-help"
              title={`Exploration parameter ε = ${(frame.random_pct / 100).toFixed(2)}`}
            >
              <span className="text-[11px] text-[#5A6A80] font-medium">Random moves</span>
              <span className="text-base font-bold tabular-nums text-[#1A202C] mt-0.5">
                {frame.random_pct}%
              </span>
            </div>
          </div>

          {/* Action Button: Run / Running / Run again + View report */}
          <div className="flex flex-col gap-2 pt-1">
            {isRunning ? (
              <div className="w-full h-11 bg-[#E6EAF0] neu-inset-md rounded-[12px] relative overflow-hidden flex items-center justify-center">
                <div
                  className="absolute inset-y-0 left-0 bg-[#FF4F00] transition-[width] duration-100 ease-linear rounded-[10px]"
                  style={{ width: `${progressPct}%` }}
                />
                <span className="relative z-10 text-white font-bold text-xs tracking-wide flex items-center gap-2">
                  <span>Running</span>
                  <span className="tabular-nums opacity-90">
                    {isStepMode
                      ? `(${frame.attempt} att)`
                      : `(${Math.round(frame.t)}s / ${Math.round(frame.T)}s)`}
                  </span>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRunClick}
                className="w-full h-11 rounded-[12px] bg-[#FF4F00] text-white font-bold text-sm tracking-wide shadow-[0_4px_12px_rgba(255,79,0,0.35)] hover:shadow-[0_6px_16px_rgba(255,79,0,0.45)] active:scale-[0.99] transition-all neu-focus flex items-center justify-center gap-1.5"
              >
                <span>{isSolved ? 'Run again' : 'Run'}</span>
                <span className="text-xs font-normal opacity-75">(Space)</span>
              </button>
            )}

            {/* Secondary: View report */}
            {isSolved && (
              <button
                type="button"
                onClick={() => setIsReportOpen(true)}
                className="w-full h-9 rounded-[12px] bg-[#E6EAF0] neu-raised-sm hover:neu-inset-sm active:neu-inset-sm transition-all text-[#1A202C] font-semibold text-xs neu-focus flex items-center justify-center gap-1.5"
              >
                <span>View report</span>
                <span className="text-[11px] text-[#5A6A80]">(R)</span>
              </button>
            )}
          </div>

          {/* Minimal Sparkline */}
          <Sparkline data={frame.steps_history} optimal={frame.optimal_steps ?? 32} />
        </div>
      </main>

      {/* 3. Performance Report Modal Overlay */}
      {report && (
        <ReportModal
          report={report}
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          onRunBenchmark={runBenchmark}
          isBenchmarking={isBenchmarking}
          benchmarkProgress={benchmarkProgress}
          benchmarkResult={benchmarkResult}
        />
      )}
    </div>
  );
};

export default App;
