import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FrameMessage, TileType } from '../types';

interface DualGridCanvasProps {
  frame: FrameMessage | null;
  selectedTile: TileType;
  onCellClick: (row: number, col: number) => void;
  isShocked: boolean;
}

const CELL_SIZE = 54; // px
const GRID_DIM = 8;
const CANVAS_SIZE = CELL_SIZE * GRID_DIM; // 432 px

// Action arrows: UP=0, DOWN=1, LEFT=2, RIGHT=3
const ARROW_SYMBOLS = ['↑', '↓', '←', '→'];

export const DualGridCanvas: React.FC<DualGridCanvasProps> = ({
  frame,
  selectedTile: _selectedTile,
  onCellClick,
  isShocked,
}) => {
  const canvas0Ref = useRef<HTMLCanvasElement | null>(null);
  const canvas1Ref = useRef<HTMLCanvasElement | null>(null);

  // Hover state for Q tooltip
  const [hoveredCell, setHoveredCell] = useState<{
    gridIdx: number;
    r: number;
    c: number;
    x: number;
    y: number;
  } | null>(null);

  // Helper: map Q value to diverging RGB color
  const getQColor = (q: number): string => {
    if (q === 0) return 'rgba(15, 23, 42, 0.75)'; // slate-900 neutral
    if (q > 0) {
      // Positive: interpolate towards vibrant emerald/cyan
      const intensity = Math.min(1.0, q / 0.9);
      const r = Math.round(15 + (6 - 15) * intensity);
      const g = Math.round(23 + (185 - 23) * intensity);
      const b = Math.round(42 + (129 - 42) * intensity);
      return `rgba(${r}, ${g}, ${b}, ${0.5 + 0.45 * intensity})`;
    } else {
      // Negative: interpolate towards dark crimson/rose
      const intensity = Math.min(1.0, Math.abs(q) / 1.0);
      const r = Math.round(15 + (225 - 15) * intensity);
      const g = Math.round(23 + (29 - 23) * intensity);
      const b = Math.round(42 + (72 - 42) * intensity);
      return `rgba(${r}, ${g}, ${b}, ${0.5 + 0.45 * intensity})`;
    }
  };

  // Render function for a single canvas (keyState: 0 or 1)
  const drawGrid = useCallback(
    (
      canvas: HTMLCanvasElement,
      keyState: 0 | 1,
      currentFrame: FrameMessage | null
    ) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== CANVAS_SIZE * dpr) {
        canvas.width = CANVAS_SIZE * dpr;
        canvas.height = CANVAS_SIZE * dpr;
        canvas.style.width = `${CANVAS_SIZE}px`;
        canvas.style.height = `${CANVAS_SIZE}px`;
      }
      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      const grid = currentFrame?.grid || [
        '########',
        '#S...#.#',
        '#.#..#.#',
        '#.#..D.#',
        '#.#..#.#',
        '#K...#.#',
        '#.LLLLG#',
        '########',
      ];

      const qMax = currentFrame?.q_max?.[keyState];
      const policy = currentFrame?.policy?.[keyState];

      // 1. Draw Cell Backgrounds & Heatmap
      for (let r = 0; r < GRID_DIM; r++) {
        for (let c = 0; c < GRID_DIM; c++) {
          const x = c * CELL_SIZE;
          const y = r * CELL_SIZE;
          const tile = grid[r]?.[c] || '.';

          if (tile === '#') {
            // Wall cell
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          } else if (tile === 'L') {
            // Lava cell
            const lavaGrad = ctx.createLinearGradient(x, y, x + CELL_SIZE, y + CELL_SIZE);
            lavaGrad.addColorStop(0, '#dc2626');
            lavaGrad.addColorStop(1, '#ea580c');
            ctx.fillStyle = lavaGrad;
            ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
          } else {
            // Heatmap color based on Q-max
            const qVal = qMax?.[r]?.[c] ?? 0;
            ctx.fillStyle = getQColor(qVal);
            ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

            // Subtle cell grid border
            ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
          }
        }
      }

      // 2. Overlay Policy Arrows for walkable cells
      if (policy && qMax) {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 16px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let r = 0; r < GRID_DIM; r++) {
          for (let c = 0; c < GRID_DIM; c++) {
            const tile = grid[r]?.[c] || '.';
            if (tile === '#' || tile === 'L' || tile === 'G') continue;
            // Locked door in keyState 0 has no pass-through arrow
            if (tile === 'D' && keyState === 0) continue;

            const qVal = qMax[r]?.[c] ?? 0;
            if (Math.abs(qVal) < 0.001) continue; // Unvisited

            const bestA = policy[r]?.[c] ?? 0;
            const arrow = ARROW_SYMBOLS[bestA] || '•';

            const cx = c * CELL_SIZE + CELL_SIZE / 2;
            const cy = r * CELL_SIZE + CELL_SIZE / 2;

            // Highlight arrows with stronger Q
            ctx.fillStyle = qVal > 0 ? '#38bdf8' : '#cbd5e1';
            ctx.fillText(arrow, cx, cy);
          }
        }
      }

      // 3. Draw Tile Icons / Labels
      for (let r = 0; r < GRID_DIM; r++) {
        for (let c = 0; c < GRID_DIM; c++) {
          const x = c * CELL_SIZE;
          const y = r * CELL_SIZE;
          const tile = grid[r]?.[c] || '.';
          const cx = x + CELL_SIZE / 2;
          const cy = y + CELL_SIZE / 2;

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          if (tile === 'S') {
            // Start beacon
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText('S', cx, cy - 8);
            ctx.font = '9px "JetBrains Mono", sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('START', cx, cy + 12);
          } else if (tile === 'G') {
            // Goal beacon
            ctx.fillStyle = '#10b981';
            ctx.beginPath();
            ctx.arc(cx, cy, 18, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
            ctx.fill();
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText('🏆', cx, cy);
          } else if (tile === 'K') {
            // Key
            if (keyState === 0) {
              ctx.font = 'bold 20px sans-serif';
              ctx.fillText('🗝️', cx, cy);
            } else {
              // Ghosted acquired key
              ctx.fillStyle = 'rgba(234, 179, 8, 0.4)';
              ctx.font = '9px "JetBrains Mono", sans-serif';
              ctx.fillText('(KEY)', cx, cy);
            }
          } else if (tile === 'D') {
            // Door
            const isOpen = keyState === 1;
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(isOpen ? '🚪' : '🔒', cx, cy);
          } else if (tile === 'L') {
            ctx.fillStyle = '#fef08a';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText('🔥', cx, cy);
          }
        }
      }

      // 4. Draw Trajectory Trail
      if (currentFrame?.trail && currentFrame.trail.length > 1) {
        const trail = currentFrame.trail;
        ctx.beginPath();
        for (let i = 0; i < trail.length; i++) {
          const [tr, tc] = trail[i];
          const tx = tc * CELL_SIZE + CELL_SIZE / 2;
          const ty = tr * CELL_SIZE + CELL_SIZE / 2;
          if (i === 0) ctx.moveTo(tx, ty);
          else ctx.lineTo(tx, ty);
        }
        ctx.strokeStyle =
          keyState === (currentFrame.agent.has_key ? 1 : 0)
            ? 'rgba(6, 182, 212, 0.65)'
            : 'rgba(6, 182, 212, 0.15)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // 5. Draw Agent Sprite
      if (currentFrame?.agent) {
        const { r: ar, c: ac, has_key: aHasKey } = currentFrame.agent;
        const ax = ac * CELL_SIZE + CELL_SIZE / 2;
        const ay = ar * CELL_SIZE + CELL_SIZE / 2;
        const isCurrentGrid = (aHasKey ? 1 : 0) === keyState;

        ctx.save();
        if (isCurrentGrid) {
          // Vibrant agent
          // Outer glowing ring
          ctx.beginPath();
          ctx.arc(ax, ay, 18, 0, Math.PI * 2);
          ctx.fillStyle = aHasKey ? 'rgba(234, 179, 8, 0.35)' : 'rgba(16, 185, 129, 0.35)';
          ctx.fill();
          ctx.strokeStyle = aHasKey ? '#fbbf24' : '#10b981';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Inner robot disc
          ctx.beginPath();
          ctx.arc(ax, ay, 11, 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Key indicator tag
          if (aHasKey) {
            ctx.fillStyle = '#fbbf24';
            ctx.font = '10px sans-serif';
            ctx.fillText('🔑', ax + 10, ay - 10);
          }
        } else {
          // Dim ghost sprite on the other phase
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ctx.arc(ax, ay, 14, 0, Math.PI * 2);
          ctx.fillStyle = '#64748b';
          ctx.fill();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.restore();
    },
    []
  );

  // Redraw both canvases when frame updates
  useEffect(() => {
    if (canvas0Ref.current) drawGrid(canvas0Ref.current, 0, frame);
    if (canvas1Ref.current) drawGrid(canvas1Ref.current, 1, frame);
  }, [frame, drawGrid]);

  // Mouse interaction handlers
  const handleMouseMove = (
    e: React.MouseEvent<HTMLCanvasElement>,
    gridIdx: number
  ) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = Math.floor(x / CELL_SIZE);
    const r = Math.floor(y / CELL_SIZE);

    if (r >= 0 && r < GRID_DIM && c >= 0 && c < GRID_DIM) {
      setHoveredCell({
        gridIdx,
        r,
        c,
        x: e.clientX,
        y: e.clientY,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = Math.floor(x / CELL_SIZE);
    const r = Math.floor(y / CELL_SIZE);

    if (r >= 0 && r < GRID_DIM && c >= 0 && c < GRID_DIM) {
      onCellClick(r, c);
    }
  };

  // Lookup Q values for tooltip
  const getCellQData = (
    gridIdx: number,
    r: number,
    c: number
  ): { maxQ: number; bestAction: number; actionName: string } => {
    if (!frame) return { maxQ: 0, bestAction: 0, actionName: '•' };
    const maxQ = frame.q_max?.[gridIdx]?.[r]?.[c] ?? 0;
    const bestAction = frame.policy?.[gridIdx]?.[r]?.[c] ?? 0;
    return { maxQ, bestAction, actionName: ARROW_SYMBOLS[bestAction] || '•' };
  };

  return (
    <div
      className={`relative rounded-xl border border-border bg-[#0a0f1d] p-4 shadow-2xl transition-all duration-300 ${
        isShocked ? 'ring-4 ring-rose-500 shadow-rose-950 animate-shock-flash' : ''
      }`}
    >
      {/* SHOCK Banner */}
      {isShocked && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-rose-600/90 text-white font-extrabold px-6 py-1.5 rounded-full uppercase tracking-wider text-sm shadow-xl flex items-center gap-2 animate-bounce">
          <span>⚡ LEVEL SHOCKED! EXPLORATION SPIKED (ε = 0.35) ⚡</span>
        </div>
      )}

      {/* Grid Headers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Phase 1: Seeking Key */}
        <div className="flex flex-col items-center">
          <div className="flex items-center justify-between w-full mb-2 px-1">
            <span className="font-mono text-xs font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Phase 1: Hunting Key (has_key = false)
            </span>
            <span className="text-xs text-slate-400 font-mono">Door: Locked 🔒</span>
          </div>
          <div className="relative border-2 border-slate-700/60 rounded-lg overflow-hidden shadow-inner bg-black cursor-crosshair">
            <canvas
              ref={canvas0Ref}
              onMouseMove={(e) => handleMouseMove(e, 0)}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
            />
          </div>
        </div>

        {/* Phase 2: Key Acquired */}
        <div className="flex flex-col items-center">
          <div className="flex items-center justify-between w-full mb-2 px-1">
            <span className="font-mono text-xs font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Phase 2: Key in Hand → Goal (has_key = true)
            </span>
            <span className="text-xs text-slate-400 font-mono">Door: Open 🚪</span>
          </div>
          <div className="relative border-2 border-slate-700/60 rounded-lg overflow-hidden shadow-inner bg-black cursor-crosshair">
            <canvas
              ref={canvas1Ref}
              onMouseMove={(e) => handleMouseMove(e, 1)}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
            />
          </div>
        </div>
      </div>

      {/* Floating Tooltip */}
      {hoveredCell && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-900/95 border border-cyan-500/40 rounded-lg shadow-2xl p-2.5 text-xs font-mono backdrop-blur-md -translate-x-1/2 -translate-y-full -mt-2"
          style={{ left: `${hoveredCell.x}px`, top: `${hoveredCell.y}px` }}
        >
          <div className="text-cyan-400 font-bold mb-1">
            Cell ({hoveredCell.r}, {hoveredCell.c}) — {hoveredCell.gridIdx === 0 ? 'No Key' : 'With Key'}
          </div>
          {(() => {
            const data = getCellQData(hoveredCell.gridIdx, hoveredCell.r, hoveredCell.c);
            return (
              <div className="space-y-0.5 text-slate-300">
                <div>Max Q: <span className="font-bold text-emerald-400">{data.maxQ.toFixed(3)}</span></div>
                <div>Argmax Action: <span className="font-bold text-amber-400">{data.actionName}</span></div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
