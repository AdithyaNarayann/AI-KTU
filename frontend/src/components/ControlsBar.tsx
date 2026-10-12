import React from 'react';
import { Play, Pause, RotateCcw, Trophy, Film } from 'lucide-react';
import { AlgoType } from '../types';

interface ControlsBarProps {
  isRunning: boolean;
  isPaused: boolean;
  isReplaying: boolean;
  algo: AlgoType;
  shaping: boolean;
  mode: 'demo' | 'free';
  speed: number;
  onStartDemo: () => void;
  onPauseResume: () => void;
  onReset: () => void;
  onVictoryLap: () => void;
  onSetAlgo: (algo: AlgoType) => void;
  onToggleShaping: () => void;
  onToggleMode: (mode: 'demo' | 'free') => void;
  onChangeSpeed: (speed: number) => void;
  onReplayRecordedRun: () => void;
  onStopReplay: () => void;
}

export const ControlsBar: React.FC<ControlsBarProps> = ({
  isRunning,
  isPaused,
  isReplaying,
  algo,
  shaping,
  mode,
  speed,
  onStartDemo,
  onPauseResume,
  onReset,
  onVictoryLap,
  onSetAlgo,
  onToggleShaping,
  onToggleMode,
  onChangeSpeed,
  onReplayRecordedRun,
  onStopReplay,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border bg-[#0b1220] shadow-2xl">
      {/* Primary Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        {/* START DEMO BUTTON */}
        <button
          type="button"
          onClick={onStartDemo}
          disabled={isReplaying}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-mono text-sm font-black uppercase tracking-wider transition-all shadow-lg ${
            isRunning && !isPaused
              ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-950'
              : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 hover:scale-105 shadow-emerald-900/60 ring-2 ring-emerald-300'
          }`}
        >
          <Play className="w-5 h-5 fill-current" />
          <span>{isRunning ? 'Restart Demo' : 'Start Demo'}</span>
        </button>

        {/* Pause / Resume */}
        <button
          type="button"
          onClick={onPauseResume}
          disabled={!isRunning || isReplaying}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase transition-all border ${
            isPaused
              ? 'bg-amber-500/20 text-amber-400 border-amber-500 hover:bg-amber-500/30 ring-1 ring-amber-400'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800'
          }`}
        >
          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          <span>{isPaused ? 'Resume' : 'Pause'}</span>
        </button>

        {/* Reset */}
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase transition-all bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset</span>
        </button>

        {/* Victory Lap */}
        <button
          type="button"
          onClick={onVictoryLap}
          disabled={isReplaying}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase transition-all bg-indigo-900/40 text-indigo-300 border border-indigo-700/60 hover:bg-indigo-800/60 hover:text-white"
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Victory Lap</span>
        </button>
      </div>

      {/* Middle Options: Algorithm & Shaping Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Algorithm Switcher */}
        <div className="flex items-center p-1 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs">
          <button
            type="button"
            onClick={() => onSetAlgo('q_learning')}
            className={`px-3 py-1 rounded font-bold transition-all ${
              algo === 'q_learning'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            [1] Q-Learning
          </button>
          <button
            type="button"
            onClick={() => onSetAlgo('sarsa')}
            className={`px-3 py-1 rounded font-bold transition-all ${
              algo === 'sarsa'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            [2] SARSA
          </button>
        </div>

        {/* Shaping Toggle */}
        <button
          type="button"
          onClick={onToggleShaping}
          className={`px-3 py-1.5 rounded-lg border font-mono text-xs font-bold transition-all ${
            shaping
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/60'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          Shaping: <span className={shaping ? 'text-emerald-400' : 'text-slate-400'}>{shaping ? 'ON (+0.25 Key)' : 'PURIST (Off)'}</span>
        </button>

        {/* Mode Toggle: Demo vs Free */}
        <button
          type="button"
          onClick={() => onToggleMode(mode === 'demo' ? 'free' : 'demo')}
          className={`px-3 py-1.5 rounded-lg border font-mono text-xs font-bold transition-all ${
            mode === 'demo'
              ? 'bg-purple-950/60 text-purple-300 border-purple-600/60'
              : 'bg-amber-950/60 text-amber-300 border-amber-600/60'
          }`}
        >
          Mode: <span className="uppercase">{mode}</span>
        </button>

        {/* Speed Slider in Free Mode */}
        {mode === 'free' && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Speed:</span>
            <input
              type="range"
              min="0.2"
              max="5.0"
              step="0.2"
              value={speed}
              onChange={(e) => onChangeSpeed(parseFloat(e.target.value))}
              className="w-20 accent-cyan-400 cursor-pointer"
            />
            <span className="text-cyan-400 font-bold">{speed.toFixed(1)}x</span>
          </div>
        )}
      </div>

      {/* Fallback Replay Button */}
      <div className="flex items-center">
        {isReplaying ? (
          <button
            type="button"
            onClick={onStopReplay}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-mono text-xs font-bold bg-rose-600 text-white hover:bg-rose-500 shadow-lg"
          >
            <span>Stop Replay</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onReplayRecordedRun}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-mono text-xs font-bold transition-all bg-slate-900 text-amber-400 border border-amber-500/40 hover:bg-amber-500/10 shadow-sm"
          >
            <Film className="w-4 h-4 text-amber-400" />
            <span>Replay Recorded Run</span>
          </button>
        )}
      </div>
    </div>
  );
};
