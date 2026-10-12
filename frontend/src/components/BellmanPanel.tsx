import React from 'react';
import { BellmanUpdate } from '../types';

interface BellmanPanelProps {
  update: BellmanUpdate | null;
}

const ACTION_NAMES = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

export const BellmanPanel: React.FC<BellmanPanelProps> = ({ update }) => {
  if (!update) {
    return (
      <div className="rounded-xl border border-border bg-[#0f172a] p-4 text-slate-400 font-mono text-xs">
        <div className="text-slate-500 uppercase tracking-wider text-[11px] font-bold mb-1">
          Bellman Temporal-Difference Operator (Sampled ~5 Hz)
        </div>
        <div className="italic text-slate-500">Awaiting live TD updates...</div>
      </div>
    );
  }

  const { s, a, r, s2, old_q, target, new_q, algo } = update;
  const isQLearning = algo === 'q_learning';
  const actionName = ACTION_NAMES[a] || `A${a}`;

  const stateStr = `(${s[0]},${s[1]},k=${s[2]})`;
  const nextStateStr = `(${s2[0]},${s2[1]},k=${s2[2]})`;

  // Compute the TD error delta
  const tdError = target - old_q;

  return (
    <div className="rounded-xl border border-cyan-900/40 bg-[#0c1322] p-4 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>Live Bellman TD Update (Sampled 5 Hz)</span>
        </span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          α = 0.50 | γ = 0.97
        </span>
      </div>

      {/* Symbolic Equation */}
      <div className="text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 mb-2 flex items-center justify-between">
        {isQLearning ? (
          <span>
            Q(s, a) ← Q(s, a) + α · [r + γ · max<sub className="text-[9px]">a'</sub> Q(s', a') − Q(s, a)]
          </span>
        ) : (
          <span>
            Q(s, a) ← Q(s, a) + α · [r + γ · Q(s', a') − Q(s, a)]
          </span>
        )}
        <span className="text-[10px] text-cyan-400/80">s'={nextStateStr}</span>
      </div>

      {/* Numerical Substitution */}
      <div className="space-y-1.5 font-mono text-xs bg-black/40 p-3 rounded-lg border border-slate-800">
        <div className="flex flex-wrap items-baseline gap-1.5 text-slate-300">
          <span className="text-amber-400 font-semibold">Q({stateStr}, {actionName})</span>
          <span>←</span>
          <span className="text-slate-200">{old_q.toFixed(3)}</span>
          <span className="text-slate-400">+ 0.50 · [</span>
          <span className={r > 0 ? 'text-emerald-400 font-bold' : r < 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
            {r >= 0 ? `+${r.toFixed(2)}` : r.toFixed(2)}
          </span>
          <span className="text-slate-400">+</span>
          <span className="text-cyan-400">{(target - r).toFixed(3)}</span>
          <span className="text-slate-400">− {old_q.toFixed(3)}]</span>
        </div>

        <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
          <div className="text-slate-400">
            TD Error (δ):{' '}
            <span className={tdError >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {tdError >= 0 ? `+${tdError.toFixed(4)}` : tdError.toFixed(4)}
            </span>
          </div>
          <div className="text-slate-300 font-semibold">
            Result Q: <span className="text-cyan-300 text-sm font-extrabold">{new_q.toFixed(4)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
