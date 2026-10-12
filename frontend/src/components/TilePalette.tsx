import React from 'react';
import { TileType } from '../types';

interface TilePaletteProps {
  selectedTile: TileType;
  onSelectTile: (tile: TileType) => void;
}

interface PaletteOption {
  type: TileType;
  label: string;
  icon: string;
  description: string;
  color: string;
}

const PALETTE_OPTIONS: PaletteOption[] = [
  { type: '#', label: 'Wall', icon: '🧱', description: 'Blocks agent path', color: 'bg-slate-700 text-slate-100 border-slate-500' },
  { type: 'L', label: 'Lava', icon: '🔥', description: 'Terminal hazard (-1.0)', color: 'bg-rose-900/60 text-rose-300 border-rose-500' },
  { type: 'G', label: 'Goal', icon: '🏆', description: 'Target reward (+1.0)', color: 'bg-emerald-900/60 text-emerald-300 border-emerald-500' },
  { type: 'K', label: 'Key', icon: '🗝️', description: 'Required for door', color: 'bg-amber-900/60 text-amber-300 border-amber-500' },
  { type: 'D', label: 'Door', icon: '🚪', description: 'Chokepoint (needs key)', color: 'bg-indigo-900/60 text-indigo-300 border-indigo-500' },
  { type: '.', label: 'Empty', icon: '▫️', description: 'Clear tile', color: 'bg-slate-800 text-slate-300 border-slate-600' },
];

export const TilePalette: React.FC<TilePaletteProps> = ({
  selectedTile,
  onSelectTile,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-border bg-[#0b101d]">
      <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1.5">
        <span>✏️ Level Editor:</span>
      </span>
      {PALETTE_OPTIONS.map((opt) => {
        const isSelected = selectedTile === opt.type;
        return (
          <button
            key={opt.type}
            type="button"
            onClick={() => onSelectTile(opt.type)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs font-semibold transition-all duration-150 ${
              opt.color
            } ${
              isSelected
                ? 'ring-2 ring-cyan-400 scale-105 shadow-md shadow-cyan-950 font-bold'
                : 'opacity-70 hover:opacity-100 hover:scale-102'
            }`}
          >
            <span>{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        );
      })}
      <span className="text-[11px] text-slate-500 font-mono ml-auto hidden sm:inline">
        Click a cell to edit level live
      </span>
    </div>
  );
};
