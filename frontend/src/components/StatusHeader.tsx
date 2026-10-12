import React from 'react';
import { FrameMessage } from '../types';

interface StatusHeaderProps {
  frame: FrameMessage | null;
  connected: boolean;
  isReplaying: boolean;
  isConverged: boolean;
}

export const StatusHeader: React.FC<StatusHeaderProps> = ({
  frame,
  connected,
  isReplaying,
  isConverged,
}) => {
  const tElapsed = frame?.t_elapsed ?? 0;
  const tTarget = frame?.t_target ?? 75;
  const episode = frame?.episode ?? 0;
  const epsilon = frame?.epsilon ?? 1.0;
  const algo = frame?.algo ?? 'q_learning';

  // Format seconds into MM:SS.s
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toFixed(1);
    const padS = s.padStart(4, '0');
    return `${m}:${padS}`;
  };

  const timeProgress = Math.min(100, (tElapsed / tTarget) * 100);

  return (
    <div className="rounded-xl border border-border bg-[#0f172a] p-5 shadow-xl relative overflow-hidden">
      {/* Converged Glowing Banner */}
      {isConverged && (
        <div className="absolute top-0 right-0 bg-gradient-to-l from-emerald-500/30 to-transparent border-b border-l border-emerald-500/40 px-4 py-1 flex items-center gap-2 animate-pulse">
          <span className="text-emerald-400 font-mono text-xs font-black tracking-wider uppercase">
            🏆 OPTIMAL POLICY CONVERGED
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
        {/* Giant Timer */}
        <div className="flex flex-col">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
            Training Timer (T = {tTarget}s)
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-3xl sm:text-4xl font-extrabold font-mono text-cyan-400 tracking-tight">
              {formatTime(tElapsed)}
            </span>
            <span className="text-sm font-mono text-slate-500">
              / {formatTime(tTarget)}
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isConverged ? 'bg-emerald-400' : 'bg-cyan-500'
              }`}
              style={{ width: `${timeProgress}%` }}
            />
          </div>
        </div>

        {/* Episode Counter */}
        <div className="flex flex-col">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
            Episodes Completed
          </span>
          <span className="text-3xl sm:text-4xl font-extrabold font-mono text-emerald-400 tracking-tight mt-0.5">
            {episode.toLocaleString()}
          </span>
          <span className="text-[11px] font-mono text-slate-500 mt-1">
            {frame?.metrics?.steps_ma ? `~${frame.metrics.steps_ma.toFixed(0)} steps/ep` : 'Initializing...'}
          </span>
        </div>

        {/* Epsilon Gauge */}
        <div className="flex flex-col">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Exploration (ε)</span>
            <span className="text-amber-400 font-bold">{epsilon.toFixed(3)}</span>
          </span>
          <div className="w-full bg-slate-800 h-3 rounded-full mt-2 overflow-hidden p-0.5 border border-slate-700/60">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-amber-400 to-rose-500 rounded-full transition-all duration-200"
              style={{ width: `${Math.min(100, Math.max(0, epsilon * 100))}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-slate-500 mt-1">
            {epsilon > 0.3 ? 'Exploring corridors' : 'Exploiting optimal path'}
          </span>
        </div>

        {/* Algorithm & Connection Status */}
        <div className="flex flex-col justify-center">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
            Engine & Status
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2.5 py-1 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-mono text-xs font-bold uppercase">
              {algo === 'q_learning' ? 'Q-Learning' : 'SARSA'}
            </span>
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-xs font-bold ${
                isReplaying
                  ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                  : connected
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isReplaying
                    ? 'bg-amber-400 animate-pulse'
                    : connected
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              {isReplaying ? 'REPLAY' : connected ? 'LIVE 30Hz' : 'DISCONNECTED'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 mt-1">
            Optimal length: <span className="text-cyan-400 font-bold">{frame?.metrics?.optimal_len ?? 14}</span> steps
          </span>
        </div>
      </div>
    </div>
  );
};
