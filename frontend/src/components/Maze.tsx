import { useRef, useEffect, useMemo, FC } from 'react';
import { ServerFrame } from '../types';

const DEFAULT_GRID = [
  '###########',
  '#S....#...#',
  '#.#####.#.#',
  '#.#...#.#.#',
  '#.#.#.#.#.#',
  '#.#.#...#.#',
  '#.#.#.#.#.#',
  '#...#.###.#',
  '#########.#',
  '#........G#',
  '###########',
];

function computeBfsPath(grid: string[]): [number, number][] {
  let start: [number, number] = [1, 1];
  let goal: [number, number] = [9, 9];
  for (let r = 0; r < 11; r++) {
    for (let c = 0; c < 11; c++) {
      if (grid[r]?.[c] === 'S') start = [r, c];
      if (grid[r]?.[c] === 'G') goal = [r, c];
    }
  }
  const q: [number, number, [number, number][]][] = [[start[0], start[1], [start]]];
  const visited = new Set<string>([`${start[0]},${start[1]}`]);
  while (q.length > 0) {
    const [r, c, path] = q.shift()!;
    if (r === goal[0] && c === goal[1]) return path;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 11 && nc >= 0 && nc < 11 && grid[nr]?.[nc] !== '#') {
        const key = `${nr},${nc}`;
        if (!visited.has(key)) {
          visited.add(key);
          q.push([nr, nc, [...path, [nr, nc]]]);
        }
      }
    }
  }
  return [];
}

export interface MazeProps {
  frame?: ServerFrame;
  grid?: string[];
  layer?: 'interactive' | 'beliefs' | 'ground_truth' | 'error';
  valuesGrid?: (number | null)[][];
  policyGrid?: (number | null)[][];
  showArrows?: boolean;
  className?: string;
  hasShadow?: boolean;
}

export const Maze: FC<MazeProps> = ({
  frame,
  grid: customGrid,
  layer = 'interactive',
  valuesGrid,
  policyGrid,
  showArrows = false,
  className = '',
  hasShadow = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const solvedTimeRef = useRef<number | null>(null);

  const grid = useMemo(() => {
    return customGrid || (frame?.grid && frame.grid.length === 11 ? frame.grid : DEFAULT_GRID);
  }, [customGrid, frame?.grid]);

  const optimalPath = useMemo(() => {
    return computeBfsPath(grid);
  }, [grid]);

  useEffect(() => {
    if (frame?.stage === 'solved' && solvedTimeRef.current === null) {
      solvedTimeRef.current = performance.now();
    } else if (frame?.stage !== 'solved') {
      solvedTimeRef.current = null;
    }
  }, [frame?.stage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const size = 528;

      if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const tileSize = size / 11;

      // 1. Draw base tiles & values
      for (let r = 0; r < 11; r++) {
        for (let c = 0; c < 11; c++) {
          const x = c * tileSize;
          const y = r * tileSize;
          const char = grid[r]?.[c] ?? '#';

          if (char === '#') {
            // Solid ink wall
            ctx.fillStyle = '#111111';
            ctx.fillRect(x, y, tileSize, tileSize);
          } else {
            // Paper base floor
            ctx.fillStyle = '#F5F2EA';
            ctx.fillRect(x, y, tileSize, tileSize);

            // Value tint
            if (layer === 'interactive' && frame?.value) {
              const val = frame.value[r]?.[c] || 0;
              if (val > 0.005) {
                const alpha = Math.min(val * 0.9, 0.9);
                ctx.fillStyle = `rgba(255, 79, 0, ${alpha})`;
                ctx.fillRect(x, y, tileSize, tileSize);
              }
            } else if (valuesGrid) {
              const rawVal = valuesGrid[r]?.[c];
              if (rawVal !== null && rawVal !== undefined) {
                const val = Math.abs(rawVal);
                if (val > 0.005) {
                  const alpha = Math.min(val * 0.9, 0.9);
                  if (layer === 'error') {
                    // Ink tint where agent is wrong
                    ctx.fillStyle = `rgba(17, 17, 17, ${alpha * 0.8})`;
                  } else {
                    // Orange tint for learned / truth
                    ctx.fillStyle = `rgba(255, 79, 0, ${alpha})`;
                  }
                  ctx.fillRect(x, y, tileSize, tileSize);
                }
              }
            }

            // Hairline grid
            ctx.strokeStyle = '#D9D4C7';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, tileSize, tileSize);
          }
        }
      }

      // 2. Start marker 'S'
      for (let r = 0; r < 11; r++) {
        for (let c = 0; c < 11; c++) {
          if (grid[r]?.[c] === 'S') {
            const sx = c * tileSize + tileSize / 2;
            const sy = r * tileSize + tileSize / 2;
            ctx.fillStyle = '#111111';
            ctx.font = `700 ${Math.round(tileSize * 0.44)}px "Space Grotesk", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('S', sx, sy);
          } else if (grid[r]?.[c] === 'G') {
            // 3. Goal marker: nested square glyph
            const gx = c * tileSize;
            const gy = r * tileSize;
            const outerPad = tileSize * 0.2;
            const outerSize = tileSize * 0.6;
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = 2;
            ctx.strokeRect(gx + outerPad, gy + outerPad, outerSize, outerSize);

            const innerPad = tileSize * 0.35;
            const innerSize = tileSize * 0.3;
            ctx.fillStyle = '#111111';
            ctx.fillRect(gx + innerPad, gy + innerPad, innerSize, innerSize);
          }
        }
      }

      // 3.5. Policy direction arrows (when enabled in report layer)
      if (showArrows && policyGrid) {
        for (let r = 0; r < 11; r++) {
          for (let c = 0; c < 11; c++) {
            const char = grid[r]?.[c] ?? '#';
            if (char === '#' || char === 'G') continue;
            const act = policyGrid[r]?.[c];
            if (act !== null && act !== undefined) {
              const cx = c * tileSize + tileSize / 2;
              const cy = r * tileSize + tileSize / 2;
              const len = tileSize * 0.22;

              let dx = 0;
              let dy = 0;
              if (act === 0) dy = -len;      // UP
              else if (act === 1) dy = len;  // DOWN
              else if (act === 2) dx = -len; // LEFT
              else if (act === 3) dx = len;  // RIGHT

              ctx.strokeStyle = '#111111';
              ctx.lineWidth = 1.4;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.beginPath();
              ctx.moveTo(cx - dx * 0.4, cy - dy * 0.4);
              ctx.lineTo(cx + dx * 0.4, cy + dy * 0.4);

              // Arrow tip
              const angle = Math.atan2(dy, dx);
              const tipLen = len * 0.55;
              const tipX = cx + dx * 0.4;
              const tipY = cy + dy * 0.4;
              ctx.lineTo(
                tipX - tipLen * Math.cos(angle - Math.PI / 5),
                tipY - tipLen * Math.sin(angle - Math.PI / 5)
              );
              ctx.moveTo(tipX, tipY);
              ctx.lineTo(
                tipX - tipLen * Math.cos(angle + Math.PI / 5),
                tipY - tipLen * Math.sin(angle + Math.PI / 5)
              );
              ctx.stroke();
            }
          }
        }
      }

      // 4. Agent Trail (interactive mode only)
      if (layer === 'interactive' && frame?.trail && frame.trail.length > 0) {
        const trailLen = frame.trail.length;
        frame.trail.forEach(([tr, tc], i) => {
          const alpha = ((i + 1) / trailLen) * 0.4;
          const inset = tileSize * 0.28;
          ctx.fillStyle = `rgba(255, 79, 0, ${alpha})`;
          ctx.fillRect(
            tc * tileSize + inset,
            tr * tileSize + inset,
            tileSize - inset * 2,
            tileSize - inset * 2
          );
        });
      }

      // 5. Agent (interactive mode only)
      if (layer === 'interactive' && frame?.agent) {
        const [ar, ac] = frame.agent;
        const agentInset = tileSize * 0.16;
        ctx.fillStyle = '#FF4F00';
        ctx.fillRect(
          ac * tileSize + agentInset,
          ar * tileSize + agentInset,
          tileSize - agentInset * 2,
          tileSize - agentInset * 2
        );
      }

      // 6. Solved: animated 3px ink line along optimal path
      if (layer === 'interactive' && frame?.stage === 'solved' && solvedTimeRef.current !== null && optimalPath.length > 0) {
        const elapsed = performance.now() - solvedTimeRef.current;
        const duration = 1200; // 1.2s sweep
        const progress = Math.min(elapsed / duration, 1.0);
        const pointsCount = Math.max(1, Math.floor(progress * optimalPath.length));

        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 3;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        for (let i = 0; i < pointsCount; i++) {
          const [pr, pc] = optimalPath[i];
          const px = pc * tileSize + tileSize / 2;
          const py = pr * tileSize + tileSize / 2;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        if (progress < 1.0) {
          animId = requestAnimationFrame(render);
        }
      }

      ctx.restore();
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [frame, grid, optimalPath, layer, valuesGrid, policyGrid, showArrows]);

  return (
    <div
      className={`aspect-square bg-[#F5F2EA] border border-[#111111] overflow-hidden ${
        hasShadow ? 'hard-shadow' : ''
      } ${className || 'w-full'}`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
};
export default Maze;
