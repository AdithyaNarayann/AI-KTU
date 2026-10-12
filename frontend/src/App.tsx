import { useState, useEffect, useMemo, FC } from 'react';
import { useRun } from './hooks/useRun';
import { Maze } from './components/Maze';
import { Sparkline } from './components/Sparkline';
import { ServerFrame } from './types';

const MAZE_NAMES = ['1: Labyrinth', '2: Classic', '3: Zig-Zag'];

function getStageMessage(frame: ServerFrame): string {
  switch (frame.stage) {
    case 'idle':
      return 'Press run. The agent knows nothing about this maze.';
    case 'exploring':
      return 'Exploring. Mostly random moves, lots of wall bumps.';
    case 'learning':
      return 'Learning. Squares near the goal start to glow.';
    case 'converging':
      return 'Almost there. It now follows the brightest squares.';
    case 'solved':
      return `Solved in ${frame.result?.steps ?? (frame.optimal_steps ?? 32)} steps. Shortest possible is ${frame.result?.optimal ?? (frame.optimal_steps ?? 32)}.`;
    default:
      return '';
  }
}

const SPEED_PRESETS: { id: string; label: string; value: number | string }[] = [
  { id: 'step', label: 'Step-by-Step', value: 'step' },
  { id: 'normal', label: 'Normal (40s)', value: 40 },
  { id: 'fast', label: 'Fast (15s)', value: 15 },
];

export const App: FC = () => {
  const { frame, run, setMaze, setSpeed } = useRun();
  const [selectedSpeed, setSelectedSpeed] = useState<number | string>(40);

  const isRunning = frame.stage === 'exploring' || frame.stage === 'learning' || frame.stage === 'converging';
  const isSolved = frame.stage === 'solved';
  const isStepMode = frame.speed_mode === 'step' || selectedSpeed === 'step';

  // Handle Spacebar shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        if (!isRunning) {
          run(selectedSpeed);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, run, selectedSpeed]);

  const progressPct = useMemo(() => {
    if (isSolved) return 100;
    if (!isRunning) return 0;
    if (isStepMode) {
      return Math.min(100, Math.max(0, (frame.attempt / 60) * 100));
    }
    if (frame.T <= 0) return 0;
    return Math.min(100, Math.max(0, (frame.t / frame.T) * 100));
  }, [isRunning, isSolved, isStepMode, frame.attempt, frame.t, frame.T]);

  const stageText = getStageMessage(frame);
  const buttonText = isRunning ? 'RUNNING' : isSolved ? 'RUN AGAIN' : 'RUN';

  const handleRunClick = () => {
    if (isRunning) return;
    run(selectedSpeed);
  };

  const handleSpeedSelect = (s: number | string) => {
    setSelectedSpeed(s);
    setSpeed(s);
  };

  const handleShuffleMaze = () => {
    if (isRunning) return;
    const current = frame.maze_index ?? 0;
    const next = (current + 1) % 3;
    setMaze(next);
  };

  const currentMazeIdx = frame.maze_index ?? 0;

  return (
    <div className="h-screen max-h-screen overflow-hidden bg-[#F5F2EA] text-[#111111] flex flex-col justify-between p-3 sm:p-5 lg:p-6 font-sans select-none selection:bg-[#FF4F00] selection:text-white">
      {/* 1. Top Header */}
      <header className="w-full max-w-5xl mx-auto flex items-baseline justify-between border-b border-[#D9D4C7] pb-2.5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111111]">
            WatchItLearn
          </h1>
          <span className="font-mono text-xs text-[#111111]/70">
            tabular Q-learning
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-[11px] px-2 py-0.5 uppercase tracking-wider font-bold border ${
              isSolved
                ? 'bg-[#111111] text-white border-[#111111]'
                : isRunning
                ? 'bg-[#FF4F00] text-white border-[#FF4F00]'
                : 'bg-transparent text-[#111111]/70 border-[#D9D4C7]'
            }`}
          >
            {frame.stage}
          </span>
        </div>
      </header>

      {/* 2. Main Side-by-Side Area */}
      <main className="w-full max-w-5xl mx-auto flex-1 min-h-0 flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-10 py-2">
        {/* Left Column: Maze Canvas & Immediate Status */}
        <div className="w-full max-w-[360px] sm:max-w-[400px] lg:max-w-[430px] flex flex-col gap-2 shrink-0">
          <Maze frame={frame} />
          <div className="flex items-center justify-between text-xs text-[#111111] pt-0.5">
            <div className="flex items-center gap-3 font-mono font-medium">
              <span>Attempt {frame.attempt}</span>
              <span>Random moves {frame.random_pct}%</span>
            </div>
            <div className="text-right font-sans font-medium text-[12px] truncate max-w-[200px]" title={stageText}>
              {stageText}
            </div>
          </div>
        </div>

        {/* Right Column: Controls, Live Data, RUN Button, Sparkline */}
        <div className="w-full max-w-[380px] sm:max-w-[420px] flex flex-col gap-3 justify-center">
          {/* Maze Selector */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider font-semibold text-[#111111]/70">
              Maze Layout
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {MAZE_NAMES.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  disabled={isRunning}
                  onClick={() => setMaze(i)}
                  className={`py-1.5 px-1 text-center font-mono text-[11px] font-bold border transition-colors ${
                    currentMazeIdx === i
                      ? 'bg-[#111111] text-white border-[#111111]'
                      : 'bg-white/50 text-[#111111] border-[#D9D4C7] hover:bg-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {name.split(':')[0]}
                </button>
              ))}
              <button
                type="button"
                disabled={isRunning}
                onClick={handleShuffleMaze}
                title="Shuffle Maze"
                className="py-1.5 px-1 text-center font-mono text-[11px] font-bold bg-white/50 text-[#111111] border border-[#D9D4C7] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🎲 Shuffle
              </button>
            </div>
          </div>

          {/* Speed Selector */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-baseline">
              <span className="font-mono text-[10px] uppercase tracking-wider font-semibold text-[#111111]/70">
                Training Speed
              </span>
              {selectedSpeed === 'step' && (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold">
                  100 steps / sec
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {SPEED_PRESETS.map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  disabled={isRunning}
                  onClick={() => handleSpeedSelect(sp.value)}
                  className={`py-1.5 px-1 text-center font-mono text-[11px] font-bold border transition-colors ${
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

          {/* Live Data Stats Grid */}
          <div className="grid grid-cols-2 gap-2 border border-[#D9D4C7] bg-white/40 p-2.5">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase text-[#111111]/70">Optimal Path</span>
              <span className="font-mono text-sm font-bold text-[#111111]">
                {frame.optimal_steps ?? 32} steps
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase text-[#111111]/70">Shortest Run</span>
              <span className="font-mono text-sm font-bold text-[#111111]">
                {frame.best_steps ? `${frame.best_steps} steps` : '—'}
              </span>
            </div>
            <div className="flex flex-col border-t border-[#D9D4C7] pt-1.5">
              <span className="font-mono text-[10px] uppercase text-[#111111]/70">Experience</span>
              <span className="font-mono text-sm font-bold text-[#111111]">
                {(frame.total_transitions ?? 0).toLocaleString()} steps
              </span>
            </div>
            <div className="flex flex-col border-t border-[#D9D4C7] pt-1.5">
              <span className="font-mono text-[10px] uppercase text-[#111111]/70">Exploration (ε)</span>
              <span className="font-mono text-sm font-bold text-[#111111]">
                {frame.random_pct}%
              </span>
            </div>
          </div>

          {/* RUN Button */}
          <button
            type="button"
            onClick={handleRunClick}
            disabled={isRunning}
            style={{
              boxShadow: isRunning ? '2px 2px 0px #111111' : '4px 4px 0px #111111',
              transform: isRunning ? 'translate(2px, 2px)' : 'none',
            }}
            className="w-full h-[50px] relative overflow-hidden bg-[#111111] text-white font-mono font-bold text-sm tracking-wider uppercase transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed border-2 border-[#111111]"
          >
            {isRunning && (
              <div
                className="absolute inset-y-0 left-0 bg-[#FF4F00] transition-[width] duration-100 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            )}
            <span className="relative z-10 text-white flex items-center justify-center gap-2">
              {buttonText}
              {isRunning && (
                <span className="font-mono text-xs opacity-90">
                  {isStepMode
                    ? `(100 steps/s • Att ${frame.attempt})`
                    : `(${Math.round(frame.t)}s / ${Math.round(frame.T)}s)`}
                </span>
              )}
            </span>
          </button>

          {/* Sparkline */}
          <Sparkline data={frame.steps_history} optimal={frame.optimal_steps ?? 32} />
        </div>
      </main>

      {/* 3. Bottom Footer */}
      <footer className="w-full max-w-5xl mx-auto border-t border-[#D9D4C7] pt-2 text-center shrink-0">
        <p className="text-[11px] text-[#111111]/70 font-sans leading-relaxed">
          The agent starts knowing nothing. After every move it updates a score for that square, so squares closer to the goal glow brighter.
        </p>
      </footer>
    </div>
  );
};

export default App;
