import { useEffect, useMemo } from 'react';
import { useRun } from './hooks/useRun';
import { Maze } from './components/Maze';
import { Sparkline } from './components/Sparkline';
import { ServerFrame } from './types';

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
      return `Solved in ${frame.result?.steps ?? 28} steps. The shortest possible is ${frame.result?.optimal ?? 28}.`;
    default:
      return '';
  }
}

export function App() {
  const { frame, run } = useRun();

  const isRunning = frame.stage === 'exploring' || frame.stage === 'learning' || frame.stage === 'converging';
  const isSolved = frame.stage === 'solved';

  // Spacebar triggers run when not currently in active training
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        if (!isRunning) {
          run();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, run]);

  const progressPct = useMemo(() => {
    if (isSolved) return 100;
    if (!isRunning || frame.T <= 0) return 0;
    return Math.min(100, Math.max(0, (frame.t / frame.T) * 100));
  }, [isRunning, isSolved, frame.t, frame.T]);

  const stageText = getStageMessage(frame);

  const buttonText = isRunning ? 'RUNNING' : isSolved ? 'RUN AGAIN' : 'RUN';

  const handleButtonClick = () => {
    if (isRunning) return;
    run();
  };

  return (
    <div className="min-h-screen bg-[#F5F2EA] text-[#111111] flex flex-col items-center justify-center p-4 sm:p-8 font-sans selection:bg-[#FF4F00] selection:text-white">
      <main className="w-full max-w-[560px] flex flex-col gap-6">
        {/* 1. Header Row */}
        <header className="flex items-baseline justify-between select-none border-b border-[#D9D4C7] pb-3">
          <h1 className="text-2xl font-bold tracking-tight text-[#111111] font-sans">
            WatchItLearn
          </h1>
          <span className="font-mono text-xs text-[#111111]/70 tracking-tight">
            tabular Q-learning
          </span>
        </header>

        {/* 2. Maze Canvas */}
        <section className="w-full">
          <Maze frame={frame} />
        </section>

        {/* 3. Status Row under the maze */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#111111]">
          <div className="flex items-center gap-4 font-mono font-medium">
            <span>Attempt {frame.attempt}</span>
            <span>Random moves {frame.random_pct}%</span>
          </div>
          <div className="text-left sm:text-right font-sans font-medium text-[13px] text-[#111111]">
            {stageText}
          </div>
        </section>

        {/* 4. RUN Button */}
        <section className="w-full">
          <button
            type="button"
            onClick={handleButtonClick}
            disabled={isRunning}
            style={{
              boxShadow: isRunning ? '2px 2px 0px #111111' : '4px 4px 0px #111111',
              transform: isRunning ? 'translate(2px, 2px)' : 'none',
            }}
            className="w-full h-[56px] relative overflow-hidden bg-[#111111] text-white font-mono font-bold text-sm tracking-wider uppercase transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed border-2 border-[#111111] select-none"
          >
            {/* Progress bar fill driven by t/T */}
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
                  {Math.round(frame.t)}s / {Math.round(frame.T)}s
                </span>
              )}
            </span>
          </button>
        </section>

        {/* 5. Sparkline */}
        <section className="w-full">
          <Sparkline data={frame.steps_history} optimal={28} />
        </section>

        {/* 6. Footer */}
        <footer className="pt-2 text-center">
          <p className="text-xs text-[#111111]/70 font-sans leading-relaxed max-w-[500px] mx-auto">
            The agent starts knowing nothing. After every move it updates a score for that square, so squares closer to the goal glow brighter.
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;
