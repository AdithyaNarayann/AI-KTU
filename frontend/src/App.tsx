import { useState, useEffect, useMemo, FC } from 'react';
import { useRun } from './hooks/useRun';
import { Maze } from './components/Maze';
import { Sparkline } from './components/Sparkline';
import { ReportModal } from './components/ReportModal';
import { ServerFrame } from './types';

const SPEED_PRESETS = [
  { id: 'step', label: 'Step by step', value: 'step' },
  { id: 'normal', label: 'Normal', value: 40 },
  { id: 'fast', label: 'Fast', value: 15 },
];

function getStatusSentence(frame: ServerFrame): string {
  if (frame.stage === 'idle') {
    return 'Press Run';
  }
  if (frame.stage === 'exploring') {
    return `Attempt ${frame.attempt} : Exploring`;
  }
  if (frame.stage === 'learning') {
    return `Attempt ${frame.attempt} : Learning`;
  }
  if (frame.stage === 'converging') {
    return `Attempt ${frame.attempt} : Almost there`;
  }
  if (frame.stage === 'solved') {
    const steps = frame.result?.steps ?? frame.optimal_steps ?? 32;
    const optimal = frame.result?.optimal ?? frame.optimal_steps ?? 32;
    if (steps === optimal) {
      return `Solved in ${steps} steps, the shortest possible`;
    }
    return `Solved in ${steps} steps, shortest is ${optimal}`;
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
    fetchReport,
    benchmarkResult,
    benchmarkDots,
    isBenchmarking,
    runBenchmarkForMaze,
  } = useRun();

  const [selectedSpeed, setSelectedSpeed] = useState<number | string>(40);
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);

  const isRunning = frame.stage === 'exploring' || frame.stage === 'learning' || frame.stage === 'converging';
  const isSolved = frame.stage === 'solved';
  const isStepMode = frame.speed_mode === 'step' || selectedSpeed === 'step';

  // Silent keyboard shortcuts: Space run, R report, Esc close, 1/2/3 maze
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (!isRunning) {
          run(selectedSpeed);
        }
      } else if ((e.key === 'r' || e.key === 'R') && !e.repeat) {
        if (isSolved) {
          e.preventDefault();
          fetchReport();
          setIsReportOpen(true);
        }
      } else if (e.key === 'Escape' && isReportOpen) {
        setIsReportOpen(false);
      } else if (!isRunning) {
        if (e.key === '1') setMaze(0);
        else if (e.key === '2') setMaze(1);
        else if (e.key === '3') setMaze(2);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, isSolved, isReportOpen, run, selectedSpeed, setMaze]);

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

  // Bug b fix: When solved, Best must show greedy solution length, not best exploratory episode
  const bestStepsDisplay = isSolved
    ? (frame.result?.steps ?? frame.optimal_steps ?? 32)
    : (frame.best_steps ? frame.best_steps : '—');

  const handleRunClick = () => {
    if (isRunning) return;
    run(selectedSpeed);
  };

  const handleSpeedSelect = (s: number | string) => {
    setSelectedSpeed(s);
    setSpeed(s);
  };

  const handleShuffle = () => {
    if (isRunning) return;
    const next = (currentMazeIdx + 1) % 3;
    setMaze(next);
  };

  return (
    <div className="min-h-screen lg:h-screen lg:max-h-screen overflow-x-hidden overflow-y-auto lg:overflow-hidden bg-[#F5F2EA] text-[#111111] flex flex-col justify-between p-3 sm:p-5 lg:p-6 font-sans select-none selection:bg-[#FF4F00] selection:text-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* 1. Header: Wordmark on left, Status badge on right */}
      <header className="w-full max-w-5xl mx-auto flex items-baseline justify-between border-b border-[#D9D4C7] pb-2.5 shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111111]">
          WatchItLearn
        </h1>
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-[11px] px-2.5 py-0.5 uppercase tracking-wider font-bold border ${
              isSolved
                ? 'bg-[#111111] text-white border-[#111111]'
                : isRunning
                ? 'bg-[#FF4F00] text-white border-[#FF4F00]'
                : 'bg-transparent text-[#111111] border-[#111111]'
            }`}
          >
            {frame.stage}
          </span>
        </div>
      </header>

      {/* 2. Main Content Area (Vertically Centered, No Dead Band) */}
      <main className="w-full max-w-5xl mx-auto flex-1 min-h-0 flex flex-col lg:flex-row items-center justify-center gap-4 sm:gap-6 lg:gap-10 py-2 sm:py-3 lg:py-1">
        {/* Left Column: Maze Canvas & Immediate Status */}
        <div className="w-full max-w-[340px] xs:max-w-[360px] sm:max-w-[400px] lg:max-w-[440px] flex flex-col gap-1.5 sm:gap-2 shrink-0">
          <Maze frame={frame} hasShadow={true} />

          {/* Under maze: ONE line, never truncated, wrapping to 2 lines max */}
          <div
            className="min-h-[1.75rem] sm:min-h-[2.25rem] flex items-center px-1 font-mono text-[11px] sm:text-xs font-semibold text-[#111111] leading-snug"
            aria-live="polite"
          >
            {statusSentence}
          </div>
        </div>

        {/* Right Panel: Selectors, Numbers, RUN, Sparkline */}
        <div className="w-full max-w-[340px] xs:max-w-[360px] sm:max-w-[400px] flex flex-col gap-2.5 sm:gap-3 justify-center">
          {/* Maze Selector */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] font-semibold text-[#111111]/70">
              Maze
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 1, 2].map((idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isRunning}
                  onClick={() => setMaze(idx)}
                  className={`py-2 lg:py-1.5 px-1 text-center font-mono text-xs font-bold border transition-colors ${
                    currentMazeIdx === idx
                      ? 'bg-[#111111] text-white border-[#111111]'
                      : 'bg-white/50 text-[#111111] border-[#D9D4C7] hover:bg-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {idx + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={isRunning}
                onClick={handleShuffle}
                className="py-2 lg:py-1.5 px-1 text-center font-mono text-xs font-bold bg-white/50 text-[#111111] border border-[#D9D4C7] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Shuffle
              </button>
            </div>
          </div>

          {/* Speed Selector (No Subtext) */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] font-semibold text-[#111111]/70">
              Speed
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {SPEED_PRESETS.map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  disabled={isRunning}
                  onClick={() => handleSpeedSelect(sp.value)}
                  className={`py-2 lg:py-1.5 px-1 text-center font-mono text-[11px] sm:text-xs font-bold border transition-colors ${
                    selectedSpeed === sp.value
                      ? 'bg-[#111111] text-white border-[#111111]'
                      : 'bg-white/50 text-[#111111] border-[#D9D4C7] hover:bg-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Four Numbers with 1 or 2 Word Labels */}
          <div className="grid grid-cols-2 gap-2 border border-[#D9D4C7] bg-white/40 p-2 sm:p-2.5">
            <div className="flex flex-col">
              <span className="font-mono text-[11px] text-[#111111]/70">Shortest</span>
              <span className="font-mono text-sm font-bold text-[#111111] tabular-nums">
                {frame.optimal_steps ?? 32}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-[11px] text-[#111111]/70">Best</span>
              <span className="font-mono text-sm font-bold text-[#111111] tabular-nums">
                {bestStepsDisplay}
              </span>
            </div>
            <div className="flex flex-col border-t border-[#D9D4C7] pt-1 sm:pt-1.5">
              <span className="font-mono text-[11px] text-[#111111]/70">Moves</span>
              <span className="font-mono text-sm font-bold text-[#111111] tabular-nums">
                {(frame.total_transitions ?? 0).toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col border-t border-[#D9D4C7] pt-1 sm:pt-1.5">
              <span className="font-mono text-[11px] text-[#111111]/70">Random</span>
              <span className="font-mono text-sm font-bold text-[#111111] tabular-nums">
                {frame.random_pct}%
              </span>
            </div>
          </div>

          {/* RUN Button (Ink with Hard Shadow; Readable Ink Text When Running) */}
          <div className={isSolved ? 'grid grid-cols-[3fr_1fr] gap-2' : 'w-full'}>
            <button
              type="button"
              data-testid="run-button"
              onClick={handleRunClick}
              disabled={isRunning}
              style={{
                boxShadow: isRunning ? '2px 2px 0px #111111' : '4px 4px 0px #111111',
                transform: isRunning ? 'translate(2px, 2px)' : 'none',
              }}
              className="w-full h-[46px] relative overflow-hidden bg-[#111111] text-white font-mono font-bold text-sm tracking-wider uppercase transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed border-2 border-[#111111]"
            >
              {isRunning && (
                <div
                  className="absolute inset-y-0 left-0 bg-[#FF4F00] transition-[width] duration-100 ease-linear"
                  style={{ width: `${progressPct}%` }}
                />
              )}
              {/* Bug a fix: Text is INK color (#111111) when running so it stays completely readable */}
              <span
                className={`relative z-10 flex items-center justify-center gap-2 font-bold ${
                  isRunning ? 'text-[#111111]' : 'text-white'
                }`}
              >
                <span>{isRunning ? 'RUNNING' : isSolved ? 'Run again' : 'RUN'}</span>
                {isRunning && (
                  <span className="font-mono text-xs font-semibold">
                    {isStepMode ? `Att ${frame.attempt}` : `${Math.round(frame.t)}s / ${Math.round(frame.T)}s`}
                  </span>
                )}
              </span>
            </button>

            {/* When solved: Square Report button */}
            {isSolved && (
              <button
                type="button"
                data-testid="report-button"
                onClick={() => {
                  fetchReport();
                  setIsReportOpen(true);
                }}
                style={{
                  boxShadow: '4px 4px 0px #111111',
                }}
                className="h-[46px] bg-[#F5F2EA] hover:bg-white text-[#111111] font-mono font-bold text-xs uppercase border-2 border-[#111111] flex items-center justify-center transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                Report
              </button>
            )}
          </div>

          {/* Sparkline */}
          <Sparkline data={frame.steps_history} optimal={frame.optimal_steps ?? 32} />
        </div>
      </main>

      {/* 3. Report Screen (One Screen, Visuals First, No Scrolling) */}
      {report && (
        <ReportModal
          report={report}
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          onRunBenchmark={runBenchmarkForMaze}
          isBenchmarking={isBenchmarking}
          benchmarkDots={benchmarkDots}
          benchmarkResult={benchmarkResult}
        />
      )}
    </div>
  );
};

export default App;
